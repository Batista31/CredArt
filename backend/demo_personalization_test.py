from __future__ import annotations

import asyncio
import json

from api.dialogue_manager import generate_concierge_response
from services import customer_profile_service, db, personalization_service

SAMYAK = "00000000-0000-0000-0000-000000000001"
RIYA = "00000000-0000-0000-0000-000000000002"


async def main() -> None:
    await personalization_service.update_preferences(RIYA, {"travel_weight": 0.25, "shopping_weight": 0.35})
    await personalization_service.update_preferences(SAMYAK, {"travel_weight": 0.6, "shopping_weight": 0.1})

    a = await generate_concierge_response(SAMYAK, "Help me use my points for a flight to Goa.")
    b = await generate_concierge_response(
        RIYA,
        "I want a cozy modern sofa for my living room and I want to use points.",
    )

    print("=== Samyak profile ===")
    print(json.dumps(await customer_profile_service.get_customer_profile(SAMYAK), indent=2, default=str))
    print("\n=== Riya profile ===")
    print(json.dumps(await customer_profile_service.get_customer_profile(RIYA), indent=2, default=str))
    print("\n=== Recommendation directions ===")
    print("Samyak:", a["journey_type"], a["response_type"], a["next_actions"])
    print("Riya:", b["journey_type"], b["response_type"], b["next_actions"])

    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
