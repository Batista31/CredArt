import React from "react";

function RobotFace({ size, state }) {
  const eyeGlow = state === "happy";
  return (
    <svg viewBox="0 0 40 40" width={size * 0.72} height={size * 0.72} style={{ position: "relative", overflow: "visible" }}>
      <line x1="20" y1="5" x2="20" y2="11" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="4" r="2.4" fill={eyeGlow ? "#fff" : "rgba(255,255,255,0.85)"}
        style={eyeGlow ? { animation: "antennaGlow 1.4s ease-in-out infinite", transformOrigin: "20px 4px" } : {}} />
      <rect x="8" y="11" width="24" height="20" rx="6" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <rect x="12" y="17" width="6" height="5" rx="2" fill={eyeGlow ? "#fff" : "rgba(255,255,255,0.9)"}
        style={eyeGlow ? { animation: "eyeGlow 1.4s ease-in-out infinite" } : { animation: "eyeBlink 4s ease-in-out infinite" }} />
      <rect x="22" y="17" width="6" height="5" rx="2" fill={eyeGlow ? "#fff" : "rgba(255,255,255,0.9)"}
        style={eyeGlow ? { animation: "eyeGlow 1.4s ease-in-out 0.1s infinite" } : { animation: "eyeBlink 4s ease-in-out 0.1s infinite" }} />
      <circle cx="14" cy="18.5" r="1" fill="rgba(255,255,255,0.5)" />
      <circle cx="24" cy="18.5" r="1" fill="rgba(255,255,255,0.5)" />
      {state === "happy"
        ? <path d="M14 27 Q20 32 26 27" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
        : <path d="M15 27 Q20 30.5 25 27" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
      <circle cx="8" cy="21" r="2" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <circle cx="32" cy="21" r="2" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
    </svg>
  );
}

/* large mascot used on dashboard + execution screens */
export function Kobie({ size = 72, state = "idle", style = {} }) {
  const breathe = state === "idle";
  return (
    <div style={{
      width: size, height: size, position: "relative",
      animation: breathe ? "kobieBreathe 3.6s ease-in-out infinite" : "none",
      ...style,
    }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.3,
        background: "linear-gradient(155deg, var(--brand-500), var(--brand-700))",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 20px rgba(84,35,155,0.35)", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, rgba(255,255,255,0.22), transparent 55%)" }} />
        {state === "think" ? (
          <div style={{ display: "flex", gap: size * 0.07 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: size * 0.1, height: size * 0.1, borderRadius: 99, background: "#fff",
                animation: `thinkDot 1.2s ease-in-out ${i * 0.18}s infinite` }} />
            ))}
          </div>
        ) : <RobotFace size={size} state={state} />}
      </div>
    </div>
  );
}

export function KobieAvatar({ size = 38, state = "idle" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.32,
      background: "linear-gradient(155deg, var(--brand-500), var(--brand-700))",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 4px 10px rgba(84,35,155,0.32)", flexShrink: 0,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, rgba(255,255,255,0.22), transparent 55%)" }} />
      {state === "think" ? (
        <div style={{ display: "flex", gap: size * 0.08 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: size * 0.11, height: size * 0.11, borderRadius: 99, background: "#fff",
              animation: `thinkDot 1.2s ease-in-out ${i * 0.18}s infinite` }} />
          ))}
        </div>
      ) : <RobotFace size={size} state={state} />}
    </div>
  );
}
