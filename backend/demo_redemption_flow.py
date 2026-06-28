from __future__ import annotations

import asyncio
import json

from api.dialogue_manager import generate_concierge_response
from services import db, personalization_service, redemption_executor

RIYA = "00000000-0000-0000-0000-000000000002"


async def main() -> None:
    await personalization_service.add_address(
        RIYA,
        {
            "label": "Home",
            "line1": "12 Palm Residency",
            "line2": "Indiranagar",
            "city": "Bangalore",
            "state": "Karnataka",
            "postal_code": "560038",
            "country": "India",
            "is_default": True,
        },
    )
    chat = await generate_concierge_response(
        RIYA,
        "I want to design my living room.",
    )
    chat = await generate_concierge_response(
        RIYA,
        "It's a living room, I want a modern cozy style, mainly sofa rug and coffee table, budget is 50000 points.",
        conversation_id=chat["conversation_id"],
    )
    first = chat["recommendations"][0]
    quote = await redemption_executor.quote_reward_item(RIYA, first["item_id"])
    order = await redemption_executor.create_order(
        RIYA,
        item_id=first["item_id"],
        conversation_id=chat["conversation_id"],
    )
    confirmed = await redemption_executor.confirm_order(RIYA, order["id"])
    completed = await redemption_executor.execute_order(RIYA, order["id"])

    print("=== Quote ===")
    print(json.dumps(quote, indent=2, default=str))
    print("\n=== Confirmed ===")
    print(json.dumps(confirmed, indent=2, default=str))
    print("\n=== Completed ===")
    print(json.dumps(completed, indent=2, default=str))

    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
