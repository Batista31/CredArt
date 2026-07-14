# CredArt — AI Rewards Concierge (Kobie AI Hackathon 2026, Track A)

CredArt turns a chat message into a **pre-validated set of redemption candidates** and a
helpful reply. Every number shown is real — computed by deterministic "Layer 1" code from
the catalogue + the user's own data — never invented by the LLM. It is a **white-label
model**: one bank per deployment (current deployment = HDFC); bank DBs are never mixed.

## The core guarantee (do not break this)

Two-layer anti-hallucination boundary:
- **Layer 1 (deterministic)**: SQL services, scoring, pricing, affordability/expiry flags.
  All ₹/points math happens here.
- **Layer 2 (LLM)**: receives ONLY the pre-scored candidate JSON — never the DB, balances,
  or CMR. LLM stack: 3 Groq keys → Gemini fallback → deterministic templates, hard 20s
  timeouts. The flow never blocks on an LLM.

Bank data flows over the **card-level MCP server** (port 8000) — its 7 tools physically
cannot query user tables. User data enters via direct DB reads (`services/user_service.py`);
the SMS parser (`services/sms_*.py`, DLT sender allowlist) is an optional verification channel.

## Three concierge worlds (one backend, port 8001)

| World | Demo persona | Router | Notes |
|---|---|---|---|
| **Bank (HDFC)** | Riya (travel-lean) ⇄ Samyak (dining-lean) | `/chat`, `/redeem`, `/travel/*` | The full experience: dashboard, dialogue manager, live Duffel flights, Tango vouchers, OTP, demo/production modes |
| **Dining (Subway)** | Arjun Mehta (500 pts) | `/dining/*` | Self-contained, hardcoded catalogue, veg filtering |
| **Entertainment** | Priya Nair (800 pts) | `/entertainment/*` | Real TMDB now-playing + hardcoded rewards |

Dining/Entertainment routers are **self-contained** — no shared tables, services, or
session state with bank routes. Keep it that way.

## Repo layout

```
backend/
├─ mcp_server.py          Bank MCP server (SSE :8000) — 7 card-level tools, thin wrappers
├─ api/                   FastAPI :8001 — main, orchestrator, dialogue_manager, intent,
│                         travel.py, dining.py, entertainment.py, schemas, session
├─ services/              Layer 1 — ALL SQL + logic lives here (~35 services):
│                         scoring_service (5-dim), llm_service (Groq/Gemini),
│                         card_selector, flight/hotel/merchandise services,
│                         cmr_service, memory/personalization, bank_mcp_client,
│                         redemption/ (executor + providers: duffel, tango, demo, bank)
├─ storefront/            Mock hotel storefront (:8002) — assisted-booking target
├─ catalogue/             hdfc_catalogue.json + transfer_partners.json = SOURCE OF TRUTH
├─ demo_preflight.py      Checks every live dependency → "ALL SYSTEMS GO"
└─ .env                   Secrets (NEVER commit; .env.example is the template)
db/                       Prisma schema + migrations + run_reset.py (demo persona reset)
frontend/                 React + Vite (:5173) — Landing → per-world themed concierges,
                          laptop ⇄ mobile toggle, theme.jsx CSS-var palettes
CredArt 2.0/              Design mockups the frontend was ported from (reference only)
mockkobie/                Partner-showcase snapshot/mirror (do not treat as live code)
DEMO_RUNBOOK.md           The rehearsed 5-act production demo script — read before demos
run_demo.ps1              Launches all 4 services in order (-Reset -Preflight)
```

## Scoring (Phase 6, deterministic)

5 dimensions, fixed weights: financial 0.35 · lifestyle 0.25 · redemption_prob 0.20 ·
expiry_risk 0.10 · flexibility 0.10, plus a small CMR boost. Preference learning via
`recommendation_events` confirm rates. Score is an internal ranking signal — never shown
to the user as a value. The LLM reranks/explains; it never recomputes.

## Run

```powershell
backend\.venv\Scripts\python db\run_reset.py                      # reset personas first
cd backend; .venv\Scripts\python -m mcp_server                    # 1. MCP :8000
cd backend; .venv\Scripts\python -m uvicorn storefront.app:app --port 8002   # 2. storefront
cd backend; .venv\Scripts\python -m uvicorn api.main:app --port 8001          # 3. backend (after 1&2)
cd frontend; npm run dev                                          # 4. frontend :5173
cd backend; .venv\Scripts\python demo_preflight.py                # verify ALL SYSTEMS GO
```

Or: `.\run_demo.ps1 -Reset -Preflight` from repo root.

## Hard rules

- **Never commit `.env` files** or any secrets.
- **Never add `.claude/`, codex, or `graphify-out/` files to git.** The user pushes git
  themselves — do not commit or push unless explicitly asked, and never with a Claude
  co-author/contributor trail.
- Demo mode spends a separate replayable `demo_points` bucket; production debits real
  points atomically under a Redis lock. Don't blur the two.
- DB access uses `DIRECT_URL` (session mode :5432), not the pgbouncer pooler.
- Embeddings: Gemini `gemini-embedding-001`, 768-dim, HNSW index. Re-embed after any
  catalogue reseed (`seed_catalogue.py` → `ingest_embeddings.py`).

## Knowledge graph

`graphify-out/graph.json` is a queryable knowledge graph of this codebase
(1,015 nodes, 62 labeled communities). For any architecture/structure question, run
`/graphify query "<question>"` before grepping — it's faster and cross-referenced.
`graphify-out/GRAPH_REPORT.md` has god nodes + suggested questions;
`graphify-out/graph.html` is the interactive view.
