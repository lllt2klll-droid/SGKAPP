import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cmpNoteKeyFor,
  groupBooks,
  noteSnippetFor,
  shortTitle,
  pageDiffOf,
  totalDiffOf,
  buildReportText,
  buildReportTableHtml,
  buildPrintHtml,
} from "../src/compareUtils.js";
import {
  cloneBoard,
  boardSnap,
  estimateAutoSize,
  getDescendantIds,
  simplifyPoints,
  versionsKey,
  findBackgroundCandidate,
  alignObjects,
  distributePositions,
  reorderObjects,
} from "../src/whiteboard/whiteboardHelpers.js";

describe("split refactor: compareUtils", () => {
  it("cmpNoteKeyFor order-independent", () => {
    assert.equal(cmpNoteKeyFor("a.pdf", "b.pdf"), cmpNoteKeyFor("b.pdf", "a.pdf"));
    assert.ok(cmpNoteKeyFor("a.pdf", "").includes("a.pdf"));
  });
  it("groupBooks groups + sorts", () => {
    const gs = groupBooks([
      { filename: "x", title: "B", grade: 10, subject: "Toán" },
      { filename: "y", title: "A", grade: 10, subject: "Toán" },
      { filename: "z", title: "C" },
    ]);
    assert.equal(gs.length, 2);
    assert.equal(gs[0].items[0].title, "A");
  });
  it("noteSnippet + shortTitle + diffs", () => {
    assert.equal(noteSnippetFor("   "), "Chưa có ghi chú — bấm để mở và ghi nhận điểm giống – khác của hai bản.");
    assert.ok(noteSnippetFor("a b c").length > 0);
    assert.equal(shortTitle("x".repeat(40)).endsWith("…"), true);
    assert.equal(pageDiffOf(true, 5, 8), 3);
    assert.equal(pageDiffOf(false, 5, 8), null);
    assert.equal(totalDiffOf(10, 14), 4);
    assert.equal(totalDiffOf(0, 5), null);
  });
  it("report builders contain titles + citations", () => {
    const args = { titleA: "A", titleB: "B", displayA: 1, displayB: 2, note: "n", citationA: "cA", citationB: "cB" };
    assert.ok(buildReportText(args).includes("BIÊN BẢN"));
    assert.ok(buildReportTableHtml(args).includes("<table>"));
    assert.ok(buildPrintHtml(args).includes("Biên bản so sánh"));
    assert.ok(!buildReportTableHtml({ ...args, note: " " }).includes("Ghi chú so sánh"));
  });
});

describe("split refactor: whiteboardHelpers", () => {
  it("clone/boardSnap deep copy", () => {
    const b = { objects: [{ id: "1" }], connectors: [], zoom: 1, pan: { x: 0, y: 0 } };
    const c = cloneBoard(b);
    c.objects[0].id = "2";
    assert.equal(b.objects[0].id, "1");
    assert.deepEqual(Object.keys(boardSnap(b).objects ? {} : {}), []);
  });
  it("estimateAutoSize bounds", () => {
    const { w, h } = estimateAutoSize("hello", 15);
    assert.ok(w >= 120 && w <= 420 && h >= 48);
  });
  it("getDescendantIds + simplifyPoints", () => {
    const objs = [{ id: "r" }, { id: "c1", parentId: "r" }, { id: "c2", parentId: "c1" }];
    assert.deepEqual(getDescendantIds(objs, "r").sort(), ["c1", "c2"]);
    assert.equal(simplifyPoints(null), null);
    assert.equal(simplifyPoints([{ x: 0, y: 0 }]).length, 1);
  });
  it("versionsKey + background candidate", () => {
    assert.equal(versionsKey("b1"), "sgk_wb_versions_b1");
    const bg = { id: "bg", kind: "rect", width: 1000, height: 1000, fill: "#fff", x: 0, y: 0 };
    const sm = { id: "s", kind: "rect", width: 10, height: 10, fill: "#fff", x: 0, y: 0 };
    assert.equal(findBackgroundCandidate([bg, sm]).id, "bg");
    assert.equal(findBackgroundCandidate([sm]), null);
  });
  it("align/distribute/reorder pure", () => {
    const objs = [
      { id: "a", x: 0, y: 0, width: 10, height: 10 },
      { id: "b", x: 50, y: 40, width: 10, height: 10 },
      { id: "c", x: 100, y: 90, width: 10, height: 10 },
    ];
    const al = alignObjects(objs, ["a", "b"], "left");
    assert.equal(al.find((o) => o.id === "b").x, 0);
    assert.equal(al.find((o) => o.id === "c").x, 100);
    const di = distributePositions(objs, ["a", "b", "c"], "h");
    assert.ok(di.length === 3);
    const ro = reorderObjects(objs.map((o, i) => ({ ...o, z: i })), ["a"], "front");
    assert.equal(ro[ro.length - 1].id, "a");
    assert.deepEqual(ro.map((o) => o.z), [0, 1, 2]);
  });
});
