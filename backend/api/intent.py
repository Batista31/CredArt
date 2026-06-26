"""Intent extraction — Phase 7: Groq LLM primary, keyword heuristic fallback.

Multi-turn extension: after extracting the current-turn intent the function
merges it with any partial intent stored from previous turns, then calls
llm_check_completeness to decide whether a follow-up question is needed.
"""

from __future__ import annotations

from .schemas import Intent
from .session import merge_partial_intent

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

# Intent kinds that are self-contained — no follow-up needed regardless of fields.
_ALWAYS_COMPLETE = {"greeting", "check_expiry", "transfer", "unknown"}


def _match(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def _raw_from_llm(parsed: dict, message: str) -> dict | None:
    """Convert LLM-parsed output to a normalised intent dict. Returns None on error."""
    try:
        return {
            "kind": parsed.get("kind", "unknown"),
            # Always the verbatim user message — don't trust the LLM to echo it
            # back, so query accumulation across turns stays deterministic.
            "query": message or "",
            "card_id": parsed.get("card_id"),
            "category": parsed.get("category"),
            "urgency": bool(parsed.get("urgency", False)),
            "origin": _to_iata(parsed.get("origin")),
            "destination": _to_iata(parsed.get("destination")),
            "depart_date": parsed.get("depart_date"),
        }
    except Exception:
        return None


def _raw_from_heuristic(message: str, text: str) -> dict:
    """Keyword-heuristic intent extraction (LLM fallback)."""
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

    return {
        "kind": kind, "query": message or "", "card_id": card_id,
        "category": category, "urgency": urgency, "origin": None,
        "destination": destination, "depart_date": None,
    }


async def extract_intent(
    message: str,
    conversation_history: list[dict] | None = None,
    partial_intent: dict | None = None,
) -> Intent:
    text = (message or "").lower().strip()

    # --- Extract current-turn intent (LLM primary, heuristic fallback) ---
    # Pass conversation history so the LLM understands short answers in context
    # (e.g. "This Saturday evening" is an answer to "When?", not a new entertainment request).
    from services.llm_service import llm_extract_intent
    parsed = await llm_extract_intent(message, conversation_history=conversation_history)
    current = (parsed and _raw_from_llm(parsed, message)) or _raw_from_heuristic(message, text)

    # --- Merge with stored partial intent from earlier turns ---
    merged = merge_partial_intent(partial_intent, current) if partial_intent else current

    # --- Completeness check (skipped for self-contained intent kinds) ---
    is_complete = True
    follow_up_question = None
    if merged.get("kind") not in _ALWAYS_COMPLETE:
        try:
            from services.llm_service import llm_check_completeness
            is_complete, follow_up_question = await llm_check_completeness(
                merged, conversation_history or []
            )
        except Exception as e:
            print(f"[intent] completeness check failed ({e}), treating as complete")

    return Intent(**merged, is_complete=is_complete, follow_up_question=follow_up_question)
