# CredArt — Mentor Demo Runbook (production mode)

Everything below was rehearsed end-to-end against the live APIs on 2 July 2026:
live Duffel fares + a **real production booking** (ref `A5RNYO`), a **real Tango
sandbox voucher** (order `RA260702-147307-23`, code issued), TMDB movies, Groq
replies, Redis sessions. Total demo time: ~10 minutes.

## 30 minutes before

**Shortcut:** `.\run_demo.ps1 -Reset -Preflight` from the repo root launches all four
services (MCP :8000, storefront :8002, backend :8001, frontend :5173) each in its own
window, in the right order, then runs preflight. The manual steps below are the
equivalent if you'd rather start each yourself.

```powershell
# 1. reset both personas (points, expiry, CMR) — ALWAYS do this first
backend\.venv\Scripts\python db\run_reset.py

# 2. bank MCP server :8000 (own terminal) — bank data now flows over MCP, not the
#    in-process fallback. /health then reports bank_data_source=mcp.
cd backend
.venv\Scripts\python -m mcp_server

# 3. mock hotel storefront :8002 (own terminal) — the live "assisted" hotel booking
#    target. With PROVIDER_HOTEL_*_BOOK_URL set in backend\.env, hotel candidates are
#    bookable and a redemption POSTs a real reservation here.
cd backend
.venv\Scripts\python -m uvicorn storefront.app:app --port 8002

# 4. backend :8001 (own terminal) — start it AFTER 2 & 3 so it connects to the MCP
#    server and picks up the storefront URLs.
cd backend
.venv\Scripts\python -m uvicorn api.main:app --port 8001

# 5. frontend (own terminal)
cd frontend
npm run dev

# 6. preflight — checks every live dependency incl. MCP server, storefront, and a
#    real Duffel test order
cd backend
.venv\Scripts\python demo_preflight.py
```

Preflight prints PASS/FAIL per system and ends with **ALL SYSTEMS GO**. It now also
verifies `bank_data_source=mcp` (MCP server reached, not the in-process fallback) and
that the storefront on :8002 is live.
If (and only if) `Duffel flight ORDER` fails — their sandbox had a brief outage
on 2 July — do the flight booking in **Demo** mode and show production with the
Tango voucher in Act 4 instead. Everything else is unaffected.

Open <http://localhost:5173>, pick **Bank**, set the mode toggle to
**Production**, persona **Riya**.

## The script (5 acts, ~2 min each)

### Act 1 — urgency, zero hallucination (Riya)
Dashboard: point out Millennia's **3,200 CashPoints expiring today**.
Type **`what's expiring?`** → instant, deterministic answer (no LLM on this
path — say so: *"every number comes from Layer 1 SQL, the LLM never invents a
figure"*).

### Act 2 — conversational booking with live fares (Riya)
Type **`I want to travel`** → ONE clarifying question with tap chips.
Answer everything by tapping: **Flights → Goa → Mumbai → Next weekend → 2 →
Economy**. Each answer is asked once, never re-asked; "Next weekend" resolves
to a real ISO date deterministically.
→ 4 **live Duffel fares**, priced into points at the card's rate
(₹6,893 fare → 6,894 Infinia points — Layer 1 math, shown transparently).

**The wow moment**: tap **Book flight (Duffel · live)** → consent → a **real
airline booking reference** (test mode). Mention the resilience: if a carrier
repricies mid-booking, the executor retries across airlines like a human agent.

### Act 3 — personalization contrast (switch persona → Samyak)
Type the *same vague ask*: **`how should I spend my points?`** → **no tap needed**:
CredArt reads the stored preference weights and leads straight into the user's lean —
*"Going by your rewards profile you lean toward dining, so I started there…"* with
dining-first recommendations (Taj dining voucher etc.). Do the same on **Riya** and the
identical sentence surfaces **travel** instead. Same question, different user, different
answer, **zero clicks** — that's the deterministic preference weights (Riya travel 0.50 /
Samyak dining 0.50) driving it, not the LLM.
Then tap a **switch chip** (Travel / Shopping / Cashback) to pivot lanes in one tap — proof
the lean is a smart default, not a lock-in. (A user with a *flat* profile still gets the
one clarifying question — personalization only pre-empts the question when the signal is real.)

### Act 4 — real merchandise + CMR delivery (Samyak)
Type **`I want to buy a camera`** → budget chip **₹25,000** → real product
listings with photos, priced into points. Redeem in production → a **real Tango
sandbox Amazon voucher code** is issued and his **saved Bengaluru address
auto-fills** (no re-asking — CMR).

### Act 5 — beyond banking (30s each, optional)
Back to Categories → **Entertainment**: `movie tickets` → it asks one question at
a time like the bank flow — mood/genre (tap **Thriller**) → ticket count (chips
mark Saket's usual **3**) → real TMDB now-playing posters filtered to thrillers,
priced per seat in Layer 1, redeem → `ENT-DEMO-…`.
**Dining (Subway)**: `double protein please` → it *tells you* it swapped to
veg picks because Anushka is vegetarian.
Finish on the bank chat's **history drawer / refresh** → conversation survives
(Redis sessions), and the **laptop ⇄ mobile toggle**.

## Talking points if asked

- **Anti-hallucination**: LLM sees only the pre-scored candidate JSON — never
  the DB, balances, or CMR. All ₹/points figures are computed in Layer 1.
- **Scoring**: deterministic 5-dimension score (financial 0.35, lifestyle 0.25,
  redemption-probability 0.20, expiry 0.10, flexibility 0.10) + small CMR boost.
- **Resilience**: 3 Groq keys → Gemini fallback → deterministic templates; hard
  20s LLM timeouts; Redis falls back to in-memory; TMDB falls back to titles;
  Duffel retries across carriers and repricing.
- **Safety**: demo mode spends a separate replayable `demo_points` bucket;
  production debits real points atomically under a Redis lock.

## If something breaks live

| Symptom | Move |
|---|---|
| Flight booking fails in production | Flip toggle to **Demo**, book again — instant `CRD-DEMO-…` ref; blame the sandbox, show Tango in Act 4 as the real production proof |
| LLM reply slow/odd | It degrades to templates automatically — the flow never blocks |
| Anything about a persona looks off | `backend\.venv\Scripts\python db\run_reset.py` (safe mid-demo, takes 2s) |
