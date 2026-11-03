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
  "collection",
];

// Bộ lọc Ctrl+K — 1 nguồn duy nhất cho chips + prefix + keyboard.
// id trùng với `type` của kết quả; "all" = không lọc.
export const FILTER_DEFS = [
  { id: "all", label: "Tất cả", aliases: [], shortcut: "Ctrl+0" },
  { id: "toc", label: "Mục lục", aliases: ["toc", "muc luc", "mucluc", "mục lục"], shortcut: "Ctrl+1" },
  { id: "book", label: "Sách", aliases: ["book", "sach", "sách"], shortcut: "Ctrl+2" },
  { id: "note", label: "Ghi chú", aliases: ["note", "ghi chu", "ghi chú", "ghichu", "notes"], shortcut: "Ctrl+3" },
  { id: "vocab", label: "Từ vựng", aliases: ["vocab", "tu vung", "từ vựng", "tuvung", "từ"], shortcut: "Ctrl+4" },
  { id: "whiteboard", label: "Bảng trắng", aliases: ["whiteboard", "bang trang", "bảng trắng", "wb", "bảng"], shortcut: "Ctrl+5" },
  { id: "lessonplan", label: "Giáo án", aliases: ["lessonplan", "giao an", "giáo án", "giaoan", "khbd"], shortcut: "Ctrl+6" },
  { id: "reference", label: "Tham khảo", aliases: ["reference", "tham khao", "tham khảo", "ref"], shortcut: "Ctrl+7" },
  { id: "idea", label: "Ý tưởng", aliases: ["idea", "y tuong", "ý tưởng"], shortcut: "Ctrl+8" },
  { id: "task", label: "Nhiệm vụ", aliases: ["task", "nhiem vu", "nhiệm vụ"], shortcut: "Ctrl+9" },
  { id: "activity", label: "Hoạt động", aliases: ["activity", "hoat dong", "hoạt động"] },
  { id: "question", label: "Câu hỏi", aliases: ["question", "cau hoi", "câu hỏi", "q"] },
  { id: "worksheet", label: "Phiếu", aliases: ["worksheet", "phieu", "phiếu"] },
  { id: "collection", label: "Bộ sưu tập", aliases: ["collection", "bo suu tap", "bộ sưu tập"] },
];

export const FILTER_IDS = FILTER_DEFS.map((f) => f.id);

export function typeRank(type) {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
}

function normAlias(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const ALIAS_TO_ID = (() => {
  const m = new Map();
  for (const f of FILTER_DEFS) {
    m.set(normAlias(f.id), f.id);
    m.set(normAlias(f.label), f.id);
    for (const a of f.aliases || []) m.set(normAlias(a), f.id);
  }
  return m;
})();

export function resolveFilterId(raw) {
  if (!raw) return null;
  return ALIAS_TO_ID.get(normAlias(raw)) || null;
}

/**
 * Tách prefix lọc khỏi query: "sach: toán lớp 2" → { filter:"book", cleanQuery:"toán lớp 2" }
 * Hỗ trợ cả ">command" (command mode) — trả về { commandMode:true }.
 * Không prefix → { filter:null, cleanQuery: query giữ nguyên }.
 */
export function parseFilterPrefix(query) {
  const raw = String(query || "");
  if (/^\s*>/.test(raw)) {
    return { filter: null, cleanQuery: raw.replace(/^\s*>\s?/, ""), commandMode: true, raw };
  }
  const m = raw.match(/^\s*([^:]{1,20})\s*:\s*(.*)$/);
  if (!m) return { filter: null, cleanQuery: raw, commandMode: false, raw };
  const id = resolveFilterId(m[1]);
  if (!id) return { filter: null, cleanQuery: raw, commandMode: false, raw };
  return { filter: id, cleanQuery: m[2] || "", commandMode: false, raw };
}

export function filterResultsByType(results, filterId) {
  if (!filterId || filterId === "all") return results || [];
  return (results || []).filter((r) => r && r.type === filterId);
}

/** Đếm số kết quả theo từng type — dùng cho chips lọc. */
export function countByType(results) {
  const counts = {};
  for (const r of results || []) {
    if (!r || !r.type) continue;
    counts[r.type] = (counts[r.type] || 0) + 1;
  }
  return counts;
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
