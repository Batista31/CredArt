"""Redemption rules — composed (deterministic) view. Card-level.

There is no dedicated redemption_rules table. This service composes the
card's redemption-relevant facts from two card-level tables:
  - benefits  (benefit_type in earn / fee / caveat)
  - transfer_partners (ratios + best effective value)
It performs no calculation on user balances; it only restructures existing
verified catalogue rows.
"""

from __future__ import annotations

from . import benefits_service, transfer_partners_service


async def get_redemption_rules(card_id: str) -> dict:
    """Structured redemption rules for a card."""
    benefits = await benefits_service.get_card_benefits(card_id)
    partners = await transfer_partners_service.get_transfer_partners(card_id)

    earn_rules = [b for b in benefits if b["benefit_type"] == "earn"]
    fees = [b for b in benefits if b["benefit_type"] == "fee"]
    caveats = [b for b in benefits if b["benefit_type"] == "caveat"]

    best_partner = partners[0] if partners else None
    transfer_summary = None
    if best_partner is not None:
        transfer_summary = {
            "partner_count": len(partners),
            "best_partner": best_partner["partner_name"],
            "best_ratio": best_partner["ratio"],
            "best_effective_value_inr": best_partner["effective_value_inr"],
            "min_processing_days": min(p["processing_days_min"] for p in partners),
            "max_processing_days": max(p["processing_days_max"] for p in partners),
            "any_reversible": any(p["reversible"] for p in partners),
        }

    return {
        "card_id": card_id,
        "earn_rules": earn_rules,
        "fees": fees,
        "caveats": caveats,
        "transfer_summary": transfer_summary,
        "transfer_partners": partners,
    }
