from __future__ import annotations

import json
from typing import Any

from services import (
    conversation_service,
    memory_service,
    recommendation_session_service,
    reward_catalogue_service,
    scoring_service,
    user_service,
)

from .intent import extract_intent
from .orchestrator import orchestrate

_JOURNEY_SLOTS: dict[str, dict[str, list[str]]] = {
    "travel_flight": {
        "required": ["origin", "destination", "departure_window", "passengers"],
        "optional": ["return_date", "cabin_class", "flexibility", "points_cash_preference", "airline_preference"],
    },
    "travel_hotel": {
        "required": ["destination", "check_in_window", "nights", "guests"],
        "optional": ["hotel_style", "brand_preference", "points_cash_preference"],
    },
    "home_setup": {
        "required": ["room_type", "style", "required_products", "budget"],
        "optional": ["room_size", "existing_items", "brand_preference", "priority", "address_needed"],
    },
    "product_purchase": {
        "required": ["product_category", "budget"],
        "optional": ["brand_preference", "priority", "points_cash_preference"],
    },
    "gift_purchase": {
        "required": ["recipient_type", "occasion", "budget"],
        "optional": ["category", "delivery_timeline"],
    },
    "voucher_redemption": {
        "required": ["voucher_type", "budget"],
        "optional": ["brand_preference", "points_cash_preference"],
    },
    "cashback_or_statement_credit": {"required": [], "optional": []},
    "transfer_partner_redemption": {"required": ["goal"], "optional": ["partner_preference", "timeline"]},
    "card_benefit_lookup": {"required": ["topic"], "optional": ["card_id"]},
    "points_expiry_help": {"required": [], "optional": ["card_id"]},
    "general_reward_advice": {"required": ["goal"], "optional": ["budget", "timeline"]},
}

_SLOT_QUESTIONS = {
    "origin": "Where are you flying from?",
    "destination": "Where do you want to go?",
    "departure_window": "What dates or approximate month are you considering?",
    "passengers": "How many people are travelling?",
    "check_in_window": "What travel dates or month should I plan around?",
    "nights": "How many nights are you planning to stay?",
    "guests": "How many guests is this for?",
    "room_type": "Which room are you planning right now?",
    "style": "What look do you want: cozy, modern, luxury, minimal, or something else?",
    "required_products": "Which items should I help you shortlist first?",
    "budget": "What budget or points budget feels comfortable?",
    "product_category": "What kind of product are you looking for?",
    "recipient_type": "Who is the gift for?",
    "occasion": "What’s the occasion?",
    "voucher_type": "Which kind of voucher do you want?",
    "goal": "What outcome matters most here: best value, convenience, low cash spend, or something else?",
    "topic": "What would you like me to check: benefits, fees, lounge, transfer partners, or something else?",
}


