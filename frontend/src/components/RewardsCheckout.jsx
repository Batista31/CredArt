/* CredArt — Rewards cart checkout: the old bank-style execution flow.
 *
 * Clicking "Redeem Cart" no longer debits instantly. Instead this full-screen
 * overlay walks the same journey as the original bank Confirm screen:
 *
 *   (delivery — merchandise only, CMR-autofilled)
 *     → agentic progress steps → OTP (6-digit, demo SMS, countdown, shake)
 *     → per-item booking IDs (PNR for flights, order # for merchandise, …)
 *
 * Personalization: the delivery address is autofilled from the user's CMR
 * profile — fetched live from GET /cmr/{user_id} when the backend is up, else
 * the seeded fallback in catalogue.js — and the UI says so explicitly. Points
 * are deducted ONLY after the OTP verifies (performCheckout runs then); cancel
 * or expiry leaves the balance untouched.
 */
import React from "react";
import { api } from "../lib/api.js";
import { Kobie } from "./Kobie.jsx";
import { onImgError, rewardImgStyle } from "../lib/catalogue.js";

const fmt = (n) => Number(n).toLocaleString("en-IN");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
const AL = "ABCDEFGHJKLMNPQRSTUVWXYZ", NUM = "0123456789", ALNUM = AL + NUM;

const isFlight = (it) => /flight|air |airways|airasia|indigo|vistara|spicejet|akasa|emirates|qatar|lufthansa|singapore airlines|british airways/i.test(it.name);

/* Per-item confirmation reference, shaped like the real provider would return. */
function refFor(it) {
  if (it.category === "travel") {
    return isFlight(it)
      ? { kind: "PNR", code: rand(AL, 2) + "-" + rand(ALNUM, 6) }
      : { kind: "Booking ID", code: "TRV-" + rand(ALNUM, 8) };
  }
  if (it.category === "giftcards") return { kind: "Voucher code", code: `${rand(AL, 4)}-${rand(ALNUM, 4)}-${rand(ALNUM, 4)}` };
  if (it.category === "cashback") return { kind: "Txn ref", code: "CB-" + rand(NUM, 10) };
  return { kind: "Order", code: "#ORD-" + rand(NUM, 7) }; // merchandise
}

/* ---------- OTP entry (ported from the bank Confirm screen) ---------- */
function OtpStep({ persona, total, demoOtp, onSubmit, onCancel, error }) {
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff", padding: "26px 22px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.82, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FFC96B" }} />
          SECURE REDEMPTION SESSION
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8 }}>Confirm with OTP</div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: "9px 13px", fontSize: 13, fontWeight: 600 }}>
          <span>CredArt Rewards cart</span>
          <span style={{ opacity: 0.5 }}>·</span><span className="num">{fmt(total)} pts</span>
          <span style={{ opacity: 0.5 }}>·</span><span style={{ opacity: 0.9 }}>{persona.short}'s account</span>
        </div>
      </div>

      <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "22px 22px" }}>
        {/* simulated bank SMS — makes the demo self-contained */}
        <div className="animate-msg" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff",
          border: "1px solid var(--brand-100)", borderLeft: "4px solid var(--brand-600)", borderRadius: 12,
          padding: "11px 14px", boxShadow: "var(--sh-md)", maxWidth: 420, margin: "0 auto" }}>
          <span style={{ fontSize: 18 }}>💬</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-700)", letterSpacing: 0.4 }}>CREDART BANK · SMS</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
              OTP for your rewards redemption is <b className="num" style={{ color: "var(--ink)", fontSize: 14 }}>{demoOtp}</b>. Valid for 2 minutes. Do not share it.
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13.5, color: "var(--ink-2)", fontWeight: 600, textAlign: "center", marginTop: 22 }}>
          Enter the 6-digit code sent to {persona.short}'s registered mobile
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
  );
}

