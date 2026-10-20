import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.__SGK_TEST__ = true;
globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: i => [...m.keys()][i] ?? null }; })();
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = undefined;

const svc = await import("../src/whiteboard/aiMindmapService.js");

const geminiResp = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const okJson = (obj) => ({ ok: true, status: 200, json: async () => obj });

function mockFetch(queue) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const next = queue.length ? queue.shift() : null;
    if (!next) throw new Error(`fetch không còn mock (lần ${calls.length})`);
    if (typeof next === "function") return next();
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
}

// ── parsePlanJSON ──
test("parsePlanJSON: bỏ fence + trailing comma", () => {
  const s = '```json\n{"topic":"T","branches":[{"label":"A","children":["a",]},],}\n```';
  const out = svc.parsePlanJSON(s);
  assert.equal(out.topic, "T");
  assert.equal(out.branches[0].children[0], "a");
});

test("parsePlanJSON: chữ bao quanh JSON", () => {
  const out = svc.parsePlanJSON('Đây là JSON: {"topic":"X","branches":[]} hy vọng đúng');
  assert.equal(out.topic, "X");
});

test("parsePlanJSON: double-encode (JSON là chuỗi)", () => {
  const inner = JSON.stringify({ topic: "D", branches: [{ label: "B", children: [] }] });
  const out = svc.parsePlanJSON(JSON.stringify(inner));
  assert.equal(out.topic, "D");
  assert.equal(out.branches[0].label, "B");
});

test("parsePlanJSON: rác → null", () => {
  assert.equal(svc.parsePlanJSON("không phải json"), null);
  assert.equal(svc.parsePlanJSON(""), null);
});

// ── normalizePlan ──
test("normalizePlan: cắt caps 200/10/8/120", () => {
  const raw = {
    topic: "x".repeat(300),
    branches: Array.from({ length: 15 }, (_, i) => ({
      label: `B${i}` + "y".repeat(200),
      children: Array.from({ length: 12 }, (_, j) => `c${i}-${j}` + "z".repeat(200)),
    })),
  };
  const out = svc.normalizePlan(raw);
  assert.equal(out.topic.length, 200);
  assert.equal(out.branches.length, 10);
  for (const b of out.branches) {
    assert.ok(b.label.length <= 120);
    assert.equal(b.children.length, 8);
    for (const c of b.children) assert.ok(c.length <= 120);
  }
});

test("normalizePlan: chuỗi branch, branch rỗng, dữ liệu hỏng", () => {
  const out = svc.normalizePlan({ topic: "T", branches: ["A", { children: ["no-label"] }, { label: "B", children: ["c"] }] });
  assert.deepEqual(out.branches.map(b => b.label), ["A", "B"]);
  assert.equal(svc.normalizePlan({ topic: "T", branches: [] }), null);
  assert.equal(svc.normalizePlan(null), null);
  assert.equal(svc.normalizePlan("xyz"), null);
});

// ── Prompt ──
test("buildSourceBlock: đủ nguồn topic/text/ảnh/ý nhỏ", () => {
  const s = svc.buildSourceBlock({ topic: "Quang hợp", text: "Diệp lục hấp thụ ánh sáng", smallIdeas: ["Tiết kiệm năng lượng"], hasImage: true });
  assert.ok(s.includes("CHỦ ĐỀ TRUNG TÂM"));
  assert.ok(s.includes("Quang hợp"));
  assert.ok(s.includes("VĂN BẢN NGUỒN"));
  assert.ok(s.includes("Diệp lục hấp thụ ánh sáng"));
  assert.ok(s.includes("ẢNH ĐÍNH KÈM"));
  assert.ok(s.includes("Tiết kiệm năng lượng"));
});

