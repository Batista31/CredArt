/* CredArt — Rewards Catalogue (Kobie-style store).
 *
 * FULLY HARDCODED, self-contained. No backend call fetches these items — the
 * catalogue "never changes", so a demo is always identical and replayable. The
 * floating CredArt chat runs a small LOCAL intent engine over this same data
 * (so every recommendation references a real catalogue item by name) and only
 * pings the real backend /chat as a best-effort enrichment for open-ended text.
 *
 * Points here are a self-contained demo bucket (Riya 84,500 · Samyak 50,000) —
 * deducting them never touches the bank ledger, so this cannot break the bank,
 * dining, or entertainment routes.
 */
import { USERS } from "./api.js";

/* Stable placeholder photo for a product (picsum is seeded → same image every
   render for a given slug). */
export const imgFor = (slug) => `https://picsum.photos/seed/${encodeURIComponent(slug)}/320/220`;

const fmt = (n) => Number(n).toLocaleString("en-IN");
export const fmtPts = (n) => `${fmt(n)} pts`;

/* ------------------------------------------------------------------ */
/* Catalogue categories (order matters — drives the landing grid).     */
/* ------------------------------------------------------------------ */
export const CATEGORY_META = [
  { key: "travel",      label: "Travel",        emoji: "✈️", blurb: "Flights, stays, lounges & getaways" },
  { key: "giftcards",   label: "Gift Cards",    emoji: "🎁", blurb: "Instant e-vouchers for brands you love" },
  { key: "cashback",    label: "Cashback",      emoji: "💸", blurb: "Turn points straight into statement credit" },
  { key: "merchandise", label: "Merchandise",   emoji: "🛍️", blurb: "Gadgets, home & lifestyle products" },
];

/* Each item: id, name, points, and (for gift cards / cashback) a rupee `value`
   used by the "best value for my points" recommender (value ÷ points ratio).
   A handful of curated items keep FIXED ids because the concierge engine +
   personas reference them by name (e.g. tv-indigo, gc-taj). The rest are built
   in bulk from compact tuples so every category carries 50+ rewards. */

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* [name, points, value?] → item. `prefix`+index guarantees a unique id/slug. */
const rows = (prefix, list, desc) =>
  list.map(([name, points, value], i) => ({
    id: `${prefix}-${i + 1}`,
    name, points,
    ...(value ? { value } : {}),
    slug: `${prefix}-${slugify(name)}`,
    desc: typeof desc === "function" ? desc(name, points, value) : (desc || name),
  }));

