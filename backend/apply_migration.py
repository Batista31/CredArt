"""Run migration 0012_cmr against the configured database."""
import asyncio, os
from pathlib import Path
import asyncpg
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent

load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_REPO_ROOT / "db" / ".env", override=False)

SQL_PATH = _REPO_ROOT / "db/prisma/migrations/0012_cmr/migration.sql"


async def main():
    dsn = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("No DIRECT_URL or DATABASE_URL in .env")
    dsn = dsn.split("?", 1)[0]

    sql = SQL_PATH.read_text(encoding="utf-8")
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(sql)
        print("Migration 0012_cmr applied OK.")
    finally:
        await conn.close()


asyncio.run(main())
