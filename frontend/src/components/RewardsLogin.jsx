/* CredArt — sign-in portal, modelled on the Navy Federal Rewards login:
 * a full-bleed travel photo, the program name in large white type, and a
 * frosted sign-in card. Demo auth: any credentials work — Login opens the
 * landing page. */
import React from "react";

const HERO = "https://picsum.photos/id/1015/1920/1080"; // river valley — travel vibe

function Field({ label, type = "text", value, onChange, autoFocus }) {
  return (
    <label style={{ display: "block", position: "relative", marginBottom: 16 }}>
      <span style={{ position: "absolute", top: -7, left: 12, fontSize: 10.5, fontWeight: 700, color: "var(--brand-700)",
        background: "#fff", padding: "0 6px", borderRadius: 4, letterSpacing: 0.3 }}>{label} *</span>
      <input type={type} value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "14px 14px", borderRadius: 10, border: "1.5px solid var(--brand-200)",
          outline: "none", fontFamily: "var(--font)", fontSize: 14.5, color: "var(--ink)", background: "#fff",
          boxShadow: "var(--sh-sm)" }} />
    </label>
  );
}

export function RewardsLogin({ onLogin }) {
  const [user, setUser] = React.useState("riya.sharma");
  const [pass, setPass] = React.useState("welcome-to-credart");

  function submit(e) {
    e && e.preventDefault();
    onLogin(); // demo: any credentials work
  }

  return (
    <div className="cr-root" style={{ minHeight: "100vh", position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* full-bleed photo + navy wash */}
      <img src={HERO} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,28,51,0.72), rgba(12,39,72,0.55) 45%, rgba(8,28,51,0.78))" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 1060, padding: "48px 22px 40px",
        display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        {/* program name */}
        <h1 style={{ color: "#fff", fontFamily: "var(--font)", fontWeight: 800, textAlign: "center",
          fontSize: "clamp(34px, 6vw, 58px)", letterSpacing: -1, margin: "10px 0 4px",
          textShadow: "0 4px 24px rgba(0,0,0,0.35)" }}>
          CredArt Rewards
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15.5, margin: "0 0 34px", textAlign: "center", fontWeight: 600 }}>
          You've earned it. Now enjoy it.
        </p>

        {/* split: photo card + sign-in card (like the NFR portal) */}
        <div style={{ display: "flex", gap: 0, width: "100%", maxWidth: 860, borderRadius: 18, overflow: "hidden",
          boxShadow: "0 34px 80px rgba(0,0,0,0.45)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", minHeight: 300, position: "relative" }}>
            <img src="https://picsum.photos/id/1011/900/900" alt="rewards getaway"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(200deg, transparent 40%, rgba(8,28,51,0.65))" }} />
            <div style={{ position: "absolute", left: 20, bottom: 18, right: 20, color: "#fff" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Flights · Stays · Gift cards · Gadgets</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 3 }}>200+ rewards, all priced in points — with an AI concierge to guide you.</div>
            </div>
          </div>

          <form onSubmit={submit} style={{ flex: "1 1 340px", background: "linear-gradient(170deg,#F4F7FB,#E8EEF6)",
            padding: "34px 34px 30px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h2 style={{ margin: "0 0 22px", fontFamily: "var(--font)", fontSize: 23, fontWeight: 800, color: "var(--brand-900)" }}>
              Sign in to your account
            </h2>
            <Field label="Username" value={user} onChange={setUser} autoFocus />
            <Field label="Password" type="password" value={pass} onChange={setPass} />
            <button type="submit" className="tap" style={{ width: "100%", padding: 14, marginTop: 4, borderRadius: 999, border: "none",
              background: "linear-gradient(135deg,var(--brand-600),var(--brand-800))", color: "#fff",
              fontFamily: "var(--font)", fontSize: 15.5, fontWeight: 800, cursor: "pointer",
              boxShadow: "0 10px 24px rgba(12,39,72,0.35)" }}>
              Login
            </button>
            <button type="button" className="tap" onClick={submit} style={{ margin: "12px auto 0", background: "transparent", border: "none",
              color: "var(--brand-600)", fontFamily: "var(--font)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Forgot Password?
            </button>
            <div style={{ borderTop: "1px solid var(--brand-100)", margin: "16px 0 14px" }} />
            <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, marginBottom: 10 }}>
              Don't have an account?
            </div>
            <button type="button" className="tap" onClick={submit} style={{ width: "100%", padding: 12, borderRadius: 999,
              border: "1.5px solid var(--brand-500)", background: "transparent", color: "var(--brand-700)",
              fontFamily: "var(--font)", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              Create Account
            </button>
            <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>
              Demo portal — any credentials sign you in.
            </div>
          </form>
        </div>

        <div style={{ marginTop: 28, color: "rgba(255,255,255,0.65)", fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          Powered by CredArt · every number pre-verified, never invented
        </div>
      </div>
    </div>
  );
}
