"""Card catalogue reads — cards table only. Card-level."""

from __future__ import annotations

from . import db

_CARD_COLUMNS = """
    id            AS card_id,
    bank_name,
    card_name,
    card_tier,
    network,
    annual_fee_inr,
    base_earn_rate,
    currency_name,
    image_asset_url,
    card_page_url,
    joining_fee_inr,
    points_expiry_months,
    excluded_categories,
    blackout_dates,
    is_active
"""


async def list_cards(active_only: bool = True) -> list[dict]:
    """All cards in the catalogue, ordered by annual fee (premium first)."""
    where = "WHERE is_active = TRUE" if active_only else ""
    return await db.fetch(
        f"SELECT {_CARD_COLUMNS} FROM cards {where} ORDER BY annual_fee_inr DESC"
    )


async def get_card_details(card_id: str) -> dict | None:
    """Full metadata for a single card."""
    return await db.fetchrow(
        f"SELECT {_CARD_COLUMNS} FROM cards WHERE id = $1", card_id
    )
