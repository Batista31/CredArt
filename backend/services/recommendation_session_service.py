from __future__ import annotations

import json

from . import db


async def create_session(
    user_id: str,
    journey_type: str,
    input_context: dict,
    recommendations: list[dict],
    conversation_id: str | None = None,
    status: str = "draft",
) -> dict:
    return await db.fetchrow(
        """
        INSERT INTO recommendation_sessions
            (user_id, conversation_id, journey_type, status, input_context, recommendations)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
        RETURNING id, user_id, conversation_id, journey_type, status, input_context, recommendations,
                  created_at, updated_at
        """,
        user_id,
        conversation_id,
        journey_type,
        status,
        json.dumps(input_context),
        json.dumps(recommendations),
    )


async def get_session(user_id: str, session_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT id, user_id, conversation_id, journey_type, status, input_context, recommendations,
               created_at, updated_at
          FROM recommendation_sessions
         WHERE id = $1 AND user_id = $2
        """,
        session_id,
        user_id,
    )
