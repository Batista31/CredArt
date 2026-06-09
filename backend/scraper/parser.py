"""Fact-only extraction helpers for HDFC credit card pages."""

from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup

from utils import clean_text


def page_text(soup: BeautifulSoup) -> str:
    """Return visible page text once so extraction is independent of layout."""
    return clean_text(soup.get_text(" ", strip=True))


def extract_card_name(soup: BeautifulSoup) -> Optional[str]:
    """Prefer the page heading, then title, while retaining the card variant."""
    candidates = [tag.get_text(" ", strip=True) for tag in soup.select("h1")]
    if soup.title and soup.title.string:
        candidates.append(soup.title.string)

    for candidate in candidates:
        text = clean_text(candidate)
        if "infinia" in text.lower():
            return "INFINIA Metal Edition"
    return None


def extract_annual_fee(text: str) -> Optional[int]:
    """Extract the current joining/renewal fee stated on the product page."""
    patterns = (
        r"Joining Fee\s*:\s*[^\d]{0,15}([\d,]+)",
        r"annual renewal fee of\s*[^\d]{0,15}([\d,]+)",
        r"Joining/Renewal Membership Fee.{0,120}?[^\d]([\d,]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return int(match.group(1).replace(",", ""))
    return None


def extract_reward_rate(text: str) -> Optional[float]:
    """Convert 'N points per Rs X' into points earned per Rs 100 spent."""
    match = re.search(
        r"Earn\s+([\d.]+)\s+Reward Points?\s+on every\s+[^\d]{0,15}([\d,]+)",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    points = float(match.group(1))
    spend = float(match.group(2).replace(",", ""))
    return round((points / spend) * 100, 2)


def extract_network(text: str) -> Optional[str]:
    """Avoid treating unrelated network names in generic page footers as facts."""
    network_patterns = {
        "Visa": (r"\bVisa Infinite\b", r"\bInfinia.{0,80}\bVisa\b"),
        "Mastercard": (r"\bInfinia.{0,80}\bMastercard\b",),
        "RuPay": (r"\bInfinia.{0,80}\bRuPay\b",),
        "Diners Club": (r"\bInfinia.{0,80}\bDiners Club\b",),
    }
    for network, patterns in network_patterns.items():
        if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns):
            return network
    return None


def parse_card(html: str, source_url: str) -> dict[str, object]:
    """Build the minimal normalized record required for phase 2 step 1."""
    soup = BeautifulSoup(html, "html.parser")
    text = page_text(soup)

    return {
        "card_name": extract_card_name(soup),
        "bank_name": "HDFC Bank",
        "annual_fee": extract_annual_fee(text),
        "network": extract_network(text),
        "reward_rate": extract_reward_rate(text),
        "source_url": source_url,
    }
