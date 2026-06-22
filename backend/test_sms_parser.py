"""Pure unit tests for the SMS parser (no DB). Run: python test_sms_parser.py"""

import datetime
import sys

sys.stdout.reconfigure(encoding="utf-8")

from services.sms_parser import EARN, EXPIRY_ALERT, REDEEM, UNKNOWN, parse_sms
from services.sms_senders import is_allowed_sender, normalize_sender

SENDER_CASES = [
    ("VM-HDFCBK", True),    # operator prefix + HDFC header
    ("AD-HDFCBK", True),
    ("HDFCBK", True),
    ("hdfcbk", True),       # case-insensitive
    ("AX-AXISBK", False),   # different bank
    ("VM-ICICIB", False),
    ("+919812345678", False),  # personal number spoof
    ("9812345678", False),
    ("", False),
    (None, False),
]

CASES = [
    ("Rs.1,250 spent on HDFC Millennia Card xx3391 at SWIGGY on 10-06-26. Earned 63 CashPoints. Avl pts: 3,263.",
     dict(sms_type=EARN, card_last4="3391", points_delta=63, balance_after=3263,
          amount_inr=1250.0, merchant="SWIGGY")),
    ("INR 4,000 Reward Points credited to your HDFC Regalia Gold Card ending 8842. Available balance: 50,500 points.",
     dict(sms_type=EARN, card_last4="8842", points_delta=4000, balance_after=50500)),
    ("Reminder: 3,200 CashPoints on your HDFC Millennia Card xx3391 will expire on 11-Jun-2026. Redeem now.",
     dict(sms_type=EXPIRY_ALERT, card_last4="3391", expiry_points=3200,
          expiry_date=datetime.date(2026, 6, 11))),
    ("Redemption successful. 40,000 points redeemed on HDFC Regalia Gold Card xx8842 towards Manali Weekend Stay. Ref HDFCMNL8842. Avl pts: 6,500.",
     dict(sms_type=REDEEM, card_last4="8842", points_delta=-40000, balance_after=6500,
          reference_id="HDFCMNL8842", description="Manali Weekend Stay")),
    ("Your OTP is 882913. Do not share with anyone.",
     dict(sms_type=UNKNOWN)),
]


def main():
    failures = 0
    for i, (sms, expect) in enumerate(CASES, 1):
        p = parse_sms(sms)
        for field, want in expect.items():
            got = getattr(p, field)
            if got != want:
                print(f"  ✗ case {i} {field}: got {got!r}, expected {want!r}")
                failures += 1
        if all(getattr(p, f) == v for f, v in expect.items()):
            print(f"  ✓ case {i}: {p.sms_type}")

    print("\n  sender allowlist:")
    for sender, want in SENDER_CASES:
        got = is_allowed_sender(sender)
        mark = "✓" if got == want else "✗"
        if got != want:
            failures += 1
        print(f"    {mark} {str(sender):16} -> {got} (norm={normalize_sender(sender)!r})")

    print("\n" + ("✅ all SMS cases pass" if failures == 0 else f"❌ {failures} assertion(s) failed"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
