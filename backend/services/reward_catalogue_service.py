"""Reward catalogue service — searches the reward_items table for merchandise candidates.

reward_items is created by migration 0011_conversation_concierge. Until it has data
the search returns an empty list — no error. Items are added via seed scripts or admin.
"""

from __future__ import annotations

from . import db


async def search_reward_items(
    query: str,
    category: str | None = None,
    style_tags: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Full-text + category search over reward_items. Returns up to top_k items."""
    try:
        if category:
            rows = await db.fetch(
                """
                SELECT id, title, description, category, subcategory, brand, provider,
                       points_price, cash_price_inr, inventory_status, fulfillment_type, metadata
                  FROM reward_items
                 WHERE is_active = TRUE
                   AND category ILIKE $1
                   AND (title ILIKE $2 OR description ILIKE $2)
                 ORDER BY points_price ASC
                 LIMIT $3
                """,
                f"%{category}%",
                f"%{query}%",
                top_k,
            )
        else:
            rows = await db.fetch(
                """
                SELECT id, title, description, category, subcategory, brand, provider,
                       points_price, cash_price_inr, inventory_status, fulfillment_type, metadata
                  FROM reward_items
                 WHERE is_active = TRUE
                   AND (title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
                 ORDER BY points_price ASC
                 LIMIT $2
                """,
                f"%{query}%",
                top_k,
            )
        return [dict(r) for r in (rows or [])]
    except Exception:
        # Table may not exist yet (pre-migration). Return empty — dialogue degrades gracefully.
        return []


async def get_item(item_id: str) -> dict | None:
    try:
        row = await db.fetchrow(
            "SELECT * FROM reward_items WHERE id = $1 AND is_active = TRUE",
            item_id,
        )
        return dict(row) if row else None
    except Exception:
        return None
