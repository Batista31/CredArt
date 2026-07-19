# CredArt — Project File Guide

A file-by-file explanation of everything in this repository. CredArt is an AI rewards-points concierge: a FastAPI backend (with a deterministic "Layer 1" that computes every real number — points, prices, balances — and an LLM layer that only reranks/explains, never invents figures) plus a Vite/React frontend built around a hardcoded Rewards Catalogue store, a floating chat concierge, and a live Duffel-powered flight booking flow.

---

## Root

- **`.gitignore`** — Standard Node/Python/IDE/OS ignore rules (`node_modules`, `dist`/`build`/`.vite`, `venv`/`__pycache__`, `.env` variants, logs, IDE folders); nothing project-specific.
- **`DEMO_RUNBOOK.md`** — Step-by-step mentor-demo runbook for "production mode": launch order for the four services (MCP :8000, storefront :8002, backend :8001, frontend :5173), a preflight script reference, and a scripted 5-act walkthrough (expiry urgency, live Duffel flight booking, persona-based personalization contrast, real Tango voucher + CMR address autofill, entertainment/dining side flows) plus a troubleshooting table for live-demo failures.
- **`README.md`** — Main project README describing CredArt as an AI rewards concierge where the LLM never invents numbers; documents the Rewards Catalogue (main experience: Store, CredArt chatbot with local intent engine, Travel page, confirmation emails) and the three secondary "worlds" (Banks, Food & Dining, Entertainment); includes the repo layout tree, prerequisites, and run instructions.
- **`demo_script.md`** — A tighter, 8-minute version of the demo runbook with condensed talking points per act (urgency, live booking, personalization contrast, voucher + memory, movies/dining) and a fallback table; ends with guidance on which points to emphasize if a mentor probes for hallucination risk.
- **`run_demo.ps1`** — PowerShell launcher script that starts all four services (MCP, storefront, backend, frontend) each in its own titled window in the correct dependency order, with `-Reset` (runs `db/run_reset.py`), `-Preflight` (runs `demo_preflight.py`), and `-NoFrontend` switches; sleeps briefly between MCP/storefront startup and backend startup so the backend picks up `bank_data_source=mcp`.

---

## backend/

### backend/api/ — FastAPI routes & conversational orchestration

- **`__init__.py`** — Empty except a docstring marking `api` as a package; describes the layer's purpose (Layer 1 deterministic services + bank MCP catalogue + SMS-sourced user data feed a pre-validated candidate set, which the LLM only ever reranks/explains).
- **`main.py`** — The FastAPI app itself. Wires up all routers (dining, entertainment, travel), defines the core bank-chat endpoints (`/chat`, `/sms`, `/cards/{user_id}`), redemption (`/redeem`, OTP booking sessions), CMR profile endpoints (addresses, wishlist, dismiss), and conversation persistence endpoints. Entry point — `uvicorn api.main:app` runs it.
- **`session.py`** — `SessionStore`: Redis-backed (falls back to in-memory) chat session store with TTL and graceful degradation if Redis drops. Also owns `merge_partial_intent`, the logic for merging a freshly-extracted intent into a partially-gathered one across turns.
- **`orchestrator.py`** — The core recommendation engine for the bank flow. Takes an `Intent` + user + cards, deterministically builds a `Candidate` list (expiring points, redemption options, transfer partners, flight candidates) from real DB/catalogue data, then hands that set to the LLM for reranking/reply (or falls back to a templated reply).
- **`dialogue_manager.py`** — The conversational brain (`generate_concierge_response`). Manages multi-turn slot-filling per "journey type" (travel_flight, home_setup, product_purchase, etc.), decides when to ask a clarifying question vs. recommend, handles date/city parsing, merchandise search, card-switch detection, and personalization.
- **`conversation.py`** — `resume_conversation()` reloads a past conversation's messages/state plus a memory-based "resume" prompt, for picking up an old chat.
- **`dining.py`** — Fully self-contained router at `/dining`: a Subway-themed rewards demo with its own hardcoded catalogue, 5-dimension scoring engine, conversational slot-filling, and in-memory sessions. Shares no state with the bank flow.
- **`entertainment.py`** — Same pattern as `dining.py` but for movies/cinema at `/entertainment`. Mixes a hardcoded rewards catalogue with real "now playing" movies from TMDB (hardcoded fallback), scores everything, runs genre/ticket-count slot-filling.
- **`intent.py`** — `extract_intent()` turns a raw user message into a structured `Intent` (kind, category, journey_type, slots, flight origin/destination). Tries the LLM first, falls back to keyword/regex heuristics. Owns the city→IATA airport code map.
- **`schemas.py`** — Pure Pydantic models: all request/response shapes used across the API (`Intent`, `Candidate`, `ChatRequest`/`ChatResponse`, `RedeemRequest`/`RedeemResponse`, CMR models, conversation models). No logic, just data contracts.
- **`travel.py`** — Self-contained router at `/travel`: a form-based flight search → review → book flow for the "Riya" demo persona. Searches real Duffel offers (or deterministic mock data), prices into points, ranks with badges, and can do a demo booking or a real Duffel test-mode order with an emailed invoice.

