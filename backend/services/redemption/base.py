"""Provider interface + result type for the redemption executor.

Aligns with the UI fulfilment model (mode.jsx): every provider belongs to one of
four PATHS — demo | api | assisted | bank. `mode` decides the balance bucket
(demo -> demo_points, live -> current_points). `requires_otp` providers, when run
in production, go through a booking-session + OTP step before any points move.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class BookingResult:
    ok: bool
    confirmation_reference: str | None = None
    steps: list[dict] = field(default_factory=list)   # [{label, status, detail}]
    raw: dict | None = None
    error: str | None = None


class RedemptionProvider(ABC):
    """A way to fulfil a redemption candidate."""

    provider_id: str = "base"
    label: str = "Provider"
    path: str = "demo"           # demo | api | assisted | bank  (UI fulfilment path)
    mode: str = "demo"           # "live" | "demo"  (which balance bucket)
    currency: str = "demo_points"  # "points" | "demo_points"
    requires_otp: bool = False   # production api/assisted → OTP-gated booking session

    def is_available(self) -> bool:
        return True

    def unavailable_note(self) -> str | None:
        return None

    @abstractmethod
    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        """Attempt/confirm the booking. Must never raise — return BookingResult(ok=False)."""
        raise NotImplementedError
