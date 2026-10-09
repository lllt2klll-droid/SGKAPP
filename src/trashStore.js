// ── A2 • THÙNG RÁC 30 NGÀY ────────────────────────────────────────────────
// Xóa sách / giáo án / câu hỏi KHÔNG mất ngay: vào đây, giữ 30 ngày,
// bấm "Khôi phục" là quay lại như cũ. Hết hạn mới xóa vĩnh viễn.
//
// Sách: file PDF KHÔNG bị xóa khi đưa vào thùng rác — chỉ bị ẩn khỏi thư viện.
//   Việc xóa file thật chạy lúc purge (hết 30 ngày) hoặc khi bấm "Xóa ngay".

import { safeGetJSON, safeSetJSON } from "./safeStorage.js";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { STORAGE_KEYS } from "./core/storageKeys.js";

export const TRASH_TTL_DAYS = 30;
const DAY_MS = 86400000;
export const TRASH_TTL_MS = TRASH_TTL_DAYS * DAY_MS;
const MAX_ITEMS = 300;

export const TRASH_TYPE = {
  BOOK: "book",
  PLAN: "plan",
  QUESTION: "question",
  VOCAB: "vocab",
};

export const TRASH_TYPE_LABEL = {
  book: "Sách",
  plan: "Giáo án",
  question: "Câu hỏi",
  vocab: "Từ vựng",
};

function notify(type) {
  try { appEvents.emit(AppEvents.DATA_UPDATED, { source: "trashStore", domain: "trash", type: type || null }); } catch {}
}

export function listTrash() {
  const list = safeGetJSON(STORAGE_KEYS.TRASH, [], (d) => Array.isArray(d));
  return Array.isArray(list) ? list : [];
}

export function trashCount() {
  return listTrash().length;
}

export function listTrashByType(type) {
  return listTrash().filter((i) => i && i.type === type);
}

export function isExpired(item) {
  return !!(item && item.deletedAt && Date.now() - item.deletedAt >= TRASH_TTL_MS);
}

/** Số ngày còn lại (1–30). Trả 0 nếu đã hết hạn. */
export function daysLeft(item) {
  if (!item || !item.deletedAt) return 0;
  const left = TRASH_TTL_MS - (Date.now() - item.deletedAt);
  return left <= 0 ? 0 : Math.max(1, Math.ceil(left / DAY_MS));
}

/**
 * Đưa 1 mục vào thùng rác.
 * @param {{type:string,label:string,meta?:object,payload:any}} entry
 * @returns {object|null} mục vừa thêm
 */
export function moveToTrash({ type, label, meta = {}, payload = null }) {
  if (!type || !payload) return null;
  const list = listTrash();
  const item = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: String(label || "").slice(0, 200),
    meta: meta && typeof meta === "object" ? meta : {},
    payload,
    deletedAt: Date.now(),
    expiresAt: Date.now() + TRASH_TTL_MS,
  };
  const next = [item, ...list].slice(0, MAX_ITEMS);
  const res = safeSetJSON(STORAGE_KEYS.TRASH, next);
  if (!res.ok) return null;
  notify(item.type);
  return item;
}

/** Lấy + xóa khỏi thùng rác (dùng khi khôi phục). */
export function takeFromTrash(id) {
  const list = listTrash();
  const item = list.find((i) => i && i.id === id) || null;
  if (!item) return null;
  const res = safeSetJSON(STORAGE_KEYS.TRASH, list.filter((i) => i && i.id !== id));
  if (!res.ok) return null;
  notify(item.type);
  return item;
}

/** Chỉ xóa khỏi thùng rác, trả về mục bị xóa (xóa vĩnh viễn). */
export function removeFromTrash(id) {
  return takeFromTrash(id);
}

export function emptyTrash() {
  const n = listTrash().length;
  safeSetJSON(STORAGE_KEYS.TRASH, []);
  notify();
  return n;
}

/** Xóa mọi mục đã quá 30 ngày. Trả về danh sách đã hết hạn (phần xóa vĩnh viễn). */
export function purgeExpiredTrash() {
  const list = listTrash();
  const expired = list.filter(isExpired);
  if (!expired.length) return [];
  const keep = list.filter((i) => !isExpired(i));
  const res = safeSetJSON(STORAGE_KEYS.TRASH, keep);
  if (!res.ok) return [];
  notify();
  return expired;
}

/** Gộp payload đã khôi phục vào 1 mảng có sẵn (tránh trùng id). */
export function mergeRestored(list, payload, idField = "id") {
  if (!Array.isArray(list) || !payload || typeof payload !== "object") return list;
  const id = payload[idField];
  const filtered = id ? list.filter((x) => x && x[idField] !== id) : list;
  return [payload, ...filtered];
}
