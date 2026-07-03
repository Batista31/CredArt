"""CredArt — Entertainment & Cinema rewards concierge.

A NEW, fully self-contained router mounted at ``/entertainment``. It mirrors the
bank/dining concierge architecture and the anti-hallucination boundary, but
touches none of the existing tables, services, routes, or the shared session
store — so it cannot break any existing behaviour.

Layers (same shape as ``dialogue_manager.py`` / ``dining.py``):

  - **Layer 1 (deterministic)** — a catalogue that MIXES real now-playing movies
    from TMDB (title, poster, rating) with a hardcoded rewards catalogue
    (IMAX upgrade, OTT subscriptions, events, gaming…). Every points/₹ figure —
    including the movie-ticket price — is computed here, never invented by the
    LLM. Ranked by an adapted 5-dimension scoring engine.
  - **Conversational dialogue** — one question at a time (clarify gate, tap
    chips). Known profile facts (group size 3, thriller/action taste, IMAX
    preference) are pre-filled and never re-asked.
  - **The LLM** — receives ONLY the pre-scored candidate set for a natural
    reply; it never sees TMDB responses, the catalogue rules, or the balance,
    and degrades to a deterministic template when no key is configured.

TMDB: real "now playing" via ``TMDB_API_KEY`` (see ``.env.example``). If the key
is missing or the call fails, we fall back to 5 hardcoded movie titles.

Endpoints:
  POST /entertainment/chat    — conversational intent → scored rewards → reply
  POST /entertainment/redeem  — mock booking (ENT-DEMO-XXXX), deducts demo points
  GET  /entertainment/health  — liveness + catalogue/demo-user/TMDB summary
"""

from __future__ import annotations

import os
import random
import re
import time
import uuid
from typing import Any, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Load backend/.env so TMDB_API_KEY is available regardless of import order
# (mirrors services/llm_service.py). Read the key at call time via _tmdb_key().
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

router = APIRouter(prefix="/entertainment", tags=["entertainment"])


def _tmdb_key() -> str:
    return os.getenv("TMDB_API_KEY", "").strip()


# ---------------------------------------------------------------------------
# Layer 1 — deterministic pricing constants (the LLM never sets these)
# ---------------------------------------------------------------------------

MOVIE_TICKET_INR = 250       # retail value per seat
MOVIE_POINTS_PER_SEAT = 200  # deterministic Layer-1 price per seat


# ---------------------------------------------------------------------------
# Layer 1 — hardcoded rewards catalogue (non-movie). `special=True` marks a
# limited/time-sensitive offer that the expiry-risk dimension treats as urgent.
# `tags` drive the preference boost; `value_inr` drives the financial dimension.
# ---------------------------------------------------------------------------

CatalogueItem = dict[str, Any]

REWARDS: list[CatalogueItem] = [
    {"id": "imax_upgrade", "label": "IMAX upgrade", "points_cost": 200,
     "category": "UPGRADE", "value_inr": 250, "tags": ["imax", "upgrade"],
     "note": "Upgrade any booking to a premium IMAX screen."},
    {"id": "popcorn_combo", "label": "Popcorn + drink combo", "points_cost": 150,
     "category": "TREAT", "value_inr": 200, "tags": ["snack", "treat", "combo"],
     "note": "Large popcorn and a drink to share."},
    {"id": "ott_netflix", "label": "Netflix — 1 month", "points_cost": 500,
     "category": "OTT", "value_inr": 649, "tags": ["ott", "netflix", "stream"],
     "note": "One month of Netflix, on your points."},
    {"id": "ott_prime", "label": "Prime Video — 1 month", "points_cost": 400,
     "category": "OTT", "value_inr": 599, "tags": ["ott", "prime", "stream"],
     "note": "One month of Prime Video."},
    {"id": "early_access", "label": "Early access screening pass", "points_cost": 300,
     "category": "EVENT", "value_inr": 400, "special": True,
     "tags": ["screening", "early access", "movie"],
     "note": "See it before everyone else — limited early-access seats."},
    {"id": "comedy_night", "label": "Stand-up comedy night", "points_cost": 350,
     "category": "EVENT", "value_inr": 500, "special": True,
     "tags": ["comedy", "live", "event"],
     "note": "A live stand-up comedy night — limited-date event."},
    {"id": "gaming_credits", "label": "Gaming credits", "points_cost": 250,
     "category": "GAMING", "value_inr": 300, "tags": ["gaming", "games"],
     "note": "Credits for your favourite gaming store."},
]
_REWARDS_BY_ID = {i["id"]: i for i in REWARDS}


