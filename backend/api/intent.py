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

# City / airport name -> main IATA code. Used to normalize LLM output and as the
# heuristic-path extractor when the LLM is unavailable.
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


def _to_iata(value: str | None) -> str | None:
    """Normalize a city name or code to a 3-letter IATA code."""
    if not value:
        return None
    v = value.strip()
    if len(v) == 3 and v.isalpha():
        return v.upper()
    return CITY_TO_IATA.get(v.lower())


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
                origin=_to_iata(parsed.get("origin")),
                destination=_to_iata(parsed.get("destination")),
                depart_date=parsed.get("depart_date"),
            )
        except Exception:
            pass  # fall through to heuristic

    # --- Heuristic fallback ---
    card_id = next((cid for alias, cid in _CARD_ALIASES.items() if alias in text), None)
    category = next((cat for cat, hints in _CATEGORY_HINTS.items() if _match(text, hints)), None)
    urgency = _match(text, _EXPIRY)
    # Only treat a city mention as a flight destination when flying is implied.
    flying = _match(text, ["flight", "fly", "flights"])
    destination = next((iata for city, iata in CITY_TO_IATA.items() if city in text), None) if flying else None

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
                  category=category, urgency=urgency, destination=destination)
