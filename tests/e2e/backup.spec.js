// ── E2E • Sao lưu / Khôi phục bằng file ────────────────────────────────────
// Port 5323 riêng + BOOKS_DIR trỏ thư mục tạm trong os.tmpdir() → không đụng
// thư mục sách thật; localStorage nằm trong context trình duyệt tạm.
// Flow: ghim 1 sách → xuất file JSON → xóa toàn bộ (kèm tải file khẩn) →
//       khôi phục từ chính file vừa xuất → dữ liệu quay lại.
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
const PORT = Number(process.env.E2E_BACKUP_PORT || 5323);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOK_FILE = "01-e2e-sach-thu.pdf";

const MIN_PDF = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  "utf-8",
);

let serverProcess = null;
let browser = null;
let context = null;
let page = null;
let tmpBooks = null;
let tmpDir = null;
let backupPath = null;
let bookTitle = null;

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

async function favs() {
  return page.evaluate(() => JSON.parse(localStorage.getItem("sgk_favs") || "[]"));
}

async function waitForAppReady() {
  await page.waitForSelector(".app-shell", { timeout: 20000 });
}

async function gotoView(navText) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await waitForAppReady();
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("aside button")].find((b) =>
      (b.getAttribute("aria-label") || "").includes(t),
    );
    if (btn) btn.click();
  }, navText);
}

async function gotoLibrary() {
  await gotoView("Thư viện sách");
  await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
}

async function gotoDataTools() {
  await gotoView("Sao lưu");
  await page.waitForSelector(".dt-card", { timeout: 20000 });
}

function backupCard() {
  return page.locator(".dt-card").filter({ hasText: "Xuất file sao lưu" });
}

