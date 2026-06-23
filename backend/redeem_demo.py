"""End-to-end one-click redemption demo (Phase 9).

Requires the backend running on :8001 (and ideally the bank MCP on :8000).
Run reset_demo.sql first so balances are at spec.

    .venv\\Scripts\\python redeem_demo.py
"""

from __future__ import annotations

import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:8001"
RIYA = "00000000-0000-0000-0000-000000000002"


def _cards(client: httpx.Client) -> dict[str, int]:
    r = client.get(f"{BASE}/cards/{RIYA}")
    r.raise_for_status()
    return {c["card_id"]: c["current_points"] for c in r.json()["cards"]}


def main() -> None:
    with httpx.Client(timeout=60) as client:
        # 1. Chat to produce a redeemable TRAVEL candidate.
        r = client.post(f"{BASE}/chat", json={
            "user_id": RIYA,
            "message": "I want to book a weekend hotel stay in the mountains",
        })
        r.raise_for_status()
        chat = r.json()
        sid = chat["session_id"]
        redeemables = [c for c in chat["candidates"]
                       if c["kind"] in ("redemption", "perk") and c["fulfillment_options"]]
        assert redeemables, "no redeemable candidate with fulfillment options"
        # Prefer a candidate with a real points cost so the demo deduction is visible.
        redeemables.sort(key=lambda c: c.get("points_cost") or 0, reverse=True)
        cand = redeemables[0]
        print(f"session {sid}")
        print(f"candidate: {cand['label']} ({cand['card_name']}) "
              f"cost={cand['points_cost']} id={cand['candidate_id']}")
        print("fulfillment options:")
        for o in cand["fulfillment_options"]:
            flag = "available" if o["available"] else f"unavailable — {o['note']}"
            print(f"  - [{o['mode']}] {o['provider_id']}: {o['label']} ({flag})")

        before = _cards(client)

        # 2. One-click DEMO redeem (always available, spends demo_points).
        print("\n--- DEMO redeem ---")
        r = client.post(f"{BASE}/redeem", json={
            "user_id": RIYA, "session_id": sid,
            "candidate_id": cand["candidate_id"], "provider_id": "demo", "mode": "demo",
        })
        r.raise_for_status()
        res = r.json()
        for s in res["steps"]:
            print(f"  {s['status']:>4} · {s['label']} — {s.get('detail')}")
        print(f"status={res['status']} ref={res['confirmation_reference']} "
              f"used={res['points_used']} {res['currency']} demo_balance_after={res['balance_after']}")

        after = _cards(client)
        assert after[cand["card_id"]] == before[cand["card_id"]], \
            "REAL points must be untouched by a demo redemption!"
        print(f"real current_points unchanged: {before[cand['card_id']]:,} -> {after[cand['card_id']]:,} ✓")

        # 3. Try a LIVE provider that's unavailable (no creds) -> expect a clean 400.
        live = next((o for o in cand["fulfillment_options"]
                     if o["mode"] == "live" and not o["available"]), None)
        if live:
            print(f"\n--- LIVE redeem on unavailable provider '{live['provider_id']}' (expect 400) ---")
            r = client.post(f"{BASE}/redeem", json={
                "user_id": RIYA, "session_id": sid,
                "candidate_id": cand["candidate_id"],
                "provider_id": live["provider_id"], "mode": "live",
            })
            print(f"  HTTP {r.status_code}: {r.json().get('detail')}")
            assert r.status_code == 400, "unavailable live provider should 400"

        print("\n✅ Phase 9 one-click redemption OK")


if __name__ == "__main__":
    main()
