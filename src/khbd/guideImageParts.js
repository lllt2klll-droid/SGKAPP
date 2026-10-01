// ── Ảnh tham khảo SGV/HD học liệu cho AI soạn KHBD ───────────────────────
// Module dùng chung, thuần JS (không import React) để thống nhất toàn app:
// - BookReader (tab Giáo án): upload nhiều ảnh SGV → gửi kèm prompt
// - Mọi nơi khác cần: validate + build parts Gemini inlineData giống nhau
// Không đọc/ghi storage, không đụng module khác.

export const GUIDE_IMAGE_MAX_COUNT = 6;
export const GUIDE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const GUIDE_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
export const GUIDE_IMAGE_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

export function isGuideImageMime(mime) {
  return GUIDE_IMAGE_MIMES.includes(String(mime || "").toLowerCase());
}

// Validate 1 File trước khi đọc. Trả về null nếu OK, chuỗi lỗi nếu không.
export function validateGuideImageFile(file) {
  if (!file) return "File ảnh không hợp lệ.";
  const mime = String(file.type || "").toLowerCase();
  if (!isGuideImageMime(mime)) {
    return `File "${file.name || "ảnh"}" không phải ảnh hỗ trợ (chỉ JPG, PNG, GIF, WebP).`;
  }
  if (file.size > GUIDE_IMAGE_MAX_BYTES) {
    return `File "${file.name || "ảnh"}" quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa 10MB/ảnh.`;
  }
  return null;
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh."));
    img.src = url;
  });
}

// File → dataUrl JPEG đã nén (maxDim 1280, quality 0.72) — cùng chuẩn với
// BookReader.compressImageData / renderPageAsJpeg để AI đọc ổn định.
export async function fileToGuideDataUrl(file, maxDim = 1280, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageFromUrl(url);
    const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth || img.width || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

export function dataUrlToBase64(dataUrl) {
  return String(dataUrl || "").split(",").pop() || "";
}

export function makeGuideImageId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `sgv_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    }
  } catch {}
  return `sgv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Dựng parts Gemini cho ảnh SGV: [{text label}, {inlineData}, ...]
// Quy ước label thống nhất: "Ảnh tham khảo SGV i/N" để AI phân biệt
// với ảnh chụp trang SGK (parts chữ/hình của sách).
export function buildGuideImageParts(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  const usable = list
    .map((im, idx) => ({
      im,
      idx,
      b64:
        typeof im === "string"
          ? dataUrlToBase64(im)
          : dataUrlToBase64(im.base64 || im.dataUrl || ""),
    }))
    .filter((x) => x.b64 && x.b64.length > 64);
  if (!usable.length) return [];
  const parts = [
    {
      text:
        `Dưới đây là ${usable.length} ảnh THAM KHẢO từ Sách giáo viên / tài liệu hướng dẫn dạy học ` +
        `do giáo viên chụp tải lên. Hãy đọc kỹ (OCR) từng ảnh, lấy gợi ý sư phạm, mục tiêu, ` +
        `cách tổ chức hoạt động và phân hóa trong đó, rồi HÒA TRỘN với nội dung các trang SGK ở trên ` +
        `để soạn giáo án hoàn chỉnh. Nếu SGV và SGK mâu thuẫn, ưu tiên SGK; dùng SGV để làm giàu ` +
        `cách tiến hành, câu hỏi gợi mở và dặn dò.`,
    },
  ];
  usable.forEach((x, i) => {
    parts.push({ text: `Ảnh tham khảo SGV ${i + 1}/${usable.length}:` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: x.b64 } });
  });
  return parts;
}
