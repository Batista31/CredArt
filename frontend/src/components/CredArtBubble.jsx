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
import { KobieAvatar } from "./Kobie.jsx";
import { runConcierge, greetingFor, CHAT_CHIPS, CATEGORY_META, fmtPts, onImgError, rewardImgStyle } from "../lib/catalogue.js";

const fmt = (n) => Number(n).toLocaleString("en-IN");
const newSessionId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2));

/* ------------------------------------------------------------------ */
/* Past-chats index — a small localStorage pointer list (per persona) into  */
/* the REAL transcripts, which live server-side via /concierge/history      */
/* (Redis-backed, see session.py). The index just remembers WHICH sessions  */
/* exist and their titles/timestamps so the clock button has something to   */
/* list instantly; the messages themselves are always fetched fresh from     */
/* the server when a past chat is opened.                                    */
/* ------------------------------------------------------------------ */
const chatsKey = (personaId) => `credart:chats:${personaId}`;
function loadChatIndex(personaId) {
  try { return JSON.parse(localStorage.getItem(chatsKey(personaId)) || "[]"); } catch { return []; }
}
function saveChatIndex(personaId, list) {
  try { localStorage.setItem(chatsKey(personaId), JSON.stringify(list.slice(0, 20))); } catch { /* ignore quota errors */ }
}
function titleFor(messages) {
  const firstUser = messages.find((m) => m.who === "user");
  const text = (firstUser && firstUser.text) || "New conversation";
  return text.length > 44 ? text.slice(0, 44) + "…" : text;
}
function timeAgo(ts) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

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
function InlineItem({ item, budget, cartQty = 0, onAsk, onChangeQty, onView }) {
  const affordable = item.points <= budget;
  const short = item.points - budget;
  const inCart = cartQty > 0;
  return (
    <div style={{
      display: "flex", gap: 10, padding: 9, background: "#fff", borderRadius: 14,
      border: "1.5px solid var(--hairline)", boxShadow: "var(--sh-sm)",
      opacity: affordable || inCart ? 1 : 0.92 }}>
      <img src={item.image} alt={item.name} loading="lazy"
        onError={onImgError(item)}
        style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0,
          background: "var(--brand-100)", border: "1px solid var(--hairline)",
          filter: affordable || inCart ? "none" : "grayscale(0.5)", ...rewardImgStyle(item) }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink)", lineHeight: 1.25 }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span className="num" style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-600)" }}>{fmtPts(item.points)}</span>
          {!affordable && !inCart && (
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--amber)", background: "var(--amber-bg)",
              padding: "2px 8px", borderRadius: 999 }}>⚠ {fmtPts(short)} short</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 1, alignItems: "center" }}>
          {inCart ? (
            /* Already in cart — a +/- quantity stepper instead of Add. Incrementing
               is budget-gated by onChangeQty, same rule as the cart panel. */
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button className="tap" onClick={() => onChangeQty(item, -1)} title="Decrease quantity"
                style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--brand-200)", background: "#fff",
                  color: "var(--brand-700)", cursor: "pointer", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>−</button>
              <span className="num" style={{ minWidth: 14, textAlign: "center", fontSize: 11.5, fontWeight: 800, color: "var(--ink)" }}>{cartQty}</span>
              <button className="tap" onClick={() => onChangeQty(item, 1)} title="Increase quantity"
                style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--brand-200)", background: "#fff",
                  color: "var(--brand-700)", cursor: "pointer", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>+</button>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)" }}>in cart</span>
            </div>
          ) : (
            <button className="tap" disabled={!affordable} onClick={() => affordable && onAsk(item)}
              title={affordable ? "Add to cart" : `You need ${fmtPts(short)} more for this`}
              style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--font)", padding: "5px 10px", borderRadius: 999,
                border: "none", cursor: affordable ? "pointer" : "not-allowed",
                color: affordable ? "#fff" : "var(--ink-3)",
                background: affordable ? "linear-gradient(160deg,var(--brand-600),var(--brand-700))" : "rgba(8,28,51,0.06)" }}>
              {affordable ? "+ Add to Cart" : "Over budget"}
            </button>
          )}
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

