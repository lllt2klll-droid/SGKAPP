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
