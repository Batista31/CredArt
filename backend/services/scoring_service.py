"""Layer 1 scoring engine (Phase 6) — deterministic 5-dimension ranking.

Each candidate is scored 0–100 on five dimensions, combined with fixed weights
into a total. Everything is computed from real data (catalogue transfer values,
the user's preference weights, expiry timing, redemption history) — no invented
numbers. The score is an internal ranking signal, never shown to the user as a
₹ value. Claude (Phase 7) reranks/explains these candidates; it never recomputes
the score and never sees the DB.

Dimensions and default weights:
  financial        0.35  — how valuable this card's points are (best ₹/pt)
  lifestyle        0.25  — candidate category vs the user's preference weights
  redemption_prob  0.20  — historical confirm rate (recommendation_events)
  expiry_risk      0.10  — urgency from days-to-expiry
  flexibility      0.10  — optionality of the redemption kind
"""

from __future__ import annotations

import logging
from decimal import Decimal

from . import cmr_service, db, transfer_partners_service, user_service

log = logging.getLogger(__name__)

WEIGHTS = {
    "financial": 0.35,
    "lifestyle": 0.25,
    "redemption_prob": 0.20,
    "expiry_risk": 0.10,
    "flexibility": 0.10,
}

# candidate.category -> preferences column
CATEGORY_TO_PREF = {
    "TRAVEL": "travel_weight",
    "DINING": "dining_weight",
    "SHOPPING": "shopping_weight",
    "ENTERTAINMENT": "experiences_weight",
    "WELLNESS": "experiences_weight",
    "MILESTONE": "cashback_weight",
}
_PREF_KEYS = ["travel_weight", "dining_weight", "shopping_weight",
             "cashback_weight", "experiences_weight"]

# Optionality by kind: transfer converts many ways, points kept are flexible,
# a fixed redemption locks value in.
FLEXIBILITY = {"transfer": 85.0, "expiry": 55.0, "perk": 60.0, "redemption": 40.0}


def _normalize(raw: dict[int, float]) -> dict[int, float]:
    """Min-max to 10–100; flat set -> neutral 60."""
    vals = list(raw.values())
    lo, hi = min(vals), max(vals)
    if hi == lo:
        return {k: 60.0 for k in raw}
    return {k: 10 + 90 * (v - lo) / (hi - lo) for k, v in raw.items()}


def _f(x, default=0.0) -> float:
    return float(x) if x is not None else default


async def _best_card_values(card_ids: set[str]) -> dict[str, float]:
    """Best ₹/pt across a card's transfer partners (real catalogue data)."""
    out: dict[str, float] = {}
    for cid in card_ids:
        partners = await transfer_partners_service.get_transfer_partners(cid)
        vals = [_f(p["effective_value_inr"]) for p in partners if p["effective_value_inr"] is not None]
        out[cid] = max(vals) if vals else 0.3
    return out


async def _confirm_rates(user_id: str) -> dict[str, float]:
    """Per option_type confirm rate from recommendation_events history."""
    rows = await db.fetch(
        """
        SELECT option_type, user_action, COUNT(*)::int AS n
          FROM recommendation_events
         WHERE user_id = $1 AND user_action IS NOT NULL
         GROUP BY option_type, user_action
        """,
        user_id,
    )
    agg: dict[str, dict[str, int]] = {}
    for r in rows:
        d = agg.setdefault(r["option_type"], {"confirmed": 0, "total": 0})
        d["total"] += r["n"]
        if r["user_action"] == "confirmed":
            d["confirmed"] += r["n"]
    return {k: (v["confirmed"] / v["total"]) for k, v in agg.items() if v["total"]}


def _lifestyle(cand, prefs: dict, max_pref: float) -> float:
    """Preference-category fit, blended with semantic relevance when the
    candidate came from a search (so a directly-matched reward isn't buried)."""
    key = CATEGORY_TO_PREF.get((cand.category or "").upper(), "experiences_weight")
    w = _f(prefs.get(key), 0.2)
    pref_score = min(100.0, 100.0 * w / max_pref) if max_pref else 50.0
    if cand.similarity is not None:
        return round(0.5 * pref_score + 0.5 * (cand.similarity * 100), 1)
    return pref_score


def _redemption_prob(cand, rates: dict, prefs: dict) -> float:
    if cand.kind == "redemption" and cand.affordable is False:
        return 15.0  # can't redeem what you can't afford
    if cand.kind in rates:
        return 100.0 * rates[cand.kind]
    tr, td = _f(prefs.get("total_redemptions")), _f(prefs.get("total_dismissals"))
    if tr + td > 0:
        return 100.0 * tr / (tr + td)
    return 60.0  # neutral cold-start prior


def _expiry_risk(days: int | None) -> float:
    if days is None:
        return 15.0
    if days <= 0:
        return 100.0
    if days <= 2:
        return 90.0
    if days <= 7:
        return 75.0
    if days <= 30:
        return 40.0
    return 15.0


