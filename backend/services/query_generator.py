"""Query Generator — LLM-driven context-question planner.

Given the user's goal, what they've already told us (known_slots), and the recent
conversation, decide the SINGLE most useful next question to ask before fetching
rewards — or signal that we have enough context to recommend.

This is the conversational brain that makes CredArt ask *good* questions
("how many people?", "which dates?", "have you thought about the stay?") instead
of dumping options immediately. It only plans QUESTIONS and a confirmation recap —
it never invents points values or availability (that stays in Layer 1).
"""

from __future__ import annotations

import datetime as _dt
import json

from .llm_service import _llm_call

# Journeys that are exploratory enough to benefit from guided questioning.
# Instant/lookup journeys skip the planner entirely.
# Travel journeys are intentionally NOT planned here: they use deterministic slot-filling
# (dialogue_manager._missing_slots) so every required detail — destination, origin, dates,
# passengers, cabin — is asked exactly once, one question at a time, with no LLM-driven
# "confirm the dates?" loop.
PLANNED_JOURNEYS = {
    "gift_purchase", "voucher_redemption", "home_setup", "merchandise_purchase",
}

_SYSTEM = """You are CredArt's context-gathering planner for an HDFC credit-card rewards concierge.

Your job: look at the user's goal, what they have ALREADY told you (known_slots), the recent
conversation, and today's date, then decide the single most useful next thing to say — or
signal that you have enough context to recommend the best way to use their points/credits.

Return ONLY valid JSON, no markdown:
{
  "ready": true | false,
  "slot": "<machine key for the info a question gathers, e.g. departure_window, destination>",
  "question": "<ONE warm, natural question to ask, or null if ready>",
  "confirmation": "<a one-line recap of what you've gathered, shown when ready becomes true, or null>"
}

How to gather context well — thorough, but never annoying:
- Collect the genuinely decision-relevant details for the journey before recommending, ONE
  question at a time, warm and concrete like a good assistant:
  * product_purchase / merchandise_purchase: what the item is, any key spec/preference, and
    a rough budget.
  * gift_purchase: who it's for, the occasion, and a rough budget.
  * voucher_redemption: which brand or use, and a rough value.
- Ask for what you don't yet know. Do NOT assume or invent details the user hasn't given.
- Do NOT recommend from a bare item/goal alone. Ask at least ONE useful question first —
  e.g. a rough budget, or a key preference/brand/spec — before setting ready=true. (If the
  user already gave a budget or clear preference, that counts; don't re-ask it.)
- BUT there is NO confirmation step. NEVER ask the user to confirm, re-state, or "just
  double-check" something they already told you. If a detail is in known_slots or the
  conversation, it is FINAL — use it and move to the next missing detail. Never ask the same
  thing twice, and never re-ask a slot that already has a value.
- Accept vague answers AS answers ("around 5k", "something nice", "you pick") and move on.
  Today's date is provided, so interpret any relative dates yourself rather than re-asking.
- profile_defaults holds saved-profile hints — apply them silently and mention in the recap;
  do NOT turn them into questions.
- NEVER ask for information the system already owns: card IDs, card/account numbers, point
  balances, user IDs.
- Once you have the essentials, set ready=true, question=null, and put a short recap in
  confirmation, e.g. "Great — a mixer-grinder around ₹5,000, here's the best way to use your
  points:". Don't keep asking beyond what's needed.
"""


async def next_context_question(
    journey_type: str,
    known_slots: dict,
    history: list[dict],
    user_goal: str,
    profile_defaults: dict | None = None,
) -> dict:
    """Return {"ready": bool, "slot": str|None, "question": str|None, "confirmation": str|None}.

    `profile_defaults` carries saved-profile values (e.g. usual party size) that the
    planner should CONFIRM rather than ask open-ended — deliberately kept OUT of
    known_slots so the slot stays "unanswered" and the turn is never silently skipped.

    Never raises — on any failure returns ready=True so the flow proceeds to recommendations
    rather than blocking the user.
    """
    _today = _dt.date.today()
    payload = json.dumps({
        "today": _today.isoformat(),
        "weekday_today": _today.strftime("%A"),
        "journey_type": journey_type,
        "user_goal": user_goal,
        "known_slots": known_slots,
        "profile_defaults": profile_defaults or {},
        "history": (history or [])[-6:],
    }, default=str)
    try:
        raw, _ = await _llm_call(_SYSTEM, payload)
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(raw)
        return {
            "ready": bool(parsed.get("ready", True)),
            "slot": parsed.get("slot"),
            "question": parsed.get("question"),
            "confirmation": parsed.get("confirmation"),
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[query_generator] failed ({exc}), proceeding to recommendations")
        return {"ready": True, "slot": None, "question": None, "confirmation": None}