# ---------------------------------------------------------------------------
# Demo user — OUR data (the anti-hallucination analogue of the bank's user/CMR
# tables). Never handed to the LLM. `demo_points` is a replayable bucket.
# ---------------------------------------------------------------------------

DEFAULT_USER_ID = "ent_user_priya"

DEMO_USERS: dict[str, dict[str, Any]] = {
    DEFAULT_USER_ID: {
        "user_id": DEFAULT_USER_ID,
        "name": "Saket",
        "points_balance": 800,
        "demo_points": 800,               # replayable bucket spent by /redeem
        "preferred_genres": ["thriller", "action"],  # boosts matching TMDB movies
        "preferred_format": "imax",       # CMR: IMAX preferred
        "group_size": 3,                  # pre-fills ticket quantity, never re-asked
    }
}


def _get_user(user_id: str | None) -> dict[str, Any]:
    user = DEMO_USERS.get(user_id or DEFAULT_USER_ID)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown entertainment user_id")
    return user


def _preferred_tags(user: dict[str, Any]) -> set[str]:
    """Tags that earn the preference boost: genres + preferred format."""
    tags = set(user.get("preferred_genres") or [])
    if user.get("preferred_format"):
        tags.add(user["preferred_format"])
    return tags


# ---------------------------------------------------------------------------
# TMDB — real "now playing" movies. Cached briefly; degrades to a hardcoded
# fallback so the flow always works even without a key / network.
# ---------------------------------------------------------------------------

_TMDB_GENRES = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
    878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War",
    37: "Western",
}

# Graceful fallback when TMDB is unavailable — real titles with genres that let
# the thriller/action boost still demonstrate itself.
_FALLBACK_MOVIES = [
    {"title": "Mission: Impossible — The Final Reckoning",
     "genres": ["Action", "Thriller"], "rating": 8.0, "poster": None},
    {"title": "Dune: Part Two", "genres": ["Science Fiction", "Adventure"],
     "rating": 8.3, "poster": None},
    {"title": "John Wick: Chapter 4", "genres": ["Action", "Thriller", "Crime"],
     "rating": 7.7, "poster": None},
    {"title": "Oppenheimer", "genres": ["Drama", "History"], "rating": 8.1,
     "poster": None},
    {"title": "The Batman", "genres": ["Action", "Crime", "Thriller"],
     "rating": 7.8, "poster": None},
]

_TMDB_CACHE: dict[str, Any] = {"ts": 0.0, "movies": [], "source": "none"}
_TMDB_TTL = 30 * 60  # 30 minutes
_TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500"


async def _fetch_now_playing(limit: int = 8) -> tuple[list[dict], str]:
    """Return (movies, source). source is 'tmdb' or 'fallback'. Never raises.

    Each movie: {title, genres:[name], rating:float, poster:url|None}.
    """
    now = time.time()
    if _TMDB_CACHE["movies"] and now - _TMDB_CACHE["ts"] < _TMDB_TTL:
        return _TMDB_CACHE["movies"][:limit], _TMDB_CACHE["source"]

    movies: list[dict] = []
    source = "fallback"
    api_key = _tmdb_key()
    if api_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    "https://api.themoviedb.org/3/movie/now_playing",
                    params={"api_key": api_key, "language": "en-US",
                            "page": 1, "region": "IN"})
                r.raise_for_status()
                results = (r.json() or {}).get("results") or []
            for m in results:
                poster = m.get("poster_path")
                movies.append({
                    "title": m.get("title") or m.get("original_title") or "Movie",
                    "genres": [_TMDB_GENRES.get(g) for g in (m.get("genre_ids") or [])
                               if _TMDB_GENRES.get(g)],
                    "rating": round(float(m.get("vote_average") or 0), 1),
                    "poster": (_TMDB_IMG_BASE + poster) if poster else None,
                })
            if movies:
                source = "tmdb"
        except Exception as exc:  # noqa: BLE001 — never block on TMDB
            print(f"[entertainment] TMDB fetch failed ({exc}); using fallback")
            movies = []

    if not movies:
        movies = [dict(m) for m in _FALLBACK_MOVIES]
        source = "fallback"

    # Cache a generous set so genre filtering has material to work with; each
    # caller slices to the size it needs.
    _TMDB_CACHE.update(ts=now, movies=movies[:20], source=source)
    return movies[:limit], source


