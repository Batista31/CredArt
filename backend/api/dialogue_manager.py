from __future__ import annotations

import datetime as _dt
import json
import re as _re
from typing import Any

from services import (
    conversation_service,
    memory_service,
    recommendation_session_service,
    user_service,
)

from .intent import extract_intent
from .orchestrator import orchestrate

_JOURNEY_SLOTS: dict[str, dict[str, list[str]]] = {
    "travel_flight": {
        "required": ["destination", "origin", "departure_window", "passengers", "cabin_class"],
        "optional": ["return_date", "flexibility", "points_cash_preference", "airline_preference"],
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
        # Budget is NOT required: catalogue prices are fixed and shown up front,
        # so once we know WHAT they want we can recommend immediately.
        "required": ["product_category"],
        "optional": ["budget", "brand_preference", "priority", "points_cash_preference"],
    },
    "gift_purchase": {
        # Recipient alone is enough — interests map to products via gift_registry,
        # and catalogue prices are fixed, so budget never blocks gift recs.
        "required": ["recipient_type"],
        "optional": ["occasion", "recipient_interests", "budget", "category", "delivery_timeline"],
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

# Per-request slots, never carried across conversations — else a past "phone"
# search would silently fill a new "cooker" conversation's product_category.
_TRANSIENT_SLOTS = frozenset({
    "product_category", "required_products", "item", "recipient_type", "occasion",
    "recipient_interests",
    "destination", "origin", "departure_window", "return_date", "check_in_window",
    "nights", "guests", "passengers", "cabin_class", "voucher_type", "topic", "goal", "budget",
})

_SLOT_QUESTIONS = {
    "origin": "Which city are you flying from?",
    "destination": "Where do you want to go?",
    "departure_window": "When are you planning to travel — any dates or a rough month?",
    "passengers": "How many people are travelling?",
    "cabin_class": "Which cabin would you like — economy, premium economy, or business?",
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

# Tap-to-answer chips per slot question; free-text slots get none. Chip text is
# chosen to parse cleanly on the way back in (_resolve_date, CITY_TO_IATA).
_SLOT_CHIPS: dict[str, list[str]] = {
    "cabin_class": ["Economy", "Premium economy", "Business"],
    "destination": ["Goa", "Mumbai", "Delhi", "Dubai"],
    "origin": ["Bengaluru", "Mumbai", "Delhi"],
    "passengers": ["1", "2", "3", "4"],
    "guests": ["1", "2", "3", "4"],
    "nights": ["1 night", "2 nights", "3 nights", "A week"],
    "departure_window": ["This weekend", "Next weekend", "Next month"],
    "check_in_window": ["This weekend", "Next weekend", "Next month"],
    "points_cash_preference": ["Use points", "Mostly points", "Points + cash"],
    "budget": ["₹5,000", "₹10,000", "₹25,000", "₹50,000"],
    "occasion": ["Birthday", "Anniversary", "Just because"],
    "recipient_type": ["Partner", "Parent", "Friend", "Myself"],
    "goal": ["Best value", "Convenience", "Low cash spend"],
    "topic": ["Benefits", "Fees", "Lounge access", "Transfer partners"],
    "voucher_type": ["Shopping", "Dining", "Entertainment", "Travel"],
    "style": ["Cozy", "Modern", "Luxury", "Minimal"],
    "room_type": ["Living room", "Bedroom", "Kitchen", "Home office"],
}


def _clarify_chips(category: str | None) -> list[str]:
    """Tap chips for a clarify question — mirror _clarify_question's wording and
    stay routable by _route_clarify_answer."""
    cat = (category or "").upper()
    if cat == "TRAVEL":
        return ["Flights", "Hotel stay", "Lounge access"]
    if cat == "DINING":
        return ["Dining voucher", "Restaurant offer"]
    if cat == "SHOPPING":
        return ["Buy a product", "Gift voucher"]
    if cat == "ENTERTAINMENT":
        return ["Movies", "Live events", "Wellness / spa"]
    return ["Travel", "Dining", "Shopping", "Cashback"]


_WEEKDAYS = {
    "monday": 0, "mon": 0, "tuesday": 1, "tue": 1, "tues": 1, "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3, "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5, "sunday": 6, "sun": 6,
}
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _resolve_date(value: Any, today: _dt.date | None = None) -> str | None:
    """Best-effort convert a natural-language date phrase to an ISO date (YYYY-MM-DD).

    Handles: ISO, dd/mm[/yy], "today/tomorrow", "<day> <month>" / "<month> <day>",
    weekday names ("next friday"), "this/next weekend", "next week", "next month".
    Returns an ISO string only when confidently resolved; otherwise None so the caller
    keeps the original text (Duffel/the planner can still cope). Past bare dates roll
    forward to the next occurrence so a demo never books in the past.
    """
    if not value or not isinstance(value, str):
        return None
    t = value.strip().lower()
    if not t:
        return None
    today = today or _dt.date.today()

    if _re.match(r"^\d{4}-\d{2}-\d{2}$", t):
        return t

    m = _re.match(r"^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
        year = int(y) + 2000 if y and len(y) == 2 else (int(y) if y else today.year)
        try:
            cand = _dt.date(year, mo, d)
        except ValueError:
            return None
        if not y and cand < today:
            cand = cand.replace(year=year + 1)
        return cand.isoformat()

    if "day after tomorrow" in t:
        return (today + _dt.timedelta(days=2)).isoformat()
    if "tomorrow" in t:
        return (today + _dt.timedelta(days=1)).isoformat()
    if "today" in t or "tonight" in t:
        return today.isoformat()

    # "21 july" / "21st july" / "july 21"
    dm = None
    m = _re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})", t)
    if m and m.group(2)[:3] in _MONTHS:
        dm = (int(m.group(1)), _MONTHS[m.group(2)[:3]])
    else:
        m = _re.search(r"\b([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?", t)
        if m and m.group(1)[:3] in _MONTHS:
            dm = (int(m.group(2)), _MONTHS[m.group(1)[:3]])
    if dm:
        d, mo = dm
        ym = _re.search(r"\b(20\d{2})\b", t)
        year = int(ym.group(1)) if ym else today.year
        try:
            cand = _dt.date(year, mo, d)
        except ValueError:
            return None
        if not ym and cand < today:
            cand = cand.replace(year=year + 1)
        return cand.isoformat()

    if "in " in t:  # "in 3 days" / "in 2 weeks"
        m = _re.search(r"\bin\s+(\d{1,2})\s+(day|week)s?\b", t)
        if m:
            n = int(m.group(1)) * (7 if m.group(2) == "week" else 1)
            return (today + _dt.timedelta(days=n)).isoformat()
    if "weekend" in t:
        days = (5 - today.weekday()) % 7 or 7  # upcoming Saturday
        if "next weekend" in t:  # the Saturday after this one
            days += 7
        return (today + _dt.timedelta(days=days)).isoformat()
    for name, wd in _WEEKDAYS.items():
        if _re.search(rf"\b{name}\b", t):
            days = (wd - today.weekday()) % 7 or 7  # always the upcoming occurrence
            return (today + _dt.timedelta(days=days)).isoformat()
    if "next week" in t:
        return (today + _dt.timedelta(days=7)).isoformat()
    if "next month" in t:
        mo = today.month % 12 + 1
        year = today.year + (1 if today.month == 12 else 0)
        return _dt.date(year, mo, min(today.day, 28)).isoformat()
    return None


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


def _profile_defaults(journey_type: str | None, prefs: dict | None) -> dict[str, Any]:
    """Map saved CMR profile values to planner slot defaults for the current journey.

    These are passed to the planner as defaults to CONFIRM (not skip), so they are
    deliberately NOT merged into known_slots — keeping the slot formally missing means
    the turn survives and the user always gets to confirm or correct.
    """
    if not prefs:
        return {}
    defaults: dict[str, Any] = {}
    airlines = prefs.get("preferred_airlines") or []
    hotels = prefs.get("preferred_hotel_chains") or []
    if journey_type == "travel_flight":
        if airlines:
            defaults["airline_preference"] = ", ".join(airlines)
    elif journey_type == "travel_hotel":
        if hotels:
            defaults["brand_preference"] = ", ".join(hotels)
    return defaults


def _missing_slots(journey_type: str | None, known_slots: dict[str, Any]) -> list[str]:
    req = _journey_requirements(journey_type)["required"]
    return [slot for slot in req if known_slots.get(slot) in (None, "", [])]


def _follow_up_message(journey_type: str, missing_slots: list[str]) -> str:
    # Ask for ONE detail at a time — natural, and it means an answered detail is never
    # re-asked. A short lead only on the very first question (when nothing's known yet).
    question = _SLOT_QUESTIONS.get(missing_slots[0], missing_slots[0].replace("_", " ")) if missing_slots else ""
    first_ask = len(missing_slots) >= _FIRST_ASK_THRESHOLD.get(journey_type, 99)
    if not first_ask:
        return question
    if journey_type == "travel_flight":
        lead = "Nice — let's book that with your points."
    elif journey_type == "travel_hotel":
        lead = "Happy to help you find a stay to use your points on."
    elif journey_type == "home_setup":
        lead = "Nice — let's make this feel intentional."
    else:
        lead = "Happy to help with that."
    return lead + " " + question


# How many required slots a journey starts with — used to show the warm lead only on the
# very first (nothing-known-yet) question, then plain one-line questions after that.
_FIRST_ASK_THRESHOLD = {
    "travel_flight": 5,
    "travel_hotel": 4,
    "home_setup": 4,
    "product_purchase": 2,
}


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

# Merchandise-shaped journeys: catalogue-first, Amazon voucher only as fallback.
_MERCH_JOURNEYS = {"product_purchase", "merchandise_purchase", "gift_purchase", "home_setup"}

_DISSATISFIED_RE = _re.compile(
    r"\b(no thanks|not (these|this|that|really)|nothing (else|here|good)|something (else|different)"
    r"|anything else|other options?|more options?|don'?t (like|want)|didn'?t like|meh|nah|nope"
    r"|not satisfied|not interested|none of (these|those))\b")


def _merch_dissatisfied(message: str) -> bool:
    """User pushed back on the catalogue results WITHOUT naming a new product.
    (Naming a product — 'no, show me headphones' — is a new search, not a
    dissatisfaction signal; the voucher stays a fallback, never the lead.)"""
    t = (message or "").lower()
    if not _DISSATISFIED_RE.search(t):
        return False
    from .intent import _PRODUCT_WORDS
    return not any(w in t for w in _PRODUCT_WORDS)

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


# Vague openers get ONE clarifying question before recommending. Expiry asks
# stay instant — intentionally not listed here.
_CLARIFY_JOURNEYS = frozenset({"general_reward_advice", "card_benefit_lookup"})
_CLARIFY_MARKER = "__clarify__"


def _clarify_question(journey_type: str, category: str | None) -> str:
    cat = (category or "").upper()
    if cat == "TRAVEL":
        return ("Happy to help you put those points toward travel! "
                "Are you thinking flights, a hotel stay, or lounge access?")
    if cat == "DINING":
        return "Nice — are you after a dining voucher, or a restaurant/delivery offer?"
    if cat == "SHOPPING":
        return "Sure — shopping for something specific, or a gift voucher?"
    if cat == "ENTERTAINMENT":
        return "Fun — are you thinking movies, live events, or something wellness/spa?"
    return "Happy to help! What are you leaning toward — travel, dining, shopping, or cashback?"


def _route_clarify_answer(text: str) -> tuple[str | None, str | None]:
    """Map a clarify answer to (journey_type, category).

    Booking words ("flights", "hotel") route into the real slot-filling flows; domain
    words ("travel", "dining") route to a category-filtered recommendation. Returns
    (None, None) when unparseable, so the caller falls back to a general recommendation.
    """
    t = (text or "").lower()

    def _w(*words: str) -> bool:
        # left-word-boundary match so "great" doesn't hit "eat", "chennai" doesn't hit "hi"
        return any(_re.search(rf"\b{_re.escape(w)}", t) for w in words)

    if _w("flight", "fly", "airfare", "air ticket"):
        return ("travel_flight", None)
    if _w("hotel", "stay", "resort", "room", "accommodation"):
        return ("travel_hotel", None)
    if _w("lounge"):
        return ("card_benefit_lookup", "TRAVEL")
    if _w("travel", "trip", "vacation", "holiday", "getaway", "miles"):
        return ("card_benefit_lookup", "TRAVEL")
    if _w("dining", "dine", "food", "eat", "restaurant", "cuisine",
          "zomato", "swiggy", "dinner", "lunch"):
        return ("card_benefit_lookup", "DINING")
    if _w("shop", "buy", "purchase", "product", "gadget", "electronic",
          "fashion", "amazon", "voucher", "merch"):
        return ("card_benefit_lookup", "SHOPPING")
    if _w("movie", "concert", "show", "event", "experience", "spa", "wellness"):
        return ("card_benefit_lookup", "ENTERTAINMENT")
    if _w("cashback", "cash back", "statement", "credit"):
        return ("cashback_or_statement_credit", None)
    return (None, None)


# Preference-weight column -> category to lead with when it dominates.
# cashback excluded: it routes to its own journey, not a category rec.
_LEAN_PREF_TO_CATEGORY = {
    "travel_weight": "TRAVEL",
    "dining_weight": "DINING",
    "shopping_weight": "SHOPPING",
    "experiences_weight": "ENTERTAINMENT",
}
_LEAN_LABEL = {"TRAVEL": "travel", "DINING": "dining",
               "SHOPPING": "shopping", "ENTERTAINMENT": "entertainment & experiences"}
# How strong a lean must be before we act on it WITHOUT asking. Below this we keep the
# clarify question — personalization only pre-empts the question when the signal is real.
_LEAN_MIN_WEIGHT = 0.35
_LEAN_MIN_MARGIN = 0.15


def _dominant_lean(prefs: dict | None) -> tuple[str | None, float]:
    """The user's clearly-dominant preference category, or (None, 0.0) if none stands out.

    Deterministic Layer-1 read of the stored preference weights — this is what lets a
    vague opener ("how do I spend my points?") surface a personalized recommendation
    with no category click. Requires both an absolute floor and a margin over the runner-up
    so a flat/default profile falls back to asking instead of guessing.
    """
    if not prefs:
        return None, 0.0
    scored = sorted(
        ((cat, float(prefs.get(key) or 0.0)) for key, cat in _LEAN_PREF_TO_CATEGORY.items()),
        key=lambda kv: kv[1], reverse=True)
    top_cat, top_w = scored[0]
    second_w = scored[1][1] if len(scored) > 1 else 0.0
    if top_w >= _LEAN_MIN_WEIGHT and (top_w - second_w) >= _LEAN_MIN_MARGIN:
        return top_cat, top_w
    return None, 0.0


def _switch_chips(current_category: str | None) -> list[str]:
    """The other lanes to offer as tap-chips under a leaned recommendation, so the user
    can redirect in one tap (proves the lean is a smart default, not a lock-in)."""
    label_of = {"TRAVEL": "Travel", "DINING": "Dining", "SHOPPING": "Shopping"}
    base = ["Travel", "Dining", "Shopping", "Cashback"]
    keep = label_of.get((current_category or "").upper())
    return [c for c in base if c != keep]


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
    # Guardrail: strip control chars / collapse whitespace / cap length before the
    # message touches the LLM, intent extraction, or the conversation log.
    from services.llm_guardrails import sanitize_user_message
    message = sanitize_user_message(message) or "what can I do with my points"

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
    # A concrete new classification wins; fall back to the established
    # journey_type only when this turn extracted none (bare slot-fill reply).
    prior_response_type = existing_state.get("response_type")
    # Category currently being shown via a lean/clarify route (drives switch chips + lead).
    auto_leaned_category: str | None = None
    switch_context_category: str | None = None
    # Did the user just answer a clarifying "what are you leaning toward?" question — OR tap a
    # "switch lane" chip we offered under a personalized (leaned) recommendation last turn?
    answering_clarify = (prior_response_type == "follow_up_question"
                         and (existing_state.get("missing_slots") or []) == [_CLARIFY_MARKER])
    if (not answering_clarify and rec_state.get("awaiting_category_switch")
            and _route_clarify_answer(message)[0]):
        answering_clarify = True
    if answering_clarify:
        # Re-route on their answer: booking words → flight/hotel slot-filling; domain
        # words → category-filtered recommendation. Don't lock to the old clarify journey.
        routed_jt, routed_cat = _route_clarify_answer(message)
        journey_type = routed_jt or "card_benefit_lookup"
        if routed_cat:
            intent.category = routed_cat
        if journey_type == "card_benefit_lookup" and routed_cat:
            switch_context_category = routed_cat
    elif intent.journey_type:
        journey_type = intent.journey_type
    elif prior_response_type == "follow_up_question" and existing_state.get("journey_type"):
        journey_type = existing_state["journey_type"]
    else:
        journey_type = existing_state.get("journey_type") or "general_reward_advice"
    # Vague TRAVEL ask ("I want to travel") → default travel_flight so the planner
    # engages (else general_reward_advice would skip it); upgrades to hotel next turn.
    if (
        not intent.journey_type
        and journey_type == "general_reward_advice"
        and intent.category == "TRAVEL"
        and intent.kind not in ("greeting", "check_expiry", "unknown")
    ):
        journey_type = "travel_flight"
    known_slots = _merge_slots(existing_state.get("known_slots") or {}, intent.slots)
    # Deliberately NOT merging memory.structured_preferences here: it holds raw
    # per-conversation slot noise. Durable prefs come via cmr_service/user_service.
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
    if prior_response_type == "follow_up_question" and not answering_clarify:
        _prev_missing = existing_state.get("missing_slots") or []
        _still = [s for s in _prev_missing if known_slots.get(s) in (None, "", [])]
        if _prev_missing and len(_still) == len(_prev_missing) and message.strip():
            known_slots[_still[0]] = message.strip()
    # Answered a clarify with a domain word ("travel"/"dining") → recommend that category
    # now. Prime the intent so orchestrate assembles candidates (booking routes like
    # travel_flight are handled by their own slot-filling instead).
    if answering_clarify and journey_type not in (
            "travel_flight", "travel_hotel", "product_purchase", "gift_purchase", "merchandise_purchase"):
        if intent.kind in ("greeting", "check_expiry", "unknown"):
            intent.kind = "explore_benefits"
        intent.is_complete = True
        if intent.category:
            known_slots["topic"] = intent.category  # satisfy card_benefit_lookup's required slot
        if not (intent.query or "").strip():
            intent.query = (intent.category or "rewards").lower()
    # Carry flight fields into known_slots for continuity across turns.
    if intent.origin:
        known_slots["origin"] = intent.origin
    if intent.destination:
        known_slots["destination"] = intent.destination
    if intent.depart_date:
        known_slots["departure_window"] = intent.depart_date
    # Normalize given answers so they're never re-asked: city → IATA,
    # natural dates ("next Friday") → ISO. Nothing is assumed, only converted.
    if journey_type in ("travel_flight", "travel_hotel"):
        from .intent import CITY_TO_IATA
        _today = _dt.date.today()
        if journey_type == "travel_flight":
            for field in ("origin", "destination"):
                v = (known_slots.get(field) or "").strip()
                if not v:
                    continue
                # Always try the city→IATA map first — some city names are 3 letters
                # (e.g. "Goa" → GOI), so we can't skip the lookup on length alone.
                iata = CITY_TO_IATA.get(v.lower())
                if iata:
                    known_slots[field] = iata
                elif len(v) == 3:
                    known_slots[field] = v.upper()  # already an IATA code
        date_slot = "departure_window" if journey_type == "travel_flight" else "check_in_window"
        # Resolve the first date-like value we can find: the current slot, other date
        # aliases, or the raw user message (a bare "next friday" reply to the dates question).
        for raw in (known_slots.get(date_slot), known_slots.get("depart_date"),
                    known_slots.get("travel_date"), message):
            iso = _resolve_date(raw, _today)
            if iso:
                known_slots[date_slot] = iso
                break
    # Merch journeys: deterministically pin the product from the message (same
    # keyword list intent/_clean_query use) so a clear ask like "buy a coffee
    # maker" never gets a redundant "what product?" question.
    if journey_type in _MERCH_JOURNEYS and not known_slots.get("product_category"):
        # The intent LLM often lands the product under a sibling key — honour it.
        _alias = known_slots.get("item") or known_slots.get("required_products")
        if _alias:
            known_slots["product_category"] = (
                _alias if isinstance(_alias, str) else " ".join(str(a) for a in _alias))
        else:
            from .intent import _PRODUCT_WORDS
            _msg_l = f"{message} {intent.query or ''}".lower()
            _generic = {"product", "merchandise", "gadget", "appliance"}
            for _w in sorted((w for w in _PRODUCT_WORDS if w not in _generic), key=len, reverse=True):
                if _w in _msg_l:
                    known_slots["product_category"] = _w
                    break
    # Relationship memory: "gift for my son" with no interest stated → recall what
    # we learned about the son in past gift conversations and seed it silently.
    gift_memory_note = ""
    if journey_type == "gift_purchase" and known_slots.get("recipient_type"):
        from services import gift_registry, personalization_service
        _rel = gift_registry.canonical_relation(str(known_slots["recipient_type"]))
        known_slots["recipient_type"] = _rel
        if not known_slots.get("recipient_interests"):
            _prof = await personalization_service.relationship_profile(user_id, _rel)
            if _prof and _prof.get("interests"):
                known_slots["recipient_interests"] = _prof["interests"]
                gift_memory_note = (
                    f"You've mentioned your {_rel} likes "
                    f"{', '.join(_prof['interests'])} — I kept that in mind. ")
    missing_slots = _missing_slots(journey_type, known_slots)

    recommendations: list[dict] = []
    response_type = "general_answer"
    assistant_message = ""
    next_actions: list[str] = []
    gift_voucher_chip = False  # set True when a gift rec should offer the voucher as a tap, not inline text
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
        # Product already pinned for a merch journey → recommend NOW, don't plan
        # questions (catalogue prices are fixed; there's nothing left to ask).
        and not (journey_type in _MERCH_JOURNEYS and known_slots.get("product_category"))
        # Gift with recipient + interests known → engine maps interests to
        # products itself; asking more questions would be stalling.
        and not (journey_type == "gift_purchase"
                 and known_slots.get("recipient_type") and known_slots.get("recipient_interests"))
    )
    # Catalogue results didn't land last turn and the user pushed back without
    # naming a new product → offer the flexible Amazon voucher (fallback, never
    # the lead) instead of re-planning questions.
    voucher_fallback = (
        prior_response_type == "recommendation"
        and existing_state.get("journey_type") in _MERCH_JOURNEYS
        and _merch_dissatisfied(message)
    )
    if voucher_fallback:
        use_planner = False
    plan = None
    confirmation_recap = None
    if use_planner:
        # CMR profile defaults (e.g. usual party size) — passed to the planner to
        # CONFIRM, kept OUT of known_slots so the slot stays unanswered and the turn
        # is never silently skipped.
        prefs = await user_service.get_preferences(user_id) or {}
        profile_defaults = _profile_defaults(journey_type, prefs)
        plan = await query_generator.next_context_question(
            journey_type, known_slots, conv_history_dicts, intent.query or message,
            questions_asked=known_slots.get("_planner_questions_asked", 0),
            profile_defaults=profile_defaults)

    # Personalization-forward opener: on a vague ask, a clear preference lean leads
    # straight into that category (switch chips to redirect); flat profile → clarify.
    if (journey_type in _CLARIFY_JOURNEYS and not answering_clarify
            and intent.category is None
            and intent.kind not in ("greeting", "check_expiry")):
        lean_prefs = await user_service.get_preferences(user_id) or {}
        lean_cat, _lean_w = _dominant_lean(lean_prefs)
        if lean_cat:
            auto_leaned_category = lean_cat
            switch_context_category = lean_cat
            journey_type = "card_benefit_lookup"
            intent.category = lean_cat
            intent.kind = "explore_benefits"
            intent.is_complete = True
            known_slots["topic"] = lean_cat            # satisfy card_benefit_lookup's required slot
            if not (intent.query or "").strip():
                intent.query = lean_cat.lower()
            missing_slots = _missing_slots(journey_type, known_slots)

    # Clarify gate: a vague/domain opener gets ONE question to pin the intent before we
    # recommend, so CredArt gathers what the user actually wants instead of guessing.
    ask_clarify = (journey_type in _CLARIFY_JOURNEYS and not answering_clarify
                   and not auto_leaned_category
                   and intent.kind not in ("greeting", "check_expiry"))
    if voucher_fallback:
        from services import merchandise_service
        _budget_raw = known_slots.get("budget")
        try:
            budget_inr = float(str(_budget_raw).replace(",", "").replace("₹", "").strip()) if _budget_raw else None
        except ValueError:
            budget_inr = None
        _v = merchandise_service.amazon_voucher_candidate(
            cards, active_card_id=effective_card_id, budget_inr=budget_inr)
        candidates = [_v] if _v else []
        recommendations = [c.model_dump() for c in candidates]
        missing_slots = []
        if candidates:
            response_type = "recommendation"
            assistant_message = (
                "No problem — the catalogue isn't the only way. The flexible route: convert your points to an "
                "Amazon voucher and buy exactly what you want, any brand, any store. Or describe what you're "
                "after in a bit more detail and I'll re-search the rewards catalogue for you.")
            next_actions = ["redeem_best_option", "refine_search"]
            requires_confirmation = True
        else:
            response_type = "general_answer"
            assistant_message = "Tell me a bit more about what you're looking for and I'll re-search the catalogue."
            next_actions = ["clarify_goal"]
    elif ask_clarify:
        response_type = "follow_up_question"
        assistant_message = _clarify_question(journey_type, intent.category)
        missing_slots = [_CLARIFY_MARKER]
        await conversation_service.upsert_unfinished_task(
            user_id, conversation_id, journey_type, conversation["title"], known_slots, status="open")
        next_actions = ["answer_question"]
    elif use_planner and plan and not plan.get("ready") and plan.get("question"):
        # Still gathering context — ask the planner's next question.
        known_slots["_planner_questions_asked"] = known_slots.get("_planner_questions_asked", 0) + 1
        response_type = "follow_up_question"
        assistant_message = plan["question"]
        missing_slots = [plan.get("slot") or "detail"]
        await conversation_service.upsert_unfinished_task(
            user_id, conversation_id, journey_type, conversation["title"], known_slots, status="open")
        next_actions = ["answer_question"]
    elif (not use_planner and missing_slots
          and journey_type not in _NEVER_FOLLOWUP_JOURNEYS
          # The journey is specifically classified (not a generic/instant one) and is missing
          # required details, so ask — even if a terse message ("Goa", "I want a phone")
          # parses as kind=unknown. Only pure greetings/expiry short-circuit questioning.
          and intent.kind not in ("greeting", "check_expiry")):
        # Static, one-question-at-a-time slot-filling for non-planned journeys (incl. travel).
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
            # Rewards catalogue first — the bank's own merchandise store is the
            # primary channel; the Amazon voucher is strictly the fallback.
            from services import merchandise_service
            gift_interests = known_slots.get("recipient_interests") or []
            if isinstance(gift_interests, str):
                gift_interests = [gift_interests]
            if (journey_type == "gift_purchase" and gift_interests
                    and not known_slots.get("product_category")):
                # Gift lane: recipient's interests drive the search, not the
                # user's own profile and not a raw keyword match.
                merch_cands, card_suggestion = await merchandise_service.search_gift_candidates(
                    gift_interests, cards, active_card_id=effective_card_id)
                search_term = ", ".join(gift_interests)
                _recipient = known_slots.get("recipient_type")
                if _recipient:
                    for _c in merch_cands:
                        _c.metadata = {**(_c.metadata or {}), "gift_for": _recipient}
                    # Durable relationship memory — next gift ask for this person
                    # starts from what we learned today.
                    from services import personalization_service
                    await personalization_service.remember_relationship(
                        user_id, str(_recipient),
                        interests=gift_interests, occasion=known_slots.get("occasion"))
            else:
                merch_cands, card_suggestion = await merchandise_service.search_merchandise_candidates(
                    str(search_term), cards, active_card_id=effective_card_id)
            if merch_cands:
                candidates = merch_cands
                recommendations = [c.model_dump() for c in merch_cands]
                response_type = "recommendation"
                top = merch_cands[0]
                n_afford = sum(1 for c in merch_cands if c.affordable)
                if n_afford:
                    _fit = (f"{n_afford} of these fit your balance right now — the top pick is a one-tap order. "
                            if n_afford > 1 else "The top pick fits your balance — it's a one-tap order. ")
                else:
                    _fit = ("None of these fit your current balance yet — if you'd rather not wait, "
                            "an Amazon voucher can stretch what you have. ")
                if journey_type == "gift_purchase" and gift_interests:
                    _who = known_slots.get("recipient_type") or "them"
                    _occ = f" for the {known_slots['occasion']}" if known_slots.get("occasion") else ""
                    assistant_message = (confirmation_recap + " " if confirmation_recap else "") + gift_memory_note + (
                        f"Since your {_who} loves {search_term}, I shopped the rewards catalogue with that in mind{_occ}. "
                        f"My top gift pick: {top.label} ({top.best_use_case}). {_fit}")
                    next_actions = ["review_recommendations", "redeem_best_option", "show_amazon_voucher_instead"]
                    gift_voucher_chip = True
                else:
                    assistant_message = (confirmation_recap + " " if confirmation_recap else "") + (
                        f"Straight from your rewards catalogue — real products you can order with points, no browsing. "
                        f"My pick for “{search_term}”: {top.label} ({top.best_use_case}). {_fit}")
                    next_actions = ["review_recommendations", "redeem_best_option"]
                assistant_message += _card_switch_note(card_suggestion, known_slots)
                requires_confirmation = True
            else:
                # Catalogue miss. Be honest, then give two real ways forward:
                # the flexible Amazon voucher (buy it anywhere) and the
                # catalogue's bestsellers so the store stays in front of them.
                _voucher = merchandise_service.amazon_voucher_candidate(
                    cards, active_card_id=effective_card_id)
                _best = merchandise_service.popular_catalog_candidates(
                    cards, active_card_id=effective_card_id)
                fallback_cands = ([_voucher] if _voucher else []) + _best
                for _i, _c in enumerate(fallback_cands):
                    _c.rank = _i + 1
                candidates = fallback_cands
                recommendations = [c.model_dump() for c in fallback_cands]
                _term = str(search_term).strip()
                _recap = (confirmation_recap + " ") if confirmation_recap else ""
                if fallback_cands:
                    response_type = "recommendation"
                    assistant_message = _recap + (
                        f"“{_term}” isn't in your rewards catalogue right now. Two ways forward: take an "
                        "Amazon voucher and buy it anywhere you like, or browse the catalogue's most popular "
                        "rewards below — all orderable with your points today.")
                    next_actions = ["compare_options", "redeem_best_option"]
                    requires_confirmation = True
                else:
                    response_type = "general_answer"
                    assistant_message = _recap + (
                        f"“{_term}” isn't in the catalogue right now. Want me to try a different product, "
                        "or look at another way to use your points?")
                    next_actions = ["clarify_goal"]
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

    # Personalized lead-in when we leaned into a category with NO user click — makes the
    # "we already know you" moment explicit before the recommendations.
    if auto_leaned_category and response_type == "recommendation":
        label = _LEAN_LABEL.get(auto_leaned_category, "your usual picks")
        assistant_message = (
            f"Going by your rewards profile you lean toward {label}, so I started there. "
            + assistant_message)
    # Only offer switch chips (and let next turn treat a lane word as a switch) when we
    # actually showed a leaned/clarify-routed recommendation.
    show_switch_chips = bool(switch_context_category and response_type == "recommendation")

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
            "awaiting_category_switch": show_switch_chips,
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
    # Tap-to-answer chips for the current follow-up question (clarify or slot); or, when we
    # led with a personalized (leaned) recommendation, "switch lane" chips to redirect.
    suggested_replies: list[str] = []
    if response_type == "follow_up_question":
        if missing_slots == [_CLARIFY_MARKER]:
            suggested_replies = _clarify_chips(intent.category)
        elif missing_slots:
            suggested_replies = _SLOT_CHIPS.get(missing_slots[0], [])
    elif show_switch_chips:
        suggested_replies = _switch_chips(switch_context_category)
    elif gift_voucher_chip:
        # Gift rec shown: the voucher fallback is a tap-away option, never a
        # sentence tacked onto the reply.
        suggested_replies = ["Show an Amazon voucher instead"]
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
        "suggested_replies": suggested_replies,
        "intent": intent,
        "candidates": candidates,
        "tool_trace": tool_trace,
        "llm_used": False,
        "recommendation_session_id": str(rec_session["id"]) if rec_session.get("id") else None,
    }
