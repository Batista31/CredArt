"""Tango Card voucher provider — real gift card issuance via Tango Card RaaS v2.

Issues real sandbox vouchers (Amazon.in INR, Google Play USD) against the
Tango Card integration sandbox. Credentials are in TANGO_API_USER / TANGO_API_PASS.

Category routing:
  SHOPPING  -> Amazon Pay Gift Card India ₹1000 (U705529)
  DINING    -> Amazon Pay Gift Card India ₹1000 (U705529)
  ENTERTAINMENT -> Google Play gift code $5 USD (U505722)
"""

from __future__ import annotations

import os

from .base import BookingResult, RedemptionProvider

_BASE = "https://integration-api.tangocard.com/raas/v2"
_ACCOUNT = "testing1234account"
_CUSTOMER = "testing1234"

# utid -> (brand label, amount, currency)
_VOUCHERS: dict[str, tuple[str, str, float, str]] = {
    "SHOPPING":      ("U705529", "Amazon Pay Gift Card India ₹1,000", 1000, "INR"),
    "DINING":        ("U705529", "Amazon Pay Gift Card India ₹1,000", 1000, "INR"),
    "ENTERTAINMENT": ("U505722", "Google Play Gift Code $5",             5,  "USD"),
}
_DEFAULT = ("U705529", "Amazon Pay Gift Card India ₹1,000", 1000, "INR")


class TangoProvider(RedemptionProvider):
    provider_id = "tango_voucher"
    label = "Get voucher (Tango Card · live)"
    mode = "live"
    currency = "points"

    def __init__(self) -> None:
        self.user = os.getenv("TANGO_API_USER", "")
        self.pwd = os.getenv("TANGO_API_PASS", "")

    def is_available(self) -> bool:
        return bool(self.user and self.pwd)

    def unavailable_note(self) -> str | None:
        return None if self.is_available() else "set TANGO_API_USER + TANGO_API_PASS to enable"

    async def book(self, candidate: dict, traveler: dict) -> BookingResult:
        if not self.is_available():
            return BookingResult(ok=False, error="Tango Card credentials not configured")
        try:
            import httpx
        except Exception:
            return BookingResult(ok=False, error="httpx not installed")

        category = (candidate.get("category") or "SHOPPING").upper()
        utid, brand_label, amount, currency = _VOUCHERS.get(category, _DEFAULT)

        steps: list[dict] = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_BASE}/orders",
                    auth=(self.user, self.pwd),
                    json={
                        "accountIdentifier": _ACCOUNT,
                        "customerIdentifier": _CUSTOMER,
                        "sendEmail": False,
                        "utid": utid,
                        "amount": amount,
                        "sender": {
                            "firstName": "CredArt",
                            "lastName": "Concierge",
                            "email": "credart@example.com",
                        },
                        "recipient": {
                            "firstName": traveler.get("given_name", "Riya"),
                            "lastName": traveler.get("family_name", "Sharma"),
                            "email": traveler.get("email", "riya@example.com"),
                        },
                        "notes": f"CredArt redemption — {candidate.get('label', '')}",
                    },
                )
                if not resp.is_success:
                    try:
                        errs = resp.json()
                    except Exception:
                        errs = resp.text[:300]
                    raise Exception(f"Tango {resp.status_code}: {errs}")

                data = resp.json()
                order_id = data.get("referenceOrderID", "")
                credentials = (data.get("reward") or {}).get("credentials") or {}
                voucher_code = (
                    credentials.get("Gift Card ID")
                    or credentials.get("Card Number")
                    or credentials.get("Voucher Code")
                    or "see email"
                )
                steps.append({
                    "label": "Issuing voucher", "status": "done",
                    "detail": f"{brand_label} · order {order_id}",
                })
                steps.append({
                    "label": "Voucher code ready", "status": "done",
                    "detail": f"Code: {voucher_code}",
                })
                return BookingResult(
                    ok=True,
                    confirmation_reference=order_id,
                    steps=steps,
                    raw={"voucher_code": voucher_code, "brand": brand_label,
                         "amount": amount, "currency": currency},
                )
        except Exception as e:
            steps.append({"label": "Issuing voucher", "status": "failed", "detail": str(e)[:300]})
            return BookingResult(ok=False, error=str(e)[:500], steps=steps)
