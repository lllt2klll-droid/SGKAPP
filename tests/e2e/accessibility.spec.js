// ─── E2E: Cài đặt → Trợ năng — bẫy focus, toggle DOM, audit, followSystem ───
// Chạy: node --test tests/e2e/accessibility.spec.js  (cần npm run build trước)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.E2E_A11Y_PORT || 5326);
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
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem("sgk_settings"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  return page;
}

async function openSettings(page) {
  await page.click('button[aria-label="Cài đặt"]');
  await page.waitForSelector('.st-modal[aria-modal="true"]', { timeout: 8000 });
  await page.click('.st-nav:has-text("Trợ năng")');
  await page.waitForSelector("#sec-a11y");
}

test("Trợ năng: focus trap giữ Tab trong modal, Escape đóng + trả focus về nút Cài đặt", async () => {
  const page = await freshPage();
  try {
    await page.click('button[aria-label="Cài đặt"]');
    await page.waitForSelector('.st-modal[aria-modal="true"]', { timeout: 8000 });
    await page.waitForTimeout(200);

    const inside = await page.evaluate(() => {
      const m = document.querySelector(".st-modal");
      return !!m && m.contains(document.activeElement);
    });
    assert.equal(inside, true, "focus ban đầu phải nằm trong modal");

    for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
    const stillInside = await page.evaluate(() => document.querySelector(".st-modal")?.contains(document.activeElement) === true);
    assert.equal(stillInside, true, "Tab 30 lần không được thoát khỏi modal");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".st-modal").count(), 0, "Escape phải đóng modal");

    const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
    assert.equal(back, "Cài đặt", "focus phải trả về nút mở Cài đặt");
  } finally {
    await page.close();
  }
});

test("Toggle gạch chân + thanh đọc: data attrs + rr-band theo chuột, tắt thì sạch", async () => {
  const page = await freshPage();
  try {
    await openSettings(page);

    await page.click('#sec-a11y .st-field:has-text("Gạch chân liên kết") .st-toggle');
    await page.click('#sec-a11y .st-field:has-text("Thanh đọc theo con trỏ") .st-toggle');
    await page.waitForTimeout(150);

    const on = await page.evaluate(() => ({
      ul: document.documentElement.getAttribute("data-underline-links"),
      band: !!document.querySelector(".rr-band.on"),
    }));
    assert.equal(on.ul, "true", "data-underline-links phải bật");
    assert.equal(on.band, true, "rr-band phải tồn tại và đang bật");

    await page.mouse.move(500, 300);
    await page.waitForTimeout(150);
    const y = await page.evaluate(() => document.querySelector(".rr-band")?.style.getPropertyValue("--rr-y") || "");
    assert.match(y, /300/, `rr-band phải theo chuột, --rr-y=${y}`);

    await page.click('#sec-a11y .st-field:has-text("Gạch chân liên kết") .st-toggle');
    await page.click('#sec-a11y .st-field:has-text("Thanh đọc theo con trỏ") .st-toggle');
    await page.waitForTimeout(150);
    const off = await page.evaluate(() => ({
      ul: document.documentElement.getAttribute("data-underline-links"),
      band: document.querySelector(".rr-band") !== null,
    }));
    assert.equal(off.ul, null, "tắt gạch chân → attr biến mất");
    assert.equal(off.band, false, "tắt thanh đọc → rr-band bị gỡ");
  } finally {
    await page.close();
  }
});

test("Kiểm tra nhanh trợ năng: panel mở ra đúng 6 nhóm vấn đề", async () => {
  const page = await freshPage();
  try {
    await openSettings(page);
    await page.click("#sec-a11y-tools .fb-toggle");
    await page.waitForSelector("#a11y-audit .st-diag", { timeout: 5000 });
    const rows = await page.locator("#a11y-audit .st-diag li").count();
    assert.equal(rows, 6, `mong 6 nhóm kiểm tra, thấy ${rows}`);
    const msg = await page.locator("#a11y-audit .st-note").first().textContent();
    assert.match(msg || "", /Phát hiện|Tuyệt vời/, "phải có thông báo kết quả role=status");
    const expanded = await page.getAttribute("#sec-a11y-tools .fb-toggle", "aria-expanded");
    assert.equal(expanded, "true", "aria-expanded phải đúng trạng thái");
  } finally {
    await page.close();
  }
});

test("followSystem: HĐH yêu cầu tương phản/giảm chuyển động → tự bật; tắt followSystem → tắt theo", async () => {
  const page = await freshPage();
  try {
    await page.emulateMedia({ contrast: "more", reducedMotion: "reduce" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });

    const sysOn = await page.evaluate(() => ({
      hc: document.documentElement.getAttribute("data-high-contrast"),
      rm: document.documentElement.getAttribute("data-reduce-motion"),
      fs: document.documentElement.getAttribute("data-follow-system"),
    }));
    assert.equal(sysOn.fs, "true", "followSystem mặc định bật");
    assert.equal(sysOn.hc, "true", "OS 'more contrast' → data-high-contrast tự bật");
    assert.equal(sysOn.rm, "true", "OS 'reduce motion' → data-reduce-motion tự bật");

    await openSettings(page);
    const note = await page.locator("#sec-a11y .st-note").first().textContent();
    assert.match(note || "", /Máy đang yêu cầu/, "ghi chú phải báo máy đang yêu cầu");

    await page.click('#sec-a11y .st-field:has-text("Theo cài đặt hệ thống") .st-toggle');
    await page.waitForTimeout(150);
    const sysOff = await page.evaluate(() => ({
      hc: document.documentElement.getAttribute("data-high-contrast"),
      rm: document.documentElement.getAttribute("data-reduce-motion"),
      fs: document.documentElement.getAttribute("data-follow-system"),
      note: (document.querySelector("#sec-a11y .st-note")?.textContent || "").trim(),
    }));
    assert.equal(sysOff.hc, null, "tắt followSystem → attr tương phản biến mất dù OS vẫn yêu cầu");
    assert.equal(sysOff.rm, null, "tắt followSystem → attr giảm chuyển động biến mất");
    assert.equal(sysOff.fs, null, "attr follow-system biến mất");
    assert.equal(sysOff.note, "", "ghi chú hệ thống biến mất");
  } finally {
    await page.close();
  }
});
