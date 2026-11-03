import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BOOK_FILE = "image-design-e2e.pdf";

function buildPdf() {
  const header = "%PDF-1.4\n";
  const stream = "BT /F1 24 Tf 72 700 Td (Image design test) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = header;
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, "latin1");
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(url, processHandle, getOutput, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Test server exited:\n${getOutput()}`);
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Test server did not start:\n${getOutput()}`);
}

test("crop preview offers image design and sends crop plus references to Gemini", async () => {
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "index.html")), "run npm run build before e2e tests");

  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const booksDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-image-design-e2e-"));
  fs.writeFileSync(path.join(booksDirectory, BOOK_FILE), buildPdf());

  let serverOutput = "";
  const serverProcess = spawn(process.execPath, ["--no-warnings", "server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", BOOKS_DIR: booksDirectory },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });

  let browser;
  let context;
  try {
    await waitForHealth(baseUrl, serverProcess, () => serverOutput);
    const booksResponse = await fetch(`${baseUrl}/api/books`);
    assert.equal(booksResponse.status, 200);
    const books = await booksResponse.json();
    const book = books.find((item) => item.filename === BOOK_FILE);
    assert.ok(book, `test server should list ${BOOK_FILE}`);

    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      serviceWorkers: "block",
    });
    await context.addInitScript(() => localStorage.setItem("GEMINI_API_KEY", "e2e-test-key"));
    const page = await context.newPage();
    const imageRequests = [];
    const analysis = {
      subject: "Toán",
      grade: 1,
      topic: "Nhận biết hình",
      content: "Nhận biết hình trong bài học.",
      keyPoints: ["Quan sát hình"],
      existingQuestions: [],
      suggestedMaterials: ["worksheet"],
      confidence: 0.9,
    };
    const generatedImages = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext("2d");
      context.fillStyle = "#336699";
      context.fillRect(0, 0, canvas.width, canvas.height);
      return {
        png: canvas.toDataURL("image/png").split(",")[1],
        jpeg: canvas.toDataURL("image/jpeg").split(",")[1],
      };
    });

    await page.route("**/api/gemini", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }],
        }),
      });
    });
    await page.route("**/api/gemini/image", async (route) => {
      imageRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          steps: [{
            type: "model_output",
            content: [{ type: "image", mime_type: "image/jpeg", data: generatedImages.jpeg }],
          }],
        }),
      });
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    const libraryButton = page.locator("aside button").filter({ hasText: "Thư viện sách" }).first();
    await libraryButton.click();
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    await page.locator(".libx-book, .libx-row").filter({ hasText: book.title }).first().click();
    await page.waitForSelector('button[aria-label="Quét vùng"]', { timeout: 30000 });

    await page.waitForFunction(() => {
      const canvas = [...document.querySelectorAll("canvas")].find((item) => item.width > 100 && item.height > 100);
      return canvas && canvas.toDataURL("image/png").length > 5000;
    }, { timeout: 30000 });
    await page.locator('button[aria-label="Quét vùng"]').click();
    await page.waitForSelector(".scan-overlay", { timeout: 15000 });
    await page.locator(".scan-overlay").dblclick({ position: { x: 300, y: 300 } });
    await page.locator('button[aria-label="Quét vùng này"]').click();

    await page.waitForSelector('div[role="dialog"][aria-label="Tạo học liệu từ vùng SGK"]', { timeout: 20000 });
    await page.getByRole("button", { name: /Thiết kế ảnh/ }).waitFor({ state: "visible", timeout: 20000 });

    await page.locator('button[title="Điều chỉnh vùng crop"]').click();
    await page.waitForSelector('div[role="dialog"][aria-label="Điều chỉnh vùng crop"]', { timeout: 10000 });
    await page.locator(".cropd-btn.primary").click();

    await page.getByRole("button", { name: /Thiết kế ảnh/ }).waitFor({ state: "visible", timeout: 20000 });
    await page.getByRole("button", { name: /Thiết kế ảnh/ }).click();
    await page.getByRole("img", { name: "Ảnh crop dùng làm nguồn thiết kế" }).waitFor({ state: "visible" });
    const designDialog = await page.locator(".scanm-shell").boundingBox();
    assert.ok(designDialog.width >= 1000, `desktop design dialog should be roomy, got ${designDialog.width}px`);
    await page.getByRole("button", { name: "Infographic kiến thức" }).click();
    assert.match(await page.locator("textarea").last().inputValue(), /infographic/i);

    const referencePng = Buffer.from(generatedImages.png, "base64");
    const referenceInput = page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]');
    await referenceInput.setInputFiles([
      { name: "mau-mot.png", mimeType: "image/png", buffer: referencePng },
      { name: "mau-hai.png", mimeType: "image/png", buffer: referencePng },
    ]);
    await page.locator('img[alt^="Ảnh mẫu"]').nth(1).waitFor({ state: "visible" });
    assert.equal(await page.locator('img[alt^="Ảnh mẫu"]').count(), 2);

    await page.getByLabel("Tỉ lệ ảnh").selectOption("custom");
    await page.getByLabel("Rộng (px)").fill("100");
    await page.getByLabel("Cao (px)").fill("100");
    await page.getByRole("button", { name: "Tạo ảnh học liệu" }).click();
    await page.getByRole("alert").filter({ hasText: /256 đến 4096 px/ }).waitFor({ state: "visible" });
    assert.equal(imageRequests.length, 0, "invalid dimensions must not call Gemini");

    await page.getByLabel("Rộng (px)").fill("1600");
    await page.getByLabel("Cao (px)").fill("900");
    await page.getByLabel("Độ phân giải").selectOption("2K");
    await page.getByRole("button", { name: "Tạo ảnh học liệu" }).click();
    await page.getByRole("link", { name: "Tải ảnh xuống" }).waitFor({ state: "visible", timeout: 10000 });
    assert.equal(imageRequests.length, 1);
    const request = imageRequests[0];
    assert.equal(request.model, "gemini-3.1-flash-image");
    assert.equal(request.store, false);
    assert.equal(request.response_format.mime_type, "image/jpeg");
    assert.equal(request.response_format.aspect_ratio, "16:9");
    assert.equal(request.response_format.image_size, "2K");
    assert.equal(request.input.filter((part) => part.type === "image").length, 3);
    assert.ok(request.input[1].data, "the cropped source must be sent before the reference images");
    assert.ok(request.input[2].data);
    assert.ok(request.input[3].data);
    assert.equal(await page.locator('img[alt="Ảnh học liệu do Gemini tạo"]').getAttribute("src"), `data:image/jpeg;base64,${generatedImages.jpeg}`);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (serverProcess.exitCode === null) {
      serverProcess.kill();
      await Promise.race([
        new Promise((resolve) => serverProcess.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    if (fs.existsSync(booksDirectory)) fs.rmSync(booksDirectory, { recursive: true, force: true });
  }
});
