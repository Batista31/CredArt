/* CredArt — Travel Rewards display helpers.
 *
 * Every points/₹ number here is already computed by the backend (services/
 * flight_service.py's per-card conversion, reused by api/travel.py) — this
 * module only formats it for display. It never recomputes a price. */

export const fmtPts = (n) => `${Number(n || 0).toLocaleString("en-IN")} pts`;
export const fmtInr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function fmtDuration(minutes) {
  const m = Number(minutes) || 0;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

export function fmtClock(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export const stopsLabel = (n) => (n === 0 ? "Non-stop" : n === 1 ? "1 stop" : `${n} stops`);

/* Badge → colour, matching the rewards theme's semantic accents. */
export const BADGE_STYLE = {
  "Best Value": { bg: "var(--brand-50)", fg: "var(--brand-700)", border: "var(--brand-200)" },
  "Lowest Points": { bg: "#EAF7EE", fg: "#1D7A3B", border: "#BFE8CB" },
  "Fastest": { bg: "#FFF4E0", fg: "#8A5A00", border: "#F5DDA6" },
  "Recommended": { bg: "linear-gradient(135deg,var(--brand-600),var(--brand-700))", fg: "#fff", border: "transparent" },
};

/* Deterministic, backend-sourced explanation for the AI panel — every number
   quoted here comes straight off the selected offer, never invented client-side. */
export function explainOffer(offer, availablePoints) {
  if (!offer) return null;
  const remaining = availablePoints - offer.points_required;
  const affordable = offer.affordable;
  const bits = [];
  bits.push(
    `This ${offer.trip_type === "round_trip" ? "round trip" : "one-way"} on ${offer.airline} uses ` +
    `${fmtPts(offer.points_required)} (${fmtInr(offer.cash_price_inr)} cash equivalent, incl. ` +
    `${fmtInr(offer.taxes_fees_inr)} taxes/fees).`
  );
  if (affordable) {
    bits.push(`You have enough points — that leaves you with ${fmtPts(remaining)}.`);
  } else {
    bits.push(`You're ${fmtPts(offer.points_required - availablePoints)} short of the full-points price — the points + cash option needs only ${fmtPts(offer.points_plus_cash.points)} plus ${fmtInr(offer.points_plus_cash.cash_inr)}.`);
  }
  if (offer.badges?.includes("Best Value")) {
    bits.push(`It's marked Best Value because its ₹${offer.value_per_point_inr.toFixed(2)}-per-point rate is the best in this result set.`);
  } else if (offer.badges?.includes("Lowest Points")) {
    bits.push("It's the lowest points price among these results.");
  } else if (offer.badges?.includes("Fastest")) {
    bits.push(`It's the fastest option at ${fmtDuration(offer.duration_minutes)} total.`);
  }
  return bits.join(" ");
}
