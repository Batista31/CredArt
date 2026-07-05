/* CredArt — Travel Rewards search form (Flights tab) + tab bar + promo strip.
 * Hotels/Cars/Packages are polished "coming soon" placeholders — they visually
 * exist (per the Kobie/Navy-Federal reference portal's tab layout) but don't
 * search yet. */
import React from "react";
import { travelApi } from "../../lib/travelApi.js";

const TABS = [
  { key: "flights", label: "Flights", emoji: "✈️" },
  { key: "hotels", label: "Hotels", emoji: "🏨" },
  { key: "cars", label: "Cars", emoji: "🚗" },
  { key: "packages", label: "Packages", emoji: "🧳" },
];

const inputStyle = {
  width: "100%", fontFamily: "var(--font)", fontSize: 14, fontWeight: 600, color: "var(--ink)",
  padding: "11px 13px", borderRadius: 12, border: "1.5px solid var(--brand-100)",
  background: "#fff", outline: "none", boxSizing: "border-box",
};

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px", minWidth: 140, position: "relative" }}>
      <label style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-700)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* Search-as-you-type airport picker backed by GET /travel/airports. */
function AirportInput({ label, value, onChange, placeholder }) {
  const [query, setQuery] = React.useState(value?.label || "");
  const [options, setOptions] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef(null);

  React.useEffect(() => setQuery(value?.label || ""), [value]);

  function handleType(v) {
    setQuery(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await travelApi.airports(v);
        setOptions(r);
      } catch {
        setOptions([]);
      }
    }, 180);
  }

  return (
    <Field label={label}>
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={query}
        onFocus={() => handleType(query)}
        onChange={(e) => handleType(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff",
          border: "1px solid var(--brand-100)", borderRadius: 12, boxShadow: "var(--sh-md)", zIndex: 20,
          maxHeight: 220, overflowY: "auto" }}>
          {options.map((o) => (
            <div key={o.code} className="tap"
              onMouseDown={() => { onChange(o); setQuery(o.label); setOpen(false); }}
              style={{ padding: "9px 13px", fontSize: 13, fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}

function PromoCard({ icon, title, children }) {
  return (
    <div style={{ flex: "1 1 220px", background: "#fff", border: "1px solid var(--brand-100)", borderRadius: 16,
      padding: "16px 18px", boxShadow: "var(--sh-sm)" }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-800)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function ComingSoon({ label, emoji }) {
  return (
    <div style={{ background: "#fff", border: "1px dashed var(--brand-200)", borderRadius: 16, padding: "40px 24px",
      textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--brand-800)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 380, margin: "0 auto 16px", lineHeight: 1.55 }}>
        Coming soon in this demo — redeem points for {label.toLowerCase()} the same way you already redeem for flights.
      </div>
      <button disabled className="tap" style={{ padding: "10px 20px", borderRadius: 999, border: "1.5px solid var(--brand-200)",
        background: "var(--brand-50)", color: "var(--brand-400)", fontFamily: "var(--font)", fontWeight: 800,
        fontSize: 13, cursor: "not-allowed" }}>
        Search {label} — coming soon
      </button>
    </div>
  );
}

export function TravelSearchForm({ theme, availablePoints, onSearch, error }) {
  const [tab, setTab] = React.useState("flights");
  const [tripType, setTripType] = React.useState("round_trip");
  const [origin, setOrigin] = React.useState(null);
  const [destination, setDestination] = React.useState(null);
  const [departDate, setDepartDate] = React.useState("");
  const [returnDate, setReturnDate] = React.useState("");
  const [passengers, setPassengers] = React.useState(1);
  const [cabin, setCabin] = React.useState("economy");
  const [validation, setValidation] = React.useState("");

  const minDate = new Date().toISOString().slice(0, 10);

  function submit(e) {
    e.preventDefault();
    if (!origin || !destination) return setValidation("Pick both a departure and destination airport.");
    if (origin.code === destination.code) return setValidation("Origin and destination can't be the same.");
    if (!departDate) return setValidation("Pick a departure date.");
    if (tripType === "round_trip" && !returnDate) return setValidation("Pick a return date for a round trip.");
    if (tripType === "round_trip" && returnDate < departDate) return setValidation("Return date can't be before departure.");
    setValidation("");
    onSearch({
      trip_type: tripType, origin: origin.code, destination: destination.code,
      depart_date: departDate, return_date: tripType === "round_trip" ? returnDate : null,
      passengers, cabin_class: cabin,
      origin_label: origin.label, destination_label: destination.label,
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "var(--font)", fontSize: 26, fontWeight: 800, color: "var(--brand-900)", margin: "0 0 6px" }}>
          Travel
        </h1>
        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14 }}>
          Use your rewards for flights, hotels, rental cars, and vacation experiences.
        </p>
      </div>

      {/* search card */}
      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid var(--brand-100)", boxShadow: "var(--sh-md)",
        overflow: "hidden" }}>
        {/* tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--brand-100)" }}>
          {TABS.map((t) => (
            <button key={t.key} className="tap" onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: "13px 10px", border: "none", cursor: "pointer",
                background: tab === t.key ? "var(--brand-50)" : "#fff",
                borderBottom: tab === t.key ? "2.5px solid var(--brand-600)" : "2.5px solid transparent",
                color: tab === t.key ? "var(--brand-800)" : "var(--ink-2)",
                fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5 }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "22px 22px 24px" }}>
          {tab !== "flights" ? (
            <ComingSoon label={TABS.find((t) => t.key === tab).label} emoji={TABS.find((t) => t.key === tab).emoji} />
          ) : (
            <form onSubmit={submit}>
              {/* trip type */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {[["round_trip", "Round trip"], ["one_way", "One way"]].map(([key, label]) => (
                  <button key={key} type="button" className="tap" onClick={() => setTripType(key)}
                    style={{ padding: "7px 16px", borderRadius: 999, cursor: "pointer",
                      border: tripType === key ? "1.5px solid var(--brand-600)" : "1.5px solid var(--brand-100)",
                      background: tripType === key ? "var(--brand-600)" : "#fff",
                      color: tripType === key ? "#fff" : "var(--ink-2)",
                      fontFamily: "var(--font)", fontWeight: 700, fontSize: 12.5 }}>
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                <AirportInput label="From" value={origin} onChange={setOrigin} placeholder="City or airport" />
                <AirportInput label="To" value={destination} onChange={setDestination} placeholder="City or airport" />
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                <Field label="Departure date">
                  <input type="date" style={inputStyle} min={minDate} value={departDate}
                    onChange={(e) => setDepartDate(e.target.value)} />
                </Field>
                {tripType === "round_trip" && (
                  <Field label="Return date">
                    <input type="date" style={inputStyle} min={departDate || minDate} value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)} />
                  </Field>
                )}
                <Field label="Travelers">
                  <select style={inputStyle} value={passengers} onChange={(e) => setPassengers(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? "traveler" : "travelers"}</option>)}
                  </select>
                </Field>
                <Field label="Cabin class">
                  <select style={inputStyle} value={cabin} onChange={(e) => setCabin(e.target.value)}>
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </Field>
              </div>

              {(validation || error) && (
                <div style={{ marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: "#B23A3A",
                  background: "#FDECEC", border: "1px solid #F3C7C7", borderRadius: 10, padding: "8px 12px" }}>
                  ⚠ {validation || error}
                </div>
              )}

              <button type="submit" className="tap" style={{ padding: "12px 26px", borderRadius: 999, border: "none",
                background: theme.cardGrad, color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 14,
                cursor: "pointer" }}>
                Search flights →
              </button>
              <span style={{ marginLeft: 14, fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>
                You have <b className="num" style={{ color: "var(--brand-700)" }}>{Number(availablePoints).toLocaleString("en-IN")}</b> points available
              </span>
            </form>
          )}
        </div>
      </div>

      {/* below-search promo strip */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
        <PromoCard icon="🎯" title="Book with points">Redeem your full balance for flights — no cash needed at checkout.</PromoCard>
        <PromoCard icon="➕" title="Combine points + card">Short on points? Cover the rest with your card at checkout.</PromoCard>
        <PromoCard icon="📊" title="Compare redemption value">Every result shows ₹ value per point, so you always see the best deal.</PromoCard>
        <PromoCard icon="🤖" title="AI can help plan">Ask the CredArt concierge to explain a fare or pick the smartest option.</PromoCard>
      </div>
    </div>
  );
}
