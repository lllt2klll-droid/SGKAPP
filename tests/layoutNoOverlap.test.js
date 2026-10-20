// Khóa chuẩn layout: autoLayout 5 kiểu + mindmap + template — không chèn, không chéo (cha giữa con)
import { test } from "node:test";
import assert from "node:assert/strict";

function assertNoOverlap(objs, tag) {
  for (let i = 0; i < objs.length; i++) {
    for (let j = i + 1; j < objs.length; j++) {
      const A = objs[i], B = objs[j];
      const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y);
      assert.ok(!(ox > 0 && oy > 0), `${tag}: chèn ${A.text || A.id} <-> ${B.text || B.id}`);
    }
  }
}

function treeFixture() {
  return [
    { id: "r", x: 0, y: 0, width: 200, height: 72, text: "root", parentId: null },
    { id: "k1", x: 0, y: 0, width: 170, height: 60, text: "k1", parentId: "r" },
    { id: "k2", x: 0, y: 0, width: 300, height: 120, text: "k2-bu", parentId: "r" },
    { id: "l1", x: 0, y: 0, width: 160, height: 52, text: "l1", parentId: "k1" },
    { id: "l2", x: 0, y: 0, width: 160, height: 52, text: "l2", parentId: "k2" },
    { id: "r2", x: 5, y: 5, width: 180, height: 60, text: "root2", parentId: null },
    { id: "m1", x: 5, y: 5, width: 170, height: 60, text: "m1", parentId: "r2" },
  ];
}

for (const mode of ["tree-tb", "tree-lr", "tree-rl", "tree-bt", "radial"]) {
  test(`autoLayout ${mode}: rừng + node bự — không chèn, đủ node, giữ parentId`, async () => {
    const eng = await import("../src/whiteboard/mindmapEngine.js");
    const out = eng.autoLayout(treeFixture(), [], mode);
    assert.equal(out.length, 7, "giữ nguyên số node");
    assertNoOverlap(out, mode);
    const byId = new Map(out.map((o) => [o.id, o]));
    assert.equal(byId.get("l1").parentId, "k1", "giữ quan hệ cha-con");
    assert.equal(byId.get("m1").parentId, "r2");
  });
}

test("autoLayout tree-tb: cha nằm giữa các con (không chéo)", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const fam = [
    { id: "r", x: 0, y: 0, width: 200, height: 72, text: "root", parentId: null },
    { id: "a", x: 0, y: 0, width: 170, height: 60, text: "a", parentId: "r" },
    { id: "b", x: 0, y: 0, width: 170, height: 60, text: "b", parentId: "r" },
  ];
  const out = eng.autoLayout(fam, [], "tree-tb");
  const byId = new Map(out.map((o) => [o.id, o]));
  const expectX = (byId.get("a").x + byId.get("b").x + 170 - 200) / 2;
  assert.ok(Math.abs(byId.get("r").x - expectX) < 1, `cha lệch giữa ${Math.abs(byId.get("r").x - expectX)}`);
});

test("autoLayout: deterministic + chịu cycle không treo", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const a = JSON.stringify(eng.autoLayout(treeFixture(), [], "tree-lr"));
  const b = JSON.stringify(eng.autoLayout(treeFixture(), [], "tree-lr"));
  assert.equal(a, b, "chạy 2 lần giống nhau");
  const cyc = [
    { id: "a", x: 0, y: 0, width: 100, height: 50, parentId: "b" },
    { id: "b", x: 0, y: 0, width: 100, height: 50, parentId: "a" },
    { id: "c", x: 0, y: 0, width: 100, height: 50, parentId: null },
  ];
  assert.equal(eng.autoLayout(cyc, [], "tree-tb").length, 3);
  assert.equal(eng.autoLayout(cyc, [], "radial").length, 3);
});

