// ── E2E • Bảng trắng + Quét ảnh (Scan) ─────────────────────────────────────
// Port 5324 riêng + BOOKS_DIR trỏ thư mục tạm trong os.tmpdir().
// PDF được dựng đúng xref (không dùng file rác) để pdf.js render được canvas →
// mới crop và mở được ScanModal.
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
const PORT = Number(process.env.E2E_BOARD_PORT || 5324);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOK_FILE = "01-e2e-sach-thu.pdf";

/** PDF 1 trang hợp lệ: header + objects + xref có offset đúng. */
function buildPdf() {
  const header = "%PDF-1.4\n";
  const stream = "BT /F1 24 Tf 72 700 Td (Hello SGK) Tj ET";
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let body = header;
  const offsets = [];
  bodies.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const xrefStart = body.length;
  let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, "latin1");
}

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

async function gotoViewByLabel(label) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("aside button")].find((b) =>
      (b.getAttribute("aria-label") || "").includes(t),
    );
    if (btn) btn.click();
  }, label);
}

/** Đọc toàn bộ bảng (IDB sau migrate, fallback localStorage trước migrate). */
function readBoards() {
  return page.evaluate(async () => {
    const fromRows = (rows) =>
      rows.map((b) => ({ name: b.name, texts: (b.objects || []).map((o) => o.text).filter(Boolean) }));
    try {
      const rows = await new Promise((resolve, reject) => {
        const rq = indexedDB.open("SGKAppDB");
        rq.onerror = () => reject(rq.error);
        rq.onsuccess = () => {
          try {
            const tx = rq.result.transaction("whiteboard_boards", "readonly");
            const g = tx.objectStore("whiteboard_boards").getAll();
            g.onsuccess = () => resolve(g.result || []);
            g.onerror = () => reject(g.error);
          } catch (e) {
            reject(e);
          }
        };
      });
      if (rows.length) return fromRows(rows);
    } catch { /* chưa có IDB → fallback LS */ }
    try {
      const idx = JSON.parse(localStorage.getItem("sgk_wb_index") || "[]");
      return idx.map((x) => {
        const b = JSON.parse(localStorage.getItem(`sgk_wb_board_${x.id}`) || "null");
        return { name: x.name, texts: ((b || {}).objects || []).map((o) => o.text).filter(Boolean) };
      });
    } catch {
      return [];
    }
  });
}

function readBoardNames() {
  return readBoards().then((rows) => rows.map((r) => r.name));
}

function canvasText() {
  return page.evaluate(() => document.querySelector("svg.wb-svg")?.textContent || "");
}

async function openWhiteboard() {
  await gotoViewByLabel("Bảng trắng");
  await page.waitForSelector("svg.wb-svg", { timeout: 20000 });
}

async function openLibrary() {
  await gotoViewByLabel("Thư viện sách");
  await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html khong ton tai — hãy chạy `npm run build` trước khi chạy e2e.");
  }

  tmpBooks = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-e2e-books-"));
  fs.writeFileSync(path.join(tmpBooks, BOOK_FILE), buildPdf());

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

// ── BẢNG TRẮNG ────────────────────────────────────────────────────────────

test("G1 • mở Bảng trắng từ sidebar → có canvas svg", async () => {
  await openWhiteboard();
  assert.equal(await page.locator("svg.wb-svg").count(), 1, "phải có canvas svg");
  // thanh công cụ không bị thu gọn mặc định
  assert.ok(
    (await page.locator("button.wb-tool").count()) > 0,
    "toolbar phải đang mở (chưa ai set sgk:whiteboard-toolbar-collapsed)",
  );
});

test("G2 • Tạo bảng mới → toast + số bảng tăng", async () => {
  await openWhiteboard();
  const before = await readBoardNames();
  assert.ok(before.length >= 1, "phải đã có ít nhất 1 bảng (seed 'Bảng của tôi')");

  await page.locator('button[title="Tạo bảng mới"]').click();
  await waitFor(async () => /Đã tạo bảng mới/.test((await page.locator(".whiteboard-toast").textContent()) || ""), {
    message: "toast Đã tạo bảng mới",
  });

  const after = await waitFor(
    async () => {
      const n = await readBoardNames();
      return n.length > before.length ? n : null;
    },
    { message: "số bảng tăng" },
  );
  assert.ok(after.length > before.length, `số bảng phải tăng: ${before.length} → ${after.length}`);
});

test("G3 • chọn công cụ Hình khối → click canvas → thêm khối 'Khối' + lưu", async () => {
  await openWhiteboard();
  await page.locator('button.wb-tool[title="Hình khối (S/4)"]').click();
  await page.locator("svg.wb-svg").click({ position: { x: 420, y: 300 } });

  await waitFor(async () => (await canvasText()).includes("Khối"), { message: "khối 'Khối' xuất hiện trên canvas" });
  assert.match(await canvasText(), /Khối/, "canvas phải có text 'Khối'");

  // Bấm lưu chủ đích — autosave debounce 900ms, test sau có thể navigate away
  await page.locator('button[title="Lưu ngay (Ctrl+S)"]').click();
  await waitFor(
    async () => {
      const rows = await readBoards();
      return rows.some((r) => r.texts.includes("Khối")) ? rows : null;
    },
    { timeout: 15000, message: "khối 'Khối' đã được ghi xuống storage" },
  );
});