async def _movie_items(user: dict[str, Any], limit: int = 6,
                       qty: int | None = None, genre: str | None = None) -> list[CatalogueItem]:
    """Turn now-playing movies into raw catalogue items priced in points.

    Ticket quantity and genre come from the conversation (asked one at a time,
    like the bank flow); when the user hasn't answered, we fall back to the
    profile's group size. The price is computed deterministically here in Layer 1.
    A specific genre filters now-playing to matching titles (falling back to all
    if nothing matches, so we never show an empty list).
    """
    fetch_n = 20 if (genre and genre != "any") else limit
    movies, _ = await _fetch_now_playing(limit=fetch_n)
    if qty is None:
        qty = int(user.get("group_size") or 1)
    qty = max(1, int(qty))
    if genre and genre != "any":
        g = genre.lower()
        matched = [m for m in movies if g in [x.lower() for x in (m.get("genres") or [])]]
        if matched:
            movies = matched
    movies = movies[:limit]
    seats = "ticket" if qty == 1 else "tickets"
    items: list[CatalogueItem] = []
    for i, m in enumerate(movies):
        genre_tags = [g.lower() for g in (m.get("genres") or [])]
        items.append({
            "id": f"movie_{i}_{uuid.uuid4().hex[:6]}",
            "label": f"{m['title']} — {qty} {seats}",
            "category": "MOVIE",
            "points_cost": MOVIE_POINTS_PER_SEAT * qty,
            "value_inr": MOVIE_TICKET_INR * qty,
            "tags": genre_tags + ["movie"],
            "note": (f"Now playing · {m['rating']}★" if m.get("rating")
                     else "Now playing") + f" · {qty} {seats}",
            "thumbnail": m.get("poster"),
            "rating": m.get("rating"),
            "genres": m.get("genres") or [],
            "quantity": qty,
        })
    return items


# ---------------------------------------------------------------------------
# Layer 1 — adapted 5-dimension scoring (deterministic, 0–100). Same weights and
# structure as services/scoring_service.py, re-expressed for entertainment.
# ---------------------------------------------------------------------------

WEIGHTS = {
    "financial": 0.35,        # value per point (best ₹/pt in the set)
    "lifestyle": 0.25,        # requested-category fit + genre/format preference
    "redemption_prob": 0.20,  # can the user afford / claim it
    "expiry_risk": 0.10,      # limited-time offers are urgent
    "flexibility": 0.10,      # how broadly the reward can be used
}

_FLEXIBILITY = {"OTT": 85.0, "GAMING": 80.0, "MOVIE": 65.0, "EVENT": 55.0,
                "TREAT": 50.0, "UPGRADE": 40.0}

_CATEGORY_RELEVANCE = 25.0
_PREF_MATCH_BOOST = 8.0  # CMR-style tag match, added AFTER the weighted sum


def _normalize(raw: dict[int, float]) -> dict[int, float]:
    vals = list(raw.values())
    if not vals:
        return {}
    lo, hi = min(vals), max(vals)
    if hi == lo:
        return {k: 60.0 for k in raw}
    return {k: 10 + 90 * (v - lo) / (hi - lo) for k, v in raw.items()}


def _lifestyle(item: CatalogueItem, requested_category: str | None,
               preferred_tags: set[str]) -> float:
    score = 50.0
    if requested_category:
        if item["category"] == requested_category:
            score += _CATEGORY_RELEVANCE
        else:
            score -= _CATEGORY_RELEVANCE * 0.6
    if preferred_tags & set(item["tags"]):
        score += 15.0  # thriller/action genre match, or IMAX preference
    return max(0.0, min(100.0, score))


def _redemption_prob(item: CatalogueItem, affordable: bool) -> float:
    if item.get("special"):
        return 95.0
    return 80.0 if affordable else 15.0


def _expiry_risk(item: CatalogueItem) -> float:
    return 90.0 if item.get("special") else 20.0


