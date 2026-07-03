# CredArt Backend — Bank MCP Server (Phase 2)

Mock HDFC bank MCP server. **Card-level data only** — no user balances or
history ever pass through here. That table-access boundary is CredArt's
structural anti-hallucination guarantee.

## Layout

```
backend/
├── mcp_server.py            # SSE server, port 8000 — 6 thin tool wrappers
├── services/                # Layer 1 — all SQL + logic lives here
│   ├── db.py                # asyncpg pool (uses DIRECT_URL)
│   ├── serialization.py     # JSON-safe + content_hash (hash-sync)
│   ├── cards_service.py
│   ├── benefits_service.py
│   ├── transfer_partners_service.py
│   ├── redemption_service.py   # composed: benefits + transfer_partners
│   └── tnc_service.py
├── smoke_test.py            # exercises every service against live DB
├── client_test.py          # end-to-end MCP client over SSE
└── requirements.txt
```

## The 7 tools (all card-level — no user tables)

| Tool | Source | Kind |
|------|--------|------|
| `list_cards` | `cards` | deterministic |
| `get_card_details` | `cards` | deterministic |
| `get_card_benefits` | `benefits` | deterministic |
| `get_transfer_partners` | `transfer_partners` | deterministic |
| `get_redemption_rules` | `benefits` (earn/fee/caveat) + `transfer_partners` | deterministic |
| `get_tnc_updates` | `tnc_versions` | deterministic |
| `get_benefit_chunks` | `benefit_embeddings` (pgvector cosine) | semantic (Phase 3) |

Tools 1-6 are pure SQL. `get_benefit_chunks` embeds the query and runs cosine
search — the only tool that calls an embedding provider.

## Phase 6 — Scoring engine (Layer 1)

`services/scoring_service.py` ranks the candidate set with a deterministic
5-dimension score (0–100 each), combined by fixed weights:

| Dimension | Weight | Source |
|-----------|--------|--------|
| financial | 0.35 | best ₹/pt across the card's transfer partners (real) |
| lifestyle | 0.25 | user preference weight for the category, blended with search similarity |
| redemption_prob | 0.20 | confirm rate from `recommendation_events`; cold-start prior from prefs |
| expiry_risk | 0.10 | days-to-expiry of the card's expiring points |
| flexibility | 0.10 | optionality by kind (transfer > perk > redemption) |

`score_candidates()` attaches all six scores + `rank` and sorts. Every value
is derived from real data — no invented ₹ figures; the score is an internal
ranking signal, not shown to the user as a value. The `/chat` handler logs the
top candidates to `recommendation_events` (the preference-learning signal;
`user_action` filled later when the user acts). Phase 7 (the LLM) reranks/
explains these — it never recomputes the score and never sees the DB.

## Phase 5 — FastAPI orchestration backend

The orchestration layer (port 8001) that turns a chat message into a
**pre-validated candidate set** + reply. It wires Layer 1 (deterministic
services + SMS-sourced user data) and leaves a clean seam for the LLM (Phase 7),
which will receive ONLY this candidate set — never the DB.

`api/` package:
- `main.py` — FastAPI app + routes (port 8001)
- `schemas.py` — Pydantic models (Intent, Candidate, ToolCall, ChatResponse)
- `session.py` — conversation store: in-memory, auto-upgrades to Redis if
  `REDIS_URL` is set
- `intent.py` — deterministic NLU → `Intent` (Phase 7 can swap in the LLM)
- `orchestrator.py` — intent → Layer 1 candidate assembly + `tool_trace`
  (affordability + expiry flags computed deterministically; no invented values)

Endpoints:
- `GET  /health` — liveness + embedding provider + session backend
- `POST /chat` — `{user_id, message, session_id?}` → intent, candidates, reply, tool_trace
- `POST /sms` — ingest a bank SMS (wires the Phase 4 parser)
- `GET  /cards/{user_id}` — portfolio for the frontend

```powershell
# MCP server (port 8000) and this backend (8001) are separate processes.
.venv\Scripts\python -m uvicorn api.main:app --port 8001 --reload
```

Note: the orchestrator calls the same Layer 1 services the MCP server wraps
(in-process), so the backend runs standalone. The MCP server remains the
external card-level interface. `llm_used` in the response is `false` until
Phase 7 wires LLM reranking.

## Phase 4 — SMS parser (user data)

User balance/expiry enters CredArt **only** by parsing the bank's SMS — the
bank MCP server is card-level and never exposes user data. This path writes to
the user tables (`user_cards`, `points_ledger`, `redemption_history`,
`sms_messages`) and is intentionally **not** an MCP tool.

