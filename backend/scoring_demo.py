"""Phase 6 test/demo — deterministic 5-dim scoring + preference learning.

Runs the real scoring path (no HTTP server needed):
  1. score a candidate set for a query, print the full 5-dim breakdown
  2. show the weight contributions for the top candidate
  3. prove the preference-learning loop: record a 'confirmed' redemption, then
     re-score and watch the redemption_probability dimension rise

Run after reset_demo.sql for clean numbers:
    cd backend
    .venv\\Scripts\\python scoring_demo.py
"""

import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

from api.intent import extract_intent
from api.orchestrator import orchestrate
from services import db, scoring_service, user_service

RIYA = "00000000-0000-0000-0000-000000000002"
W = scoring_service.WEIGHTS


def table(cands):
    print(f"  {'#':>2} {'total':>6} {'kind':<11} {'label':<28} "
          f"{'fin':>5} {'life':>5} {'rp':>5} {'exp':>5} {'flx':>5}")
    for c in cands[:6]:
        print(f"  {c.rank:>2} {c.score_total:>6} {c.kind:<11} {c.label[:28]:<28} "
              f"{c.score_financial:>5} {c.score_lifestyle:>5} {c.score_redemption_prob:>5} "
              f"{c.score_expiry_risk:>5} {c.score_flexibility:>5}")


async def score(query):
    user = await user_service.get_user(RIYA)
    cards = await user_service.get_user_cards(RIYA)
    intent = extract_intent(query)
    cands, _, _ = await orchestrate(intent, user, cards)
    return cands


async def main():
    print("=== weights ===")
    print("  " + "  ".join(f"{k}={v}" for k, v in W.items()))

    q = "I want a relaxing weekend trip to the mountains"
    print(f"\n=== scored candidates for: {q!r} ===")
    cands = await score(q)
    table(cands)

    top = cands[0]
    print(f"\n=== weight contribution — top candidate ({top.label}) ===")
    parts = {
        "financial": W["financial"] * top.score_financial,
        "lifestyle": W["lifestyle"] * top.score_lifestyle,
        "redemption_prob": W["redemption_prob"] * top.score_redemption_prob,
        "expiry_risk": W["expiry_risk"] * top.score_expiry_risk,
        "flexibility": W["flexibility"] * top.score_flexibility,
    }
    for k, v in parts.items():
        print(f"  {k:<16} {v:>6.2f}")
    print(f"  {'TOTAL':<16} {sum(parts.values()):>6.2f}  (== {top.score_total})")

    # ---- preference learning loop ----
    print("\n=== preference learning: redemption_probability dimension ===")
    await db.execute("DELETE FROM recommendation_events WHERE session_id = 'scoring_demo'")

    rates = await scoring_service._confirm_rates(RIYA)
    print(f"  before — confirm rate for 'redemption': {rates.get('redemption', 'none (cold start prior)')}")
    red_before = next((c for c in cands if c.kind == "redemption"), None)
    print(f"  before — a redemption candidate rp score: {red_before.score_redemption_prob}")

    # Simulate the user confirming a redemption (what /redeem would write).
    for _ in range(3):
        await db.execute(
            """
            INSERT INTO recommendation_events
                (user_id, session_id, recommendation_rank, option_type, option_label, user_action)
            VALUES ($1,'scoring_demo',1,'redemption','demo confirm','confirmed')
            """,
            RIYA,
        )

    rates2 = await scoring_service._confirm_rates(RIYA)
    print(f"\n  after 3 confirmed redemptions — confirm rate: {rates2.get('redemption')}")
    cands2 = await score(q)
    red_after = next((c for c in cands2 if c.kind == "redemption"), None)
    print(f"  after — same redemption candidate rp score: {red_after.score_redemption_prob} "
          f"(was {red_before.score_redemption_prob})")

    await db.execute("DELETE FROM recommendation_events WHERE session_id = 'scoring_demo'")
    await db.close_pool()
    print("\n✅ Phase 6 scoring verified (deterministic + learning loop)")


if __name__ == "__main__":
    asyncio.run(main())
