// ── Tìm kiếm gần đây — lưu trong localStorage ──────────────────
import { safeGetJSON, safeSetJSON, safeRemove } from "./safeStorage.js";

export const RECENT_SEARCH_KEY = "sgk_recent_searches";
export const RECENT_SEARCH_MAX = 10;

/**
 * Đọc danh sách tìm kiếm gần đây (mới nhất trước)
 * @returns {string[]}
 */
export function getRecentSearches() {
  try {
    const arr = safeGetJSON(RECENT_SEARCH_KEY, [], Array.isArray);
    if (!Array.isArray(arr)) return [];
    // lọc chuỗi hợp lệ, trim
    return arr.filter((s) => typeof s === "string" && s.trim().length >= 2).slice(0, RECENT_SEARCH_MAX);
  } catch {
    return [];
  }
}

/**
 * Lưu một query vào lịch sử (đưa lên đầu, loại trùng, giới hạn)
 */
export function addRecentSearch(rawQuery) {
  const q = String(rawQuery || "").trim();
  if (q.length < 2) return getRecentSearches();
  try {
    let list = getRecentSearches();
    // loại bỏ trùng (so sánh không phân biệt hoa thường + trim)
    const lower = q.toLowerCase();
    list = list.filter((s) => s.toLowerCase() !== lower);
    list.unshift(q);
    list = list.slice(0, RECENT_SEARCH_MAX);
    const res = safeSetJSON(RECENT_SEARCH_KEY, list);
    if (!res.ok) console.warn("[searchRecent] save failed", res.error);
    return list;
  } catch (e) {
    console.warn("[searchRecent] add failed", e);
    return getRecentSearches();
  }
}

export function removeRecentSearch(rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  try {
    let list = getRecentSearches();
    list = list.filter((s) => s.toLowerCase() !== q);
    const res = safeSetJSON(RECENT_SEARCH_KEY, list);
    if (!res.ok) console.warn("[searchRecent] save failed", res.error);
    return list;
  } catch (e) {
    console.warn("[searchRecent] remove failed", e);
    return getRecentSearches();
  }
}

export function clearRecentSearches() {
  try {
    safeRemove(RECENT_SEARCH_KEY);
  } catch (e) {
    console.warn("[searchRecent] clear failed", e);
  }
  return [];
}
