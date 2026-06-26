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
    """
    merged = {k: v for k, v in old.items() if k not in _TRANSIENT_INTENT_FIELDS}
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
            if new_q and new_q.lower() not in old_q.lower():
                merged[key] = f"{old_q} {new_q}".strip()
            else:
                merged[key] = old_q or new_q
        elif val is not None and val != "":
            merged[key] = val
    return merged


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
