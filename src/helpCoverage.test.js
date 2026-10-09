// Tự đối chiếu HelpView ↔ navigationRegistry — chống help lệch app.
// Chạy trong `npm test`. Khi thêm view mới mà quên cập nhật HelpView → test fail ngay.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

const helpSrc = read("HelpView.jsx");
const navSrc = read(path.join("core", "navigationRegistry.js"));

// ── parsers (text-based, không import JSX/React) ─────────────────────
function parseViews(src) {
  const startIdx = src.indexOf("export const VIEWS = {");
  assert.ok(startIdx >= 0, "không tìm thấy export const VIEWS trong navigationRegistry.js");
  const block = src.slice(startIdx, src.indexOf("\n};", startIdx));
  const views = [];
  const re = /(\w+):\s*\{\s*id:"(\w+)",\s*label:"([^"]+)"/g;
  let m;
  while ((m = re.exec(block))) views.push({ id: m[2], label: m[3] });
  return views;
}

function extractBlock(src, marker, endRe) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, `không tìm thấy marker: ${marker}`);
  const rest = src.slice(i + marker.length);
  const end = rest.search(endRe);
  return end >= 0 ? rest.slice(0, end) : rest;
}

const views = parseViews(navSrc);
const modulesBlock = extractBlock(helpSrc, "const MODULES = [", /\n\];/);
const groupsBlock = extractBlock(helpSrc, "const HELP_GROUPS = {", /\n\};/);

// ── 1. Mọi view trong navigationRegistry đều phải được help nhắc tới ──
test("help bao quát toàn bộ view trong navigationRegistry", () => {
  assert.ok(views.length >= 20, `chỉ parse được ${views.length} view — parser hỏng?`);
  const hay = helpSrc.toLowerCase();
  const missing = views.filter(
    (v) => !hay.includes(v.label.toLowerCase()) && !helpSrc.includes(`"${v.id}"`)
  ).map((v) => `${v.id} ("${v.label}")`);
  assert.deepEqual(missing, [], `View chưa được HelpView nhắc: ${missing.join(", ")}`);
});

// ── 2. Mọi cta.view / QUICK_STARTS.view phải trỏ tới view hợp lệ ─────
test("mọi target điều hướng trong help đều hợp lệ", () => {
  const ids = new Set(views.map((v) => v.id));
  const targets = [...helpSrc.matchAll(/view:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 10, "quít ít target — parser hỏng?");
  const bad = [...new Set(targets.filter((t) => !ids.has(t)))];
  assert.deepEqual(bad, [], `cta.view không tồn tại trong VIEWS: ${bad.join(", ")}`);
});

// ── 3. id module + id step phải duy nhất (progress key không đụng nhau) ──
test("id module và id step là duy nhất", () => {
  const all = [...modulesBlock.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(all.length >= 30, `chỉ parse được ${all.length} id — parser hỏng?`);
  const seen = new Map();
  const dup = [];
  for (const id of all) {
    seen.set(id, (seen.get(id) || 0) + 1);
    if (seen.get(id) === 2) dup.push(id);
  }
  assert.deepEqual(dup, [], `id trùng lặp (progress key sẽ đè nhau): ${dup.join(", ")}`);
});

// ── 4. groupId của mọi module phải có label trong HELP_GROUPS ─────────
test("groupId của module đều có trong HELP_GROUPS", () => {
  const keys = new Set([...groupsBlock.matchAll(/"?([\w-]+)"?:\s*"/g)].map((m) => m[1]));
  const used = [...new Set([...modulesBlock.matchAll(/groupId:\s*"([^"]+)"/g)].map((m) => m[1]))];
  const bad = used.filter((g) => !keys.has(g));
  assert.deepEqual(bad, [], `groupId thiếu label: ${bad.join(", ")}`);
});

// ── 5. Đồng bộ phím tắt mới: Ctrl+K toàn cục, Alt+K bảng lệnh ─────────
test("help nhắc đúng Ctrl+K (tìm toàn cục) và Alt+K (bảng lệnh)", () => {
  assert.ok(helpSrc.includes("Ctrl+K"), "help phải nhắc Ctrl+K");
  assert.ok(helpSrc.includes("Alt+K"), "help phải nhắc Alt+K (bảng lệnh khi đọc)");
  assert.match(helpSrc, /Tìm kiếm toàn cục/, "phải gọi đúng tên “Tìm kiếm toàn cục”");
});

// ── 6. Guard: Thực tập = Nhật ký thực tập (không còn mô tả chấm bài sai) ──
test("module Thực tập mô tả đúng Nhật ký thực tập", () => {
  const i = modulesBlock.indexOf('id: "internship"');
  assert.ok(i >= 0, "thiếu module internship");
  const seg = modulesBlock.slice(i, modulesBlock.indexOf('id: "lesson"'));
  assert.ok(seg.includes("Nhật ký thực tập") || seg.includes("nhật ký"), "phải mô tả Nhật ký thực tập");
  assert.ok(!seg.includes("chấm tự động"), "không được mô tả chấm bài tự động (sai tính năng)");
});

// ── 7. Cấu trúc module: đủ trường bắt buộc ────────────────────────────
test("module đủ trường bắt buộc (title/summary/steps/cta)", () => {
  const entries = modulesBlock.split(/\n  \{\n/).slice(1);
  assert.ok(entries.length >= 15, `chỉ ${entries.length} module`);
  for (const e of entries) {
    const id = (e.match(/id:\s*"([^"]+)"/) || [])[1] || "?";
    assert.ok(e.includes("title:"), `module ${id} thiếu title`);
    assert.ok(e.includes("summary:"), `module ${id} thiếu summary`);
    assert.ok(e.includes("steps: ["), `module ${id} thiếu steps`);
    assert.ok(e.includes("cta:"), `module ${id} thiếu cta`);
    const steps = [...e.matchAll(/\{\s*id:\s*"([^"]+)",\s*t:/g)].length;
    assert.ok(steps >= 3, `module ${id} chỉ có ${steps} bước (tối thiểu 3)`);
  }
});
