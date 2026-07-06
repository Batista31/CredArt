"""Flight options service — real Duffel offers, priced into points via the
card→partner mapping (HDFC SmartBuy-style).

Anti-hallucination: the ₹ amount comes straight from Duffel (a real API); the
points figure is a deterministic function of that amount and the card's published
redemption value. The LLM never invents either.
"""

from __future__ import annotations

import math
import re
import uuid
from datetime import date, datetime

from api.intent import CITY_TO_IATA
from api.schemas import Candidate
from .card_selector import pick_card
from .redemption.duffel_provider import DuffelProvider

_duffel = DuffelProvider()

# ₹ delivered per reward point when redeemed toward flights (SmartBuy-style ratios).
# Best card wins when the user holds several.
CARD_FLIGHT_POINT_VALUE = {
    "hdfc_infinia": 1.0,
    "hdfc_regalia_gold": 0.5,
    "hdfc_millennia": 0.3,
}
_DEFAULT_POINT_VALUE = 0.5
_GBP_INR = 106.0  # sandbox offers come back in GBP; convert for a realistic ₹ figure
_CURRENCY_INR = {"GBP": _GBP_INR, "USD": 84.0, "EUR": 92.0, "INR": 1.0}


_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _parse_date_to_iso(text: str | None) -> str | None:
    """Best-effort free-text date → ISO ("5th July", "July 5" → "2026-07-05").

    Without this, only an already-ISO string reached Duffel and everything else
    ("5th July", "next Friday") silently fell through to Duffel's own +30-day
    default — ignoring the date the user actually asked for. Returns None (Duffel
    default) rather than guessing when the text doesn't parse; never invents a date.
    """
    if not text or not isinstance(text, str):
        return None
    text = text.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return text
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)", text)
    if m:
        day_s, month_name = m.group(1), m.group(2)
    else:
        m = re.search(r"([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?", text)
        if not m:
            return None
        month_name, day_s = m.group(1), m.group(2)
    month = _MONTHS.get(month_name.lower())
    if not month:
        return None
    try:
        day = int(day_s)
        today = date.today()
        candidate = date(today.year, month, day)
        if candidate < today:
            candidate = date(today.year + 1, month, day)
    except ValueError:
        return None
    return candidate.isoformat()


def _fmt_time(iso_ts: str | None) -> str | None:
    """Duffel timestamps → "HH:MM" for display. None if unparseable."""
    if not iso_ts:
        return None
    try:
        return datetime.fromisoformat(iso_ts).strftime("%H:%M")
    except ValueError:
        return None


def _iata(name: str | None) -> str | None:
    if not name:
        return None
    name = str(name).strip()
    # city names FIRST — "Goa" is 3 letters but means GOI, not airport code "GOA"
    mapped = CITY_TO_IATA.get(name.lower())
    if mapped:
        return mapped
    if len(name) == 3 and name.isalpha():
        return name.upper()
    return None


def _passenger_count(slots: dict) -> int:
    """Best-effort party size from a number or free-text composition."""
    for key in ("passengers", "guests", "number_of_people", "party_size"):
        v = slots.get(key)
        if isinstance(v, int):
            return max(1, v)
        if isinstance(v, str) and v.strip().isdigit():
            return max(1, int(v.strip()))
    text = " ".join(str(slots.get(k, "")) for k in ("party_composition", "passengers", "guests")).lower()
    if not text.strip():
        return 1
    m = re.search(r"(\d+)", text)
    if m:
        return max(1, int(m.group(1)))
    # count people words
    adults = len(re.findall(r"\b(me|i|wife|husband|partner|spouse|adult|friend)\b", text))
    kids = len(re.findall(r"\b(kid|child|children|son|daughter|baby|infant)\b", text))
    total = adults + kids
    return max(1, total)


def _best_card(cards: list[dict]) -> dict | None:
    if not cards:
        return None
    return max(cards, key=lambda c: CARD_FLIGHT_POINT_VALUE.get(c["card_id"], _DEFAULT_POINT_VALUE))


def _cabin(slots: dict) -> str:
    """Normalize the user's cabin answer ("Business", "premium economy") to a
    Duffel cabin_class value. Defaults to economy."""
    v = str(slots.get("cabin_class") or slots.get("cabin") or "").strip().lower()
    if "premium" in v:
        return "premium_economy"
    if "business" in v:
        return "business"
    if "first" in v:
        return "first"
    return "economy"


