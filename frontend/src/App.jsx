import React from "react";
import { api } from "./lib/api.js";
import { IOSDevice } from "./components/IOSDevice.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { Concierge } from "./components/Concierge.jsx";
import { Confirm } from "./components/Confirm.jsx";
import { ChatHistory } from "./components/ChatHistory.jsx";
import { BankBadge, ModeBadge } from "./components/mode.jsx";

const fmt = (n) => (n == null ? "0" : Number(n).toLocaleString());

/* ---------- Settings bottom sheet ---------- */
function Settings({ mode, setMode, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 90, background: "rgba(20,10,40,0.45)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s ease" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 20px 34px", animation: "sheetUp .3s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--hairline)", margin: "0 auto 18px" }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)" }}>Execution mode</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
          Demo rehearses redemptions with no real money. Production uses real points and a bank OTP step.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {["demo", "production"].map((m) => (
            <button key={m} className="tap" onClick={() => setMode(m)} style={{
              flex: 1, padding: "13px", borderRadius: "var(--r-md)", fontFamily: "var(--font)", fontSize: 14, fontWeight: 800, cursor: "pointer",
              border: mode === m ? "2px solid var(--brand-500)" : "1.5px solid var(--hairline)",
              background: mode === m ? "var(--brand-50)" : "#fff", color: mode === m ? "var(--brand-700)" : "var(--ink-3)" }}>
              {m === "demo" ? "Demo" : "Production"}
            </button>
          ))}
        </div>
        <button className="tap" onClick={onClose} style={{ width: "100%", marginTop: 18, padding: 14, border: "none", borderRadius: "var(--r-md)",
          background: "linear-gradient(135deg,var(--brand-600),var(--brand-700))", color: "#fff", fontFamily: "var(--font)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ---------- T&C bottom sheet ---------- */
function Tnc({ card, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 90, background: "rgba(20,10,40,0.45)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s ease" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 20px 34px", animation: "sheetUp .3s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--hairline)", margin: "0 auto 18px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="var(--brand-600)" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 11.5l2 2 4-4" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>{card.card_name} · Terms</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Every benefit CredArt shows is source-verified</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 14 }}>
          CredArt never invents points values or availability. Redemption rules, point costs and caveats are read live from
          the HDFC catalogue and your own balance — the assistant only ever sees pre-validated options.
        </div>
        <a href="https://www.hdfcbank.com/personal/pay/cards/credit-cards" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <div className="tap" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "var(--brand-50)",
            border: "1px solid var(--hairline)", borderRadius: "var(--r-sm)" }}>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Verify on HDFC official</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H8M17 7v9" stroke="var(--brand-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </a>
        <button className="tap" onClick={onClose} style={{ width: "100%", marginTop: 16, padding: 14, border: "none", borderRadius: "var(--r-md)",
          background: "linear-gradient(135deg,var(--brand-600),var(--brand-700))", color: "#fff", fontFamily: "var(--font)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = React.useState("dashboard");
  const [dir, setDir] = React.useState("fwd");
  const [mode, setMode] = React.useState("demo");
  const [user, setUser] = React.useState(null);
  const [cards, setCards] = React.useState([]);
  const [wishlistLabels, setWishlistLabels] = React.useState(new Set());
  const [dismissedLabels, setDismissedLabels] = React.useState(new Set());
  const [chatCard, setChatCard] = React.useState(null);
  const [resumeConvoId, setResumeConvoId] = React.useState(null);
  const [booking, setBooking] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [tncCard, setTncCard] = React.useState(null);

  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    refreshCards();
    api.cmr().then((d) => {
      setWishlistLabels(new Set((d.wishlist || []).map((w) => w.label)));
      setDismissedLabels(new Set((d.dismissed || []).map((w) => w.label)));
    }).catch(() => {});
  }, []);

  function refreshCards() {
    api.cards().then((d) => { setUser(d.user); setCards(d.cards || []); }).catch(() => {});
  }

  const go = (s, d = "fwd") => { setDir(d); setScreen(s); };
  const openChat = (card) => { setChatCard(card); setResumeConvoId(null); go("chat"); };
  const openHistory = () => go("history");
  const openConversation = (convo) => {
    // History doesn't record which card a conversation was scoped to, so resume
    // without forcing one — the backend already knows the card from known_slots
    // (preferred_card_id) if the user switched mid-conversation.
    setChatCard(null);
    setResumeConvoId(convo.id);
    go("chat");
  };
  const onRedeem = (candidate, option, sessionId) => { setBooking({ candidate, option, sessionId }); go("confirm"); };

  async function handleWishlist(cand) {
    try { await api.wishlist(cand.label, cand.card_id); setWishlistLabels((p) => new Set([...p, cand.label])); } catch { /* silent */ }
  }
  async function handleDismiss(cand) {
    try { await api.dismiss(cand.label, cand.card_id); setDismissedLabels((p) => new Set([...p, cand.label])); } catch { /* silent */ }
  }

  const totalPts = cards.reduce((a, c) => a + (c.current_points || 0), 0);
  const demoPts = cards.reduce((a, c) => a + (c.demo_points || 0), 0);
  const screenKey = screen + (booking ? "1" : "0") + (chatCard ? chatCard.user_card_id : "") + (resumeConvoId || "");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(circle at 30% 20%, #efeaf8, #e3ddf0)", padding: 20, gap: 40, flexWrap: "wrap" }}>
      <div style={{ maxWidth: 360, color: "var(--ink)" }} className="cr-desktop-pitch">
        <BankBadge />
        <h1 style={{ fontFamily: "var(--font)", fontSize: 34, fontWeight: 800, lineHeight: 1.1, margin: "20px 0 10px" }}>
          Your points,<br />finally spent well.
        </h1>
        <p style={{ fontFamily: "var(--font)", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.5 }}>
          CredArt is an AI rewards concierge. It reads your HDFC cards, finds the best redemption, and books it in one click —
          demo credits to rehearse, real points + bank OTP to go live.
        </p>
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink-3)" }}>
          Balance: <b className="num">{fmt(totalPts)}</b> pts · <b className="num">{fmt(demoPts)}</b> demo
        </div>
        <div style={{ marginTop: 16 }}><ModeBadge mode={mode} dark={false} onClick={() => setShowSettings(true)} /></div>
      </div>

      <IOSDevice dark>
        <div key={screenKey} style={{ height: "100%", animation: `${dir === "fwd" ? "screenIn" : "screenInBack"} .34s cubic-bezier(.2,.8,.2,1)` }}>
          {screen === "dashboard" && (
            <Dashboard user={user} cards={cards} mode={mode}
              onOpenChat={openChat} onOpenSettings={() => setShowSettings(true)} onOpenTnc={setTncCard}
              onOpenHistory={openHistory} />
          )}
          {screen === "history" && (
            <ChatHistory user={user} onBack={() => go("dashboard", "back")} onOpenConversation={openConversation} />
          )}
          {screen === "chat" && (
            <Concierge user={user} card={chatCard} mode={mode} resumeConversationId={resumeConvoId}
              onBack={() => { setResumeConvoId(null); go(resumeConvoId ? "history" : "dashboard", "back"); }}
              onRedeem={onRedeem}
              wishlistLabels={wishlistLabels} dismissedLabels={dismissedLabels}
              onWishlist={handleWishlist} onDismiss={handleDismiss} />
          )}
          {screen === "confirm" && booking && (
            <Confirm booking={booking} mode={mode}
              onDone={() => { setBooking(null); refreshCards(); go("dashboard", "back"); }}
              onBackToChat={() => { setBooking(null); go("chat", "back"); }} />
          )}
        </div>

        {showSettings && <Settings mode={mode} setMode={setMode} onClose={() => setShowSettings(false)} />}
        {tncCard && <Tnc card={tncCard} onClose={() => setTncCard(null)} />}
      </IOSDevice>
    </div>
  );
}
