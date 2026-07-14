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
import { BootSplash } from "./components/BootSplash.jsx";

/* Fixed top-right laptop / mobile switch. */
function ViewToggle({ view, onChange }) {
  const seg = (key, label, icon) => {
    const active = view === key;
    return (
      <button className="tap" onClick={() => onChange(key)} title={`${label} view`} style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
        border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800,
        background: active ? "#fff" : "transparent", color: active ? "#0B1D2C" : "rgba(255,255,255,0.8)",
        boxShadow: active ? "0 2px 8px rgba(0,0,0,0.18)" : "none", transition: "background .15s ease",
      }}>
        {icon}{label}
      </button>
    );
  };
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, display: "inline-flex", gap: 2,
      padding: 3, borderRadius: 999, background: "rgba(11,29,44,0.88)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 24px rgba(11,29,44,0.28)" }}>
      {seg("laptop", "Laptop",
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.9" /><path d="M2 20h20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>)}
      {seg("mobile", "Mobile",
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.9" /><path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>)}
    </div>
  );
}

/* Floating "back to launchpad" pill shown inside every opened app — the
   in-app screens keep their own nav; this always escapes to the landing. */
function HomeButton({ onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button className="tap" onClick={onClick} title="Back to CredArt home"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed", bottom: 18, left: 18, zIndex: 300, display: "inline-flex",
        alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999,
        border: "1px solid rgba(11,29,44,0.14)", cursor: "pointer",
        background: hover ? "#0B1D2C" : "rgba(251,247,238,0.92)",
        color: hover ? "#FBF7EE" : "#0B1D2C", backdropFilter: "blur(8px)",
        fontFamily: "var(--font)", fontSize: 12.5, fontWeight: 800,
        boxShadow: "0 10px 26px rgba(11,29,44,0.22)", transition: "background .16s ease, color .16s ease",
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M3 11l9-8 9 8M5 9.5V21h5.5v-6h3v6H19V9.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      CredArt home
    </button>
  );
}

export default function App() {
  const [booting, setBooting] = React.useState(true);   // launch splash on first load
  const [category, setCategory] = React.useState(null); // null = landing overview
  const [zooming, setZooming] = React.useState(false);  // laptop→app zoom in progress
  const [view, setView] = React.useState("laptop");
  const mobile = view === "mobile";
  const back = () => setCategory(null);

  /* Pick an app → the landing laptop lingers, plays a zoom-out (fly into the
     screen), then the app mounts fullscreen with a matching zoom-in.
     The credit-card concierge is a PHONE experience — opening it flips to
     mobile; the rewards store is the desktop face and flips to laptop. */
  const pick = (cat) => {
    if (zooming) return;
    setZooming(true);
    setTimeout(() => {
      if (cat === "bank") setView("mobile");
      if (cat === "rewards") setView("laptop");
      setCategory(cat);
      setZooming(false);
    }, 560);
  };

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

  if (booting) return <BootSplash onDone={() => setBooting(false)} />;

  // Phone experiences: mobile view, or the dining/entertainment concierge chats
  // (which live in the phone frame regardless of the toggle).
  const asPhone = mobile || category === "dining" || category === "entertainment";
  // Warm cream backdrop behind the device frames (Kobie palette: navy/coral/cream).
  const phoneBg = "radial-gradient(circle at 30% 18%, #FBF7EE, #F3EDE0 62%, #EAE1CF)";

  // --- Landing: still framed as a laptop (the "device" you launch from). The
  //     zoom-out plays here, then the app takes over fullscreen. ---
  if (!category) {
    const landing = <Landing view={view} onPick={pick} />;
    return (
      <>
        <ViewToggle view={view} onChange={setView} />
        {asPhone ? (
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
            justifyContent: "center", padding: "26px 12px", background: phoneBg }}>
            <IOSDevice dark>{landing}</IOSDevice>
          </div>
        ) : (
          <div className={zooming ? "laptop-zoom-out" : ""} style={{ transformOrigin: "50% 42%" }}>
            <LaptopDevice>{landing}</LaptopDevice>
          </div>
        )}
      </>
    );
  }

  // --- App open: phone apps stay in the phone frame; desktop apps (the rewards
  //     store) fill the whole viewport — the laptop frame is gone. ---
  const appNode = (
    <div key={category} className="app-zoom-in"
      style={{ height: "100%", background: THEMES[themeKey].outerBg, ...THEMES[themeKey].vars }}>
      {renderApp()}
    </div>
  );
  return (
    <>
      <HomeButton onClick={back} />
      {asPhone ? (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", padding: "26px 12px", background: phoneBg }}>
          <IOSDevice dark>{appNode}</IOSDevice>
        </div>
      ) : (
        <div className="app-zoom-in" style={{ height: "100vh", overflow: "hidden",
          background: THEMES[themeKey].outerBg, ...THEMES[themeKey].vars }}>
          {renderApp()}
        </div>
      )}
    </>
  );
}
