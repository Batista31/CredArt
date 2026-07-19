/* iPhone bezel used by the laptop/mobile view switch.
 *
 * The status bar sits in normal flow (not absolutely positioned) so the wrapped
 * app's own top bar starts BELOW it rather than underneath it; only the dynamic
 * island and home indicator float over the content, as they do on a real device.
 */
import React from "react";

function IOSStatusBar({ dark }) {
  const c = dark ? "#fff" : "#000";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 30px 10px", position: "relative", zIndex: 20, width: "100%" }}>
      <span style={{ fontFamily: '-apple-system, system-ui', fontWeight: 590, fontSize: 15, color: c }}>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <svg width="18" height="11" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c}/>
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c}/>
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c}/>
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c}/>
        </svg>
        <svg width="25" height="12" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.35" fill="none"/>
          <rect x="2" y="2" width="20" height="9" rx="2" fill={c}/>
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.4"/>
        </svg>
      </div>
    </div>
  );
}

export function IOSDevice({ children, width = 402, height = 844, dark = false }) {
  return (
    <div style={{
      width, height, borderRadius: 48, overflow: "hidden", position: "relative", flexShrink: 0,
      background: dark ? "#000" : "#F2F2F7",
      boxShadow: "0 44px 90px -20px rgba(0,0,0,0.55), 0 0 0 10px #1c1c1e, 0 0 0 11px rgba(255,255,255,0.14)",
      fontFamily: "-apple-system, system-ui, sans-serif", WebkitFontSmoothing: "antialiased",
    }}>
      {/* dynamic island — floats over the status bar, as on-device */}
      <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
        width: 112, height: 32, borderRadius: 24, background: "#000", zIndex: 50 }} />

      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* in flow, so the app's own header sits below it */}
        <div style={{ flexShrink: 0, background: dark ? "#000" : "var(--surface, #fff)" }}>
          <IOSStatusBar dark={dark} />
        </div>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>{children}</div>
      </div>

      {/* home indicator */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 60, height: 26,
        display: "flex", justifyContent: "center", alignItems: "flex-end", paddingBottom: 8, pointerEvents: "none" }}>
        <div style={{ width: 139, height: 5, borderRadius: 100, background: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.25)" }} />
      </div>
    </div>
  );
}
