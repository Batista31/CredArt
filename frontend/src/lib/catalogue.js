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

/* ------------------------------------------------------------------ */
/* Reward imagery — a photo that ACTUALLY matches the reward.           */
/*                                                                      */
/* The old store used picsum seeded by slug: stable, but a random photo */
/* (a camera reward could show a landscape). Instead we classify each   */
/* reward to a topical keyword and pull a matching photo from a         */
/* keyword-based image host, deterministically (a `lock` derived from   */
/* the slug → the same photo every render). If that host is ever        */
/* unreachable, the <img onError> falls back to `imgFallback`.          */
/* ------------------------------------------------------------------ */
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
};

/* Map a reward name (+ its category) to a topical image search keyword.
   Ordered most-specific first; a category default catches the rest. */
export function imageKeyword(name, category) {
  const n = (name || "").toLowerCase();
  const t = (...w) => w.some((x) => n.includes(x));

  /* ---- travel: destinations & experiences first, then stays/flights ---- */
  if (t("maldives")) return "maldives";
  if (t("bali")) return "bali";
  if (t("dubai")) return "dubai";
  if (t("goa")) return "beach";
  if (t("andaman", "island")) return "island";
  if (t("kerala", "backwater")) return "backwaters";
  if (t("manali", "shimla", "ladakh", "himalaya", "mountain")) return "himalayas";
  if (t("rishikesh", "rafting")) return "rafting";
  if (t("rajasthan", "heritage", "jaipur", "palace")) return "rajasthan";
  if (t("balloon")) return "balloon";
  if (t("scuba", "diving")) return "scuba";
  if (t("cruise", "cordelia")) return "cruise";
  if (t("lounge", "priority pass")) return "airport";
  if (t("forex", "currency")) return "currency";
  if (t("irctc", "rail", "train")) return "train";
  if (t("car rental", "self-drive", "zoomcar", "roadtrip", "road-trip")) return "roadtrip";
  if (t("cab")) return "taxi";
  if (t("insurance")) return "passport";
  if (t("itc grand chola")) return "finedining";
  if (t("hotel", "resort", "suite", "stay", "night", "marriott", "taj hotel", "oberoi",
        "hyatt", "radisson", "novotel", "leela", "oyo", "mahindra", "airbnb", "bonvoy",
        "itc hotel", "townhouse")) return "hotel";
  if (t("flight", "airline", "indigo", "vistara", "spicejet", "akasa", "emirates",
        "qatar", "singapore air", "lufthansa", "british airways", "thai airways",
        "airasia", "air india", "round-trip", "one-way")) return "airplane";
  if (category === "travel") return "travel";

  /* ---- gift cards: map to what the card actually buys ---- */
  if (t("zomato", "swiggy", "domino", "mcdonald", "pizza", "kfc", "starbucks", "food")) return "food";
  if (t("myntra", "ajio", "h&m", "zara", "westside", "pantaloons", "lifestyle",
        "shoppers stop", "fashion")) return "fashion";
  if (t("nykaa", "mamaearth", "body shop")) return "cosmetics";
  if (t("croma", "reliance digital", "electronics")) return "electronics";
  if (t("pvr", "inox", "bookmyshow")) return "cinema";
  if (t("netflix", "prime", "spotify", "apple gift", "google play")) return "streaming";
  if (t("tanishq", "titan", "jewel")) return "jewellery";
  if (t("lenskart")) return "eyeglasses";
  if (t("uber", "ola")) return "taxi";
  if (t("bigbasket", "blinkit", "grocery")) return "groceries";
  if (t("cult.fit", "fitness")) return "gym";
  if (t("makemytrip", "cleartrip")) return "travel";
  if (t("ikea")) return "furniture";
  if (t("decathlon")) return "sports";
  if (t("firstcry")) return "toys";
  if (t("amazon", "flipkart")) return "shopping";
  if (category === "giftcards") return "giftcard";

  /* ---- cashback ---- */
  if (category === "cashback") return "money";

  /* ---- merchandise: product type ---- */
  if (t("headphone", "airpods", "buds", "airdopes")) return "headphones";
  if (t("camera", "canon", "gopro", "dji", "pixma")) return "camera";
  if (t("vacuum", "dyson v8")) return "vacuum";
  if (t("hair dryer", "supersonic")) return "hairdryer";
  if (t("trimmer", "shaver", "iron")) return "grooming";
  if (t("coffee", "nespresso")) return "coffee";
  if (t("air fryer", "airfryer", "instant pot", "cooker", "tawa", "mixer", "cookware",
        "induction", "microwave", "oven")) return "kitchen";
  if (t("watch", "fitbit", "smartwatch", "fossil", "mi smart band", "colorfit")) return "watch";
  if (t(" tv", "television", "fire tv", "echo")) return "television";
  if (t("laptop", "ipad", "kindle", "tablet", "printer", "mouse")) return "laptop";
  if (t("speaker", "jbl")) return "speaker";
  if (t("power bank", "charger", "anker")) return "powerbank";
  if (t("sunglasses", "ray-ban")) return "sunglasses";
  if (t("shoes", "nike", "adidas running")) return "sneakers";
  if (t("trolley", "backpack", "skybags", "american tourister", "duffel", "boat bag")) return "luggage";
  if (t("purifier", "cooler", "heater", "fan")) return "appliance";
  if (t("yoga", "basketball", "sport")) return "sports";
  if (t("grill", "barbecue")) return "barbecue";
  if (t("flask", "thermos", "storage", "glass", "milton", "borosil")) return "kitchenware";
  if (category === "merchandise") return "gadget";

  return "reward";
}

