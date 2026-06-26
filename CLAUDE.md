# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

CredArt is a white-label AI rewards concierge for banks (currently mocked for HDFC). The core design principle is **anti-hallucination by architecture**: the LLM only ever sees a pre-validated, deterministically-scored candidate set built by Layer 1 code—it never touches the database directly.

## Running the System

Both servers must run simultaneously. The backend (port 8001) consumes the MCP server (port 8000) as a client.

```powershell
# Terminal 1 — Mock Bank MCP server
cd backend
.venv\Scripts\python -m mcp_server

# Terminal 2 — CredArt FastAPI backend
cd backend
.venv\Scripts\python -m uvicorn api.main:app --port 8001 --reload
```

## Testing

```powershell
cd backend
.venv\Scripts\python smoke_test.py        # Layer 1 services (direct DB, no servers needed)
.venv\Scripts\python client_test.py       # MCP handshake + tool calls (requires MCP server)
.venv\Scripts\python redeem_demo.py       # Full E2E: chat → /redeem (requires both servers)
.venv\Scripts\python test_sms_parser.py   # SMS parser unit tests (standalone)
.venv\Scripts\python sms_demo.py          # SMS ingestion demo
```

### Manual recommendation / conversation testers

```powershell
cd backend
# One-shot: force-complete the intent and print the ranked candidates (no
# follow-up questions, no chat-LLM dependency — pure ranking inspection).
.venv\Scripts\python manual_test.py riya   "what can I do with my points"
.venv\Scripts\python manual_test.py samyak "what can I do with my points"

# Interactive: real /chat with multi-turn follow-up questions (needs both
# servers + the chat LLM up). 'riya' or 'samyak'; type 'new' to reset, 'quit' to exit.
.venv\Scripts\python manual_chat.py riya
```

`manual_test.py` bypasses the conversation to isolate recommendation quality;
`manual_chat.py` exercises the full intent → follow-up → recommendation flow.
Demo headline: run the same open-ended query for both users and watch the lists
diverge (Riya leans travel, Samyak leans dining) purely from preference weights.

## Catalog & Embeddings

```powershell
cd backend
.venv\Scripts\python seed_catalogue.py             # Load hdfc_catalogue.json into DB (idempotent)
.venv\Scripts\python ingest_embeddings.py          # Sync benefit embeddings (Gemini 768-dim)
.venv\Scripts\python ingest_embeddings.py --force  # Re-embed all regardless of content_hash
```

## Reset Demo Data

Two SQL seeds, both idempotent. `seed_demo_portfolio.sql` establishes the
two-user demo state (cards, preference weights, redemption counters);
`reset_demo.sql` resets Riya's mutable ledger + expiry choreography before a run.

```powershell
cd backend
# Establish/restore the full two-user portfolio (run after any live redemptions)
.venv\Scripts\python -c "import asyncio; from pathlib import Path; from services import db; asyncio.run(db.execute(Path('../db/seed_demo_portfolio.sql').read_text(encoding='utf-8')))"
# Reset Riya's ledger, demo_points, and expiry hooks
.venv\Scripts\python -c "import asyncio; from pathlib import Path; from services import db; asyncio.run(db.execute(Path('../db/reset_demo.sql').read_text(encoding='utf-8')))"
```

### Demo users

Both users hold all 3 HDFC cards, so the **only** driver of different
recommendations is their preference profile — the core personalization demo.

| User | `user_id` | Profile |
|---|---|---|
| **Riya Sharma** | `…0002` | travel-leaning (travel_weight 0.50); Regalia primary, expiry hooks |
| **Samyak Rao** | `…0001` | dining-leaning (dining_weight 0.50) |

Confirmed redemptions drift these weights (see Dynamic Lifestyle Weighting);
re-run `seed_demo_portfolio.sql` to wash that back to baseline.

## Environment Variables

`backend/.env` and `db/.env` — required:

