# CredArt — Quick Demo Script (8 min)

**Setup (do once, now):** MCP :8000 · backend :8001 · frontend :5173 all up.
Open <http://localhost:5173> → **Bank** → mode toggle **Production** → persona **Riya**.
Reset anytime: `backend\.venv\Scripts\python db\run_reset.py`

**Open with:**
> "CredArt is an AI rewards concierge — but the LLM never invents a number. Every
> points value and price is computed deterministically and *handed to* the model."

---

## Act 1 — Urgency (Riya) · 45s
- **Type:** `what's expiring?`
- **Say:** "Zero-latency, deterministic, no LLM. It caught 3,200 points expiring *today*."

## Act 2 — Live booking, real flight (Riya) · 2.5 min  ⭐ WOW
- **Type:** `I want to travel` → tap **Flights**
- **Tap chips:** Goa → Mumbai → Next weekend → 2 → Economy
- **Say:** "One question at a time like a real agent — never a form. 'Next weekend'
  becomes a real date deterministically."
- Live Duffel fares appear → **Say:** "Real fares, live, priced into points at the
  card's rate — that math is ours, not the model's."
- **Tap:** Book flight (Duffel · live) → consent → **bank OTP screen appears**
- **Enter:** any 6 digits (e.g. `482913`) → Submit
- **Say:** "Production bookings trigger a real bank OTP step-up — points move *only*
  after it's confirmed, and we never store the OTP." → **real booking reference**
- **Say:** "Genuine reference from a live airline API. If a carrier repricies mid-book,
  it retries across airlines like a human agent."

## Act 3 — Personalization contrast (switch → Samyak) · 1 min
- **Type (as Riya):** `how should I spend my points?` → **auto-leans TRAVEL**:
  "Going by your rewards profile you lean toward travel, so I started there…"
- **Switch to Samyak, type the SAME thing** → **auto-leans DINING** with no tap.
- **Say:** "Same question, no category picked — it read each customer's stored
  preference weights and led with their lane. The chips let them pivot; it's a
  smart default, not a lock-in."

## Act 4 — Real voucher + memory (Samyak) · 1.5 min
- **Type:** `I want to buy a camera` → budget chip **₹25,000** → redeem (Production)
- **OTP screen** → enter any 6 digits → Submit
- **Say:** "Same secure OTP step-up, then it issued a **real Amazon voucher code** and
  auto-filled his saved Bengaluru address — it never re-asks what it knows."

## Act 5 — Beyond banking (movies + dining) · 2 min
**Categories → Entertainment (Saket):**
- **Type:** `movie tickets` → tap **Thriller** → tap **3 (usual)**
- Real TMDB posters (thriller-filtered) → tap **🎟️ Book now!** → **pick 3 seats** → **Redeem**
- **Say:** "Gathers context like the bank flow, real now-playing movies from TMDB,
  books actual seats — priced per seat in Layer 1."

**Categories → Food & Dining (Anushka):**
- **Type:** `double protein please`
- **Say:** "It tells you it swapped to veg picks — it knows her dietary preference."

## Closer — the differentiator · 30s
Keep the **MCP terminal visible** if a technical mentor probes hallucination:
> "The bank catalogue comes over a separate MCP server that *structurally cannot see
> customer balances* — no user tables. The boundary isn't a rule, it's a wall the code
> can't cross. That's why every number is trustworthy."

---

## If it breaks live
| Problem | Fix |
|---|---|
| Flight book fails (Production) | Flip toggle → **Demo**, rebook → instant `CRD-DEMO-…`; Tango voucher (Act 4) is your real-production proof |
| Persona looks off | `backend\.venv\Scripts\python db\run_reset.py` (2s, safe) |
| LLM slow | Auto-degrades to templates; never blocks |

**OTP note:** any 6-digit code works (bank sandbox). **Demo mode has no OTP** — it's
instant; only **Production** shows the step-up. Points move *only* after OTP.

**Lead your energy on:** the real airline booking reference · the MCP boundary ·
same-question-different-answer · the secure OTP step-up.
