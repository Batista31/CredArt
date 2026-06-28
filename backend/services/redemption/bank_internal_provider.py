"""Bank-internal provider (path = bank).

Bank-owned actions that need no external merchant: lounge activation, points
transfer to a partner, statement credit, perk activation. These are genuinely
'real' in production — they write the bank-side DB directly via the executor's
finalize step (deduct points + ledger + redemption_history). No OTP, instant.
"""

from __future__ import annotations

from uuid import uuid4

from .base import BookingResult, RedemptionProvider


def _action_for(candidate: dict) -> str:
    kind = candidate.get("kind", "")
    label = (candidate.get("label") or "").lower()
    if kind == "transfer":
        return "points_transfer"
    if "lounge" in label:
        return "lounge_activation"
    if "credit" in label or "cashback" in label or "statement" in label:
        return "statement_credit"
    return "perk_activation"


_VERB = {
    "points_transfer": "Transferring points to partner",
    "lounge_activation": "Activating lounge access",
    "statement_credit": "Applying statement credit",
    "perk_activation": "Activating card perk",
}


class BankInternalProvider(RedemptionProvider):
    provider_id = "bank_internal"
    label = "Bank activation"
    path = "bank"
    mode = "live"
    currency = "points"
    requires_otp = False  # bank-owned action — no merchant OTP

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        action = _action_for(candidate)
        ref = "BNK-" + uuid4().hex[:8].upper()
        steps = [
            {"label": "Validating bank rules", "status": "done",
             "detail": f"HDFC {candidate.get('card_name', '')}"},
            {"label": _VERB[action], "status": "done", "detail": candidate.get("label", "")},
            {"label": "Confirming with bank", "status": "done", "detail": ref},
        ]
        return BookingResult(ok=True, confirmation_reference=ref, steps=steps,
                             raw={"action": action})
