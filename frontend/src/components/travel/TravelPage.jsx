/* CredArt — Travel Rewards page: a dedicated, form-based flight-redemption
 * flow (search -> results -> review -> demo confirmation) in the same
 * Kobie/Navy-Federal rewards-portal visual language as the rest of the app.
 * This REPLACES the old "Travel" category tile's hardcoded grid as the entry
 * point for Travel — the tile's card, filter, checkout code in
 * RewardsCatalogue.jsx is untouched, but landing/dashboard now route to this
 * page instead (see App.jsx / RewardsCatalogue.jsx onOpenTravel).
 *
 * Always represents Riya (the app's travel-leaning persona) — the backend
 * router (api/travel.py) hardcodes her as its one demo identity, the same
 * pattern as the dining/entertainment self-contained concierges.
 */
import React from "react";
import { travelApi } from "../../lib/travelApi.js";
import { TravelSearchForm } from "./TravelSearchForm.jsx";
import { TravelResults } from "./TravelResults.jsx";
import { TravelOfferDetails } from "./TravelOfferDetails.jsx";
import { TravelConfirmation } from "./TravelConfirmation.jsx";
import { TravelAIPanel } from "./TravelAIPanel.jsx";

/* Hotels/cars/packages reservations are demo-local (no real inventory behind
   them, same as the rest of this app's redemption surfaces) but DO spend real
   points off Riya's visible balance, gated by budget, and persist across a
   reload/back-navigation — so "Reserve" behaves like every other redemption
   here instead of being a no-op animation. */
const EXTRAS_KEY = "credart:travel:extras:v1";
function loadExtras() {
  try {
    const raw = JSON.parse(localStorage.getItem(EXTRAS_KEY) || "null");
    return raw && typeof raw === "object" ? { reserved: raw.reserved || {}, spent: raw.spent || 0 } : { reserved: {}, spent: 0 };
  } catch { return { reserved: {}, spent: 0 }; }
}
function saveExtras(extras) {
  try { localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras)); } catch { /* storage off */ }
}

/* ---------- OTP entry — ported design from RewardsCheckout's OtpStep, so a
   live flight redemption asks for OTP the exact same way any other reward in
   the app does: full-screen overlay, demo SMS card, 6-digit boxes, shake on
   wrong code, 2-minute countdown, cancel leaves the booking untouched. ---------- */
function FlightOtpStep({ offer, demoOtp, onSubmit, onCancel, error }) {
  const [digits, setDigits] = React.useState(["", "", "", "", "", ""]);
  const [secs, setSecs] = React.useState(120);
  const refs = React.useRef([]);

  React.useEffect(() => {
    if (secs <= 0) { onCancel("OTP expired — no points were deducted."); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const set = (i, v) => {
    v = v.replace(/\D/g, "").slice(-1);
    setDigits((d) => { const n = [...d]; n[i] = v; return n; });
    if (v && i < 5) refs.current[i + 1] && refs.current[i + 1].focus();
  };
  const onKey = (i, e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1].focus(); };

  const code = digits.join("");
  const full = code.length === 6;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(8,28,51,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "fadeIn .18s ease" }}>
      <div style={{ width: "min(420px, 100%)", height: "min(560px, 94%)", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 34px 80px rgba(8,28,51,0.55)", animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)",
        background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff", padding: "26px 22px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.82, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FFC96B" }} />
            SECURE REDEMPTION SESSION
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8 }}>Confirm with OTP</div>
          <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: "9px 13px", fontSize: 13, fontWeight: 600 }}>
            <span>{offer.airline} {offer.origin}→{offer.destination}</span>
            <span style={{ opacity: 0.5 }}>·</span><span style={{ opacity: 0.9 }}>Riya's account</span>
          </div>
        </div>

        <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "22px 22px" }}>
          <div className="animate-msg" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff",
            border: "1px solid var(--brand-100)", borderLeft: "4px solid var(--brand-600)", borderRadius: 12,
            padding: "11px 14px", boxShadow: "var(--sh-md)", maxWidth: 380, margin: "0 auto" }}>
            <span style={{ fontSize: 18 }}>💬</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-700)", letterSpacing: 0.4 }}>CREDART BANK · SMS</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
                OTP for your flight redemption is <b className="num" style={{ color: "var(--ink)", fontSize: 14 }}>{demoOtp}</b>. Valid for 2 minutes. Do not share it.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13.5, color: "var(--ink-2)", fontWeight: 600, textAlign: "center", marginTop: 22 }}>
            Enter the 6-digit code sent to Riya's registered mobile
          </div>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 16 }} className={error ? "cr-shake" : ""}>
            {digits.map((d, i) => (
              <input key={i} ref={(el) => (refs.current[i] = el)} value={d} inputMode="numeric" autoFocus={i === 0}
                onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
                style={{ width: 44, height: 54, textAlign: "center", fontFamily: "var(--font-num)", fontSize: 24, fontWeight: 700,
                  color: "var(--ink)", borderRadius: 14, outline: "none", background: "#fff",
                  border: error ? "2px solid var(--red)" : (d ? "2px solid var(--brand-500)" : "1.5px solid var(--hairline)"),
                  boxShadow: "var(--sh-sm)", transition: "border .15s ease" }} />
            ))}
          </div>
          {error && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "var(--red)" }}>{error}</div>}
          <div className="num" style={{ marginTop: 16, textAlign: "center", fontSize: 13, fontWeight: 700, color: secs < 30 ? "var(--red)" : "var(--ink-3)" }}>
            OTP expires in {mm}:{ss}
          </div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" /></svg>
            CredArt never stores your OTP.
          </div>
        </div>

        <div style={{ padding: "12px 22px 22px", background: "#fff", borderTop: "1px solid var(--hairline)" }}>
          <button className="tap" onClick={() => full && onSubmit(code)} disabled={!full} style={{ width: "100%", padding: 15,
            background: full ? "linear-gradient(135deg,var(--brand-600),var(--brand-800))" : "var(--brand-200)",
            color: "#fff", border: "none", borderRadius: 999, fontFamily: "var(--font)", fontSize: 15.5, fontWeight: 800,
            boxShadow: full ? "0 10px 22px rgba(12,39,72,0.32)" : "none", cursor: full ? "pointer" : "default", opacity: full ? 1 : 0.7 }}>
            Submit OTP
          </button>
          <button className="tap" onClick={() => onCancel("Redemption cancelled — no points were deducted.")} style={{ width: "100%", marginTop: 8, padding: 12,
            background: "transparent", color: "var(--ink-3)", border: "none", fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Cancel redemption
          </button>
        </div>
      </div>
    </div>
  );
}

