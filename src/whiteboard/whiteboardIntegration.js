// ─── Whiteboard Integration Hub — liên kết chung cho toàn app ───
// Không module nào lạc quẻ: SGK, Soạn Dạy, Ngân Hàng, Nghiên Cứu, Dashboard, Search, Backup, Missions đều nói chuyện qua hub này.

import { queuePendingPayload } from "./whiteboardStore.js";
import { blankObject } from "./whiteboardStore.js";
import { generateMindmap } from "./mindmapEngine.js";
import { chapterForPage as _chapterForPage, citationFor as _citationFor } from "../researchDB.js";
import { safeGetJSON } from "../safeStorage.js";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { makeBookContext, makeSourceRef } from "../core/bookContext.js";
function awaitImportBookContext(){ return { makeBookContext, makeSourceRef }; }

const PLACEHOLDER_PAT = "Trang này dạng ảnh";
function stripPlaceholder(s) {
  if (!s) return s;
  if (String(s).includes(PLACEHOLDER_PAT)) return "";
  return s;
}

// ── Gửi nội dung bất kỳ vào Whiteboard (đang mở hoặc sẽ mở) ──
// Hỗ trợ liên kết 2 chiều: sourceRef { filename, title, page, bookPage, chapter, citation } + imageDataUrl
// FIX BookReader heavy duplicate: trước emit 3 lần (direct + integration + queue) → lặp ảnh, nặng. Giờ chỉ emit 1 lần duy nhất qua queuePendingPayload.
export function sendToWhiteboard({ title, text, kind = "node", source = "app", sourceRef = null, imageDataUrl = null, mindmapBranches = null }) {
  const cleanTitle = stripPlaceholder(title) || title;
  const cleanText = stripPlaceholder(text);
  const payload = {
    title: String(cleanTitle || cleanText || "Nội dung").slice(0, 80),
    text: String(cleanText || cleanTitle || "").slice(0, 2000),
    kind,
    source,
    sourceRef: sourceRef ? { ...sourceRef } : null,
    imageDataUrl: imageDataUrl || null,
    mindmapBranches: Array.isArray(mindmapBranches) ? mindmapBranches.slice(0, 8) : null,
    at: Date.now(),
  };
  // Nếu cả title & text đều là placeholder và không có ảnh → bỏ qua
  if (!payload.text && !payload.imageDataUrl && String(title || "").includes(PLACEHOLDER_PAT)) {
    payload.text = "";
  }
  // 1. Lưu pending + emit DUY NHẤT qua unified bus (queuePendingPayload đã emit AppEvents.SEND_TO_WHITEBOARD)
  // Trước đây emit trực tiếp + integration.open + queue → 3 lần → lặp ảnh cực nặng
  queuePendingPayload(payload);
  // 1b. Tracing qua integration hub nhưng KHÔNG emit lại SEND_TO_WHITEBOARD (chỉ log navigate=false để tránh loop)
  // Bỏ để tránh duplicate; nếu cần trace sau này có thể emit event khác
  // 2. Chuyển view sang whiteboard (nếu App đang lắng nghe)
  try { appEvents.emit(AppEvents.NAVIGATE, { view: "whiteboard", payload }); } catch (e) { console.warn("[whiteboardIntegration] emit navigate failed", e); }
  return payload;
}

// ── Helper: gửi trích đoạn sách kèm citation/chapter → board — via BookContext canonical ──
export function sendBookSelectionToBoard({ book, pdfPage, text, title }) {
  // Phase 8: use makeBookContext/makeSourceRef for single SourceRef truth
  let sourceRef = null;
  try {
    const { makeBookContext: _mbc, makeSourceRef: _msr } = awaitImportBookContext();
    if (_mbc && _msr) {
      const ctx = _mbc(book, Number(pdfPage) || 1);
      if (ctx) sourceRef = _msr(ctx);
    }
  } catch {}
  if (!sourceRef) {
    const bp = Math.max(1, Number(pdfPage) - 1);
    let chapter = "";
    let citationText = "";
    try {
      chapter = _chapterForPage ? _chapterForPage(book, Number(pdfPage)) : "";
      citationText = _citationFor ? _citationFor(book, Number(pdfPage)) : "";
    } catch (e) { console.warn("[whiteboardIntegration] chapter/citation failed", e); }
    if (!citationText) citationText = `${book?.title || "SGK"} — tr. ${bp}${chapter ? ` · ${chapter}` : ""}`;
    sourceRef = {
      filename: book?.filename || "",
      title: book?.title || "",
      page: Number(pdfPage) || 1,
      bookPage: bp,
      chapter: chapter || "",
      citation: citationText,
      grade: book?.grade || null,
      subject: book?.subject || "",
    };
  }
  // Nếu text dài ≥ 3 dòng → tạo mindmap, ngược lại node + note
  const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let mindmapBranches = null;
  if (lines.length >= 3) {
    mindmapBranches = lines.slice(0, 5).map((l) => l.slice(0, 30));
  }
  return sendToWhiteboard({
    title: title || `${book?.title || "SGK"} — tr.${bp}`,
    text,
    source: "bookReader",
    sourceRef,
    mindmapBranches,
  });
}

