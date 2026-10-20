// ─── E2E: Kho Công cụ Web — chặn vòng lặp save→emit→setState + phím tắt ───
// Lỗi cũ: saveTools() phát WEBTOOLS_UPDATED đồng bộ → component tự nghe →
// setTools(loadTools()) luôn trả mảng MỚI → effect [tools] chạy mãi
// (900+ ghi localStorage/2s, treo tab). Chạy: npm run build trước.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.E2E_WT_PORT || 5327);
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

async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  // Đếm số lần ghi localStorage key kho công cụ — hiệu ứng vòng lặp sẽ phình số này
  await page.addInitScript(() => {
    window.__wtWrites = 0;
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => {
      if (k === "sgk_web_tools") window.__wtWrites++;
      return origSet(k, v);
    };
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem("sgk_web_tools"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  return page;
}

async function openWebtools(page) {
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("aside .nav-item")].find((b) =>
      /kho công cụ web/i.test(b.textContent || ""));
    if (btn) { btn.click(); return true; }
    return false;
  });
  assert.equal(opened, true, "thiếu nav 'Kho Công cụ Web' trong sidebar");
  await page.waitForSelector(".webtoolbox-view", { timeout: 10000 });
}

test("KHÔNG vòng lặp: thêm link chỉ ghi localStorage ~1 lần, tab không treo", async () => {
  const page = await freshPage();
  try {
    await openWebtools(page);
    await page.waitForTimeout(600); // seed 1 lần khi storage trống
    const seedWrites = await page.evaluate(() => window.__wtWrites);

    await page.click('button:has-text("Thêm Link")');
    await page.waitForSelector("#wt-url", { timeout: 5000 });
    await page.fill("#wt-url", "https://example.com/loop-guard");
    await page.fill("#wt-title", "Loop Guard");
    await page.click('.wt-modal-actions button:has-text("Thêm")');

    await page.waitForTimeout(2000); // trước fix: ~700-900 ghi trong khoảng này
    const stats = await page.evaluate(() => ({
      writes: window.__wtWrites,
      tiles: document.querySelectorAll(".wt-tile").length,
      stored: JSON.parse(localStorage.getItem("sgk_web_tools") || "[]").length,
    }));
    assert.ok(stats.writes <= seedWrites + 3,
      `vòng lặp echo: ${stats.writes} ghi (seed=${seedWrites}) — mong <= ${seedWrites + 3}`);
    assert.equal(stats.stored, 7, `6 tool seed + 1 mới = 7, thấy ${stats.stored}`);
    assert.equal(stats.tiles, 8, `7 ô tool + ô Thêm = 8, thấy ${stats.tiles}`);

    // tab vẫn phản hồi (nếu loop thì click này timeout)
    await page.click('button:has-text("Thêm Link")');
    await page.waitForSelector("#wt-url", { timeout: 5000 });
    assert.equal(await page.locator("#wt-url").count(), 1, "modal Thêm mở lại được → tab không treo");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#wt-url").count(), 0, "Escape đóng modal (handler ở window, focus ở đâu cũng đóng)");
  } finally {
    await page.close();
  }
});

test("Phím tắt '/' không đánh cắp focus khi modal Thêm/Sửa đang mở", async () => {
  const page = await freshPage();
  try {
    await openWebtools(page);
    // ngoài modal: '/' phải focus ô tìm kiếm
    await page.keyboard.press("/");
    await page.waitForTimeout(120);
    const outside = await page.evaluate(() => !!document.activeElement?.closest?.(".wt-search"));
    assert.equal(outside, true, "ngoài modal: '/' phải focus ô tìm kiếm");

    await page.click('button:has-text("Thêm Link")');
    await page.waitForSelector("#wt-url", { timeout: 5000 });
    await page.click(".wt-modal .modal-header"); // rời focus khỏi input
    await page.keyboard.press("/");
    await page.waitForTimeout(120);
    const inside = await page.evaluate(() => ({
      inSearch: !!document.activeElement?.closest?.(".wt-search"),
      modalOpen: !!document.querySelector("#wt-url"),
    }));
    assert.equal(inside.inSearch, false, "modal đang mở: '/' không được nhảy ra ô tìm kiếm phía sau");
    assert.equal(inside.modalOpen, true, "modal vẫn mở sau khi gõ '/'");
  } finally {
    await page.close();
  }
});