test("buildGenerationPrompt: có lệnh chống bịa + nguồn + format JSON", () => {
  const p = svc.buildGenerationPrompt({ topic: "T", text: "Nội dung A", smallIdeas: [], hasImage: false });
  assert.ok(p.includes("KHÔNG bịa"));
  assert.ok(p.includes("Nội dung A"));
  assert.ok(p.includes('"branches"'));
  assert.ok(p.includes('"label"'));
});

test("buildValidationPrompt: liệt kê nhãn + nguồn, yêu cầu JSON fabricated", () => {
  const p = svc.buildValidationPrompt(
    { topic: "T", text: "Nguồn B", smallIdeas: [], hasImage: false },
    { topic: "T", branches: [{ label: "Nhánh 1", children: ["Con 1"] }] },
  );
  assert.ok(p.includes("CHỐNG BỊA"));
  assert.ok(p.includes("Nhánh 1"));
  assert.ok(p.includes("Con 1"));
  assert.ok(p.includes("Nguồn B"));
  assert.ok(p.includes('{"fabricated"'));
});

// ── buildLocalPlan ──
test("buildLocalPlan: thụt lề → phân cấp 2 cấp", () => {
  const out = svc.buildLocalPlan({
    topic: "Photosynthesis",
    text: "Định nghĩa\n  Yếu tố 1\n  Yếu tố 2\nỨng dụng\n  Ví dụ A",
  });
  assert.equal(out.topic, "Photosynthesis");
  assert.equal(out.branches.length, 2);
  assert.deepEqual(out.branches[0].children, ["Yếu tố 1", "Yếu tố 2"]);
  assert.deepEqual(out.branches[1].children, ["Ví dụ A"]);
});

test("buildLocalPlan: bullet gạch đầu dòng → nhánh, không topic → dòng đầu thành topic", () => {
  const out = svc.buildLocalPlan({ topic: "", text: "Quang hợp\n- Diệp lục\n- Ánh sáng" });
  assert.equal(out.topic, "Quang hợp");
  assert.deepEqual(out.branches.map(b => b.label), ["Diệp lục", "Ánh sáng"]);
});

test("buildLocalPlan: bullet cùng dòng thường → con của nó", () => {
  const out = svc.buildLocalPlan({ topic: "T", text: "Định nghĩa\n- Diệp lục\n- Ánh sáng\nỨng dụng\n- Ví dụ" });
  assert.deepEqual(out.branches[0].children, ["Diệp lục", "Ánh sáng"]);
  assert.deepEqual(out.branches[1].children, ["Ví dụ"]);
});

test("buildLocalPlan: ý nhỏ luôn được thêm, dữ liệu rỗng → null", () => {
  const out = svc.buildLocalPlan({ topic: "T", text: "Ý một\nÝ hai", smallIdeas: ["Ý người dùng"] });
  assert.ok(out.branches.some(b => b.label === "Ý người dùng"));
  assert.equal(svc.buildLocalPlan({ topic: "", text: "   \n\n" }), null);
  assert.equal(svc.buildLocalPlan({}), null);
});

// ── generateMindmapPlan: nhập liệu ──
test("generateMindmapPlan: không có gì → NO_INPUT", async () => {
  await assert.rejects(() => svc.generateMindmapPlan({ apiKey: "" }), (e) => e.code === "NO_INPUT");
});

test("generateMindmapPlan: không key + chỉ ảnh → NO_KEY_IMAGE", async () => {
  await assert.rejects(
    () => svc.generateMindmapPlan({ apiKey: "", imageFile: { type: "image/png", size: 1024 } }),
    (e) => e.code === "NO_KEY_IMAGE",
  );
});

test("generateMindmapPlan: không key + chỉ chủ đề → NO_KEY_TOPIC_ONLY", async () => {
  await assert.rejects(
    () => svc.generateMindmapPlan({ apiKey: "", topic: "Chỉ có chủ đề" }),
    (e) => e.code === "NO_KEY_TOPIC_ONLY",
  );
});

