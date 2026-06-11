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

## The 6 tools (all key on `card_id` only)

| Tool | Source |
|------|--------|
| `list_cards` | `cards` |
| `get_card_details` | `cards` |
| `get_card_benefits` | `benefits` |
| `get_transfer_partners` | `transfer_partners` |
| `get_redemption_rules` | `benefits` (earn/fee/caveat) + `transfer_partners` |
| `get_tnc_updates` | `tnc_versions` |

`get_benefit_chunks` (pgvector semantic search) is **Phase 3**, intentionally
separate from these deterministic SQL tools.

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
