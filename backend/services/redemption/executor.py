"""Redemption executor — the one-click booking transaction.

Flow: re-validate affordability server-side (never trust the client's points) ->
record a pending redemption -> call the provider to book -> on success, atomically
debit the right balance bucket (current_points for live, demo_points for demo),
write a ledger row (live only), and flip the redemption to completed. On any
failure the redemption is marked failed with a rollback_reason and no points move.

The feedback loop also stamps recommendation_events.user_action='confirmed' so the
scoring engine learns from real choices.
"""

from __future__ import annotations

import logging
import os
from uuid import uuid4

from .. import db, scoring_service
from .base import RedemptionProvider

log = logging.getLogger(__name__)


def _lock_client():
    """Redis client for the points lock, or None if REDIS_URL is unset (dev/demo
    without Redis degrades to no lock, same as the session store). redis is
    imported lazily so it stays an optional dependency."""
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    import redis.asyncio as redis  # lazy

    return redis.from_url(url)


async def _card_row(user_id: str, card_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT uc.id AS user_card_id, uc.current_points, uc.demo_points, c.card_name
          FROM user_cards uc
          JOIN cards c ON c.id = uc.card_id
         WHERE uc.user_id = $1 AND uc.card_id = $2 AND uc.is_active = TRUE
        """,
        user_id, card_id,
    )


def _fail(txn_id: str, provider: RedemptionProvider, candidate: dict,
          card_id: str, card_name: str, reason: str, steps: list[dict]) -> dict:
    return {
        "status": "failed", "transaction_id": txn_id,
        "confirmation_reference": None, "provider_id": provider.provider_id,
        "mode": provider.mode, "option_label": candidate.get("label", ""),
        "card_id": card_id, "card_name": card_name, "currency": provider.currency,
        "points_used": 0, "balance_after": 0, "steps": steps, "rollback_reason": reason,
    }


async def execute_redemption(user_id: str, candidate: dict,
                             provider: RedemptionProvider, traveler: dict) -> dict:
    txn_id = uuid4().hex
    card_id = candidate["card_id"]
    cost = int(candidate.get("points_cost") or 0)
    is_demo = provider.mode == "demo"
    bucket = "demo_points" if is_demo else "current_points"
    label = candidate.get("label", "reward")
    stored_label = f"[demo] {label}" if is_demo else label

    row = await _card_row(user_id, card_id)
    if row is None:
        return _fail(txn_id, provider, candidate, card_id, card_id,
                     "user does not hold this card", [])

    card_name = row["card_name"]
    balance = int(row[bucket])
    user_card_id = row["user_card_id"]

    # Pre-booking points lock — stop two concurrent redemptions from spending the
    # same card's points (double-spend) before the atomic DB debit runs. SET NX:
    # if the key already exists, another redemption holds the lock right now.
    lock_client = _lock_client()
    lock_key = f"credart:lock:{user_id}:{card_id}"
    if lock_client is not None:
        acquired = await lock_client.set(lock_key, txn_id, nx=True, ex=120)
        if not acquired:
            await lock_client.aclose()
            return _fail(txn_id, provider, candidate, card_id, card_name,
                         "points locked by another redemption in progress — try again in 2 minutes", [])

    try:
        # Server-side affordability gate — the authority, not the client.
        if cost > balance:
            return _fail(txn_id, provider, candidate, card_id, card_name,
                         f"insufficient {bucket}: need {cost:,}, have {balance:,}", [])

        # Record the attempt.
        await db.execute(
            """
            INSERT INTO redemption_history
                (user_id, user_card_id, transaction_id, status, option_type, option_label,
                 points_used, value_inr, partner_name)
            VALUES ($1,$2,$3,'pending',$4,$5,$6,0,$7)
            """,
            user_id, user_card_id, txn_id, candidate.get("kind", "redemption"),
            stored_label, cost, candidate.get("best_use_case"),
        )

        # Book with the provider (never raises).
        result = await provider.book(candidate, traveler)
        if not result.ok:
            await db.execute(
                "UPDATE redemption_history SET status='failed', rollback_reason=$2 WHERE transaction_id=$1",
                txn_id, (result.error or "provider booking failed")[:500],
            )
            return _fail(txn_id, provider, candidate, card_id, card_name,
                         result.error or "provider booking failed", result.steps)

        # Atomic debit + ledger (live only) + complete.
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                new_balance = await conn.fetchval(
                    f"""
                    UPDATE user_cards SET {bucket} = {bucket} - $2
                     WHERE id = $1 AND {bucket} >= $2
                 RETURNING {bucket}
                    """,
                    user_card_id, cost,
                )
                if new_balance is None:
                    # Lost an affordability race after booking — mark failed, don't debit.
                    await conn.execute(
                        "UPDATE redemption_history SET status='failed', rollback_reason=$2 WHERE transaction_id=$1",
                        txn_id, "balance changed during booking",
                    )
                    return _fail(txn_id, provider, candidate, card_id, card_name,
                                 "balance changed during booking", result.steps)

                if not is_demo and cost > 0:
                    await conn.execute(
                        """
                        INSERT INTO points_ledger
                            (user_card_id, transaction_type, points_delta, balance_after, description, reference_id)
                        VALUES ($1,'redeem',$2,$3,$4,NULL)
                        """,
                        user_card_id, -cost, new_balance, label,
                    )

                await conn.execute(
                    """
                    UPDATE redemption_history
                       SET status='completed', confirmation_reference=$2, completed_at=NOW()
                     WHERE transaction_id=$1
                    """,
                    txn_id, result.confirmation_reference,
                )

        # Feedback loop — learn from the confirmed choice (best-effort).
        await db.execute(
            """
            UPDATE recommendation_events SET user_action='confirmed'
             WHERE user_id=$1 AND option_label=$2 AND user_action IS NULL
            """,
            user_id, label,
        )

        # Dynamic lifestyle learning — nudge the confirmed category's weight up.
        # Best-effort: must never break a confirmed redemption.
        try:
            await scoring_service.update_preferences(user_id, candidate.get("category", ""))
        except Exception as exc:  # noqa: BLE001
            log.warning("update_preferences failed for %s: %s", user_id, exc)

        return {
            "status": "completed", "transaction_id": txn_id,
            "confirmation_reference": result.confirmation_reference,
            "provider_id": provider.provider_id, "mode": provider.mode,
            "option_label": label, "card_id": card_id, "card_name": card_name,
            "currency": provider.currency, "points_used": cost,
            "balance_after": int(new_balance), "steps": result.steps, "rollback_reason": None,
        }
    finally:
        # Always release the points lock, on every exit path.
        if lock_client is not None:
            try:
                await lock_client.delete(lock_key)
            finally:
                await lock_client.aclose()
