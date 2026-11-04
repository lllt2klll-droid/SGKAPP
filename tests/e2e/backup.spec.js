// ── E2E • Sao lưu / Khôi phục bằng file ────────────────────────────────────
// Port 5323 riêng + BOOKS_DIR trỏ thư mục tạm trong os.tmpdir() → không đụng
// thư mục sách thật; localStorage nằm trong context trình duyệt tạm.
// Flow: ghim 1 sách → xuất file JSON → xóa toàn bộ →
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
const LARGE_LOCAL_KEY = "sgk_autosave_e2e_large";
const LARGE_LOCAL_CONTENT = "L".repeat(256 * 1024);
const LARGE_SCAN_CONTENT = "S".repeat(768 * 1024);
const LARGE_IMAGE_CONTENT = "I".repeat(384 * 1024);

async function seedLargeBackupData() {
  await page.evaluate(async ({ localKey, localContent, scanContent, imageContent }) => {
    localStorage.setItem(localKey, JSON.stringify({ content: localContent }));
    const request = indexedDB.open("SGKAppDB");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["scan_assets", "wb_images", "note_images"], "readwrite");
    tx.objectStore("scan_assets").put({ id: "e2e-large-scan", content: scanContent });
    tx.objectStore("wb_images").put({
      id: "e2e-large-whiteboard-image",
      blob: new Blob([imageContent], { type: "image/png" }),
    });
    tx.objectStore("note_images").put({
      id: "e2e-large-note-image",
      bookFilename: "e2e-book.pdf",
      blob: new Blob([imageContent], { type: "image/jpeg" }),
    });
    tx.objectStore("note_images").put({
      id: "e2e-legacy-note-image",
      bookFilename: "e2e-legacy-book.pdf",
      dataUrl: "data:image/png;base64,AQID",
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, {
    localKey: LARGE_LOCAL_KEY,
    localContent: LARGE_LOCAL_CONTENT,
    scanContent: LARGE_SCAN_CONTENT,
    imageContent: LARGE_IMAGE_CONTENT,
  });
}

async function readIndexedFixtures() {
  return page.evaluate(async () => {
    const request = indexedDB.open("SGKAppDB");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["scan_assets", "wb_images", "note_images"], "readonly");
    const read = (store) => new Promise((resolve, reject) => {
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const [scans, boardImages, noteImages] = await Promise.all([
      read("scan_assets"), read("wb_images"), read("note_images"),
    ]);
    db.close();
    const blobInfo = async (record) => record?.blob ? {
      size: record.blob.size,
      type: record.blob.type,
      text: await record.blob.text(),
    } : null;
    return {
      scans: scans.filter((x) => x.id === "e2e-large-scan"),
      boardImages: await Promise.all(boardImages.filter((x) => x.id === "e2e-large-whiteboard-image").map(async (x) => ({ id: x.id, blob: await blobInfo(x) }))),
      noteImages: await Promise.all(noteImages.filter((x) => x.id === "e2e-large-note-image").map(async (x) => ({
        id: x.id,
        bookFilename: x.bookFilename,
        blob: await blobInfo(x),
      }))),
      legacyNoteImages: noteImages.filter((x) => x.id === "e2e-legacy-note-image"),
    };
  });
}

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

function restoreCard() {
  return page.locator(".dt-restore-card");
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
  await seedLargeBackupData();
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
  assert.equal(payload.indexedDataAvailable, true, "IndexedDB phải được nhận diện khi xuất");
  assert.equal(payload.indexedDataComplete, true, "sao lưu thủ công phải bao phủ mọi kho IndexedDB");
  assert.equal(JSON.parse(payload.data[LARGE_LOCAL_KEY]).content.length, LARGE_LOCAL_CONTENT.length);
  assert.equal(payload.indexedData.scan_assets.find((x) => x.id === "e2e-large-scan").content.length, LARGE_SCAN_CONTENT.length);
  assert.equal(payload.indexedData.wb_images.find((x) => x.id === "e2e-large-whiteboard-image").blob.size, LARGE_IMAGE_CONTENT.length);
  assert.equal(payload.indexedData.note_images.find((x) => x.id === "e2e-large-note-image").blob.mimeType, "image/jpeg");
  assert.ok(fs.statSync(src).size > 1024 * 1024, "fixture dữ liệu lớn phải có mặt trong file sao lưu");

  await page.waitForSelector(".dt-msg.ok", { timeout: 10000 });
  assert.match(await page.locator(".dt-msg.ok").textContent(), /Đã tải xuống file sao lưu/);
});

test("F3 • Xóa toàn bộ dữ liệu: yêu cầu sao lưu, xác nhận hai lần, sgk_favs sạch", async () => {
  await gotoDataTools();

  const wipeBtn = page.locator(".dt-wipe-card button", { hasText: "Xóa toàn bộ dữ liệu" });
  // F2 đã tạo backup thủ công; thao tác xóa yêu cầu bấm xác nhận hai lần.
  await wipeBtn.click();
  await page.waitForSelector(".dt-msg.err", { timeout: 10000 });
  const armedBtn = page.locator(".dt-wipe-card button", { hasText: "Bấm lần nữa để xác nhận" });
  assert.equal(await armedBtn.count(), 1, "bấm lần 1 phải chuyển nút sang trạng thái armed");

  const navP = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
  await armedBtn.click();
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
  const afterWipe = await readIndexedFixtures();
  assert.equal(afterWipe.scans.length + afterWipe.boardImages.length + afterWipe.noteImages.length + afterWipe.legacyNoteImages.length, 0,
    "wipe phải xóa các record IndexedDB thuộc fixture");
});

test("F4 • Khôi phục từ file vừa xuất: preview → tick → xác nhận → dữ liệu quay lại", async () => {
  assert.ok(backupPath && fs.existsSync(backupPath), "cần file đã xuất ở F2");

  await gotoDataTools();
  await restoreCard().locator('input[type="file"]').setInputFiles(backupPath);

  await page.waitForSelector("#preview-title", { timeout: 15000 });
  const previewText = await page.locator(".dt-import-review").textContent();
  assert.match(previewText, /LocalStorage/, "preview phải nêu số key localStorage");

  // Không tick thì nút xác nhận bị disabled
  const confirmBtn = page.locator(".dt-import-review button", { hasText: "Xác nhận khôi phục" });
  assert.equal(await confirmBtn.isDisabled(), true, "nút xác nhận phải bị khóa khi chưa tick");

  await page.locator(".dt-import-review input[type='checkbox']").check();
  assert.equal(await confirmBtn.isEnabled(), true, "tick rồi thì nút xác nhận phải mở");

  const navP = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 });
  await confirmBtn.click();
  const nav = await navP.catch(() => null);
  if (!nav) {
    const message = await page.locator(".dt-msg").textContent().catch(() => "");
    assert.fail(`khôi phục không tải lại trang; thông báo: ${message}`);
  }
  await waitForAppReady();
  await waitFor(async () => (await favs()).length === 1, { message: "sgk_favs sau khôi phục" });

  assert.deepEqual(await favs(), [BOOK_FILE], "khôi phục phải trả lại đúng sgk_favs");
  const localLarge = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), LARGE_LOCAL_KEY);
  assert.equal(localLarge.content.length, LARGE_LOCAL_CONTENT.length, "localStorage dữ liệu lớn phải giữ nguyên");
  const restored = await readIndexedFixtures();
  assert.equal(restored.scans[0]?.content.length, LARGE_SCAN_CONTENT.length, "record scan lớn phải khôi phục nguyên vẹn");
  assert.equal(restored.boardImages[0]?.blob.size, LARGE_IMAGE_CONTENT.length, "Blob bảng trắng giữ nguyên kích thước");
  assert.equal(restored.boardImages[0]?.blob.type, "image/png");
  assert.equal(restored.noteImages[0]?.blob.size, LARGE_IMAGE_CONTENT.length, "Blob ghi chú giữ nguyên kích thước");
  assert.equal(restored.noteImages[0]?.blob.type, "image/jpeg");
  assert.equal(restored.noteImages[0]?.bookFilename, "e2e-book.pdf", "metadata ảnh ghi chú phải giữ nguyên");
  assert.equal(restored.legacyNoteImages[0]?.dataUrl, "data:image/png;base64,AQID", "ảnh ghi chú inline cũ phải giữ nguyên");
  assert.equal(restored.legacyNoteImages[0]?.bookFilename, "e2e-legacy-book.pdf");
  assert.equal(restored.boardImages[0].blob.text, LARGE_IMAGE_CONTENT);

  await gotoLibrary();
  const card = page.locator(".libx-book, .libx-row").filter({ hasText: bookTitle });
  assert.equal(await card.locator(".libx-fav.on").count(), 1, "sao yêu thích phải sáng lại trên bìa");
});
