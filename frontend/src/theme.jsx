/* CredArt — per-category visual themes.
 *
 * Every component in the app reads its colours from the global `--brand-*`
 * scale (plus `--bg`). Each theme below overrides that scale on a wrapper div,
 * so switching category re-themes the ENTIRE experience — including the existing
 * bank concierge chat — without touching any component internals.
 *
 * `meta` carries the non-colour, per-category copy/config the new chat needs
 * (greeting, quick chips, demo user, which backend endpoints to call).
 */

export const THEMES = {
  /* ---------- Banks (HDFC) — Navy + Gold ---------- */
  bank: {
    key: "bank",
    name: "Banks",
    brand: "HDFC",
    tagline: "Redeem your credit-card points smartly",
    icon: "bank",
    accent: "#E8B84B", // gold
    accentInk: "#3A2B06",
    outerBg: "radial-gradient(circle at 30% 18%, #e7eef8, #d3e0f1)",
    cardGrad: "linear-gradient(150deg,#13315C,#0A1B33)",
    vars: {
      "--brand-950": "#050F1F",
      "--brand-900": "#0A1B33",
      "--brand-800": "#0F2547",
      "--brand-700": "#13315C",
      "--brand-600": "#1C4B87",
      "--brand-500": "#2563A8",
      "--brand-400": "#5A8AC4",
      "--brand-300": "#9BBBDD",
      "--brand-200": "#C7DAEF",
      "--brand-100": "#E4EDF8",
      "--brand-50": "#F1F6FC",
      "--bg": "#EEF3FA",
    },
    meta: null, // bank keeps its own dashboard/persona experience
  },

  /* ---------- Food & Dining (Subway) — Green + Yellow ---------- */
  dining: {
    key: "dining",
    name: "Food & Dining",
    brand: "Subway",
    tagline: "Free subs, combos & birthday treats on points",
    icon: "food",
    accent: "#FFC72C", // Subway yellow
    accentInk: "#4A3B00",
    outerBg: "radial-gradient(circle at 26% 16%, #e9f9f0, #cdecdb)",
    cardGrad: "linear-gradient(150deg,#008C42,#006E37)",
    vars: {
      "--brand-950": "#022412",
      "--brand-900": "#003D1F",
      "--brand-800": "#00562B",
      "--brand-700": "#006E37",
      "--brand-600": "#008C42",
      "--brand-500": "#00A651",
      "--brand-400": "#37C275",
      "--brand-300": "#84D9A7",
      "--brand-200": "#C1EDD3",
      "--brand-100": "#E3F7EC",
      "--brand-50": "#F2FBF6",
      "--bg": "#EFF9F3",
    },
    meta: {
      apiKind: "dining",
      botName: "Subway Rewards",
      userName: "Anushka",
      points: 500,
      currency: "Subway points",
      emoji: "🥪",
      greeting:
        "Hey Anushka! 🥪 Welcome to Subway Rewards — you've got 500 points to play with. What are you craving today?",
      chips: ["Free sub", "Combo upgrade", "Check my points", "Birthday offer"],
    },
  },

  /* ---------- Entertainment & Cinema — Deep Purple + Red ---------- */
  entertainment: {
    key: "entertainment",
    name: "Entertainment & Cinema",
    brand: "Cinema",
    tagline: "Movies, IMAX, OTT & live events on points",
    icon: "film",
    accent: "#FF4D5E", // cinema red
    accentInk: "#3E0009",
    outerBg: "radial-gradient(circle at 28% 16%, #efe6fb, #ddccf3)",
    cardGrad: "linear-gradient(150deg,#5E1B9C,#26063F)",
    vars: {
      "--brand-950": "#17032A",
      "--brand-900": "#26063F",
      "--brand-800": "#360A57",
      "--brand-700": "#490F76",
      "--brand-600": "#5E1B9C",
      "--brand-500": "#7A2BD0",
      "--brand-400": "#9E5CE0",
      "--brand-300": "#C4A0EE",
      "--brand-200": "#E0CDF7",
      "--brand-100": "#F0E7FC",
      "--brand-50": "#F8F3FE",
      "--bg": "#F4EEFB",
    },
    meta: {
      apiKind: "entertainment",
      botName: "Cinema Rewards",
      userName: "Saket",
      points: 800,
      currency: "entertainment points",
      emoji: "🎬",
      greeting:
        "Hey Saket! 🎬 You've got 800 entertainment points ready. Movie night, an IMAX upgrade, an OTT subscription, or a comedy pass?",
      chips: ["Book movie tickets", "IMAX upgrade", "OTT subscription", "Comedy night pass"],
    },
  },
};

/* Small inline icon set used on the landing cards + chat headers. */
export function CategoryIcon({ name, size = 26, color = "#fff" }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" };
  if (name === "bank")
    return (
      <svg {...p}><path d="M12 3l9 5H3l9-5z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" /><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></svg>
    );
  if (name === "food")
    return (
      <svg {...p}><path d="M4 11h16v1a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-1z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" /><path d="M6 11c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 21h17" stroke={color} strokeWidth="1.7" strokeLinecap="round" /></svg>
    );
  // film
  return (
    <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.8" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" stroke={color} strokeWidth="1.6" strokeLinecap="round" /></svg>
  );
}
