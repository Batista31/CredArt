CredArt — Executor & Project Context (through Phase 9)
What CredArt is
White-label AI rewards concierge for banks. Mocked for HDFC for the Kobie AI Hackathon. One deployment per bank. The bank fully trusts CredArt → CredArt reads/writes user reward data via bank DB/API. Core differentiator = a structural anti-hallucination boundary: the LLM only ever sees a pre-validated candidate set built by deterministic Layer-1 code — it never touches the database.

The two servers (do not confuse them)
Mock Bank MCP server — backend/mcp_server.py, SSE on :8000. Simulates how a real bank could expose trusted card-level data (catalogue, benefits, transfer partners, redemption rules, T&C/fine print, semantic benefit search). Card-level only — never user data. Real banks don't expose public MCP rewards servers; this is the mock truth source.
CredArt backend — backend/api/, FastAPI on :8001. The product. Consumes the mock Bank MCP as a client, adds user context, scores, LLM-reranks, executes redemptions.
Request flow
POST /chat → api/intent.py (Groq llama-3.3-70b-versatile, Gemini fallback) extracts intent.
api/orchestrator.py builds candidates: card facts via services/bank_mcp_client.py (MCP primary, in-process fallback) + user balances via services/user_service.py (direct DB).
services/scoring_service.py ranks with a deterministic 5-dim score.
LLM reranks/explains — sees ONLY candidates, never the DB.
POST /redeem executes via a provider adapter → writes redemption_history + points_ledger, stamps recommendation_events.user_action.
Completed phases (1–9)
Phase 1 — DB schema. Supabase/Postgres, Prisma migrations, pgvector, 12 tables (users, user_cards, cards, benefits, transfer_partners, tnc_versions, points_ledger, redemption_history, recommendation_events, preferences, benefit_embeddings, sms_messages). Migrations 0001–0010 in db/prisma/migrations/.