export function CredArtBubble({ persona, balance, cartCount = 0, cartTotal = 0, cart = [],
  onAddToCart, onChangeQty, onViewItem, onCheckout, view = "laptop" }) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const idc = React.useRef(0);
  const nid = () => ++idc.current;
  const [messages, setMessages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [flow, setFlow] = React.useState(null);
  const [sessionId, setSessionId] = React.useState(newSessionId());
  const [conversationId, setConversationId] = React.useState(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [chatIndex, setChatIndex] = React.useState(() => loadChatIndex(persona.id));
  const scroller = React.useRef(null);
  const seeded = React.useRef(null);
  const saveTimer = React.useRef(null);

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
  // demo is that the same bubble greets Riya and Samyak differently. The
  // greeting is patched with the LIVE balance so it never states a stale number.
  React.useEffect(() => {
    if (seeded.current === persona.id) return;
    seeded.current = persona.id;
    setMessages([{ id: nid(), who: "bot", intro: true, text: greetingFor(persona, balRef.current) }]);
    setFlow(null); setSessionId(newSessionId()); setConversationId(null); setHistoryOpen(false);
    setChatIndex(loadChatIndex(persona.id));
  }, [persona.id]);

  React.useEffect(() => {
    const el = scroller.current; if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  /* Autosave: every turn (debounced) is persisted to Redis via /concierge/history
     (falls back to in-memory server-side if Redis isn't configured — see
     session.py). Skips the bare greeting so an untouched conversation never
     clutters the history list. Silent on failure — nothing is lost locally,
     it just won't show up in "past chats" until the backend is reachable. */
  React.useEffect(() => {
    if (messages.length <= 1) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.saveConciergeHistory(sessionId, persona.id,
          messages.map(({ id, ...m }) => m), conversationId);
        setChatIndex((list) => {
          const next = [{ sessionId, conversationId, title: titleFor(messages), updatedAt: Date.now(), count: messages.length },
            ...list.filter((c) => c.sessionId !== sessionId)];
          saveChatIndex(persona.id, next);
          return next;
        });
      } catch { /* offline — silently skip */ }
    }, 900);
    return () => clearTimeout(saveTimer.current);
  }, [messages, conversationId, sessionId, persona.id]);

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

    if (local.reply != null) {
      // Local engine handled it — coherent reply + real catalogue cards.
      push({ who: "bot", text: local.reply, items: local.items || [], chips: local.chips || [] });
      setBusy(false);
      return;
    }

    // No local intent: best-effort backend enrichment, else mocked fallback.
    // conversationId is threaded through so the backend's dialogue manager
    // resumes the SAME conversation (and passes its full history to the LLM)
    // instead of starting a fresh, context-less one on every enrichment call.
    try {
      const r = await api.chat(text, sessionId, conversationId, persona.id);
      if (r && r.session_id) setSessionId(r.session_id);
      if (r && r.conversation_id) setConversationId(r.conversation_id);
      const reply = (r && r.reply) || local.fallbackReply;
      push({ who: "bot", text: reply, items: [], chips: local.chips || [] });
    } catch {
      push({ who: "bot", text: local.fallbackReply, items: [], chips: local.chips || [] });
    } finally {
      setBusy(false);
    }
  }

  function send() { const t = input.trim(); if (!t || busy) return; setInput(""); sendText(t); }

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

  /* +/- from an inline chat card. Budget honesty applies here exactly like the
     cart panel: an increase that would exceed the balance is rejected with a
     clear reason instead of silently failing or overspending. */
  function handleChangeQty(item, delta) {
    const res = onChangeQty(item.id, delta);
    if (!res || !res.ok) {
      push({ who: "bot", text: res && res.reason ? res.reason : `I can't change the quantity for ${item.name} right now.` });
    }
  }

  function handleView(item) { onViewItem && onViewItem(item); setOpen(false); }

  /* ---------- header actions: new chat / past chats / resize ---------- */
  function startNewConversation() {
    setMessages([{ id: nid(), who: "bot", intro: true, text: greetingFor(persona, balRef.current) }]);
    setFlow(null); setSessionId(newSessionId()); setConversationId(null); setHistoryOpen(false);
  }

  async function openPastChat(entry) {
    try {
      const r = await api.conciergeHistory(entry.sessionId);
      if (r && r.messages && r.messages.length) {
        setMessages(r.messages.map((m) => ({ id: nid(), ...m })));
        setSessionId(r.session_id || entry.sessionId);
        setConversationId(r.conversation_id || entry.conversationId || null);
        setFlow(null);
      } else {
        push({ who: "bot", text: "That conversation isn't on the server anymore — it may have expired." });
      }
    } catch {
      push({ who: "bot", text: "Couldn't reach the server to load that conversation." });
    }
    setHistoryOpen(false);
  }

  const mobile = view === "mobile";
  const panelW = expanded ? "min(560px, calc(100% - 24px))" : (mobile ? "calc(100% - 24px)" : "min(400px, calc(100% - 44px))");
  const panelH = expanded ? "min(760px, calc(100% - 60px))" : (mobile ? "calc(100% - 150px)" : "min(560px, calc(100% - 130px))");

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
          width: panelW, height: panelH,
          background: "#fff", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 26px 60px rgba(30,27,75,0.42), 0 0 0 1px rgba(0,0,0,0.05)",
          transition: "width .22s ease, height .22s ease",
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
            <button className="tap" onClick={startNewConversation} title="New chat"
              style={{ background: "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1 }}>
              +
            </button>
            <button className="tap" onClick={() => setHistoryOpen((h) => !h)} title="Past chats"
              style={{ background: historyOpen ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.8" /><path d="M12 7v5l3.5 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="tap" onClick={() => setExpanded((e) => !e)} title={expanded ? "Shrink" : "Enlarge"}
              style={{ background: "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              {expanded ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </button>
            <button className="tap" onClick={() => setOpen(false)} title="Close"
              style={{ background: "rgba(255,255,255,0.16)", border: "none", width: 30, height: 30, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </button>
          </div>

          {/* past-chats dropdown — real transcripts fetched fresh from the server */}
          {historyOpen && (
            <div className="no-sb" style={{ maxHeight: 200, overflowY: "auto", background: "#fff",
              borderBottom: "1px solid var(--hairline)", flexShrink: 0 }}>
              {chatIndex.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ink-3)" }}>No saved conversations yet — chats autosave as you go.</div>
              ) : chatIndex.map((c) => (
                <button key={c.sessionId} className="tap" onClick={() => openPastChat(c)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "9px 14px",
                    border: "none", borderBottom: "1px solid var(--hairline)", background: c.sessionId === sessionId ? "var(--brand-50)" : "#fff",
                    cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 14 }}>💬</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{timeAgo(c.updatedAt)} · {c.count} messages</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* category quick-switch */}
          <div className="no-sb" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
            background: "var(--bg)", borderBottom: "1px solid var(--hairline)", flexShrink: 0, overflowX: "auto" }}>
            {CATEGORY_META.map((meta) => (
              <button key={meta.key} className="tap" onClick={() => sendText(`Show me ${meta.label} options`)}
                title={`Browse ${meta.label}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
                  fontFamily: "var(--font)", padding: "6px 10px", borderRadius: 999, border: "1px solid var(--brand-100)",
                  background: "#fff", color: "var(--ink-2)", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>

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
                      {CHAT_CHIPS.map((c, i) => <Chip key={c} delay={i * 60} onClick={() => sendText(c)}>{c}</Chip>)}
                    </div>
                  )}

                  {/* inline catalogue cards (budget-aware: over-budget flagged up front) */}
                  {m.items && m.items.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 34, width: "100%", maxWidth: "94%" }}>
                      {m.items.filter(Boolean).map((it) => (
                        <InlineItem key={it.id} item={it} budget={Math.max(0, balance - cartTotal)}
                          cartQty={(cart.find((c) => c.id === it.id) || {}).qty || 0}
                          onAsk={handleAddToCart} onChangeQty={handleChangeQty} onView={handleView} />
                      ))}
                    </div>
                  )}

                  {/* follow-up chips (last message only) */}
                  {m.chips && m.chips.length > 0 && mi === messages.length - 1 && !busy && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, paddingLeft: 34 }}>
                      {m.chips.map((c, i) => <Chip key={c} delay={i * 55} onClick={() => sendText(c)}>{c}</Chip>)}
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
