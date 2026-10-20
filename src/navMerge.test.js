// P1 • Khóa merge Từ điển → Từ vựng + tách nhóm nav nghiên cứu.
// View "glossary" không còn tồn tại độc lập; mọi đường cũ phải về vocab (tab Tra cứu).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VIEWS,
  NAVIGATION_CONFIG,
  VIEW_ALIASES,
  normalizeViewId,
} from "./core/navigationRegistry.js";
import { VIEW_REGISTRY, hasView } from "./core/viewRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

// ── 1. View glossary độc lập đã gỡ ────────────────────────────────────
test("P1: không còn view glossary độc lập trong registry", () => {
  assert.ok(!hasView("glossary"), "VIEW_REGISTRY còn glossary");
  assert.ok(!VIEWS.glossary, "VIEWS còn glossary");
  assert.ok(hasView("vocab"), "vocab phải tồn tại");
});

// ── 2. Alias glossary → vocab, không làm vỡ quy tắc stats/langstats ───
test("P1: alias glossary→vocab, stats/langstats vẫn riêng biệt", () => {
  assert.equal(VIEW_ALIASES.glossary, "vocab");
  assert.equal(normalizeViewId("glossary"), "vocab");
  assert.equal(normalizeViewId("bookmarks"), "marks");
  assert.equal(normalizeViewId("stats"), "stats");
  assert.equal(normalizeViewId("langstats"), "langstats");
  assert.equal(normalizeViewId("vocab"), "vocab");
});

// ── 3. Nav tách Sổ tay nghiên cứu khỏi Công cụ nâng cao ────────────────
test("P1: NAVIGATION_CONFIG có notebook-group, advanced-group gọn", () => {
  const all = [];
  for (const sec of NAVIGATION_CONFIG) {
    for (const sub of sec.subsections || []) all.push(sub);
  }
  const byId = Object.fromEntries(all.map((s) => [s.id, s]));
  assert.ok(byId["notebook-group"], "thiếu notebook-group");
  // P2 • "Khái niệm" gộp vào "Từ vựng" — notebook-group chỉ còn references + collections
  assert.deepEqual([...byId["notebook-group"].viewIds].sort(), ["collections", "references"]);
  assert.deepEqual([...byId["advanced-group"].viewIds].sort(), ["inventory", "langstats", "matrix"]);
  // Mọi viewId trong nav phải tồn tại trong VIEWS (chống drift)
  for (const sub of all) {
    for (const vid of sub.viewIds || []) assert.ok(VIEWS[vid], `nav trỏ view không tồn tại: ${vid}`);
  }
  for (const sec of NAVIGATION_CONFIG) {
    for (const vid of sec.viewIds || []) assert.ok(VIEWS[vid], `nav trỏ view không tồn tại: ${vid}`);
  }
});

// ── 4. Subsection hiển thị khớp nhóm mới ───────────────────────────────
test("P1: subsection của 5 view khớp nhóm nav mới (P2: bỏ concepts)", () => {
  assert.equal(VIEWS.references.subsection, "Sổ tay nghiên cứu");
  assert.equal(VIEWS.collections.subsection, "Sổ tay nghiên cứu");
  assert.equal(VIEWS.matrix.subsection, "Công cụ nâng cao");
  assert.equal(VIEWS.inventory.subsection, "Công cụ nâng cao");
  assert.equal(VIEWS.langstats.subsection, "Công cụ nâng cao");
  assert.deepEqual(VIEW_REGISTRY.references.breadcrumb, ["WORKSPACE", "Sổ tay nghiên cứu"]);
  // view Khái niệm đã gộp vào Từ vựng — không được quay lại nav/registry
  assert.ok(!VIEWS.concepts, "VIEWS còn concepts (đã gộp vào vocab)");
  assert.ok(!VIEW_REGISTRY.concepts, "VIEW_REGISTRY còn concepts (đã gộp vào vocab)");
});

// ── 5. VocabView có tab Tra cứu nhúng GlossaryPanel ────────────────────
test("P1: VocabView có tab Tra cứu + prop initialTab", () => {
  const src = readSrc("VocabView.jsx");
  assert.ok(src.includes('from "./GlossaryPanel"'), "VocabView chưa import GlossaryPanel");
  assert.ok(src.includes('"lookup"'), "VocabView thiếu tab lookup");
  assert.ok(src.includes("initialTab"), "VocabView thiếu prop initialTab");
  assert.ok(src.includes("<GlossaryPanel"), "VocabView chưa render GlossaryPanel");
});

// ── 6. App đấu nối redirect + xóa viewProps glossary ───────────────────
test("P1: App redirect glossary→vocab và bỏ view Từ điển riêng", () => {
  const src = readSrc("App.jsx");
  assert.ok(src.includes('targetView === "glossary"'), "App thiếu redirect glossary");
  assert.ok(src.includes("vocabInitialTab"), "App thiếu state vocabInitialTab");
  assert.ok(!src.includes("glossary: { geminiKey"), "App còn viewProps glossary riêng");
  assert.ok(!src.includes('import("./GlossaryPanel")'), "App còn lazy import GlossaryPanel");
  assert.ok(src.includes('"notebook-group": true'), "App thiếu default mở notebook-group");
});
