/* CredArt — Travel Rewards search form (Flights tab) + tab bar + promo strip.
 * Hotels/Cars/Packages tabs redeem real catalogue rewards (same items, points
 * and images as the Rewards Catalogue store) — reserving debits real points
 * and is budget-gated, same as every other redemption surface in the app. */
import React from "react";
import { travelApi } from "../../lib/travelApi.js";
import { CATALOGUE, visualFor, onImgError, rewardImgStyle } from "../../lib/catalogue.js";

const fmtN = (n) => Number(n).toLocaleString("en-IN");

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

/* Curated non-flight travel rewards (hotels / cars / packages), pulled from the
   same hardcoded catalogue the store uses — so every name and points figure is
   real and identical across surfaces. */
const EXTRA_MATCH = {
  hotels: ["hotel", "stay", "night", "resort", "suite"],
  cars: ["rental", "zoomcar", "cab", "self-drive"],
  packages: ["package", "cruise", "tour", "getaway", "balloon"],
};
function extrasFor(tabKey) {
  const all = CATALOGUE.travel.map((it) => ({ ...it, category: "travel", ...visualFor({ ...it, category: "travel" }) }));
  const words = EXTRA_MATCH[tabKey] || [];
  return all.filter((i) => words.some((w) => i.name.toLowerCase().includes(w))).slice(0, 8);
}

/* One reward card — reserving debits real points off the visible balance
   (budget-gated) and persists via the parent's reserved/onReserve props. */
function ExtraCard({ item, availablePoints, reservedRef, onReserve }) {
  const over = availablePoints != null && item.points > availablePoints;
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid var(--brand-100)", overflow: "hidden",
      display: "flex", flexDirection: "column", boxShadow: "var(--sh-sm)" }}>
      <div style={{ position: "relative", height: 100, background: "var(--brand-50)" }}>
        <img src={item.image} alt={item.name} loading="lazy" onError={onImgError(item)}
          style={{ width: "100%", height: "100%", ...rewardImgStyle(item) }} />
        {over && !reservedRef && (
          <span style={{ position: "absolute", top: 8, left: 8, fontSize: 9.5, fontWeight: 800, color: "var(--amber)",
            background: "#fff", border: "1px solid rgba(242,162,59,0.5)", padding: "2px 8px", borderRadius: 999 }}>
            ⚠ {fmtN(item.points - availablePoints)} pts short
          </span>
        )}
      </div>
      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--brand-800)", lineHeight: 1.3, flex: 1 }}>{item.name}</div>
        <div className="num" style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-600)" }}>{fmtN(item.points)} pts</div>
        {reservedRef ? (
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)" }}>✓ Reserved · {reservedRef}</div>
        ) : (
          <button className="tap" disabled={over}
            onClick={() => onReserve(item)}
            title={over ? `You need ${fmtN(item.points - availablePoints)} more points` : "Reserve this reward"}
            style={{ padding: "7px 12px", borderRadius: 999, border: "none", fontFamily: "var(--font)", fontWeight: 800,
              fontSize: 11.5, cursor: over ? "not-allowed" : "pointer",
              color: over ? "var(--ink-3)" : "#fff",
              background: over ? "rgba(8,28,51,0.06)" : "linear-gradient(135deg,var(--brand-600),var(--brand-800))" }}>
            {over ? "Over budget" : "Reserve"}
          </button>
        )}
      </div>
    </div>
  );
}

function ExtrasGrid({ tabKey, label, emoji, availablePoints, reserved, onReserve }) {
  const items = extrasFor(tabKey);
  if (!items.length) return null;
  return (
    <div>
      <p style={{ margin: "0 0 16px", color: "var(--ink-2)", fontSize: 13 }}>
        {emoji} Real {label.toLowerCase()} rewards from the catalogue — same points, same budget honesty as flights.
      </p>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        {items.map((it) => (
          <ExtraCard key={it.id} item={it} availablePoints={availablePoints}
            reservedRef={reserved[it.id]} onReserve={onReserve} />
        ))}
      </div>
    </div>
  );
}

export function TravelSearchForm({ theme, availablePoints, onSearch, error, reserved = {}, onReserve }) {
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
            <ExtrasGrid tabKey={tab} label={TABS.find((t) => t.key === tab).label} emoji={TABS.find((t) => t.key === tab).emoji}
              availablePoints={availablePoints} reserved={reserved} onReserve={onReserve} />
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
                {availablePoints == null
                  ? "Loading your points balance…"
                  : <>You have <b className="num" style={{ color: "var(--brand-700)" }}>{Number(availablePoints).toLocaleString("en-IN")}</b> points available</>}
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
