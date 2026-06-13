"""Redemption rules — composed (deterministic) view. Card-level.

There is no dedicated redemption_rules table. This service composes the
card's redemption-relevant facts from card-level data:
  - redeemable benefits (points_cost IS NOT NULL) -> redemption options
  - milestone benefits (benefit_type = 'milestone')
  - the card's fine print (points expiry, excluded categories, blackout dates)
  - transfer_partners (ratios + best effective value)
It performs no calculation on user balances; it only restructures existing
verified catalogue rows.
"""

from __future__ import annotations

from . import benefits_service, cards_service, transfer_partners_service


async def get_redemption_rules(card_id: str) -> dict:
    """Structured redemption rules for a card."""
    card = await cards_service.get_card_details(card_id)
    benefits = await benefits_service.get_card_benefits(card_id)
    partners = await transfer_partners_service.get_transfer_partners(card_id)

    redemption_options = [b for b in benefits if b["points_cost"] is not None]
    milestones = [b for b in benefits if b["benefit_type"] == "milestone"]

    fine_print = None
    if card is not None:
        fine_print = {
            "points_expiry_months": card["points_expiry_months"],
            "excluded_categories": card["excluded_categories"],
            "blackout_dates": card["blackout_dates"],
        }

    transfer_summary = None
    if partners:
        best = partners[0]
        transfer_summary = {
            "partner_count": len(partners),
            "best_partner": best["partner_name"],
            "best_ratio": best["ratio"],
            "best_effective_value_inr": best["effective_value_inr"],
            "best_use_case": best["best_use_case"],
            "min_processing_days": min(p["processing_days_min"] for p in partners),
            "max_processing_days": max(p["processing_days_max"] for p in partners),
            "any_reversible": any(p["reversible"] for p in partners),
        }

    return {
        "card_id": card_id,
        "currency_name": card["currency_name"] if card else None,
        "redemption_options": redemption_options,
        "milestones": milestones,
        "fine_print": fine_print,
        "transfer_summary": transfer_summary,
        "transfer_partners": partners,
    }
