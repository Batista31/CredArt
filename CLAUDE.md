# CLAUDE.md — CredArt architecture & working notes

CredArt is a FastAPI-based AI rewards concierge for HDFC credit-card holders. It
turns a chat message into a **pre-validated set of redemption candidates** and a
helpful reply, while guaranteeing every number it shows is real (sourced from a
bank-style catalogue + the user's own data), never invented by the LLM.

## The two layers (and the anti-hallucination boundary)

```
            ┌────────────────────────────────────────────────────────┐
  user ───► │  FastAPI orchestrator (api/)                            │
            │    intent → Layer 1 candidate assembly → scoring        │
            │    → fulfilment options → LLM rerank/reply              │
            └───────────────┬───────────────────────┬────────────────┘
                            │                       │
              Layer 1 (deterministic)         LLM (Groq/Gemini)
              services/*  + Postgres          sees ONLY the candidate
              + bank MCP (card-level)         set — never the DB
```

- **Layer 1** = `backend/services/*` — all SQL + business logic. Deterministic.
  Builds candidates, scores them (`scoring_service`), resolves fulfilment.
- **Bank MCP server** (`mcp_server.py`, port 8000) exposes **card-level** catalogue
  data only. It never sees user balances/history — that table boundary is the
  structural anti-hallucination guarantee. The backend is its *client*
  (`bank_mcp_client`, with in-process fallback).
- **User data** (cards, points, preferences, CMR) enters via SMS parsing and the
  CMR endpoints — never via the bank MCP.
- **The LLM** (`llm_service`, Phase 7) receives ONLY the pre-validated candidate
  set (`_candidates_to_json`) for reranking + a natural-language reply. It never
  queries the DB and may not invent points/₹ values.

> **Golden rule:** anything that could be hallucinated (values, availability)
> must be computed in Layer 1 and *passed to* the LLM, not asked of it.

## Key files

| Area | File |
|------|------|
| App + routes (port 8001) | `backend/api/main.py` |
| Pydantic models | `backend/api/schemas.py` |
| Intent extraction (LLM + heuristic) | `backend/api/intent.py` |
| **Conversational dialogue** (slot-filling, clarify gate, chips) | `backend/api/dialogue_manager.py` |
| LLM question planner (for planned journeys) | `backend/services/query_generator.py` |
| Candidate assembly | `backend/api/orchestrator.py` |
| **Session store (Redis-backed, in-memory fallback)** | `backend/api/session.py` |
| 5-dimension scoring | `backend/services/scoring_service.py` |
| User/preferences reads | `backend/services/user_service.py` |
| CMR profile | `backend/services/cmr_service.py` |
| Live flight search (Duffel) | `backend/services/flight_service.py` |
| Live hotel search (storefront) | `backend/services/hotel_service.py` |
| Real-product search → points | `backend/services/merchandise_service.py` |
| LLM (Groq multi-key → Gemini) | `backend/services/llm_service.py` |
| Bank MCP client | `backend/services/bank_mcp_client.py` |
| Redemption providers/executor | `backend/services/redemption/*` |
| **Food & Dining router (Subway)** — self-contained | `backend/api/dining.py` |
| **Entertainment & Cinema router (TMDB)** — self-contained | `backend/api/entertainment.py` |
| Frontend root (landing router + laptop/mobile toggle) | `frontend/src/App.jsx` |
| **Per-category themes** (CSS-var palettes + meta) | `frontend/src/theme.jsx` |
| Landing page · themed category chat · bank experience | `frontend/src/components/{Landing,CategoryChat,BankExperience}.jsx` |
| Frontend API client (bank + dining + entertainment) | `frontend/src/lib/api.js` |
| Schema (Prisma mirror) | `db/prisma/schema.prisma` |
| Migrations | `db/prisma/migrations/NNNN_name/migration.sql` |
| Demo reset SQL + runner | `db/reset_demo.sql` · `db/run_reset.py` |

## Demo users (seed 0005 + `seed_demo_portfolio.sql`)

| User | id | Cards | Profile lean |
|------|----|-------|--------------|
| Samyak Rao | `…0000000000001` | Infinia + Regalia Gold + Millennia | **dining** (`dining_weight` 0.500) |
| Riya Sharma | `…0000000000002` | Infinia + Regalia Gold + Millennia | **travel** (`travel_weight` 0.500) |

The contrasting profile lean is the whole point of the demo: the *same* vague ask
surfaces travel options for Riya and dining options for Samyak. Both personas are
switchable live in the UI (persona pill).

`db/reset_demo.sql` restores **both** personas' mutable state (points, ledger,
preferences, CMR seeds) to spec — run it before every demo via
`backend\.venv\Scripts\python db\run_reset.py` (prints each persona's balances to
confirm). Demo redemptions spend a separate `demo_points` bucket so the live
ledger is never corrupted and the demo is replayable.

