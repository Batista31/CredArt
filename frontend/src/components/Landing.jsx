/* CredArt — landing / home screen.
 * "The art of managing credits" on Kobie's own palette: warm cream, ink navy,
 * coral. Hero → why it's different → live demo worlds → where it can go →
 * where it fits inside an existing platform (Kobie partner story). */
import React from "react";
import { THEMES, CategoryIcon } from "../theme.jsx";

const ORDER = ["bank", "dining", "entertainment"];

const FONT = { fontFamily: "var(--font)" };
const INK = "#0B1D2C";
const CORAL = "#FB7B54";
const MUTED = "rgba(11,29,44,0.58)";

/* -- pillar: one core differentiator ------------------------------------- */
function Pillar({ icon, title, body, delay }) {
  return (
    <div className="animate-msg" style={{
      animationDelay: delay + "ms", flex: "1 1 220px", maxWidth: 330,
      background: "#fff", border: "1px solid rgba(11,29,44,0.08)",
      borderRadius: 18, padding: "18px 20px", boxShadow: "0 10px 30px -18px rgba(11,29,44,0.25)", ...FONT,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: INK, fontWeight: 800, fontSize: 14.5, marginBottom: 6 }}>{title}</div>
      <div style={{ color: MUTED, fontSize: 12.8, lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}

/* -- demo world card ------------------------------------------------------ */
function Card({ theme, onPick, delay }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      className="tap animate-msg"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onPick(theme.key)}
      style={{
        animationDelay: delay + "ms",
        textAlign: "left", cursor: "pointer", border: "1px solid rgba(11,29,44,0.08)", padding: 0,
        borderRadius: 22, overflow: "hidden", background: "#fff",
        boxShadow: hover
          ? "0 26px 54px -14px rgba(11,29,44,0.35)"
          : "0 16px 40px -20px rgba(11,29,44,0.28)",
        transform: hover ? "translateY(-6px)" : "translateY(0)",
        transition: "transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{
        background: theme.cardGrad, padding: "22px 20px 20px", position: "relative",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{
          width: 52, height: 52, borderRadius: 15, flexShrink: 0,
          background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.24)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CategoryIcon name={theme.icon} size={28} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: -0.2 }}>{theme.name}</div>
          <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{theme.brand}</div>
        </div>
        <span style={{
          position: "absolute", top: 16, right: 16, width: 30, height: 30, borderRadius: 999,
          background: theme.accent, boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
        }} />
      </div>
      <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 16, flex: 1, ...FONT }}>
        <p style={{ margin: 0, color: MUTED, fontSize: 14, lineHeight: 1.5, flex: 1 }}>{theme.tagline}</p>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 16px", borderRadius: 13, fontWeight: 800, fontSize: 13.5,
          background: theme.cardGrad, color: "#fff",
        }}>
          Try CredArt for {theme.name}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </button>
  );
}

