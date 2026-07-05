/* CredArt — post-login landing page.
 *
 * A rich, visual marketing page in the Kobie portal style: photo hero,
 * image-led showcases of the four reward categories (with live counts, price
 * floors and example rewards computed from the hardcoded catalogue), and an
 * "About CredArt" band explaining the AI concierge + OTP checkout + CMR
 * personalization. CTAs open the store (optionally deep-linked to a category).
 */
import React from "react";
import { CATEGORY_META, CATALOGUE } from "../lib/catalogue.js";

const fmt = (n) => Number(n).toLocaleString("en-IN");
const img = (seed, w, h) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

/* Representative photo seed per category (stable picsum seeds). */
const CAT_IMG = { travel: "marriott-goa", giftcards: "amazon-gift", cashback: "cashback-10000", merchandise: "sony-xm5" };

function catStats(key) {
  const items = CATALOGUE[key];
  return {
    count: items.length,
    from: Math.min(...items.map((i) => i.points)),
    examples: items.slice(0, 3).map((i) => i.name),
  };
}

/* ---------------- category showcase card ---------------- */
function ShowcaseCard({ theme, meta, onExplore, delay }) {
  const [hover, setHover] = React.useState(false);
  const s = catStats(meta.key);
  return (
    <div className="animate-msg" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ animationDelay: delay + "ms", background: "#fff", borderRadius: 18, overflow: "hidden",
        border: "1px solid var(--brand-100)", display: "flex", flexDirection: "column",
        boxShadow: hover ? "0 24px 50px -16px rgba(12,39,72,0.4)" : "var(--sh-md)",
        transform: hover ? "translateY(-6px)" : "none",
        transition: "transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease" }}>
      {/* photo */}
      <div style={{ position: "relative", height: 168 }}>
        <img src={img(CAT_IMG[meta.key], 640, 400)} alt={meta.label} loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(200deg, transparent 45%, rgba(8,28,51,0.72))" }} />
        <div style={{ position: "absolute", left: 16, bottom: 12, color: "#fff", display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 24 }}>{meta.emoji}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{meta.label}</div>
            <div style={{ fontSize: 11.5, opacity: 0.9, fontWeight: 700 }}>{s.count} rewards · from {fmt(s.from)} pts</div>
          </div>
        </div>
      </div>
      {/* body */}
      <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.5 }}>{meta.blurb}.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {s.examples.map((name) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--brand-800)", fontWeight: 600 }}>
              <span style={{ width: 17, height: 17, borderRadius: 999, background: "var(--brand-50)", display: "inline-flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="var(--brand-600)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>…and {s.count - 3} more</div>
        </div>
        <button className="tap" onClick={() => onExplore(meta.key)} style={{ padding: "11px 16px", borderRadius: 999, border: "none",
          background: theme.cardGrad, color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          Explore {meta.label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ---------------- about-CredArt feature tile ---------------- */
function Feature({ icon, title, children }) {
  return (
    <div style={{ flex: "1 1 240px", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 16, padding: "18px 20px" }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12.5, opacity: 0.82, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function RewardsLanding({ theme, onEnter, onSignOut }) {
  const totalRewards = CATEGORY_META.reduce((a, c) => a + CATALOGUE[c.key].length, 0);
  return (
    <div className="cr-root no-sb" style={{ minHeight: "100vh", background: "var(--bg)", overflowY: "auto" }}>
      {/* ---------- slim nav ---------- */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--brand-100)", padding: "12px 24px",
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 2px 10px rgba(12,39,72,0.05)" }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: theme.cardGrad, display: "flex",
          alignItems: "center", justifyContent: "center" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.6" /><path d="M12 3a13 13 0 0 0 0 18M12 3a13 13 0 0 1 0 18M3.5 9h17M3.5 15h17" stroke="#fff" strokeWidth="1.2" /></svg>
        </span>
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: "var(--brand-800)" }}>CredArt Rewards</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--brand-400)", fontStyle: "italic" }}>Powered by CredArt</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="tap" onClick={() => onEnter(null)} style={{ padding: "9px 18px", borderRadius: 999, border: "none",
          background: theme.cardGrad, color: "#fff", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          Browse the Store
        </button>
        <button className="tap" onClick={onSignOut} title="Sign out" style={{ padding: "9px 14px", borderRadius: 999,
          border: "1.5px solid var(--brand-200)", background: "#fff", color: "var(--brand-700)",
          fontFamily: "var(--font)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "30px 24px 60px" }}>
        {/* ---------- hero: text + photo ---------- */}
        <div style={{ display: "flex", gap: 26, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 380px", background: theme.cardGrad, color: "#fff", borderRadius: 20,
            padding: "36px 32px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column",
            justifyContent: "center", boxShadow: "0 20px 46px rgba(12,39,72,0.3)" }}>
            <div style={{ position: "absolute", top: -50, right: -40, width: 260, height: 260, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(232,144,30,0.35), transparent 65%)" }} />
            <span style={{ position: "relative", display: "inline-block", alignSelf: "flex-start", fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
              textTransform: "uppercase", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.2)", marginBottom: 18 }}>
              ✦ Welcome back
            </span>
            <h1 style={{ position: "relative", fontFamily: "var(--font)", fontWeight: 800, fontSize: "clamp(28px, 3.8vw, 44px)",
              lineHeight: 1.08, margin: "0 0 10px" }}>
              You've earned it.<br />Now enjoy it.
            </h1>
            <p style={{ position: "relative", fontSize: 15.5, opacity: 0.9, margin: "0 0 22px", maxWidth: 430, lineHeight: 1.55 }}>
              Your rewards are a click away — {fmt(totalRewards)}+ real rewards across travel, gift cards,
              cashback and merchandise, every one priced in points and pre-verified.
            </p>
            <div style={{ position: "relative", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="tap" onClick={() => onEnter(null)} style={{ padding: "13px 24px", borderRadius: 999, border: "none",
                background: "#fff", color: "var(--brand-800)", fontFamily: "var(--font)", fontWeight: 800, fontSize: 14.5,
                cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}>
                Browse the Rewards Store →
              </button>
              <button className="tap" onClick={() => onEnter("travel")} style={{ padding: "13px 20px", borderRadius: 999,
                border: "1.5px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff",
                fontFamily: "var(--font)", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                ✈️ Start with Travel
              </button>
            </div>
          </div>
          <div style={{ flex: "1 1 320px", minHeight: 300, borderRadius: 20, overflow: "hidden", position: "relative",
            boxShadow: "0 20px 46px rgba(12,39,72,0.22)" }}>
            <img src="https://picsum.photos/id/1018/1000/720" alt="your next getaway"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(200deg, transparent 55%, rgba(8,28,51,0.6))" }} />
            <div style={{ position: "absolute", left: 20, bottom: 16, color: "#fff" }}>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>Your next getaway, on points</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Flights from {fmt(catStats("travel").from)} pts · concierge-planned</div>
            </div>
          </div>
        </div>

        {/* ---------- reward types ---------- */}
        <div style={{ margin: "44px 0 6px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font)", fontSize: 27, fontWeight: 800, color: "var(--brand-900)", margin: "0 0 6px" }}>
            Your rewards, your way. Explore your options.
          </h2>
          <p style={{ margin: "0 auto", color: "var(--ink-2)", fontSize: 14.5, maxWidth: 620, lineHeight: 1.55 }}>
            Four ways to spend — from instant e-vouchers to full holidays. Every reward is hard-priced in
            points, so what you see is exactly what you redeem.
          </p>
        </div>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", marginTop: 22 }}>
          {CATEGORY_META.map((meta, i) => (
            <ShowcaseCard key={meta.key} theme={theme} meta={meta} onExplore={onEnter} delay={i * 80} />
          ))}
        </div>

        {/* ---------- about CredArt ---------- */}
        <div style={{ marginTop: 46, background: theme.cardGrad, borderRadius: 22, color: "#fff",
          padding: "34px 32px", position: "relative", overflow: "hidden", boxShadow: "0 20px 46px rgba(12,39,72,0.3)" }}>
          <div style={{ position: "absolute", bottom: -70, left: -50, width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.1), transparent 65%)" }} />
          <div style={{ position: "relative" }}>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase",
              padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)", marginBottom: 14 }}>
              About CredArt
            </span>
            <h2 style={{ fontFamily: "var(--font)", fontSize: 25, fontWeight: 800, margin: "0 0 10px", maxWidth: 560 }}>
              An AI rewards concierge that never invents a number.
            </h2>
            <p style={{ fontSize: 14, opacity: 0.88, margin: "0 0 24px", maxWidth: 640, lineHeight: 1.6 }}>
              CredArt reads your points, learns what you love, and finds the smartest redemption — then books it
              securely. Every points value and availability figure is computed from the catalogue and your own
              balance, never guessed by the AI.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Feature icon="🤖" title="Chat with your concierge">
                The floating CredArt bubble talks like a real agent — one question at a time, tap-to-answer
                chips, and picks tailored to your profile (Riya leans travel, Samyak leans dining).
              </Feature>
              <Feature icon="🎯" title="Budget honesty, up front">
                Anything beyond your spendable points is flagged before you commit — no dead ends at checkout,
                ever.
              </Feature>
              <Feature icon="🔒" title="OTP-secured checkout">
                Redemptions run like a real bank flow: secure session, 6-digit OTP, and points debited only
                after you verify. Flights return a PNR, orders a tracking ID.
              </Feature>
              <Feature icon="✨" title="CMR personalization">
                Your saved profile fills the gaps — delivery addresses autofill, party sizes pre-plan, and
                preferences shape every recommendation.
              </Feature>
            </div>
          </div>
        </div>

        {/* ---------- footer ---------- */}
        <div style={{ marginTop: 30, textAlign: "center", color: "var(--ink-3)", fontSize: 12, display: "flex",
          alignItems: "center", justifyContent: "center", gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          CredArt Rewards · every number pre-verified, never invented · demo portal
        </div>
      </div>
    </div>
  );
}
