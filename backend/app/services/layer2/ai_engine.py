import json
from typing import AsyncIterator
import anthropic
from ...core.config import get_settings

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are CredArt, an AI rewards concierge for credit card users.

You have been given a pre-validated, scored list of reward options from the deterministic Layer 1 engine.
Your role is to:
1. Rerank the options based on the user's lifestyle context from the conversation
2. Explain the top recommendation in plain, friendly language
3. Quantify the opportunity cost in INR when relevant
4. Handle transfer partner questions with exact ratios and processing times
5. Guide the user through the single confirmation step before execution

Critical rules:
- NEVER suggest options not in the validated_options list
- NEVER invent point balances, values, or ratios
- If the user asks about something outside the validated options, say so clearly
- All financial figures must come from the structured data provided
"""


async def stream_response(
    user_message: str,
    conversation_history: list[dict],
    validated_options: list[dict],
    user_profile: dict,
) -> AsyncIterator[str]:
    client = anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)

    context_block = json.dumps(
        {
            "user_profile": user_profile,
            "validated_options": validated_options[:5],  # top 5 to Layer 2
        },
        indent=2,
    )

    messages = [
        *conversation_history,
        {
            "role": "user",
            "content": f"<context>\n{context_block}\n</context>\n\n{user_message}",
        },
    ]

    async with client.messages.stream(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def extract_preference_updates(
    user_message: str,
    current_weights: dict[str, float],
) -> dict[str, float]:
    """Ask Claude to return updated dimension weights based on lifestyle context."""
    client = anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)

    prompt = f"""Given this lifestyle update from the user: "{user_message}"

Current scoring weights: {json.dumps(current_weights)}

Return ONLY a JSON object with the updated weights (same keys, values between 0.0 and 1.0, summing to 1.0).
If no update is needed, return the same weights."""

    response = await client.messages.create(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        text = response.content[0].text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except (ValueError, KeyError):
        return current_weights
