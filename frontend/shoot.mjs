// CredArt video-asset screenshot shoot (headless chromium via Playwright).
// Drives the real running app at :5173 and saves PNGs into ../video-assets/<scene>/.
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "video-assets");
const BASE = "http://localhost:5173";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Click the first visible <button> whose text includes `label`.
async function clickBtn(page, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const handle = await page.evaluateHandle((lbl) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText && x.innerText.includes(lbl));
      return b || null;
    }, label);
    const el = handle.asElement();
    if (el) { await el.click(); return true; }
    await sleep(200);
  }
  throw new Error(`button not found: ${label}`);
}

// Type into the concierge input + press Enter (React-safe).
async function sendChat(page, placeholder, text) {
  await page.evaluate(({ ph, t }) => {
    const ta = document.querySelector(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`);
    const proto = ta.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(ta, t);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }, { ph: placeholder, t: text });
}

async function fresh(page, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(2600); // wait out the 2.2s boot splash
}

async function shot(page, rel) {
  const p = path.join(OUT, rel);
  await page.screenshot({ path: p });
  console.log("saved", rel);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 2 }); // retina-crisp
  const page = await ctx.newPage();

  // ---------- Establishing: cream landing (laptop) ----------
  await fresh(page, { width: 1512, height: 950 });
  await shot(page, "scene-3-turn/landing-cream.png");

  // ---------- Store fullscreen (laptop) ----------
  await clickBtn(page, "Open the rewards store");
  await sleep(1600);
  await shot(page, "scene-3-turn/store-fullscreen.png");

  // ---------- Gift concierge (store bubble) ----------
  await clickBtn(page, "Browse the Store");
  await sleep(1400);
  const openBubble = async () => page.evaluate(() => {
    const b = [...document.querySelectorAll("button,[role=button]")].find((x) => {
      const s = getComputedStyle(x);
      return (s.position === "fixed" || s.position === "absolute") && x.offsetWidth > 40 && x.offsetWidth < 120;
    });
    b && b.click();
  });
  const GIFT_Q = "i want to gift my dad for his birthday, he loves photography";
  const PH = "Ask CredArt about your points…";

  // START FRAME: question typed into the input, NOT yet sent (greeting still above).
  await openBubble();
  await sleep(1000);
  await page.evaluate(({ ph, t }) => {
    const ta = document.querySelector(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`);
    const proto = ta.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(ta, t);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  }, { ph: PH, t: GIFT_Q });
  await sleep(500);
  await shot(page, "scene-4-gift-concierge/gift-start.png");

  // END FRAME: send, let cards render, scroll transcript to the product cards.
  await sendChat(page, PH, GIFT_Q);
  await sleep(2600);
  const bubbleBox = await page.evaluate(() => {
    // header text → walk up to the fixed concierge panel
    const header = [...document.querySelectorAll("*")].find((e) =>
      /CredArt Concierge/i.test(e.textContent || "") && e.children.length < 6);
    let panel = header;
    while (panel && getComputedStyle(panel).position !== "fixed") panel = panel.parentElement;
    // scroll the transcript to the bottom so all product cards + the chips show
    const scroller = [...(panel ? panel.querySelectorAll("*") : [])].find((e) =>
      e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  await sleep(700);
  await shot(page, "scene-4-gift-concierge/gift-result.png");            // full store context
  if (bubbleBox) {
    await page.screenshot({ path: path.join(OUT, "scene-4-gift-concierge/gift-result-chat.png"), clip: bubbleBox });
    console.log("saved scene-4-gift-concierge/gift-result-chat.png (clipped)");
  } else {
    console.log("WARN: bubble panel not found for clip");
  }

  // ---------- Scene 6: three worlds (phone views) ----------
  // Clip each to the phone (IOSDevice) so the composite is clean phones on cream.
  const phoneClip = () => page.evaluate(() => {
    const phone = [...document.querySelectorAll("div")].find((e) =>
      Math.abs(e.offsetWidth - 402) < 6 && e.offsetHeight > 800 && getComputedStyle(e).borderRadius.startsWith("48"));
    if (!phone) return null;
    const r = phone.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });

  const worlds = [
    { label: "Try CredArt for Banks",                file: "scene-6-three-worlds/hdfc-concierge.png",   waitMs: 4500 },
    { label: "Try CredArt for Food",                 file: "scene-6-three-worlds/subway-concierge.png", waitMs: 3000 },
    { label: "Try CredArt for Entertainment",        file: "scene-6-three-worlds/cinema-concierge.png", waitMs: 3000 },
  ];
  const phoneCrops = [];
  for (const w of worlds) {
    await fresh(page, { width: 720, height: 1000 });
    await clickBtn(page, w.label);
    await sleep(w.waitMs);                       // let the world's data / greeting settle
    await shot(page, w.file);                    // full framed phone-on-cream
    const clip = await phoneClip();
    if (clip) {
      const cropPath = path.join(OUT, w.file.replace(".png", "-phone.png"));
      await page.screenshot({ path: cropPath, clip });
      phoneCrops.push(cropPath);
    }
  }

  // ---------- three-worlds-composite.png (3 phones on cream, no line/labels) ----------
  if (phoneCrops.length === 3) {
    const fileUrl = (p) => "file:///" + p.replace(/\\/g, "/");
    const composite = `<!doctype html><html><body style="margin:0">
      <div style="width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;gap:70px;
        background:radial-gradient(circle at 50% 30%,#FDFBF5,#F3EDE0 62%,#EAE1CF)">
        <img src="${fileUrl(phoneCrops[0])}" style="height:820px;filter:drop-shadow(0 40px 70px rgba(11,29,44,0.28))">
        <img src="${fileUrl(phoneCrops[1])}" style="height:880px;filter:drop-shadow(0 46px 80px rgba(11,29,44,0.32))">
        <img src="${fileUrl(phoneCrops[2])}" style="height:820px;filter:drop-shadow(0 40px 70px rgba(11,29,44,0.28))">
      </div></body></html>`;
    const cpath = path.join(OUT, "scene-6-three-worlds/_composite.html");
    (await import("fs")).writeFileSync(cpath, composite);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(fileUrl(cpath), { waitUntil: "networkidle" });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, "scene-6-three-worlds/three-worlds-composite.png") });
    console.log("saved scene-6-three-worlds/three-worlds-composite.png");
  }

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("SHOOT FAILED:", e); process.exit(1); });