/* ---- curated (fixed ids the engine relies on) ---- */
const TRAVEL_CURATED = [
  { id: "tv-indigo",   name: "IndiGo Flight Voucher",             points: 32000, slug: "indigo-flight",    desc: "A domestic IndiGo flight voucher — book any 6E route across India. Perfect for that BLR–GOA weekend escape." },
  { id: "tv-ai-biz",   name: "Air India Business Upgrade",        points: 45000, slug: "airindia-business", desc: "Upgrade one leg of an Air India booking to Business class — lie-flat comfort, priority boarding and lounge access." },
  { id: "tv-marriott", name: "Marriott Weekend Stay (Goa)",       points: 28000, slug: "marriott-goa",      desc: "A two-night weekend stay at a Marriott property in Goa, breakfast included. Sun, sand and points well spent." },
  { id: "tv-itc",      name: "ITC Grand Chola Dining",            points: 10000, slug: "itc-grand-chola",   desc: "A fine-dining experience for two at ITC Grand Chola, Chennai — award-winning restaurants under one iconic roof." },
  { id: "tv-lounge",   name: "Airport Lounge Access (12 visits)", points: 15000, slug: "airport-lounge",    desc: "12 domestic airport lounge visits over the year — Wi-Fi, food and a quiet seat before every flight." },
  { id: "tv-manali",   name: "Manali Weekend Package",            points: 22000, slug: "manali-weekend",    desc: "A curated Manali weekend package — stay, transfers and a mountain itinerary. Cool air, warm points." },
];
const GC_CURATED = [
  { id: "gc-amazon",   name: "Amazon Gift Card ₹2,000",   points: 8000,  value: 2000, slug: "amazon-gift",    desc: "A ₹2,000 Amazon.in e-gift card delivered instantly to your email. Spend it on anything, anytime." },
  { id: "gc-flipkart", name: "Flipkart Gift Card ₹1,500", points: 6000,  value: 1500, slug: "flipkart-gift",  desc: "A ₹1,500 Flipkart e-gift card — electronics, fashion, home and more." },
  { id: "gc-zomato",   name: "Zomato Credits ₹500",       points: 2500,  value: 500,  slug: "zomato-credits", desc: "₹500 in Zomato credits for your next food delivery or dining-out order." },
  { id: "gc-swiggy",   name: "Swiggy Credits ₹500",       points: 2500,  value: 500,  slug: "swiggy-credits", desc: "₹500 in Swiggy credits — dinner tonight is on your points." },
  { id: "gc-myntra",   name: "Myntra Gift Card ₹1,000",   points: 4500,  value: 1000, slug: "myntra-gift",    desc: "A ₹1,000 Myntra gift card for fashion, footwear and accessories." },
  { id: "gc-bms",      name: "BookMyShow Voucher ₹500",   points: 4000,  value: 500,  slug: "bookmyshow",     desc: "A ₹500 BookMyShow voucher — movies, plays and live events." },
  { id: "gc-taj",      name: "Taj Dining Voucher ₹3,000", points: 10000, value: 3000, slug: "taj-dining",     desc: "A ₹3,000 Taj dining voucher — a premium dining experience for two across Taj hotels & restaurants." },
];
const CB_CURATED = [
  { id: "cb-500",   name: "₹500 cashback to account",    points: 2000,  value: 500,   slug: "cashback-500",   desc: "₹500 credited straight to your linked account as statement cashback. Simple, instant, no strings." },
  { id: "cb-1000",  name: "₹1,000 cashback to account",  points: 4000,  value: 1000,  slug: "cashback-1000",  desc: "₹1,000 statement cashback credited to your linked account." },
  { id: "cb-2500",  name: "₹2,500 cashback to account",  points: 9500,  value: 2500,  slug: "cashback-2500",  desc: "₹2,500 statement cashback — a little more value per point at this tier." },
  { id: "cb-5000",  name: "₹5,000 cashback to account",  points: 18000, value: 5000,  slug: "cashback-5000",  desc: "₹5,000 statement cashback credited to your linked account." },
  { id: "cb-10000", name: "₹10,000 cashback to account", points: 35000, value: 10000, slug: "cashback-10000", desc: "₹10,000 statement cashback — the best rupee-per-point rate in the cashback tier." },
];
const MD_CURATED = [
  { id: "md-grill",    name: "10-Piece Premium Grilling Set",    points: 12910, slug: "grilling-set",     desc: "A 10-piece stainless-steel grilling set with case — everything you need for the perfect weekend barbecue." },
  { id: "md-coffee",   name: "Coffee Center 12-Cup Coffeemaker", points: 26870, slug: "coffeemaker",      desc: "A programmable 12-cup coffee centre with single-serve and carafe brewing. Wake up to points-powered coffee." },
  { id: "md-steamer",  name: "Compact Fabric Steamer",           points: 6400,  slug: "fabric-steamer",   desc: "A compact handheld garment steamer — wrinkle-free in minutes, travel-friendly." },
  { id: "md-heatpad",  name: "Massaging Heating Pad",            points: 7140,  slug: "heating-pad",      desc: "A weighted massaging heating pad with multiple heat settings for neck, back and shoulders." },
  { id: "md-sony",     name: "Sony WH-1000XM5 Headphones",       points: 38000, slug: "sony-xm5",         desc: "Industry-leading noise-cancelling over-ear headphones with 30-hour battery and crystal-clear calls." },
  { id: "md-canon",    name: "Canon EOS M50 Camera",             points: 52000, slug: "canon-m50",        desc: "A 24.1MP mirrorless camera with 4K video and flip-out screen — your points, framed beautifully." },
  { id: "md-airpods",  name: "Apple AirPods Pro",                points: 28000, slug: "airpods-pro",      desc: "Active noise cancellation, adaptive transparency and a snug personalised fit." },
  { id: "md-dyson",    name: "Dyson V8 Vacuum",                  points: 42000, slug: "dyson-v8",         desc: "A cord-free Dyson V8 vacuum with powerful suction and up to 40 minutes of run-time." },
  { id: "md-airfryer", name: "Philips Air Fryer",                points: 18500, slug: "philips-airfryer", desc: "Rapid-air technology for crispy food with little to no oil — healthier snacking on points." },
  { id: "md-cooker",   name: "Prestige Pressure Cooker",         points: 5800,  slug: "prestige-cooker",  desc: "A durable 5-litre stainless-steel pressure cooker for everyday Indian cooking." },
];

