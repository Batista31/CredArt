"""Customer Master Record (CMR) — Layer 1 profile reads/writes + helpers.

The CMR is the single unified profile CredArt keeps about a user beyond their
cards and points: extended preferences (preferred airlines/hotels/cuisines,
dietary restrictions), saved delivery addresses, a wishlist of benefits they
liked, and a list of dismissed benefits they rejected.

This is OUR data (like user_service) — sourced from the user, never from the
bank MCP server, and deliberately NOT an MCP tool. It feeds DETERMINISTIC
recommendation/scoring logic only; it is never handed to the LLM, preserving
the anti-hallucination boundary (the LLM only ever sees the candidate set).
"""

from __future__ import annotations

from . import db, user_service

# --- CMR ranking signal magnitudes (added to a candidate's 0-100 score_total).
# Kept small so they nudge, not dominate — the deterministic 5-dim score stays
# the primary signal. Clamped to 100 by the caller.
PREF_MATCH_BOOST = 8.0   # candidate matches a preferred airline / hotel / cuisine
WISHLIST_BOOST = 6.0     # candidate is on the user's wishlist

# Physical goods need a delivery address. Detected by category or keyword.
_PHYSICAL_KEYWORDS = (
    "camera", "gadget", "electronics", "headphone", "earbud", "speaker",
    "smartwatch", "watch", "drone", "console", "laptop", "tablet", "phone",
    "appliance", "amazon", "flipkart", "myntra", "gift voucher", "gift card",
)


# ------------------------------------------------------------------
# Saved addresses
# ------------------------------------------------------------------

async def get_addresses(user_id: str) -> list[dict]:
    return await db.fetch(
        """
        SELECT id, label, address_line1, address_line2, city, state, pincode, is_default
          FROM user_addresses
         WHERE user_id = $1
         ORDER BY is_default DESC, updated_at DESC
        """,
        user_id,
    )


async def get_default_address(user_id: str) -> dict | None:
    return await db.fetchrow(
        """
        SELECT id, label, address_line1, address_line2, city, state, pincode, is_default
          FROM user_addresses
         WHERE user_id = $1 AND is_default = TRUE
         ORDER BY updated_at DESC
         LIMIT 1
        """,
        user_id,
    )


async def save_address(user_id: str, addr: dict, make_default: bool = False) -> dict:
    """Insert a delivery address. The first address a user saves (or any address
    saved with make_default) becomes their default; the partial-unique index
    guarantees at most one default per user, so we clear the old one first."""
    existing = await db.fetchrow(
        "SELECT COUNT(*)::int AS n FROM user_addresses WHERE user_id = $1", user_id
    )
    is_default = make_default or (existing["n"] == 0)

    pool = await db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if is_default:
                await conn.execute(
                    "UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1",
                    user_id,
                )
            row = await conn.fetchrow(
                """
                INSERT INTO user_addresses
                    (user_id, label, address_line1, address_line2, city, state, pincode, is_default)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING id, label, address_line1, address_line2, city, state, pincode, is_default
                """,
                user_id,
                addr.get("label") or "Home",
                addr["address_line1"],
                addr.get("address_line2"),
                addr["city"],
                addr.get("state"),
                addr["pincode"],
                is_default,
            )
    return dict(row)


# ------------------------------------------------------------------
# Wishlist (interested, not yet redeemed) — surfaced with a scoring boost.
# ------------------------------------------------------------------

async def get_wishlist_labels(user_id: str) -> set[str]:
    rows = await db.fetch("SELECT label FROM cmr_wishlist WHERE user_id = $1", user_id)
    return {r["label"] for r in rows}


async def add_to_wishlist(user_id: str, label: str, card_id: str | None = None,
                          category: str | None = None) -> None:
    await db.execute(
        """
        INSERT INTO cmr_wishlist (user_id, label, card_id, category)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id, label) DO NOTHING
        """,
        user_id, label, card_id, category,
    )


