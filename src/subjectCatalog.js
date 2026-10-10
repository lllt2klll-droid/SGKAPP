// ── Subject Catalog — master list for grades 1-5, persistent across book changes ──
// Giữ nguyên mục lục các môn hiện tại dù có thay đổi sách (khác sách nhưng cũng cùng lớp và tập đó)
// Master list is static code, plus any custom subjects discovered from filenames are persisted in localStorage.
import { safeGetJSON, safeSetJSON } from "./safeStorage.js";
import { STORAGE_KEYS } from "./core/storageKeys.js";

export const PRIMARY_SUBJECTS = [
  "Toán",
  "Tiếng Việt",
  "Tiếng Anh",
  "Tiếng Đức",
  "Tiếng Hàn",
  "Tiếng Nhật",
  "Tiếng Nga",
  "Tiếng Pháp",
  "Tiếng Trung Quốc",
  "Đạo đức",
  "Tự nhiên và Xã hội",
  "Lịch sử và Địa lí",
  "Khoa học",
  "Tin học",
  "Công nghệ",
  "Giáo dục thể chất",
  "Âm nhạc",
  "Mĩ thuật",
  "Hoạt động trải nghiệm",
];

export const SUBJECT_ORDER = [...PRIMARY_SUBJECTS];

// Aliases for filename detection — lowercased, without diacritics handled via includes
export const SUBJECT_ALIASES = {
  "Toán": ["toan", "toán"],
  "Tiếng Việt": ["tieng viet", "tiếng việt", "tieng-viet", "ngu van", "ngữ văn"],
  "Tiếng Anh": ["tieng anh", "tiếng anh", "english", "anh van"],
  "Tiếng Đức": ["tieng duc", "tiếng đức", "duc", "german", "deutsch"],
  "Tiếng Hàn": ["tieng han", "tiếng hàn", "han", "korean"],
  "Tiếng Nhật": ["tieng nhat", "tiếng nhật", "nhat", "japanese", "nihon"],
  "Tiếng Nga": ["tieng nga", "tiếng nga", "nga", "russian"],
  "Tiếng Pháp": ["tieng phap", "tiếng pháp", "phap", "french", "francais"],
  "Tiếng Trung Quốc": ["tieng trung", "tiếng trung", "trung quoc", "chinese", "zhong"],
  "Đạo đức": ["dao duc", "đạo đức", "dd"],
  "Tự nhiên và Xã hội": ["tu nhien", "tự nhiên", "tnxh", "tn&xh", "tn-xh", "xa hoi", "xã hội"],
  "Lịch sử và Địa lí": ["lich su", "lịch sử", "dia li", "địa lí", "lsdl", "ls&dl", "su & dia"],
  "Khoa học": ["khoa hoc", "khoa học"],
  "Tin học": ["tin hoc", "tin học", "informatics", "it"],
  "Công nghệ": ["cong nghe", "công nghệ", "technology"],
  "Giáo dục thể chất": ["the chat", "thể chất", "gdtc", "the duc", "thể dục", "pe"],
  "Âm nhạc": ["am nhac", "âm nhạc", "music"],
  "Mĩ thuật": ["mi thuat", "mĩ thuật", "my thuat", "mỹ thuật", "art"],
  "Hoạt động trải nghiệm": ["hoat dong", "trải nghiệm", "hđtn", "hdtn", "trai nghiem"],
};

export function detectSubject(filename) {
  const lower = String(filename || "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  for (const [subject, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (aliases.some((a) => lower.includes(a.replace(/[-_]+/g, " ")))) return subject;
  }
  return "Khác";
}

export const CATALOG_KEY = STORAGE_KEYS.SUBJECT_CATALOG;

// Lấy danh mục đầy đủ: master + custom đã lưu (giữ nguyên dù đổi sách)
export function getSubjectCatalog() {
  try {
    const stored = safeGetJSON(CATALOG_KEY, [], Array.isArray);
    const extra = Array.isArray(stored) ? stored.filter((s) => typeof s === "string" && s.trim()) : [];
    const set = new Set([...PRIMARY_SUBJECTS, ...extra]);
    return [...set];
  } catch (e) {
    console.warn("[storage] verify failed " + CATALOG_KEY, e);
    return [...PRIMARY_SUBJECTS];
  }
}

// Khi phát hiện môn mới từ tên file, thêm vào catalog và lưu
export function ensureSubjectInCatalog(subject) {
  if (!subject || !String(subject).trim()) return;
  const norm = String(subject).trim();
  // "Khác" là fallback hợp lệ — phải lưu để filter hiển thị sách lạ
  if (PRIMARY_SUBJECTS.includes(norm) && norm !== "Khác") return;
  // Nếu là Khác mà đã có trong catalog thì thôi, nếu chưa thì thêm để đồng bộ
  if (norm === "Khác") {
    try {
      const stored = safeGetJSON(CATALOG_KEY, [], Array.isArray);
      const arr = Array.isArray(stored) ? stored : [];
      if (!arr.includes("Khác") && !PRIMARY_SUBJECTS.includes("Khác")) {
        // đưa Khác vào cuối catalog để filter vẫn hiện
        arr.push("Khác");
        const r = safeSetJSON(CATALOG_KEY, arr);
        if (!r.ok) console.warn("[subjectCatalog] save failed", CATALOG_KEY, r.error);
      }
    } catch (e) {
      console.warn("[storage] verify failed " + CATALOG_KEY, e);
    }
    return;
  }
  try {
    const stored = safeGetJSON(CATALOG_KEY, [], Array.isArray);
    const arr = Array.isArray(stored) ? stored : [];
    if (!arr.includes(subject)) {
      arr.push(subject);
      const r = safeSetJSON(CATALOG_KEY, arr);
      if (!r.ok) console.warn("[subjectCatalog] save failed", CATALOG_KEY, r.error);
    }
  } catch (e) {
    console.warn("[storage] verify failed " + CATALOG_KEY, e);
  }
}

// Dùng khi load sách: đảm bảo mọi subject từ books đều có trong catalog
export function syncCatalogWithBooks(books) {
  if (!Array.isArray(books)) return getSubjectCatalog();
  const subjects = new Set(books.map((b) => b.subject).filter(Boolean));
  subjects.forEach((s) => ensureSubjectInCatalog(s));
  return getSubjectCatalog();
}

// Sắp xếp theo thứ tự chuẩn, môn lạ để cuối
export function sortSubjects(subjects) {
  const order = new Map(SUBJECT_ORDER.map((s, i) => [s, i]));
  return [...subjects].sort((a, b) => {
    const ia = order.has(a) ? order.get(a) : 999;
    const ib = order.has(b) ? order.get(b) : 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "vi");
  });
}
