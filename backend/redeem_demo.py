"""End-to-end one-click redemption demo (Phase 9)."""

from __future__ import annotations

import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:8001"
RIYA = "00000000-0000-0000-0000-000000000002"


def _cards(client: httpx.Client) -> dict[str, int]:
    response = client.get(f"{BASE}/cards/{RIYA}")
    response.raise_for_status()
    return {card["card_id"]: card["current_points"] for card in response.json()["cards"]}


def main() -> None:
    with httpx.Client(timeout=60) as client:
        response = client.post(f"{BASE}/chat", json={
            "user_id": RIYA,
            "message": "I want to book a weekend hotel stay in the mountains",
        })
        response.raise_for_status()
        chat = response.json()
        session_id = chat["session_id"]
        redeemables = [
            candidate for candidate in chat["candidates"]
            if candidate["kind"] in ("redemption", "perk") and candidate["fulfillment_options"]
        ]
        assert redeemables, "no redeemable candidate with fulfillment options"
        redeemables.sort(key=lambda candidate: candidate.get("points_cost") or 0, reverse=True)
        candidate = redeemables[0]
        print(f"session {session_id}")
        print(f"candidate: {candidate['label']} ({candidate['card_name']}) "
              f"cost={candidate['points_cost']} id={candidate['candidate_id']}")
        print("fulfillment options:")
        for option in candidate["fulfillment_options"]:
            flag = "available" if option["available"] else f"unavailable — {option['note']}"
            print(f"  - [{option['mode']}] {option['provider_id']}: {option['label']} ({flag})")

        before = _cards(client)

        print("\n--- DEMO redeem ---")
        response = client.post(f"{BASE}/redeem", json={
            "user_id": RIYA,
            "session_id": session_id,
            "candidate_id": candidate["candidate_id"],
            "provider_id": "demo",
            "mode": "demo",
        })
        response.raise_for_status()
        result = response.json()
        for step in result["steps"]:
            print(f"  {step['status']:>4} · {step['label']} — {step.get('detail')}")
        print(f"status={result['status']} ref={result['confirmation_reference']} "
              f"used={result['points_used']} {result['currency']} demo_balance_after={result['balance_after']}")

        after = _cards(client)
        assert after[candidate["card_id"]] == before[candidate["card_id"]], (
            "REAL points must be untouched by a demo redemption!"
        )
        print(f"real current_points unchanged: {before[candidate['card_id']]:,} -> {after[candidate['card_id']]:,} ✓")

        live = next((option for option in candidate["fulfillment_options"] if option["mode"] == "live"), None)
        if live:
            print(f"\n--- PRODUCTION redeem without consent on '{live['provider_id']}' (expect 400) ---")
            response = client.post(f"{BASE}/redeem", json={
                "user_id": RIYA,
                "session_id": session_id,
                "candidate_id": candidate["candidate_id"],
                "provider_id": live["provider_id"],
                "mode": "production",
                "consent": False,
            })
            print(f"  HTTP {response.status_code}: {response.json().get('detail')}")
            assert response.status_code == 400, "production without consent should 400"

        print("\n✓ Phase 9 one-click redemption OK")


if __name__ == "__main__":
    main()
