"""Booking sessions — hot store for production OTP-gated bookings.

Holds the live state of an in-flight production booking (api/assisted) while it
waits for OTP. In-memory for now (single-process demo); a Redis-hot + Postgres
write-through store is the next step. Carries NO secrets — no card PAN, no CVV,
and never the OTP. OTP is validated in-request and discarded.
"""

from __future__ import annotations

import time
from uuid import uuid4

OTP_TTL_SECONDS = 170  # ~2:43, matches the UI countdown

_SESSIONS: dict[str, dict] = {}


def create(user_id: str, candidate: dict, provider_id: str, *, merchant: str,
           amount: int, card_last4: str) -> dict:
    sid = uuid4().hex
    sess = {
        "id": sid,
        "user_id": user_id,
        "candidate": candidate,          # needed to finalize after OTP
        "provider_id": provider_id,
        "merchant": merchant,
        "amount": amount,
        "card_last4": card_last4,
        "status": "otp_required",
        "otp_required": True,
        "otp_deadline": time.time() + OTP_TTL_SECONDS,
        "confirmation_reference": None,
        "error_message": None,
    }
    _SESSIONS[sid] = sess
    return _public(sess)


def get(sid: str) -> dict | None:
    sess = _SESSIONS.get(sid)
    if sess is None:
        return None
    if sess["status"] == "otp_required" and time.time() > sess["otp_deadline"]:
        sess["status"] = "expired"
        sess["error_message"] = "OTP expired"
    return _public(sess)


def _raw(sid: str) -> dict | None:
    return _SESSIONS.get(sid)


def validate_otp(sid: str, otp: str) -> tuple[bool, str | None]:
    """Check an OTP without ever storing it. Returns (ok, reason)."""
    sess = _SESSIONS.get(sid)
    if sess is None:
        return False, "unknown booking session"
    if sess["status"] != "otp_required":
        return False, f"session is {sess['status']}"
    if time.time() > sess["otp_deadline"]:
        sess["status"] = "expired"
        sess["error_message"] = "OTP expired"
        return False, "OTP expired"
    otp = (otp or "").strip()
    if len(otp) != 6 or not otp.isdigit():
        return False, "OTP must be 6 digits"
    if otp == "000000":  # demo's deliberate 'wrong code'
        return False, "incorrect OTP"
    return True, None


def mark(sid: str, status: str, **fields) -> None:
    sess = _SESSIONS.get(sid)
    if sess is not None:
        sess["status"] = status
        sess.update(fields)


def _public(sess: dict) -> dict:
    """Outward view — no candidate internals, no secrets."""
    return {
        "id": sess["id"], "status": sess["status"], "merchant": sess["merchant"],
        "amount": sess["amount"], "card_last4": sess["card_last4"],
        "otp_required": sess["otp_required"], "otp_deadline": sess["otp_deadline"],
        "confirmation_reference": sess["confirmation_reference"],
        "error_message": sess["error_message"],
    }
