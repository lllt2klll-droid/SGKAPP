// ── Cross-tab bus (BroadcastChannel) ─────────────────────────────────────────
// Vấn đề: event `storage` của localStorage CHỈ chạy ở tab khác khi key localStorage đổi.
// Các kho IndexedDB (bảng trắng whiteboard_boards, scan, clip, ...) KHÔNG có event
// cross-tab → tab B không biết tab A vừa tạo/sửa bảng.
// → Dùng BroadcastChannel cho nhóm sự kiện DỮ LIỆU.
//
// Nguyên tắc:
//   1. Chỉ broadcast whitelist CROSS_TAB_EVENTS. Không bao giờ broadcast điều hướng/UI
//      (NAVIGATE, OPEN_*, BOOK_OPENED, SEND_TO_WHITEBOARD, WHITEBOARD_ACTION...) —
//      tab khác không được "nhảy view" theo tab đang thao tác.
//   2. Không có echo: BroadcastChannel không giao lại message cho chính tab phát,
//      và mọi message đều mang SENDER_ID để bỏ qua nếu bị bắn lại từ tab khác.
//   3. Không phát lại detail đã là echo storage (source === "cross-tab-sync") —
//      tránh vòng lặp storage → broadcast → storage.
//   4. Môi trường không có BroadcastChannel (Node test, trình duyệt cũ) → im lặng,
//      app vẫn chạy bình thường nhờ event `storage` như cũ.

const CHANNEL_NAME = "sgk:bus";

const SENDER_ID = (() => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
})();

// Whitelist sự kiện dữ liệu được đồng bộ giữa các tab.
// Gồm catch-all DATA_UPDATED + các event domain (chúng cũng đã sinh alias DATA_UPDATED
// ở tab phát, tab nhận sẽ sinh lại alias khi emitLocal) + missions.
const CROSS_TAB_EVENTS = new Set([
  "sgk:data-updated",
  "sgk:lesson-plan-updated",
  "sgk:activity-updated",
  "sgk:question-updated",
  "sgk:worksheet-updated",
  "sgk:whiteboard-updated",
  "sgk:scan-saved",
  "sgk:webtools-updated",
  "sgk:missions-updated",
  // P0 • 3 event domain mới (alias vẫn sinh sgk:data-updated ở cả 2 tab)
  "sgk:vocab-updated",
  "sgk:research-updated",
  "sgk:internship-updated",
]);

let _channel = null; // null = chưa thử, false = không mở được

function channel() {
  if (_channel !== null) return _channel || null;
  if (typeof BroadcastChannel === "undefined") {
    _channel = false;
    return null;
  }
  try {
    _channel = new BroadcastChannel(CHANNEL_NAME);
    // Node: BroadcastChannel giữ event loop (process không thoát) → unref().
    // Trình duyệt không có unref() → bỏ qua.
    if (_channel && typeof _channel.unref === "function") {
      try { _channel.unref(); } catch {}
    }
  } catch {
    _channel = false;
  }
  return _channel || null;
}

export function isCrossTabEvent(eventName) {
  return CROSS_TAB_EVENTS.has(eventName);
}

export function publishCrossTab(eventName, detail) {
  if (!isCrossTabEvent(eventName)) return false;
  if (detail && typeof detail === "object" && detail.source === "cross-tab-sync") return false;
  const ch = channel();
  if (!ch) return false;
  try {
    ch.postMessage({ from: SENDER_ID, eventName, detail: detail === undefined ? null : detail, at: Date.now() });
    return true;
  } catch {
    // detail không structured-clone được (function/DOM/circular không hỗ trợ) → bỏ,
    // không log để tránh spam console khi chạy nhiều tab.
    return false;
  }
}

export function subscribeCrossTab(handler) {
  const ch = channel();
  if (!ch) return () => {};
  const onMessage = (e) => {
    const m = e && e.data;
    if (!m) return;
    if (m.from === SENDER_ID) return; // message của chính tab này (chống loop)
    if (!isCrossTabEvent(m.eventName)) return;
    try {
      handler(m.eventName, m.detail === undefined ? null : m.detail);
    } catch {}
  };
  try {
    ch.addEventListener("message", onMessage);
  } catch {
    return () => {};
  }
  return () => {
    try {
      ch.removeEventListener("message", onMessage);
    } catch {}
  };
}

export const __crossTabSenderId = SENDER_ID;