/* ---- bulk travel ---- */
const TRAVEL_BULK = rows("tvx", [
  ["Vistara Flight Voucher", 30000], ["SpiceJet Flight Voucher", 24000], ["Akasa Air Flight Voucher", 22000],
  ["Emirates Economy Voucher", 60000], ["Qatar Airways Economy Voucher", 62000], ["Singapore Airlines Voucher", 68000],
  ["Lufthansa Europe Flight", 65000], ["British Airways London Voucher", 70000], ["Thai Airways Bangkok Flight", 40000],
  ["AirAsia International Voucher", 26000], ["Domestic Round-Trip Flight (any airline)", 38000], ["International One-Way Flight Credit", 55000],
  ["Taj Hotels Weekend Stay", 34000], ["Oberoi Luxury Night", 42000], ["Hyatt Regency 2-Night Stay", 30000],
  ["Radisson Blu Weekend", 24000], ["Novotel City Stay", 20000], ["The Leela Palace Suite Night", 50000],
  ["OYO Townhouse 2-Night Stay", 9000], ["Airbnb Stay Voucher ₹8,000", 32000], ["ITC Hotels Luxury Stay", 40000],
  ["Marriott Bonvoy 3-Night Package", 60000], ["Club Mahindra Resort Stay", 45000],
  ["Goa Beach Holiday Package", 26000], ["Kerala Backwaters Package", 30000], ["Rajasthan Heritage Tour", 38000],
  ["Andaman Island Getaway", 48000], ["Ladakh Adventure Package", 42000], ["Dubai City Break (3N)", 70000],
  ["Bali Honeymoon Package", 85000], ["Singapore Family Package", 78000], ["Thailand Explorer Package", 60000],
  ["Maldives Overwater Villa (2N)", 95000], ["Shimla-Manali Volvo Tour", 20000], ["Rishikesh River Rafting Experience", 8000],
  ["Jaipur Hot Air Balloon Ride", 15000], ["Scuba Diving Experience (Goa)", 12000], ["Airport Lounge Access (6 visits)", 8000],
  ["Zoomcar Weekend Rental", 10000], ["Self-Drive Car Rental (3 days)", 16000], ["Airport Cab Voucher ₹2,000", 8000],
  ["IRCTC Rail Travel Voucher ₹3,000", 12000], ["Forex Card Load ₹10,000", 40000], ["Travel Insurance (1 year)", 6000],
  ["Priority Pass Membership", 28000], ["Cordelia Cruise Getaway (2N)", 72000],
], (name) => `Redeem your points for ${name.replace(/\s*\(.*\)$/, "")} — a real travel reward, pre-priced in points and ready to book.`);

