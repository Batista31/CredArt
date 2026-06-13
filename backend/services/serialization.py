"""JSON-safe conversion and content hashing.

content_hash powers CredArt's hash-sync mechanism: every MCP response is
hashed, and the pgvector DB updates ONLY when the hash differs from the
stored one. The hash must therefore be stable and canonical (sorted keys,
no incidental whitespace).
"""

from __future__ import annotations

import datetime
import hashlib
import json
import uuid
from decimal import Decimal
from typing import Any


def to_jsonable(value: Any) -> Any:
    """Recursively convert DB values (Decimal, date/datetime, UUID) to JSON-safe types."""
    if isinstance(value, Decimal):
        # int when whole, float otherwise — keeps ratios like 2:1 clean.
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    return value


def content_hash(data: Any) -> str:
    """Stable sha256 hex of a JSON-safe payload (sorted keys)."""
    canonical = json.dumps(to_jsonable(data), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def wrap(data: Any, card_id: str | None = None) -> dict:
    """Standard card-level MCP envelope.

    Every tool returns { scope, card_id?, content_hash, data }. The
    content_hash lets Layer 1 detect whether the bank's card-level content
    changed before re-embedding into pgvector.
    """
    safe = to_jsonable(data)
    envelope = {
        "scope": "card_level",
        "content_hash": content_hash(safe),
        "data": safe,
    }
    if card_id is not None:
        envelope["card_id"] = card_id
    return envelope