### backend/services/ — deterministic "Layer 1" business logic

**Core / shared**
- **`db.py`** — Shared asyncpg connection pool for every service. Loads DB creds from `.env`, exposes `fetch`/`fetchrow`/`execute`/`get_pool`.
- **`serialization.py`** — JSON-safety + hashing utilities (`to_jsonable`, `content_hash`, `wrap()`) used by the MCP tool envelope and hash-sync (avoid re-embedding unchanged content).
- **`embeddings_service.py`** — Text→vector embeddings (Gemini default, OpenAI alternative) for semantic search, used by `benefit_chunks_service.py`.
- **`llm_service.py`** — The single LLM integration point (Groq primary, Gemini fallback). Enforces the anti-hallucination rule: the LLM only ever sees pre-validated candidates, never the DB. Provides intent extraction, rerank replies, and combined completeness+reply generation.
- **`__init__.py`** — Docstring only, documenting that `backend/services` is "Layer 1" — all deterministic SQL/business logic; no service here may touch user-specific tables.

**Bank-side "Layer 1" (card/catalogue facts, no user data)**
- **`bank_mcp_client.py`** — SSE client to the mock bank MCP server; falls back to local services if that server is down.
- **`benefits_service.py`** — Reads the `benefits` table per card.
- **`benefit_chunks_service.py`** — pgvector semantic search over benefit text chunks.
- **`cards_service.py`** — Reads the `cards` table (fees, tier, network, expiry rules).
- **`redemption_service.py`** — Aggregates benefits + milestones + fine print + transfer partners into a "redemption rules" view.
- **`tnc_service.py`** — Reads current T&C version per card.
- **`transfer_partners_service.py`** — Reads active airline/hotel transfer partners per card.

**User data / CMR / personalization**
- **`user_service.py`** — User + card reads, and nudges preference weights after a redemption.
- **`cmr_service.py`** — Customer Master Record: addresses, wishlist, dismissed items, plus scoring helpers (`is_physical_goods`, `preference_boost`, `prefill_note`).
- **`personalization_service.py`** — Manages `user_memory`, `preferences` (lifestyle weights), and saved addresses.
- **`profile_signal_service.py`** — Generic behavioural-signal logger (`profile_signals` table).
- **`memory_service.py`** — Combines conversation + personalization to build "resume this chat?" prompts and persist learned preferences.
- **`conversation_service.py`** — Chat persistence: conversations, messages, dialogue state, unfinished/resumable tasks.
- **`recommendation_session_service.py`** — Snapshots each recommendation run for later reference.

