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
import { api } from "../../lib/api.js";
import { TravelSearchForm } from "./TravelSearchForm.jsx";
import { TravelResults } from "./TravelResults.jsx";
import { TravelOfferDetails } from "./TravelOfferDetails.jsx";
import { TravelConfirmation } from "./TravelConfirmation.jsx";
import { TravelAIPanel } from "./TravelAIPanel.jsx";
import { FlightOtpStep } from "./FlightOtpStep.jsx";

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

  const [showOrders, setShowOrders] = React.useState(false);
  const [orders, setOrders] = React.useState(null); // null = loading

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
    // Confirmation email — fire-and-forget, same as every other redemption surface.
    api.redemptionEmail(
      "Riya", [{ name: item.name, qty: 1, points: item.points, ref }],
      { totalPoints: item.points }, Math.max(0, availablePoints - item.points), "travel-extras",
    ).catch(() => { /* best-effort — reservation already confirmed on screen */ });
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
      // LIVE path: real Duffel test order, demo credits debited, order recorded
      // to account history, invoice emailed.
      const r = await travelApi.confirm(selectedOffer.offer_id, paymentMode);
      if (r.status !== "completed") {
        setConfirmError(r.rollback_reason || "The booking couldn't be completed.");
        return;
      }
      setConfirmation(r);
      setRawPoints(r.balance_after);
      setView("confirmation");
    } catch (e) {
      setConfirmError(e.message || "The booking couldn't be completed.");
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

  function toggleOrders() {
    const next = !showOrders;
    setShowOrders(next);
    if (next) {
      setOrders(null);
      travelApi.orders().then(setOrders).catch(() => setOrders([]));
    }
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
        <button className="tap" onClick={toggleOrders} style={{ display: "inline-flex", alignItems: "center", gap: 6,
          background: showOrders ? "var(--brand-100)" : "#fff", border: "1.5px solid var(--brand-200)", borderRadius: 999,
          padding: "8px 14px", cursor: "pointer", fontFamily: "var(--font)", fontWeight: 800, fontSize: 12.5,
          color: "var(--brand-700)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 9h6M9 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          My bookings
        </button>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>Riya · {cardName || "HDFC"}</div>
          <div className="num" style={{ fontSize: 15, fontWeight: 800, color: healthError ? "#B23A3A" : "var(--brand-700)" }}>
            {availablePoints == null ? (healthError ? "unavailable" : "…") : `${Number(availablePoints).toLocaleString("en-IN")} pts`}
          </div>
        </div>
      </div>

      {/* account order history — real redemption_history rows via /travel/orders */}
      {showOrders && (
        <div style={{ maxWidth: 1080, margin: "18px auto -8px", padding: "0 24px" }}>
          <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16, boxShadow: "var(--sh-md)",
            padding: "16px 20px", animation: "sheetUp .2s ease" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-700)", textTransform: "uppercase", marginBottom: 10 }}>
              My bookings
            </div>
            {orders == null ? (
              <div style={{ padding: "14px 4px", fontSize: 13, color: "var(--ink-3)" }}>Loading your bookings…</div>
            ) : orders.length === 0 ? (
              <div style={{ padding: "14px 4px", fontSize: 13, color: "var(--ink-3)" }}>No bookings yet — search a flight above to get started.</div>
            ) : orders.map((o) => (
              <div key={o.transaction_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px",
                borderTop: "1px solid var(--brand-50)", fontSize: 13.5 }}>
                <span style={{ fontSize: 15 }}>{o.status === "completed" ? "✅" : "✖"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    {o.status === "completed" ? `PNR ${o.booking_reference}` : (o.rollback_reason || "failed")}
                    {o.created_at ? ` · ${new Date(o.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </div>
                </div>
                <span className="num" style={{ fontWeight: 800, color: "var(--brand-700)", flexShrink: 0 }}>
                  {Number(o.points_used).toLocaleString("en-IN")} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