test("generateMindmapPlan: không key + có văn bản → local, đúng nguồn", async () => {
  const res = await svc.generateMindmapPlan({
    apiKey: "",
    topic: "Tốc độ",
    text: "Định nghĩa\n  Công thức\n  Ví dụ",
  });
  assert.equal(res.mode, "local");
  assert.equal(res.checked, false);
  assert.ok(res.warnings.join(" ").includes("API Key"));
  assert.equal(res.plan.topic, "Tốc độ");
  assert.deepEqual(res.plan.branches[0].children, ["Công thức", "Ví dụ"]);
});

test("fileToImagePart: file không phải ảnh → reject", async () => {
  await assert.rejects(() => svc.fileToImagePart({ type: "text/plain", size: 10 }));
});

// ── generateMindmapPlan: đường AI ──
const GOOD_PLAN = { topic: "Quang hợp", branches: [{ label: "Điều kiện", children: ["Ánh sáng"] }, { label: "Sản phẩm", children: ["Tinh bột"] }] };

test("generateMindmapPlan: AI OK, đối chiếu sạch → mode ai, checked true", async () => {
  const calls = mockFetch([
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp(JSON.stringify({ fabricated: [] }))),
  ]);
  const res = await svc.generateMindmapPlan({ apiKey: "test-key", topic: "Quang hợp", text: "Quang hợp tạo tinh bột nhờ ánh sáng" });
  assert.equal(res.mode, "ai");
  assert.equal(res.checked, true);
  assert.deepEqual(res.warnings, []);
  assert.equal(res.plan.topic, "Quang hợp");
  assert.equal(calls.length, 2, "gọi gen 1 lần + validate 1 lần");
});

test("generateMindmapPlan: bịa 2 lần → throw FABRICATED, không đưa lên canvas", async () => {
  mockFetch([
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp(JSON.stringify({ fabricated: ["Ý bịa lần 1"] }))),
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp(JSON.stringify({ fabricated: ["Ý bịa lần 2"] }))),
  ]);
  await assert.rejects(
    () => svc.generateMindmapPlan({ apiKey: "test-key", topic: "Quang hợp", text: "Chỉ có ánh sáng và tinh bột" }),
    (e) => e.code === "FABRICATED" && e.message.includes("Ý bịa lần 2"),
  );
});

test("generateMindmapPlan: bịa 1 lần rồi sửa sạch → checked true, có warning Đã sửa", async () => {
  mockFetch([
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp(JSON.stringify({ fabricated: ["Ý bịa"] }))),
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp(JSON.stringify({ fabricated: [] }))),
  ]);
  const res = await svc.generateMindmapPlan({ apiKey: "test-key", topic: "Quang hợp", text: "Ánh sáng tạo tinh bột" });
  assert.equal(res.mode, "ai");
  assert.equal(res.checked, true);
  assert.ok(res.warnings.join(" ").includes("Đã sửa"));
});

test("generateMindmapPlan: AI gián đoạn + có văn bản → fallback local", async () => {
  mockFetch([new Error("network down")]);
  const res = await svc.generateMindmapPlan({ apiKey: "test-key", topic: "Tốc độ", text: "Định nghĩa\n  Công thức" });
  assert.equal(res.mode, "local");
  assert.equal(res.checked, false);
  assert.ok(res.warnings.join(" ").includes("AI gián đoạn"));
  assert.equal(res.plan.branches[0].label, "Định nghĩa");
});

test("generateMindmapPlan: chỉ chủ đề (có key) → không validate, cảnh báo rõ", async () => {
  const calls = mockFetch([okJson(geminiResp(JSON.stringify({ topic: "Mặt trời", branches: [{ label: "Hành tinh", children: ["Trái Đất"] }] })))]);
  const res = await svc.generateMindmapPlan({ apiKey: "test-key", topic: "Mặt trời" });
  assert.equal(res.mode, "ai");
  assert.equal(res.checked, false);
  assert.ok(res.warnings.join(" ").includes("Chỉ có chủ đề"));
  assert.equal(calls.length, 1, "không gọi validate khi không có nguồn");
});

