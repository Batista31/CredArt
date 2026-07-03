"""Demo preflight — run this ~30 min before the mentor demo.

Checks every moving part the demo depends on and prints PASS/FAIL for each:
  backend health, Redis sessions, Groq LLM, Duffel flight SEARCH, Duffel flight
  ORDER (books one real test order — safe, test mode), Tango sandbox voucher,
  TMDB now-playing, and the dining/entertainment routers.

Usage (from backend/):
    .venv\\Scripts\\python demo_preflight.py            # all checks
    .venv\\Scripts\\python demo_preflight.py --no-book  # skip the Duffel test order
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

BASE = "http://localhost:8001"
RIYA = "00000000-0000-0000-0000-000000000002"

RESULTS: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}")


async def main(book: bool) -> None:
    import httpx

    async with httpx.AsyncClient(timeout=90) as c:
        # 1. backend up + session backend
        try:
            h = (await c.get(f"{BASE}/health")).json()
            record("backend :8001", h.get("status") == "ok",
                   f"sessions={h.get('session_backend')}")
        except Exception as e:
            record("backend :8001", False, f"{e} — start uvicorn first")
            _summary()
            return

        # 1b. bank MCP server :8000 — backend must be its CLIENT, not the in-process
        #     fallback. bank_data_source=mcp proves the SSE session connected.
        source = h.get("bank_data_source")
        record("bank MCP server :8000 (bank_data_source=mcp)", source == "mcp",
               f"source={source}" + ("" if source == "mcp"
                                      else " — start `python -m mcp_server`, then restart backend"))

        # 1c. mock hotel storefront :8002 — live "assisted" hotel booking target.
        try:
            s = (await c.get("http://localhost:8002/health")).json()
            record("hotel storefront :8002", s.get("status") == "ok",
                   f"hotels={len(s.get('hotels', []))}")
        except Exception as e:
            record("hotel storefront :8002", False,
                   f"{e} — start `python -m uvicorn storefront.app:app --port 8002`")

        # 2. LLM reachable (a chat turn that uses Groq for the reply)
        r = (await c.post(f"{BASE}/chat", json={"user_id": RIYA, "message": "hi"})).json()
        record("chat turn works", bool(r.get("reply")), r.get("reply", "")[:60])

        # 3. Duffel search (live fares)
        token = os.getenv("DUFFEL_API_KEY", "")
        record("DUFFEL_API_KEY set", bool(token))
        offer = None
        if token:
            hd = {"Authorization": f"Bearer {token}", "Duffel-Version": "v2",
                  "Content-Type": "application/json"}
            from datetime import date, timedelta
            dep = (date.today() + timedelta(days=9)).isoformat()
            try:
                r = await c.post("https://api.duffel.com/air/offer_requests?return_offers=true",
                                 headers=hd, json={"data": {
                                     "slices": [{"origin": "BOM", "destination": "GOI",
                                                 "departure_date": dep}],
                                     "passengers": [{"type": "adult"}],
                                     "cabin_class": "economy"}})
                offers = (r.json().get("data") or {}).get("offers") or []
                offer = offers[0] if offers else None
                record("Duffel flight SEARCH", bool(offer),
                       f"{offer['owner']['name']} {offer['total_amount']} {offer['total_currency']}" if offer else "no offers")
            except Exception as e:
                record("Duffel flight SEARCH", False, str(e)[:80])

            # 4. Duffel ORDER — the production-mode wow moment. Books a real
            #    test-mode order (harmless, no money moves).
            if book and offer:
                try:
                    pax = [{"id": p["id"], "title": "mrs", "gender": "f",
                            "given_name": "Riya", "family_name": "Sharma",
                            "born_on": "1990-01-01", "email": "riya@example.com",
                            "phone_number": "+919000000000"}
                           for p in offer["passengers"]]
                    r = await c.post("https://api.duffel.com/air/orders", headers=hd,
                                     json={"data": {"type": "instant",
                                                    "selected_offers": [offer["id"]],
                                                    "passengers": pax,
                                                    "payments": [{"type": "balance",
                                                                  "amount": offer["total_amount"],
                                                                  "currency": offer["total_currency"]}]}})
                    if r.status_code in (200, 201):
                        ref = r.json()["data"].get("booking_reference")
                        record("Duffel flight ORDER (production booking)", True, f"ref {ref}")
                    else:
                        errs = r.json().get("errors", [])
                        code = errs[0].get("code") if errs else r.status_code
                        record("Duffel flight ORDER (production booking)", False,
                               f"{code} — if service_unavailable, Duffel sandbox is down; "
                               "use Demo mode for the flight booking")
                except Exception as e:
                    record("Duffel flight ORDER (production booking)", False, str(e)[:80])

        # 5. Tango sandbox voucher credentials (catalog ping, no order created)
        tu, tp = os.getenv("TANGO_API_USER", ""), os.getenv("TANGO_API_PASS", "")
        record("TANGO credentials set", bool(tu and tp))
        if tu and tp:
            try:
                r = await c.get("https://integration-api.tangocard.com/raas/v2/catalogs",
                                auth=(tu, tp), params={"verbose": "false"})
                record("Tango sandbox reachable", r.status_code == 200, f"HTTP {r.status_code}")
            except Exception as e:
                record("Tango sandbox reachable", False, str(e)[:80])

        # 6. side concierges
        for path, label in (("/dining/health", "dining router"),
                            ("/entertainment/health", "entertainment router")):
            try:
                r = (await c.get(f"{BASE}{path}")).json()
                extra = f"movies={r.get('movie_source_last')}" if "tmdb_configured" in r else ""
                record(label, r.get("status") == "ok", extra)
            except Exception as e:
                record(label, False, str(e)[:80])

    _summary()


def _summary() -> None:
    bad = [n for n, ok, _ in RESULTS if not ok]
    print()
    if bad:
        print(f"NOT READY — fix these first: {', '.join(bad)}")
        print("Reminder: if only the Duffel ORDER fails, demo the flight booking in "
              "Demo mode and show production with the Tango voucher instead.")
        sys.exit(1)
    print("ALL SYSTEMS GO — remember to run db/run_reset.py right before the demo.")


if __name__ == "__main__":
    asyncio.run(main(book="--no-book" not in sys.argv))
