"""Layer-2 guardrails: keep the LLM inside the deterministic boundary.

Three defenses, all cheap and synchronous:

1. verify_grounded_reply() — post-generation numeric grounding. Every significant
   number in the LLM's reply must already exist in the material it was shown
   (candidate payload + the user's own message). A number from nowhere is a
   hallucination → the caller discards the reply and uses the deterministic
   template. This makes the "every number is real" guarantee *checked*, not
   just prompted.

2. sanitize_user_message() — input hygiene before the message reaches any LLM:
   strips control characters, collapses whitespace, hard-caps length so a
   pasted wall of text (or prompt-injection payload) can't blow the prompt.

3. clamp_reply() — output hygiene: caps runaway replies and strips any
   role-play / system-prompt echoes the model might leak.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
from typing import Any

# --- 1. numeric grounding -----------------------------------------------------

_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")

# Numbers below this are conversational (counts, dates, "2 options") — never
# treated as claims. Points/₹ amounts that matter are always ≥ 100.
_SIGNIFICANT = 100


def _extract_numbers(text: str) -> set[float]:
    out: set[float] = set()
    for tok in _NUM_RE.findall(text or ""):
        try:
            out.add(float(tok.replace(",", "")))
        except ValueError:
            continue
    return out


def _allowed_numbers(payload_text: str, user_message: str = "") -> set[float]:
    allowed = _extract_numbers(payload_text) | _extract_numbers(user_message)
    year = _dt.date.today().year
    allowed |= {float(y) for y in range(year - 1, year + 3)}  # date mentions
    # Derived forms the LLM may legitimately produce from a grounded number:
    # thousands shorthand (32000 → 32, "32k points") and rounded-up hundreds.
    for n in list(allowed):
        if n >= 1000 and n % 1000 == 0:
            allowed.add(n / 1000)
    return allowed


def verify_grounded_reply(
    reply: str,
    grounding_payload: Any,
    user_message: str = "",
) -> tuple[bool, list[float]]:
    """Returns (ok, invented_numbers).

    grounding_payload: whatever was serialized into the LLM prompt (dict/list/str).
    Rule: any number ≥ 100 in the reply that does not appear in the payload or
    the user's own message is treated as invented.
    """
    if not reply:
        return True, []
    payload_text = grounding_payload if isinstance(grounding_payload, str) else json.dumps(
        grounding_payload, default=str, ensure_ascii=False
    )
    allowed = _allowed_numbers(payload_text, user_message)
    invented = [
        n for n in _extract_numbers(reply)
        if n >= _SIGNIFICANT and n not in allowed
    ]
    return (len(invented) == 0), invented


# --- 2. input hygiene ----------------------------------------------------------

_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MAX_USER_MSG = 1200  # chars — generous for real questions, blocks pasted walls


def sanitize_user_message(message: str) -> str:
    msg = _CTRL_RE.sub(" ", message or "")
    msg = re.sub(r"\s+", " ", msg).strip()
    return msg[:_MAX_USER_MSG]


# --- 3. output hygiene ---------------------------------------------------------

_MAX_REPLY = 900  # chars — rerank prompt asks for 2-4 sentences; this is a hard net
_LEAK_RE = re.compile(
    r"(as an ai|i am an ai|system prompt|my instructions|json payload|candidate list)",
    re.IGNORECASE,
)


def clamp_reply(reply: str) -> str:
    r = (reply or "").strip()
    if len(r) > _MAX_REPLY:
        # cut on a sentence boundary where possible
        cut = r[:_MAX_REPLY]
        dot = cut.rfind(". ")
        r = cut[: dot + 1] if dot > 200 else cut
    return r


def leaks_meta(reply: str) -> bool:
    """True when the reply talks about its own machinery instead of rewards."""
    return bool(_LEAK_RE.search(reply or ""))
