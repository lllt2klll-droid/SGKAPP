// ── SAFE STORAGE HELPER — trung tâm cho toàn bộ localStorage ───────────
// Yêu cầu: JSON.parse an toàn, validate, quota, không nuốt lỗi im lặng,
// không ghi đè ngoài ý muốn, không mất dữ liệu sau reload.

import { appEvents as _busSafe, AppEvents as _EventsSafe } from "./core/appEvents.js";

const CORRUPTED_PREFIX = "__corrupted__";
const QUOTA_MSG = "Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy. Hãy vào Sao lưu & Khôi phục → Quản lý dữ liệu để xóa cache.";

// Test cố tình gây corrupted/quota — im lặng log dự kiến để output sạch.
// Bật bằng globalThis.__SGK_TEST__ = true trong các file *.test.js
function __isTestSilence() {
  try {
    if (globalThis.__SGK_TEST__ === true) return true;
    if (typeof process !== "undefined" && process?.env?.SGK_SILENCE_TEST_LOGS === "1") return true;
  } catch {}
  return false;
}

function isQuotaError(err) {
  return err && (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014 || /quota/i.test(err.message || ""));
}

function isStorageAvailable() {
  try {
    const t = "__sgk_storage_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return true;
  } catch { return false; }
}

const _quotaWarnAt = new Map();
function notifyQuota(key, err) {
  const now = Date.now();
  const last = _quotaWarnAt.get(key) || 0;
  if (now - last < 4000) return; // throttle spam cho cùng key — tránh log 8 lần liên tiếp như notes_..._53
  _quotaWarnAt.set(key, now);
  if (!__isTestSilence()) console.error(`[safeStorage] QuotaExceededError on ${key}:`, err);
  try {
    // Phase 8: via unified bus — appEvents tự bridge ra window cho legacy listener
    _busSafe.emit(_EventsSafe.STORAGE_QUOTA_EXCEEDED, { key, error: err, message: QUOTA_MSG });
  } catch {}
}

