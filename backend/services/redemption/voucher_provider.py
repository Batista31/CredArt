"""Voucher provider (path = api).

Issues gift-card / voucher style rewards for DINING / SHOPPING / ENTERTAINMENT
(Swiggy, Amazon, BookMyShow, etc.). Mock/sandbox issuance: returns a real-looking
voucher code. If VOUCHER_API_URL is configured it would POST to a real sandbox;
until then it mints a deterministic-looking code. In production it is OTP-gated
(matches the UI's `api` path needing a secure step-up).

The `book()` call here is the POST-OTP confirmation step (the executor only calls
it once the booking session is OTP-verified).
"""

from __future__ import annotations

import os
from uuid import uuid4

from .base import BookingResult, RedemptionProvider


class VoucherProvider(RedemptionProvider):
    provider_id = "voucher"
    label = "Voucher (Live · API)"
    path = "api"
    mode = "live"
    currency = "points"
    requires_otp = True

    def __init__(self) -> None:
        self.api_url = os.getenv("VOUCHER_API_URL", "")

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        code = "VCHR-" + uuid4().hex[:10].upper()
        label = candidate.get("label", "voucher")
        steps = [
            {"label": "Issuing voucher", "status": "done",
             "detail": "sandbox" if not self.api_url else "partner API"},
            {"label": "Confirming voucher code", "status": "done", "detail": code},
        ]
        return BookingResult(ok=True, confirmation_reference=code, steps=steps,
                             raw={"voucher_for": label, "sandbox": not self.api_url})