/* -- section heading ------------------------------------------------------ */
function SectionTitle({ kicker, title, sub }) {
  return (
    <div style={{ textAlign: "center", margin: "0 0 26px", ...FONT }}>
      <div style={{
        color: CORAL, fontWeight: 800, fontSize: 11.5, letterSpacing: 2.2,
        textTransform: "uppercase", marginBottom: 8,
      }}>{kicker}</div>
      <h2 style={{ color: INK, fontWeight: 800, fontSize: "clamp(20px,3vw,28px)", margin: "0 0 8px", letterSpacing: -0.3 }}>{title}</h2>
      {sub && <p style={{ color: MUTED, fontSize: 13.5, maxWidth: 620, margin: "0 auto", lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

/* verticals CredArt can power — the "potential" strip */
const VERTICALS = [
  ["🏦", "Banks & cards"], ["✈️", "Airlines & miles"], ["🏨", "Hotels"],
  ["🍔", "Dining & QSR"], ["🎬", "Entertainment"], ["🛍️", "E-commerce"],
  ["⛽", "Fuel & auto"], ["📱", "Telecom"], ["🛒", "Grocery"], ["💊", "Pharmacy & wellness"],
];

export function Landing({ onPick, view = "laptop" }) {
  const mobile = view === "mobile";
  const [kHover, setKHover] = React.useState(false);
  return (
    <div className="cr-root no-sb" style={{
      height: "100%", width: "100%", overflowY: "auto",
      background: "radial-gradient(circle at 18% 8%, #FDFBF5, #F6F0E3 55%, #EDE3CF)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: mobile ? "40px 18px 34px" : "56px 20px 48px", boxSizing: "border-box",
    }}>
      {/* ---- hero ---- */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <span style={{
          width: 40, height: 40, borderRadius: 12,
          background: "linear-gradient(150deg,#16354D,#0B1D2C)", display: "flex",
          alignItems: "center", justifyContent: "center", color: "#FBF7EE", fontWeight: 800, fontSize: 20,
          boxShadow: "0 8px 22px rgba(11,29,44,0.35)",
        }}>C</span>
        <span style={{ color: INK, fontWeight: 800, fontSize: 20, letterSpacing: -0.3, ...FONT }}>CredArt</span>
      </div>

      <h1 style={{
        color: INK, fontWeight: 800, textAlign: "center", ...FONT,
        fontSize: "clamp(28px, 5vw, 48px)", lineHeight: 1.08, margin: "0 0 12px", maxWidth: 820,
      }}>
        The art of managing <span style={{ backgroundImage: `linear-gradient(100deg,${CORAL},#E8542B)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>credits</span>
      </h1>
      <p style={{ color: MUTED, fontSize: 15.5, textAlign: "center",
        maxWidth: 620, lineHeight: 1.55, margin: "0 0 30px", ...FONT }}>
        An AI rewards concierge for any loyalty program. It reads your points, understands what you
        actually want — a trip, a gift, dinner — and books the smartest redemption in one chat.
        Every number pre-verified. Never invented.
      </p>

      {/* ---- pillars: why it's different ---- */}
      <div style={{
        width: "100%", maxWidth: 1040, display: "flex", flexWrap: "wrap", gap: 14,
        justifyContent: "center", marginBottom: 52,
      }}>
        <Pillar delay={0} icon="🧮" title="Deterministic core"
          body="All ₹ and points math is computed from the catalogue and the member's own data by real code. The AI explains options — it can never make numbers up." />
        <Pillar delay={80} icon="🧠" title="Personal, in context"
          body="Learns each member's lean — travel, dining, gifting — and even remembers who they gift for. A gift for mom is shopped for mom, not for you." />
        <Pillar delay={160} icon="🏷️" title="White-label by design"
          body="One brand per deployment, its own theme and catalogue. The same engine powers a bank, a QSR chain or a cinema program without mixing a single row of data." />
        <Pillar delay={240} icon="⚡" title="Never blocks, never breaks"
          body="Live flights, vouchers and OTP redemption when providers are up; graceful deterministic fallbacks when they're not. The conversation always answers." />
      </div>

      {/* ---- live demo worlds ---- */}
      <SectionTitle kicker="Live demos" title="One engine. Three loyalty worlds."
        sub="Each card below is the same CredArt backend wearing a different brand — proof of the white-label model." />
      <div style={{
        width: "100%", maxWidth: 1040, display: "grid", gap: 22, marginBottom: 52,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      }}>
        {ORDER.map((k, i) => <Card key={k} theme={THEMES[k]} onPick={onPick} delay={i * 90} />)}
      </div>

      {/* ---- potential ---- */}
      <SectionTitle kicker="Where it can go" title="Any program with points is a CredArt program"
        sub="The concierge layer doesn't care what the currency is — points, miles, stars or cashback. If members earn it, CredArt helps them spend it well." />
      <div style={{
        width: "100%", maxWidth: 900, display: "flex", flexWrap: "wrap", gap: 10,
        justifyContent: "center", marginBottom: 56,
      }}>
        {VERTICALS.map(([emoji, label]) => (
          <span key={label} style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px",
            borderRadius: 999, background: "#fff",
            border: "1px solid rgba(11,29,44,0.1)", color: INK,
            fontSize: 13, fontWeight: 700, boxShadow: "0 4px 14px -8px rgba(11,29,44,0.2)", ...FONT,
          }}>{emoji} {label}</span>
        ))}
      </div>

      {/* ---- Kobie fit ---- */}
      <SectionTitle kicker="Built to plug in" title="Where CredArt fits in an existing platform"
        sub="CredArt isn't a rival rewards platform — it's the concierge layer on top of one. Here's what it looks like living inside a Kobie-style rewards storefront." />
      <button
        className="tap"
        onMouseEnter={() => setKHover(true)}
        onMouseLeave={() => setKHover(false)}
        onClick={() => onPick("rewards")}
        style={{
          width: "100%", maxWidth: 860, cursor: "pointer", border: "none",
          borderRadius: 22, padding: mobile ? "22px 20px" : "26px 30px", textAlign: "left",
          background: "linear-gradient(120deg, #0B1D2C, #16354D)",
          boxShadow: kHover ? "0 26px 54px -14px rgba(11,29,44,0.6)" : "0 16px 40px -18px rgba(11,29,44,0.45)",
          transform: kHover ? "translateY(-4px)" : "none",
          transition: "transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease",
          display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", ...FONT,
        }}
      >
        {/* real Kobie mark on a cream chip so the navy K reads on the navy card */}
        <span style={{
          width: 62, height: 62, borderRadius: 18, flexShrink: 0, background: "#FBF7EE",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
        }}>
          <img src="/kobieLOGOs.webp" alt="Kobie" style={{ width: 38, height: 38, objectFit: "contain" }} />
        </span>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div style={{ color: CORAL, fontWeight: 800, fontSize: 11.5, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
            Partner showcase · Kobie
          </div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: mobile ? 17 : 20, letterSpacing: -0.2, marginBottom: 8 }}>
            The rewards store your members already know — with a concierge on tap
          </div>
          <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 13.2, lineHeight: 1.55 }}>
            The storefront, catalogue and checkout stay exactly as they are. CredArt drops in as an
            embedded assistant: it searches the same catalogue, quotes the same point prices, and
            hands the member a pre-validated redemption — no re-platforming, no data migration.
          </div>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 20px", flexShrink: 0,
          borderRadius: 13, fontWeight: 800, fontSize: 13.5, color: "#fff",
          background: `linear-gradient(100deg,${CORAL},#E8542B)`, boxShadow: "0 6px 18px rgba(251,123,84,0.4)",
        }}>
          Open the rewards store
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>

      <div style={{ marginTop: 44, color: "rgba(11,29,44,0.45)", fontSize: 12, ...FONT,
        display: "flex", alignItems: "center", gap: 7 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
        Anti-hallucination boundary · the assistant only ever sees pre-validated options
      </div>
    </div>
  );
}
