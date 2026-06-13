"""Transfer partner reads — transfer_partners table only. Card-level."""

from __future__ import annotations

from . import db

_PARTNER_COLUMNS = """
    card_id,
    partner_name,
    partner_programme,
    partner_type,
    source_points,
    destination_points,
    minimum_transfer,
    processing_days_min,
    processing_days_max,
    reversible,
    effective_value_inr,
    best_use_case,
    source_url,
    content_hash,
    effective_date
"""


async def get_transfer_partners(
    card_id: str,
    partner_type: str | None = None,
) -> list[dict]:
    """Active transfer partners (ratios) for a card, best value first."""
    clauses = ["card_id = $1", "is_active = TRUE"]
    args: list = [card_id]
    if partner_type is not None:
        args.append(partner_type)
        clauses.append(f"partner_type = ${len(args)}")

    where = " AND ".join(clauses)
    rows = await db.fetch(
        f"SELECT {_PARTNER_COLUMNS} FROM transfer_partners WHERE {where} "
        f"ORDER BY effective_value_inr DESC NULLS LAST, partner_name",
        *args,
    )
    # Add a human-readable ratio alongside the raw source/destination points.
    for r in rows:
        r["ratio"] = f"{r['source_points']}:{r['destination_points']}"
    return rows