/** Chờ có điều kiện — thay cho waitForTimeout cố định (tránh flaky). */
async function waitFor(fn, { timeout = 15000, interval = 200, message = "" } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timeout: ${message} (last=${JSON.stringify(last)})`);
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html khong ton tai — hãy chạy `npm run build` trước khi chạy e2e.");
  }

  tmpBooks = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-e2e-books-"));
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-e2e-backup-"));
  fs.writeFileSync(path.join(tmpBooks, BOOK_FILE), MIN_PDF);

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

  const r = await fetch(`${BASE}/api/books`);
  const books = await r.json();
  assert.equal(books.length, 1, "server e2e phải chỉ thấy đúng 1 sách trong thư mục tạm");
  bookTitle = books[0].title;

  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => console.error("[e2e pageerror]", e.message));
});

after(async () => {
  try { if (context) await context.close(); } catch {}
  context = null;
  page = null;
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
  for (const dir of [tmpBooks, tmpDir]) {
    if (!dir) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tmpBooks = null;
  tmpDir = null;
});

test("F1 • ghim 1 sách từ thư viện (tạo dữ liệu thật qua UI)", async () => {
  await gotoLibrary();
  const card = page.locator(".libx-book, .libx-row").filter({ hasText: bookTitle });
  assert.equal(await card.count(), 1, "phải thấy đúng sách test");

  await card.locator(".libx-fav").first().click();
  await waitFor(async () => (await favs()).length === 1, { message: "sgk_favs được ghi" });

  const list = await favs();
  assert.deepEqual(list, [BOOK_FILE], `sgk_favs phải chứa đúng file, thấy ${JSON.stringify(list)}`);
  assert.equal(await card.locator(".libx-fav.on").count(), 1, "sao phải sáng lên");
});

test("F2 • Xuất file sao lưu → tải về JSON hợp lệ, có sgk_favs", async () => {
  await gotoDataTools();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    backupCard().locator("button", { hasText: "Xuất file sao lưu" }).click(),
  ]);

  assert.match(download.suggestedFilename(), /^hanhtrang-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const src = await download.path();
  const text = fs.readFileSync(src, "utf-8");
  // Giữ 1 bản copy riêng — bản gốc bị Playwright dọn khi đóng trình duyệt
  backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, text);

  const payload = JSON.parse(text);
  assert.equal(payload.app, "hanhtrang-tieu-hoc");
  assert.equal(payload.schemaVersion, 2);
  assert.ok(payload.data, "payload phải có nhánh data (localStorage)");
  assert.deepEqual(JSON.parse(payload.data.sgk_favs), [BOOK_FILE], "file sao lưu phải chứa sgk_favs");
  assert.ok(typeof payload.indexedData === "object", "file sao lưu phải có nhánh indexedData");

  await page.waitForSelector(".dt-msg.ok", { timeout: 10000 });
  assert.match(await page.locator(".dt-msg.ok").textContent(), /Đã tải xuống file sao lưu/);
});

test("F3 • Xóa toàn bộ dữ liệu: tự tải file khẩn trước, sgk_favs sạch", async () => {
  await gotoDataTools();

  const navP = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
  const dlP = page.waitForEvent("download", { timeout: 20000 });
  await backupCard().locator("button", { hasText: "Xóa toàn bộ dữ liệu" }).click();

  const rec = await dlP;
  assert.match(
    rec.suggestedFilename(),
    /auto-recovery-before-wipe/,
    "trước khi xóa phải tải sẵn 1 bản khẩn cấp",
  );

  await navP;
  await waitForAppReady();
  await waitFor(async () => (await favs()).length === 0, { message: "sgk_favs sau wipe" });

  assert.deepEqual(await favs(), [], "wipe phải xóa sạch sgk_favs");
  // Sau khi reload app tự dựng lại key cài đặt/một số metadata — chỉ dữ liệu
  // NGƯỜI DÙNG là phải biến mất hẳn (key còn nhưng rỗng thì chấp nhận).
  const survived = await page.evaluate(() => {
    const userKeys = ["sgk_favs", "sgk_bookmarks", "sgk_vocab", "sgk_trash", "sgk_lessonplans", "sgk_collections"];
    const empty = (v) => !v || v === "[]" || v === "{}" || v === "null";
    return userKeys.filter((k) => !empty(localStorage.getItem(k)));
  });
  assert.deepEqual(survived, [], `dữ liệu người dùng còn sót: ${survived.join(", ")}`);
});

test("F4 • Khôi phục từ file vừa xuất: preview → tick → xác nhận → dữ liệu quay lại", async () => {
  assert.ok(backupPath && fs.existsSync(backupPath), "cần file đã xuất ở F2");

  await gotoDataTools();
  await backupCard().locator('input[type="file"]').setInputFiles(backupPath);

  await page.waitForSelector("#preview-title", { timeout: 15000 });
  const previewText = await page.locator(".dt-preview-panel").textContent();
  assert.match(previewText, /LocalStorage/, "preview phải nêu số key localStorage");

  // Không tick thì nút xác nhận bị disabled
  const confirmBtn = page.locator(".dt-preview-panel button", { hasText: "Xác nhận khôi phục" });
  assert.equal(await confirmBtn.isDisabled(), true, "nút xác nhận phải bị khóa khi chưa tick");

  await page.locator(".dt-preview-panel input[type='checkbox']").check();
  assert.equal(await confirmBtn.isEnabled(), true, "tick rồi thì nút xác nhận phải mở");

  const navP = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 });
  await confirmBtn.click();
  await navP;
  await waitForAppReady();
  await waitFor(async () => (await favs()).length === 1, { message: "sgk_favs sau khôi phục" });

  assert.deepEqual(await favs(), [BOOK_FILE], "khôi phục phải trả lại đúng sgk_favs");

  await gotoLibrary();
  const card = page.locator(".libx-book, .libx-row").filter({ hasText: bookTitle });
  assert.equal(await card.locator(".libx-fav.on").count(), 1, "sao yêu thích phải sáng lại trên bìa");
});
