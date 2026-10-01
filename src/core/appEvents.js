// ── Unified App Event Bus ─────────────────────────────────────────────
// Single Source of Truth for all cross-module communication.
// MODEL A — INTERNAL EVENT BUS (critical fix for double-fire)
//   appEvents.emit() → internal _directListeners (sole path for appEvents.on)
//   + window.dispatchEvent with marker for legacy window.addEventListener
//   window → appEvents bridge: single per-event window listener that forwards
//   legacy window.dispatchEvent(new CustomEvent) to direct listeners,
//   skipping events already marked as from appEvents to prevent loop/double.
//
// Before: on() registered BOTH direct + window listener, emit() fired BOTH → handler ran 2×.
// After:  on() registers ONLY direct; emit() fires direct + marked window dispatch.
//         Bridge listens on window once per event and forwards unmarked legacy events to direct.
//         Marked events are ignored by bridge → no double, no loop.
//
// Legacy bridge: window.addEventListener("sgk:data-updated") still works because
// emit() always dispatches to window. New code should use appEvents.on().
// No per-handler window listener → no leak, off/unsubscribe cleans direct only.
// Every module SHOULD emit through this bus instead of direct dispatchEvent.
//
// CROSS-TAB: event `storage` chỉ sync được localStorage. Kho IndexedDB (bảng trắng,
// scan, ...) cần BroadcastChannel → xem core/crossTab.js. Nhóm sự kiện dữ liệu được
// publish sang tab khác; tab nhận chạy lại emitLocal (không publish tiếp → không loop).
//

import { publishCrossTab, subscribeCrossTab } from "./crossTab.js";

export const AppEvents = {
  // Data lifecycle
  DATA_UPDATED: "sgk:data-updated",
  STORAGE_UPDATED: "sgk:storage-updated",
  STORAGE_QUOTA_EXCEEDED: "sgk:storage-quota-exceeded",
  // Settings
  SETTINGS_UPDATED: "sgk:settings-updated",
  // Navigation
  NAVIGATE: "sgk:navigate",
  OPEN_SOURCE: "sgk:open-source",
  OPEN_GLOBAL_SEARCH: "sgk:open-global-search",
  // Book domain
  BOOK_OPENED: "sgk:book-opened",
  BOOK_UPDATED: "sgk:book-updated",
  // Source
  SOURCE_OPEN: "sgk:source-open",
  // Search
  SEARCH_UPDATED: "sgk:search-updated",
  INDEX_READY: "sgk:index-ready",
  // Content domains
  SCAN_SAVED: "sgk:scan-saved",
  LESSON_PLAN_UPDATED: "sgk:lesson-plan-updated",
  ACTIVITY_UPDATED: "sgk:activity-updated",
  QUESTION_UPDATED: "sgk:question-updated",
  WORKSHEET_UPDATED: "sgk:worksheet-updated",
  WHITEBOARD_UPDATED: "sgk:whiteboard-updated",
  SEND_TO_WHITEBOARD: "sgk:send-to-whiteboard",
  WHITEBOARD_ACTION: "sgk:whiteboard-action",
  MISSION_PROGRESS: "sgk:mission-progress",
  MISSIONS_UPDATED: "sgk:missions-updated",
  WEBTOOLS_UPDATED: "sgk:webtools-updated",
  // Niche events — trước đây dispatch thẳng ra window (đã gom về bus)
  OPEN_WORD_EDITOR: "sgk:open-word-editor",
  FILTER_SUBJECT: "sgk:filter-subject",
  SYNC_STATUS_UPDATED: "sync-status-updated",
};

