"""CredArt — Food & Dining rewards concierge (Subway as the demo client).

A NEW, fully self-contained router mounted at ``/dining``. It mirrors the bank
concierge's architecture and its anti-hallucination boundary, but nothing here
touches the bank's tables, services, routes, or the shared Postgres/Redis
session store — so it cannot break any existing behaviour.

Layers (same shape as the bank flow in ``dialogue_manager.py``):

  - **Layer 1 (deterministic)** — a hardcoded Subway rewards catalogue plus a
    demo user profile, ranked by an adapted 5-dimension scoring engine
    (``financial / lifestyle / redemption_prob / expiry_risk / flexibility``).
    Every points/₹ figure is computed here; the LLM never invents them.
  - **Conversational dialogue** — one question at a time: a clarify gate for a
    vague opener, then slot-filling, with tap-to-answer chips. Known CMR facts
    (vegetarian, prefers Italian-BMT-style subs, Bengaluru address) are never
    re-asked.
  - **The LLM** — receives ONLY the pre-scored candidate set for a natural
    reply (``_candidates_to_json``); it never sees the catalogue rules or the
    user's balance, and degrades to a deterministic template when no key exists.

Endpoints:
  POST /dining/chat    — conversational intent → scored Subway rewards → reply
  POST /dining/redeem  — mock redemption (SUB-DEMO-XXXX), deducts demo points
  GET  /dining/health  — liveness + catalogue/demo-user summary
"""

from __future__ import annotations

import random
import time
import uuid
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/dining", tags=["dining"])


# ---------------------------------------------------------------------------
# Layer 1 — Subway rewards catalogue (hardcoded, deterministic)
#
# Each item carries everything the scorer needs: a real ₹ value (so value/point
# is computed, never invented), a category, a `veg` flag (drives the vegetarian
# filter), and `tags` (drive the preference boost). `special=True` marks a
# limited-time offer that the expiry-risk dimension treats as urgent.
# ---------------------------------------------------------------------------

CatalogueItem = dict[str, Any]

CATALOGUE: list[CatalogueItem] = [
    {"id": "sub_6inch", "label": "Free 6-inch Sub", "points_cost": 200,
     "category": "MEAL", "value_inr": 200, "veg": True,
     "tags": ["sub", "italian", "meal"],
     "note": "Any 6-inch sub, made your way."},
    {"id": "sub_footlong", "label": "Free Footlong", "points_cost": 400,
     "category": "MEAL", "value_inr": 400, "veg": True,
     "tags": ["sub", "italian", "meal", "footlong"],
     "note": "A full footlong sub of your choice."},
    {"id": "double_protein", "label": "Double Protein Upgrade", "points_cost": 100,
     "category": "UPGRADE", "value_inr": 90, "veg": False,
     "tags": ["upgrade", "protein"],
     "note": "Twice the meat on any sub."},
    {"id": "cookie_x3", "label": "Free Cookie x3", "points_cost": 150,
     "category": "TREAT", "value_inr": 120, "veg": True,
     "tags": ["treat", "dessert"],
     "note": "Three freshly baked cookies."},
    {"id": "combo_upgrade", "label": "Combo Meal Upgrade", "points_cost": 250,
     "category": "UPGRADE", "value_inr": 150, "veg": True,
     "tags": ["upgrade", "combo", "meal"],
     "note": "Add a drink and a side to make any sub a combo."},
    {"id": "birthday_footlong", "label": "Birthday Free Footlong", "points_cost": 0,
     "category": "MEAL", "value_inr": 400, "veg": True, "special": True,
     "tags": ["sub", "italian", "meal", "footlong", "birthday"],
     "note": "Our birthday gift to you — a free footlong. Limited-time offer."},
    {"id": "half_off", "label": "50% off next order", "points_cost": 300,
     "category": "DEAL", "value_inr": 250, "veg": True,
     "tags": ["deal", "discount"],
     "note": "Half off your entire next order."},
    {"id": "free_drink", "label": "Free Drink", "points_cost": 100,
     "category": "TREAT", "value_inr": 60, "veg": True,
     "tags": ["treat", "drink"],
     "note": "Any fountain drink, on us."},
]
_CATALOGUE_BY_ID = {i["id"]: i for i in CATALOGUE}


# ---------------------------------------------------------------------------
# Demo user (Subway loyalty profile). This is OUR data — the anti-hallucination
# analogue of the bank's user/CMR tables. The LLM never sees it directly.
# `demo_points` is a separate replayable bucket (like the bank demo flow) so a
# redemption is safe to run repeatedly.
# ---------------------------------------------------------------------------

