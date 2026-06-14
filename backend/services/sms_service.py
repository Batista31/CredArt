"""Apply parsed HDFC SMS to the user's Postgres data.

This is the ONLY path by which user balance/expiry enters CredArt — the bank
MCP server never exposes user data. Writes use the backend's DB connection
(service role), which is correct: this is trusted server-side code.

Safety (per architecture audit):
  - Idempotent: every SMS is hashed; a duplicate is skipped, never re-applied.
  - Validated: point deltas and balances must fall inside sane bounds; expiry
    dates must be near-future. Out-of-range values are recorded but not applied.
  - Scoped: the card is matched within the given user's cards only.
"""

from __future__ import annotations

import datetime
import hashlib
import json

from . import db
from .sms_parser import EARN, EXPIRY_ALERT, REDEEM, UNKNOWN, ParsedSMS, parse_sms

# Validation bounds.
MAX_ABS_DELTA = 200_000       # a single SMS shouldn't move more than this
MAX_BALANCE = 10_000_000
EXPIRY_MIN = datetime.timedelta(days=-7)    # allow "expires today / just passed"
EXPIRY_MAX = datetime.timedelta(days=800)   # ~26 months (HDFC expiry <= 24m)


def _hash(user_id: str, raw: str) -> str:
    return hashlib.sha256(f"{user_id}\n{raw.strip()}".encode("utf-8")).hexdigest()


def _validate(p: ParsedSMS, today: datetime.date) -> str | None:
    """Return an error string if the parsed values are out of range, else None."""
    if p.points_delta is not None and abs(p.points_delta) > MAX_ABS_DELTA:
        return f"points_delta {p.points_delta} exceeds ±{MAX_ABS_DELTA}"
    if p.balance_after is not None and not (0 <= p.balance_after <= MAX_BALANCE):
        return f"balance_after {p.balance_after} out of range"
    if p.expiry_points is not None and not (0 <= p.expiry_points <= MAX_BALANCE):
        return f"expiry_points {p.expiry_points} out of range"
    if p.expiry_date is not None and not (today + EXPIRY_MIN <= p.expiry_date <= today + EXPIRY_MAX):
        return f"expiry_date {p.expiry_date} not near-future"
    return None


async def ingest_sms(
    user_id: str,
    raw_text: str,
    sender: str = "HDFCBK",
    received_at: datetime.datetime | None = None,
) -> dict:
    """Parse + apply one SMS for a user. Returns a result summary."""
    received_at = received_at or datetime.datetime.now(datetime.timezone.utc)
    today = received_at.date()
    sms_hash = _hash(user_id, raw_text)

    pool = await db.get_pool()
    async with pool.acquire() as conn:
        # Idempotency — already seen this exact SMS?
        existing = await conn.fetchrow(
            "SELECT id, sms_type, applied FROM sms_messages WHERE sms_hash = $1", sms_hash
        )
        if existing:
            return {"status": "duplicate", "sms_type": existing["sms_type"],
                    "applied": existing["applied"]}

        parsed = parse_sms(raw_text)

        # Match the card within THIS user's cards by last 4 digits.
        user_card = None
        if parsed.card_last4:
            user_card = await conn.fetchrow(
                "SELECT id, current_points FROM user_cards "
                "WHERE user_id = $1 AND card_number_masked LIKE $2",
                user_id, f"%{parsed.card_last4}",
            )

        error = _validate(parsed, today)
        if parsed.sms_type == UNKNOWN:
            error = error or "unrecognised SMS format"
        if user_card is None and parsed.sms_type != UNKNOWN:
            error = error or f"no card ending {parsed.card_last4} for user"

        applied = False
        async with conn.transaction():
            if error is None:
                applied = await _apply(conn, parsed, user_card, received_at)

            await conn.execute(
                """
                INSERT INTO sms_messages
                    (user_id, user_card_id, sms_hash, sender, sms_type,
                     card_last4, raw_text, parsed, applied, error_message, received_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
                """,
                user_id, user_card["id"] if user_card else None, sms_hash, sender,
                parsed.sms_type, parsed.card_last4, raw_text,
                json.dumps(parsed.to_jsonable()),
                applied, error, received_at,
            )

    return {"status": "applied" if applied else "recorded",
            "sms_type": parsed.sms_type, "applied": applied,
            "error": error, "parsed": parsed.to_jsonable()}


async def _apply(conn, p: ParsedSMS, user_card, received_at) -> bool:
    """Apply a validated SMS to user_cards / points_ledger / redemption_history."""
    uc_id = user_card["id"]

    if p.sms_type == EXPIRY_ALERT:
        await conn.execute(
            "UPDATE user_cards SET next_expiry_points = COALESCE($2, next_expiry_points), "
            "next_expiry_date = COALESCE($3, next_expiry_date) WHERE id = $1",
            uc_id, p.expiry_points, p.expiry_date,
        )
        return True

    if p.sms_type in (EARN, REDEEM):
        if p.points_delta is None and p.balance_after is None:
            return False  # nothing actionable
        # Bank's stated balance wins; otherwise apply the delta to current.
        if p.balance_after is not None:
            new_balance = p.balance_after
        else:
            new_balance = user_card["current_points"] + p.points_delta
        delta = p.points_delta if p.points_delta is not None else (
            new_balance - user_card["current_points"])

        await conn.execute(
            """
            INSERT INTO points_ledger
                (user_card_id, transaction_type, points_delta, balance_after,
                 description, created_at)
            VALUES ($1,$2,$3,$4,$5,$6)
            """,
            uc_id, p.sms_type, delta, new_balance,
            p.description or p.sms_type, received_at,
        )
        await conn.execute(
            "UPDATE user_cards SET current_points = $2 WHERE id = $1", uc_id, new_balance
        )

        # Redemption confirmation flips a matching pending redemption to done.
        if p.sms_type == REDEEM:
            await conn.execute(
                """
                UPDATE redemption_history
                   SET status = 'completed',
                       completed_at = $3,
                       confirmation_reference = COALESCE($4, confirmation_reference)
                 WHERE id = (
                     SELECT id FROM redemption_history
                      WHERE user_card_id = $1 AND status = 'pending'
                        AND ($2::int IS NULL OR points_used = $2)
                      ORDER BY created_at DESC LIMIT 1
                 )
                """,
                uc_id, abs(p.points_delta) if p.points_delta is not None else None,
                received_at, p.reference_id,
            )
        return True

    return False