export const DataDomains = {
  BOOKMARKS: "bookmarks",
  VOCAB: "vocab",
  NOTES: "notes",
  MARKS: "marks",
  TEACHER_NOTES: "teacherNotes",
  CLIPS: "clips",
  REFS: "refs",
  CONCEPTS: "concepts",
  COLLECTIONS: "collections",
  EVIDENCE: "evidence",
  LESSON_PLANS: "lessonPlans",
  ACTIVITIES: "activities",
  WORKSHEETS: "worksheets",
  QUESTIONS: "questions",
  WHITEBOARD: "whiteboard",
  SCANS: "scans",
  SEARCH_INDEX: "searchIndex",
  SETTINGS: "settings",
  MISSIONS: "missions",
  WEBTOOLS: "webtools",
  BOOKS: "books",
};

const _directListeners = new Map(); // eventName -> Set<fn>
const _windowBridges = new Map(); // eventName -> window handler (single per event)
const _MARK = "__fromAppEvents";

function ensureSet(name) {
  if (!_directListeners.has(name)) _directListeners.set(name, new Set());
  return _directListeners.get(name);
}

function ensureWindowBridge(eventName) {
  if (_windowBridges.has(eventName)) return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  const bridge = (e) => {
    // Skip events that originated from appEvents.emit (event marker)
    try { if (e && e[_MARK]) return; } catch {}
    const set = _directListeners.get(eventName);
    if (!set || set.size === 0) return;
    const detail = e && "detail" in e ? e.detail : undefined;
    for (const fn of [...set]) {
      try { fn(detail, eventName); } catch (err) { console.warn("[appEvents] bridge handler error", eventName, err); }
    }
  };
  _windowBridges.set(eventName, bridge);
  try { window.addEventListener(eventName, bridge); } catch {}
}

function dispatchMarked(eventName, detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    const ev = new CustomEvent(eventName, { detail });
    ev[_MARK] = true;
    window.dispatchEvent(ev);
  } catch {}
}

const DOMAIN_ALIAS_EVENTS = new Set([
  AppEvents.LESSON_PLAN_UPDATED,
  AppEvents.ACTIVITY_UPDATED,
  AppEvents.QUESTION_UPDATED,
  AppEvents.WORKSHEET_UPDATED,
  AppEvents.WHITEBOARD_UPDATED,
  AppEvents.SCAN_SAVED,
  AppEvents.WEBTOOLS_UPDATED,
]);

// Phát trong TAB HIỆN TẠI: direct listeners + window dispatch (legacy) + alias DATA_UPDATED.
function emitLocal(eventName, detail = {}) {
  // 1) Direct in-memory listeners (sole path for appEvents.on)
  const set = _directListeners.get(eventName);
  if (set) {
    for (const fn of [...set]) {
      try { fn(detail, eventName); } catch (e) { console.warn("[appEvents] handler error", eventName, e); }
    }
  }
  // 2) Window dispatch for legacy window.addEventListener listeners.
  //    Event is marked so the window→direct bridge ignores it (prevents double-fire/loop).
  dispatchMarked(eventName, detail);
  // 3) Domain alias: sgk:* domain events also notify DATA_UPDATED listeners
  //    Direct + window both marked to keep bridge from re-firing.
  if (eventName !== AppEvents.DATA_UPDATED && String(eventName).startsWith("sgk:")) {
    if (DOMAIN_ALIAS_EVENTS.has(eventName)) {
      const aliasDetail = { source: eventName, ...(detail && typeof detail === "object" ? detail : { value: detail }) };
      const ds = _directListeners.get(AppEvents.DATA_UPDATED);
      if (ds) for (const fn of [...ds]) { try { fn(aliasDetail, AppEvents.DATA_UPDATED); } catch {} }
      dispatchMarked(AppEvents.DATA_UPDATED, aliasDetail);
    }
  }
}

// >0 khi đang chạy reaction của một message BroadcastChannel vừa nhận từ tab khác.
let _remoteDispatchDepth = 0;