/* ---------- delivery address (merchandise only, CMR-autofilled) ---------- */
function AddressStep({ persona, cmr, cmrLive, merchandise, onConfirm, onCancel }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff", padding: "26px 22px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.82, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FFC96B" }} />
          DELIVERY DETAILS
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8 }}>Where should we ship?</div>
        <div style={{ fontSize: 13, opacity: 0.82, marginTop: 4 }}>
          {merchandise.length} physical item{merchandise.length > 1 ? "s" : ""} in your cart need{merchandise.length > 1 ? "" : "s"} a delivery address.
        </div>
      </div>

      <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
        {/* personalization banner */}
        <div className="animate-msg" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--brand-50)",
          border: "1px solid var(--brand-200)", borderRadius: 12, padding: "11px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 17 }}>✨</span>
          <div style={{ fontSize: 12.5, color: "var(--brand-800)", lineHeight: 1.5 }}>
            <b>Personalized for {persona.short}</b> — CredArt pre-filled this from your
            {" "}{cmrLive ? "live CMR profile" : "saved CredArt profile"}, so you don't have to type a thing.
          </div>
        </div>

        {/* the autofilled address card */}
        <div className="animate-msg" style={{ background: "#fff", border: "2px solid var(--brand-500)", borderRadius: 14,
          padding: "14px 16px", boxShadow: "var(--sh-md)", position: "relative" }}>
          <span style={{ position: "absolute", top: -9, left: 14, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6,
            background: "var(--brand-600)", color: "#fff", padding: "2px 9px", borderRadius: 999 }}>
            AUTOFILLED FROM CMR
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--brand-50)", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinejoin="round" /></svg>
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-800)" }}>{cmr.addressLabel} · {persona.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.45 }}>
                {cmr.address}, {cmr.city}, {cmr.state} {cmr.pincode}
              </div>
            </div>
          </div>
        </div>

        {/* what CredArt knows (profile facts driving personalization) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
          {[`📍 ${cmr.city}`, `👨‍👩‍👧 Party of ${cmr.familySize}`, ...cmr.prefs.map((p) => `♥ ${p}`)].map((chip) => (
            <span key={chip} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-700)", background: "#fff",
              border: "1px solid var(--brand-100)", borderRadius: 999, padding: "6px 11px" }}>{chip}</span>
          ))}
        </div>

        {/* items being shipped */}
        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--ink-3)" }}>SHIPPING TO THIS ADDRESS</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {merchandise.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", borderRadius: 10,
              border: "1px solid var(--brand-100)", padding: "8px 10px" }}>
              <img src={it.image} alt="" onError={onImgError(it)} style={{ width: 32, height: 32, borderRadius: 7, background: "var(--brand-50)", ...rewardImgStyle(it) }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}{(it.qty || 1) > 1 ? ` × ${it.qty}` : ""}</span>
              <span className="num" style={{ fontSize: 11.5, color: "var(--ink-3)", flexShrink: 0 }}>{fmt(it.points * (it.qty || 1))} pts</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 22px 22px", background: "#fff", borderTop: "1px solid var(--hairline)" }}>
        <button className="tap" onClick={onConfirm} style={{ width: "100%", padding: 15,
          background: "linear-gradient(135deg,var(--brand-600),var(--brand-800))", color: "#fff", border: "none",
          borderRadius: 999, fontFamily: "var(--font)", fontSize: 15, fontWeight: 800,
          boxShadow: "0 10px 22px rgba(12,39,72,0.32)", cursor: "pointer" }}>
          Deliver here & continue
        </button>
        <button className="tap" onClick={() => onCancel("Redemption cancelled — no points were deducted.")} style={{ width: "100%", marginTop: 8, padding: 12,
          background: "transparent", color: "var(--ink-3)", border: "none", fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- main checkout overlay ---------- */
export function RewardsCheckout({ persona, cart: cartProp, performCheckout, onDone, onClose }) {
  /* Snapshot the cart on mount: performCheckout() clears the parent's cart at
     the "deduct" step, and the success screen must keep showing what was bought. */
  const [cart] = React.useState(cartProp);
  const total = cart.reduce((a, i) => a + i.points * (i.qty || 1), 0);
  const merchandise = cart.filter((i) => i.category === "merchandise");
  const needsDelivery = merchandise.length > 0;

  /* CMR: seeded fallback immediately, live backend profile if reachable. */
  const [cmr, setCmr] = React.useState(persona.cmr);
  const [cmrLive, setCmrLive] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    api.cmr(persona.id).then((d) => {
      if (!alive) return;
      const addr = (d.addresses || []).find((a) => a.is_default) || (d.addresses || [])[0];
      if (addr) {
        setCmr((c) => ({
          ...c,
          addressLabel: addr.label || c.addressLabel,
          address: [addr.address_line1, addr.address_line2].filter(Boolean).join(", "),
          city: addr.city || c.city, state: addr.state || c.state, pincode: addr.pincode || c.pincode,
          familySize: (d.preferences && d.preferences.family_size) || c.familySize,
        }));
        setCmrLive(true);
      }
    }).catch(() => { /* offline → seeded fallback stays */ });
    return () => { alive = false; };
  }, [persona.id]);

  const steps = [
    { id: "validate", label: "Validating rewards balance", sub: `${fmt(total)} pts across ${cart.length} item${cart.length > 1 ? "s" : ""}` },
    { id: "reserve", label: "Reserving your rewards", sub: cart.map((i) => i.name).slice(0, 2).join(" · ") + (cart.length > 2 ? " …" : "") },
    ...(needsDelivery ? [{ id: "ship", label: "Attaching delivery address", sub: `${cmr.addressLabel} · ${cmr.city} — from your CMR profile` }] : []),
    { id: "secure", label: "Securing bank session", sub: "OTP to your registered mobile" },
    { id: "confirm", label: "Confirming with partners", sub: "Issuing booking references" },
    { id: "deduct", label: "Deducting points", sub: `${persona.short}'s rewards account` },
    { id: "complete", label: "Completed", sub: "Receipts to email & wallet" },
  ];
  const otpAfter = needsDelivery ? 4 : 3; // steps before the OTP gate

  const [phase, setPhase] = React.useState(needsDelivery ? "address" : "working");
  const [active, setActive] = React.useState(0);
  const [done, setDone] = React.useState(steps.map(() => false));
  const [otpErr, setOtpErr] = React.useState(null);
  const [failReason, setFailReason] = React.useState("");
  const [result, setResult] = React.useState(null); // { ok, refs, total, balanceAfter }
  const demoOtp = React.useRef(rand(NUM, 6)).current;
  const startedRef = React.useRef(false);

  const markDone = (i) => setDone((d) => { const n = [...d]; n[i] = true; return n; });
  async function runSteps(from, to) {
    for (let i = from; i < to; i++) {
      setActive(i);
      await sleep(700);
      markDone(i);
      await sleep(240);
    }
  }

  /* first leg: animate up to the OTP gate (StrictMode-safe: run once) */
  React.useEffect(() => {
    if (phase !== "working" || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      await runSteps(0, otpAfter);
      setPhase("otp");
    })();
  }, [phase]);

  function submitOtp(code) {
    if (code !== demoOtp) { setOtpErr("That OTP didn't match. Check the SMS and try again."); return; }
    setOtpErr(null);
    setPhase("finishing");
    (async () => {
      setActive(otpAfter);
      await sleep(700);
      // issue per-item references, then debit the points (single atomic call)
      const refs = cart.map((it) => ({ item: it, ref: refFor(it) }));
      markDone(otpAfter);
      setActive(otpAfter + 1);
      await sleep(650);
      const r = performCheckout();
      if (!r.ok) { setFailReason(r.reason); setPhase("failed"); return; }
      markDone(otpAfter + 1);
      setActive(otpAfter + 2);
      await sleep(600);
      markDone(otpAfter + 2);
      setResult({ ...r, refs });
      // Confirmation email — fire-and-forget, never blocks the success screen.
      api.redemptionEmail(
        persona.name,
        cart.map((it) => ({ name: it.name, points: it.points, qty: it.qty || 1 })),
        { totalPoints: r.total }, r.balanceAfter, "store",
      ).catch(() => { /* best-effort — success screen already shows the refs */ });
      await sleep(350);
      setPhase("success");
    })();
  }

  function cancel(reason) { setFailReason(reason); setPhase("failed"); }

  /* ---------- shell ---------- */
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 80, background: "rgba(8,28,51,0.5)", animation: "fadeIn .18s ease",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div className="cr-root" style={{ width: "min(520px, 100%)", height: "min(680px, 96%)", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 34px 80px rgba(8,28,51,0.55)", animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)", background: "var(--bg)" }}>

        {phase === "address" && (
          <AddressStep persona={persona} cmr={cmr} cmrLive={cmrLive} merchandise={merchandise}
            onConfirm={() => setPhase("working")} onCancel={cancel} />
        )}

        {phase === "otp" && (
          <OtpStep persona={persona} total={total} demoOtp={demoOtp} error={otpErr}
            onSubmit={submitOtp} onCancel={cancel} />
        )}

        {(phase === "working" || phase === "finishing") && (
          <div style={{ height: "100%", position: "relative", overflow: "hidden",
            background: "linear-gradient(170deg,var(--brand-700) 0%, var(--brand-950) 100%)", color: "#fff" }}>
            <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", top: -110, right: -90,
              background: "radial-gradient(circle, rgba(232,144,30,0.3), transparent 70%)" }} />
            <div className="no-sb" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "34px 22px 26px", overflowY: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 20 }}>
                <div style={{ position: "relative", width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#FFC96B", animation: "spinAround 1.1s linear infinite" }} />
                  <Kobie size={58} state="think" />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 14 }}>CredArt is on it…</div>
                <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 4, maxWidth: 280 }}>
                  Securely redeeming your cart — {fmt(total)} points across {cart.length} reward{cart.length > 1 ? "s" : ""}.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {steps.map((st, i) => {
                  const isDone = done[i]; const isActive = active === i && !isDone;
                  const shown = isDone || i <= active;
                  return (
                    <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 14,
                      background: shown ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      opacity: shown ? 1 : 0.4, transition: "all .4s ease", animation: shown ? "stepInLine .4s ease both" : "none" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: isDone ? "var(--green)" : "rgba(255,255,255,0.12)" }}>
                        {isDone ? (
                          <svg width="15" height="15" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        ) : isActive ? (
                          <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#FFC96B", animation: "spinAround .9s linear infinite" }} />
                        ) : (
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.4)" }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{st.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.sub}</div>
                      </div>
                      {isDone && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#5BE6A4" }}>Done</span>}
                      {isActive && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#FFC96B" }}>···</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div style={{ height: "100%", background: "linear-gradient(170deg,var(--brand-800),var(--brand-950))", color: "#fff",
            display: "flex", flexDirection: "column", padding: "44px 26px 28px", textAlign: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ position: "relative", width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", animation: "ringPop .55s cubic-bezier(.2,1.2,.4,1) both" }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(240,96,78,0.18)" }} />
                <span style={{ position: "absolute", inset: 13, borderRadius: "50%", background: "var(--red)", boxShadow: "0 10px 30px rgba(240,96,78,0.5)" }} />
                <svg width="42" height="42" viewBox="0 0 24 24" style={{ position: "relative" }}><path d="M12 8v5m0 3h.01" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 18 }}>Redemption not completed</div>
              <div style={{ fontSize: 13.5, opacity: 0.8, marginTop: 6, maxWidth: 300 }}>{failReason}</div>
            </div>
            <div style={{ marginTop: 24, background: "rgba(255,255,255,0.12)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.16)", padding: "15px 17px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(91,230,164,0.2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#5BE6A4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>No points were deducted</div>
                <div style={{ fontSize: 11.5, opacity: 0.72, marginTop: 1 }}>Your cart and balance are exactly as before.</div>
              </div>
            </div>
            <button className="tap" onClick={onClose} style={{ marginTop: "auto", width: "100%", padding: 15, background: "#fff", color: "var(--brand-700)",
              border: "none", borderRadius: 999, fontFamily: "var(--font)", fontSize: 15.5, fontWeight: 800, boxShadow: "0 10px 24px rgba(0,0,0,0.2)", cursor: "pointer" }}>
              Back to rewards store
            </button>
          </div>
        )}

        {phase === "success" && result && (
          <div style={{ height: "100%", position: "relative", overflow: "hidden",
            background: "linear-gradient(170deg,var(--brand-700) 0%, var(--brand-950) 100%)", color: "#fff" }}>
            <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", top: -110, right: -90, background: "radial-gradient(circle, rgba(232,144,30,0.3), transparent 70%)" }} />
            <div className="no-sb" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "32px 22px 24px", overflowY: "auto", animation: "fadeIn .5s ease" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ position: "relative", width: 88, height: 88, display: "flex", alignItems: "center", justifyContent: "center", animation: "ringPop .6s cubic-bezier(.2,1.2,.4,1) both" }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(91,230,164,0.18)" }} />
                  <span style={{ position: "absolute", inset: 12, borderRadius: "50%", background: "var(--green)", boxShadow: "0 10px 30px rgba(22,185,129,0.5)" }} />
                  <svg width="44" height="44" viewBox="0 0 24 24" style={{ position: "relative" }}>
                    <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" style={{ animation: "checkDraw .5s .35s ease both" }} />
                  </svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 14 }}>You're all set, {persona.short}! 🎉</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 5 }}>OTP verified · every reward confirmed with its provider.</div>
              </div>

              {/* per-item booking references */}
              <div style={{ marginTop: 18, background: "rgba(255,255,255,0.13)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.16)", padding: 15 }}>
                {result.refs.map(({ item, ref }, i) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0",
                    borderBottom: i < result.refs.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                    <span style={{ color: "#5BE6A4", flexShrink: 0 }}>✓</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}{(item.qty || 1) > 1 ? ` × ${item.qty}` : ""}</div>
                      <div style={{ fontSize: 11, opacity: 0.72 }}>
                        {ref.kind} <b className="num" style={{ letterSpacing: 0.5 }}>{ref.code}</b>
                        {item.category === "merchandise" && ` · ships to ${cmr.addressLabel}, ${cmr.city}`}
                      </div>
                    </div>
                    <span className="num" style={{ fontSize: 11.5, opacity: 0.8, flexShrink: 0 }}>{fmt(item.points)} pts</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.16)" }}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 600 }}>Points used</div>
                    <div className="num" style={{ fontSize: 19, fontWeight: 800 }}>{fmt(result.total)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 600 }}>Balance after</div>
                    <div className="num" style={{ fontSize: 19, fontWeight: 800, color: "#5BE6A4" }}>{fmt(result.balanceAfter)}</div>
                  </div>
                </div>
              </div>

              {needsDelivery && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.14)", borderRadius: 14, padding: "11px 14px", fontSize: 12, opacity: 0.92 }}>
                  <span>✨</span>
                  <span>Delivery address autofilled from {persona.short}'s CMR profile — {cmr.address}, {cmr.city} {cmr.pincode}.</span>
                </div>
              )}

              <button className="tap" onClick={onDone} style={{ marginTop: "auto", width: "100%", padding: 15, background: "#fff", color: "var(--brand-700)",
                border: "none", borderRadius: 999, fontFamily: "var(--font)", fontSize: 15.5, fontWeight: 800, boxShadow: "0 10px 24px rgba(0,0,0,0.2)", cursor: "pointer" }}>
                Back to rewards store
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
