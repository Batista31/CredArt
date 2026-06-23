"""Provider interface + result type for the redemption executor."""

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
    """A way to fulfil a redemption candidate.

    Subclasses set the class attrs and implement `book`. `mode` decides which
    balance bucket the executor debits: 'live' -> current_points, 'demo' ->
    demo_points.
    """

    provider_id: str = "base"
    label: str = "Provider"
    mode: str = "demo"          # "live" | "demo"
    currency: str = "demo_points"  # "points" | "demo_points"

    def is_available(self) -> bool:
        return True

    def unavailable_note(self) -> str | None:
        return None

    @abstractmethod
    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        """Attempt the booking. Must never raise — return BookingResult(ok=False)."""
        raise NotImplementedError
