// Style connector kiểu Canva: suy đầu mũi, nét đứt, đảo chiều — tương thích board cũ
import { test } from "node:test";
import assert from "node:assert/strict";

test("isPlaceholderText: nhận diện chữ mẫu template/AI", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  for (const t of ["Nhánh 1", "Nhánh 12", "Nhánh mới", "Nhánh con", "Chủ đề", "Chủ đề chính", "Khối", "Hình", "Văn bản mới", "Ghi chú…", "Ghi chú", "Nhấn đúp để sửa", "Ý tưởng 3", "Gốc", "Điểm chung", "Tên bài học", "  Nhánh 2  "]) {
    assert.ok(eng.isPlaceholderText(t), `mẫu: ${t}`);
  }
  for (const t of ["Quang hợp", "1. Sử dụng hình ảnh", "Nắm nghĩa", "", "Nhánh cây xanh tốt", "Chủ đề: Quang hợp"]) {
    assert.ok(!eng.isPlaceholderText(t), `thật: ${t || "(rỗng)"}`);
  }
});

test("connHeads: board cũ (chỉ type) suy đúng đầu/cuối", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.deepEqual(eng.connHeads({ type: "line" }), { start: "none", end: "none" });
  assert.deepEqual(eng.connHeads({ type: "arrow" }), { start: "none", end: "arrow" });
  assert.deepEqual(eng.connHeads({ type: "double" }), { start: "arrow", end: "arrow" });
  assert.deepEqual(eng.connHeads({ type: "elbow" }), { start: "none", end: "arrow" });
  assert.deepEqual(eng.connHeads({}), { start: "none", end: "arrow" });
});

test("connHeads: tường minh thắng type cũ", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.deepEqual(
    eng.connHeads({ type: "line", startHead: "dot", endHead: "diamond" }),
    { start: "dot", end: "diamond" },
  );
  assert.deepEqual(
    eng.connHeads({ type: "double", startHead: "none" }),
    { start: "none", end: "arrow" },
  );
});

test("connDash: chỉ nhận Liền/Đứt/Chấm, rác → Liền", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.equal(eng.connDash({}), "");
  assert.equal(eng.connDash({ dash: "6 4" }), "6 4");
  assert.equal(eng.connDash({ dash: "2 4" }), "2 4");
  assert.equal(eng.connDash({ dash: "9 9" }), "");
});

test("connTypeForHeads: giữ elbow, còn lại suy từ 2 đầu", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.equal(eng.connTypeForHeads({ type: "elbow" }, "dot", "dot"), "elbow");
  assert.equal(eng.connTypeForHeads({ type: "arrow" }, "arrow", "arrow"), "double");
  assert.equal(eng.connTypeForHeads({ type: "double" }, "none", "arrow"), "arrow");
  assert.equal(eng.connTypeForHeads({ type: "arrow" }, "none", "none"), "line");
  assert.equal(eng.connTypeForHeads({}, "diamond", "none"), "arrow");
});

test("reconnectConn: chuyển 1 đầu sang node khác, giữ style, không mutate", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const list = [
    { id: "c1", fromId: "a", toId: "b", type: "arrow", color: "#dc2626", width: 3, dash: "6 4", startHead: "dot", endHead: "arrow" },
    { id: "c2", fromId: "a", toId: "c", type: "line" },
  ];
  const next = eng.reconnectConn(list, "c1", "to", "z", "left");
  assert.equal(next[0].toId, "z");
  assert.equal(next[0].targetAnchor, "left");
  assert.equal(next[0].fromId, "a", "đầu còn lại giữ nguyên");
  assert.equal(next[0].color, "#dc2626", "style giữ nguyên");
  assert.equal(next[0].startHead, "dot");
  assert.equal(list[0].toId, "b", "không mutate mảng gốc");
  const next2 = eng.reconnectConn(list, "c2", "from", "z", "top");
  assert.equal(next2[1].fromId, "z");
  assert.equal(next2[1].sourceAnchor, "top");
  assert.equal(next2[1].toId, "c");
});

test("curve: hình học cong bezier + giữ type khi đổi đầu", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const a = { x: 0, y: 0, width: 100, height: 60 };
  const b = { x: 300, y: 100, width: 100, height: 60 };
  const g = eng.connectorGeom(a, b, "curve");
  assert.ok(g.d.includes("Q"), "dùng lệnh Q");
  assert.equal(g.pts.length, 5, "5 điểm mẫu cho hit-test/nhãn");
  assert.ok(Number.isFinite(g.endAngle), "góc mũi hữu hạn");
  // điểm giữa phải lệch khỏi đường thẳng (cong thật)
  const mx = (g.pts[0].x + g.pts[4].x) / 2, my = (g.pts[0].y + g.pts[4].y) / 2;
  assert.ok(Math.hypot(g.pts[2].x - mx, g.pts[2].y - my) > 5, "giữa cong lệch rõ");
  // hit-test trên đường cong tìm được
  assert.ok(eng.distToConnector(g.pts[2].x, g.pts[2].y, a, b, "curve") < 1, "hit ngay trên cong");
  assert.ok(eng.distToConnector(0, 400, a, b, "curve") > 50, "xa cong thì lớn");
  // đổi đầu giữ dáng cong
  assert.equal(eng.connTypeForHeads({ type: "curve" }, "dot", "dot"), "curve");
  const f = eng.flipConn({ id: "c", fromId: "a", toId: "b", type: "curve", startHead: "none", endHead: "arrow" });
  assert.equal(f.type, "curve");
  assert.equal(f.startHead, "arrow");
});

