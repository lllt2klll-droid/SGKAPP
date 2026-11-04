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
const PORT = 55000 + (process.pid % 10000);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOK_FILE = "reader-flip-regression.pdf";

let serverProcess = null;
let browser = null;
let tmpBooks = null;

function makePdf(pageCount = 3) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ];
  const colors = ["0.85 0.1 0.1", "0.1 0.4 0.85", "0.15 0.7 0.35"];
  for (let index = 0; index < pageCount; index++) {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const content = `q ${colors[index % colors.length]} rg 0 0 300 400 re f Q`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

async function healthy() {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html khong ton tai — hãy chạy `npm run build` trước khi chạy e2e.");
  }
  tmpBooks = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-reader-flip-"));
  fs.writeFileSync(path.join(tmpBooks, BOOK_FILE), makePdf(5));
  serverProcess = spawn(process.execPath, ["--no-warnings", "server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), BOOKS_DIR: tmpBooks },
    stdio: "ignore",
  });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000 && !(await healthy())) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!(await healthy())) throw new Error(`Khong khoi duoc server e2e tren ${BASE}`);
  const booksResponse = await fetch(`${BASE}/api/books`);
  assert.equal(booksResponse.ok, true);
  const books = await booksResponse.json();
  assert.equal(books.length, 1);
  assert.equal(books[0].filename, BOOK_FILE);
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (serverProcess) serverProcess.kill();
  if (tmpBooks) fs.rmSync(tmpBooks, { recursive: true, force: true });
});

test("BookReader chỉ đổi canvas sau khi hiệu ứng lật tới/lùi hoàn tất", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.addInitScript(() => {
      localStorage.setItem("sgk_settings", JSON.stringify({
        reading: { layout: "twoPage" },
        accessibility: { pageFlip3D: true },
      }));
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("aside button")].find((item) =>
        (item.getAttribute("aria-label") || "").includes("Thư viện sách"),
      );
      button?.click();
    });
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    await page.locator(".libx-book, .libx-row").filter({ hasText: "Reader flip regression" }).click();
    await page.waitForSelector(".reader-root", { timeout: 30000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".pdf-canvas-box canvas");
      return canvas?.width > 0 && canvas?.height > 0;
    }, { timeout: 30000 });
    await page.waitForFunction(() => (
      document.querySelector(".rtb-page-pill")?.textContent?.includes("/ 4")
      || document.querySelector(".pdf-error-overlay")
    ), { timeout: 15000 });
    assert.equal(
      await page.locator(".pdf-error-overlay").count(),
      0,
      `generated PDF must load: ${await page.locator(".pdf-error-overlay").textContent().catch(() => "")}`,
    );
    await page.waitForFunction(
      () => localStorage.getItem("lastPage_reader-flip-regression.pdf") !== null,
      { timeout: 10000 },
    );
    const initialProgress = await page.evaluate(() => localStorage.getItem("lastPage_reader-flip-regression.pdf"));

    const readSpread = () => page.locator(".pdf-view-inner-spread > .pdf-canvas-box canvas")
      .evaluateAll((canvases) => canvases.map((canvas) => canvas.toDataURL("image/jpeg", 0.92)));
    const waitForFlip = (direction) => page.waitForSelector(
      `.pdf-page-flip-sheet.page-flip-${direction}.page-flip-ready`,
      { timeout: 15000 },
    );
    const finishFlip = () => page.waitForFunction(
      () => !document.querySelector(".pdf-page-flip-sheet"),
      { timeout: 10000 },
    );

    assert.equal(await page.locator(".pdf-view-inner-spread > .pdf-canvas-box").count(), 2);
    const firstSpread = await readSpread();
    await page.locator('.rtb-nav-btn[aria-label="Trang sau"]').click();
    await waitForFlip("next");
    assert.equal(await page.locator(".pdf-view-inner-spread .overlay-veil").count(), 0, "không được phủ tối spread trong khi lật");
    const forwardTurnSpread = await readSpread();
    assert.equal(forwardTurnSpread[0], firstSpread[0], "trang trái không lật vẫn được giữ nguyên");
    assert.notEqual(forwardTurnSpread[1], firstSpread[1], "trang đích bên dưới phải lộ ra khi tờ lật rời đi");
    assert.equal(
      await page.locator(".pdf-page-flip-front").getAttribute("src"),
      firstSpread[1],
      "mặt trước của tờ đang lật phải vẫn là trang sách cũ",
    );
    await finishFlip();
    const secondSpread = await readSpread();
    assert.notDeepEqual(secondSpread, firstSpread, "sang trang phải hoàn tất spread mới");

    await page.locator('.rtb-nav-btn[aria-label="Trang trước"]').click();
    await waitForFlip("prev");
    assert.equal(await page.locator(".pdf-view-inner-spread .overlay-veil").count(), 0, "không được phủ tối spread khi lật về");
    const reverseTurnSpread = await readSpread();
    assert.equal(reverseTurnSpread[0], firstSpread[0], "trang đích bên dưới phải lộ ra khi lật về");
    assert.equal(reverseTurnSpread[1], secondSpread[1], "trang phải không lật vẫn được giữ nguyên");
    assert.equal(
      await page.locator(".pdf-page-flip-front").getAttribute("src"),
      secondSpread[0],
      "mặt trước của tờ lật về phải vẫn là trang sách cũ",
    );
    await finishFlip();
    assert.deepEqual(await readSpread(), firstSpread, "lật về phải hoàn tất spread cũ");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("lastPage_reader-flip-regression.pdf")),
      initialProgress,
      "vị trí đọc phải được lưu sau khi lật về",
    );

    await page.locator('.rtb-nav-btn[aria-label="Trang sau"]').click();
    await waitForFlip("next");
    await finishFlip();
    const savedSpread = await readSpread();
    const forwardProgress = await page.evaluate(() => localStorage.getItem("lastPage_reader-flip-regression.pdf"));
    assert.ok(forwardProgress && forwardProgress !== initialProgress, "vị trí mới phải được lưu trước khi rời sách");
    await page.locator('button[aria-label="Quay lại thư viện"]').click();
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 15000 });
    await page.locator(".libx-book, .libx-row").filter({ hasText: "Reader flip regression" }).click();
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".pdf-view-inner-spread > .pdf-canvas-box canvas");
      return canvas?.width > 0 && canvas?.height > 0;
    }, { timeout: 30000 });
    await page.waitForFunction((expected) => {
      const canvases = [...document.querySelectorAll(".pdf-view-inner-spread > .pdf-canvas-box canvas")];
      return canvases.length === 2
        && JSON.stringify(canvases.map((canvas) => canvas.toDataURL("image/jpeg", 0.92))) === JSON.stringify(expected);
    }, savedSpread, { timeout: 15000 });
    assert.deepEqual(await readSpread(), savedSpread, "mở lại sách phải trở về đúng spread đã đọc");
  } finally {
    await page.close();
  }
});

