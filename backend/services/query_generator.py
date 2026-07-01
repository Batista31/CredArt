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
- Gather ONLY the genuinely decision-relevant context for the journey before recommending:
  * travel_flight / travel_hotel: destination, travel dates, and a total passenger/guest
    COUNT. That's it — do NOT ask for adult/child composition, cabin class, hotel style,
    or any other detail: this system prices every seat the same regardless of age, so
    composition is not decision-relevant. Once you have a number, you're done.
  * product_purchase / merchandise_purchase: what item. A rough budget/priority feel is
    ONLY worth asking if the item category is genuinely broad (e.g. "a gift" or "something
    for the kitchen") — for a specific, cheap, or ordinary item (a water bottle, a phone
    case, headphones under a few thousand rupees) go ready=true immediately once the item
    is known. Do not ask about material, size, brand, or "any other preference" — just search.
  * gift_purchase: who it's for and the occasion — nothing more.
  * voucher_redemption: which brand/use — nothing more.
- Use known_slots: NEVER re-ask something already answered, and NEVER ask a narrower
  version of a question you already asked (e.g. asking "any specific material?" after
  already asking about features counts as a repeat — don't do it).
- HARD CAP: at most ONE clarifying question for product-identity journeys (product_purchase,
  merchandise_purchase, voucher_redemption, gift_purchase). For travel_flight/travel_hotel/
  home_setup, at most TWO questions total, ever, for this conversation. Once you hit the
  cap, set ready=true even if some optional detail is still unknown — a good recommendation
  with a small gap beats interrogating the user.
- Do a brief CONFIRMATION before going ready only for travel (dates/party) — skip it for
  simple product/voucher/gift journeys, just go straight to ready=true.
- NEVER ask for information the system already owns: card IDs, card/account numbers, point
  balances, user IDs. Only ask about the user's own intent and preferences.
- When ready=true, set question=null and fill confirmation with a short recap like
  "From what you've told me (2 adults + 1 child, Fri–Sun in Manali), here's the best way
  to use your points:". For simple product/voucher lookups, confirmation can be null.
"""


# Hard caps enforced in code (not just prompted) — the LLM doesn't reliably
# self-limit, which is how a water bottle ended up with 3 rounds of questions.
_SIMPLE_JOURNEYS = {"product_purchase", "merchandise_purchase", "voucher_redemption", "gift_purchase"}
_QUESTION_CAP = {"travel_flight": 2, "travel_hotel": 2, "home_setup": 2}
_DEFAULT_CAP = 1  # simple/product-identity journeys


async def next_context_question(
    journey_type: str,
    known_slots: dict,
    history: list[dict],
    user_goal: str,
    questions_asked: int = 0,
) -> dict:
    """Return {"ready": bool, "slot": str|None, "question": str|None, "confirmation": str|None}.

    Never raises — on any failure returns ready=True so the flow proceeds to recommendations
    rather than blocking the user. `questions_asked` is a hard, code-enforced cap: once hit,
    ready=True regardless of what the LLM wants to ask next.
    """
    cap = _QUESTION_CAP.get(journey_type, _DEFAULT_CAP)
    if questions_asked >= cap:
        return {"ready": True, "slot": None, "question": None, "confirmation": None}
    payload = json.dumps({
        "journey_type": journey_type,
        "user_goal": user_goal,
        "known_slots": known_slots,
        "history": (history or [])[-6:],
        "questions_already_asked": questions_asked,
        "questions_remaining": cap - questions_asked,
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
