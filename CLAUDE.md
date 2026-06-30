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
| Candidate assembly | `backend/api/orchestrator.py` |
| Conversation store | `backend/api/session.py` |
| 5-dimension scoring | `backend/services/scoring_service.py` |
| User/preferences reads | `backend/services/user_service.py` |
| **CMR profile (this feature)** | `backend/services/cmr_service.py` |
| Bank MCP client | `backend/services/bank_mcp_client.py` |
| Redemption providers/executor | `backend/services/redemption/*` |
| Schema (Prisma mirror) | `db/prisma/schema.prisma` |
| Migrations | `db/prisma/migrations/NNNN_name/migration.sql` |
| Demo reset | `db/reset_demo.sql` |

## Demo users (seed 0005)

| User | id | Cards |
|------|----|-------|
| Samyak Rao | `…0000000000001` | HDFC Infinia |
| Riya Sharma | `…0000000000002` | Regalia Gold + Millennia |

`db/reset_demo.sql` restores Riya's mutable state (points, ledger, preferences,
CMR) to spec — run it before every demo. Demo redemptions spend a separate
`demo_points` bucket so the live ledger is never corrupted and the demo is
replayable.

---

# Customer Master Record (CMR)

A single unified profile of a user beyond cards + points, so CredArt stops
re-asking known facts and can make smarter, **deliverable** recommendations.

**Boundary:** every CMR field feeds deterministic recommendation/scoring/delivery
logic in Layer 1. None of it is ever handed to the LLM — the LLM still only sees
the candidate set. The "confirm pre-filled values" reply text is built
deterministically and appended *outside* the LLM call.

All CMR columns are optional with safe defaults, so existing rows are unaffected.

## What CMR stores (migration `0011_cmr`)

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

## CMR demo data (seed in `0011`, replayable via `reset_demo.sql`)

- **Riya** — city Mumbai, `family_size` 1, `preferred_airlines` `["IndiGo"]`,
  Home address (Mumbai), wishlist `Manali Weekend Stay`, dismissed
  `BookMyShow Voucher` (so it never reappears for her).
- **Samyak** — city Bengaluru, `family_size` 2, `preferred_cuisines`
  `["North Indian","Italian"]`, Home address (Bengaluru), wishlist
  `Goa Marriott Luxury Stay`.

Wishlist/dismissed seeds use real catalogue `benefit_name`s so the boost/filter
actually engage when those candidates surface at runtime.

## Run

```powershell
cd backend
.venv\Scripts\python -m uvicorn api.main:app --port 8001 --reload   # backend
.venv\Scripts\python -m mcp_server                                   # bank MCP (port 8000)
```

Apply the CMR migration against the DB the same way as the others (the SQL in
`db/prisma/migrations/0011_cmr/migration.sql`).

## ⚠️ Known pre-existing breakage (NOT introduced by CMR)

The branch this was built on (`main` @ `89084e4`, the "combine OTP-flow executor
with Redis lock" merge) was committed mid-merge:

- `backend/services/redemption/executor.py` contains unresolved Git conflict
  markers (`<<<<<<<` / `=======` / `>>>>>>>`) — it won't parse as Python.
- `registry.py` / `executor.py` / `main.py` import four modules that don't exist
  in the repo: `assisted_checkout_provider`, `bank_internal_provider`,
  `voucher_provider`, `booking_session_service`.

So the FastAPI app won't import/start until that merge is resolved and those
modules are restored. The CMR code is written to be clean and pattern-matching
so it slots in correctly once the app is runnable again; the new/changed Python
files all pass `py_compile`.