**SMS ingestion (the only way real balances enter the system)**
- **`sms_parser.py`** — Regex parser: raw bank SMS → structured earn/redeem/expiry data.
- **`sms_senders.py`** — Allowlist so only real bank sender IDs get parsed (anti-spoofing).
- **`sms_service.py`** — Orchestrates ingest: validates sender, parses, matches card, updates points/ledger transactionally.

**Scoring & catalogues**
- **`scoring_service.py`** — The 5-dimension deterministic scorer (financial/lifestyle/redemption_prob/expiry_risk/flexibility) that ranks every candidate before the LLM sees it.
- **`card_selector.py`** — Picks which held card a redemption should use, only suggesting a switch if another card is meaningfully better.
- **`reward_catalogue_service.py`** — Search over a DB-backed `reward_items` table.
- **`merchandise_catalog.py`** — Hardcoded 18-item bank merchandise store (fixed points prices).
- **`merchandise_service.py`** — Turns catalogue/product searches into priced `Candidate`s; Amazon voucher as fallback.
- **`hotel_service.py`** — Hardcoded hotel partner list priced into points.
- **`flight_service.py`** — Prices real Duffel flight offers into points via card-specific point values.
- **`query_generator.py`** — LLM-driven planner picking the next best clarifying question for exploratory journeys (with hard question caps).
- **`email_service.py`** — Best-effort SMTP confirmation/invoice emails; never blocks a booking.

### backend/services/redemption/ — fulfilment providers

- **`base.py`** — Shared interface: `BookingResult` dataclass + abstract `RedemptionProvider` class.
- **`executor.py`** — Runs the actual redemption: OTP gating, calls `provider.book()`, debits points, writes ledger/history atomically. The file that actually moves real points.
- **`registry.py`** — Maps a candidate to the right provider by category/label regex; exposes `get_provider()` and `fulfillment_options_for()`.
- **`demo_provider.py`** — Always-available offline simulated booking (spends the replayable demo bucket).
- **`duffel_provider.py`** — Real live integration with Duffel's test-mode flight API — the most complex provider (retries, airline diversification, round-trip handling).
- **`tango_provider.py`** — Real sandbox call to the Tango Card API for actual gift cards (Amazon Pay, Google Play).
- **`voucher_provider.py`** — Stub "live" voucher provider (instant fake success, no real API call).
- **`website_hotel_provider.py`** — Per-hotel provider; makes a real HTTP POST if a booking URL env var is configured, else falls back gracefully.
- **`assisted_checkout_provider.py`** — Stub "assisted" provider, instant success.
- **`bank_internal_provider.py`** — Stub for bank-fulfilled redemptions (no OTP).
- **`booking_session_service.py`** — In-memory tracker for OTP-gated bookings in flight (180s TTL).
- **`__init__.py`** — Docstring only.

### backend/ root scripts

