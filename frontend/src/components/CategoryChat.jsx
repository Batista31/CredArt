/* CredArt — themed concierge chat for the Food & Dining (Subway) and
 * Entertainment & Cinema categories. Self-contained: connects to the new
 * /dining/* and /entertainment/* backend routers (the existing bank chat is
 * untouched and lives in BankExperience.jsx).
 *
 * Colours come entirely from the `--brand-*` vars set by App.jsx's theme
 * wrapper, so this one component renders green+yellow or purple+red without any
 * branching on colour. Entertainment recommendation cards show movie posters. */
import React from "react";
import { api } from "../lib/api.js";
import { CategoryIcon } from "../theme.jsx";

const fmt = (n) => (n == null ? "" : Number(n).toLocaleString());

function Bubble({ who, children }) {
  const bot = who === "bot";
  return (
    <div style={{
      maxWidth: "82%",
      background: bot ? "#fff" : "linear-gradient(160deg,var(--brand-600),var(--brand-700))",
      color: bot ? "var(--ink)" : "#fff",
      padding: "11px 15px", fontSize: 14.5, lineHeight: 1.45, fontWeight: 500,
      borderRadius: bot ? "18px 18px 18px 6px" : "18px 18px 6px 18px",
      boxShadow: bot ? "var(--sh-sm)" : "0 6px 16px rgba(0,0,0,0.18)",
      border: bot ? "1px solid var(--hairline)" : "none",
    }}>{children}</div>
  );
}

function Chip({ children, onClick, delay = 0 }) {
  return (
    <button className="tap animate-chip" onClick={onClick} style={{
      animationDelay: delay + "ms",
      background: "#fff", border: "1.5px solid var(--brand-200)", color: "var(--brand-700)",
      fontFamily: "var(--font)", fontWeight: 700, fontSize: 13.5, padding: "10px 15px",
      borderRadius: 999, boxShadow: "var(--sh-sm)", cursor: "pointer",
    }}>{children}</button>
  );
}

/* Deterministic cinema seat map for a movie candidate: same taken-seats every
   render (seeded by candidate_id) so selecting a seat never reshuffles the map. */
function seatLayout(candId) {
  const rows = ["A", "B", "C", "D", "E"];
  const cols = [1, 2, 3, 4, 5, 6, 7, 8];
  let h = 2166136261;
  const s = candId || "x";
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const rand = () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h / 4294967296; };
  const taken = new Set();
  for (const r of rows) for (const c of cols) if (rand() < 0.26) taken.add(`${r}${c}`);
  return { rows, cols, taken };
}

/* Seat picker shown after "Book now!" — the user selects exactly `qty` seats
   (their chosen ticket count) before the Redeem button unlocks. */
function SeatMap({ candId, qty, selected, onToggle, accent }) {
  const { rows, cols, taken } = React.useMemo(() => seatLayout(candId), [candId]);
  const seat = (id, state) => {
    const bg = state === "taken" ? "rgba(28,19,48,0.10)"
      : state === "sel" ? accent : "#fff";
    const color = state === "sel" ? "#fff" : state === "taken" ? "var(--ink-3)" : "var(--ink)";
    return { flex: 1, minWidth: 0, height: 24, borderRadius: 6, fontSize: 9.5, fontWeight: 700,
      fontFamily: "var(--font)", color, background: bg,
      border: `1px solid ${state === "sel" ? accent : "var(--hairline)"}`,
      cursor: state === "taken" || state === "full" ? "not-allowed" : "pointer",
      opacity: state === "full" ? 0.4 : 1 };
  };
  return (
    <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 10 }}>
      <div style={{ height: 4, background: "linear-gradient(180deg,var(--brand-300),transparent)",
        borderRadius: 4, margin: "0 18px 3px" }} />
      <div style={{ textAlign: "center", fontSize: 8.5, letterSpacing: 3, color: "var(--ink-3)",
        fontWeight: 700, marginBottom: 8 }}>SCREEN</div>
      {rows.map((r) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <span style={{ width: 10, fontSize: 9, color: "var(--ink-3)", fontWeight: 800 }}>{r}</span>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {cols.map((c) => {
              const id = `${r}${c}`;
              const isTaken = taken.has(id);
              const isSel = selected.includes(id);
              const full = !isSel && selected.length >= qty;
              const state = isTaken ? "taken" : isSel ? "sel" : full ? "full" : "free";
              return (
                <button key={id} className="tap" disabled={isTaken || full}
                  onClick={() => !isTaken && !full && onToggle(id)}
                  style={seat(id, state)}>{c}</button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 9.5, color: "var(--ink-3)" }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, border: "1px solid var(--hairline)", background: "#fff", marginRight: 4, verticalAlign: "middle" }} />Available</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: accent, marginRight: 4, verticalAlign: "middle" }} />Selected</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "rgba(28,19,48,0.10)", marginRight: 4, verticalAlign: "middle" }} />Taken</span>
      </div>
    </div>
  );
}

