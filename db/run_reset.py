"""Run reset_demo.sql against the demo DB — restores BOTH personas to spec.

Usage (from repo root or db/):
    backend\\.venv\\Scripts\\python db\\run_reset.py

Reads DIRECT_URL from db/.env and executes db/reset_demo.sql in one transaction,
then prints each persona's card balances so you can confirm the reset landed.
"""
import asyncio
import pathlib
import re

import asyncpg

ROOT = pathlib.Path(__file__).resolve().parent          # db/
ENV = (ROOT / ".env").read_text(encoding="utf-8", errors="ignore")
DSN = re.search(r'DIRECT_URL="([^"]+)"', ENV).group(1)
SQL = (ROOT / "reset_demo.sql").read_text(encoding="utf-8")

RIYA = "00000000-0000-0000-0000-000000000002"
SAMYAK = "00000000-0000-0000-0000-000000000001"


async def main() -> None:
    conn = await asyncpg.connect(dsn=DSN, statement_cache_size=0)
    try:
        await conn.execute(SQL)
        print("reset_demo.sql applied OK\n")
        for name, uid in (("Riya", RIYA), ("Samyak", SAMYAK)):
            rows = await conn.fetch(
                """SELECT card_id, current_points, next_expiry_points, demo_points
                     FROM user_cards WHERE user_id = $1 ORDER BY card_id""", uid)
            print(f"{name}:")
            for r in rows:
                print(f"   {r['card_id']:20} pts={r['current_points']:>7} "
                      f"exp={r['next_expiry_points']:>6} demo={r['demo_points']}")
            prefs = await conn.fetchrow(
                "SELECT travel_weight, dining_weight FROM preferences WHERE user_id=$1", uid)
            if prefs:
                print(f"   weights: travel={prefs['travel_weight']} dining={prefs['dining_weight']}\n")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