export const appEvents = {
  emit(eventName, detail = {}) {
    emitLocal(eventName, detail);
    // Publish sang các tab khác (whitelist trong core/crossTab.js).
    // Bỏ qua khi đây là reaction của message vừa nhận → không ping-pong giữa các tab.
    if (_remoteDispatchDepth === 0) publishCrossTab(eventName, detail);
  },

  on(eventName, handler) {
    const set = ensureSet(eventName);
    set.add(handler);
    // Ensure legacy window→direct bridge exists so that old
    // window.dispatchEvent(new CustomEvent(eventName)) also reaches direct listeners (once).
    ensureWindowBridge(eventName);
    // Also ensure bridge for DATA_UPDATED alias if this event is an alias source
    if (DOMAIN_ALIAS_EVENTS.has(eventName)) ensureWindowBridge(AppEvents.DATA_UPDATED);
    return () => {
      const s = _directListeners.get(eventName);
      if (s) s.delete(handler);
      // Keep window bridge alive (single per event) to avoid churn; only direct set is cleaned.
    };
  },

  once(eventName, handler) {
    let off = null;
    const wrapper = (...args) => { try { if (off) off(); } catch {} handler(...args); };
    off = this.on(eventName, wrapper);
    return off;
  },

  off(eventName, handler) {
    const set = _directListeners.get(eventName);
    if (set) set.delete(handler);
  },

  // Legacy escape hatch for external code that truly needs window listener
  // Prefer appEvents.on(). This is for rare cross-tab or non-sgk events.
  __getDirectListeners: () => _directListeners,
  __getWindowBridges: () => _windowBridges,

  // Typed helpers for DATA_UPDATED
  emitDataUpdated({ domain, action, id, source } = {}) {
    this.emit(AppEvents.DATA_UPDATED, { domain, action, id, source: source || domain || "app", at: Date.now() });
  },
  emitSettingsUpdated(settings) {
    this.emit(AppEvents.SETTINGS_UPDATED, settings);
  },
  emitNavigate(view, payload = {}) {
    this.emit(AppEvents.NAVIGATE, { view, ...payload });
  },
};

// ── Đồng bộ localStorage toàn app (Cross-tab sync) ──
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    // e.key is null when localStorage.clear() is called
    if (!e.key || e.key.startsWith("sgk_")) {
      const key = e.key || "unknown_clear";
      
      let domain = "storage";
      if (key.includes("lessonPlan") || key.includes("khbd")) domain = DataDomains.LESSON_PLANS;
      else if (key.includes("wb_") || key.includes("whiteboard")) domain = DataDomains.WHITEBOARD;
      else if (key.includes("settings")) domain = DataDomains.SETTINGS;
      else if (key.includes("missions")) domain = DataDomains.MISSIONS;
      else if (key.includes("activities")) domain = DataDomains.ACTIVITIES;
      else if (key.includes("questions")) domain = DataDomains.QUESTIONS;
      
      // Notify the app that data was updated from another tab
      appEvents.emitDataUpdated({ domain, source: "cross-tab-sync", id: key });
      
      // Also emit specific events for domain listeners
      if (domain === DataDomains.LESSON_PLANS) {
        appEvents.emit(AppEvents.LESSON_PLAN_UPDATED, { key, source: "cross-tab-sync" });
      } else if (domain === DataDomains.WHITEBOARD) {
        appEvents.emit(AppEvents.WHITEBOARD_UPDATED, { key, source: "cross-tab-sync" });
      } else if (domain === DataDomains.SETTINGS) {
        try {
          if (e.newValue) {
            const s = JSON.parse(e.newValue);
            appEvents.emitSettingsUpdated(s);
          }
        } catch {}
      }
    }
  });
}

// ── Nhận sự kiện từ các tab khác (BroadcastChannel) ──
// Kho IndexedDB không có event `storage` nên event `storage` phía trên không cover được.
// Chạy lại emitLocal (không publish tiếp) → listener trong tab này chạy đúng như thể
// chính tab này vừa emit, và KHÔNG bắn ngược về tab phát.
subscribeCrossTab((eventName, detail) => {
  _remoteDispatchDepth += 1;
  try {
    emitLocal(eventName, detail);
  } finally {
    _remoteDispatchDepth -= 1;
  }
});

export default appEvents;
