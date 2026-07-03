"""Intent extraction — Phase 7: Groq LLM primary, keyword heuristic fallback."""

from __future__ import annotations

import re

from .schemas import Intent

_CARD_ALIASES = {
    "infinia": "hdfc_infinia",
    "regalia": "hdfc_regalia_gold",
    "millennia": "hdfc_millennia",
}

_CATEGORY_HINTS = {
    "TRAVEL": ["travel", "trip", "flight", "fly", "hotel", "stay", "getaway",
               "vacation", "holiday", "lounge", "beach", "mountain", "resort"],
    "DINING": ["dine", "dining", "restaurant", "food", "eat", "zomato", "swiggy"],
    "ENTERTAINMENT": ["movie", "film", "concert", "show", "pvr", "bookmyshow", "event"],
    "SHOPPING": ["shop", "shopping", "amazon", "flipkart", "voucher", "gift"],
    "WELLNESS": ["gym", "fitness", "cult", "wellness", "workout", "health"],
}

_EXPIRY = ["expir", "losing", "lose", "about to", "deadline", "running out", "before i lose"]
_TRANSFER = ["transfer", "convert", "miles", "airline", "krisflyer", "vistara",
             "marriott", "bonvoy", "accor", "maharaja", "frequent flyer"]
_REDEEM = ["redeem", "book", "use my points", "use my pts", "cash in", "spend my points", "get me"]
_GREETING = ["hi", "hello", "hey", "good morning", "good evening", "namaste", "yo"]
_BUY_WORDS = ["buy", "purchase", "order", "get me", "shop for", "want a", "want an", "looking for", "need a", "need an"]
_PRODUCT_WORDS = ["phone", "smartphone", "iphone", "laptop", "macbook", "tablet", "ipad",
                  "headphone", "earbud", "airpod", "watch", "smartwatch", "speaker", "camera",
                  "tv", "television", "console", "playstation", "xbox", "gadget", "appliance",
                  "mixer", "blender", "shoe", "sneaker", "bag", "backpack", "sunglass",
                  "phone stand", "charger", "monitor", "keyboard", "mouse", "merchandise", "product",
                  # kitchen / home appliances
                  "cooker", "microwave", "oven", "refrigerator", "fridge", "washing machine",
                  "air fryer", "airfryer", "toaster", "kettle", "grinder", "vacuum cleaner",
                  "cooktop", "induction", "geyser", "air conditioner", "dishwasher", "purifier"]

CITY_TO_IATA = {
    "bangalore": "BLR", "bengaluru": "BLR", "mumbai": "BOM", "bombay": "BOM",
    "delhi": "DEL", "new delhi": "DEL", "goa": "GOI", "chennai": "MAA",
    "hyderabad": "HYD", "kolkata": "CCU", "pune": "PNQ", "ahmedabad": "AMD",
    "kochi": "COK", "cochin": "COK", "jaipur": "JAI",
    "dubai": "DXB", "abu dhabi": "AUH", "london": "LHR", "singapore": "SIN",
    "new york": "JFK", "paris": "CDG", "bangkok": "BKK", "tokyo": "NRT",
    "maldives": "MLE", "male": "MLE", "sydney": "SYD", "hong kong": "HKG",
    "frankfurt": "FRA", "amsterdam": "AMS", "istanbul": "IST", "doha": "DOH",
    "colombo": "CMB", "kathmandu": "KTM",
}


def _city_to_iata(v: str) -> str | None:
    return CITY_TO_IATA.get(v.lower())


_SLOT_PATTERNS = {
    "style": ["cozy", "modern", "luxury", "minimal", "functional"],
    "room_type": ["living room", "bedroom", "kitchen", "office"],
    "cabin_class": ["economy", "premium economy", "business"],
    "priority": ["comfort", "value", "delivery", "design", "durability", "luxury"],
}

_HOME_PRODUCTS = [
    "sofa",
    "rug",
    "coffee table",
    "table",
    "lamp",
    "curtains",
    "wall art",
    "shelves",
    "recliner",
    "tv unit",
]


def _match(text: str, words: list[str]) -> bool:
    """Left-word-boundary match: "expir" still catches "expiring", but "eat"
    no longer matches "seat" and "hi" no longer matches "chennai"/"delhi"."""
    return any(re.search(rf"\b{re.escape(w)}", text) for w in words)


def _match_word(text: str, words: list[str]) -> bool:
    """Full-word match — for greetings, where "hi" must not catch "high"."""
    return any(re.search(rf"\b{re.escape(w)}\b", text) for w in words)


