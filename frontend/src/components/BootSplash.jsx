import React from "react";

/* Launch splash shown once on first load: the real Kobie wordmark on the
   brand's own cream, then a smooth fade-out that hands off to the landing. */
export function BootSplash({ onDone, hold = 2200 }) {
  const [leaving, setLeaving] = React.useState(false);
  React.useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), hold);         // start fade
    const t2 = setTimeout(() => onDone && onDone(), hold + 620); // unmount after fade
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hold, onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(circle at 50% 30%, #FDFBF5, #F6F0E3 58%, #EDE4D1)",
      fontFamily: "var(--font)", textAlign: "center", padding: 24,
      opacity: leaving ? 0 : 1,
      transform: leaving ? "scale(1.04)" : "scale(1)",
      transition: "opacity .6s ease, transform .6s ease",
    }}>
      {/* real Kobie wordmark */}
      <div className="boot-rise" style={{ position: "relative", marginBottom: 30 }}>
        <div style={{
          position: "absolute", inset: "-30px -46px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(251,123,84,0.18), transparent 70%)",
          animation: "bootHalo 2.4s ease-in-out infinite",
        }} />
        <img src="/kobieLOGOl.webp" alt="Kobie" style={{ width: "min(300px, 62vw)", display: "block", position: "relative" }} />
      </div>

      {/* heading */}
      <div className="boot-rise" style={{ animationDelay: ".12s", color: "#0B1D2C",
        fontSize: "clamp(19px, 3vw, 27px)", fontWeight: 800, letterSpacing: -0.4, marginBottom: 8 }}>
        Hackathon Launchpad 2026
      </div>
      <div className="boot-rise" style={{ animationDelay: ".2s", color: "rgba(11,29,44,0.55)",
        fontSize: 14.5, fontWeight: 600, marginBottom: 36 }}>
        team&nbsp;·&nbsp;<span style={{ color: "#FB7B54", fontWeight: 800 }}>dot-generate</span>
      </div>

      {/* loading shimmer */}
      <div style={{ width: 180, height: 3, borderRadius: 99, overflow: "hidden",
        background: "rgba(11,29,44,0.1)" }}>
        <div style={{ height: "100%", width: "40%", borderRadius: 99,
          background: "linear-gradient(90deg, transparent, #FB7B54, transparent)",
          animation: "bootSweep 1.15s ease-in-out infinite" }} />
      </div>
    </div>
  );
}
