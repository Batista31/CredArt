/* CredArt — Booking execution: agentic progress → (real OTP) → success / failed.
   Drives the REAL backend: /redeem, /booking-sessions, /booking-sessions/{id}/otp.
   OTP is never bypassed or auto-submitted; card/CVV/OTP are never stored. */
import React from "react";
import { api } from "../lib/api.js";
import { Kobie } from "./Kobie.jsx";
import { CR_FULFILL, crPathLabel, ProtectedBadge, TrustFooter } from "./mode.jsx";

const fmt = (n) => (n == null ? "0" : Number(n).toLocaleString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

/* ---------- real OTP entry ---------- */
function OtpScreen({ ctx, onSubmit, onCancel, error, busy }) {
  const [digits, setDigits] = React.useState(["", "", "", "", "", ""]);
  const [secs, setSecs] = React.useState(ctx.secondsLeft || 150);
  const refs = React.useRef([]);

  React.useEffect(() => {
    if (secs <= 0) { onCancel("OTP expired"); return; }
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
    <div className="cr-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff", padding: "54px 20px 22px", boxShadow: "0 6px 18px rgba(42,14,85,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.82, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FFC96B" }} />
          SECURE BOOKING SESSION
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8 }}>Confirm with OTP</div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: "9px 13px", fontSize: 13, fontWeight: 600 }}>
          <span>{ctx.merchant}</span>
          {ctx.amount != null && (<><span style={{ opacity: 0.5 }}>·</span><span className="num">₹{fmt(ctx.amount)}</span></>)}
          {ctx.last4 && (<><span style={{ opacity: 0.5 }}>·</span><span style={{ opacity: 0.9 }}>card ••{ctx.last4}</span></>)}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "26px 22px" }} className="no-sb">
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", fontWeight: 600, textAlign: "center" }}>
          Enter the 6-digit code your bank just sent
        </div>
        <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 18 }} className={error ? "cr-shake" : ""}>
          {digits.map((d, i) => (
            <input key={i} ref={(el) => (refs.current[i] = el)} value={d} inputMode="numeric" autoFocus={i === 0}
              onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
              style={{ width: 44, height: 54, textAlign: "center", fontFamily: "var(--font-num)", fontSize: 24, fontWeight: 700,
                color: "var(--ink)", borderRadius: 14, outline: "none", background: "var(--surface)",
                border: error ? "2px solid var(--red)" : (d ? "2px solid var(--brand-500)" : "1.5px solid var(--hairline)"),
                boxShadow: "var(--sh-sm)", transition: "border .15s ease" }} />
          ))}
        </div>
        {error && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "var(--red)" }}>{error}</div>}
        <div className="num" style={{ marginTop: 16, textAlign: "center", fontSize: 13, fontWeight: 700, color: secs < 30 ? "var(--red)" : "var(--ink-3)" }}>
          OTP expires in {mm}:{ss}
        </div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8"/></svg>
          CredArt never stores your OTP.
        </div>
      </div>

      <div style={{ padding: "12px 20px 30px", background: "var(--surface)", borderTop: "1px solid var(--hairline)" }}>
        <button className="tap" onClick={() => full && onSubmit(code)} disabled={!full || busy} style={{ width: "100%", padding: 15,
          background: (full && !busy) ? "linear-gradient(135deg,var(--brand-600),var(--brand-700))" : "var(--brand-200)",
          color: "#fff", border: "none", borderRadius: "var(--r-md)", fontFamily: "var(--font)", fontSize: 15.5, fontWeight: 800,
          boxShadow: full ? "0 10px 22px rgba(84,35,155,0.32)" : "none", cursor: full && !busy ? "pointer" : "default", opacity: full ? 1 : 0.7 }}>
          {busy ? "Verifying…" : "Submit OTP"}
        </button>
        <button className="tap" onClick={() => onCancel("Booking cancelled")} style={{ width: "100%", marginTop: 10, padding: 13,
          background: "transparent", color: "var(--ink-3)", border: "none", fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Cancel booking
        </button>
      </div>
    </div>
  );
}

