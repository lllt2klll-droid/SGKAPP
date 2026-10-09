// Gắn 1 entry sổ tay từ vựng → tiêu đề sách để hiển thị trong kết quả tìm kiếm.
// LỖI #15: trước đây nhánh vocab gọi thẳng `books.find(...)` — khi App chưa load
// (prop books undefined/non-array) TypeError bị catch nuốt IM LẶNG làm mất toàn
// bộ nhóm "Từ vựng" trong kết quả Ctrl+K.
export function resolveVocabBookTitle(v, books) {
  if (v && v.bookTitle) return v.bookTitle;
  if (!Array.isArray(books)) return "";
  return books.find((b) => b && b.filename === (v && v.file))?.title || "";
}