/* ---- bulk gift cards ---- */
const GC_BULK = rows("gcx", [
  ["Uber Rides ₹1,000", 4200, 1000], ["Ola Cabs ₹500", 2100, 500], ["Nykaa Gift Card ₹2,000", 8500, 2000],
  ["Croma Gift Card ₹5,000", 21000, 5000], ["Reliance Digital ₹3,000", 12500, 3000], ["Shoppers Stop ₹2,000", 8600, 2000],
  ["Lifestyle Gift Card ₹1,500", 6400, 1500], ["Decathlon Gift Card ₹1,000", 4300, 1000], ["IKEA Gift Card ₹2,500", 10600, 2500],
  ["Starbucks Card ₹500", 2200, 500], ["Domino's Pizza ₹500", 2200, 500], ["McDonald's Voucher ₹500", 2200, 500],
  ["Pizza Hut ₹750", 3200, 750], ["KFC Voucher ₹500", 2200, 500], ["Tanishq Jewellery ₹5,000", 20500, 5000],
  ["Titan Watches ₹3,000", 12600, 3000], ["Lenskart Gift Card ₹1,000", 4200, 1000], ["PVR Cinemas ₹1,000", 8000, 1000],
  ["INOX Movie Voucher ₹500", 4000, 500], ["Apple Gift Card ₹5,000", 21500, 5000], ["Google Play ₹1,000", 4300, 1000],
  ["Spotify Premium 6 Months", 4000, 600], ["Netflix Subscription ₹1,000", 4400, 1000], ["Amazon Prime 1 Year", 6000, 1500],
  ["BigBasket Grocery ₹1,000", 4300, 1000], ["Blinkit Grocery ₹500", 2200, 500], ["H&M Gift Card ₹2,000", 8500, 2000],
  ["Zara Gift Card ₹3,000", 12800, 3000], ["Ajio Fashion ₹1,500", 6400, 1500], ["FirstCry Kids ₹1,000", 4300, 1000],
  ["MakeMyTrip Voucher ₹2,000", 8000, 2000], ["Cleartrip Voucher ₹1,500", 6200, 1500], ["Cult.fit Membership ₹2,000", 8500, 2000],
  ["BookMyShow Voucher ₹1,000", 8000, 1000], ["Amazon Gift Card ₹5,000", 20000, 5000], ["Flipkart Gift Card ₹3,000", 12000, 3000],
  ["Myntra Gift Card ₹2,500", 10500, 2500], ["Zomato Gold ₹1,000", 4400, 1000], ["Swiggy One ₹1,000", 4400, 1000],
  ["Taj Experiences ₹5,000", 16500, 5000], ["Westside Gift Card ₹1,500", 6400, 1500], ["Pantaloons ₹1,000", 4300, 1000],
  ["MamaEarth ₹800", 3400, 800], ["The Body Shop ₹1,000", 4300, 1000],
], (name) => `A ${name.replace(/\s*₹.*$/, "").replace(/\s*\d+\s*(Months|Year)$/i, "").trim()} e-gift card, delivered instantly to your inbox and ready to spend.`);

/* ---- bulk cashback (auto-generated: destinations × amounts) ---- */
const CB_DESTS = [
  ["to Amazon Pay balance", 0.26], ["to Paytm Wallet", 0.255], ["to PhonePe Wallet", 0.255],
  ["to fuel wallet", 0.25], ["as EMI statement credit", 0.27],
];
const CB_AMTS = [250, 750, 1250, 1500, 2000, 3000, 4000, 6000, 7500];
const CB_BULK = rows("cbx",
  CB_DESTS.flatMap(([dest, ratio]) =>
    CB_AMTS.map((amt) => [`₹${amt.toLocaleString("en-IN")} ${dest}`, Math.round(amt / ratio), amt])),
  (name) => `${name.replace(/^₹[\d,]+\s*/, "₹" )} — credited directly, no minimum spend, no expiry.`);

