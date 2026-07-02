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

from .intent import CITY_TO_IATA
from .schemas import Candidate, FulfillmentOption, Intent, ToolCall

# Estimated points for an economy flight redemption. The real fare is searched +
# confirmed live at booking time (Duffel); this is the deterministic redeem cost.
_FLIGHT_POINTS_COST = 25000

# When the ask is generic (no explicit category), seed the candidate pool from
# the user's dominant preference — so a dining-lover actually sees dining options
# and a traveller sees travel. Preference then shapes the POOL, not just the rank.
_PREF_SEED = {
    "travel_weight":      "travel flight hotel lounge getaway",
    "dining_weight":      "dining restaurant food gourmet",
    "shopping_weight":    "shopping voucher electronics fashion",
    "experiences_weight": "movie concert show event spa wellness",
    "cashback_weight":    "cashback statement credit milestone",
}


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
    # Still gathering intent — skip candidate assembly and return the follow-up question.
    if not intent.is_complete:
        question = intent.follow_up_question or "Could you tell me a bit more?"
        return [], [], {"reply": question, "llm_used": False, "soonest_expiry": None}

    trace: list[ToolCall] = []
    candidates: list[Candidate] = []

    held = {c["card_id"] for c in cards}
    name_of = {c["card_id"]: c["card_name"] for c in cards}
    points_of = {c["card_id"]: c["current_points"] for c in cards}

    # User preference weights — used to seed the candidate pool for generic asks.
    prefs = await user_service.get_preferences(user["user_id"]) or {}

    _caveat_cache: dict[str, str | None] = {}

    async def caveat_for(cid: str) -> str | None:
        if cid not in _caveat_cache:
            _caveat_cache[cid] = await bank_mcp_client.get_caveat(cid)
        return _caveat_cache[cid]

    soonest = None
    if intent.kind in ("greeting", "check_expiry"):
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
        _seen: set[tuple[str, str]] = set()  # (card_id, benefit_name) dedup

        async def add_hits(hits: list[dict]) -> None:
            for h in hits:
                if h["card_id"] not in held:
                    continue  # never suggest a card the user doesn't hold
                key = (h["card_id"], h["benefit_name"])
                if key in _seen:
                    continue
                _seen.add(key)
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

        query = intent.query.strip() or (intent.category or "rewards")
        hits = await bank_mcp_client.get_benefit_chunks(query, intent.card_id, top_k=8)
        trace.append(ToolCall(tool="get_benefit_chunks",
                              args={"query": query, "card_id": intent.card_id},
                              result_count=len(hits)))
        await add_hits(hits)

        # Generic ask (no explicit category): also pull in the user's dominant
        # preference categories, so preferences shape the candidate POOL — not
        # just the ranking. This is what makes a dining-lover see dining options.
        # Seed from EVERY preference within 15% of the top weight (cap 2), so a
        # user who likes e.g. travel and dining equally gets a mix of both, not
        # an arbitrary single winner.
        if intent.category is None and prefs:
            ranked = sorted(_PREF_SEED, key=lambda k: float(prefs.get(k) or 0.0), reverse=True)
            top_w = float(prefs.get(ranked[0]) or 0.0)
            chosen = [k for k in ranked if float(prefs.get(k) or 0.0) >= top_w * 0.85][:2] if top_w > 0 else []
            for pref_key in chosen:
                seed_q = _PREF_SEED[pref_key]
                seed_hits = await bank_mcp_client.get_benefit_chunks(seed_q, intent.card_id, top_k=5)
                trace.append(ToolCall(tool="get_benefit_chunks",
                                      args={"query": seed_q, "seed": pref_key},
                                      result_count=len(seed_hits)))
                await add_hits(seed_hits)

    # --- Transfer candidates ---
    # Airline/hotel transfers are travel-specific. Inject them for an explicit
    # transfer intent, or a general/travel explore/redeem — but NOT for a dining /
    # shopping / entertainment / wellness request, where they're just noise.
    _transfers_relevant = (
        intent.kind == "transfer"
        or (intent.kind in ("explore_benefits", "redeem")
            and intent.category in (None, "TRAVEL"))
    )
    if _transfers_relevant:
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

    # --- First-class flight candidate (Duffel live) when a destination is known ---
    if intent.destination and intent.kind in ("explore_benefits", "redeem"):
        home = ((user or {}).get("city") or "").lower()
        origin = intent.origin or CITY_TO_IATA.get(home) or "DEL"
        dest = intent.destination
        travel_card = max(cards, key=lambda c: c["current_points"]) if cards else None
        if travel_card and origin != dest:
            cid = travel_card["card_id"]
            bal = points_of.get(cid, 0)
            candidates.append(Candidate(
                kind="redemption", card_id=cid, card_name=name_of[cid],
                label=f"Flight {origin}→{dest}", category="TRAVEL",
                points_cost=_FLIGHT_POINTS_COST, affordable=bal >= _FLIGHT_POINTS_COST,
                origin=origin, destination=dest, depart_date=intent.depart_date,
                best_use_case="flight booking",
                note="estimated economy redemption — fare confirmed at booking"))
            trace.append(ToolCall(tool="build_flight_candidate",
                                  args={"origin": origin, "destination": dest,
                                        "depart_date": intent.depart_date}, result_count=1))

    # --- CMR: fetch user profile signals (Layer 1, never sent to the LLM) ---
    # `prefs` was already fetched above for preference-seeding; reuse it.
    uid = user["user_id"]
    wishlist = await cmr_service.get_wishlist_labels(uid)
    dismissed = await cmr_service.get_dismissed_labels(uid)

    # Filter out dismissed benefits BEFORE scoring.
    if dismissed:
        before = len(candidates)
        candidates = [c for c in candidates if c.label not in dismissed]
        if before != len(candidates):
            trace.append(ToolCall(tool="cmr_filter_dismissed",
                                  args={"removed": before - len(candidates)},
                                  result_count=len(candidates)))

    # --- Phase 6: deterministic 5-dimension scoring + rank (+ CMR boost) ---
    # intent_category steers the current request; prefs/wishlist add the CMR boost.
    candidates = await scoring_service.score_candidates(
        uid, candidates, cards, intent_category=intent.category,
        prefs=prefs, wishlist_labels=wishlist)
    if candidates:
        trace.append(ToolCall(tool="score_candidates", args={"dims": 5},
                              result_count=len(candidates)))

    # Collapse the same reward held on multiple cards (e.g. a "Milestone bonus"
    # on each card, or a voucher available on two cards) to its single
    # best-scored instance — so the user sees each distinct option once, on the
    # card where it scores best. candidates are already sorted desc, so the first
    # occurrence per label is the best one.
    if candidates:
        _best_by_label: dict[str, Candidate] = {}
        for c in candidates:
            _best_by_label.setdefault(c.label, c)
        candidates = list(_best_by_label.values())
        for rank, c in enumerate(candidates, 1):
            c.rank = rank

    # --- Phase 9: stable id + fulfilment options (live providers + always demo) ---
    for c in candidates:
        c.candidate_id = uuid4().hex[:8]
        if c.kind in ("redemption", "perk", "transfer", "merchandise"):
            c.fulfillment_options = [FulfillmentOption(**o)
                                     for o in registry.fulfillment_options_for(c.model_dump())]

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
