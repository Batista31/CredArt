from __future__ import annotations

from . import db


async def record_signal(user_id: str, source: str, signal_type: str, signal_key: str, signal_value: dict) -> None:
    await db.execute(
        """
        INSERT INTO profile_signals (user_id, source, signal_type, signal_key, signal_value)
        VALUES ($1,$2,$3,$4,$5)
        """,
        user_id,
        source,
        signal_type,
        signal_key,
        signal_value,
    )


async def get_signals(user_id: str, source: str | None = None) -> list[dict]:
    return await db.fetch(
        """
        SELECT source, signal_type, signal_key, signal_value, created_at
          FROM profile_signals
         WHERE user_id = $1
           AND ($2::text IS NULL OR source = $2)
         ORDER BY created_at DESC
        """,
        user_id,
        source,
    )
