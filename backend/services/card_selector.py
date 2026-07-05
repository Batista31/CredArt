"""Card-scoping — keeps recommendations on the card whose concierge chat is open.

Without this, every redemption path (flights, hotels, merchandise) silently picked
whichever held card scored best across ALL of the user's cards, so opening the
Infinia concierge could still recommend a Regalia Gold transfer. Instead: default
to the active (opened) card, and only surface a switch as an explicit opt-in note.
"""

from __future__ import annotations

from typing import Any

# A different held card must beat the active one by this margin before we bother
# suggesting a switch — avoids nagging over marginal differences.
_SUGGEST_MARGIN = 1.15


def pick_card(
    cards: list[dict[str, Any]],
    point_value_map: dict[str, float],
    default_value: float = 0.0,
    active_card_id: str | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Returns (chosen_card, switch_suggestion | None).

    chosen_card is the active card when held and valid; otherwise the best-value
    card (first-time / no active card selected). switch_suggestion is populated
    only when a different held card would be meaningfully better, so the caller
    can ask the user rather than silently switching.
    """
    if not cards:
        return None, None
    by_id = {c["card_id"]: c for c in cards}
    best = max(cards, key=lambda c: point_value_map.get(c["card_id"], default_value))

    if active_card_id and active_card_id in by_id:
        chosen = by_id[active_card_id]
        chosen_val = point_value_map.get(chosen["card_id"], default_value)
        best_val = point_value_map.get(best["card_id"], default_value)
        if best["card_id"] != chosen["card_id"] and best_val > chosen_val * _SUGGEST_MARGIN:
            return chosen, {
                "suggested_card_id": best["card_id"],
                "suggested_card_name": best["card_name"],
                "current_card_id": chosen["card_id"],
                "current_card_name": chosen["card_name"],
            }
        return chosen, None

    return best, None
