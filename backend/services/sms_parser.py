"""Pure HDFC SMS parser — text in, structured data out. No DB, no IO.

CredArt gets user balance/expiry ONLY from the bank's SMS (the bank MCP server
is card-level and never exposes user data). This module turns a raw SMS into a
ParsedSMS the ingest service can apply.

It is deliberately regex-light and bounded (length cap, simple anchored
patterns, no nested quantifiers) so a malformed or hostile SMS cannot cause
catastrophic backtracking (ReDoS).
"""

from __future__ import annotations

import datetime
import re
from dataclasses import asdict, dataclass

MAX_SMS_LEN = 1000  # anything longer is rejected outright

# SMS types we recognise.
EARN = "earn"
REDEEM = "redeem"
EXPIRY_ALERT = "expiry_alert"
UNKNOWN = "unknown"


@dataclass
class ParsedSMS:
    sms_type: str
    card_last4: str | None = None
    points_delta: int | None = None          # +earn, -redeem
    balance_after: int | None = None         # bank's authoritative balance
    expiry_points: int | None = None
    expiry_date: datetime.date | None = None
    amount_inr: float | None = None
    merchant: str | None = None
    reference_id: str | None = None
    description: str | None = None

    def to_jsonable(self) -> dict:
        d = asdict(self)
        if self.expiry_date is not None:
            d["expiry_date"] = self.expiry_date.isoformat()
        return d


# ----------------------------------------------------------------- helpers
def _int(text: str | None) -> int | None:
    if text is None:
        return None
    return int(text.replace(",", "").strip())


def _num(text: str | None) -> float | None:
    if text is None:
        return None
    return float(text.replace(",", "").strip())


_MONTHS = {m.lower(): i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}


def _date(text: str | None) -> datetime.date | None:
    """Parse DD-Mon-YYYY / DD-MM-YY / DD/MM/YYYY (2-digit year -> 2000s)."""
    if not text:
        return None
    text = text.strip()
    m = re.fullmatch(r"(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})", text)
    if m:
        day, mon, year = int(m.group(1)), _MONTHS.get(m.group(2).lower()), int(m.group(3))
        if mon is None:
            return None
        if year < 100:
            year += 2000
        try:
            return datetime.date(year, mon, day)
        except ValueError:
            return None
    m = re.fullmatch(r"(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})", text)
    if m:
        day, mon, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        try:
            return datetime.date(year, mon, day)
        except ValueError:
            return None
    return None


# 4-digit group following the word "Card" (handles xx / ending / ending in / no.)
_LAST4 = re.compile(r"[Cc]ard[^\d]{0,15}(\d{4})\b")
_POINTS_WORD = r"(?:reward\s*points?|cashpoints?|points?)"
_BALANCE = re.compile(
    r"(?:avl\.?\s*pts|available\s*balance|total\s*balance|avl\.?\s*points|balance)"
    r"[^\d]{0,8}([\d,]+)", re.IGNORECASE)
_DATE_TOKEN = r"(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})"


def parse_sms(text: str) -> ParsedSMS:
    """Parse a single HDFC SMS body into a ParsedSMS (never raises)."""
    if not text or len(text) > MAX_SMS_LEN:
        return ParsedSMS(sms_type=UNKNOWN, description="empty or oversized SMS")

    t = " ".join(text.split())  # collapse whitespace
    low = t.lower()

    last4_m = _LAST4.search(t)
    last4 = last4_m.group(1) if last4_m else None
    bal_m = _BALANCE.search(t)
    balance_after = _int(bal_m.group(1)) if bal_m else None

    # --- EXPIRY ALERT (checked first: an alert may also say "redeem now") ---
    if "expire" in low or "expiry" in low:
        pts = re.search(r"([\d,]+)\s*" + _POINTS_WORD + r"\b", low)
        dm = re.search(r"(?:expire[s]?|expiry)[^\d]{0,12}" + _DATE_TOKEN, t, re.IGNORECASE)
        return ParsedSMS(
            sms_type=EXPIRY_ALERT,
            card_last4=last4,
            expiry_points=_int(pts.group(1)) if pts else None,
            expiry_date=_date(dm.group(1)) if dm else None,
            description="expiry alert",
        )

    # --- REDEEM (redemption confirmation; requires past-tense / "redemption") ---
    if "redeemed" in low or "redemption" in low:
        pts = re.search(r"([\d,]+)\s*" + _POINTS_WORD + r"\s*redeem", low) \
            or re.search(r"redeem(?:ed|ption)?[^\d]{0,12}([\d,]+)\s*" + _POINTS_WORD, low)
        ref = re.search(r"(?:ref|reference|txn)\.?\s*[:#]?\s*([A-Za-z0-9]{5,})", t, re.IGNORECASE)
        towards = re.search(r"(?:towards|for)\s+([A-Za-z0-9][\w '&-]{2,40}?)(?:\.|,|\s+Ref|$)", t, re.IGNORECASE)
        delta = _int(pts.group(1)) if pts else None
        return ParsedSMS(
            sms_type=REDEEM,
            card_last4=last4,
            points_delta=-delta if delta is not None else None,
            balance_after=balance_after,
            reference_id=ref.group(1) if ref else None,
            description=towards.group(1).strip() if towards else "redemption",
        )

    # --- EARN (spend reward or points credited) ---
    if "earn" in low or "credit" in low or "spent" in low:
        pts = re.search(r"(?:earned|credited)[^\d]{0,8}([\d,]+)\s*" + _POINTS_WORD, low) \
            or re.search(r"([\d,]+)\s*" + _POINTS_WORD + r"\s*(?:credited|earned)", low)
        amt = re.search(r"(?:rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)\s*spent", low)
        merch = re.search(r"\bat\s+([A-Z][A-Za-z0-9 &.\-]{1,30}?)\s+on\b", t)
        delta = _int(pts.group(1)) if pts else None
        return ParsedSMS(
            sms_type=EARN,
            card_last4=last4,
            points_delta=delta,
            balance_after=balance_after,
            amount_inr=_num(amt.group(1)) if amt else None,
            merchant=merch.group(1).strip() if merch else None,
            description="points earned",
        )

    return ParsedSMS(sms_type=UNKNOWN, card_last4=last4, description="unrecognised format")
