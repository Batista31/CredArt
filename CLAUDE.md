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
| Frontend root (login → landing → store stage router) | `frontend/src/App.jsx` |
| **Per-category themes** (CSS-var palettes + meta) — only `rewards` is mounted | `frontend/src/theme.jsx` |
| Rewards Catalogue: sign-in · visual landing · store + cart · OTP checkout | `frontend/src/components/{RewardsLogin,RewardsLanding,RewardsCatalogue,RewardsCheckout}.jsx` |
| Floating CredArt concierge bubble (local intent engine + backend enrichment) | `frontend/src/components/CredArtBubble.jsx` |
| Hardcoded rewards catalogue + personas + local concierge engine | `frontend/src/lib/catalogue.js` |
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

The frontend is currently a **single experience**: the CredArt Rewards Catalogue — a
Kobie / Navy-Federal-style points store (browse → cart → OTP-secured redemption) with a
floating CredArt AI concierge on top. The earlier multi-world landing (Bank / Food &
Dining / Entertainment picker + laptop⇄mobile toggle) has been replaced; those routers
still exist and work at the **backend** level (`/chat`, `/dining/*`, `/entertainment/*`)
but their frontend components are no longer mounted — see "Orphaned components" below.

- **Stage router** (`App.jsx`): three stages, no routing library —
  `login` (`RewardsLogin.jsx`) → `landing` (`RewardsLanding.jsx`) → `store`
  (`RewardsCatalogue.jsx`). Login accepts any credentials (demo). Landing's
  `onEnter(categoryKey | null)` opens the store, optionally deep-linked into a category
  (`initialCategory`). The store's back arrow calls `onExit` to return to landing.
- **Theme** (`theme.jsx`): only the `rewards` theme (navy + gold) is applied — via
  `--brand-*` CSS vars on the root wrapper in `App.jsx`. The `bank` / `dining` /
  `entertainment` theme entries and `CategoryIcon` cases still exist (harmless, unused).
- **Hardcoded catalogue + local concierge engine** (`lib/catalogue.js`) — the single
  source of truth for the store. No backend call ever fetches catalogue items, so the
  store is byte-identical every demo run:
  - `CATALOGUE` — 4 categories (`travel`, `giftcards`, `cashback`, `merchandise`),
    **50+ items each** (curated hero items with fixed ids + bulk-generated rows).
  - `CAT_PERSONAS` — Riya (₹travel-lean, 84,500 pts) / Samyak (dining-lean, 50,000 pts),
    keyed by the **same** user ids as `api.js`'s `USERS` so the persona switcher stays
    in sync with the real backend `/chat` calls. Each carries a `cmr` fallback profile
    (address/city/family size/preferences) used by checkout when the backend is offline.
  - `runConcierge(message, ctx)` — the local intent engine driving the chat bubble.
    Deliberately mirrors **`dialogue_manager.py`'s interaction character**, not its code:
    one question at a time (a real slot-filled trip journey: destination → dates, never
    a form), a clarify gate for unmatched asks, and a **personalization-forward opener**
    — a fully vague ask ("how should I spend my points?") skips the clarify question when
    the persona has a clear category lean and leads straight into it with a "your profile
    leans toward X, so I started there" preface + switch chips. Recommendations are
    always ordered affordable-first against the user's *spendable* budget
    (balance − cart total) with over-budget items flagged in the reply text — see
    "Budget honesty" below.
- **Rewards store** (`RewardsCatalogue.jsx`): navbar (account pill with live points,
  cart, persona switcher), a photo hero, 4 category tiles, per-category grids with
  search + a "Filter & Sort" points sort. State (balances, per-persona carts) lives here
  and is threaded down to the modal, cart panel, checkout overlay, and the bubble.
- **Cart, not instant redeem**: "View Details" → **Add to Cart** (`addToCart`) reserves
  an item without touching points; the navbar cart badge reflects pending cart items.
  The cart panel (`CartPanel`) lists items with remove + a **Redeem Cart** button.
  `addToCart` enforces the running cart subtotal against the balance immediately, with a
  specific reason string, so a user is never told "insufficient points" only after
  going through checkout.
