/* CredArt — the entry landing page.
 *
 * Worlds-first: a dark hero fronting the three CredArt rewards worlds (Banks,
 * Food & Dining, Entertainment) — picking one opens that world's themed
 * concierge. Below them, an "About CredArt" band explains how the concierge
 * works; scrolling past THAT reveals the plug-in band, whose gold CTA opens the
 * Rewards Catalogue portal (RewardsLanding.jsx) — the bank-side rewards portal
 * CredArt slots into.
 */
import React from "react";
import { THEMES, CategoryIcon } from "../theme.jsx";
import { CATEGORY_META, CATALOGUE } from "../lib/catalogue.js";

const WORLDS = ["bank", "dining", "entertainment"];
const fmt = (n) => Number(n).toLocaleString("en-IN");

const GOLD = "#E8B84B";
const GOLD_GRAD = "linear-gradient(135deg,#FFE08A,#E8B84B 45%,#C98F1E)";

/* ---------------- ambient background orb ---------------- */
function Orb({ color, size, top, left, right, delay }) {
  return (
    <div className="cr-drift" aria-hidden style={{
      position: "absolute", top, left, right, width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle, ${color}, transparent 68%)`,
      filter: "blur(8px)", animationDelay: delay + "s", pointerEvents: "none",
    }} />
  );
}

/* ---------------- section eyebrow ---------------- */
function Eyebrow({ dot, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 800,
      letterSpacing: 1.5, textTransform: "uppercase", padding: "6px 13px", borderRadius: 999,
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)",
      color: "rgba(255,255,255,0.9)", fontFamily: "var(--font)",
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: dot, boxShadow: `0 0 10px ${dot}` }} />}
      {children}
    </span>
  );
}

/* ---------------- world card — opens a themed concierge ----------------
 * Full-bleed, luminous gradient cards. The theme's own cardGrad is too dark to
 * read against this page (entertainment's purple in particular disappears into
 * the background), so each world gets a brighter, more saturated variant tuned
 * to POP off the dark purple while still living in the same palette. Deep
 * coloured glow underneath separates the card from the page.
 */
const WORLD_STYLE = {
  bank: {
    grad: "linear-gradient(145deg,#3B7BD1 0%,#17458A 52%,#0B2450 100%)",
    glow: "#3B7BD1", ink: "#0B2450", accent: "#F5CF6B",
  },
  dining: {
    grad: "linear-gradient(145deg,#1FCE6D 0%,#059A4B 52%,#02673A 100%)",
    glow: "#12B85C", ink: "#02673A", accent: "#FFD84D",
  },
  entertainment: {
    grad: "linear-gradient(145deg,#FF5C74 0%,#B032C9 55%,#6A1AA8 100%)",
    glow: "#D13BB0", ink: "#5A177F", accent: "#FFD1DA",
  },
};

function WorldCard({ theme, onPick, delay }) {
  const [hover, setHover] = React.useState(false);
  const s = WORLD_STYLE[theme.key];
  return (
    <button
      className="tap animate-msg"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onPick(theme.key)}
      style={{
        animationDelay: delay + "ms",
        textAlign: "left", cursor: "pointer", padding: 0,
        borderRadius: 22, overflow: "hidden", position: "relative",
        background: s.grad,
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: hover
          ? `0 30px 64px -18px rgba(0,0,0,0.66), 0 0 72px -16px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.28)`
          : `0 20px 46px -20px rgba(0,0,0,0.6), 0 0 44px -22px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
        transform: hover ? "translateY(-7px)" : "translateY(0)",
        transition: "transform .24s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* top-left sheen — gives the gradient a lit, glassy surface */}
      <div aria-hidden style={{
        position: "absolute", top: -90, left: -50, width: 260, height: 220, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,255,255,0.26), transparent 68%)",
        pointerEvents: "none",
        transform: hover ? "scale(1.18)" : "scale(1)", transition: "transform .55s ease",
      }} />

      {/* header */}
      <div style={{
        padding: "22px 20px 16px", position: "relative",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{
          width: 50, height: 50, borderRadius: 14, flexShrink: 0,
          background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.34)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
        }}>
          <CategoryIcon name={theme.icon} size={26} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: "#fff", fontWeight: 800, fontSize: 17.5, letterSpacing: -0.2, lineHeight: 1.25,
            textShadow: "0 1px 8px rgba(0,0,0,0.25)",
          }}>{theme.name}</div>
          <div style={{
            color: s.accent, fontSize: 12, fontWeight: 700, marginTop: 3, letterSpacing: 0.4,
          }}>{theme.brand}</div>
        </div>
        <span aria-hidden style={{
          position: "absolute", top: 18, right: 18, width: 9, height: 9, borderRadius: 999,
          background: s.accent, boxShadow: `0 0 12px ${s.accent}, 0 0 26px ${s.accent}88`,
        }} />
      </div>

      {/* body */}
      <div style={{
        padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 18, flex: 1,
        fontFamily: "var(--font)", position: "relative",
      }}>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.85)", fontSize: 13.5, lineHeight: 1.55, flex: 1 }}>
          {theme.tagline}
        </p>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 16px", borderRadius: 12, fontWeight: 800, fontSize: 13.5,
          background: "#fff", color: s.ink,
          boxShadow: hover
            ? "0 10px 24px -8px rgba(0,0,0,0.45)"
            : "0 6px 16px -8px rgba(0,0,0,0.35)",
          transition: "box-shadow .22s ease",
        }}>
          Try CredArt
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{
            transform: hover ? "translateX(3px)" : "none", transition: "transform .22s ease",
          }}><path d="M5 12h14M13 6l6 6-6 6" stroke={s.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </button>
  );
}

