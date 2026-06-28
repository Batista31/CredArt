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

from services import bank_mcp_client, cmr_service, scoring_service, user_service
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

    # --- Expiry candidates (proactive hook) ---
    soonest = None
    if intent.kind in ("greeting", "check_expiry", "redeem"):
        for c in cards:
            d = c["days_to_expiry"]
            if c["next_expiry_points"] and d is not None and d <= 30:
                candidates.append(Candidate(
                    kind="expiry", card_id=c["card_id"], card_name=c["card_name"],
                    label=f"{c['next_expiry_points']:,} {c['currency_name']} expiring",
                    expiry_urgent=d <= 7, note=f"expires {_expiry_phrase(d)}"))
                if soonest is None or d < soonest[1]:
                    soonest = (c, d)

    # --- Proactive: affordable redemptions ON the expiring card (deterministic) ---
    if intent.kind in ("greeting", "check_expiry") and soonest is not None:
        cid = soonest[0]["card_id"]
        rules = await bank_mcp_client.get_redemption_rules(cid)
        trace.append(ToolCall(tool="get_redemption_rules", args={"card_id": cid},
                              result_count=len(rules["redemption_options"])))
        bal = points_of.get(cid, 0)
        cav = await caveat_for(cid)
        affordable = sorted(
            (o for o in rules["redemption_options"] if o["points_cost"] is not None and bal >= o["points_cost"]),
            key=lambda o: o["points_cost"])
        for o in affordable[:3]:
            candidates.append(Candidate(
                kind="redemption", card_id=cid, card_name=name_of[cid],
                label=o["benefit_name"], category=o.get("category"),
                points_cost=o["points_cost"], affordable=True,
                source_url=o["source_url"], note="redeemable before expiry", caveat=cav))

    # --- Semantic redemption / perk candidates ---
    if intent.kind in ("explore_benefits", "redeem"):
        query = intent.query.strip() or (intent.category or "rewards")
        hits = await bank_mcp_client.get_benefit_chunks(query, intent.card_id, top_k=8)
        trace.append(ToolCall(tool="get_benefit_chunks",
                              args={"query": query, "card_id": intent.card_id},
                              result_count=len(hits)))

        # Semantic similarity alone can surface high-value but off-intent rewards.
        # When intent extraction found a category, prefer that category as a hard
        # candidate boundary. Fall back to the full semantic set only when the
        # catalogue has no result in the requested category.
        category_hits = [
            h for h in hits
            if (h.get("category") or "").upper() == (intent.category or "").upper()
        ]
        relevant_hits = category_hits if intent.category and category_hits else hits

        for h in relevant_hits:
            if h["card_id"] not in held:
                continue  # never suggest a card the user doesn't hold
            pc = h.get("points_cost")
            if pc is None:
                candidates.append(Candidate(
                    kind="perk", card_id=h["card_id"], card_name=name_of[h["card_id"]],
                    label=h["benefit_name"], category=h.get("category"),
                    similarity=h["similarity"], source_url=h["source_url"],
                    note="included benefit (no points cost)"))
            else:
                bal = points_of.get(h["card_id"], 0)
                candidates.append(Candidate(
                    kind="redemption", card_id=h["card_id"], card_name=name_of[h["card_id"]],
                    label=h["benefit_name"], category=h.get("category"),
                    points_cost=pc, affordable=bal >= pc,
                    similarity=h["similarity"], source_url=h["source_url"],
                    note=None if bal >= pc else f"needs {pc - bal:,} more points",
                    caveat=await caveat_for(h["card_id"])))

    # --- Transfer candidates ---
    # Transfer partners are useful for explicit transfer requests and travel
    # discovery. Do not mix airline/hotel transfers into dining, shopping,
    # entertainment, or wellness result sets.
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
            for p in partners[:2]:
                candidates.append(Candidate(
                    kind="transfer", card_id=cid, card_name=name_of.get(cid, cid),
                    label=f"{p['partner_name']} ({p['ratio']})", category="TRAVEL",
                    effective_value_inr=float(p["effective_value_inr"]) if p["effective_value_inr"] is not None else None,
                    best_use_case=p["best_use_case"], source_url=p["source_url"]))

    # --- CMR: fetch the user's profile signals (Layer 1, never sent to the LLM) ---
    uid = user["user_id"]
    prefs = await user_service.get_preferences(uid) or {}
    wishlist = await cmr_service.get_wishlist_labels(uid)
    dismissed = await cmr_service.get_dismissed_labels(uid)

    # Filter out dismissed benefits BEFORE scoring — a rejected item must never
    # resurface for this user.
    if dismissed:
        before = len(candidates)
        candidates = [c for c in candidates if c.label not in dismissed]
        if before != len(candidates):
            trace.append(ToolCall(tool="cmr_filter_dismissed",
                                  args={"removed": before - len(candidates)},
                                  result_count=len(candidates)))

    # --- Phase 6: deterministic 5-dimension scoring + rank (+ CMR boost) ---
    candidates = await scoring_service.score_candidates(
        uid, candidates, cards, prefs=prefs, wishlist_labels=wishlist)
    if candidates:
        trace.append(ToolCall(tool="score_candidates", args={"dims": 5},
                              result_count=len(candidates)))

    # --- Phase 9: stable id + fulfilment options (one live path + always demo) ---
    for c in candidates:
        c.candidate_id = uuid4().hex[:8]
        if c.kind in ("redemption", "perk", "transfer"):
            c.fulfillment_options = [FulfillmentOption(**o)
                                     for o in registry.fulfillment_options_for(c.model_dump())]

    # --- Phase 7: LLM rerank + reply (Groq primary, template fallback) ---
    llm_reply = None
    llm_used = False
    if candidates:
        try:
            from services.llm_service import llm_rerank_reply
            llm_reply, llm_used = await llm_rerank_reply(
                candidates[:8], user.get("name", ""), intent.query)
        except Exception as e:
            print(f"[orchestrator] LLM rerank failed ({e}), using template")

    reply = llm_reply or _templated_reply(intent, user, candidates, soonest)

    # --- CMR completeness check: confirm pre-filled profile values naturally so
    # we don't re-ask known facts (party size, dietary needs). This note is built
    # DETERMINISTICALLY from CMR data and appended OUTSIDE the LLM — the LLM never
    # receives CMR, preserving the anti-hallucination boundary. ---
    note = cmr_service.prefill_note(prefs, intent)
    if note and candidates:
        reply = f"{reply} {note}"

    meta = {
        "soonest_expiry": soonest[0]["card_id"] if soonest else None,
        "llm_used": llm_used,
    }
    return candidates[:8], trace, {"reply": reply, **meta}


def _templated_reply(intent, user, candidates, soonest) -> str:
    """Deterministic reply (Phase 7 replaces this with Claude)."""
    name = (user or {}).get("name", "there").split()[0]
    redemptions = [c for c in candidates if c.kind == "redemption"]
    transfers = [c for c in candidates if c.kind == "transfer"]

    if intent.kind in ("greeting", "check_expiry") and soonest:
        c, d = soonest
        lead = (f"Hi {name} — heads up: {c['next_expiry_points']:,} "
                f"{c['currency_name']} on your {c['card_name']} expire {_expiry_phrase(d)}.")
        # Prefer an affordable redemption ON the expiring card.
        aff = next((r for r in redemptions if r.affordable and r.card_id == c["card_id"]), None)
        if aff:
            lead += (f" You could redeem them for “{aff.label}” "
                     f"({aff.points_cost:,} pts) before they lapse.")
        return lead

    if intent.kind == "transfer" and transfers:
        t = transfers[0]
        return (f"{name}, your best transfer is {t.label} at ≈₹{t.effective_value_inr}/pt"
                + (f" — great for {t.best_use_case.lower()}." if t.best_use_case else "."))

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