---

# Customer Master Record (CMR)

A single unified profile of a user beyond cards + points, so CredArt stops
re-asking known facts and can make smarter, **deliverable** recommendations.

**Boundary:** every CMR field feeds deterministic recommendation/scoring/delivery
logic in Layer 1. None of it is ever handed to the LLM — the LLM still only sees
the candidate set. The "confirm pre-filled values" reply text is built
deterministically and appended *outside* the LLM call.

All CMR columns are optional with safe defaults, so existing rows are unaffected.

## What CMR stores (migration `0012_cmr`)

1. **Extended user profile** — `users.date_of_birth` (plus existing
   phone/email/city/state).
2. **Extended preferences** — `preferences.preferred_airlines`,
   `preferred_hotel_chains`, `preferred_cuisines`, `dietary_restrictions`
   (all `TEXT[] DEFAULT '{}'`), and `family_size` (`INT DEFAULT 1`).
3. **Saved addresses** — `user_addresses` (label, line1/2, city, state, pincode,
   `is_default`). A partial-unique index enforces at most one default per user.
4. **Wishlist** — `cmr_wishlist` (benefits the user liked but didn't redeem),
   matched by `label`. Surfaced later with a small scoring boost.
5. **Dismissed** — `cmr_dismissed` (benefits the user rejected). Filtered out of
   future recommendations entirely.

## How CMR changes behaviour

- **Smarter ranking** (`scoring_service.score_candidates` + `cmr_service.preference_boost`):
  after the deterministic 5-dim weighted score, a small boost is added —
  `+8` if the candidate matches a preferred airline/hotel/cuisine, `+6` if it's
  wishlisted (sum clamped to 100). The core score stays the primary signal.
- **Dismissed filtering** (`orchestrator.orchestrate`): dismissed labels are
  removed from the candidate list **before** scoring, so a rejected item never
  resurfaces.
- **Completeness check** (`cmr_service.prefill_note`): a deterministic sentence
  is appended to the reply confirming pre-filled values (party size from
  `family_size`, dietary needs from `dietary_restrictions`) so the assistant
  doesn't re-ask. Built outside the LLM.
- **Physical goods delivery** (`/redeem` in `main.py` + `cmr_service`):
  redemptions detected as physical (SHOPPING category or product keywords) need
  a delivery address. The flow uses an inline address (saved for next time) or
  the saved default; if neither exists it returns `status="address_required"`
  with a conversational `address_prompt` instead of booking.

## CMR endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/cmr/{user_id}` | Full profile: user + preferences + addresses + wishlist + dismissed |
| `POST` | `/cmr/address`   | Save a delivery address (`make_default` optional) |
| `POST` | `/cmr/wishlist`  | Add a benefit to the wishlist (by `label`, or resolved from `session_id`+`candidate_id`) |
| `POST` | `/cmr/dismiss`   | Dismiss a benefit (same resolution options) |

`/redeem` gains an optional `delivery_address` and a new `address_required`
response status (+ `address_prompt`, `delivery_address`).

## CMR demo data (seed in `0012`, replayable via `reset_demo.sql`)

- **Riya** — city Mumbai, `family_size` 1, `preferred_airlines` `["IndiGo"]`,
  Home address (Mumbai), wishlist `Manali Weekend Stay`, dismissed
  `BookMyShow Voucher` (so it never reappears for her).
- **Samyak** — city Bengaluru, `family_size` 2, `preferred_cuisines`
  `["North Indian","Italian"]`, Home address (Bengaluru), wishlist
  `Goa Marriott Luxury Stay`.

Wishlist/dismissed seeds use real catalogue `benefit_name`s so the boost/filter
actually engage when those candidates surface at runtime.

---

# Conversational dialogue (`dialogue_manager.py`)

The concierge gathers context like a real agent — **one question at a time**, never
dumping a form, never assuming a value the user didn't give.

- **Slot-filling** (`_JOURNEY_SLOTS`): each journey type declares required/optional
  slots. `_missing_slots()` drives the next question; `_SLOT_QUESTIONS` holds the
  wording. Flights ask destination → origin → dates → passengers → cabin, each once.
- **Clarify gate** (`_CLARIFY_JOURNEYS`): a vague opener ("how should I spend my
  points?", "I want to travel") gets **one** clarifying question before any
  recommendation. `_route_clarify_answer()` maps the reply to a concrete journey.
  `check_expiry` and greetings stay instant (no clarify).
- **Personalization-forward openers** (`_dominant_lean`): a *fully category-less* vague
  opener ("how do I spend my points?") skips the clarify question when the user's stored
  preference weights show a clear lean (`_LEAN_MIN_WEIGHT` 0.35 + `_LEAN_MIN_MARGIN` 0.15
  over the runner-up) — it leads straight into that category's recommendations with a
  deterministic "you lean toward X, so I started there" preface and **switch chips**
  (`awaiting_category_switch` state lets a lane word next turn re-route in one tap). A flat
  profile has no dominant lean → falls back to the clarify question. Openers that already
  name a category ("I want to travel") still clarify as before. Same ask, different persona,
  different answer, **zero clicks** — the demo's core personalization proof (Act 3).
- **Tap-to-answer chips** (`suggested_replies` in `ChatResponse`): follow-up
  questions ship a small set of chip answers. `_SLOT_CHIPS` covers finite slots
  (cabin, passengers, dates…); `_clarify_chips()` covers the clarify step. Free-text
  slots (destination, product) send no chips. Chip text is chosen to parse cleanly
  back in (`_resolve_date` for dates, IATA/heuristics elsewhere).
- **Deterministic date resolution** (`_resolve_date`): converts "next friday",
  "this weekend", "21 july", "next month" → ISO, no LLM, never books in the past.
- **Transient slots** (`_TRANSIENT_SLOTS`): request-specific slots (product,
  destination, cabin…) never carry over from a past conversation's memory.
- **LLM planner** (`query_generator.py`, `PLANNED_JOURNEYS` = gift/voucher/home_setup/
  merchandise): these journeys use an LLM to plan the next question. Travel and
  product journeys are intentionally **deterministic** slot-filling (no LLM "confirm
  the dates?" loop).

# Fulfilment partners (`backend/services/redemption/*`)

Every candidate resolves to real fulfilment paths (`registry.fulfillment_options_for`)
plus an always-present demo path. `executor.py` runs demo + production (4-path:
demo | api | assisted | bank), OTP-gates providers that require it, and debits points
atomically only on a confirmed booking.

| Provider | Path | What it does |
|----------|------|--------------|
| `demo_provider` | demo | simulates booking, spends `demo_points`, replayable — fake `CRD-DEMO-…` ref |
| `duffel_provider` | api | **live** Duffel test API — real flight search + `/air/orders`; returns a real booking reference |
| `tango_provider` | api | **live** Tango RaaS sandbox — issues a real Amazon/Google Play voucher + code (`path="api"` is required so production accepts it) |
| `website_hotel_provider` | assisted | real HTTP POST to a partner when `PROVIDER_<ID>_BOOK_URL` is set; OTP-gated |
| `assisted_checkout` / `bank_internal` / `voucher` | assisted/bank/api | remaining fulfilment routes |

Keys live in `backend/.env`: `DUFFEL_API_KEY` (`duffel_test_…`), `TANGO_API_USER`/
`TANGO_API_PASS`. Demo mode never calls these; production mode does.

# General-item redemption (`merchandise_service.py`)

Beyond vouchers, the user can buy real products (camera, phone, appliance) with points.
Real listings are searched (open product API today; Amazon key is a drop-in), priced
into points deterministically (Layer 1 owns the ₹→points figure), and returned as
`kind="merchandise"` candidates carrying a product `thumbnail`. Physical goods route
through the **CMR delivery flow**: `cmr_service.is_physical_goods()` recognises
`merchandise` + SHOPPING, and `/redeem` uses the saved default address (or asks for
one). Merchandise fulfilment = `tango_voucher` (points → Amazon voucher → order) + demo.

# Multi-category concierges (dining + entertainment)

Beyond banks, CredArt runs two additional rewards worlds as **self-contained
routers** mounted in `main.py`. Each mirrors the bank architecture (clarify gate +
one-question slot-filling + chips, an adapted 5-dimension scorer, the LLM sees only
pre-scored candidates) but shares **no** tables, services, or session state with the
bank routes — so it cannot break them. Each keeps its own in-memory sessions and a
separate replayable `demo_points` bucket.

- **Food & Dining — Subway** (`api/dining.py`, `/dining/{chat,redeem,health}`): a
  hardcoded Subway rewards catalogue. Demo user **Anushka (500 pts)**;
  vegetarian preference **filters out** non-veg items before scoring, preferred tags
  (`italian`, `sub`) earn a boost. Mock redemptions return `SUB-DEMO-XXXX`.
- **Entertainment & Cinema** (`api/entertainment.py`, `/entertainment/{chat,redeem,health}`):
  MIXES **real TMDB now-playing movies** (title/poster/rating via `TMDB_API_KEY`)
  with a hardcoded rewards catalogue (IMAX, OTT, events, gaming). Demo user **Saket
  (800 pts)**; thriller/action genre boost + IMAX preference. Movies use the
  same **one-question-at-a-time slot-filling** as the bank flight flow: genre
  ("what are you in the mood for?") → ticket count ("how many tickets?", chips mark
  Saket's usual group size of 3) → recommend. A specific genre filters now-playing to
  matching titles; the ticket price is computed in Layer 1. IMAX format stays the
  one silently pre-filled fact. Falls back to 5 hardcoded titles if TMDB is
  unavailable. Mock redemptions return `ENT-DEMO-XXXX`. `TMDB_API_KEY` is
  documented in `backend/.env.example`.

The anti-hallucination boundary holds: both routers compute every points/₹ figure in
Layer 1 and pass only pre-scored candidate summaries to the LLM (which degrades to a
deterministic template reply when no key is configured).

# Sessions & infrastructure

- **Session store** (`session.py`): Redis-backed when `REDIS_URL` is set (survives
  backend restarts / `--reload`, shareable across workers), else in-memory. Any Redis
  call failure falls back to the in-memory dict for that call, so a Redis blip degrades
  gracefully. `/health` reports `session_backend`. Keyed `credart:session:{id}`, 1h TTL
  slid on access.
- **Points lock** (`executor.py`): a Redis `SET NX EX` lock (`credart:lock:{user}:{card}`)
  stops two concurrent production redemptions from double-spending real points. Demo
  redemptions skip it (separate replayable bucket). No Redis → no lock (fine for solo dev).
- **LLM key fallback** (`llm_service.py`): Groq keys are tried in order
  (`GROQ_API_KEY`, `GROQ_API_KEY_2/_3`, or comma-separated `GROQ_API_KEYS`); a
  rate-limited/exhausted key rotates to the next, then finally Gemini. `claude_used` in
  the response is `True` only when Groq answered a recommendation reply — it is `False`
  on deterministic paths (expiry, clarify, slot-filling) by design.

# Frontend (`frontend/`, React + Vite, port 5173)

- **Landing router** (`App.jsx`): a premium landing page (`components/Landing.jsx`)
  with three category cards → picking one opens that world's themed concierge. Also
  hosts a global **laptop ⇄ mobile** toggle (fixed top-right): laptop shows the
  browser-window shell; mobile re-renders the *same* experience inside a phone frame
  (`components/IOSDevice.jsx`). Every experience takes a `view` prop and fits the frame.
- **Per-category theming** (`theme.jsx`): every component reads its colours from the
  global `--brand-*` CSS scale. Each category (bank = navy+gold, dining = green+yellow,
  entertainment = purple+red) overrides that scale on a wrapper `div`, so a whole
  experience — including the untouched bank chat — re-themes with **no** component
  changes. `theme.meta` carries per-category greeting/chips/demo-user config.
- **Bank experience** (`components/BankExperience.jsx`): the original HDFC app moved out
  of `App.jsx` verbatim (dashboard + Riya/Samyak persona switcher + `Concierge` chat +
  `Confirm`), plus a "Categories" back button. Behaviour and every backend call are
  unchanged.
- **Category chat** (`components/CategoryChat.jsx`): the themed dining/entertainment chat
  — greeting, quick chips, recommendation cards (movie posters as thumbnails), and a
  redeem button that debits demo points and shows the confirmation reference. Redeem is
  gated on the **live** balance.
- **Concierge chat** (`components/Concierge.jsx`): the bank chat — `suggested_replies` as
  tap chips, product `thumbnail`s, a **conversation-history drawer**, a **New chat**
  button. `Confirm.jsx` fires the real redemption **exactly once** (StrictMode-safe guard).
- **API client** (`src/lib/api.js`): `ACTIVE_USER_ID` is mutable so the persona switcher
  flips the whole bank app; `conversations()` / `conversation(id)` back the history drawer.
  `dining*` / `ent*` methods call the new routers (no `user_id` — each router has its own
  demo user).

## Run

```powershell
# 1. reset both demo personas (run before every demo)
backend\.venv\Scripts\python db\run_reset.py

# 2. backend (port 8001) — Redis sessions + LLM + fulfilment
cd backend
.venv\Scripts\python -m uvicorn api.main:app --port 8001 --reload

# 3. bank MCP (port 8000) — optional; backend has an in-process fallback
.venv\Scripts\python -m mcp_server

# 4. storefront (port 8002) — optional; only for LIVE hotel booking in production mode
#    (set PROVIDER_HOTEL_*_BOOK_URL in backend/.env to point at it)

# 5. frontend (port 5173)
cd frontend
npm run dev
```

Then open <http://localhost:5173> — the landing page offers the three worlds; the
top-right **laptop ⇄ mobile** toggle previews the phone layout. For the bank demo
keep the mode toggle on **Demo** (replayable, safe); flip to **Production** only to
show a real Duffel booking reference or a real Tango voucher.

Apply migrations against the DB the same way as the others (the SQL in
`db/prisma/migrations/NNNN_name/migration.sql`).

## Demo walkthrough

1. **Riya dashboard** → point out Millennia CashPoints expiring today.
2. `what's expiring?` → instant, deterministic urgency answer.
3. `I want to travel` → clarify chip **Flights** → answer each slot via chips →
   live Duffel flight options → book (Demo) → confirmation.
4. Switch to **Samyak** → same vague ask leans dining (personalization/CMR contrast).
5. Samyak `I want to buy a camera` → budget chip → real products with photos →
   redeem → auto-fills his saved CMR address.
6. History drawer / page refresh → conversation persists (Redis sessions).
