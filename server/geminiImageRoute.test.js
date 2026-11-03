import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = { type: "image", mime_type: "image/png", data: "aGVsbG8=" };

let serverProcess;
let baseUrl;
let temporaryBooks;
let serverOutput = "";

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

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Image API test server exited early:\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Image API test server did not start:\n${serverOutput}`);
}

async function postImage(body, apiKey) {
  return fetch(`${baseUrl}/api/gemini/image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-gemini-key": apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Gemini image generation API route", () => {
  before(async () => {
    const port = await unusedPort();
    baseUrl = `http://127.0.0.1:${port}`;
    temporaryBooks = fs.mkdtempSync(path.join(os.tmpdir(), "sgk-image-route-"));
    const bootstrap = `
      globalThis.fetch = async (url, options) => {
        if (String(url) !== "https://generativelanguage.googleapis.com/v1beta/interactions") {
          throw new Error("Unexpected upstream URL: " + url);
        }
        const request = JSON.parse(options.body);
        return new Response(JSON.stringify({
          status: "completed",
          echoedRequest: request,
          steps: [{ type: "model_output", content: [
            { type: "image", mime_type: "image/jpeg", data: "Z2VuZXJhdGVk" }
          ] }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      };
      await import("./server.js");
    `;
    serverProcess = spawn(
      process.execPath,
      ["--input-type=module", "-e", bootstrap],
      {
        cwd: ROOT,
        windowsHide: true,
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          BOOKS_DIR: temporaryBooks,
          GEMINI_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    serverProcess.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
    serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
    await waitForHealth();
  });

  after(async () => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill();
      await Promise.race([
        new Promise((resolve) => serverProcess.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    if (temporaryBooks && fs.existsSync(temporaryBooks)) {
      fs.rmSync(temporaryBooks, { recursive: true, force: true });
    }
  });

  it("requires an API key before proxying the image request", async () => {
    const response = await postImage({
      input: [{ type: "text", text: "Tạo minh họa" }, IMAGE],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "1:1", image_size: "1K" },
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Gemini API Key/);
  });

  it("validates prompt, source image, image format and supported dimensions", async () => {
    const validFormat = { type: "image", mime_type: "image/jpeg", aspect_ratio: "1:1", image_size: "1K" };
    const invalidRequests = [
      { input: [IMAGE], response_format: validFormat },
      { input: [{ type: "text", text: "Tạo ảnh" }, { ...IMAGE, mime_type: "image/svg+xml" }], response_format: validFormat },
      { input: [{ type: "text", text: "Tạo ảnh" }, IMAGE], response_format: { ...validFormat, mime_type: "image/gif" } },
      { input: [{ type: "text", text: "Tạo ảnh" }, IMAGE], response_format: { ...validFormat, image_size: "4K" } },
    ];

    for (const body of invalidRequests) {
      const response = await postImage(body, "test-key");
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.ok((await response.json()).error);
    }
  });

  it("proxies a validated crop and multiple references with bounded image settings", async () => {
    const response = await postImage({
      input: [
        { type: "text", text: "Tạo infographic từ ảnh crop." },
        IMAGE,
        { type: "image", mime_type: "image/jpeg", data: "cmVmZXJlbmNl" },
      ],
      response_format: { type: "image", mime_type: "image/png", aspect_ratio: "16:9", image_size: "2K" },
      generation_config: { max_output_tokens: 99999, temperature: 9 },
      store: true,
    }, "test-key");

    assert.equal(response.status, 200);
    const result = await response.json();
    const request = result.echoedRequest;
    assert.equal(request.model, "gemini-3.1-flash-image");
    assert.equal(request.store, false);
    assert.equal(request.input.length, 3);
    assert.equal(request.input[1].data, IMAGE.data);
    assert.equal(request.input[2].mime_type, "image/jpeg");
    assert.deepEqual(request.response_format, {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: "16:9",
      image_size: "2K",
    });
    assert.equal(request.generation_config.max_output_tokens, 32768);
    assert.equal(request.generation_config.temperature, 1);
    assert.equal(result.steps[0].content[0].data, "Z2VuZXJhdGVk");
  });
});
