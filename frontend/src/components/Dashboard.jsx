/* CredArt — Screen 1: Card Dashboard (wired to real /cards data). */
import React from "react";
import { Kobie } from "./Kobie.jsx";
import { ModeBadge, ProtectedBadge } from "./mode.jsx";

const fmt = (n) => (n == null ? "0" : Number(n).toLocaleString());

/* card-face styling keyed by backend card_id */
const FACES = {
  hdfc_infinia: { network: "VISA", bg: "linear-gradient(140deg, var(--brand-700) 0%, var(--brand-900) 58%, var(--brand-950) 100%)" },
  hdfc_regalia_gold: { network: "VISA", bg: "linear-gradient(140deg, #B8860B 0%, var(--brand-800) 100%)" },
  hdfc_millennia: { network: "VISA", bg: "linear-gradient(140deg, var(--brand-500) 0%, var(--brand-700) 100%)" },
};
const faceOf = (id) => FACES[id] || { network: "VISA", bg: "linear-gradient(140deg, var(--brand-600), var(--brand-900))" };

/* expiry-derived health (honest: based on real days_to_expiry) */
function healthOf(days) {
  if (days == null) return { color: "var(--green)", bg: "var(--green-bg)", label: "Healthy", word: "No points expiring", pct: 100 };
  if (days <= 7)   return { color: "var(--red)", bg: "var(--red-bg)", label: "Expiring", word: days <= 0 ? "Expiring today" : `Expires in ${days} day${days === 1 ? "" : "s"}`, pct: Math.max(4, Math.round((days / 90) * 100)) };
  if (days <= 30)  return { color: "var(--amber)", bg: "var(--amber-bg)", label: "Use soon", word: `Expires in ${days} days`, pct: Math.round((days / 90) * 100) };
  return { color: "var(--green)", bg: "var(--green-bg)", label: "Healthy", word: `Expires in ${days} days`, pct: Math.min(100, Math.round((days / 90) * 100)) };
}

/* circular health ring */
function RingMeter({ pct, color, size = 54, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => { const t = setTimeout(() => setShown(pct), 120); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(28,19,48,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (shown / 100) * c}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="num" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.27, color, lineHeight: 1 }}>
        {pct}<span style={{ fontSize: size * 0.16, marginTop: 1 }}>%</span>
      </div>
    </div>
  );
}

function CardTile({ card, holder, onClick, onOpenTnc }) {
  const f = faceOf(card.card_id);
  const h = healthOf(card.days_to_expiry);
  return (
    <div className="tap" onClick={onClick} style={{
      background: "var(--surface)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-md)", padding: 12, marginBottom: 14 }}>
      {/* card face */}
      <div style={{ position: "relative", height: 200, borderRadius: "var(--r-md)", background: f.bg,
        overflow: "hidden", boxShadow: "var(--sh-card)", color: "#fff", padding: 20,
        display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ position: "absolute", width: 240, height: 240, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.16), transparent 70%)", top: -120, right: -60 }} />
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.08) 100%)" }} />
        {/* top row */}
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.7, fontWeight: 600 }}>HDFC BANK</div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 2, letterSpacing: 0.2 }}>{card.card_name}</div>
          </div>
          <div style={{ fontStyle: "italic", fontWeight: 800, fontSize: 18, opacity: 0.95, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>{f.network}</div>
        </div>
        {/* chip */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <div style={{ width: 38, height: 28, borderRadius: 6, background: "#E8C879",
            backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.5), rgba(0,0,0,0.12))", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)" }} />
          <svg width="22" height="18" viewBox="0 0 22 18" fill="none" style={{ opacity: 0.85 }}>
            <path d="M3 9a6 6 0 016-6M3 13a10 10 0 0110-10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M3 5a14 14 0 0114-1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
          </svg>
        </div>
        {/* number + holder */}
        <div style={{ position: "relative" }}>
          <div className="num" style={{ fontSize: 18, letterSpacing: 3, display: "flex", gap: 12, fontWeight: 500 }}>
            <span style={{ opacity: 0.55 }}>••••</span><span style={{ opacity: 0.55 }}>••••</span>
            <span style={{ opacity: 0.55 }}>••••</span><span style={{ opacity: 0.85 }}>••••</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "flex-end" }}>
            <div style={{ fontSize: 12.5, letterSpacing: 1, fontWeight: 600, opacity: 0.92 }}>{(holder || "CARDHOLDER").toUpperCase()}</div>
            {card.is_primary && <div className="num" style={{ fontSize: 10, opacity: 0.7 }}>PRIMARY</div>}
          </div>
        </div>
      </div>

      {/* health footer (real expiry) */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 8px 6px" }}>
        <RingMeter pct={h.pct} color={h.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Points health</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{h.word}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: h.color, background: h.bg, padding: "5px 10px", borderRadius: 999 }}>{h.label}</div>
          <div className="num" style={{ fontSize: 12.5, color: "var(--ink-2)", textAlign: "right", marginTop: 6, fontWeight: 600 }}>
            {fmt(card.current_points)} {card.currency_name === "CashPoints" ? "CP" : "pts"}
          </div>
        </div>
      </div>

      {/* terms & conditions */}
      <div style={{ padding: "8px 8px 4px" }}>
        <button className="tap" onClick={(e) => { e.stopPropagation(); onOpenTnc && onOpenTnc(card); }} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "11px 12px",
          background: "var(--brand-50)", border: "1px solid var(--hairline)", borderRadius: "var(--r-sm)", cursor: "pointer", textAlign: "left" }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="var(--brand-600)" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 11.5l2 2 4-4" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Terms &amp; Conditions</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>Verify benefits on HDFC official</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}

