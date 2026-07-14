"""Bank rewards merchandise catalogue — Layer 1 mock data.

Mirrors the merchandise store a rewards platform (Kobie-style) already runs for
banks: a fixed catalogue of physical products priced directly in points
("Starting At 5,830 Points"). CredArt is the AI layer on top — it searches this
catalogue conversationally instead of making the user browse a grid.

All prices here are the deterministic source of truth (the LLM never invents
them). Points prices are catalogue-wide (same for every card), exactly like the
bank's own merchandise store.
"""

from __future__ import annotations

# Each product: stable id, display title, brand, points price (catalogue-wide),
# realistic cash value (₹, for effective-value display/scoring), an emoji icon
# (offline-safe stand-in for the store's product photo), search keywords, and a
# `popular` flag used to surface bestsellers when a search misses.
PRODUCTS: list[dict] = [
    {"id": "merch_grill_10pc", "title": "10-Piece Premium Grilling Set", "brand": "Cuisinart",
     "points": 12910, "value_inr": 3225, "icon": "🍖", "popular": False,
     "keywords": ["grill", "grilling", "bbq", "barbecue", "outdoor", "cooking"],
     "blurb": "Stainless-steel grill tools in a carry case"},
    {"id": "merch_grill_13pc", "title": "13-Piece Wooden Handle Grilling Set", "brand": "Cuisinart",
     "points": 5830, "value_inr": 1450, "icon": "🍢", "popular": True,
     "keywords": ["grill", "grilling", "bbq", "barbecue", "outdoor", "cooking"],
     "blurb": "Wood-handle grill set for weekend cookouts"},
    {"id": "merch_boat_bag", "title": "Captain's Boat Bag — Navy", "brand": "Lands' End",
     "points": 5270, "value_inr": 1320, "icon": "👜", "popular": False,
     "keywords": ["bag", "tote", "boat", "beach", "carry", "travel bag"],
     "blurb": "Rugged canvas tote for travel and beach days"},
    {"id": "merch_coffee_center", "title": "Coffee Center™ 12-Cup Coffeemaker + Single-Serve Brewer", "brand": "Cuisinart",
     "points": 26870, "value_inr": 6700, "icon": "☕", "popular": True,
     "keywords": ["coffee", "coffee maker", "coffeemaker", "brewer", "espresso", "kitchen"],
     "blurb": "Carafe + single-serve brewing in one machine"},
    {"id": "merch_fabric_steamer", "title": "Compact Fabric Steamer", "brand": "Conair",
     "points": 6400, "value_inr": 1600, "icon": "👔", "popular": False,
     "keywords": ["steamer", "fabric", "iron", "clothes", "garment", "wrinkle"],
     "blurb": "Travel-size steamer, wrinkle-free in minutes"},
    {"id": "merch_water_jet", "title": "Interplak® Dental Water Jet", "brand": "Conair",
     "points": 3720, "value_inr": 930, "icon": "🦷", "popular": False,
     "keywords": ["dental", "water jet", "flosser", "oral", "teeth", "wellness"],
     "blurb": "Countertop water flosser for daily care"},
    {"id": "merch_heating_pad", "title": "Massaging Heating Pad", "brand": "HoMedics",
     "points": 7140, "value_inr": 1780, "icon": "🌡️", "popular": False,
     "keywords": ["heating pad", "massage", "massaging", "pain", "relief", "wellness", "back"],
     "blurb": "Heat + massage for sore muscles"},
    {"id": "merch_soundspa", "title": "Mini SoundSpa® Portable", "brand": "HoMedics",
     "points": 3390, "value_inr": 850, "icon": "🎵", "popular": True,
     "keywords": ["sound", "sleep", "white noise", "soundspa", "relax", "wellness"],
     "blurb": "Pocket white-noise machine for better sleep"},
    {"id": "merch_headphones", "title": "Wireless Over-Ear Headphones", "brand": "JBL",
     "points": 9450, "value_inr": 2360, "icon": "🎧", "popular": True,
     "keywords": ["headphones", "headphone", "audio", "music", "wireless", "earphones", "electronics"],
     "blurb": "40-hour battery, deep bass, foldable"},
    {"id": "merch_earbuds", "title": "True Wireless Earbuds", "brand": "boAt",
     "points": 4980, "value_inr": 1245, "icon": "🎧", "popular": True,
     "keywords": ["earbuds", "earphones", "tws", "audio", "music", "wireless", "electronics"],
     "blurb": "Compact buds with charging case"},
    {"id": "merch_smartwatch", "title": "Fitness Smartwatch", "brand": "Noise",
     "points": 8890, "value_inr": 2220, "icon": "⌚", "popular": True,
     "keywords": ["watch", "smartwatch", "fitness", "tracker", "wearable", "electronics"],
     "blurb": "Heart-rate, SpO₂ and sleep tracking"},
    {"id": "merch_air_fryer", "title": "Digital Air Fryer 4.2L", "brand": "Philips",
     "points": 19940, "value_inr": 4980, "icon": "🍟", "popular": True,
     "keywords": ["air fryer", "fryer", "kitchen", "appliance", "cooking", "healthy"],
     "blurb": "Fry with air, not oil — one-touch presets"},
    {"id": "merch_mixer_grinder", "title": "750W Mixer Grinder — 3 Jars", "brand": "Bajaj",
     "points": 11960, "value_inr": 2990, "icon": "🥤", "popular": False,
     "keywords": ["mixer", "grinder", "mixer grinder", "blender", "kitchen", "appliance"],
     "blurb": "Heavy-duty motor, wet & dry grinding"},
    {"id": "merch_luggage", "title": "Cabin Luggage 55cm — Hard Shell", "brand": "American Tourister",
     "points": 14360, "value_inr": 3590, "icon": "🧳", "popular": False,
     "keywords": ["luggage", "suitcase", "trolley", "cabin bag", "travel", "bag"],
     "blurb": "TSA lock, 360° wheels, cabin-size"},
    {"id": "merch_speaker", "title": "Portable Bluetooth Speaker", "brand": "JBL",
     "points": 7560, "value_inr": 1890, "icon": "🔊", "popular": True,
     "keywords": ["speaker", "bluetooth", "audio", "music", "portable", "electronics"],
     "blurb": "Waterproof, 12-hour playtime"},
    {"id": "merch_bottle", "title": "Insulated Steel Water Bottle 1L", "brand": "Milton",
     "points": 3350, "value_inr": 840, "icon": "🍶", "popular": False,
     "keywords": ["bottle", "water bottle", "flask", "thermos", "hydration"],
     "blurb": "24h cold / 12h hot, leak-proof"},
    {"id": "merch_backpack", "title": "Laptop Backpack 15.6\"", "brand": "Wildcraft",
     "points": 6230, "value_inr": 1560, "icon": "🎒", "popular": False,
     "keywords": ["backpack", "bag", "laptop bag", "office", "college", "travel"],
     "blurb": "Padded laptop sleeve, rain cover"},
    {"id": "merch_dinner_set", "title": "18-Piece Opalware Dinner Set", "brand": "Larah by Borosil",
     "points": 8770, "value_inr": 2190, "icon": "🍽️", "popular": False,
     "keywords": ["dinner set", "plates", "crockery", "dining", "kitchen", "home"],
     "blurb": "Chip-resistant, microwave-safe"},
]

