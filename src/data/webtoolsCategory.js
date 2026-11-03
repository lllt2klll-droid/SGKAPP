// webtoolsCategory.js — Phân loại công cụ web (thuần, không phụ thuộc React/DOM).
// Tách khỏi WebToolboxView để unit-test được (theo mẫu webtoolsCheck.js).

// "other" luôn đứng cuối; thứ tự còn lại là thứ tự hiển thị trên chip lọc.
export const CATEGORIES = [
  { id: "ai", label: "AI" },
  { id: "dev", label: "Lập trình" },
  { id: "design", label: "Thiết kế" },
  { id: "teach", label: "Dạy học" },
  { id: "storage", label: "Lưu trữ" },
  { id: "other", label: "Khác" },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export function isKnownCategory(id) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, id);
}

// Đoán nhóm theo domain — chỉ dùng khi người dùng chưa chọn nhóm thủ công.
const CATEGORY_HINTS = [
  { re: /(github|gitlab|bitbucket|stackoverflow|developer\.mozilla|mdn|vercel|netlify|replit|codepen|npmjs|postman)/i, id: "dev" },
  { re: /(figma|canva|dribbble|behance|adobe|photopea|unsplash|pexels|remove\.bg|freepik)/i, id: "design" },
  { re: /(openai|chatgpt|gemini|claude|anthropic|copilot|perplexity|midjourney|poe\.com|bard)/i, id: "ai" },
  { re: /(drive\.google|docs\.google|dropbox|onedrive|notion|mega\.nz|mediafire|wetransfer)/i, id: "storage" },
  { re: /(vietjack|loigiaihay|hoc10|hoctot|vndoc|sachmem|thuvienhoclieu|hoclieu|olm\.vn|vuihoc)/i, id: "teach" },
];

export function inferCategory(url) {
  const s = String(url || "");
  for (const h of CATEGORY_HINTS) if (h.re.test(s)) return h.id;
  return "other";
}

// Trả về category hợp lệ: giữ nếu đã biết, ngược lại suy đoán từ URL.
export function normalizeCategory(id, url) {
  return isKnownCategory(id) ? id : inferCategory(url);
}
