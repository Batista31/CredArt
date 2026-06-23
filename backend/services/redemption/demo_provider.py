"""Demo provider — always available, mimics the booking, spends demo_points.

This is what powers the one-click demo: it never calls an external service and
never touches real points, so it works offline and is fully replayable after
reset_demo.sql tops the demo_points bucket back up.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

from .base import BookingResult, RedemptionProvider


class DemoProvider(RedemptionProvider):
    provider_id = "demo"
    label = "Demo (demo credits)"
    mode = "demo"
    currency = "demo_points"

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        ref = "CRD-DEMO-" + uuid4().hex[:8].upper()
        cost = candidate.get("points_cost") or 0
        label = candidate.get("label", "your reward")
        # A touch of simulated latency so the UI's step animation has time to play.
        steps = []
        for step in (
            {"label": f"Booking {label}", "detail": "simulated partner call"},
            {"label": "Deducting demo credits", "detail": f"{cost:,} demo pts"},
            {"label": "Sending confirmation", "detail": ref},
        ):
            await asyncio.sleep(0.2)
            steps.append({**step, "status": "done"})
        return BookingResult(ok=True, confirmation_reference=ref, steps=steps,
                             raw={"simulated": True})