// ── Helper: gửi scan (ảnh + text) vào board ──
export function sendScanToBoard({ scan, analysisText, title }) {
  const sourceRef = scan?.book ? {
    filename: scan.book.filename || "",
    title: scan.book.title || "",
    page: Number(scan.page) || 1,
    bookPage: Math.max(1, Number(scan.page) - 1),
    chapter: "",
    citation: `${scan.book.title || "SGK"} — tr. ${Math.max(1, Number(scan.page) - 1)} (scan)`,
    grade: scan.book.grade || null,
    subject: scan.book.subject || "",
  } : null;
  return sendToWhiteboard({
    title: title || `Scan: ${scan?.book?.title || "SGK"} — tr.${scan?.page || ""}`,
    text: analysisText || scan?.dataUrl ? (analysisText || "").slice(0, 1200) : "",
    source: "scan",
    sourceRef,
    imageDataUrl: scan?.dataUrl || null,
  });
}

// ── Từ LessonPlan → Whiteboard mindmap ──
export function lessonPlanToBoard(plan) {
  if (!plan) return null;
  const title = plan.title || plan.name || "Bài học";
  const branches = [];
  if (Array.isArray(plan.hoatDong)) {
    plan.hoatDong.forEach((act) => {
      const label = act.name || act.phase || "Hoạt động";
      const kids = [];
      if (Array.isArray(act.steps)) act.steps.slice(0, 3).forEach((s) => kids.push((s.teacherAction || s.content || "").slice(0, 28)));
      branches.push({ label: String(label).slice(0, 30), children: kids });
    });
  }
  if (plan.objectives && Array.isArray(plan.objectives)) {
    branches.unshift({ label: "Mục tiêu", children: plan.objectives.slice(0, 3).map((o) => String(o).slice(0, 28)) });
  }
  if (!branches.length) branches.push({ label: "Nội dung chính", children: [] });
  return generateMindmap(title.slice(0, 40), branches.slice(0, 6));
}

// ── Từ Questions → Whiteboard ──
export function questionsToBoard(questions, opts = {}) {
  if (!Array.isArray(questions) || !questions.length) return null;
  const title = opts.title || `Bộ ${questions.length} câu hỏi`;
  const byLevel = {};
  questions.forEach((q) => {
    const lvl = q.mucdo || q.level || "Chung";
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(q);
  });
  const branches = Object.entries(byLevel).slice(0, 6).map(([lvl, list]) => ({
    label: `${lvl} (${list.length})`,
    children: list.slice(0, 3).map((q) => String(q.question || q.content || "").slice(0, 28)),
  }));
  if (!branches.length) {
    return generateMindmap(title, questions.slice(0, 5).map((q, i) => ({ label: `Câu ${i + 1}`, children: [String(q.question || "").slice(0, 28)] })));
  }
  return generateMindmap(title, branches);
}

// ── Từ SGK page/clip → Whiteboard ──
export function bookPageToBoard({ bookTitle, page, text, clip }) {
  const title = clip ? `Trích: ${String(clip).slice(0, 30)}` : `${bookTitle || "SGK"} — tr.${page || ""}`;
  const body = text ? String(text).slice(0, 1200) : clip ? String(clip).slice(0, 800) : "";
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
  if (lines.length >= 3) {
    return generateMindmap(title.slice(0, 40), lines.slice(0, 5).map((l) => ({ label: l.slice(0, 30), children: [] })));
  }
  return null;
}

// ── Cho GlobalSearch index ──
export function getWhiteboardIndex() {
  try {
    const idx = safeGetJSON("sgk_wb_index", [], Array.isArray);
    if (!Array.isArray(idx)) return [];
    return idx.map((e) => ({
      id: `wb:${e.id}`,
      type: "whiteboard",
      title: e.name || "Bảng trắng",
      subtitle: new Date(e.updatedAt).toLocaleDateString("vi-VN"),
      view: "whiteboard",
      boardId: e.id,
    }));
  } catch (e) { console.warn("[whiteboardIntegration] getWhiteboardIndex failed", e); return []; }
}

// ── Missions — Whiteboard hành động được tính điểm ──
export function trackWhiteboardAction(action, meta = {}) {
  try {
    appEvents.emit(AppEvents.WHITEBOARD_ACTION, { action, ...meta, at: Date.now() });
    appEvents.emit(AppEvents.MISSION_PROGRESS, { source: "whiteboard", action, ...meta });
  } catch (e) { console.warn("[whiteboardIntegration] trackWhiteboardAction failed", e); }
  // âm thanh đã xử lý trong WhiteboardView via playWb, không cần thêm
}

// ── Lắng nghe điều hướng từ hub — via unified bus ──
export function onNavigateToWhiteboard(handler) {
  return appEvents.on(AppEvents.NAVIGATE, (detail) => {
    if (detail?.view === "whiteboard") handler(detail);
  });
}
