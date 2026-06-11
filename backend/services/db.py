"""Async Postgres access for Layer 1 services.

Uses asyncpg against Supabase. We connect via DIRECT_URL (session mode,
port 5432) rather than the pgbouncer pooler, because asyncpg relies on
prepared statements which the pooler's transaction mode does not support.

Credentials are loaded from backend/.env first, then db/.env (so the
existing DATABASE_URL / DIRECT_URL there are reused without duplication).
"""

from __future__ import annotations

import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent

# backend/.env wins; fall back to db/.env for the Postgres URLs.
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_REPO_ROOT / "db" / ".env", override=False)

_pool: asyncpg.Pool | None = None


def _dsn() -> str:
    dsn = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "No DIRECT_URL or DATABASE_URL found. Set them in backend/.env or db/.env."
        )
    # asyncpg does not understand the libpq-style ?pgbouncer=true query flag.
    return dsn.split("?", 1)[0]


async def get_pool() -> asyncpg.Pool:
    """Lazily create and return a shared connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=_dsn(),
            min_size=1,
            max_size=5,
            statement_cache_size=0,  # safe even if routed through a pooler
        )
    return _pool


async def fetch(query: str, *args) -> list[dict]:
    """Run a read query and return rows as plain dicts."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
        return [dict(r) for r in rows]


async def fetchrow(query: str, *args) -> dict | None:
    """Run a read query and return a single row as a dict (or None)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