DEFAULT_USER_ID = "dining_user_arjun"

DEMO_USERS: dict[str, dict[str, Any]] = {
    DEFAULT_USER_ID: {
        "user_id": DEFAULT_USER_ID,
        "name": "Anushka",
        "points_balance": 500,
        "demo_points": 500,          # replayable bucket spent by /dining/redeem
        "vegetarian": True,          # CMR: suppresses non-veg options, never re-asked
        "preferred_tags": ["italian", "sub"],  # "prefers Italian BMT style subs"
        "address": {"label": "Home", "city": "Bengaluru", "state": "Karnataka"},
    }
}


def _get_user(user_id: str | None) -> dict[str, Any]:
    user = DEMO_USERS.get(user_id or DEFAULT_USER_ID)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown dining user_id")
    return user


# ---------------------------------------------------------------------------
# Layer 1 — adapted 5-dimension scoring (deterministic, 0–100).
#
# Same weights and structure as services/scoring_service.py, re-expressed for a
# dining catalogue. The score is an internal ranking signal only — never shown
# to the user as a ₹ value, and the LLM never recomputes it.
# ---------------------------------------------------------------------------

WEIGHTS = {
    "financial": 0.35,        # value per point (best ₹/pt in the set)
    "lifestyle": 0.25,        # fit vs the requested category + saved preferences
    "redemption_prob": 0.20,  # can the user actually afford / claim it
    "expiry_risk": 0.10,      # limited-time offers are urgent
    "flexibility": 0.10,      # how broadly the reward can be used
}

# Optionality by category: a discount applies to anything, a meal is a complete
# reward, a treat is a small add, an upgrade needs a base order to attach to.
_FLEXIBILITY = {"DEAL": 85.0, "MEAL": 65.0, "TREAT": 55.0, "UPGRADE": 40.0}

_CATEGORY_RELEVANCE = 25.0  # how hard the current ask steers the lifestyle dim
_PREF_MATCH_BOOST = 8.0     # CMR-style tag match, added AFTER the weighted sum


def _normalize(raw: dict[int, float]) -> dict[int, float]:
    """Min-max to 10–100; a flat set collapses to a neutral 60 (mirrors bank)."""
    vals = list(raw.values())
    if not vals:
        return {}
    lo, hi = min(vals), max(vals)
    if hi == lo:
        return {k: 60.0 for k in raw}
    return {k: 10 + 90 * (v - lo) / (hi - lo) for k, v in raw.items()}


def _lifestyle(item: CatalogueItem, requested_category: str | None,
               preferred_tags: set[str]) -> float:
    """Preference-category fit, then nudged by how well the item matches the
    CURRENT request's category (so a 'treat' ask surfaces cookies, not subs)."""
    score = 50.0
    if requested_category:
        if item["category"] == requested_category:
            score += _CATEGORY_RELEVANCE
        else:
            score -= _CATEGORY_RELEVANCE * 0.6
    if preferred_tags & set(item["tags"]):
        score += 15.0
    return max(0.0, min(100.0, score))


def _redemption_prob(item: CatalogueItem, affordable: bool) -> float:
    if item.get("special"):
        return 95.0            # a free limited offer is almost always claimed
    return 80.0 if affordable else 15.0


def _expiry_risk(item: CatalogueItem) -> float:
    return 90.0 if item.get("special") else 20.0


def _score_candidates(items: list[CatalogueItem], user: dict[str, Any],
                      requested_category: str | None) -> list[dict[str, Any]]:
    """Attach 5-dim scores + total, sort desc, set rank. Returns candidate dicts.

    Mirrors scoring_service.score_candidates: a weighted 5-dim sum, then a small
    CMR-style preference boost added on top (clamped to 100) so the deterministic
    core score stays the primary signal.
    """
    balance = user.get("demo_points", 0)
    preferred = set(user.get("preferred_tags") or [])

    fin_raw = {i: item["value_inr"] / item["points_cost"] if item["points_cost"] else 2.0
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
            "thumbnail": None,
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
# Conversational dialogue — deterministic intent parse + one-question-at-a-time
# slot filling. Same pattern as dialogue_manager.py (clarify gate, chips), sized
# to the dining domain so no LLM is needed to gather context.
# ---------------------------------------------------------------------------

_CLARIFY_MARKER = "__clarify__"

_GREETINGS = {"hi", "hello", "hey", "namaste", "yo", "hola", "sup", "hiya"}

# Direct item mentions jump straight to a recommendation (no clarify needed).
_ITEM_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("birthday",), "birthday_footlong"),
    (("footlong", "foot long"), "sub_footlong"),
    (("6-inch", "6 inch", "six inch", "six-inch"), "sub_6inch"),
    (("cookie", "cookies"), "cookie_x3"),
    (("double protein", "extra protein", "protein"), "double_protein"),
    (("combo",), "combo_upgrade"),
    (("drink", "beverage", "soda", "cola"), "free_drink"),
    (("50%", "50 %", "half off", "half-off", "% off"), "half_off"),
]

