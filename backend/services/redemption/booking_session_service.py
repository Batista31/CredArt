from __future__ import annotations

import time
import uuid

_TTL_SECONDS = 180
_SESSIONS: dict[str, dict] = {}


def create(user_id: str, candidate: dict, provider_id: str, *, merchant: str, amount: int, card_last4: str) -> dict:
    sid = uuid.uuid4().hex
    now = time.time()
    sess = {
        "id": sid,
        "user_id": user_id,
        "candidate": candidate,
        "provider_id": provider_id,
        "merchant": merchant,
        "amount": amount,
        "card_last4": card_last4,
        "otp_required": True,
        "status": "pending_otp",
        "otp_deadline": now + _TTL_SECONDS,
        "confirmation_reference": None,
        "error_message": None,
        "created_at": now,
    }
    _SESSIONS[sid] = sess
    return dict(sess)


def get(session_id: str) -> dict | None:
    sess = _SESSIONS.get(session_id)
    if not sess:
        return None
    if time.time() > float(sess.get("otp_deadline", 0)) and sess["status"] == "pending_otp":
        sess["status"] = "expired"
        sess["error_message"] = "OTP expired"
    return dict(sess)


def _raw(session_id: str) -> dict | None:
    return _SESSIONS.get(session_id)


def validate_otp(session_id: str, otp: str) -> tuple[bool, str | None]:
    sess = _SESSIONS.get(session_id)
    if sess is None:
        return False, "unknown booking session"
    if time.time() > float(sess.get("otp_deadline", 0)):
        return False, "OTP expired"
    if not otp or len(otp.strip()) < 4:
        return False, "invalid OTP"
    return True, None


def mark(session_id: str, status: str, *, confirmation_reference: str | None = None,
         error_message: str | None = None) -> dict | None:
    sess = _SESSIONS.get(session_id)
    if sess is None:
        return None
    sess["status"] = status
    sess["confirmation_reference"] = confirmation_reference
    sess["error_message"] = error_message
    return dict(sess)