- `services/sms_parser.py` — pure, ReDoS-safe parser → `ParsedSMS`
  (type, last4, points_delta, balance_after, expiry). Types: `earn`,
  `redeem`, `expiry_alert`, `unknown`.
- `services/sms_senders.py` — **sender allowlist** (security). We may only parse
  SMS from the bank's official DLT-registered headers (`HDFCBK`, incl. operator
  prefixes like `VM-HDFCBK`). Another bank, a shortcode, or a personal number
  spoofing the bank is **rejected before parsing** — it can never inject a fake
  balance. Enforced server-side in addition to the app only reading the bank's
  sender (defense in depth).
- `services/sms_service.py` — `ingest_sms(user_id, raw_text, sender, ...)` applies it:
  - **sender-allowlisted** (rejected senders recorded as `sms_type='rejected'`, never applied),
  - **idempotent** (every SMS hashed into `sms_messages`; duplicates skipped),
  - **validated** (delta ≤ ±200k, balance ≥ 0, expiry near-future),
  - **scoped** (card matched by last4 within that user's cards only),
  - redemption confirmations flip a matching `pending` → `completed`.
- Migration 0009 adds `sms_messages` (audit + idempotency, RLS select-own).

To onboard another bank, add its DLT headers to `ALLOWED_HEADERS` in
`sms_senders.py`.

```powershell
.venv\Scripts\python test_sms_parser.py    # pure parser unit tests
.venv\Scripts\python sms_demo.py           # end-to-end demo (run reset_demo.sql first)
```

## Catalogue data (source of truth)

The card-level catalogue lives in `backend/catalogue/`:
- `hdfc_catalogue.json` — 3 cards, each with benefits (redeemable rewards +
  perks), `milestone_benefits`, and `fine_print` (expiry / excluded categories
  / blackout dates).
- `transfer_partners.json` — transfer partners with ratios, value/point, and
  `best_use_case`.

`seed_catalogue.py` loads this JSON into Postgres (cards / benefits /
transfer_partners). Idempotent: cards are upserted; benefits + partners for
these cards are replaced. Deleting benefits cascades to `benefit_embeddings`,
so always re-embed afterwards:

```powershell
.venv\Scripts\python seed_catalogue.py            # load catalogue from JSON
.venv\Scripts\python ingest_embeddings.py          # re-embed benefits
```

Rich fields are stored via migration 0008 (`joining_fee_inr`,
`points_expiry_months`, `excluded_categories[]`, `blackout_dates[]` on cards;
`points_cost`, `cash_component_inr`, `milestone_threshold_inr` on benefits;
`best_use_case` on transfer_partners). Benefit types are now `redemption`
(has `points_cost`), `perk`, and `milestone`.

## Phase 3 — pgvector ingestion

`ingest_embeddings.py` embeds the card-level benefit rows into
`benefit_embeddings` and flips `benefits.is_embedded = true`.

- **Provider** (`EMBEDDING_PROVIDER`, default `gemini`):
  - `gemini` → `gemini-embedding-001`, 768-dim (free tier; needs `GEMINI_API_KEY`
    or `GOOGLE_API_KEY` in `backend/.env`)
  - `openai` → `text-embedding-3-small`, 1536-dim (needs billing)
  - The `benefit_embeddings.embedding` column dimension must match the provider
    (currently `vector(768)` — migration 0006). Switching providers means a
    column change + `--force` re-embed.
- **Index**: HNSW cosine (migration 0007). IVFFlat is wrong for a small
  catalogue (empty-list misses).
- **Hash-sync**: each row stores the benefit's `content_hash`; a normal run
  re-embeds only changed benefits. `--force` re-embeds everything.

```powershell
.venv\Scripts\python ingest_embeddings.py            # incremental
.venv\Scripts\python ingest_embeddings.py --force     # re-embed all
```

## Env

DB credentials come from `db/.env` (`DIRECT_URL` / `DATABASE_URL`); the server
also reads `backend/.env` (Supabase keys). `backend/.env` is gitignored — never
commit it. The server uses `DIRECT_URL` (session mode, port 5432) so asyncpg's
prepared statements work; the pgbouncer pooler is avoided.

## Run

```powershell
cd backend
.venv\Scripts\python -m pip install -r requirements.txt   # first time
.venv\Scripts\python -m mcp_server                         # serves http://0.0.0.0:8000/sse
```

## Test

```powershell
.venv\Scripts\python smoke_test.py     # service layer, direct DB
# with the server running in another terminal:
.venv\Scripts\python client_test.py    # MCP handshake + tool calls over SSE
```

Every tool response is wrapped as
`{ scope: "card_level", card_id?, content_hash, data }`. The `content_hash`
feeds the hash-sync mechanism: pgvector re-embeds only when the hash changes.
