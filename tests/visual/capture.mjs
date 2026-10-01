// Visual regression helper — KHÔNG phải unit test (npm test không chạy file này).
// Chụp homepage ở 4 viewport + modal Cài đặt, đồng thời dump computed-style
// của các selector thuộc diện CSS cleanup để diff trước/sau.
// Chạy: node tests/visual/capture.mjs <outdir>   (server phải chạy ở :5000)
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const EXE = "C:\\Users\\lllT2\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
const BASE = "http://localhost:5000/";
const outdir = process.argv[2] || "tests/visual/baseline";
fs.mkdirSync(outdir, { recursive: true });

// Selector đại diện cho các file CSS cleanup (34/22/20/19/35/31-33) — chỉ lấy phần tử HIỂN THỊ
const SELECTORS = [
  ".btn-primary", ".btn-secondary", ".btn-ghost", ".btn-danger", ".btn-icon",
  ".filter-btn", ".seg-tab", ".sort-select", ".tag-chip", ".color-dot",
  ".sidebar", ".sidebar-section-title", ".nav-item", ".app-header", ".header-action-btn",
  ".card", ".book-card", ".stat-card", ".dashboard-hero", ".hero-cta-btn",
  ".library-toolbar", ".welcome-hero", ".upload-dropzone", ".search-input-wrapper",
  ".form-control", ".data-table", ".modal-overlay", ".toast-container",
  ".dashboard-workspace", ".stats-compact-grid", ".continue-section", ".recommendations-grid",
  ".stats-section", ".activity-section", ".workflow-pipeline",
  ".mobile-bottom-nav", ".reader-mobile-bar", ".whiteboard-root", ".help-mod-group",
  "input", "select", "textarea", "h1", "h2", ".text-body-sm",
];
const PROPS = [
  "display", "position", "width", "height", "min-width", "min-height", "max-width",
  "background", "background-color", "background-image", "border", "border-width",
  "border-color", "border-radius", "box-shadow", "text-shadow", "color",
  "font-size", "font-weight", "letter-spacing", "white-space", "transform",
  "z-index", "opacity", "padding", "margin", "gap", "flex-direction",
];

const VIEWPORTS = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "375x812", width: 375, height: 812 },
];

const browser = await chromium.launch({ executablePath: EXE });
const summary = {};
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message || e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outdir, `home-${vp.name}.png`) });
  const dump = await page.evaluate(({ SELECTORS, PROPS }) => {
    const out = {};
    for (const sel of SELECTORS) {
      const els = [...document.querySelectorAll(sel)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).slice(0, 4);
      if (!els.length) continue;
      out[sel] = els.map((el) => {
        const cs = getComputedStyle(el);
        const o = {};
        for (const p of PROPS) o[p] = cs.getPropertyValue(p);
        o.text = (el.innerText || "").slice(0, 60);
        return o;
      });
    }
    return out;
  }, { SELECTORS, PROPS });
  fs.writeFileSync(path.join(outdir, `computed-${vp.name}.json`), JSON.stringify(dump, null, 1));
  summary[vp.name] = { selectors: Object.keys(dump).length, pageerrors: errors };
  await page.close();
}
// Các view chính (sidebar) ở desktop — phủ library/help CSS
for (const [slug, navName] of [["library", "Thư viện sách"], ["help", "Trợ giúp"]]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const clicked = await page.evaluate((navName) => {
    const btns = [...document.querySelectorAll("button")];
    const t = btns.find((b) => (b.innerText || "").trim() === navName);
    if (!t) return false;
    t.scrollIntoView({ block: "center" });
    t.click();
    return true;
  }, navName);
  if (clicked) {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(outdir, `view-${slug}-1366x768.png`) });
    const dump = await page.evaluate(({ SELECTORS, PROPS }) => {
      const out = {};
      for (const sel of SELECTORS) {
        const els = [...document.querySelectorAll(sel)].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).slice(0, 6);
        if (!els.length) continue;
        out[sel] = els.map((el) => {
          const cs = getComputedStyle(el);
          const o = {};
          for (const p of PROPS) o[p] = cs.getPropertyValue(p);
          o.text = (el.innerText || "").slice(0, 60);
          return o;
        });
      }
      return out;
    }, { SELECTORS, PROPS });
    fs.writeFileSync(path.join(outdir, `computed-view-${slug}.json`), JSON.stringify(dump, null, 1));
    summary[`view-${slug}`] = { selectors: Object.keys(dump).length };
  } else {
    summary[`view-${slug}`] = { skipped: true };
  }
  await page.close();
}
// Modal Cài đặt ở desktop
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const btn = page.getByRole("button", { name: "Cài đặt" }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outdir, "settings-1366x768.png") });
    const dump = await page.evaluate(({ PROPS }) => {
      const out = {};
      for (const sel of [".settings-center", ".modal-content", ".seg-tab", ".color-dot", ".form-control"]) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);
        const o = {};
        for (const p of PROPS) o[p] = cs.getPropertyValue(p);
        out[sel] = [o];
      }
      return out;
    }, { PROPS });
    fs.writeFileSync(path.join(outdir, "computed-settings.json"), JSON.stringify(dump, null, 1));
    summary.settings = { selectors: Object.keys(dump).length };
  } else {
    summary.settings = { skipped: true };
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(outdir, "summary.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
