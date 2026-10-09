// ── Keyboard Shortcuts — Default map + helpers (cực chi tiết) ──
import { loadSettings } from "./settingsStore.js";

export const DEFAULT_SHORTCUTS = {
  // ── Global ──
  "global.commandPalette": "Ctrl+K",
  "global.search": "Ctrl+F",
  "global.close": "Escape",
  "global.help": "F1",
  // ── App Navigation (chuyển trang) ──
  "nav.dashboard": "Alt+1",
  "nav.library": "Alt+2",
  "nav.continue": "Alt+3",
  "nav.marks": "Alt+4",
  "nav.vocab": "Alt+5",
  "nav.search": "Alt+6",
  "nav.compare": "Alt+7",
  "nav.matrix": "Alt+8",
  "nav.lessonplans": "Alt+L",
  "nav.activities": "Alt+A",
  "nav.worksheets": "Alt+W",
  "nav.questionbank": "Alt+Q",
  "nav.whiteboard": "Alt+B",
  "nav.tasks": "Alt+T",
  // ── Whiteboard — Công cụ ──
  "whiteboard.select": "V",
  "whiteboard.pan": "H",
  "whiteboard.pen": "P",
  "whiteboard.text": "T",
  "whiteboard.shape": "S",
  "whiteboard.connector": "L",
  "whiteboard.undo": "Ctrl+Z",
  "whiteboard.redo": "Ctrl+Y",
  "whiteboard.save": "Ctrl+S",
  "whiteboard.duplicate": "Ctrl+D",
  // ── Reader — Điều hướng trang ──
  "reader.prevPage": "ArrowLeft",
  "reader.nextPage": "ArrowRight",
  "reader.goToPage": "Ctrl+G",
  "reader.firstPage": "Home",
  "reader.lastPage": "End",
  // ── Reader — Xem ──
  "reader.zoomIn": "+",
  "reader.zoomOut": "-",
  "reader.fitToWidth": "f",
  "reader.toggleToc": "t",
  "reader.toggleAi": "a",
  "reader.toggleFullscreen": "F",
  "reader.toggleTwoPage": "2",
  "reader.toggleBookmark": "Ctrl+D",
  // ── Reader — AI ──
  "reader.aiChat": "Ctrl+Shift+C",
  "reader.aiAnalyze": "Ctrl+Shift+N",
  "reader.aiQuiz": "Ctrl+Shift+Q",
  "reader.aiLesson": "Ctrl+Shift+L",
  "reader.aiTools": "Ctrl+Shift+T",
  // ── Reader — Công cụ ──
  "reader.ocr": "Ctrl+Shift+O",
  "reader.notes": "n",
  "reader.glossary": "g",
  "reader.tags": "Ctrl+T",
  "reader.clip": "Ctrl+Shift+S",
  "reader.drawing": "d",
  "reader.tts": "Ctrl+Shift+V",
  "reader.scan": "Ctrl+Shift+X",
  // Bảng lệnh khi đọc — phím RIÊNG, không dùng Ctrl+K (trùng với global.commandPalette).
  "reader.commandPalette": "Alt+K",
};

