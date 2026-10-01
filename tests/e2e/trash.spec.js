// ── E2E • Thùng rác 30 ngày + Hoàn tác 6s + Cảnh báo bộ nhớ ────────────────
// Khác smoke.spec: chạy trên server RIÊNG trỏ vào thư mục sách tạm thời trong
// os.tmpdir() → không bao giờ đụng tới thư mục sách thật của người dùng,
// và localStorage nằm trong context trình duyệt tạm nên cũng không lưu lại.
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
const PORT = Number(process.env.E2E_TRASH_PORT || 5322);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOK_FILE = "01-e2e-sach-thu.pdf";

// PDF tối thiểu — server chỉ kiểm magic "%PDF-" ở byte đầu
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

async function listBooks() {
  const r = await fetch(`${BASE}/api/books`);
  return r.json();
}

/** Thẻ sách trong thư viện (grid .libx-book hoặc list .libx-row). */
function card() {
  return page.locator(".libx-book, .libx-row").filter({ hasText: bookTitle });
}

async function gotoLibrary() {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("aside button")].find((b) =>
      (b.getAttribute("aria-label") || "").includes("Thư viện sách"),
    );
    if (btn) btn.click();
  });
  await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
}

async function openDeleteModal() {
  // grid dùng title="Xóa sách", list dùng title="Xóa" → chung class là libx-icobtn.danger
  await card().locator("button.libx-icobtn.danger").first().click();
  await page.waitForSelector("#del-title", { timeout: 5000 });
}

async function gotoDataTools() {
  await page.locator('aside .sidebar-footer-nav button[aria-label^="Sao lưu"]').click();
  await page.waitForSelector(".dt-card", { timeout: 20000 });
}

function trashCard() {
  return page.locator(".dt-card").filter({ hasText: "Thùng rác" });
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

  const books = await listBooks();
  assert.equal(books.length, 1, "server e2e phải chỉ thấy đúng 1 sách trong thư mục tạm");
  bookTitle = books[0].title;

  browser = await chromium.launch();
  // Một context sống xuyên suốt các test → trạng thái (thùng rác, badge) nối tiếp được
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
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
  if (tmpBooks) {
    try { fs.rmSync(tmpBooks, { recursive: true, force: true }); } catch {}
    tmpBooks = null;
  }
});

test("D1 • thư viện thấy sách test, cô lập hoàn toàn với thư mục sách thật", async () => {
  await gotoLibrary();
  assert.equal(await card().count(), 1, `phải thấy đúng sách "${bookTitle}"`);
  // Sách chỉ nằm trong thư mục tạm, không có trong ../books
  assert.ok(!fs.existsSync(path.join(ROOT, "..", "books", BOOK_FILE)), "không được ghi vào thư mục sách thật");
});

test("D2 • modal xác nhận xóa: focus mặc định vào Hủy, Escape đóng mà sách không bị đụng", async () => {
  await gotoLibrary();
  await openDeleteModal();
  assert.match(await page.locator("#del-title").textContent(), /thùng rác/i);

  const focused = await page.evaluate(() => (document.activeElement?.textContent || "").trim());
  assert.equal(focused, "Hủy", `focus mặc định phải là nút an toàn, thấy "${focused}"`);

  await page.keyboard.press("Escape");
  await page.waitForSelector("#del-title", { state: "detached", timeout: 3000 });
  assert.equal(await card().count(), 1, "Escape = hủy, sách vẫn còn nguyên");
});

test("D3 • đưa sách vào thùng rác: ẩn khỏi thư viện + badge đỏ ở footer = 1", async () => {
  await gotoLibrary();
  await openDeleteModal();
  await page.locator(".modal-content button", { hasText: "Vào thùng rác" }).click();
  await page.waitForSelector("#del-title", { state: "detached", timeout: 3000 });
  await card().waitFor({ state: "detached", timeout: 8000 });
  assert.equal(await card().count(), 0, "sách đã ẩn khỏi thư viện");

  await page.waitForSelector("aside .sidebar-footer-nav .nav-item-badge", { timeout: 5000 });
  const badge = await page.locator("aside .sidebar-footer-nav .nav-item-badge").textContent();
  assert.equal(badge.trim(), "1", `badge phải đếm đúng mục trong thùng rác, thấy "${badge}"`);

  // File thì vẫn còn nguyên trên máy
  assert.ok(fs.existsSync(path.join(tmpBooks, BOOK_FILE)), "soft-delete: file PDF chưa bị xóa");
  const books = await listBooks();
  assert.equal(books.length, 1, "API vẫn trả về sách vì file chưa bị xóa");
});

