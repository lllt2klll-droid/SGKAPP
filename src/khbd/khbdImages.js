// ── KHBD mới — ảnh cho từng bước GV/HS (browser-only) ────────────────
// Nén về JPEG vừa đủ xem trong Word + localStorage không vỡ quota.
// Giới hạn: mỗi ảnh ≤400KB, mỗi bên ≤4 ảnh, cả plan <4.5MB.

export const IMG_MAX_DIM = 900;
export const IMG_QUALITY = 0.65;
export const IMG_MAX_BYTES = 400 * 1024;
export const IMG_MAX_PER_SIDE = 4;
export const PLAN_MAX_BYTES = 4.5 * 1024 * 1024;

export function makeImgId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `img_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    }
  } catch {}
  return `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh."));
    img.src = src;
  });
}

// File/Blob → {dataUrl jpeg, width, height} đã nén
export async function compressImageFile(file, maxDim = IMG_MAX_DIM, quality = IMG_QUALITY) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return compressDrawnImage(img, maxDim, quality, file.name || "anh");
  } finally {
    try { URL.revokeObjectURL(url); } catch {}
  }
}

function compressDrawnImage(img, maxDim, quality, name) {
  const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth || img.width || 1));
  // Ảnh nhỏ giữ nguyên PNG để nét; ảnh lớn nén JPEG
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  // Ước lượng bytes base64
  const bytes = Math.ceil((dataUrl.length * 3) / 4);
  if (bytes > IMG_MAX_BYTES) {
    // Nén lại nhỏ hơn
    const s2 = Math.sqrt(IMG_MAX_BYTES / bytes);
    const w2 = Math.max(1, Math.round(w * s2));
    const h2 = Math.max(1, Math.round(h * s2));
    canvas.width = w2; canvas.height = h2;
    canvas.getContext("2d").drawImage(img, 0, 0, w2, h2);
    dataUrl = canvas.toDataURL("image/jpeg", Math.min(quality, 0.55));
    return { dataUrl, width: w2, height: h2, name };
  }
  return { dataUrl, width: w, height: h, name };
}

// dataURL → Uint8Array (chạy cả browser + node)
export function dataUrlToBytes(dataUrl) {
  const b64 = String(dataUrl || "").split(",").pop() || "";
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isPngDataUrl(dataUrl) {
  return /^data:image\/png/i.test(String(dataUrl || ""));
}

// Tổng dung lượng plan (để chặn trước khi vượt quota localStorage)
export function estimatePlanBytes(plan) {
  try { return new Blob([JSON.stringify(plan)]).size; }
  catch { try { return JSON.stringify(plan).length; } catch { return 0; } }
}
