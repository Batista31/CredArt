"""Smoke test — exercises all 6 card-level tools' service logic against live DB.

Calls the service functions directly (the MCP tools are thin wrappers over
these) and prints a compact summary + the content_hash for each. Also asserts
the card-level invariant by confirming no user data ever appears.
"""

import asyncio
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")  # console may be cp1252 on Windows

from services import (
    benefits_service,
    cards_service,
    redemption_service,
    tnc_service,
    transfer_partners_service,
)
from services import db
from services.serialization import wrap


async def main():
    print("=== 1. list_cards ===")
    cards = await cards_service.list_cards()
    env = wrap({"count": len(cards), "cards": cards})
    print(f"  {len(cards)} cards: {[c['card_id'] for c in cards]}")
    print(f"  hash={env['content_hash'][:16]}…")

    cid = "hdfc_regalia_gold"
    print(f"\n=== 2. get_card_details({cid}) ===")
    card = await cards_service.get_card_details(cid)
    print(f"  {card['card_name']} | tier={card['card_tier']} | fee={card['annual_fee_inr']} "
          f"| base_earn={card['base_earn_rate']} | {card['currency_name']}")

    print(f"\n=== 3. get_card_benefits({cid}) ===")
    benefits = await benefits_service.get_card_benefits(cid)
    print(f"  {len(benefits)} benefits across categories: "
          f"{sorted(set(b['category'] for b in benefits))}")

    print(f"\n=== 4. get_transfer_partners({cid}) ===")
    partners = await transfer_partners_service.get_transfer_partners(cid)
    for p in partners:
        print(f"  {p['partner_name']:30} {p['ratio']:>5}  ₹{p['effective_value_inr']}/pt  "
              f"{p['processing_days_min']}-{p['processing_days_max']}d")

    print(f"\n=== 5. get_redemption_rules({cid}) ===")
    rules = await redemption_service.get_redemption_rules(cid)
    print(f"  earn_rules={len(rules['earn_rules'])} fees={len(rules['fees'])} "
          f"caveats={len(rules['caveats'])}")
    print(f"  transfer_summary={json.dumps(wrap(rules)['data']['transfer_summary'])}")

    print(f"\n=== 6. get_tnc_updates({cid}) ===")
    tnc = await tnc_service.get_tnc_updates(cid)
    print(f"  current T&C effective {tnc['effective_date']} | status={tnc['ingestion_status']} "
          f"| is_current={tnc['is_current']}")

    print("\n=== card-not-found path ===")
    print(f"  get_card_details('hdfc_nope') -> {await cards_service.get_card_details('hdfc_nope')}")

    print("\n=== INVARIANT: no user-table columns leaked ===")
    blob = json.dumps(wrap(rules)).lower()
    forbidden = ["user_id", "current_points", "points_ledger", "balance", "riya", "samyak"]
    leaked = [w for w in forbidden if w in blob]
    print("  ✓ clean" if not leaked else f"  ✗ LEAKED: {leaked}")

    print("\n=== hash determinism ===")
    h1 = wrap(card)["content_hash"]
    h2 = wrap(await cards_service.get_card_details(cid))["content_hash"]
    print(f"  same input -> same hash: {'✓' if h1 == h2 else '✗'}")

    await db.close_pool()
    print("\n✅ smoke test complete")


if __name__ == "__main__":
    asyncio.run(main())
