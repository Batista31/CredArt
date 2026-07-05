/* CredArt — floating concierge bubble for the Rewards Catalogue.
 *
 * A pulsing circular button pinned to the bottom-right of the catalogue. Click
 * to slide up a chat panel. The panel runs a LOCAL intent engine over the
 * hardcoded catalogue (so every recommendation names a real item and redemption
 * is instant + reliable) and pings the real backend /chat only as best-effort
 * enrichment for open-ended text — falling back to a mocked reply when the
 * backend is unreachable.
 *
 * Positioned with `position:absolute` inside the catalogue's relative root (NOT
 * fixed), so it stays pinned inside the iPhone frame in the mobile view too.
 * Colours come from the indigo `--brand-*` theme vars set by App.jsx.
 */
import React from "react";
import { api } from "../lib/api.js";
import { travelApi } from "../lib/travelApi.js";
import { KobieAvatar } from "./Kobie.jsx";
import { runConcierge, greetingFor, CHAT_CHIPS, fmtPts, onImgError, rewardImgStyle } from "../lib/catalogue.js";

const fmt = (n) => Number(n).toLocaleString("en-IN");

function Bubble({ who, children }) {
  const bot = who === "bot";
  return (
    <div style={{
      maxWidth: "84%",
      background: bot ? "#fff" : "linear-gradient(160deg,var(--brand-600),var(--brand-700))",
      color: bot ? "var(--ink)" : "#fff",
      padding: "10px 13px", fontSize: 13.5, lineHeight: 1.45, fontWeight: 500,
      borderRadius: bot ? "16px 16px 16px 5px" : "16px 16px 5px 16px",
      boxShadow: bot ? "var(--sh-sm)" : "0 5px 14px rgba(55,48,163,0.28)",
      border: bot ? "1px solid var(--hairline)" : "none",
    }}>{children}</div>
  );
}

function Chip({ children, onClick, delay = 0 }) {
  return (
    <button className="tap animate-chip" onClick={onClick} style={{
      animationDelay: delay + "ms",
      background: "#fff", border: "1.5px solid var(--brand-200)", color: "var(--brand-700)",
      fontFamily: "var(--font)", fontWeight: 700, fontSize: 12.5, padding: "8px 12px",
      borderRadius: 999, boxShadow: "var(--sh-sm)", cursor: "pointer",
    }}>{children}</button>
  );
}

/* Small inline catalogue card inside the chat: thumb + name + points + actions.
   Over-budget items are flagged BEFORE the user tries anything — the shortfall
   is shown and Add is disabled, so nobody hits a dead end at checkout. */
function InlineItem({ item, budget, onAsk, onView }) {
  const affordable = item.points <= budget;
  const short = item.points - budget;
  return (
    <div style={{
      display: "flex", gap: 10, padding: 9, background: "#fff", borderRadius: 14,
      border: "1.5px solid var(--hairline)", boxShadow: "var(--sh-sm)",
      opacity: affordable ? 1 : 0.92 }}>
      <img src={item.image} alt={item.name} loading="lazy"
        onError={onImgError(item)}
        style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0,
          background: "var(--brand-100)", border: "1px solid var(--hairline)",
          filter: affordable ? "none" : "grayscale(0.5)", ...rewardImgStyle(item) }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink)", lineHeight: 1.25 }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span className="num" style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-600)" }}>{fmtPts(item.points)}</span>
          {!affordable && (
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--amber)", background: "var(--amber-bg)",
              padding: "2px 8px", borderRadius: 999 }}>⚠ {fmtPts(short)} short</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 1 }}>
          <button className="tap" disabled={!affordable} onClick={() => affordable && onAsk(item)}
            title={affordable ? "Add to cart" : `You need ${fmtPts(short)} more for this`}
            style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--font)", padding: "5px 10px", borderRadius: 999,
              border: "none", cursor: affordable ? "pointer" : "not-allowed",
              color: affordable ? "#fff" : "var(--ink-3)",
              background: affordable ? "linear-gradient(160deg,var(--brand-600),var(--brand-700))" : "rgba(8,28,51,0.06)" }}>
            {affordable ? "+ Add to Cart" : "Over budget"}
          </button>
          <button className="tap" onClick={() => onView(item)}
            style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font)", padding: "5px 10px", borderRadius: 999,
              border: "1px solid var(--brand-200)", background: "transparent", color: "var(--brand-700)", cursor: "pointer" }}>
            View in catalogue
          </button>
        </div>
      </div>
    </div>
  );
}

