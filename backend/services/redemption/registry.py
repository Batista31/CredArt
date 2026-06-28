"""Provider registry — maps a candidate to fulfilment paths and dispatch."""

from __future__ import annotations

import re

from .assisted_checkout_provider import AssistedCheckoutProvider
from .base import RedemptionProvider
from .bank_internal_provider import BankInternalProvider
from .demo_provider import DemoProvider
from .duffel_provider import DuffelProvider
from .voucher_provider import VoucherProvider
from .website_hotel_provider import hotel_providers

_DEMO = DemoProvider()
_DUFFEL = DuffelProvider()
_VOUCHER = VoucherProvider()
_ASSISTED = AssistedCheckoutProvider()
_BANK = BankInternalProvider()
_HOTELS = hotel_providers()

_ALL: dict[str, RedemptionProvider] = {
    provider.provider_id: provider
    for provider in [_DEMO, _DUFFEL, _VOUCHER, _ASSISTED, _BANK, *_HOTELS]
}

_HOTEL_RE = re.compile(r"stay|hotel|resort|palace|houseboat|villa|span|novotel|rambagh|holiday|marriott")
_BANK_RE = re.compile(r"dining credit|thali|sadya|himachali|coastal|lounge|milestone|activation")
_FLIGHT_RE = re.compile(r"flight|train|indigo|vistara|air india|express|rajdhani|shatabdi|tejas|queen|mail|kranti")
_VOUCHER_RE = re.compile(r"voucher|gift|card|swiggy|zomato|amazon|flipkart|myntra|starbucks|dineout|bookmyshow|pvr|credit|membership")


def get_provider(provider_id: str) -> RedemptionProvider | None:
    return _ALL.get(provider_id)


def _live_provider_for(candidate: dict) -> RedemptionProvider:
    if candidate.get("kind") == "transfer":
        return _BANK
    name = ((candidate.get("label") or "") + " " + (candidate.get("category") or "")).lower()
    if _VOUCHER_RE.search(name):
        return _VOUCHER
    if _HOTEL_RE.search(name):
        return _ASSISTED
    if _BANK_RE.search(name):
        return _BANK
    if _FLIGHT_RE.search(name):
        return _DUFFEL
    return _VOUCHER


def _opt(provider: RedemptionProvider) -> dict:
    return {
        "provider_id": provider.provider_id,
        "label": provider.label,
        "path": provider.path,
        "mode": provider.mode,
        "currency": provider.currency,
        "available": provider.is_available(),
        "note": provider.unavailable_note(),
    }


def fulfillment_options_for(candidate: dict) -> list[dict]:
    cat = (candidate.get("category") or "").upper()
    name = ((candidate.get("label") or "") + " " + cat).lower()
    is_hotel = (
        candidate.get("kind") != "transfer"
        and cat in ("", "TRAVEL")
        and not _VOUCHER_RE.search(name)
        and _HOTEL_RE.search(name)
    )
    if is_hotel:
        return [_opt(provider) for provider in _HOTELS] + [_opt(_DEMO)]
    return [_opt(_live_provider_for(candidate)), _opt(_DEMO)]
