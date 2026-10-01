import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExpandedKeys,
  SECTION_META,
  sectionLabel,
  viewsBySectionId,
} from "../src/core/navigationRegistry.js";

const SECTIONS = [
  { id: "workspace", label: "WORKSPACE", subsections: [{ id: "library-group", label: "Thu vien SGK" }] },
  { id: "work", label: "CONG VIEC", subsections: [] },
];

test("normalizeExpandedKeys: label cu -> id, giu nguyen gia tri", () => {
  const out = normalizeExpandedKeys({ WORKSPACE: true, "Thu vien SGK": false }, SECTIONS);
  assert.equal(out.workspace, true);
  assert.equal(out["library-group"], false);
  assert.ok(!("WORKSPACE" in out));
  assert.ok(!("Thu vien SGK" in out));
});

test("normalizeExpandedKeys: key id co san khong bi ghi de", () => {
  const out = normalizeExpandedKeys({ WORKSPACE: true, workspace: false }, SECTIONS);
  assert.equal(out.workspace, false);
  assert.ok(!("WORKSPACE" in out));
});

test("normalizeExpandedKeys: key la giu nguyen, null an toan", () => {
  const out = normalizeExpandedKeys({ "Tu che": true }, SECTIONS);
  assert.equal(out["Tu che"], true);
  assert.deepEqual(normalizeExpandedKeys(null, SECTIONS), {});
});

test("SECTION_META/sectionLabel/viewsBySectionId nhat quan", () => {
  assert.equal(sectionLabel("workspace"), SECTION_META.workspace.label);
  assert.equal(sectionLabel("la-xyz"), "la-xyz");
  const ids = viewsBySectionId("workspace").map((v) => v.id);
  assert.ok(ids.includes("dashboard"));
  assert.ok(!viewsBySectionId("workspace").some((v) => v.sectionId !== "workspace"));
});
