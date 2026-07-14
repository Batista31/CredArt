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
import re
import time
from collections import OrderedDict
from typing import Any, Literal

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, field_validator

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

Extract the user's intent from their message and return ONLY valid JSON — no markdown, no explanation outside the JSON.

Schema (fill "reasoning" FIRST, before deciding the other fields — think through the
ambiguity in 1 short sentence, then let that reasoning drive kind/journey_type/slots):
{
  "reasoning": "<one short sentence: what is the user actually asking for, and why>",
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

Examples (user message → JSON you return):

"I want to buy an iPhone with my points"
{"reasoning":"user wants to purchase a physical device using points — that's a product purchase, not a gift or voucher","kind":"redeem","query":"I want to buy an iPhone with my points","card_id":null,"category":"SHOPPING","urgency":false,"journey_type":"product_purchase","slots":{"product_category":"iphone"}}

"need a gift for my mum's birthday, around 20k points"
{"reasoning":"item is explicitly for someone else (mum) on an occasion (birthday) — gift_purchase, not product_purchase","kind":"redeem","query":"need a gift for my mum's birthday, around 20k points","card_id":null,"category":"SHOPPING","urgency":false,"journey_type":"gift_purchase","slots":{"recipient_type":"mother","occasion":"birthday","budget":"20000 points"}}

"get me an Amazon voucher"
{"reasoning":"explicitly names a brand voucher/gift card, not a physical product — voucher_redemption","kind":"redeem","query":"get me an Amazon voucher","card_id":null,"category":"SHOPPING","urgency":false,"journey_type":"voucher_redemption","slots":{"brand":"Amazon"}}

"fly me and my wife to Goa from Mumbai this weekend on my Infinia"
{"reasoning":"flight request with named origin/destination/dates/card — travel_flight with full slots","kind":"redeem","query":"fly me and my wife to Goa from Mumbai this weekend on my Infinia","card_id":"hdfc_infinia","category":"TRAVEL","urgency":false,"journey_type":"travel_flight","slots":{"origin":"Mumbai","destination":"Goa","departure_window":"this weekend","passengers":2}}

"can I transfer points to KrisFlyer?"
{"reasoning":"explicitly asks about transferring points to a named airline partner — transfer_partner_redemption, not a general travel lookup","kind":"transfer","query":"can I transfer points to KrisFlyer?","card_id":null,"category":"TRAVEL","urgency":false,"journey_type":"transfer_partner_redemption","slots":{"goal":"krisflyer"}}

"setting up my new living room, need a sofa and a rug"
{"reasoning":"multiple home furnishing items for a named room — this is home_setup, not a single product_purchase","kind":"redeem","query":"setting up my new living room, need a sofa and a rug","card_id":null,"category":"SHOPPING","urgency":false,"journey_type":"home_setup","slots":{"room_type":"living room","required_products":["sofa","rug"]}}

"my points are expiring next month, what should I do"
{"reasoning":"user is worried about points expiring soon — check_expiry with urgency, journey is points_expiry_help","kind":"check_expiry","query":"my points are expiring next month, what should I do","card_id":null,"category":null,"urgency":true,"journey_type":"points_expiry_help","slots":{}}

"what can I even do with my points?"
{"reasoning":"vague opener with no concrete goal or category — general_reward_advice","kind":"explore_benefits","query":"what can I even do with my points?","card_id":null,"category":null,"urgency":false,"journey_type":"general_reward_advice","slots":{}}
"""

# ---------------------------------------------------------------------------
# Structured-output schemas + validation
# ---------------------------------------------------------------------------

_INTENT_KINDS = ("greeting", "check_expiry", "explore_benefits", "redeem", "transfer", "unknown")
_CATEGORIES = ("TRAVEL", "DINING", "ENTERTAINMENT", "SHOPPING", "WELLNESS")
_CARD_IDS = ("hdfc_infinia", "hdfc_regalia_gold", "hdfc_millennia")
_JOURNEY_TYPES = (
    "travel_flight", "travel_hotel", "product_purchase", "home_setup", "gift_purchase",
    "voucher_redemption", "cashback_or_statement_credit", "transfer_partner_redemption",
    "card_benefit_lookup", "points_expiry_help", "general_reward_advice",
)


class IntentModel(BaseModel):
    """Validates the LLM's intent JSON. Off-enum values are coerced to safe
    defaults (not rejected) so one sloppy field doesn't discard a whole parse."""

    model_config = ConfigDict(extra="ignore")

    reasoning: str = ""
    kind: Literal[*_INTENT_KINDS] = "unknown"
    query: str = ""
    card_id: str | None = None
    category: str | None = None
    urgency: bool = False
    journey_type: str | None = None
    slots: dict[str, Any] = {}
    # Not in the prompt schema, but the model sometimes emits these top-level
    # and api/intent.py reads them — keep the old raw-dict passthrough behaviour.
    origin: str | None = None
    destination: str | None = None
    depart_date: str | None = None

    @field_validator("kind", mode="before")
    @classmethod
    def _coerce_kind(cls, v: Any) -> str:
        return v if v in _INTENT_KINDS else "unknown"

    @field_validator("card_id", mode="before")
    @classmethod
    def _coerce_card(cls, v: Any) -> str | None:
        return v if v in _CARD_IDS else None

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_category(cls, v: Any) -> str | None:
        v = v.upper().strip() if isinstance(v, str) else v
        return v if v in _CATEGORIES else None

    @field_validator("journey_type", mode="before")
    @classmethod
    def _coerce_journey(cls, v: Any) -> str | None:
        return v if v in _JOURNEY_TYPES else None

    @field_validator("urgency", mode="before")
    @classmethod
    def _coerce_urgency(cls, v: Any) -> bool:
        return bool(v)

    @field_validator("slots", mode="before")
    @classmethod
    def _coerce_slots(cls, v: Any) -> dict:
        return v if isinstance(v, dict) else {}


class ReplyModel(BaseModel):
    """Validates the combined reply+completeness JSON (one call replaces the old
    rerank-then-completeness pair — the reply was discarded whenever incomplete)."""

    model_config = ConfigDict(extra="ignore")

    reasoning: str = ""
    is_complete: bool = True
    follow_up_question: str | None = None
    reply: str | None = None

    @field_validator("follow_up_question", "reply", mode="before")
    @classmethod
    def _coerce_text(cls, v: Any) -> str | None:
        return v if isinstance(v, str) and v.strip() else None


# Groq structured-output schemas (constrained decoding). Not all models accept
# response_format=json_schema — _groq_chat degrades to json_object once and
# remembers, so at most one request ever pays for the failed attempt.
_INTENT_JSON_SCHEMA = {
    "name": "intent",
    "schema": {
        "type": "object",
        "properties": {
            "reasoning": {"type": "string"},
            "kind": {"type": "string", "enum": list(_INTENT_KINDS)},
            "query": {"type": "string"},
            "card_id": {"anyOf": [{"type": "string", "enum": list(_CARD_IDS)}, {"type": "null"}]},
            "category": {"anyOf": [{"type": "string", "enum": list(_CATEGORIES)}, {"type": "null"}]},
            "urgency": {"type": "boolean"},
            "journey_type": {"anyOf": [{"type": "string", "enum": list(_JOURNEY_TYPES)}, {"type": "null"}]},
            "slots": {"type": "object"},
        },
        "required": ["reasoning", "kind", "query", "card_id", "category", "urgency", "journey_type", "slots"],
        "additionalProperties": False,
    },
}

_REPLY_JSON_SCHEMA = {
    "name": "reply",
    "schema": {
        "type": "object",
        "properties": {
            "reasoning": {"type": "string"},
            "is_complete": {"type": "boolean"},
            "follow_up_question": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            "reply": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        },
        "required": ["reasoning", "is_complete", "follow_up_question", "reply"],
        "additionalProperties": False,
    },
}


# ---------------------------------------------------------------------------
# Intent-outcome logging — JSONL so misparses can be replayed into an eval set.
# ---------------------------------------------------------------------------

_LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
_INTENT_LOG = os.path.join(_LOG_DIR, "intent_log.jsonl")


def _log_intent(message: str, intent: dict | None, path: str) -> None:
    """path: shortcut | cache | groq | gemini | heuristic_fallback. Best-effort."""
    try:
        os.makedirs(_LOG_DIR, exist_ok=True)
        row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "path": path,
               "message": message, "intent": intent}
        with open(_INTENT_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Fast paths — greeting short-circuit + LRU cache for repeated messages
# ---------------------------------------------------------------------------

_GREETING_RE = re.compile(
    r"^(hi+|hello+|hey+|yo|namaste|hola|good\s+(morning|afternoon|evening)|sup|howdy)"
    r"[\s!.,]*(there|credart|team|bot)?[\s!.,]*$",
    re.IGNORECASE,
)

_INTENT_CACHE: OrderedDict[str, dict] = OrderedDict()
_INTENT_CACHE_MAX = 128


def _cache_get(key: str) -> dict | None:
    intent = _INTENT_CACHE.get(key)
    if intent is not None:
        _INTENT_CACHE.move_to_end(key)
        return dict(intent, slots=dict(intent.get("slots", {})))
    return None


def _cache_put(key: str, intent: dict) -> None:
    _INTENT_CACHE[key] = dict(intent, slots=dict(intent.get("slots", {})))
    _INTENT_CACHE.move_to_end(key)
    while len(_INTENT_CACHE) > _INTENT_CACHE_MAX:
        _INTENT_CACHE.popitem(last=False)

# Shared by the rerank-only path and the combined reply+completeness call, so the
# concierge's voice can't drift between them.
_REPLY_RULES = """1. Only reference candidates from the provided list. Never invent benefits, points values, or ₹ amounts.
1a. Quote every figure EXACTLY as it appears in the candidates. Do no arithmetic on them
   — no multiplying a points cost by the passenger count, no totalling two candidates, no
   converting points to ₹. A number you calculated is a number the engine never approved.
2. Pick the 1-2 most relevant candidates given the user's actual intent.
3. If a candidate is unaffordable, mention it only if it's close (within 20% of balance).
4. If points are expiring soon (expiry_urgent=true), lead with that urgency.
5. Mention the card name and points cost when relevant.
6. Reply in 2-4 sentences. Friendly but concise. Address the user by first name.
7. Do not repeat the candidates JSON back. Do not use bullet points. Plain prose only.

Voice — a good concierge sounds like a person, not a form letter. These rules govern HOW
you write once you have decided to reply. They NEVER influence WHETHER you have enough
information — decide that on the completeness rules alone, before you write a word:
8. OPEN WITH THE SUBSTANCE — the reward, the number, the urgency, the answer. Never
   open by announcing that you searched or found something. These openers are BANNED:
   "I've found a great option", "I found", "Great news", "Here's a great option",
   "I can help you with that", "Sure!", "Absolutely", "Good news".
   Bad:  "Hi Saket, I've found a great option for your flight to Goa."
   Good: "Saket, Mumbai→Goa on the 20th runs 25,000 points on your Infinia."
9. CUT EMPTY PRAISE. "This is a great way to use your points", "this is a great use of
   your rewards", "I think it's the best option for you" say nothing. If an option is
   genuinely good, say WHY in concrete terms — value per point, beats expiry, matches
   what they asked for — or say nothing at all.
10. VARY YOUR PHRASING between turns. Do not fall into one sentence template and reuse
   it. The user's first name is not required to be the first word of every reply.
11. Close by moving them forward (a next step, or a real choice between the two
   options) — not with a generic sign-off."""


_RERANK_SYSTEM = f"""You are CredArt's recommendation engine. You receive a ranked candidate list (already scored by a deterministic engine) and the user's message, and you write a concise, helpful reply.

Rules — STRICTLY enforced:
{_REPLY_RULES}
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

# Sampling, per call type. Structured extraction wants determinism (it's also what
# makes the intent LRU cache sound — same message, same parse); the concierge reply
# is prose a human reads, and 0.2 makes it read like a filled-in template.
# Both schemas now open with a "reasoning" field, so the budgets cover a sentence of
# chain-of-thought BEFORE the answer fields — too tight a cap truncates mid-JSON and
# the whole parse is lost, which costs far more than the extra tokens.
_TEMP_STRUCTURED = 0.2   # intent extraction
# The combined call writes prose AND makes two structured decisions (is_complete, which
# candidate wins), so it can't be sampled like free prose. Measured at 0.6: the
# is_complete gate went flaky (let a dateless flight through 1 run in 3) and the model
# started inventing arithmetic the engine never produced ("25,000 × 2 passengers =
# 50,000 points"), which breaks the anti-hallucination contract. Voice comes from the
# reply rules below, not from temperature — A/B'd, 0.6 barely moved the wording — so
# there's nothing to buy here and real stability to lose.
_TEMP_REPLY = 0.3
_MAX_TOKENS_INTENT = 800   # reasoning + 7 fields + a slots dict
_MAX_TOKENS_REPLY = 1000   # reasoning + follow-up + a 2-4 sentence reply
_MAX_TOKENS_DEFAULT = 512  # legacy rerank-only path


# Flips to False the first time Groq rejects response_format=json_schema for
# GROQ_MODEL, so we stop paying a failed round-trip on every structured call.
_GROQ_SCHEMA_OK = True


def _is_schema_rejection(e: Exception) -> bool:
    msg = str(e).lower()
    return "response_format" in msg or "json_schema" in msg


async def _groq_chat(
    system: str, user: str, json_mode: bool = False, json_schema: dict | None = None,
    temperature: float = _TEMP_STRUCTURED, max_tokens: int = _MAX_TOKENS_DEFAULT,
) -> str:
    """Try each Groq key in turn; raise only if every key fails (rate-limit etc.).

    When `json_schema` is given (and the model accepts it) the response is
    constrained-decoded against it — guaranteed shape, not just valid JSON.
    """
    global _GROQ_SCHEMA_OK
    from groq import AsyncGroq
    last_exc: Exception | None = None
    for i, key in enumerate(GROQ_API_KEYS):
        # max_retries=0: key rotation is our retry — SDK-internal retries would
        # stack timeouts and stall the turn instead.
        client = AsyncGroq(api_key=key, timeout=_LLM_TIMEOUT_S, max_retries=0)
        use_schema = json_schema is not None and _GROQ_SCHEMA_OK
        for attempt in range(2):  # at most: schema attempt, then json_object retry
            if use_schema:
                response_format: dict | None = {"type": "json_schema", "json_schema": json_schema}
            elif json_mode or json_schema is not None:
                response_format = {"type": "json_object"}
            else:
                response_format = None
            try:
                resp = await client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **({"response_format": response_format} if response_format else {}),
                )
                choice = resp.choices[0]
                # A truncated structured response is unparseable JSON — say so loudly
                # rather than letting the caller blame the model for "bad JSON".
                if choice.finish_reason == "length":
                    print(f"[llm] response hit max_tokens={max_tokens} and was truncated")
                return choice.message.content.strip()
            except Exception as e:  # noqa: BLE001
                if use_schema and _is_schema_rejection(e):
                    # Model doesn't support constrained decoding — remember and
                    # retry this same key immediately with plain json_object.
                    print(f"[llm] Groq rejected json_schema ({e}); degrading to json_object")
                    _GROQ_SCHEMA_OK = False
                    use_schema = False
                    continue
                last_exc = e
                print(f"[llm] Groq key #{i + 1} failed ({e}); trying next key")
                break
    raise last_exc or RuntimeError("no Groq API keys configured")


async def _gemini_chat(
    system: str, user: str,
    temperature: float = _TEMP_STRUCTURED, max_tokens: int = _MAX_TOKENS_DEFAULT,
) -> str:
    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    resp = await asyncio.wait_for(
        client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{system}\n\nUser: {user}",
            # Same sampling as the Groq path — the fallback shouldn't silently
            # answer at a different temperature (or truncate at a different cap).
            config={"temperature": temperature, "max_output_tokens": max_tokens},
        ),
        timeout=_LLM_TIMEOUT_S,
    )
    return resp.text.strip()


async def _llm_call(
    system: str, user: str, *, json_mode: bool = False, json_schema: dict | None = None,
    temperature: float = _TEMP_STRUCTURED, max_tokens: int = _MAX_TOKENS_DEFAULT,
) -> tuple[str, bool]:
    """Returns (text, groq_used). Falls back to Gemini after all Groq keys fail.

    `json_schema` constrains Groq's decoding to the given schema (with automatic
    degrade to json_object if unsupported); `json_mode=True` asks for guaranteed
    JSON (the prompt must mention JSON, which all structured prompts here do).
    Gemini replies are stripped of markdown fences by the callers as before.
    """
    if GROQ_API_KEYS:
        try:
            return await _groq_chat(system, user, json_mode=json_mode, json_schema=json_schema,
                                    temperature=temperature, max_tokens=max_tokens), True
        except Exception as e:
            print(f"[llm] all Groq keys failed ({e}), falling back to Gemini")
    if GEMINI_API_KEY:
        return await _gemini_chat(system, user, temperature=temperature, max_tokens=max_tokens), False
    raise RuntimeError("No LLM API key available (GROQ_API_KEY[2/3] or GEMINI_API_KEY required)")


async def llm_extract_intent(
    message: str,
    history: list[dict] | None = None,
    partial_intent: dict | None = None,
) -> dict | None:
    """Returns parsed intent dict or None on failure (caller falls back to heuristic).

    When history/partial_intent provided, the message is treated as a follow-up
    answer so the LLM can extract slot values in context (e.g. "28th June" → departure_window).
    """
    contextless = not history and not partial_intent
    if contextless:
        # Fast path 1: greetings never need an LLM round-trip.
        if _GREETING_RE.match((message or "").strip()):
            intent = {"kind": "greeting", "query": message, "card_id": None,
                      "category": None, "urgency": False, "journey_type": None, "slots": {}}
            _log_intent(message, intent, "shortcut")
            return intent
        # Fast path 2: repeated identical messages (intents are message-deterministic).
        cache_key = (message or "").strip().lower()
        cached = _cache_get(cache_key)
        if cached is not None:
            _log_intent(message, cached, "cache")
            return dict(cached, query=message)

    try:
        if history or partial_intent:
            context_note = ""
            if partial_intent:
                context_note = f"\nCurrent partial intent: {json.dumps(partial_intent)}\n"
            if history:
                last = history[-10:]
                context_note += "\nRecent conversation:\n" + "\n".join(
                    f"{m['role'].upper()}: {m['content']}" for m in last
                )
            user_payload = f"{context_note}\nNew user message: {message}\n\nExtract updated intent including any slot values the user just provided (e.g. city names, dates, passenger counts, cabin class, budgets). If this message is answering a previous question, set kind=unknown so the prior intent kind is preserved."
            raw, groq_used = await _llm_call(_INTENT_SYSTEM, user_payload, json_schema=_INTENT_JSON_SCHEMA,
                                            temperature=_TEMP_STRUCTURED, max_tokens=_MAX_TOKENS_INTENT)
        else:
            raw, groq_used = await _llm_call(_INTENT_SYSTEM, message, json_schema=_INTENT_JSON_SCHEMA,
                                            temperature=_TEMP_STRUCTURED, max_tokens=_MAX_TOKENS_INTENT)
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        intent = IntentModel.model_validate(json.loads(raw)).model_dump()
        if not intent.get("query"):
            intent["query"] = message or ""
        if contextless:
            _cache_put(cache_key, intent)
        _log_intent(message, intent, "groq" if groq_used else "gemini")
        return intent
    except Exception as e:  # noqa: BLE001 — includes ValidationError from IntentModel
        print(f"[llm] intent parse failed ({e}), using heuristic fallback")
        _log_intent(message, None, "heuristic_fallback")
        return None


async def llm_rerank_reply(
    candidates: list[Any],
    user_name: str,
    user_message: str,
) -> tuple[str, bool]:
    """Returns (reply_text, groq_used). Falls back to None — caller uses template reply."""
    payload = _candidates_to_json(candidates, user_name, user_message)
    return await _llm_call(_RERANK_SYSTEM, payload,
                           temperature=_TEMP_REPLY, max_tokens=_MAX_TOKENS_DEFAULT)


_REPLY_COMPLETENESS_SYSTEM = """You are CredArt's recommendation engine, a credit card rewards concierge.

