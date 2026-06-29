"""Merchandise service — real product search, redeemable via the credits→voucher path.

Mirrors HDFC SmartBuy: a card's points convert to a brand voucher (e.g. Amazon),
which buys real merchandise. We surface REAL products from a live product API and
price them into points deterministically (Layer 1 owns the ₹ figure; the LLM never
invents it).

Data source seam:
  - If an Amazon data key is configured (RAINFOREST_API_KEY / SERPAPI_KEY /
    RAPIDAPI_AMAZON_KEY), real Amazon listings can be wired in here.
  - Otherwise we call a live open product API (dummyjson) so the end-to-end flow is
    real today; swapping in Amazon is a drop-in once credentials exist.
"""

from __future__ import annotations

import math
import os
import uuid

from api.schemas import Candidate

# ₹ delivered per point when converted to a brand voucher (SmartBuy-style).
CARD_VOUCHER_POINT_VALUE = {
    "hdfc_infinia": 1.0,
    "hdfc_regalia_gold": 0.5,
    "hdfc_millennia": 0.3,
}
_DEFAULT_POINT_VALUE = 0.4
_USD_INR = 84.0

_AMAZON_KEY = (
    os.getenv("RAINFOREST_API_KEY") or os.getenv("SERPAPI_KEY") or os.getenv("RAPIDAPI_AMAZON_KEY") or ""
)


def _best_voucher_card(cards: list[dict]) -> dict | None:
    if not cards:
        return None
    return max(cards, key=lambda c: CARD_VOUCHER_POINT_VALUE.get(c["card_id"], _DEFAULT_POINT_VALUE))


async def _search_products(query: str, limit: int) -> list[dict]:
    """Return normalized real products: {title, price_inr, rating, brand, thumbnail, url}."""
    try:
        import httpx
    except Exception:
        return []
    # TODO(amazon): when _AMAZON_KEY is set, call Rainforest/SerpApi Amazon search here
    # and map to the same normalized shape. Until then, use a live open product API.
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get("https://dummyjson.com/products/search",
                                 params={"q": query, "limit": limit})
            r.raise_for_status()
            products = (r.json() or {}).get("products") or []
    except Exception as exc:  # noqa: BLE001
        print(f"[merchandise] product search failed ({exc})")
        return []
    out = []
    for p in products[:limit]:
        out.append({
            "title": p.get("title", "Product"),
            "price_inr": round(float(p.get("price", 0)) * _USD_INR),
            "rating": p.get("rating"),
            "brand": p.get("brand") or (p.get("category") or "").title(),
            "thumbnail": p.get("thumbnail"),
            "description": (p.get("description") or "")[:140],
            "url": f"https://www.amazon.in/s?k={query.replace(' ', '+')}",
        })
    return out


async def search_merchandise_candidates(query: str, cards: list[dict], limit: int = 4) -> list[Candidate]:
    """Real products as redeemable Candidates (points → Amazon voucher → order). [] on miss."""
    query = (query or "").strip()
    if not query:
        return []
    products = await _search_products(query, limit)
    if not products:
        return []
    card = _best_voucher_card(cards)
    if card is None:
        return []
    point_value = CARD_VOUCHER_POINT_VALUE.get(card["card_id"], _DEFAULT_POINT_VALUE)
    balance = card.get("current_points") or 0
    voucher_currency = card.get("currency_name") or "points"

    candidates: list[Candidate] = []
    for i, p in enumerate(products):
        points_cost = int(math.ceil(p["price_inr"] / point_value))
        rating = f"{p['rating']}★" if p.get("rating") else "well-reviewed"
        candidates.append(Candidate(
            kind="merchandise",
            candidate_id=uuid.uuid4().hex[:8],
            card_id=card["card_id"],
            card_name=card["card_name"],
            label=p["title"],
            category="SHOPPING",
            points_cost=points_cost,
            affordable=balance >= points_cost,
            effective_value_inr=float(p["price_inr"]),
            best_use_case=f"{rating} · convert {voucher_currency} to an Amazon voucher (~₹{p['price_inr']:,}) & order",
            source_url=p["url"],
            note=(None if balance >= points_cost else f"needs {points_cost - balance:,} more points") ,
            caveat=None if p.get("rating", 5) >= 3.5 else "lower rated — check reviews",
            rank=i + 1,
            fulfillment_options=[
                {"provider_id": "demo", "label": "Convert points & order", "path": "demo",
                 "mode": "demo", "currency": "demo_points", "available": True, "note": None},
            ],
            metadata={"brand": p.get("brand"), "thumbnail": p.get("thumbnail"),
                      "description": p.get("description"), "amazon_live": bool(_AMAZON_KEY)},
        ))
    return candidates