/* ---- bulk merchandise ---- */
const MD_BULK = rows("mdx", [
  ["13-Piece Wooden Handle Grilling Set", 5830], ["Captain's Boat Bag - Navy", 5270], ["Samsung Galaxy Buds2 Pro", 22000],
  ["boAt Airdopes 141", 3500], ["JBL Flip 6 Speaker", 12000], ["Amazon Echo Dot (5th Gen)", 5500],
  ["Fire TV Stick 4K", 4800], ["Mi Smart Band 8", 3500], ["Noise ColorFit Pro Smartwatch", 4500],
  ["Apple Watch SE", 34000], ["Fitbit Charge 6", 18000], ["Kindle Paperwhite", 16000],
  ["iPad 10th Gen", 55000], ["Samsung 43\" 4K Smart TV", 48000], ["LG 32\" HD TV", 22000],
  ["HP Pavilion Laptop", 78000], ["Logitech MX Master 3S Mouse", 12000], ["Canon PIXMA Printer", 14000],
  ["GoPro HERO12", 45000], ["DJI Osmo Mobile 6", 16000], ["Anker Power Bank 20000mAh", 5500],
  ["Nespresso Coffee Machine", 30000], ["Instant Pot Duo 6L", 16000], ["Kaff Built-in Microwave Oven", 24000],
  ["Bajaj Mixer Grinder", 6500], ["Havells Ceiling Fan", 5000], ["Eureka Forbes Water Purifier", 22000],
  ["Milton Thermosteel Flask Set", 3200], ["Borosil Glass Storage Set", 4200], ["Wonderchef Cookware Set", 9500],
  ["Philips Steam Iron", 4500], ["Kent Air Purifier", 20000], ["Usha Room Heater", 6000],
  ["Symphony Air Cooler", 14000], ["Dyson Supersonic Hair Dryer", 60000], ["Philips Trimmer BT3211", 3500],
  ["Braun Series 5 Shaver", 15000], ["Fossil Analog Watch", 18000], ["Ray-Ban Aviator Sunglasses", 20000],
  ["American Tourister Trolley Bag", 16000], ["Skybags Backpack", 5500], ["Yoga Mat & Fitness Kit", 3200],
  ["Cosco Basketball", 2500], ["Nike Running Shoes", 24000], ["Adidas Duffel Bag", 6500],
  ["Prestige Induction Cooktop", 7500], ["Pigeon Non-stick Tawa", 2200],
], (name) => `${name} — a real product from the CredArt rewards store, yours to redeem with points and shipped to your door.`);

export const CATALOGUE = {
  travel:      [...TRAVEL_CURATED, ...TRAVEL_BULK],
  giftcards:   [...GC_CURATED, ...GC_BULK],
  cashback:    [...CB_CURATED, ...CB_BULK],
  merchandise: [...MD_CURATED, ...MD_BULK],
};

/* Flat list with the owning category attached — used by search + the engine. */
export const ALL_ITEMS = CATEGORY_META.flatMap((c) =>
  CATALOGUE[c.key].map((it) => ({ ...it, category: c.key, categoryLabel: c.label, image: imgFor(it.slug) }))
);

export const itemById = (id) => ALL_ITEMS.find((i) => i.id === id) || null;

/* ------------------------------------------------------------------ */
/* Personas (points are hardcoded for the store — independent of bank). */
/* Keyed by the SAME user ids as api.js so the persona switch stays in   */
/* sync with the rest of the app (setActiveUser also flips /chat).       */
/* ------------------------------------------------------------------ */
const RIYA = USERS[0].id;   // travel-leaning
const SAMYAK = USERS[1].id; // dining-leaning

export const CAT_PERSONAS = {
  [RIYA]: {
    id: RIYA, name: "Riya Sharma", short: "Riya", points: 84500, lean: "travel", emoji: "✈️",
    pickId: "tv-indigo",
    greeting:
      "Hi Riya! ✈️ You have 84,500 points. Based on your travel preferences, I'd suggest the IndiGo Flight Voucher at 32,000 points — perfect for a BLR-GOA getaway. Want to know more, or is there something else on your mind?",
    /* CMR fallback — mirrors the seeded backend profile (migration 0012) so the
       checkout can personalize even when the backend is offline. When the
       backend IS up, the live GET /cmr/{user_id} response overrides this. */
    cmr: {
      addressLabel: "Home",
      address: "12 Marine Drive, Churchgate",
      city: "Mumbai", state: "Maharashtra", pincode: "400020",
      familySize: 1,
      prefs: ["Prefers IndiGo", "Travel-first profile"],
    },
  },
  [SAMYAK]: {
    id: SAMYAK, name: "Samyak Rao", short: "Samyak", points: 50000, lean: "dining", emoji: "🍽️",
    pickId: "gc-taj",
    greeting:
      "Hi Samyak! 🍽️ You have 50,000 points. Based on your dining preferences, the Taj Dining Voucher at 10,000 points would be a great pick — a premium dining experience for two. Interested, or shall I help you find something else?",
    cmr: {
      addressLabel: "Home",
      address: "221, 100 Feet Road, Indiranagar",
      city: "Bengaluru", state: "Karnataka", pincode: "560038",
      familySize: 2,
      prefs: ["North Indian & Italian cuisine", "Books for two"],
    },
  },
};