async def extract_intent(
    message: str,
    partial_intent: dict | None = None,
    conversation_history: list[dict] | None = None,
) -> Intent:
    text = (message or "").lower().strip()

    # --- LLM path (Groq primary) ---
    from services.llm_service import llm_extract_intent
    # Only pass context when there IS an existing partial intent (slot-filling mode).
    # Passing history without partial_intent makes Groq return kind=unknown even for new messages.
    if partial_intent:
        parsed = await llm_extract_intent(message, history=conversation_history, partial_intent=partial_intent)
    else:
        parsed = await llm_extract_intent(message)
    if parsed:
        try:
            current = dict(
                kind=parsed.get("kind", "unknown"),
                query=parsed.get("query", message or ""),
                card_id=parsed.get("card_id"),
                category=parsed.get("category"),
                urgency=bool(parsed.get("urgency", False)),
                journey_type=parsed.get("journey_type"),
                slots=parsed.get("slots", {}),
                origin=parsed.get("origin"),
                destination=parsed.get("destination"),
                depart_date=parsed.get("depart_date"),
            )
            from .session import merge_partial_intent
            merged = merge_partial_intent(partial_intent, current) if partial_intent else current
            # Deterministic journey override: smaller LLMs often mislabel "buy a <product>
            # with points" as general advice. If the text clearly names orderable
            # merchandise, force product_purchase so the merchandise flow engages.
            prod = next((w for w in _PRODUCT_WORDS if w in text), None)
            if merged.get("journey_type") in (None, "general_reward_advice", "card_benefit_lookup"):
                if prod and _match(text, _BUY_WORDS):
                    merged["journey_type"] = "product_purchase"
                    merged.setdefault("kind", "redeem")
            # Capture the product the user named THIS turn as product_category, so the
            # merchandise search uses the actual item — not a stale slot carried over
            # from a previous conversation. setdefault preserves any more specific
            # value the LLM already extracted.
            if prod and merged.get("journey_type") in ("product_purchase", "merchandise_purchase", "gift_purchase"):
                merged.setdefault("slots", {})
                merged["slots"].setdefault("product_category", prod)
            # Completeness is owned by the dialogue manager (clarify gate, static
            # slot-filling, planner, and the post-candidate LLM check). Running a
            # second LLM completeness round here added a blocking round-trip to
            # EVERY turn and could surface a chip-less "tell me more" dead-end via
            # orchestrate's early return — so intents extract as complete.
            return Intent(**merged, is_complete=True, follow_up_question=None)
        except Exception:
            pass  # fall through to heuristic

    # --- Heuristic fallback ---
    card_id = next((cid for alias, cid in _CARD_ALIASES.items() if alias in text), None)
    category = next((cat for cat, hints in _CATEGORY_HINTS.items() if _match(text, hints)), None)
    urgency = _match(text, _EXPIRY)

    if not text or (len(text) <= 12 and _match_word(text, _GREETING)):
        kind = "greeting"
    elif urgency:
        kind = "check_expiry"
    elif _match(text, _TRANSFER):
        kind = "transfer"
    elif _match(text, _REDEEM):
        kind = "redeem"
    elif category or len(text.split()) >= 2:
        kind = "explore_benefits"
    else:
        kind = "unknown"

    if any(word in text for word in ("flight", "fly", "airport", "vacation", "trip")):
        journey_type = "travel_flight"
    elif any(word in text for word in ("hotel", "stay", "resort")):
        journey_type = "travel_hotel"
    elif _match(text, _PRODUCT_WORDS):
        journey_type = "product_purchase"
    elif any(word in text for word in ("living room", "sofa", "rug", "coffee table", "home")):
        journey_type = "home_setup"
    elif any(word in text for word in ("voucher", "gift card")):
        journey_type = "voucher_redemption"
    elif any(word in text for word in ("cashback", "statement credit")):
        journey_type = "cashback_or_statement_credit"
    elif urgency:
        journey_type = "points_expiry_help"
    elif _match(text, _TRANSFER):
        journey_type = "transfer_partner_redemption"
    elif category:
        journey_type = "card_benefit_lookup"
    else:
        journey_type = "general_reward_advice"

    slots = {}
    for key, hints in _SLOT_PATTERNS.items():
        match = next((hint for hint in hints if hint in text), None)
        if match:
            slots[key] = match.replace(" ", "_") if key == "room_type" else match

    if journey_type == "home_setup":
        products = [item for item in _HOME_PRODUCTS if item in text]
        if products:
            slots["required_products"] = products

        budget_match = re.search(r"(\d[\d,]*)\s*(points?|pts|rs|inr)?", text)
        if budget_match and any(token in text for token in ("budget", "points", "pts", "inr", "rs")):
            slots["budget"] = budget_match.group(1).replace(",", "")

    if journey_type == "product_purchase":
        prod = next((w for w in _PRODUCT_WORDS if w in text), None)
        if prod:
            slots["product_category"] = prod
    if "for " in text and journey_type in ("product_purchase", "gift_purchase"):
        slots["recipient_type"] = text.split("for ", 1)[1][:30]
    if "to " in text and journey_type.startswith("travel"):
        slots["destination"] = text.split("to ", 1)[1].split()[0].strip(",.")

    # --- Flight IATA extraction (heuristic) ---
    flying = journey_type == "travel_flight"
    origin_iata = next(
        (iata for city, iata in CITY_TO_IATA.items() if city in text), None
    ) if flying else None
    dest_iata = None
    if flying:
        matched = [iata for city, iata in CITY_TO_IATA.items() if city in text]
        if len(matched) >= 2:
            origin_iata, dest_iata = matched[0], matched[1]
        elif len(matched) == 1:
            dest_iata = matched[0]
            origin_iata = None

    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text)
    depart_date = date_match.group(1) if date_match else None

    return Intent(
        kind=kind,
        query=message or "",
        card_id=card_id,
        category=category,
        urgency=urgency,
        journey_type=journey_type,
        slots=slots,
        origin=origin_iata,
        destination=dest_iata,
        depart_date=depart_date,
        is_complete=True,
    )
