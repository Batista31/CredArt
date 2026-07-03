/* CredArt — Banks (HDFC) experience.
 *
 * This is the ORIGINAL bank concierge app (dashboard + Riya/Samyak persona
 * switcher + /chat concierge + /redeem confirm), moved out of App.jsx verbatim
 * so the landing router can wrap it in the navy+gold theme. Behaviour and every
 * backend call are unchanged — only an `onBack` control and a transparent outer
 * background were added so it sits inside the themed shell. */
import React from "react";
import { api, USERS, getActiveUser, setActiveUser } from "../lib/api.js";
import { Dashboard } from "./Dashboard.jsx";
import { Concierge } from "./Concierge.jsx";
import { Confirm } from "./Confirm.jsx";
import { ChatHistory } from "./ChatHistory.jsx";
import { BankBadge, ModeBadge } from "./mode.jsx";

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

/* ---------- Demo persona switcher (Riya ⇄ Samyak) ---------- */
function PersonaSwitcher({ activeUserId, onSwitch }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 999,
      background: "var(--surface)", border: "1px solid var(--hairline)" }}>
      {USERS.map((u) => {
        const active = u.id === activeUserId;
        return (
          <button key={u.id} className="tap" onClick={() => onSwitch(u.id)} title={`Show ${u.name}'s demo`} style={{
            padding: "6px 13px", borderRadius: 999, border: "none", cursor: "pointer",
            fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800,
            background: active ? "linear-gradient(135deg,var(--brand-600),var(--brand-700))" : "transparent",
            color: active ? "#fff" : "var(--ink-3)" }}>
            {u.short}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Desktop browser-window shell (replaces the phone frame) ---------- */
function DesktopWindow({ children }) {
  return (
    <div style={{
      position: "relative", width: "min(1000px, 96vw)", height: "min(84vh, 820px)",
      background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
      boxShadow: "0 30px 70px rgba(30,12,60,0.28), 0 0 0 1px rgba(0,0,0,0.06)" }}>
      {/* browser chrome */}
      <div style={{ height: 44, flexShrink: 0, background: "#f3f0f9", borderBottom: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
        <span style={{ width: 12, height: 12, borderRadius: 99, background: "#ff5f57" }} />
        <span style={{ width: 12, height: 12, borderRadius: 99, background: "#febc2e" }} />
        <span style={{ width: 12, height: 12, borderRadius: 99, background: "#28c840" }} />
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff",
            border: "1px solid var(--hairline)", borderRadius: 999, padding: "5px 16px", fontSize: 12,
            color: "var(--ink-3)", fontWeight: 600, fontFamily: "var(--font)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" /></svg>
            app.credart.ai
          </div>
        </div>
        <div style={{ width: 44 }} />
      </div>
      {/* screen area (positioned so bottom-sheets anchor here) */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--bg)" }}>
        {children}
      </div>
    </div>
  );
}

/* Phone-width centered column for the mobile-tuned screens (dashboard/confirm). */
function Centered({ children }) {
  return (
    <div style={{ height: "100%", maxWidth: 460, margin: "0 auto", position: "relative", overflow: "hidden",
      boxShadow: "0 0 0 1px var(--hairline)", background: "var(--bg)" }}>
      {children}
    </div>
  );
}

export function BankExperience({ onBack, view = "laptop" }) {
  const mobile = view === "mobile";
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
  const [activeUserId, setActiveUserId] = React.useState(getActiveUser());

  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    refreshCards();
    refreshCmr();
  }, []);

  function refreshCards() {
    api.cards().then((d) => { setUser(d.user); setCards(d.cards || []); }).catch(() => {});
  }

  function refreshCmr() {
    api.cmr().then((d) => {
      setWishlistLabels(new Set((d.wishlist || []).map((w) => w.label)));
      setDismissedLabels(new Set((d.dismissed || []).map((w) => w.label)));
    }).catch(() => {});
  }

  /* Flip the whole app to another seeded persona (Riya ⇄ Samyak). Resets
     transient screen/chat state so the new user starts clean on the dashboard. */
  function switchUser(id) {
    if (id === activeUserId) return;
    setActiveUser(id);
    setActiveUserId(id);
    setChatCard(null);
    setBooking(null);
    setWishlistLabels(new Set());
    setDismissedLabels(new Set());
    go("dashboard", "back");
    refreshCards();
    refreshCmr();
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

  // Shared window contents (screens + bottom sheets). Both the laptop
  // DesktopWindow and the mobile full-bleed shell render this identical tree, so
  // switching view never remounts/losing the active screen's state.
  const windowInner = (
    <>
      <div key={screenKey} style={{ height: "100%", animation: `${dir === "fwd" ? "screenIn" : "screenInBack"} .34s cubic-bezier(.2,.8,.2,1)` }}>
        {screen === "dashboard" && (
          <Centered>
            <Dashboard user={user} cards={cards} mode={mode}
              onOpenChat={openChat} onOpenSettings={() => setShowSettings(true)} onOpenTnc={setTncCard}
              onOpenHistory={openHistory} />
          </Centered>
        )}
        {screen === "history" && (
          <Centered>
            <ChatHistory user={user} onBack={() => go("dashboard", "back")} onOpenConversation={openConversation} />
          </Centered>
        )}
        {screen === "chat" && (
          <Concierge user={user} card={chatCard} mode={mode} resumeConversationId={resumeConvoId}
            onBack={() => { setResumeConvoId(null); go(resumeConvoId ? "history" : "dashboard", "back"); }}
            onRedeem={onRedeem}
            wishlistLabels={wishlistLabels} dismissedLabels={dismissedLabels}
            onWishlist={handleWishlist} onDismiss={handleDismiss} />
        )}
        {screen === "confirm" && booking && (
          <Centered>
            <Confirm booking={booking} mode={mode}
              onDone={() => { setBooking(null); refreshCards(); go("dashboard", "back"); }}
              onBackToChat={() => { setBooking(null); go("chat", "back"); }} />
          </Centered>
        )}
      </div>

      {showSettings && <Settings mode={mode} setMode={setMode} onClose={() => setShowSettings(false)} />}
      {tncCard && <Tnc card={tncCard} onClose={() => setTncCard(null)} />}
    </>
  );

  // ---- Mobile: compact top bar + full-bleed shell (the phone bezel is the frame) ----
  if (mobile) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "transparent", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", flexShrink: 0,
          background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}>
          <button className="tap" onClick={onBack} title="Back to categories" style={{ display: "inline-flex", alignItems: "center",
            background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-2)", padding: 2 }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", flex: 1 }}>HDFC · CredArt</div>
          <ModeBadge mode={mode} dark={false} onClick={() => setShowSettings(true)} />
          <PersonaSwitcher activeUserId={activeUserId} onSwitch={switchUser} />
        </div>
        <div style={{ flex: 1, width: "100%", position: "relative", overflow: "hidden", background: "var(--bg)" }}>
          {windowInner}
        </div>
      </div>
    );
  }

  // ---- Laptop: hero control bar + browser-window shell ----
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      background: "transparent", padding: "22px 20px 40px" }}>
      {/* top hero / control bar */}
      <div style={{ width: "min(1000px, 96vw)", display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ color: "var(--ink)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <button className="tap" onClick={onBack} title="Back to categories" style={{ display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "6px 12px 6px 9px",
              cursor: "pointer", fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800, color: "var(--ink-2)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Categories
            </button>
            <BankBadge />
          </div>
          <h1 style={{ fontFamily: "var(--font)", fontSize: 24, fontWeight: 800, lineHeight: 1.15, margin: "8px 0 2px" }}>
            CredArt — AI rewards concierge
          </h1>
          <p style={{ fontFamily: "var(--font)", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.45, margin: 0, maxWidth: 560 }}>
            Reads your HDFC cards, finds the best redemption, and books it in one click — demo credits to rehearse,
            real points + bank OTP to go live.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "right" }}>
            Balance <b className="num">{fmt(totalPts)}</b> pts · <b className="num">{fmt(demoPts)}</b> demo
          </div>
          <ModeBadge mode={mode} dark={false} onClick={() => setShowSettings(true)} />
          <PersonaSwitcher activeUserId={activeUserId} onSwitch={switchUser} />
        </div>
      </div>

      <DesktopWindow>{windowInner}</DesktopWindow>
    </div>
  );
}
