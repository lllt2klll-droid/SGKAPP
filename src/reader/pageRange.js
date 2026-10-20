// src/reader/pageRange.js — tách từ BookReader.jsx (khối Range analysis + book page helpers)
// Hàm thuần, nhận tham số từ BookReader, không đọc state ngoài.

// PDF page 1 is the cover → book page numbers are PDF page − 1
export function bookPageNumber(p) {
  return Math.max(1, p - 1);
}

export function totalBookPagesFor({ isWordFile, htmlPagesLength, numPages }) {
  return isWordFile
    ? (htmlPagesLength || 1)
    : (numPages ? Math.max(1, numPages - 1) : 0);
}

// Resolve a page range the user picked (null = current page only)
export function resolvePageRange(fromVal, toVal, total, currentBookPage) {
  const t2 = total || 1;
  const f =
    fromVal && !isNaN(parseInt(fromVal, 10))
      ? Math.max(1, Math.min(t2, parseInt(fromVal, 10)))
      : null;
  const t =
    toVal && !isNaN(parseInt(toVal, 10))
      ? Math.max(1, Math.min(t2, parseInt(toVal, 10)))
      : null;
  if (f == null && t == null) return null;
  const from = f ?? Math.min(t ?? t2, currentBookPage);
  const to = t ?? from;
  if (to < from)
    return {
      error: "Trang kết thúc phải lớn hơn hoặc bằng trang bắt đầu nhé!",
    };
  if (to - from + 1 > 7)
    return {
      error:
        "Tối đa 7 trang cho mỗi lần hỏi. Hãy thu hẹp khoảng trang rồi thử lại nhé!",
    };
  return { from, to };
}