export const SHORTCUT_META = {
  // Ctrl+K = GlobalSearch (tìm kiếm toàn cục) — KHÔNG phải bảng lệnh.
  // Bảng lệnh của Reader là phím RIÊNG reader.commandPalette (Alt+K).
  "global.commandPalette": { label: "Tìm kiếm toàn cục", cat: "Chung", desc: "Mở ô tìm kiếm Ctrl+K (mục lục, sách, ghi chú…)" },
  "global.search": { label: "Tìm kiếm toàn cục", cat: "Chung", desc: "Mở tìm kiếm" },
  "global.close": { label: "Đóng modal / Thoát", cat: "Chung", desc: "Esc để đóng" },
  "global.help": { label: "Trợ giúp phím tắt", cat: "Chung", desc: "Mở trợ giúp" },
  "nav.dashboard": { label: "Tổng quan", cat: "Chuyển trang", desc: "Đến Tổng quan" },
  "nav.library": { label: "Thư viện sách", cat: "Chuyển trang", desc: "Đến Thư viện" },
  "nav.continue": { label: "Tiếp tục đọc", cat: "Chuyển trang", desc: "Tiếp tục đọc" },
  "nav.marks": { label: "Đánh dấu", cat: "Chuyển trang", desc: "Đến Đánh dấu" },
  "nav.vocab": { label: "Từ vựng", cat: "Chuyển trang", desc: "Đến Từ vựng" },
  "nav.search": { label: "Tìm kiếm", cat: "Chuyển trang", desc: "Đến Tìm kiếm" },
  "nav.compare": { label: "So sánh", cat: "Chuyển trang", desc: "Đến So sánh" },
  "nav.matrix": { label: "Ma trận", cat: "Chuyển trang", desc: "Đến Ma trận" },
  "nav.lessonplans": { label: "Giáo án", cat: "Chuyển trang", desc: "Đến Giáo án" },
  "nav.activities": { label: "Hoạt động", cat: "Chuyển trang", desc: "Đến Hoạt động" },
  "nav.worksheets": { label: "Phiếu học tập", cat: "Chuyển trang", desc: "Đến Phiếu" },
  "nav.questionbank": { label: "Ngân hàng câu hỏi", cat: "Chuyển trang", desc: "Đến Ngân hàng" },
  "nav.whiteboard": { label: "Whiteboard", cat: "Chuyển trang", desc: "Đến Bảng trắng" },
  "nav.tasks": { label: "Nhiệm vụ", cat: "Chuyển trang", desc: "Đến hub Nhiệm vụ (daily + việc cần làm)" },
  "whiteboard.select": { label: "Chọn", cat: "Whiteboard", desc: "Công cụ chọn (V)" },
  "whiteboard.pan": { label: "Di chuyển", cat: "Whiteboard", desc: "Kéo canvas (H/Space)" },
  "whiteboard.pen": { label: "Bút", cat: "Whiteboard", desc: "Vẽ tự do (P)" },
  "whiteboard.text": { label: "Văn bản", cat: "Whiteboard", desc: "Thêm chữ (T)" },
  "whiteboard.shape": { label: "Hình khối", cat: "Whiteboard", desc: "Thêm hình (S)" },
  "whiteboard.connector": { label: "Kết nối", cat: "Whiteboard", desc: "Nối khối (L)" },
  "whiteboard.undo": { label: "Hoàn tác", cat: "Whiteboard", desc: "Ctrl+Z" },
  "whiteboard.redo": { label: "Làm lại", cat: "Whiteboard", desc: "Ctrl+Y" },
  "whiteboard.save": { label: "Lưu bảng", cat: "Whiteboard", desc: "Ctrl+S" },
  "whiteboard.duplicate": { label: "Nhân bản", cat: "Whiteboard", desc: "Ctrl+D" },
  "reader.prevPage": { label: "Trang trước", cat: "Đọc — Điều hướng", desc: "Lùi 1-2 trang (tùy chế độ)" },
  "reader.nextPage": { label: "Trang sau", cat: "Đọc — Điều hướng", desc: "Tiến 1-2 trang" },
  "reader.goToPage": { label: "Đi đến trang", cat: "Đọc — Điều hướng", desc: "Mở ô nhập trang" },
  "reader.firstPage": { label: "Trang đầu", cat: "Đọc — Điều hướng", desc: "Nhảy về đầu sách" },
  "reader.lastPage": { label: "Trang cuối", cat: "Đọc — Điều hướng", desc: "Nhảy về cuối sách" },
  "reader.zoomIn": { label: "Phóng to", cat: "Đọc — Xem", desc: "+ / =" },
  "reader.zoomOut": { label: "Thu nhỏ", cat: "Đọc — Xem", desc: "- / _" },
  "reader.fitToWidth": { label: "Vừa khổ trang", cat: "Đọc — Xem", desc: "Fit width" },
  "reader.toggleToc": { label: "Bật/tắt Mục lục", cat: "Đọc — Xem", desc: "Hiện/ẩn TOC" },
  "reader.toggleAi": { label: "Bật/tắt bảng AI", cat: "Đọc — Xem", desc: "Hiện/ẩn AI panel" },
  "reader.toggleFullscreen": { label: "Toàn màn hình", cat: "Đọc — Xem", desc: "Fullscreen" },
  "reader.toggleTwoPage": { label: "Chế độ 2 trang", cat: "Đọc — Xem", desc: "Bật/tắt 2 trang" },
  "reader.toggleBookmark": { label: "Đánh dấu trang", cat: "Đọc — Xem", desc: "Bookmark trang hiện tại" },
  "reader.aiChat": { label: "Hỏi AI", cat: "Đọc — AI", desc: "Mở tab Hỏi AI" },
  "reader.aiAnalyze": { label: "Phân tích trang", cat: "Đọc — AI", desc: "Mở tab Phân tích" },
  "reader.aiQuiz": { label: "Tạo bài tập", cat: "Đọc — AI", desc: "Mở tab Sư phạm" },
  "reader.aiLesson": { label: "Soạn giáo án", cat: "Đọc — AI", desc: "Mở tab Soạn dạy" },
  "reader.aiTools": { label: "Công cụ AI", cat: "Đọc — AI", desc: "Mở tab Công cụ" },
  "reader.ocr": { label: "OCR — Nhận diện", cat: "Đọc — Công cụ", desc: "Mở OCR drawer" },
  "reader.notes": { label: "Ghi chú có cấu trúc", cat: "Đọc — Công cụ", desc: "Mở StructuredNotes" },
  "reader.glossary": { label: "Từ điển", cat: "Đọc — Công cụ", desc: "Mở Glossary" },
  "reader.tags": { label: "Gắn thẻ CTGDPT", cat: "Đọc — Công cụ", desc: "Mở PageTagDialog" },
  "reader.clip": { label: "Lưu trích đoạn", cat: "Đọc — Công cụ", desc: "Mở Clip dialog" },
  "reader.drawing": { label: "Bảng nháp", cat: "Đọc — Công cụ", desc: "Mở tab Công cụ / vẽ" },
  "reader.tts": { label: "Đọc sách (TTS)", cat: "Đọc — Công cụ", desc: "Bật/tắt TTS" },
  "reader.scan": { label: "Quét vùng (Scan)", cat: "Đọc — Công cụ", desc: "Bật/tắt quét vùng" },
  "reader.commandPalette": { label: "Bảng lệnh khi đọc", cat: "Đọc — Công cụ", desc: "Mở bảng lệnh của Reader — phím riêng Alt+K (Ctrl+K thuộc tìm kiếm toàn cục)" },
};