/* Keyword-matched, deterministic photo for a reward. `item` may be the full
   item ({ name, slug, category }) or a bare slug string (back-compat). */
export const imgFor = (item, w = 320, h = 220) => {
  const it = typeof item === "string" ? { name: item, slug: item } : (item || {});
  const kw = imageKeyword(it.name || "", it.category || "");
  const lock = hashStr(it.slug || it.name || kw);
  return `https://loremflickr.com/${w}/${h}/${encodeURIComponent(kw)}?lock=${lock}`;
};

/* Guaranteed-up placeholder, used by <img onError> if every other source blips. */
export const imgFallback = (slug, w = 320, h = 220) =>
  `https://picsum.photos/seed/${encodeURIComponent(slug || "reward")}/${w}/${h}`;

/* ------------------------------------------------------------------ */
/* Brand LOGOS — show the real company mark (Amazon, Samsung, Philips…) */
/* on brand-named rewards instead of a stock photo. Detected from the   */
/* reward name; the logo is pulled from a favicon/logo service (real     */
/* app icons), with a second service + the keyword photo as fallbacks.   */
/* Non-brand rewards (a Goa package, cashback, a plain grilling set)     */
/* keep the topical photo. Order matters — first keyword hit wins.       */
/* ------------------------------------------------------------------ */
const BRAND_DOMAINS = [
  // Apple / Amazon families (many product lines → one brand)
  ["airpods", "apple.com"], ["macbook", "apple.com"], ["ipad", "apple.com"],
  ["iphone", "apple.com"], ["apple watch", "apple.com"], ["apple ", "apple.com"],
  ["kindle", "amazon.com"], ["fire tv", "amazon.com"], ["echo", "amazon.com"],
  ["amazon prime", "amazon.com"], ["amazon", "amazon.com"],
  // gadgets / electronics
  ["samsung", "samsung.com"], ["sony", "sony.com"], ["philips", "philips.com"],
  ["dyson", "dyson.com"], ["canon", "global.canon"], ["gopro", "gopro.com"],
  ["dji", "dji.com"], ["jbl", "jbl.com"], ["airdopes", "boat-lifestyle.com"],
  ["noise", "gonoise.com"], ["fitbit", "fitbit.com"],
  ["mi smart", "mi.com"], ["xiaomi", "mi.com"], ["logitech", "logitech.com"],
  ["anker", "anker.com"], ["nespresso", "nespresso.com"], ["instant pot", "instantpot.com"],
  ["hp pavilion", "hp.com"], ["lg ", "lg.com"], ["braun", "braun.com"],
  ["bajaj", "bajajelectricals.com"], ["havells", "havells.com"], ["usha", "usha.com"],
  ["kent", "kent.co.in"], ["symphony", "symphonylimited.com"], ["prestige", "ttkprestige.com"],
  ["wonderchef", "wonderchef.com"],
  ["borosil", "borosil.com"], ["eureka forbes", "eurekaforbes.com"],
  // fashion / lifestyle / retail
  ["nike", "nike.com"], ["adidas", "adidas.com"], ["ray-ban", "ray-ban.com"],
  ["fossil", "fossil.com"], ["american tourister", "americantourister.com"],
  ["skybags", "skybags.com"], ["myntra", "myntra.com"], ["ajio", "ajio.com"],
  ["nykaa", "nykaa.com"], ["zara", "zara.com"], ["h&m", "hm.com"],
  ["westside", "westside.com"], ["pantaloons", "pantaloons.com"], ["lifestyle", "lifestylestores.com"],
  ["shoppers stop", "shoppersstop.com"], ["mamaearth", "mamaearth.com"], ["body shop", "thebodyshop.in"],
  ["decathlon", "decathlon.in"], ["ikea", "ikea.com"], ["tanishq", "tanishq.co.in"],
  ["titan", "titan.co.in"], ["lenskart", "lenskart.com"], ["firstcry", "firstcry.com"],
  ["croma", "croma.com"], ["reliance digital", "reliancedigital.in"], ["flipkart", "flipkart.com"],
  ["bigbasket", "bigbasket.com"], ["blinkit", "blinkit.com"],
  ["paytm", "paytm.com"], ["phonepe", "phonepe.com"],
  // food / dining / entertainment
  ["zomato", "zomato.com"], ["swiggy", "swiggy.com"], ["starbucks", "starbucks.com"],
  ["domino", "dominos.co.in"], ["mcdonald", "mcdonalds.com"], ["pizza hut", "pizzahut.com"],
  ["kfc", "kfc.com"], ["netflix", "netflix.com"], ["spotify", "spotify.com"],
  ["google play", "play.google.com"], ["pvr", "pvrcinemas.com"], ["inox", "inoxmovies.com"],
  ["bookmyshow", "bookmyshow.com"], ["cult.fit", "cult.fit"], ["cult ", "cult.fit"],
  // travel / hotels / airlines
  ["indigo", "goindigo.in"], ["vistara", "airvistara.com"], ["spicejet", "spicejet.com"],
  ["air india", "airindia.com"], ["emirates", "emirates.com"],
  ["qatar", "qatarairways.com"], ["singapore air", "singaporeair.com"], ["lufthansa", "lufthansa.com"],
  ["british airways", "britishairways.com"], ["thai airways", "thaiairways.com"], ["airasia", "airasia.com"],
  ["marriott", "marriott.com"], ["oberoi", "oberoihotels.com"], ["hyatt", "hyatt.com"],
  ["radisson", "radissonhotels.com"], ["novotel", "novotel.com"], ["leela", "theleela.com"],
  ["oyo", "oyorooms.com"], ["airbnb", "airbnb.co.in"], ["club mahindra", "clubmahindra.com"],
  ["cordelia", "cordeliacruises.com"], ["zoomcar", "zoomcar.com"], ["irctc", "irctc.co.in"],
  ["makemytrip", "makemytrip.com"], ["cleartrip", "cleartrip.com"], ["taj", "tajhotels.com"],
  ["itc grand", "itchotels.com"], ["itc hotels", "itchotels.com"], ["itc ", "itchotels.com"],
  ["uber", "uber.com"],
];

