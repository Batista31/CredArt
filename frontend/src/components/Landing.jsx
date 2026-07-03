/* CredArt — landing / home screen.
 * Premium dark hero with three category cards. Picking one opens that
 * category's themed concierge (handled by App.jsx). Mobile-friendly grid. */
import React from "react";
import { THEMES, CategoryIcon } from "../theme.jsx";

const ORDER = ["bank", "dining", "entertainment"];

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
        textAlign: "left", cursor: "pointer", border: "none", padding: 0,
        borderRadius: 22, overflow: "hidden", background: "#fff",
        boxShadow: hover
          ? "0 26px 54px -14px rgba(0,0,0,0.5)"
          : "0 16px 40px -18px rgba(0,0,0,0.45)",
        transform: hover ? "translateY(-6px)" : "translateY(0)",
        transition: "transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* themed banner */}
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

      {/* body */}
      <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 16, flex: 1,
        fontFamily: "var(--font)" }}>
        <p style={{ margin: 0, color: "#4A4460", fontSize: 14, lineHeight: 1.5, flex: 1 }}>{theme.tagline}</p>
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

export function Landing({ onPick, view = "laptop" }) {
  const mobile = view === "mobile";
  return (
    <div className="cr-root no-sb" style={{
      minHeight: mobile ? "100%" : "100vh", height: mobile ? "100%" : undefined,
      width: "100%", overflowY: mobile ? "auto" : "visible",
      background: "radial-gradient(circle at 18% 8%, #241246, #120726 55%, #0a0416)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: mobile ? "40px 18px 34px" : "56px 20px 48px",
    }}>
      {/* brand mark */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
        <span style={{
          width: 40, height: 40, borderRadius: 12,
          background: "linear-gradient(150deg,#A175F0,#6A2FC4)", display: "flex",
          alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20,
          boxShadow: "0 8px 22px rgba(106,47,196,0.5)",
        }}>C</span>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: -0.3 }}>CredArt</span>
      </div>

      <h1 style={{
        color: "#fff", fontFamily: "var(--font)", fontWeight: 800, textAlign: "center",
        fontSize: "clamp(28px, 5vw, 46px)", lineHeight: 1.1, margin: "0 0 14px", maxWidth: 760,
      }}>
        One AI concierge.<br />
        <span style={{ background: "linear-gradient(100deg,#C4A4F4,#FFC72C,#FF4D5E)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          Every rewards program.
        </span>
      </h1>
      <p style={{ color: "rgba(255,255,255,0.72)", fontFamily: "var(--font)", fontSize: 15.5, textAlign: "center",
        maxWidth: 560, lineHeight: 1.55, margin: "0 0 42px" }}>
        Pick a rewards world below. CredArt reads your points, finds the smartest redemption, and books it —
        every number pre-verified, never invented.
      </p>

      {/* cards */}
      <div style={{
        width: "100%", maxWidth: 1040, display: "grid", gap: 22,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      }}>
        {ORDER.map((k, i) => <Card key={k} theme={THEMES[k]} onPick={onPick} delay={i * 90} />)}
      </div>

      <div style={{ marginTop: 40, color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "var(--font)",
        display: "flex", alignItems: "center", gap: 7 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
        Anti-hallucination boundary · the assistant only ever sees pre-validated options
      </div>
    </div>
  );
}
