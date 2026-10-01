// ── Nhập giáo án từ URL (ưu tiên kenhgiaovien.com) — chỉ chữ, không ảnh ───
// Thuần JS (chạy cả browser + node test), không import React.
// Luồng: backend /api/lesson-url/fetch trả HTML thô → parseLessonHtml bóc
// phần giáo án "y hệt" (text) → UI lưu bản thô + AI chuẩn hóa vào KHBD.
import { DANH_GIA_ALLOWED } from "./planAi";

export const LESSON_SOURCE_TEXT_MAX = 60000;

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n, 10)); } catch { return ""; } });
}

function stripTagsKeepLines(html) {
  let s = String(html || "");
  // Bảng 2 cột GV/HS → giữ dạng "GV | HS" theo hàng
  s = s.replace(/<tr[^>]*>/gi, "\n");
  s = s.replace(/<\/tr\s*>/gi, "\n");
  s = s.replace(/<(td|th)[^>]*>/gi, " | ");
  s = s.replace(/<\/(td|th)\s*>/gi, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|ul|ol|table|blockquote|section|article|figure|figcaption)\s*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

// Ảnh giữ đúng vị trí: thay từng <img> bằng marker [ảnh N] theo đúng thứ tự
// xuất hiện trong HTML, đồng thời thu URL tuyệt đối (bỏ logo/icon/data:...).
export const LESSON_IMGS_MAX = 25;
function extractImagesOrdered(html, baseUrl) {
  const images = [];
  const seen = new Set();
  const s = String(html || "").replace(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi, (m, src) => {
    const raw = String(src || "").trim();
    if (!raw || raw.startsWith("data:") || images.length >= LESSON_IMGS_MAX) return "\n";
    let abs = "";
    try { abs = new URL(raw, baseUrl || undefined).toString(); } catch { abs = raw; }
    if (!abs || seen.has(abs)) return "\n";
    if (/logo|icon|avatar|banner|ads|pixel/i.test(abs)) return "\n";
    seen.add(abs);
    images.push(abs);
    return `\n[ảnh ${images.length}]\n`;
  });
  return { html: s, images };
}

function extractTitle(html) {
  const m = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1\s*>/i);
  if (m) {
    const t = stripTagsKeepLines(m[1]).replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 200);
  }
  const t2 = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (t2) {
    const t = stripTagsKeepLines(t2[1]).replace(/\s+/g, " ").trim();
    if (t) return t.split("|")[0].trim().slice(0, 200);
  }
  return "";
}

// Bỏ khung trang (menu/header/footer/script/style) trước khi bóc nội dung,
// để URL lạ không phải kenhgiaovien cũng không lẫn nav vào bản y hệt.
function stripChrome(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1\s*>/gi, "");
}

// Cắt phần giáo án chính: ưu tiên kenhgiaovien (từ "Ngày soạn" tới "Còn tiếp"),
// fallback: khối div lớn nhất chứa "YÊU CẦU CẦN ĐẠT".
function extractMainHtml(html) {
  const s = stripChrome(String(html || ""));
  if (!s) return "";
  const startKeys = ["Ngày soạn", "NGÀY SOẠN", "BÀI ", "I. YÊU CẦU CẦN ĐẠT", "YÊU CẦU CẦN ĐẠT"];
  const endKeys = ["Còn tiếp", "CÒN TIẾP", "Trên chỉ là 1 phần"];
  let start = -1;
  for (const k of startKeys) {
    const i = s.indexOf(k);
    if (i >= 0 && (start < 0 || i < start)) start = i;
  }
  let end = -1;
  for (const k of endKeys) {
    const i = s.indexOf(k);
    if (i >= 0 && (end < 0 || i > end)) end = i;
  }
  if (start >= 0) {
    const back = s.lastIndexOf("<", Math.max(0, start - 1));
    const from = back >= 0 && start - back < 2000 ? back : start;
    const to = end > start ? end : Math.min(s.length, start + 180000);
    return s.slice(from, to);
  }
  // Fallback: div lớn nhất chứa cụm khóa
  const divRe = /<div[^>]*>([\s\S]*?YÊU CẦU CẦN ĐẠT[\s\S]*?)<\/div\s*>/gi;
  let best = "";
  let m;
  while ((m = divRe.exec(s))) {
    if (m[1] && m[1].length > best.length && m[1].length < 300000) best = m[0];
    if (best.length > 150000) break;
  }
  return best || s.slice(0, 180000);
}

export function parseLessonHtml(html, baseUrl = "") {
  const raw = String(html || "");
  if (!raw.trim()) throw new Error("HTML trống.");
  const title = extractTitle(raw);
  const mainHtml = extractMainHtml(raw);
  const { html: withMarkers, images } = extractImagesOrdered(mainHtml, baseUrl);
  const text = stripTagsKeepLines(withMarkers).slice(0, LESSON_SOURCE_TEXT_MAX);
  if (!text || text.replace(/\s/g, "").length < 60) {
    throw new Error("Không tìm thấy nội dung giáo án trong trang (có thể bị chặn hoặc yêu cầu đăng nhập). Hãy dùng ô dán thủ công.");
  }
  const isPaywalled = /Còn tiếp|Trên chỉ là 1 phần|Đăng nhập để xem/i.test(raw);
  const site = (() => { try { return new URL(baseUrl || "").hostname || ""; } catch { return ""; } })();
  return { title, text, images, isPaywalled, sourceSite: site, chars: text.length };
}