/* Inline LIVE-flight card in the chat: airline, route, times, points, badges +
   a Book (demo) button that redeems through the real backend endpoint. Every
   number shown comes straight off the Duffel-priced offer — the bubble never
   invents one. */
function InlineFlight({ offer, onBook, busy }) {
  const clock = (iso) => { try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
  const dur = Math.round(offer.duration_minutes);
  const durLabel = `${Math.floor(dur / 60)}h ${dur % 60}m`;
  return (
    <div style={{ padding: 10, background: "#fff", borderRadius: 14, border: "1.5px solid var(--hairline)",
      boxShadow: "var(--sh-sm)", opacity: offer.affordable ? 1 : 0.94 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink)" }}>{offer.airline}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 600, marginTop: 2 }}>
            {clock(offer.departing_at)} {offer.origin} → {clock(offer.arriving_at)} {offer.destination}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1 }}>
            {durLabel} · {offer.stops === 0 ? "Non-stop" : offer.stops + " stop"}
            {offer.trip_type === "round_trip" ? " · round trip" : ""}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
            {(offer.badges || []).map((b) => (
              <span key={b} style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
                background: "var(--brand-50)", color: "var(--brand-700)", border: "1px solid var(--brand-200)" }}>{b}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="num" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--brand-600)" }}>{fmtPts(offer.points_required)}</div>
          <div style={{ fontSize: 9.5, color: "var(--ink-3)" }}>₹{Number(offer.cash_price_inr).toLocaleString("en-IN")} value</div>
          {!offer.affordable && (
            <div style={{ fontSize: 9.5, color: "var(--amber)", fontWeight: 800, marginTop: 2 }}>points + cash</div>
          )}
        </div>
      </div>
      <button className="tap" disabled={busy} onClick={() => onBook(offer)}
        style={{ marginTop: 8, width: "100%", padding: "7px 0", borderRadius: 999, border: "none",
          cursor: busy ? "wait" : "pointer", color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 11.5,
          background: "linear-gradient(160deg,var(--brand-600),var(--brand-700))" }}>
        {offer.affordable ? "Book with points (demo)" : "Book with points + cash (demo)"}
      </button>
    </div>
  );
}

/* Per-persona conversation memory — a LIST of past conversations (newest
   first), so the bubble has a real chat history + "new chat", like the bank
   concierge. Survives closing the bubble / reloading the page. Stored
   client-side only (this store's points are a self-contained demo bucket
   already); never touches the bank chat's Redis-backed history. */
const CONVOS_KEY = (personaId) => `credart_bubble_convos_${personaId}`;
const HISTORY_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days — stale resumes aren't useful
const MAX_CONVOS = 8;

const newCid = () => `c${Date.now()}${Math.floor(Math.random() * 1e4)}`;