async def score_candidates(user_id: str, candidates: list, cards: list[dict],
                           *, prefs: dict | None = None,
                           wishlist_labels: set | None = None) -> list:
    """Attach 5-dim scores + total, sort desc, set rank. Mutates+returns list.

    `prefs` / `wishlist_labels` may be injected by the orchestrator (which has
    already fetched the CMR profile) to avoid a redundant DB round-trip; when
    omitted they default to a fresh fetch / no boost. The CMR boost (preferred
    airline/hotel/cuisine match + wishlist) is added to score_total AFTER the
    weighted 5-dim sum, so the deterministic core score stays the primary signal.
    """
    if not candidates:
        return candidates

    if prefs is None:
        prefs = await user_service.get_preferences(user_id) or {}
    if wishlist_labels is None:
        wishlist_labels = set()
    rates = await _confirm_rates(user_id)
    days_of = {c["card_id"]: c["days_to_expiry"] for c in cards}
    card_val = await _best_card_values({c.card_id for c in candidates})
    max_pref = max((_f(prefs.get(k)) for k in _PREF_KEYS), default=0.0) or 1.0

    fin = _normalize({i: card_val.get(c.card_id, 0.3) for i, c in enumerate(candidates)})

    for i, c in enumerate(candidates):
        c.score_financial = round(fin[i], 1)
        c.score_lifestyle = round(_lifestyle(c, prefs, max_pref), 1)
        c.score_redemption_prob = round(_redemption_prob(c, rates, prefs), 1)
        c.score_expiry_risk = round(_expiry_risk(days_of.get(c.card_id)), 1)
        c.score_flexibility = round(FLEXIBILITY.get(c.kind, 50.0), 1)
        base = (
            WEIGHTS["financial"] * c.score_financial
            + WEIGHTS["lifestyle"] * c.score_lifestyle
            + WEIGHTS["redemption_prob"] * c.score_redemption_prob
            + WEIGHTS["expiry_risk"] * c.score_expiry_risk
            + WEIGHTS["flexibility"] * c.score_flexibility
        )
        boost = cmr_service.preference_boost(c, prefs, wishlist_labels)
        c.score_total = round(min(100.0, base + boost), 1)

    candidates.sort(key=lambda c: c.score_total, reverse=True)
    for rank, c in enumerate(candidates, 1):
        c.rank = rank
    return candidates


async def update_preferences(user_id: str, confirmed_category: str) -> None:
    """Dynamic lifestyle learning: after a confirmed redemption, bump the chosen
    category's preference weight (+0.10, capped 0.90) and renormalize all five
    weights so they sum to exactly 1.000. Best-effort — callers wrap this so it
    never breaks the redemption itself."""
    col = CATEGORY_TO_PREF.get((confirmed_category or "").upper())
    if col is None:
        return

    prefs = await user_service.get_preferences(user_id)
    if prefs is None:
        return

    weights = {k: _f(prefs.get(k), 0.2) for k in _PREF_KEYS}
    weights[col] = min(0.90, weights[col] + 0.10)

    total = sum(weights.values()) or 1.0
    normed = {k: round(v / total, 3) for k, v in weights.items()}

    # Renormalization + rounding leaves float drift; absorb it into the largest
    # weight so the five values sum to exactly 1.000.
    drift = round(1.0 - sum(normed.values()), 3)
    if drift:
        largest = max(normed, key=normed.get)
        normed[largest] = round(normed[largest] + drift, 3)

    await db.execute(
        """
        UPDATE preferences
           SET travel_weight=$2, dining_weight=$3, shopping_weight=$4,
               cashback_weight=$5, experiences_weight=$6,
               total_redemptions=total_redemptions+1, updated_at=NOW()
         WHERE user_id=$1
        """,
        user_id,
        Decimal(str(normed["travel_weight"])), Decimal(str(normed["dining_weight"])),
        Decimal(str(normed["shopping_weight"])), Decimal(str(normed["cashback_weight"])),
        Decimal(str(normed["experiences_weight"])),
    )
    log.info("lifestyle weights updated for %s (+%s -> %s): %s",
             user_id, confirmed_category, col, normed)


async def log_recommendation_events(user_id: str, session_id: str, candidates: list, top: int = 3) -> None:
    """Persist the top scored candidates as the training signal (user_action set later)."""
    for c in candidates[:top]:
        await db.execute(
            """
            INSERT INTO recommendation_events
                (user_id, session_id, recommendation_rank, option_type, option_label,
                 score_financial, score_lifestyle, score_redemption_prob, score_expiry_risk,
                 score_flexibility, score_total, weight_financial, weight_lifestyle,
                 weight_redemption_prob, weight_expiry_risk, weight_flexibility)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            """,
            user_id, session_id, c.rank, c.kind, c.label,
            c.score_financial, c.score_lifestyle, c.score_redemption_prob,
            c.score_expiry_risk, c.score_flexibility, c.score_total,
            WEIGHTS["financial"], WEIGHTS["lifestyle"], WEIGHTS["redemption_prob"],
            WEIGHTS["expiry_risk"], WEIGHTS["flexibility"],
        )