Phase 2 — Mock Bank MCP server. backend/mcp_server.py (FastMCP, SSE :8000). 7 card-level tools: list_cards, get_card_details, get_card_benefits, get_transfer_partners, get_redemption_rules, get_tnc_updates, get_benefit_chunks. Thin wrappers over services/*_service.py; standard envelope {scope, content_hash, data}. Never reads user tables.

Phase 3 — Embeddings + semantic search. Gemini gemini-embedding-001 (768-dim), HNSW cosine index. services/embeddings_service.py + ingest_embeddings.py (hash-sync idempotent). Powers get_benefit_chunks.

Phase 4 — SMS parser (now OPTIONAL). services/sms_parser.py (ReDoS-safe) + services/sms_service.py (idempotent via SHA256, DLT sender allowlist sms_senders.py). Was the user-data ingress; demoted — bank DB is now primary. Not an MCP tool.

Phase 5 — FastAPI orchestrator. backend/api/ (main.py, schemas.py, session.py, intent.py, orchestrator.py), :8001. Endpoints /health, /chat, /sms, /cards/{user_id}. Sessions in-memory→Redis auto-upgrade.

Phase 6 — Deterministic 5-dim scoring. services/scoring_service.py. Dimensions financial 0.35 / lifestyle 0.25 / redemption_prob 0.20 / expiry_risk 0.10 / flexibility 0.10. No invented ₹. Logs top candidates to recommendation_events.

Phase 7 — Groq LLM intent + rerank. services/llm_service.py — Groq llama-3.3-70b-versatile primary, Gemini gemini-2.0-flash fallback. intent.py async (LLM-first, keyword fallback); orchestrator uses LLM reply (template fallback); claude_used reflects real LLM use. LLM sees only candidates.

Phase 8 — Backend → mock Bank MCP over SSE. services/bank_mcp_client.py — persistent SSE client (AsyncExitStack + ClientSession), singleton in FastAPI lifespan. Helpers get_benefit_chunks/get_redemption_rules/get_transfer_partners/get_tnc_updates/get_caveat = MCP-primary, in-process fallback. BANK_MCP_URL env. Candidate.caveat surfaces bank T&C (blackout/excluded). /health shows bank_data_source: mcp|in-process. Verified: kill :8000 → falls back, chat still serves.

Phase 9 — One-click redemption executor. Migration 0010 → user_cards.demo_points INT DEFAULT 100000 (separate bucket; demo never touches real points; replayable). services/redemption/:

base.py — RedemptionProvider ABC + BookingResult.
demo_provider.py — always available, mimics booking, spends demo_points, CRD-DEMO-* ref.
duffel_provider.py — live test-mode flight booking when DUFFEL_API_KEY set (currently hardcoded LHR→JFK, +30d).
website_hotel_provider.py — Hotel Indraprastha + Country Inn; real POST to PROVIDER_<ID>_BOOK_URL when set, else unavailable.
registry.py — TRAVEL candidates get live providers + always demo.
executor.py — transactional: pending → provider.book() → atomic debit + ledger (live only) + history completed; failure → rollback_reason; stamps recommendation_events.user_action='confirmed'.
schemas.py — FulfillmentOption, RedeemRequest/Response, Candidate.candidate_id/fulfillment_options.
api/main.py POST /redeem; /chat stashes session["last_candidates"]. session.py public save().
db/reset_demo.sql tops demo_points=100000. backend/redeem_demo.py e2e test.
Verified: demo deduct of 40k Manali stay → demo_points 100k→60k, real points untouched, redeem ledger rows=0 for demo, unavailable live provider→400.
What's redeemable today
Catalogue = 8 paid + 3 perk benefits across TRAVEL/DINING/ENTERTAINMENT/SHOPPING/WELLNESS. All redeemable via Demo (deducts demo_points). Live providers only attached to TRAVEL and only when creds set. Flights aren't first-class candidates yet (ride along on TRAVEL via Duffel). Transfers (points→miles) exist as candidates but not yet wired to /redeem.

Hardcoded assumptions to revisit
Duffel route/date (LHR→JFK +30d); Traveler defaults to Riya; registry TRAVEL→hotels+Duffel is static; value_inr stored as 0; fulfillment_options only on redemption/perk; redeem does not re-fetch T&C at execution time.

Next steps — planned (Phase 9-extended, before UI/production)
Turn the single-shape executor into a 4-path provider architecture with a Redis-hot + Postgres-durable booking-session model and OTP handling.

4 execution paths:

API — partners with dev/sandbox APIs (Duffel flights test; voucher sandbox).
Assisted Checkout — merchants without APIs. CredArt drives a real headless browser checkout (Playwright), pauses for OTP, confirms — feels autonomous. Demo targets Duffel (real test) + a CredArt mock storefront (real OTP flow). Requires explicit consent. Never stores card/CVV/OTP.
Bank Internal — bank-owned actions (lounge activation, points transfer, statement credit, perk activation). Writes bank DB directly.
Demo — always available; spends demo_points; replayable.
Booking sessions + OTP: Redis-hot working set (TTL = OTP deadline) write-through to a new Postgres booking_sessions table (durable, no secrets). Lifecycle created → validating → otp_required → otp_submitted → confirming → completed/failed/expired. OTP transient only — matched to a session, consumed in-request, never stored. Manual OTP via POST /booking-sessions/{id}/otp; optional SMS OTP only with per-session permission. Multi-booking OTP matched by merchant/amount/card_last4/recency/session.

New endpoints: GET /booking-sessions/{id} (poll), POST /booking-sessions/{id}/otp (submit), optional /cancel. /redeem branches: terminal providers return as today; assisted returns {status:"otp_required", booking_session_id}. Points debited only at finalize (shared finalize_redemption() reused by sync + async paths).

New DB: migration 0011_booking_sessions (id, user_id, candidate_id, provider_id, path, merchant, amount, currency, card_last4, status, otp_required, otp_permission_granted, otp_deadline, confirmation_reference, error_message, redemption_transaction_id, timestamps; RLS select-own). Explicitly no OTP/CVV/PAN columns. Add demo_points + BookingSession to schema.prisma.

New deps: playwright (+ playwright install chromium).

Security rules (non-negotiable)
Explicit consent before any assisted/live external action.
Prefer bank-tokenized payment; demo uses test details with consent.
Never persist or log PAN / CVV / OTP. Store card_last4 only.
Never bypass OTP; never auto-submit without a real one.
Anti-hallucination boundary unchanged; re-check bank rules server-side at redeem time.
Build order (hackathon-safe)
DemoProvider stable (new interface, keep redeem_demo.py green)
Mock Bank MCP wiring (list_cards + recheck_rules helpers)
Booking-session model (migration 0011 + service + GET)
BankInternalProvider (lounge / points-transfer / statement-credit / perk — pure DB, highest value)
VoucherProvider (mock/sandbox)
AssistedCheckoutProvider + manual OTP (Playwright + mock storefront + consent)
Optional SMS OTP helper (per-session, permissioned)
Duffel/Hotel live-test (real route/date, flights as first-class candidates) if time
Run it
cd backend
.venv\Scripts\python -m mcp_server                         # mock Bank MCP :8000
.venv\Scripts\python -m uvicorn api.main:app --port 8001   # CredArt backend :8001
.venv\Scripts\python redeem_demo.py                        # phase-9 e2e (servers up)
Reset demo data:

.venv\Scripts\python -c "import asyncio;from pathlib import Path;from services import db;asyncio.run(db.execute(Path('../db/reset_demo.sql').read_text(encoding='utf-8')))"
Env (backend/.env, gitignored)
Required: GROQ_API_KEY, GEMINI_API_KEY, DIRECT_URL, REDIS_URL. Optional/live: DUFFEL_API_KEY, VOUCHER_API_URL, PROVIDER_HOTEL_*_BOOK_URL, BANK_MCP_URL.

Test user
Riya Sharma — user_id 00000000-0000-0000-0000-000000000002. Regalia Gold (46,500 pts, 8k expiring soon, demo_points 100k), Millennia (3,200 pts expiring today), Infinia.

Conventions
Team pushes git themselves (no AI commits). Verify on disk; don't trust phase labels. Keep the anti-hallucination boundary intact. Latest pushed commit: f6ca007 (Phases 7–9).