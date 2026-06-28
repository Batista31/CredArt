"""LLM service — Groq primary (llama-3.3-70b-versatile), Gemini fallback.

Anti-hallucination contract:
  - LLM receives ONLY the pre-validated candidate set from Layer 1.
  - LLM NEVER queries the DB.
  - All ₹ values and points figures come from candidates — LLM may not invent them.
"""

from __future__ import annotations

import json
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"

_INTENT_SYSTEM = """You are an intent parser for CredArt, a credit card rewards concierge.

Extract the user's intent from their message and return ONLY valid JSON — no markdown, no explanation.

Schema:
{
  "kind": one of ["greeting","check_expiry","explore_benefits","redeem","transfer","unknown"],
  "query": "<user message verbatim>",
  "card_id": "<hdfc_infinia|hdfc_regalia_gold|hdfc_millennia or null>",
  "category": "<TRAVEL|DINING|ENTERTAINMENT|SHOPPING|WELLNESS or null>",
  "urgency": true/false,
  "journey_type": "<travel_flight|travel_hotel|product_purchase|home_setup|gift_purchase|voucher_redemption|cashback_or_statement_credit|transfer_partner_redemption|card_benefit_lookup|points_expiry_help|general_reward_advice or null>",
  "slots": {}
}

Rules:
- kind=greeting: short social openers (hi, hello, hey, namaste, yo)
- kind=check_expiry: mentions expiry/losing/deadline/running out
- kind=transfer: mentions transfer/convert/miles/airline/krisflyer/vistara/marriott
- kind=redeem: mentions redeem/book/use my points/spend/cash in
- kind=explore_benefits: anything about what to do, where to go, specific experiences
- urgency=true: user signals time pressure around expiry
- category: infer from context (flights/hotels→TRAVEL, food→DINING, movie→ENTERTAINMENT, etc.)
- card_id: only set if user names a specific card
- journey_type: choose the closest real-world journey
- slots: only include clearly stated structured details (for example style, destination, budget, room_type, required_products)
"""

_RERANK_SYSTEM = """You are CredArt's recommendation engine. You receive a ranked candidate list (already scored by a deterministic engine) and the user's message, and you write a concise, helpful reply.

Rules — STRICTLY enforced:
1. Only reference candidates from the provided list. Never invent benefits, points values, or ₹ amounts.
2. Pick the 1-2 most relevant candidates given the user's actual intent.
3. If a candidate is unaffordable, mention it only if it's close (within 20% of balance).
4. If points are expiring soon (expiry_urgent=true), lead with that urgency.
5. Mention the card name and points cost when relevant.
6. Reply in 2-4 sentences. Friendly but concise. Address user by first name.
7. Do not repeat the candidates JSON back. Do not use bullet points. Plain prose only.
"""


def _candidates_to_json(candidates: list[Any], user_name: str, user_message: str) -> str:
    data = {
        "user_name": user_name.split()[0] if user_name else "there",
        "user_message": user_message,
        "candidates": [
            {
                "rank": c.rank,
                "kind": c.kind,
                "card_name": c.card_name,
                "label": c.label,
                "category": c.category,
                "points_cost": c.points_cost,
                "affordable": c.affordable,
                "expiry_urgent": c.expiry_urgent,
                "effective_value_inr": c.effective_value_inr,
                "best_use_case": c.best_use_case,
                "note": c.note,
                "score_total": round(c.score_total, 1) if c.score_total is not None else None,
            }
            for c in candidates
        ],
    }
    return json.dumps(data, ensure_ascii=False)


async def _groq_chat(system: str, user: str) -> str:
    from groq import AsyncGroq
    client = AsyncGroq(api_key=GROQ_API_KEY)
    resp = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        max_tokens=512,
    )
    return resp.choices[0].message.content.strip()


async def _gemini_chat(system: str, user: str) -> str:
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    resp = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=f"{system}\n\nUser: {user}",
    )
    return resp.text.strip()


async def _llm_call(system: str, user: str) -> tuple[str, bool]:
    """Returns (text, groq_used). Falls back to Gemini on Groq failure."""
    if GROQ_API_KEY:
        try:
            return await _groq_chat(system, user), True
        except Exception as e:
            print(f"[llm] Groq failed ({e}), falling back to Gemini")
    if GEMINI_API_KEY:
        return await _gemini_chat(system, user), False
    raise RuntimeError("No LLM API key available (GROQ_API_KEY or GEMINI_API_KEY required)")


async def llm_extract_intent(message: str) -> dict | None:
    """Returns parsed intent dict or None on failure (caller falls back to heuristic)."""
    try:
        raw, _ = await _llm_call(_INTENT_SYSTEM, message)
        # Strip markdown fences if model wraps in ```json
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)
    except Exception as e:
        print(f"[llm] intent parse failed ({e}), using heuristic fallback")
        return None


async def llm_rerank_reply(
    candidates: list[Any],
    user_name: str,
    user_message: str,
) -> tuple[str, bool]:
    """Returns (reply_text, groq_used). Falls back to None — caller uses template reply."""
    payload = _candidates_to_json(candidates, user_name, user_message)
    return await _llm_call(_RERANK_SYSTEM, payload)
