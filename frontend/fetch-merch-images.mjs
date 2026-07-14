// One-time fetch: real product photos for every merchandise item, from
// Wikimedia Commons (real, topical, freely-licensed photos; stable CORS-open
// CDN at upload.wikimedia.org that ad-blockers don't strip — unlike the flickr
// proxy that left cards blank, and unlike dummyjson's tiny catalogue that
// returned same-category WRONG products).
//
// Each item is mapped to a clean product search phrase; we pull several
// candidates and reject diagrams / SVGs / closeups / logos so the chosen image
// is an actual product shot. Result baked into merch-images.json — zero runtime
// fetch at demo time. Any item with no clean hit keeps its guaranteed SVG tile.
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "src", "lib", "merch-images.json");
const BASE = "http://localhost:5173";

// name regex -> Wikimedia Commons search phrase (ordered; first match wins).
const SEARCH = [
  [/grilling set|barbecue|bbq|grill/, "barbecue grill tools"],
  [/coffee ?maker|coffeemaker|coffee center|nespresso|coffee machine/, "coffee machine"],
  [/fabric steamer|garment steamer|steam iron|steamer/, "garment steamer"],
  [/steam iron|\biron\b/, "clothes iron appliance"],
  [/heating pad|massag/, "electric heating pad"],
  [/headphone|wh-1000|over-ear/, "over ear headphones"],
  [/airpods|earbud|buds|airdopes|tws/, "wireless earbuds"],
  [/camera|eos|dslr|mirrorless/, "dslr camera"],
  [/pixma|printer/, "inkjet printer"],
  [/gopro|action cam/, "action camera"],
  [/osmo|gimbal|stabilizer/, "camera gimbal stabilizer"],
  [/vacuum/, "cordless vacuum cleaner"],
  [/air fryer|airfryer/, "air fryer"],
  [/pressure cooker/, "pressure cooker"],
  [/induction cooktop|induction/, "induction cooktop"],
  [/microwave/, "microwave oven"],
  [/mixer grinder|mixer|grinder|blender/, "kitchen blender"],
  [/instant pot|multi.?cooker/, "instant pot cooker"],
  [/cookware|non-?stick|tawa|pan/, "cookware set"],
  [/dinner set|crockery|plates|opalware/, "dinner plates set"],
  [/flask|thermos|bottle/, "steel water bottle"],
  [/glass storage|storage set/, "glass food storage containers"],
  [/smartwatch|smart band|colorfit|apple watch|fitbit|fitness (band|tracker)|charge/, "smartwatch"],
  [/analog watch|watch/, "wrist watch"],
  [/kindle|e-?reader|paperwhite/, "e-reader tablet"],
  [/ipad|tablet/, "tablet computer"],
  [/smart tv|television|\btv\b|fire tv/, "flat screen television"],
  [/laptop|macbook|pavilion/, "laptop computer"],
  [/mouse/, "wireless mouse peripheral"],
  [/speaker|jbl|flip|echo|soundbar/, "bluetooth speaker"],
  [/power bank|powerbank|anker/, "portable charger battery"],
  [/sunglass|ray-?ban|aviator/, "sunglasses"],
  [/running shoes|sneaker|shoes|nike|adidas running/, "running shoes"],
  [/backpack|laptop bag/, "backpack"],
  [/trolley|suitcase|luggage|duffel|boat bag|tourister|skybags/, "luggage suitcase"],
  [/yoga|fitness kit/, "yoga mat"],
  [/basketball|football/, "basketball"],
  [/hair dryer|supersonic/, "hair dryer"],
  [/trimmer|shaver|razor|beard/, "electric shaver trimmer"],
  [/ceiling fan/, "ceiling fan"],
  [/air cooler|room cooler/, "evaporative air cooler"],
  [/room heater|heater/, "room heater appliance"],
  [/air purifier/, "air purifier appliance"],
  [/water purifier|purifier|water filter/, "water filter pitcher"],
];
// Kill diagrams, archival scans, whole-systems and animations that slipped
// through — anything that isn't a clean modern product photo.
const REJECT = /\.svg|\.gif|diagram|schematic|patent|drawing|logo|icon|sensor|interior|blade|cutaway|disassembl|exploded|vintage|antique|museum|\(1[89]\d\d\)|\(20\d\d\)|18\d\d|19[0-3]\d|magazine|news|engineering|encyclopedia|\bbook\b|advertis|catalog|poster|stamp|\bcoin\b|banknote|amiga|\bsystem\b|akku|map|chart|graph|closeup|close-up|macro|screenshot/i;

function phraseFor(name) {
  const n = (name || "").toLowerCase();
  for (const [re, phrase] of SEARCH) if (re.test(n)) return phrase;
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext().then((c) => c.newPage());
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async ({ SEARCH_SRC, REJECT_SRC }) => {
    const mod = await import("/src/lib/catalogue.js");
    const items = mod.CATALOGUE.merchandise;
    const SEARCH = SEARCH_SRC.map(([r, p]) => [new RegExp(r, "i"), p]);
    const REJECT = new RegExp(REJECT_SRC, "i");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const phraseFor = (name) => {
      const n = (name || "").toLowerCase();
      for (const [re, phrase] of SEARCH) if (re.test(n)) return phrase;
      return null;
    };
    async function commons(phrase) {
      const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
        "&gsrsearch=" + encodeURIComponent(phrase + " filetype:bitmap") +
        "&gsrlimit=8&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=500&format=json&origin=*";
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const pages = (data.query && data.query.pages) ? Object.values(data.query.pages) : [];
        return pages
          .sort((a, b) => (a.index || 0) - (b.index || 0))
          .map((p) => ({ title: p.title, info: p.imageinfo && p.imageinfo[0] }))
          .filter((x) => x.info);
      } catch { return []; }
    }
    const out = {}, log = [];
    for (const it of items) {
      const phrase = phraseFor(it.name);
      if (!phrase) { log.push(`SKIP ${it.name} — no phrase, keeps tile`); continue; }
      const cands = await commons(phrase);
      const good = cands.find((c) =>
        c.info.mime && (c.info.mime === "image/jpeg" || c.info.mime === "image/png" || c.info.mime === "image/webp") &&
        !REJECT.test(c.title) && (c.info.thumburl || "").startsWith("https://upload.wikimedia.org"));
      if (good) { out[it.slug] = good.info.thumburl; log.push(`OK   ${it.name}  [${phrase}]  -> ${good.title.replace("File:", "")}`); }
      else log.push(`SKIP ${it.name}  [${phrase}]  (${cands.length} cands) — keeps tile`);
      await sleep(180);
    }
    return { out, log };
  }, { SEARCH_SRC: SEARCH.map(([r, p]) => [r.source, p]), REJECT_SRC: REJECT.source });

  console.log(result.log.join("\n"));
  const n = Object.keys(result.out).length;
  if (n === 0) { console.error("\nABORT: 0 matches (likely rate-limited) — NOT overwriting the file."); await browser.close(); process.exit(1); }
  writeFileSync(OUT_PATH, JSON.stringify(result.out, null, 2));
  const back = Object.keys(JSON.parse(readFileSync(OUT_PATH, "utf8"))).length; // read-back assert
  console.log(`\nSaved ${n} photos → ${OUT_PATH}  (verified ${back} keys on disk)`);
  await browser.close();
})().catch((e) => { console.error("FETCH FAILED:", e); process.exit(1); });
