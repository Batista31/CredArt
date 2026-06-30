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

import json

from .llm_service import _llm_call

# Journeys that are exploratory enough to benefit from guided questioning.
# Instant/lookup journeys skip the planner entirely.
PLANNED_JOURNEYS = {
    "travel_flight", "travel_hotel", "product_purchase", "gift_purchase",
    "voucher_redemption", "home_setup", "merchandise_purchase",
}

_SYSTEM = """You are CredArt's context-gathering planner for an HDFC credit-card rewards concierge.

Your job: look at the user's goal, what they have ALREADY told you (known_slots), and the
recent conversation, then decide the single most useful next thing to say so that — once you
have enough context — CredArt can recommend the best way to use their points/credits.

Return ONLY valid JSON, no markdown:
{
  "ready": true | false,
  "slot": "<machine key for the info this question gathers, e.g. departure_window, party_composition, stay_preference>",
  "question": "<ONE warm, natural question to ask the user, or null if ready>",
  "confirmation": "<a one-line recap of what you've gathered, shown when ready becomes true, or null>"
}

Rules:
- Ask ONE question at a time. Be warm and concrete, like a good travel agent.
- Gather the genuinely decision-relevant context for the journey before recommending:
  * travel_flight / travel_hotel: destination, travel dates (and confirm them), how many
    people and their composition (adults/children), and whether they also want a stay/flight.
  * product_purchase / merchandise_purchase: what item, any spec/preference, budget feel.
  * gift_purchase: who it's for, the occasion, budget feel.
  * voucher_redemption: which brand/use, rough value.
- Use known_slots: NEVER re-ask something already answered. If the user gave dates like
  "next weekend" then said "16 July", treat the explicit date as the answer.
- profile_defaults holds values from the user's SAVED profile (e.g. their usual party
  size or preferred airline). These are NOT answers — treat them as a default to CONFIRM,
  never as already-decided. For a slot that has a profile default and is NOT yet in
  known_slots, ask a CONFIRM question instead of an open one — e.g. instead of "How many
  people are travelling?" say "Booking for your usual 2, or different this time?" — and
  always leave an easy way to change it. NEVER silently skip a slot just because it has a
  default; the user must still get to confirm or correct it. If the slot is already in
  known_slots, it's answered — don't re-ask.
- Do a brief CONFIRMATION before going ready when it adds clarity (e.g. confirm the dates
  or party). When you confirm and they agree, set ready=true on the next turn.
- After 3-4 useful questions, or once you can give a genuinely helpful recommendation, set
  ready=true. Do not interrogate endlessly.
- NEVER ask for information the system already owns: card IDs, card/account numbers, point
  balances, user IDs. Only ask about the user's own intent and preferences.
- When ready=true, set question=null and fill confirmation with a short recap like
  "From what you've told me (2 adults + 1 child, Fri–Sun in Manali), here's the best way
  to use your points:".
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
    payload = json.dumps({
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