test("BookReader tìm trang, đánh dấu trang, phóng to và lưu ghi chú", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.addInitScript(() => {
      localStorage.setItem("sgk_settings", JSON.stringify({
        reading: { layout: "single" },
        accessibility: { pageFlip3D: false },
      }));
      localStorage.setItem("toc_reader-flip-regression.pdf", JSON.stringify({
        items: [{ id: "jump-target", title: "Mục kiểm tra", page: 4, pdfPage: 4, depth: 0 }],
      }));
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      [...document.querySelectorAll("aside button")]
        .find((button) => (button.getAttribute("aria-label") || "").includes("Thư viện sách"))
        ?.click();
    });
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    await page.locator(".libx-book, .libx-row").filter({ hasText: "Reader flip regression" }).click();
    await page.waitForSelector(".reader-root", { timeout: 30000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".pdf-canvas-box canvas");
      return canvas?.width > 0 && canvas?.height > 0;
    }, { timeout: 30000 });

    await page.locator(".toc-item").filter({ hasText: "Mục kiểm tra" }).click();
    await page.waitForFunction(
      () => localStorage.getItem("lastPage_reader-flip-regression.pdf") === "4",
      { timeout: 15000 },
    );
    assert.match(await page.locator(".rtb-page-pill").textContent(), /^3\s*\/\s*4$/);

    await page.locator(".rtb-page-pill").click();
    const pageInput = page.getByLabel("Nhập số trang sách");
    await pageInput.fill("2");
    await pageInput.press("Enter");
    await page.waitForFunction(
      () => localStorage.getItem("lastPage_reader-flip-regression.pdf") === "3",
      { timeout: 15000 },
    );
    assert.match(await page.locator(".rtb-page-pill").textContent(), /^2\s*\/\s*4$/);

    await page.getByRole("button", { name: "Đánh dấu trang" }).click();
    await page.getByRole("button", { name: "Bỏ đánh dấu trang" }).waitFor();
    await page.locator(".pdf-canvas-box canvas").dblclick({ position: { x: 120, y: 120 } });
    const noteEditor = page.locator(".note-content-editable");
    await noteEditor.waitFor({ timeout: 5000 });
    await noteEditor.fill("Ghi chú kiểm tra đọc sách");
    await page.locator(".note-input-foot .btn-primary").click();
    await page.locator(".note-pin").waitFor({ timeout: 10000 });

    const zoomBefore = Number((await page.locator(".rtb-zoom-pct").textContent()).replace("%", ""));
    for (let step = 0; step < 8; step++) {
      await page.getByRole("button", { name: "Phóng to" }).click();
    }
    const zoomAfter = Number((await page.locator(".rtb-zoom-pct").textContent()).replace("%", ""));
    assert.ok(zoomAfter > zoomBefore, "phóng to phải tăng tỷ lệ hiển thị");
    assert.ok(zoomAfter >= 180, "phóng to đủ lớn để kiểm tra thao tác kéo");

    const panSurface = page.locator(".pdf-view-inner");
    const panBefore = await panSurface.getAttribute("style");
    const viewport = await page.locator(".pdf-viewport-container").boundingBox();
    assert.ok(viewport, "vùng đọc phải hiển thị để kéo trang");
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.x + viewport.width / 2 + 60, viewport.y + viewport.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const panAfter = await panSurface.getAttribute("style");
    assert.notEqual(panAfter, panBefore, "kéo trang đã phóng to phải đổi vị trí hiển thị");
    await page.locator(".rtb-zoom-pct").click();
    await page.getByRole("menuitem", { name: "Vừa khổ trang" }).click();
    await page.waitForFunction(
      () => document.querySelector(".pdf-view-inner")?.style.transform === "translate(0px, 0px)",
      { timeout: 10000 },
    );

    await page.locator('.rtb-nav-btn[aria-label="Trang sau"]').click();
    await page.waitForFunction(
      () => localStorage.getItem("lastPage_reader-flip-regression.pdf") === "4",
      { timeout: 15000 },
    );
    await page.waitForFunction(() => document.querySelectorAll(".note-pin").length === 0);
    await page.locator('.rtb-nav-btn[aria-label="Trang trước"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".note-pin").length === 1);
    await page.getByRole("button", { name: "Bỏ đánh dấu trang" }).waitFor();
  } finally {
    await page.close();
  }
});

