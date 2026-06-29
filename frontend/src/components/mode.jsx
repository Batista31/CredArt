/* CredArt — shared execution-mode primitives (ESM).
   Demo / Production mode, fulfillment paths, trust cues. */
import React from "react";

/* ---- fulfillment path metadata ----
   each redemption is fulfilled through one of these execution paths.
   `live` paths (api/assisted/bank) require Production mode. demo is always available. */
export const CR_FULFILL = {
  demo: {
    key: "demo", label: "Demo", live: false, color: "var(--brand-600)", bg: "var(--brand-100)",
    icon: (s = 13) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M9 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 8.5V2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 2h8M7.5 13h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
    ),
  },
  api: {
    key: "api", label: "Live · API", live: true, color: "#0E7490", bg: "#E0F2F6",
    icon: (s = 13) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  assisted: {
    key: "assisted", label: "Assisted checkout", live: true, color: "#9333EA", bg: "#F3E8FF",
    icon: (s = 13) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8"/><path d="M3 8h18" stroke="currentColor" strokeWidth="1.8"/><circle cx="6" cy="6" r="0.6" fill="currentColor"/><circle cx="8.4" cy="6" r="0.6" fill="currentColor"/><path d="M9 13l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  bank: {
    key: "bank", label: "Bank activation", live: true, color: "#B45309", bg: "#FCEFD9",
    icon: (s = 13) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4v2H4V7l8-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M6 11v6M10 11v6M14 11v6M18 11v6M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
    ),
  },
};

/* path label for the success badge */
export function crPathLabel(pathKey) {
  return ({ demo: "Demo redemption", api: "Booked via Live API",
    assisted: "Assisted checkout completed", bank: "Completed via Bank Activation" })[pathKey] || "Demo redemption";
}

/* ---- small chip shown on recommendation cards (driven by backend fulfillment_options) ---- */
export function FulfillmentChip({ path, mode, available = true, size = "sm" }) {
  const f = CR_FULFILL[path]; if (!f) return null;
  const locked = (f.live && mode !== "production") || !available;
  const pad = size === "sm" ? "3px 7px" : "4px 9px";
  const fs = size === "sm" ? 10.5 : 11.5;
  return (
    <span title={locked ? "Switch to Production to use live execution." : f.label} style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: fs, fontWeight: 700,
      padding: pad, borderRadius: 999, lineHeight: 1, whiteSpace: "nowrap",
      color: locked ? "var(--ink-3)" : f.color,
      background: locked ? "rgba(28,19,48,0.05)" : f.bg,
      border: locked ? "1px dashed var(--hairline)" : "1px solid transparent",
      opacity: locked ? 0.85 : 1,
    }}>
      <span style={{ display: "flex", opacity: locked ? 0.6 : 1 }}>{f.icon(fs)}</span>
      {f.label}
      {locked && (
        <svg width={fs - 1} height={fs - 1} viewBox="0 0 24 24" fill="none" style={{ marginLeft: 1 }}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2"/></svg>
      )}
    </span>
  );
}

/* ---- mode badge (Demo / Production) shown in headers ---- */
export function ModeBadge({ mode, onClick, dark = true }) {
  const prod = mode === "production";
  return (
    <button className={onClick ? "tap" : ""} onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px",
      borderRadius: 999, cursor: onClick ? "pointer" : "default",
      fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.1,
      background: prod
        ? (dark ? "rgba(91,230,164,0.18)" : "#E5F8F0")
        : (dark ? "rgba(255,255,255,0.16)" : "var(--brand-100)"),
      color: prod ? (dark ? "#9CF0C6" : "#0F8A56") : (dark ? "#fff" : "var(--brand-700)"),
      border: prod ? "1px solid rgba(91,230,164,0.35)" : (dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--brand-200)"),
    }}>
      {prod ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"/><path d="M9 11.5l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />
      )}
      {prod ? "Production mode" : "Demo mode"}
    </button>
  );
}

/* subtle "protected booking" reassurance shown in production */
export function ProtectedBadge({ dark = true, compact = false }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600,
      color: dark ? "rgba(255,255,255,0.82)" : "var(--ink-2)",
      background: dark ? "rgba(255,255,255,0.1)" : "var(--surface)",
      border: dark ? "1px solid rgba(255,255,255,0.16)" : "1px solid var(--hairline)",
      padding: "5px 11px", borderRadius: 999 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
      {compact ? "Protected" : "Protected booking mode"}
    </span>
  );
}

/* enterprise trust cue: bank deployment badge */
export function BankBadge({ dark = false, sub = true }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9,
      background: dark ? "rgba(255,255,255,0.1)" : "var(--surface)",
      border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--hairline)",
      padding: "6px 12px 6px 8px", borderRadius: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: "linear-gradient(150deg,#E2231A,#B01410)", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: -0.3 }}>H</span>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: dark ? "#fff" : "var(--ink)" }}>HDFC deployment</div>
        {sub && <div style={{ fontSize: 10, fontWeight: 600, color: dark ? "rgba(255,255,255,0.6)" : "var(--ink-3)" }}>Bank-isolated environment</div>}
      </div>
    </div>
  );
}

/* shared trust footer used on the execution/success screens */
export function TrustFooter({ dark = true, prod }) {
  const c = dark ? "rgba(255,255,255,0.62)" : "var(--ink-3)";
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: dark ? "rgba(255,255,255,0.82)" : "var(--ink-2)",
        display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
        Secured &amp; redeemed by CredArt Agent
      </div>
      <div style={{ fontSize: 10.5, color: c }}>
        {prod ? "OTP and card security codes are never stored." : "Demo mode — no real card, OTP or money used."}
      </div>
    </div>
  );
}
