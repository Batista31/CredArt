"""Intent extraction — Phase 7: Groq LLM primary, keyword heuristic fallback."""

from __future__ import annotations

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

    return Intent(kind=kind, query=message or "", card_id=card_id,
                  category=category, urgency=urgency)