// Chuẩn hóa nội dung dán thủ công (HTML hoặc text thuần) — dùng chung fallback.
export function parsePastedLesson(input) {
  const s = String(input || "");
  if (!s.trim()) throw new Error("Nội dung dán trống.");
  if (/<[a-z][^>]*>/i.test(s)) return parseLessonHtml(s, "");
  const text = s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, LESSON_SOURCE_TEXT_MAX);
  if (text.replace(/\s/g, "").length < 60) throw new Error("Nội dung quá ngắn — hãy dán đầy đủ giáo án.");
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 4) || "";
  return {
    title: firstLine.slice(0, 200), text, images: [],
    isPaywalled: /Còn tiếp/i.test(text),
    sourceSite: "", chars: text.length,
  };
}

// Prompt AI: giữ nguyên ý/bám sát bản gốc từ URL, chuẩn hóa vào JSON KHBD.
export function buildLessonPromptFromUrl({ title, sourceText, duration = "35", method = "Hỏi đáp", includeDiff = true, sourceUrl = "" }) {
  const dur = parseInt(duration, 10) || 35;
  const m = ["Trực quan", "Hỏi đáp", "Thảo luận nhóm", "Trải nghiệm"].includes(method) ? method : "Hỏi đáp";
  const body = String(sourceText || "").slice(0, 30000);
  return (
    `Hãy chuyển GIÁO ÁN GỐC dưới đây (lấy y hệt từ web ${sourceUrl || "do giáo viên cung cấp"}) thành KẾ HOẠCH BÀI DẠY đầy đủ, ` +
    `BÁM SÁT từng chữ, từng hoạt động, từng mục I/II/III của bản gốc — không sáng tạo thêm nội dung mới, chỉ chuẩn hóa cách trình bày.\n` +
    `Tên KHBD: "${title || "Bài học"}". Tổng thời lượng khoảng ${dur} phút. Phương pháp chủ đạo: ${m}.\n` +
    `- I. YÊU CẦU CẦN ĐẠT: nlDacThu (3 ý, bám bản gốc), nlChung (3 ý), phamChat (3 ý), lienHeTichHop.\n` +
    `- II. THIẾT BỊ DẠY HỌC: ddGV, ddHS (lấy từ bản gốc).\n` +
    `- III. HOẠT ĐỘNG DẠY HỌC (hoatDong): giữ đúng trình tự Tiết/bước của bản gốc, map vào đúng 6 hoạt động — 1 "A" (Khởi động), 3 "B" (Khám phá/Luyện tập), 1 "C" (Vận dụng), 1 "D" (Nối tiếp). ` +
    `Mỗi hoạt động: section ("A"/"B"/"C"/"D"), ten, phut, mucTieu, ppdh, dddh, cachTienHanh (chi tiết từng bước theo bản gốc), ketLuan (bắt đầu "⇨ Giáo viên rút ra kết luận:"), hs.\n` +
    `  + ppdh: CHỈ dùng tên kỹ thuật đánh giá trong danh sách chuẩn — ${DANH_GIA_ALLOWED.join(", ")}. CẤM đặt tên bịa; bản gốc viết lạ thì chọn tên chuẩn gần nghĩa nhất.\n` +
    `- IV. ĐIỀU CHỈNH (dieuChinh), V. PHỤ LỤC (phuLuc).\n` +
    (includeDiff ? `- differentiation {support, advanced}: mỗi mục 2 ý bám nội dung bài.\n` : `- Không cần phân hóa riêng.\n`) +
    `Trả về CHỈ MỘT đối tượng JSON hợp lệ với đúng các khóa: title, monHoc, lop, tuan, soTiet, namHoc, hoVaTen, mssvTT, lopDay, thoiGian, nlDacThu, nlChung, phamChat, lienHeTichHop, ddGV, ddHS, differentiation, hoatDong, dieuChinh, phuLuc. ` +
    `Mỗi phần tử hoatDong BẮT BUỘC có "section" là 1 ký tự "A"/"B"/"C"/"D". Không markdown, không backtick. Escape " thành \\" và xuống dòng thành \\n.\n\n` +
    `===== GIÁO ÁN GỐC (Y HỆT) =====\n${body}\n===== HẾT BẢN GỐC =====`
  );
}

export async function fetchLessonHtml(url, apiBase = "") {
  const base = String(apiBase || "").replace(/\/$/, "");
  const r = await fetch(`${base}/api/lesson-url/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Tải trang thất bại (${r.status}).`);
  return data;
}

// Tải ảnh về folder lesson-images ngoài cùng (backend lưu + serve tĩnh).
// Trả { images: [{ index, src, file, url, bytes }], skipped } — index khớp marker [ảnh N].
export async function downloadLessonImages(urls, pageUrl, apiBase = "") {
  const list = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!list.length) return { images: [], skipped: 0 };
  const base = String(apiBase || "").replace(/\/$/, "");
  const r = await fetch(`${base}/api/lesson-url/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageUrl: pageUrl || "", urls: list }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Tải ảnh thất bại (${r.status}).`);
  return { images: Array.isArray(data.images) ? data.images : [], skipped: Number(data.skipped) || 0 };
}

// Tách text bản gốc thành đoạn chữ + marker ảnh để render đúng vị trí.
// Trả [{ kind: "text", text } | { kind: "img", n }] theo đúng thứ tự.
export function splitSourceMarkers(text) {
  const parts = [];
  const re = /\[ảnh (\d+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(String(text || "")))) {
    if (m.index > last) parts.push({ kind: "text", text: String(text).slice(last, m.index) });
    parts.push({ kind: "img", n: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < String(text || "").length) parts.push({ kind: "text", text: String(text).slice(last) });
  return parts;
}
