"""CredArt — Travel Rewards concierge (flight search & redemption).

A self-contained router mounted at ``/travel``, implementing a classic bank
rewards-portal flow — search -> results -> offer review -> demo redemption —
as a dedicated, form-based page. This is the non-conversational counterpart to
the chat-driven flight flow in ``dialogue_manager.py`` / ``services/flight_service.py``
(built for a standalone "Travel" page with a search form, a sortable results
grid, and a review + confirm step, rather than a chat transcript).

Reuses, never duplicates:
  - ``services.redemption.duffel_provider.DuffelProvider`` for real Duffel
    test-mode flight search (falls back to deterministic mock offers when
    ``DUFFEL_API_KEY`` is unset or Duffel returns nothing, so the demo always
    works).
  - ``services.flight_service``'s per-card points-per-rupee conversion table
    (``CARD_FLIGHT_POINT_VALUE``) and currency rates, so a flight priced here
    and one priced in the chat flow agree on the same numbers.
  - ``services.redemption.executor.start_redemption`` + the ``demo`` provider
    for the actual booking simulation — this decrements the REAL
    ``demo_points`` bucket on the user's best card via the same atomic,
    replayable path every other demo redemption in the app uses
    (``db/reset_demo.sql`` tops it back up).

Anti-hallucination: every points/₹ figure on a result card is computed here in
Layer 1 from a real Duffel amount (or the deterministic mock generator). The
frontend's AI panel only narrates numbers already present on the selected
offer — it never invents one.

This page always represents Riya (the app's travel-leaning persona), the same
one-demo-identity-per-vertical pattern as ``dining.py`` (Anushka) and
``entertainment.py`` (Saket) — independent of whichever bank persona is active
elsewhere in the app.

Endpoints:
  GET  /travel/airports                    — airport/city search-as-you-type
  POST /travel/flights/search               — priced, sorted, badge-annotated results
  GET  /travel/flights/offers/{offer_id}    — full detail for one cached offer
  POST /travel/redemption/preview           — points/cash breakdown, no booking
  POST /travel/redemption/demo-confirm      — simulated booking (demo_points only)
  GET  /travel/health                       — liveness + config summary
"""

from __future__ import annotations

import math
import random
import time
import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import user_service
from services.flight_service import (
    CARD_FLIGHT_POINT_VALUE,
    _CURRENCY_INR,
    _DEFAULT_POINT_VALUE,
    _best_card as _pick_best_card,
    _iata as _resolve_iata,
)
from services.redemption import registry
from services.redemption.duffel_provider import DuffelProvider
from services.redemption.executor import start_redemption

from .intent import CITY_TO_IATA

router = APIRouter(prefix="/travel", tags=["travel"])

_duffel = DuffelProvider()

# This page is always Riya's — the app's travel-leaning demo persona.
RIYA_ID = "00000000-0000-0000-0000-000000000002"

TAX_FEE_RATE = 0.08          # demo taxes/fees carve-out of the cash price
POINTS_CASH_SPLIT = 0.5      # "points + cash" tier: half the value in cash

_IATA_TO_CITY = {code: city.title() for city, code in CITY_TO_IATA.items()}


# ---------------------------------------------------------------------------
# Airports — search-as-you-type over the same city/IATA map the chat flow uses.
# ---------------------------------------------------------------------------

@router.get("/airports")
async def travel_airports(q: str = "") -> list[dict[str, str]]:
    query = (q or "").strip().lower()
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for city, code in CITY_TO_IATA.items():
        if code in seen:
            continue
        if query and query not in city and query not in code.lower():
            continue
        seen.add(code)
        label = city.title()
        out.append({"code": code, "city": label, "label": f"{label} ({code})"})
    out.sort(key=lambda a: a["city"])
    return out[:20]


# ---------------------------------------------------------------------------
# Mock flight generator — deterministic per (route, date, cabin) so a demo is
# replayable, used ONLY when Duffel is unconfigured or returns no offers.
# ---------------------------------------------------------------------------

