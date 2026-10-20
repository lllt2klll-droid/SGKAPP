// Test phân loại công cụ web (thuần) — chống lệch khi thêm nguồn mới.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  isKnownCategory,
  inferCategory,
  normalizeCategory,
} from "./webtoolsCategory.js";

test("CATEGORIES: id duy nhất, đủ nhãn, 'other' luôn có", () => {
  const ids = CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "id nhóm bị trùng");
  for (const c of CATEGORIES) assert.ok(c.label && c.id, "thiếu id/label");
  assert.ok(ids.includes("other"), "phải có nhóm 'other'");
  assert.equal(CATEGORY_LABEL.other, "Khác");
});

test("isKnownCategory phân biệt id hợp lệ và id lạ", () => {
  assert.equal(isKnownCategory("dev"), true);
  assert.equal(isKnownCategory("other"), true);
  assert.equal(isKnownCategory("khong-co"), false);
  assert.equal(isKnownCategory(undefined), false);
});

test("inferCategory đoán đúng theo domain", () => {
  assert.equal(inferCategory("https://github.com/user/repo"), "dev");
  assert.equal(inferCategory("https://developer.mozilla.org/en-US/"), "dev");
  assert.equal(inferCategory("https://www.figma.com/file/x"), "design");
  assert.equal(inferCategory("https://chat.openai.com"), "ai");
  assert.equal(inferCategory("https://gemini.google.com"), "ai");
  assert.equal(inferCategory("https://drive.google.com/drive"), "storage");
  assert.equal(inferCategory("https://loigiaihay.com/toan-1"), "teach");
  assert.equal(inferCategory("https://example.com"), "other");
  assert.equal(inferCategory(""), "other");
  assert.equal(inferCategory(null), "other");
});

test("normalizeCategory giữ nhóm hợp lệ, suy đoán khi thiếu/lạ", () => {
  assert.equal(normalizeCategory("design", "https://github.com"), "design");
  assert.equal(normalizeCategory("", "https://github.com"), "dev");
  assert.equal(normalizeCategory("unknown", "https://www.canva.com"), "design");
  assert.equal(normalizeCategory(undefined, "https://abc.xyz"), "other");
});
