"""End-to-end MCP client test over SSE against the running server (port 8000)."""

import asyncio
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

from mcp import ClientSession
from mcp.client.sse import sse_client


async def main():
    async with sse_client("http://127.0.0.1:8000/sse") as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            names = [t.name for t in tools.tools]
            print("Tools exposed:", names)
            assert len(names) == 6, f"expected 6 tools, got {len(names)}"

            print("\ncall list_cards():")
            r = await session.call_tool("list_cards", {})
            data = json.loads(r.content[0].text)
            print(f"  scope={data['scope']} count={data['data']['count']} "
                  f"hash={data['content_hash'][:16]}…")

            print("\ncall get_redemption_rules(hdfc_infinia):")
            r = await session.call_tool("get_redemption_rules", {"card_id": "hdfc_infinia"})
            data = json.loads(r.content[0].text)
            d = data["data"]
            print(f"  card_id={data['card_id']} earn={len(d['earn_rules'])} "
                  f"fees={len(d['fees'])} caveats={len(d['caveats'])} "
                  f"best_partner={d['transfer_summary']['best_partner']}")

            print("\ncall get_card_details(hdfc_nope) [not-found path]:")
            r = await session.call_tool("get_card_details", {"card_id": "hdfc_nope"})
            print("  ->", json.loads(r.content[0].text))

            print("\n✅ MCP SSE end-to-end OK")


if __name__ == "__main__":
    asyncio.run(main())