_MOCK_AIRLINES = [
    ("IndiGo", "6E"), ("Air India", "AI"), ("Vistara", "UK"), ("SpiceJet", "SG"),
    ("Emirates", "EK"), ("Qatar Airways", "QR"), ("Singapore Airlines", "SQ"),
    ("British Airways", "BA"),
]
_CABIN_MULT = {"economy": 1.0, "premium_economy": 1.6, "business": 3.2, "first": 5.0}


def _mock_offers(origin: str, destination: str, depart_date: str, passengers: int,
                 cabin: str, limit: int = 5) -> list[dict[str, Any]]:
    rng = random.Random(f"{origin}|{destination}|{depart_date}|{cabin}|{passengers}")
    cabin_mult = _CABIN_MULT.get(cabin, 1.0)
    offers: list[dict[str, Any]] = []
    for _ in range(limit):
        airline, code = rng.choice(_MOCK_AIRLINES)
        stops = rng.choices([0, 1, 2], weights=[5, 3, 1])[0]
        dep_hour = rng.randint(4, 23)
        dep_min = rng.choice([0, 15, 30, 45])
        duration_minutes = rng.randint(75, 210) + stops * rng.randint(45, 100)
        per_pax_inr = rng.randint(3200, 13800) * cabin_mult
        amount = round(per_pax_inr * max(1, passengers), -1)
        departing_at = f"{depart_date}T{dep_hour:02d}:{dep_min:02d}:00"
        try:
            dep_dt = datetime.fromisoformat(departing_at)
            arriving_at = (dep_dt + _minutes(duration_minutes)).isoformat()
        except ValueError:
            arriving_at = departing_at
        offers.append({
            "offer_id": f"mock-{uuid.uuid4().hex[:10]}",
            "airline": airline, "airline_iata": code,
            "amount": amount, "origin": origin, "destination": destination,
            "depart_date": depart_date, "departing_at": departing_at, "arriving_at": arriving_at,
            "duration_minutes": duration_minutes, "stops": stops, "cabin": cabin,
            "passengers": max(1, passengers),
        })
    offers.sort(key=lambda o: o["amount"])
    return offers


def _minutes(n: int):
    from datetime import timedelta
    return timedelta(minutes=n)