# Mood words → catalogue category. Order matters: more specific first.
_CATEGORY_WORDS: list[tuple[tuple[str, ...], str]] = [
    (("deal", "discount", "save", "offer", "cheap", "off"), "DEAL"),
    (("treat", "sweet", "dessert", "snack", "cookie", "drink"), "TREAT"),
    (("upgrade", "add-on", "add on", "extra", "more"), "UPGRADE"),
    (("meal", "hungry", "eat", "lunch", "dinner", "sub", "sandwich",
      "food"), "MEAL"),
]

_VAGUE_WORDS = ("spend", "recommend", "suggest", "surprise", "option", "options",
                "what can i", "what should i", "help", "reward", "rewards",
                "redeem", "points to use", "use my points", "anything")

# Kept specific to *checking* balance — "my points" alone is too broad (it would
# swallow "spend my points", which is a vague opener that should hit the clarify gate).
_BALANCE_WORDS = ("balance", "how many points", "points do i", "points i have",
                  "points left", "points balance", "check my point", "my balance",
                  "expiring", "expire", "how many do i")

# One clarify chip per category the user can lean toward.
_CLARIFY_CHIPS = ["Full meal", "An upgrade", "A sweet treat", "A deal", "Free drink"]

# Slot chips shown under a slot question.
_MEAL_SIZE_CHIPS = ["6-inch sub", "Footlong", "Show both"]

_CATEGORY_LABEL = {
    "MEAL": "a meal", "UPGRADE": "an upgrade", "TREAT": "a treat",
    "DEAL": "a deal",
}


