"""Demo + verification for the SMS parser (Phase 4).

Feeds a sequence of HDFC SMS for Riya through the ingest service and shows how
her Postgres data changes. Also proves idempotency (re-sending an SMS is a
no-op) and the redemption pending -> completed flip.

Run after reset_demo.sql for clean numbers:
    cd backend
    .venv\\Scripts\\python sms_demo.py
"""

import asyncio
import datetime
import sys

sys.stdout.reconfigure(encoding="utf-8")

from services import db
from services.sms_service import ingest_sms

RIYA = "00000000-0000-0000-0000-000000000002"
REGALIA = "00000000-0000-0000-0002-000000000001"  # ends 8842
MILLENNIA = "00000000-0000-0000-0002-000000000002"  # ends 3391

# received_at fixed to demo "today" so expiry validation is deterministic.
NOW = datetime.datetime(2026, 6, 11, 9, 0, tzinfo=datetime.timezone.utc)


async def show(label):
    rows = await db.fetch(
        "SELECT card_id, current_points, next_expiry_points, next_expiry_date "
        "FROM user_cards WHERE user_id = $1 ORDER BY card_id", RIYA
    )
    print(f"\n  [{label}]")
    for r in rows:
        exp = r["next_expiry_date"].isoformat() if r["next_expiry_date"] else "—"
        print(f"    {r['card_id']:18} pts={r['current_points']:>6}  "
              f"next_expiry={r['next_expiry_points']} on {exp}")


async def main():
    await show("start (run reset_demo.sql first)")

    # Seed a pending redemption so the confirmation SMS has something to flip.
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        # Clear prior runs so the demo is repeatable (SMS dedup persists otherwise).
        await conn.execute("DELETE FROM sms_messages WHERE user_id = $1", RIYA)
        await conn.execute("DELETE FROM redemption_history WHERE user_id = $1", RIYA)
        await conn.execute(
            """
            INSERT INTO redemption_history
                (user_id, user_card_id, transaction_id, status, option_type,
                 option_label, points_used, value_inr)
            VALUES ($1,$2,$3,'pending','hotel','Manali Weekend Stay',40000,48000)
            """,
            RIYA, REGALIA, "TXN-MANALI-001",
        )
    print("\n  seeded pending redemption: Manali Weekend Stay (40,000 pts)")

    samples = [
        ("earn — Swiggy spend on Millennia",
         "Rs.1,250 spent on HDFC Millennia Card xx3391 at SWIGGY on 10-06-26. Earned 63 CashPoints. Avl pts: 3,263."),
        ("expiry alert — Millennia (today)",
         "Reminder: 3,263 CashPoints on your HDFC Millennia Card xx3391 will expire on 11-Jun-2026. Redeem now."),
        ("redeem confirm — Manali Weekend Stay",
         "Redemption successful. 40,000 points redeemed on HDFC Regalia Gold Card xx8842 towards Manali Weekend Stay. Ref HDFCMNL8842. Avl pts: 6,500."),
        ("noise — OTP (should be ignored)",
         "Your OTP is 882913. Do not share with anyone."),
    ]
    for label, sms in samples:
        res = await ingest_sms(RIYA, sms, received_at=NOW)
        print(f"\n  > {label}\n    -> status={res['status']} type={res['sms_type']} "
              f"applied={res['applied']}" + (f" error={res['error']}" if res.get('error') else ""))

    await show("after SMS batch")

    # Sender allowlist — spoof attempts must be rejected, never applied.
    print("\n  --- sender allowlist (security) ---")
    spoofs = [
        ("personal number spoof", "+919812345678",
         "You earned 50,000 reward points on HDFC Regalia Gold Card xx8842. Avl pts: 96,500."),
        ("wrong bank (Axis)", "AD-AXISBK",
         "Rs.500 spent on Axis Card xx8842. Earned 9999 points. Avl pts: 999999."),
        ("legit HDFC header", "VM-HDFCBK",
         "Rs.300 spent on HDFC Millennia Card xx3391 at UBER on 14-06-26. Earned 15 CashPoints. Avl pts: 3,260."),
    ]
    for label, sender, sms in spoofs:
        res = await ingest_sms(RIYA, sms, sender=sender, received_at=NOW)
        print(f"    {label:24} sender={sender:16} -> status={res['status']} applied={res['applied']}")

    # Idempotency — re-send the redemption SMS.
    dup = await ingest_sms(
        RIYA,
        "Redemption successful. 40,000 points redeemed on HDFC Regalia Gold Card xx8842 towards Manali Weekend Stay. Ref HDFCMNL8842. Avl pts: 6,500.",
        received_at=NOW,
    )
    print(f"\n  re-send redemption SMS -> status={dup['status']} (expect 'duplicate')")

    # Redemption flip check.
    rh = await db.fetch(
        "SELECT status, completed_at, confirmation_reference FROM redemption_history "
        "WHERE user_id = $1", RIYA
    )
    r = rh[0]
    print(f"\n  redemption_history: status={r['status']} ref={r['confirmation_reference']} "
          f"(expect completed / HDFCMNL8842)")

    # SMS audit count.
    n = (await db.fetch("SELECT COUNT(*)::int c FROM sms_messages WHERE user_id=$1", RIYA))[0]["c"]
    print(f"\n  sms_messages recorded for Riya = {n}")
    await db.close_pool()
    print("\n✅ SMS parser demo complete")


if __name__ == "__main__":
    asyncio.run(main())
