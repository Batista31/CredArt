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
  "origin": "<3-letter IATA code of departure airport, or null>",
  "destination": "<3-letter IATA code of the place the user wants to fly to, or null>",
  "depart_date": "<YYYY-MM-DD if a travel date is stated or implied, else null>"
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
- destination: ONLY when the user wants to fly somewhere; convert the city to its main
  IATA code (Mumbai→BOM, Delhi→DEL, Bangalore→BLR, Goa→GOI, Dubai→DXB, London→LHR,
  Singapore→SIN, New York→JFK, Bangkok→BKK, Maldives→MLE). Else null.
- origin: only if the user states where they fly FROM; convert to IATA. Else null.
- depart_date: resolve relative dates (next month, next friday, in 2 weeks) to an
  absolute YYYY-MM-DD using the current date provided below. Else null.
"""

_COMPLETENESS_SYSTEM = """You are a conversational intent-gathering assistant for CredArt, a credit card rewards concierge.

Your goal is to collect ALL the important details needed to give a truly personalised recommendation. A recommendation made without key context is generic — not useful. Only surface results once you have everything that meaningfully changes what to recommend.

Intent kinds that are ALWAYS complete (never ask anything):
  greeting, check_expiry, transfer, unknown

For all other intents, gather the following before marking complete.
Check the conversation history carefully — skip any question already answered.

TRAVEL — flights (destination is set, or user mentioned flying/flight/trip):
  Gather in order of importance:
  1. Destination — where are they flying to?
  2. Travel date — when do they want to fly? (departure date only — do NOT ask about return date or return flights)
  3. Number of passengers — how many people are travelling?
  4. Cabin class — economy, business, or first class?

TRAVEL — general (no explicit flight, user asking about travel benefits/hotels/lounges):
  Always complete — show transfer partners and travel perks.

DINING:
  Gather in order of importance:
  1. Date and time — when are they planning to dine?
  2. Party size — how many people?
  3. Occasion — birthday, anniversary, date night, business, casual? (ONLY mark this answered if the user explicitly stated an occasion; "Italian" is NOT an occasion)
  4. Cuisine preference — any specific cuisine in mind? (ONLY mark this answered if the user named a cuisine like Italian, Indian, Chinese, Continental etc.; "Anniversary" is NOT a cuisine)

SHOPPING:
  Gather in order of importance:
  1. What they want to buy — specific item or category?
  2. Budget — how much are they looking to spend?
  3. Brand preference — any preferred brands?

ENTERTAINMENT (movies, concerts, events, shows):
  Gather in order of importance:
  1. Type — movie, concert, sports, theatre?
  2. Date — when?
  3. Number of people — how many tickets?

WELLNESS (gym, spa, fitness, health):
  Gather in order of importance:
  1. Type of activity — gym membership, spa, yoga, physiotherapy?
  2. Location preference — which area or city?

Rules:
  1. NEVER ask for information already present in the conversation history.
  2. Ask ONE question per turn — the next most important missing piece from the list above.
  3. Be friendly and natural — one short sentence, the way a human concierge would ask.
  4. If is_complete is true, follow_up_question MUST be null.
  5. Do NOT mark complete until all the listed fields for that category have been gathered.

Return ONLY valid JSON — no markdown, no explanation:
{
  "is_complete": true or false,
  "follow_up_question": "<one sentence, or null>"
}
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


async def llm_extract_intent(message: str, conversation_history: list[dict] | None = None) -> dict | None:
    """Returns parsed intent dict or None on failure (caller falls back to heuristic)."""
    from datetime import date
    context = ""
    if conversation_history:
        lines = "\n".join(
            f"{t['role'].upper()}: {t['content']}"
            for t in conversation_history[-6:]
        )
        context = f"\n\nPrior conversation (use this to understand what the current message is answering):\n{lines}"
    system = f"{_INTENT_SYSTEM}{context}\n\nThe current date is {date.today().isoformat()}."
    try:
        raw, _ = await _llm_call(system, message)
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


async def llm_check_completeness(
    intent: dict,
    conversation_history: list[dict],
) -> tuple[bool, str | None]:
    """Returns (is_complete, follow_up_question). Fallback: (True, None) on any error."""
    payload = json.dumps({
        "intent": intent,
        "conversation": [
            {"role": t["role"], "content": t["content"]}
            for t in conversation_history[-16:]
        ],
    }, ensure_ascii=False)
    try:
        raw, _ = await _llm_call(_COMPLETENESS_SYSTEM, payload)
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(raw)
        is_complete = bool(data.get("is_complete", True))
        follow_up = data.get("follow_up_question") or None
        if not is_complete and not follow_up:
            return True, None  # no question to ask → treat as complete
        return is_complete, follow_up
    except Exception as e:
        print(f"[llm] completeness check failed ({e}), treating as complete")
        return True, None
