"""Voucher redemption demo — real gift card issuance via Tango Card.

Shows the full path for a voucher request:
  1. Groq LLM extracts intent + category
  2. Layer 1 builds candidates (scoring + ranking)
  3. LLM writes a reply from candidates only
  4. One-click /redeem issues a REAL gift card code via Tango Card RaaS

Run:
    cd backend
    .venv\\Scripts\\python voucher_demo.py
"""

from __future__ import annotations

import sys
import httpx

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:8001"
RIYA = "00000000-0000-0000-0000-000000000002"

QUERY = input("Riya: ").strip() or "I want an Amazon gift voucher"


def line(c: str = "=") -> None:
    print(c * 70)


def main() -> None:
    with httpx.Client(timeout=60) as client:
        line()
        print(f"RIYA: {QUERY!r}")
        line()

        r = client.post(f"{BASE}/chat", json={"user_id": RIYA, "message": QUERY})
        r.raise_for_status()
        chat = r.json()
        sid = chat["session_id"]

        intent = chat["intent"]
        print(f"\n[1] INTENT EXTRACTED (Groq LLM):")
        print(f"    kind={intent['kind']}  category={intent['category']}")

        print(f"\n[2] CANDIDATES BUILT ({len(chat['candidates'])} total):")
        voucher = None
        for c in chat["candidates"]:
            tag = ""
            opts = c.get("fulfillment_options", [])
            has_tango = any(o["provider_id"] == "tango_voucher" for o in opts)
            if has_tango and voucher is None:
                voucher = c
                tag = "  <-- voucher candidate"
            cost = f"{c['points_cost']:,}pts" if c["points_cost"] else "perk"
            print(f"    #{c['rank']} {c['label']:<28} {c['card_name']:<13} {cost}{tag}")

        if not voucher:
            print("\n    no voucher candidate found — try asking for shopping/dining/entertainment")
            return

        print(f"\n    fulfillment options for '{voucher['label']}':")
        for o in voucher["fulfillment_options"]:
            flag = "available" if o["available"] else "unavailable"
            print(f"      - [{o['mode']}] {o['provider_id']:<22} ({flag})")

        print(f"\n[3] AI REPLY (claude_used={chat['claude_used']}):")
        print(f"    {chat['reply']}")

        line()
        print("RIYA CONFIRMS -> one-click redeem via Tango Card (live)")
        line()

        r2 = client.post(f"{BASE}/redeem", json={
            "user_id": RIYA,
            "session_id": sid,
            "candidate_id": voucher["candidate_id"],
            "provider_id": "tango_voucher",
            "mode": "live",
            "traveler": {
                "given_name": "Riya",
                "family_name": "Sharma",
                "email": "riya@example.com",
                "phone": "+919000000000",
            },
        })
        res = r2.json()
        print()
        for s in res.get("steps", []):
            print(f"    {s['status']:>4} · {s['label']} — {s.get('detail')}")
        print(f"\n    status           = {res['status']}")
        print(f"    confirmation_ref = {res['confirmation_reference']}")
        print(f"    points_used      = {res['points_used']:,} {res['currency']}")
        print(f"    balance_after    = {res['balance_after']:,}")
        if res.get("rollback_reason"):
            print(f"    rollback_reason  = {res['rollback_reason']}")


if __name__ == "__main__":
    main()
