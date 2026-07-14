  # CredArt — AI rewards concierge

  CredArt turns a chat message into a **pre-validated set of redemption candidates**
  and a helpful reply, guaranteeing every number it shows is real (from a catalogue
  + the user's own data), never invented by the LLM.

  The main experience is the **Rewards Catalogue** — a Kobie/Navy-Federal-style
  points store with a floating CredArt chatbot on top. Three more rewards worlds
  (Banks, Food & Dining, Entertainment) are reachable from its landing page for
  demo purposes, each its own self-contained concierge.

  ## The Rewards Catalogue (main experience)

  `Login → Landing → Store` (+ a dedicated `Travel` flow), full desktop web app,
  no device-frame toggle:

  - **Store** — 200+ hardcoded rewards across Travel / Gift Cards / Cashback /
    Merchandise, cart with quantity steppers, budget honesty at every layer (grid
    badge, detail modal, chat cards, cart gate), OTP-secured checkout.
  - **CredArt chatbot** (the floating bubble) — one question at a time, resizable
    panel, autosaved + resumable chat history, category quick-switch, and a full
    local intent engine (`lib/catalogue.js`) that:
    - searches the **entire** catalogue by name/category/topical-keyword and
      explains *why* a pick surfaced (`searchCatalogue` / `whyPick`) — never a
      guess, always derived from the actual match + the user's spendable budget
    - runs **dynamic lifestyle weighting**: every checkout nudges the redeemed
      category's weight up and decays the rest (mirrors the bank world's
      `update_preferences_after_redemption`), so a vague "how should I spend my
      points?" genuinely drifts toward wherever the user actually redeems
    - gates two features behind a **voucher wallet**: redeeming an airline
      voucher (IndiGo, SpiceJet, Vistara…) unlocks live Duffel flight booking
      in chat with the voucher's points applied to matching fares; redeeming a
      dining voucher (Zomato, Swiggy, Taj…) unlocks a conversational food-order
      flow (cuisine → party size → dish → confirm), both with budget honesty
      against the voucher's value and mid-conversation intent switching
    - books real flights via live Duffel search, OTP-gated the same way as
      every other redemption in the app
  - **Travel page** — dedicated search/results/review/booking flow: live Duffel
    fares, hotels/cars/holiday packages (real catalogue rewards, budget-gated
    Reserve), an order-history ("My bookings") panel, and OTP confirmation.
  - **Confirmation emails** — every redemption (store cart checkout regardless
    of category, chat food orders, chat/Travel-page flight bookings, travel
    extras) sends a confirmation email via `backend/services/email_service.py`
    (SMTP configured in `backend/.env`); best-effort, never blocks a redemption.

  ## Other rewards worlds (demo, reachable from the landing page)

  | World | Client | Theme | Backend router |
  |-------|--------|-------|----------------|
  | **Banks** | HDFC credit cards | Navy + Gold | `/chat`, `/redeem`, … |
  | **Food & Dining** | Subway | Green + Yellow | `/dining/*` |
  | **Entertainment & Cinema** | Cinema / OTT (TMDB) | Deep Purple + Red | `/entertainment/*` |

  Each is a **self-contained router** — shares no tables, services, or session
  state with the others, so it can't break them.

  ## Layout

  ```text
  CredArt/
  ├─ backend/                    FastAPI app (port 8001)
  │  ├─ api/
  │  │  ├─ main.py               bank /chat, /redeem, /cmr/*, /concierge/* (history + redemption email)
  │  │  ├─ travel.py             live Duffel search/redeem/orders + invoice email (self-contained)
  │  │  ├─ dining.py             Subway concierge (self-contained)
  │  │  └─ entertainment.py      TMDB + rewards concierge (self-contained)
  │  ├─ services/                Layer 1 — SQL + scoring + LLM + fulfilment + email_service.py
  │  ├─ .env                     secrets (not committed) · .env.example is the template
  │  └─ .venv/
  ├─ db/                         Prisma schema mirror + migrations + demo reset
  ├─ frontend/                   React + Vite (port 5173)
  │  └─ src/
  │     ├─ App.jsx               login → landing → store/travel (+ other worlds), no toggle
  │     ├─ theme.jsx             per-world palettes (CSS-var overrides) + meta
  │     ├─ lib/
  │     │  ├─ api.js             backend client (bank + concierge history/email + dining + entertainment)
  │     │  ├─ travelApi.js       Travel-world backend client
  │     │  └─ catalogue.js       hardcoded catalogue + local CredArt intent engine (vouchers, weighting, search)
  │     └─ components/
  │        ├─ RewardsLogin/Landing/Catalogue/Checkout.jsx   the main experience
  │        ├─ CredArtBubble.jsx                             the floating chatbot
  │        ├─ travel/                                       dedicated Travel flow
  │        └─ BankExperience, CategoryChat, …               the other worlds
  └─ README.md
  ```

  ## Prerequisites

  - Python 3.11+ (a `backend/.venv` is expected), Node 18+.
  - `backend/.env` — copy from `backend/.env.example` and fill in what you need.
    Everything is optional (services degrade gracefully), but for the full
    experience set the Groq/Gemini LLM keys, `REDIS_URL`, `DUFFEL_API_KEY`
    (live flight search/booking), `TMDB_API_KEY` (Entertainment world), and
    `SMTP_USER`/`SMTP_PASS`/`BOOKING_EMAIL_TO` (redemption confirmation emails —
    a Gmail address + app password works; unconfigured just logs and skips).

  ## Run

  ```powershell
  # one command — starts MCP (:8000), storefront (:8002), backend (:8001), frontend (:5173)
  .\run_demo.ps1                     # add -Reset to reset bank demo personas first
  ```

  or manually:

  ```powershell
  # 1. reset both bank demo personas (only needed for the Banks world demo)
  backend\.venv\Scripts\python db\run_reset.py

  # 2. backend (port 8001)
  cd backend
  .venv\Scripts\python -m uvicorn api.main:app --port 8001 --reload

  # 3. frontend (port 5173)
  cd frontend
  npm install   # first time only
  npm run dev
  ```

  Open <http://localhost:5173> — sign in (any credentials) and land on the
  Rewards Catalogue. Interactive API docs live at <http://localhost:8001/docs>.

  ## Frontend notes

  - **Theming** — every component reads its colours from the global `--brand-*`
    CSS scale. Each world overrides that scale on a wrapper `div` (`theme.jsx`),
    so a whole experience re-themes with no component changes.
  - No laptop/mobile device-frame toggle — everything renders as a full
    desktop page. (`IOSDevice.jsx`/`LaptopDevice.jsx`/`Landing.jsx` still exist
    on disk from an earlier picker-based layout but aren't mounted by `App.jsx`.)
