import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCropOutputSize } from "./scanCapture.js";

describe("scan crop output sizing", () => {
  it("upscales small crops without changing their aspect ratio", () => {
    assert.deepStrictEqual(getCropOutputSize(100, 50), { width: 400, height: 200 });
  });

  it("keeps the largest dimension within the AI input limit", () => {
    assert.deepStrictEqual(getCropOutputSize(4000, 2000), { width: 3000, height: 1500 });
  });

  it("preserves extreme aspect ratios when both size limits apply", () => {
    assert.deepStrictEqual(getCropOutputSize(100, 10000), { width: 30, height: 3000 });
  });

  it("rejects empty or invalid crop dimensions", () => {
    assert.equal(getCropOutputSize(0, 100), null);
    assert.equal(getCropOutputSize(Number.NaN, 100), null);
  });
});
