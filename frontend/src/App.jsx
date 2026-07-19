/* CredArt — Rewards Catalogue app.
 *
 * Full desktop web app, no device-frame toggle. Stages:
 *   login    → Navy-Federal-style sign-in portal (demo: any credentials work)
 *   landing  → dark worlds-first entry: pick Banks / Dining / Entertainment,
 *              read how CredArt works, then scroll to the gold CTA
 *   catalogue→ the Rewards Catalogue portal (bank-side rewards home): hero,
 *              category showcases, About CredArt — this is the surface CredArt
 *              plugs into
 *   store    → the rewards catalogue grid + floating CredArt concierge
 *   travel   → dedicated flight search/results/review/booking flow
 *
 * The theme is applied by overriding the global `--brand-*` CSS scale on the
 * wrapper div, so every component re-themes with zero internal changes.
 */
import React from "react";
import { THEMES } from "./theme.jsx";
import { RewardsLogin } from "./components/RewardsLogin.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { Landing } from "./components/Landing.jsx";
import { RewardsLanding } from "./components/RewardsLanding.jsx";
import { RewardsCatalogue } from "./components/RewardsCatalogue.jsx";
import { TravelPage } from "./components/travel/TravelPage.jsx";
import { CategoryChat } from "./components/CategoryChat.jsx";
import { BankExperience } from "./components/BankExperience.jsx";
import { IOSDevice } from "./components/IOSDevice.jsx";
import { ViewToggle } from "./components/ViewToggle.jsx";

export default function App() {
  const theme = THEMES.rewards;
  const [stage, setStage] = React.useState("login");
  const [initialCat, setInitialCat] = React.useState(null);
  // Bank experience is dual-face: desktop browser shell vs phone bezel.
  const [bankView, setBankView] = React.useState("laptop");

  function enter(cat) {
    // Travel has its own dedicated search/results/review/confirm flow instead
    // of the catalogue's hardcoded category grid.
    if (cat === "travel") { setStage("travel"); return; }
    setInitialCat(cat || null);
    setStage("store");
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.outerBg, ...theme.vars }}>
      {stage === "login" && (
        <RewardsLogin onLogin={() => setStage("loading")} />
      )}
      {/* Kobie Launchpad Hackathon splash — sits between sign-in and the landing */}
      {stage === "loading" && (
        <LoadingScreen onDone={() => setStage("landing")} />
      )}
      {stage === "landing" && (
        <Landing theme={theme} onWorld={(key) => setStage(key)}
          onOpenCatalogue={() => setStage("catalogue")}
          onSignOut={() => setStage("login")} />
      )}
      {/* the Rewards Catalogue portal — the bank-side rewards home CredArt plugs into */}
      {stage === "catalogue" && (
        <RewardsLanding theme={theme} onEnter={enter}
          onSignOut={() => setStage("landing")} />
      )}
      {/* other rewards worlds — each re-themed by its own --brand-* scale */}
      {(stage === "dining" || stage === "entertainment") && (
        <div key={stage} style={{ minHeight: "100vh", background: THEMES[stage].outerBg, ...THEMES[stage].vars }}>
          <CategoryChat theme={THEMES[stage]} onBack={() => setStage("landing")} />
        </div>
      )}
      {/* Bank — the one dual-face experience: laptop browser shell or phone bezel.
          Both faces render the same inner tree, so the switch preserves screen state. */}
      {stage === "bank" && (
        <div style={{ minHeight: "100vh", background: THEMES.bank.outerBg, ...THEMES.bank.vars }}>
          <ViewToggle view={bankView} onChange={setBankView} />
          {bankView === "mobile" ? (
            <div style={{
              minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
              padding: "28px 12px",
              background: "radial-gradient(circle at 30% 18%, #241246, #120726 60%, #0a0416)",
            }}>
              <IOSDevice>
                <BankExperience view="mobile" onBack={() => setStage("landing")} />
              </IOSDevice>
            </div>
          ) : (
            <BankExperience view="laptop" onBack={() => setStage("landing")} />
          )}
        </div>
      )}
      {stage === "store" && (
        <RewardsCatalogue theme={theme} initialCategory={initialCat}
          onExit={() => setStage("catalogue")} onOpenTravel={() => setStage("travel")} />
      )}
      {stage === "travel" && (
        <TravelPage theme={theme} onExit={() => setStage("catalogue")} />
      )}
    </div>
  );
}
