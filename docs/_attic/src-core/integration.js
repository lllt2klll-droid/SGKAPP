// ── Unified Integration Hub — "Send To Module" contract ─────────────
// One contract for every cross-module data transfer, replacing the
// scattered custom events per module pair.
//
// Example:
//   integration.open({ target:"whiteboard", payload:{title,text}, source:{ module:"bookReader", book, page:12 } })
// Supports all flows from spec §12:
//   BookReader → Whiteboard/KHBD/Search/Notes/Vocab/AI
//   KHBD → BookReader/Whiteboard/Activities/Worksheets/QuestionBank ...
//   AI → KHBD/Whiteboard/Activities/Questions

import { appEvents, AppEvents } from "./appEvents.js";
import { makeBookContext, makeSourceRef } from "./bookContext.js";

export const IntegrationTargets = {
  WHITEBOARD: "whiteboard",
  KHBD: "khbd",
  LESSONPLANS: "lessonplans",
  ACTIVITIES: "activities",
  WORKSHEETS: "worksheets",
  QUESTIONBANK: "questionbank",
  BOOKREADER: "bookReader",
  SEARCH: "search",
  CONCEPTS: "concepts",
  REFERENCES: "references",
  NOTES: "notes",
  VOCAB: "vocab",
  AI: "ai",
};

function normalizeSource(source) {
  if (!source) return { module: "unknown", at: Date.now() };
  if (typeof source === "string") return { module: source, at: Date.now() };
  return { at: Date.now(), ...source };
}

// Core: open target with payload + source context
export function open({ target, payload = {}, source = null, navigate = true } = {}) {
  if (!target) throw new Error("integration.open: target required");
  const src = normalizeSource(source);
  // Build sourceRef if book present
  let sourceRef = payload.sourceRef || null;
  if (!sourceRef && src.book) {
    const ctx = makeBookContext(src.book, src.page || payload.page || 1);
    if (ctx) sourceRef = makeSourceRef(ctx);
  }
  const detail = {
    target,
    payload: { ...payload, sourceRef: sourceRef || payload.sourceRef || null },
    source: src,
    sourceRef,
    at: Date.now(),
  };
  // 1) Dedicated integration event (for future routing)
  try { appEvents.emit("sgk:integration-open", detail); } catch {}
  // 2) Per-target events via appEvents (bridge to window handled inside appEvents)
  if (target === IntegrationTargets.WHITEBOARD || target === "whiteboard") {
    try { appEvents.emit(AppEvents.SEND_TO_WHITEBOARD, detail.payload); } catch {}
    try {
      import("../whiteboard/whiteboardStore.js").then(m=> { try{ m.queuePendingPayload(detail.payload);}catch{} }).catch(()=>{});
    } catch {}
  }
  if (target === IntegrationTargets.SEARCH || target === "search") {
    try { appEvents.emit(AppEvents.SEARCH_UPDATED, detail.payload); } catch {}
  }
  // Generic per-target emit for other modules (KHBD, activities, worksheets, questionbank, etc.)
  // Listeners receive payload + sourceRef without needing window CustomEvent
  if (![IntegrationTargets.WHITEBOARD, "whiteboard", IntegrationTargets.SEARCH, "search"].includes(target)) {
    try { appEvents.emit(`sgk:integration:${target}`, detail); } catch {}
  }
  // 3) Navigate if requested (except when caller handles nav)
  if (navigate) {
    const viewMap = {
      whiteboard: "whiteboard",
      khbd: "lessonplans",
      lessonplans: "lessonplans",
      activities: "activities",
      worksheets: "worksheets",
      questionbank: "questionbank",
      bookReader: "library",
      search: "search",
      concepts: "concepts",
      references: "references",
    };
    const view = viewMap[target] || target;
    try { appEvents.emitNavigate(view, { integration: detail }); } catch {}
  }
  return detail;
}

// Convenience: from BookReader
export function fromBookToModule(book, pdfPage, text, target, extraPayload = {}) {
  const ctx = makeBookContext(book, pdfPage);
  const sourceRef = ctx ? makeSourceRef(ctx) : null;
  const title = extraPayload.title || (book?.title ? `${book.title} — tr.${ctx?.bookPage || pdfPage}` : "Trích từ SGK");
  return open({
    target,
    payload: { title, text: String(text||"").slice(0, 4000), sourceRef, bookPage: ctx?.bookPage, page: pdfPage, ...extraPayload },
    source: { module: "bookReader", book, page: pdfPage, bookContext: ctx },
  });
}

// From KHBD plan
export function fromKhbdToModule(plan, target, extraPayload = {}) {
  return open({
    target,
    payload: { lessonPlan: plan, title: plan?.title || plan?.name || "Giáo án", ...extraPayload },
    source: { module: "khbd", lessonPlanId: plan?.id },
  });
}

export const integration = { open, fromBookToModule, fromKhbdToModule, Targets: IntegrationTargets };
export default integration;