export const personaFor = (id) => CAT_PERSONAS[id] || CAT_PERSONAS[RIYA];

/* Greeting with the LIVE balance patched in — after a redemption the seeded
   "You have 84,500 points" would be stale, and the old concierge never lied
   about a number. */
export const greetingFor = (persona, balance) =>
  persona.greeting.replace(/You have [\d,]+ points/, `You have ${fmt(balance)} points`);

/* Quick-reply chips shown under the greeting. */
export const CHAT_CHIPS = [
  "Tell me more",
  "Show me travel options",
  "What's in merchandise?",
  "Best value for my points",
  "I'm planning a trip",
];

/* ------------------------------------------------------------------ */
/* Local intent engine — aligned with the original bank concierge        */
/* (dialogue_manager.py). Same interaction character:                    */
/*   · ONE question at a time (slot-filling: destination → dates),       */
/*     never a form, never assuming a value the user didn't give        */
/*   · clarify gate: a vague opener gets one clarifying question —       */
/*     UNLESS the persona has a clear preference lean, in which case     */
/*     we lead straight into that category with a "your profile leans    */
/*     toward X, so I started there" preface + switch chips              */
/*   · tap-to-answer chips on every follow-up question                   */
/*   · CMR prefill notes ("I've planned for 2 — your usual party size")  */
/*   · budget honesty: recommendations are checked against the user's    */
/*     SPENDABLE points (balance − cart) BEFORE they try to redeem,      */
/*     with over-budget items flagged up front                           */
/*                                                                       */
/* Returns { reply, items, chips, flow }. `flow` carries the dialogue     */
/* state ({ journey, slot, data }); transient — never assumed across     */
/* unrelated asks.                                                        */
/* ------------------------------------------------------------------ */
const has = (t, ...words) => words.some((w) => t.includes(w));

function topByValue(items, n) {
  return [...items]
    .filter((i) => i.value)
    .sort((a, b) => b.value / b.points - a.value / a.points)
    .slice(0, n);
}

/* Budget helpers: affordable items lead, over-budget ones are flagged. */
const orderByBudget = (items, budget) => {
  const list = items.filter(Boolean);
  return [...list.filter((i) => i.points <= budget), ...list.filter((i) => i.points > budget)];
};
function budgetNote(items, budget) {
  const over = items.filter(Boolean).filter((i) => i.points > budget);
  if (!over.length) return "";
  if (over.length === 1)
    return ` One heads-up: the ${over[0].name} is ${fmt(over[0].points - budget)} pts beyond what you can spend right now, so I've marked it.`;
  return ` Heads-up: ${over.map((o) => o.name).join(" and ")} sit beyond your spendable points right now, so I've marked them.`;
}

/* Category-lean recommendations for the personalization-forward opener. */
function leanRecs(persona) {
  return persona.lean === "travel"
    ? { emoji: "✈️", word: "travel", ids: ["tv-indigo", "tv-marriott", "tv-lounge"],
        switchChips: ["Gift cards instead", "Cashback instead", "What's in merchandise?"] }
    : { emoji: "🍽️", word: "dining", ids: ["gc-taj", "gc-zomato", "gc-swiggy"],
        switchChips: ["Show me travel options", "Cashback instead", "What's in merchandise?"] };
}

