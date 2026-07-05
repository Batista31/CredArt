/* CredArt — Travel Rewards demo booking confirmation. */
import React from "react";
import { fmtPts, fmtInr } from "../../lib/travelPoints.js";

export function TravelConfirmation({ theme, confirmation, offer, onDone }) {
  const failed = confirmation.status !== "completed";
  return (
    <div style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 18px",
        background: failed ? "#FDECEC" : "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 34 }}>
        {failed ? "⚠️" : "✅"}
      </div>
      <h2 style={{ fontFamily: "var(--font)", fontSize: 22, fontWeight: 800, color: "var(--brand-900)", margin: "0 0 8px" }}>
        {failed ? "Redemption didn't go through" : "Booking confirmed"}
      </h2>
      <p style={{ margin: "0 0 20px", color: "var(--ink-2)", fontSize: 13.5 }}>
        {failed
          ? (confirmation.rollback_reason || "Something went wrong with this simulated redemption.")
          : "This is a simulated redemption for demo purposes — no real flight was booked."}
      </p>

      {!failed && (
        <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16, padding: 22,
          boxShadow: "var(--sh-md)", textAlign: "left" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-700)", textTransform: "uppercase", marginBottom: 10 }}>
            Booking reference (demo PNR)
          </div>
          <div className="num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, marginBottom: 16 }}>
            {confirmation.booking_reference}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0",
            borderTop: "1px solid var(--brand-50)" }}>
            <span style={{ color: "var(--ink-2)" }}>Route</span>
            <span style={{ fontWeight: 700 }}>{offer.origin} → {offer.destination}{offer.trip_type === "round_trip" ? " (round trip)" : ""}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0",
            borderTop: "1px solid var(--brand-50)" }}>
            <span style={{ color: "var(--ink-2)" }}>Points deducted (demo)</span>
            <span className="num" style={{ fontWeight: 800, color: "var(--brand-700)" }}>{fmtPts(confirmation.points_used)}</span>
          </div>
          {confirmation.cash_due_inr > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0",
              borderTop: "1px solid var(--brand-50)" }}>
              <span style={{ color: "var(--ink-2)" }}>Cash due (demo)</span>
              <span style={{ fontWeight: 700 }}>{fmtInr(confirmation.cash_due_inr)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0",
            borderTop: "1px solid var(--brand-50)" }}>
            <span style={{ color: "var(--ink-2)" }}>Points balance after</span>
            <span className="num" style={{ fontWeight: 800 }}>{fmtPts(confirmation.balance_after)}</span>
          </div>
        </div>
      )}

      <button className="tap" onClick={onDone} style={{ marginTop: 22, padding: "12px 26px", borderRadius: 999,
        border: "none", background: theme.cardGrad, color: "#fff", fontFamily: "var(--font)", fontWeight: 800,
        fontSize: 14, cursor: "pointer" }}>
        Back to Travel
      </button>
    </div>
  );
}
