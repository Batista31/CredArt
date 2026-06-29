import React from "react";

/* Fulfillment-path metadata (ported from prototype mode.jsx).
   Path comes straight from the backend FulfillmentOption.path. */
export const CR_FULFILL = {
  demo: { key: "demo", label: "Demo", live: false, color: "var(--brand-600)", bg: "var(--brand-100)" },
  api: { key: "api", label: "Live · API", live: true, color: "#0E7490", bg: "#E0F2F6" },
  assisted: { key: "assisted", label: "Website checkout", live: true, color: "#9333EA", bg: "#F3E8FF" },
  bank: { key: "bank", label: "Bank activation", live: true, color: "#B45309", bg: "#FCEFD9" },
};

export function FulfillmentChip({ path, mode, locked }) {
  const f = CR_FULFILL[path];
  if (!f) return null;
  const isLocked = locked ?? (f.live && mode !== "production");
  return (
    <span title={f.label} style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700,
      padding: "3px 8px", borderRadius: 999, lineHeight: 1, whiteSpace: "nowrap",
      color: isLocked ? "var(--ink-3)" : f.color,
      background: isLocked ? "rgba(28,19,48,0.05)" : f.bg,
      border: isLocked ? "1px dashed var(--hairline)" : "1px solid transparent",
      opacity: isLocked ? 0.85 : 1,
    }}>
      {f.label}
      {isLocked && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2"/></svg>
      )}
    </span>
  );
}

export function ModeBadge({ mode, onClick }) {
  const prod = mode === "production";
  return (
    <button className="tap" data-testid="mode" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px",
      borderRadius: 999, cursor: "pointer", fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 700,
      background: prod ? "rgba(91,230,164,0.18)" : "rgba(255,255,255,0.16)",
      color: prod ? "#9CF0C6" : "#fff",
      border: prod ? "1px solid rgba(91,230,164,0.35)" : "1px solid rgba(255,255,255,0.18)",
    }}>
      {prod
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"/><path d="M9 11.5l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <span style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />}
      {prod ? "Production" : "Demo"}
    </button>
  );
}

export function BankBadge() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9,
      background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)",
      padding: "6px 12px 6px 8px", borderRadius: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: "linear-gradient(150deg,#E2231A,#B01410)", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 800, fontSize: 13 }}>H</span>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#fff" }}>HDFC deployment</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Bank-isolated environment</div>
      </div>
    </div>
  );
}
