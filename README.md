# CredArt — AI rewards concierge

CredArt turns a chat message into a **pre-validated set of redemption candidates**
and a helpful reply, guaranteeing every number it shows is real (from a catalogue
+ the user's own data), never invented by the LLM. It now spans **three rewards
worlds** behind one concierge:

| World | Client | Theme | Backend router |
|-------|--------|-------|----------------|
| **Banks** | HDFC credit cards | Navy + Gold | `/chat`, `/redeem`, … |
| **Food & Dining** | Subway | Green + Yellow | `/dining/*` |
| **Entertainment & Cinema** | Cinema / OTT (TMDB) | Deep Purple + Red | `/entertainment/*` |

A landing page lets you pick a world; each opens its own themed concierge chat.
A global **laptop ⇄ mobile** toggle renders the whole app inside a phone frame.

> Architecture, the anti-hallucination boundary, CMR, dialogue engine, fulfilment
> partners, and demo personas are documented in [`CLAUDE.md`](./CLAUDE.md).

## Layout

```text
CredArt/
├─ backend/            FastAPI app (port 8001)
│  ├─ api/             routes, schemas, intent, dialogue_manager,
│  │                   dining.py + entertainment.py (self-contained routers)
│  ├─ services/        Layer 1 — SQL + business logic + scoring + LLM + fulfilment
│  ├─ .env             secrets (not committed) · .env.example is the template
│  └─ .venv/
├─ db/                 Prisma schema mirror + migrations + demo reset
├─ frontend/           React + Vite (port 5173)
│  └─ src/
│     ├─ App.jsx           landing router + laptop/mobile toggle
│     ├─ theme.jsx         per-category palettes (CSS-var overrides) + meta
│     ├─ lib/api.js        backend client (bank + dining + entertainment)
│     └─ components/       Landing, CategoryChat, BankExperience, Concierge, …
└─ README.md
```

## Prerequisites

- Python 3.11+ (a `backend/.venv` is expected), Node 18+.
- `backend/.env` — copy from `backend/.env.example` and fill in what you need.
  Everything is optional for the demo (services degrade gracefully), but for the
  full experience set the Groq/Gemini LLM keys, `REDIS_URL`, and `TMDB_API_KEY`
  (free — themoviedb.org → Settings → API → v3 key; enables real now-playing
  movies with posters in the Entertainment concierge).

## Run

```powershell
# 1. reset both bank demo personas (run before a bank demo)
backend\.venv\Scripts\python db\run_reset.py

# 2. backend (port 8001) — bank + dining + entertainment routers
cd backend
.venv\Scripts\python -m uvicorn api.main:app --port 8001 --reload

# 3. frontend (port 5173)
cd frontend
npm install   # first time only
npm run dev
```

Open <http://localhost:5173>. Interactive API docs live at
<http://localhost:8001/docs>.

## The three concierges

- **Banks (HDFC)** — the original experience: dashboard, Riya ⇄ Samyak persona
  switcher, `/chat` concierge, `/redeem` with demo/production modes + OTP. Demo
  mode is replayable and safe; production shows a real Duffel/Tango reference.
- **Food & Dining (Subway)** — demo user **Arjun Mehta (500 pts)**, a hardcoded
  Subway rewards catalogue, vegetarian filtering + preference boost, mock
  `SUB-DEMO-XXXX` redemptions. Endpoints: `/dining/chat`, `/dining/redeem`,
  `/dining/health`.
- **Entertainment & Cinema** — demo user **Priya Nair (800 pts)**, real TMDB
  now-playing movies (title/poster/rating) mixed with hardcoded rewards (IMAX,
  OTT, events, gaming), genre + group-size personalization, mock `ENT-DEMO-XXXX`
  redemptions. Endpoints: `/entertainment/chat`, `/entertainment/redeem`,
  `/entertainment/health`. Falls back to 5 hardcoded titles if TMDB is
  unavailable.

Each new concierge is a **self-contained router** — it shares no tables, services,
or session state with the bank routes, so it can't break them.

## Frontend notes

- **Theming** — every component reads its colours from the global `--brand-*` CSS
  scale. Each category overrides that scale on a wrapper `div` (`theme.jsx`), so a
  whole experience re-themes with no component changes — including the untouched
  bank chat.
- **Laptop ⇄ mobile toggle** — a fixed top-right switch. Laptop shows a
  browser-window shell; mobile re-renders the same experience inside a phone frame
  (`IOSDevice`). Every experience takes a `view` prop and fits itself to the frame.
