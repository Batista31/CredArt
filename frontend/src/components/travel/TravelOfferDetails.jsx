/* CredArt — Travel Rewards offer review page: itinerary, fare summary, points
 * breakdown, payment mode, and the demo redemption confirm action. */
import React from "react";
import { fmtPts, fmtInr, fmtDuration, fmtClock, fmtDate, stopsLabel } from "../../lib/travelPoints.js";

function Row({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0",
      borderBottom: "1px solid var(--brand-50)", fontSize: 13.5 }}>
      <span style={{ color: "var(--ink-2)", fontWeight: strong ? 800 : 600 }}>{label}</span>
      <span className="num" style={{ color: strong ? "var(--brand-700)" : "var(--ink)", fontWeight: strong ? 800 : 700 }}>{value}</span>
    </div>
  );
}

function Leg({ title, depart, arrive, from, to, stops, duration }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand-600)", textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{fmtClock(depart)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{from}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtDuration(duration)}</div>
          <div style={{ height: 1, background: "var(--brand-100)", margin: "4px 0" }} />
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{stopsLabel(stops)}</div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{fmtClock(arrive)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{to}</div>
        </div>
      </div>
    </div>
  );
}

export function TravelOfferDetails({ theme, offer, availablePoints, cardName, onBack, onConfirm, confirming, confirmError }) {
  const [mode, setMode] = React.useState(offer.affordable ? "points" : "points_plus_cash");
  const pointsUsed = mode === "points_plus_cash" ? offer.points_plus_cash.points : offer.points_required;
  const cashDue = mode === "points_plus_cash" ? offer.points_plus_cash.cash_inr : 0;
  const remaining = availablePoints - pointsUsed;
  const sufficient = remaining >= 0;

  return (
    <div>
      <button className="tap" onClick={onBack} style={{ border: "none", background: "none", cursor: "pointer",
        color: "var(--brand-600)", fontWeight: 800, fontSize: 12.5, padding: 0, marginBottom: 14 }}>
        ← Back to results
      </button>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* itinerary + fare */}
        <div style={{ flex: "2 1 380px", minWidth: 320 }}>
          <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16, padding: 20,
            boxShadow: "var(--sh-sm)", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{offer.airline}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtDate(offer.departing_at)}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 700 }}>
                {offer.passengers} traveler{offer.passengers > 1 ? "s" : ""} · {offer.cabin_class.replace("_", " ")}
              </div>
            </div>
            <Leg title="Outbound" depart={offer.departing_at} arrive={offer.arriving_at}
              from={offer.origin} to={offer.destination} stops={offer.stops} duration={
                offer.trip_type === "round_trip" ? offer.duration_minutes / 2 : offer.duration_minutes} />
            {offer.trip_type === "round_trip" && (
              <Leg title="Return" depart={offer.return_departing_at} arrive={offer.return_arriving_at}
                from={offer.destination} to={offer.origin} stops={offer.return_stops}
                duration={offer.duration_minutes / 2} />
            )}
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink-3)", background: "var(--brand-50)",
              borderRadius: 10, padding: "8px 12px" }}>
              Fare rules: non-refundable demo fare · date changes not supported in this demo · cancellations
              are simulated instantly and never charge real points.
            </div>
          </div>
        </div>

        {/* points breakdown + confirm */}
        <div style={{ flex: "1 1 300px", minWidth: 280 }}>
          <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16, padding: 20,
            boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10, color: "var(--brand-800)" }}>Points breakdown</div>
            <Row label="Available points" value={fmtPts(availablePoints)} />
            <Row label="Cash equivalent" value={fmtInr(offer.cash_price_inr)} />
            <Row label="Taxes & fees" value={fmtInr(offer.taxes_fees_inr)} />
            <Row label="Required points (full)" value={fmtPts(offer.points_required)} />
            <Row label="Points used now" value={fmtPts(pointsUsed)} strong />
            {mode === "points_plus_cash" && <Row label="Cash due at booking" value={fmtInr(cashDue)} strong />}
            <Row label="Remaining points after" value={fmtPts(Math.max(0, remaining))} strong />

            <div style={{ margin: "16px 0 10px", fontSize: 12, fontWeight: 800, color: "var(--brand-700)", textTransform: "uppercase" }}>
              Payment mode
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 12px", borderRadius: 10,
                border: `1.5px solid ${mode === "points" ? "var(--brand-600)" : "var(--brand-100)"}`, cursor: offer.affordable ? "pointer" : "not-allowed",
                opacity: offer.affordable ? 1 : 0.5, fontSize: 12.5, fontWeight: 700 }}>
                <input type="radio" checked={mode === "points"} disabled={!offer.affordable} onChange={() => setMode("points")} />
                Use all points ({fmtPts(offer.points_required)})
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 12px", borderRadius: 10,
                border: `1.5px solid ${mode === "points_plus_cash" ? "var(--brand-600)" : "var(--brand-100)"}`, cursor: "pointer",
                fontSize: 12.5, fontWeight: 700 }}>
                <input type="radio" checked={mode === "points_plus_cash"} onChange={() => setMode("points_plus_cash")} />
                Points + card ({fmtPts(offer.points_plus_cash.points)} + {fmtInr(offer.points_plus_cash.cash_inr)})
              </label>
            </div>

            {!sufficient && (
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "#B23A3A", background: "#FDECEC",
                borderRadius: 10, padding: "8px 12px" }}>
                Not enough points for this payment mode — switch to points + card.
              </div>
            )}
            {confirmError && (
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "#B23A3A", background: "#FDECEC",
                borderRadius: 10, padding: "8px 12px" }}>
                {confirmError}
              </div>
            )}

            <button className="tap" disabled={!sufficient || confirming}
              onClick={() => onConfirm(mode)}
              style={{ marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 999, border: "none",
                background: sufficient ? theme.cardGrad : "var(--brand-100)",
                color: sufficient ? "#fff" : "var(--ink-3)", fontFamily: "var(--font)", fontWeight: 800, fontSize: 14,
                cursor: sufficient && !confirming ? "pointer" : "not-allowed" }}>
              {confirming ? "Booking…" : "Confirm Demo Redemption"}
            </button>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", textAlign: "center" }}>
              Card on file: HDFC {cardName} · simulated redemption, no real booking is made
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
