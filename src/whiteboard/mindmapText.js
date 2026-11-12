export const BULLET_STYLES = [
  { id: "", label: "— Tắt" },
  { id: "dot", label: "• Chấm" },
  { id: "dash", label: "– Gạch" },
  { id: "num", label: "1. Số thứ tự" },
  { id: "square", label: "▪ Vuông" },
  { id: "arrow", label: "➤ Mũi tên" },
  { id: "check", label: "✓ Tích" },
];

const BULLET_MARKS = { dot: "•", dash: "–", square: "▪", arrow: "➤", check: "✓" };

export function normalizeBulletStyle(value) {
  if (value === true) return "dot";
  return BULLET_STYLES.some((style) => style.id === value) ? value : "";
}

export function stripBulletMark(text) {
  return String(text || "").replace(/^(\d+[.)]\s*|[-*•▪◦➤✓✔»]\s*)+/, "");
}

export function bulletPrefix(style, number) {
  const normalized = normalizeBulletStyle(style);
  if (!normalized) return "";
  if (normalized === "num") return `${Math.max(1, number || 1)}. `;
  return `${BULLET_MARKS[normalized]} `;
}

export function bulletIndentPx(fontSize, style) {
  const normalized = normalizeBulletStyle(style);
  if (!normalized) return 0;
  return (Number(fontSize) || 15) * (normalized === "num" ? 1.8 : 1.1);
}

const PLACEHOLDER_RE = /^\s*(nhánh(\s+\d+)?|nhánh mới|nhánh con|chủ đề(\s+chính)?|khối|hình|văn bản mới|ghi chú…?|nhấn đúp để sửa|ý tưởng(\s+\d+)?|loại \d+|giai đoạn \d+|bước \d+|đối tượng [ab]|điểm chung|nhóm lớn|tên bài học|mục tiêu|hoạt động|luyện tập|đánh giá|gốc)\s*[.:…]?\s*$/i;

export function isPlaceholderText(text) {
  return PLACEHOLDER_RE.test(String(text || ""));
}

export function parseRichSegments(text) {
  const segments = [];
  const push = (value, bold, italic) => { if (value) segments.push({ t: value, bold, italic }); };
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) { push(boldMatch[1], true, false); continue; }
    const subs = part.split(/(\*[^*\n]+\*)/g);
    for (const sub of subs) {
      if (!sub) continue;
      const italicMatch = sub.match(/^\*([^*]+)\*$/);
      if (italicMatch) push(italicMatch[1], false, true);
      else push(sub, false, false);
    }
  }
  return segments.length ? segments : [{ t: "", bold: false, italic: false }];
}

export function wrapRichLines(text, maxChars) {
  const max = Math.max(3, Math.floor(Number(maxChars) || 20));
  const lines = [];
  for (const paragraph of String(text || "").split("\n")) {
    if (!paragraph) { lines.push([]); continue; }
    const segments = parseRichSegments(paragraph);
    let current = [];
    let length = 0;
    const pushLine = () => { lines.push(current); current = []; length = 0; };
    for (const segment of segments) {
      for (const word of segment.t.split(/\s+/)) {
        if (!word) continue;
        if (length > 0 && length + 1 + word.length > max) pushLine();
        current.push({ t: (current.length ? " " : "") + word, bold: segment.bold, italic: segment.italic });
        length += current[current.length - 1].t.length;
      }
    }
    pushLine();
    if (lines.length >= 48) break;
  }
  return lines.slice(0, 48);
}