test("generateMindmapPlan: validate lỗi → vẫn dùng plan, cảnh báo không đối chiếu được", async () => {
  mockFetch([
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp("không phải json")),
  ]);
  const res = await svc.generateMindmapPlan({ apiKey: "test-key", topic: "Quang hợp", text: "Ánh sáng tạo tinh bột" });
  assert.equal(res.mode, "ai");
  assert.equal(res.checked, false);
  assert.ok(res.warnings.join(" ").toLowerCase().includes("không đối chiếu được"));
});

// ── Đợt 1 AI: C2/C4/sanitize ──
test("generateMindmapPlan: key sai 401 → lỗi AUTH, không fallback local", async () => {
  const calls = mockFetch([
    { ok: false, status: 401, json: async () => ({ error: { message: "API key not valid" } }) },
  ]);
  await assert.rejects(
    () => svc.generateMindmapPlan({ apiKey: "key-sai", topic: "T", text: "Dòng một\nDòng hai" }),
    (e) => e.code === "AUTH",
  );
  assert.equal(calls.length, 1, "key sai không retry vô ích");
});

test("generateMindmapPlan: AI lỗi + có ảnh → fallback local cảnh báo bỏ ảnh", async () => {
  mockFetch([new Error("network down")]);
  const res = await svc.generateMindmapPlan({
    apiKey: "test-key",
    topic: "T",
    text: "Dòng một\nDòng hai",
    imageFile: { type: "image/png", size: 1024 },
  });
  // FileReader không có trong Node → ảnh không đọc được, dùng text tiếp thay vì throw
  assert.equal(res.mode, "local");
  assert.ok(res.warnings.join(" ").includes("Không đọc được ảnh"));
});

test("generateMindmapPlan: validator sai schema → lỗi cứng VALIDATE_SCHEMA, không cho qua", async () => {
  mockFetch([
    okJson(geminiResp(JSON.stringify(GOOD_PLAN))),
    okJson(geminiResp(JSON.stringify({ fabricated: "none" }))),
  ]);
  await assert.rejects(
    () => svc.generateMindmapPlan({ apiKey: "test-key", topic: "Quang hợp", text: "Ánh sáng tạo tinh bột" }),
    (e) => e.code === "VALIDATE_SCHEMA",
  );
});

test("sanitizePlanForApply: bỏ rỗng/trùng, phẳng hóa cấp 3, không [object Object]", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const { plan, warnings } = eng.sanitizePlanForApply({
    topic: "  T  ",
    branches: [
      { label: "  A  ", children: ["x", "", "X", { label: "C3", children: ["g1", { label: "G2" }] }, { nope: 1 }] },
      { label: "a", children: [] },
      { label: "   ", children: ["y"] },
      { label: "B", children: [] },
    ],
  });
  assert.equal(plan.topic, "T");
  assert.deepEqual(plan.branches.map((b) => b.label), ["A", "B"]);
  assert.ok(plan.branches[0].children.includes("x"));
  assert.ok(plan.branches[0].children.includes("C3"));
  assert.ok(plan.branches[0].children.includes("g1"));
  assert.ok(plan.branches[0].children.includes("G2"));
  assert.ok(!JSON.stringify(plan).includes("[object Object]"));
  assert.ok(!JSON.stringify(plan).includes('"Nhánh"'));
  assert.ok(warnings.length > 0);
});

test("sanitizePlanForApply: topic trống/branches trống → plan null", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.equal(eng.sanitizePlanForApply(null).plan, null);
  assert.equal(eng.sanitizePlanForApply({ topic: "", branches: [{ label: "  ", children: [] }] }).plan, null);
});