/* ---------- failed ---------- */
function FailedScreen({ reason, onBack }) {
  return (
    <div className="cr-root" style={{ height: "100%", position: "relative", overflow: "hidden",
      background: "linear-gradient(170deg,var(--brand-800) 0%, var(--brand-950) 100%)", color: "#fff",
      display: "flex", flexDirection: "column", padding: "74px 24px 36px", textAlign: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 104, height: 104, display: "flex", alignItems: "center", justifyContent: "center", animation: "ringPop .55s cubic-bezier(.2,1.2,.4,1) both" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(240,96,78,0.18)" }} />
          <span style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "var(--red)", boxShadow: "0 10px 30px rgba(240,96,78,0.5)" }} />
          <svg width="46" height="46" viewBox="0 0 24 24" style={{ position: "relative" }}><path d="M12 8v5m0 3h.01" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/></svg>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 20 }}>Booking not completed</div>
        <div style={{ fontSize: 14, opacity: 0.8, marginTop: 6, maxWidth: 280 }}>{reason}</div>
      </div>
      <div style={{ marginTop: 26, background: "rgba(255,255,255,0.12)", borderRadius: "var(--r-lg)", border: "1px solid rgba(255,255,255,0.16)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(91,230,164,0.2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#5BE6A4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>No points were deducted</div>
          <div style={{ fontSize: 11.5, opacity: 0.72, marginTop: 1 }}>Your balance is exactly as before.</div>
        </div>
      </div>
      <div style={{ marginTop: "auto" }}>
        <button className="tap" onClick={onBack} style={{ width: "100%", padding: 16, background: "#fff", color: "var(--brand-700)",
          border: "none", borderRadius: "var(--r-md)", fontFamily: "var(--font)", fontSize: 16, fontWeight: 800, boxShadow: "0 10px 24px rgba(0,0,0,0.2)" }}>
          Back to chat
        </button>
      </div>
    </div>
  );
}

