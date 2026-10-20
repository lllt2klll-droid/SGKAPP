import { test } from "node:test";
import assert from "node:assert/strict";

// Khóa hành vi các fix whiteboard (P0-storage, dedup, duplicate, decor) — chống hồi quy
globalThis.__SGK_TEST__ = true;
globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null }; })();
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = undefined;

const store = await import("../src/whiteboard/whiteboardStore.js");
const eng = await import("../src/whiteboard/mindmapEngine.js");
const exp = await import("../src/whiteboard/exportManager.js");

test("duplicateBoard: giữ cấu trúc cha-con, không link chéo board gốc", () => {
  localStorage.clear();
  const b = store.blankBoard("Goc");
  b.objects = [
    { ...store.blankObject("node"), id: "r1", text: "root" },
    { ...store.blankObject("node"), id: "c1", text: "child", parentId: "r1" },
    { ...store.blankObject("node"), id: "g1", text: "grand", parentId: "c1" },
  ];
  b.connectors = [{ id: "k1", fromId: "r1", toId: "c1", type: "arrow", color: "#000", width: 2 }];
  store.persistBoard(b);
  const dup = store.duplicateBoard(b.id);
  const ids = new Set(dup.objects.map((o) => o.id));
  assert.ok(!ids.has("r1") && !ids.has("c1") && !ids.has("g1"));
  for (const o of dup.objects) {
    if (o.parentId) assert.ok(ids.has(o.parentId), "parentId phải trong board clone");
  }
  const roots = dup.objects.filter((o) => !o.parentId);
  assert.equal(roots.length, 1);
  const ch = dup.objects.find((o) => o.parentId === roots[0].id);
  assert.ok(ch);
  assert.ok(dup.objects.find((o) => o.parentId === ch.id));
  assert.equal(dup.connectors.length, 1);
});

test("normalizeBoard: giữ node user trùng chữ, xóa trùng nguồn, placeholder đầu câu", () => {
  const mk = (id, text, sourceRef) => ({ ...store.blankObject("node"), id, text, x: 100, y: 100, sourceRef: sourceRef || null });
  const nb = store.normalizeBoard({
    ...store.blankBoard("D"),
    objects: [
      mk("a", "Nhánh mới", null),
      mk("b", "Nhánh mới", null),
      mk("c", "Bai hoc", { filename: "sach.pdf", page: 3 }),
      mk("d", "Bai hoc", { filename: "sach.pdf", page: 3 }),
      { ...store.blankObject("note"), id: "e", text: "Trang này dạng ảnh blah" },
      { ...store.blankObject("note"), id: "f", text: "Em ghi: Trang này dạng ảnh minh hoa dep" },
    ],
    connectors: [],
  });
  const ids = nb.objects.map((o) => o.id);
  assert.ok(ids.includes("a") && ids.includes("b"), "giữ 2 node user");
  assert.ok(ids.includes("c") && !ids.includes("d"), "xóa trùng nguồn");
  assert.ok(!ids.includes("e") && ids.includes("f"), "chỉ lọc placeholder đầu câu");
});

test("normalizeBoard: giữ cờ bullets", () => {
  const nb = store.normalizeBoard({
    ...store.blankBoard("B"),
    objects: [
      { ...store.blankObject("node"), id: "n1", text: "A\nB", bullets: "num" },
      { ...store.blankObject("node"), id: "n2", text: "C", bullets: true },
    ],
    connectors: [],
  });
  assert.equal(nb.objects.find((o) => o.id === "n1").bullets, "num");
  assert.equal(nb.objects.find((o) => o.id === "n2").bullets, true);
});

test("repairCycles: không mutate input + cắt cycle", () => {
  const input = [
    { ...store.blankObject("node"), id: "a", parentId: "b" },
    { ...store.blankObject("node"), id: "b", parentId: "a" },
  ];
  const snap = JSON.stringify(input);
  const out = store.repairCycles(input);
  assert.equal(JSON.stringify(input), snap);
  assert.equal(store.hasCycle(out), false);
});

test("resolveOverlaps: hết chồng, chỉ đẩy xuống", () => {
  const objs = [
    { id: "a", x: 0, y: 0, width: 170, height: 60, parentId: null },
    { id: "b", x: 50, y: 30, width: 300, height: 200, parentId: "a" },
  ];
  eng.resolveOverlaps(objs);
  assert.equal(objs[0].x, 0);
  assert.equal(objs[1].x, 50);
  assert.ok(objs[1].y >= objs[0].y + objs[0].height + 24);
});

test("boardBounds: rỗng mặc định, elbow nới biên", () => {
  assert.deepEqual(exp.boardBounds([], null), { x: 0, y: 0, w: 1200, h: 800 });
  const b1 = exp.boardBounds([{ kind: "node", x: 0, y: 0, width: 100, height: 50 }], null, 60);
  const b2 = exp.boardBounds([{ kind: "node", x: 0, y: 0, width: 100, height: 50 }], [{ type: "elbow" }], 60);
  assert.ok(b2.w > b1.w && b2.h > b1.h);
});
