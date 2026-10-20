// ── A2 • Xóa vĩnh viễn sau khi mục hết hạn trong Thùng rác (30 ngày) ──────
// Sách: gọi API xóa file trên máy chủ + dọn dữ liệu cục bộ (bước này KHÔNG thể
// hoàn tác — nên chỉ chạy khi mục đã quá hạn hoặc người dùng chủ động bấm).

import { purgeExpiredTrash, TRASH_TYPE } from "./trashStore.js";
import { apiUrl, writeHeaders } from "./apiConfig.js";
import { removeBookData } from "./storage.js";

/** Xóa thật 1 file sách + dữ liệu liên quan trên máy. */
export async function hardDeleteBook(filename) {
  if (!filename) return false;
  let fileGone = false;
  try {
    const res = await fetch(apiUrl(`/api/books/${encodeURIComponent(filename)}`), { method: "DELETE", headers: writeHeaders() });
    fileGone = res.ok;
  } catch {
    fileGone = false;
  }
  try {
    await removeBookData(filename);
  } catch {
    /* dữ liệu cục bộ dọn được phần nào thì hay phần đó */
  }
  return fileGone;
}

/**
 * Xóa mọi mục đã quá 30 ngày.
 * @returns {Promise<{expired:number, purgedBooks:number}>}
 */
export async function purgeExpiredTrashNow() {
  const expired = purgeExpiredTrash();
  let purgedBooks = 0;
  for (const item of expired) {
    if (item && item.type === TRASH_TYPE.BOOK && item.meta && item.meta.filename) {
      const ok = await hardDeleteBook(item.meta.filename);
      if (ok) purgedBooks++;
    }
  }
  return { expired: expired.length, purgedBooks };
}