| Variable | Purpose |
|---|---|
| `DIRECT_URL` | Supabase Postgres session mode (port 5432, asyncpg-friendly — use this, not DATABASE_URL) |
| `DATABASE_URL` | Supabase pooler (Prisma migrations only) |
| `GROQ_API_KEY` | llama-3.3-70b-versatile (primary LLM) |
| `GEMINI_API_KEY` | Embeddings (768-dim) + Gemini flash fallback |

Optional:

| Variable | Purpose |
|---|---|
| `REDIS_URL` | Session persistence (auto-upgrades from in-memory when set) |
| `BANK_MCP_URL` | Override MCP endpoint (default: `http://127.0.0.1:8000/sse`) |
| `DUFFEL_API_KEY` | Live Duffel flight booking (test-mode sandbox) |
| `TANGO_API_KEY` | Voucher provider for shopping/dining/entertainment |
| `PROVIDER_HOTEL_*_BOOK_URL` | Hotel partner booking endpoints |

## Architecture

### Two-Server Split

**Mock Bank MCP** (`backend/mcp_server.py`, port 8000)
- Strict card-level boundary: card metadata, benefits, transfer partners, T&C, embeddings
- 7 tools wrapped in standard envelope `{scope, content_hash, data}`
- **Never exposes user tables** (user_cards, points_ledger, preferences)

**CredArt Backend** (`backend/api/`, port 8001)
- FastAPI with 4 routes: `POST /chat`, `POST /redeem`, `POST /sms`, `GET /health`
- Consumes the MCP via `services/bank_mcp_client.py` (SSE persistent client with in-process fallback)
- Accesses user data directly from DB (`services/user_service.py`)

### Chat Request Flow

```
POST /chat
  → api/intent.py: LLM intent extraction (Groq primary, Gemini fallback, keyword heuristics last)
      • Merge with session["partial_intent"] from earlier turns (session.merge_partial_intent):
        `query` ACCUMULATES across turns; `kind`/fields prefer the newest non-null value
      • llm_service.llm_check_completeness(): is this intent complete, or ask ONE more question?
        Sets Intent.is_complete + Intent.follow_up_question. Fails OPEN (treats as complete).
  → if NOT complete: skip candidate assembly, return follow_up_question as the reply,
        persist session["partial_intent"]. (Self-contained kinds — greeting/check_expiry/
        transfer — are always complete.)
  → api/orchestrator.py: assemble candidates (only once intent is complete)
      • User cards + points from user_service (direct DB)
      • Card benefits from bank_mcp_client (MCP or in-process fallback)
      • Semantic search over the ACCUMULATED query: benefit_embeddings pgvector cosine (768-dim HNSW)
      • Preference seeding: for a generic ask (no explicit category), also pull the user's
        dominant preference categories into the pool (within 15% of top weight, cap 2) — so
        preferences shape the POOL, not just the ranking
      • Transfers injected only for transfer / general / travel intents (not dining/shopping/etc.)
      • Flight candidates via Duffel when destination present
      • Expiry urgency candidates for cards expiring ≤30 days
  → services/scoring_service.py: 5-dimension deterministic rank
      • financial (0.35): ₹/pt from transfer_partners.effective_value_inr
      • lifestyle (0.25): preference weights × semantic similarity, ±25 for the request's category
      • redemption_prob (0.20): confirm rate from recommendation_events (cold-start prior)
      • expiry_risk (0.10): days-to-expiry urgency
      • flexibility (0.10): kind (transfer > perk > redemption)
      • then collapse same-named rewards (held on >1 card) to their single best-scored instance
  → services/redemption/registry.py: attach fulfillment providers per candidate
  → services/llm_service.llm_rerank_reply(): LLM sees ONLY the candidate list, never DB
  → Log recommendation_events (training signal for future scoring)
  → Return ChatResponse with candidates + reply
```

### Conversational Intent (multi-turn)

The bot gathers intent across turns before recommending. `llm_check_completeness`
decides whether enough is known (e.g. flights want destination → date → passengers
→ cabin; dining wants date → party size → occasion → cuisine) or asks ONE natural
follow-up. Partial intent lives in `session["partial_intent"]`; `query` is
accumulated so the eventual semantic search sees the full context, not the last
one-word answer. If the chat LLM is unreachable, completeness fails open and the
bot proceeds straight to recommendations (graceful degradation, not a bug).

