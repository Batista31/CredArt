"""Fetch and normalize one official HDFC card page."""

from __future__ import annotations

from pathlib import Path

import requests

from parser import parse_card
from utils import save_html, save_json


SOURCE_URL = "https://www.hdfc.bank.in/credit-cards/infinia-credit-card"
SCRAPER_DIR = Path(__file__).resolve().parent
RAW_HTML_PATH = SCRAPER_DIR / "raw" / "html" / "infinia.html"
OUTPUT_PATH = SCRAPER_DIR / "outputs" / "hdfc_catalogue.json"
REQUIRED_FIELDS = ("card_name", "bank_name", "annual_fee", "reward_rate", "source_url")


def fetch_page(url: str) -> str:
    """Use a browser-like user agent because some public sites reject defaults."""
    response = requests.get(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; CredArtScraper/1.0; "
                "+https://github.com/Batista31/CredArt)"
            )
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.text


def validate_card(card: dict[str, object]) -> None:
    """Stop visibly when HDFC markup changes instead of saving incomplete facts."""
    missing = [field for field in REQUIRED_FIELDS if card.get(field) is None]
    if missing:
        raise ValueError(f"Could not extract required fields: {', '.join(missing)}")


def main() -> None:
    """Save evidence first, then parse and persist the normalized card record."""
    html = fetch_page(SOURCE_URL)
    save_html(html, RAW_HTML_PATH)

    card = parse_card(html, SOURCE_URL)
    validate_card(card)
    save_json(card, OUTPUT_PATH)

    print(f"Saved raw HTML to {RAW_HTML_PATH}")
    print(f"Saved normalized card data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