const brandDomain = (name) => {
  const n = (name || "").toLowerCase();
  for (const [kw, domain] of BRAND_DOMAINS) if (n.includes(kw)) return domain;
  return null;
};
// Real logo/app-icon services (no key needed). Google's favicon service returns a
// 200 (real brand mark) for every real brand, so it's primary and flash-free;
// DuckDuckGo's crisper app icon is the enhancement/fallback.
const logoUrl = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const logoAltUrl = (domain) => `https://icons.duckduckgo.com/ip3/${domain}.ico`;

/* A number-as-image tile for cashback / EMI rewards: the ₹ amount rendered big,
   with a small label beneath ("CASHBACK", or "EMI" in gold). Inline SVG data-URI
   so it always renders with zero external dependency. */
const cashTile = (amount, label) => {
  const rupee = `₹${Number(amount || 0).toLocaleString("en-IN")}`;
  const emi = label === "EMI";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#123a68"/><stop offset="1" stop-color="#0a1f3c"/></linearGradient></defs>` +
    `<rect width="320" height="220" fill="url(#g)"/>` +
    `<text x="160" y="110" fill="#ffffff" font-family="Segoe UI,Arial,sans-serif" font-size="62" font-weight="700" text-anchor="middle" dominant-baseline="middle">${rupee}</text>` +
    `<text x="160" y="160" fill="${emi ? "#E8901E" : "rgba(255,255,255,0.6)"}" font-family="Segoe UI,Arial,sans-serif" ` +
    `font-size="${emi ? 30 : 15}" font-weight="800" letter-spacing="${emi ? 4 : 3}" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/* A random petrol-station photo (for the "fuel wallet" cashback destination). */
const fuelPhoto = (slug) => `https://loremflickr.com/320/220/gas,station?lock=${hashStr(slug || "fuel")}`;

/* Resolve the best visual for a reward:
   - cashback → a number tile (the ₹ cash returned), EMI adds an "EMI" label,
     the fuel-wallet destination gets a petrol-station photo, and wallet brands
     (Paytm / PhonePe / Amazon Pay) show their real logo;
   - any other brand-named reward → that brand's LOGO;
   - everything else → the topical keyword PHOTO.
   Returns everything the <img> needs, including the fallback chain. */
export function visualFor(item) {
  const it = typeof item === "string" ? { name: item, slug: item } : (item || {});
  const name = (it.name || "").toLowerCase();
  const photo = imgFor(it);
  const domain = brandDomain(it.name || "");

  if (it.category === "cashback") {
    if (name.includes("fuel")) {
      const p = fuelPhoto(it.slug);
      return { image: p, logo: false, logoAlt: null, photo: p, slug: it.slug };
    }
    if (domain) {  // Paytm / PhonePe / Amazon Pay wallets → brand logo
      return { image: logoUrl(domain), logo: true, logoAlt: logoAltUrl(domain), photo, slug: it.slug };
    }
    const tile = cashTile(it.value, name.includes("emi") ? "EMI" : "CASHBACK");
    return { image: tile, logo: false, logoAlt: null, photo: tile, slug: it.slug };
  }

  if (domain) {
    return { image: logoUrl(domain), logo: true, logoAlt: logoAltUrl(domain), photo, slug: it.slug };
  }
  return { image: photo, logo: false, logoAlt: null, photo, slug: it.slug };
}

/* Extra <img> style so brand LOGOS sit nicely (whole mark, centered, padded on
   white) while photos still cover the frame. */
export const rewardImgStyle = (item) =>
  item && item.logo
    ? { objectFit: "contain", background: "#fff", padding: "12%", boxSizing: "border-box" }
    : { objectFit: "cover" };

/* Shared <img onError>: walk the fallback chain (alt logo → photo → picsum),
   then hide. Pass the whole item so logos can fall back to their photo. */
export const onImgError = (item) => (e) => {
  const el = e.currentTarget;
  const it = typeof item === "string" ? { slug: item } : (item || {});
  const chain = [];
  if (it.logo && it.logoAlt) chain.push(it.logoAlt);   // second logo service
  if (it.photo) chain.push(it.photo);                  // topical keyword photo
  chain.push(imgFallback(it.slug));                    // guaranteed-up placeholder
  const i = Number(el.dataset.fb || 0);
  if (i < chain.length) {
    el.dataset.fb = String(i + 1);
    el.src = chain[i];
    // once we drop past the logo, render like a photo (fill the frame)
    if (chain[i] !== it.logoAlt) {
      el.style.objectFit = "cover"; el.style.padding = "0"; el.style.background = "";
    }
    return;
  }
  el.style.visibility = "hidden";
};

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
  (name) => `${name} — credited directly to your linked destination, with no minimum spend and no expiry.`);

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
  CATALOGUE[c.key].map((it) => {
    const base = { ...it, category: c.key, categoryLabel: c.label };
    return { ...base, ...visualFor(base) };  // attaches image, logo, logoAlt, photo
  })
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
    /* Travel-leaning persona WITH points nearing expiry — the proactive greeting
       leads with a flight voucher AND flags the expiry urgency, then offers a
       one-tap chip to act (activation strategy a). `expiringSoon` is demo data,
       same as `points`. */
    expiringSoon: 12000,
    greeting: "Hi Riya! ✈️ You have 84,500 points, and 12,000 expire soon. How can I help?",
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
    greeting: "Hi Samyak! 🍽️ You have 50,000 points. How can I help?",
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

