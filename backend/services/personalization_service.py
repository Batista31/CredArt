from __future__ import annotations

import json
from decimal import Decimal

from . import db

_ALLOWED_PREF_FIELDS = {
    "destination_type",
    "trip_length",
    "region_preference",
    "accommodation_tier",
    "flight_preference",
    "departure_preference",
    "travel_weight",
    "dining_weight",
    "shopping_weight",
    "cashback_weight",
    "experiences_weight",
    "value_sensitivity_threshold",
}


def _json_object(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


async def get_user_memory(user_id: str) -> dict:
    row = await db.fetchrow(
        """
        SELECT summary, structured_preferences, lifestyle_tags, last_active_conversation_id, updated_at
          FROM user_memory WHERE user_id = $1
        """,
        user_id,
    )
    if row:
        row["structured_preferences"] = _json_object(row.get("structured_preferences"))
        return row
    await db.execute(
        """
        INSERT INTO user_memory (user_id, summary, structured_preferences, lifestyle_tags)
        VALUES ($1, NULL, '{}'::jsonb, ARRAY[]::text[])
        ON CONFLICT (user_id) DO NOTHING
        """,
        user_id,
    )
    return {
        "summary": None,
        "structured_preferences": {},
        "lifestyle_tags": [],
        "last_active_conversation_id": None,
    }


async def update_memory(
    user_id: str,
    *,
    summary: str | None = None,
    structured_preferences: dict | None = None,
    lifestyle_tags: list[str] | None = None,
    last_active_conversation_id: str | None = None,
) -> dict:
    current = await get_user_memory(user_id)
    await db.execute(
        """
        INSERT INTO user_memory (user_id, summary, structured_preferences, lifestyle_tags, last_active_conversation_id, updated_at)
        VALUES ($1,$2,$3::jsonb,$4,$5,NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            summary=$2,
            structured_preferences=$3,
            lifestyle_tags=$4,
            last_active_conversation_id=$5,
            updated_at=NOW()
        """,
        user_id,
        summary if summary is not None else current.get("summary"),
        json.dumps(structured_preferences if structured_preferences is not None else current.get("structured_preferences", {})),
        lifestyle_tags if lifestyle_tags is not None else current.get("lifestyle_tags", []),
        last_active_conversation_id if last_active_conversation_id is not None else current.get("last_active_conversation_id"),
    )
    return await get_user_memory(user_id)


async def update_preferences(user_id: str, payload: dict) -> dict | None:
    updates = {k: v for k, v in payload.items() if k in _ALLOWED_PREF_FIELDS}
    if not updates:
        return await db.fetchrow("SELECT * FROM preferences WHERE user_id = $1", user_id)

    clauses = []
    values = []
    idx = 1
    for key, value in updates.items():
        if key.endswith("_weight") or key == "value_sensitivity_threshold":
            value = Decimal(str(value))
        clauses.append(f"{key} = ${idx}")
        values.append(value)
        idx += 1
    values.append(user_id)
    await db.execute(
        f"""
        UPDATE preferences
           SET {", ".join(clauses)}, updated_at = NOW()
         WHERE user_id = ${idx}
        """,
        *values,
    )
    return await db.fetchrow(
        """
        SELECT destination_type, trip_length, region_preference, accommodation_tier,
               flight_preference, departure_preference,
               travel_weight, dining_weight, shopping_weight, cashback_weight,
               experiences_weight, value_sensitivity_threshold,
               total_redemptions, total_dismissals
          FROM preferences WHERE user_id = $1
        """,
        user_id,
    )


async def list_addresses(user_id: str) -> list[dict]:
    return await db.fetch(
        """
        SELECT id, label, address_line1, address_line2, city, state, pincode, is_default, created_at, updated_at
          FROM user_addresses
         WHERE user_id = $1
         ORDER BY is_default DESC, updated_at DESC
        """,
        user_id,
    )


async def add_address(user_id: str, payload: dict) -> dict:
    if payload.get("is_default"):
        await db.execute("UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1", user_id)
    return await db.fetchrow(
        """
        INSERT INTO user_addresses
            (user_id, label, address_line1, address_line2, city, state, pincode, is_default)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id, label, address_line1, address_line2, city, state, pincode, is_default
        """,
        user_id,
        payload["label"],
        payload.get("address_line1") or payload.get("line1"),
        payload.get("address_line2") or payload.get("line2"),
        payload["city"],
        payload["state"],
        payload.get("pincode") or payload.get("postal_code"),
        bool(payload.get("is_default", False)),
    )


async def set_default_address(user_id: str, address_id: str) -> dict | None:
    await db.execute("UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1", user_id)
    await db.execute(
        """
        UPDATE user_addresses
           SET is_default = TRUE, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
        """,
        address_id,
        user_id,
    )
    return await db.fetchrow(
        """
        SELECT id, label, address_line1, address_line2, city, state, pincode, is_default
          FROM user_addresses
         WHERE id = $1 AND user_id = $2
        """,
        address_id,
        user_id,
    )


async def default_address(user_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT id, label, address_line1, address_line2, city, state, pincode, is_default
          FROM user_addresses
         WHERE user_id = $1
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1
        """,
        user_id,
    )