test("aiPlanToGraph: con object không thành [object Object], nhánh trống bị bỏ", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.equal(eng.aiPlanToGraph({ topic: "", branches: [{ label: "A", children: [] }] }), null);
  assert.equal(eng.aiPlanToGraph({ topic: "T", branches: [{ label: "  ", children: [] }] }), null);
  const g = eng.aiPlanToGraph({ topic: "T", branches: [{ label: "A", children: [{ label: "C", children: ["g"] }] }] });
  const texts = g.objects.map((o) => o.text);
  assert.ok(texts.includes("C"));
  assert.ok(texts.includes("g"));
  assert.ok(!texts.some((t) => String(t).includes("[object Object]")));
});

// ── Đợt 3 AI: M1/M9/M10 ──
test("generateMindmapPlan: AI trả array trần → fallback local kèm cảnh báo đúng bệnh", async () => {
  mockFetch([okJson(geminiResp(JSON.stringify(["Ý một", "Ý hai"])))]);
  const res = await svc.generateMindmapPlan({ apiKey: "test-key", topic: "T", text: "Dòng một\nDòng hai" });
  assert.equal(res.mode, "local");
  assert.ok(res.warnings.join(" ").includes("danh sách thay vì sơ đồ"));
});

test("buildLocalPlan: vượt giới hạn → báo dropped, không mất lặng", () => {
  const text = Array.from({ length: 15 }, (_, i) => `Nhánh ${i}`).join("\n");
  const out = svc.buildLocalPlan({ topic: "T", text });
  assert.equal(out.branches.length, 10);
  assert.ok(out.dropped.branches >= 5);
  assert.equal(svc.droppedNote(out.dropped).includes("vượt giới hạn"), true);
  assert.equal(svc.droppedNote({ branches: 0, children: 0 }), "");
});

test("fileToImagePart: type rỗng suy từ đuôi file; đuôi lạ → reject rõ", async () => {
  await assert.rejects(() => svc.fileToImagePart({ type: "", name: "anh.xyz", size: 10 }), /Không xác định được loại ảnh/);
  await assert.rejects(() => svc.fileToImagePart({ type: "", name: "anh.png", size: 10 }), /Trình duyệt không hỗ trợ/);
});

// ── Trang trí nhanh: theme + đánh số nhánh ──
test("numberBranchChildren: đánh số theo y,x, xóa số cũ, pure", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [
    { id: "r", text: "Root", parentId: null, x: 0, y: 0 },
    { id: "b", text: "2. Beta", parentId: "r", x: 300, y: 200 },
    { id: "a", text: "Alpha", parentId: "r", x: 300, y: 100 },
    { id: "x", text: "Khác", parentId: null, x: 0, y: 500 },
  ];
  const snap = JSON.stringify(objs);
  const out = eng.numberBranchChildren(objs, "r");
  assert.equal(JSON.stringify(objs), snap, "không mutate input");
  assert.equal(out.find((o) => o.id === "a").text, "1. Alpha");
  assert.equal(out.find((o) => o.id === "b").text, "2. Beta");
  assert.equal(out.find((o) => o.id === "x").text, "Khác");
  assert.equal(eng.numberBranchChildren(objs, "khong-co"), objs, "không con → trả nguyên");
});