function backupCorrupted(key, raw, parseErr) {
  try {
    const backupKey = `${CORRUPTED_PREFIX}${key}_${Date.now()}`;
    // Lưu raw corrupted để có thể recover thủ công nếu cần, không xóa ngay
    // Nhưng giới hạn 5 backup để tránh bloat
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${CORRUPTED_PREFIX}${key}`)) count++;
    }
    if (count < 5) {
      localStorage.setItem(backupKey, raw);
    }
    if (!__isTestSilence()) console.warn(`[safeStorage] Corrupted JSON backed up: ${key} → ${backupKey}`, parseErr);
  } catch {}
}

// Đọc JSON an toàn: parse → validate → fallback, không crash
// validator: (data) => boolean — nếu false thì coi như corrupted
export function safeGetJSON(key, fallback = null, validator = null) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch (err) {
    if (!__isTestSilence()) console.error(`[safeStorage] getItem failed ${key}:`, err);
    return fallback;
  }
  if (raw === null || raw === undefined) return fallback;
  if (raw === "") return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (validator && typeof validator === "function") {
      const ok = validator(parsed);
      if (!ok) {
        if (!__isTestSilence()) console.warn(`[safeStorage] Schema validation failed for ${key}:`, parsed);
        backupCorrupted(key, raw, new Error("Schema validation failed"));
        return fallback;
      }
    }
    return parsed;
  } catch (parseErr) {
    if (!__isTestSilence()) console.warn(`[safeStorage] JSON parse failed for ${key}:`, parseErr);
    backupCorrupted(key, raw, parseErr);
    // Không xóa corrupted ngay để tránh mất dữ liệu — trả fallback nhưng giữ backup
    // Caller có thể quyết định xóa sau khi migrate thành công
    return fallback;
  }
}

// Ghi JSON an toàn: stringify → setItem → handle quota, không nuốt lỗi
export function safeSetJSON(key, value) {
  if (!isStorageAvailable()) {
    const err = new Error("localStorage unavailable (private mode or disabled)");
    if (!__isTestSilence()) console.error(`[safeStorage] unavailable for ${key}`, err);
    return { ok: false, error: "STORAGE_UNAVAILABLE", message: err.message };
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (err) {
    if (!__isTestSilence()) console.error(`[safeStorage] stringify failed ${key}:`, err);
    return { ok: false, error: "STRINGIFY_FAILED", message: err.message };
  }
  try {
    localStorage.setItem(key, serialized);
    try { _busSafe.emit("sgk:storage-written", { key }); } catch {}
    return { ok: true };
  } catch (err) {
    if (isQuotaError(err)) {
      notifyQuota(key, err);
      return { ok: false, error: "QUOTA_EXCEEDED", message: QUOTA_MSG, quota: true };
    }
    if (!__isTestSilence()) console.error(`[safeStorage] setItem failed ${key}:`, err);
    return { ok: false, error: "STORAGE_WRITE_FAILED", message: err.message };
  }
}

// Đọc string thuần (không JSON)
export function safeGetString(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (err) {
    if (!__isTestSilence()) console.error(`[safeStorage] getString failed ${key}:`, err);
    return fallback;
  }
}

export function safeSetString(key, value) {
  if (!isStorageAvailable()) {
    return { ok: false, error: "STORAGE_UNAVAILABLE" };
  }
  try {
    localStorage.setItem(key, String(value));
    return { ok: true };
  } catch (err) {
    if (isQuotaError(err)) {
      notifyQuota(key, err);
      return { ok: false, error: "QUOTA_EXCEEDED", quota: true };
    }
    if (!__isTestSilence()) console.error(`[safeStorage] setString failed ${key}:`, err);
    return { ok: false, error: "STORAGE_WRITE_FAILED", message: err.message };
  }
}

export function safeRemove(key) {
  try { localStorage.removeItem(key); return { ok: true }; }
  catch (err) { if (!__isTestSilence()) console.error(`[safeStorage] remove failed ${key}:`, err); return { ok: false, error: err.message }; }
}

// Lấy raw + status chi tiết (để phân biệt NOT_FOUND vs CORRUPTED)
export function safeGetWithStatus(key, fallback = null, validator = null) {
  let raw;
  try { raw = localStorage.getItem(key); }
  catch (err) { return { ok: false, error: "STORAGE_ACCESS_ERROR", message: err.message, data: fallback }; }
  if (raw === null) return { ok: true, found: false, data: fallback };
  try {
    const parsed = JSON.parse(raw);
    if (validator && !validator(parsed)) {
      backupCorrupted(key, raw, new Error("Schema validation failed"));
      return { ok: false, error: "SCHEMA_INVALID", key, data: fallback, found: true };
    }
    return { ok: true, found: true, data: parsed };
  } catch (parseErr) {
    backupCorrupted(key, raw, parseErr);
    return { ok: false, error: "CORRUPTED_DATA", key, message: parseErr.message, data: fallback, found: true };
  }
}

// Kiểm tra corrupted mà không xóa — để test A/B/C
export function isCorrupted(key) {
  const v = safeGetString(key, null);
  if (v === null) return false;
  try { JSON.parse(v); return false; } catch { return true; }
}

// ── Inventory helpers — tập trung quét localStorage (tránh vương vãi for/length) ──
export function listKeys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) out.push(k); } } catch {}
  return out;
}
export function listKeysByPrefix(prefix) {
  return listKeys().filter(k => k.startsWith(prefix));
}
export function getKeysByPrefix(prefix) { return listKeysByPrefix(prefix); }
export function removeKeysByPrefix(prefix) {
  const keys = listKeysByPrefix(prefix);
  let n = 0;
  keys.forEach(k => { const r = safeRemove(k); if (r.ok) n++; });
  return n;
}
export function countKeysByPrefix(prefix) { return listKeysByPrefix(prefix).length; }

// ── Quota eviction — dọn cache tái tạo được để cứu ghi chú người dùng ──
// Thứ tự ưu tiên xóa (không bao giờ đụng user data: notes_, sgk_marks_,
// sgk_teacherNotes_, studynotes_, bookmarks, vocab...):
//  1. __corrupted__ backups (rác chẩn đoán)
//  2. ai_image_cache (cache ảnh AI, tái tạo được)
//  3. Prefix cache rebuildable: sgk_idx_, sgk_idxmeta_, sgk_index_, sgk_meta_,
//     ocr_, txt_, chat_ (OCR/index/chat có thể build lại từ PDF)
// Chỉ xóa tối đa ~40 keys / lần để tránh treo UI.
const EVICT_PREFIXES = [
  "__corrupted__",
  "sgk_idx_",
  "sgk_idxmeta_",
  "sgk_index_",
  "sgk_meta_",
  "ocr_",
  "txt_",
  "chat_",
];
const EVICT_EXACT_KEYS = ["ai_image_cache"];

export function freeSpaceForNotes(maxKeys = 40) {
  let freed = 0;
  let freedBytes = 0;
  try {
    for (const k of EVICT_EXACT_KEYS) {
      if (freed >= maxKeys) break;
      let raw = null;
      try { raw = localStorage.getItem(k); } catch {}
      if (raw != null) {
        freedBytes += String(raw).length;
        try { localStorage.removeItem(k); freed++; } catch {}
      }
    }
    if (freed >= maxKeys) return { freed, freedBytes };
    const victims = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && EVICT_PREFIXES.some((p) => k.startsWith(p))) victims.push(k);
        if (victims.length >= maxKeys) break;
      }
    } catch {}
    for (const k of victims) {
      try {
        const raw = localStorage.getItem(k);
        if (raw != null) freedBytes += String(raw).length;
      } catch {}
      try { localStorage.removeItem(k); freed++; } catch {}
    }
  } catch {}
  return { freed, freedBytes };
}

// Ghi JSON có tự cứu quota 1 lần: thất bại quota → dọn cache → thử lại.
// Dùng cho ghi chú (user data quý) — cache bị dọn có thể build lại.
export function safeSetJSONWithQuotaRetry(key, value) {
  const first = safeSetJSON(key, value);
  if (first.ok || !first.quota) return first;
  const { freed, freedBytes } = freeSpaceForNotes();
  if (!__isTestSilence()) console.warn(`[safeStorage] Quota on ${key} — đã dọn ${freed} cache (~${Math.round(freedBytes / 1024)}KB), thử lại…`);
  if (freed === 0) return first;
  const second = safeSetJSON(key, value);
  if (!second.ok && !__isTestSilence()) console.warn(`[safeStorage] Retry sau dọn cache vẫn thất bại cho ${key}:`, second.message);
  return second;
}

export const safeStorage = {
  getJSON: safeGetJSON,
  setJSON: safeSetJSON,
  setJSONWithQuotaRetry: safeSetJSONWithQuotaRetry,
  freeSpaceForNotes,
  getString: safeGetString,
  setString: safeSetString,
  remove: safeRemove,
  getWithStatus: safeGetWithStatus,
  isAvailable: isStorageAvailable,
  isQuotaError,
  QUOTA_MSG,
  listKeys,
  listKeysByPrefix,
  getKeysByPrefix,
  removeKeysByPrefix,
  countKeysByPrefix,
};

export default safeStorage;
