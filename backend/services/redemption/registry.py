"""Provider registry — maps a candidate to its fulfilment paths, and dispatches.

Path assignment mirrors the UI (mode.jsx `crFulfillFor`): every candidate gets
the always-available `demo` path plus ONE live path (api | assisted | bank),
chosen by kind + label keywords. The executor calls `get_provider(provider_id)`
to run the booking.
"""

from __future__ import annotations

import re

from .assisted_checkout_provider import AssistedCheckoutProvider
from .bank_internal_provider import BankInternalProvider
from .base import RedemptionProvider
from .demo_provider import DemoProvider
from .duffel_provider import DuffelProvider
from .voucher_provider import VoucherProvider
from .website_hotel_provider import hotel_providers

# Instantiate once.
_DEMO = DemoProvider()
_DUFFEL = DuffelProvider()
_VOUCHER = VoucherProvider()
_ASSISTED = AssistedCheckoutProvider()
_BANK = BankInternalProvider()
_HOTELS = hotel_providers()

_ALL: dict[str, RedemptionProvider] = {
    p.provider_id: p for p in [_DEMO, _DUFFEL, _VOUCHER, _ASSISTED, _BANK, *_HOTELS]
}

_HOTEL_RE = re.compile(r"stay|hotel|resort|palace|houseboat|villa|span|novotel|rambagh|holiday|marriott")
_BANK_RE = re.compile(r"dining credit|thali|sadya|himachali|coastal|lounge|milestone|activation")
_FLIGHT_RE = re.compile(r"flight|train|indigo|vistara|air india|express|rajdhani|shatabdi|tejas|queen|mail|kranti")
_VOUCHER_RE = re.compile(r"voucher|gift|card|swiggy|zomato|amazon|flipkart|myntra|starbucks|dineout|bookmyshow|pvr|credit|membership")


def get_provider(provider_id: str) -> RedemptionProvider | None:
    return _ALL.get(provider_id)


def _live_provider_for(candidate: dict) -> RedemptionProvider:
    """Pick the single live provider for a candidate (UI crFulfillFor parity)."""
    if candidate.get("kind") == "transfer":
        return _BANK  # points transfer is a bank-internal action
    name = ((candidate.get("label") or "") + " " + (candidate.get("category") or "")).lower()
    # Explicit voucher/gift wording wins over merchant-name matches. For example,
    # "Taj Dining Voucher" is an API voucher, not a hotel checkout.
    if _VOUCHER_RE.search(name):
        return _VOUCHER
    if _HOTEL_RE.search(name):
        return _ASSISTED
    if _BANK_RE.search(name):
        return _BANK
    if _FLIGHT_RE.search(name):
        return _DUFFEL
    return _VOUCHER  # sensible default (api voucher)


def _opt(p: RedemptionProvider) -> dict:
    return {
        "provider_id": p.provider_id, "label": p.label, "path": p.path,
        "mode": p.mode, "currency": p.currency,
        "available": p.is_available(), "note": p.unavailable_note(),
    }


def fulfillment_options_for(candidate: dict) -> list[dict]:
    """Live path(s) first, demo always present and last.

    Hotels surface BOTH named website partners (real POST targets) so the user
    picks "Indraprastha (website) / Country Inn (website) / Demo". Everything else
    gets its single live path + demo.
    """
    cat = (candidate.get("category") or "").upper()
    name = ((candidate.get("label") or "") + " " + cat).lower()
    is_hotel = (
        candidate.get("kind") != "transfer"
        and cat in ("", "TRAVEL")
        and not _VOUCHER_RE.search(name)
        and _HOTEL_RE.search(name)
    )
    if is_hotel:
        return [_opt(p) for p in _HOTELS] + [_opt(_DEMO)]
    return [_opt(_live_provider_for(candidate)), _opt(_DEMO)]
