/* CredArt — OTP entry for a live flight redemption.
 *
 * Shared by every surface that can book a Duffel flight (the Travel page's
 * review screen and the concierge chat bubble's inline flight cards), so a
 * flight booked in chat is gated exactly like one booked from the full page —
 * same overlay, demo SMS card, 6-digit boxes, shake on a wrong code, 2-minute
 * countdown. Cancelling or letting it expire leaves the booking untouched.
 *
 * Design ported from RewardsCheckout's OtpStep so every redemption in the app
 * asks for OTP the same way.
 *
 * `offer` needs { airline, origin, destination }. `demoOtp` is the code shown
 * in the SMS card; the caller owns it and checks the submitted code, because
 * the caller also owns what happens on success.
 */
import React from "react";

export function FlightOtpStep({ offer, demoOtp, onSubmit, onCancel, error }) {
  const [digits, setDigits] = React.useState(["", "", "", "", "", ""]);
  const [secs, setSecs] = React.useState(120);
  const refs = React.useRef([]);

  React.useEffect(() => {
    if (secs <= 0) { onCancel("OTP expired — no points were deducted."); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const set = (i, v) => {
    v = v.replace(/\D/g, "").slice(-1);
    setDigits((d) => { const n = [...d]; n[i] = v; return n; });
    if (v && i < 5) refs.current[i + 1] && refs.current[i + 1].focus();
  };
  const onKey = (i, e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1].focus(); };

  const code = digits.join("");
  const full = code.length === 6;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(8,28,51,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "fadeIn .18s ease" }}>
      <div style={{ width: "min(420px, 100%)", height: "min(560px, 94%)", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 34px 80px rgba(8,28,51,0.55)", animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)",
        background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff", padding: "26px 22px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.82, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FFC96B" }} />
            SECURE REDEMPTION SESSION
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8 }}>Confirm with OTP</div>
          <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: "9px 13px", fontSize: 13, fontWeight: 600 }}>
            <span>{offer.airline} {offer.origin}→{offer.destination}</span>
            <span style={{ opacity: 0.5 }}>·</span><span style={{ opacity: 0.9 }}>Riya's account</span>
          </div>
        </div>

        <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "22px 22px" }}>
          <div className="animate-msg" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff",
            border: "1px solid var(--brand-100)", borderLeft: "4px solid var(--brand-600)", borderRadius: 12,
            padding: "11px 14px", boxShadow: "var(--sh-md)", maxWidth: 380, margin: "0 auto" }}>
            <span style={{ fontSize: 18 }}>💬</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-700)", letterSpacing: 0.4 }}>CREDART BANK · SMS</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
                OTP for your flight redemption is <b className="num" style={{ color: "var(--ink)", fontSize: 14 }}>{demoOtp}</b>. Valid for 2 minutes. Do not share it.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13.5, color: "var(--ink-2)", fontWeight: 600, textAlign: "center", marginTop: 22 }}>
            Enter the 6-digit code sent to Riya's registered mobile
          </div>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 16 }} className={error ? "cr-shake" : ""}>
            {digits.map((d, i) => (
              <input key={i} ref={(el) => (refs.current[i] = el)} value={d} inputMode="numeric" autoFocus={i === 0}
                onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
                style={{ width: 44, height: 54, textAlign: "center", fontFamily: "var(--font-num)", fontSize: 24, fontWeight: 700,
                  color: "var(--ink)", borderRadius: 14, outline: "none", background: "#fff",
                  border: error ? "2px solid var(--red)" : (d ? "2px solid var(--brand-500)" : "1.5px solid var(--hairline)"),
                  boxShadow: "var(--sh-sm)", transition: "border .15s ease" }} />
            ))}
          </div>
          {error && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "var(--red)" }}>{error}</div>}
          <div className="num" style={{ marginTop: 16, textAlign: "center", fontSize: 13, fontWeight: 700, color: secs < 30 ? "var(--red)" : "var(--ink-3)" }}>
            OTP expires in {mm}:{ss}
          </div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" /></svg>
            CredArt never stores your OTP.
          </div>
        </div>

        <div style={{ padding: "12px 22px 22px", background: "#fff", borderTop: "1px solid var(--hairline)" }}>
          <button className="tap" onClick={() => full && onSubmit(code)} disabled={!full} style={{ width: "100%", padding: 15,
            background: full ? "linear-gradient(135deg,var(--brand-600),var(--brand-800))" : "var(--brand-200)",
            color: "#fff", border: "none", borderRadius: 999, fontFamily: "var(--font)", fontSize: 15.5, fontWeight: 800,
            boxShadow: full ? "0 10px 22px rgba(12,39,72,0.32)" : "none", cursor: full ? "pointer" : "default", opacity: full ? 1 : 0.7 }}>
            Submit OTP
          </button>
          <button className="tap" onClick={() => onCancel("Redemption cancelled — no points were deducted.")} style={{ width: "100%", marginTop: 8, padding: 12,
            background: "transparent", color: "var(--ink-3)", border: "none", fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Cancel redemption
          </button>
        </div>
      </div>
    </div>
  );
}
