"""User-data reads (user_cards, preferences, users).

This is OUR data — sourced from SMS parsing (see sms_service), never from the
bank MCP server. These functions are used by the FastAPI orchestrator to build
Layer 1 context. They are deliberately NOT exposed as MCP tools: the bank
server stays card-level only.
"""

from __future__ import annotations

from . import db


async def get_user(user_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT id AS user_id, name, email, phone, date_of_birth, city, state, country
          FROM users WHERE id = $1
        """,
        user_id,
    )


async def get_user_cards(user_id: str) -> list[dict]:
    """A user's cards joined with catalogue display fields, expiry first."""
    return await db.fetch(
        """
        SELECT uc.id            AS user_card_id,
               uc.card_id,
               c.card_name,
               c.currency_name,
               uc.current_points,
               uc.demo_points,
               uc.next_expiry_points,
               uc.next_expiry_date,
               uc.is_primary,
               (uc.next_expiry_date - CURRENT_DATE) AS days_to_expiry
          FROM user_cards uc
          JOIN cards c ON c.id = uc.card_id
         WHERE uc.user_id = $1 AND uc.is_active = TRUE
         ORDER BY uc.next_expiry_date ASC NULLS LAST
        """,
        user_id,
    )


async def get_preferences(user_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT destination_type, trip_length, region_preference, accommodation_tier,
               flight_preference, departure_preference,
               travel_weight, dining_weight, shopping_weight, cashback_weight,
               experiences_weight, value_sensitivity_threshold,
               total_redemptions, total_dismissals,
               preferred_airlines, preferred_hotel_chains, preferred_cuisines,
               dietary_restrictions
          FROM preferences WHERE user_id = $1
        """,
        user_id,
    )


async def update_preferences_after_redemption(user_id: str, category: str | None) -> None:
    """Dynamically adjust user preference weights after a confirmed redemption."""
    prefs = await get_preferences(user_id)
    if not prefs:
        return

    category_to_pref = {
        "TRAVEL": "travel_weight",
        "DINING": "dining_weight",
        "SHOPPING": "shopping_weight",
        "ENTERTAINMENT": "experiences_weight",
        "WELLNESS": "experiences_weight",
        "MILESTONE": "cashback_weight",
    }
    pref_keys = ["travel_weight", "dining_weight", "shopping_weight", "cashback_weight", "experiences_weight"]

    target_key = category_to_pref.get((category or "").upper())

    if target_key:
        delta = 0.05
        decay = delta / 4.0

        new_weights = {}
        for key in pref_keys:
            current_val = float(prefs.get(key) or 0.0)
            if key == target_key:
                new_weights[key] = min(1.0, current_val + delta)
            else:
                new_weights[key] = max(0.0, current_val - decay)

        await db.execute(
            """
            UPDATE preferences 
               SET total_redemptions = total_redemptions + 1,
                   travel_weight = $2,
                   dining_weight = $3,
                   shopping_weight = $4,
                   cashback_weight = $5,
                   experiences_weight = $6,
                   updated_at = NOW()
             WHERE user_id = $1
            """,
            user_id,
            new_weights["travel_weight"], new_weights["dining_weight"],
            new_weights["shopping_weight"], new_weights["cashback_weight"],
            new_weights["experiences_weight"]
        )
    else:
        await db.execute(
            "UPDATE preferences SET total_redemptions = total_redemptions + 1, updated_at = NOW() WHERE user_id = $1",
            user_id
        )
