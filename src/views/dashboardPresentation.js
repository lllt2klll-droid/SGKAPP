const SUBJECT_HUE_RULES = [
  [/ (toan|math)( |$)/, 221],
  [/ (tieng viet|ngu van|van)( |$)/, 262],
  [/ (tieng anh|anh van|english|ngoai ngu)( |$)/, 158],
  [/ (lich su)( |$)/, 26],
  [/ (dia)( |$)/, 172],
  [/ (khoa hoc|tu nhien|sinh hoc|cai tri)( |$)/, 145],
  [/ (vat li)( |$)/, 200],
  [/ (hoa hoc)( |$)/, 5],
  [/ (cong nghe|tin hoc|lap trinh|may tinh)( |$)/, 250],
  [/ (my thuat|am nhac|nghe thuat|the duc)( |$)/, 322],
  [/ (cong dan|dao duc|gdcd|phap luat)( |$)/, 35],
];
const FALLBACK_HUES = [215, 262, 158, 26, 172, 145, 350, 35, 200, 285, 195, 95];

export const KPI_VIEW_MAP = {
  books: "library",
  continue: "continue",
  bookmarks: "marks",
  vocab: "vocab",
  clips: "collections",
  tasks: "tasks",
  plans: "lessonplans",
  ideas: "ideas",
  whiteboard: "whiteboard",
  marks: "marks",
  refs: "references",
};

function stripDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function subjectHue(name) {
  const searchText = ` ${stripDiacritics(name).trim().toLowerCase().replace(/\s+/g, " ")} `;
  if (!searchText.trim()) return 215;
  for (const [pattern, hue] of SUBJECT_HUE_RULES) {
    if (pattern.test(searchText)) return hue;
  }
  let hash = 0;
  for (let index = 0; index < searchText.length; index += 1) {
    hash = (hash * 31 + searchText.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_HUES[hash % FALLBACK_HUES.length];
}

export function subjectInitials(name) {
  const words = stripDiacritics(name).trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return "📖";
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function withPrefix(value, prefix) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalizedText = stripDiacritics(text).toLowerCase();
  const normalizedPrefix = stripDiacritics(prefix).toLowerCase();
  if (new RegExp(`(^|\\s)${normalizedPrefix}(\\s|$)`).test(normalizedText)) {
    return text;
  }
  return `${prefix} ${text}`;
}

export function relTime(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return "";
  const difference = Date.now() - time;
  if (difference < 60000) return "Vừa xong";
  const minutes = Math.floor(difference / 60000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hôm qua";
  if (days < 8) return `${days} ngày trước`;
  return new Date(time).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
