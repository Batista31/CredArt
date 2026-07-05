/* CredArt — Travel Rewards results page: filter/sort panel + result cards. */
import React from "react";
import { fmtPts, fmtInr, fmtDuration, fmtClock, stopsLabel, BADGE_STYLE } from "../../lib/travelPoints.js";

const SORTS = [
  { key: "recommended", label: "Recommended" },
  { key: "lowest_points", label: "Lowest Points" },
  { key: "shortest_duration", label: "Shortest Duration" },
  { key: "best_value", label: "Best Value" },
];

function Badge({ label }) {
  const s = BADGE_STYLE[label] || { bg: "var(--brand-50)", fg: "var(--brand-700)", border: "var(--brand-200)" };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
      background: s.bg, color: s.fg, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16, padding: 18,
      display: "flex", gap: 18, alignItems: "center" }}>
      <div className="cr-skeleton" style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="cr-skeleton" style={{ width: "40%", height: 14 }} />
        <div className="cr-skeleton" style={{ width: "70%", height: 12 }} />
      </div>
      <div className="cr-skeleton" style={{ width: 90, height: 34, borderRadius: 999 }} />
    </div>
  );
}

function ResultCard({ offer, onView, onAskAi }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16, padding: "16px 18px",
      boxShadow: "var(--sh-sm)", opacity: offer.affordable ? 1 : 0.85 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--brand-50)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800,
          color: "var(--brand-700)" }}>
          {offer.airline_iata || offer.airline.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: "2 1 220px", minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ink)", marginBottom: 3 }}>{offer.airline}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
            {fmtClock(offer.departing_at)} {offer.origin} → {fmtClock(offer.arriving_at)} {offer.destination}
            {offer.trip_type === "round_trip" && (
              <> · return {fmtClock(offer.return_departing_at)} {offer.destination} → {fmtClock(offer.return_arriving_at)} {offer.origin}</>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
            {fmtDuration(offer.duration_minutes)} total · {stopsLabel(offer.stops)}
            {offer.trip_type === "round_trip" && offer.return_stops != null && <> outbound / {stopsLabel(offer.return_stops)} return</>}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {(offer.badges || []).map((b) => <Badge key={b} label={b} />)}
          </div>
        </div>
        <div style={{ flex: "1 1 160px", textAlign: "right", minWidth: 150 }}>
          <div className="num" style={{ fontSize: 19, fontWeight: 800, color: "var(--brand-700)" }}>{fmtPts(offer.points_required)}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {fmtInr(offer.cash_price_inr)} cash equiv. · +{fmtInr(offer.taxes_fees_inr)} taxes/fees
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            or {fmtPts(offer.points_plus_cash.points)} + {fmtInr(offer.points_plus_cash.cash_inr)}
          </div>
          {!offer.affordable && (
            <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 800, color: "var(--amber, #B98A1E)" }}>
              ⚠ short on points — try points + cash
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
        <button className="tap" onClick={() => onAskAi(offer)} style={{ padding: "8px 14px", borderRadius: 999,
          border: "1.5px solid var(--brand-200)", background: "#fff", color: "var(--brand-700)",
          fontFamily: "var(--font)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          🤖 Ask AI
        </button>
        <button className="tap" onClick={() => onView(offer)} style={{ padding: "8px 18px", borderRadius: 999,
          border: "none", background: "linear-gradient(160deg,var(--brand-600),var(--brand-700))", color: "#fff",
          fontFamily: "var(--font)", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
          View Details
        </button>
      </div>
    </div>
  );
}

export function TravelResults({ search, results, loading, error, sort, onSortChange, filters, onFiltersChange,
                                availablePoints, onView, onAskAi, onNewSearch }) {
  const stopsOptions = [
    { key: "any", label: "Any stops" },
    { key: "nonstop", label: "Non-stop only" },
    { key: "max1", label: "Up to 1 stop" },
  ];
  const airlines = React.useMemo(() => Array.from(new Set(results.map((r) => r.airline))).sort(), [results]);

  const visible = React.useMemo(() => {
    return results.filter((o) => {
      if (filters.stops === "nonstop" && o.stops !== 0) return false;
      if (filters.stops === "max1" && o.stops > 1) return false;
      if (filters.airline && filters.airline !== "any" && o.airline !== filters.airline) return false;
      if (filters.maxPoints && o.points_required > filters.maxPoints) return false;
      return true;
    });
  }, [results, filters]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <button className="tap" onClick={onNewSearch} style={{ border: "none", background: "none", cursor: "pointer",
            color: "var(--brand-600)", fontWeight: 800, fontSize: 12.5, padding: 0, marginBottom: 6 }}>
            ← New search
          </button>
          <h2 style={{ margin: 0, fontFamily: "var(--font)", fontSize: 19, fontWeight: 800, color: "var(--brand-900)" }}>
            {search.origin} → {search.destination}
            {search.trip_type === "round_trip" ? " · Round trip" : " · One way"}
          </h2>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
            {search.passengers} traveler{search.passengers > 1 ? "s" : ""} · {search.cabin_class.replace("_", " ")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 700, textTransform: "uppercase" }}>Available points</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, color: "var(--brand-700)" }}>
            {Number(availablePoints).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* filter & sort */}
      <div style={{ background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 14, padding: "12px 16px",
        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-700)" }}>Filter & Sort</span>
        <select value={filters.stops} onChange={(e) => onFiltersChange({ ...filters, stops: e.target.value })}
          style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--brand-100)" }}>
          {stopsOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select value={filters.airline || "any"} onChange={(e) => onFiltersChange({ ...filters, airline: e.target.value })}
          style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--brand-100)" }}>
          <option value="any">All airlines</option>
          {airlines.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 700 }}>Sort:</span>
        {SORTS.map((s) => (
          <button key={s.key} className="tap" onClick={() => onSortChange(s.key)}
            style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: sort === s.key ? "1.5px solid var(--brand-600)" : "1.5px solid var(--brand-100)",
              background: sort === s.key ? "var(--brand-600)" : "#fff",
              color: sort === s.key ? "#fff" : "var(--ink-2)",
              fontFamily: "var(--font)", fontWeight: 700, fontSize: 11.5 }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--ink-2)" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Couldn't load flights</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>{error}</div>
          <button className="tap" onClick={onNewSearch} style={{ padding: "9px 18px", borderRadius: 999, border: "none",
            background: "var(--brand-600)", color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13,
            cursor: "pointer" }}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--ink-2)" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🔍</div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>No flights match your filters</div>
          <div style={{ fontSize: 13 }}>Try widening your stops or airline filter.</div>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((o) => <ResultCard key={o.offer_id} offer={o} onView={onView} onAskAi={onAskAi} />)}
        </div>
      )}
    </div>
  );
}