function loadConvos(personaId) {
  try {
    const raw = localStorage.getItem(CONVOS_KEY(personaId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((c) => c && c.cid && Array.isArray(c.messages)) : [];
  } catch { return []; }
}
function saveConvo(personaId, convo) {
  try {
    const rest = loadConvos(personaId).filter((c) => c.cid !== convo.cid);
    localStorage.setItem(CONVOS_KEY(personaId),
      JSON.stringify([{ ...convo, savedAt: Date.now() }, ...rest].slice(0, MAX_CONVOS)));
  } catch { /* storage unavailable — history just won't persist */ }
}

const relTime = (ts) => {
  const mins = Math.max(1, Math.round((Date.now() - (ts || Date.now())) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const convoTitle = (c) => {
  const firstUser = (c.messages || []).find((m) => m.who === "user" && m.text);
  if (!firstUser) return "New conversation";
  return firstUser.text.length > 44 ? firstUser.text.slice(0, 44) + "…" : firstUser.text;
};

/* One line of context for the resume prompt — "continue where you left off"
   shouldn't be a memory test. Mid-flight bookings name the route; otherwise
   the last thing the user asked is quoted. */
function describeConvo(c) {
  const when = relTime(c.savedAt);
  // mid-booking → name the route (the most useful thing to be reminded of)
  if (c.flow && c.flow.journey === "flight") {
    const d = c.flow.data || {};
    return `${when} you were booking a flight${d.dest ? ` to ${d.dest}` : ""}${d.origin ? ` from ${d.origin}` : ""}`;
  }
  // a finished flight search also deserves the route, not the last chip tap
  const flightMsg = [...(c.messages || [])].reverse().find((m) => m.flights && m.flights.length);
  if (flightMsg && flightMsg.flights[0]) {
    const f = flightMsg.flights[0];
    return `${when} you were comparing flights ${f.origin} → ${f.destination}`;
  }
  // otherwise the OPENING ask carries the intent — the last message is usually
  // just a chip answer ("Just me", "Round trip") that means nothing alone
  const firstUser = (c.messages || []).find((m) => m.who === "user" && m.text);
  if (firstUser) {
    const txt = firstUser.text.length > 48 ? firstUser.text.slice(0, 48) + "…" : firstUser.text;
    return `${when} you asked about “${txt}”`;
  }
  return `we spoke ${when}`;
}

export function CredArtBubble({ persona, balance, cartCount = 0, cartTotal = 0, onAddToCart, onViewItem, onCheckout, onSpend, onOpenTravel, view = "laptop" }) {
  const [open, setOpen] = React.useState(false);
  const idc = React.useRef(0);
  const nid = () => ++idc.current;
  const [messages, setMessages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [flow, setFlow] = React.useState(null);
  const [sessionId, setSessionId] = React.useState(null);
  // Holds the saved transcript while we wait for the user to pick "continue" vs
  // "start fresh" — kept out of `messages` until they choose so nothing renders twice.
  const [pendingResume, setPendingResume] = React.useState(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [convos, setConvos] = React.useState([]);
  const cid = React.useRef(newCid());
  const scroller = React.useRef(null);
  const seeded = React.useRef(null);

  // Live values in a ref so async handlers always read the latest (avoids stale
  // closures when the balance/cart changes mid-conversation).
  const balRef = React.useRef(balance);
  balRef.current = balance;
  const cartRef = React.useRef(cartTotal);
  cartRef.current = cartTotal;
  const cartCountRef = React.useRef(cartCount);
  cartCountRef.current = cartCount;
  const flowRef = React.useRef(flow);
  flowRef.current = flow;

  // (Re)seed the greeting whenever the persona changes — the whole point of the
  // demo is that the same bubble greets Riya and Samyak differently. If a prior
  // conversation for this persona was saved, ask before resuming — don't just
  // silently drop them into old context, and don't silently discard it either.
  React.useEffect(() => {
    if (seeded.current === persona.id) return;
    seeded.current = persona.id;
    setFlow(null); setSessionId(null); setPendingResume(null); setShowHistory(false);
    cid.current = newCid();
    const list = loadConvos(persona.id);
    const latest = list[0];
    const fresh = latest && latest.messages.length >= 2 &&
      Date.now() - (latest.savedAt || 0) < HISTORY_MAX_AGE_MS;
    if (fresh) {
      setMessages([{ id: nid(), who: "bot", resumePrompt: true,
        text: `Welcome back, ${persona.short} — ${describeConvo(latest)}. Continue where we left off, or start fresh?` }]);
      setPendingResume(latest);
    } else {
      setMessages([{ id: nid(), who: "bot", intro: true, text: greetingFor(persona, balRef.current) }]);
    }
  }, [persona.id]);

  React.useEffect(() => {
    const el = scroller.current; if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  // Persist the live transcript so it can be resumed / found in history later.
  // Skipped while a resume choice is pending so the transient prompt message
  // never overwrites the saved conversation it's asking about.
  React.useEffect(() => {
    if (pendingResume) return;
    if (messages.length < 2) return; // don't persist a bare greeting
    saveConvo(persona.id, { cid: cid.current, messages, flow, sessionId });
  }, [messages, flow, sessionId, pendingResume, persona.id]);

  function resumeConversation() {
    if (!pendingResume) return;
    cid.current = pendingResume.cid || newCid();
    setMessages(pendingResume.messages.map((m) => ({ ...m, id: nid() })));
    setFlow(pendingResume.flow || null);
    setSessionId(pendingResume.sessionId || null);
    setPendingResume(null);
  }
  /* "Start fresh" AND the header's New-chat button: a new conversation id +
     greeting. The previous conversation stays in history — nothing is lost. */
  function newChat() {
    cid.current = newCid();
    setMessages([{ id: nid(), who: "bot", intro: true, text: greetingFor(persona, balRef.current) }]);
    setFlow(null); setSessionId(null); setPendingResume(null); setShowHistory(false);
  }
  const startFresh = newChat;
  function openHistory() {
    setConvos(loadConvos(persona.id));
    setShowHistory((s) => !s);
  }
  function loadConversation(c) {
    cid.current = c.cid;
    setMessages(c.messages.map((m) => ({ ...m, id: nid() })));
    setFlow(c.flow || null);
    setSessionId(c.sessionId || null);
    setPendingResume(null); setShowHistory(false);
  }

  const push = (m) => setMessages((x) => [...x, { id: nid(), ...m }]);

  async function sendText(text) {
    if (!text || busy) return;
    push({ who: "user", text });
    setBusy(true);
    const local = runConcierge(text, { persona, balance: balRef.current, cartTotal: cartRef.current, cartCount: cartCountRef.current, flow: flowRef.current });
    setFlow(local.flow || null);

    // Chat-driven checkout: acknowledge, then launch the OTP-secured cart checkout.
    if (local.action === "checkout") {
      push({ who: "bot", text: local.reply });
      setBusy(false);
      if (onCheckout) { setOpen(false); onCheckout(); }
      return;
    }

    // Chat-driven flight booking: the slot-filling finished — hit the LIVE Duffel
    // search endpoint and render real flight cards inline (chat is the primary
    // booking surface; every points/₹ figure is computed server-side).
    if (local.action === "flight_search") {
      push({ who: "bot", text: local.reply });
      try {
        const r = await travelApi.searchFlights(local.flightParams);
        const flights = (r.results || []).slice(0, 3);
        if (!flights.length) {
          push({ who: "bot", text: "Hmm — no live flights came back for that route and date. Want to try different cities or dates?",
            chips: ["Book a flight", "Show me travel options"] });
        } else {
          push({ who: "bot",
            text: `Here are live options for ${r.origin} → ${r.destination}, real fares priced into points against your ${fmt(r.available_points)} travel points on ${r.card_name}. Tap to book (demo redemption):`,
            flights, chips: onOpenTravel ? ["Open full Travel page"] : [] });
        }
      } catch {
        push({ who: "bot", text: "I couldn't reach the live flight search just now — want me to show catalogue travel rewards instead?",
          chips: ["Show me travel options"] });
      }
      setBusy(false);
      return;
    }

    if (local.reply != null) {
      // Local engine handled it — coherent reply + real catalogue cards.
      push({ who: "bot", text: local.reply, items: local.items || [], chips: local.chips || [] });
      setBusy(false);
      return;
    }

    // No local intent: best-effort backend enrichment, else mocked fallback.
    try {
      const r = await api.chat(text, sessionId, null, persona.id);
      if (r && r.session_id) setSessionId(r.session_id);
      const reply = (r && r.reply) || local.fallbackReply;
      push({ who: "bot", text: reply, items: [], chips: local.chips || [] });
    } catch {
      push({ who: "bot", text: local.fallbackReply, items: [], chips: local.chips || [] });
    } finally {
      setBusy(false);
    }
  }

  function send() { const t = input.trim(); if (!t || busy) return; setInput(""); sendText(t); }

  /* Chip taps normally re-enter the concierge as text; a couple are UI actions
     (open the full Travel page) and are intercepted here instead. */
  function handleChip(c) {
    if (c === "Open full Travel page") { if (onOpenTravel) { setOpen(false); onOpenTravel(); } return; }
    sendText(c);
  }

  /* Book a live flight straight from the chat via the real backend endpoint.
     Points move server-side (Riya's replayable demo_points bucket); we mirror
     the spend onto the store header so the visible balance stays consistent. */
  async function handleBookFlight(offer) {
    if (busy) return;
    setBusy(true);
    const mode = offer.affordable ? "points" : "points_plus_cash";
    try {
      const r = await travelApi.demoConfirm(offer.offer_id, mode);
      if (r.status === "completed") {
        if (onSpend) onSpend(r.points_used);
        push({ who: "bot",
          text: `✅ Booked! ${offer.airline} ${offer.origin}→${offer.destination}. Demo PNR ${r.booking_reference}. Redeemed ${fmtPts(r.points_used)}${r.cash_due_inr ? ` + ₹${fmt(r.cash_due_inr)}` : ""} — a simulated redemption, no real ticket issued.`,
          chips: ["Book another flight", "Show me travel options"] });
      } else {
        push({ who: "bot", text: `That booking didn't go through: ${r.rollback_reason || "please try another option"}.`,
          chips: ["Book a flight"] });
      }
    } catch {
      push({ who: "bot", text: "The booking hit an error — please try again in a moment.", chips: ["Book a flight"] });
    } finally {
      setBusy(false);
    }
  }

  function handleAddToCart(item) {
    const res = onAddToCart(item); // parent adds to the per-persona cart
    if (!res || !res.ok) {
      push({ who: "bot", text: res && res.reason ? res.reason : "I couldn't add that to your cart — try another option." });
      return;
    }
    push({ who: "bot", text:
      `🛒 Added the ${item.name} (${fmtPts(item.points)}) to your cart — you now have ${res.count} item${res.count > 1 ? "s" : ""} ready. Just say “redeem my cart” and I'll check you out, or keep exploring.`,
      chips: ["Redeem my cart", ...CHAT_CHIPS.slice(1)] });
  }

  function handleView(item) { onViewItem && onViewItem(item); setOpen(false); }

  const mobile = view === "mobile";

  return (
    <>
      {/* ---------- floating launcher ---------- */}
      <button className="tap" onClick={() => setOpen((o) => !o)} title="CredArt concierge"
        style={{ position: "absolute", right: mobile ? 16 : 22, bottom: mobile ? 16 : 22, zIndex: 60,
          width: 62, height: 62, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
          background: "linear-gradient(155deg,var(--brand-500),var(--brand-700))",
          boxShadow: "0 12px 30px rgba(55,48,163,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* pulsing halo */}
        {!open && (
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--brand-400)",
            animation: "haloPulse 2.2s ease-out infinite", zIndex: -1 }} />
        )}
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 3l1.6 4.2L18 8.8l-4.4 1.6L12 15l-1.6-4.6L6 8.8l4.4-1.6L12 3z" fill="#fff" />
            <circle cx="18.5" cy="16.5" r="1.5" fill="#fff" opacity="0.9" />
            <circle cx="6" cy="16" r="1.1" fill="#fff" opacity="0.75" />
          </svg>
        )}
      </button>

      {/* ---------- chat panel ---------- */}
      {open && (
        <div style={{ position: "absolute", right: mobile ? 12 : 22, bottom: mobile ? 88 : 94, zIndex: 61,
          width: mobile ? "calc(100% - 24px)" : "min(400px, calc(100% - 44px))",
          height: mobile ? "calc(100% - 150px)" : "min(560px, calc(100% - 130px))",
          background: "#fff", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 26px 60px rgba(30,27,75,0.42), 0 0 0 1px rgba(0,0,0,0.05)",
          animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)" }}>

          {/* header */}
          <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff",
            padding: "13px 15px", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
            <KobieAvatar size={36} state="happy" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: -0.2 }}>CredArt Concierge</div>
              <div style={{ fontSize: 11, opacity: 0.8, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: "#5BE6A4" }} />
                {persona.short} · <span className="num">{fmt(balance)}</span> points
              </div>
            </div>
            {cartCount > 0 && (
              <span title={`${cartCount} in cart`} style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 5h2l1.5 11h10l1.5-8H7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.4" fill="#fff" /><circle cx="17" cy="20" r="1.4" fill="#fff" /></svg>
                <span className="num">{cartCount}</span>
              </span>
            )}
            <button className="tap" onClick={openHistory} title="Conversation history"
              style={{ background: showHistory ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#fff" strokeWidth="1.8" /><path d="M12 7.5V12l3 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="tap" onClick={newChat} title="New chat"
              style={{ background: "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
            <button className="tap" onClick={() => setOpen(false)} title="Close"
              style={{ background: "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </button>
          </div>

          {/* conversation history drawer — overlays the transcript, same panel */}
          {showHistory && (
            <div className="no-sb" style={{ position: "absolute", top: 62, left: 0, right: 0, bottom: 0, zIndex: 8,
              background: "var(--bg)", overflowY: "auto", padding: "14px 12px", animation: "sheetUp .2s ease" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--ink-3)", textTransform: "uppercase", margin: "2px 4px 10px" }}>
                Your conversations
              </div>
              {convos.length === 0 ? (
                <div style={{ padding: "26px 10px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
                  No saved conversations yet — say something and it'll be here next time.
                </div>
              ) : convos.map((c) => (
                <button key={c.cid} className="tap" onClick={() => loadConversation(c)} style={{ display: "block", width: "100%",
                  textAlign: "left", background: c.cid === cid.current ? "var(--brand-100)" : "#fff",
                  border: "1px solid var(--hairline)", borderRadius: 13, padding: "11px 13px", marginBottom: 8,
                  cursor: "pointer", fontFamily: "var(--font)", boxShadow: "var(--sh-sm)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {convoTitle(c)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {relTime(c.savedAt)} · {(c.messages || []).filter((m) => m.who === "user").length} message{(c.messages || []).filter((m) => m.who === "user").length === 1 ? "" : "s"}
                    {c.flow && c.flow.journey === "flight" ? " · flight booking in progress" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* messages */}
          <div ref={scroller} className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "14px 12px", background: "var(--bg)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {messages.map((m, mi) => (
                <div key={m.id} className="animate-msg" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: m.who === "user" ? "flex-end" : "flex-start" }}>
                  {m.text && (
                    <div style={{ display: "flex", gap: 7, alignItems: "flex-end", maxWidth: "100%", flexDirection: m.who === "user" ? "row-reverse" : "row" }}>
                      {m.who === "bot" && <KobieAvatar size={27} state={m.items && m.items.length ? "happy" : "idle"} />}
                      <Bubble who={m.who}>{m.text}</Bubble>
                    </div>
                  )}

                  {/* greeting quick chips */}
                  {m.intro && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, paddingLeft: 34 }}>
                      {CHAT_CHIPS.map((c, i) => <Chip key={c} delay={i * 60} onClick={() => handleChip(c)}>{c}</Chip>)}
                    </div>
                  )}

                  {/* resume-vs-fresh choice — shown once, before any saved history renders */}
                  {m.resumePrompt && pendingResume && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, paddingLeft: 34 }}>
                      <Chip onClick={resumeConversation}>Continue where I left off</Chip>
                      <Chip delay={60} onClick={startFresh}>Start fresh</Chip>
                    </div>
                  )}

                  {/* inline catalogue cards (budget-aware: over-budget flagged up front) */}
                  {m.items && m.items.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 34, width: "100%", maxWidth: "94%" }}>
                      {m.items.filter(Boolean).map((it) => (
                        <InlineItem key={it.id} item={it} budget={Math.max(0, balance - cartTotal)}
                          onAsk={handleAddToCart} onView={handleView} />
                      ))}
                    </div>
                  )}

                  {/* inline LIVE flight cards (real Duffel offers, book in-chat) */}
                  {m.flights && m.flights.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 34, width: "100%", maxWidth: "94%" }}>
                      {m.flights.map((o) => (
                        <InlineFlight key={o.offer_id} offer={o} onBook={handleBookFlight} busy={busy} />
                      ))}
                    </div>
                  )}

                  {/* follow-up chips (last message only) */}
                  {m.chips && m.chips.length > 0 && mi === messages.length - 1 && !busy && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, paddingLeft: 34 }}>
                      {m.chips.map((c, i) => <Chip key={c} delay={i * 55} onClick={() => handleChip(c)}>{c}</Chip>)}
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="animate-msg" style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
                  <KobieAvatar size={27} state="think" />
                  <div style={{ background: "#fff", borderRadius: "16px 16px 16px 5px", padding: "12px 15px", boxShadow: "var(--sh-sm)", border: "1px solid var(--hairline)", display: "flex", gap: 5 }}>
                    {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 99, background: "var(--brand-300)", animation: `thinkDot 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* input */}
          <div style={{ padding: "9px 12px 12px", background: "#fff", borderTop: "1px solid var(--hairline)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask CredArt about your points…"
                style={{ flex: 1, border: "none", background: "var(--bg)", borderRadius: 999, padding: "11px 15px",
                  fontFamily: "var(--font)", fontSize: 13.5, color: "var(--ink)", outline: "none" }} />
              <button className="tap" onClick={send} disabled={busy}
                style={{ width: 42, height: 42, borderRadius: 999, border: "none", flexShrink: 0,
                  opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer",
                  background: "linear-gradient(160deg,var(--brand-600),var(--brand-700))", display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 5px 12px rgba(55,48,163,0.3)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 12l16-8-6 8 6 8z" fill="#fff" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
