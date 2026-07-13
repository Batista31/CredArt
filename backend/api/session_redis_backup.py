"""Conversation session store.

Defaults to in-memory (fine for a single-process demo). If REDIS_URL (or an
Upstash redis:// URL) is present in the environment, it transparently switches
to Redis so sessions survive restarts and scale across workers. redis is
imported lazily so it isn't a hard dependency until configured.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

SESSION_TTL_SECONDS = 60 * 60  # 1 hour
_MAX_TURNS = 40


class SessionStore:
    def __init__(self) -> None:
        self._redis = None
        self._mem: dict[str, dict] = {}
        url = os.getenv("REDIS_URL")
        if url:
            import redis.asyncio as redis  # lazy

            self._redis = redis.from_url(url, decode_responses=True)

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "memory"

    @staticmethod
    def _key(session_id: str) -> str:
        return f"credart:session:{session_id}"

    async def load(self, session_id: str | None) -> dict:
        if session_id:
            if self._redis is not None:
                raw = await self._redis.get(self._key(session_id))
                if raw:
                    return json.loads(raw)
            elif session_id in self._mem:
                return self._mem[session_id]
        return {"session_id": session_id or uuid.uuid4().hex, "turns": []}

    async def append_turn(self, session: dict, role: str, content: Any) -> None:
        session["turns"].append({"role": role, "content": content, "ts": time.time()})
        session["turns"] = session["turns"][-_MAX_TURNS:]
        await self._save(session)

    async def save(self, session: dict) -> None:
        """Public persist (used to stash the turn's candidate set for /redeem)."""
        await self._save(session)

    async def _save(self, session: dict) -> None:
        sid = session["session_id"]
        if self._redis is not None:
            await self._redis.set(self._key(sid), json.dumps(session), ex=SESSION_TTL_SECONDS)
        else:
            self._mem[sid] = session
