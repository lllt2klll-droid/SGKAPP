// ── Note Image Store — ảnh ghi chú trong IndexedDB, localStorage chỉ giữ tham chiếu ──
// Nguyên nhân gốc của lỗi "bộ nhớ đầy" ở ghi chú: ảnh base64 (mỗi ảnh 300-450KB,
// tối đa 4 ảnh/note, ~1.8MB/trang) lưu trực tiếp trong localStorage (giới hạn ~5MB
// cho TOÀN BỘ app). Chỉ 2-3 trang có ảnh là quota cạn, mọi lưu ghi chú đều thất bại.
//
// Giải pháp: ảnh lớn chuyển vào IndexedDB (hàng trăm MB), localStorage chỉ lưu
// chuỗi tham chiếu "idb:<id>" (vài chục byte). Tương thích ngược: đọc được cả
// base64 cũ (inline) và ref mới. Khi IDB không khả dụng (private mode/test) thì
// fallback giữ inline như cũ để không mất dữ liệu.

import indexedDBService, { STORES } from "./indexedDB.js";

export const NOTE_IMAGE_REF_PREFIX = "idb:";
const INLINE_KEEP_BYTES = 8 * 1024; // ảnh < 8KB giữ inline, khỏi tốn 1 record IDB
const _memCache = new Map(); // ref/dataUrl -> resolved display src (dataURL)

function __isTestSilence() {
  try {
    if (globalThis.__SGK_TEST__ === true) return true;
    if (typeof process !== "undefined" && process?.env?.SGK_SILENCE_TEST_LOGS === "1") return true;
  } catch {}
  return false;
}

export function isNoteImageRef(s) {
  return typeof s === "string" && s.startsWith(NOTE_IMAGE_REF_PREFIX) && s.length > 4;
}

export function isInlineImage(s) {
  return typeof s === "string" && (s.startsWith("data:image") || s.startsWith("blob:") || s.startsWith("http"));
}

function refToId(ref) {
  return ref.slice(NOTE_IMAGE_REF_PREFIX.length);
}

export function dataUrlToBlob(dataUrl) {
  try {
    const [head, b64] = String(dataUrl).split(",");
    if (!b64) return null;
    const mime = (head.match(/data:(.*?);/) || [])[1] || "image/jpeg";
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error("blob read failed"));
      r.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

function idbAvailable() {
  try {
    return indexedDBService?.constructor?.isAvailable?.() === true;
  } catch {
    return false;
  }
}

// Lưu 1 ảnh, trả về chuỗi để cất vào note.images[].
// - Ảnh nhỏ / không phải dataURL: giữ nguyên (tránh overhead).
// - Ảnh lớn: lưu Blob vào IDB, trả về "idb:<id>".
// - IDB lỗi/không có: trả về dataURL gốc (caller vẫn lưu inline + xử lý quota như cũ).
export async function saveNoteImage(src, bookFilename = "") {
  if (!src || typeof src !== "string") return src;
  if (isNoteImageRef(src)) return src; // đã là ref — tái sử dụng, tránh duplicate
  if (!src.startsWith("data:")) return src;
  if (src.length < INLINE_KEEP_BYTES) return src;
  if (!idbAvailable()) return src;
  const id = `noteimg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const blob = dataUrlToBlob(src);
    const record = blob
      ? { id, blob, bookFilename, createdAt: Date.now() }
      : { id, dataUrl: src, bookFilename, createdAt: Date.now() };
    const ok = await indexedDBService.set(STORES.NOTE_IMAGES, id, record);
    if (ok) {
      const ref = `${NOTE_IMAGE_REF_PREFIX}${id}`;
      _memCache.set(ref, src); // hiển thị ngay không cần đọc lại IDB
      return ref;
    }
  } catch (e) {
    if (!__isTestSilence()) console.warn("[noteImageStore] save failed, keep inline", e?.message);
  }
  return src;
}

// Chuyển mảng display-srcs thành mảng để lưu localStorage (ref hóa ảnh lớn).
export async function persistNoteImages(images, bookFilename = "") {
  if (!Array.isArray(images) || !images.length) return [];
  const out = [];
  for (const src of images) out.push(await saveNoteImage(src, bookFilename));
  return out;
}

// Giải ref thành src hiển thị được (dataURL). Có cache memory để không đọc IDB lặp lại.
export async function getNoteImageSrc(refOrInline) {
  if (!refOrInline || typeof refOrInline !== "string") return refOrInline || "";
  if (!isNoteImageRef(refOrInline)) return refOrInline;
  const cached = _memCache.get(refOrInline);
  if (cached) return cached;
  if (!idbAvailable()) return ""; // IDB mất mà chỉ có ref → không hiển thị được, nhưng không crash
  try {
    const rec = await indexedDBService.get(STORES.NOTE_IMAGES, refToId(refOrInline));
    if (!rec) return "";
    if (typeof rec === "string" && rec.startsWith("data:")) {
      _memCache.set(refOrInline, rec);
      return rec;
    }
    if (rec?.dataUrl) {
      _memCache.set(refOrInline, rec.dataUrl);
      return rec.dataUrl;
    }
    if (rec?.blob instanceof Blob) {
      const url = await blobToDataUrl(rec.blob);
      _memCache.set(refOrInline, url);
      return url;
    }
    if (rec instanceof Blob) {
      const url = await blobToDataUrl(rec);
      _memCache.set(refOrInline, url);
      return url;
    }
  } catch (e) {
    if (!__isTestSilence()) console.warn("[noteImageStore] get failed", refOrInline, e?.message);
  }
  return "";
}

// Giải 1 batch ref → { ref: src }. Chỉ fetch ref chưa có trong cache.
export async function resolveImageRefs(refs) {
  const map = {};
  const missing = [];
  for (const r of refs || []) {
    if (!isNoteImageRef(r)) continue;
    if (_memCache.has(r)) map[r] = _memCache.get(r);
    else missing.push(r);
  }
  await Promise.all(
    missing.map(async (r) => {
      const src = await getNoteImageSrc(r);
      if (src) map[r] = src;
    }),
  );
  return map;
}

export function primeImageCache(ref, src) {
  if (isNoteImageRef(ref) && typeof src === "string" && src.startsWith("data:")) {
    _memCache.set(ref, src);
  }
}

export async function deleteNoteImages(refs) {
  if (!Array.isArray(refs) || !refs.length) return;
  if (!idbAvailable()) return;
  for (const r of refs) {
    if (!isNoteImageRef(r)) continue;
    try {
      await indexedDBService.delete(STORES.NOTE_IMAGES, refToId(r));
    } catch {}
    _memCache.delete(r);
  }
}

// Ước lượng byte localStorage của 1 note (để chặn trước quota).
export function estimateNoteBytes(note) {
  try {
    return JSON.stringify(note).length;
  } catch {
    return 0;
  }
}

// Đếm số ảnh inline (base64) còn nằm trong notes — dùng để chẩn đoán/quản lý dữ liệu.
export function countInlineImages(notes) {
  let n = 0;
  for (const note of notes || []) {
    for (const img of note?.images || []) {
      if (typeof img === "string" && img.startsWith("data:") && img.length >= INLINE_KEEP_BYTES) n++;
    }
  }
  return n;
}
