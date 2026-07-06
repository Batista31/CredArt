"""Duffel flight provider — genuinely live in test mode.

Two surfaces:
  search(...)  — real /air/offer_requests query by route/date/pax (used to DISPLAY options).
  book(...)    — re-searches the candidate's route and creates a real /air/orders test order.

Offers expire (~20 min), so book() re-searches at redeem time and books a matching offer
rather than relying on a stale offer id stored on the candidate.
"""

from __future__ import annotations

import os
from datetime import date, timedelta

from .base import BookingResult, RedemptionProvider

_BASE = "https://api.duffel.com"
_HEADERS_VERSION = "v2"


class DuffelProvider(RedemptionProvider):
    provider_id = "duffel_flight"
    label = "Book flight (Duffel · live test)"
    path = "api"
    mode = "live"
    currency = "points"
    # Production flight bookings go through a bank OTP step-up before any points move
    # (demo mode uses the demo provider and stays instant).
    requires_otp = True

    def __init__(self) -> None:
        self.token = os.getenv("DUFFEL_API_KEY", "")

    def is_available(self) -> bool:
        return bool(self.token)

    def unavailable_note(self) -> str | None:
        return None if self.token else "set DUFFEL_API_KEY (duffel_test_...) to enable"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Duffel-Version": _HEADERS_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @staticmethod
    def _default_date() -> str:
        return (date.today() + timedelta(days=30)).isoformat()

    @staticmethod
    def _slice_summary(offer: dict) -> dict:
        sl = offer["slices"][0]
        segs = sl.get("segments", [])
        dep = segs[0]["departing_at"] if segs else None
        arr = segs[-1]["arriving_at"] if segs else None
        return {
            "duration": sl.get("duration"),
            "stops": max(0, len(segs) - 1),
            "departing_at": dep,
            "arriving_at": arr,
        }

    async def search(
        self,
        origin: str,
        destination: str,
        depart_date: str | None = None,
        passengers: int = 1,
        cabin: str = "economy",
        limit: int = 4,
    ) -> list[dict]:
        """Return up to `limit` normalized real offers, cheapest first. [] on any failure."""
        if not self.token:
            return []
        try:
            import httpx
        except Exception:
            return []
        dep = depart_date or self._default_date()
        pax = [{"type": "adult"} for _ in range(max(1, int(passengers or 1)))]
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                r = await client.post(
                    f"{_BASE}/air/offer_requests?return_offers=true",
                    headers=self._headers(),
                    json={"data": {
                        "slices": [{"origin": origin, "destination": destination, "departure_date": dep}],
                        "passengers": pax,
                        "cabin_class": cabin,
                    }},
                )
                r.raise_for_status()
                offers = (r.json().get("data") or {}).get("offers") or []
        except Exception as exc:  # noqa: BLE001
            print(f"[duffel] search failed ({exc})")
            return []

        offers.sort(key=lambda o: float(o.get("total_amount") or 1e9))
        out: list[dict] = []
        for o in offers[:limit]:
            s = self._slice_summary(o)
            out.append({
                "offer_id": o["id"],
                "airline": o["owner"]["name"],
                "airline_iata": o["owner"].get("iata_code"),
                "amount": float(o["total_amount"]),
                "currency": o["total_currency"],
                "origin": origin,
                "destination": destination,
                "depart_date": dep,
                "cabin": cabin,
                "passengers": max(1, int(passengers or 1)),
                **s,
            })
        return out

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        if not self.token:
            return BookingResult(ok=False, error="DUFFEL_API_KEY not configured")
        try:
            import httpx
        except Exception:
            return BookingResult(ok=False, error="httpx not installed")

        meta = candidate.get("metadata") or {}
        origin = candidate.get("origin") or meta.get("origin") or "BOM"
        destination = candidate.get("destination") or meta.get("destination") or "DEL"
        dep = candidate.get("depart_date") or meta.get("depart_date") or self._default_date()
        passengers = int(meta.get("passengers") or 1)
        cabin = meta.get("cabin") or "economy"
        # round trip → book BOTH legs as one order (outbound + return slices)
        ret = meta.get("return_date") if meta.get("trip_type") == "round_trip" else None
        slices = [{"origin": origin, "destination": destination, "departure_date": dep}]
        if ret:
            slices.append({"origin": destination, "destination": origin, "departure_date": ret})
        steps: list[dict] = []
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                # re-search the route (offers expire) and take a current offer
                r = await client.post(
                    f"{_BASE}/air/offer_requests?return_offers=true",
                    headers=self._headers(),
                    json={"data": {
                        "slices": slices,
                        "passengers": [{"type": "adult"} for _ in range(passengers)],
                        "cabin_class": cabin,
                    }},
                )
                r.raise_for_status()
                offers = (r.json().get("data") or {}).get("offers") or []
                if not offers:
                    return BookingResult(ok=False, error="no live offers for this route right now",
                                         steps=[{"label": "Searching flights", "status": "failed", "detail": f"{origin}->{destination}"}])
                # Try the shown airline first, then the cheapest offer of EACH other
                # airline. Sandbox/GDS offers often fail at order time per-carrier
                # (e.g. every Air India offer returns price_changed), so retrying six
                # same-carrier offers goes nowhere — diversifying across airlines is
                # how a real booking agent handles it.
                want = meta.get("airline")
                cheapest_first = sorted(offers, key=lambda o: float(o.get("total_amount") or 1e9))
                by_owner: dict[str, list[dict]] = {}
                for o in cheapest_first:
                    by_owner.setdefault(o["owner"]["name"], []).append(o)
                ordered = []
                if want in by_owner:
                    ordered.append(by_owner[want][0])
                ordered += [ol[0] for owner, ol in by_owner.items() if owner != want]
                ordered += [ol[1] for ol in by_owner.values() if len(ol) > 1]
                steps.append({"label": "Searching flights", "status": "done",
                              "detail": f"{ordered[0]['owner']['name']} {origin}->{destination} {ordered[0]['total_amount']} {ordered[0]['total_currency']}"})

                base_given = traveler.get("given_name", "Riya")
                base_family = traveler.get("family_name", "Sharma")
                _co = ["", "Vivaan", "Anaya", "Aarav", "Diya", "Kabir"]
                last_err = "no bookable offer"
                hard_stop = False
                for offer in ordered[:6]:
                    # distinct names — airlines reject duplicate passenger names
                    passengers_payload = []
                    for idx, p in enumerate(offer["passengers"]):
                        given = base_given if idx == 0 else (_co[idx] if idx < len(_co) else f"Traveller{idx}")
                        passengers_payload.append({
                            "id": p["id"], "title": "mrs" if idx == 0 else "mr",
                            "gender": "f" if idx == 0 else "m",
                            "given_name": given, "family_name": base_family,
                            "born_on": "1990-01-01",
                            "email": traveler.get("email", "riya@example.com"),
                            "phone_number": traveler.get("phone", "+919000000000"),
                        })
                    pay_amount = offer["total_amount"]
                    pay_currency = offer["total_currency"]
                    for attempt in range(3):  # same-offer retries for transient errors
                        resp = await client.post(
                            f"{_BASE}/air/orders", headers=self._headers(),
                            json={"data": {
                                "type": "instant",
                                "selected_offers": [offer["id"]],
                                "passengers": passengers_payload,
                                "payments": [{"type": "balance", "amount": pay_amount, "currency": pay_currency}],
                            }},
                        )
                        if resp.status_code in (200, 201):
                            order = resp.json()["data"]
                            ref = order.get("booking_reference") or order.get("id")
                            steps.append({"label": "Booking flight", "status": "done", "detail": f"{offer['owner']['name']} · {ref}"})
                            steps.append({"label": "Sending confirmation", "status": "done", "detail": ref})
                            return BookingResult(ok=True, confirmation_reference=ref, steps=steps,
                                                 raw={"order_id": order.get("id")})
                        try:
                            errs = resp.json().get("errors", [])
                            last_err = (errs[0].get("title") if errs else f"HTTP {resp.status_code}")
                        except Exception:
                            errs = []
                            last_err = f"HTTP {resp.status_code}"
                        codes = {e.get("code") for e in (errs or [])}
                        # sandbox blips (503 service_unavailable) → brief backoff, same offer
                        if resp.status_code >= 500 or "service_unavailable" in codes:
                            import asyncio
                            await asyncio.sleep(2)
                            continue
                        # airline repriced the offer → fetch its current price, retry
                        # once; if it still won't book, move on to the next airline
                        if "price_changed" in codes or "price" in (last_err or "").lower():
                            if attempt == 0:
                                r2 = await client.get(f"{_BASE}/air/offers/{offer['id']}", headers=self._headers())
                                fresh = (r2.json().get("data") or {}) if r2.status_code == 200 else {}
                                if fresh.get("total_amount"):
                                    pay_amount = fresh["total_amount"]
                                    pay_currency = fresh.get("total_currency") or pay_currency
                                    continue
                            break
                        # offer gone → move on to the next offer
                        if codes & {"offer_no_longer_available", "offer_request_already_actioned",
                                    "offer_request_already_booked"}:
                            break
                        hard_stop = True  # validation/auth error — retrying won't help
                        break
                    if hard_stop:
                        break
                steps.append({"label": "Booking flight", "status": "failed", "detail": last_err})
                return BookingResult(ok=False, error=last_err, steps=steps)
        except Exception as exc:  # noqa: BLE001
            steps.append({"label": "Booking flight", "status": "failed", "detail": str(exc)[:120]})
            return BookingResult(ok=False, error=str(exc)[:200], steps=steps)
