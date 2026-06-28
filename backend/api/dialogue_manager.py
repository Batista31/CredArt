from __future__ import annotations

import json
from typing import Any

from services import (
    conversation_service,
    memory_service,
    personalization_service,
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


async def _llm_postcandidate_check(
    intent: Any,
    history: list[dict],
    candidates: list[dict],
) -> tuple[bool, str | None]:
    """Second LLM round: given the fetched candidates, ask one more question if needed.

    Returns (is_complete, follow_up_question). Defaults to (True, None) on any error so
    the loop never blocks on LLM failure — we fall through to showing recommendations.
    """
    jt = getattr(intent, "journey_type", None) or ""
    if jt in _NEVER_FOLLOWUP_JOURNEYS or not candidates:
        return True, None
    try:
        from services.llm_service import llm_check_completeness
        intent_dict = intent.model_dump() if hasattr(intent, "model_dump") else dict(intent)
        return await llm_check_completeness(intent_dict, history, candidates=candidates)
    except Exception as exc:
        print(f"[dialogue] post-candidate LLM check failed ({exc}), showing recommendations")
        return True, None


async def generate_concierge_response(user_id: str, message: str, conversation_id: str | None = None) -> dict:
    user = await user_service.get_user(user_id)
    if user is None:
        raise ValueError("unknown user_id")

    memory = await personalization_service.get_user_memory(user_id)
    conversation = None
    if conversation_id:
        conversation = await conversation_service.get_conversation(user_id, conversation_id)
    if conversation is None:
        conversation = await conversation_service.create_conversation(user_id, message)
        conversation_id = conversation["id"]

    existing_state = await conversation_service.get_state(conversation_id) or {}
    await conversation_service.add_message(conversation_id, "user", message)

    # Load conversation history for multi-turn context passing.
    conv_history = await conversation_service.get_messages(conversation_id)
    conv_history_dicts = [{"role": m["role"], "content": m["content"]} for m in (conv_history or [])]

    rec_state = existing_state.get("recommendation_state") or {}
    partial_intent_dict = rec_state.get("partial_intent") if isinstance(rec_state, dict) else None
    intent = await extract_intent(message, partial_intent=partial_intent_dict, conversation_history=conv_history_dicts)
    journey_type = intent.journey_type or existing_state.get("journey_type") or "general_reward_advice"
    known_slots = _merge_slots(existing_state.get("known_slots") or {}, intent.slots)
    known_slots = _merge_slots(memory.get("structured_preferences") or {}, known_slots)
    # Carry flight fields into known_slots for continuity across turns.
    if intent.origin:
        known_slots["origin"] = intent.origin
    if intent.destination:
        known_slots["destination"] = intent.destination
    if intent.depart_date:
        known_slots["departure_window"] = intent.depart_date
    missing_slots = _missing_slots(journey_type, known_slots)

    cards = await user_service.get_user_cards(user_id)
    recommendations: list[dict] = []
    response_type = "general_answer"
    assistant_message = ""
    next_actions: list[str] = []
    tool_trace: list[dict] = []
    candidates = []
    requires_confirmation = False
    memory_updates: list[str] = []

    # --- Layer 1 deterministic slot check ---
    if missing_slots:
        response_type = "follow_up_question"
        assistant_message = _follow_up_message(journey_type, missing_slots)
        await conversation_service.upsert_unfinished_task(
            user_id,
            conversation_id,
            journey_type,
            conversation["title"],
            known_slots,
            status="open",
        )
        next_actions = [f"answer_{slot}" for slot in missing_slots[:3]]
    elif journey_type in ("home_setup", "product_purchase", "gift_purchase", "voucher_redemption"):
        style_tags = []
        if known_slots.get("style"):
            style_tags.append(str(known_slots["style"]))
        search_term = known_slots.get("required_products") or known_slots.get("product_category") or message
        if isinstance(search_term, list):
            search_term = " ".join(str(part) for part in search_term)
        items = await reward_catalogue_service.search_reward_items(
            query=str(search_term),
            category="travel" if journey_type == "voucher_redemption" else None,
            style_tags=style_tags,
            top_k=5,
        )
        recommendations = [_home_item_to_candidate(item) for item in items]
        # --- Layer 2: post-candidate LLM follow-up loop ---
        is_complete, llm_followup = await _llm_postcandidate_check(
            intent, conv_history_dicts, recommendations)
        if not is_complete and llm_followup:
            response_type = "follow_up_question"
            assistant_message = llm_followup
            next_actions = ["answer_question"]
        else:
            response_type = "recommendation"
            assistant_message = (
                "I’ve got a shortlist that matches what you told me. "
                "I focused on items that fit your style and points budget rather than just the cheapest options."
            )
            next_actions = ["review_recommendations", "ask_for_quote", "confirm_redemption"]
            requires_confirmation = True
    else:
        legacy_candidates, trace, meta = await orchestrate(intent, user, cards)
        candidates = legacy_candidates
        tool_trace = [t.model_dump() for t in trace]
        recommendations = [c.model_dump() for c in legacy_candidates]
        # --- Layer 2: post-candidate LLM follow-up loop ---
        is_complete, llm_followup = await _llm_postcandidate_check(
            intent, conv_history_dicts, recommendations)
        if not is_complete and llm_followup:
            response_type = "follow_up_question"
            assistant_message = llm_followup
            next_actions = ["answer_question"]
        else:
            response_type = "recommendation" if legacy_candidates else "general_answer"
            assistant_message = meta["reply"]
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
        "conversation_id": conversation_id,
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
        "recommendation_session_id": rec_session["id"],
    }
