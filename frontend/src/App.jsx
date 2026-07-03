/* CredArt — root router.
 *
 * Landing page → pick a category → that category's themed concierge. The theme
 * (navy+gold / green+yellow / purple+red) is applied by overriding the global
 * `--brand-*` CSS scale on a wrapper div, so each experience re-themes wholesale
 * with zero changes to the components inside it.
 *
 *   bank          → the original HDFC concierge (BankExperience), unchanged
 *   dining / ent. → the new themed CategoryChat, wired to the new backend routers
 *
 * A global laptop ⇄ mobile toggle re-renders the whole app inside a phone frame
 * (IOSDevice); every experience accepts a `view` prop and lays itself out to fit.
 */
import React from "react";
import { THEMES } from "./theme.jsx";
import { Landing } from "./components/Landing.jsx";
import { BankExperience } from "./components/BankExperience.jsx";
import { CategoryChat } from "./components/CategoryChat.jsx";
import { IOSDevice } from "./components/IOSDevice.jsx";

/* Floating laptop / mobile switch — fixed top-right, visible on every screen. */
function ViewToggle({ view, onChange }) {
  const seg = (key, label, icon) => {
    const active = view === key;
    return (
      <button className="tap" onClick={() => onChange(key)} title={`${label} view`} style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
        border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800,
        background: active ? "#fff" : "transparent", color: active ? "#1C1330" : "rgba(255,255,255,0.8)",
        boxShadow: active ? "0 2px 8px rgba(0,0,0,0.18)" : "none", transition: "background .15s ease",
      }}>
        {icon}{label}
      </button>
    );
  };
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, display: "inline-flex", gap: 2,
      padding: 3, borderRadius: 999, background: "rgba(18,10,38,0.72)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
      {seg("laptop", "Laptop",
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.9" /><path d="M2 20h20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>)}
      {seg("mobile", "Mobile",
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.9" /><path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>)}
    </div>
  );
}

export default function App() {
  const [category, setCategory] = React.useState(null);
  const [view, setView] = React.useState("laptop");
  const mobile = view === "mobile";
  const back = () => setCategory(null);

  const content = !category ? (
    <Landing view={view} onPick={setCategory} />
  ) : (
    // Theme wrapper: the vars cascade to every child (including the bank chat).
    // key={category} guarantees a clean remount (and fresh state) per category.
    <div key={category} style={{
      minHeight: mobile ? "100%" : "100vh", height: mobile ? "100%" : undefined,
      background: THEMES[category].outerBg, ...THEMES[category].vars }}>
      {category === "bank"
        ? <BankExperience view={view} onBack={back} />
        : <CategoryChat theme={THEMES[category]} view={view} onBack={back} />}
    </div>
  );

  return (
    <>
      <ViewToggle view={view} onChange={setView} />
      {mobile ? (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "26px 12px", background: "radial-gradient(circle at 30% 18%, #241246, #120726 60%, #0a0416)" }}>
          <IOSDevice dark>{content}</IOSDevice>
        </div>
      ) : content}
    </>
  );
}
