/* CredArt — Rewards Catalogue app.
 *
 * Three stages, all in the navy+gold Kobie theme:
 *   login   → Navy-Federal-style sign-in portal (demo: any credentials work)
 *   landing → visual marketing page: hero, category showcases, About CredArt
 *   store   → the rewards catalogue + floating CredArt concierge
 *
 * The theme is applied by overriding the global `--brand-*` CSS scale on the
 * wrapper div, so every component re-themes with zero internal changes.
 */
import React from "react";
import { THEMES } from "./theme.jsx";
import { RewardsLogin } from "./components/RewardsLogin.jsx";
import { RewardsLanding } from "./components/RewardsLanding.jsx";
import { RewardsCatalogue } from "./components/RewardsCatalogue.jsx";
import { TravelPage } from "./components/travel/TravelPage.jsx";

export default function App() {
  const theme = THEMES.rewards;
  const [stage, setStage] = React.useState("login");
  const [initialCat, setInitialCat] = React.useState(null);

  function enter(cat) {
    // Travel has its own dedicated search/results/review/confirm flow (a
    // separate stage) instead of the catalogue's hardcoded category grid.
    if (cat === "travel") { setStage("travel"); return; }
    setInitialCat(cat || null);
    setStage("store");
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.outerBg, ...theme.vars }}>
      {stage === "login" && (
        <RewardsLogin onLogin={() => setStage("landing")} />
      )}
      {stage === "landing" && (
        <RewardsLanding theme={theme} onEnter={enter} onSignOut={() => setStage("login")} />
      )}
      {stage === "store" && (
        <RewardsCatalogue theme={theme} initialCategory={initialCat}
          onExit={() => setStage("landing")} onOpenTravel={() => setStage("travel")} />
      )}
      {stage === "travel" && (
        <TravelPage theme={theme} onExit={() => setStage("landing")} />
      )}
    </div>
  );
}
