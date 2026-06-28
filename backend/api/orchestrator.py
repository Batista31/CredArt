"""Orchestration — turn an intent into a pre-validated candidate set + reply.

This is the heart of Layer 1's contribution to a chat turn. It gathers:
  - user context (cards, balances, expiry) from SMS-sourced Postgres data
  - card-level catalogue facts via the deterministic services (the same logic
    the bank MCP server exposes)
and assembles a `Candidate` list with deterministic flags (affordability,
expiry urgency). It NEVER invents values.

Phase 5 produces a templated reply. Phase 7 will pass this exact candidate set
to Claude for reranking + natural-language explanation; Claude sees only this,
never the DB.
"""

from __future__ import annotations

from uuid import uuid4

from services import bank_mcp_client, scoring_service
from services.redemption import registry

from .schemas import Candidate, FulfillmentOption, Intent, ToolCall


def _expiry_phrase(days: int | None) -> str:
    if days is None:
        return "no expiry set"
    if days < 0:
        return "already expired"
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"in {days} days"


async def orchestrate(intent: Intent, user: dict | None, cards: list[dict]) -> tuple[list[Candidate], list[ToolCall], dict]:
    trace: list[ToolCall] = []
    candidates: list[Candidate] = []

    held = {c["card_id"] for c in cards}
    name_of = {c["card_id"]: c["card_name"] for c in cards}
    points_of = {c["card_id"]: c["current_points"] for c in cards}

    _caveat_cache: dict[str, str | None] = {}

    async def caveat_for(cid: str) -> str | None:
        if cid not in _caveat_cache:
            _caveat_cache[cid] = await bank_mcp_client.get_caveat(cid)
        return _caveat_cache[cid]

    soonest = None
    if intent.kind in ("greeting", "check_expiry", "redeem"):
        for card in cards:
            days = card["days_to_expiry"]
            if card["next_expiry_points"] and days is not None and days <= 30:
                candidates.append(Candidate(
                    kind="expiry", card_id=card["card_id"], card_name=card["card_name"],
                    label=f"{card['next_expiry_points']:,} {card['currency_name']} expiring",
                    expiry_urgent=days <= 7, note=f"expires {_expiry_phrase(days)}"))
                if soonest is None or days < soonest[1]:
                    soonest = (card, days)

    if intent.kind in ("greeting", "check_expiry") and soonest is not None:
        cid = soonest[0]["card_id"]
        rules = await bank_mcp_client.get_redemption_rules(cid)
        trace.append(ToolCall(tool="get_redemption_rules", args={"card_id": cid},
                              result_count=len(rules["redemption_options"])))
        balance = points_of.get(cid, 0)
        caveat = await caveat_for(cid)
        affordable = sorted(
            (option for option in rules["redemption_options"]
             if option["points_cost"] is not None and balance >= option["points_cost"]),
            key=lambda option: option["points_cost"])
        for option in affordable[:3]:
            candidates.append(Candidate(
                kind="redemption", card_id=cid, card_name=name_of[cid],
                label=option["benefit_name"], category=option.get("category"),
                points_cost=option["points_cost"], affordable=True,
                source_url=option["source_url"], note="redeemable before expiry", caveat=caveat))

    if intent.kind in ("explore_benefits", "redeem"):
        query = intent.query.strip() or (intent.category or "rewards")
        hits = await bank_mcp_client.get_benefit_chunks(query, intent.card_id, top_k=8)
        trace.append(ToolCall(tool="get_benefit_chunks",
                              args={"query": query, "card_id": intent.card_id},
                              result_count=len(hits)))
        category_hits = [
            hit for hit in hits
            if (hit.get("category") or "").upper() == (intent.category or "").upper()
        ]
        relevant_hits = category_hits if intent.category and category_hits else hits
        for hit in relevant_hits:
            if hit["card_id"] not in held:
                continue
            points_cost = hit.get("points_cost")
            if points_cost is None:
                candidates.append(Candidate(
                    kind="perk", card_id=hit["card_id"], card_name=name_of[hit["card_id"]],
                    label=hit["benefit_name"], category=hit.get("category"),
                    similarity=hit["similarity"], source_url=hit["source_url"],
                    note="included benefit (no points cost)"))
            else:
                balance = points_of.get(hit["card_id"], 0)
                candidates.append(Candidate(
                    kind="redemption", card_id=hit["card_id"], card_name=name_of[hit["card_id"]],
                    label=hit["benefit_name"], category=hit.get("category"),
                    points_cost=points_cost, affordable=balance >= points_cost,
                    similarity=hit["similarity"], source_url=hit["source_url"],
                    note=None if balance >= points_cost else f"needs {points_cost - balance:,} more points",
                    caveat=await caveat_for(hit["card_id"])))

    include_transfers = (
        intent.kind == "transfer"
        or (intent.kind == "explore_benefits"
            and (intent.category is None or intent.category == "TRAVEL"))
    )
    if include_transfers:
        target = [intent.card_id] if intent.card_id else list(held)
        for cid in target:
            partners = await bank_mcp_client.get_transfer_partners(cid)
            trace.append(ToolCall(tool="get_transfer_partners",
                                  args={"card_id": cid}, result_count=len(partners)))
            for partner in partners[:2]:
                candidates.append(Candidate(
                    kind="transfer", card_id=cid, card_name=name_of.get(cid, cid),
                    label=f"{partner['partner_name']} ({partner['ratio']})", category="TRAVEL",
                    effective_value_inr=float(partner["effective_value_inr"]) if partner["effective_value_inr"] is not None else None,
                    best_use_case=partner["best_use_case"], source_url=partner["source_url"]))

    candidates = await scoring_service.score_candidates(user["user_id"], candidates, cards)
    if candidates:
        trace.append(ToolCall(tool="score_candidates", args={"dims": 5},
                              result_count=len(candidates)))

    for candidate in candidates:
        candidate.candidate_id = uuid4().hex[:8]
        if candidate.kind in ("redemption", "perk", "transfer"):
            candidate.fulfillment_options = [FulfillmentOption(**option)
                                             for option in registry.fulfillment_options_for(candidate.model_dump())]

    llm_reply = None
    llm_used = False
    if candidates:
        try:
            from services.llm_service import llm_rerank_reply
            llm_reply, llm_used = await llm_rerank_reply(
                candidates[:8], user.get("name", ""), intent.query)
        except Exception as exc:
            print(f"[orchestrator] LLM rerank failed ({exc}), using template")

    reply = llm_reply or _templated_reply(intent, user, candidates, soonest)
    meta = {
        "soonest_expiry": soonest[0]["card_id"] if soonest else None,
        "llm_used": llm_used,
    }
    return candidates[:8], trace, {"reply": reply, **meta}


