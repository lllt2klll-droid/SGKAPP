// ── E2E • Cross-tab (BroadcastChannel) ───────────────────────────────────────
// Port 5325 riêng + BOOKS_DIR trỏ thư mục tạm trong os.tmpdir().
// Chứng minh: kho IndexedDB (bảng trắng whiteboard_boards) đổi ở tab A → tab B
// vẫn nhận được sự kiện. Event `storage` của localStorage KHÔNG cover được IndexedDB
// nên nếu thiếu BroadcastChannel thì tab B sẽ không thấy gì.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.E2E_CROSSTAB_PORT || 5325);
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let browser = null;
let context = null;
let pageA = null;
let pageB = null;
let tmpBooks = null;

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

async function waitFor(fn, { timeout = 15000, interval = 250, message = "" } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timeout: ${message} (last=${JSON.stringify(last)})`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bấm nav trong sidebar KHÔNG reload trang (reload sẽ xoá listener đã cài). */
async function clickNav(page, label) {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("aside button")].find((b) =>
      (b.getAttribute("aria-label") || "").includes(t),
    );
    if (btn) btn.click();
  }, label);
}

async function openWhiteboard(page) {
  await clickNav(page, "Bảng trắng");
  await page.waitForSelector("svg.wb-svg", { timeout: 20000 });
  // Tour "30 giây" tự mở ở profile mới khi bảng trống → che nút.
  await dismissTourIfOpen(page);
}

async function dismissTourIfOpen(page) {
  for (let i = 0; i < 3; i++) {
    const closed = await page.evaluate(() => {
      const ov = [...document.querySelectorAll(".modal-overlay")].find((el) =>
        (el.textContent || "").includes("30 giây"),
      );
      if (ov) { ov.click(); return true; }
      return false;
    });
    if (!closed) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Cài listener ghi lại mọi sgk:whiteboard-updated mà tab này nhận được. */
async function installCapture(page) {
  await page.evaluate(() => {
    window.__sgkCap = [];
    if (window.__sgkCapInstalled) return;
    window.__sgkCapInstalled = true;
    window.addEventListener("sgk:whiteboard-updated", (e) => {
      window.__sgkCap.push({ detail: e.detail ?? null, at: Date.now() });
    });
  });
}

async function clearCapture(page) {
  await page.evaluate(() => {
    window.__sgkCap = [];
  });
}

async function readCapture(page) {
  return page.evaluate(() => window.__sgkCap || []);
}

/**
 * Chỉ coi là "đúng sự kiện BroadcastChannel" khi detail mang domain trắng từ
 * whiteboardStore (_emitWB) — echo của event `storage` có source "cross-tab-sync"
 * và không có domain → loại ra để không dương tính giả.
 */
function channelHits(cap) {
  return cap.filter((x) => x.detail && x.detail.domain === "whiteboard" && x.detail.source !== "cross-tab-sync");
}

async function openBase(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html khong ton tai — hãy chạy `npm run build` trước khi chạy e2e.");
  }

  tmpBooks = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-e2e-ctab-"));

  if (!(await healthy(BASE))) {
    serverProcess = spawn(process.execPath, ["--no-warnings", "server.js"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), BOOKS_DIR: tmpBooks },
      stdio: "ignore",
    });
    if (!(await waitHealthy(BASE, 20000))) {
      throw new Error(`Khong khoi duoc server e2e tren ${BASE}`);
    }
  }

  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  pageA = await context.newPage();
  pageB = await context.newPage();
  for (const p of [pageA, pageB]) {
    p.on("dialog", (d) => d.accept());
    p.on("pageerror", (e) => console.error("[e2e pageerror]", e.message));
    await openBase(p);
  }
  // Cho app khởi động xong (migrations/ghi cài đặt lúc boot) trước khi bắt sự kiện
  await sleep(1500);
  await installCapture(pageA);
  await installCapture(pageB);
});

after(async () => {
  try { if (context) await context.close(); } catch {}
  context = null;
  pageA = null;
  pageB = null;
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
  if (tmpBooks) {
    try { fs.rmSync(tmpBooks, { recursive: true, force: true }); } catch {}
    tmpBooks = null;
  }
});

test("H1 • tab A tạo bảng trắng → tab B nhận sgk:whiteboard-updated", async () => {
  await openWhiteboard(pageA);
  // migration LS → IDB chạy 500ms sau khi nạp module; chờ nó ghi xong để
  // không lẫn sự kiện `storage` vào bằng chứng của BroadcastChannel
  await sleep(1200);
  await clearCapture(pageB);

  await pageA.locator('button[title="Tạo bảng mới"]').click();

  const hit = await waitFor(
    async () => {
      const cap = await readCapture(pageB);
      return channelHits(cap)[0] || null;
    },
    { timeout: 20000, message: "tab B phải nhận sự kiện bảng trắng từ tab A" },
  );

  assert.ok(hit, "tab B chưa nhận được sự kiện bảng trắng");
  assert.equal(hit.detail.domain, "whiteboard", "detail phải là sự kiện từ whiteboardStore");
  assert.equal(typeof hit.detail.action, "string", "detail phải có action (created/updated)");
  assert.notEqual(hit.detail.source, "cross-tab-sync", "phải đến qua BroadcastChannel, không phải echo storage");
});

test("H2 • tab B vẫn ở Dashboard — broadcast không điều hướng tab khác", async () => {
  assert.equal(await pageB.locator("svg.wb-svg").count(), 0, "tab B không được tự mở Bảng trắng");
  assert.equal(await pageB.locator(".app-shell").count(), 1, "tab B vẫn đang ở app, không bị reload/nhảy view");
});

test("H4 • tab A lưu bảng đang mở chung → tab B hiện banner, Tải bản mới thì hết", async () => {
  const boardName = `E2E-Sync-${Date.now()}`;

  // A mở bảng trắng + tạo bảng mới (A đứng trên bảng mới)
  await openWhiteboard(pageA);
  await sleep(800);
  await pageA.locator('button[title="Tạo bảng mới"]').click();
  await waitFor(async () => ((await pageA.locator(".whiteboard-toast").textContent()) || "").includes("Đã tạo bảng mới"), {
    timeout: 15000, message: "toast Đã tạo bảng mới (A)",
  });
  // Đổi tên để tab B tìm đúng bảng
  await pageA.locator(".wb-uni-title").fill(boardName);
  await pageA.keyboard.press("Enter");
  await waitFor(async () => ((await pageA.locator(".whiteboard-toast").textContent()) || "").includes("Đã đổi tên"), {
    timeout: 15000, message: "toast Đã đổi tên (A)",
  });

  // B mount mới (thấy bảng A vừa tạo) rồi mở đúng bảng đó qua drawer
  await openBase(pageB);
  await openWhiteboard(pageB);
  await sleep(800);
  await pageB.locator('button[title="Danh sách bảng — chuyển bảng, đổi tên, nhân bản"]').click();
  await pageB.locator(".whiteboard-drawer-item", { hasText: boardName }).first().locator(".wb-board-main").click();
  // B có thể đã tự mở sẵn đúng bảng này (activeId) nên switchBoard im lặng, không phát toast "Đã mở".
  // Chốt chắc B đang đứng trên bảng của A qua tiêu đề bảng, không phụ thuộc toast.
  await waitFor(async () => (await pageB.locator(".wb-uni-title").inputValue()) === boardName, {
    timeout: 15000, message: "tab B mở đúng bảng của A",
  });

  // A lưu tay → B phải hiện banner (không tự ghi đè), A không có banner của chính mình
  await pageA.locator('button[title="Lưu ngay (Ctrl+S)"]').click();
  await pageB.waitForSelector(".whiteboard-remote-bar", { timeout: 20000 });
  assert.equal(await pageB.locator(".whiteboard-remote-bar").count(), 1, "tab B phải hiện banner bản mới");
  assert.equal(await pageA.locator(".whiteboard-remote-bar").count(), 0, "tab A không được hiện banner của chính mình");

  // B bấm Tải bản mới → banner biến mất
  await pageB.locator(".whiteboard-remote-bar button", { hasText: "Tải bản mới" }).click();
  await pageB.waitForSelector(".whiteboard-remote-bar", { state: "detached", timeout: 10000 });
  assert.equal(await pageB.locator(".whiteboard-remote-bar").count(), 0, "banner phải đóng sau khi tải");
});

test("H3 • chiều ngược lại: tab B tạo bảng → tab A nhận", async () => {
  // reload tab A → listener bị xoá → cài lại, rồi mới bắt đầu đếm
  await openBase(pageA);
  await installCapture(pageA);
  await sleep(800);
  await clearCapture(pageA);

  await openWhiteboard(pageB);
  await sleep(600);
  await pageB.locator('button[title="Tạo bảng mới"]').click();

  const hit = await waitFor(
    async () => {
      const cap = await readCapture(pageA);
      return channelHits(cap)[0] || null;
    },
    { timeout: 20000, message: "tab A phải nhận sự kiện bảng trắng từ tab B" },
  );

  assert.ok(hit, "tab A chưa nhận được sự kiện bảng trắng");
  assert.equal(hit.detail.domain, "whiteboard", "detail phải là sự kiện từ whiteboardStore");
  assert.ok(hit.detail.id, "detail phải có id bảng");
});
