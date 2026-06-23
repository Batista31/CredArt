"""Bank MCP client — backend consumes the mock HDFC Bank MCP server over SSE.

The mock server (mcp_server.py, port 8000) simulates how a real bank *could*
expose trusted, card-level rewards data. The backend is its CLIENT: it never
reaches into the bank's tables, it asks the bank's MCP for catalogue + T&C.
That client/server separation is the whole point — CredArt is a bank extension,
not a bank intruder.

Every helper here mirrors the in-process Layer-1 service signature and unwraps
the standard `{scope, content_hash, data}` envelope. If the MCP server is
unreachable (or BANK_MCP_URL is unset), each helper transparently falls back to
the in-process service so the backend still runs standalone for tests.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import AsyncExitStack
from typing import Any

from . import (
    benefit_chunks_service,
    redemption_service,
    tnc_service,
    transfer_partners_service,
)

BANK_MCP_URL = os.getenv("BANK_MCP_URL", "http://127.0.0.1:8000/sse")


class BankMCPClient:
    """Persistent SSE MCP client. One long-lived session, calls serialized by a lock."""

    def __init__(self, url: str = BANK_MCP_URL) -> None:
        self.url = url
        self._stack: AsyncExitStack | None = None
        self._session: Any = None
        self._lock = asyncio.Lock()
        self.connected = False

    async def connect(self) -> bool:
        """Open the SSE session once. Returns True on success, False on failure."""
        try:
            from mcp import ClientSession
            from mcp.client.sse import sse_client

            self._stack = AsyncExitStack()
            read, write = await self._stack.enter_async_context(sse_client(self.url))
            self._session = await self._stack.enter_async_context(ClientSession(read, write))
            await self._session.initialize()
            self.connected = True
            print(f"[bank_mcp] connected to {self.url}")
        except Exception as e:
            print(f"[bank_mcp] connect failed ({e}); using in-process fallback")
            self.connected = False
            await self.close()
        return self.connected

    async def close(self) -> None:
        if self._stack is not None:
            try:
                await self._stack.aclose()
            except Exception:
                pass
        self._stack = None
        self._session = None
        self.connected = False

    async def _call(self, tool: str, args: dict) -> dict:
        """Call a tool, return the unwrapped `data` payload. Raises on any failure."""
        async with self._lock:
            res = await self._session.call_tool(tool, args)
        env = json.loads(res.content[0].text)
        if "error" in env:
            raise RuntimeError(f"{tool}: {env['error']}")
        return env["data"]


# Module singleton, owned by the FastAPI lifespan.
_client: BankMCPClient | None = None


async def startup(url: str = BANK_MCP_URL) -> None:
    global _client
    _client = BankMCPClient(url)
    await _client.connect()


async def shutdown() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


def backend() -> str:
    return "mcp" if (_client is not None and _client.connected) else "in-process"


# --- Typed helpers: MCP primary, in-process fallback (same return shapes) ---

async def get_benefit_chunks(query: str, card_id: str | None, top_k: int = 5) -> list[dict]:
    if _client is not None and _client.connected:
        try:
            data = await _client._call(
                "get_benefit_chunks", {"query": query, "card_id": card_id, "top_k": top_k})
            return data["chunks"]
        except Exception as e:
            print(f"[bank_mcp] get_benefit_chunks fell back ({e})")
    return await benefit_chunks_service.get_benefit_chunks(query, card_id, top_k)


async def get_redemption_rules(card_id: str) -> dict:
    if _client is not None and _client.connected:
        try:
            return await _client._call("get_redemption_rules", {"card_id": card_id})
        except Exception as e:
            print(f"[bank_mcp] get_redemption_rules fell back ({e})")
    return await redemption_service.get_redemption_rules(card_id)


async def get_transfer_partners(card_id: str, partner_type: str | None = None) -> list[dict]:
    if _client is not None and _client.connected:
        try:
            data = await _client._call(
                "get_transfer_partners", {"card_id": card_id, "partner_type": partner_type})
            return data["partners"]
        except Exception as e:
            print(f"[bank_mcp] get_transfer_partners fell back ({e})")
    return await transfer_partners_service.get_transfer_partners(card_id, partner_type)


async def get_tnc_updates(card_id: str) -> dict | None:
    if _client is not None and _client.connected:
        try:
            return await _client._call("get_tnc_updates", {"card_id": card_id})
        except Exception as e:
            print(f"[bank_mcp] get_tnc_updates fell back ({e})")
    return await tnc_service.get_tnc_updates(card_id)


async def get_caveat(card_id: str) -> str | None:
    """Build a short, bank-sourced T&C caveat for a card (blackout / excluded /
    points-expiry), used to gate redemptions honestly before booking."""
    try:
        rules = await get_redemption_rules(card_id)
    except Exception:
        return None
    fp = rules.get("fine_print") or {}
    parts: list[str] = []
    blackout = fp.get("blackout_dates") or []
    excluded = fp.get("excluded_categories") or []
    if blackout:
        parts.append("blackout: " + ", ".join(blackout[:2]))
    if excluded:
        parts.append("excluded: " + ", ".join(excluded[:2]))
    return " · ".join(parts) if parts else None
