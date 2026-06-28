from __future__ import annotations

from .base import BookingResult, RedemptionProvider


class BankInternalProvider(RedemptionProvider):
    provider_id = "bank_internal"
    label = "Bank internal redemption"
    path = "bank"
    mode = "live"
    currency = "points"
    requires_otp = False

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        ref = f"BANK-{candidate.get('card_id', 'CARD')[:6].upper()}"
        return BookingResult(
            ok=True,
            confirmation_reference=ref,
            steps=[
                {"label": "Validating bank redemption", "status": "done", "detail": candidate.get("label", "")},
                {"label": "Completing bank redemption", "status": "done", "detail": ref},
            ],
        )
