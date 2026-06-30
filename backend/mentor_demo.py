"""Mentor walkthrough — demo vs production, the 4 fulfilment paths, OTP, consent.

Shows in the terminal exactly what the UI (CredArt 2.0) models:
  - Demo mode      → imitation booking, spends demo_points, real points untouched
  - Production bank → real points, instant bank activation (no OTP)
  - Production api  → real points, OTP-gated (wrong OTP fails, correct OTP completes)
  - Production assisted → real points, OTP-gated assisted checkout
  - Consent gate   → production without consent is refused
  - No points are deducted until a booking is confirmed.

Run with backend (:8001) up; reset_demo.sql first for clean numbers.
    .venv\\Scripts\\python mentor_demo.py
"""

from __future__ import annotations

import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:8001"
RIYA = "00000000-0000-0000-0000-000000000002"
REGALIA = "hdfc_regalia_gold"


def balances(c):
    cards = c.get(f"{BASE}/cards/{RIYA}").json()["cards"]
    return {x["card_id"]: (x["current_points"], x.get("demo_points")) for x in cards}


def show_bal(c, tag):
    b = balances(c)
    cp, dp = b.get(REGALIA, (0, 0))
    print(f"   balance [{tag}] Regalia: real={cp:,}  demo={dp:,}")


def chat(c, msg):
    r = c.post(f"{BASE}/chat", json={"user_id": RIYA, "message": msg}).json()
    return r["session_id"], r["candidates"]


def by_path(cands):
    """First candidate seen per live path (its option[0])."""
    out = {}
    for cand in cands:
        opts = cand.get("fulfillment_options") or []
        if not opts:
            continue
        path = opts[0]["path"]
        out.setdefault(path, (cand, opts[0]["provider_id"]))
    return out


def redeem(c, sid, candidate_id, mode, provider_id=None, consent=False):
    body = {"user_id": RIYA, "session_id": sid, "candidate_id": candidate_id,
            "provider_id": provider_id or "demo", "mode": mode, "consent": consent}
    return c.post(f"{BASE}/redeem", json=body)


def main():
    with httpx.Client(timeout=60) as c:
        print("=" * 64)
        show_bal(c, "start")

        # Gather a spread of candidates across paths.
        pool = {}
        sess_of = {}
        for msg in ("use my airport lounge and book a mountain hotel stay on Regalia",
                    "get me a BookMyShow movie voucher and a dining voucher"):
            sid, cands = chat(c, msg)
            for path, (cand, pid) in by_path(cands).items():
                if path not in pool:
                    pool[path] = (cand, pid); sess_of[path] = sid
        print("   paths discovered:", ", ".join(sorted(pool)) or "none")

        # 1) DEMO — any candidate, imitation booking, demo_points only.
        anypath = next(iter(pool))
        cand, _ = pool[anypath]
        print(f"\n[1] DEMO  ·  {cand['label']}  (path was {anypath})")
        r = redeem(c, sess_of[anypath], cand["candidate_id"], "demo").json()
        print(f"    -> {r['status']} ref={r['confirmation_reference']} "
              f"used={r['points_used']} {r['currency']} balance_after={r['balance_after']:,}")
        show_bal(c, "after demo")

        # 2) PRODUCTION · BANK — instant, real points, no OTP.
        if "bank" in pool:
            cand, pid = pool["bank"]
            print(f"\n[2] PRODUCTION · BANK ACTIVATION  ·  {cand['label']}  ({pid})")
            r = redeem(c, sess_of["bank"], cand["candidate_id"], "production", pid, consent=True).json()
            print(f"    -> {r['status']} ref={r['confirmation_reference']} "
                  f"used={r['points_used']} {r['currency']} balance_after={r['balance_after']:,}")

        # 3) PRODUCTION · API (voucher) — OTP gated.
        if "api" in pool:
            cand, pid = pool["api"]
            print(f"\n[3] PRODUCTION · API VOUCHER  ·  {cand['label']}  ({pid})")
            r = redeem(c, sess_of["api"], cand["candidate_id"], "production", pid, consent=True).json()
            print(f"    -> {r['status']} booking_session={r['booking_session_id']}")
            sess_id = r["booking_session_id"]
            bad = c.post(f"{BASE}/booking-sessions/{sess_id}/otp", json={"otp": "000000"}).json()
            print(f"    wrong OTP 000000 -> {bad['status']} ({bad.get('rollback_reason')})")
            good = c.post(f"{BASE}/booking-sessions/{sess_id}/otp", json={"otp": "481923"}).json()
            print(f"    correct OTP      -> {good['status']} ref={good.get('confirmation_reference')} "
                  f"used={good.get('points_used')} balance_after={good.get('balance_after'):,}")

        # 4) PRODUCTION · ASSISTED (hotel) — OTP gated.
        if "assisted" in pool:
            cand, pid = pool["assisted"]
            print(f"\n[4] PRODUCTION · ASSISTED CHECKOUT  ·  {cand['label']}  ({pid})")
            r = redeem(c, sess_of["assisted"], cand["candidate_id"], "production", pid, consent=True).json()
            sess_id = r["booking_session_id"]
            print(f"    -> {r['status']} booking_session={sess_id}")
            if sess_id:
                good = c.post(f"{BASE}/booking-sessions/{sess_id}/otp", json={"otp": "552310"}).json()
                print(f"    OTP submitted    -> {good['status']} ref={good.get('confirmation_reference')} "
                      f"used={good.get('points_used')} balance_after={good.get('balance_after'):,}")

        # 5) CONSENT GATE — production without consent is refused.
        cand, pid = pool.get("bank") or next(iter(pool.values()))
        print("\n[5] CONSENT GATE  ·  production without consent (expect 400)")
        rr = redeem(c, sess_of.get("bank", next(iter(sess_of.values()))),
                    cand["candidate_id"], "production", pid, consent=False)
        print(f"    -> HTTP {rr.status_code}: {rr.json().get('detail')}")

        print("\n" + "=" * 64)
        show_bal(c, "end")
        print("demo spent demo_points; production spent real points only after confirmation.")


if __name__ == "__main__":
    main()
