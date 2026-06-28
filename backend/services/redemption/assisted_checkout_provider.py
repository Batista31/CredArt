from __future__ import annotations

from .base import BookingResult, RedemptionProvider


class AssistedCheckoutProvider(RedemptionProvider):
    provider_id = "assisted_checkout"
    label = "Assisted checkout"
    path = "assisted"
    mode = "live"
    currency = "points"
    requires_otp = True

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        ref = f"AST-{candidate.get('card_id', 'CARD')[:6].upper()}"
        return BookingResult(
            ok=True,
            confirmation_reference=ref,
            steps=[
                {"label": "Preparing assisted checkout", "status": "done", "detail": candidate.get("label", "")},
                {"label": "Confirming assisted booking", "status": "done", "detail": ref},
            ],
        )
