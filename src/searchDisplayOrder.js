// Thứ tự nhóm kết quả tìm kiếm toàn cục (Ctrl+K).
// NGUYÊN TẮC: đây là nguồn duy nhất cho CẢ render lẫn điều hướng bàn phím.
// Nếu render sắp nhóm theo thứ tự A mà keyboard index theo thứ tự B thì
// Enter sẽ chạy lệnh của kết quả KHÁC item đang được highlight.
export const TYPE_ORDER = [
  "toc",
  "book",
  "note",
  "vocab",
  "whiteboard",
  "lessonplan",
  "reference",
  "idea",
  "task",
  "activity",
  "question",
  "worksheet",
  "concept",
  "collection",
];

export function typeRank(type) {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
}

/**
 * Gom kết quả theo type và sắp theo TYPE_ORDER, trả về cả 2 dạng
 * LUÔN đồng bộ: displayGroups (render) và flatResults (keyboard index).
 * Nhóm giữ nguyên thứ tự xuất hiện bên trong; item lạ không có trong
 * TYPE_ORDER được đẩy xuống cuối thay vì lên đầu (indexOf = -1).
 */
export function groupResultsForDisplay(results) {
  const grouped = {};
  for (const r of results || []) {
    if (!r || !r.type) continue;
    (grouped[r.type] = grouped[r.type] || []).push(r);
  }
  const displayGroups = Object.keys(grouped)
    .sort((a, b) => typeRank(a) - typeRank(b))
    .map((type) => ({ type, items: grouped[type] }));
  return { displayGroups, flatResults: displayGroups.flatMap((g) => g.items) };
}
