"""Registered bank SMS sender allowlist (security control).

CredArt may ONLY parse SMS from the official DLT-registered sender headers of
the bank(s) it works with. Anything else — another bank, a marketing
shortcode, or (critically) a personal 10-digit number spoofing a bank — is
rejected BEFORE parsing, so it can never inject a fake balance.

This is enforced server-side in addition to the app only being granted SMS
read access for the bank's sender. Never trust the client to have filtered.

Indian DLT headers look like `<2-char operator/telemarketer prefix>-<HEADER>`,
e.g. `VM-HDFCBK`, `AD-HDFCBK`, `JD-HDFCBK`. The principal-entity header
(`HDFCBK`) is the part we allowlist.
"""

from __future__ import annotations

import re

# Official DLT principal-entity headers per bank we support.
# Add a new bank here when onboarding it.
ALLOWED_HEADERS: dict[str, set[str]] = {
    "hdfc": {"HDFCBK", "HDFCBN", "HDFCNB"},
}

_ALL_HEADERS = {h for headers in ALLOWED_HEADERS.values() for h in headers}


def normalize_sender(sender: str | None) -> str:
    """Reduce a raw sender to its DLT header. 'VM-HDFCBK' -> 'HDFCBK'."""
    if not sender:
        return ""
    s = sender.strip().upper()
    if "-" in s:                      # drop the operator/telemarketer prefix
        s = s.rsplit("-", 1)[-1]
    return re.sub(r"[^A-Z0-9]", "", s)


def is_allowed_sender(sender: str | None, bank: str | None = None) -> bool:
    """True only if `sender` is a registered header of a supported bank.

    A numeric (personal-number) sender is always rejected — bank transactional
    SMS never originate from a 10-digit number.
    """
    header = normalize_sender(sender)
    if not header or header.isdigit():
        return False
    allowed = ALLOWED_HEADERS.get(bank, set()) if bank else _ALL_HEADERS
    return header in allowed
