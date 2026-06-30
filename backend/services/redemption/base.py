"""Provider interface + result type for the redemption executor.

Aligns with the UI fulfilment model: every provider belongs to one of
four paths — demo | api | assisted | bank. `mode` decides the balance bucket
(demo -> demo_points, live -> current_points). `requires_otp` providers, when
run in production, go through a booking-session + OTP step before any points move.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class BookingResult:
    ok: bool
    confirmation_reference: str | None = None
    steps: list[dict] = field(default_factory=list)
    raw: dict | None = None
    error: str | None = None


class RedemptionProvider(ABC):
    """A way to fulfil a redemption candidate."""

    provider_id: str = "base"
    label: str = "Provider"
    path: str = "demo"
    mode: str = "demo"
    currency: str = "demo_points"
    requires_otp: bool = False

    def is_available(self) -> bool:
        return True

    def unavailable_note(self) -> str | None:
        return None

    @abstractmethod
    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        raise NotImplementedError
