# api/session.py
# Local demo-only in-memory session store.
# Sessions reset whenever the backend restarts.

from __future__ import annotations

import time
import uuid
from typing import Any

SESSION_TTL_SECONDS = 60 * 60


class SessionStore:
    backend = "memory"

    def __init__(self) -> None:
        self._sessions: dict[str, dict[str, Any]] = {}

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

    async def load(self, session_id: str | None = None) -> dict[str, Any]:
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


# ---------------------------------------------------------------------------
# Multi-turn intent merging (duffel multi-turn flight intent)
# ---------------------------------------------------------------------------

_TRANSIENT_INTENT_FIELDS = {"is_complete", "follow_up_question"}


def merge_partial_intent(old: dict, new: dict) -> dict:
    """Merge a freshly extracted intent dict over a stored partial intent.

    - kind: new wins unless "unknown"
    - urgency: OR semantics (once True stays True)
    - query: accumulated across turns so LLM sees full gathered context
    - all other fields: new non-null value wins; otherwise keep old
    - transient completeness flags never carried forward
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