test("Tạo giáo án AI giữ trang sách và quay lại đúng giáo án sau khi mở nguồn", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const generatedPlan = {
    title: "Giáo án kiểm thử",
    hoatDong: [
      { section: "A", ten: "Khởi động", phut: 5, mucTieu: "Khởi động bài học", steps: [{ gv: "GV nêu câu hỏi.", hs: "HS trả lời." }] },
      { section: "B", ten: "Khám phá", phut: 22, mucTieu: "Khám phá nội dung", steps: [{ gv: "GV hướng dẫn.", hs: "HS thực hiện." }] },
      { section: "C", ten: "Vận dụng", phut: 5, mucTieu: "Vận dụng nội dung", steps: [{ gv: "GV giao nhiệm vụ.", hs: "HS thực hiện." }] },
      { section: "D", ten: "Nối tiếp", phut: 3, mucTieu: "Chuẩn bị bài sau", steps: [{ gv: "GV dặn dò.", hs: "HS ghi nhớ." }] },
    ],
  };
  let apiCalls = 0;
  try {
    await page.addInitScript(() => {
      localStorage.setItem("GEMINI_API_KEY", "e2e-test-key");
      localStorage.setItem("sgk_settings", JSON.stringify({
        reading: { layout: "single" },
        accessibility: { pageFlip3D: false },
      }));
    });
    await page.route("**/api/gemini", async (route) => {
      apiCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(generatedPlan) }] } }],
        }),
      });
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      [...document.querySelectorAll("aside button")]
        .find((button) => (button.getAttribute("aria-label") || "").includes("Thư viện sách"))
        ?.click();
    });
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    await page.locator(".libx-book, .libx-row").filter({ hasText: "Reader flip regression" }).click();
    await page.waitForSelector(".reader-root", { timeout: 30000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".pdf-canvas-box canvas");
      return canvas?.width > 0 && canvas?.height > 0;
    }, { timeout: 30000 });
    await page.getByRole("button", { name: "Mở bảng AI" }).click();
    await page.locator(".ai-tab").filter({ hasText: "Giáo án" }).click();
    await page.getByLabel("Tên bài").fill("Giáo án kiểm thử");
    await page.getByLabel("Trang bắt đầu").fill("2");
    await page.getByLabel("Trang kết thúc").fill("3");
    await page.getByRole("button", { name: /Tạo giáo án bằng AI/ }).click();

    await page.locator(".khbd-root").waitFor({ timeout: 30000 });
    assert.equal(apiCalls, 1, "AI được gọi một lần và không cần khóa thật");
    await page.getByRole("heading", { name: "Sách và trang đã dùng" }).waitFor();
    assert.match(await page.locator(".khbd-card[aria-label='Sách tham khảo đã dùng']").innerText(), /tr\. 2–3/);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Thêm KHBD/ }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.docx$/i);
    await page.locator(".khbd-action-notice").filter({ hasText: "Đã tạo và tải giáo án Word" }).waitFor();

    await page.getByRole("button", { name: "Mở sách tại trang 2" }).click();
    await page.waitForSelector(".reader-root", { timeout: 20000 });
    await page.waitForFunction(
      () => localStorage.getItem("lastPage_reader-flip-regression.pdf") === "3",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "Quay lại thư viện" }).click();
    await page.locator(".khbd-title").waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".khbd-title").inputValue(), "Giáo án kiểm thử");
  } finally {
    await page.close();
  }
});
