"""Redemption executor — demo + production (4-path) with OTP-gated bookings.

Flow:
  - demo mode  → DemoProvider, spends demo_points, instant.
  - production + bank/duffel (no OTP) → run + finalize immediately, spends current_points.
  - production + api(voucher)/assisted (requires_otp) → create a booking session and
    return status=otp_required. Points move ONLY after the OTP is submitted and the
    provider confirms (submit_otp → finalize).

Server-side re-validation of affordability happens before any booking; points are
debited only on a confirmed booking; failures mark the redemption failed with a
rollback_reason and move no points. OTP / card secrets are never stored.
"""

from __future__ import annotations

import logging
import os
from uuid import uuid4

from .. import db
from . import booking_session_service as bss
from . import registry
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
        SELECT uc.id AS user_card_id, uc.current_points, uc.demo_points,
               uc.card_number_masked, c.card_name
          FROM user_cards uc
          JOIN cards c ON c.id = uc.card_id
         WHERE uc.user_id = $1 AND uc.card_id = $2 AND uc.is_active = TRUE
        """,
        user_id, card_id,
    )


def _last4(masked: str | None) -> str:
    digits = "".join(ch for ch in (masked or "") if ch.isdigit())
    return digits[-4:] if len(digits) >= 4 else "0000"


def _fail(txn_id, provider, candidate, card_id, card_name, mode, reason, steps):
    return {
        "status": "failed", "transaction_id": txn_id, "confirmation_reference": None,
        "provider_id": provider.provider_id, "path": provider.path, "mode": mode,
        "option_label": candidate.get("label", ""), "card_id": card_id,
        "card_name": card_name, "currency": provider.currency, "points_used": 0,
        "balance_after": 0, "steps": steps, "rollback_reason": reason,
        "booking_session_id": None,
    }


async def start_redemption(user_id: str, candidate: dict, provider: RedemptionProvider,
                           traveler: dict, mode: str) -> dict:
    """Entry point for /redeem. Returns a terminal result or an otp_required pending result."""
    txn_id = uuid4().hex
    card_id = candidate["card_id"]
    cost = int(candidate.get("points_cost") or 0)
    bucket = "demo_points" if provider.mode == "demo" else "current_points"

    row = await _card_row(user_id, card_id)
    if row is None:
        return _fail(txn_id, provider, candidate, card_id, card_id, mode,
                     "user does not hold this card", [])
    card_name = row["card_name"]
    balance = int(row[bucket])

    if cost > balance:
        return _fail(txn_id, provider, candidate, card_id, card_name, mode,
                     f"insufficient {bucket}: need {cost:,}, have {balance:,}", [])

    # Production api/assisted → OTP-gated booking session (no points move yet).
    if mode == "production" and provider.requires_otp:
        sess = bss.create(user_id, candidate, provider.provider_id,
                          merchant=candidate.get("label", "booking"), amount=cost,
                          card_last4=_last4(row["card_number_masked"]))
        return {
            "status": "otp_required", "transaction_id": txn_id,
            "confirmation_reference": None, "provider_id": provider.provider_id,
            "path": provider.path, "mode": mode, "option_label": candidate.get("label", ""),
            "card_id": card_id, "card_name": card_name, "currency": provider.currency,
            "points_used": 0, "balance_after": balance,
            "booking_session_id": sess["id"],
            "steps": [
                {"label": "Validating bank rules", "status": "done", "detail": f"HDFC {card_name}"},
                {"label": "Starting checkout", "status": "done", "detail": provider.label},
                {"label": "Filling booking details", "status": "done", "detail": candidate.get("label", "")},
                {"label": "Waiting for OTP", "status": "pending", "detail": "secure step-up from your bank"},
            ],
        }

    return await _finalize(txn_id, user_id, candidate, provider, traveler, mode, row)


async def submit_otp(booking_session_id: str, otp: str) -> dict:
    ok, reason = bss.validate_otp(booking_session_id, otp)
    sess = bss._raw(booking_session_id)
    if sess is None:
        return {"status": "failed", "rollback_reason": "unknown booking session",
                "booking_session_id": booking_session_id}
    if not ok:
        if reason == "OTP expired":
            bss.mark(booking_session_id, "expired", error_message=reason)
        return {"status": "failed", "booking_session_id": booking_session_id,
                "rollback_reason": reason}

    provider = registry.get_provider(sess["provider_id"])
    candidate = sess["candidate"]
    txn_id = uuid4().hex
    row = await _card_row(sess["user_id"], candidate["card_id"])
    if row is None:
        bss.mark(booking_session_id, "failed", error_message="card not found")
        return {"status": "failed", "booking_session_id": booking_session_id,
                "rollback_reason": "card not found"}

    result = await _finalize(txn_id, sess["user_id"], candidate, provider, {}, "production", row)
    bss.mark(booking_session_id, result["status"],
             confirmation_reference=result.get("confirmation_reference"),
             error_message=result.get("rollback_reason"))
    result["booking_session_id"] = booking_session_id
    return result


async def _finalize(txn_id, user_id, candidate, provider, traveler, mode, row) -> dict:
    """Book with the provider, then atomically debit + ledger + complete history."""
    card_id = candidate["card_id"]
    card_name = row["card_name"]
    user_card_id = row["user_card_id"]
    cost = int(candidate.get("points_cost") or 0)
    is_demo = provider.mode == "demo"
    bucket = "demo_points" if is_demo else "current_points"
    label = candidate.get("label", "reward")
    stored_label = f"[demo] {label}" if is_demo else label

    # Pre-booking points lock — stop two concurrent redemptions from double-spending
    # REAL points. Demo redemptions spend a separate demo_points bucket and are meant
    # to be replayable (see CLAUDE.md), so they never take the lock.
    lock_client = None if is_demo else _lock_client()
    lock_key = f"credart:lock:{user_id}:{card_id}"
    if lock_client is not None:
        acquired = await lock_client.set(lock_key, txn_id, nx=True, ex=120)
        if not acquired:
            await lock_client.aclose()
            return _fail(txn_id, provider, candidate, card_id, card_name, mode,
                         "points locked by another redemption in progress — try again in 2 minutes", [])

    try:
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

        result = await provider.book(candidate, traveler)
        if not result.ok:
            await db.execute(
                "UPDATE redemption_history SET status='failed', rollback_reason=$2 WHERE transaction_id=$1",
                txn_id, (result.error or "provider booking failed")[:500],
            )
            return _fail(txn_id, provider, candidate, card_id, card_name, mode,
                         result.error or "provider booking failed", result.steps)

        pool = await db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                new_balance = await conn.fetchval(
                    f"UPDATE user_cards SET {bucket} = {bucket} - $2 "
                    f"WHERE id = $1 AND {bucket} >= $2 RETURNING {bucket}",
                    user_card_id, cost,
                )
                if new_balance is None:
                    await conn.execute(
                        "UPDATE redemption_history SET status='failed', rollback_reason=$2 WHERE transaction_id=$1",
                        txn_id, "balance changed during booking",
                    )
                    return _fail(txn_id, provider, candidate, card_id, card_name, mode,
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
                    "UPDATE redemption_history SET status='completed', confirmation_reference=$2, "
                    "completed_at=NOW() WHERE transaction_id=$1",
                    txn_id, result.confirmation_reference,
                )

        await db.execute(
            "UPDATE recommendation_events SET user_action='confirmed' "
            "WHERE user_id=$1 AND option_label=$2 AND user_action IS NULL",
            user_id, label,
        )

        # Dynamic lifestyle learning — nudge confirmed category weight up (best-effort).
        from .. import user_service
        try:
            await user_service.update_preferences_after_redemption(user_id, candidate.get("category"))
        except Exception as exc:  # noqa: BLE001
            log.warning("update_preferences failed for %s: %s", user_id, exc)

        return {
            "status": "completed", "transaction_id": txn_id,
            "confirmation_reference": result.confirmation_reference,
            "provider_id": provider.provider_id, "path": provider.path, "mode": mode,
            "option_label": label, "card_id": card_id, "card_name": card_name,
            "currency": provider.currency, "points_used": cost,
            "balance_after": int(new_balance), "steps": result.steps,
            "rollback_reason": None, "booking_session_id": None,
            "ticket": (result.raw or {}).get("ticket"),
        }
    finally:
        if lock_client is not None:
            try:
                await lock_client.delete(lock_key)
            finally:
                await lock_client.aclose()
