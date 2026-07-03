"""LLM service — Groq primary (llama-3.3-70b-versatile), Gemini fallback.

Anti-hallucination contract:
  - LLM receives ONLY the pre-validated candidate set from Layer 1.
  - LLM NEVER queries the DB.
  - All ₹ values and points figures come from candidates — LLM may not invent them.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Groq keys, tried in order: primary GROQ_API_KEY, then GROQ_API_KEY_2/_3…, then any
# comma-separated GROQ_API_KEYS. When one key is rate-limited/exhausted we rotate to
# the next before falling back to Gemini — so a burned free-tier daily quota on one
# key doesn't take the LLM layer down.
def _collect_groq_keys() -> list[str]:
    keys: list[str] = []
    for name in ("GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4"):
        v = (os.getenv(name) or "").strip()
        if v:
            keys.append(v)
    for v in (os.getenv("GROQ_API_KEYS") or "").split(","):
        v = v.strip()
        if v:
            keys.append(v)
    # de-dup, preserve order
    seen: set[str] = set()
    return [k for k in keys if not (k in seen or seen.add(k))]


GROQ_API_KEYS = _collect_groq_keys()
GROQ_API_KEY = GROQ_API_KEYS[0] if GROQ_API_KEYS else ""  # back-compat
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
- journey_type: choose the closest real-world journey. IMPORTANT:
  * buying a physical product/gadget/merchandise with points (phone, laptop, headphones,
    watch, appliance, phone stand, shoes, anything orderable) → product_purchase
  * a gift for someone → gift_purchase
  * a brand voucher/gift card (Amazon, Swiggy, Flipkart) → voucher_redemption
  * flights/"fly"/airport → travel_flight; hotels/stay/resort → travel_hotel
  * only use general_reward_advice when the user is vague with no concrete goal
- slots: extract any clearly stated structured details. Common keys: origin, destination, departure_window (date or "this weekend"), passengers, cabin_class, check_in_window, nights, guests, room_type, style, budget, required_products, recipient_type, occasion, goal
- origin/destination: city names as-is (don't convert to IATA codes)
- departure_window: any date expression ("28th June", "this weekend", "next Friday", "2026-06-28")
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


# Hard per-request ceiling so a hung provider can never stall a chat turn —
# the callers all degrade gracefully (heuristic intent, template reply).
_LLM_TIMEOUT_S = 20.0


async def _groq_chat(system: str, user: str, json_mode: bool = False) -> str:
    """Try each Groq key in turn; raise only if every key fails (rate-limit etc.)."""
    from groq import AsyncGroq
    last_exc: Exception | None = None
    for i, key in enumerate(GROQ_API_KEYS):
        try:
            # max_retries=0: key rotation is our retry — SDK-internal retries would
            # stack timeouts and stall the turn instead.
            client = AsyncGroq(api_key=key, timeout=_LLM_TIMEOUT_S, max_retries=0)
            resp = await client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
                max_tokens=512,
                **({"response_format": {"type": "json_object"}} if json_mode else {}),
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:  # noqa: BLE001
            last_exc = e
            print(f"[llm] Groq key #{i + 1} failed ({e}); trying next key")
    raise last_exc or RuntimeError("no Groq API keys configured")


async def _gemini_chat(system: str, user: str) -> str:
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    resp = await asyncio.wait_for(
        client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{system}\n\nUser: {user}",
        ),
        timeout=_LLM_TIMEOUT_S,
    )
    return resp.text.strip()


async def _llm_call(system: str, user: str, *, json_mode: bool = False) -> tuple[str, bool]:
    """Returns (text, groq_used). Falls back to Gemini after all Groq keys fail.

    `json_mode=True` asks Groq for a guaranteed-JSON response (the prompt must
    mention JSON, which all structured prompts here do); Gemini replies are
    stripped of markdown fences by the callers as before.
    """
    if GROQ_API_KEYS:
        try:
            return await _groq_chat(system, user, json_mode=json_mode), True
        except Exception as e:
            print(f"[llm] all Groq keys failed ({e}), falling back to Gemini")
    if GEMINI_API_KEY:
        return await _gemini_chat(system, user), False
    raise RuntimeError("No LLM API key available (GROQ_API_KEY or GEMINI_API_KEY required)")


async def llm_extract_intent(
    message: str,
    history: list[dict] | None = None,
    partial_intent: dict | None = None,
) -> dict | None:
    """Returns parsed intent dict or None on failure (caller falls back to heuristic).

    When history/partial_intent provided, the message is treated as a follow-up
    answer so the LLM can extract slot values in context (e.g. "28th June" → departure_window).
    """
    try:
        if history or partial_intent:
            context_note = ""
            if partial_intent:
                context_note = f"\nCurrent partial intent: {json.dumps(partial_intent)}\n"
            if history:
                last = history[-4:]
                context_note += "\nRecent conversation:\n" + "\n".join(
                    f"{m['role'].upper()}: {m['content']}" for m in last
                )
            user_payload = f"{context_note}\nNew user message: {message}\n\nExtract updated intent including any slot values the user just provided (e.g. city names, dates, passenger counts, cabin class, budgets). If this message is answering a previous question, set kind=unknown so the prior intent kind is preserved."
            raw, _ = await _llm_call(_INTENT_SYSTEM, user_payload, json_mode=True)
        else:
            raw, _ = await _llm_call(_INTENT_SYSTEM, message, json_mode=True)
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


_COMPLETENESS_SYSTEM = """You are a slot-completeness checker for CredArt.

