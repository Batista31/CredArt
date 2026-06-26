"""Provider registry — which providers can fulfil a candidate, and dispatch.

Every candidate gets the always-available `demo` option. TRAVEL candidates also
get the live providers (hotels + Duffel flight). The executor calls
`get_provider(provider_id)` to dispatch the actual booking.
"""

from __future__ import annotations

from .base import RedemptionProvider
from .demo_provider import DemoProvider
from .duffel_provider import DuffelProvider
from .tango_provider import TangoProvider
from .website_hotel_provider import hotel_providers

# Instantiate once. Availability is read live from env at construction.
_DEMO = DemoProvider()
_DUFFEL = DuffelProvider()
_TANGO = TangoProvider()
_HOTELS = hotel_providers()

_ALL: dict[str, RedemptionProvider] = {p.provider_id: p for p in [_DEMO, _DUFFEL, _TANGO, *_HOTELS]}

_VOUCHER_CATEGORIES = {"SHOPPING", "ENTERTAINMENT", "DINING"}


def get_provider(provider_id: str) -> RedemptionProvider | None:
    return _ALL.get(provider_id)


def _live_for(candidate: dict) -> list[RedemptionProvider]:
    category = (candidate.get("category") or "").upper()
    if category == "TRAVEL":
        return [*_HOTELS, _DUFFEL]
    if category in _VOUCHER_CATEGORIES:
        return [_TANGO]
    return []


def fulfillment_options_for(candidate: dict) -> list[dict]:
    """Return FulfillmentOption-shaped dicts: live providers first, demo always last."""
    options: list[dict] = []
    for p in _live_for(candidate):
        options.append({
            "provider_id": p.provider_id,
            "label": p.label,
            "mode": p.mode,
            "currency": p.currency,
            "available": p.is_available(),
            "note": p.unavailable_note(),
        })
    options.append({
        "provider_id": _DEMO.provider_id,
        "label": _DEMO.label,
        "mode": _DEMO.mode,
        "currency": _DEMO.currency,
        "available": True,
        "note": None,
    })
    return options