def _templated_reply(intent, user, candidates, soonest) -> str:
    name = (user or {}).get("name", "there").split()[0]
    redemptions = [candidate for candidate in candidates if candidate.kind == "redemption"]
    transfers = [candidate for candidate in candidates if candidate.kind == "transfer"]

    if intent.kind in ("greeting", "check_expiry") and soonest:
        card, days = soonest
        lead = (f"Hi {name} — heads up: {card['next_expiry_points']:,} "
                f"{card['currency_name']} on your {card['card_name']} expire {_expiry_phrase(days)}.")
        affordable = next((candidate for candidate in redemptions if candidate.affordable and candidate.card_id == card["card_id"]), None)
        if affordable:
            lead += (f" You could redeem them for “{affordable.label}” "
                     f"({affordable.points_cost:,} pts) before they lapse.")
        return lead

    if intent.kind == "transfer" and transfers:
        top = transfers[0]
        return (f"{name}, your best transfer is {top.label} at ≈₹{top.effective_value_inr}/pt"
                + (f" — great for {top.best_use_case.lower()}." if top.best_use_case else "."))

    if redemptions:
        top = redemptions[0]
        tail = "" if top.affordable else f" (you're {top.note})"
        return (f"For “{intent.query.strip() or 'your points'}”, the closest match is "
                f"“{top.label}” on your {top.card_name} — {top.points_cost:,} pts{tail}. "
                f"I found {len(redemptions)} option(s).")

    if candidates:
        return f"I found {len(candidates)} relevant option(s) on your cards."
    return (f"Hi {name}! I can help you redeem points, check what's expiring, "
            f"or explore your card benefits. What are you in the mood for?")
