from __future__ import annotations

from . import personalization_service, profile_signal_service, user_service


async def get_customer_profile(user_id: str) -> dict | None:
    user = await user_service.get_user(user_id)
    if user is None:
        return None
    prefs = await user_service.get_preferences(user_id)
    memory = await personalization_service.get_user_memory(user_id)
    signals = await profile_signal_service.get_signals(user_id)
    return {
        "user": user,
        "preferences": prefs or {},
        "memory": memory,
        "signals": signals[:20],
    }
