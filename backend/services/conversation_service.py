from __future__ import annotations

import json
from typing import Any

from . import db


def _json_value(value):
    if isinstance(value, str) and value.strip():
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _title_from(message: str, fallback: str = "New concierge chat") -> str:
    text = (message or "").strip()
    if not text:
        return fallback
    words = text.split()
    title = " ".join(words[:8]).strip()
    return (title[:157] + "...") if len(title) > 160 else title


async def create_conversation(user_id: str, first_message: str = "", journey_type: str | None = None) -> dict:
    return await db.fetchrow(
        """
        INSERT INTO conversations (user_id, title, journey_type)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, title, status, journey_type, last_message_at, created_at, updated_at
        """,
        user_id,
        _title_from(first_message),
        journey_type,
    )


async def get_conversation(user_id: str, conversation_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT id, user_id, title, status, journey_type, last_message_at, created_at, updated_at
          FROM conversations
         WHERE id = $1 AND user_id = $2
        """,
        conversation_id,
        user_id,
    )


async def list_conversations(user_id: str) -> list[dict]:
    return await db.fetch(
        """
        SELECT c.id, c.title, c.status, c.journey_type, c.last_message_at, c.created_at, c.updated_at,
               COALESCE(cs.open_task, '') AS open_task
          FROM conversations c
          LEFT JOIN conversation_states cs ON cs.conversation_id = c.id
         WHERE c.user_id = $1
         ORDER BY c.updated_at DESC
        """,
        user_id,
    )


async def add_message(conversation_id: str, role: str, content: str, metadata: dict | None = None) -> dict:
    await db.execute(
        """
        INSERT INTO conversation_messages (conversation_id, role, content, metadata)
        VALUES ($1, $2, $3, $4::jsonb)
        """,
        conversation_id,
        role,
        content,
        json.dumps(metadata) if metadata is not None else None,
    )
    await db.execute(
        """
        UPDATE conversations
           SET last_message_at = NOW(),
               updated_at = NOW(),
               title = CASE
                   WHEN title = 'New concierge chat' AND $2 = 'user' THEN $3
                   ELSE title
               END
         WHERE id = $1
        """,
        conversation_id,
        role,
        _title_from(content),
    )
    return {"conversation_id": conversation_id, "role": role, "content": content}


async def get_messages(conversation_id: str, limit: int = 50) -> list[dict]:
    rows = await db.fetch(
        """
        SELECT id, role, content, metadata, created_at
          FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC
         LIMIT $2
        """,
        conversation_id,
        limit,
    )
    for row in rows:
        row["metadata"] = _json_value(row.get("metadata"))
    return rows


async def upsert_state(
    conversation_id: str,
    *,
    journey_type: str | None,
    response_type: str | None,
    known_slots: dict[str, Any],
    missing_slots: list[str],
    open_task: str | None,
    recommendation_state: dict[str, Any] | None = None,
) -> dict:
    await db.execute(
        """
        INSERT INTO conversation_states
            (conversation_id, journey_type, response_type, known_slots, missing_slots, open_task, recommendation_state, updated_at)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,NOW())
        ON CONFLICT (conversation_id) DO UPDATE SET
            journey_type=EXCLUDED.journey_type,
            response_type=EXCLUDED.response_type,
            known_slots=EXCLUDED.known_slots,
            missing_slots=EXCLUDED.missing_slots,
            open_task=EXCLUDED.open_task,
            recommendation_state=EXCLUDED.recommendation_state,
            updated_at=NOW()
        """,
        conversation_id,
        journey_type,
        response_type,
        json.dumps(known_slots),
        json.dumps(missing_slots),
        open_task,
        json.dumps(recommendation_state) if recommendation_state is not None else None,
    )
    return await get_state(conversation_id) or {}


async def get_state(conversation_id: str) -> dict | None:
    row = await db.fetchrow(
        """
        SELECT conversation_id, journey_type, response_type, known_slots, missing_slots, open_task,
               recommendation_state, updated_at
          FROM conversation_states
         WHERE conversation_id = $1
        """,
        conversation_id,
    )
    if row:
        row["known_slots"] = _json_value(row.get("known_slots")) or {}
        row["missing_slots"] = _json_value(row.get("missing_slots")) or []
        row["recommendation_state"] = _json_value(row.get("recommendation_state"))
    return row


async def upsert_unfinished_task(
    user_id: str,
    conversation_id: str,
    journey_type: str,
    title: str,
    details: dict[str, Any],
    status: str = "open",
) -> None:
    existing = await db.fetchrow(
        """
        SELECT id FROM unfinished_tasks
         WHERE user_id = $1 AND conversation_id = $2 AND status IN ('open', 'paused')
         ORDER BY updated_at DESC LIMIT 1
        """,
        user_id,
        conversation_id,
    )
    if existing:
        await db.execute(
            """
            UPDATE unfinished_tasks
               SET journey_type=$2, title=$3, status=$4, details=$5::jsonb, updated_at=NOW()
             WHERE id=$1
            """,
            existing["id"],
            journey_type,
            title,
            status,
            json.dumps(details),
        )
        return
    await db.execute(
        """
        INSERT INTO unfinished_tasks (user_id, conversation_id, journey_type, title, status, details)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)
        """,
        user_id,
        conversation_id,
        journey_type,
        title,
        status,
        json.dumps(details),
    )


async def get_latest_open_task(user_id: str) -> dict | None:
    row = await db.fetchrow(
        """
        SELECT id, conversation_id, journey_type, title, status, details, created_at, updated_at
          FROM unfinished_tasks
         WHERE user_id = $1 AND status IN ('open', 'paused')
         ORDER BY updated_at DESC
         LIMIT 1
        """,
        user_id,
    )
    if row:
        row["details"] = _json_value(row.get("details")) or {}
    return row


async def complete_open_tasks(user_id: str, conversation_id: str) -> None:
    await db.execute(
        """
        UPDATE unfinished_tasks
           SET status = 'completed', updated_at = NOW()
         WHERE user_id = $1 AND conversation_id = $2 AND status IN ('open', 'paused')
        """,
        user_id,
        conversation_id,
    )
