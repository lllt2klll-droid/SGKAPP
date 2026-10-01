import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.E2E_PORT || 5321);
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let browser = null;

async function healthy(url) {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitHealthy(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await healthy(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html khong ton tai — hãy chạy `npm run build` trước khi chạy e2e.");
  }
  if (!(await healthy(BASE))) {
    serverProcess = spawn(process.execPath, ["--no-warnings", "server.js"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
    });
    if (!(await waitHealthy(BASE, 20000))) {
      throw new Error(`Khong khoi duoc server e2e tren ${BASE}`);
    }
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
});

test("app load duoc, khong co pageerror", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    assert.equal(await page.locator(".app-shell").count(), 1, "phai render duoc .app-shell");
    assert.deepEqual(errors, [], `khong duoc co pageerror: ${errors.join(" | ")}`);
  } finally {
    await page.close();
  }
});

test("chuyen den Thu vien sach thay duoc toolbar hien thi/sap xep", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("aside button")].find((b) =>
        (b.getAttribute("aria-label") || "").includes("Thu vien sach") ||
        (b.getAttribute("aria-label") || "").includes("Thư viện sách"),
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(2500);
    assert.equal(await page.locator(".libx-seg button").count(), 2, "toolbar chuyen kieu hien thi thieu nut");
    assert.equal(await page.locator(".sort-select").count(), 1, "thieu o sap xep");
  } finally {
    await page.close();
  }
});

test("Ctrl+K mo dung 1 lop GlobalSearch", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(700);
    const n = await page.locator(".global-search-overlay").count();
    assert.equal(n, 1, `mong doi 1 overlay, thay ${n}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".global-search-overlay").count(), 0, "Escape phai dong overlay");
  } finally {
    await page.close();
  }
});