test("generateMindmap 8 nhánh x 4 con: không chèn", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const { objects } = eng.generateMindmap("Chủ đề",
    Array.from({ length: 8 }, (_, i) => ({ label: `N${i + 1}`, children: ["c1", "c2", "c3", "c4"] })));
  assertNoOverlap(objects, "mindmap-8x4");
});

test("generateMindmap 10 nhánh x 8 con (max AI): không chèn", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const { objects } = eng.generateMindmap("Chủ đề",
    Array.from({ length: 10 }, (_, i) => ({ label: `N${i + 1}`, children: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] })));
  assertNoOverlap(objects, "mindmap-10x8");
});

test("mọi buildTemplate: không chèn sẵn", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  for (const t of ["mindmap", "tree", "process", "timeline", "compare", "classify", "brainstorm", "lesson"]) {
    const { objects } = eng.buildTemplate(t, 700, 400);
    assertNoOverlap(objects, `template-${t}`);
  }
});

// ── Đường nối không xuyên qua hộp thứ 3 (lỗi trong ảnh: đường chéo đè lên hộp khác) ──
function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function segsCross(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function segHitsBox(p, q, b) {
  const inside = (pt) => pt.x > b.x && pt.x < b.x + b.width && pt.y > b.y && pt.y < b.y + b.height;
  if (inside(p) || inside(q)) return true;
  const c = [
    [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }],
    [{ x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }],
    [{ x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }],
    [{ x: b.x, y: b.y + b.height }, { x: b.x, y: b.y }],
  ];
  return c.some(([a, e]) => segsCross(p, q, a, e));
}
function assertNoWireThrough(objects, connectors, tag) {
  const eng = globalThis.__eng;
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const c of connectors) {
    const a = byId.get(c.fromId), b = byId.get(c.toId);
    if (!a || !b) continue;
    const g = eng.connectorGeom(a, b, c.type, c.sourceAnchor, c.targetAnchor);
    if (!g || !g.pts) continue;
    for (let i = 0; i + 1 < g.pts.length; i++) {
      const p = g.pts[i], q = g.pts[i + 1];
      for (const o of objects) {
        if (o.id === c.fromId || o.id === c.toId) continue;
        if (o.kind === "stroke") continue;
        assert.ok(!segHitsBox(p, q, o),
          `${tag}: đường ${c.fromId}→${c.toId} xuyên hộp ${o.text || o.id}`);
      }
    }
  }
}
// Mô phỏng đúng sơ đồ trong ảnh: root → 2 nhánh → lá → cháu
function photoFixture() {
  const objs = [
    { id: "root", x: 0, y: 0, width: 200, height: 72, text: "BP", parentId: null },
    { id: "b1", x: 0, y: 0, width: 170, height: 60, text: "Khai thi giac", parentId: "root" },
    { id: "b2", x: 0, y: 0, width: 170, height: 60, text: "Khai ngon tu", parentId: "root" },
    { id: "l1", x: 0, y: 0, width: 160, height: 60, text: "1. Hinh anh", parentId: "b1" },
    { id: "l2", x: 0, y: 0, width: 160, height: 60, text: "2. Dieu bo", parentId: "b1" },
    { id: "l3", x: 0, y: 0, width: 160, height: 60, text: "1. Cau hoi", parentId: "b2" },
    { id: "l4", x: 0, y: 0, width: 190, height: 70, text: "2. Tinh huong minh hoa", parentId: "b2" },
    { id: "l5", x: 0, y: 0, width: 160, height: 60, text: "3. Dong nghia", parentId: "b2" },
    { id: "g1", x: 0, y: 0, width: 150, height: 52, text: "Phuong tien", parentId: "l1" },
    { id: "g2", x: 0, y: 0, width: 150, height: 52, text: "Lam ro KN", parentId: "l2" },
    { id: "g3", x: 0, y: 0, width: 170, height: 60, text: "Chu giai nghia", parentId: "l4" },
    { id: "g4", x: 0, y: 0, width: 160, height: 60, text: "Nam nghia", parentId: "l5" },
  ];
  const pairs = [["root", "b1"], ["root", "b2"], ["b1", "l1"], ["b1", "l2"], ["b2", "l3"], ["b2", "l4"], ["b2", "l5"], ["l1", "g1"], ["l2", "g2"], ["l4", "g3"], ["l5", "g4"]];
  const conns = pairs.map(([f, t], i) => ({ id: `c${i}`, fromId: f, toId: t, type: "arrow", color: "#64748b", width: 2 }));
  return { objs, conns };
}