You receive the user's message, their partial intent, recent conversation history, and
a ranked candidate list (already scored by a deterministic engine). In ONE response you
must BOTH decide whether you have enough information to recommend, AND write the reply.
Return ONLY valid JSON — no markdown.

Schema (fill "reasoning" FIRST — decide in 1-2 short sentences which slots you actually
have, whether the candidates answer the user's real ask, and which candidate is best;
then let that reasoning drive the other fields):
{
  "reasoning": "<1-2 sentences: what's known, what's missing, which candidate wins and why>",
  "is_complete": true/false,
  "follow_up_question": "<one focused question to ask the user, or null if complete>",
  "reply": "<the recommendation reply to show the user if complete, else null>"
}

Completeness rules — decide this FIRST, before writing anything:
- These are HARD requirements. If a journey's required slot is missing from both the
  intent slots and the conversation history, is_complete MUST be false and you MUST ask
  for it. A ranked candidate list does NOT substitute for a missing required slot — you
  cannot book a flight without a date, however good the candidates look.
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
- Once every required slot above IS present, prefer completeness: if the candidates all
  share a resolvable ambiguity (e.g. economy vs business, specific city vs region), ask
  about it — otherwise two or more good candidates means complete. This preference is
  about ambiguity only; it never excuses a missing required slot.
