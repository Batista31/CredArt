/* CredArt — floating AI concierge for the Travel Rewards page.
 *
 * Deliberately lightweight: it reads the CURRENT travel context (points
 * balance, selected route/dates, the selected offer, and the live results
 * list) through one `context` prop and narrates numbers that are ALREADY on
 * those objects — it never invents a points or ₹ figure itself. This is the
 * same anti-hallucination boundary the rest of the app uses; only the
 * candidate assembly differs (search results here vs. Layer 1 candidates
 * elsewhere).
 *
 * `context` is a clean, self-contained shape so the real CredArt concierge
 * (services/llm_service.py) can be wired in later just by swapping
 * `_localAnswer()` for a backend call — the panel, props, and state
 * management don't need to change.
 *
 * Visually mirrors CredArtBubble.jsx (pulsing launcher, slide-up panel, same
 * bubble shapes) so it feels native to the rest of the app, but runs its own
 * small deterministic engine scoped to flight offers instead of catalogue
 * items — reusing CredArtBubble's runConcierge would mean teaching it an
 * unrelated candidate shape (flight offers vs. catalogue rewards).
 */
import React from "react";
import { fmtPts, fmtInr, fmtDuration, explainOffer } from "../../lib/travelPoints.js";

function Bubble({ who, children }) {
  const bot = who === "bot";
  return (
    <div style={{
      maxWidth: "88%",
      background: bot ? "#fff" : "linear-gradient(160deg,var(--brand-600),var(--brand-700))",
      color: bot ? "var(--ink)" : "#fff",
      padding: "10px 13px", fontSize: 13.5, lineHeight: 1.45, fontWeight: 500,
      borderRadius: bot ? "16px 16px 16px 5px" : "16px 16px 5px 16px",
      boxShadow: bot ? "var(--sh-sm)" : "0 5px 14px rgba(18,59,107,0.28)",
      border: bot ? "1px solid var(--hairline)" : "none",
    }}>{children}</div>
  );
}

function Chip({ children, onClick }) {
  return (
    <button className="tap animate-chip" onClick={onClick} style={{
      background: "#fff", border: "1.5px solid var(--brand-200)", color: "var(--brand-700)",
      fontFamily: "var(--font)", fontWeight: 700, fontSize: 12, padding: "7px 11px",
      borderRadius: 999, boxShadow: "var(--sh-sm)", cursor: "pointer",
    }}>{children}</button>
  );
}

/* Deterministic local answers — every number quoted comes straight from
   `context`, never generated here. This is the seam a real LLM call would
   replace: swap this function for `services/llm_service.py` output, keep the
   same (context, question) -> string contract. */
function localAnswer(question, context) {
  const q = (question || "").toLowerCase();
  const { availablePoints, selectedOffer, results, origin, destination, tripType } = context;

  if (!selectedOffer && !results?.length) {
    return "Search for a flight first, and I can compare points vs. cash, recommend the best option, or summarize your trip.";
  }

  if (/best|recommend|which one|top pick/.test(q)) {
    const top = results?.find((o) => o.badges?.includes("Recommended")) || results?.[0];
    if (!top) return "Run a search and I'll point out the best option.";
    return `I'd go with ${top.airline} — ${fmtPts(top.points_required)} (${fmtInr(top.cash_price_inr)} cash equivalent), ` +
      `${fmtDuration(top.duration_minutes)} total. ${(top.badges || []).join(", ") || "Solid all-round pick"}.`;
  }

  if (/points vs cash|cash vs points|explain|why|breakdown/.test(q) && selectedOffer) {
    return explainOffer(selectedOffer, availablePoints);
  }

  if (/summar|trip|itinerary/.test(q)) {
    if (selectedOffer) {
      return `${selectedOffer.airline}, ${selectedOffer.origin} → ${selectedOffer.destination}` +
        `${tripType === "round_trip" ? " (round trip)" : ""}, ${selectedOffer.passengers} traveler(s), ` +
        `${fmtPts(selectedOffer.points_required)} or ${fmtPts(selectedOffer.points_plus_cash.points)} + ` +
        `${fmtInr(selectedOffer.points_plus_cash.cash_inr)}.`;
    }
    return `Searching ${origin || "your origin"} → ${destination || "your destination"}. Pick a result and I can summarize it.`;
  }

  if (/redeem now|save|wait|worth it/.test(q)) {
    if (selectedOffer) {
      if (selectedOffer.affordable && selectedOffer.badges?.includes("Best Value")) {
        return "This one's Best Value and fully affordable — I'd redeem now rather than wait, since fares like this don't stay put.";
      }
      if (!selectedOffer.affordable) {
        return "You're short on points for the full redemption — either use points + card now, or save up if you'd rather not add cash.";
      }
      return "This is a reasonable redemption. If you're not in a rush, keep an eye out for a Best Value badge on a similar route.";
    }
    return "Pick an offer and I'll weigh in on redeeming now vs. saving your points.";
  }

  return "I can explain points vs. cash for a selected offer, recommend the best result, or summarize your trip — just ask.";
}