def _has(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def _route_category(text: str) -> str | None:
    """Map a message (or clarify answer) to a catalogue category, or None."""
    t = text.lower()
    for words, category in _CATEGORY_WORDS:
        if _has(t, words):
            return category
    return None


def _detect_size(text: str) -> str | None:
    t = text.lower()
    if "footlong" in t or "foot long" in t:
        return "footlong"
    if "6" in t or "six" in t:
        return "6inch"
    if "both" in t:
        return "both"
    return None


def _select_items(category: str | None, size: str | None,
                  user: dict[str, Any]) -> list[CatalogueItem]:
    """Pick the catalogue slice for a category, apply the size filter for meals,
    then the vegetarian filter (CMR). Falls back to the full menu if empty."""
    items = [i for i in CATALOGUE if not category or i["category"] == category]
    if category == "MEAL" and size in ("footlong", "6inch"):
        want = "footlong" if size == "footlong" else "sub_6inch"
        sized = [i for i in items if (want in i["tags"] or i["id"] == want)]
        if sized:
            items = sized
    if user.get("vegetarian"):
        items = [i for i in items if i["veg"]]
    return items or [i for i in CATALOGUE if i["veg"]]


# ---------------------------------------------------------------------------
# In-memory session store (isolated from the bank Redis/Postgres store).
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
# candidate set; degrades to a deterministic template when no key is configured.
# ---------------------------------------------------------------------------

_DINING_REPLY_SYSTEM = """You are the Subway Rewards concierge — warm, upbeat, concise.

You receive a ranked list of reward candidates (already scored by a deterministic
engine) and the user's message. Write a short, helpful reply.

Rules — STRICTLY enforced:
1. Only reference candidates from the provided list. NEVER invent rewards, points
   costs, or ₹ values.
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
             "special": c["special"], "effective_value_inr": c["effective_value_inr"],
             "note": c["note"], "score_total": c["score_total"]}
            for c in candidates
        ],
    }
    return json.dumps(data, ensure_ascii=False)


def _template_reply(candidates: list[dict[str, Any]], user: dict[str, Any]) -> str:
    """Deterministic fallback reply (used when no LLM key is configured)."""
    first = (user["name"].split() or ["there"])[0]
    top = candidates[0]
    cost = "free" if top["points_cost"] == 0 else f"{top['points_cost']} pts"
    msg = f"{first}, my top pick is the {top['label']} ({cost}) — {top['note']}"
    if len(candidates) > 1:
        second = candidates[1]
        c2 = "free" if second["points_cost"] == 0 else f"{second['points_cost']} pts"
        msg += f" You could also grab the {second['label']} ({c2})."
    msg += " Tap to redeem whenever you're ready."
    return msg


async def _build_reply(candidates: list[dict[str, Any]], user: dict[str, Any],
                       user_message: str) -> tuple[str, bool]:
    """(reply_text, llm_used). LLM sees only the pre-scored candidate summaries."""
    try:
        from services.llm_service import _llm_call  # reuse transport only
        payload = _candidates_to_json(candidates, user["name"], user_message)
        text, groq_used = await _llm_call(_DINING_REPLY_SYSTEM, payload)
        return text, groq_used
    except Exception as exc:  # noqa: BLE001 — never block on LLM failure
        print(f"[dining] LLM reply unavailable ({exc}); using template")
        return _template_reply(candidates, user), False


# ---------------------------------------------------------------------------
# Schemas (defined here so schemas.py is untouched).
# ---------------------------------------------------------------------------

class DiningChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None


class DiningChatResponse(BaseModel):
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
    llm_used: bool = False


class DiningRedeemRequest(BaseModel):
    session_id: str
    candidate_id: str
    user_id: Optional[str] = None
    mode: Literal["demo"] = "demo"


class DiningRedeemResponse(BaseModel):
    status: Literal["completed", "failed"]
    confirmation_reference: str
    candidate_id: str
    option_label: str
    points_used: int
    balance_after: int
    mode: Literal["demo"] = "demo"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _prefill_note(user: dict[str, Any]) -> str:
    """Deterministic CMR confirmation — built OUTSIDE the LLM, like the bank flow.
    Confirms known facts so the concierge never re-asks them."""
    bits = []
    if user.get("vegetarian"):
        bits.append("kept everything vegetarian")
    if "italian" in (user.get("preferred_tags") or []):
        bits.append("leaned toward your Italian-style subs")
    if not bits:
        return ""
    return " I've " + " and ".join(bits) + " for you."


async def _recommend(session: dict[str, Any], user: dict[str, Any],
                     category: str | None, size: str | None,
                     message: str, direct_id: str | None = None) -> DiningChatResponse:
    """Score the relevant catalogue slice, index it for /redeem, build a reply."""
    veg_swap_note = ""
    if direct_id is not None:
        item = _CATALOGUE_BY_ID[direct_id]
        # A directly-named non-veg item for a veg user is swapped out below by the
        # veg filter — say so explicitly instead of silently showing other things.
        if user.get("vegetarian") and not item["veg"]:
            veg_swap_note = (f" Quick note: the {item['label']} isn't vegetarian, "
                             "so I've lined up veg-friendly picks instead.")
        category = item["category"]

    items = _select_items(category, size, user)
    scored = _score_candidates(items, user, category)

    # If the user named a specific item, float it to the top when it survived
    # the veg filter (so an explicit ask is honoured), else lead with the score.
    if direct_id is not None:
        scored.sort(key=lambda c: (c["candidate_id"] != direct_id, -c["score_total"]))
        for rank, c in enumerate(scored, 1):
            c["rank"] = rank

    top = scored[:3]
    reply, llm_used = await _build_reply(top, user, message)
    reply += veg_swap_note or _prefill_note(user)

    session["candidate_index"] = {c["candidate_id"]: c for c in scored}
    session["last_candidates"] = scored
    session["response_type"] = "recommendation"
    session["missing_slots"] = []

    return DiningChatResponse(
        session_id=session["session_id"], user_id=user["user_id"],
        reply=reply, response_type="recommendation", category=category,
        known_slots=session["known_slots"], recommendations=top,
        requires_confirmation=True, points_balance=user["demo_points"],
        llm_used=llm_used,
    )


@router.post("/chat", response_model=DiningChatResponse)
async def dining_chat(req: DiningChatRequest) -> DiningChatResponse:
    user = _get_user(req.user_id)
    session = _load_session(req.session_id)
    text = (req.message or "").strip()
    t = text.lower()
    prior_type = session.get("response_type")
    prior_missing = session.get("missing_slots") or []

    def _base(**kw) -> DiningChatResponse:
        return DiningChatResponse(
            session_id=session["session_id"], user_id=user["user_id"],
            known_slots=session["known_slots"], points_balance=user["demo_points"],
            **kw)

    # --- Continuation: the previous turn asked a question ---------------------
    if prior_type == "follow_up_question":
        # (a) Answering the clarify gate → route to a category and recommend.
        if prior_missing == [_CLARIFY_MARKER]:
            if "drink" in t:
                category = "TREAT"
            else:
                category = _route_category(t) or "MEAL"
            session["known_slots"]["category"] = category
            if category == "MEAL":
                # Meals still need one detail — the size — before we recommend.
                session["response_type"] = "follow_up_question"
                session["missing_slots"] = ["meal_size"]
                return _base(reply="Great — a 6-inch or a footlong?",
                             response_type="follow_up_question", category=category,
                             missing_slots=["meal_size"],
                             suggested_replies=_MEAL_SIZE_CHIPS)
            return await _recommend(session, user, category, None, text)
        # (b) Answering the meal-size slot.
        if prior_missing == ["meal_size"]:
            size = _detect_size(t) or "both"
            session["known_slots"]["meal_size"] = size
            return await _recommend(session, user, "MEAL",
                                    None if size == "both" else size, text)

    # --- Fresh turn ----------------------------------------------------------
    # Greeting.
    if t in _GREETINGS or any(t.startswith(g + " ") for g in _GREETINGS):
        session["response_type"] = "greeting"
        session["missing_slots"] = []
        first = user["name"].split()[0]
        return _base(
            reply=(f"Hey {first}! Welcome to Subway Rewards. You've got "
                   f"{user['demo_points']} points to play with. What are you craving?"),
            response_type="greeting",
            suggested_replies=["Free Footlong", "A sweet treat", "See my points"])

    # Balance / expiry — instant, deterministic (no LLM), like check_expiry.
    if _has(t, _BALANCE_WORDS):
        affordable = [i for i in CATALOGUE
                      if i.get("special") or i["points_cost"] <= user["demo_points"]]
        best = max(affordable, key=lambda i: i["value_inr"], default=None)
        session["response_type"] = "balance"
        session["missing_slots"] = []
        tip = (f" That's enough for a {best['label']}!" if best else "")
        return _base(
            reply=f"You have {user['demo_points']} Subway points, {user['name'].split()[0]}.{tip}",
            response_type="balance",
            suggested_replies=["Free Footlong", "A deal", "A sweet treat"])

    # Direct item mention → straight to a recommendation.
    for words, item_id in _ITEM_KEYWORDS:
        if _has(t, words):
            return await _recommend(session, user, None, _detect_size(t), text,
                                    direct_id=item_id)

    # Mood word → category. Meals get one slot question first (size).
    category = _route_category(t)
    if category == "MEAL":
        session["known_slots"]["category"] = "MEAL"
        session["response_type"] = "follow_up_question"
        session["missing_slots"] = ["meal_size"]
        return _base(reply="Nice — a 6-inch or a footlong?",
                     response_type="follow_up_question", category="MEAL",
                     missing_slots=["meal_size"], suggested_replies=_MEAL_SIZE_CHIPS)
    if category:
        session["known_slots"]["category"] = category
        return await _recommend(session, user, category, None, text)

    # Vague opener (or anything else) → ONE clarify question before recommending.
    session["response_type"] = "follow_up_question"
    session["missing_slots"] = [_CLARIFY_MARKER]
    first = user["name"].split()[0]
    return _base(
        reply=(f"Happy to help you spend those points, {first}! "
               "Are you after a full meal, an upgrade, a sweet treat, or a deal?"),
        response_type="follow_up_question", missing_slots=[_CLARIFY_MARKER],
        suggested_replies=_CLARIFY_CHIPS)


@router.post("/redeem", response_model=DiningRedeemResponse)
async def dining_redeem(req: DiningRedeemRequest) -> DiningRedeemResponse:
    user = _get_user(req.user_id)
    session = _load_session(req.session_id)

    candidate = (session.get("candidate_index") or {}).get(req.candidate_id)
    if candidate is None:
        # Fall back to the catalogue so a valid id still resolves.
        item = _CATALOGUE_BY_ID.get(req.candidate_id)
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

    # Mock booking: deduct demo points, mint a fake confirmation reference.
    user["demo_points"] -= cost
    ref = f"SUB-DEMO-{random.randint(0, 0xFFFF):04X}"
    return DiningRedeemResponse(
        status="completed", confirmation_reference=ref,
        candidate_id=candidate["candidate_id"], option_label=candidate["label"],
        points_used=cost, balance_after=user["demo_points"], mode="demo")


@router.get("/health")
async def dining_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "concierge": "Subway Food & Dining rewards",
        "catalogue_size": len(CATALOGUE),
        "session_backend": "memory",
        "active_sessions": len(_SESSIONS),
        "demo_user": {
            "name": DEMO_USERS[DEFAULT_USER_ID]["name"],
            "points_balance": DEMO_USERS[DEFAULT_USER_ID]["demo_points"],
        },
    }