def _minutes_between(dep: str, arr: str) -> int:
    d = datetime.fromisoformat(dep.replace("Z", "+00:00"))
    a = datetime.fromisoformat(arr.replace("Z", "+00:00"))
    return max(1, int((a - d).total_seconds() // 60))


async def _search_leg(origin: str, destination: str, date_str: str, passengers: int,
                      cabin: str, limit: int = 5) -> tuple[list[dict[str, Any]], str]:
    """One-directional leg search: real Duffel offers normalized to INR, or the
    deterministic mock generator when Duffel is unavailable/empty."""
    legs: list[dict[str, Any]] = []
    if _duffel.is_available():
        raw = await _duffel.search(origin, destination, date_str, passengers=passengers,
                                   cabin=cabin, limit=limit)
        for o in raw:
            rate = _CURRENCY_INR.get(o["currency"], 1.0)
            dep, arr = o.get("departing_at"), o.get("arriving_at")
            duration_minutes = _minutes_between(dep, arr) if dep and arr else 180
            legs.append({
                "offer_id": o["offer_id"], "airline": o["airline"], "airline_iata": o.get("airline_iata"),
                "amount": round(o["amount"] * rate, 2), "origin": o["origin"], "destination": o["destination"],
                "depart_date": o["depart_date"], "departing_at": dep, "arriving_at": arr,
                "duration_minutes": duration_minutes, "stops": o["stops"], "cabin": o["cabin"],
                "passengers": o["passengers"],
            })
    if legs:
        return legs, "duffel"
    return _mock_offers(origin, destination, date_str, passengers, cabin, limit), "mock"


async def _search_offers(req: "TravelSearchRequest") -> tuple[list[dict[str, Any]], str]:
    out_legs, out_source = await _search_leg(req.origin, req.destination, req.depart_date,
                                             req.passengers, req.cabin_class)
    if req.trip_type == "one_way":
        return out_legs, out_source

    in_legs, in_source = await _search_leg(req.destination, req.origin, req.return_date,
                                           req.passengers, req.cabin_class)
    n = min(len(out_legs), len(in_legs))
    combined: list[dict[str, Any]] = []
    for i in range(n):
        o, r = out_legs[i], in_legs[i]
        combined.append({
            **o,
            "amount": round(o["amount"] + r["amount"], 2),
            "duration_minutes": o["duration_minutes"] + r["duration_minutes"],
            "return_departing_at": r["departing_at"], "return_arriving_at": r["arriving_at"],
            "return_stops": r["stops"],
        })
    source = out_source if out_source == in_source else "mixed"
    return combined, source


# ---------------------------------------------------------------------------
# Pricing — the ONLY place a ₹/points number is computed. Reuses the same
# card-based ₹-per-point conversion as the chat flight flow.
# ---------------------------------------------------------------------------

def _price(leg: dict[str, Any], point_value: float) -> dict[str, Any]:
    cash_price = leg["amount"]
    taxes_fees = round(cash_price * TAX_FEE_RATE, 2)
    base_fare = round(cash_price - taxes_fees, 2)
    points_required = int(math.ceil(cash_price / point_value))
    value_per_point = round(cash_price / points_required, 4) if points_required else 0.0
    half_value = cash_price * POINTS_CASH_SPLIT
    pc_points = int(math.ceil(half_value / point_value))
    pc_cash = round(cash_price - half_value, 2)
    return {
        "cash_price_inr": cash_price, "base_fare_inr": base_fare, "taxes_fees_inr": taxes_fees,
        "points_required": points_required, "value_per_point_inr": value_per_point,
        "points_plus_cash": {"points": pc_points, "cash_inr": pc_cash},
    }


_SORTERS = {
    "recommended": lambda o: -o["recommended_score"],
    "lowest_points": lambda o: o["points_required"],
    "shortest_duration": lambda o: o["duration_minutes"],
    "best_value": lambda o: -o["value_per_point_inr"],
}


def _norm(x: float, lo: float, hi: float, invert: bool = False) -> float:
    if hi == lo:
        return 60.0
    n = 10 + 90 * (x - lo) / (hi - lo)
    return 100 - n + 10 if invert else n


def _attach_badges(priced: list[dict[str, Any]]) -> None:
    """Recommendation badges + a lightweight blended score (value + points +
    duration) — the travel-page analogue of the app's 5-dimension scorer,
    scoped to what a flight result card actually shows."""
    if not priced:
        return
    pts = [o["points_required"] for o in priced]
    durs = [o["duration_minutes"] for o in priced]
    vals = [o["value_per_point_inr"] for o in priced]
    p_lo, p_hi, d_lo, d_hi, v_lo, v_hi = min(pts), max(pts), min(durs), max(durs), min(vals), max(vals)
    for o in priced:
        s_pts = _norm(o["points_required"], p_lo, p_hi, invert=True)
        s_dur = _norm(o["duration_minutes"], d_lo, d_hi, invert=True)
        s_val = _norm(o["value_per_point_inr"], v_lo, v_hi)
        o["recommended_score"] = round(0.4 * s_val + 0.35 * s_pts + 0.25 * s_dur, 1)
        o["badges"] = []

    min(priced, key=lambda o: o["points_required"])["badges"].append("Lowest Points")
    min(priced, key=lambda o: o["duration_minutes"])["badges"].append("Fastest")
    max(priced, key=lambda o: o["value_per_point_inr"])["badges"].append("Best Value")
    top = max(priced, key=lambda o: o["recommended_score"])
    if "Recommended" not in top["badges"]:
        top["badges"].append("Recommended")


# ---------------------------------------------------------------------------
# In-memory offer cache (isolated from the bank/dining/entertainment stores).
# Search results are ephemeral, like Duffel's own ~20-minute offer expiry.
# ---------------------------------------------------------------------------

_OFFER_CACHE: dict[str, dict[str, Any]] = {}
_OFFER_TTL = 30 * 60


def _cache_offer(offer: dict[str, Any], available_points: int, card_id: str, card_name: str) -> None:
    now = time.time()
    for oid, e in list(_OFFER_CACHE.items()):
        if e["expires_at"] < now:
            _OFFER_CACHE.pop(oid, None)
    _OFFER_CACHE[offer["offer_id"]] = {
        "offer": offer, "available_points": available_points, "card_id": card_id,
        "card_name": card_name, "expires_at": now + _OFFER_TTL,
    }


def _get_cached_offer(offer_id: str) -> dict[str, Any] | None:
    e = _OFFER_CACHE.get(offer_id)
    if e is None or e["expires_at"] < time.time():
        return None
    return e


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TravelSearchRequest(BaseModel):
    trip_type: Literal["round_trip", "one_way"] = "round_trip"
    origin: str
    destination: str
    depart_date: str
    return_date: Optional[str] = None
    passengers: int = 1
    cabin_class: Literal["economy", "premium_economy", "business", "first"] = "economy"
    sort: Literal["recommended", "lowest_points", "shortest_duration", "best_value"] = "recommended"


class FlightOffer(BaseModel):
    offer_id: str
    trip_type: str
    airline: str
    airline_iata: Optional[str] = None
    origin: str
    destination: str
    departing_at: Optional[str] = None
    arriving_at: Optional[str] = None
    return_departing_at: Optional[str] = None
    return_arriving_at: Optional[str] = None
    stops: int
    return_stops: Optional[int] = None
    duration_minutes: int
    cabin_class: str
    passengers: int
    cash_price_inr: float
    base_fare_inr: float
    taxes_fees_inr: float
    points_required: int
    value_per_point_inr: float
    points_plus_cash: dict[str, float]
    affordable: bool
    badges: list[str] = Field(default_factory=list)
    recommended_score: float


class TravelSearchResponse(BaseModel):
    search_id: str
    source: Literal["duffel", "mock", "mixed"]
    available_points: int
    point_value_inr: float
    card_name: str
    trip_type: str
    origin: str
    destination: str
    origin_city: Optional[str] = None
    destination_city: Optional[str] = None
    results: list[FlightOffer]


class RedemptionPreviewRequest(BaseModel):
    offer_id: str
    payment_mode: Literal["points", "points_plus_cash"] = "points"


class RedemptionConfirmRequest(BaseModel):
    offer_id: str
    payment_mode: Literal["points", "points_plus_cash"] = "points"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

async def _riya_wallet() -> dict[str, Any]:
    """Real DB read: Riya's best card for flight redemptions + its live
    demo_points balance. Shared by /flights/search and /health so the frontend
    never has to re-derive "which card is best" itself."""
    cards = await user_service.get_user_cards(RIYA_ID)
    if not cards:
        raise HTTPException(status_code=500, detail="demo user has no active cards configured")
    card = _pick_best_card(cards)
    point_value = CARD_FLIGHT_POINT_VALUE.get(card["card_id"], _DEFAULT_POINT_VALUE)
    return {"card_id": card["card_id"], "card_name": card["card_name"],
            "available_points": int(card["demo_points"]), "point_value_inr": point_value}


@router.post("/flights/search", response_model=TravelSearchResponse)
async def travel_flights_search(req: TravelSearchRequest) -> TravelSearchResponse:
    origin = _resolve_iata(req.origin)
    destination = _resolve_iata(req.destination)
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="unrecognized origin/destination — pick an airport from the list")
    if origin == destination:
        raise HTTPException(status_code=400, detail="origin and destination can't be the same")
    if req.trip_type == "round_trip" and not req.return_date:
        raise HTTPException(status_code=400, detail="return_date is required for a round trip search")

    wallet = await _riya_wallet()
    card_id, point_value, available_points = wallet["card_id"], wallet["point_value_inr"], wallet["available_points"]
    card = {"card_id": card_id, "card_name": wallet["card_name"]}

    legs, source = await _search_offers(req)

    priced: list[dict[str, Any]] = []
    for leg in legs:
        p = _price(leg, point_value)
        offer = {**leg, **p, "trip_type": req.trip_type, "cabin_class": req.cabin_class,
                 "affordable": available_points >= p["points_required"]}
        priced.append(offer)
    _attach_badges(priced)
    priced.sort(key=_SORTERS.get(req.sort, _SORTERS["recommended"]))
    for offer in priced:
        _cache_offer(offer, available_points, card["card_id"], card["card_name"])

    return TravelSearchResponse(
        search_id=uuid.uuid4().hex, source=source, available_points=available_points,
        point_value_inr=point_value, card_name=card["card_name"], trip_type=req.trip_type,
        origin=origin, destination=destination,
        origin_city=_IATA_TO_CITY.get(origin), destination_city=_IATA_TO_CITY.get(destination),
        results=priced,
    )


@router.get("/flights/offers/{offer_id}")
async def travel_offer_detail(offer_id: str) -> dict[str, Any]:
    entry = _get_cached_offer(offer_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="offer not found or expired — please search again")
    return {**entry["offer"], "available_points": entry["available_points"], "card_name": entry["card_name"]}


@router.post("/redemption/preview")
async def redemption_preview(req: RedemptionPreviewRequest) -> dict[str, Any]:
    entry = _get_cached_offer(req.offer_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="offer not found or expired — please search again")
    offer = entry["offer"]
    available = entry["available_points"]
    if req.payment_mode == "points_plus_cash":
        points_used = offer["points_plus_cash"]["points"]
        cash_due_inr = offer["points_plus_cash"]["cash_inr"]
    else:
        points_used = offer["points_required"]
        cash_due_inr = 0.0
    return {
        "offer_id": req.offer_id, "payment_mode": req.payment_mode,
        "available_points": available, "required_points": offer["points_required"],
        "points_used": points_used, "cash_equivalent_inr": offer["cash_price_inr"],
        "taxes_fees_inr": offer["taxes_fees_inr"], "cash_due_inr": cash_due_inr,
        "remaining_points": available - points_used,
        "sufficient": available >= points_used,
    }


@router.post("/redemption/demo-confirm")
async def redemption_demo_confirm(req: RedemptionConfirmRequest) -> dict[str, Any]:
    entry = _get_cached_offer(req.offer_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="offer not found or expired — please search again")
    offer = entry["offer"]
    points_used = (offer["points_plus_cash"]["points"] if req.payment_mode == "points_plus_cash"
                   else offer["points_required"])

    candidate = {
        "kind": "flight", "card_id": entry["card_id"],
        "label": f"{offer['airline']} {offer['origin']}→{offer['destination']}",
        "category": "TRAVEL", "points_cost": points_used,
        "best_use_case": f"{offer['trip_type'].replace('_', ' ')} · {offer['passengers']} traveller(s) · simulated redemption",
    }
    provider = registry.get_provider("demo")
    result = await start_redemption(RIYA_ID, candidate, provider, {}, mode="demo")

    return {
        "status": result["status"],
        "confirmation_reference": result.get("confirmation_reference"),
        "booking_reference": result.get("confirmation_reference"),
        "points_used": result.get("points_used", 0),
        "balance_after": result.get("balance_after", entry["available_points"]),
        "cash_due_inr": (offer["points_plus_cash"]["cash_inr"] if req.payment_mode == "points_plus_cash" else 0.0),
        "payment_mode": req.payment_mode,
        "mode": "demo",
        "rollback_reason": result.get("rollback_reason"),
        "disclaimer": "This is a simulated redemption for demo purposes only — no real booking was made.",
        "offer": {
            "airline": offer["airline"], "origin": offer["origin"], "destination": offer["destination"],
            "trip_type": offer["trip_type"], "departing_at": offer.get("departing_at"),
        },
    }


@router.get("/health")
async def travel_health() -> dict[str, Any]:
    duffel_ok = _duffel.is_available()
    wallet: dict[str, Any] = {}
    try:
        wallet = await _riya_wallet()
    except HTTPException:
        pass
    return {
        "status": "ok",
        "concierge": "Travel Rewards (flights)",
        "duffel_configured": duffel_ok,
        "source_if_unconfigured": "deterministic mock offers",
        "cached_offers": len(_OFFER_CACHE),
        "demo_user_id": RIYA_ID,
        "available_points": wallet.get("available_points"),
        "card_name": wallet.get("card_name"),
        "point_value_inr": wallet.get("point_value_inr"),
    }
