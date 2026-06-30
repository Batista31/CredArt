from __future__ import annotations

from . import profile_signal_service


async def ingest_plugin_context(user_id: str, payload: dict) -> dict:
    await profile_signal_service.record_signal(
        user_id,
        "plugin",
        payload.get("context_type", "merchant_context"),
        payload.get("merchant", "unknown"),
        payload,
    )
    return {"status": "recorded", "source": "plugin", "payload": payload}


async def ingest_clickstream_context(user_id: str, payload: dict) -> dict:
    await profile_signal_service.record_signal(
        user_id,
        "clickstream",
        payload.get("signal_type", "browse"),
        payload.get("signal_key", "page"),
        payload,
    )
    return {"status": "recorded", "source": "clickstream"}