- NEVER ask for information the system already owns: card IDs, card/account numbers,
  point balances, user IDs, internal references. The user only answers about their
  own intent (trip details, preferences, budget, recipient) — never system internals.
- Never ask a question whose answer is already in history or slots.
- Don't stack questions: ask at most one clarifying question beyond the required slots,
  and if you already asked one earlier in the history, mark complete. (A missing REQUIRED
  slot is never "a clarifying question" — it is always asked, however many turns it takes.)

Worked example — the required-slot gate beating a strong candidate list:
  intent: journey_type=travel_flight, slots={origin: Mumbai, destination: Goa}
  candidates: a Mumbai→Goa flight for 25,000 pts, a Taj voucher for 15,000 pts
  The flight candidate looks like a perfect answer, but depart_date is missing, so:
  {"reasoning":"origin and destination are known and the flight candidate matches, but
  travel_flight requires depart_date and neither slots nor history has one",
  "is_complete":false,"follow_up_question":"Saket, what date do you want to fly out?",
  "reply":null}

Reply rules (when is_complete=true) — STRICTLY enforced:
""" + _REPLY_RULES + """

The same voice rules apply to follow_up_question: ask it straight, no "I'd be happy to
help you with that!" preamble.
"""


async def llm_reply_with_completeness(
    candidates: list[Any],
    user_name: str,
    user_message: str,
    intent: dict,
    history: list[dict],
) -> tuple[bool, str | None, str | None, bool]:
    """One combined post-candidate call: completeness check + reply writing.

    Returns (is_complete, follow_up_question, reply, groq_used). Replaces the old
    two-round llm_rerank_reply + llm_check_completeness sequence — halving the
    post-candidate LLM latency per turn. May raise; callers fall back to the
    template reply with is_complete=True.
    """
    payload_obj = json.loads(_candidates_to_json(candidates, user_name, user_message))
    payload_obj["intent"] = intent
    payload_obj["history"] = history[-10:]
    payload = json.dumps(payload_obj, ensure_ascii=False, default=str)
    raw, groq_used = await _llm_call(
        _REPLY_COMPLETENESS_SYSTEM, payload, json_schema=_REPLY_JSON_SCHEMA,
        temperature=_TEMP_REPLY, max_tokens=_MAX_TOKENS_REPLY)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    parsed = ReplyModel.model_validate(json.loads(raw))
    return parsed.is_complete, parsed.follow_up_question, parsed.reply, groq_used