def _score_candidates(items: list[CatalogueItem], user: dict[str, Any],
                      requested_category: str | None) -> list[dict[str, Any]]:
    """Attach 5-dim scores + total, sort desc, set rank. Returns candidate dicts."""
    balance = user.get("demo_points", 0)
    preferred = _preferred_tags(user)

    fin_raw = {i: (item["value_inr"] / item["points_cost"] if item["points_cost"] else 2.0)
               for i, item in enumerate(items)}
    fin = _normalize(fin_raw)

    scored: list[dict[str, Any]] = []
    for i, item in enumerate(items):
        affordable = item.get("special", False) or item["points_cost"] <= balance
        s_fin = round(fin[i], 1)
        s_life = round(_lifestyle(item, requested_category, preferred), 1)
        s_prob = round(_redemption_prob(item, affordable), 1)
        s_exp = round(_expiry_risk(item), 1)
        s_flex = round(_FLEXIBILITY.get(item["category"], 50.0), 1)
        base = (
            WEIGHTS["financial"] * s_fin
            + WEIGHTS["lifestyle"] * s_life
            + WEIGHTS["redemption_prob"] * s_prob
            + WEIGHTS["expiry_risk"] * s_exp
            + WEIGHTS["flexibility"] * s_flex
        )
        boost = _PREF_MATCH_BOOST if (preferred & set(item["tags"])) else 0.0
        scored.append({
            "candidate_id": item["id"],
            "label": item["label"],
            "category": item["category"],
            "points_cost": item["points_cost"],
            "effective_value_inr": item["value_inr"],
            "affordable": affordable,
            "special": item.get("special", False),
            "note": item["note"],
            "thumbnail": item.get("thumbnail"),
            "rating": item.get("rating"),
            "quantity": item.get("quantity", 1),
            "score_financial": s_fin,
            "score_lifestyle": s_life,
            "score_redemption_prob": s_prob,
            "score_expiry_risk": s_exp,
            "score_flexibility": s_flex,
            "score_total": round(min(100.0, base + boost), 1),
        })

    scored.sort(key=lambda c: c["score_total"], reverse=True)
    for rank, c in enumerate(scored, 1):
        c["rank"] = rank
    return scored


# ---------------------------------------------------------------------------
# Conversational dialogue — deterministic intent parse + clarify gate + chips.
# Same pattern as dining.py, sized to the entertainment domain.
# ---------------------------------------------------------------------------

_CLARIFY_MARKER = "__clarify__"
_GREETINGS = {"hi", "hello", "hey", "namaste", "yo", "hola", "sup", "hiya"}

# Direct mentions jump straight to a recommendation (no clarify).
_ITEM_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("netflix",), "ott_netflix"),
    (("prime video", "prime"), "ott_prime"),
    (("imax",), "imax_upgrade"),
    (("popcorn", "combo"), "popcorn_combo"),
    (("stand-up", "standup", "stand up", "comedy"), "comedy_night"),
    (("early access", "screening pass", "preview"), "early_access"),
    (("gaming", "game credit", "game credits"), "gaming_credits"),
]

# Mood words → category. More specific first.
_CATEGORY_WORDS: list[tuple[tuple[str, ...], str]] = [
    (("ott", "subscription", "stream", "streaming", "series", "binge", "web series"), "OTT"),
    (("comedy", "stand-up", "standup", "live event", "concert", "event", "show"), "EVENT"),
    (("gaming", "game", "games", "xbox", "playstation"), "GAMING"),
    (("imax", "upgrade", "dolby", "3d"), "UPGRADE"),
    (("popcorn", "snack", "snacks", "drink", "combo", "food"), "TREAT"),
    (("movie", "film", "cinema", "flick", "ticket", "tickets", "watch", "theatre",
      "theater"), "MOVIE"),
]

_VAGUE_WORDS = ("spend", "recommend", "suggest", "surprise", "option", "options",
                "what can i", "what should i", "help", "reward", "rewards",
                "redeem", "use my points", "entertain", "bored", "fun", "anything")

_BALANCE_WORDS = ("balance", "how many points", "points do i", "points i have",
                  "points left", "points balance", "check my point", "my balance",
                  "expiring", "expire", "how many do i")

_CLARIFY_CHIPS = ["Movie tickets", "OTT subscription", "Live event", "Gaming", "Snacks"]

_CATEGORY_LABEL = {
    "MOVIE": "movie tickets", "OTT": "an OTT subscription", "EVENT": "a live event",
    "GAMING": "gaming credits", "UPGRADE": "an upgrade", "TREAT": "snacks",
}


