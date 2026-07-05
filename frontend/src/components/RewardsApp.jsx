/* CredArt — Rewards Catalogue app (Kobie/Navy Federal style), wired into the
 * main multi-category shell (App.jsx) as the "rewards" category tile.
 *
 * Two stages:
 *   landing → visual marketing page: hero, category showcases, About CredArt
 *   store   → the rewards catalogue + floating CredArt concierge
 *   travel  → dedicated flight search/results/review/demo-booking flow
 *
 * Unlike the standalone mockkobie demo this was ported from, there's no
 * separate login stage here — the user already entered the app from the main
 * Landing page, same as the bank/dining/entertainment categories skip a login
 * too. `onSignOut` (labelled "Sign out" on RewardsLanding) exits back to that
 * main Landing page via the `onBack` prop from App.jsx.
 */
import React from "react";
import { RewardsLanding } from "./RewardsLanding.jsx";
import { RewardsCatalogue } from "./RewardsCatalogue.jsx";
import { TravelPage } from "./travel/TravelPage.jsx";

export function RewardsApp({ theme, onBack }) {
  const [stage, setStage] = React.useState("landing");
  const [initialCat, setInitialCat] = React.useState(null);

  function enter(cat) {
    // Travel has its own dedicated search/results/review/confirm flow (a
    // separate stage) instead of the catalogue's hardcoded category grid.
    if (cat === "travel") { setStage("travel"); return; }
    setInitialCat(cat || null);
    setStage("store");
  }

  return (
    <>
      {stage === "landing" && (
        <RewardsLanding theme={theme} onEnter={enter} onSignOut={onBack} />
      )}
      {stage === "store" && (
        <RewardsCatalogue theme={theme} initialCategory={initialCat}
          onExit={() => setStage("landing")} onOpenTravel={() => setStage("travel")} />
      )}
      {stage === "travel" && (
        <TravelPage theme={theme} onExit={() => setStage("landing")} />
      )}
    </>
  );
}
