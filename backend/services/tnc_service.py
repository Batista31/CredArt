"""Terms & Conditions version reads — tnc_versions table only. Card-level."""

from __future__ import annotations

from . import db

_TNC_COLUMNS = """
    card_id,
    pdf_url,
    pdf_hash,
    effective_date,
    detected_at,
    ingestion_status,
    ingested_at,
    is_current
"""


async def get_tnc_updates(card_id: str) -> dict | None:
    """The current T&C version for a card (the 'updated T&C' the bank exposes)."""
    return await db.fetchrow(
        f"SELECT {_TNC_COLUMNS} FROM tnc_versions "
        f"WHERE card_id = $1 AND is_current = TRUE "
        f"ORDER BY effective_date DESC LIMIT 1",
        card_id,
    )
