/* CredArt root: landing overview → pick an app → its themed experience.
   The credit-card app is dual-face: Laptop = the mockkobie rewards store
   (desktop), Mobile = the per-card concierge (phone). Dining/entertainment are
   mobile concierge chats, shown in the phone frame on either toggle. */
import React from "react";
import { THEMES } from "./theme.jsx";
import { Landing } from "./components/Landing.jsx";
import { BankExperience } from "./components/BankExperience.jsx";
import { CategoryChat } from "./components/CategoryChat.jsx";
import { RewardsApp } from "./components/RewardsApp.jsx";
import { IOSDevice } from "./components/IOSDevice.jsx";
import { LaptopDevice } from "./components/LaptopDevice.jsx";

/* Fixed top-right laptop / mobile switch. */
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
  const [category, setCategory] = React.useState(null); // null = landing overview
  const [view, setView] = React.useState("laptop");
  const mobile = view === "mobile";
  const back = () => setCategory(null);

  // Credit-card laptop face = the store, so it renders in the rewards theme.
  const themeKey = category === "bank" && !mobile ? "rewards" : category;

  function renderApp() {
    if (category === "bank") {
      return mobile
        ? <BankExperience view="mobile" onBack={back} />         // mobile: per-card concierge
        : <RewardsApp theme={THEMES.rewards} onBack={back} />;   // laptop: mockkobie store
    }
    if (category === "rewards") return <RewardsApp theme={THEMES.rewards} onBack={back} />;
    return <CategoryChat theme={THEMES[category]} view="mobile" onBack={back} />; // dining / entertainment
  }

  const content = !category ? (
    <Landing view={view} onPick={setCategory} />
  ) : (
    <div key={category} style={{ height: "100%", background: THEMES[themeKey].outerBg, ...THEMES[themeKey].vars }}>
      {renderApp()}
    </div>
  );

  // Phone frame for mobile view and for the concierge chats (which perform best
  // on mobile); MacBook frame for the desktop store + landing overview.
  const asPhone = mobile || category === "dining" || category === "entertainment";

  return (
    <>
      <ViewToggle view={view} onChange={setView} />
      {asPhone ? (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "26px 12px", background: "radial-gradient(circle at 30% 18%, #241246, #120726 60%, #0a0416)" }}>
          <IOSDevice dark>{content}</IOSDevice>
        </div>
      ) : <LaptopDevice>{content}</LaptopDevice>}
    </>
  );
}
