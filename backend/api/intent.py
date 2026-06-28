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
    return any(w in text for w in words)


async def extract_intent(message: str) -> Intent:
    text = (message or "").lower().strip()

    # --- LLM path (Groq primary) ---
    from services.llm_service import llm_extract_intent
    parsed = await llm_extract_intent(message)
    if parsed:
        try:
            return Intent(
                kind=parsed.get("kind", "unknown"),
                query=parsed.get("query", message or ""),
                card_id=parsed.get("card_id"),
                category=parsed.get("category"),
                urgency=bool(parsed.get("urgency", False)),
                journey_type=parsed.get("journey_type"),
                slots=parsed.get("slots", {}),
            )
        except Exception:
            pass  # fall through to heuristic

    # --- Heuristic fallback ---
    card_id = next((cid for alias, cid in _CARD_ALIASES.items() if alias in text), None)
    category = next((cat for cat, hints in _CATEGORY_HINTS.items() if _match(text, hints)), None)
    urgency = _match(text, _EXPIRY)

    if not text or (len(text) <= 12 and _match(text, _GREETING)):
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

    if "for " in text and journey_type in ("product_purchase", "gift_purchase"):
        slots["recipient_type"] = text.split("for ", 1)[1][:30]
    if "to " in text and journey_type.startswith("travel"):
        slots["destination"] = text.split("to ", 1)[1].split()[0].strip(",.")

    return Intent(
        kind=kind,
        query=message or "",
        card_id=card_id,
        category=category,
        urgency=urgency,
        journey_type=journey_type,
        slots=slots,
    )
