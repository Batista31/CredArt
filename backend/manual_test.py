"""Manual recommendation tester — see the ranked candidates for a user + query.

Drives the real pipeline (intent extraction -> orchestrator -> 5-dim scoring ->
candidates) IN-PROCESS, but forces the intent to 'complete' so you always get
recommendations straight away — no follow-up questions, no chat-LLM dependency.
This is for testing the RECOMMENDATION part: what gets surfaced and how it ranks.

Usage (from backend/):
    .venv\\Scripts\\python manual_test.py riya   "what should I do with my points"
    .venv\\Scripts\\python manual_test.py samyak "what should I do with my points"
    .venv\\Scripts\\python manual_test.py riya   "I want a nice dinner"
    .venv\\Scripts\\python manual_test.py samyak "show me travel options"

Tip — the headline demo: run the SAME open-ended query for both users and watch
the lists differ (Riya leans travel, Samyak leans dining) purely from preferences:
    .venv\\Scripts\\python manual_test.py riya   "what can I do with my points"
    .venv\\Scripts\\python manual_test.py samyak "what can I do with my points"
"""

from __future__ import annotations

import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

USERS = {
    "riya":   "00000000-0000-0000-0000-000000000002",  # travel-leaning
    "samyak": "00000000-0000-0000-0000-000000000001",  # dining-leaning
}


async def run(who: str, message: str) -> None:
    from api.intent import extract_intent
    from api.orchestrator import orchestrate
    from services import bank_mcp_client, user_service

    uid = USERS[who]
    await bank_mcp_client.startup()
    try:
        user = await user_service.get_user(uid)
        cards = await user_service.get_user_cards(uid)

        # Extract intent normally (LLM or heuristic), then force-complete it so we
        # skip the follow-up-question step and go straight to recommendations.
        intent = await extract_intent(message)
        intent.is_complete = True
        intent.follow_up_question = None

        cands, _, meta = await orchestrate(intent, user, cards)
    finally:
        await bank_mcp_client.shutdown()

    print()
    print(f"  {who.upper()}  —  \"{message}\"")
    print(f"  intent: kind={intent.kind}  category={intent.category}")
    print()
    if not cands:
        print("  (no candidates)")
        return
    print(f"  {'#':>2}  {'CATEGORY':13} {'LABEL':34} {'PTS':>7}  AFF  SCORE")
    print("  " + "-" * 74)
    for c in cands:
        lab = (c.label or "")[:34]
        pts = c.points_cost if c.points_cost is not None else ""
        aff = "" if c.affordable is None else ("yes" if c.affordable else "no")
        print(f"  {c.rank:>2}  {(c.category or '-'):13} {lab:34} "
              f"{str(pts):>7}  {aff:>3}  {c.score_total}")
    print()


def main() -> None:
    if len(sys.argv) < 3 or sys.argv[1].lower() not in USERS:
        print(__doc__)
        sys.exit(1)
    asyncio.run(run(sys.argv[1].lower(), sys.argv[2]))


if __name__ == "__main__":
    main()
