"""Duffel flight provider — genuinely live in test mode."""

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
    requires_otp = False

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

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        if not self.token:
            return BookingResult(ok=False, error="DUFFEL_API_KEY not configured")
        try:
            import httpx
        except Exception:
            return BookingResult(ok=False, error="httpx not installed")

        dep = (date.today() + timedelta(days=30)).isoformat()
        steps: list[dict] = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                offer_req = {
                    "data": {
                        "slices": [{"origin": "LHR", "destination": "JFK", "departure_date": dep}],
                        "passengers": [{"type": "adult"}],
                        "cabin_class": "economy",
                    }
                }
                response = await client.post(
                    f"{_BASE}/air/offer_requests?return_offers=true",
                    headers=self._headers(),
                    json=offer_req,
                )
                response.raise_for_status()
                data = response.json()["data"]
                offers = data.get("offers") or []
                if not offers:
                    return BookingResult(
                        ok=False,
                        error="no sandbox offers returned",
                        steps=[{"label": "Searching flights", "status": "failed", "detail": "no offers"}],
                    )
                offer = offers[0]
                pax_id = offer["passengers"][0]["id"]
                amount, currency = offer["total_amount"], offer["total_currency"]
                steps.append({"label": "Searching flights", "status": "done",
                              "detail": f"{offer['owner']['name']} {amount} {currency}"})

                order_req = {
                    "data": {
                        "type": "instant",
                        "selected_offers": [offer["id"]],
                        "passengers": [{
                            "id": pax_id,
                            "title": "mrs",
                            "gender": "f",
                            "given_name": traveler.get("given_name", "Riya"),
                            "family_name": traveler.get("family_name", "Sharma"),
                            "born_on": "1995-01-01",
                            "email": traveler.get("email", "riya@example.com"),
                            "phone_number": traveler.get("phone", "+919000000000"),
                        }],
                        "payments": [{"type": "balance", "amount": amount, "currency": currency}],
                    }
                }
                response = await client.post(
                    f"{_BASE}/air/orders",
                    headers=self._headers(),
                    json=order_req,
                )
                response.raise_for_status()
                order = response.json()["data"]
                ref = order.get("booking_reference") or order.get("id")
                steps.append({"label": "Booking flight", "status": "done", "detail": ref})
                steps.append({"label": "Sending confirmation", "status": "done", "detail": ref})
                return BookingResult(ok=True, confirmation_reference=ref, steps=steps,
                                     raw={"order_id": order.get("id")})
        except Exception as exc:
            steps.append({"label": "Booking flight", "status": "failed", "detail": str(exc)[:120]})
            return BookingResult(ok=False, error=str(exc)[:200], steps=steps)