Given a partial intent dict, the conversation history, and (optionally) a list of
candidate results already fetched, decide if you have enough information to give a
useful, personalised recommendation. Return ONLY valid JSON — no markdown.

Schema:
{
  "is_complete": true/false,
  "follow_up_question": "<one focused question to ask the user, or null if complete>"
}

Rules:
- travel_flight needs: origin (IATA or city), destination (IATA or city), depart_date
- travel_hotel needs: destination, check_in date, number of nights
- home_setup needs: room_type or required_products
- product_purchase / gift_purchase needs: what item, budget or points range
- transfer_partner_redemption needs: a goal (best value / specific airline). Once a
  goal or airline preference is known, mark complete — the candidates ARE the answer.
- general_reward_advice / card_benefit_lookup: always complete — no follow-up
- points_expiry_help: always complete
- Only ask ONE question per turn. Pick the single most valuable missing slot.
- If slots dict already has the info, mark complete even if intent.kind is vague.
- When candidates are provided: review them. If they all share an ambiguity you
  could resolve (e.g. economy vs business, specific city vs region), ask. If they
  are a good match, mark complete. Two or more good candidates → almost always complete.
- NEVER ask for information the system already owns: card IDs, card/account numbers,
  point balances, user IDs, internal references. The user only answers about their
  own intent (trip details, preferences, budget, recipient) — never system internals.
- Never ask a question whose answer is already in history or slots.
- Prefer completeness. Ask at most one clarifying question after candidates exist;
  if you already asked one, mark complete.
"""


async def llm_check_completeness(
    intent: dict,
    history: list[dict],
    candidates: list[dict] | None = None,
) -> tuple[bool, str | None]:
    """Returns (is_complete, follow_up_question). Never raises — caller catches."""
    payload_obj: dict = {"intent": intent, "history": history[-6:]}
    if candidates:
        # Send only lightweight candidate summaries — keep prompt small.
        payload_obj["candidates"] = [
            {"label": c.get("label", ""), "category": c.get("category", ""),
             "points_cost": c.get("points_cost"), "kind": c.get("kind", "")}
            for c in candidates[:6]
        ]
    payload = json.dumps(payload_obj, default=str)
    raw, _ = await _llm_call(_COMPLETENESS_SYSTEM, payload, json_mode=True)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    parsed = json.loads(raw)
    return bool(parsed.get("is_complete", True)), parsed.get("follow_up_question")
