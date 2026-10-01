// ── Reading progress — công thức chuẩn duy nhất toàn app ────────────
// Quy ước lưu trữ: lastPage là trang PDF (hiển thị = lastPage − 1).
// Mọi màn hình (Thư viện, Dashboard, Thống kê, Tiếp tục đọc, Bìa sách)
// PHẢI dùng helper này để % tiến độ đồng bộ tuyệt đối.
export const READ_STATUS = {
  UNREAD: "unread", // pct === 0
  READING: "reading", // 0 < pct < 100
  DONE: "done", // pct >= 100
};

/**
 * Tính tiến độ từ số trang PDF thô (dùng khi chỉ có last/total, không có map).
 * @param {number} last - trang PDF đang đọc (lưu trữ)
 * @param {number} total - tổng số trang PDF
 */
export function progressFromPages(last, total) {
  const l = Math.max(0, Number(last ?? 0) || 0);
  const t = Math.max(0, Number(total ?? 0) || 0);
  const page = l > 0 ? Math.max(1, l - 1) : 0;
  let pct = 0;
  if (page > 0 && t > 1) {
    pct = Math.min(100, Math.round((page / (t - 1)) * 100));
  } else if (page > 0) {
    pct = Math.min(100, page);
  }
  const status = pct >= 100 ? READ_STATUS.DONE : pct > 0 ? READ_STATUS.READING : READ_STATUS.UNREAD;
  return { last: l, total: t, page, pct, status };
}

/**
 * Tính tiến độ đọc chuẩn của 1 cuốn sách.
 * @param {string} filename
 * @param {Object} lastPageMap - {filename: lastPdfPage}
 * @param {Object} lastTotalMap - {filename: totalPdfPages}
 * @returns {{last:number, total:number, page:number, pct:number, status:string}}
 */
export function bookProgress(filename, lastPageMap, lastTotalMap) {
  return progressFromPages(lastPageMap?.[filename], lastTotalMap?.[filename]);
}

/** Gom số lượng theo trạng thái cho 1 danh sách sách. */
export function progressCounts(books, lastPageMap, lastTotalMap) {
  const out = { notStarted: 0, reading: 0, completed: 0 };
  for (const b of books || []) {
    const { status } = bookProgress(b?.filename, lastPageMap, lastTotalMap);
    if (status === READ_STATUS.DONE) out.completed += 1;
    else if (status === READ_STATUS.READING) out.reading += 1;
    else out.notStarted += 1;
  }
  return out;
}

/** Tổng số trang sách (quy đổi trang hiển thị) đã đọc. */
export function totalPagesRead(books, lastPageMap) {
  return (books || []).reduce((sum, b) => {
    const last = Math.max(0, Number(lastPageMap?.[b?.filename] ?? 0) || 0);
    return sum + (last > 0 ? Math.max(1, last - 1) : 0);
  }, 0);
}
