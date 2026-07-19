/* Laptop / Mobile view switch.
 *
 * The bank experience is dual-face: the same screens render either in a desktop
 * browser-window shell or inside a phone bezel (BankExperience's `view` prop).
 * Both faces render the SAME inner tree, so flipping this never remounts — the
 * screen you were on, and its state, survive the switch.
 */
import React from "react";

const LaptopIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.9" />
    <path d="M2 20h20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const MobileIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <rect x="7" y="2" width="10" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
    <path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export function ViewToggle({ view, onChange }) {
  const seg = (key, label, icon) => {
    const active = view === key;
    return (
      <button
        className="tap"
        onClick={() => onChange(key)}
        title={`${label} view`}
        aria-pressed={active}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999,
          border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800,
          background: active ? "#fff" : "transparent",
          color: active ? "#1C1330" : "rgba(255,255,255,0.78)",
          boxShadow: active ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
          transition: "background .16s ease, color .16s ease",
        }}
      >
        {icon}{label}
      </button>
    );
  };

  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 200, display: "inline-flex", gap: 2,
      padding: 3, borderRadius: 999, background: "rgba(18,10,38,0.78)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
    }}>
      {seg("laptop", "Laptop", LaptopIcon)}
      {seg("mobile", "Mobile", MobileIcon)}
    </div>
  );
}
