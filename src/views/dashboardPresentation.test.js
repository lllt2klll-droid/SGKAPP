import assert from "node:assert/strict";
import test from "node:test";
import {
  relTime,
  subjectHue,
  subjectInitials,
  withPrefix,
} from "./dashboardPresentation.js";

test("dashboard subject presentation is stable and recognizes Vietnamese subjects", () => {
  assert.equal(subjectHue("Toán"), 221);
  assert.equal(subjectHue("Ngữ văn"), 262);
  assert.equal(subjectHue("Môn chưa có"), subjectHue("Môn chưa có"));
  assert.equal(subjectInitials("Tiếng Việt"), "TV");
  assert.equal(subjectInitials(""), "📖");
});

test("dashboard prefixes avoid adding a duplicate label", () => {
  assert.equal(withPrefix("3", "Lớp"), "Lớp 3");
  assert.equal(withPrefix("Lớp 3", "Lớp"), "Lớp 3");
  assert.equal(withPrefix("", "Lớp"), "");
});

test("dashboard relative time handles missing and recent timestamps", () => {
  assert.equal(relTime(0), "");
  assert.equal(relTime(Date.now()), "Vừa xong");
});