test("applyBranchTheme: root giữ nguyên, con nền đậm, cháu nền nhạt viền màu", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [
    { id: "r", text: "Root", fill: "#1d4ed8", color: "#fff", parentId: null },
    { id: "b1", text: "B1", fill: "#fff", color: "#000", parentId: "r" },
    { id: "b2", text: "B2", fill: "#fff", color: "#000", parentId: "r" },
    { id: "g", text: "G", fill: "#fff", color: "#000", parentId: "b1" },
    { id: "y", text: "Ngoài", fill: "#fff", color: "#000", parentId: null },
  ];
  const out = eng.applyBranchTheme(objs, "r", "vivid");
  assert.equal(out.find((o) => o.id === "r").fill, "#1d4ed8", "root giữ nguyên");
  assert.equal(out.find((o) => o.id === "b1").color, "#ffffff");
  assert.notEqual(out.find((o) => o.id === "b1").fill, out.find((o) => o.id === "b2").fill, "2 nhánh khác màu");
  const g = out.find((o) => o.id === "g");
  assert.equal(g.color, "#1e293b");
  assert.ok(String(g.fill).length === 9, "nền nhạt 8-digit hex");
  assert.equal(out.find((o) => o.id === "y").fill, "#fff", "ngoài nhánh giữ nguyên");
  assert.equal(eng.applyBranchTheme(objs, "r", "theme-la").length, objs.length, "theme lạ → nguyên bản");
  // cycle vẫn kết thúc
  const cyc = [
    { id: "a", parentId: "b", fill: "#fff", color: "#000" },
    { id: "b", parentId: "a", fill: "#fff", color: "#000" },
  ];
  eng.applyBranchTheme(cyc, "a", "vivid");
});

test("textOnFill + pastel: chữ đủ tương phản, pastel nền nhạt chữ đậm", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.equal(eng.textOnFill("#1d4ed8"), "#ffffff", "nền đậm → chữ trắng");
  assert.equal(eng.textOnFill("#f59e0b"), "#1e293b", "nền vàng → chữ đậm mới đọc được");
  assert.equal(eng.textOnFill("#ffffff"), "#1e293b");
  const objs = [
    { id: "r", text: "Root", fill: "#1d4ed8", color: "#fff", parentId: null },
    { id: "b1", text: "B1", fill: "#fff", color: "#000", parentId: "r" },
  ];
  const out = eng.applyBranchTheme(objs, "r", "pastel");
  const b1 = out.find((o) => o.id === "b1");
  assert.equal(b1.color, "#1e293b", "pastel chữ đậm");
});

// ── Bullets nhiều kiểu ──
test("bullets: normalize/strip/prefix đúng mọi kiểu + tương thích true cũ", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.equal(eng.normalizeBulletStyle(true), "dot");
  assert.equal(eng.normalizeBulletStyle("num"), "num");
  assert.equal(eng.normalizeBulletStyle("la"), "");
  assert.equal(eng.normalizeBulletStyle(false), "");
  assert.equal(eng.stripBulletMark("• 1. Việc"), "Việc", "bỏ marker chồng");
  assert.equal(eng.stripBulletMark("- xong"), "xong");
  assert.equal(eng.bulletPrefix("dot", 3), "• ");
  assert.equal(eng.bulletPrefix("num", 3), "3. ");
  assert.equal(eng.bulletPrefix("", 3), "");
  assert.equal(eng.bulletPrefix("check", 1), "✓ ");
  assert.ok(eng.bulletIndentPx(15, "num") > eng.bulletIndentPx(15, "dot"), "số chừa chỗ rộng hơn");
  assert.equal(eng.bulletIndentPx(15, ""), 0);
});

test("resolveOverlaps: hết chồng lấn, chỉ đẩy xuống, giữ x và parentId", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const objs = [
    { id: "a", x: 0, y: 0, width: 170, height: 60, parentId: null },
    { id: "b", x: 50, y: 30, width: 300, height: 200, parentId: "a" },
    { id: "c", x: 50, y: 100, width: 160, height: 52, parentId: "b" },
  ];
  const before = objs.map((o) => o.x);
  eng.resolveOverlaps(objs);
  assert.deepEqual(objs.map((o) => o.x), before, "không đổi x");
  assert.equal(objs[1].parentId, "a");
  for (let i = 0; i < objs.length; i++) {
    for (let j = i + 1; j < objs.length; j++) {
      const A = objs[i], B = objs[j];
      const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y);
      assert.ok(!(ox > 0 && oy > 0), `hết chồng: ${A.id}-${B.id}`);
    }
  }
});