/* ---------------- about-CredArt feature tile ---------------- */
function Feature({ icon, title, children, delay }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div className="animate-msg" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        animationDelay: delay + "ms",
        flex: "1 1 230px", borderRadius: 18, padding: "22px 22px 24px",
        background: hover ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.055)",
        border: `1px solid ${hover ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)"}`,
        transform: hover ? "translateY(-4px)" : "none",
        transition: "transform .22s cubic-bezier(.2,.8,.2,1), background .22s ease, border-color .22s ease",
        fontFamily: "var(--font)",
      }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, marginBottom: 13, fontSize: 21,
        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: "#fff", marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export function Landing({ theme, onWorld, onOpenCatalogue, onSignOut }) {
  const totalRewards = CATEGORY_META.reduce((a, c) => a + CATALOGUE[c.key].length, 0);
  const [ctaHover, setCtaHover] = React.useState(false);

  return (
    <div className="cr-root no-sb" style={{
      minHeight: "100vh", width: "100%", overflowY: "auto", position: "relative",
      background: "radial-gradient(circle at 18% 8%, #241246, #120726 55%, #0a0416)",
      boxSizing: "border-box",
    }}>
      {/* ambient depth */}
      <Orb color="rgba(161,117,240,0.28)" size={420} top={-60} left={-90} delay={0} />
      <Orb color="rgba(255,199,44,0.14)" size={340} top={420} right={-70} delay={3} />
      <Orb color="rgba(255,77,94,0.12)" size={300} top={1180} left={-60} delay={6} />

      <div style={{ position: "relative", maxWidth: 1100, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" }}>
        {/* ---------- brand bar ---------- */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 0" }}>
          <span style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(150deg,#A175F0,#6A2FC4)", display: "flex",
            alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20,
            boxShadow: "0 8px 22px rgba(106,47,196,0.5)",
          }}>C</span>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: -0.3, fontFamily: "var(--font)" }}>CredArt</span>
          <div style={{ flex: 1 }} />
          <button className="tap" onClick={onSignOut} title="Sign out" style={{
            padding: "9px 16px", borderRadius: 999, cursor: "pointer",
            border: "1.5px solid rgba(255,255,255,0.24)", background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.88)", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13,
          }}>
            Sign out
          </button>
        </div>

        {/* ---------- hero ---------- */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 34 }}>
          <div style={{ marginBottom: 22 }}>
            <Eyebrow dot="#A175F0">AI rewards concierge</Eyebrow>
          </div>
          <h1 style={{
            color: "#fff", fontFamily: "var(--font)", fontWeight: 800, textAlign: "center",
            fontSize: "clamp(30px, 5.4vw, 52px)", lineHeight: 1.08, margin: "0 0 16px", maxWidth: 780,
            letterSpacing: -0.8,
          }}>
            One AI concierge.<br />
            <span style={{
              background: "linear-gradient(100deg,#C4A4F4,#FFC72C,#FF4D5E)",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>
              Every rewards program.
            </span>
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.7)", fontFamily: "var(--font)", fontSize: 16, textAlign: "center",
            maxWidth: 570, lineHeight: 1.6, margin: "0 0 46px",
          }}>
            Pick a rewards world below. CredArt reads your points, finds the smartest redemption, and books it —
            every number pre-verified, never invented.
          </p>

          {/* ---------- the three worlds ---------- */}
          <div style={{
            width: "100%", maxWidth: 1040, display: "grid", gap: 22,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}>
            {WORLDS.map((k, i) => (
              <WorldCard key={k} theme={THEMES[k]} onPick={onWorld} delay={i * 90} />
            ))}
          </div>
        </div>

        {/* ---------- about CredArt ---------- */}
        <div style={{ paddingTop: 96, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Eyebrow dot="#FFC72C">How it works</Eyebrow>
          <h2 style={{
            color: "#fff", fontFamily: "var(--font)", fontWeight: 800, textAlign: "center",
            fontSize: "clamp(24px, 3.4vw, 36px)", lineHeight: 1.15, margin: "20px 0 14px",
            maxWidth: 700, letterSpacing: -0.5,
          }}>
            A concierge that never invents a number.
          </h2>
          <p style={{
            color: "rgba(255,255,255,0.68)", fontFamily: "var(--font)", fontSize: 15, textAlign: "center",
            maxWidth: 640, lineHeight: 1.65, margin: "0 0 40px",
          }}>
            Most AI assistants guess. CredArt can't. Every points cost, price and balance it quotes is computed
            by deterministic code first — the AI only ever gets a pre-validated shortlist to rank and explain.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", width: "100%", maxWidth: 1040 }}>
            <Feature icon="🤖" title="Talks like a real agent" delay={0}>
              One question at a time, tap-to-answer chips, and it remembers what you said three turns ago —
              no forms, no menus, no re-asking.
            </Feature>
            <Feature icon="🎯" title="Knows what you like" delay={80}>
              Riya leans travel, Samyak leans dining. CredArt learns from what you redeem and shapes every
              recommendation around it.
            </Feature>
            <Feature icon="🔒" title="Books it for real" delay={160}>
              Secure session, 6-digit OTP, points debited only after you verify. Flights come back with a
              live airline PNR — not a mock-up.
            </Feature>
            <Feature icon="🛡️" title="Grounded by design" delay={240}>
              The AI never touches the database. It sees only options the engine already verified you can
              afford — so it physically cannot hallucinate a price.
            </Feature>
          </div>
        </div>

        {/* ---------- scroll cue ---------- */}
        <div style={{
          paddingTop: 92, paddingBottom: 8, display: "flex", flexDirection: "column",
          alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)",
          fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 800,
          letterSpacing: 1.6, textTransform: "uppercase",
        }}>
          And where it all plugs in
          <svg className="cr-bob" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* ---------- the plug-in band: opens the Rewards Catalogue portal ---------- */}
        <div style={{ paddingTop: 40 }}>
          <div style={{
            background: theme.cardGrad, borderRadius: 26, color: "#fff", position: "relative",
            overflow: "hidden", padding: "52px 44px",
            boxShadow: `0 34px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px ${GOLD}2e`,
          }}>
            {/* gold wash */}
            <div aria-hidden style={{
              position: "absolute", top: -110, right: -70, width: 400, height: 400, borderRadius: "50%",
              background: `radial-gradient(circle, ${GOLD}44, transparent 66%)`,
            }} />
            <div aria-hidden style={{
              position: "absolute", bottom: -120, left: -80, width: 320, height: 320, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.08), transparent 66%)",
            }} />
            {/* gold top edge */}
            <div aria-hidden style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3, background: GOLD_GRAD, opacity: 0.9,
            }} />

            <div style={{ position: "relative", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Eyebrow dot={GOLD}>The integration surface</Eyebrow>

              <h2 style={{
                fontFamily: "var(--font)", fontWeight: 800, fontSize: "clamp(26px, 3.8vw, 40px)",
                lineHeight: 1.14, margin: "20px 0 16px", maxWidth: 640, letterSpacing: -0.6,
              }}>
                This is where CredArt<br />
                <span style={{
                  background: GOLD_GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                }}>
                  gets plugged in.
                </span>
              </h2>
              <p style={{
                fontSize: 15, opacity: 0.82, margin: "0 0 34px", maxWidth: 620, lineHeight: 1.65,
              }}>
                A bank's own rewards portal, with {fmt(totalRewards)}+ real rewards priced in points.
                CredArt drops straight in on top as the concierge layer — reading the catalogue, learning
                your taste, and redeeming on your behalf. This is the surface any rewards programme
                already has. CredArt is what makes it think.
              </p>

              <button
                className="tap cr-shine"
                onClick={onOpenCatalogue}
                onMouseEnter={() => setCtaHover(true)}
                onMouseLeave={() => setCtaHover(false)}
                style={{
                  padding: "17px 36px", borderRadius: 999, border: "none", cursor: "pointer",
                  background: GOLD_GRAD, color: "#2A1D02",
                  fontFamily: "var(--font)", fontWeight: 800, fontSize: 16, letterSpacing: -0.2,
                  display: "inline-flex", alignItems: "center", gap: 10,
                  transform: ctaHover ? "translateY(-2px) scale(1.025)" : "none",
                  boxShadow: ctaHover
                    ? `0 18px 44px -8px ${GOLD}bb, 0 0 0 5px ${GOLD}26`
                    : `0 12px 32px -10px ${GOLD}99`,
                  transition: "transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease",
                }}>
                Open the Rewards Catalogue
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{
                  transform: ctaHover ? "translateX(4px)" : "none", transition: "transform .22s ease",
                }}>
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ---------- footer ---------- */}
        <div style={{
          padding: "40px 0 48px", color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "var(--font)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          Anti-hallucination boundary · the assistant only ever sees pre-validated options
        </div>
      </div>
    </div>
  );
}
