"""Interest → product bridge for gift journeys (Layer 1, deterministic).

"She likes cooking" contains no catalogue keyword, so a raw search misses and the
flow used to dead-end into gift cards. This registry maps stated interests to
concrete catalogue search nouns, so the gift flow shops like a person would.
Purely deterministic — no LLM, no invented products.
"""

from __future__ import annotations

# Canonical interest → catalogue search queries (ordered: best gift first).
# Queries are phrased to hit merchandise_catalog keyword lists.
INTEREST_PRODUCTS: dict[str, list[str]] = {
    "cooking":     ["air fryer", "mixer grinder", "dinner set", "grilling", "coffee maker"],
    "baking":      ["air fryer", "mixer grinder", "dinner set"],
    "coffee":      ["coffee maker", "bottle"],
    "tea":         ["bottle", "dinner set"],
    "fitness":     ["smartwatch", "water bottle", "heating pad"],
    "yoga":        ["water bottle", "heating pad", "sound machine"],
    "wellness":    ["heating pad", "water jet", "sound machine"],
    "music":       ["headphones", "speaker", "earbuds"],
    "gaming":      ["headphones", "speaker"],
    "reading":     ["sound machine", "backpack"],
    "travel":      ["luggage", "backpack", "bottle", "steamer"],
    "travelling":  ["luggage", "backpack", "bottle", "steamer"],
    "traveling":   ["luggage", "backpack", "bottle", "steamer"],
    "photography": ["backpack", "luggage"],
    "tech":        ["earbuds", "smartwatch", "speaker"],
    "gadgets":     ["earbuds", "smartwatch", "speaker"],
    "sports":      ["smartwatch", "water bottle", "backpack"],
    "cricket":     ["smartwatch", "water bottle"],
    "fashion":     ["steamer", "tote", "bag"],
    "skincare":    ["water jet", "heating pad"],
    "gardening":   ["grilling", "bottle"],
    "art":         ["headphones", "speaker"],
    "painting":    ["headphones", "speaker"],
    "movies":      ["speaker", "headphones", "sound machine"],
    "cars":        ["smartwatch", "speaker", "backpack"],
}

# Loose synonyms → canonical interest key.
_SYNONYMS: dict[str, str] = {
    "cook": "cooking", "chef": "cooking", "kitchen": "cooking", "food": "cooking",
    "bake": "baking", "workout": "fitness", "gym": "fitness", "run": "fitness",
    "running": "fitness", "trek": "travel", "trekking": "travel", "trip": "travel",
    "song": "music", "songs": "music", "singing": "music", "audiophile": "music",
    "game": "gaming", "games": "gaming", "books": "reading", "book": "reading",
    "photo": "photography", "photos": "photography", "camera": "photography",
    "gadget": "gadgets", "electronics": "tech", "car": "cars", "racing": "cars",
    "style": "fashion", "clothes": "fashion", "meditation": "yoga",
}


# Relation aliases → canonical key used in relationship memory.
RELATION_ALIASES = {"mom": "mother", "mum": "mother", "dad": "father",
                    "grandma": "grandmother", "grandpa": "grandfather",
                    "kids": "kid", "parents": "parent"}


def canonical_relation(relation: str) -> str:
    r = (relation or "").lower().strip()
    return RELATION_ALIASES.get(r, r)


def canonical(interest: str) -> str | None:
    key = (interest or "").lower().strip()
    if key in INTEREST_PRODUCTS:
        return key
    return _SYNONYMS.get(key)


def product_queries(interests: list[str], max_queries: int = 5) -> list[str]:
    """Round-robin the mapped queries so multiple interests each get a shot."""
    lanes = [INTEREST_PRODUCTS[c] for i in interests if (c := canonical(i))]
    out: list[str] = []
    for depth in range(max(len(l) for l in lanes) if lanes else 0):
        for lane in lanes:
            if depth < len(lane) and lane[depth] not in out:
                out.append(lane[depth])
            if len(out) >= max_queries:
                return out
    return out
