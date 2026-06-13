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
            assert len(names) == 7, f"expected 7 tools, got {len(names)}"

            print("\ncall list_cards():")
            r = await session.call_tool("list_cards", {})
            data = json.loads(r.content[0].text)
            print(f"  scope={data['scope']} count={data['data']['count']} "
                  f"hash={data['content_hash'][:16]}…")

            print("\ncall get_redemption_rules(hdfc_infinia):")
            r = await session.call_tool("get_redemption_rules", {"card_id": "hdfc_infinia"})
            data = json.loads(r.content[0].text)
            d = data["data"]
            print(f"  card_id={data['card_id']} "
                  f"redemption_options={len(d['redemption_options'])} "
                  f"milestones={len(d['milestones'])} "
                  f"best_partner={d['transfer_summary']['best_partner']}")

            print("\ncall get_card_details(hdfc_nope) [not-found path]:")
            r = await session.call_tool("get_card_details", {"card_id": "hdfc_nope"})
            print("  ->", json.loads(r.content[0].text))

            print("\ncall get_benefit_chunks('relax before my flight') [semantic search]:")
            r = await session.call_tool(
                "get_benefit_chunks", {"query": "relax before my flight", "top_k": 3}
            )
            data = json.loads(r.content[0].text)
            for c in data["data"]["chunks"]:
                print(f"  {c['similarity']:.3f} [{c['card_id']}] {c['chunk_text'][:55]}")

            print("\n✅ MCP SSE end-to-end OK (7 tools)")


if __name__ == "__main__":
    asyncio.run(main())