export const SHORTCUT_CATEGORIES = ["Chung","Chuyển trang","Whiteboard","Đọc — Điều hướng","Đọc — Xem","Đọc — AI","Đọc — Công cụ"];

export function getShortcuts() {
  try {
    const s = loadSettings();
    const stored = s?.keyboard?.shortcuts;
    if (!stored || typeof stored !== "object" || Object.keys(stored).length === 0) return { ...DEFAULT_SHORTCUTS };
    return { ...DEFAULT_SHORTCUTS, ...stored };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function getShortcut(id) {
  const map = getShortcuts();
  return map[id] || DEFAULT_SHORTCUTS[id] || "";
}

// Tách combo "Ctrl+Shift+K" → ["Ctrl","Shift","K"] — dùng cho <kbd> hint (#13)
// và cho matchesShortcut. Tách riêng để unit test được (coverage #17).
export function splitCombo(combo) {
  return String(combo || "")
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function comboToString(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (!key) return parts.join("+");
  // Normalize some keys
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else if (key === "Escape") key = "Escape";
  // Avoid adding modifier alone
  if (["Control","Shift","Alt","Meta"].includes(key)) return parts.join("+");
  // For + / = handling: e.key is "+" when Shift+=, but we treat as "+"
  if (key === "=" && e.shiftKey) { /* Shift already added, key becomes "+" */ }
  parts.push(key);
  return parts.join("+");
}

export function matchesShortcut(e, combo) {
  if (!combo) return false;
  const wanted = splitCombo(combo);
  const needCtrl = wanted.includes("Ctrl");
  const needAlt = wanted.includes("Alt");
  const needShift = wanted.includes("Shift");
  const needMeta = wanted.includes("Meta");
  // Find main key (last non-modifier)
  const main = [...wanted].reverse().find(k=>!["Ctrl","Alt","Shift","Meta"].includes(k)) || "";
  // Cmd (macOS) đóng vai Ctrl — nhưng CHỈ khi combo đang tìm Ctrl. Combo "Meta+K"
  // phải phân biệt được Cmd thật; combo không cần Ctrl/Meta thì Cmd cũng không hợp lệ.
  const hasCtrl = !!(e.ctrlKey || (e.metaKey && needCtrl && !needMeta));
  const hasAlt = !!e.altKey;
  const hasShift = !!e.shiftKey;
  const hasMeta = !!e.metaKey;
  if (needCtrl !== hasCtrl) return false;
  if (needAlt !== hasAlt) return false;
  // Shift is tricky for +/=: if combo is "+" we expect Shift is true and key is "+" or "="
  // So we handle shift separately for single-char keys
  let wantKey = main;
  let evKey = e.key;
  if (evKey && evKey.length === 1) evKey = evKey.toUpperCase();
  if (wantKey && wantKey.length === 1) wantKey = wantKey.toUpperCase();
  // Special: "+" combo should match both "+" and "=" with Shift
  if (wantKey === "+") {
    if (!(evKey === "+" || evKey === "=")) return false;
    // For "+" we don't enforce shift check strictly because "+" already implies shift on US layout
    // But we already checked needShift; "+" in DEFAULT is stored as "+" without Shift prefix, so needShift is false
    // Allow either shift state for "+" to be forgiving
    return true;
  }
  if (wantKey === "-") {
    if (!(evKey === "-" || evKey === "_")) return false;
    return true;
  }
  // For letter keys, case-insensitive
  if (wantKey.length === 1 && evKey.length === 1) {
    if (wantKey.toUpperCase() !== evKey.toUpperCase()) return false;
  } else {
    if (wantKey !== evKey) return false;
  }
  // If wantKey is ArrowLeft etc, we already handled
  // For combos like "Ctrl+K", main is K, we matched above, and modifiers already checked
  // But for combo "f" (lowercase), wantKey is "f" -> upper "F", evKey upper "F", ok even if shift not pressed
  // Enforce shift correctly for non-symbol: if needShift !== hasShift and wantKey is single letter, we should enforce
  // But for "f" we have needShift false, so if user presses Shift+F, hasShift true -> would fail. Is that desired? We want f to match only without shift? Probably yes.
  // So check shift for non-symbol combos
  if (wantKey && wantKey.length === 1 && wantKey.match(/[A-Z]/)) {
    // For letter single, shift state should match needShift, but we forgave for "+" above
    if (needShift !== hasShift && !["+","-"].includes(wantKey)) return false;
  } else {
    if (needShift !== hasShift) return false;
  }
  // Cmd (macOS) đóng vai Ctrl: khi combo CÓ Ctrl thì metaKey đã được tính vào
  // hasCtrl (dòng 182). Nếu vẫn enforce needMeta!==hasMeta thì "Ctrl+K" không bao
  // giờ khớp Cmd+K trên macOS (lỗi #8). Chỉ enforce Meta khi combo KHÔNG có Ctrl.
  if (needMeta) {
    if (!hasMeta) return false;
  } else if (needCtrl) {
    // metaKey (nếu có) đã dùng thay Ctrl — bỏ qua
  } else if (hasMeta) return false;
  return true;
}

export function findConflict(shortcuts, combo, ignoreId=null) {
  if (!combo) return null;
  for (const [id, c] of Object.entries(shortcuts)) {
    if (id === ignoreId) continue;
    if (c && c.toLowerCase() === combo.toLowerCase()) return id;
  }
  return null;
}