export function runConcierge(rawMessage, ctx) {
  const { persona, balance, cartTotal = 0, flow } = ctx;
  const budget = Math.max(0, balance - cartTotal); // spendable right now
  const t = (rawMessage || "").toLowerCase().trim();
  const pick = itemById(persona.pickId);
  const inCartNote = cartTotal > 0 ? ` (you have ${fmt(cartTotal)} pts reserved in your cart)` : "";

  /* ---------- active journey: trip slot-filling, one question at a time ---------- */
  if (flow && flow.journey === "trip") {
    if (flow.slot === "destination") {
      // user dodged the question → re-ask the SAME slot once, with suggestions
      if (has(t, "somewhere else", "not sure", "don't know", "dont know", "anywhere")) {
        return {
          reply: "No problem — tell me a city or region you're dreaming of, or pick one of these:",
          items: [], chips: ["Goa", "Manali", "Dubai"],
          flow: { journey: "trip", slot: "destination" },
        };
      }
      const dest = rawMessage.trim();
      return {
        reply: `${dest} sounds wonderful! And when are you thinking of going?`,
        items: [], chips: ["This weekend", "Next month", "During the holidays", "Not sure yet"],
        flow: { journey: "trip", slot: "dates", data: { dest } },
      };
    }
    if (flow.slot === "dates") {
      const dest = (flow.data && flow.data.dest) || "your getaway";
      const dt = t.includes("not sure") ? "whenever you're ready" : rawMessage.trim().toLowerCase();
      let ids;
      const d = dest.toLowerCase();
      if (d.includes("goa")) ids = ["tv-marriott", "tv-indigo", "tv-lounge"];
      else if (d.includes("manali") || d.includes("shimla")) ids = ["tv-manali", "tv-indigo", "tv-lounge"];
      else if (d.includes("dubai") || d.includes("abroad") || d.includes("international")) ids = ["tv-ai-biz", "tv-lounge", "tv-indigo"];
      else ids = ["tv-indigo", "tv-marriott", "tv-lounge"];
      const items = orderByBudget(ids.map(itemById), budget);
      const fam = (persona.cmr && persona.cmr.familySize) || 1;
      const famNote = fam > 1 ? `I've planned for ${fam} — your usual party size from your profile. ` : "";
      return {
        reply: `Perfect — ${dest}, ${dt}. ${famNote}Here's how I'd put your ${fmt(budget)} spendable points to work; every figure is pre-verified:${budgetNote(items, budget)}`,
        items,
        chips: ["Best value for my points", "Show me travel options"],
        flow: null,
      };
    }
  }

  /* ---------- "tell me more" about the proactive pick ---------- */
  if (has(t, "tell me more", "more about", "know more", "the pick", "your suggestion") ||
      (t === "yes" || t === "yes please" || t === "sure")) {
    const affordable = pick.points <= budget;
    return {
      reply: affordable
        ? `Great choice! The ${pick.name} costs ${fmtPts(pick.points)}. ${pick.desc} With ${fmt(budget)} spendable points${inCartNote}, it's well within reach. Add it to your cart, or shall we explore other options?`
        : `The ${pick.name} costs ${fmtPts(pick.points)} — that's ${fmt(pick.points - budget)} pts more than you can spend right now${inCartNote}. Want me to suggest something closer to budget instead?`,
      items: [pick],
      chips: affordable
        ? ["Show me travel options", "Best value for my points", "What's in merchandise?"]
        : ["Best value for my points", "Show me travel options", "What's in merchandise?"],
      flow: null,
    };
  }

  /* ---------- start the trip journey (slot 1: destination) ---------- */
  if (has(t, "planning a trip", "plan a trip", "planning trip", "going on a trip", "book a trip", "plan my trip")) {
    return {
      reply: "Exciting! Where are you headed?",
      items: [],
      chips: ["Goa", "Manali", "Dubai", "Somewhere else"],
      flow: { journey: "trip", slot: "destination" },
    };
  }

  /* ---------- category browses (budget-ordered + flagged) ---------- */
  if (has(t, "travel", "flight", "trip", "getaway", "vacation", "holiday", "hotel", "stay", "lounge")) {
    const items = orderByBudget([itemById("tv-indigo"), itemById("tv-marriott"), itemById("tv-itc")], budget);
    return {
      reply: `Here are your top travel redemptions — I've led with the ones that fit your ${fmt(budget)} spendable points:${budgetNote(items, budget)}`,
      items, chips: ["I'm planning a trip", "Best value for my points"], flow: null,
    };
  }
  if (has(t, "merchandise", "gadget", "product", "electronics", "headphone", "camera", "appliance", "home")) {
    const items = orderByBudget([itemById("md-sony"), itemById("md-airpods"), itemById("md-airfryer")], budget);
    return {
      reply: `Popular merchandise picks — real products, priced in points:${budgetNote(items, budget)}`,
      items, chips: ["Best value for my points", "Show me travel options"], flow: null,
    };
  }
  if (has(t, "gift card", "gift cards", "voucher", "amazon", "flipkart", "zomato", "swiggy", "myntra", "dining", "food")) {
    const items = orderByBudget([itemById("gc-taj"), itemById("gc-amazon"), itemById("gc-zomato")], budget);
    return {
      reply: `Instant e-vouchers, straight to your inbox:${budgetNote(items, budget)}`,
      items, chips: ["Best value for my points", "What's in merchandise?"], flow: null,
    };
  }
  if (has(t, "cashback", "cash back", "statement credit", "money back")) {
    const items = orderByBudget([itemById("cb-10000"), itemById("cb-5000"), itemById("cb-2500")], budget);
    return {
      reply: `Prefer cash? These credit straight to your account — higher tiers give a little more per point:${budgetNote(items, budget)}`,
      items, chips: ["Best value for my points", "Show me travel options"], flow: null,
    };
  }

  /* ---------- best value (rupee per point) ---------- */
  if (has(t, "best value", "value for my points", "most value", "worth", "bang for")) {
    const best = orderByBudget(topByValue([...CATALOGUE.giftcards, ...CATALOGUE.cashback], 3).map((i) => itemById(i.id)), budget);
    return {
      reply: `Pound for pound, these give you the most rupee value per point:${budgetNote(best, budget)}`,
      items: best, chips: ["Show me travel options", "What's in merchandise?"], flow: null,
    };
  }

  /* ---------- points balance check ---------- */
  if (has(t, "how many points", "my points", "balance", "points do i")) {
    return {
      reply: cartTotal > 0
        ? `You have ${fmt(balance)} points, with ${fmt(cartTotal)} pts reserved in your cart — so ${fmt(budget)} pts spendable right now. Want me to find the smartest way to use them?`
        : `You currently have ${fmt(balance)} points to spend. Want me to find the smartest way to use them?`,
      items: [], chips: ["Best value for my points", "Show me travel options", "What's in merchandise?"], flow: null,
    };
  }

  /* ---------- vague opener → personalization-forward (the old bot's
     signature move): a clear profile lean skips the clarify question and
     leads straight into that category, with switch chips to re-route. ---------- */
  if (/spend|use (my )?points|what should i|suggest|recommend|ideas|help me|not sure|surprise me|best way/.test(t)) {
    const lean = leanRecs(persona);
    const items = orderByBudget(lean.ids.map(itemById), budget);
    return {
      reply: `Since your profile leans toward ${lean.word} ${lean.emoji}, I started there — these fit your ${fmt(budget)} spendable points:${budgetNote(items, budget)} Want a different lane? Just tap below.`,
      items,
      chips: lean.switchChips,
      flow: null,
    };
  }

  /* ---------- no local match: try the backend, else the clarify question
     (the old bot's one-question gate before any recommendation). ---------- */
  return {
    reply: null, // null → bubble attempts backend /chat, else uses fallbackReply
    fallbackReply:
      "Happy to help you spend those points well — are you thinking travel, gift cards, cashback, or merchandise?",
    items: [],
    chips: ["Show me travel options", "Gift cards", "Cashback", "What's in merchandise?"],
    flow: flow || null,
  };
}
