/* Rewards Catalogue: hardcoded, self-contained store data + a local intent
   engine the chat bubble runs over it. Points are a demo bucket, not the bank. */
import { USERS } from "./api.js";

/* Reward imagery: classify each reward to a keyword, pull a deterministic
   topical photo (slug-locked), fall back via <img onError>. */
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
    /* Cards this persona owns — card-mapped rewards only show when the user
       owns a qualifying card (mirrors the bank side, where Riya holds all
       three HDFC cards). */
    ownedCards: ["hdfc_millennia", "hdfc_regalia_gold", "hdfc_infinia"],
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
    /* Samyak holds only the entry-tier Millennia — premium-card rewards are
       hidden from his catalogue, chat recommendations, and search. */
    ownedCards: ["hdfc_millennia"],
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

/* ------------------------------------------------------------------ */
/* Voucher wallet — rewards redeemed at checkout become USABLE assets.  */
/* An airline voucher unlocks live Duffel flight booking in chat (its   */
/* points value is applied to matching fares); a dining voucher unlocks */
/* food ordering / restaurant booking (its ₹ value is the budget).      */
/* Persisted per persona in localStorage, marked used after redemption. */
/* ------------------------------------------------------------------ */
const VOUCHER_KEY = (pid) => `credart:vouchers:${pid}`;

const AIRLINE_BRANDS = [
  ["indigo", "IndiGo"], ["spicejet", "SpiceJet"], ["vistara", "Vistara"],
  ["akasa", "Akasa Air"], ["air india", "Air India"], ["emirates", "Emirates"],
  ["qatar", "Qatar Airways"], ["singapore airlines", "Singapore Airlines"],
  ["lufthansa", "Lufthansa"], ["british airways", "British Airways"],
  ["thai airways", "Thai Airways"], ["airasia", "AirAsia"],
];
const DINING_BRANDS = [
  ["zomato", "Zomato"], ["swiggy", "Swiggy"], ["taj", "Taj"],
  ["starbucks", "Starbucks"], ["domino", "Domino's"], ["mcdonald", "McDonald's"],
  ["pizza hut", "Pizza Hut"], ["kfc", "KFC"],
];
const brandIn = (name, table) => {
  const n = (name || "").toLowerCase();
  for (const [kw, label] of table) if (n.includes(kw)) return label;
  return null;
};
export const airlineOf = (name) => brandIn(name, AIRLINE_BRANDS);
export const diningBrandOf = (name) => brandIn(name, DINING_BRANDS);

export function ownedVouchers(personaId) {
  try { return JSON.parse(localStorage.getItem(VOUCHER_KEY(personaId)) || "[]"); } catch { return []; }
}
function saveVouchers(personaId, list) {
  try { localStorage.setItem(VOUCHER_KEY(personaId), JSON.stringify(list.slice(0, 30))); } catch { /* storage off */ }
}

/* Called by the store's checkout: any airline / dining voucher in the cart
   lands in the wallet (qty units → that many voucher entries). */
export function grantVouchersFromCart(personaId, cartItems) {
  const granted = [];
  for (const it of cartItems || []) {
    const airline = it.category === "travel" ? airlineOf(it.name) : null;
    const dining = it.category === "giftcards" ? diningBrandOf(it.name) : null;
    if (!airline && !dining) continue;
    for (let k = 0; k < (it.qty || 1); k++) {
      granted.push({
        id: `v${Date.now()}${Math.floor(Math.random() * 1e5)}${k}`,
        name: it.name, kind: airline ? "flight" : "dining",
        airline: airline || undefined, brand: dining || undefined,
        points: it.points, valueInr: it.value || null, usedAt: null,
      });
    }
  }
  if (granted.length) saveVouchers(personaId, [...granted, ...ownedVouchers(personaId)]);
  return granted;
}

export const unusedVouchers = (personaId, kind) =>
  ownedVouchers(personaId).filter((v) => !v.usedAt && (!kind || v.kind === kind));

export function markVoucherUsed(personaId, voucherId) {
  saveVouchers(personaId, ownedVouchers(personaId).map((v) =>
    v.id === voucherId ? { ...v, usedAt: Date.now() } : v));
}

/* ------------------------------------------------------------------ */
/* Dynamic lifestyle weighting — the store-side mirror of the bank's    */
/* update_preferences_after_redemption: every checkout nudges the       */
/* redeemed categories' weights up (+0.05) and decays the rest, so the  */
/* SAME vague ask starts leaning wherever the user actually redeems.    */
/* Seeded from the persona's static lean; persisted per persona.        */
/* ------------------------------------------------------------------ */
const WEIGHTS_KEY = (pid) => `credart:weights:${pid}`;
const LEAN_CATS = ["travel", "giftcards", "cashback", "merchandise"];

export function getLeanWeights(persona) {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY(persona.id));
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to seed */ }
  const seedTop = persona.lean === "travel" ? "travel" : "giftcards";
  return Object.fromEntries(LEAN_CATS.map((c) => [c, c === seedTop ? 0.5 : 0.5 / 3]));
}

export function bumpLeanWeights(persona, categories) {
  const w = getLeanWeights(persona);
  const hit = [...new Set((categories || []).filter((c) => LEAN_CATS.includes(c)))];
  if (!hit.length) return w;
  const delta = 0.05, decay = (delta * hit.length) / (LEAN_CATS.length - hit.length);
  for (const c of LEAN_CATS) {
    w[c] = hit.includes(c) ? Math.min(1, w[c] + delta) : Math.max(0, w[c] - decay);
  }
  try { localStorage.setItem(WEIGHTS_KEY(persona.id), JSON.stringify(w)); } catch { /* storage off */ }
  return w;
}

/* Dominant lean under the same thresholds as the bank's _dominant_lean
   (floor 0.35 + margin 0.15 over the runner-up) — a flat profile has none. */
export function dominantLean(persona) {
  const w = getLeanWeights(persona);
  const ranked = LEAN_CATS.map((c) => [c, w[c]]).sort((a, b) => b[1] - a[1]);
  const [topCat, topW] = ranked[0];
  if (topW >= 0.35 && topW - ranked[1][1] >= 0.15) return topCat;
  return persona.lean === "travel" ? "travel" : "giftcards"; // seeded fallback
}