test("D4 • Khôi phục từ card Thùng rác: sách quay lại thư viện, badge mất", async () => {
  await gotoDataTools();
  const tc = trashCard();
  assert.equal(await tc.count(), 1, "phải có card Thùng rác");
  assert.equal(await tc.locator(".tag-pill").count(), 1, "thùng rác đang giữ 1 mục");

  await tc.locator("button", { hasText: "Khôi phục" }).first().click();
  await waitFor(async () => (await tc.locator(".tag-pill").count()) === 0, { message: "mục đã ra khỏi thùng rác" });

  await gotoLibrary();
  assert.equal(await card().count(), 1, "sách đã trở lại thư viện");
  assert.equal(
    await page.locator("aside .sidebar-footer-nav .nav-item-badge").count(),
    0,
    "thùng rác trống thì badge phải biến mất",
  );
});

test("D5 • nút Hoàn tác 6 giây đưa sách về ngay, không cần rời màn hình", async () => {
  await gotoLibrary();
  await openDeleteModal();
  await page.locator(".modal-content button", { hasText: "Vào thùng rác" }).click();
  await page.waitForSelector(".upload-notice.ok", { timeout: 5000 });

  const undo = page.locator(".upload-notice button", { hasText: "Hoàn tác" });
  assert.equal(await undo.count(), 1, "toast phải kèm nút Hoàn tác");
  // Toast đang animate + tự biến mất sau 6s → Playwright chờ "stable" có thể kéo dài
  // tới khi toast detach (đã gặp 1 lần). Element đã được assert tồn tại → click thẳng.
  await undo.click({ force: true });
  await waitFor(async () => (await card().count()) === 1, { message: "sách quay lại sau Hoàn tác" });

  assert.equal(await card().count(), 1, "bấm Hoàn tác là sách quay lại ngay");
  await waitFor(
    async () => /Đã hoàn tác/.test((await page.locator(".upload-notice").textContent()) || ""),
    { message: "toast Đã hoàn tác" },
  );
  assert.match(await page.locator(".upload-notice").textContent(), /Đã hoàn tác/);
  assert.equal(
    await page.locator(".upload-notice button", { hasText: "Hoàn tác" }).count(),
    0,
    "đã hoàn tác rồi thì không còn nút Hoàn tác",
  );
  assert.equal(await page.locator("aside .sidebar-footer-nav .nav-item-badge").count(), 0, "thùng rác rỗng");
});

test("D6 • Xóa ngay trong thùng rác = xóa file thật (API + ổ đĩa) — test cuối", async () => {
  await gotoLibrary();
  await openDeleteModal();
  await page.locator(".modal-content button", { hasText: "Vào thùng rác" }).click();
  await page.waitForSelector("#del-title", { state: "detached", timeout: 3000 });
  await card().waitFor({ state: "detached", timeout: 8000 });

  await gotoDataTools();
  await trashCard().locator('button[aria-label="Xóa ngay"]').click();
  // dialog đã được accept sẵn ở before()
  await waitFor(async () => !fs.existsSync(path.join(tmpBooks, BOOK_FILE)), {
    message: "file PDF bị xóa khỏi ổ đĩa",
  });

  const books = await listBooks();
  assert.equal(books.length, 0, "API không còn trả về sách đã xóa vĩnh viễn");
  assert.equal(fs.existsSync(path.join(tmpBooks, BOOK_FILE)), false, "file đã bị xóa khỏi ổ đĩa");
  await waitFor(async () => (await trashCard().locator(".tag-pill").count()) === 0, { message: "thùng rác trống" });
  assert.equal(await trashCard().locator(".tag-pill").count(), 0, "thùng rác sạch");
});

test("D7 • Cảnh báo bộ nhớ đầy 98% → banner có nút Sao lưu ngay (context mới)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  try {
    await p.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "storage", {
          configurable: true,
          value: { estimate: async () => ({ usage: 99, quota: 100 }) },
        });
      } catch { /* đã bị định nghĩa bởi trình duyệt — bỏ qua */ }
    });
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    // .dash-notice có thể có thêm card "chưa đọc gì" của app → chỉ bám banner nguy hiểm (danger)
    await p.waitForSelector(".dash-notice.error", { timeout: 20000 });
    const text = await p.locator(".dash-notice.error").textContent();
    assert.match(text, /99%/, "banner phải nêu đúng % đã dùng");
    assert.equal(await p.locator('.dash-notice.error button:has-text("Sao lưu ngay")').count(), 1, "thiếu nút Sao lưu ngay");
    assert.equal(
      await p.locator('.dash-notice.error button:has-text("Dọn & Khôi phục")').count(),
      1,
      "thiếu nút Dọn & Khôi phục",
    );
  } finally {
    await ctx.close();
  }
});