- **OTP-secured checkout** (`RewardsCheckout.jsx`) — ported from the original bank
  `Confirm.jsx` execution flow's *style* (not its API calls; this store never touches
  the real ledger): agentic progress steps → (merchandise only) a **CMR-autofilled
  delivery address** step, fetched live from `GET /cmr/{user_id}` when the backend is
  reachable else the seeded fallback in `catalogue.js` → 6-digit **OTP** entry (a demo
  SMS card shows the code in-UI since there's no real bank behind this store; wrong code
  shakes, expiry/cancel leaves the cart and balance untouched) → per-item booking
  references shaped like the real provider would return (flight **PNR**, other travel
  **Booking ID**, gift-card **voucher code**, cashback **txn ref**, merchandise
  **order #**). Points are debited via `performCheckout` (in `RewardsCatalogue.jsx`)
  **only after** the OTP verifies.
- **Budget honesty, surfaced before commitment** (not just at checkout): grid product
  cards show an "⚠ N pts short" badge on the photo; the detail modal shows a full
  warning box and disables Add to Cart; the chat bubble's inline item cards grey out and
  disable Add with a shortfall chip; `addToCart` itself is the final, authoritative gate.
- **Floating CredArt bubble** (`CredArtBubble.jsx`): pulsing launcher, slide-up panel,
  persona-specific proactive greeting with the **live** balance patched in
  (`greetingFor`). Runs `runConcierge` locally first (so recommendations always name
  real catalogue items and redemption is instant/reliable); an unmatched message pings
  the real backend `/chat` (with the active persona's `user_id`) as best-effort
  enrichment, falling back to a mocked reply if the backend is unreachable.
- **API client** (`src/lib/api.js`): `ACTIVE_USER_ID` is mutable — the store's persona
  switcher calls `setActiveUser` so the bubble's backend `/chat` fallback still targets
  the right seeded user even though the bank dashboard UI isn't shown.

### Orphaned components (not mounted, kept on disk)

`Landing.jsx`, `BankExperience.jsx`, `CategoryChat.jsx`, `IOSDevice.jsx`,
`Concierge.jsx`, `Confirm.jsx`, `Dashboard.jsx`, `fulfillment.jsx`, `mode.jsx` are the
previous multi-world frontend. They still compile and their backend routes
(`/chat`, `/redeem`, `/dining/*`, `/entertainment/*`) still work — only `App.jsx` no
longer renders them. If the multi-world picker is restored later, these are the
starting point; until then, treat them as unreachable via the running UI.

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

Then open <http://localhost:5173> — sign in (any credentials), land on the visual
Rewards Catalogue landing page, then **Browse the Store** or **Explore Travel** (deep
links straight into a category). The old bank/dining/entertainment picker and the
laptop⇄mobile toggle are no longer surfaced by the frontend (see "Orphaned components"
above); the bank demo below still works but only via the backend routes those
components used to call, so run it through the orphaned `Concierge`/`BankExperience`
components directly if needed, or `curl`/Postman against `/chat` and `/redeem`.

Apply migrations against the DB the same way as the others (the SQL in
`db/prisma/migrations/NNNN_name/migration.sql`).

## Demo walkthrough — Rewards Catalogue (current frontend)

1. Sign in → landing page → **Explore Travel**.
2. Ask the CredArt bubble `how should I spend my points?` — Riya's travel lean
   surfaces IndiGo/Marriott/lounge picks with a "since your profile leans toward
   travel" preface and switch chips (personalization proof, no clicks needed).
3. `I'm planning a trip` → **Goa** → **This weekend** → picks ordered affordable-first,
   any over-budget item flagged in the reply text before you can act on it.
4. Add a pick to cart → open the cart (navbar) → **Redeem Cart** → OTP screen (code
   shown in a simulated bank SMS card) → success screen with a real-shaped PNR.
5. Switch to **Samyak** → same vague opener leans dining instead (contrast demo).
6. Samyak adds a merchandise item → checkout inserts a delivery step **autofilled from
   his CMR profile** (live `GET /cmr/{user_id}` if the backend is up, else the seeded
   fallback) before the OTP step.

## Demo walkthrough — Bank backend (via orphaned components / API)

1. **Riya dashboard** → point out Millennia CashPoints expiring today.
2. `what's expiring?` → instant, deterministic urgency answer.
3. `I want to travel` → clarify chip **Flights** → answer each slot via chips →
   live Duffel flight options → book (Demo) → confirmation.
4. Switch to **Samyak** → same vague ask leans dining (personalization/CMR contrast).
5. Samyak `I want to buy a camera` → budget chip → real products with photos →
   redeem → auto-fills his saved CMR address.
6. History drawer / page refresh → conversation persists (Redis sessions).
