"""
5-Dimension Scoring Engine — Layer 1.

Dimensions:
  1. value_per_point   — currency value unlocked per point
  2. expiry_urgency    — value-at-risk from expiring points
  3. lifestyle_fit     — category match to user lifestyle tags
  4. redemption_ease   — friction score (lower = easier)
  5. opportunity_cost  — loss vs. best available alternative
"""

from datetime import date, datetime
from ...models.schemas import UserCard


DIMENSION_WEIGHTS_DEFAULT = {
    "value_per_point": 0.30,
    "expiry_urgency": 0.20,
    "lifestyle_fit": 0.25,
    "redemption_ease": 0.10,
    "opportunity_cost": 0.15,
}


def _value_per_point(option: dict, card: UserCard) -> float:
    pts = option.get("points_required", 1) or 1
    inr = option.get("value_inr", 0)
    return min(inr / pts, 1.0)  # normalised to [0, 1] assuming max 1 INR/pt


def _expiry_urgency(option: dict) -> float:
    expiry_str = option.get("expiry_date")
    if not expiry_str:
        return 0.0
    try:
        expiry = datetime.fromisoformat(expiry_str).date()
        days_left = (expiry - date.today()).days
        if days_left <= 0:
            return 1.0
        return max(0.0, 1.0 - days_left / 90)  # full urgency under 90 days
    except ValueError:
        return 0.0


def _lifestyle_fit(option: dict, lifestyle_tags: list[str]) -> float:
    option_tags = set(option.get("tags", []))
    user_tags = set(lifestyle_tags)
    if not option_tags:
        return 0.5
    overlap = len(option_tags & user_tags)
    return min(overlap / len(option_tags), 1.0)


def _redemption_ease(option: dict) -> float:
    # Inverse of step_count normalised to [0,1]
    steps = option.get("redemption_steps", 3)
    return max(0.0, 1.0 - (steps - 1) / 5)


def _opportunity_cost(option: dict, best_value_inr: float) -> float:
    value = option.get("value_inr", 0)
    if best_value_inr <= 0:
        return 0.5
    return min(value / best_value_inr, 1.0)


def score_options(
    options: list[dict],
    lifestyle_tags: list[str],
    card: UserCard,
    weights: dict[str, float] | None = None,
) -> list[dict]:
    w = weights or DIMENSION_WEIGHTS_DEFAULT
    best_value = max((o.get("value_inr", 0) for o in options), default=1)

    for opt in options:
        dims = {
            "value_per_point": _value_per_point(opt, card),
            "expiry_urgency": _expiry_urgency(opt),
            "lifestyle_fit": _lifestyle_fit(opt, lifestyle_tags),
            "redemption_ease": _redemption_ease(opt),
            "opportunity_cost": _opportunity_cost(opt, best_value),
        }
        opt["dimension_scores"] = dims
        opt["score"] = sum(dims[d] * w[d] for d in dims)

    return sorted(options, key=lambda o: o["score"], reverse=True)
