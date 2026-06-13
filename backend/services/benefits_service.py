"""Benefit reads — benefits table only. Card-level."""

from __future__ import annotations

from . import db

_BENEFIT_COLUMNS = """
    card_id,
    category,
    sort_order,
    benefit_name,
    description,
    benefit_type,
    points_cost,
    cash_component_inr,
    milestone_threshold_inr,
    source_url,
    verified,
    content_hash,
    effective_date
"""


async def get_card_benefits(
    card_id: str,
    category: str | None = None,
    benefit_type: str | None = None,
) -> list[dict]:
    """Benefits for a card, optionally filtered by category or benefit_type."""
    clauses = ["card_id = $1"]
    args: list = [card_id]
    if category is not None:
        args.append(category)
        clauses.append(f"category = ${len(args)}")
    if benefit_type is not None:
        args.append(benefit_type)
        clauses.append(f"benefit_type = ${len(args)}")

    where = " AND ".join(clauses)
    return await db.fetch(
        f"SELECT {_BENEFIT_COLUMNS} FROM benefits WHERE {where} "
        f"ORDER BY category, sort_order",
        *args,
    )