export function TravelAIPanel({ theme, context, askSignal }) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState([
    { who: "bot", text: "Hi! I'm the CredArt travel concierge. Ask me to compare points vs. cash, recommend a flight, or summarize your trip." },
  ]);
  const [input, setInput] = React.useState("");
  const lastAskTs = React.useRef(null);
  const scroller = React.useRef(null);

  React.useEffect(() => {
    if (!askSignal || askSignal.ts === lastAskTs.current) return;
    lastAskTs.current = askSignal.ts;
    setOpen(true);
    const text = explainOffer(askSignal.offer, context.availablePoints);
    setMessages((m) => [...m, { who: "bot", text }]);
  }, [askSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, open]);

  function send(text) {
    const t = (text ?? input).trim();
    if (!t) return;
    setMessages((m) => [...m, { who: "user", text: t }]);
    setInput("");
    setTimeout(() => setMessages((m) => [...m, { who: "bot", text: localAnswer(t, context) }]), 260);
  }

  const chips = context.selectedOffer
    ? ["Explain points vs cash", "Should I redeem now?", "Summarize this trip"]
    : ["Recommend the best flight", "How do points vs cash work?"];

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 60 }}>
      {open && (
        <div className="animate-msg" style={{ position: "absolute", bottom: 74, right: 0, width: 340, maxWidth: "88vw",
          height: 440, background: "var(--bg)", borderRadius: 20, boxShadow: "0 24px 60px rgba(12,39,72,0.35)",
          border: "1px solid var(--brand-100)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ background: theme.cardGrad, color: "#fff", padding: "12px 16px", display: "flex",
            alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>CredArt Travel Concierge</div>
              <div style={{ fontSize: 10.5, opacity: 0.85 }}>Reads your live search — never guesses a number</div>
            </div>
            <button className="tap" onClick={() => setOpen(false)} style={{ background: "none", border: "none",
              color: "#fff", fontSize: 18, cursor: "pointer", padding: 4 }}>×</button>
          </div>
          <div ref={scroller} className="no-sb" style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex",
            flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.who === "bot" ? "flex-start" : "flex-end" }}>
                <Bubble who={m.who}>{m.text}</Bubble>
              </div>
            ))}
          </div>
          <div style={{ padding: "8px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {chips.map((c) => <Chip key={c} onClick={() => send(c)}>{c}</Chip>)}
          </div>
          <div style={{ padding: 12, display: "flex", gap: 8, borderTop: "1px solid var(--brand-100)" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about this trip…"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 999, border: "1.5px solid var(--brand-100)",
                fontFamily: "var(--font)", fontSize: 13, outline: "none" }} />
            <button className="tap" onClick={() => send()} style={{ width: 36, height: 36, borderRadius: "50%",
              border: "none", background: theme.cardGrad, color: "#fff", cursor: "pointer", fontSize: 15 }}>➤</button>
          </div>
        </div>
      )}
      <button className="tap" onClick={() => setOpen((o) => !o)} style={{ width: 58, height: 58, borderRadius: "50%",
        border: "none", background: theme.cardGrad, color: "#fff", fontSize: 24, cursor: "pointer",
        boxShadow: "0 12px 30px rgba(12,39,72,0.4)" }}>
        {open ? "×" : "🤖"}
      </button>
    </div>
  );
}