def _merge_slots(existing: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    if isinstance(existing, str):
        try:
            existing = json.loads(existing)
        except json.JSONDecodeError:
            existing = {}
    if isinstance(new, str):
        try:
            new = json.loads(new)
        except json.JSONDecodeError:
            new = {}
    merged = dict(existing or {})
    for key, value in (new or {}).items():
        if value not in (None, "", []):
            merged[key] = value
    return merged


def _journey_requirements(journey_type: str | None) -> dict[str, list[str]]:
    return _JOURNEY_SLOTS.get(journey_type or "general_reward_advice", {"required": [], "optional": []})


def _missing_slots(journey_type: str | None, known_slots: dict[str, Any]) -> list[str]:
    req = _journey_requirements(journey_type)["required"]
    return [slot for slot in req if known_slots.get(slot) in (None, "", [])]


def _follow_up_message(journey_type: str, missing_slots: list[str]) -> str:
    prompts = [_SLOT_QUESTIONS.get(slot, slot.replace("_", " ")) for slot in missing_slots[:3]]
    if journey_type == "travel_flight":
        lead = "Nice — we can plan that with your points. I just need a couple of details first so I don’t suggest something random."
    elif journey_type == "home_setup":
        lead = "Nice — let’s make this feel intentional. A few details will help me narrow the right products instead of throwing generic picks at you."
    else:
        lead = "I can help with that. I just need a bit more context first."
    return lead + " " + " ".join(prompts)


def _home_item_to_candidate(item: dict) -> dict:
    return {
        "kind": "product",
        "card_id": "reward_catalogue",
        "card_name": item["catalogue_name"],
        "label": item["title"],
        "category": item["category"].upper(),
        "points_cost": item["points_price"],
        "cash_price_inr": item.get("cash_price_inr"),
        "affordable": None,
        "source_url": None,
        "item_id": item["id"],
        "note": item["description"],
        "metadata": item.get("metadata") or {},
    }


_NEVER_FOLLOWUP_JOURNEYS = {
    "general_reward_advice", "card_benefit_lookup", "points_expiry_help",
    "cashback_or_statement_credit",
}

# Card-name aliases the user can say to explicitly switch which card recs use.
_CARD_SWITCH_ALIASES = {
    "infinia": "hdfc_infinia",
    "regalia": "hdfc_regalia_gold",
    "millennia": "hdfc_millennia",
}


def _detect_card_switch(message: str, cards: list[dict]) -> str | None:
    """If the user explicitly named a held card in this message, return its card_id."""
    text = (message or "").lower()
    held = {c["card_id"] for c in cards}
    for alias, card_id in _CARD_SWITCH_ALIASES.items():
        if alias in text and card_id in held:
            return card_id
    return None


async def _orchestrate_scoped(intent: Any, user: dict, cards: list[dict], active_card_id: str | None):
    """orchestrate(), scoped to the opened card, with a same-consistency fallback.

    Tries the active card only first (so candidates and the LLM reply agree on which
    card is being discussed). If that card genuinely has nothing relevant, retries
    across all held cards rather than showing a blank/generic answer, and appends
    a one-line note so the user knows why a different card showed up.
    """
    scoped_cards = _orchestrate_card_scope(cards, active_card_id, intent.card_id)
    candidates, trace, meta = await orchestrate(intent, user, scoped_cards)
    if not candidates and scoped_cards is not cards:
        candidates, trace, meta = await orchestrate(intent, user, cards)
        if candidates:
            active_name = next((c["card_name"] for c in cards if c["card_id"] == active_card_id), "that card")
            meta = {**meta, "reply": meta["reply"] + f" (Nothing matched on your {active_name}, so I checked your other cards too.)"}
    return candidates, trace, meta


async def _llm_postcandidate_check(
    journey_type: str,
    intent: Any,
    history: list[dict],
    candidates: list[dict],
    known_slots: dict | None = None,
) -> tuple[bool, str | None]:
    """Second LLM round: given the fetched candidates, ask one more question if needed.

    Returns (is_complete, follow_up_question). Defaults to (True, None) on any error so
    the loop never blocks on LLM failure — we fall through to showing recommendations.
    """
    if journey_type in _NEVER_FOLLOWUP_JOURNEYS or not candidates:
        return True, None
    try:
        from services.llm_service import llm_check_completeness
        intent_dict = intent.model_dump() if hasattr(intent, "model_dump") else dict(intent)
        # Merge known_slots into the intent dict so the LLM sees all accumulated context,
        # not just what was extracted from the current message alone.
        if known_slots:
            intent_dict["slots"] = {**intent_dict.get("slots", {}), **known_slots}
            # Promote top-level flight fields if still null
            if not intent_dict.get("origin"):
                intent_dict["origin"] = known_slots.get("origin")
            if not intent_dict.get("destination"):
                intent_dict["destination"] = known_slots.get("destination")
            if not intent_dict.get("depart_date"):
                intent_dict["depart_date"] = known_slots.get("departure_window")
        return await llm_check_completeness(intent_dict, history, candidates=candidates)
    except Exception as exc:
        print(f"[dialogue] post-candidate LLM check failed ({exc}), showing recommendations")
        return True, None


def _orchestrate_card_scope(cards: list[dict], active_card_id: str | None, requested_card_id: str | None) -> list[dict]:
    """Restrict the cards handed to orchestrate() to the opened concierge card.

    orchestrate() reranks + writes its reply from whichever cards it's given, so this
    must happen BEFORE the call (not filtered after) or the reply text and the shown
    candidates would talk about different cards. Skipped when the user explicitly asked
    about a different card by name (requested_card_id) — that's an intentional lookup,
    not a case to lock down.
    """
    if not active_card_id or requested_card_id:
        return cards
    restricted = [c for c in cards if c["card_id"] == active_card_id]
    return restricted or cards


_CARD_ID_TO_ALIAS = {v: k for k, v in _CARD_SWITCH_ALIASES.items()}


def _card_switch_note(suggestion: dict | None, known_slots: dict) -> str:
    """One-time note offering a better-value card, or "" if none/already asked.

    Mutates known_slots to remember we've asked, so we don't re-nag every turn —
    the user can say "use <card>" any time to switch (handled by _detect_card_switch).
    """
    if not suggestion or known_slots.get("card_switch_prompted"):
        return ""
    known_slots["card_switch_prompted"] = True
    alias = _CARD_ID_TO_ALIAS.get(suggestion["suggested_card_id"], suggestion["suggested_card_name"].lower())
    return (
        f" Your {suggestion['suggested_card_name']} would get better value here — "
        f'say "use {alias}" to switch, or I\'ll keep using your {suggestion["current_card_name"]}.'
    )


async def generate_concierge_response(
    user_id: str, message: str, conversation_id: str | None = None, active_card_id: str | None = None
) -> dict:
    user = await user_service.get_user(user_id)
    if user is None:
        raise ValueError("unknown user_id")

    conversation = None
    if conversation_id:
        conversation = await conversation_service.get_conversation(user_id, conversation_id)
    if conversation is None:
        conversation = await conversation_service.create_conversation(user_id, message)
        conversation_id = str(conversation["id"])

    existing_state = await conversation_service.get_state(conversation_id) or {}
    await conversation_service.add_message(conversation_id, "user", message)

    # Load conversation history for multi-turn context passing.
    conv_history = await conversation_service.get_messages(conversation_id)
    conv_history_dicts = [{"role": m["role"], "content": m["content"]} for m in (conv_history or [])]

    rec_state = existing_state.get("recommendation_state") or {}
    partial_intent_dict = rec_state.get("partial_intent") if isinstance(rec_state, dict) else None
    intent = await extract_intent(message, partial_intent=partial_intent_dict, conversation_history=conv_history_dicts)
    # A concrete new classification always wins — it means the LLM has real signal
    # (e.g. an answer like "Bangalore to Mumbai, 3 people" resolves cleanly to
    # travel_flight). Only fall back to the previously established journey_type when
    # this turn's extraction genuinely didn't produce one (a bare slot-fill reply).
    prior_response_type = existing_state.get("response_type")
    if intent.journey_type:
        journey_type = intent.journey_type
    elif prior_response_type == "follow_up_question" and existing_state.get("journey_type"):
        journey_type = existing_state["journey_type"]
    else:
        journey_type = existing_state.get("journey_type") or "general_reward_advice"
    # "I want to travel" etc: the LLM correctly can't tell flight vs hotel yet, so
    # journey_type comes back null and we'd otherwise default to general_reward_advice —
    # which skips the context-gathering planner entirely, so we'd never ask
    # destination/dates. Default a fresh, vague TRAVEL-category ask to travel_flight so
    # the planner engages; it naturally upgrades to travel_hotel next turn once the
    # user's answer makes that clear (handled by the branch above).
    if (
        not intent.journey_type
        and journey_type == "general_reward_advice"
        and intent.category == "TRAVEL"
        and intent.kind not in ("greeting", "check_expiry", "unknown")
    ):
        journey_type = "travel_flight"
    known_slots = _merge_slots(existing_state.get("known_slots") or {}, intent.slots)
    # NOTE: deliberately NOT merging in `memory.structured_preferences` here.
    # remember_conversation() persists each conversation's raw known_slots verbatim —
    # literal one-off answers ("no just give me any"), not curated preferences — so
    # every key in it is per-conversation noise, not a safe cross-session default.
    # Genuinely durable preferences (preferred_airlines, hotel chains, cuisines,
    # family_size) are sourced correctly elsewhere via cmr_service/user_service.
    cards = await user_service.get_user_cards(user_id)
    # Explicit card switch ("use regalia", "switch to infinia") overrides the opened
    # concierge card for the rest of this conversation.
    _switch_to = _detect_card_switch(message, cards)
    if _switch_to:
        known_slots["preferred_card_id"] = _switch_to
    effective_card_id = known_slots.get("preferred_card_id") or active_card_id
    # Safety net: if the prior turn asked for slots and the LLM extracted nothing for any
    # of them, assign the user's reply to the first still-missing asked slot so the
    # follow-up loop always makes progress instead of re-asking the same question.
    if prior_response_type == "follow_up_question":
        _prev_missing = existing_state.get("missing_slots") or []
        _still = [s for s in _prev_missing if known_slots.get(s) in (None, "", [])]
        if _prev_missing and len(_still) == len(_prev_missing) and message.strip():
            known_slots[_still[0]] = message.strip()
    # Carry flight fields into known_slots for continuity across turns.
    if intent.origin:
        known_slots["origin"] = intent.origin
    if intent.destination:
        known_slots["destination"] = intent.destination
    if intent.depart_date:
        known_slots["departure_window"] = intent.depart_date
    # Normalize city names → IATA codes so slot-fill answers like "Bengaluru" are usable.
    if journey_type == "travel_flight":
        from .intent import CITY_TO_IATA
        for field in ("origin", "destination"):
            v = (known_slots.get(field) or "").strip()
            if v and len(v) != 3:  # not already IATA
                iata = CITY_TO_IATA.get(v.lower())
                if iata:
                    known_slots[field] = iata
    missing_slots = _missing_slots(journey_type, known_slots)

    recommendations: list[dict] = []
    response_type = "general_answer"
    assistant_message = ""
    next_actions: list[str] = []
    tool_trace: list[dict] = []
    candidates = []
    requires_confirmation = False
    memory_updates: list[str] = []

    # --- Context-gathering: the Query Generator plans natural questions for exploratory
    #     journeys (travel, merchandise, gifts) before we recommend; the static slot check
    #     is the fallback for everything else. ---
    from services import query_generator
    use_planner = (
        journey_type in query_generator.PLANNED_JOURNEYS
        and intent.kind not in ("greeting", "check_expiry", "unknown")
    )
    plan = None
    confirmation_recap = None
    if use_planner:
        plan = await query_generator.next_context_question(
            journey_type, known_slots, conv_history_dicts, intent.query or message,
            questions_asked=known_slots.get("_planner_questions_asked", 0))

    if use_planner and plan and not plan.get("ready") and plan.get("question"):
        # Still gathering context — ask the planner's next question.
        known_slots["_planner_questions_asked"] = known_slots.get("_planner_questions_asked", 0) + 1
        response_type = "follow_up_question"
        assistant_message = plan["question"]
        missing_slots = [plan.get("slot") or "detail"]
        await conversation_service.upsert_unfinished_task(
            user_id, conversation_id, journey_type, conversation["title"], known_slots, status="open")
        next_actions = ["answer_question"]
    elif (not use_planner and missing_slots
          and intent.kind not in ("greeting", "check_expiry", "unknown")
          and journey_type not in _NEVER_FOLLOWUP_JOURNEYS):
        # Static fallback questioning for non-planned journeys with required slots.
        response_type = "follow_up_question"
        assistant_message = _follow_up_message(journey_type, missing_slots)
        await conversation_service.upsert_unfinished_task(
            user_id, conversation_id, journey_type, conversation["title"], known_slots, status="open")
        next_actions = [f"answer_{slot}" for slot in missing_slots[:3]]
    else:
        # READY to recommend (planner said so, or a non-planned journey with no missing slots).
        if use_planner and plan:
            confirmation_recap = plan.get("confirmation")
        missing_slots = []
        if journey_type in ("home_setup", "product_purchase", "gift_purchase", "merchandise_purchase"):
            search_term = known_slots.get("item") or known_slots.get("product_category") or known_slots.get("required_products") or intent.query or message
            if isinstance(search_term, list):
                search_term = " ".join(str(part) for part in search_term)
            # Real merchandise via the credits→Amazon-voucher path.
            from services import merchandise_service
            merch_cands, card_suggestion = await merchandise_service.search_merchandise_candidates(
                str(search_term), cards, active_card_id=effective_card_id)
            if merch_cands:
                candidates = merch_cands
                recommendations = [c.model_dump() for c in merch_cands]
                response_type = "recommendation"
                top = merch_cands[0]
                assistant_message = (confirmation_recap + " " if confirmation_recap else "") + (
                    f"Your {top.card_name} points convert to an Amazon voucher, and I found real matches for “{search_term}”. "
                    f"My pick: {top.label} ({top.best_use_case}). Tap to convert your points and order it.")
                assistant_message += _card_switch_note(card_suggestion, known_slots)
                next_actions = ["review_recommendations", "redeem_best_option"]
                requires_confirmation = True
            else:
                # No product match → fall back to the bank catalogue so we still surface
                # something real (vouchers etc.) rather than an empty list.
                legacy_candidates, trace, meta = await _orchestrate_scoped(intent, user, cards, effective_card_id)
                candidates = legacy_candidates
                tool_trace = [t.model_dump() for t in trace]
                recommendations = [c.model_dump() for c in legacy_candidates]
                response_type = "recommendation" if legacy_candidates else "general_answer"
                assistant_message = (confirmation_recap + " " if confirmation_recap else "") + meta["reply"]
                next_actions = ["compare_options", "redeem_best_option"] if legacy_candidates else ["clarify_goal"]
        else:
            # Real flight options (Duffel) / storefront hotel options when bookable.
            flight_cands, hotel_cands = [], []
            card_suggestion = None
            if journey_type == "travel_flight":
                from services import flight_service
                flight_cands, card_suggestion = await flight_service.search_flight_candidates(
                    known_slots, cards, active_card_id=effective_card_id)
            if not flight_cands and journey_type == "travel_hotel":
                from services import hotel_service
                hotel_cands, card_suggestion = hotel_service.search_hotel_candidates(
                    known_slots, cards, active_card_id=effective_card_id)
            if flight_cands:
                candidates = flight_cands
                recommendations = [c.model_dump() for c in flight_cands]
                response_type = "recommendation"
                n = len(flight_cands)
                assistant_message = (confirmation_recap + " " if confirmation_recap else "") + (
                    f"Here {'is' if n == 1 else 'are'} {n} live flight option{'' if n == 1 else 's'} I can book with your points — "
                    "fares are pulled in real time from our flight partner and priced into points at your card's SmartBuy rate.")
                assistant_message += _card_switch_note(card_suggestion, known_slots)
                next_actions = ["compare_options", "redeem_best_option"]
                requires_confirmation = True
            elif hotel_cands:
                candidates = hotel_cands
                recommendations = [c.model_dump() for c in hotel_cands]
                response_type = "recommendation"
                assistant_message = (confirmation_recap + " " if confirmation_recap else "") + (
                    "Here are stays I can book with your points through our hotel partners — "
                    "rates are the partners' published nightly price, converted to points at your card's rate.")
                assistant_message += _card_switch_note(card_suggestion, known_slots)
                next_actions = ["compare_options", "redeem_best_option"]
                requires_confirmation = True
            else:
                legacy_candidates, trace, meta = await _orchestrate_scoped(intent, user, cards, effective_card_id)
                candidates = legacy_candidates
                tool_trace = [t.model_dump() for t in trace]
                recommendations = [c.model_dump() for c in legacy_candidates]
                if not use_planner:
                    # Non-planned journeys keep the original post-candidate LLM follow-up loop.
                    is_complete, llm_followup = await _llm_postcandidate_check(
                        journey_type, intent, conv_history_dicts, recommendations, known_slots=known_slots)
                    if not is_complete and llm_followup:
                        response_type = "follow_up_question"
                        assistant_message = llm_followup
                        next_actions = ["answer_question"]
                        recommendations, candidates, tool_trace = [], [], []
                if response_type != "follow_up_question":
                    response_type = "recommendation" if legacy_candidates else "general_answer"
                    assistant_message = (confirmation_recap + " " if confirmation_recap else "") + meta["reply"]
                    next_actions = ["compare_options", "check_transfer_partner", "redeem_best_option"] if legacy_candidates else ["clarify_goal"]

    # Persist partial intent inside recommendation_state so next turn can merge it.
    intent_snapshot = intent.model_dump(exclude={"is_complete", "follow_up_question"})
    await conversation_service.upsert_state(
        conversation_id,
        journey_type=journey_type,
        response_type=response_type,
        known_slots=known_slots,
        missing_slots=missing_slots,
        open_task=None if not missing_slots else conversation["title"],
        recommendation_state={
            "recommendations": recommendations[:3],
            "partial_intent": intent_snapshot,
        },
    )
    if response_type in ("recommendation", "execution_result"):
        await conversation_service.complete_open_tasks(user_id, conversation_id)
    summary = f"{journey_type.replace('_', ' ')} conversation with {len(known_slots)} known slots"
    await memory_service.remember_conversation(user_id, conversation_id, summary, known_slots)
    memory_updates.append("conversation_memory_refreshed")
    await conversation_service.add_message(
        conversation_id,
        "assistant",
        assistant_message,
        {"response_type": response_type, "journey_type": journey_type},
    )
    rec_session = await recommendation_session_service.create_session(
        user_id,
        journey_type,
        known_slots,
        recommendations,
        conversation_id=conversation_id,
        status="ready" if recommendations else "draft",
    )
    return {
        "conversation_id": str(conversation_id) if conversation_id is not None else None,
        "message": assistant_message,
        "response_type": response_type,
        "journey_type": journey_type,
        "known_slots": known_slots,
        "missing_slots": missing_slots,
        "recommendations": recommendations,
        "requires_confirmation": requires_confirmation,
        "memory_updates": memory_updates,
        "next_actions": next_actions,
        "intent": intent,
        "candidates": candidates,
        "tool_trace": tool_trace,
        "claude_used": False,
        "recommendation_session_id": str(rec_session["id"]) if rec_session.get("id") else None,
    }