- **`.env.example`** — Template for `backend/.env`; documents all optional environment variables (Supabase DB creds, OpenAI/Groq/Gemini LLM keys, Redis, bank MCP URL, mock hotel storefront URLs, Duffel/Tango fulfilment keys, TMDB key, SMTP settings) and notes every integration degrades gracefully when unset.
- **`README.md`** — Backend architecture doc covering the mock HDFC bank MCP server, the deterministic 5-dimension scoring engine, the FastAPI orchestration layer, the SMS parser pipeline (the only path user balance data enters the system), catalogue data source-of-truth, and pgvector embedding ingestion.
- **`apply_migration.py`** — One-off script that loads a specific Prisma migration SQL file and executes it directly against the DB via asyncpg — a manual migration-runner since there's no generic Prisma-migrate wrapper in Python.
- **`check_duffel.py`** — Diagnostic script that checks `DuffelProvider.is_available()` and attempts a test `book()` call, printing availability/errors/confirmation — sanity-checks the Duffel integration outside the full API.
- **`client_test.py`** — End-to-end test client for the bank MCP server: connects over SSE, lists tools (asserts exactly 7), exercises `list_cards`, `get_redemption_rules`, a not-found `get_card_details`, and semantic search.
- **`demo_preflight.py`** — Pre-demo health-check script: hits `/health`, verifies `bank_data_source=mcp`, checks the hotel storefront, exercises a live chat turn, performs a real Duffel flight search + booking, checks Tango/TMDB config, and dining/entertainment health. Prints PASS/FAIL and exits non-zero on failure.
- **`eval_intents.py`** — Eval harness replaying golden test cases from `backend/evals/intent_cases.jsonl` through `llm_extract_intent`, checking exact/substring matches; exits 1 on failure so it can gate LLM/prompt changes. Also has a `--from-log N` mode to generate new case skeletons from logged parses.
- **`ingest_embeddings.py`** — pgvector ingestion pipeline: builds an embeddable text chunk per benefit row, fetches candidates whose content hash changed (or all with `--force`), embeds them, upserts into `benefit_embeddings`.
- **`mcp_server.py`** — The mock HDFC bank MCP server (`FastMCP`, SSE transport, port 8000). Exposes 7 strictly card-level tools that are thin wrappers delegating to `services/*` — no SQL/business logic here, and none can touch user data (CredArt's structural anti-hallucination boundary).
- **`requirements.txt`** — Python dependency list: `mcp`, `asyncpg`, `python-dotenv`, `uvicorn`, `fastapi`, `google-genai`, `openai`, `httpx`, plus `redis`, `groq`, `playwright`.
- **`seed_catalogue.py`** — Loads `backend/catalogue/*.json` into Postgres: upserts cards, replaces benefits/transfer_partners, upserts reward_items. Idempotent; deleting/re-inserting benefits cascades to `benefit_embeddings`, so `ingest_embeddings.py` must re-run afterward.
- **`smoke_test.py`** — Direct service-layer smoke test bypassing MCP transport: calls each card-level service directly, and specifically asserts the anti-hallucination invariant (scans responses for forbidden user-data terms) plus content-hash determinism.

### backend/catalogue/ & backend/evals/ (data)

- **`catalogue/hdfc_catalogue.json`** — The 3 mock HDFC cards (Infinia, Regalia Gold, Millennia), each with bank/tier/network/fee metadata and a nested `benefits` array (category, title, description, points_cost/cash_component, verified flag) covering TRAVEL, DINING, SHOPPING and more.
- **`catalogue/transfer_partners.json`** — Transfer-partner records per card (partner name, type, ratio, minimum points, processing days, reversibility, ₹ value/point, best-use-case, source URL) — e.g. Infinia → Marriott Bonvoy, KrisFlyer, Air India Maharaja Club.
- **`evals/intent_cases.jsonl`** — Golden intent-parsing test cases (`{"message": ..., "expect": {...}}`) covering greetings, purchases, travel, expiry urgency, benefit exploration, transfers, dining/entertainment/cashback/home-setup — consumed by `eval_intents.py`.

### backend/storefront/

- **`__init__.py`** — Empty; marks `storefront` as a package.
- **`app.py`** — Mock hotel storefront FastAPI app (port 8002) standing in for a real hotel partner with no public API. Exposes `/health`, `POST /api/book` (server-to-server booking target for `WebsiteHotelProvider`), and `GET /book/{hotel_id}` (a real HTML booking page for a Playwright fallback).

---

## db/

- **`.env.example`** — Template for `db/.env`: Supabase `DATABASE_URL` (pooled) and `DIRECT_URL` (session mode, needed for migrations/asyncpg prepared statements) plus Supabase keys.
- **`package.json`** — Minimal Node manifest declaring `prisma`/`@prisma/client` as devDependencies so `schema.prisma` can be used with the Prisma CLI/client.
- **`package-lock.json`** — Auto-generated npm lockfile for the Prisma dependencies.
- **`prisma/schema.prisma`** — Full Prisma schema mirroring the live Postgres DB: card catalogue, user/portfolio data, scoring/learning tables, conversational concierge state, CMR, rewards catalogue, pgvector search, SMS audit, scraper auditing. Documentation/typing support — the actual schema is applied via raw-SQL migrations, not `prisma migrate`.
- **`reset_demo.sql`** — Idempotent script restoring both demo personas (Riya, Samyak) to their scripted demo state before every live demo: wipes ledgers/history, resets balances/expiry dates, resets preference weights, re-seeds sample recommendation events.
- **`run_reset.py`** — Runs `reset_demo.sql` in one transaction, then prints each persona's state for visual confirmation; invoked from `run_demo.ps1 -Reset`.
- **`seed_demo_portfolio.sql`** — One-time seed giving both demo users all 3 HDFC cards with distinct balances, and setting Riya travel-leaning vs Samyak dining-leaning preferences.
- **`verify.mjs`** — Verification script checking DB connectivity, extensions, expected tables, seed row counts, specific demo data values, and FK integrity; exits 1 on any failed check.

### db/prisma/migrations/ (Prisma-style incremental SQL)

- **`0001_extensions_and_vector`** — Enables `uuid-ossp` and `vector` Postgres extensions.
- **`0002_core_schema`** — Creates the full initial schema: card tables, user tables, `recommendation_events`, `benefit_embeddings` (vector(1536) + IVFFlat index), `scraper_runs`, indexes/triggers.
- **`0003_rls_policies`** — Enables Row Level Security on user-specific tables (select/update-own via `auth.uid()`); catalogue tables stay public read-only.
- **`0004_seed_hdfc_cards`** — Seeds the 3 HDFC cards, benefits, transfer partners, and initial T&C rows.
- **`0005_seed_mock_users`** — Seeds the two demo personas, their cards/balances/expiry dates, ledger history, preferences, and seed recommendation events.
- **`0006_embedding_dim_768`** — Switches embeddings from vector(1536) to vector(768) (OpenAI → Gemini) and recreates the index.
- **`0007_hnsw_index`** — Replaces IVFFlat with an HNSW cosine index for better recall on the small catalogue.
- **`0008_catalogue_rich_fields`** — Adds richer nullable columns to `cards`/`benefits`/`transfer_partners` (fees, expiry months, exclusions, milestone thresholds, best-use-case).
- **`0009_sms_messages`** — Creates the `sms_messages` audit/idempotency table, since user balances only enter CredArt via parsed SMS.
- **`0010_demo_credits`** — Adds `demo_points` (default 100000) to `user_cards` — a separate spendable bucket so demos never touch real balances.
- **`0011_conversation_concierge`** — Adds the conversational-concierge schema: conversations, messages, states, memory, addresses (later replaced), unfinished tasks, recommendation sessions, `reward_items`, `redemption_orders`, `profile_signals`.
- **`0012_cmr`** — Introduces the Customer Master Record: date of birth, richer taste preferences, `user_addresses`, `cmr_wishlist`, `cmr_dismissed`, plus demo seed data.
- **`0013_family_size_and_cleanup`** — Formally tracks `preferences.family_size`, drops the orphaned legacy `user_saved_addresses` table, repoints the FK to `user_addresses`.

---

## frontend/

### frontend/ config

- **`index.html`** — Vite HTML entry point. Sets page title, loads Google Fonts (Plus Jakarta Sans / Space Grotesk), mounts React into `#root` via `/src/main.jsx`.
- **`package.json`** — Minimal Vite + React 18 manifest (`credart-frontend`). Scripts: `dev`/`build`/`preview`. Deps are just `react`/`react-dom`; no UI framework, router, or state library — hand-rolled inline-style components throughout.
- **`package-lock.json`** — Auto-generated npm lockfile.
- **`vite.config.js`** — Enables the React plugin; dev server port from `process.env.PORT` (default 5173).

### frontend/src/ root

- **`App.jsx`** — Top-level app router/state machine (plain `useState`, no router lib). Switches between `stage`s: `login` → `landing` → `store` → `travel`, plus alternate "worlds" `dining`/`entertainment` (CategoryChat) and `bank` (BankExperience), each re-themed via `THEMES[key]`.
- **`main.jsx`** — Standard React 18 bootstrap: `ReactDOM.createRoot`, renders `<App/>` in `StrictMode`, imports global `styles.css`.
- **`styles.css`** — Global design tokens (`--brand-*` color scale, radius/shadow scale, font stacks) and a large `@keyframes` animation library (message-in, chip-pop, sheet-up, mascot breathing/blinking, shimmer skeleton, screen transitions) used across nearly every component.
- **`theme.jsx`** — Defines `THEMES`, a per-category palette map (bank navy+gold, dining green+yellow, entertainment purple+red, rewards navy+gold) plus `CategoryIcon`, a small inline SVG icon set.

### frontend/src/components/

- **`BankExperience.jsx`** — The original HDFC bank concierge app (card dashboard, Riya/Samyak persona switcher, chat, redemption confirm), wrapped for the themed router. Composes `Dashboard`, `Concierge`, `Confirm`, `ChatHistory`, `mode.jsx`.
- **`CategoryChat.jsx`** — Self-contained themed chat UI shared by Dining and Entertainment, driven by `theme.meta` so one component renders both. Calls `api.diningChat`/`api.entChat` and their redeem endpoints; renders a seeded cinema seat-map for movie bookings.
- **`ChatHistory.jsx`** — Lists past bank concierge conversations with journey-type label, relative time, and "IN PROGRESS" badge; tapping resumes it in `Concierge`.
- **`Concierge.jsx`** — The real bank chat screen (`/chat`, multi-turn via `conversation_id`/`session_id`). Renders candidate cards with fulfillment-path chips, supports CMR wishlist/dismiss, and a conversation-history drawer.
- **`Confirm.jsx`** — Drives real redemption execution: `api.redeem()` → step progress → optional `OtpScreen` → success (with Duffel ticket details if present) or `FailedScreen`. Guards against StrictMode double-invocation.
- **`CredArtBubble.jsx`** — The floating AI concierge bubble on the Rewards Catalogue/landing page. Runs a local deterministic intent engine (`runConcierge` from `lib/catalogue.js`), calls `travelApi` for live in-chat Duffel flight booking (OTP-gated), falls back to real backend `/chat` for open-ended enrichment, persists history to `localStorage` + backend.
- **`Dashboard.jsx`** — Bank app home screen: real HDFC card tiles with expiry-health ring meter, points summary, expiring-points warning, floating Kobie mascot bubble.
- **`Kobie.jsx`** — Pure presentational mascot components (`RobotFace`, `Kobie`, `KobieAvatar`) — shared visual identity used across several components, no backend calls.
- **`RewardsCatalogue.jsx`** — The main hardcoded points-store experience: navbar, hero, category grid, product grid with search/sort. Self-contained (no backend item fetches); persists to `localStorage`. Manages persona switching, cart, item detail modal, mounts `RewardsCheckout` and `CredArtBubble`.
- **`RewardsCheckout.jsx`** — Full-screen cart checkout overlay: optional CMR-autofilled address step (merchandise only) → progress steps → demo OTP → per-item confirmation references → success. Debits points only after OTP verifies.
- **`RewardsLanding.jsx`** — Post-login landing page: hero, category showcase cards (live counts from `CATALOGUE`), "About CredArt" band, links into other worlds. Hosts its own `CredArtBubble`.
- **`RewardsLogin.jsx`** — Cosmetic sign-in screen (photo hero, frosted card); any submit calls `onLogin()` with no validation or backend call.
- **`mode.jsx`** — Shared UI primitives for execution mode/trust cues: `CR_FULFILL`, `FulfillmentChip`, `ModeBadge` (Demo vs Production), `ProtectedBadge`, `BankBadge`, `TrustFooter`.

### frontend/src/components/travel/

- **`FlightOtpStep.jsx`** — Shared full-screen OTP overlay for any live Duffel booking (used by both `TravelPage` and `CredArtBubble`), so chat-booked and Travel-page-booked flights are gated identically.
- **`TravelAIPanel.jsx`** — Floating AI concierge scoped to the Travel page's search context. Uses a deterministic `localAnswer()` (narrates figures already on the offer object, never invents) — a seam that could later become a real LLM call.
- **`TravelConfirmation.jsx`** — Displays the outcome of a real Duffel booking: PNR, route, points deducted, cash due, balance after; or the rollback reason on failure.
- **`TravelOfferDetails.jsx`** — Flight offer "review" screen: itinerary legs, fare rules, points breakdown, payment-mode selector (all-points vs points+card).
- **`TravelPage.jsx`** — The Travel Rewards flow's top-level container: search → results → details → confirmation, scoped to the backend's hardcoded Riya identity. Adds a demo-local "extras" system (hotels/cars/packages) persisted to `localStorage` that still spends real points.
- **`TravelResults.jsx`** — Flight search results list: filter/sort toolbar, result cards with route/duration/badges/points-vs-cash, loading skeletons, empty/error states.
- **`TravelSearchForm.jsx`** — Travel landing tab bar (Flights/Hotels/Cars/Packages) + flights search form (airport autocomplete, dates, travelers, cabin class). Non-flight tabs show real catalogue rewards filtered by keyword, budget-gated "Reserve" action.

### frontend/src/lib/

- **`api.js`** — Main backend HTTP client. Exports the two demo `USERS` (Riya/Samyak) and the active-persona getter/setter; exposes `health`, `cards`, `cmr`, `chat`, `conversations`, `saveConciergeHistory`, `redemptionEmail`, `redeem`, `wishlist`/`dismiss`, `bookingSession`/`submitOtp`, plus `dining*`/`ent*` endpoints.
- **`catalogue.js`** — The largest lib file: the hardcoded rewards catalogue plus a full local conversational intent engine. Contains image-resolution helpers, `CATALOGUE` (200+ items), `CAT_PERSONAS` (seeded CMR profiles), a voucher wallet system, dynamic preference-learning ("lean weights"), fuzzy search, date parsing, and `runConcierge()` — the deterministic dialogue engine driving `CredArtBubble` (cart checkout, multi-turn flight booking, multi-turn food ordering, cross-intent switching).
- **`travelApi.js`** — Separate backend client scoped to `/travel/*` (kept separate since Travel always talks to the hardcoded Riya identity). Exposes `airports`, `searchFlights`, `offerDetail`, `redemptionPreview`, `demoConfirm`, `confirm` (live real-PNR booking), `orders`, `health`.
- **`travelPoints.js`** — Pure display-formatting helpers for Travel: `fmtPts`, `fmtInr`, `fmtDuration`, `fmtClock`, `fmtDate`, `stopsLabel`, `BADGE_STYLE`, and `explainOffer()` (deterministic points-vs-cash explanation from fields already on the offer object).

---

## memory/

- **`MEMORY.md`** — The application's own persistent memory index, pointing to `merchandise-best-voucher-card-intended.md`.
- **`merchandise-best-voucher-card-intended.md`** — A memory note documenting that merchandise redemptions intentionally price against whichever card gives the best ₹/point voucher conversion (Infinia > Regalia > Millennia) rather than the UI-selected card — deliberate value-maximizing behaviour, not a bug. Also notes the real bug found during that investigation (stale `product_category` slot leaking across conversations) was legitimately fixed via `_TRANSIENT_SLOTS` in `dialogue_manager.py`.