for (const mode of ["tree-tb", "tree-lr", "tree-rl", "tree-bt"]) {
  test(`sơ đồ kiểu ảnh chụp + ${mode} + anchors: đường không xuyên hộp`, async () => {
    const eng = await import("../src/whiteboard/mindmapEngine.js");
    globalThis.__eng = eng;
    const { objs, conns } = photoFixture();
    const laid = eng.autoLayout(objs, conns, mode);
    const anchored = eng.applyLayoutAnchors(conns, mode);
    assertNoOverlap(laid, `${mode}-nodes`);
    assertNoWireThrough(laid, anchored, mode);
  });
}

test("radial: các mũi tên từ 1 cha chia góc ĐỀU nhau", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [{ id: "r", x: 0, y: 0, width: 180, height: 64, parentId: null },
    ...Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, x: 0, y: 0, width: 150, height: 50, parentId: "r" }))];
  const out = eng.autoLayout(objs, [], "radial");
  const byId = new Map(out.map((o) => [o.id, o]));
  const R = byId.get("r");
  const cx = R.x + R.width / 2, cy = R.y + R.height / 2;
  const angs = [];
  for (let i = 0; i < 5; i++) {
    const k = byId.get(`k${i}`);
    angs.push(Math.atan2(k.y + k.height / 2 - cy, k.x + k.width / 2 - cx));
  }
  angs.sort((a, b) => a - b);
  for (let i = 0; i < 5; i++) {
    let d = angs[(i + 1) % 5] - angs[i];
    if (d <= 0) d += Math.PI * 2;
    assert.ok(Math.abs(d - (Math.PI * 2) / 5) < 0.02, `góc đều 72°, thấy ${(d * 180 / Math.PI).toFixed(1)}°`);
  }
});

test("radial fan12: 1 vòng tròn duy nhất (ring theo số con)", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [{ id: "r", x: 0, y: 0, width: 180, height: 64, parentId: null },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, x: 0, y: 0, width: 150, height: 50, parentId: "r" }))];
  const out = eng.autoLayout(objs, [], "radial");
  const R = out.find((o) => o.id === "r");
  const cx = R.x + R.width / 2, cy = R.y + R.height / 2;
  const radii = out.filter((o) => o.id !== "r")
    .map((o) => Math.hypot(o.x + o.width / 2 - cx, o.y + o.height / 2 - cy));
  const spread = Math.max(...radii) - Math.min(...radii);
  assert.ok(spread < 2, `1 vòng tròn, spread=${spread.toFixed(1)}`);
});