/* ---------- main execution flow (real API) ---------- */
export function Confirm({ booking, mode, onDone, onBackToChat }) {
  const { candidate, option, sessionId } = booking;
  // The button the user actually tapped decides demo-vs-production, not the global
  // toggle: tapping "Demo (demo credits)" must always book demo, even while the app
  // is in Production mode (that's the whole point of the demo option — safe rehearsal
  // without leaving production mode). The backend rejects mode="production" paired
  // with a demo-path provider, which is exactly what sending the raw global mode caused.
  const prod = mode === "production" && option.path !== "demo";
  const pathKey = option.path || "demo";
  const f = CR_FULFILL[pathKey] || CR_FULFILL.demo;

  const baseSteps = [
    { id: "validate", label: "Validating bank rules", sub: `HDFC ${candidate.card_name} eligibility` },
    { id: "checkout", label: prod ? "Starting secure checkout" : "Preparing demo booking", sub: f.label },
    { id: "fill", label: "Filling booking details", sub: candidate.label },
  ];
  const tailSteps = [
    { id: "confirm", label: "Confirming booking", sub: "With the provider" },
    { id: "deduct", label: "Deducting points", sub: candidate.card_name },
    { id: "complete", label: "Completed", sub: "Receipt to email & wallet" },
  ];
  const allSteps = [...baseSteps, ...tailSteps];

  const [phase, setPhase] = React.useState("working"); // working | otp | finishing | success | failed
  const [active, setActive] = React.useState(0);
  const [done, setDone] = React.useState(allSteps.map(() => false));
  const [result, setResult] = React.useState(null);
  const [otpCtx, setOtpCtx] = React.useState(null);
  const [otpErr, setOtpErr] = React.useState(null);
  const [otpBusy, setOtpBusy] = React.useState(false);
  const [failReason, setFailReason] = React.useState("");
  const bookingSessionId = React.useRef(null);
  const firedRef = React.useRef(false);

  const markDone = (i) => setDone((d) => { const n = [...d]; n[i] = true; return n; });

  // run a span of steps [from,to) with min dwell each
  async function runSteps(from, to) {
    for (let i = from; i < to; i++) {
      setActive(i);
      await sleep(720);
      markDone(i);
      await sleep(260);
    }
  }

  // drive the real redemption
  React.useEffect(() => {
    // React 18 StrictMode double-invokes effects in dev (mount → cleanup → mount).
    // api.redeem() is a real booking call with side effects (real points debited,
    // a real Duffel order placed) — it must fire exactly once per booking attempt,
    // and once fired it must run to completion. firedRef (a ref, so it survives
    // StrictMode's synthetic remount) is the dedupe guard. There is deliberately no
    // "cancelled" abort flag here: this booking's own component instance is never
    // legitimately unmounted mid-flight from user action (the Confirm screen owns
    // the whole booking lifecycle), so the only place a "cancelled" check could fire
    // is StrictMode's synthetic cleanup — which would silently freeze the UI after
    // the real call already went out, leaving points debited with no visible result.
    if (firedRef.current) return;
    firedRef.current = true;
    (async () => {
      // fire the real call immediately, animate the first leg in parallel
      const redeemPromise = api.redeem({
        sessionId, candidateId: candidate.candidate_id, providerId: option.provider_id,
        mode: prod ? "production" : "demo", consent: prod,
      });
      await runSteps(0, 3);
      let res;
      try { res = await redeemPromise; }
      catch (e) { setFailReason(String(e.message || e)); setPhase("failed"); return; }

      if (res.status === "otp_required") {
        bookingSessionId.current = res.booking_session_id;
        let ctx = { merchant: candidate.label, amount: res.amount, last4: res.card_last4, secondsLeft: 150 };
        try {
          const s = await api.bookingSession(res.booking_session_id);
          ctx = {
            merchant: s.merchant || candidate.label,
            amount: s.amount, last4: s.card_last4,
            secondsLeft: s.otp_deadline ? Math.max(10, Math.round(s.otp_deadline - Date.now() / 1000)) : 150,
          };
        } catch { /* use fallback ctx */ }
        setOtpCtx(ctx); setPhase("otp");
      } else if (res.status === "completed") {
        setResult(res);
        await runSteps(3, allSteps.length);
        setPhase("success");
      } else {
        setFailReason(res.rollback_reason || res.address_prompt || res.detail || "Could not complete this redemption.");
        setPhase("failed");
      }
    })();
  }, []);

  async function submitOtp(code) {
    setOtpBusy(true); setOtpErr(null);
    try {
      const r = await api.submitOtp(bookingSessionId.current, code);
      if (r.status === "completed") {
        setResult(r); setOtpBusy(false); setPhase("finishing");
        await runSteps(3, allSteps.length);
        setPhase("success");
      } else {
        setOtpBusy(false);
        setOtpErr(r.rollback_reason || "That OTP didn't work. Try again.");
      }
    } catch (e) {
      setOtpBusy(false);
      setOtpErr(String(e.message || e));
    }
  }

  if (phase === "otp" && otpCtx) {
    return <OtpScreen ctx={otpCtx} error={otpErr} busy={otpBusy} onSubmit={submitOtp}
      onCancel={(reason) => { setFailReason(reason); setPhase("failed"); }} />;
  }
  if (phase === "failed") {
    return <FailedScreen reason={failReason || "Merchant checkout failed"} onBack={onBackToChat || onDone} />;
  }

  /* working / finishing */
  if (phase !== "success") {
    return (
      <div className="cr-root" style={{ height: "100%", position: "relative", overflow: "hidden",
        background: "linear-gradient(170deg,var(--brand-700) 0%, var(--brand-950) 100%)", color: "#fff" }}>
        <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", top: -120, right: -100, background: "radial-gradient(circle, rgba(163,117,240,0.35), transparent 70%)" }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "70px 22px 32px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 24 }}>
            <div style={{ position: "relative", width: 90, height: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(196,164,244,0.4)", borderTopColor: "#fff", animation: "spinAround 1.1s linear infinite" }} />
              <Kobie size={62} state="think" />
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, marginTop: 16 }}>CredArt is on it…</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 5, maxWidth: 250 }}>
              {prod ? `Securely redeeming ${candidate.label} across our partners.` : `Rehearsing ${candidate.label} in demo mode — no real money.`}
            </div>
            {prod && <div style={{ marginTop: 12 }}><ProtectedBadge /></div>}
          </div>

          <div className="no-sb" style={{ display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", flex: 1 }}>
            {allSteps.map((st, i) => {
              const isDone = done[i]; const isActive = active === i && !isDone;
              const shown = isDone || isActive || i <= active;
              return (
                <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", borderRadius: "var(--r-md)",
                  background: shown ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  opacity: shown ? 1 : 0.4, transition: "all .4s ease", animation: shown ? "stepInLine .4s ease both" : "none" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: isDone ? "var(--green)" : "rgba(255,255,255,0.12)" }}>
                    {isDone ? (
                      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : isActive ? (
                      <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#FFC96B", animation: "spinAround .9s linear infinite" }} />
                    ) : (
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: "rgba(255,255,255,0.4)" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{st.label}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.sub}</div>
                  </div>
                  {isDone && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#5BE6A4" }}>Done</span>}
                  {isActive && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#FFC96B" }}>···</span>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 18 }}><TrustFooter prod={prod} /></div>
        </div>
      </div>
    );
  }

  /* ---------- success (real numbers) ---------- */
  const usedDemo = result?.currency === "demo_points";
  return (
    <div className="cr-root" style={{ height: "100%", position: "relative", overflow: "hidden",
      background: "linear-gradient(170deg,var(--brand-700) 0%, var(--brand-950) 100%)", color: "#fff" }}>
      <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", top: -120, right: -100, background: "radial-gradient(circle, rgba(163,117,240,0.35), transparent 70%)" }} />
      <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", bottom: -80, left: -90, background: "radial-gradient(circle, rgba(91,230,164,0.16), transparent 70%)" }} />
      <div className="no-sb" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "58px 22px 30px", overflowY: "auto", animation: "fadeIn .5s ease" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", animation: "ringPop .6s cubic-bezier(.2,1.2,.4,1) both" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(91,230,164,0.18)" }} />
            <span style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "var(--green)", boxShadow: "0 10px 30px rgba(22,185,129,0.5)" }} />
            <svg width="50" height="50" viewBox="0 0 24 24" style={{ position: "relative" }}>
              <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" style={{ animation: "checkDraw .5s .35s ease both" }} />
            </svg>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 16 }}>You're all set! 🎉</div>
          <div style={{ fontSize: 13.5, opacity: 0.8, marginTop: 6, maxWidth: 270 }}>
            CredArt redeemed <b>{result?.option_label || candidate.label}</b> on your {result?.card_name || candidate.card_name}.
          </div>
          <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 999,
            background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)", fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ display: "flex", color: "#fff" }}>{f.icon(14)}</span>
            {crPathLabel(result?.path || pathKey)}
          </div>
        </div>

        {/* ticket — real Duffel booking receipt, when the provider returned one */}
        {result?.ticket && (
          <div style={{ marginTop: 20, background: "rgba(255,255,255,0.13)", borderRadius: "var(--r-lg)", border: "1px solid rgba(255,255,255,0.16)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: 0.4 }}>YOUR TICKET</span>
              {result.ticket.pnr && (
                <span className="num" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 0.5 }}>PNR {result.ticket.pnr}</span>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{result.ticket.airline}</div>
                <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>
                  {result.ticket.origin}→{result.ticket.destination}
                  {result.ticket.cabin ? ` · ${result.ticket.cabin}` : ""}
                </div>
              </div>
              {result.ticket.departing_at && (
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 15, fontWeight: 800 }}>{fmtTime(result.ticket.departing_at)}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>{result.ticket.depart_date}</div>
                </div>
              )}
            </div>
            {result.ticket.passengers && result.ticket.passengers.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 600, marginBottom: 4 }}>PASSENGERS</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {result.ticket.passengers.map((p) => p.name).join(", ")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* recap */}
        <div style={{ marginTop: 20, background: "rgba(255,255,255,0.13)", borderRadius: "var(--r-lg)", border: "1px solid rgba(255,255,255,0.16)", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
            <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: 0.4 }}>CONFIRMATION REF</span>
            <span className="num" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 0.5 }}>{result?.confirmation_reference || "—"}</span>
          </div>
          {(result?.steps || []).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0",
              borderBottom: i < (result.steps.length - 1) ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
              <span style={{ color: s.status === "failed" ? "var(--red)" : "#5BE6A4" }}>{s.status === "failed" ? "✕" : "✓"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>
                {s.detail && <div style={{ fontSize: 11, opacity: 0.65 }}>{s.detail}</div>}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.16)" }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 600 }}>{usedDemo ? "Demo points used" : "Points used"}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{fmt(result?.points_used)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 600 }}>Balance after</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 800, color: "#5BE6A4" }}>{fmt(result?.balance_after)}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}><TrustFooter prod={prod} /></div>

        <button className="tap" onClick={onDone} style={{ marginTop: 20, width: "100%", padding: 16, background: "#fff", color: "var(--brand-700)",
          border: "none", borderRadius: "var(--r-md)", fontFamily: "var(--font)", fontSize: 16, fontWeight: 800, boxShadow: "0 10px 24px rgba(0,0,0,0.2)" }}>
          Done
        </button>
      </div>
    </div>
  );
}
