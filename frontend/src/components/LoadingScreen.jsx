/* Kobie Launchpad Hackathon — splash shown between sign-in and the landing page.
 *
 * White background to match the logo artwork itself, so the mark sits seamlessly
 * with no visible edge. Drop the logo at `frontend/public/kobie-logo.png`; if it
 * is missing the wordmark falls back to type so the splash never looks broken.
 */
import React from "react";

const NAVY = "#0C2340";
const CORAL = "#FF8060";
const HOLD_MS = 2400;

export function LoadingScreen({ onDone }) {
  const [imgOk, setImgOk] = React.useState(true);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), HOLD_MS);
    const done = setTimeout(onDone, HOLD_MS + 420);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, background: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 26, padding: 24, boxSizing: "border-box",
      opacity: leaving ? 0 : 1,
      transition: "opacity .42s ease",
    }}>
      {/* logo */}
      <div className="animate-msg" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        {imgOk ? (
          <img
            src="/kobie-logo.png"
            alt="Kobie"
            onError={() => setImgOk(false)}
            style={{ width: "min(340px, 62vw)", height: "auto", display: "block" }}
          />
        ) : (
          /* type fallback — only if the PNG hasn't been added yet */
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 14,
            fontFamily: "var(--font)", fontWeight: 800, fontSize: "clamp(44px, 9vw, 78px)",
            color: NAVY, letterSpacing: -2, lineHeight: 1,
          }}>
            Kobie
            <svg width="0.62em" height="0.62em" viewBox="0 0 24 24" fill={CORAL} aria-hidden>
              <path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21z" />
            </svg>
          </div>
        )}
      </div>

      {/* caption */}
      <div className="animate-msg" style={{
        animationDelay: "140ms",
        fontFamily: "var(--font)", fontWeight: 700, color: NAVY,
        fontSize: "clamp(14px, 1.9vw, 19px)", letterSpacing: 3.4, textTransform: "uppercase",
        textAlign: "center",
      }}>
        Kobie Launchpad Hackathon
      </div>

      {/* coral progress sliver */}
      <div style={{
        width: "min(200px, 42vw)", height: 3, borderRadius: 999,
        background: "rgba(12,35,64,0.08)", overflow: "hidden", marginTop: 6,
      }}>
        <div className="cr-load-bar" style={{ height: "100%", borderRadius: 999, background: CORAL }} />
      </div>
    </div>
  );
}
