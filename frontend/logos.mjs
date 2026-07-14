// Export transparent-PNG logos for the video's closing overlay (CapCut).
// Kobie mark: key white out of the supplied webp via canvas.
// CredArt mark: render the real wordmark on a transparent page (true alpha).
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "video-assets", "logos");
const BASE = "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ deviceScaleFactor: 3 }).then((c) => c.newPage());

  // ---- Kobie marks: load webp, key near-white to transparent, save PNG ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  for (const [src, out] of [["/kobieLOGOs.webp", "kobie-k-transparent.png"],
                            ["/kobieLOGOl.webp", "kobie-wordmark-transparent.png"]]) {
    const dataUrl = await page.evaluate(async (s) => {
      const img = new Image();
      img.src = s;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        // near-white → transparent; feather partial-white edges for clean alpha
        const r = p[i], g = p[i + 1], b = p[i + 2];
        const m = Math.min(r, g, b);
        if (r > 243 && g > 243 && b > 243) p[i + 3] = 0;
        else if (m > 215) p[i + 3] = Math.round(p[i + 3] * (1 - (m - 215) / 40));
      }
      ctx.putImageData(d, 0, 0);
      return c.toDataURL("image/png");
    }, src);
    const buf = Buffer.from(dataUrl.split(",")[1], "base64");
    (await import("fs")).writeFileSync(path.join(OUT, out), buf);
    console.log("saved logos/" + out);
  }

  // ---- CredArt mark: render the real lockup on transparency ----
  const credart = `<!doctype html><html><body style="margin:0">
    <div id="mark" style="display:inline-flex;align-items:center;gap:16px;padding:20px 26px;
      font-family:-apple-system,'Segoe UI',system-ui,sans-serif">
      <span style="width:74px;height:74px;border-radius:20px;
        background:linear-gradient(150deg,#16354D,#0B1D2C);display:flex;align-items:center;
        justify-content:center;color:#FBF7EE;font-weight:800;font-size:40px;
        box-shadow:0 10px 26px rgba(11,29,44,0.30)">C</span>
      <span style="color:#0B1D2C;font-weight:800;font-size:52px;letter-spacing:-0.02em">CredArt</span>
    </div></body></html>`;
  await page.setContent(credart, { waitUntil: "load" });
  await sleep(300);
  const el = await page.$("#mark");
  await el.screenshot({ path: path.join(OUT, "credart-logo-transparent.png"), omitBackground: true });
  console.log("saved logos/credart-logo-transparent.png");

  // ---- CredArt full lockup with tagline (nice for the closing card) ----
  const lockup = `<!doctype html><html><body style="margin:0">
    <div id="lk" style="display:inline-flex;flex-direction:column;align-items:center;gap:14px;
      padding:36px 44px;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:16px">
        <span style="width:74px;height:74px;border-radius:20px;
          background:linear-gradient(150deg,#16354D,#0B1D2C);display:flex;align-items:center;
          justify-content:center;color:#FBF7EE;font-weight:800;font-size:40px">C</span>
        <span style="color:#0B1D2C;font-weight:800;font-size:52px;letter-spacing:-0.02em">CredArt</span>
      </div>
      <span style="color:#C24A2B;font-weight:600;font-size:19px;letter-spacing:0.01em">The art of managing credits</span>
    </div></body></html>`;
  await page.setContent(lockup, { waitUntil: "load" });
  await sleep(300);
  const el2 = await page.$("#lk");
  await el2.screenshot({ path: path.join(OUT, "credart-lockup-transparent.png"), omitBackground: true });
  console.log("saved logos/credart-lockup-transparent.png");

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("LOGOS FAILED:", e); process.exit(1); });
