/* CredArt — Screen 2: Concierge chat. Real backend /chat dialogue, 2.0 styling.
   Multi-turn (conversation_id), follow-ups hide cards, candidates → OptionCards,
   CMR save/hide, fulfillment chips route to the Confirm execution screen. */
import React from "react";
import { api } from "../lib/api.js";
import { KobieAvatar } from "./Kobie.jsx";
import { CR_FULFILL } from "./mode.jsx";

const fmt = (n) => (n == null ? "" : Number(n).toLocaleString());

function Bubble({ who, children }) {
  const bot = who === "bot";
  return (
    <div style={{
      maxWidth: "80%",
      background: bot ? "#fff" : "linear-gradient(160deg,var(--brand-600),var(--brand-700))",
      color: bot ? "var(--ink)" : "#fff",
      padding: "11px 15px", fontSize: 14.5, lineHeight: 1.45, fontWeight: 500,
      borderRadius: bot ? "18px 18px 18px 6px" : "18px 18px 6px 18px",
      boxShadow: bot ? "var(--sh-sm)" : "0 6px 16px rgba(84,35,155,0.28)",
      border: bot ? "1px solid var(--hairline)" : "none",
    }}>{children}</div>
  );
}

function Chip({ children, onClick, delay = 0 }) {
  return (
    <button className="tap animate-chip" onClick={onClick} style={{
      animationDelay: delay + "ms",
      background: "#fff", border: "1.5px solid var(--brand-200)", color: "var(--brand-700)",
      fontFamily: "var(--font)", fontWeight: 700, fontSize: 13.5, padding: "10px 15px",
      borderRadius: 999, boxShadow: "var(--sh-sm)",
    }}>{children}</button>
  );
}

