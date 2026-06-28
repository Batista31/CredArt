from __future__ import annotations

import asyncio
import json

from api.dialogue_manager import generate_concierge_response
from services import conversation_service, db

SAMYAK = "00000000-0000-0000-0000-000000000001"
RIYA = "00000000-0000-0000-0000-000000000002"


async def main() -> None:
    print("=== User A: travel conversation ===")
    a1 = await generate_concierge_response(SAMYAK, "I'm going on vacation and want to book flight tickets.")
    print(a1["response_type"], a1["journey_type"], a1["missing_slots"])
    print(a1["message"])

    print("\n=== User B: home setup conversation ===")
    b1 = await generate_concierge_response(RIYA, "I want to design my living room.")
    print(b1["response_type"], b1["journey_type"], b1["missing_slots"])
    print(b1["message"])

    print("\n=== User B follow-up ===")
    b2 = await generate_concierge_response(
        RIYA,
        "It's a living room, I want a modern cozy style, mainly sofa rug and coffee table, budget is 50000 points.",
        conversation_id=b1["conversation_id"],
    )
    print(b2["response_type"], b2["journey_type"])
    print(json.dumps(b2["recommendations"][:2], indent=2))

    print("\n=== Resume state ===")
    state = await conversation_service.get_state(b1["conversation_id"])
    print(json.dumps(state, indent=2, default=str))

    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
