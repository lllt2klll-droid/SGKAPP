// ─── Whiteboard fonts — adapter + helpers dùng chung ───
// Nguồn chân lý duy nhất của danh sách font là whiteboardStore.js
// (WB_FONTS / WB_FONT_KEY / WB_DEFAULT_FONT_STACK / resolveWbFont).
// File này chỉ bổ sung:
// - effectiveBoardFont(): font hiệu lực của bảng (board > máy > mặc định),
//   dùng CHUNG cho màn hình lẫn mọi đường xuất file → tải về giống hiển thị.
// - docxFontOf()/boardDocxFont(): ánh xạ stack CSS sang tên font cho Word.

import { WB_FONTS, WB_FONT_KEY, WB_DEFAULT_FONT_STACK, resolveWbFont } from "./whiteboardStore.js";

export { WB_FONTS, WB_FONT_KEY, WB_DEFAULT_FONT_STACK, resolveWbFont };

function readMachineFont() {
  try {
    if (typeof localStorage === "undefined") return "";
    const v = localStorage.getItem(WB_FONT_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

/** Font hiệu lực của cả bảng: board.defaultFontFamily > font đã lưu theo máy > mặc định. */
export function effectiveBoardFont(board = null) {
  const fromBoard = board && typeof board.defaultFontFamily === "string" ? board.defaultFontFamily.trim() : "";
  if (fromBoard) return fromBoard;
  const machine = String(readMachineFont() || "").trim();
  if (machine) return machine;
  return WB_DEFAULT_FONT_STACK;
}

/** Font hiển thị/xuất của 1 object (object > bảng > máy > mặc định). */
export function fontFamilyOf(o, board = null) {
  const own = o && typeof o.fontFamily === "string" ? o.fontFamily.trim() : "";
  if (own) return own;
  return effectiveBoardFont(board);
}

const KNOWN_DOCX = new Map([
  ...WB_FONTS.filter((f) => f && f.value !== undefined).map((f) => [String(f.value), f.label]),
  ["", "Quicksand"],
]);

/** Tên font cho file Word (.docx) tương ứng stack CSS đang hiển thị. */
export function docxFontOf(o, board = null) {
  const stack = fontFamilyOf(o, board);
  if (KNOWN_DOCX.has(stack)) return KNOWN_DOCX.get(stack);
  const m = String(stack).match(/['"]?([^,'"]+)['"]?/);
  const name = (m ? m[1] : "").trim().slice(0, 60);
  return name || "Quicksand";
}

/** Tên font mặc định của cả bảng cho Word. */
export function boardDocxFont(board = null) {
  return docxFontOf("", board);
}