export function TravelPage({ theme, onExit }) {
  const [view, setView] = React.useState("search"); // search | results | details | confirmation
  // null = "not loaded yet" (distinct from a real 0-point balance) so the header/
  // search form can show a loading state instead of a misleading "0 pts".
  // rawPoints is the authoritative balance from the backend (flights spend
  // real demo_points there); extrasSpent tracks hotel/car/package reservations,
  // which are demo-local — availablePoints is the two combined, so every
  // surface on this page (search form, results, extras strip) sees ONE
  // consistent spendable number.
  const [rawPoints, setRawPoints] = React.useState(null);
  const [extras, setExtras] = React.useState(loadExtras);
  const availablePoints = rawPoints == null ? null : Math.max(0, rawPoints - extras.spent);
  const [cardName, setCardName] = React.useState("");
  const [healthError, setHealthError] = React.useState(false);
  const [search, setSearch] = React.useState(null);
  const [results, setResults] = React.useState([]);
  const [sort, setSort] = React.useState("recommended");
  const [filters, setFilters] = React.useState({ stops: "any", airline: "any", maxPoints: null });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [selectedOffer, setSelectedOffer] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState("");
  const [confirmation, setConfirmation] = React.useState(null);
  const [askSignal, setAskSignal] = React.useState(null);
  // OTP gate before a live booking confirms — otpMode holds the payment mode
  // chosen on the review screen while the OTP overlay is up.
  const [otpMode, setOtpMode] = React.useState(null);
  const [otpErr, setOtpErr] = React.useState(null);
  const otpRef = React.useRef(null);

  function startOtp(paymentMode) {
    otpRef.current = String(Math.floor(100000 + Math.random() * 900000));
    setOtpErr(null);
    setOtpMode(paymentMode);
  }

  React.useEffect(() => {
    travelApi.health().then((h) => {
      if (h.available_points != null) setRawPoints(h.available_points);
      if (h.card_name) setCardName(h.card_name);
    }).catch((e) => {
      console.error("travel health check failed — is the backend reachable at", travelApi, e);
      setHealthError(true);
    });
  }, []);

  /* Reserve a hotel/car/package: budget-gated against the CURRENT spendable
     balance (already net of prior extras), debits it, and persists — so it
     survives a reload or leaving and returning to Travel. */
  function reserveExtra(item) {
    if (extras.reserved[item.id]) return;
    if (availablePoints == null || item.points > availablePoints) return;
    const ref = "TRV-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const next = { reserved: { ...extras.reserved, [item.id]: ref }, spent: extras.spent + item.points };
    setExtras(next);
    saveExtras(next);
  }

  async function runSearch(params, sortOverride) {
    setLoading(true);
    setError("");
    setView("results");
    setSearch(params);
    try {
      const r = await travelApi.searchFlights({ ...params, sort: sortOverride || sort });
      setResults(r.results);
      setRawPoints(r.available_points);
      setCardName(r.card_name);
    } catch (e) {
      setError(e.message || "Something went wrong searching flights.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function onSortChange(next) {
    setSort(next);
    if (search) runSearch(search, next);
  }

  function viewOffer(offer) {
    setSelectedOffer(offer);
    setConfirmError("");
    setView("details");
  }

  async function confirmRedemption(paymentMode) {
    setConfirming(true);
    setConfirmError("");
    try {
      const r = await travelApi.demoConfirm(selectedOffer.offer_id, paymentMode);
      if (r.status !== "completed") {
        setConfirmError(r.rollback_reason || "The demo booking couldn't be completed.");
        return;
      }
      setConfirmation(r);
      setRawPoints(r.balance_after);
      setView("confirmation");
    } catch (e) {
      setConfirmError(e.message || "The demo booking couldn't be completed.");
    } finally {
      setConfirming(false);
    }
  }

  function backToTravel() {
    setView("search");
    setSelectedOffer(null);
    setConfirmation(null);
    setSearch(null);
    setResults([]);
  }

  const aiContext = {
    availablePoints, origin: search?.origin, destination: search?.destination,
    tripType: search?.trip_type, results, selectedOffer, view,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* header — matches the rest of the app's rewards nav */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--brand-100)", padding: "12px 24px",
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 2px 10px rgba(12,39,72,0.05)" }}>
        <button className="tap" onClick={onExit} title="Back" style={{ width: 34, height: 34, borderRadius: "50%",
          border: "1.5px solid var(--brand-200)", background: "#fff", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="var(--brand-700)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: theme.cardGrad, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>✈️</span>
        </span>
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "var(--brand-800)" }}>CredArt Travel Rewards</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--brand-400)", fontStyle: "italic" }}>Powered by CredArt</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>Riya · {cardName || "HDFC"}</div>
          <div className="num" style={{ fontSize: 15, fontWeight: 800, color: healthError ? "#B23A3A" : "var(--brand-700)" }}>
            {availablePoints == null ? (healthError ? "unavailable" : "…") : `${Number(availablePoints).toLocaleString("en-IN")} pts`}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 24px 90px" }}>
        {view === "search" && (
          <TravelSearchForm theme={theme} availablePoints={availablePoints} onSearch={runSearch}
            error={error && view === "search" ? error : ""}
            reserved={extras.reserved} onReserve={reserveExtra} />
        )}
        {view === "results" && (
          <TravelResults search={search} results={results} loading={loading} error={error} sort={sort}
            onSortChange={onSortChange} filters={filters} onFiltersChange={setFilters}
            availablePoints={availablePoints} onView={viewOffer}
            onAskAi={(offer) => setAskSignal({ offer, ts: Date.now() })}
            onNewSearch={backToTravel} />
        )}
        {view === "details" && selectedOffer && (
          <TravelOfferDetails theme={theme} offer={selectedOffer} availablePoints={availablePoints}
            cardName={cardName} onBack={() => setView("results")} onConfirm={startOtp}
            confirming={confirming} confirmError={confirmError} />
        )}
        {view === "confirmation" && confirmation && (
          <TravelConfirmation theme={theme} confirmation={confirmation} offer={selectedOffer} onDone={backToTravel} />
        )}
      </div>

      {/* OTP-secured confirmation — same design/flow as every other redemption
          surface in the app (RewardsCheckout's OtpStep): a demo SMS card shows
          the code, wrong code shakes, expiry/cancel leaves points untouched. */}
      {otpMode && (
        <FlightOtpStep offer={selectedOffer} demoOtp={otpRef.current} error={otpErr}
          onSubmit={(code) => {
            if (code !== otpRef.current) { setOtpErr("That OTP didn't match. Check the SMS and try again."); return; }
            setOtpMode(null); setOtpErr(null);
            confirmRedemption(otpMode);
          }}
          onCancel={(msg) => { setOtpMode(null); setOtpErr(null); setConfirmError(msg); }} />
      )}

      <TravelAIPanel theme={theme} context={aiContext} askSignal={askSignal} />
    </div>
  );
}
