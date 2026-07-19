/* Rewards Catalogue — demo reset.
 *
 * The bank flow resets via `db/run_reset.py` (Postgres). The Rewards Catalogue
 * can't: its entire demo state — points balances, cart, travel reservations,
 * concierge chat history, the voucher wallet and the learned preference
 * weights — lives in the browser's localStorage, which no SQL script can reach.
 * This is the catalogue's equivalent of reset_demo.sql.
 *
 * Clearing the keys IS the reset: every reader falls back to the seeded defaults
 * in CAT_PERSONAS (full points, empty cart, no vouchers, default lean weights)
 * when its key is absent.
 *
 * Three ways to run it — no code change needed mid-demo:
 *   • browser console →  credartResetCatalogue()
 *   • URL            →  http://localhost:5173/?reset
 *   • code           →  import { resetCatalogue } from "./lib/resetCatalogue.js"
 */
import { USERS } from "./api.js";

/* Not persona-scoped — one shared key each. */
const GLOBAL_KEYS = [
  "credart:store:state:v1",    // RewardsCatalogue — points balances + carts
  "credart:travel:extras:v1",  // TravelPage — hotel/car/package reservations
];

/* One key per demo persona (Riya, Samyak). */
const PERSONA_KEYS = [
  (pid) => `credart:vouchers:${pid}`,       // catalogue.js — voucher wallet
  (pid) => `credart:weights:${pid}`,        // catalogue.js — learned lean weights
  (pid) => `credart_bubble_convos_${pid}`,  // CredArtBubble — chat history
];

/** Every localStorage key the Rewards Catalogue owns. */
export function catalogueKeys() {
  const keys = [...GLOBAL_KEYS];
  for (const user of USERS) {
    for (const build of PERSONA_KEYS) keys.push(build(user.id));
  }
  return keys;
}

/**
 * Wipe the catalogue's demo state. Returns the keys actually cleared.
 * `reload: true` refreshes the page afterwards so React re-reads the defaults.
 */
export function resetCatalogue({ reload = false, quiet = false } = {}) {
  const cleared = [];

  for (const key of catalogueKeys()) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      cleared.push(key);
    }
  }

  // Safety net: sweep any other credart-owned key, so a feature added later that
  // forgets to register above can never leave the reset silently partial.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || cleared.includes(key)) continue;
    if (key.startsWith("credart:") || key.startsWith("credart_")) {
      localStorage.removeItem(key);
      cleared.push(key);
    }
  }

  if (!quiet) {
    console.info(
      `[reset] Rewards Catalogue reset — cleared ${cleared.length} key(s).`,
      cleared.length ? cleared : "(already clean)",
    );
  }
  if (reload) window.location.reload();
  return cleared;
}

/* Console + URL hooks. Imported for side effect by main.jsx, so this runs before
   React mounts — i.e. before any component has read localStorage. */
if (typeof window !== "undefined") {
  window.credartResetCatalogue = resetCatalogue;

  if (new URLSearchParams(window.location.search).has("reset")) {
    resetCatalogue();
    // Drop ?reset from the URL so a later refresh doesn't wipe again mid-demo.
    window.history.replaceState({}, "", window.location.pathname);
  }
}
