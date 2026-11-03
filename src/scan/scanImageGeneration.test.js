import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTeachingImage } from "./scanAIService.js";

describe("generateTeachingImage", () => {
  it("sends the cropped source before references and returns the generated image", async () => {
    const previousStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    let request;
    globalThis.localStorage = {
      getItem: (key) => key === "GEMINI_API_KEY" ? "test-key" : null,
      setItem() {},
      removeItem() {},
    };
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                { type: "text", text: "Đã tạo ảnh." },
                { type: "image", mime_type: "image/jpeg", data: "ZmFrZS1pbWFnZQ==" },
              ],
            },
          ],
        }),
      };
    };

    try {
      const result = await generateTeachingImage({
        sourceImage: "data:image/png;base64,c291cmNl",
        prompt: "Tạo minh họa",
        aspectRatio: "16:9",
        imageSize: "2K",
        referenceImages: ["data:image/jpeg;base64,cmVm"],
      });

      const body = JSON.parse(request.options.body);
      assert.ok(request.url.endsWith("/api/gemini/image"));
      assert.equal(request.options.headers["x-gemini-key"], "test-key");
      assert.equal(body.store, false);
      assert.equal(body.input[0].type, "text");
      assert.equal(body.input[1].data, "c291cmNl");
      assert.equal(body.input[2].data, "cmVm");
      assert.equal(body.response_format.aspect_ratio, "16:9");
      assert.equal(body.response_format.mime_type, "image/jpeg");
      assert.equal(body.response_format.image_size, "2K");
      assert.equal(body.generation_config.max_output_tokens, 32768);
      assert.equal(result.dataUrl, "data:image/jpeg;base64,ZmFrZS1pbWFnZQ==");
      assert.equal(result.text, "Đã tạo ảnh.");
    } finally {
      globalThis.localStorage = previousStorage;
      globalThis.fetch = previousFetch;
    }
  });

  it("rejects data that is not an image before making a request", async () => {
    await assert.rejects(
      generateTeachingImage({
        sourceImage: "not-an-image",
        prompt: "Tạo minh họa",
      }),
      /Ảnh nguồn không hợp lệ/,
    );
  });

  it("reports Gemini API errors instead of treating them as successful output", async () => {
    const previousStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    globalThis.localStorage = {
      getItem: (key) => key === "GEMINI_API_KEY" ? "test-key" : null,
      setItem() {},
      removeItem() {},
    };
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "Quota exceeded" }),
    });

    try {
      await assert.rejects(
        generateTeachingImage({
          sourceImage: "data:image/png;base64,c291cmNl",
          prompt: "Tạo minh họa",
          aspectRatio: "1:1",
        }),
        /Quota exceeded/,
      );
    } finally {
      globalThis.localStorage = previousStorage;
      globalThis.fetch = previousFetch;
    }
  });
});