test("G4 • reload → bảng và khối đã vẽ vẫn còn trong storage", async () => {
  // Không navigate trước: trang vẫn đang ở Bảng trắng từ G3
  const namesBefore = await readBoardNames();
  assert.ok(namesBefore.length >= 2, `trước reload phải có ≥2 bảng, thấy ${namesBefore.length}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  // reload không nhớ view cũ → mở lại Bảng trắng bằng nav
  await openWhiteboard();

  const rows = await waitFor(
    async () => {
      const r = await readBoards();
      return r.some((x) => x.texts.includes("Khối")) ? r : null;
    },
    { timeout: 20000, message: "khối 'Khối' còn sau reload" },
  );
  assert.ok(rows.some((r) => r.texts.includes("Khối")), "reload không được mất khối đã vẽ");
  assert.equal((await readBoardNames()).length, namesBefore.length, "số bảng sau reload phải giữ nguyên");
});

// ── QUÉT ẢNH ──────────────────────────────────────────────────────────────

test("G5 • mở sách → bật Quét vùng → overlay chọn vùng hiện ra", async () => {
  await openLibrary();
  await page.locator(".libx-book, .libx-row").filter({ hasText: bookTitle }).first().click();
  await page.waitForSelector('button[aria-label="Quét vùng"]', { timeout: 30000 });

  // Không được bấm quét trước khi pdf.js vẽ xong canvas → crop sẽ thất bại âm thầm
  await waitFor(
    async () =>
      page.evaluate(() => {
        const c = [...document.querySelectorAll("canvas")].find((x) => x.width > 100 && x.height > 100);
        if (!c) return false;
        try {
          return c.toDataURL("image/png").length > 5000;
        } catch {
          return false;
        }
      }),
    { timeout: 30000, message: "PDF canvas đã render xong" },
  );

  await page.locator('button[aria-label="Quét vùng"]').click();
  await page.waitForSelector(".scan-overlay", { timeout: 15000 });

  // Nút "Quét vùng này" chỉ hiện sau khi đã chọn được vùng — đúp = chọn cả trang
  await page.locator(".scan-overlay").dblclick({ position: { x: 300, y: 300 } });
  await waitFor(async () => (await page.locator('button[aria-label="Quét vùng này"]').count()) === 1, {
    timeout: 10000,
    message: "nút Quét vùng này sau khi chọn vùng",
  });
  assert.equal(await page.locator('button[aria-label="Quét vùng này"]').count(), 1, "thiếu nút Quét vùng này");
});

test("G6 • Quét vùng này → modal mở + ảnh đã lưu vào sgk_scans_v1", async () => {
  await waitFor(async () => (await page.locator('button[aria-label="Quét vùng này"]').count()) === 1, {
    timeout: 15000,
    message: "nút Quét vùng này",
  });
  await page.locator('button[aria-label="Quét vùng này"]').click();

  await page.waitForSelector('div[role="dialog"][aria-label="Tạo học liệu từ vùng SGK"]', { timeout: 20000 });
  const scans = await waitFor(
    async () => {
      const list = await page.evaluate(() => JSON.parse(localStorage.getItem("sgk_scans_v1") || "[]"));
      return Array.isArray(list) && list.length > 0 ? list : null;
    },
    { timeout: 20000, message: "sgk_scans_v1 có dữ liệu" },
  );

  assert.ok(scans.length >= 1, "phải lưu được ≥1 mục scan");
  const item = scans[scans.length - 1];
  assert.ok(item.book?.filename === BOOK_FILE || item.bookId, "mục scan phải gắn với sách");
  assert.ok(item.dataUrl?.startsWith("data:image/"), "mục scan phải có dataUrl ảnh crop");
});

test("G7 • Escape đóng modal quét, overlay biến mất", async () => {
  await page.waitForSelector('div[role="dialog"][aria-label="Tạo học liệu từ vùng SGK"]', { timeout: 10000 });
  // Bắt focus vào đúng modal (app tự focus nút X sau 80ms, nhưng AI báo lỗi có thể
  // kéo focus ra ngoài → Escape sẽ bị handler của reader nuốt mất)
  await page.locator('button[aria-label="Đóng (Esc)"]').focus();
  await page.keyboard.press("Escape");
  await page.waitForSelector('div[role="dialog"][aria-label="Tạo học liệu từ vùng SGK"]', {
    state: "detached",
    timeout: 5000,
  });
  assert.equal(
    await page.locator('div[role="dialog"][aria-label="Tạo học liệu từ vùng SGK"]').count(),
    0,
    "modal phải đóng hẳn",
  );
});
