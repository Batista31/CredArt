/* CredArt — Rewards Catalogue (Kobie / Navy Federal style store).
 *
 * A premium points-store modelled on Kobie's real rewards portals (Complete
 * Rewards, USAA Point Rewards, Navy Federal Rewards): white navbar with a navy
 * account pill + points balance + cart, a "You've earned it. Now enjoy it."
 * hero, category cards with line icons, and product grids with "Starting At
 * X,XXX Points" + slate "View Details" buttons and a "Filter & Sort" control.
 *
 * FULLY hardcoded (lib/catalogue.js) — no backend fetches items and redeeming
 * spends a self-contained demo bucket, so it never touches other routes. A
 * floating CredArt AI concierge (CredArtBubble) sits on top for conversational
 * discovery + redemption. Colours come from the navy `--brand-*` theme vars.
 */
import React from "react";
import { USERS, getActiveUser, setActiveUser } from "../lib/api.js";
import { CATEGORY_META, CATALOGUE, CAT_PERSONAS, personaFor, fmtPts, visualFor, onImgError, rewardImgStyle } from "../lib/catalogue.js";
import { CredArtBubble } from "./CredArtBubble.jsx";
import { RewardsCheckout } from "./RewardsCheckout.jsx";

const fmt = (n) => Number(n).toLocaleString("en-IN");
const newRef = () => `CRD-KBE-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
const ACCT = { Riya: "4502", Samyak: "4501" };

/* ---------------- persist store state across reloads (localStorage only) ----------------
   The Rewards Catalogue is intentionally a self-contained demo bucket — it never reads or
   writes the bank's Postgres ledger (see CLAUDE.md). But a plain in-memory React state means
   every page refresh silently resets balances/carts back to the seed values, which reads as
   "the frontend and DB don't correspond" even though there's no DB involved here at all. This
   just makes the DEMO STATE survive a reload/localhost-restart, without touching the DB. */
const STORE_KEY = "credart:store:state:v1";
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function savePersisted(balances, carts) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ balances, carts })); } catch { /* ignore quota/private-mode errors */ }
}

/* ---------------- category line icons ---------------- */
function CatIcon({ name, size = 34, color }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "travel")
    return <svg viewBox="0 0 24 24" width={size} height={size} fill={color}><path d="M21 15.5v-1.6l-7.5-4.4V4a1.5 1.5 0 0 0-3 0v5.5L3 13.9v1.6l7.5-2.1V18l-2 1.4v1.3l3.5-1 3.5 1V19.4L13.5 18v-4.6L21 15.5z" /></svg>;
  if (name === "giftcards")
    return <svg {...s}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M12 6v12" /><path d="M12 6c-1.4-2.4-4.6-1-2 1M12 6c1.4-2.4 4.6-1 2 1" /></svg>;
  if (name === "cashback")
    return <svg {...s}><circle cx="12" cy="12" r="8.3" /><path d="M12 7v10M14.6 9.1c-.6-.8-1.6-1.2-2.6-1.2-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.3 5 4 0 1.2-1 2.1-2.6 2.1-1.1 0-2.1-.5-2.6-1.3" /></svg>;
  // merchandise
  return <svg {...s}><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>;
}

/* ---------------- persona switcher ---------------- */
function PersonaSwitcher({ activeUserId, onSwitch }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 999,
      background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
      {USERS.map((u) => {
        const active = u.id === activeUserId;
        return (
          <button key={u.id} className="tap" onClick={() => onSwitch(u.id)} title={`Show ${u.name}'s rewards`} style={{
            padding: "6px 13px", borderRadius: 999, border: "none", cursor: "pointer",
            fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800,
            background: active ? "linear-gradient(135deg,var(--brand-600),var(--brand-800))" : "transparent",
            color: active ? "#fff" : "var(--brand-700)" }}>
            {u.short}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- navbar ---------------- */
