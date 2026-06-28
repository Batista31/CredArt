from __future__ import annotations

from . import conversation_service, personalization_service


async def build_resume_prompt(user_id: str) -> str | None:
    task = await conversation_service.get_latest_open_task(user_id)
    if not task:
        return None
    details = task.get("details") or {}
    summary_bits = []
    for key in ("style", "required_products", "destination", "priority"):
        value = details.get(key)
        if value:
            summary_bits.append(f"{key.replace('_', ' ')}: {value}")
    suffix = ""
    if summary_bits:
        suffix = " We had noted " + ", ".join(summary_bits[:3]) + "."
    return f"Last time we were working on {task['title'].lower()}.{suffix} Want to continue from there?"


async def remember_conversation(user_id: str, conversation_id: str, summary: str, preferences: dict | None = None) -> dict:
    current = await personalization_service.get_user_memory(user_id)
    merged = dict(current.get("structured_preferences") or {})
    if preferences:
        merged.update({k: v for k, v in preferences.items() if v not in (None, "", [])})
    return await personalization_service.update_memory(
        user_id,
        summary=summary,
        structured_preferences=merged,
        last_active_conversation_id=conversation_id,
    )