/* A pre-scored recommendation from the backend. Shows a poster thumbnail when
   present (entertainment), else a coloured initial. Movies use a Book now! →
   pick seats → Redeem flow; everything else redeems in one tap. */
function OptionCard({ cand, accent, onRedeem, redeeming, done, balance,
                     booking, selectedSeats, onBookNow, onToggleSeat, onCancelBooking }) {
  const pts = cand.points_cost;
  const thumb = cand.thumbnail;
  // Affordability against the LIVE balance (a prior redeem may have lowered it),
  // not the stale flag from when this card was first scored.
  const affordable = cand.special || (pts != null && pts <= balance);
  const canRedeem = affordable && !done;
  const isMovie = cand.category === "MOVIE";
  const qty = Math.max(1, cand.quantity || 1);
  const seatsReady = selectedSeats.length === qty;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 11, padding: 13, background: "#fff",
      borderRadius: "var(--r-md)", border: "1.5px solid var(--hairline)", boxShadow: "var(--sh-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {thumb ? (
          <img src={thumb} alt={cand.label} loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            style={{ width: 56, height: 78, borderRadius: 10, objectFit: "cover", flexShrink: 0,
              background: "var(--surface)", border: "1px solid var(--hairline)" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-600)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 17 }}>
            {(cand.label || "?").slice(0, 1)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{cand.label}</span>
            {cand.rank === 1 && (
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: accent, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.2 }}>★ TOP PICK</span>
            )}
            {cand.special && (
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--brand-700)", background: "var(--brand-100)", padding: "2px 7px", borderRadius: 999 }}>SPECIAL</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
            {cand.category}{cand.rating ? ` · ${cand.rating}★` : ""}
          </div>
          {cand.note && <div style={{ fontSize: 11.5, color: "var(--brand-600)", marginTop: 3, fontWeight: 600 }}>{cand.note}</div>}
        </div>
        {pts != null && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="num" style={{ fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{pts === 0 ? "Free" : fmt(pts)}</div>
            {pts !== 0 && <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>points</div>}
          </div>
        )}
      </div>

      {/* Seat picker (movies only, after Book now!) */}
      {isMovie && booking && !done && (
        <SeatMap candId={cand.candidate_id} qty={qty} selected={selectedSeats}
          onToggle={(id) => onToggleSeat(cand, id)} accent={accent} />
      )}

      {/* Movie: Book now! → (seats) → Redeem. Everything else: one-tap redeem. */}
      {isMovie && !done ? (
        booking ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tap" onClick={onCancelBooking} disabled={redeeming}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--hairline)",
                fontFamily: "var(--font)", fontWeight: 800, fontSize: 13, background: "#fff",
                color: "var(--ink-3)", cursor: redeeming ? "not-allowed" : "pointer" }}>
              Back
            </button>
            <button className="tap" disabled={!seatsReady || redeeming}
              onClick={() => seatsReady && onRedeem(cand, selectedSeats)}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "none",
                fontFamily: "var(--font)", fontWeight: 800, fontSize: 13,
                cursor: seatsReady && !redeeming ? "pointer" : "not-allowed",
                color: seatsReady ? "#fff" : "var(--ink-3)",
                background: seatsReady ? "linear-gradient(160deg,var(--brand-600),var(--brand-700))" : "rgba(28,19,48,0.06)" }}>
              {redeeming ? "Booking…"
                : seatsReady ? `Redeem ${qty} seat${qty > 1 ? "s" : ""} · ${fmt(pts)} pts`
                : `Select ${qty} seat${qty > 1 ? "s" : ""} (${selectedSeats.length}/${qty})`}
            </button>
          </div>
        ) : (
          <button className="tap" disabled={!affordable}
            onClick={() => affordable && onBookNow(cand)}
            style={{ padding: "10px 14px", borderRadius: 12, border: "none", fontFamily: "var(--font)",
              fontWeight: 800, fontSize: 13, cursor: affordable ? "pointer" : "not-allowed",
              color: affordable ? "#fff" : "var(--ink-3)",
              background: affordable ? "linear-gradient(160deg,var(--brand-600),var(--brand-700))" : "rgba(28,19,48,0.06)" }}>
            {affordable ? "🎟️ Book now!" : "Not enough points"}
          </button>
        )
      ) : (
        <button className="tap" disabled={!canRedeem || redeeming}
          onClick={() => canRedeem && onRedeem(cand)}
          style={{
            padding: "10px 14px", borderRadius: 12, border: "none", fontFamily: "var(--font)",
            fontWeight: 800, fontSize: 13, cursor: canRedeem && !redeeming ? "pointer" : "not-allowed",
            color: canRedeem ? "#fff" : "var(--ink-3)",
            background: done
              ? "var(--green)"
              : canRedeem ? "linear-gradient(160deg,var(--brand-600),var(--brand-700))" : "rgba(28,19,48,0.06)",
          }}>
          {done ? (isMovie ? "✓ Booked" : "✓ Redeemed") : redeeming ? "Booking…" : affordable ? "Redeem with points" : "Not enough points"}
        </button>
      )}
    </div>
  );
}

