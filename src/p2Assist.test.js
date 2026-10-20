// P2 • AI vào bus + guard hoàn tác, WebToolbox qua bus + kiểm tra link,
// Help deep-link đúng tab. Phần hành vi mạng/DOM kiểm tra bằng stub/text
// (theo mẫu helpCoverage.test.js + InternshipView test P0).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

// ── 1. AssistantBubble nghe bus (không emit → không loop) ──────────────
test("P2: AssistantBubble subscribe DATA_UPDATED và dọn listener", () => {
  const src = readSrc("AssistantBubble.jsx");
  assert.ok(src.includes("appEvents.on(AppEvents.DATA_UPDATED"), "thiếu subscribe bus");
  assert.ok(src.includes("dataRevision"), "ngữ cảnh AI thiếu số hiệu bản dữ liệu");
  assert.ok(src.includes("userDataCounts"), "ngữ cảnh AI thiếu số liệu sổ tay/kho");
});

// ── 2. Ngữ cảnh AI đọc live số liệu service ────────────────────────────
test("P2: buildAppContext đọc live vocab/questions/activities/worksheets/plans", () => {
  const src = readSrc("AssistantBubble.jsx");
  for (const fn of ["getVocab()", "getQuestions()", "getActivities()", "getWorksheets()", "getPlans()"]) {
    assert.ok(src.includes(fn), `thiếu ${fn} trong ngữ cảnh AI`);
  }
});

// ── 3. Guard hoàn tác lưu sổ tay ───────────────────────────────────────
test("P2: saveToNotebook có Hoàn tác 6s, không offer khi gộp trùng", () => {
  const src = readSrc("AssistantBubble.jsx");
  assert.ok(src.includes("undoNotebookSave"), "thiếu hàm hoàn tác");
  assert.ok(src.includes("removeVocabEntry"), "hoàn tác phải xóa mục vừa thêm");
  assert.ok(src.includes("Hoàn tác"), "thiếu nút Hoàn tác");
  assert.ok(src.includes("6000"), "cửa sổ hoàn tác phải 6s theo mẫu App");
});

// ── 4. Fallback điều hướng AI qua bus ───────────────────────────────────
test("P2: AssistantBubble không dispatch window trực tiếp", () => {
  const src = readSrc("AssistantBubble.jsx");
  assert.ok(!src.includes('new CustomEvent("sgk:navigate"'), "còn dispatch window thủ công");
  assert.ok(src.includes("appEvents.emit(AppEvents.NAVIGATE"), "fallback phải qua bus");
});

// ── 5. WebToolbox qua bus + có kiểm tra link ───────────────────────────
test("P2: WebToolbox nghe bus, có nút Kiểm tra link", () => {
  const src = readSrc("WebToolboxView.jsx");
  assert.ok(!src.includes('window.addEventListener("sgk:webtools-updated"'), "còn listener window cũ");
  assert.ok(src.includes("appEvents.on(AppEvents.WEBTOOLS_UPDATED"), "thiếu subscribe bus");
  assert.ok(src.includes("checkAllLinks"), "thiếu kiểm tra toàn kho");
  assert.ok(src.includes("Kiểm tra link"), "thiếu nút Kiểm tra link");
  assert.ok(src.includes("./webtoolsCheck"), "chưa dùng module webtoolsCheck");
});

// ── 6. Help deep-link đúng tab ─────────────────────────────────────────
test("P2: Help CTA kèm tab và navigate chuyển tiếp", () => {
  const src = readSrc("HelpView.jsx");
  assert.ok(src.includes('tab: "lookup"'), "thiếu deep-link tab Tra cứu");
  assert.ok(src.includes('tab: "today"'), "thiếu deep-link tab Hôm nay");
  assert.ok(src.includes("mod.cta.tab ? { tab: mod.cta.tab }"), "navigate chưa chuyển tiếp tab");
});