### Redemption Flow

```
POST /redeem
  → Validate candidate from session["last_candidates"] (never trust client)
  → services/redemption/executor.py:
      • Server-side affordability re-check
      • Dispatch to provider: DemoProvider | DuffelProvider | TangoProvider | WebsiteHotelProvider
      • Atomic transaction: debit points → write points_ledger → mark completed
      • On failure: rollback, mark failed with rollback_reason
  → Update recommendation_events.user_action = 'confirmed' (feedback loop)
  → Dynamic lifestyle weight update (feeds into next scoring turn)
```

### Dynamic Lifestyle Weighting

`user_service.update_preferences_after_redemption` runs after every **confirmed**
redemption (only on `/redeem`, not on browsing). The redeemed category's
preference weight gains +0.05 (capped at 1.0); all others decay −0.0125 (floored
at 0.0); `total_redemptions` increments. So a user who keeps booking travel drifts
toward travel, which in turn reshapes their future preference-seeded
recommendations. The drift is a real, persisted DB write — `seed_demo_portfolio.sql`
resets weights AND counters to baseline.

### Anti-Hallucination Boundary

This is the core design invariant—**do not break it**:
1. LLM receives only the pre-scored `Candidate` list from `api/schemas.py`, never raw DB data
2. All ₹ values and point figures come from real DB rows (`effective_value_inr`, `points_cost`)
3. `mcp_server.py` exposes card-level tools only—user tables are never reachable via MCP
4. Redemption executor re-validates affordability server-side regardless of what the client sends
5. LLM failures degrade gracefully to deterministic keyword heuristics + templated replies

### Key Files

| File | Role |
|---|---|
| `api/orchestrator.py` | Heart of Layer 1: completeness short-circuit, candidate assembly, preference seeding, same-name dedup, scoring integration |
| `api/intent.py` | Intent extraction + partial-intent merge + completeness check; city-to-IATA, keyword fallback |
| `api/session.py` | SessionStore (in-memory/Redis, 1h TTL, 40-turn cap) + `merge_partial_intent` (query accumulation) |
| `api/schemas.py` | All Pydantic models; `Intent.is_complete` / `Intent.follow_up_question` drive the multi-turn flow |
| `services/scoring_service.py` | 5-dim deterministic ranking, current-request category boost, `log_recommendation_events` |
| `services/llm_service.py` | Groq/Gemini wrappers; system prompts for intent, completeness check, and rerank/reply |
| `services/user_service.py` | User/card/preference reads + `update_preferences_after_redemption` (dynamic weighting) |
| `services/bank_mcp_client.py` | Persistent SSE MCP client with in-process fallback for every helper |
| `services/redemption/executor.py` | Booking transaction: afford check → provider.book() → atomic debit |
| `services/redemption/registry.py` | Provider dispatch table (demo always available; travel/shopping/dining get live) |
| `mcp_server.py` | FastMCP (port 8000): 7 card-level tools |
| `db/prisma/schema.prisma` | Prisma schema (12 tables, migrations 0001–0010) |
| `backend/catalogue/hdfc_catalogue.json` | Source of truth: 3 cards, 48 benefits across all categories (seed via `seed_catalogue.py`) |
| `backend/catalogue/transfer_partners.json` | 10 transfer partners (airline/hotel) keyed by card |
| `db/seed_demo_portfolio.sql` | Idempotent two-user demo state: all cards, preference weights, counters |
| `backend/manual_test.py` / `manual_chat.py` | Manual recommendation / conversation testers |

### Database Notes

- Use `DIRECT_URL` (port 5432, session mode) for asyncpg — never the pgbouncer pooler URL
- pgvector HNSW index on `benefit_embeddings` for cosine similarity (768-dim Gemini)
- `content_hash` on `BenefitEmbedding` enables idempotent embedding sync
- `RecommendationEvent` is the learning signal: scored candidates → confirmed/dismissed actions → feeds `redemption_prob` dimension on next request
- `demo_points` column on `UserCard` allows safe E2E testing without touching live `current_points`