/* Specific-product search over the merchandise catalogue, so "a camera" surfaces
   the ACTUAL camera (not a generic pick). Also used to detect a mid-conversation
   switch away from an active flow (e.g. abandoning trip-planning to shop). Words
   are distinctive enough not to collide with city/date answers. */
const PRODUCT_WORDS = [
  "camera", "headphone", "earphone", "earbud", "airpod", "laptop", "macbook",
  "tablet", "ipad", "smartwatch", "apple watch", "fitbit", "speaker", "soundbar",
  "television", "smart tv", "vacuum", "air fryer", "airfryer", "coffee", "nespresso",
  "drone", "gopro", "playstation", "xbox", "console", "kindle", "printer", "trimmer",
  "shaver", "hair dryer", "purifier", "microwave", "cooker", "mixer", "grinder",
  "air cooler", "power bank", "backpack", "trolley", "suitcase", "sneaker", "shoes",
  "sunglasses", "dyson", "watch", "tv",
];
// Whole-word match on the MESSAGE (so "tv" doesn't fire inside "Latvia"); name
// matching in findProducts stays substring-based (so "Smart TV" still matches "tv").
const productWordsIn = (t) => PRODUCT_WORDS.filter((w) => new RegExp(`\\b${w}(?:es|s)?\\b`).test(t));
function findProducts(t, budget, n = 3) {
  const words = productWordsIn(t);
  if (!words.length) return null;
  const matches = ALL_ITEMS.filter(
    (it) => it.category === "merchandise" && words.some((w) => it.name.toLowerCase().includes(w)));
  if (!matches.length) return null;
  return { words, items: orderByBudget(matches, budget).slice(0, n) };
}