test("radial: cháu ôm gần cha (không trôi xa theo vòng đồng tâm)", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [{ id: "root", x: 0, y: 0, width: 200, height: 72, parentId: null },
    { id: "b1", x: 0, y: 0, width: 170, height: 60, parentId: "root" },
    { id: "b2", x: 0, y: 0, width: 170, height: 60, parentId: "root" },
    ...["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => ({ id, x: 0, y: 0, width: 160, height: 56, parentId: "b2" }))];
  const out = eng.autoLayout(objs, [], "radial");
  const P = out.find((o) => o.id === "b2");
  const pcx = P.x + P.width / 2, pcy = P.y + P.height / 2;
  for (const o of out.filter((o) => /^c\d$/.test(o.id))) {
    const d = Math.hypot(o.x + o.width / 2 - pcx, o.y + o.height / 2 - pcy);
    assert.ok(d < 320, `con ${o.id} cách cha ${d.toFixed(0)}px (muốn < 320)`);
  }
});

test("radial/tree: node cycle mồ côi không văng, không chèn", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const cyc = () => [
    { id: "a", x: 0, y: 0, width: 100, height: 50, parentId: "b" },
    { id: "b", x: 10, y: 10, width: 100, height: 50, parentId: "a" },
    { id: "c", x: 0, y: 0, width: 200, height: 72, parentId: null },
  ];
  for (const mode of ["radial", "tree-tb", "tree-lr", "tree-rl", "tree-bt"]) {
    const out = eng.autoLayout(cyc(), [], mode);
    assert.equal(out.length, 3);
    for (const o of out) {
      assert.ok(Math.abs(o.x) < 5000 && Math.abs(o.y) < 5000, `${mode}: ${o.id} văng (${o.x},${o.y})`);
    }
    assertNoOverlap(out, `${mode}-orphan`);
  }
});

test("radial: tâm = viewport truyền vào", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [{ id: "r", x: 0, y: 0, width: 180, height: 64, parentId: null },
    { id: "k", x: 0, y: 0, width: 150, height: 50, parentId: "r" }];
  const out = eng.autoLayout(objs, [], "radial", { cx: 100, cy: 100 });
  const r = out.find((o) => o.id === "r");
  assert.ok(Math.abs(r.x + r.width / 2 - 100) < 1 && Math.abs(r.y + r.height / 2 - 100) < 1,
    "root nằm giữa viewport");
  const def = eng.autoLayout(JSON.parse(JSON.stringify(objs)), [], "radial");
  const d = def.find((o) => o.id === "r");
  assert.ok(Math.abs(d.x + d.width / 2 - 700) < 1, "thiếu opts → fallback tâm bảng");
});

test("applyLayoutAnchors: đúng phía từng hướng, không mutate input", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const src = [{ id: "c1", fromId: "a", toId: "b", type: "arrow" }];
  const tb = eng.applyLayoutAnchors(src, "tree-tb");
  assert.equal(tb[0].sourceAnchor, "bottom");
  assert.equal(tb[0].targetAnchor, "top");
  const lr = eng.applyLayoutAnchors(src, "tree-lr");
  assert.equal(lr[0].sourceAnchor, "right");
  assert.equal(lr[0].targetAnchor, "left");
  const rl = eng.applyLayoutAnchors(src, "tree-rl");
  assert.equal(rl[0].sourceAnchor, "left");
  assert.equal(rl[0].targetAnchor, "right");
  const bt = eng.applyLayoutAnchors(src, "tree-bt");
  assert.equal(bt[0].sourceAnchor, "top");
  assert.equal(bt[0].targetAnchor, "bottom");
  assert.equal(src[0].sourceAnchor, undefined, "không mutate mảng gốc");
});

test("generateMindmap: nhánh→con neo ngang (phải/trái), không auto", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const { connectors, rootId } = eng.generateMindmap("T", [
    { label: "A", children: ["a1"] },
    { label: "B", children: ["b1"] },
  ]);
  const side = connectors.filter((c) => c.fromId !== rootId);
  for (const c of side) {
    assert.ok(
      (c.sourceAnchor === "right" && c.targetAnchor === "left") ||
      (c.sourceAnchor === "left" && c.targetAnchor === "right"),
      `neo ngang: ${c.sourceAnchor}/${c.targetAnchor}`,
    );
  }
});

test("template process/timeline/compare: connector neo đúng phía", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const p = eng.buildTemplate("process", 700, 400);
  for (const c of p.connectors) {
    assert.equal(c.sourceAnchor, "right");
    assert.equal(c.targetAnchor, "left");
  }
  const cmp = eng.buildTemplate("compare", 700, 400);
  for (const c of cmp.connectors) {
    assert.equal(c.sourceAnchor, "bottom");
    assert.equal(c.targetAnchor, "top");
  }
});