# Cheapest catalogue item — the floor used for the low-balance heads-up.
MIN_POINTS: int = min(p["points"] for p in PRODUCTS)


def search(query: str, limit: int = 4) -> list[dict]:
    """Keyword-match the catalogue. Deterministic: scores by matched tokens,
    then popularity, then price (cheapest first, so affordable options lead)."""
    import re
    q = (query or "").lower().strip()
    if not q:
        return []
    tokens = [t for t in q.replace(",", " ").split() if len(t) > 2]
    scored: list[tuple[int, dict]] = []
    for p in PRODUCTS:
        haystack = " ".join([p["title"].lower(), p["brand"].lower(), *p["keywords"]])
        score = 0
        for kw in p["keywords"]:
            # Word-boundary: kw "back" must not hit a "backpack" query.
            if re.search(rf"\b{re.escape(kw)}\b", q):
                score += 3 if " " in kw else 2  # phrase match beats single word
        # Word-boundary token match: "air" must not hit the brand "Conair".
        score += sum(1 for t in tokens if re.search(rf"\b{re.escape(t)}", haystack))
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda sp: (-sp[0], not sp[1]["popular"], sp[1]["points"]))
    return [p for _, p in scored[:limit]]


def popular(limit: int = 3) -> list[dict]:
    """Bestsellers to surface when a search misses — keeps the catalogue in
    front of the user instead of dead-ending."""
    best = [p for p in PRODUCTS if p["popular"]]
    best.sort(key=lambda p: p["points"])
    return best[:limit]
