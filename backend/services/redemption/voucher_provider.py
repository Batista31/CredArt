from __future__ import annotations

from .base import BookingResult, RedemptionProvider


class VoucherProvider(RedemptionProvider):
    provider_id = "voucher_api"
    label = "Voucher checkout"
    path = "api"
    mode = "live"
    currency = "points"
    requires_otp = True

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        ref = f"VCHR-{candidate.get('card_id', 'CARD')[:6].upper()}"
        return BookingResult(
            ok=True,
            confirmation_reference=ref,
            steps=[
                {"label": "Preparing voucher", "status": "done", "detail": candidate.get("label", "voucher")},
                {"label": "Issuing voucher", "status": "done", "detail": ref},
            ],
        )