def _has(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def _route_category(text: str) -> str | None:
    t = text.lower()
    for words, category in _CATEGORY_WORDS:
        if _has(t, words):
            return category
    return None


# --- Movie slot-filling ----------------------------------------------------
# Movies now gather context one question at a time (genre → ticket count),
# mirroring the bank's flight flow, instead of pre-filling everything silently.

_MOVIE_GENRE_CHIPS = ["Action", "Thriller", "Comedy", "Drama", "Surprise me"]

# chip/answer word → TMDB genre name used for filtering now-playing titles
_GENRE_WORDS: dict[str, str] = {
    "action": "Action", "thriller": "Thriller", "comedy": "Comedy",
    "drama": "Drama", "romance": "Romance", "horror": "Horror",
    "adventure": "Adventure", "crime": "Crime", "family": "Family",
    "sci-fi": "Science Fiction", "scifi": "Science Fiction",
    "science fiction": "Science Fiction", "fantasy": "Fantasy",
    "animation": "Animation", "animated": "Animation",
}


def _detect_genre(text: str) -> str | None:
    """Map a mood answer to a genre, or 'any' when the user has no preference."""
    t = text.lower()
    if any(w in t for w in ("surprise", "anything", "any ", "whatever",
                            "you pick", "you choose", "don't care", "dont care",
                            "no preference")):
        return "any"
    for word, genre in _GENRE_WORDS.items():
        if word in t:
            return genre
    return None


def _detect_qty(text: str) -> int | None:
    """Parse a ticket count from a chip/free-text answer ('Just me' → 1, '3' → 3)."""
    t = text.lower()
    if any(w in t for w in ("just me", "only me", "myself", "solo", "alone")):
        return 1
    m = re.search(r"(\d+)", t)
    if m:
        return max(1, min(10, int(m.group(1))))
    return None


def _movie_qty_chips(user: dict[str, Any]) -> list[str]:
    """Ticket-count chips, marking the user's usual group size so the profile
    still informs the answer without silently deciding it."""
    usual = int(user.get("group_size") or 1)
    out = []
    for n, base in ((1, "Just me"), (2, "2"), (3, "3"), (4, "4")):
        out.append(f"{base} (usual)" if n == usual else base)
    return out


# ---------------------------------------------------------------------------
# In-memory session store (isolated from the bank/dining stores).
# ---------------------------------------------------------------------------

_SESSIONS: dict[str, dict[str, Any]] = {}
_SESSION_TTL = 60 * 60


def _load_session(session_id: str | None) -> dict[str, Any]:
    now = int(time.time())
    for sid, s in list(_SESSIONS.items()):
        if s.get("expires_at", now + 1) < now:
            _SESSIONS.pop(sid, None)
    if session_id and session_id in _SESSIONS:
        s = _SESSIONS[session_id]
        s["expires_at"] = now + _SESSION_TTL
        return s
    sid = uuid.uuid4().hex
    s = {"session_id": sid, "known_slots": {}, "response_type": None,
         "missing_slots": [], "candidate_index": {}, "last_candidates": [],
         "expires_at": now + _SESSION_TTL}
    _SESSIONS[sid] = s
    return s


# ---------------------------------------------------------------------------
# LLM reply — anti-hallucination boundary. Receives ONLY the pre-scored
# candidate set; degrades to a deterministic template with no key.
# ---------------------------------------------------------------------------

_ENT_REPLY_SYSTEM = """You are CredArt's Entertainment & Cinema rewards concierge — warm, upbeat, concise.

You receive a ranked list of reward candidates (already scored by a deterministic
engine) and the user's message. Write a short, helpful reply.

Rules — STRICTLY enforced:
1. Only reference candidates from the provided list. NEVER invent titles, ratings,
   points costs, or ₹ values.
2. Recommend the top 1-2 candidates for what the user asked.
3. Mention the points cost when you name a reward.
4. Address the user by first name. 2-3 sentences, friendly, plain prose (no bullets).
5. Do not repeat the JSON back.
"""


def _candidates_to_json(candidates: list[dict[str, Any]], user_name: str,
                        user_message: str) -> str:
    import json
    data = {
        "user_name": user_name.split()[0] if user_name else "there",
        "user_message": user_message,
        "candidates": [
            {"rank": c["rank"], "label": c["label"], "category": c["category"],
             "points_cost": c["points_cost"], "affordable": c["affordable"],
             "special": c["special"], "rating": c.get("rating"),
             "effective_value_inr": c["effective_value_inr"], "note": c["note"],
             "score_total": c["score_total"]}
            for c in candidates
        ],
    }
    return json.dumps(data, ensure_ascii=False)


def _template_reply(candidates: list[dict[str, Any]], user: dict[str, Any]) -> str:
    first = (user["name"].split() or ["there"])[0]
    top = candidates[0]
    cost = "free" if top["points_cost"] == 0 else f"{top['points_cost']} pts"
    msg = f"{first}, my top pick is {top['label']} ({cost}) — {top['note']}."
    if len(candidates) > 1:
        second = candidates[1]
        c2 = "free" if second["points_cost"] == 0 else f"{second['points_cost']} pts"
        msg += f" You might also like {second['label']} ({c2})."
    msg += " Tap to book whenever you're ready."
    return msg


async def _build_reply(candidates: list[dict[str, Any]], user: dict[str, Any],
                       user_message: str) -> tuple[str, bool]:
    try:
        from services.llm_service import _llm_call  # reuse transport only
        payload = _candidates_to_json(candidates, user["name"], user_message)
        text, groq_used = await _llm_call(_ENT_REPLY_SYSTEM, payload)
        return text, groq_used
    except Exception as exc:  # noqa: BLE001
        print(f"[entertainment] LLM reply unavailable ({exc}); using template")
        return _template_reply(candidates, user), False


def _prefill_note(user: dict[str, Any], category: str | None,
                  qty: int | None = None, genre: str | None = None) -> str:
    """Deterministic CMR confirmation — built OUTSIDE the LLM. Confirms what the
    user chose (tickets, genre) plus the one fact still pre-filled from profile
    (IMAX format), so the concierge stays transparent without re-asking."""
    if category == "MOVIE":
        n = int(qty or user.get("group_size", 1))
        seats = "ticket" if n == 1 else "tickets"
        bits = f" I've lined up {n} {seats}"
        if genre and genre != "any":
            bits += f" for {genre.title()} titles now playing"
        if user.get("preferred_format") == "imax":
            bits += "; you can add IMAX any time"
        return bits + "."
    if category == "UPGRADE" and user.get("preferred_format") == "imax":
        return " Matches your IMAX preference."
    return ""


# ---------------------------------------------------------------------------
# Schemas (defined here so schemas.py is untouched).
# ---------------------------------------------------------------------------

class EntChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None


class EntChatResponse(BaseModel):
    session_id: str
    user_id: str
    reply: str
    response_type: Literal["greeting", "balance", "follow_up_question",
                           "recommendation", "general_answer"] = "general_answer"
    category: Optional[str] = None
    known_slots: dict[str, Any] = Field(default_factory=dict)
    missing_slots: list[str] = Field(default_factory=list)
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    suggested_replies: list[str] = Field(default_factory=list)
    requires_confirmation: bool = False
    points_balance: int = 0
    movie_source: Optional[str] = None  # 'tmdb' | 'fallback' when movies shown
    llm_used: bool = False


class EntRedeemRequest(BaseModel):
    session_id: str
    candidate_id: str
    user_id: Optional[str] = None
    mode: Literal["demo"] = "demo"


class EntRedeemResponse(BaseModel):
    status: Literal["completed", "failed"]
    confirmation_reference: str
    candidate_id: str
    option_label: str
    points_used: int
    balance_after: int
    mode: Literal["demo"] = "demo"


# ---------------------------------------------------------------------------
# Recommendation assembly
# ---------------------------------------------------------------------------

def _ent_resp(session: dict[str, Any], user: dict[str, Any], **kw) -> "EntChatResponse":
    """Module-level response builder (mirrors the _base closure inside the handler)
    so the movie slot-filling steps can build responses too."""
    return EntChatResponse(
        session_id=session["session_id"], user_id=user["user_id"],
        known_slots=session["known_slots"], points_balance=user["demo_points"], **kw)


async def _movie_step(session: dict[str, Any], user: dict[str, Any],
                      message: str) -> "EntChatResponse":
    """Ask the next movie slot (genre → ticket count) one at a time, then
    recommend — the entertainment analogue of the bank's flight slot-filling."""
    ks = session["known_slots"]
    ks["category"] = "MOVIE"
    if "movie_genre" not in ks:
        session["response_type"] = "follow_up_question"
        session["missing_slots"] = ["movie_genre"]
        return _ent_resp(session, user,
                         reply="Great — what are you in the mood for?",
                         response_type="follow_up_question", category="MOVIE",
                         missing_slots=["movie_genre"], suggested_replies=_MOVIE_GENRE_CHIPS)
    if "movie_qty" not in ks:
        session["response_type"] = "follow_up_question"
        session["missing_slots"] = ["movie_qty"]
        return _ent_resp(session, user,
                         reply="How many tickets should I line up?",
                         response_type="follow_up_question", category="MOVIE",
                         missing_slots=["movie_qty"], suggested_replies=_movie_qty_chips(user))
    return await _recommend(session, user, "MOVIE", message)


async def _build_pool(category: str | None, user: dict[str, Any],
                      qty: int | None = None, genre: str | None = None) -> list[CatalogueItem]:
    """Raw catalogue slice for a category (movies fetched from TMDB on demand)."""
    if category == "MOVIE":
        return await _movie_items(user, qty=qty, genre=genre)
    if category is None:
        # General ask: mix rewards with a few top now-playing movies.
        return list(REWARDS) + await _movie_items(user, limit=3, qty=qty, genre=genre)
    slice_ = [r for r in REWARDS if r["category"] == category]
    return slice_ or list(REWARDS)


async def _recommend(session: dict[str, Any], user: dict[str, Any],
                     category: str | None, message: str,
                     direct_id: str | None = None) -> EntChatResponse:
    if direct_id is not None:
        item = _REWARDS_BY_ID[direct_id]
        category = item["category"]

    # Ticket count + genre come from the movie slot-filling answers (fall back to
    # the profile group size / no genre filter when the user hasn't specified).
    ks = session.get("known_slots") or {}
    qty = ks.get("movie_qty")
    genre = ks.get("movie_genre")
    items = await _build_pool(category, user, qty=qty, genre=genre)
    scored = _score_candidates(items, user, category)

    if direct_id is not None:
        scored.sort(key=lambda c: (c["candidate_id"] != direct_id, -c["score_total"]))
        for rank, c in enumerate(scored, 1):
            c["rank"] = rank

    top = scored[:3]
    reply, llm_used = await _build_reply(top, user, message)
    reply += _prefill_note(user, category, qty=qty, genre=genre)

    session["candidate_index"] = {c["candidate_id"]: c for c in scored}
    session["last_candidates"] = scored
    session["response_type"] = "recommendation"
    session["missing_slots"] = []

    movie_source = None
    if any(c["category"] == "MOVIE" for c in top):
        movie_source = _TMDB_CACHE.get("source")

    return EntChatResponse(
        session_id=session["session_id"], user_id=user["user_id"],
        reply=reply, response_type="recommendation", category=category,
        known_slots=session["known_slots"], recommendations=top,
        requires_confirmation=True, points_balance=user["demo_points"],
        movie_source=movie_source, llm_used=llm_used,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=EntChatResponse)
async def entertainment_chat(req: EntChatRequest) -> EntChatResponse:
    user = _get_user(req.user_id)
    session = _load_session(req.session_id)
    text = (req.message or "").strip()
    t = text.lower()
    prior_type = session.get("response_type")
    prior_missing = session.get("missing_slots") or []

    def _base(**kw) -> EntChatResponse:
        return EntChatResponse(
            session_id=session["session_id"], user_id=user["user_id"],
            known_slots=session["known_slots"], points_balance=user["demo_points"],
            **kw)

    # --- Continuation: the previous turn asked a question ---------------------
    if prior_type == "follow_up_question":
        # (a) Answered the clarify gate → route to a category. Movies then gather
        #     their own details (genre → tickets); other categories recommend now.
        if prior_missing == [_CLARIFY_MARKER]:
            category = _route_category(t) or "MOVIE"
            session["known_slots"]["category"] = category
            if category == "MOVIE":
                return await _movie_step(session, user, text)
            return await _recommend(session, user, category, text)
        # (b) Answered the movie genre question → ask ticket count next.
        if prior_missing == ["movie_genre"]:
            session["known_slots"]["movie_genre"] = _detect_genre(t) or "any"
            return await _movie_step(session, user, text)
        # (c) Answered the ticket-count question → recommend.
        if prior_missing == ["movie_qty"]:
            session["known_slots"]["movie_qty"] = _detect_qty(t) or int(user.get("group_size") or 1)
            return await _recommend(session, user, "MOVIE", text)

    # --- Fresh turn ----------------------------------------------------------
    if t in _GREETINGS or any(t.startswith(g + " ") for g in _GREETINGS):
        session["response_type"] = "greeting"
        session["missing_slots"] = []
        first = user["name"].split()[0]
        return _base(
            reply=(f"Hey {first}! You've got {user['demo_points']} entertainment "
                   "points. Movie night, an OTT subscription, a live event, or gaming?"),
            response_type="greeting",
            suggested_replies=["Movie tickets", "OTT subscription", "See my points"])

    if _has(t, _BALANCE_WORDS):
        session["response_type"] = "balance"
        session["missing_slots"] = []
        # Deterministic affordability — computed from the real balance, never asserted.
        balance = user["demo_points"]
        qty = int(user.get("group_size") or 1)
        movie_cost = MOVIE_POINTS_PER_SEAT * qty
        ideas = []
        if balance >= movie_cost:
            ideas.append(f"a movie night for {qty} ({movie_cost} pts)")
        best = max((r for r in REWARDS if r["points_cost"] <= balance),
                   key=lambda r: r["value_inr"], default=None)
        if best:
            ideas.append(f"the {best['label']} ({best['points_cost']} pts)")
        tip = f" That covers {' or '.join(ideas)}." if ideas else ""
        return _base(
            reply=(f"You have {balance} entertainment points, "
                   f"{user['name'].split()[0]}.{tip}"),
            response_type="balance",
            suggested_replies=["Movie tickets", "OTT subscription", "Live event"])

    # Direct item mention → straight to a recommendation.
    for words, item_id in _ITEM_KEYWORDS:
        if _has(t, words):
            return await _recommend(session, user, None, text, direct_id=item_id)

    # Mood word → category. Movies gather genre + ticket count first (one question
    # at a time, like the bank flight flow); other categories recommend directly.
    category = _route_category(t)
    if category == "MOVIE":
        return await _movie_step(session, user, text)
    if category:
        session["known_slots"]["category"] = category
        return await _recommend(session, user, category, text)

    # Vague opener → ONE clarify question before recommending.
    session["response_type"] = "follow_up_question"
    session["missing_slots"] = [_CLARIFY_MARKER]
    first = user["name"].split()[0]
    return _base(
        reply=(f"Happy to help you spend those points, {first}! "
               "Are you thinking movie tickets, an OTT subscription, a live event, "
               "or gaming?"),
        response_type="follow_up_question", missing_slots=[_CLARIFY_MARKER],
        suggested_replies=_CLARIFY_CHIPS)


@router.post("/redeem", response_model=EntRedeemResponse)
async def entertainment_redeem(req: EntRedeemRequest) -> EntRedeemResponse:
    user = _get_user(req.user_id)
    session = _load_session(req.session_id)

    candidate = (session.get("candidate_index") or {}).get(req.candidate_id)
    if candidate is None:
        # Movie candidate ids are session-scoped; a reward id can still resolve.
        item = _REWARDS_BY_ID.get(req.candidate_id)
        if item is None:
            raise HTTPException(status_code=404,
                                detail="unknown candidate_id for this session")
        candidate = {"candidate_id": item["id"], "label": item["label"],
                     "points_cost": item["points_cost"],
                     "special": item.get("special", False)}

    cost = candidate["points_cost"]
    if not candidate.get("special") and cost > user["demo_points"]:
        raise HTTPException(
            status_code=400,
            detail=(f"not enough points: {candidate['label']} costs {cost}, "
                    f"balance is {user['demo_points']}"))

    user["demo_points"] -= cost
    ref = f"ENT-DEMO-{random.randint(0, 0xFFFF):04X}"
    return EntRedeemResponse(
        status="completed", confirmation_reference=ref,
        candidate_id=candidate["candidate_id"], option_label=candidate["label"],
        points_used=cost, balance_after=user["demo_points"], mode="demo")


@router.get("/health")
async def entertainment_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "concierge": "Entertainment & Cinema rewards",
        "rewards_catalogue_size": len(REWARDS),
        "tmdb_configured": bool(_tmdb_key()),
        "movie_source_last": _TMDB_CACHE.get("source", "none"),
        "session_backend": "memory",
        "active_sessions": len(_SESSIONS),
        "demo_user": {
            "name": DEMO_USERS[DEFAULT_USER_ID]["name"],
            "points_balance": DEMO_USERS[DEFAULT_USER_ID]["demo_points"],
            "group_size": DEMO_USERS[DEFAULT_USER_ID]["group_size"],
        },
    }
