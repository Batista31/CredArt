/* Rewards Catalogue app (Kobie-style). Stages: landing → store → travel.
   "Sign out" exits to the main category landing via onBack. */
import React from "react";
import { RewardsLanding } from "./RewardsLanding.jsx";
import { RewardsCatalogue } from "./RewardsCatalogue.jsx";
import { TravelPage } from "./travel/TravelPage.jsx";

export function RewardsApp({ theme, onBack }) {
  const [stage, setStage] = React.useState("landing");
  const [initialCat, setInitialCat] = React.useState(null);

  function enter(cat) {
    if (cat === "travel") { setStage("travel"); return; } // travel = dedicated flow
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