function FloatingKobie({ onClick, greeting }) {
  return (
    <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, zIndex: 30,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
      <div className="tap" onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "auto" }}>
        <div style={{ background: "#fff", borderRadius: "18px 18px 18px 6px", padding: "11px 16px", boxShadow: "var(--sh-lg)",
          fontSize: 13.5, fontWeight: 600, color: "var(--ink)", animation: "chipFloat 3.4s ease-in-out infinite", border: "1px solid var(--hairline)" }}>
          {greeting}
        </div>
        <div style={{ position: "relative", width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ position: "absolute", width: 70, height: 70, borderRadius: "50%", background: "rgba(131,71,230,0.35)", animation: "haloPulse 2.6s ease-out infinite" }} />
          <div style={{ position: "relative", width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(160deg,#F7F2FE,#E0CEFA)",
            display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--sh-lg)" }}>
            <Kobie size={52} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ user, cards, mode, onOpenChat, onOpenSettings, onOpenTnc }) {
  const totalPoints = cards.reduce((a, c) => a + (c.current_points || 0), 0);
  const expiringSoon = cards
    .filter((c) => c.days_to_expiry != null && c.days_to_expiry <= 60 && c.next_expiry_points)
    .reduce((a, c) => a + c.next_expiry_points, 0);
  const firstName = (user?.name || "there").split(" ")[0];

  return (
    <div className="cr-root" style={{ height: "100%", position: "relative", overflow: "hidden", background: "var(--bg)" }}>
      <div className="no-sb" style={{ height: "100%", overflowY: "auto" }}>
        {/* purple header */}
        <div style={{ background: "linear-gradient(165deg, var(--brand-700) 0%, var(--brand-900) 100%)",
          borderRadius: "0 0 30px 30px", padding: "58px 20px 26px", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(163,117,240,0.35), transparent 70%)", top: -80, right: -50 }} />
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 6.3L21 9.2l-5 4.3L17.5 21 12 17.3 6.5 21 8 13.5 3 9.2l6.6-.9z" fill="#C4A4F4" /></svg>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>CredArt</span>
            </div>
            <div className="tap" onClick={onOpenSettings} style={{ width: 38, height: 38, borderRadius: 12,
              background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#fff" strokeWidth="1.7" /><path d="M19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 01-4 0v-.2A1.6 1.6 0 005 19.4a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003.4 14H3a2 2 0 010-4h.2A1.6 1.6 0 004.6 7.2a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 4.6V4a2 2 0 014 0v.2a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8" stroke="#fff" strokeWidth="1.5" /></svg>
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <ModeBadge mode={mode} onClick={onOpenSettings} />
            {mode === "production" && <ProtectedBadge />}
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13.5, opacity: 0.78, fontWeight: 500 }}>Welcome back, {firstName}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <span className="num" style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>{fmt(totalPoints)}</span>
              <span style={{ fontSize: 14, opacity: 0.82, fontWeight: 600 }}>points across your cards</span>
            </div>
            {expiringSoon > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12,
                background: "rgba(240,96,78,0.22)", border: "1px solid rgba(255,180,170,0.35)", padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FFB4AA" }} />
                {fmt(expiringSoon)} points expire within 60 days
              </div>
            )}
          </div>
        </div>

        {/* cards */}
        <div style={{ padding: "20px 16px 200px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 12px" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>Your cards</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>{cards.length} active</span>
          </div>
          {cards.map((c) => (
            <CardTile key={c.user_card_id} card={c} holder={user?.name} onClick={() => onOpenChat(c)} onOpenTnc={onOpenTnc} />
          ))}
          {cards.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: 30 }}>
              No cards loaded — is the backend running on :8001?
            </div>
          )}
        </div>
      </div>

      <FloatingKobie greeting={`Hi ${firstName}, what are you up to today?`} onClick={() => onOpenChat(null)} />
    </div>
  );
}