/* ------------------------------------------------------------------ */
/* Card-mapped rewards — a reward tied to a card tier only shows for    */
/* users who OWN a qualifying card. Deterministic rule (no per-item      */
/* table to drift out of sync): 40k+ point rewards are premium-card      */
/* exclusives (Regalia Gold / Infinia). Riya owns all three cards and    */
/* sees the full catalogue; Samyak owns only Millennia, so premium       */
/* rewards are hidden from his store grid, chat recs, and search.        */
/* ------------------------------------------------------------------ */
export const CARD_LABELS = {
  hdfc_millennia: "Millennia",
  hdfc_regalia_gold: "Regalia Gold",
  hdfc_infinia: "Infinia",
};
const PREMIUM_CARDS = ["hdfc_regalia_gold", "hdfc_infinia"];
const PREMIUM_THRESHOLD = 40000;

export const requiredCards = (item) =>
  item && item.points >= PREMIUM_THRESHOLD ? PREMIUM_CARDS : null;

export const visibleTo = (item, persona) => {
  const req = requiredCards(item);
  if (!req) return true;
  const owned = (persona && persona.ownedCards) || [];
  return req.some((c) => owned.includes(c));
};

export const visibleItems = (persona, items) => (items || ALL_ITEMS).filter((i) => visibleTo(i, persona));

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

/* Local intent engine: one question at a time, persona-lean clarify gate,
   tap chips, budget honesty. Returns { reply, items, chips, flow }. */
const has = (t, ...words) => words.some((w) => t.includes(w));
/* Word-boundary variant (accepts small regex fragments like "flights?") for
   short words that hide inside others — "trip" inside "roadtrip". */
const hasWord = (t, ...words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));

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

/* Category-lean recommendations for the personalization-forward opener.
   Driven by the DYNAMIC lifestyle weights (bumped on every checkout), so a
   dining-leaning user who keeps redeeming travel drifts toward travel — the
   store-side mirror of the bank's dynamic preference learning. */
