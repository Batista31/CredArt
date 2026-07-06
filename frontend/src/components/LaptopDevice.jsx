import React from "react";

/* MacBook-style chassis: bezel + camera + browser chrome + hinge base.
   Content fills the screen and scrolls inside it. */
export function LaptopDevice({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "20px 16px 8px",
      background: "radial-gradient(circle at 30% 18%, #241246, #120726 60%, #0a0416)" }}>
      {/* screen */}
      <div style={{ width: "min(1440px, 95vw)", height: "min(860px, calc(100vh - 92px))",
        background: "#0d0d12", borderRadius: 20, padding: "34px 14px 16px", position: "relative",
        boxShadow: "0 40px 90px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)" }}>
        {/* camera */}
        <div style={{ position: "absolute", top: 15, left: "50%", transform: "translateX(-50%)",
          width: 7, height: 7, borderRadius: "50%", background: "#2b2b31",
          boxShadow: "inset 0 0 2px rgba(120,180,255,0.5)" }} />
        {/* browser chrome + screen area */}
        <div style={{ height: "100%", borderRadius: 10, overflow: "hidden", display: "flex",
          flexDirection: "column", background: "var(--bg, #fff)" }}>
          <div style={{ height: 38, flexShrink: 0, background: "#f3f0f9", borderBottom: "1px solid rgba(0,0,0,0.07)",
            display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff",
                border: "1px solid rgba(0,0,0,0.08)", borderRadius: 999, padding: "4px 16px", fontSize: 11.5,
                color: "#6b6479", fontWeight: 600, fontFamily: "var(--font)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" /></svg>
                app.credart.ai
              </div>
            </div>
            <div style={{ width: 44 }} />
          </div>
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>{children}</div>
        </div>
      </div>
      {/* hinge base */}
      <div style={{ width: "min(1560px, 99vw)", height: 15, background: "linear-gradient(#c3c6cf, #9498a3)",
        borderRadius: "0 0 14px 14px", position: "relative",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 120, height: 7, background: "#7d818c", borderRadius: "0 0 8px 8px" }} />
      </div>
    </div>
  );
}
