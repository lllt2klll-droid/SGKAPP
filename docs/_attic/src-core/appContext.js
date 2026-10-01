// ── App Context — unified AI / business context ─────────────────────
// Every AI call and cross-module action should include this context so
// AI understands the current teacher workspace.

import { loadSettings } from "../settingsStore.js";
import { makeBookContext } from "./bookContext.js";

export function buildAppContext({ book = null, page = null, view = null, lessonPlan = null, board = null, selectedText = null, extra = {} } = {}) {
  let settings = null;
  try { settings = loadSettings(); } catch {}
  const bookCtx = book ? makeBookContext(book, page || 1) : null;
  return {
    book: bookCtx, // { filename, title, subject, grade, term, page, bookPage, chapter, citation }
    view: view || null,
    selectedText: selectedText ? String(selectedText).slice(0, 4000) : null,
    lessonPlan: lessonPlan ? {
      id: lessonPlan.id,
      title: lessonPlan.title || lessonPlan.name || "",
      subject: lessonPlan.monHoc || lessonPlan.subject || bookCtx?.subject || "",
      grade: lessonPlan.lop || lessonPlan.grade || bookCtx?.grade || null,
      objectives: (lessonPlan.objectives || lessonPlan.nlDacThu || []).slice(0, 10),
      activities: Array.isArray(lessonPlan.hoatDong) ? lessonPlan.hoatDong.slice(0, 6).map(a=> ({ name:a.name||a.phase||"", steps:(a.steps||a.buocTienHanh||[]).slice(0,3) })) : [],
    } : null,
    whiteboard: board ? {
      id: board.id,
      name: board.name || "",
      objectsCount: (board.objects||[]).length,
      selectedIds: extra.selectedIds || [],
    } : null,
    settings: settings ? {
      ai: settings.ai || {},
      appearance: settings.appearance || {},
      missions: settings.missions || {},
    } : null,
    at: Date.now(),
    ...extra,
  };
}

// Build prompt suffix for AI — adds book/page/subject context automatically
export function contextToPromptSuffix(ctx) {
  if (!ctx) return "";
  const parts = [];
  if (ctx.book) {
    parts.push(`Sách: ${ctx.book.title}${ctx.book.subject ? ` (${ctx.book.subject})` : ""}${ctx.book.grade ? ` — Lớp ${ctx.book.grade}` : ""}`);
    parts.push(`Trang: ${ctx.book.bookPage}${ctx.book.chapter ? ` — ${ctx.book.chapter}` : ""}`);
    if (ctx.book.citation) parts.push(`Trích dẫn: ${ctx.book.citation}`);
  }
  if (ctx.lessonPlan) parts.push(`Giáo án: ${ctx.lessonPlan.title} — Môn ${ctx.lessonPlan.subject}`);
  if (ctx.selectedText) parts.push(`Đoạn chọn: "${String(ctx.selectedText).slice(0, 600)}"`);
  return parts.length ? `\n\n[Ngữ cảnh hệ thống — đừng lặp lại nguyên văn]\n${parts.join("\n")}` : "";
}

export default { buildAppContext, contextToPromptSuffix };
