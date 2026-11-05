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
const PORT = Number(process.env.E2E_WORD_PORT || 5331);
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let browser = null;
let booksDir = null;

async function healthy() {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html không tồn tại — hãy chạy `npm run build` trước khi chạy e2e.");
  }
  if (!(await healthy())) {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-word-editor-"));
    serverProcess = spawn(process.execPath, ["--no-warnings", "server.js"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), BOOKS_DIR: booksDir },
      stdio: "ignore",
    });
    const started = Date.now();
    while (Date.now() - started < 20000 && !(await healthy())) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!(await healthy())) throw new Error(`Không khởi động được server Word e2e tại ${BASE}`);
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (serverProcess) serverProcess.kill();
  if (booksDir) fs.rmSync(booksDir, { recursive: true, force: true });
});

async function openWordEditor(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await page.getByRole("button", { name: "Tạo từ văn bản" }).click();
  return page.getByRole("dialog", { name: "Tạo sách Word" });
}

test("Word editor live-saves text, replaces matches, protects edits, and fits mobile", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const dialog = await openWordEditor(page);
    const editor = dialog.locator(".word-editable");
    const placeholder = await editor.evaluate((el) => getComputedStyle(el, "::before").content);
    assert.match(placeholder, /Bắt đầu soạn nội dung/);
    await dialog.locator(".word-modal-footer button").last().focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => !!document.activeElement?.closest(".word-modal")),
      true,
      "Tab must keep keyboard focus inside the modal",
    );

    await dialog.getByRole("textbox").fill("Word e2e draft");
    await editor.fill("alpha beta alpha");
    await page.waitForFunction(() => {
      const draft = JSON.parse(localStorage.getItem("sgk_textbook_draft_word_v2") || "null");
      return draft?.html === "<p>alpha beta alpha</p>";
    });
    assert.equal(
      await editor.evaluate((el) => getComputedStyle(el, "::before").content),
      "none",
      "empty-editor placeholder must disappear after typing",
    );
    assert.match(await dialog.locator(".word-stats").innerText(), /3 từ/);

    page.once("dialog", (confirmation) => confirmation.dismiss());
    await dialog.locator("#word-template").selectOption({ label: "— Trống —" });
    assert.equal((await editor.innerText()).trim(), "alpha beta alpha", "canceling a blank template must preserve text");

    await dialog.locator('.word-tbtn[title^="Tìm & thay thế"]').click();
    await dialog.getByPlaceholder("Từ khóa...").fill("alpha");
    await dialog.getByPlaceholder("Thay bằng...").fill("omega");
    await dialog.getByRole("button", { name: "Thay tất cả" }).click();
    assert.equal((await editor.innerText()).trim(), "omega beta omega");
    await page.waitForFunction(() => {
      const draft = JSON.parse(localStorage.getItem("sgk_textbook_draft_word_v2") || "null");
      return draft?.html === "<p>omega beta omega</p>";
    });

    await page.setViewportSize({ width: 375, height: 812 });
    const mobile = await page.evaluate(() => {
      const header = document.querySelector(".word-modal-header");
      return {
        headerFits: header.scrollWidth <= header.clientWidth + 2,
        toolbarHeight: document.querySelector(".word-toolbar").getBoundingClientRect().height,
        pageAreaHeight: document.querySelector(".word-pages-area").getBoundingClientRect().height,
        assistantDisplay: getComputedStyle(document.querySelector(".aia-fab")).display,
      };
    });
    assert.equal(mobile.headerFits, true, "Word header must not overflow on a phone");
    assert.ok(mobile.toolbarHeight < 180, `toolbar unexpectedly tall: ${mobile.toolbarHeight}px`);
    assert.ok(mobile.pageAreaHeight > 250, `page editor too short: ${mobile.pageAreaHeight}px`);
    assert.equal(mobile.assistantDisplay, "none", "AI floating button must not cover Word controls");

    page.once("dialog", (confirmation) => confirmation.dismiss());
    await dialog.getByRole("button", { name: "Hủy (Esc)" }).click();
    assert.equal(await dialog.isVisible(), true, "canceling discard confirmation must keep the editor open");
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "Hủy (Esc)" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => localStorage.getItem("sgk_textbook_draft_word_v2")), null);
  } finally {
    await page.close();
  }
});

test("Word editor creates a text book with the latest typed content", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const dialog = await openWordEditor(page);
    await dialog.getByRole("textbox").fill("Word e2e saved book");
    await dialog.locator(".word-editable").fill("Nội dung mới nhất phải được lưu.");
    const savedResponse = page.waitForResponse((response) =>
      response.url().includes("/api/books/create-text") && response.status() === 201,
    );
    await dialog.getByRole("button", { name: "Tạo sách" }).click();
    const response = await savedResponse;
    await dialog.waitFor({ state: "detached", timeout: 15000 });
    const data = await response.json();
    assert.equal(data.book?.title, "Word e2e saved book");
    const storedResponse = await page.request.get(
      `${BASE}/api/books/${encodeURIComponent(data.book.filename)}/content`,
    );
    assert.equal(storedResponse.ok(), true);
    const stored = await storedResponse.json();
    assert.match(stored.content, /Nội dung mới nhất phải được lưu/);
  } finally {
    await page.close();
  }
});

test("Word editor exports the current content as a DOCX download", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  try {
    const dialog = await openWordEditor(page);
    await dialog.getByRole("textbox").fill("Word e2e export");
    await dialog.locator(".word-editable").fill("Nội dung để xuất thành tệp Word.");
    const downloadReady = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Xuất Word" }).click();
    const download = await downloadReady;
    assert.match(download.suggestedFilename(), /\.docx$/i);
  } finally {
    await page.close();
  }
});

test("Word editor paginates long text without dropping content", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const dialog = await openWordEditor(page);
    const longText = Array.from({ length: 420 }, (_, index) => `Paragraph ${index + 1}: nội dung kiểm tra phân trang.`).join("\n");
    await dialog.getByRole("textbox").fill("Word e2e pagination");
    await page.waitForTimeout(150);
    await dialog.locator(".word-editable").fill(longText);
    await page.waitForFunction(() =>
      document.querySelectorAll(".word-editable").length > 1 &&
      document.activeElement?.classList.contains("word-editable"),
    );
    await page.keyboard.type(" TAIL_SENTINEL");
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".word-editable")).some((editor) => editor.innerText.includes("TAIL_SENTINEL")),
    );
    await page.waitForTimeout(300);
    const result = await page.locator(".word-editable").evaluateAll((editors) => ({
      pages: editors.length,
      content: editors.map((editor) => editor.innerText).join("\n"),
      overflowingPages: editors.filter((editor) => editor.scrollHeight > editor.clientHeight + 2).length,
      editorHasFocus: editors.includes(document.activeElement),
    }));
    assert.ok(result.pages > 1, "long content should continue onto another A4 page");
    const normalizedContent=result.content.replace(/\s+/g, " ").trim();
    assert.ok(normalizedContent.includes("TAIL_SENTINEL"), "typing should continue after the page break");
    const restoredContent=normalizedContent.replace(/\s*TAIL_SENTINEL\s*/g, "").replace(/\s+/g, " ").trim();
    const expectedContent=longText.replace(/\s+/g, " ").trim();
    assert.equal(restoredContent, expectedContent, "paginating must not drop or duplicate document text");
    assert.equal(result.overflowingPages, 0, "paginated text should not be hidden in a nested scroller");
    assert.equal(result.editorHasFocus, true, "typing should continue in the paginated document");
  } finally {
    await page.close();
  }
});