# ------------------------------------------------------------------
# Dismissed (rejected) — filtered out of future recommendations entirely.
# ------------------------------------------------------------------

async def get_dismissed_labels(user_id: str) -> set[str]:
    rows = await db.fetch("SELECT label FROM cmr_dismissed WHERE user_id = $1", user_id)
    return {r["label"] for r in rows}


async def add_dismissed(user_id: str, label: str, card_id: str | None = None) -> None:
    await db.execute(
        """
        INSERT INTO cmr_dismissed (user_id, label, card_id)
        VALUES ($1,$2,$3)
        ON CONFLICT (user_id, label) DO NOTHING
        """,
        user_id, label, card_id,
    )
    # Mirror the executor's confirm-feedback loop: record the rejection on any
    # open recommendation event so the preference-learning signal stays honest.
    await db.execute(
        """
        UPDATE recommendation_events SET user_action = 'dismissed'
         WHERE user_id = $1 AND option_label = $2 AND user_action IS NULL
        """,
        user_id, label,
    )


# ------------------------------------------------------------------
# Helpers used by the orchestrator / scoring (no DB, pure functions).
# ------------------------------------------------------------------

def is_physical_goods(candidate: dict) -> bool:
    """True if this candidate is a physical product that must be shipped.
    Transfers, perks and expiry nudges are never physical."""
    if candidate.get("kind") not in ("redemption", "merchandise"):
        return False
    category = (candidate.get("category") or "").upper()
    if category == "SHOPPING":
        return True
    text = ((candidate.get("label") or "") + " " + category).lower()
    return any(kw in text for kw in _PHYSICAL_KEYWORDS)


def preference_boost(candidate, prefs: dict, wishlist_labels: set[str]) -> float:
    """Deterministic CMR boost for one candidate: brand-match + wishlist.

    Brand match = the candidate's label/category mentions a preferred airline,
    hotel chain or cuisine. Returns the total points to add to score_total
    (the caller clamps the sum to 100)."""
    if not prefs and not wishlist_labels:
        return 0.0
    boost = 0.0
    text = ((getattr(candidate, "label", "") or "") + " "
            + (getattr(candidate, "category", "") or "")).lower()
    preferred = (
        (prefs.get("preferred_airlines") or [])
        + (prefs.get("preferred_hotel_chains") or [])
        + (prefs.get("preferred_cuisines") or [])
    )
    if any(term and term.lower() in text for term in preferred):
        boost += PREF_MATCH_BOOST
    if getattr(candidate, "label", None) in wishlist_labels:
        boost += WISHLIST_BOOST
    return boost


def prefill_note(prefs: dict, intent) -> str | None:
    """A short, DETERMINISTIC sentence confirming pre-filled CMR values, so the
    assistant doesn't re-ask questions the profile already answers (dietary needs).
    Appended to the reply OUTSIDE the LLM — the LLM never sees CMR data."""
    if not prefs:
        return None
    category = (getattr(intent, "category", None) or "").upper()
    bits: list[str] = []

    dietary = prefs.get("dietary_restrictions") or []
    if category == "DINING" and dietary:
        bits.append("keeping it " + " & ".join(dietary))

    if not bits:
        return None
    return "(I've " + ", ".join(bits) + " from your profile — tell me if that's changed.)"


# ------------------------------------------------------------------
# Full profile (for GET /cmr/{user_id} and the frontend).
# ------------------------------------------------------------------

async def get_profile(user_id: str) -> dict:
    user = await user_service.get_user(user_id)
    prefs = await user_service.get_preferences(user_id) or {}
    addresses = await get_addresses(user_id)
    wishlist = await db.fetch(
        "SELECT label, card_id, category FROM cmr_wishlist WHERE user_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    dismissed = await db.fetch(
        "SELECT label, card_id FROM cmr_dismissed WHERE user_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    return {
        "user": user,
        "preferences": prefs,
        "addresses": addresses,
        "wishlist": wishlist,
        "dismissed": dismissed,
    }
