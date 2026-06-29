"""Hotel options service — bookable stays via CredArt's own storefront partners.

Duffel Stays is gated on the test account, so hotels come from our storefront
partners (a real HTTP booking target on :8002). Nightly rates are the partners'
published rate card (Layer-1 catalogue data — not invented by the LLM); points are
a deterministic function of rate × nights and the card's redemption value.
"""

from __future__ import annotations

import math
import os
import re
import uuid

from api.schemas import Candidate

# Partner storefront hotels + their published nightly rate (₹). Matches the two
# providers registered in redemption/website_hotel_provider.py.
_HOTELS = [
    {"provider_id": "hotel_indraprastha", "name": "Hotel Indraprastha", "stars": 4, "rate": 6500,
     "blurb": "Central location · breakfast included"},
    {"provider_id": "hotel_country_inn", "name": "Hotel Country Inn", "stars": 3, "rate": 4200,
     "blurb": "Pool · family rooms · great value"},
]

CARD_HOTEL_POINT_VALUE = {
    "hdfc_infinia": 1.0,
    "hdfc_regalia_gold": 0.5,
    "hdfc_millennia": 0.3,
}
_DEFAULT_POINT_VALUE = 0.5


def _nights(slots: dict) -> int:
    for k in ("nights", "num_nights"):
        v = slots.get(k)
        if isinstance(v, int):
            return max(1, v)
        if isinstance(v, str) and v.strip().isdigit():
            return max(1, int(v.strip()))
    text = " ".join(str(slots.get(k, "")) for k in ("nights", "check_in_window", "departure_window")).lower()
    m = re.search(r"(\d+)\s*night", text)
    return max(1, int(m.group(1))) if m else 2


def _guests(slots: dict) -> int:
    for k in ("guests", "passengers", "number_of_people"):
        v = slots.get(k)
        if isinstance(v, int):
            return max(1, v)
        if isinstance(v, str) and v.strip().isdigit():
            return max(1, int(v.strip()))
    return 2


def _best_card(cards: list[dict]) -> dict | None:
    if not cards:
        return None
    return max(cards, key=lambda c: CARD_HOTEL_POINT_VALUE.get(c["card_id"], _DEFAULT_POINT_VALUE))


def _provider_available(provider_id: str) -> bool:
    return bool(os.getenv(f"PROVIDER_{provider_id.upper()}_BOOK_URL", ""))


def search_hotel_candidates(slots: dict, cards: list[dict]) -> list[Candidate]:
    """Storefront hotels as bookable Candidates priced in points. [] if no card."""
    card = _best_card(cards)
    if card is None:
        return []
    point_value = CARD_HOTEL_POINT_VALUE.get(card["card_id"], _DEFAULT_POINT_VALUE)
    balance = card.get("current_points") or 0
    nights = _nights(slots)
    guests = _guests(slots)
    where = slots.get("destination") or slots.get("dest") or "your destination"

    out: list[Candidate] = []
    for i, h in enumerate(_HOTELS):
        total_inr = h["rate"] * nights
        points_cost = int(math.ceil(total_inr / point_value))
        out.append(Candidate(
            kind="hotel",
            candidate_id=uuid.uuid4().hex[:8],
            card_id=card["card_id"],
            card_name=card["card_name"],
            label=f"{h['name']} · {where}",
            category="TRAVEL",
            points_cost=points_cost,
            affordable=balance >= points_cost,
            effective_value_inr=float(total_inr),
            best_use_case=f"{h['stars']}★ · {h['blurb']} · {nights} night{'s' if nights > 1 else ''}, {guests} guest{'s' if guests > 1 else ''} · ~₹{total_inr:,}",
            source_url="https://www.hdfcbank.com/personal/pay/cards/smartbuy",
            note=None if balance >= points_cost else f"needs {points_cost - balance:,} more points",
            rank=i + 1,
            fulfillment_options=[
                {"provider_id": h["provider_id"], "label": f"Book {h['name']} (live)", "path": "assisted",
                 "mode": "live", "currency": "points", "available": _provider_available(h["provider_id"]),
                 "note": None if _provider_available(h["provider_id"]) else "storefront URL not configured"},
                {"provider_id": "demo", "label": "Demo (demo credits)", "path": "demo",
                 "mode": "demo", "currency": "demo_points", "available": True, "note": None},
            ],
            metadata={"hotel": h["name"], "nights": nights, "guests": guests, "rate_inr": h["rate"]},
        ))
    return out