test("generateMindmap: graph sinh ra không còn hộp chồng nhau", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const { objects } = eng.generateMindmap("Chủ đề", [
    { label: "Nhánh 1", children: ["c1", "c2", "c3", "c4"] },
    { label: "Nhánh 2", children: ["c1", "c2", "c3", "c4"] },
    { label: "Nhánh 3", children: ["c1", "c2"] },
    { label: "Nhánh 4", children: ["c1", "c2", "c3"] },
  ]);
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const A = objects[i], B = objects[j];
      const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y);
      assert.ok(!(ox > 0 && oy > 0), `chồng: ${A.text}-${B.text}`);
    }
  }
});

// ── Connector: elbow theo hướng + nhãn ──
test("connectorGeom elbow: ngang trước khi cách ngang lớn, dọc trước khi cách dọc lớn", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const a = { x: 0, y: 0, width: 100, height: 60 };
  const wide = { x: 400, y: 0, width: 100, height: 60 };
  const gh = eng.connectorGeom(a, wide, "elbow");
  assert.equal(gh.pts.length, 4);
  assert.deepEqual(gh.pts[1], { x: 250, y: 30 }, "gãy giữa theo trục ngang");
  const tall = { x: 0, y: 400, width: 100, height: 60 };
  const gv = eng.connectorGeom(a, tall, "elbow");
  assert.equal(gv.pts.length, 4);
  assert.deepEqual(gv.pts[1], { x: 50, y: 230 }, "gãy giữa theo trục dọc");
});

test("normalizeBoard: giữ nhãn + neo connector", async () => {
  const store = await import("../src/whiteboard/whiteboardStore.js");
  const nb = store.normalizeBoard({
    ...store.blankBoard("C"),
    objects: [
      { ...store.blankObject("node"), id: "a", text: "A", x: 0, y: 0 },
      { ...store.blankObject("node"), id: "b", text: "B", x: 300, y: 0 },
    ],
    connectors: [{ id: "c1", fromId: "a", toId: "b", type: "elbow", color: "#000", width: 2, label: "dẫn đến", sourceAnchor: "right", targetAnchor: "left" }],
  });
  assert.equal(nb.connectors.length, 1);
  assert.equal(nb.connectors[0].label, "dẫn đến");
  assert.equal(nb.connectors[0].sourceAnchor, "right");
  assert.equal(nb.connectors[0].targetAnchor, "left");
});

// ── Markdown-lite **đậm** *nghiêng* ──
test("parseRichSegments: đậm/nghiêng/lồng/marker lẻ", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  assert.deepEqual(eng.parseRichSegments("Chào **bạn** nhé"), [
    { t: "Chào ", bold: false, italic: false },
    { t: "bạn", bold: true, italic: false },
    { t: " nhé", bold: false, italic: false },
  ]);
  assert.deepEqual(eng.parseRichSegments("*nghiêng* và text"), [
    { t: "nghiêng", bold: false, italic: true },
    { t: " và text", bold: false, italic: false },
  ]);
  // marker không đóng cặp giữ nguyên chữ
  assert.deepEqual(eng.parseRichSegments("a **b"), [{ t: "a **b", bold: false, italic: false }]);
  assert.deepEqual(eng.parseRichSegments("a *b"), [{ t: "a *b", bold: false, italic: false }]);
});

test("wrapRichLines: xuống dòng giữ style, markers không tính độ dài", async () => {
  const eng = await import("../src/whiteboard/mindmapEngine.js");
  const lines = eng.wrapRichLines("**12345** 67890", 10);
  assert.equal(lines.length, 2, "markers không tốn chỗ nên vừa 2 dòng");
  assert.equal(lines[0][0].bold, true);
  assert.equal(lines[0][0].t, "12345");
  assert.equal(lines[1][0].t, "67890");
  assert.equal(lines[1][0].bold, false);
  const multi = eng.wrapRichLines("dòng một\n\ndòng ba", 20);
  assert.equal(multi.length, 3);
  assert.deepEqual(multi[1], []);
});