/* a real backend candidate, rendered with fulfillment chips + CMR actions */
function OptionCard({ cand, mode, onRedeem, wishlisted, dismissed, onWishlist, onDismiss }) {
  if (dismissed) return null;
  const opts = cand.fulfillment_options || [];
  const pts = cand.points_cost;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 11, padding: 13, background: "#fff",
      borderRadius: "var(--r-md)", border: "1.5px solid var(--hairline)", boxShadow: "var(--sh-sm)", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--brand-600)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 16 }}>
          {(cand.label || "?").slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{cand.label}</span>
            {cand.rank === 1 && (
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--brand-700)", background: "var(--brand-100)", padding: "2px 7px", borderRadius: 999, letterSpacing: 0.2 }}>★ CREDART’S PICK</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
            {cand.card_name}{cand.category ? ` · ${cand.category}` : ""}
          </div>
          {cand.best_use_case && <div style={{ fontSize: 11.5, color: "var(--brand-600)", marginTop: 3, fontWeight: 600 }}>{cand.best_use_case}</div>}
        </div>
        {pts != null && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="num" style={{ fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{fmt(pts)}</div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>points</div>
          </div>
        )}
      </div>

      {cand.caveat && (
        <div style={{ display: "flex", gap: 5, fontSize: 10.5, color: "var(--amber)", fontWeight: 600 }}>
          <span>⚠</span>{cand.caveat}
        </div>
      )}

      {/* fulfillment options as redeem buttons (from backend) */}
      {opts.length > 0 && (
        <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 10, display: "flex", flexWrap: "wrap", gap: 7 }}>
          {opts.map((o) => {
            const f = CR_FULFILL[o.path] || CR_FULFILL.demo;
            const locked = (o.mode === "live" && mode !== "production") || !o.available;
            return (
              <button key={o.provider_id} className="tap" disabled={locked}
                onClick={() => !locked && onRedeem(cand, o)}
                title={!o.available ? (o.note || "unavailable") : locked ? "Switch to Production to use live execution" : o.label}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700,
                  padding: "7px 11px", borderRadius: 999, fontFamily: "var(--font)",
                  cursor: locked ? "not-allowed" : "pointer",
                  color: locked ? "var(--ink-3)" : "#fff",
                  background: locked ? "rgba(28,19,48,0.06)" : f.color, border: "1px solid transparent" }}>
                {o.label}
                {locked && o.mode === "live" && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2"/></svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* CMR save / hide */}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="tap" onClick={() => onWishlist(cand)} title="Save to wishlist" style={{
          fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
          border: `1px solid ${wishlisted ? "var(--brand-400)" : "var(--hairline)"}`,
          background: wishlisted ? "var(--brand-100)" : "transparent",
          color: wishlisted ? "var(--brand-600)" : "var(--ink-3)", cursor: "pointer" }}>
          {wishlisted ? "✓ Saved" : "♡ Save"}
        </button>
        <button className="tap" onClick={() => onDismiss(cand)} title="Don't show again" style={{
          fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
          border: "1px solid var(--hairline)", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
          ✕ Hide
        </button>
      </div>
    </div>
  );
}

export function Concierge({ user, card, mode, onBack, onRedeem, wishlistLabels, dismissedLabels, onWishlist, onDismiss, resumeConversationId }) {
  const cardName = card?.card_name || "Concierge";
  const isMillennia = card?.card_id === "hdfc_millennia";
  const headerPts = card ? card.current_points : (user?.cards || []).reduce?.((a, c) => a + (c.current_points || 0), 0);
  const currencyLabel = card?.currency_name || "points";

  const quickChips = isMillennia
    ? ["What's expiring?", "Shopping vouchers", "Dining offers"]
    : ["Plan a trip", "Find a hotel stay", "What's expiring?"];

  const idc = React.useRef(0);
  const nid = () => ++idc.current;
  const [messages, setMessages] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sessionId, setSessionId] = React.useState(null);
  const [conversationId, setConversationId] = React.useState(resumeConversationId || null);
  const [err, setErr] = React.useState(null);
  const scroller = React.useRef(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (resumeConversationId && user?.user_id) {
      api.conversation(resumeConversationId, user.user_id).then((d) => {
        const past = (d.messages || []).map((m) => ({
          id: nid(), who: m.role === "assistant" ? "bot" : "user", text: m.content, candidates: [],
        }));
        setMessages(past.length ? past : [{ id: nid(), who: "bot", text: "Picking up where you left off — what next?", intro: true }]);
      }).catch(() => {
        setMessages([{ id: nid(), who: "bot", text: "Couldn't load that conversation — starting fresh.", intro: true }]);
      });
      return;
    }
    setMessages([{ id: nid(), who: "bot", text: `Hi ${(user?.name || "there").split(" ")[0]} — I'm CredArt, your ${cardName} concierge. What would you like to do with your points?`, intro: true }]);
  }, []);

  React.useEffect(() => {
    const el = scroller.current; if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function pushMsg(m) { setMessages((x) => [...x, { id: nid(), ...m }]); }

  async function sendText(text) {
    if (!text || busy) return;
    pushMsg({ who: "user", text });
    setBusy(true); setErr(null);
    try {
      const r = await api.chat(text, sessionId, conversationId, undefined, card?.card_id);
      if (r.session_id) setSessionId(r.session_id);
      if (r.conversation_id) setConversationId(r.conversation_id);
      const showCandidates = r.response_type !== "follow_up_question";
      pushMsg({ who: "bot", text: r.reply, candidates: showCandidates ? (r.candidates || []) : [] });
    } catch (e) {
      setErr(String(e.message || e));
      pushMsg({ who: "bot", text: "I couldn't reach the rewards engine — is the backend running on :8001?" });
    } finally { setBusy(false); }
  }

  function send() { const t = input.trim(); if (!t) return; setInput(""); sendText(t); }

  return (
    <div className="cr-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* header */}
      <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff",
        padding: "54px 16px 14px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 6px 18px rgba(42,14,85,0.25)", zIndex: 5 }}>
        <button className="tap" onClick={onBack} style={{ background: "rgba(255,255,255,0.14)", border: "none", width: 36, height: 36,
          borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <KobieAvatar size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>CredArt</div>
          <div style={{ fontSize: 11.5, opacity: 0.78, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "#5BE6A4" }} />
            HDFC {cardName} · concierge
          </div>
        </div>
        {headerPts != null && (
          <div className="num" style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(headerPts)}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, fontFamily: "var(--font)" }}>{currencyLabel === "CashPoints" ? "CashPoints" : "points"}</div>
          </div>
        )}
      </div>

      {/* messages */}
      <div ref={scroller} className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "18px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m) => (
          <div key={m.id} className="animate-msg" style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: m.who === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", maxWidth: "100%", flexDirection: m.who === "user" ? "row-reverse" : "row" }}>
              {m.who === "bot" && <KobieAvatar size={30} state={m.candidates && m.candidates.length ? "happy" : "idle"} />}
              {m.text && <Bubble who={m.who}>{m.text}</Bubble>}
            </div>

            {/* quick-start chips under the intro message */}
            {m.intro && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 38, maxWidth: "92%" }}>
                {quickChips.map((c, i) => <Chip key={c} delay={i * 70} onClick={() => sendText(c)}>{c}</Chip>)}
              </div>
            )}

            {/* real candidates */}
            {m.candidates && m.candidates.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingLeft: 38, width: "100%", maxWidth: "94%" }}>
                {m.candidates.filter((c) => c.candidate_id).map((c) => (
                  <OptionCard key={c.candidate_id} cand={c} mode={mode}
                    wishlisted={wishlistLabels.has(c.label)} dismissed={dismissedLabels.has(c.label)}
                    onWishlist={onWishlist} onDismiss={onDismiss}
                    onRedeem={(cand, opt) => onRedeem(cand, opt, sessionId)} />
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="animate-msg" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <KobieAvatar size={30} state="think" />
            <div style={{ background: "#fff", borderRadius: "18px 18px 18px 6px", padding: "13px 16px", boxShadow: "var(--sh-sm)", border: "1px solid var(--hairline)", display: "flex", gap: 5 }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: "var(--brand-300)", animation: `thinkDot 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}
            </div>
          </div>
        )}
      </div>

      {err && <div style={{ padding: "6px 14px", fontSize: 11.5, color: "var(--red)", background: "var(--red-bg)" }}>{err}</div>}

      {/* input */}
      <div style={{ padding: "10px 14px 30px", background: "#fff", borderTop: "1px solid var(--hairline)", display: "flex", gap: 10, alignItems: "center" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message CredArt…" style={{ flex: 1, border: "none", background: "var(--bg)", borderRadius: 999,
            padding: "13px 18px", fontFamily: "var(--font)", fontSize: 14.5, color: "var(--ink)", outline: "none" }} />
        <button className="tap" onClick={send} style={{ width: 46, height: 46, borderRadius: 999, border: "none", flexShrink: 0,
          background: "linear-gradient(160deg,var(--brand-600),var(--brand-700))", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 14px rgba(84,35,155,0.3)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 12l16-8-6 8 6 8z" fill="#fff"/></svg>
        </button>
      </div>
    </div>
  );
}