const LEAN_META = {
  travel:      { emoji: "✈️", word: "travel", ids: ["tv-indigo", "tv-marriott", "tv-lounge"],
                 switchChips: ["Gift cards instead", "Cashback instead", "What's in merchandise?"] },
  giftcards:   { emoji: "🍽️", word: "dining & gift cards", ids: ["gc-taj", "gc-zomato", "gc-swiggy"],
                 switchChips: ["Show me travel options", "Cashback instead", "What's in merchandise?"] },
  cashback:    { emoji: "💸", word: "cashback", ids: ["cb-10000", "cb-5000", "cb-2500"],
                 switchChips: ["Show me travel options", "Gift cards instead", "What's in merchandise?"] },
  merchandise: { emoji: "🛍️", word: "merchandise", ids: ["md-sony", "md-airpods", "md-airfryer"],
                 switchChips: ["Show me travel options", "Gift cards instead", "Cashback instead"] },
};
function leanRecs(persona) {
  return LEAN_META[dominantLean(persona)] || LEAN_META.travel;
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

/* Query word → catalogue name substrings ("earphones" → AirPods/Buds/Airdopes). */
const PRODUCT_SYNONYMS = {
  earphone: ["airpods", "buds", "airdopes", "earphone"],
  earbud: ["airpods", "buds", "airdopes"],
  airpod: ["airpods"],
  headphone: ["headphone", "airpods", "buds"],
  speaker: ["speaker", "echo"],
  soundbar: ["speaker"],
  camera: ["camera", "gopro", "dji", "pixma"],
  smartwatch: ["watch", "band", "colorfit", "fitbit"],
  "apple watch": ["apple watch"],
  watch: ["watch", "band", "colorfit", "fitbit"],
  television: ["tv"],
  "smart tv": ["tv"],
  tv: [" tv", "tv "],
  laptop: ["laptop", "pavilion"],
  tablet: ["ipad", "tab"],
  vacuum: ["vacuum", "dyson v8"],
  "hair dryer": ["hair dryer", "supersonic"],
  shoes: ["shoes", "running"],
  sneaker: ["shoes"],
  suitcase: ["trolley", "duffel bag", "backpack"],
  trolley: ["trolley"],
  backpack: ["backpack"],
  "power bank": ["power bank"],
  coffee: ["coffee", "nespresso"],
  cooker: ["cooker", "cooktop", "instant pot"],
};

function findProducts(t, budget, n = 3) {
  const words = productWordsIn(t);
  if (!words.length) return null;
  const needles = words.flatMap((w) => PRODUCT_SYNONYMS[w] || [w]).map((s) => s.toLowerCase());
  const matches = ALL_ITEMS.filter(
    (it) => it.category === "merchandise" && needles.some((s) => it.name.toLowerCase().includes(s)));
  if (!matches.length) return { words, items: [] }; // asked for a product we don't stock
  return { words, items: orderByBudget(matches, budget).slice(0, n) };
}

/* Occasion → relevant gear ("roadtrip" → luggage/power bank/speaker). */
const OCCASION_MERCH = [
  [/road ?trip|camping|trek|hik(e|ing)|travel|trip|vacation|holiday|getaway/, ["trolley", "backpack", "power bank", "flip 6", "sunglasses", "gopro"]],
  [/gym|workout|fitness|running|sport/, ["yoga", "shoes", "basketball", "fitbit", "band"]],
  [/kitchen|cook|baking/, ["cooker", "mixer", "air fryer", "cookware", "induction", "tawa"]],
  [/new (place|home|house|flat|apartment)|moving|shifting|unfurnished/, ["purifier", "fan", "cooker", "mixer", "iron", "microwave", "cooler"]],
];
function occasionMerch(t, budget, n = 3) {
  for (const [re, needles] of OCCASION_MERCH) {
    if (re.test(t)) {
      const items = ALL_ITEMS.filter(
        (it) => it.category === "merchandise" && needles.some((s) => it.name.toLowerCase().includes(s)));
      if (items.length) return orderByBudget(items, budget).slice(0, n);
    }
  }
  return null;
}

/* Voucher fallback: buy the exact thing, not a nearest-miss substitute. */
const voucherFallbackItems = (budget) =>
  orderByBudget([itemById("gc-amazon"), ALL_ITEMS.find((i) => i.name === "Amazon Gift Card ₹5,000"), itemById("gc-flipkart")].filter(Boolean), budget);

/* ------------------------------------------------------------------ */
/* Full-catalogue intent search — every one of the 200+ rewards in          */
/* ALL_ITEMS is reachable, not just the handful of curated ids referenced   */
/* by name in the blocks below. Each reward's "intent" is derived           */
/* automatically from its category, its topical keyword (imageKeyword       */
/* already classifies every item for photos), and its own name — so "noise  */
/* cancelling headphones" or "a Bali honeymoon" surfaces the ACTUAL         */
/* matching reward even though no code path hardcoded that id. Keeping the  */
/* matched word lets CredArt explain WHY a pick surfaced, deterministically */
/* — never guessed. Card visibility (premium-card gating) is enforced when  */
/* a persona is passed.                                                     */
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

/* Scores every reward (optionally scoped to one category, gated to the
   persona's cards) against the user's words. Returns [{ item, score,
   matched }], best first. */
export function searchCatalogue(text, { category = null, persona = null, limit = 4 } = {}) {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  let pool = category ? ALL_ITEMS.filter((i) => i.category === category) : ALL_ITEMS;
  if (persona) pool = pool.filter((i) => visibleTo(i, persona));
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

/* Menu for the voucher-gated food-ordering journey — fixed prices so budget
   honesty against the voucher's ₹ value is deterministic. Each dish carries a
   cuisine tag so the conversation can suggest one from what the user said
   they're craving, instead of dumping the whole menu immediately. */
const FOOD_MENU = [
  { key: "pizza", name: "Margherita Pizza", price: 450, cuisine: "italian" },
  { key: "biryani", name: "Hyderabadi Biryani", price: 380, cuisine: "hyderabadi" },
  { key: "sub", name: "Footlong Sub Combo", price: 350, cuisine: "american" },
  { key: "burger", name: "Classic Burger Meal", price: 320, cuisine: "american" },
  { key: "thali", name: "North Indian Thali", price: 300, cuisine: "north indian" },
  { key: "dessert", name: "Coffee & Dessert", price: 250, cuisine: "dessert" },
];
const CUISINE_CHIPS = ["North Indian", "Italian", "American", "Something light", "Surprise me"];
function _cuisineToDish(t) {
  if (has(t, "north indian", "punjabi", "thali", "roti", "curry")) return FOOD_MENU.find((m) => m.key === "thali");
  if (has(t, "italian", "pizza")) return FOOD_MENU.find((m) => m.key === "pizza");
  if (has(t, "hyderabadi", "biryani")) return FOOD_MENU.find((m) => m.key === "biryani");
  if (has(t, "american", "burger", "sub", "sandwich")) return FOOD_MENU.find((m) => m.key === "burger");
  if (has(t, "light", "dessert", "sweet", "snack")) return FOOD_MENU.find((m) => m.key === "dessert");
  return null; // "surprise me" or anything unmatched — let the item step ask directly
}

/* A meal ask ("actually, book me dinner instead") — its own signal so BOTH
   the flight and food journeys can detect a pivot INTO the other. */
function wantsFoodSwitch(t) {
  return /\b(dinner|lunch|breakfast|brunch|restaurant|table|meal)\b/.test(t)
    && has(t, "book", "order", "reserve", "get me", "want", "craving", "plan", "arrange", "set up", "make");
}

/* Signals that clearly belong to a DIFFERENT intent than trip-planning — a
   product, a gift card, cashback, food, etc. A bare destination correction
   ("actually Dubai") deliberately does NOT match, so it stays in the trip flow. */
function switchesAwayFromTrip(t) {
  return productWordsIn(t).length > 0
    || wantsFoodSwitch(t)
    || has(t, "gift card", "gift cards", "voucher", "cashback", "cash back",
            "statement credit", "merchandise", "electronics", "gadget", "appliance");
}

/* Same idea for the food-ordering journey — a clear pivot to flights, a
   product, gift cards, etc. bails out instead of being misread as a cuisine,
   party size, or dish. */
function switchesAwayFromFood(t) {
  return productWordsIn(t).length > 0
    || has(t, "gift card", "gift cards", "voucher", "cashback", "cash back",
            "statement credit", "merchandise", "electronics", "gadget", "appliance",
            "book a flight", "book flight", "fly to", "flights to", "flight ticket",
            "want to fly", "book a trip", "planning a trip", "travel", "vacation", "holiday", "hotel");
}

/* ---- FLIGHT booking flow helpers (real Duffel via the backend) ------------
   The bubble gathers context one question at a time (destination → origin →
   trip type → dates → travellers) then hands these params to the backend
   /travel/flights/search (live Duffel). Dates are resolved to ISO HERE — no
   LLM — mirroring dialogue_manager.py's _resolve_date so we never book in the
   past. City NAMES are passed straight through; the backend resolves them to
   IATA (same CITY_TO_IATA map the chat flight flow uses). */
const _iso = (d) => d.toISOString().slice(0, 10);
/* "2026-07-23" → "Thu, 23 Jul 2026" for chat replies. */
export const prettyDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

const _MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/* Explicit calendar date in free text: "23rd july", "july 23", "23/07",
   "23-07-2026". Returns ISO or null. Year defaults to the next occurrence. */
function _explicitDate(t) {
  const now = new Date();
  const mkFuture = (y, mo, d) => {
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return null;
    let year = y;
    // build a real Date only to bump the year forward if the date already passed
    if (year == null) { year = now.getFullYear(); if (new Date(year, mo, d, 23, 59) < now) year += 1; }
    // format from LOCAL components — toISOString() would shift a day in IST
    return `${year}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  // numeric: 23/07, 23-07-2026, 23.7
  let m = t.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
  if (m) {
    const d = +m[1], mo = +m[2] - 1;
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) return mkFuture(y, mo, d);
  }
  // "23rd july" / "23 jul"
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\b/);
  if (m) {
    const mo = _MONTHS.indexOf(m[2].slice(0, 3));
    if (mo >= 0) return mkFuture(null, mo, +m[1]);
  }
  // "july 23"
  m = t.match(/\b([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) {
    const mo = _MONTHS.indexOf(m[1].slice(0, 3));
    if (mo >= 0) return mkFuture(null, mo, +m[2]);
  }
  return null;
}

export function resolveDateISO(text) {
  const t = (text || "").toLowerCase().trim();
  const m = t.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const explicit = _explicitDate(t);
  if (explicit) return explicit;
  const now = new Date();
  const add = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return _iso(d); };
  // next occurrence of a weekday (0=Sun … 6=Sat), always in the future
  const nextDOW = (target) => { const d = new Date(now); const diff = ((target - d.getDay() + 7) % 7) || 7; d.setDate(d.getDate() + diff); return d; };
  if (t.includes("today")) return _iso(now);
  if (t.includes("tomorrow")) return add(1);
  if (t.includes("next weekend")) { const sat = nextDOW(6); sat.setDate(sat.getDate() + 7); return _iso(sat); }
  if (t.includes("weekend")) return _iso(nextDOW(6));
  if (t.includes("next month")) return add(30);
  if (t.includes("fortnight") || t.includes("2 week") || t.includes("two week")) return add(14);
  if (t.includes("next week")) return add(7);
  if (t.includes("holiday") || t.includes("holidays")) return add(45);
  return add(21); // sensible default a few weeks out
}

function resolveReturnISO(departIso, text) {
  const t = (text || "").toLowerCase();
  const base = new Date(departIso);
  const add = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return _iso(d); };
  // explicit return date ("back on 30th july") — must land after departure
  const explicit = _explicitDate(t);
  if (explicit && new Date(explicit) > base) return explicit;
  const m = t.match(/(\d+)\s*day/); if (m) return add(parseInt(m[1], 10));
  if (t.includes("2 week") || t.includes("two week")) return add(14);
  if (t.includes("week")) return add(7);
  if (t.includes("weekend")) return add(2);
  return add(3);
}

/* Cities the backend can resolve (mirrors CITY_TO_IATA in api/intent.py) —
   used to detect an inline destination like "fly to Goa" so we can skip a
   question, and to catch unbookable places BEFORE the live search 400s. */
const _FLIGHT_CITIES = ["goa", "delhi", "new delhi", "mumbai", "bengaluru", "bangalore",
  "dubai", "hyderabad", "chennai", "kolkata", "pune", "ahmedabad", "kochi", "jaipur",
  "singapore", "london", "abu dhabi", "bangkok", "paris", "maldives",
  "new york", "tokyo", "sydney", "hong kong", "frankfurt", "amsterdam",
  "istanbul", "doha", "colombo", "kathmandu"];
function _extractFlightCity(t) {
  for (const c of _FLIGHT_CITIES) {
    if (new RegExp(`\\b${c}\\b`).test(t)) return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  return null;
}

/* Country/region names people type as destinations ("bangalore to USA") →
   the bookable airport cities to offer instead of failing the live search. */
const _COUNTRY_HINTS = [
  ["usa", ["New York"]], ["united states", ["New York"]], ["america", ["New York"]], ["us", ["New York"]],
  ["uk", ["London"]], ["england", ["London"]], ["britain", ["London"]],
  ["uae", ["Dubai", "Abu Dhabi"]], ["japan", ["Tokyo"]], ["australia", ["Sydney"]],
  ["thailand", ["Bangkok"]], ["france", ["Paris"]], ["germany", ["Frankfurt"]],
  ["turkey", ["Istanbul"]], ["qatar", ["Doha"]], ["nepal", ["Kathmandu"]],
  ["sri lanka", ["Colombo"]], ["europe", ["London", "Paris", "Frankfurt"]],
];
function _countryHint(t) {
  for (const [c, chips] of _COUNTRY_HINTS) {
    if (new RegExp(`\\b${c}\\b`).test(t)) {
      // short names are acronyms (USA, UK, UAE) — uppercase whole, not "Usa"
      const country = c.length <= 3 ? c.toUpperCase() : c.replace(/\b\w/g, (ch) => ch.toUpperCase());
      return { country, chips };
    }
  }
  return null;
}

/* Parse a whole route from ONE message ("bangalore to USA", "BOM → Dubai") —
   both slots can arrive together, so neither should be re-asked. Returns
   { origin, dest, destHint }: origin/dest are recognised cities (or null);
   destHint is a country the user named, with bookable-city suggestions. */
function _parseRoute(t) {
  const m = t.match(/(.+?)\s+(?:to|→|->)\s+(.+)/);
  const left = m ? m[1] : null;
  let right = m ? m[2] : t;
  let origin = left ? _extractFlightCity(left) : null;
  // "fly to dubai FROM mumbai" — pull the origin out of the tail so it isn't
  // mistaken for the destination
  const fm = right.match(/(.*)\bfrom\b(.*)/);
  if (fm) {
    origin = origin || _extractFlightCity(fm[2]);
    right = fm[1];
  }
  return {
    origin,
    dest: _extractFlightCity(right),
    destHint: _countryHint(right),
  };
}

function _paxChips(persona) {
  const fam = (persona.cmr && persona.cmr.familySize) || 1;
  return [["Just me", 1], ["2", 2], ["3", 3], ["4", 4]].map(([label, n]) =>
    (fam === n ? `${label} (usual)` : label));
}
function _parsePax(t, persona) {
  if (/just me|solo|only me|myself|alone/.test(t)) return 1;
  const m = t.match(/(\d+)/); if (m) return Math.max(1, Math.min(9, parseInt(m[1], 10)));
  return (persona.cmr && persona.cmr.familySize) || 1;
}

/* Terminal step of the flight flow: package the collected slots into a search
   the bubble runs against the live Duffel endpoint. */
function _flightSearchStep(d) {
  const tripType = d.tripType || "round_trip";
  const params = {
    trip_type: tripType,
    origin: d.origin,
    destination: d.dest,
    depart_date: d.departIso,
    return_date: tripType === "one_way" ? null : d.returnIso,
    passengers: d.pax || 1,
    cabin_class: "economy",
    preferences: d.prefs || null,
  };
  const prefNote = d.prefs ? ` Noted: “${d.prefs}”.` : "";
  return {
    action: "flight_search",
    flightParams: params,
    reply: `Searching live flights for ${params.origin} → ${params.destination}` +
      `${tripType === "round_trip" ? " (round trip)" : ""}, ${params.passengers} traveller${params.passengers > 1 ? "s" : ""}…${prefNote} one moment.`,
    items: [], chips: [], flow: null,
  };
}

export function runConcierge(rawMessage, ctx) {
  const { persona, balance, cartTotal = 0, cartCount = 0, flow } = ctx;
  const budget = Math.max(0, balance - cartTotal); // spendable right now
  // Card gate: never recommend a reward this persona's cards can't redeem.
  const vis = (arr) => (arr || []).filter((i) => i && visibleTo(i, persona));
  const t = (rawMessage || "").toLowerCase().trim();
  const pick = itemById(persona.pickId);
  const inCartNote = cartTotal > 0 ? ` (you have ${fmt(cartTotal)} pts reserved in your cart)` : "";

  /* Activation strategy (b): when a leaning persona browses a lane that ISN'T
     their strength, gently point them to where their points go further — WITHOUT
     blocking the browse (their requested items are still shown and returned).
     The lean comes from the DYNAMIC weights (updated on every checkout). */
  const leanLaneKey = dominantLean(persona);
  const laneNudge = (browsedKey) => {
    if (browsedKey === leanLaneKey) return { text: "", chip: null };
    const meta = LEAN_META[leanLaneKey] || LEAN_META.travel;
    const chip = leanLaneKey === "travel" ? "Show me travel options"
      : leanLaneKey === "giftcards" ? "Show dining options"
      : leanLaneKey === "cashback" ? "Cashback instead" : "What's in merchandise?";
    return {
      text: ` By the way, your points tend to go further on ${meta.word} — want me to show those instead? No rush, keep browsing here too.`,
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

  /* Active flight journey: slot-fill one question at a time → live Duffel
     search. Both "book a flight" and "plan a trip" enter here. A cross-intent
     signal (product/gift card/cashback) breaks out mid-flow. */
  if (flow && flow.journey === "flight" && !switchesAwayFromTrip(t)) {
    const d = flow.data || {};
    if (flow.slot === "destination") {
      // user dodged the question → re-ask the SAME slot once, with suggestions
      if (has(t, "somewhere else", "not sure", "don't know", "dont know", "anywhere")) {
        return {
          reply: "No problem — tell me a city or region you're dreaming of, or pick one of these:",
          items: [], chips: ["Goa", "Jaipur", "Dubai"],
          flow: { journey: "flight", slot: "destination", data: d },
        };
      }
      // the answer may carry the WHOLE route ("bangalore to USA") — fill both
      // slots and never re-ask one the user already gave
      const r = _parseRoute(t);
      const origin = r.origin || d.origin || null;
      if (!r.dest && r.destHint) {
        return {
          reply: `${r.destHint.country} is a big place — I can search live fares to ${r.destHint.chips.join(", ")}. Which city?`,
          items: [], chips: r.destHint.chips,
          flow: { journey: "flight", slot: "destination", data: { ...d, ...(origin ? { origin } : {}) } },
        };
      }
      if (!r.dest) {
        // unbookable/unknown place — catch it HERE instead of letting the live
        // search 400 with "unrecognized origin/destination"
        return {
          reply: `I couldn't match “${rawMessage.trim()}” to an airport I can search live yet. Pick one of these, or name another major city:`,
          items: [], chips: ["Goa", "Jaipur", "Dubai", "New York"],
          flow: { journey: "flight", slot: "destination", data: { ...d, ...(origin ? { origin } : {}) } },
        };
      }
      if (origin) {
        return {
          reply: `Got it — ${origin} to ${r.dest}. Round trip or one way?`,
          items: [], chips: ["Round trip", "One way"],
          flow: { journey: "flight", slot: "trip_type", data: { ...d, origin, dest: r.dest } },
        };
      }
      return {
        reply: `${r.dest} — great pick. Which city are you flying from?`,
        items: [], chips: [(persona.cmr && persona.cmr.city) || "Mumbai", "Bengaluru", "Delhi"],
        flow: { journey: "flight", slot: "origin", data: { ...d, dest: r.dest } },
      };
    }
    if (flow.slot === "origin") {
      const origin = _extractFlightCity(t);
      if (!origin) {
        return {
          reply: `I couldn't match “${rawMessage.trim()}” to an airport I can search from. Pick one, or name another major city:`,
          items: [], chips: [(persona.cmr && persona.cmr.city) || "Mumbai", "Bengaluru", "Delhi"],
          flow: { journey: "flight", slot: "origin", data: d },
        };
      }
      return {
        reply: `Got it — ${origin} to ${d.dest}. Round trip or one way?`,
        items: [], chips: ["Round trip", "One way"],
        flow: { journey: "flight", slot: "trip_type", data: { ...d, origin } },
      };
    }
    if (flow.slot === "trip_type") {
      const tripType = has(t, "one way", "oneway", "single", "one-way") ? "one_way" : "round_trip";
      return {
        reply: "When do you want to depart?",
        items: [], chips: ["This weekend", "Next weekend", "Next month"],
        flow: { journey: "flight", slot: "depart", data: { ...d, tripType } },
      };
    }
    if (flow.slot === "depart") {
      const departIso = resolveDateISO(rawMessage);
      if (d.tripType === "one_way") {
        return {
          reply: `Leaving ${prettyDate(departIso)}. How many travellers?`,
          items: [], chips: _paxChips(persona),
          flow: { journey: "flight", slot: "pax", data: { ...d, departIso } },
        };
      }
      return {
        reply: `Leaving ${prettyDate(departIso)}. And when do you fly back?`,
        items: [], chips: ["3 days later", "A week later", "2 weeks later"],
        flow: { journey: "flight", slot: "return", data: { ...d, departIso } },
      };
    }
    if (flow.slot === "return") {
      const returnIso = resolveReturnISO(d.departIso, rawMessage);
      return {
        reply: `Returning ${prettyDate(returnIso)}. How many travellers?`,
        items: [], chips: _paxChips(persona),
        flow: { journey: "flight", slot: "pax", data: { ...d, returnIso } },
      };
    }
    if (flow.slot === "pax") {
      return {
        reply: "Last thing — any specific requests? Preferred airline, non-stop only, morning departure, a bag… or just say “find the best”.",
        items: [], chips: ["Find the best", "Non-stop only", "Morning flights"],
        flow: { journey: "flight", slot: "prefs", data: { ...d, pax: _parsePax(t, persona) } },
      };
    }
    if (flow.slot === "prefs") {
      const prefs = /\b(?:find the best|none|nothing|nope|anything|no preference|whatever)\b|^(?:no|any)$/.test(t) ? null : rawMessage.trim();
      return _flightSearchStep({ ...d, prefs });
    }
  }

  /* ---------- active journey: FOOD ordering / table booking (conversational) --
     One question at a time — cuisine → party size → suggested dish → confirm
     — same character as the flight flow above. The dining-voucher requirement
     and budget honesty (against the voucher's ₹ value) are only checked at the
     CONFIRM step, so CredArt talks through the whole plan first instead of
     stonewalling the ask with "you need a voucher" as the very first reply. */
  if (flow && flow.journey === "food" && !switchesAwayFromFood(t)) {
    const d = flow.data || {};

    if (flow.slot === "cuisine") {
      const dish = _cuisineToDish(t);
      return {
        reply: "Got it. How many people is this for?",
        items: [], chips: ["Just me", "2", "3", "4"],
        flow: { journey: "food", slot: "party", data: { ...d, cuisine: rawMessage.trim(), suggestedKey: dish ? dish.key : null } },
      };
    }

    if (flow.slot === "party") {
      const party = has(t, "just me", "solo", "only me", "myself") ? 1
        : Math.max(1, Math.min(12, parseInt((t.match(/\d+/) || ["1"])[0], 10)));
      const suggested = FOOD_MENU.find((m) => m.key === d.suggestedKey);
      if (suggested) {
        const total = suggested.price * party;
        return {
          reply: `For ${party}, I'd suggest the ${suggested.name} — ₹${suggested.price} each, ₹${total.toLocaleString("en-IN")} total. Shall I place the order?`,
          items: [], chips: ["Yes, order it", "Show other options"],
          flow: { journey: "food", slot: "confirm", data: { ...d, party, item: suggested } },
        };
      }
      return {
        reply: "Here's the menu — what would you like?",
        items: [], chips: FOOD_MENU.map((m) => m.name),
        flow: { journey: "food", slot: "item", data: { ...d, party } },
      };
    }

    if (flow.slot === "item") {
      const pick = FOOD_MENU.find((m) => t.includes(m.key) || t.includes(m.name.toLowerCase()));
      if (!pick) {
        return { reply: "Pick something from the menu and I'll confirm it with you:",
          items: [], chips: FOOD_MENU.map((m) => m.name),
          flow: { journey: "food", slot: "item", data: d } };
      }
      const total = pick.price * (d.party || 1);
      return {
        reply: `${pick.name} for ${d.party || 1} — ₹${pick.price} each, ₹${total.toLocaleString("en-IN")} total. Shall I place the order?`,
        items: [], chips: ["Yes, order it", "Show other options"],
        flow: { journey: "food", slot: "confirm", data: { ...d, item: pick } },
      };
    }

    if (flow.slot === "confirm") {
      if (has(t, "other option", "show other", "something else", "change", "different")) {
        return {
          reply: "No problem — here's the full menu:",
          items: [], chips: FOOD_MENU.map((m) => m.name),
          flow: { journey: "food", slot: "item", data: d },
        };
      }
      // Require an explicit yes — anything ambiguous re-asks instead of
      // silently placing the order (a stray reply should never book food).
      const saysYes = has(t, "yes", "order it", "place it", "confirm", "go ahead", "do it", "sounds good", "perfect", "sure", "ok", "okay");
      if (!saysYes) {
        const qty = d.party || 1;
        return {
          reply: `Just to confirm — ${qty} × ${d.item.name} for ₹${(d.item.price * qty).toLocaleString("en-IN")}. Shall I place the order?`,
          items: [], chips: ["Yes, order it", "Show other options"],
          flow: { journey: "food", slot: "confirm", data: d },
        };
      }
      // Confirming is where the dining-voucher requirement and budget honesty
      // (against the voucher's ₹ value) come in — the plan is already agreed,
      // now CredArt sorts out how to pay for it, exactly like a real concierge.
      const dining = unusedVouchers(persona.id, "dining");
      const qty = d.party || 1;
      const total = d.item.price * qty;
      if (!dining.length) {
        return {
          reply: `Everything's set — ${qty} × ${d.item.name} (₹${total.toLocaleString("en-IN")}). I just need a dining voucher to redeem it against — grab one here and say “yes, order it” again and I'll finish up:`,
          items: orderByBudget(vis([itemById("gc-zomato"), itemById("gc-swiggy"), itemById("gc-taj")]), budget),
          chips: ["Show dining options"],
          flow: { journey: "food", slot: "confirm", data: d },
        };
      }
      const voucher = dining[0];
      const cap = voucher.valueInr || Math.round(voucher.points / 4);
      if (total > cap) {
        return {
          reply: `Heads-up before you commit: ${qty} × ${d.item.name} comes to ₹${total.toLocaleString("en-IN")}, but your ${voucher.name} covers ₹${cap.toLocaleString("en-IN")} — you're ₹${(total - cap).toLocaleString("en-IN")} short. Fewer people, or something lighter?`,
          items: [], chips: ["Just me", ...FOOD_MENU.filter((m) => m.price * qty <= cap).slice(0, 2).map((m) => m.name)],
          flow: { journey: "food", slot: "party", data: d },
        };
      }
      markVoucherUsed(persona.id, voucher.id);
      const code = `TNG-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      return {
        reply: `✅ Order placed with your ${voucher.name}: ${qty} × ${d.item.name} (₹${total.toLocaleString("en-IN")} of ₹${cap.toLocaleString("en-IN")} covered). Your redemption code is ${code} — issued the same way the bank world issues Tango vouchers. Enjoy! 🍽️`,
        items: [], chips: ["Show dining options", "Best value for my points"], flow: null,
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

  /* ---------- start the FLIGHT booking journey (real Duffel via backend) ------
     Booking intent ("book a flight", "flight tickets", "fly to Goa", "book real
     flights there") opens a real slot-filled conversation ending in a LIVE
     Duffel search + in-chat booking — NOT the hardcoded voucher dump below.
     Browse asks ("show me flight options") still fall through to the catalogue
     browse. If they named the city inline we skip straight to the origin. */
  const wantsFlightBooking = !wantsToBrowse && has(t,
    "book flight", "book a flight", "book flights", "book me a flight", "book my flight",
    "book real flight", "book real flights", "real flights", "flight ticket", "flight tickets",
    "air ticket", "air tickets", "fly to", "flights to", "want to fly", "i want to fly",
    "wanna fly", "book air", "reserve a flight", "search flights", "find flights", "find me a flight");
  if (wantsFlightBooking) {
    // one message may carry the whole route ("book a flight bangalore to dubai")
    const r = _parseRoute(t);
    if (r.origin && r.dest) {
      return {
        reply: `Let's book it — ${r.origin} to ${r.dest}. Round trip or one way?`,
        items: [], chips: ["Round trip", "One way"],
        flow: { journey: "flight", slot: "trip_type", data: { origin: r.origin, dest: r.dest } },
      };
    }
    if (!r.dest && r.destHint) {
      return {
        reply: `${r.destHint.country} is a big place — I can search live fares to ${r.destHint.chips.join(", ")}. Which city?`,
        items: [], chips: r.destHint.chips,
        flow: { journey: "flight", slot: "destination", data: r.origin ? { origin: r.origin } : {} },
      };
    }
    if (r.dest) {
      return {
        reply: `Let's book it — flying to ${r.dest}. Which city are you flying from?`,
        items: [], chips: [(persona.cmr && persona.cmr.city) || "Mumbai", "Bengaluru", "Delhi"],
        flow: { journey: "flight", slot: "origin", data: { dest: r.dest } },
      };
    }
    return {
      reply: "Happy to book you a real flight! Where do you want to fly to?",
      items: [], chips: ["Goa", "Delhi", "Dubai", "Mumbai"],
      flow: { journey: "flight", slot: "destination", data: {} },
    };
  }

  if (!wantsToBrowse && has(t,
        "planning a trip", "plan a trip", "planning trip", "plan my trip", "book a trip",
        "going on a trip", "go on a trip", "take a trip", "want to travel", "wanna travel",
        "like to travel", "love to travel", "planning to travel", "want to go on",
        "go somewhere", "travel somewhere", "getaway", "get away", "vacation", "holiday",
        "want a trip", "i want to travel")) {
    return {
      reply: "Exciting! Where are you headed?",
      items: [],
      chips: ["Goa", "Jaipur", "Dubai", "Somewhere else"],
      flow: { journey: "flight", slot: "destination", data: {} },
    };
  }

  /* ---------- start FOOD ordering / restaurant booking (conversational) -------
     Natural asks like "book me a nice dinner" open a real one-question-at-a-
     time conversation — cuisine → party size → suggested dish → confirm —
     mirroring the bank world's dining slot-filling. The dining-voucher check
     happens at the END (like a real concierge sorting out payment last), not
     as a hard gate before CredArt will even talk to you. */
  const foodMealWord = /\b(dinner|lunch|breakfast|brunch|restaurant|table|meal)\b/.test(t);
  const foodVerb = has(t, "book", "order", "reserve", "get me", "want", "craving", "plan", "arrange", "set up", "make");
  const wantsFood = has(t, "order food", "order some food", "book a restaurant", "book restaurant",
         "reserve a table", "book a table", "table for", "order dinner", "order lunch",
         "order a pizza", "order pizza", "order a meal", "use my dining voucher",
         "food order", "get me food", "hungry")
      || (foodMealWord && foodVerb);
  if (wantsFood) {
    return {
      reply: "Happy to sort that out! What are you in the mood for?",
      items: [], chips: CUISINE_CHIPS,
      flow: { journey: "food", slot: "cuisine", data: {} },
    };
  }

  /* ---------- category browses (budget-ordered + flagged; off-lean browses get
     a gentle redirect nudge that never blocks the browse — strategy (b)).
     MERCHANDISE is checked FIRST: "going on a roadtrip, want some merchandise"
     names a trip but ASKS for merchandise — the ask wins, and the trip context
     shapes WHICH merchandise (travel gear) instead of hijacking the intent. */
  if (has(t, "merchandise", "gadget", "product", "electronics", "appliance", "home") || productWordsIn(t).length) {
    const found = findProducts(t, budget);       // specific product asked for?
    const foundItems = found ? vis(found.items) : [];
    const nudge = laneNudge("merchandise");

    // Asked for a product the store can't sell them (not stocked, or premium-
    // card gated) → the honest path is a voucher: buy EXACTLY the one you want.
    if (found && !foundItems.length) {
      const vouchers = vis(voucherFallbackItems(budget));
      const why = found.items.length
        ? "need a premium card your account doesn't hold"
        : "aren't stocked in the rewards catalogue";
      return {
        reply: `The ${found.words[0]} options ${why} — so instead of a nearest-miss substitute, grab an instant voucher and buy the exact model you want:${budgetNote(vouchers, budget)}`,
        items: vouchers,
        chips: ["What's in merchandise?", "Best value for my points"],
        flow: null,
      };
    }

    const occasion = foundItems.length ? null : occasionMerch(t, budget);
    const items = foundItems.length ? foundItems
      : (occasion || orderByBudget(vis([itemById("md-sony"), itemById("md-airpods"), itemById("md-airfryer")]), budget));
    const lead = foundItems.length
      ? `Good pick — here ${foundItems.length > 1 ? "are the closest matches" : "is the closest match"} for ${/^[aeiou]/.test(found.words[0]) ? "an" : "a"} ${found.words[0]} in the store, priced in points:`
      : occasion
        ? `Nice — for that, here's the gear I'd grab from the store:`
        : `Popular merchandise picks — real products, priced in points:`;
    const why = foundItems.length && items[0]
      ? ` I led with the ${items[0].name} because it matches "${found.words[0]}" and is ${items[0].points <= budget ? "within your spendable points" : `${fmt(items[0].points - budget)} pts over budget`}.`
      : "";
    return {
      reply: `${lead}${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Best value for my points", "Show me travel options"], nudge), flow: null,
    };
  }
  // travel keywords are WORD-bounded so "roadtrip" (a merch context) never
  // trips the travel branch the way substring matching did
  if (hasWord(t, "travel", "flights?", "trip", "getaway", "vacation", "holidays?", "hotels?", "stay", "lounge")) {
    const found = searchCatalogue(t, { category: "travel", persona });
    const items = orderByBudget(found.length ? found.map((f) => f.item)
      : vis([itemById("tv-indigo"), itemById("tv-marriott"), itemById("tv-itc")]), budget);
    const nudge = laneNudge("travel");
    const why = found.length && items[0] ? ` I led with the ${items[0].name} because it ${whyPick(items[0], budget, found[0].matched)}.` : "";
    return {
      reply: `Here are your top travel redemptions — I've led with the ones that fit your ${fmt(budget)} spendable points. Want to book a real flight instead? I can pull live fares.${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Book a flight", "I'm planning a trip", "Best value for my points"], nudge), flow: null,
    };
  }
  if (has(t, "gift card", "gift cards", "voucher", "amazon", "flipkart", "zomato", "swiggy", "myntra", "dining", "food")) {
    const found = searchCatalogue(t, { category: "giftcards", persona });
    const items = orderByBudget(found.length ? found.map((f) => f.item)
      : vis([itemById("gc-taj"), itemById("gc-amazon"), itemById("gc-zomato")]), budget);
    const nudge = laneNudge("giftcards");
    const why = found.length && items[0] ? ` I led with the ${items[0].name} because it ${whyPick(items[0], budget, found[0].matched)}.` : "";
    return {
      reply: `Instant e-vouchers, straight to your inbox:${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Best value for my points", "What's in merchandise?"], nudge), flow: null,
    };
  }
  if (has(t, "cashback", "cash back", "statement credit", "money back")) {
    const found = searchCatalogue(t, { category: "cashback", persona });
    const items = orderByBudget(found.length ? found.map((f) => f.item)
      : vis([itemById("cb-10000"), itemById("cb-5000"), itemById("cb-2500")]), budget);
    const nudge = laneNudge("cashback");
    const why = found.length && items[0] ? ` I led with the ${items[0].name} because it ${whyPick(items[0], budget, found[0].matched)}.` : "";
    return {
      reply: `Prefer cash? These credit straight to your account — higher tiers give a little more per point:${budgetNote(items, budget)}${why}${nudge.text}`,
      items, chips: withNudge(["Best value for my points", "Show me travel options"], nudge), flow: null,
    };
  }

  /* ---------- pure rupee-per-point optimizer (ONLY when the user explicitly
     asks to maximise rupee value — this figure is objective, not personalized). */
  if (has(t, "bang for", "per point", "most rupees", "rupee value", "highest value", "maximise value", "maximize value")) {
    const best = orderByBudget(vis(topByValue([...CATALOGUE.giftcards, ...CATALOGUE.cashback], 3).map((i) => itemById(i.id))), budget);
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
    const items = orderByBudget(vis(lean.ids.map(itemById)), budget);
    const why = items[0] ? ` I led with the ${items[0].name} because it's your top ${lean.word} pick and fits your budget.` : "";
    return {
      reply: `Since your profile leans toward ${lean.word} ${lean.emoji}, I started there — these fit your ${fmt(budget)} spendable points:${budgetNote(items, budget)}${why} Want a different lane? Just tap below.`,
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
     "noise cancelling headphones", "a Bali honeymoon") by searching every one
     of the 200+ rewards in ALL_ITEMS by name / category / topical-keyword,
     then explaining WHY the top pick surfaced — derived from the actual match
     + the user's real spendable budget, never invented. ---------- */
  const globalFound = searchCatalogue(t, { persona });
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

  /* Purchase intent for a specific item the catalogue doesn't stock (a phone
     case, a controller…) — the search above found nothing real, so rather than
     a nearest-miss substitute, offer the honest voucher fallback: buy exactly
     what they asked for. */
  const buy = t.match(/\b(?:buy|purchase|order|want|need|looking for|shop for|get(?: me)?|gift(?: for)?)\b\s+(.+)/);
  if (buy && !/\bpoints?\b|\bcart\b/.test(buy[1])) {
    const thing = buy[1]
      .replace(/^(?:to\s+)?(?:buy|purchase|order|get|have|own|find|grab)\s+/, "") // nested verb ("want to buy")
      .replace(/^(?:a |an |some |the |new |me )+/, "")
      .split(/\b(?:for|from)\b/)[0]
      .replace(/[^\w\s-]/g, "").trim().split(/\s+/).slice(0, 4).join(" ") || "that";
    const vouchers = vis(voucherFallbackItems(budget));
    return {
      reply: `A ${thing} isn't something the rewards catalogue stocks directly — the cleanest way is an instant Amazon voucher you can spend on the exact ${thing} you want:${budgetNote(vouchers, budget)}`,
      items: vouchers,
      chips: ["What's in merchandise?", "Best value for my points"],
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
