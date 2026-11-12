import { PRIMARY_SUBJECTS } from "../data/subjectCatalog.js";

export const SORT_OPTIONS = [
  { id: "grade", label: "Lớp + môn" },
  { id: "name", label: "Tên A→Z" },
  { id: "nameDesc", label: "Tên Z→A" },
  { id: "size", label: "Kích thước nhỏ→lớn" },
  { id: "sizeDesc", label: "Kích thước lớn→nhỏ" },
  { id: "recent", label: "Mở gần đây" },
  { id: "progress", label: "Tiến độ cao→thấp" },
  { id: "progressAsc", label: "Tiến độ thấp→cao" },
];

export const SUBJECTS = PRIMARY_SUBJECTS;

export function normalizeSubjectQuery(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getRecentBooks(history, booksAll) {
  if (!history || !booksAll) return [];
  const booksByFilename = new Map(booksAll.map((book) => [book.filename, book]));
  const seen = new Set();
  const recent = [];
  for (const entry of history) {
    if (seen.has(entry.filename)) continue;
    const book = booksByFilename.get(entry.filename);
    if (book) {
      recent.push(book);
      seen.add(entry.filename);
    }
    if (recent.length >= 10) break;
  }
  return recent;
}
