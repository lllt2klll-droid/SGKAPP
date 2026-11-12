import { describe, it } from "node:test";
import assert from "node:assert/strict";
import aiService from "../ai/aiService.js";
import { analyzeScan, generateMaterial, regenerateQuestion } from "./scanAIService.js";

const pngDataUrl = `data:image/png;base64,${"cG5n".repeat(40)}`;
const scan = {
  dataUrl: pngDataUrl,
  book: { title: "Toán 4", subject: "Toán", grade: 4 },
  page: 12,
};

async function withAIResponse(response, run) {
  const previousStorage = globalThis.localStorage;
  const previousCallAI = aiService.callAI;
  const calls = [];
  globalThis.localStorage = {
    getItem: (key) => key === "GEMINI_API_KEY" ? "test-key" : null,
    setItem() {},
    removeItem() {},
  };
  aiService.callAI = async (options) => {
    calls.push(options);
    return response;
  };

  try {
    await run(calls);
  } finally {
    aiService.callAI = previousCallAI;
    globalThis.localStorage = previousStorage;
  }
}

describe("scan AI crop image payload", () => {
  it("sends the cropped PNG with its actual MIME type for analysis", async () => {
    const response = JSON.stringify({
      subject: "Toán",
      grade: 4,
      topic: "Phép cộng",
      content: "Bài toán trong vùng đã chọn.",
      keyPoints: [],
      existingQuestions: [],
    });

    await withAIResponse(response, async (calls) => {
      await analyzeScan(scan);
      assert.equal(calls[0].contents[0].parts[0].inlineData.mimeType, "image/png");
      assert.equal(calls[0].contents[0].parts[0].inlineData.data, pngDataUrl.split(",")[1]);
    });
  });

  it("uses the same cropped PNG MIME type when generating and regenerating materials", async () => {
    await withAIResponse('{"title":"Phiếu học tập","questions":[]}', async (calls) => {
      await generateMaterial({
        scan,
        analysis: { topic: "Phép cộng", content: "", keyPoints: [], existingQuestions: [] },
        materialType: "note",
        config: {},
      });
      await regenerateQuestion({
        scan,
        analysis: { topic: "Phép cộng", content: "" },
        materialType: "question",
        config: {},
        existingQuestion: { q: "Câu hỏi" },
        index: 0,
      });
      assert.equal(calls.length, 2);
      for (const call of calls) {
        assert.equal(call.contents[0].parts[0].inlineData.mimeType, "image/png");
        assert.equal(call.contents[0].parts[0].inlineData.data, pngDataUrl.split(",")[1]);
      }
    });
  });
});
