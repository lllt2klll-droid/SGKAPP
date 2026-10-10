// ── TOC AI — đọc ẢNH trang mục lục → danh sách {title, page} cho BookReader ──
// Thuần JS (không React): validate + nén ảnh + dựng prompt + làm sạch kết quả AI.
// Việc gọi AI (callAI) và nạp vào panel TOC do BookReader đảm nhiệm.
import {
  validateGuideImageFile,
  fileToGuideDataUrl,
  dataUrlToBase64,
} from "./khbd/guideImageParts.js";

export const TOC_AI_MAX_IMAGES = 6;
export const TOC_AI_MAX_DIM = 1600;
export const TOC_AI_QUALITY = 0.82;
export const TOC_AI_MIME = "image/jpeg";

// File[] → mảng lỗi validate (rỗng nếu OK)
export function validateTocAiFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  const errors = [];
  if (!list.length) errors.push("Chưa chọn ảnh nào.");
  if (list.length > TOC_AI_MAX_IMAGES) {
    errors.push(`Chỉ nhận tối đa ${TOC_AI_MAX_IMAGES} ảnh mỗi lần (mục lục dài hãy chụp gọn trong ${TOC_AI_MAX_IMAGES} ảnh).`);
  }
  for (const f of list) {
    const err = validateGuideImageFile(f);
    if (err) errors.push(err);
  }
  return errors;
}

// File[] → parts Gemini: nhãn "Ảnh trang mục lục i/N" + ảnh đã nén JPEG
// (bỏ qua ảnh hỏng — chỉ cần ≥1 ảnh hợp lệ là chạy được)
export async function buildTocAiImageParts(files) {
  const list = Array.from(files || []).filter(Boolean);
  const images = [];
  for (const f of list) {
    try {
      const dataUrl = await fileToGuideDataUrl(f, TOC_AI_MAX_DIM, TOC_AI_QUALITY);
      const b64 = dataUrlToBase64(dataUrl);
      if (b64 && b64.length >= 64) images.push(b64);
    } catch {
      // bỏ qua ảnh hỏng
    }
  }
  const parts = [];
  images.forEach((b64, i) => {
    parts.push({ text: `Ảnh trang mục lục ${i + 1}/${images.length}:` });
    parts.push({ inlineData: { mimeType: TOC_AI_MIME, data: b64 } });
  });
  return parts;
}

// Dựng prompt + cấu hình gọi AI cho task đọc mục lục từ ảnh
export function buildTocAiPrompt({ bookTitle = "", subject = "", grade = "", imageCount = 1, totalPages = 0 } = {}) {
  const meta = [
    bookTitle ? `Sách: "${bookTitle}"` : "",
    subject ? `Môn: ${subject}` : "",
    grade ? `Lớp: ${grade}` : "",
    totalPages > 0 ? `Số trang file sách: ${totalPages}` : "",
  ].filter(Boolean).join(" · ");

  const userText = [
    meta,
    `Trên đây là ${imageCount} ẢNH trang MỤC LỤC của cùng một cuốn sách (trang mục lục dài có thể chia nhiều ảnh liên tiếp nhau).`,
    "Nhiệm vụ: đọc (OCR) toàn bộ các ảnh và trích danh sách mục lục.",
    "Quy tắc bắt buộc:",
    '1. Mỗi mục dạng {"title": "...", "page": <số>}. "page" là SỐ TRANG GHI NGAY TRONG ẢNH — giữ nguyên y hệt, KHÔNG cộng/trừ/đoán thêm.',
    '2. "title" giữ nguyên văn bản tiếng Việt trong ảnh; BỎ dấu chấm nối (leader dots) và số trang ở cuối dòng (vd: "Bài 1 .......... 15" → "Bài 1").',
    "3. BỎ QUA dòng tiêu đề nhóm/chủ đề/chương KHÔNG có số trang (vd bảng Chủ đề | Nội dung | Trang: chỉ lấy dòng có số ở cột Trang, không tự gán số cho dòng tiêu đề).",
    "4. Không bịa mục không có trong ảnh, không bỏ sót mục có số trang; mục lặp lại giữa các ảnh thì chỉ giữ 1 lần.",
    "5. Sắp xếp mảng theo \"page\" tăng dần.",
    '5. Chỉ trả JSON mảng thuần, không markdown, không giải thích: [{"title":"...","page":12}, ...]',
  ].filter(Boolean).join("\n");

  return {
    userText,
    systemInstruction: {
      parts: [{
        text: "Bạn là trợ lý chuyên đọc trang MỤC LỤC sách giáo khoa từ ảnh. Chỉ trả về JSON hợp lệ, chính xác từng chữ, tuyệt đối không bịa dữ liệu.",
      }],
    },
    // thinkingBudget 0: task chỉ OCR/dán số, không cần suy luận — chặn thinking
    // ăn mất ngân sách maxOutputTokens (mục lục dài có thể 300+ dòng).
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items", "toc", "entries", "mucLuc", "list", "results"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  return [];
}

// Làm sạch kết quả AI: bỏ dòng thiếu tên/trang, bỏ dấu chấm nối còn sót,
// khử trùng, sắp theo trang, kẹp trang vượt tổng số trang sách + cảnh báo.
export function cleanTocAiItems(raw, { totalPages = 0 } = {}) {
  const arr = toArray(raw);
  const warnings = [];
  const items = [];
  const seen = new Set();
  const pageCount = new Map();
  let dropped = 0;
  let clamped = 0;

  for (const e of arr) {
    const title = String(e?.title ?? e?.name ?? e?.t ?? e?.tieude ?? e?.tieu_de ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s*[.…·]{2,}\s*\d{1,4}\s*$/, "")
      .replace(/[.·…\s]+$/, "")
      .trim();
    if (!title) { dropped++; continue; }
    // Lấy nhóm số ĐẦU TIÊN — "12.5"/"12-15"/"trang 12" → 12 (không ghép cả chuỗi số)
    const rawPage = String(e?.page ?? e?.trang ?? e?.p ?? "");
    const pageStr = rawPage.split(/[^0-9]+/).filter(Boolean)[0] || "";
    const page = parseInt(pageStr, 10);
    if (!Number.isFinite(page) || page < 1) { dropped++; continue; }

    const dedupeKey = `${title.toLowerCase()}|${page}`;
    if (seen.has(dedupeKey)) { dropped++; continue; }
    seen.add(dedupeKey);

    let finalPage = page;
    if (totalPages > 0 && finalPage > totalPages) {
      finalPage = totalPages;
      clamped++;
    }
    pageCount.set(finalPage, (pageCount.get(finalPage) || 0) + 1);
    items.push({ title, page: finalPage });
  }

  items.sort((a, b) => a.page - b.page);
  const dupPages = [...pageCount.values()].filter((n) => n > 1).length;

  if (!items.length) warnings.push("AI không trả về mục nào hợp lệ");
  if (dropped) warnings.push(`bỏ ${dropped} dòng thiếu tên/trang`);
  if (clamped) warnings.push(`${clamped} mục vượt ${totalPages} trang → đã kẹp về ${totalPages}`);
  if (dupPages) warnings.push(`${dupPages} số trang bị lặp`);

  return { items, warnings, rawCount: arr.length, keptCount: items.length };
}