function Navbar({ theme, persona, balance, activeUserId, onSwitch, onHome, onExit, cartCount, onToggleCart }) {
  return (
    <div style={{ flexShrink: 0, background: "#fff", borderBottom: "1px solid var(--brand-100)",
      padding: "11px 22px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", zIndex: 6,
      boxShadow: "0 2px 10px rgba(12,39,72,0.06)" }}>
      {/* logo */}
      <button className="tap" onClick={onHome} title="Rewards home" style={{ display: "inline-flex", alignItems: "center", gap: 11,
        background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
        <span style={{ width: 38, height: 38, borderRadius: "50%", background: theme.cardGrad, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 10px rgba(12,39,72,0.28)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.6" /><path d="M12 3a13 13 0 0 0 0 18M12 3a13 13 0 0 1 0 18M3.5 9h17M3.5 15h17" stroke="#fff" strokeWidth="1.2" /></svg>
        </span>
        <div style={{ textAlign: "left", lineHeight: 1.05 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, color: "var(--brand-800)" }}>CredArt Rewards</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--brand-400)", fontStyle: "italic" }}>Powered by CredArt</div>
        </div>
      </button>

      <div style={{ flex: 1 }} />

      {/* account pill */}
      <div style={{ display: "inline-flex", alignItems: "stretch", borderRadius: 999, overflow: "hidden",
        background: theme.cardGrad, color: "#fff", boxShadow: "0 6px 16px rgba(12,39,72,0.28)" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "6px 14px",
          borderRight: "1px solid rgba(255,255,255,0.18)" }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 1, opacity: 0.7 }}>ACCOUNT</div>
          <div className="num" style={{ fontSize: 12, fontWeight: 700 }}>…{ACCT[persona.short] || "4500"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "6px 14px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>Hi, {persona.short}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, opacity: 0.85 }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: theme.accent }} />CredArt Rewards Tier
          </div>
        </div>
        <div className="num" style={{ display: "flex", alignItems: "center", padding: "6px 18px 6px 14px",
          fontSize: 19, fontWeight: 800, color: theme.accent, letterSpacing: -0.3 }}>
          {fmt(balance)}
        </div>
      </div>

      {/* cart */}
      <button className="tap" onClick={onToggleCart} title="Recent redemptions" style={{ position: "relative",
        width: 42, height: 42, borderRadius: "50%", background: theme.cardGrad, border: "none",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
        boxShadow: "0 5px 14px rgba(12,39,72,0.28)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 5h2l1.5 11h10l1.5-8H7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.4" fill="#fff" /><circle cx="17" cy="20" r="1.4" fill="#fff" /></svg>
        <span className="num" style={{ position: "absolute", top: -3, right: -3, minWidth: 19, height: 19, padding: "0 4px",
          borderRadius: 999, background: theme.accent, color: theme.accentInk, fontSize: 11, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{cartCount}</span>
      </button>

      <PersonaSwitcher activeUserId={activeUserId} onSwitch={onSwitch} />

      {onExit && (
        <button className="tap" onClick={onExit} title="Back to landing page" style={{ width: 38, height: 38, borderRadius: "50%",
          border: "1.5px solid var(--brand-200)", background: "#fff", color: "var(--brand-700)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /></svg>
        </button>
      )}
    </div>
  );
}

/* ---------------- hero ---------------- */
function Hero({ theme }) {
  return (
    <div style={{ background: theme.cardGrad, color: "#fff", borderRadius: 18, padding: "34px 30px",
      position: "relative", overflow: "hidden", boxShadow: "0 18px 40px rgba(12,39,72,0.28)" }}>
      <div style={{ position: "absolute", top: -40, right: -30, width: 260, height: 260, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(232,144,30,0.35), transparent 65%)" }} />
      <div style={{ position: "absolute", bottom: -60, right: 120, width: 180, height: 180, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,255,255,0.12), transparent 65%)" }} />
      <div style={{ position: "relative", maxWidth: 620 }}>
        <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase",
          padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)", marginBottom: 16 }}>
          ✦ CredArt Rewards Store
        </span>
        <h1 style={{ fontFamily: "var(--font)", fontWeight: 800, fontSize: "clamp(26px, 3.6vw, 40px)", lineHeight: 1.1, margin: "0 0 6px" }}>
          You've earned it. Now enjoy it.
        </h1>
        <p style={{ fontFamily: "var(--font)", fontSize: 16, opacity: 0.9, margin: 0 }}>
          Your rewards are a click away — flights, gift cards, cashback and merchandise, all priced in points.
        </p>
      </div>
    </div>
  );
}

/* ---------------- category card (home) ---------------- */
function CategoryCard({ theme, meta, count, onOpen, delay }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button className="tap animate-msg" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onOpen} style={{ animationDelay: delay + "ms", textAlign: "left", cursor: "pointer", padding: "22px 20px 18px",
        border: "1px solid var(--brand-100)", borderBottom: `3px solid ${theme.accent}`, borderRadius: 14, background: "#fff",
        display: "flex", flexDirection: "column", gap: 12,
        boxShadow: hover ? "0 18px 38px -14px rgba(12,39,72,0.34)" : "var(--sh-sm)",
        transform: hover ? "translateY(-5px)" : "none", transition: "transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s ease" }}>
      <span style={{ width: 56, height: 56, borderRadius: 14, background: "var(--brand-50)", display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <CatIcon name={meta.key} color={theme.accent} />
      </span>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand-800)" }}>{meta.label}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.accent }}>{count} rewards</div>
      </div>
      <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13, lineHeight: 1.45, flex: 1 }}>{meta.blurb}</p>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--brand-600)", fontWeight: 800, fontSize: 13 }}>
        Browse {meta.label}
        <span style={{ display: "inline-flex", width: 18, height: 18, borderRadius: 999, background: "var(--brand-600)",
          alignItems: "center", justifyContent: "center" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </span>
    </button>
  );
}

/* ---------------- product card ---------------- */
function ItemCard({ item, theme, balance, onView, delay }) {
  const [hover, setHover] = React.useState(false);
  const over = item.points > balance;
  return (
    <div className="animate-msg" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ animationDelay: Math.min(delay, 400) + "ms", background: "#fff", borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--brand-100)", display: "flex", flexDirection: "column",
        boxShadow: hover ? "0 16px 32px -14px rgba(12,39,72,0.3)" : "var(--sh-sm)",
        transform: hover ? "translateY(-4px)" : "none", transition: "transform .16s ease, box-shadow .16s ease" }}>
      <div style={{ position: "relative", height: 150, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid var(--brand-50)" }}>
        <img src={item.image} alt={item.name} loading="lazy"
          onError={onImgError(item)}
          style={{ width: "100%", height: "100%", ...rewardImgStyle(item) }} />
        {/* affordability, surfaced BEFORE the user commits to anything */}
        {over && (
          <span title={`You need ${fmt(item.points - balance)} more points for this`}
            style={{ position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 800, color: "var(--amber)",
              background: "#fff", border: "1px solid rgba(242,162,59,0.5)", padding: "3px 9px", borderRadius: 999,
              boxShadow: "var(--sh-sm)" }}>
            ⚠ {fmt(item.points - balance)} pts short
          </span>
        )}
      </div>
      <div style={{ padding: "14px 15px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-800)", lineHeight: 1.3, flex: 1 }}>{item.name}</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
          Starting At <b className="num" style={{ color: "var(--brand-800)" }}>{fmt(item.points)}</b> Points
        </div>
        <button className="tap" onClick={() => onView(item)} style={{ marginTop: 2, padding: "10px 14px", borderRadius: 999,
          border: "none", background: theme.slate, color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 12.5,
          cursor: "pointer", boxShadow: "0 4px 10px rgba(12,39,72,0.14)", alignSelf: "flex-start", minWidth: 118 }}>
          View Details
        </button>
      </div>
    </div>
  );
}

/* ---------------- detail modal ---------------- */
function DetailModal({ item, theme, inCart, balance, cartTotal, onClose, onAddToCart, onGoToCart }) {
  const [added, setAdded] = React.useState(inCart);
  const [err, setErr] = React.useState(null);

  /* Affordability is checked BEFORE the user can commit — against the
     spendable budget (balance minus what's already reserved in the cart). */
  const budget = Math.max(0, balance - cartTotal);
  const over = item.points > budget;
  const short = item.points - budget;

  function handleAdd() {
    const r = onAddToCart(item);
    if (r.ok) { setAdded(true); setErr(null); } else { setErr(r.reason); }
  }

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(8,28,51,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "fadeIn .18s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="no-sb" style={{ width: "min(460px, 100%)", maxHeight: "94%", overflowY: "auto",
        background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 70px rgba(8,28,51,0.5)", animation: "sheetUp .26s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ position: "relative", height: 200, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", ...rewardImgStyle(item) }}
            onError={onImgError(item)} />
          <span style={{ position: "absolute", top: 12, left: 12, fontSize: 10.5, fontWeight: 800, color: "#fff",
            background: theme.cardGrad, padding: "4px 11px", borderRadius: 999, textTransform: "capitalize" }}>{item.categoryLabel || item.category}</span>
          <button className="tap" onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32,
            borderRadius: 999, border: "none", cursor: "pointer", background: "rgba(8,28,51,0.6)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ padding: "20px 22px 24px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--brand-800)", lineHeight: 1.25 }}>{item.name}</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "8px 0 4px" }}>
            Starting At <b className="num" style={{ color: "var(--brand-800)", fontSize: 20 }}>{fmt(item.points)}</b> Points
          </div>
          {/* one small piece of info about the reward, shown on View Details */}
          <div style={{ margin: "14px 0 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: "var(--brand-400)", textTransform: "uppercase", marginBottom: 5 }}>
              About this reward
            </div>
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.55 }}>{item.desc}</p>
          </div>

          {added ? (
            <div style={{ background: "var(--green-bg)", border: "1px solid rgba(22,185,129,0.3)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--green)" }}>✓ Added to cart</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{item.name} is waiting in your cart — checkout whenever you're ready.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="tap" onClick={onGoToCart} style={{ flex: 1, padding: 12, borderRadius: 999, border: "none",
                  background: theme.cardGrad, color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
                  View Cart
                </button>
                <button className="tap" onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 999,
                  border: "1.5px solid var(--brand-200)", background: "#fff", color: "var(--brand-700)",
                  fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
                  Continue Shopping
                </button>
              </div>
            </div>
          ) : (
            <>
              {err && <div style={{ background: "var(--red-bg)", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, color: "var(--red)", fontWeight: 600, marginBottom: 10 }}>{err}</div>}
              {over && (
                <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "var(--amber-bg)",
                  border: "1px solid rgba(242,162,59,0.4)", borderRadius: 12, padding: "11px 14px", marginBottom: 10 }}>
                  <span style={{ fontSize: 15 }}>⚠️</span>
                  <div style={{ fontSize: 12.5, color: "#8A5A12", lineHeight: 1.5 }}>
                    <b>You're {fmt(short)} points short for this.</b>{" "}
                    {cartTotal > 0
                      ? <>You have {fmt(balance)} points with {fmt(cartTotal)} already reserved in your cart — freeing up cart items or earning more points would unlock it.</>
                      : <>You have {fmt(balance)} points right now — keep earning to unlock it.</>}
                  </div>
                </div>
              )}
              <button className="tap" onClick={handleAdd} disabled={over} style={{ width: "100%", padding: 14, borderRadius: 999, border: "none",
                cursor: over ? "not-allowed" : "pointer", fontFamily: "var(--font)", fontWeight: 800, fontSize: 14.5,
                color: over ? "var(--ink-3)" : "#fff", background: over ? "rgba(8,28,51,0.06)" : theme.cardGrad,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 5h2l1.5 11h10l1.5-8H7" stroke={over ? "#9389A8" : "#fff"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.4" fill={over ? "#9389A8" : "#fff"} /><circle cx="17" cy="20" r="1.4" fill={over ? "#9389A8" : "#fff"} /></svg>
                {over ? `Need ${fmt(short)} more points` : "Add to Cart"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- cart panel ---------------- */
function CartPanel({ theme, cart, balance, onRemove, onChangeQty, onBeginCheckout, onClose }) {
  const total = cart.reduce((a, i) => a + i.points * (i.qty || 1), 0);
  const affordable = total <= balance && cart.length > 0;
  const hasDelivery = cart.some((i) => i.category === "merchandise");
  const [qtyErr, setQtyErr] = React.useState(null);

  function bumpQty(id, delta) {
    const r = onChangeQty(id, delta);
    setQtyErr(r && !r.ok ? r.reason : null);
  }

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 65, background: "rgba(8,28,51,0.24)", animation: "fadeIn .16s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 62, right: 22, width: "min(360px, calc(100% - 24px))",
        background: "#fff", borderRadius: 14, boxShadow: "var(--sh-lg)", overflow: "hidden", display: "flex", flexDirection: "column",
        maxHeight: "min(76vh, 620px)", animation: "sheetUp .22s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--brand-50)", fontWeight: 800, fontSize: 14.5, color: "var(--brand-800)",
          display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 5h2l1.5 11h10l1.5-8H7" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.4" fill="var(--brand-600)" /><circle cx="17" cy="20" r="1.4" fill="var(--brand-600)" /></svg>
          Your Cart{cart.length > 0 ? ` (${cart.length})` : ""}
        </div>

        <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {cart.length === 0 ? (
            <div style={{ padding: 22, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              Your cart is empty — add a reward or ask the CredArt concierge.
            </div>
          ) : cart.map((it) => {
            const qty = it.qty || 1;
            return (
              <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 8px", borderRadius: 10 }}>
                <img src={it.image} alt="" onError={onImgError(it)} style={{ width: 42, height: 42, borderRadius: 8, flexShrink: 0, background: "var(--brand-50)", ...rewardImgStyle(it) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                  <div className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtPts(it.points)} × {qty} = {fmt(it.points * qty)} pts</div>
                </div>
                {/* qty stepper — increasing is budget-gated by onChangeQty */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button className="tap" onClick={() => bumpQty(it.id, -1)} title="Decrease quantity" style={{ width: 22, height: 22, borderRadius: 999,
                    border: "1px solid var(--brand-100)", background: "#fff", color: "var(--brand-700)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>−</button>
                  <span className="num" style={{ minWidth: 16, textAlign: "center", fontSize: 12, fontWeight: 800, color: "var(--brand-800)" }}>{qty}</span>
                  <button className="tap" onClick={() => bumpQty(it.id, 1)} title="Increase quantity" style={{ width: 22, height: 22, borderRadius: 999,
                    border: "1px solid var(--brand-100)", background: "#fff", color: "var(--brand-700)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>+</button>
                </div>
                <button className="tap" onClick={() => onRemove(it.id)} title="Remove" style={{ width: 26, height: 26, borderRadius: 999,
                  border: "1px solid var(--brand-100)", background: "#fff", color: "var(--ink-3)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                </button>
              </div>
            );
          })}
        </div>
        {qtyErr && (
          <div style={{ margin: "0 12px 8px", padding: "9px 12px", borderRadius: 10, background: "var(--amber-bg)",
            border: "1px solid rgba(242,162,59,0.4)", color: "#8A5A12", fontSize: 12, fontWeight: 600 }}>
            ⚠ {qtyErr}
          </div>
        )}
        {cart.length > 0 && (
          <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--brand-50)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-2)", marginBottom: 8 }}>
              <span>Subtotal</span>
              <b className="num" style={{ color: "var(--brand-800)" }}>{fmt(total)} pts</b>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600, marginBottom: 10 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" /></svg>
              OTP-secured checkout{hasDelivery ? " · delivery autofilled from your CMR profile" : ""}
            </div>
            <button className="tap" onClick={onBeginCheckout} disabled={!affordable} style={{ width: "100%", padding: 13, borderRadius: 999,
              border: "none", cursor: affordable ? "pointer" : "not-allowed", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5,
              color: affordable ? "#fff" : "var(--ink-3)", background: affordable ? theme.cardGrad : "rgba(8,28,51,0.06)" }}>
              {affordable ? `Redeem Cart · ${fmt(total)} pts` : `Need ${fmt(total - balance)} more points`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- category grid (search + filter/sort) ---------------- */
function CategoryView({ theme, meta, balance, onView, onBack }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("featured");
  const [sortOpen, setSortOpen] = React.useState(false);

  const items = React.useMemo(() => {
    let list = CATALOGUE[meta.key].map((it) => {
      const base = { ...it, category: meta.key, categoryLabel: meta.label };
      return { ...base, ...visualFor(base) };  // image + logo/photo fallbacks
    });
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    if (sort === "low") list = [...list].sort((a, b) => a.points - b.points);
    if (sort === "high") list = [...list].sort((a, b) => b.points - a.points);
    return list;
  }, [meta.key, query, sort]);

  const SORTS = { featured: "Featured", low: "Points: Low to High", high: "Points: High to Low" };

  return (
    <>
      {/* toolbar: search + Filter & Sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--brand-100)",
          borderRadius: 999, padding: "10px 16px", flex: 1, minWidth: 220, maxWidth: 380, boxShadow: "var(--sh-sm)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="var(--brand-400)" strokeWidth="1.8" /><path d="M21 21l-4-4" stroke="var(--brand-400)" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${meta.label.toLowerCase()}…`}
            style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font)", fontSize: 14, color: "var(--ink)", width: "100%" }} />
        </div>
        <div style={{ position: "relative" }}>
          <button className="tap" onClick={() => setSortOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 9,
            background: theme.slate, color: "#fff", border: "none", borderRadius: 999, padding: "11px 18px", cursor: "pointer",
            fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5, boxShadow: "0 4px 12px rgba(12,39,72,0.16)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            Filter &amp; Sort
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ transform: sortOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }}><path d="M6 9l6 6 6-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {sortOpen && (
            <>
              <div onClick={() => setSortOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 21, width: 230, background: "#fff",
                borderRadius: 12, border: "1px solid var(--brand-100)", boxShadow: "var(--sh-lg)", overflow: "hidden", animation: "sheetUp .18s ease" }}>
                <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--ink-3)", textTransform: "uppercase", borderBottom: "1px solid var(--brand-50)" }}>Sort by</div>
                {Object.entries(SORTS).map(([k, label]) => (
                  <button key={k} className="tap" onClick={() => { setSort(k); setSortOpen(false); }} style={{ width: "100%", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 14px", border: "none",
                    background: sort === k ? "var(--brand-50)" : "#fff", cursor: "pointer", fontFamily: "var(--font)", fontSize: 13.5,
                    fontWeight: sort === k ? 800 : 600, color: sort === k ? "var(--brand-700)" : "var(--ink-2)" }}>
                    {label}
                    {sort === k && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="var(--brand-600)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* heading + back */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font)", fontSize: 27, fontWeight: 800, color: "var(--brand-800)", margin: 0 }}>{meta.label}</h2>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{items.length} of {CATALOGUE[meta.key].length} rewards</div>
        </div>
        <button className="tap" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent",
          border: "none", cursor: "pointer", color: "var(--brand-600)", fontFamily: "var(--font)", fontSize: 13.5, fontWeight: 800,
          textDecoration: "underline", textUnderlineOffset: 3 }}>
          <svg width="15" height="15" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to Rewards Store
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No rewards match “{query}”.</div>
      ) : (
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {items.map((it, i) => <ItemCard key={it.id} item={it} theme={theme} balance={balance} onView={onView} delay={i * 25} />)}
        </div>
      )}
    </>
  );
}

/* ---------------- main ---------------- */
export function RewardsCatalogue({ theme, initialCategory = null, onExit }) {
  const [activeUserId, setActiveUserId] = React.useState(getActiveUser());
  const [balances, setBalances] = React.useState(() => {
    const persisted = loadPersisted();
    const seed = Object.fromEntries(Object.values(CAT_PERSONAS).map((p) => [p.id, p.points]));
    return persisted && persisted.balances ? { ...seed, ...persisted.balances } : seed;
  });
  const [categoryKey, setCategoryKey] = React.useState(initialCategory);
  const [modalItem, setModalItem] = React.useState(null);
  const [carts, setCarts] = React.useState(() => {
    const persisted = loadPersisted();
    const seed = Object.fromEntries(Object.values(CAT_PERSONAS).map((p) => [p.id, []]));
    return persisted && persisted.carts ? { ...seed, ...persisted.carts } : seed;
  });
  const [showCart, setShowCart] = React.useState(false);
  const [checkingOut, setCheckingOut] = React.useState(false);

  // Persist demo balances/carts on every change so a reload/localhost restart
  // resumes exactly where the user left off (localStorage only — no DB write).
  React.useEffect(() => { savePersisted(balances, carts); }, [balances, carts]);

  const persona = personaFor(activeUserId);
  const balance = balances[activeUserId];
  const cart = carts[activeUserId];
  const catMeta = categoryKey ? CATEGORY_META.find((c) => c.key === categoryKey) : null;

  function switchUser(id) {
    if (id === activeUserId) return;
    setActiveUser(id);       // keep the rest of the app (+ /chat) in sync
    setActiveUserId(id);
    setModalItem(null);
    setShowCart(false);
    setCheckingOut(false);
  }

  /* Every "redeem" action now adds to a per-persona cart instead of spending
     points immediately — checkout happens explicitly from the cart panel.
     Affordability is enforced HERE, up front: the user is told they're short
     the moment they try to add, never after walking through checkout. Each
     cart line carries a `qty` (default 1) — adding an item already in the
     cart bumps its quantity by one instead of rejecting it as a duplicate. */
  const cartTotal = (list) => list.reduce((a, i) => a + i.points * (i.qty || 1), 0);

  function addToCart(item) {
    const bal = balances[activeUserId];
    const existing = cart.find((i) => i.id === item.id);
    const nextQty = (existing ? existing.qty || 1 : 0) + 1;
    const othersTotal = cartTotal(cart.filter((i) => i.id !== item.id));
    const projected = othersTotal + item.points * nextQty;
    if (projected > bal) {
      const short = projected - bal;
      return {
        ok: false,
        reason: existing
          ? `You can't redeem ${nextQty} of the ${item.name} — that would need ${fmt(short)} more points than your ${fmt(bal)}-point balance. Remove something else from the cart to make room.`
          : `The ${item.name} costs ${fmt(item.points)} pts but you have ${fmt(bal)} — you're ${fmt(short)} points short.`,
      };
    }
    const next = existing
      ? cart.map((i) => (i.id === item.id ? { ...i, qty: nextQty } : i))
      : [...cart, { ...item, qty: 1 }];
    setCarts((c) => ({ ...c, [activeUserId]: next }));
    return { ok: true, count: next.length, qty: nextQty };
  }

  /* +/- quantity stepper — used by the cart panel and the chat bubble's inline
     cards. A decrement to 0 removes the line; an increment is budget-gated the
     same way addToCart is, so a user is told immediately if they can't afford
     a second (or third...) unit of the same reward. */
  function changeQty(id, delta) {
    const item = cart.find((i) => i.id === id);
    if (!item) return { ok: false, reason: "That item isn't in your cart." };
    const newQty = (item.qty || 1) + delta;
    if (newQty <= 0) { removeFromCart(id); return { ok: true, removed: true }; }
    if (delta > 0) {
      const bal = balances[activeUserId];
      const othersTotal = cartTotal(cart.filter((i) => i.id !== id));
      const projected = othersTotal + item.points * newQty;
      if (projected > bal) {
        const short = projected - bal;
        return { ok: false, reason: `You can't redeem ${newQty} of the ${item.name} — that's ${fmt(short)} more points than your ${fmt(bal)}-point balance allows.` };
      }
    }
    setCarts((c) => ({ ...c, [activeUserId]: cart.map((i) => (i.id === id ? { ...i, qty: newQty } : i)) }));
    return { ok: true, qty: newQty };
  }

  function removeFromCart(id) {
    setCarts((c) => ({ ...c, [activeUserId]: c[activeUserId].filter((i) => i.id !== id) }));
  }

  /* Deduct hardcoded demo points for everything in the cart at once + clear
     it. Never touches the bank ledger — a self-contained demo bucket. */
  function checkoutCart() {
    if (cart.length === 0) return { ok: false, reason: "Your cart is empty." };
    const total = cartTotal(cart);
    const bal = balances[activeUserId];
    if (total > bal) return { ok: false, reason: `You need ${fmt(total)} points but only have ${fmt(bal)}.` };
    const ref = newRef();
    const after = bal - total;
    setBalances((b) => ({ ...b, [activeUserId]: after }));
    setCarts((c) => ({ ...c, [activeUserId]: [] }));
    return { ok: true, ref, total, balanceAfter: after };
  }

  function viewFromChat(item) { setCategoryKey(item.category); setModalItem(item); }
  function goToCartFromModal() { setModalItem(null); setShowCart(true); }

  return (
    <div style={{ position: "relative", height: "100vh", display: "flex", flexDirection: "column",
      overflow: "hidden", background: "var(--bg)", fontFamily: "var(--font)" }}>
      <Navbar theme={theme} persona={persona} balance={balance} activeUserId={activeUserId} onSwitch={switchUser}
        onHome={() => setCategoryKey(null)} onExit={onExit}
        cartCount={cart.length} onToggleCart={() => setShowCart((s) => !s)} />

      {/* scrolling body */}
      <div className="no-sb" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 24px 110px" }}>
          {!categoryKey ? (
            <>
              <Hero theme={theme} />
              <h2 style={{ fontFamily: "var(--font)", fontSize: 22, fontWeight: 800, color: "var(--brand-800)", margin: "30px 0 4px" }}>
                Your rewards, your way.
              </h2>
              <p style={{ margin: "0 0 18px", color: "var(--ink-2)", fontSize: 14.5 }}>Explore your options — pick a category to start redeeming.</p>
              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                {CATEGORY_META.map((meta, i) => (
                  <CategoryCard key={meta.key} theme={theme} meta={meta} count={CATALOGUE[meta.key].length}
                    onOpen={() => setCategoryKey(meta.key)} delay={i * 70} />
                ))}
              </div>
            </>
          ) : (
            <CategoryView theme={theme} meta={catMeta} balance={balance} onView={setModalItem} onBack={() => setCategoryKey(null)} />
          )}
        </div>
      </div>

      {/* cart panel */}
      {showCart && !checkingOut && (
        <CartPanel theme={theme} cart={cart} balance={balance} onRemove={removeFromCart} onChangeQty={changeQty}
          onBeginCheckout={() => { setShowCart(false); setCheckingOut(true); }}
          onClose={() => setShowCart(false)} />
      )}

      {/* OTP-secured checkout flow (old bank-style execution) */}
      {checkingOut && (
        <RewardsCheckout persona={persona} cart={cart} performCheckout={checkoutCart}
          onDone={() => setCheckingOut(false)} onClose={() => setCheckingOut(false)} />
      )}

      {/* detail modal */}
      {modalItem && (
        <DetailModal item={modalItem} theme={theme} inCart={cart.some((i) => i.id === modalItem.id)}
          balance={balance} cartTotal={cartTotal(cart)}
          onClose={() => setModalItem(null)} onAddToCart={addToCart} onGoToCart={goToCartFromModal} />
      )}

      {/* floating concierge */}
      <CredArtBubble persona={persona} balance={balance} cartCount={cart.length}
        cartTotal={cartTotal(cart)}
        onAddToCart={addToCart} onChangeQty={changeQty} cart={cart}
        onViewItem={viewFromChat}
        onCheckout={() => { if (cart.length === 0) return; setModalItem(null); setShowCart(false); setCheckingOut(true); }}
        view="laptop" />
    </div>
  );
}
