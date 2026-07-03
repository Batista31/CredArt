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

Fulfillment (converting points into an actual voucher) is a separate concern,
handled by services/redemption/tango_provider.py (TANGO_API_USER/TANGO_API_PASS) —
this module only searches/prices products, it doesn't issue vouchers.
"""

from __future__ import annotations

import math
import os
import uuid

from api.schemas import Candidate
from .card_selector import pick_card

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


def _clean_query(query: str) -> str:
    """Reduce a free-text ask to the concrete product noun we recognize.

    Reuses the same intent keyword list that classifies "buy a cooker" as a product
    purchase (`intent._PRODUCT_WORDS`). Open product APIs (dummyjson today) do AND-token
    matching, so a full phrase like "a coffee maker for my kitchen under 10000" matches
    nothing and we'd fall back to unrelated vouchers. Searching the recognized noun
    ("coffee maker") returns real, relevant products — or a clean empty result the
    caller can be honest about, instead of invalid data from stray words.

    Falls back to the stripped raw query when no product noun is recognized.
    """
    q = (query or "").lower()
    if not q.strip():
        return ""
    from api.intent import _PRODUCT_WORDS
    # Longest phrase first so "washing machine" wins over a bare "machine", and
    # generic catch-alls ("product", "gadget", "appliance") only win if nothing
    # more specific is present.
    _generic = {"product", "merchandise", "gadget", "appliance"}
    specific = [w for w in _PRODUCT_WORDS if w not in _generic]
    for w in sorted(specific, key=len, reverse=True):
        if w in q:
            return w
    for w in _generic:
        if w in q:
            return w
    return query.strip()


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


def _catalog_candidate(p: dict, card: dict, balance: int, rank: int) -> Candidate:
    """One rewards-catalogue product as a redeemable Candidate. Points price is
    catalogue-wide (the bank store's own price), never derived or invented."""
    points_cost = int(p["points"])
    affordable = balance >= points_cost
    return Candidate(
        kind="merchandise",
        candidate_id=uuid.uuid4().hex[:8],
        card_id=card["card_id"],
        card_name=card["card_name"],
        label=p["title"],
        category="SHOPPING",
        points_cost=points_cost,
        affordable=affordable,
        effective_value_inr=float(p["value_inr"]),
        best_use_case=(f"{p['brand']} · {p['blurb']}" + ("" if affordable else " · save up a little more")),
        source_url=None,
        note=(None if affordable else f"needs {points_cost - balance:,} more points"),
        caveat=None,
        rank=rank,
        fulfillment_options=[
            {"provider_id": "demo", "label": "Order with points", "path": "demo",
             "mode": "demo", "currency": "demo_points", "available": True, "note": None},
        ],
        metadata={"brand": p["brand"], "icon": p["icon"], "description": p["blurb"],
                  "catalog_id": p["id"], "source": "rewards_catalogue"},
    )


async def search_merchandise_candidates(
    query: str, cards: list[dict], limit: int = 4, active_card_id: str | None = None
) -> tuple[list[Candidate], dict | None]:
    """Rewards-catalogue products as redeemable Candidates. Catalogue-first (the
    bank's own merchandise store is the primary sales channel); affordable items
    lead so the user always sees something they can order right now.
    ([], None) on miss — the caller then offers the voucher alternative."""
    query = (query or "").strip()
    if not query:
        return [], None
    from . import merchandise_catalog
    products = merchandise_catalog.search(_clean_query(query), limit)
    if not products:
        return [], None
    card, suggestion = pick_card(cards, CARD_VOUCHER_POINT_VALUE, _DEFAULT_POINT_VALUE, active_card_id)
    if card is None:
        return [], None
    balance = card.get("current_points") or 0
    # Affordable first (cheapest leading), then aspirational — maximizes the
    # chance the top card is a one-tap order.
    products.sort(key=lambda p: (balance < p["points"], p["points"]))
    return [_catalog_candidate(p, card, balance, i + 1) for i, p in enumerate(products)], suggestion


def popular_catalog_candidates(
    cards: list[dict], limit: int = 3, active_card_id: str | None = None
) -> list[Candidate]:
    """Catalogue bestsellers — shown when a search misses so the catalogue stays
    in front of the user instead of dead-ending into vouchers only."""
    from . import merchandise_catalog
    card, _ = pick_card(cards, CARD_VOUCHER_POINT_VALUE, _DEFAULT_POINT_VALUE, active_card_id)
    if card is None:
        return []
    balance = card.get("current_points") or 0
    return [_catalog_candidate(p, card, balance, i + 1)
            for i, p in enumerate(merchandise_catalog.popular(limit))]


def amazon_voucher_candidate(
    cards: list[dict], active_card_id: str | None = None,
    budget_inr: float | None = None, rank: int = 1,
) -> Candidate | None:
    """The flexible fallback: points → Amazon voucher → buy anything. Offered
    only when the catalogue misses or the user isn't satisfied with it — the
    catalogue stays the primary channel."""
    card, _ = pick_card(cards, CARD_VOUCHER_POINT_VALUE, _DEFAULT_POINT_VALUE, active_card_id)
    if card is None:
        return None
    point_value = CARD_VOUCHER_POINT_VALUE.get(card["card_id"], _DEFAULT_POINT_VALUE)
    balance = card.get("current_points") or 0
    # Denomination: the stated budget if we have one, else what the full balance
    # is worth (both deterministic — no invented figures).
    amount_inr = int(budget_inr) if budget_inr else int(balance * point_value)
    amount_inr = max(100, amount_inr)
    points_cost = int(math.ceil(amount_inr / point_value))
    return Candidate(
        kind="redemption",
        candidate_id=uuid.uuid4().hex[:8],
        card_id=card["card_id"],
        card_name=card["card_name"],
        label=f"Amazon Voucher — ₹{amount_inr:,}",
        category="SHOPPING",
        points_cost=points_cost,
        affordable=balance >= points_cost,
        effective_value_inr=float(amount_inr),
        best_use_case="fully flexible — buy exactly what you want, any brand",
        source_url=None,
        note=(None if balance >= points_cost else f"needs {points_cost - balance:,} more points"),
        caveat=None,
        rank=rank,
        fulfillment_options=[
            {"provider_id": "tango_voucher", "label": "Convert points → Amazon voucher",
             "path": "api", "mode": "live", "currency": "points", "available": True, "note": None},
            {"provider_id": "demo", "label": "Demo (simulate voucher)", "path": "demo",
             "mode": "demo", "currency": "demo_points", "available": True, "note": None},
        ],
        metadata={"brand": "Amazon", "icon": "🎟️", "source": "voucher_fallback"},
    )