test("curve bend: 0 là thẳng, % lớn cong hơn, thiếu là auto", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const a = { x: 0, y: 0, width: 100, height: 60 };
  const b = { x: 300, y: 100, width: 100, height: 60 };
  const off = (bend) => {
    const g = eng.connectorGeom(a, b, "curve", "auto", "auto", bend);
    const mx = (g.pts[0].x + g.pts[4].x) / 2, my = (g.pts[0].y + g.pts[4].y) / 2;
    return Math.hypot(g.pts[2].x - mx, g.pts[2].y - my);
  };
  assert.ok(off(0) < 0.01, "bend 0 = thẳng");
  assert.ok(off(150) > off(100) && off(100) > off(50), "tăng dần theo %");
  assert.equal(off(undefined).toFixed(3), off(100).toFixed(3), "thiếu = auto 100");
  // hit-test theo đúng độ cong truyền vào
  const g = eng.connectorGeom(a, b, "curve", "auto", "auto", 150);
  assert.ok(eng.distToConnector(g.pts[2].x, g.pts[2].y, a, b, "curve", "auto", "auto", 150) < 1);
});

test("normalizeBoard: giữ type curve + head/dash mới", async () => {
  const store = await import("../src/whiteboard/whiteboardStore.js");
  const b = store.normalizeBoard({
    objects: [
      { id: "a", kind: "node", x: 0, y: 0, width: 100, height: 60, text: "A" },
      { id: "b", kind: "node", x: 300, y: 0, width: 100, height: 60, text: "B" },
    ],
    connectors: [{ id: "c", fromId: "a", toId: "b", type: "curve", startHead: "diamond", endHead: "dot", dash: "6 4" }],
  });
  assert.equal(b.connectors[0].type, "curve");
  assert.equal(b.connectors[0].startHead, "diamond");
  assert.equal(b.connectors[0].dash, "6 4");
  // bend clamp 0..150, thiếu thì bỏ key (auto)
  const b3 = store.normalizeBoard({
    objects: [
      { id: "a", kind: "node", x: 0, y: 0, width: 100, height: 60, text: "A" },
      { id: "b", kind: "node", x: 300, y: 0, width: 100, height: 60, text: "B" },
    ],
    connectors: [
      { id: "c1", fromId: "a", toId: "b", type: "curve", bend: 999 },
      { id: "c2", fromId: "a", toId: "b", type: "curve" },
    ],
  });
  assert.equal(b3.connectors[0].bend, 150);
  assert.ok(!("bend" in b3.connectors[1]), "thiếu bend = auto, không lưu key");
  // type lạ vẫn fallback arrow như cũ
  const b2 = store.normalizeBoard({
    objects: [
      { id: "a", kind: "node", x: 0, y: 0, width: 100, height: 60, text: "A" },
      { id: "b", kind: "node", x: 300, y: 0, width: 100, height: 60, text: "B" },
    ],
    connectors: [{ id: "c", fromId: "a", toId: "b", type: "zigzag" }],
  });
  assert.equal(b2.connectors[0].type, "arrow");
});

test("flipConn: đảo from/to + neo + đầu mũi, giữ style", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const c = { id: "c1", fromId: "a", toId: "b", type: "arrow", color: "#dc2626", width: 3, dash: "6 4", sourceAnchor: "right", targetAnchor: "left", startHead: "dot", endHead: "arrow" };
  const f = eng.flipConn(c);
  assert.equal(f.fromId, "b");
  assert.equal(f.toId, "a");
  assert.equal(f.sourceAnchor, "left");
  assert.equal(f.targetAnchor, "right");
  assert.equal(f.startHead, "arrow");
  assert.equal(f.endHead, "dot");
  assert.equal(f.color, "#dc2626");
  assert.equal(f.width, 3);
  assert.equal(f.dash, "6 4");
  // board cũ không có head tường minh: đảo arrow → mũi sang đầu bên kia
  const g = eng.flipConn({ id: "c2", fromId: "a", toId: "b", type: "arrow" });
  assert.equal(g.startHead, "arrow");
  assert.equal(g.endHead, "none");
  assert.equal(g.type, "arrow");
});
