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
