# CredArt — AI Rewards Concierge

> **Kobie AI Hackathon 2026 · Track 4 · Generative AI**  
> RV College of Engineering, Bangalore  
> Team: Samyak Rao · Saket Marathe · Anuska Mishra

---

## Overview

CredArt is a conversational AI concierge that replaces the browse-filter-select rewards UI with a single natural-language dialogue. It uses a **two-layer hybrid intelligence architecture** to prevent both hallucination (pure LLM failure) and context-blindness (pure rule engine failure).

- **Layer 1 — Deterministic Rule Engine**: eligibility validation, RAG retrieval over T&C PDFs (pgvector), 5-dimension scoring, transfer partner valuation, points + cash resolution
- **Layer 2 — Claude Sonnet 4**: lifestyle interpretation, contextual reranking, plain-language streaming responses, preference learning across sessions

---

## Repository Structure

```
credart/
├── db/                          # Database layer (Prisma + Supabase)
│   ├── prisma/
│   │   ├── schema.prisma        # Full data model (13 tables)
│   │   └── migrations/
│   │       ├── 0001_extensions_and_vector/
│   │       ├── 0002_core_schema/
│   │       ├── 0003_rls_policies/
│   │       ├── 0004_seed_hdfc_cards/
│   │       └── 0005_seed_mock_users/
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

---

## Database Setup

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com) project (free tier works)

### Steps

```bash
cd db
npm install

# Copy and fill in your Supabase credentials
cp .env.example .env

# Deploy all migrations to Supabase
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Verify
npx prisma migrate status
```

### Environment Variables

Create `db/.env` with:

```env
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
SUPABASE_URL="https://[ref].supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

Find your credentials at: **Supabase Dashboard → Settings → API**

---

## Data Model

| Table | Purpose |
|-------|---------|
| `cards` | Credit card catalogue (HDFC, Axis, SBI, etc.) |
| `benefits` | Per-card benefit rules from T&C |
| `benefit_embeddings` | pgvector chunks for RAG retrieval |
| `transfer_partners` | Airline/hotel transfer ratios & processing times |
| `tnc_versions` | T&C PDF versioning & ingestion status |
| `users` | User profiles |
| `user_cards` | Cards held by each user with live points balance |
| `points_ledger` | Full transaction ledger per card |
| `preferences` | 5-dimension weight profile per user |
| `redemption_history` | Saga-tracked redemption transactions |
| `recommendation_events` | ML feedback loop — actions on recommendations |
| `scraper_runs` | Audit log for T&C scraper pipeline |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | Supabase (Postgres) |
| Vector / RAG | pgvector on Supabase |
| ORM | Prisma 5 |
| AI Engine | Claude Sonnet 4 (Anthropic) |
| Embeddings | OpenAI text-embedding-3-small |
| Backend | FastAPI (Python) — coming soon |
| Frontend | Next.js 15 + Tailwind CSS — coming soon |
| Session Cache | Redis (Upstash) — coming soon |

---

## Team

| Name | Role |
|------|------|
| Samyak Rao | AI & Backend Engineering |
| Saket Marathe | Frontend & Integration |
| Anuska Mishra | Data Science & Scoring |