/* ------------------------------------------------------------------ */
/* Full-catalogue intent search — every one of the 200+ rewards in          */
/* ALL_ITEMS is reachable, not just the handful of curated ids referenced   */
/* above by name. Each reward's "intent" is derived automatically from its  */
/* category, its topical keyword (imageKeyword already classifies every     */
/* item for photos), and its own name — so "noise cancelling headphones" or */
/* "a Bali honeymoon" surfaces the ACTUAL matching reward even though no    */
/* code path hardcoded that id. Keeping the matched word lets CredArt       */
/* explain WHY a pick surfaced, deterministically — never guessed.          */
/* ------------------------------------------------------------------ */
const STOPWORDS = new Set([
  "the", "a", "an", "for", "with", "of", "to", "and", "in", "on", "my", "your",
  "me", "want", "need", "get", "some", "best", "good", "please", "can",
  "points", "point", "pts", "reward", "rewards", "spend", "use", "buy",
]);
function tokenize(t) {
  return (t || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
function itemTags(item) {
  return [item.category, imageKeyword(item.name, item.category), ...tokenize(item.name)];
}

/* Scores every reward (optionally scoped to one category) against the
   user's words. Returns [{ item, score, matched }], best first. */
export function searchCatalogue(text, { category = null, limit = 4 } = {}) {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const pool = category ? ALL_ITEMS.filter((i) => i.category === category) : ALL_ITEMS;
  const scored = [];
  for (const item of pool) {
    const tags = itemTags(item);
    let score = 0, matched = null;
    for (const tok of tokens) {
      if (tags.includes(tok)) { score += 3; matched = matched || tok; }
      else if (tags.some((tag) => tag.length > 2 && (tag.includes(tok) || tok.includes(tag)))) {
        score += 1; matched = matched || tok;
      }
    }
    if (score > 0) scored.push({ item, score, matched });
  }
  scored.sort((a, b) => b.score - a.score || a.item.points - b.item.points);
  return scored.slice(0, limit);
}

/* Deterministic ONE-LINE "why this was recommended" explanation — never
   LLM-generated, so it's always literally true: what matched, the rupee
   value ratio if relevant, and where it stands against spendable budget. */
export function whyPick(item, budget, matched) {
  const bits = [];
  if (matched) bits.push(`matches "${matched}"`);
  if (item.value) bits.push(`${Math.round((item.value / item.points) * 100)}% value-per-point`);
  bits.push(item.points <= budget ? "within your spendable points" : `${fmt(item.points - budget)} pts over budget`);
  return bits.join(" · ");
}

/* Signals that clearly belong to a DIFFERENT intent than trip-planning — a
   product, a gift card, cashback, etc. A bare destination correction ("actually
   Dubai") deliberately does NOT match, so it stays in the trip flow. */
function switchesAwayFromTrip(t) {
  return productWordsIn(t).length > 0
    || has(t, "gift card", "gift cards", "voucher", "cashback", "cash back",
            "statement credit", "merchandise", "electronics", "gadget", "appliance");
}

export function runConcierge(rawMessage, ctx) {
  const { persona, balance, cartTotal = 0, cartCount = 0, flow } = ctx;
  const budget = Math.max(0, balance - cartTotal); // spendable right now
  const t = (rawMessage || "").toLowerCase().trim();
  const pick = itemById(persona.pickId);
  const inCartNote = cartTotal > 0 ? ` (you have ${fmt(cartTotal)} pts reserved in your cart)` : "";

  /* Activation strategy (b): when a leaning persona browses a lane that ISN'T
     their strength, gently point them to where their points go further — WITHOUT
     blocking the browse (their requested items are still shown and returned). The
     dining lane in this store is the gift-cards category (Taj/Zomato/Swiggy). */
  const leanLaneKey = persona.lean === "travel" ? "travel" : "giftcards";
  const laneNudge = (browsedKey) => {
    if (browsedKey === leanLaneKey) return { text: "", chip: null };
    const word = persona.lean === "travel" ? "travel" : "dining";
    const chip = persona.lean === "travel" ? "Show me travel options" : "Show dining options";
    return {
      text: ` By the way, your points tend to go further on ${word} — want me to show those instead? No rush, keep browsing here too.`,
      chip,
    };
  };
  const withNudge = (chips, nudge) =>
    (nudge.chip ? [nudge.chip, ...chips] : chips).filter((c, i, a) => c && a.indexOf(c) === i);

  /* ---------- redeem the cart straight from chat ----------
     "redeem my cart" / "checkout" / "redeem everything" opens the OTP-secured
     cart checkout. Checked FIRST so it works mid-conversation and overrides any
     active slot-filling flow. The bubble reads `action:"checkout"` and launches
     the same checkout overlay the cart's "Redeem Cart" button uses. */
  const wantsCheckout =
    has(t, "checkout", "check out", "redeem my cart", "redeem the cart", "redeem cart",
        "redeem everything", "redeem all", "redeem whatever", "redeem what's in",
        "redeem whats in", "redeem them", "redeem it all", "place order", "place the order",
        "proceed to checkout", "confirm my cart", "confirm cart", "complete redemption",
        "buy my cart", "redeem the items", "redeem my items")
    || (has(t, "redeem") && has(t, "cart"));
  if (wantsCheckout) {
    if (!cartCount) {
      return {
        reply: "Your cart's empty right now — add a reward (or ask me to suggest one) and I'll redeem it for you in one tap.",
        items: [], chips: ["Best value for my points", "Show me travel options", "What's in merchandise?"],
        flow: null,
      };
    }
    return {
      action: "checkout",
      reply: `On it! Redeeming your cart — ${cartCount} item${cartCount > 1 ? "s" : ""} for ${fmt(cartTotal)} pts. Taking you to secure OTP checkout now.`,
      items: [], chips: [], flow: null,
    };
  }

  /* ---------- active journey: trip slot-filling, one question at a time ----------
     A clear cross-intent signal (a product, gift card, cashback…) BREAKS OUT of
     the trip flow and is handled below, so the user can pivot mid-conversation
     ("actually, show me a camera") instead of it being mistaken for a destination.
     A plain city/date answer has no such signal and stays in the flow. */
  if (flow && flow.journey === "trip" && !switchesAwayFromTrip(t)) {
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

  /* ---------- start the trip journey (slot 1: destination) ----------
     Any expression of INTENT to travel opens the conversation (one question at
     a time), exactly like "plan a trip" does — so "I want to travel" converses
     instead of dumping options. Explicit BROWSE asks ("show me travel options",
     "travel options") deliberately don't match here and fall through to the
     category browse below. */
  const wantsToBrowse = has(t, "option", "show me", "browse", "what's in", "whats in", "list");
  if (!wantsToBrowse && has(t,
        "planning a trip", "plan a trip", "planning trip", "plan my trip", "book a trip",
        "going on a trip", "go on a trip", "take a trip", "want to travel", "wanna travel",
        "like to travel", "love to travel", "planning to travel", "want to go on",
        "go somewhere", "travel somewhere", "getaway", "get away", "vacation", "holiday",
        "want a trip", "i want to travel")) {
    return {
      reply: "Exciting! Where are you headed?",
      items: [],
      chips: ["Goa", "Manali", "Dubai", "Somewhere else"],
      flow: { journey: "trip", slot: "destination" },
    };
  }

  /* ---------- category browses (budget-ordered + flagged; off-lean browses get
     a gentle redirect nudge that never blocks the browse — strategy (b)) ---------- */
  if (has(t, "travel", "flight", "trip", "getaway", "vacation", "holiday", "hotel", "stay", "lounge")) {
    const found = searchCatalogue(t, { category: "travel" });
    const items = orderByBudget(found.length ? found.map((f) => f.item)
      : [itemById("tv-indigo"), itemById("tv-marriott"), itemById("tv-itc"), itemById("tv-lounge")], budget);
    const nudge = laneNudge("travel");
    const why = found.length ? ` I led with the ${items[0].name} because it ${whyPick(items[0], budget, found[0].matched)}.` : "";
    return {
      reply: `Here are your top travel redemptions — I've led with the ones that fit your ${fmt(budget)} spendable points:${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["I'm planning a trip", "Best value for my points"], nudge), flow: null,
    };
  }
  if (has(t, "merchandise", "gadget", "product", "electronics", "appliance", "home") || productWordsIn(t).length) {
    const found = findProducts(t, budget);
    const items = found ? found.items
      : orderByBudget([itemById("md-sony"), itemById("md-airpods"), itemById("md-airfryer"), itemById("md-canon")], budget);
    const nudge = laneNudge("merchandise");
    const lead = found
      ? `Good pick — here ${found.items.length > 1 ? "are the closest matches" : "is the closest match"} for a ${found.words[0]} in the store, priced in points:`
      : `Popular merchandise picks — real products, priced in points:`;
    const why = found
      ? ` I led with the ${items[0].name} because it matches "${found.words[0]}" and is ${items[0].points <= budget ? "within your spendable points" : `${fmt(items[0].points - budget)} pts over budget`}.`
      : "";
    return {
      reply: `${lead}${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Best value for my points", "Show me travel options"], nudge), flow: null,
    };
  }
  if (has(t, "gift card", "gift cards", "voucher", "amazon", "flipkart", "zomato", "swiggy", "myntra", "dining", "food")) {
    const found = searchCatalogue(t, { category: "giftcards" });
    const items = orderByBudget(found.length ? found.map((f) => f.item)
      : [itemById("gc-taj"), itemById("gc-amazon"), itemById("gc-zomato"), itemById("gc-swiggy")], budget);
    const nudge = laneNudge("giftcards");
    const why = found.length ? ` I led with the ${items[0].name} because it ${whyPick(items[0], budget, found[0].matched)}.` : "";
    return {
      reply: `Instant e-vouchers, straight to your inbox:${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Best value for my points", "What's in merchandise?"], nudge), flow: null,
    };
  }
  if (has(t, "cashback", "cash back", "statement credit", "money back")) {
    const found = searchCatalogue(t, { category: "cashback" });
    const items = orderByBudget(found.length ? found.map((f) => f.item)
      : [itemById("cb-10000"), itemById("cb-5000"), itemById("cb-2500"), itemById("cb-1000")], budget);
    const nudge = laneNudge("cashback");
    const why = found.length ? ` I led with the ${items[0].name} because it ${whyPick(items[0], budget, found[0].matched)}.` : "";
    return {
      reply: `Prefer cash? These credit straight to your account — higher tiers give a little more per point:${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Best value for my points", "Show me travel options"], nudge), flow: null,
    };
  }

  /* ---------- pure rupee-per-point optimizer (ONLY when the user explicitly
     asks to maximise rupee value — this figure is objective, not personalized). */
  if (has(t, "bang for", "per point", "most rupees", "rupee value", "highest value", "maximise value", "maximize value")) {
    const best = orderByBudget(topByValue([...CATALOGUE.giftcards, ...CATALOGUE.cashback], 3).map((i) => itemById(i.id)), budget);
    return {
      reply: `Pound for pound, these give you the most rupee value per point:${budgetNote(best, budget)}`,
      items: best, chips: ["Show me travel options", "What's in merchandise?"], flow: null,
    };
  }

  /* ---------- vague / "best" opener → personalization-forward (the old bot's
     signature move): a clear profile lean skips the clarify question and leads
     straight into that category, with switch chips to re-route. This is where
     "best value for my points" and "best way to spend my points" land — so the
     SAME ask surfaces travel for Riya and dining for Samyak (the demo's core
     personalization proof). Checked BEFORE the balance block below, since these
     phrases also contain "my points". ---------- */
  if (/spend|use (my )?points|what should i|suggest|recommend|ideas|help me|not sure|surprise me|best way|best value|value for my points|most value|worth it|worthwhile/.test(t)) {
    const lean = leanRecs(persona);
    const items = orderByBudget(lean.ids.map(itemById), budget);
    return {
      reply: `Since your profile leans toward ${lean.word} ${lean.emoji}, I started there — these fit your ${fmt(budget)} spendable points:${budgetNote(items, budget)} I led with the ${items[0].name} because it's your top ${lean.word} pick and fits your budget. Want a different lane? Just tap below.`,
      items,
      chips: lean.switchChips,
      flow: null,
    };
  }

  /* ---------- points balance check (a plain "how many points" ask) ---------- */
  if (has(t, "how many points", "my points", "balance", "points do i")) {
    return {
      reply: cartTotal > 0
        ? `You have ${fmt(balance)} points, with ${fmt(cartTotal)} pts reserved in your cart — so ${fmt(budget)} pts spendable right now. Want me to find the smartest way to use them?`
        : `You currently have ${fmt(balance)} points to spend. Want me to find the smartest way to use them?`,
      items: [], chips: ["Best value for my points", "Show me travel options", "What's in merchandise?"], flow: null,
    };
  }

  /* ---------- catch-all catalogue search: ANY reward, ANY category ----------
     Covers free text that didn't hit one of the category blocks above (e.g.
     "noise cancelling headphones", "a Bali honeymoon", "something for my
     mom's birthday") by searching every one of the 200+ rewards in ALL_ITEMS
     by name / category / topical-keyword, then explaining WHY the top pick
     surfaced — derived from the actual match + the user's real spendable
     budget, never invented. ---------- */
  const globalFound = searchCatalogue(t);
  if (globalFound.length) {
    const items = orderByBudget(globalFound.map((f) => f.item), budget);
    const top = items[0];
    const matched = (globalFound.find((f) => f.item.id === top.id) || {}).matched;
    return {
      reply: `Here's what I found for "${rawMessage.trim()}":${budgetNote(items, budget)} I led with the ${top.name} because it ${whyPick(top, budget, matched)}.`,
      items,
      chips: ["Best value for my points", "Show me travel options", "What's in merchandise?"],
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
