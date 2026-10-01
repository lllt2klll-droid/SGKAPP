// ─── Book Title Formatting Utilities ─────────────────────────────────────────
// Helper functions for formatting and parsing book metadata from filenames

/**
 * Format a suggested book title from a filename
 * @param {string} fileName - Original filename
 * @returns {string} Formatted book title
 */
export function formatSuggestedBookTitle(fileName) {
  let name = String(fileName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return "Sách giáo khoa mới";

  name = name
    .replace(/^(sach-giao-khoa|sgk|sach|book|pdf|ebook)[\s-]*/i, "")
    .replace(/^(thnguyenvanluong|thu vien|tailieu)[\s-]*/i, "")
    .replace(
      /(ket noi tri thuc|kết nối tri thức|voi cuoc song|với cuộc sống|cuoc song)/gi,
      "",
    )
    .replace(/\btoan\b/gi, "Toán")
    .replace(/\btiếng việt\b/gi, "Tiếng Việt")
    .replace(/\btieng viet\b/gi, "Tiếng Việt")
    .replace(/\blop\b/gi, "Lớp")
    .replace(/\blớp\b/gi, "Lớp")
    .replace(/\btap\b/gi, "Tập")
    .replace(/\btập\b/gi, "Tập")
    .replace(/\s+/g, " ")
    .trim();

  const gradeMatch =
    name.match(/^\s*0*([1-5])\b/) ||
    name.match(/(?:lớp|lop)\s*([1-5])/i) ||
    name.match(/(?:toán|toan|tiếng việt|tieng viet|viet|anh|đạo đức|tự nhiên|lịch sử|khoa học|tin học|công nghệ|thể chất|âm nhạc|mĩ thuật|trải nghiệm)\s*([1-5])/i);
  // Dùng detectSubject từ subjectCatalog để đồng bộ với server
  let subject = "Khác";
  try {
    const lower = name.toLowerCase().replace(/[-_]+/g, " ");
    if (/toan|toán/.test(lower)) subject = "Toán";
    else if (/tiếng việt|tieng viet/.test(lower)) subject = "Tiếng Việt";
    else if (/tiếng anh|tieng anh|english/.test(lower)) subject = "Tiếng Anh";
    else if (/tiếng đức|tieng duc/.test(lower)) subject = "Tiếng Đức";
    else if (/tiếng hàn|tieng han/.test(lower)) subject = "Tiếng Hàn";
    else if (/tiếng nhật|tieng nhat/.test(lower)) subject = "Tiếng Nhật";
    else if (/tiếng nga|tieng nga/.test(lower)) subject = "Tiếng Nga";
    else if (/tiếng pháp|tieng phap/.test(lower)) subject = "Tiếng Pháp";
    else if (/tiếng trung|tieng trung|trung quoc/.test(lower)) subject = "Tiếng Trung Quốc";
    else if (/đạo đức|dao duc/.test(lower)) subject = "Đạo đức";
    else if (/tự nhiên|tu nhien|tnxh/.test(lower)) subject = "Tự nhiên và Xã hội";
    else if (/lịch sử|lich su|địa lí|dia li|lsdl/.test(lower)) subject = "Lịch sử và Địa lí";
    else if (/khoa học|khoa hoc/.test(lower)) subject = "Khoa học";
    else if (/tin học|tin hoc/.test(lower)) subject = "Tin học";
    else if (/công nghệ|cong nghe/.test(lower)) subject = "Công nghệ";
    else if (/thể chất|the chat|gdtc|thể dục/.test(lower)) subject = "Giáo dục thể chất";
    else if (/âm nhạc|am nhac/.test(lower)) subject = "Âm nhạc";
    else if (/mĩ thuật|mi thuat|mỹ thuật/.test(lower)) subject = "Mĩ thuật";
    else if (/trải nghiệm|trai nghiem|hoạt động/.test(lower)) subject = "Hoạt động trải nghiệm";
  } catch { subject = "Khác"; }
  const lowerNorm = name.toLowerCase().replace(/[-_]+/g, " ");
  let term = 1;
  if (/tập\s*2|tap\s*2|tap hai/.test(lowerNorm)) term = 2;
  else if (/tập\s*1|tap\s*1|tap mot/.test(lowerNorm)) term = 1;
  else {
    const termMatch = name.match(/tập\s*([12])|tap\s*([12])/i);
    term = termMatch ? Number(termMatch[1] || termMatch[2] || 1) : 1;
  }
  const grade = gradeMatch ? Number(gradeMatch[1]) : 1;

  const base = (name || `${subject} Lớp ${grade}`)
    .replace(/\bLớp\b/gi, "Lớp")
    .replace(/\s+/g, " ")
    .trim();

  const pretty = base
    ? base.charAt(0).toUpperCase() + base.slice(1)
    : `${subject} Lớp ${grade}`;

  return `${pretty.includes("Lớp") || pretty.includes("Tập") ? pretty : `${subject} ${pretty}`} - Tập ${term}`
    .replace(/\s{2,}/g, " ")
    .trim();
}
