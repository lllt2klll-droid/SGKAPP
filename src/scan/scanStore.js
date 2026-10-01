// ── Scan Store — IndexedDB + localStorage for scan assets ───────────────
// Lưu ảnh cắt + metadata để hiển thị "Scan gần đây" và tái sử dụng.
// Ảnh lớn -> IndexedDB (scan_assets), metadata nhỏ -> localStorage list (50 mục).
import { makeId } from "../storage.js";
import indexedDBService, { STORES } from "../indexedDB.js";
import { resolveBookId } from "../bookIdentity.js";
import { safeGetJSON, safeSetJSON, safeRemove } from "../safeStorage.js";

const SCAN_KEY = "sgk_scans_v1";

export function getScans() {
  return safeGetJSON(SCAN_KEY, [], Array.isArray);
}

export function getRecentScansForBook(bookFilename, limit = 8) {
  const all = getScans();
  if (!bookFilename) return all.slice(0, limit);
  const forBook = all.filter((s) => resolveBookId(s) === bookFilename || s.bookTitle === bookFilename);
  // fallback: if no exact match, return all (cross-book recent)
  const list = forBook.length ? forBook : all;
  return list.slice(0, limit);
}

export async function saveScan(scan) {
  // validate minimal
  if (!scan?.id) scan.id = makeId("scan");
  const thumb = scan.dataUrl ? scan.dataUrl.slice(0, 70000) : "";
  // keep localStorage entry light: truncate dataUrl, keep crop + analysis summary
  const meta = {
    id: scan.id,
    bookId: scan.bookId || scan.book?.filename || "",
    bookTitle: scan.bookTitle || scan.book?.title || "",
    book: scan.book ? { filename: scan.book.filename, title: scan.book.title, subject: scan.book.subject, grade: scan.book.grade } : undefined,
    page: scan.page,
    width: scan.width,
    height: scan.height,
    crop: scan.crop || null,
    createdAt: scan.createdAt || Date.now(),
    hasFullImage: !!scan.dataUrl,
    dataUrl: thumb,
    analysis: scan.analysis ? { topic: scan.analysis.topic, subject: scan.analysis.subject, grade: scan.analysis.grade, confidence: scan.analysis.confidence, suggestedMaterials: scan.analysis.suggestedMaterials } : null,
    materialType: scan.materialType || null,
    title: scan.title || null,
  };
  const list = getScans();
  // dedup by id, newest first, cap 50
  const next = [meta, ...list.filter((s) => s.id !== scan.id)].slice(0, 50);
  const res = safeSetJSON(SCAN_KEY, next);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] Quota exceeded saving sgk_scans_v1:", res.message);
    else console.warn("[safeStorage] Failed to save sgk_scans_v1:", res.message);
    // giữ dữ liệu cũ, không xóa, không báo saved giả
  }
  // Lưu full ảnh + full object vào IndexedDB (để xem lại chất lượng gốc)
  if (scan.dataUrl && scan.id) {
    try {
      if (indexedDBService.constructor.isAvailable()) {
        await indexedDBService.set(STORES.SCAN, scan.id, { ...scan, storedAt: Date.now() });
      }
    } catch (e) { console.warn("[scanStore] IndexedDB set failed", e); }
  }
  return next;
}

export async function saveScanWithAnalysis(scan, analysis, materialType, generated) {
  const full = {
    ...scan,
    analysis: analysis || scan.analysis || null,
    materialType: materialType || scan.materialType || null,
    generated: generated?.parsed || generated || null,
    title: generated?.parsed?.title || generated?.parsed?.name || scan.title || null,
    updatedAt: Date.now(),
  };
  return saveScan(full);
}

export function deleteScan(id) {
  const list = getScans().filter(s => s.id !== id);
  const res = safeSetJSON(SCAN_KEY, list);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] Quota exceeded deleting scan sgk_scans_v1:", res.message);
    else console.warn("[safeStorage] Failed to delete scan sgk_scans_v1:", res.message);
  }
  try { if (indexedDBService.constructor.isAvailable()) indexedDBService.delete(STORES.SCAN, id); } catch (e) { console.warn("[scanStore] IndexedDB delete failed", e); }
  return list;
}

export async function getScanFull(id) {
  try {
    if (indexedDBService.constructor.isAvailable()) {
      const full = await indexedDBService.get(STORES.SCAN, id);
      if (full) return full;
    }
  } catch (e) { console.warn("[scanStore] getScanFull IndexedDB failed", e); }
  return getScans().find(s => s.id === id) || null;
}

export async function getAllScanFull() {
  try {
    if (indexedDBService.constructor.isAvailable()) {
      const all = await indexedDBService.getAll(STORES.SCAN);
      if (Array.isArray(all) && all.length) return all.sort((a,b)=>(b.storedAt||b.createdAt||0)-(a.storedAt||a.createdAt||0));
    }
  } catch (e) { console.warn("[scanStore] getAllScanFull IndexedDB failed", e); }
  return getScans();
}

export function createScan({ book, page, dataUrl, width, height, crop, text }) {
  return {
    id: makeId("scan"),
    bookId: book.filename,
    bookTitle: book.title,
    book: { filename: book.filename, title: book.title, subject: book.subject, grade: book.grade },
    subject: book.subject,
    grade: book.grade,
    page,
    dataUrl,
    width,
    height,
    crop,
    text: text || "",
    createdAt: Date.now(),
  };
}

export function clearScans() {
  safeRemove(SCAN_KEY);
  try { if (indexedDBService.constructor.isAvailable()) indexedDBService.clear(STORES.SCAN); } catch (e) { console.warn("[scanStore] clearScans IndexedDB failed", e); }
}