def _fulfillment_options() -> list[dict]:
    return [
        {"provider_id": "duffel_flight", "label": "Book flight (Duffel · live)", "path": "api",
         "mode": "live", "currency": "points", "available": _duffel.is_available(),
         "note": _duffel.unavailable_note()},
        {"provider_id": "demo", "label": "Demo (demo credits)", "path": "demo",
         "mode": "demo", "currency": "demo_points", "available": True, "note": None},
    ]


async def search_flight_candidates(
    slots: dict, cards: list[dict], active_card_id: str | None = None
) -> tuple[list[Candidate], dict | None]:
    """Return (real Duffel flight offers as scored Candidates, card_switch_suggestion).
    Candidates is [] if not bookable (unknown airport, no offers, Duffel disabled).
    Caller falls back gracefully."""
    origin = _iata(slots.get("origin"))
    destination = _iata(slots.get("destination") or slots.get("dest"))
    if not (origin and destination) or origin == destination:
        return [], None
    if not _duffel.is_available():
        return [], None

    pax = _passenger_count(slots)
    depart = slots.get("departure_window") or slots.get("depart_date") or slots.get("travel_date")
    # parse concrete dates ("5th July") to ISO; genuinely relative text ("next weekend")
    # still can't be resolved deterministically, so that case still lets Duffel default.
    depart_iso = _parse_date_to_iso(depart)

    offers = await _duffel.search(origin, destination, depart_iso, passengers=pax,
                                  cabin=_cabin(slots))
    if not offers:
        return [], None

    card, suggestion = pick_card(cards, CARD_FLIGHT_POINT_VALUE, _DEFAULT_POINT_VALUE, active_card_id)
    if card is None:
        return [], None
    point_value = CARD_FLIGHT_POINT_VALUE.get(card["card_id"], _DEFAULT_POINT_VALUE)
    balance = card.get("current_points") or 0

    candidates: list[Candidate] = []
    for i, o in enumerate(offers):
        rate = _CURRENCY_INR.get(o["currency"], 1.0)
        # Duffel's total_amount is the price for ALL passengers on the offer —
        # do NOT multiply by passenger count again.
        inr_total = o["amount"] * rate
        points_cost = int(math.ceil(inr_total / point_value))
        stops_label = "non-stop" if o["stops"] == 0 else f"{o['stops']} stop"
        dep_time = _fmt_time(o.get("departing_at"))
        arr_time = _fmt_time(o.get("arriving_at"))
        time_label = f" · {dep_time}→{arr_time}" if dep_time and arr_time else ""
        candidates.append(Candidate(
            kind="flight",
            candidate_id=uuid.uuid4().hex[:8],
            card_id=card["card_id"],
            card_name=card["card_name"],
            label=f"{o['airline']} · {o['origin']}→{o['destination']}{time_label}",
            category="TRAVEL",
            points_cost=points_cost,
            affordable=balance >= points_cost,
            effective_value_inr=round(inr_total, 0),
            best_use_case=(
                f"{o['depart_date']}{f', departs {dep_time}' if dep_time else ''} · {stops_label} · "
                f"{o['passengers']} traveller{'s' if o['passengers'] > 1 else ''} · ~₹{int(inr_total):,} via SmartBuy"
            ),
            origin=o["origin"],
            destination=o["destination"],
            depart_date=o["depart_date"],
            source_url="https://www.hdfcbank.com/personal/pay/cards/smartbuy",
            note=None if balance >= points_cost else f"needs {points_cost - balance:,} more points",
            rank=i + 1,
            fulfillment_options=_fulfillment_options(),
            metadata={
                "offer_id": o["offer_id"], "airline": o["airline"],
                "origin": o["origin"], "destination": o["destination"],
                "depart_date": o["depart_date"], "passengers": o["passengers"],
                "cabin": o["cabin"], "amount": o["amount"], "currency": o["currency"],
                "departing_at": o.get("departing_at"), "arriving_at": o.get("arriving_at"),
                "duration": o.get("duration"),
            },
        ))
    return candidates, suggestion
