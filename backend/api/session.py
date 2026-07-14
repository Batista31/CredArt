# api/session.py
# Session store: Redis-backed when REDIS_URL is set, else in-memory.
#
# In-memory sessions reset whenever the backend restarts (fine for solo dev).
# With Redis, sessions survive restarts/--reload and can be shared across
# workers. If Redis is configured but a call fails, we fall back to the
# in-memory dict for that call so a Redis blip degrades gracefully rather than
# breaking active chats.

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

SESSION_TTL_SECONDS = 60 * 60
_KEY_PREFIX = "credart:session:"

# Fields that must never be carried over from one turn's intent to the next.
_TRANSIENT_INTENT_FIELDS = {"is_complete", "follow_up_question"}


def merge_partial_intent(old: dict, new: dict) -> dict:
    """Merge a freshly extracted intent dict over a stored partial intent.

    Precedence rules:
    - kind: new wins unless it is "unknown" (old preserved so context isn't lost)
    - urgency: once True, stays True (OR semantics)
    - query: accumulate across turns so the orchestrator's semantic search and
      the rerank LLM see the FULL gathered context (e.g. "nice dinner ...
      anniversary ... Italian"), not just the latest one-word answer. Details
      like cuisine/occasion live ONLY in the raw text, so dropping prior turns
      would lose them.
    - all other fields: new non-null / non-empty value wins; otherwise keep old
    - transient completeness flags are never carried forward
    - journey switch (both journey_types set and different): the old journey's
      accumulated query and slots are request-specific noise for the new one —
      start both fresh from the new intent instead of merging
    """
    journey_switched = bool(
        new.get("journey_type") and old.get("journey_type")
        and new["journey_type"] != old["journey_type"]
    )
    merged = {k: v for k, v in old.items() if k not in _TRANSIENT_INTENT_FIELDS}
    if journey_switched:
        merged["slots"] = {}
    for key, val in new.items():
        if key in _TRANSIENT_INTENT_FIELDS:
            continue
        if key == "kind":
            if val and val != "unknown":
                merged[key] = val
        elif key == "urgency":
            merged[key] = merged.get(key, False) or bool(val)
        elif key == "query":
            old_q = (merged.get("query") or "").strip()
            new_q = (val or "").strip()
            if journey_switched:
                merged[key] = new_q or old_q
            elif new_q and new_q.lower() not in old_q.lower():
                merged[key] = f"{old_q} {new_q}".strip()
            else:
                merged[key] = old_q or new_q
        elif val is not None and val != "":
            merged[key] = val
    return merged


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, dict[str, Any]] = {}  # in-memory (fallback / no-Redis)
        self._url = os.getenv("REDIS_URL")
        self._redis = None                # lazily-created redis.asyncio client
        self._redis_ready: bool | None = None  # None=untested, True=ok, False=unavailable

    @property
    def backend(self) -> str:
        """Reported by /health. 'redis' when configured and not known-failed."""
        if not self._url or self._redis_ready is False:
            return "memory"
        return "redis"

    @staticmethod
    def _key(sid: str) -> str:
        return f"{_KEY_PREFIX}{sid}"

    async def _client(self):
        """Return a ready redis client, or None to use the in-memory path.

        Connects lazily on first use and pings once; a failure is remembered so
        we don't retry on every turn. Never raises."""
        if not self._url or self._redis_ready is False:
            return None
        if self._redis is not None:
            return self._redis
        try:
            import redis.asyncio as redis  # lazy; optional dependency
            client = redis.from_url(self._url, decode_responses=True)
            await client.ping()
            self._redis = client
            self._redis_ready = True
            print("[session] Redis-backed session store active")
            return client
        except Exception as exc:  # noqa: BLE001
            self._redis_ready = False
            print(f"[session] Redis unavailable ({exc}); using in-memory sessions")
            return None

    async def startup(self) -> None:
        """Eagerly connect so /health reports accurately. Never raises."""
        await self._client()

    async def shutdown(self) -> None:
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:  # noqa: BLE001
                pass

    def _make_session(self) -> dict[str, Any]:
        sid = uuid.uuid4().hex
        now = int(time.time())
        return {
            "session_id": sid,
            "id": sid,
            "history": [],
            "turns": [],
            "last_candidates": [],
            "candidate_index": {},
            "created_at": now,
            "updated_at": now,
            "expires_at": now + SESSION_TTL_SECONDS,
        }

    async def _redis_save(self, client, session: dict[str, Any]) -> None:
        await client.setex(
            self._key(session["session_id"]),
            SESSION_TTL_SECONDS,
            json.dumps(session, default=str),
        )

    async def load(self, session_id: str | None = None) -> dict[str, Any]:
        client = await self._client()
        if client is not None:
            try:
                if session_id:
                    raw = await client.get(self._key(session_id))
                    if raw:
                        # slide the TTL on access (matches in-memory behaviour)
                        await client.expire(self._key(session_id), SESSION_TTL_SECONDS)
                        return json.loads(raw)
                session = self._make_session()
                await self._redis_save(client, session)
                return session
            except Exception as exc:  # noqa: BLE001
                print(f"[session] Redis load failed ({exc}); falling back to memory")

        # in-memory path
        self._cleanup()
        if session_id and session_id in self._sessions:
            session = self._sessions[session_id]
            session["updated_at"] = int(time.time())
            session["expires_at"] = int(time.time()) + SESSION_TTL_SECONDS
            return session
        session = self._make_session()
        self._sessions[session["session_id"]] = session
        return session

    async def save(self, session: dict[str, Any]) -> dict[str, Any]:
        sid = session.get("session_id") or session.get("id") or uuid.uuid4().hex
        session["session_id"] = sid
        session["id"] = sid
        session["updated_at"] = int(time.time())
        session["expires_at"] = int(time.time()) + SESSION_TTL_SECONDS

        client = await self._client()
        if client is not None:
            try:
                await self._redis_save(client, session)
                return session
            except Exception as exc:  # noqa: BLE001
                print(f"[session] Redis save failed ({exc}); falling back to memory")

        self._sessions[sid] = session
        return session

    async def append_turn(
        self,
        session: dict[str, Any],
        role: str,
        content: str,
    ) -> dict[str, Any]:
        turn = {
            "role": role,
            "content": content,
            "ts": int(time.time()),
        }

        session.setdefault("history", []).append(turn)
        session.setdefault("turns", []).append(turn)

        return await self.save(session)

    def _cleanup(self) -> None:
        now = int(time.time())
        expired = [
            sid
            for sid, session in self._sessions.items()
            if int(session.get("expires_at", now + 1)) < now
        ]
        for sid in expired:
            self._sessions.pop(sid, None)


# NOTE: a second, identical copy of merge_partial_intent used to live here and
# silently shadowed the one above — removed; the canonical version is at the top.