export function CategoryChat({ theme, onBack, view = "laptop" }) {
  const meta = theme.meta;
  const mobile = view === "mobile";
  const chatApi = (msg, sid) => (meta.apiKind === "dining" ? api.diningChat(msg, sid) : api.entChat(msg, sid));
  const redeemApi = (sid, cid) =>
    (meta.apiKind === "dining"
      ? api.diningRedeem({ sessionId: sid, candidateId: cid })
      : api.entRedeem({ sessionId: sid, candidateId: cid }));

  const idc = React.useRef(0);
  const nid = () => ++idc.current;
  const [messages, setMessages] = React.useState(() => [
    { id: 0, who: "bot", intro: true, text: meta.greeting },
  ]);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sessionId, setSessionId] = React.useState(null);
  const [balance, setBalance] = React.useState(meta.points);
  const [redeemingId, setRedeemingId] = React.useState(null);
  const [redeemedIds, setRedeemedIds] = React.useState(new Set());
  const [bookingId, setBookingId] = React.useState(null);   // movie card in seat-selection mode
  const [selectedSeats, setSelectedSeats] = React.useState([]);
  const [err, setErr] = React.useState(null);
  const scroller = React.useRef(null);

  React.useEffect(() => {
    const el = scroller.current; if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function pushMsg(m) { setMessages((x) => [...x, { id: nid(), ...m }]); }

  async function sendText(text) {
    if (!text || busy) return;
    pushMsg({ who: "user", text });
    setBusy(true); setErr(null);
    try {
      const r = await chatApi(text, sessionId);
      if (r.session_id) setSessionId(r.session_id);
      if (typeof r.points_balance === "number") setBalance(r.points_balance);
      const showCards = r.response_type === "recommendation";
      pushMsg({ who: "bot", text: r.reply, candidates: showCards ? (r.recommendations || []) : [],
        chips: r.suggested_replies || [] });
    } catch (e) {
      setErr(String(e.message || e));
      pushMsg({ who: "bot", text: "I couldn't reach the rewards engine — is the backend running on :8001?" });
    } finally { setBusy(false); }
  }

  // Don't clear the input while a reply is in flight — sendText would drop the
  // message and the user's typing would silently vanish.
  function send() { const t = input.trim(); if (!t || busy) return; setInput(""); sendText(t); }

  // Movie seat-selection helpers. Seats are picked client-side (the demo backend
  // only needs the candidate id); the chosen seats are shown in the confirmation.
  function handleBookNow(cand) { setBookingId(cand.candidate_id); setSelectedSeats([]); }
  function handleCancelBooking() { setBookingId(null); setSelectedSeats([]); }
  function handleToggleSeat(cand, seatId) {
    const qty = Math.max(1, cand.quantity || 1);
    setSelectedSeats((prev) => {
      if (prev.includes(seatId)) return prev.filter((s) => s !== seatId);
      if (prev.length >= qty) return prev;        // cap at the ticket count
      return [...prev, seatId];
    });
  }

  async function handleRedeem(cand, seats) {
    if (redeemingId) return;
    setRedeemingId(cand.candidate_id); setErr(null);
    try {
      const r = await redeemApi(sessionId, cand.candidate_id);
      setRedeemedIds((p) => new Set([...p, cand.candidate_id]));
      if (typeof r.balance_after === "number") setBalance(r.balance_after);
      const seatStr = seats && seats.length ? ` Seats ${[...seats].sort().join(", ")}.` : "";
      pushMsg({ who: "bot", text:
        `✅ Booked! Confirmation ${r.confirmation_reference}.${seatStr} ${r.points_used === 0 ? "No points" : fmt(r.points_used) + " points"} used — ${fmt(r.balance_after)} ${meta.currency} left.` });
      if (bookingId === cand.candidate_id) { setBookingId(null); setSelectedSeats([]); }
    } catch (e) {
      setErr(String(e.message || e));
      pushMsg({ who: "bot", text: "That redemption didn't go through — please try another option." });
    } finally { setRedeemingId(null); }
  }

  return (
    <div style={{ minHeight: mobile ? "100%" : "100vh", height: mobile ? "100%" : undefined,
      display: "flex", justifyContent: "center", alignItems: "center", padding: mobile ? 0 : "18px 14px" }}>
      <div style={{
        position: "relative",
        width: mobile ? "100%" : "min(760px, 100%)", height: mobile ? "100%" : "min(90vh, 880px)",
        background: "#fff", borderRadius: mobile ? 0 : 18, overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: mobile ? "none" : "0 30px 70px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.05)" }}>

        {/* header */}
        <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff",
          padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button className="tap" onClick={onBack} title="Back to categories" style={{ background: "rgba(255,255,255,0.16)", border: "none",
            width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.16)",
            border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CategoryIcon name={theme.icon} size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{meta.botName}</div>
            <div style={{ fontSize: 11.5, opacity: 0.8, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: theme.accent }} />
              {theme.brand} · {meta.userName}
            </div>
          </div>
          <div className="num" style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(balance)}</div>
            <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 600, fontFamily: "var(--font)" }}>points</div>
          </div>
        </div>

        {/* messages */}
        <div ref={scroller} className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "18px 14px 14px", background: "var(--bg)" }}>
          <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, mi) => (
              <div key={m.id} className="animate-msg" style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: m.who === "user" ? "flex-end" : "flex-start" }}>
                {m.text && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", maxWidth: "100%", flexDirection: m.who === "user" ? "row-reverse" : "row" }}>
                    {m.who === "bot" && (
                      <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: "linear-gradient(150deg,var(--brand-500),var(--brand-700))",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{meta.emoji}</span>
                    )}
                    <Bubble who={m.who}>{m.text}</Bubble>
                  </div>
                )}

                {/* quick chips under the intro */}
                {m.intro && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 38, maxWidth: "94%" }}>
                    {meta.chips.map((c, i) => <Chip key={c} delay={i * 70} onClick={() => sendText(c)}>{c}</Chip>)}
                  </div>
                )}

                {/* follow-up chips (last message only) */}
                {m.chips && m.chips.length > 0 && mi === messages.length - 1 && !busy && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 38, maxWidth: "94%" }}>
                    {m.chips.map((c, i) => <Chip key={c} delay={i * 60} onClick={() => sendText(c)}>{c}</Chip>)}
                  </div>
                )}

                {/* recommendation cards */}
                {m.candidates && m.candidates.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingLeft: 38, width: "100%", maxWidth: "96%" }}>
                    {m.candidates.map((c) => (
                      <OptionCard key={c.candidate_id} cand={c} accent={theme.accent}
                        balance={balance} onRedeem={handleRedeem} redeeming={redeemingId === c.candidate_id}
                        done={redeemedIds.has(c.candidate_id)}
                        booking={bookingId === c.candidate_id}
                        selectedSeats={bookingId === c.candidate_id ? selectedSeats : []}
                        onBookNow={handleBookNow} onToggleSeat={handleToggleSeat}
                        onCancelBooking={handleCancelBooking} />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="animate-msg" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(150deg,var(--brand-500),var(--brand-700))",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{meta.emoji}</span>
                <div style={{ background: "#fff", borderRadius: "18px 18px 18px 6px", padding: "13px 16px", boxShadow: "var(--sh-sm)", border: "1px solid var(--hairline)", display: "flex", gap: 5 }}>
                  {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: "var(--brand-300)", animation: `thinkDot 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {err && <div style={{ padding: "6px 14px", fontSize: 11.5, color: "var(--red)", background: "var(--red-bg)" }}>{err}</div>}

        {/* input */}
        <div style={{ padding: "10px 14px 16px", background: "#fff", borderTop: "1px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={`Message ${meta.botName}…`} style={{ flex: 1, border: "none", background: "var(--bg)", borderRadius: 999,
                padding: "13px 18px", fontFamily: "var(--font)", fontSize: 14.5, color: "var(--ink)", outline: "none" }} />
            <button className="tap" onClick={send} disabled={busy} style={{ width: 46, height: 46, borderRadius: 999, border: "none", flexShrink: 0,
              opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer",
              background: "linear-gradient(160deg,var(--brand-600),var(--brand-700))", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 14px rgba(0,0,0,0.22)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 12l16-8-6 8 6 8z" fill="#fff" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
