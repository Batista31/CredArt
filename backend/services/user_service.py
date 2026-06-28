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
               dietary_restrictions, family_size
          FROM preferences WHERE user_id = $1
        """,
        user_id,
    )
