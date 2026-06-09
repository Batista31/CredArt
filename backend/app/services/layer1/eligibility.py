from ...models.schemas import RewardOption, UserCard


def validate_eligibility(option: dict, card: UserCard, user_region: str) -> tuple[bool, str]:
    """
    Returns (is_eligible, reason).
    Checks balance, region, availability, and card-specific constraints.
    """
    # Balance check
    if option.get("points_required", 0) > card.points_balance:
        return False, "insufficient_points"

    # Region check
    allowed_regions = option.get("allowed_regions", [])
    if allowed_regions and user_region not in allowed_regions:
        return False, "region_unavailable"

    # Availability check
    if not option.get("available", True):
        return False, "currently_unavailable"

    # Card-specific eligibility
    eligible_cards = option.get("eligible_card_ids", [])
    if eligible_cards and card.card_id not in eligible_cards:
        return False, "card_not_eligible"

    return True, "eligible"


def filter_eligible_options(
    options: list[dict],
    card: UserCard,
    user_region: str,
) -> list[dict]:
    results = []
    for opt in options:
        eligible, reason = validate_eligibility(opt, card, user_region)
        opt["eligible"] = eligible
        opt["ineligibility_reason"] = reason if not eligible else None
        results.append(opt)
    return results
