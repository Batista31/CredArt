"""Travel-query -> live flight redemption demo (Option B).

Shows the full path for a flight request:
  1. Groq LLM extracts destination IATA + resolves the relative date
  2. Layer 1 builds a first-class "Flight ORIGIN->DEST" candidate
  3. The LLM writes a reply from candidates only (anti-hallucination boundary)
  4. One-click /redeem via Duffel books the REAL route on Duffel's sandbox

Requires both servers up (mcp_server :8000, api.main :8001) and DUFFEL_API_KEY set.
Run reset_demo.sql first so balances are at spec.

    cd backend
    .venv\\Scripts\\python travel_demo.py
"""

from __future__ import annotations

import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:8001"
RIYA = "00000000-0000-0000-0000-000000000002"


QUERY = input("Riya: ").strip() or "Book me a flight to Dubai next month"


def line(c: str = "=") -> None:
    print(c * 70)


def main() -> None:
    with httpx.Client(timeout=90) as client:
        line()
        print(f"RIYA: {QUERY!r}")
        line()
        r = client.post(f"{BASE}/chat", json={"user_id": RIYA, "message": QUERY})
        r.raise_for_status()
        chat = r.json()
        sid = chat["session_id"]

        intent = chat["intent"]
        print("\n[1] INTENT EXTRACTED (Groq LLM):")
        print(f"    kind={intent['kind']}  category={intent['category']}")
        print(f"    origin={intent['origin']}  destination={intent['destination']}  "
              f"depart_date={intent['depart_date']}")

        print(f"\n[2] CANDIDATES BUILT ({len(chat['candidates'])} total):")
        travel = None
        for c in chat["candidates"]:
            tag = ""
            if c["label"].startswith("Flight") or c["label"].startswith("Hotel"):
                travel = c
                tag = "  <-- first-class travel candidate"
            cost = f"{c['points_cost']:,}pts" if c["points_cost"] else "perk"
            print(f"    #{c['rank']} {c['label']:<28} {c['card_name']:<13} {cost}{tag}")

        if not travel:
            print("\n    no travel candidate built — mention a city and flight/hotel intent")
            return

        kind = "hotel" if travel["label"].startswith("Hotel") else "flight"
        if kind == "flight":
            print(f"\n    route: {travel['origin']}→{travel['destination']}  depart={travel['depart_date']}")
            provider_id = "duffel_flight"
        else:
            print(f"\n    hotel in: {travel['destination']}  check_in={travel['check_in']}  check_out={travel['check_out']}")
            provider_id = "duffel_stays"

        print("    fulfillment options:")
        for o in travel["fulfillment_options"]:
            flag = "available" if o["available"] else "unavailable"
            print(f"      - [{o['mode']}] {o['provider_id']:<20} ({flag})")

        print(f"\n[3] AI REPLY (claude_used={chat['claude_used']}):")
        print(f"    {chat['reply']}")

        line()
        print(f"RIYA CONFIRMS -> one-click redeem via Duffel ({kind}) (live test)")
        line()
        r2 = client.post(f"{BASE}/redeem", json={
            "user_id": RIYA, "session_id": sid,
            "candidate_id": travel["candidate_id"],
            "provider_id": provider_id, "mode": "live",
            "traveler": {"given_name": "Riya", "family_name": "Sharma",
                         "email": "riya@example.com", "phone": "+919000000000"},
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
