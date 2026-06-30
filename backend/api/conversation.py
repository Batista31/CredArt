from __future__ import annotations

from services import conversation_service, memory_service


async def resume_conversation(user_id: str, conversation_id: str) -> dict | None:
    convo = await conversation_service.get_conversation(user_id, conversation_id)
    if convo is None:
        return None
    state = await conversation_service.get_state(conversation_id) or {}
    resume = await memory_service.build_resume_prompt(user_id)
    messages = await conversation_service.get_messages(conversation_id)
    return {
        "conversation": convo,
        "state": state,
        "resume_message": resume,
        "messages": messages,
    }
