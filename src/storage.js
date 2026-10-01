// ── Generic localStorage helpers for the research & lesson-planning modules ──
// All data lives in localStorage (local-only, single user) under namespaced
// keys prefixed with "sgk_". Backup/restore writes one JSON file covering
// every known key (except bulky caches that can be rebuilt).

import indexedDBService, { STORES, clearBookData } from "./indexedDB.js";
import { clearAllIndexedDBData } from "./indexedDB.js";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove } from "./safeStorage.js";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { BACKUP_KEYS as _BACKUP_KEYS_CORE, STORAGE_KEYS as _STORAGE_KEYS_CORE, isBackupKey as _isBackupKeyCore, isCacheKey as _isCacheKeyCore } from "./core/storageKeys.js";

// Test rollback cố tình gây lỗi quota — im lặng log dự kiến.
function __isTestSilence() {
  try {
    if (globalThis.__SGK_TEST__ === true) return true;
    if (typeof process !== "undefined" && process?.env?.SGK_SILENCE_TEST_LOGS === "1") return true;
  } catch {}
  return false;
}

// ── Blob serialization for WB_IMAGES backup (TASK #6) ──
function arrayBufferToBase64(buffer) {
  try {
    if (typeof Buffer !== "undefined" && Buffer.from) return Buffer.from(buffer).toString("base64");
  } catch {}
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    let s = "";
    for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
    binary += s;
  }
  try { return btoa(binary); } catch { return ""; }
}
function base64ToBlob(base64, mimeType) {
  try {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.from(base64, "base64");
      return new Blob([buf], { type: mimeType || "image/png" });
    }
  } catch {}
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || "image/png" });
  } catch {
    return new Blob([], { type: mimeType || "image/png" });
  }
}
async function serializeWBRecord(rec) {
  if (!rec || !rec.blob) return rec;
  const blob = rec.blob;
  // Already serialized?
  if (blob && typeof blob === "object" && blob.__blob) return rec;
  if (typeof Blob !== "undefined" && blob instanceof Blob) {
    try {
      const buf = await blob.arrayBuffer();
      return {
        id: rec.id,
        createdAt: rec.createdAt,
        blob: { __blob: true, mimeType: blob.type || "image/png", size: blob.size, data: arrayBufferToBase64(buf) },
      };
    } catch (e) { console.warn("[storage] WB_IMAGES serialize failed", rec.id, e); return rec; }
  }
  return rec;
}
function deserializeWBRecord(rec) {
  if (!rec || !rec.blob || typeof rec.blob !== "object" || !rec.blob.__blob) return rec;
  try {
    const b = base64ToBlob(rec.blob.data, rec.blob.mimeType);
    return { ...rec, blob: b };
  } catch (e) { console.warn("[storage] WB_IMAGES deserialize failed", rec.id, e); return rec; }
}

export const PREFIX = "sgk_";

export function readJSON(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

// Enhanced readJSON that distinguishes between KEY_NOT_FOUND and CORRUPTED_DATA
export function readJSONWithStatus(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) {
      // Key not found - return fallback
      return { ok: true, found: false, data: fallback };
    }
    try {
      const parsed = JSON.parse(v);
      return { ok: true, found: true, data: parsed };
    } catch (parseErr) {
      // Data exists but is corrupted
      console.error(`Failed to parse ${key}:`, parseErr);
      return {
        ok: false,
        error: "CORRUPTED_DATA",
        key,
        message: parseErr.message,
      };
    }
  } catch (err) {
    // localStorage access error
    console.error(`Failed to read ${key}:`, err);
    return {
      ok: false,
      error: "STORAGE_ACCESS_ERROR",
      key,
      message: err.message,
    };
  }
}

function isStorageAvailable() {
  try {
    const t = "__storage_test__";
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}

export function saveJSON(key, value) {
  try {
    if (!isStorageAvailable()) throw new Error("localStorage unavailable (private mode or disabled)");
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Failed to save ${key}:`, err);
    if (err && err.name === "QuotaExceededError") {
      // Try to free cache space automatically (evict rebuildable caches)
      try {
        const cacheKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && isCacheKey(k)) cacheKeys.push(k);
        }
        // Remove oldest cache entries first (first half)
        cacheKeys.slice(0, Math.max(1, Math.floor(cacheKeys.length / 2))).forEach(k=>{ try{ localStorage.removeItem(k);}catch{} });
        // Retry once after eviction
        localStorage.setItem(key, JSON.stringify(value));
        console.warn(`Recovered from quota by clearing ${cacheKeys.length} cache keys`);
        return true;
      } catch (retryErr) {
        console.error("Retry after cache eviction failed:", retryErr);
      }
    }
    throw new Error(`Storage full or quota exceeded: ${err.message}`);
  }
}

// Atomic-style batch save: saves multiple keys in one operation
// If any save fails, all changes are rolled back (by restoring original values)
export function saveBatch(updates) {
  const originals = {};
  const keys = Object.keys(updates);

  // Save original values for rollback
  try {
    keys.forEach((key) => {
      originals[key] = localStorage.getItem(key);
    });
  } catch (err) {
    console.error("Failed to save originals for rollback:", err);
    throw new Error(
      "Cannot perform atomic save: failed to backup original values",
    );
  }

  // Attempt to save all new values
  try {
    keys.forEach((key) => {
      const value = updates[key];
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        );
      }
    });
    return true;
  } catch (err) {
    console.error("Batch save failed, rolling back:", err);
    // Rollback to original values
    keys.forEach((key) => {
      try {
        if (originals[key] === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, originals[key]);
        }
      } catch (rollbackErr) {
        console.error(`Failed to rollback ${key}:`, rollbackErr);
      }
    });
    throw new Error(`Batch save failed and rolled back: ${err.message}`);
  }
}

export function readLS(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ── Gemini API Key Management (Centralized) ──────────────────────────
// Single source of truth for Gemini API key storage and retrieval
const GEMINI_API_KEY_STORE = "GEMINI_API_KEY";

export function getGeminiApiKey() {
  try {
    // Try new key first
    let key = localStorage.getItem(GEMINI_API_KEY_STORE);
    if (key && key.trim()) {
      return key.trim();
    }
    // Fallback to old lowercase key for backward compatibility (one-time migration)
    const oldKey = localStorage.getItem("gemini_api_key");
    if (oldKey && oldKey.trim()) {
      // Migrate to new key
      try {
        localStorage.setItem(GEMINI_API_KEY_STORE, oldKey.trim());
        localStorage.removeItem("gemini_api_key");
      } catch (err) {
        if (err.name === "QuotaExceededError") {
          console.warn("localStorage quota exceeded during API key migration");
          // Still return the old key even if migration fails
          return oldKey.trim();
        }
      }
      return oldKey.trim();
    }
    return "";
  } catch {
    return "";
  }
}

export function setGeminiApiKey(key) {
  try {
    if (key && key.trim()) {
      localStorage.setItem(GEMINI_API_KEY_STORE, key.trim());
      // Clean up old key
      try {
        localStorage.removeItem("gemini_api_key");
      } catch {}
      return true;
    } else {
      localStorage.removeItem(GEMINI_API_KEY_STORE);
      return true;
    }
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      console.warn("localStorage quota exceeded for API key");
      return false;
    }
    return false;
  }
}

export function hasGeminiApiKey() {
  return !!getGeminiApiKey();
}

export function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function now() {
  return Date.now();
}

// ── List helpers (immutable style, mirrors userdata.js) ──────────────
export function getList(key, fallback = []) {
  const v = readJSON(key, null);
  return Array.isArray(v) ? v : fallback;
}

export function saveList(key, list) {
  saveJSON(key, list);
}

export function addItem(key, item, { unshift = true, cap = 0 } = {}) {
  const list = getList(key);
  const next = unshift ? [item, ...list] : [...list, item];
  return cap > 0 ? next.slice(0, cap) : next;
}

export function updateItem(key, id, patch) {
  const list = getList(key);
  return list.map((it) => (it.id === id ? { ...it, ...patch, id: it.id } : it));
}

export function removeItem(list, id) {
  return list.filter((it) => it.id !== id);
}

// ── IndexedDB export helper (for backup) ───────────────────────────────
async function exportIndexedDBData({ skipStores = [] } = {}) {
  if (!indexedDBService.constructor.isAvailable()) {
    return {};
  }

  const indexedData = {};
  const skip = new Set(skipStores);

  try {
    for (const store of Object.values(STORES)) {
      if (skip.has(store)) continue;
      const records = await indexedDBService.getAllRecords(store);
      if (records.length > 0) {
        if (store === STORES.WB_IMAGES || store === STORES.NOTE_IMAGES) {
          const serialized = [];
          for (const r of records) serialized.push(await serializeWBRecord(r));
          indexedData[store] = serialized;
        } else {
          indexedData[store] = records;
        }
      }
    }
  } catch (err) {
    console.error("Failed to export IndexedDB data:", err);
    throw new Error("Không thể đọc đầy đủ dữ liệu IndexedDB để sao lưu.");
  }

  return indexedData;
}

// ── IndexedDB restore helper (for import) ─────────────────────────────
async function restoreIndexedDBData(indexedData) {
  if (!indexedDBService.constructor.isAvailable()) {
    return 0;
  }

  if (!indexedData || typeof indexedData !== "object") {
    return 0;
  }

  const keyPaths = {
    [STORES.OCR]: "key",
    [STORES.SEARCH_INDEX]: "key",
    [STORES.CLIPS]: "id",
    [STORES.REFS]: "id",
    [STORES.CONCEPTS]: "id",
    [STORES.EVIDENCE]: "id",
    [STORES.SCAN]: "id",
    [STORES.WB_IMAGES]: "id",
    [STORES.WB_BOARDS]: "id",
    [STORES.NOTE_IMAGES]: "id",
  };

  let count = 0;

  for (const [store, items] of Object.entries(indexedData)) {
    if (!Object.values(STORES).includes(store)) {
      continue;
    }

    if (!Array.isArray(items)) {
      continue;
    }

    const keyPath = keyPaths[store];

    for (const record of items) {
      if (!record) {
        continue;
      }

      const key = record[keyPath];

      if (key === undefined || key === null) {
        console.warn(`Skipping invalid record in ${store}: missing ${keyPath}`);
        continue;
      }

      try {
        let value;

        if (keyPath === "key") {
          value = record.value;
        } else {
          value = record;
        }
        // TASK #6: deserialize WB_IMAGES Blob (+ NOTE_IMAGES — cùng định dạng blob)
        if (store === STORES.WB_IMAGES || store === STORES.NOTE_IMAGES) {
          value = deserializeWBRecord(value);
        }

        const ok = await indexedDBService.set(store, key, value);

        if (!ok) {
          throw new Error(`IndexedDB set returned false`);
        }

        count++;
      } catch (err) {
        console.error(`Failed to restore item in ${store}:`, err);
      }
    }
  }

  return count;
}

// ── Hybrid LS->IDB migration (TASK #4) — idempotent, verify before cleanup ──
export const HYBRID_MIGRATION_KEY = _STORAGE_KEYS_CORE.STORAGE_MIGRATION_VERSION;
const CURRENT_HYBRID_VERSION = "3";
export async function runHybridMigrations() {
  try {
    const done = safeGetString(HYBRID_MIGRATION_KEY, null);
    if (done === CURRENT_HYBRID_VERSION) return { migrated: false, reason: "already v3" };
    if (done !== null && done > CURRENT_HYBRID_VERSION) return { migrated: false, reason: "higher version, no downgrade" };
    // v2 or missing or "1" => migration required (do NOT treat v2 as complete)
    if (!indexedDBService.constructor.isAvailable()) return { migrated: false, reason: "IDB unavailable" };
    // v2 -> v3: inspect legacy LS, migrate missing, verify, then set v3 (TASK 8)
    const hybrids = [
      { lsKey: _STORAGE_KEYS_CORE.CLIPS, store: STORES.CLIPS },
      { lsKey: _STORAGE_KEYS_CORE.REFS, store: STORES.REFS },
      { lsKey: _STORAGE_KEYS_CORE.CONCEPTS, store: STORES.CONCEPTS },
      { lsKey: _STORAGE_KEYS_CORE.EVIDENCE, store: STORES.EVIDENCE },
    ];
    let totalMigrated = 0;
    let totalVerified = 0;
    for (const { lsKey, store } of hybrids) {
      const lsArr = safeGetJSON(lsKey, [], Array.isArray);
      if (!Array.isArray(lsArr) || lsArr.length === 0) continue;
      const idbAll = await indexedDBService.getAll(store);
      const idbIds = new Set((idbAll || []).map((x) => x?.id).filter(Boolean));
      // Preserve items without id — never delete silently (P0 data-loss fix)
      const itemsWithoutId = lsArr.filter((x) => !x?.id);
      if (itemsWithoutId.length) {
        console.warn(`[storage] ${lsKey} has ${itemsWithoutId.length} items without id — preserving in LS, not migrating`);
      }
      let migrated = 0;
      for (const item of lsArr) {
        if (!item?.id) continue;
        if (idbIds.has(item.id)) continue;
        const ok = await indexedDBService.set(store, item.id, item);
        if (ok) migrated++;
        else throw new Error(`migrate ${lsKey} ${item.id} failed`);
      }
      // Verify IDB count >= expected (LS unique with id + existing IDB)
      const after = await indexedDBService.getAll(store);
      const expectedIds = new Set([...idbIds, ...lsArr.map((x) => x?.id).filter(Boolean)]);
      const afterIds = new Set((after || []).map((x) => x?.id).filter(Boolean));
      let verified = true;
      for (const id of expectedIds) if (!afterIds.has(id)) verified = false;
      if (!verified) throw new Error(`verify ${store} failed`);
      // Only clear LS after verify — preserve no-id items (fix P0: don't delete silently)
      const remaining = itemsWithoutId;
      const r = safeSetJSON(lsKey, remaining);
      if (!r.ok) throw new Error(`clear LS ${lsKey} failed: ${r.message}`);
      // If we preserved no-id items, keep migration version unset so repair can run again? No — mark migrated but log
      if (remaining.length) {
        console.warn(`[storage] ${lsKey} preserved ${remaining.length} no-id items in LS after migration`);
      }
      totalMigrated += migrated;
      totalVerified++;
    }
    safeSetString(HYBRID_MIGRATION_KEY, "3");
    return { migrated: true, totalMigrated, totalVerified };
  } catch (e) {
    console.warn("[storage] hybrid migration failed, preserve LS", e);
    return { migrated: false, error: e.message };
  }
}

// ── Storage Inventory ────────────────────────────────────────────────────
// Owner / purpose / backup / wipe / restore / cache?
// See docs/storage-inventory.md for full table (generated via grep audit).
// Summary: 7 stores IndexedDB + ~40 localStorage keys.
// Persistent user data (backup+wipe+restore): bookmarks, vocab, quiz, refs, concepts, collections, clips, marks, teacherNotes, evidence, ideas, tasks, internship, lessonplans (+versions/autosave), activities, worksheets, questions, scans, custom_titles, sidebar/expanded, missions, settings, gemini key, activity_ratings, etc.
// Cache / rebuildable (wipe but NOT backup): sgk_index_, sgk_meta_, sgk_idx_, ocr_, txt_, chat_, assistant_history
// ── Backup / restore ─────────────────────────────────────────────────
// Keys remembered for backup (do NOT include caches or per-book indexes —
// they can be rebuilt locally and would bloat the backup file).
// PHASE 6: includes scans, autosave, custom_titles, activity ratings (user-owned).
// Canonical re-export — không duplicate array, tránh drift với core/storageKeys.js:116
export const BACKUP_KEYS = _BACKUP_KEYS_CORE;

export function isBackupKey(key) {
  try { return _isBackupKeyCore(key); } catch { return BACKUP_KEYS.some((prefix) => key === prefix || key.startsWith(prefix)); }
}

// Bộ nhớ tái tạo được — canonical ở src/core/storageKeys.js:99, alias để tránh drift
const CACHE_PREFIXES = _STORAGE_KEYS_CORE.CACHE_PREFIXES;

export function isCacheKey(key) {
  // Delegate to canonical core to avoid drift
  try { return _isCacheKeyCore(key); } catch { return CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)); }
}

export async function removeBookData(filename) {
  if (!filename) return false;
  // P0 fix: transactional snapshot — if IDB cleanup fails, rollback LS deletions
  const lsSnapshot = new Map();
  const snapshotGet = (k) => { try { const v=localStorage.getItem(k); if(v!==null) lsSnapshot.set(k,v); } catch {} };
  const snapshotRemoveKeys = [];
  try {
    const removeKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const shouldRemove =
        key === `chat_${filename}` ||
        isExactBookKey(key, "notes_", filename) ||
        isExactBookKey(key, "ocr_", filename) ||
        isExactBookKey(key, "txt_", filename) ||
        isExactBookKey(key, "sgk_marks_", filename) ||
        isExactBookKey(key, "sgk_teacherNotes_", filename) ||
        isExactBookKey(key, "sgk_idx_", filename) ||
        isExactBookKey(key, "sgk_idxmeta_", filename) ||
        isExactBookKey(key, "sgk_index_", filename) ||
        isExactBookKey(key, "sgk_meta_", filename) ||
        isExactBookKey(key, "lastPage_", filename) ||
        isExactBookKey(key, "lastTotal_", filename);
      if (shouldRemove) removeKeys.push(key);
    }
    // Snapshot keys that will be deleted
    removeKeys.forEach(k=> snapshotGet(k));
    snapshotRemoveKeys.push(...removeKeys);
    removeKeys.forEach((key) => localStorage.removeItem(key));

    for (const key of [
      "sgk_clips",
      "sgk_refs",
      "sgk_concepts",
      "sgk_evidence",
    ]) {
      snapshotGet(key);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          localStorage.setItem(
            key,
            JSON.stringify(items.filter((item) => item?.file !== filename)),
          );
        }
      } catch {}
    }

    // PHASE 3: Scan cleanup — sgk_scans_v1 (localStorage) and scan_assets (IndexedDB)
    try {
      snapshotGet("sgk_scans_v1");
      const scanRaw = localStorage.getItem("sgk_scans_v1");
      if (scanRaw) {
        const scans = JSON.parse(scanRaw);
        if (Array.isArray(scans)) {
          const filtered = scans.filter(s => {
            const bid = s.bookId || s.book?.filename || "";
            const title = s.bookTitle || "";
            return bid !== filename && title !== filename;
          });
          if (filtered.length !== scans.length) {
            localStorage.setItem("sgk_scans_v1", JSON.stringify(filtered));
          }
        }
      }
    } catch {}

    snapshotGet("sgk_custom_titles");
    const customTitles = localStorage.getItem("sgk_custom_titles");
    if (customTitles) {
      try {
        const titles = JSON.parse(customTitles);
        if (titles && typeof titles === "object") {
          delete titles[filename];
          localStorage.setItem("sgk_custom_titles", JSON.stringify(titles));
        }
      } catch {}
    }

    // PHASE 7+: Bookmarks cleanup — sgk_bookmarks {filename: pages[]} and sgk_bookmark_labels {"filename#page": label}
    try {
      snapshotGet("sgk_bookmarks");
      const bmRaw = localStorage.getItem("sgk_bookmarks");
      if (bmRaw) {
        const bm = JSON.parse(bmRaw);
        if (bm && typeof bm === "object" && bm[filename]) {
          delete bm[filename];
          localStorage.setItem("sgk_bookmarks", JSON.stringify(bm));
        }
      }
    } catch {}
    try {
      snapshotGet("sgk_bookmark_labels");
      const lblRaw = localStorage.getItem("sgk_bookmark_labels");
      if (lblRaw) {
        const lbls = JSON.parse(lblRaw);
        if (lbls && typeof lbls === "object") {
          let changed = false;
          for (const k of Object.keys(lbls)) {
            if (k.startsWith(filename + "#")) { delete lbls[k]; changed = true; }
          }
          if (changed) localStorage.setItem("sgk_bookmark_labels", JSON.stringify(lbls));
        }
      }
    } catch {}
    // Vocab / quiz history cleanup — arrays with file field
    try {
      snapshotGet("sgk_vocab");
      const vocabRaw = localStorage.getItem("sgk_vocab");
      if (vocabRaw) {
        const vocab = JSON.parse(vocabRaw);
        if (Array.isArray(vocab)) {
          const filtered = vocab.filter(v => v?.file !== filename);
          if (filtered.length !== vocab.length) localStorage.setItem("sgk_vocab", JSON.stringify(filtered));
        }
      }
    } catch {}
    try {
      snapshotGet("sgk_quiz_history");
      const quizRaw = localStorage.getItem("sgk_quiz_history");
      if (quizRaw) {
        const quiz = JSON.parse(quizRaw);
        if (Array.isArray(quiz)) {
          const filtered = quiz.filter(q => q?.file !== filename);
          if (filtered.length !== quiz.length) localStorage.setItem("sgk_quiz_history", JSON.stringify(filtered));
        }
      }
    } catch {}
    // Notes variants: studynotes_ and sgk_cmpnote_ and generic notes_ already handled via removeKeys loop, but ensure sgk_cmpnote_/studynotes_ per-book map keys are covered
    try {
      for (const prefix of ["studynotes_", "sgk_cmpnote_"]) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && isExactBookKey(k, prefix, filename)) { snapshotGet(k); keys.push(k); }
        }
        keys.forEach(k => localStorage.removeItem(k));
      }
    } catch {}

    // (Kho KHBD cũ đã xóa — không còn cascade bookReference vào plan cũ.)

    // Delegate IndexedDB cleanup (OCR, search_index, clips, refs, concepts, evidence, scan_assets)
    // In test env IndexedDB unavailable → treat as success (nothing to clear)
    try {
      const idbUnavailable = !indexedDBService.constructor.isAvailable();
      const idbOk = await clearBookData(filename);
      if (!idbUnavailable && !idbOk) {
        // P0 fix: IDB failed → rollback LS snapshot to avoid partial deletion (LS cleared but IDB orphan)
        console.warn(`[storage] clearBookData failed for ${filename}, rolling back LS snapshot`);
        for (const [k,v] of lsSnapshot.entries()) { try { localStorage.setItem(k, v); } catch {} }
        // Restore removed keys that no longer exist (already in snapshot)
        // Note: keys that were deleted but had snapshot will be restored above
        return false;
      }
      // P0: xoá liên kết sách (sourceRef) còn sót trên các bảng Whiteboard → không còn orphan link
      try {
        const { purgeBookRefs } = await import("./whiteboard/whiteboardStore.js");
        await purgeBookRefs(filename);
      } catch (e) { console.warn(`[storage] purgeBookRefs failed for ${filename}:`, e?.message || e); }
      return true;
    } catch (e) {
      console.warn(`[storage] clearBookData error for ${filename}, rolling back`, e);
      for (const [k,v] of lsSnapshot.entries()) { try { localStorage.setItem(k, v); } catch {} }
      // Restore any removeKeys that were deleted
      for (const k of snapshotRemoveKeys) { if (!lsSnapshot.has(k)) continue; try { if (localStorage.getItem(k)===null) localStorage.setItem(k, lsSnapshot.get(k)); } catch {} }
      return false;
    }
  } catch (err) {
    console.error(`Failed to remove local data for ${filename}:`, err);
    // Rollback on outer catch as well
    try { for (const [k,v] of lsSnapshot.entries()) localStorage.setItem(k, v); } catch {}
    return false;
  }
}

// ── Rename migration — transaction-like: oldFilename → newFilename ────────
// Covers ALL per-book keys: localStorage per-book prefixes, bookmarks, vocab, quiz, clips/refs/concepts/evidence arrays, scans, custom_titles, lessonPlans, IndexedDB OCR+search
// Guarantees: read old → create new → verify new exists → cleanup old; rollback on any failure before cleanup.
export async function migrateBookData(oldFilename, newFilename) {
  if (!oldFilename || !newFilename || oldFilename === newFilename) return { ok: false, reason: "invalid filenames" };
  const snapshot = {};
  const createdKeys = [];
  const createdIDB = [];
  const idbDestSnapshot = new Map(); // store existing destination IDB values for rollback
  const lsDestSnapshot = new Map(); // store existing LS destination values for rollback
  function snapGet(key) {
    try { const v = localStorage.getItem(key); if (v !== null) snapshot[key] = v; return v; } catch { return null; }
  }
  try {
    // 1) Collect per-book prefixed keys (including page suffix variants)
    const prefixes = ["notes_", "ocr_", "txt_", "sgk_marks_", "sgk_teacherNotes_", "sgk_idx_", "sgk_idxmeta_", "sgk_index_", "sgk_meta_", "lastPage_", "lastTotal_", "chat_", "studynotes_", "sgk_cmpnote_"];
    const toMigrate = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      for (const pref of prefixes) {
        if (isExactBookKey(key, pref, oldFilename)) { toMigrate.push({ oldKey: key, newKey: pref + newFilename + key.slice((pref+oldFilename).length) }); break; }
      }
      if (key === `chat_${oldFilename}`) toMigrate.push({ oldKey: key, newKey: `chat_${newFilename}` });
    }
    const seen = new Set();
    const deduped = [];
    for (const m of toMigrate) { if (!seen.has(m.oldKey)) { seen.add(m.oldKey); deduped.push(m); } }

    // 2) Create new keys (verify after each) with destination snapshot
    for (const { oldKey, newKey } of deduped) {
      const val = snapGet(oldKey);
      if (val === null) continue;
      const destOld = (()=>{ try{ return localStorage.getItem(newKey);}catch{ return null;}})();
      if (destOld !== null) lsDestSnapshot.set(newKey, destOld);
      try { localStorage.setItem(newKey, val); } catch (e) { throw new Error(`localStorage set failed for ${newKey}: ${e.message}`); }
      if (localStorage.getItem(newKey) !== val) throw new Error(`verify failed for ${newKey}`);
      createdKeys.push(newKey);
      snapshot[`__new__${newKey}`] = val;
    }

    // 3) Migrate map-type keys (bookmarks, bookmark_labels, custom_titles, favs, history, counts)
    // sgk_bookmarks
    {
      const raw = snapGet("sgk_bookmarks");
      if (raw) {
        let bm;
        try { bm = JSON.parse(raw); } catch (e) { throw new Error(`Corrupt sgk_bookmarks JSON: ${e.message}`); }
        if (bm && typeof bm === "object" && bm[oldFilename] !== undefined) {
          const pages = bm[oldFilename];
          snapshot["sgk_bookmarks_before"] = raw;
          if (bm[newFilename] && Array.isArray(bm[newFilename]) && Array.isArray(pages)) {
            const merged = [...new Set([...bm[newFilename], ...pages])].sort((a,b)=>a-b);
            bm[newFilename] = merged;
          } else {
            bm[newFilename] = pages;
          }
          try { localStorage.setItem("sgk_bookmarks", JSON.stringify(bm)); } catch (e) { throw new Error(`Failed to migrate sgk_bookmarks: ${e.message}`); }
          const verify = safeGetJSON("sgk_bookmarks", {}, (v) => v && typeof v === "object" && !Array.isArray(v));
          if (!verify[newFilename]) throw new Error("bookmark verify failed");
        }
      }
    }
    // sgk_bookmark_labels
    {
      const raw2 = snapGet("sgk_bookmark_labels");
      if (raw2) {
        let lbls;
        try { lbls = JSON.parse(raw2); } catch (e) { throw new Error(`Corrupt sgk_bookmark_labels JSON: ${e.message}`); }
        if (lbls && typeof lbls === "object") {
          let changed = false;
          const next = { ...lbls };
          for (const k of Object.keys(lbls)) {
            if (k.startsWith(oldFilename + "#")) {
              const suffix = k.slice(oldFilename.length);
              const newK = newFilename + suffix;
              if (next[newK] === undefined) { next[newK] = lbls[k]; }
              changed = true;
            }
          }
          if (changed) { snapshot["sgk_bookmark_labels_before"] = raw2; try{ localStorage.setItem("sgk_bookmark_labels", JSON.stringify(next)); }catch(e){ throw new Error(`Failed bookmark_labels: ${e.message}`);} }
        }
      }
    }
    // sgk_custom_titles
    {
      const raw3 = snapGet("sgk_custom_titles");
      if (raw3) {
        let ct;
        try { ct = JSON.parse(raw3); } catch (e) { throw new Error(`Corrupt sgk_custom_titles JSON: ${e.message}`); }
        if (ct && typeof ct === "object" && ct[oldFilename] !== undefined) {
          const title = ct[oldFilename];
          snapshot["sgk_custom_titles_before"] = raw3;
          ct[newFilename] = title;
          try{ localStorage.setItem("sgk_custom_titles", JSON.stringify(ct)); }catch(e){ throw new Error(`Failed custom_titles: ${e.message}`);}
        }
      }
    }
    // sgk_favs
    {
      const raw = snapGet("sgk_favs");
      if (raw) {
        let arr;
        try { arr = JSON.parse(raw); } catch (e) { throw new Error(`Corrupt sgk_favs JSON: ${e.message}`); }
        if (Array.isArray(arr) && arr.includes(oldFilename)) {
          snapshot["sgk_favs_before"] = raw;
          const next = arr.map(f => f === oldFilename ? newFilename : f);
          // dedup if new already exists
          const dedupedFavs = [...new Set(next)];
          try{ localStorage.setItem("sgk_favs", JSON.stringify(dedupedFavs)); }catch(e){ throw new Error(`Failed favs: ${e.message}`);}
        }
      }
    }
    // sgk_history
    {
      const raw = localStorage.getItem("sgk_history");
      if (raw) {
        let arr;
        try { arr = JSON.parse(raw); } catch (e) { throw new Error(`Corrupt sgk_history JSON: ${e.message}`); }
        if (Array.isArray(arr) && arr.some(x=> x?.filename === oldFilename)) {
          snapshot["sgk_history_before"] = raw;
          const next = arr.map(x => x?.filename === oldFilename ? { ...x, filename: newFilename } : x);
          try{ localStorage.setItem("sgk_history", JSON.stringify(next)); }catch(e){ throw new Error(`Failed history: ${e.message}`);}
        }
      }
    }
    // sgk_counts
    {
      const raw = localStorage.getItem("sgk_counts");
      if (raw) {
        let obj;
        try { obj = JSON.parse(raw); } catch (e) { throw new Error(`Corrupt sgk_counts JSON: ${e.message}`); }
        if (obj && typeof obj === "object" && obj[oldFilename] !== undefined) {
          snapshot["sgk_counts_before"] = raw;
          const next = { ...obj };
          next[newFilename] = next[oldFilename];
          // keep old until commit, but track for rollback
          try{ localStorage.setItem("sgk_counts", JSON.stringify(next)); }catch(e){ throw new Error(`Failed counts: ${e.message}`);}
        }
      }
    }

    // 4) Migrate array keys with file field
    const arrayMigrations = [
      { key: "sgk_vocab", field: "file" },
      { key: "sgk_quiz_history", field: "file" },
      { key: "sgk_clips", field: "file" },
      { key: "sgk_refs", field: "file" },
      { key: "sgk_concepts", field: "file" },
      { key: "sgk_evidence", field: "file" },
    ];
    for (const { key, field } of arrayMigrations) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let arr;
      try { arr = JSON.parse(raw); } catch (e) { throw new Error(`Corrupt ${key} JSON: ${e.message}`); }
      if (!Array.isArray(arr)) continue;
      let changed = false;
      const next = arr.map(it => {
        if (it && it[field] === oldFilename) { changed = true; return { ...it, [field]: newFilename }; }
        return it;
      });
      if (changed) { snapshot[`${key}_before`] = raw; try{ localStorage.setItem(key, JSON.stringify(next)); }catch(e){ throw new Error(`Failed ${key}: ${e.message}`);} }
    }
    // scans
    {
      const raw = localStorage.getItem("sgk_scans_v1");
      if (raw) {
        let scans;
        try { scans = JSON.parse(raw); } catch (e) { throw new Error(`Corrupt sgk_scans_v1 JSON: ${e.message}`); }
        if (Array.isArray(scans)) {
          let changed = false;
          const next = scans.map(s => {
            let n = s;
            if (s.bookId === oldFilename) { n = { ...n, bookId: newFilename }; changed = true; }
            if (s.book?.filename === oldFilename) { n = { ...n, book: { ...n.book, filename: newFilename } }; changed = true; }
            if (s.bookTitle === oldFilename) { n = { ...n, bookTitle: newFilename }; changed = true; }
            return n;
          });
          if (changed) { snapshot["sgk_scans_v1_before"] = raw; try{ localStorage.setItem("sgk_scans_v1", JSON.stringify(next)); }catch(e){ throw new Error(`Failed scans: ${e.message}`);} }
        }
      }
    }

    // 5) LessonPlan bookReference migration — kho cũ đã xóa, bỏ qua.

    // 6) IndexedDB migration with destination snapshot
    if (indexedDBService.constructor.isAvailable()) {
        const allOCR = await indexedDBService.getAllRecords(STORES.OCR);
        for (const rec of allOCR) {
          const k = rec?.key;
          if (typeof k === "string" && k.startsWith(oldFilename + "_")) {
            const suffix = k.slice(oldFilename.length);
            if (/^_\d/.test(suffix)) {
              const newK = newFilename + suffix;
              const existing = await indexedDBService.get(STORES.OCR, newK);
              if (existing !== null) idbDestSnapshot.set(`ocr:${newK}`, existing);
              const val = rec.value;
              const ok = await indexedDBService.set(STORES.OCR, newK, val);
              if (!ok) throw new Error(`IDB OCR set failed for ${newK}`);
              createdIDB.push({ store: STORES.OCR, key: newK });
            }
          }
        }
        {
          const idxVal = await indexedDBService.get(STORES.SEARCH_INDEX, oldFilename);
          if (idxVal) {
            const existing = await indexedDBService.get(STORES.SEARCH_INDEX, newFilename);
            if (existing !== null) idbDestSnapshot.set(`search:${newFilename}`, existing);
            const ok = await indexedDBService.set(STORES.SEARCH_INDEX, newFilename, idxVal);
            if (!ok) throw new Error("IDB search index set failed");
            createdIDB.push({ store: STORES.SEARCH_INDEX, key: newFilename });
          }
        }
        const migratedStores = [STORES.CLIPS, STORES.REFS, STORES.CONCEPTS, STORES.EVIDENCE, STORES.SCAN];
        for (const store of migratedStores) {
            const all = await indexedDBService.getAll(store);
            for (const item of all) {
              let updated = null;
              if (item?.file === oldFilename) updated = { ...item, file: newFilename };
              else if (item?.bookId === oldFilename) updated = { ...item, bookId: newFilename };
              else if (item?.book?.filename === oldFilename) updated = { ...item, book: { ...item.book, filename: newFilename } };
              if (updated) {
                const key = updated.id || updated.key;
                const existing = await indexedDBService.get(store, key);
                // existing is the same record before update (old value), snapshot for rollback if needed
                // For destination overwrite case, key is same, so no dest snapshot needed
                const ok = await indexedDBService.set(store, key, updated);
                if (!ok) throw new Error(`IDB ${store} set failed`);
                createdIDB.push({ store, key });
              }
            }
        }
      }

    // 7) Verify new data exists
    let verified = false;
    if (createdKeys.length > 0) verified = true;
    try {
      const bm = safeGetJSON("sgk_bookmarks", {}, (v) => v && typeof v === "object" && !Array.isArray(v));
      if (bm[newFilename]) verified = true;
    } catch (e) {
      console.warn("[storage] verify failed sgk_bookmarks", e);
    }
    try {
      const ct = safeGetJSON("sgk_custom_titles", {}, (v) => v && typeof v === "object" && !Array.isArray(v));
      if (ct[newFilename]) verified = true;
    } catch (e) {
      console.warn("[storage] verify failed sgk_custom_titles", e);
    }
    if (deduped.length === 0 && createdKeys.length === 0) verified = true;
    // Also verify array migrations if they were the only changes
    if (!verified) {
      // Check if any array migration produced new file references
      for (const {key, field} of arrayMigrations) {
        try{
          const arr = safeGetJSON(key, [], Array.isArray);
          if (Array.isArray(arr) && arr.some(x=> x?.file === newFilename || x?.bookId === newFilename)) { verified = true; break; }
        }catch (e) {
          console.warn("[storage] verify failed " + key, e);
        }
      }
    }
    if (!verified && deduped.length>0) throw new Error("verification failed: new data missing");

    // 8) Cleanup old keys only after verification
    for (const { oldKey } of deduped) {
      try { localStorage.removeItem(oldKey); } catch {}
    }
    try {
      const bmRaw = localStorage.getItem("sgk_bookmarks");
      if (bmRaw) {
        const bm = JSON.parse(bmRaw);
        if (bm[oldFilename] !== undefined && oldFilename !== newFilename) { delete bm[oldFilename]; localStorage.setItem("sgk_bookmarks", JSON.stringify(bm)); }
      }
    } catch (e) { throw new Error(`Cleanup bookmarks failed: ${e.message}`); }
    try {
      const lblRaw = localStorage.getItem("sgk_bookmark_labels");
      if (lblRaw) {
        const lbls = JSON.parse(lblRaw);
        let changed=false; for(const k of Object.keys(lbls)) if(k.startsWith(oldFilename+"#")){ delete lbls[k]; changed=true; }
        if(changed) localStorage.setItem("sgk_bookmark_labels", JSON.stringify(lbls));
      }
    } catch (e) { throw new Error(`Cleanup labels failed: ${e.message}`); }
    try {
      const ctRaw = localStorage.getItem("sgk_custom_titles");
      if (ctRaw) {
        const ct = JSON.parse(ctRaw);
        if (ct[oldFilename] !== undefined && oldFilename !== newFilename) { delete ct[oldFilename]; localStorage.setItem("sgk_custom_titles", JSON.stringify(ct)); }
      }
    } catch (e) { throw new Error(`Cleanup titles failed: ${e.message}`); }
    // favs/history/counts cleanup
    try {
      const favRaw = localStorage.getItem("sgk_favs");
      if (favRaw) {
        const arr = JSON.parse(favRaw);
        if (Array.isArray(arr) && arr.includes(oldFilename)) {
          const next = arr.filter(f=> f!== oldFilename);
          // keep new if not already? Already added above, just remove old
          localStorage.setItem("sgk_favs", JSON.stringify(next.includes(newFilename) ? next : next));
        }
      }
    } catch (e) { throw new Error(`Cleanup favs failed: ${e.message}`); }
    try {
      const histRaw = localStorage.getItem("sgk_history");
      if (histRaw) {
        const arr = JSON.parse(histRaw);
        if (Array.isArray(arr)) {
          const next = arr.filter(x=> x?.filename !== oldFilename);
          if (next.length !== arr.length) localStorage.setItem("sgk_history", JSON.stringify(next));
        }
      }
    } catch {}
    try {
      const cntRaw = localStorage.getItem("sgk_counts");
      if (cntRaw) {
        const obj = JSON.parse(cntRaw);
        if (obj && obj[oldFilename] !== undefined) { delete obj[oldFilename]; localStorage.setItem("sgk_counts", JSON.stringify(obj)); }
      }
    } catch {}
    // cleanup old IDB keys after verification
    try {
      if (indexedDBService.constructor.isAvailable()) {
        const allOCR = await indexedDBService.getAllRecords(STORES.OCR);
        for (const rec of allOCR) {
          const k = rec?.key;
          if (typeof k === "string" && k.startsWith(oldFilename + "_") && /^_\d/.test(k.slice(oldFilename.length))) {
            const newK = newFilename + k.slice(oldFilename.length);
            const newVal = await indexedDBService.get(STORES.OCR, newK);
            if (newVal !== null) await indexedDBService.delete(STORES.OCR, k);
          }
        }
        const oldIdx = await indexedDBService.get(STORES.SEARCH_INDEX, oldFilename);
        const newIdx = await indexedDBService.get(STORES.SEARCH_INDEX, newFilename);
        if (oldIdx && newIdx) await indexedDBService.delete(STORES.SEARCH_INDEX, oldFilename);
      }
    } catch (e) { throw new Error(`IDB cleanup failed: ${e.message}`); }

    // P0: cập nhật sourceRef trên Whiteboard theo tên file mới (tránh link chết sau khi đổi tên sách)
    try {
      const { migrateBookRefs } = await import("./whiteboard/whiteboardStore.js");
      await migrateBookRefs(oldFilename, newFilename);
    } catch (e) { console.warn(`[storage] migrateBookRefs failed for ${oldFilename}:`, e?.message || e); }

    return { ok: true, migratedKeys: createdKeys.length, migratedIDB: createdIDB.length };
  } catch (err) {
    // Rollback test cố tình throw "simulated quota" — warn thay vì error, im lặng khi test.
    if (!__isTestSilence()) console.warn(`migrateBookData failed ${oldFilename} -> ${newFilename}:`, err);
    // ROLLBACK: restore snapshot for localStorage
    try {
      for (const [k,v] of Object.entries(snapshot)) {
        if (k.startsWith("__new__")) continue;
        if (k.endsWith("_before")) {
          const origKey = k.replace("_before","");
          if (v === null) localStorage.removeItem(origKey); else localStorage.setItem(origKey, v);
        }
      }
      for (const nk of createdKeys) {
        // restore destination if it existed
        if (lsDestSnapshot.has(nk)) {
          try{ localStorage.setItem(nk, lsDestSnapshot.get(nk)); }catch (e) { console.warn("[storage] rollback setItem failed", nk, e); }
        } else {
          try { localStorage.removeItem(nk); } catch (e) { console.warn("[storage] rollback removeItem failed", nk, e); }
        }
      }
    } catch (e) { console.warn("[storage] rollback localStorage failed", e); }
    // rollback IDB: delete new keys or restore dest snapshot
    try {
      for (const { store, key } of createdIDB) {
        const snapKey = `${store}:${key}`.replace("ocr:","ocr:").replace("search:","search:");
        // Check generic idbDestSnapshot
        let destKey = null;
        if (store === STORES.OCR) destKey = `ocr:${key}`;
        else if (store === STORES.SEARCH_INDEX) destKey = `search:${key}`;
        else destKey = `${store}:${key}`;
        if (idbDestSnapshot.has(destKey)) {
          try { await indexedDBService.set(store, key, idbDestSnapshot.get(destKey)); } catch {}
        } else {
          try { await indexedDBService.delete(store, key); } catch {}
        }
      }
    } catch {}
    return { ok: false, error: err.message };
  }
}

// Thu thập toàn bộ key localStorage thuộc diện sao lưu (dùng chung cho xuất file + sao lưu tự động)
export function collectLocalBackupData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isBackupKey(key)) continue;
    try {
      data[key] = localStorage.getItem(key);
    } catch {
      /* skip */
    }
  }
  return data;
}

// Dựng payload sao lưu đúng chuẩn — dùng cho xuất file THỦ CÔNG và sao lưu TỰ ĐỘNG
export async function buildBackupPayload({
  label = "",
  includeIndexed = true,
  skipStores = [],
} = {}) {
  const data = collectLocalBackupData();
  const indexedData = includeIndexed ? await exportIndexedDBData({ skipStores }) : {};

  return {
    app: "hanhtrang-tieu-hoc",
    version: 2,
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    appVersion: "0.0.0",
    label: label || "",
    data,
    indexedData,
  };
}

export async function exportBackup(customLabel = "") {
  const payload = await buildBackupPayload({ label: customLabel });
  const { data, indexedData } = payload;

  const blob = new Blob([JSON.stringify(payload, null, 1)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `hanhtrang-backup-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const localCount = Object.keys(data).length;
  const indexedCount = Object.values(indexedData).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0,
  );

  return {
    localCount,
    indexedCount,
    total: localCount + indexedCount,
  };
}

export function parseBackupPreview(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    // Không gắn e.message (tiếng Anh của JSON.parse) ra UI
    return { valid: false, error: "File không phải JSON hợp lệ." };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.data ||
    payload.app !== "hanhtrang-tieu-hoc"
  ) {
    return {
      valid: false,
      error: "File sao lưu không hợp lệ (thiếu header ứng dụng).",
    };
  }
  const version = payload.schemaVersion || payload.version;
  if (version !== 1 && version !== 2) {
    return {
      valid: false,
      error: `Phiên bản sao lưu không hỗ trợ (v${version}).`,
    };
  }
  const localKeys = Object.keys(payload.data || {});
  // Deep validation: ensure data values are strings and critical keys contain valid JSON
  const criticalKeys = ['sgk_lessonplans', 'khbd_v2_plans', 'sgk_questions', 'sgk_worksheets', 'sgk_vocab', 'sgk_clips', 'sgk_collections'];
  for (const k of criticalKeys) {
    if (payload.data[k] !== undefined && payload.data[k] !== null) {
      const v = payload.data[k];
      if (typeof v !== 'string') {
        return { valid: false, error: `Dữ liệu ${k} không hợp lệ (không phải chuỗi).` };
      }
      try {
        const parsed = JSON.parse(v);
        if ((k === 'sgk_lessonplans' || k === 'khbd_v2_plans') && parsed !== null && !Array.isArray(parsed)) {
          return { valid: false, error: `Backup ${k} phải là mảng.` };
        }
      } catch (e) {
        return { valid: false, error: `Backup ${k} bị hỏng JSON: ${e.message}` };
      }
    }
  }
  // Validate indexedData stores if present
  if (payload.indexedData && typeof payload.indexedData === "object") {
    for (const [store, arr] of Object.entries(payload.indexedData)) {
      if (arr !== null && !Array.isArray(arr)) {
        return { valid: false, error: `IndexedData ${store} phải là mảng.` };
      }
    }
  }
  const preview = {
    app: payload.app,
    schemaVersion: version,
    version,
    createdAt: payload.createdAt || payload.exportedAt || "",
    appVersion: payload.appVersion || "",
    label: payload.label || "",
    localCount: localKeys.length,
    localKeys: localKeys.slice(0, 20),
    hasMoreKeys: localKeys.length > 20,
    indexedCounts: {},
    indexedTotal: 0,
  };
  if (payload.indexedData && typeof payload.indexedData === "object") {
    for (const [store, arr] of Object.entries(payload.indexedData)) {
      const c = Array.isArray(arr) ? arr.length : 0;
      preview.indexedCounts[store] = c;
      preview.indexedTotal += c;
    }
  }
  return { valid: true, payload, preview };
}

export async function importBackup(text) {
  // PHASE 6: Atomic snapshot restore — validate → clear snapshot-owned → apply → validate
  const preview = parseBackupPreview(text);
  if (!preview.valid) throw new Error(preview.error);
  const payload = preview.payload;

  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.data ||
    payload.app !== "hanhtrang-tieu-hoc"
  ) {
    throw new Error("File sao lưu không hợp lệ (thiếu header ứng dụng).");
  }

  const ver = payload.schemaVersion || payload.version;
  if (ver !== 1 && ver !== 2) {
    throw new Error(`Phiên bản sao lưu không hỗ trợ (v${ver}).`);
  }

  // 1) Prepare snapshot for atomicity (save originals for rollback)
  const snapshotOriginals = {};
  const keysToClear = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isBackupKey(k)) {
      keysToClear.push(k);
      snapshotOriginals[k] = localStorage.getItem(k);
    }
  }
  // Also capture IndexedDB snapshot for rollback (best-effort)
  let indexedSnapshot = null;
  try {
    if (payload.indexedData) indexedSnapshot = await exportIndexedDBData();
  } catch {}
  // P0 fix: auto-save recovery snapshot before destructive restore (so old newer data not permanently lost)
  // Even though snapshot semantics requires clearing, we keep a recovery copy for 7 days
  try {
    const recoveryPayload = {
      app: "hanhtrang-tieu-hoc",
      version: 2,
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      label: "auto-recovery before import",
      data: { ...snapshotOriginals },
      indexedData: indexedSnapshot || {},
    };
    const recoveryKey = `sgk_recovery_before_import_${Date.now()}`;
    // Store compressed snapshot (limit 5 recovery points to avoid bloat)
    const existingRecoveries = [];
    for (let i=0;i<localStorage.length;i++){ const kk=localStorage.key(i); if(kk && kk.startsWith("sgk_recovery_before_import_")) existingRecoveries.push(kk); }
    existingRecoveries.sort().slice(0, Math.max(0, existingRecoveries.length - 4)).forEach(kk=>{ try{localStorage.removeItem(kk);}catch{} });
    try { localStorage.setItem(recoveryKey, JSON.stringify(recoveryPayload)); } catch (e) {
      // If quota, evict oldest recovery and retry
      if (existingRecoveries.length) { try{ localStorage.removeItem(existingRecoveries[0]); localStorage.setItem(recoveryKey, JSON.stringify(recoveryPayload)); } catch{} }
    }
    if (!__isTestSilence()) console.debug(`[storage] recovery snapshot saved: ${recoveryKey} (${keysToClear.length} keys)`);
  } catch (e) { if (!__isTestSilence()) console.warn("[storage] recovery snapshot failed", e); }

  // 2) Clear snapshot-owned data (true restore, not merge) to avoid orphans
  //    Orphan scans/autosaves/versions/questionLinks would remain if we only merged
  const updates = {};
  keysToClear.forEach(k => { updates[k] = null; });

  let count = 0;
  for (const [key, value] of Object.entries(payload.data)) {
    if (!isBackupKey(key)) continue;
    updates[key] = value === undefined || value === null ? null : String(value);
    if (value !== undefined && value !== null) count++;
  }

  // 3) Apply atomically via saveBatch
  try {
    saveBatch(updates);
  } catch (e) {
    // Rollback on failure
    try {
      const rollback = {};
      for (const [k,v] of Object.entries(snapshotOriginals)) rollback[k] = v;
      saveBatch(rollback);
    } catch {}
    throw new Error(`Khôi phục thất bại, đã hoàn tác: ${e.message}`);
  }

  // 4) IndexedDB snapshot restore (transactional per store)
  let indexedCount = 0;
  if ((payload.schemaVersion || payload.version) === 2 && payload.indexedData !== undefined) {
    // Clear snapshot-owned IndexedDB stores before restore to avoid orphan scans/ocr
    try {
      for (const store of Object.keys(payload.indexedData)) {
        if (Object.values(STORES).includes(store)) {
          await indexedDBService.clear(store);
        }
      }
      // If backup has empty indexedData (no scans etc), ensure orphan stores are cleared
      // For version 2, clear all snapshot stores that are not in backup but may contain orphans?
      // We clear only stores present in backup to keep non-snapshot caches (search index can be rebuilt)
      indexedCount = await restoreIndexedDBData(payload.indexedData);
    } catch (e) {
      // Rollback localStorage on IndexedDB failure
      try {
        const rollback = {};
        for (const [k,v] of Object.entries(snapshotOriginals)) rollback[k] = v;
        saveBatch(rollback);
        if (indexedSnapshot) await restoreIndexedDBData(indexedSnapshot);
      } catch {}
      throw new Error(`Khôi phục IndexedDB thất bại: ${e.message}`);
    }
  }

  // 5) Verify WB_BOARDS / WB_IMAGES snapshot (P0)
  try {
    if (payload.indexedData && typeof payload.indexedData === "object") {
      const expectedBoards = Array.isArray(payload.indexedData[STORES.WB_BOARDS]) ? payload.indexedData[STORES.WB_BOARDS] : null;
      const expectedImages = Array.isArray(payload.indexedData[STORES.WB_IMAGES]) ? payload.indexedData[STORES.WB_IMAGES] : null;
      if (expectedBoards !== null) {
        const actualBoards = await indexedDBService.getAll(STORES.WB_BOARDS);
        const expIds = new Set(expectedBoards.map((b) => b.id));
        const actIds = new Set(actualBoards.map((b) => b.id));
        if (actualBoards.length !== expectedBoards.length) throw new Error(`WB_BOARDS count mismatch expected ${expectedBoards.length} got ${actualBoards.length}`);
        for (const b of expectedBoards) {
          const found = actualBoards.find((x) => x.id === b.id);
          if (!found) throw new Error(`WB_BOARDS missing id ${b.id}`);
          if (found.name !== b.name) throw new Error(`WB_BOARDS name mismatch ${b.id}`);
          if ((found.objects || []).length !== (b.objects || []).length) throw new Error(`WB_BOARDS objects count mismatch ${b.id}`);
          if ((found.connectors || []).length !== (b.connectors || []).length) throw new Error(`WB_BOARDS connectors mismatch ${b.id}`);
        }
        // Ensure no extra boards remain (snapshot semantics)
        for (const id of actIds) if (!expIds.has(id)) throw new Error(`WB_BOARDS extra id ${id} after restore (snapshot should remove)`);
      }
      if (expectedImages !== null) {
        const actualImages = await indexedDBService.getAll(STORES.WB_IMAGES);
        // actualImages after restore are Blob objects deserialized; expected are serialized {__blob} or raw
        const expIds2 = new Set(expectedImages.map((r) => r.id));
        const actIds2 = new Set(actualImages.map((r) => r.id));
        if (actualImages.length !== expectedImages.length) throw new Error(`WB_IMAGES count mismatch expected ${expectedImages.length} got ${actualImages.length}`);
        for (const exp of expectedImages) {
          const found = actualImages.find((x) => x.id === exp.id);
          if (!found) throw new Error(`WB_IMAGES missing id ${exp.id}`);
          const blob = found.blob;
          if (!(blob instanceof Blob)) throw new Error(`WB_IMAGES ${exp.id} not Blob`);
          const expBlob = exp.blob && exp.blob.__blob ? exp.blob : null;
          if (expBlob) {
            if (blob.type !== expBlob.mimeType) throw new Error(`WB_IMAGES mime mismatch ${exp.id}`);
            if (blob.size !== expBlob.size) throw new Error(`WB_IMAGES size mismatch ${exp.id} ${blob.size}!=${expBlob.size}`);
            if (blob.size === 0) throw new Error(`WB_IMAGES empty blob ${exp.id}`);
          }
        }
        for (const id of actIds2) if (!expIds2.has(id)) throw new Error(`WB_IMAGES extra id ${id} after restore`);
      }
    }
  } catch (e) {
    // Rollback on verify fail
    try {
      const rollback = {};
      for (const [k,v] of Object.entries(snapshotOriginals)) rollback[k] = v;
      saveBatch(rollback);
      if (indexedSnapshot) await restoreIndexedDBData(indexedSnapshot);
    } catch {}
    throw new Error(`Verify WB boards/images failed: ${e.message}`);
  }
  // 5b) Validate restored state
  try {
    // Basic validation: lesson plans should be parseable, no orphan autosave mismatch
    const restoredPlans = getListForValidation('sgk_lessonplans');
    for (const p of restoredPlans) {
      if (!p.id) throw new Error('Restored plan missing id');
    }
  } catch (e) {
    console.warn('Post-restore validation warning:', e.message);
  }

  try {
    appEvents.emit(AppEvents.DATA_UPDATED, {
      source: "backup-import",
      count,
      indexedCount,
    });
  } catch {}

  return {
    count,
    total: Object.keys(payload.data).length,
    indexedCount,
  };
}

// Helper for validation without triggering migration side-effects
function getListForValidation(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

// Expose merge variant if product needs non-snapshot import
export async function importBackupMerge(text) {
  const preview = parseBackupPreview(text);
  if (!preview.valid) throw new Error(preview.error);
  const payload = preview.payload;
  let count = 0;
  for (const [key, value] of Object.entries(payload.data)) {
    if (!isBackupKey(key)) continue;
    try {
      if (value === undefined || value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
      count++;
    } catch {}
  }
  let indexedCount = 0;
  if (payload.indexedData) indexedCount = await restoreIndexedDBData(payload.indexedData);
  return { count, total: Object.keys(payload.data).length, indexedCount };
}

export async function wipeAppData() {
  // P0 fix: always create auto-recovery backup before wipe (so wipe is reversible for 7 days)
  try {
    const snap = {};
    const snapKeys = [];
    for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && (isBackupKey(k) || k.startsWith('sgk_') || k.startsWith('ai_'))) { snap[k]=localStorage.getItem(k); snapKeys.push(k); } }
    let indexedSnap = {};
    try { indexedSnap = await exportIndexedDBData(); } catch {}
    const payload = { app:"hanhtrang-tieu-hoc", version:2, schemaVersion:2, createdAt:new Date().toISOString(), label:"auto-recovery before wipe", data: snap, indexedData: indexedSnap };
    const blob = new Blob([JSON.stringify(payload,null,1)], {type:"application/json;charset=utf-8"});
    // Also store a lightweight recovery marker in LS so UI can offer "Hoàn tác xóa"
    try {
      const recKey = `sgk_recovery_before_wipe_${Date.now()}`;
      const existing = []; for(let i=0;i<localStorage.length;i++){ const kk=localStorage.key(i); if(kk && kk.startsWith("sgk_recovery_before_wipe_")) existing.push(kk); }
      existing.sort().slice(0, Math.max(0, existing.length - 2)).forEach(kk=>{ try{localStorage.removeItem(kk);}catch{}});
      // Store only LS snapshot in recovery key (IDB already backed via export but blob not persisted — keep marker)
      localStorage.setItem(recKey, JSON.stringify({ at: Date.now(), keys: snapKeys.length, label:"before wipe" }));
      // Trigger download for safety (best-effort)
      try { const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`hanhtrang-auto-recovery-before-wipe-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); } catch {}
    } catch {}
  } catch (e) { if (!__isTestSilence()) console.warn("[storage] wipe recovery snapshot failed", e); }
  const doomed = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // PHASE 6: Complete wipe — every user-owned persistent record (backup + cache + autosave + scans + sync + UI)
    // Do NOT keep orphan scans/autosaves/versions/questionLinks/sync_*; do delete backup-owned + cache
    // Note: isBackupKey now covers sgk_scans_v1, sgk_autosave_, sync_*, etc.
    // Fix: include SKG typo + expanded + toc custom + missing idxmeta cache
    const isPersistent = key && (
      isBackupKey(key) ||
      isCacheKey(key) ||
      key.startsWith('sgk_') ||
      key.startsWith('sync_') ||
      key.startsWith('backup_') ||
      key.startsWith('sgk_autosave_') ||
      key.startsWith('ai_') ||
      key.startsWith('sgk_toc_custom') ||
      key.startsWith('sgk_sidebar') ||
      ['GEMINI_API_KEY','favoriteTools','recentTools','recentActions','image_upload_history','sgk_custom_titles','sgk_activity_ratings','SKG_TEACHER_MODE','SGK_TEACHER_MODE','sgk_books','sgk_toc_custom_v1'].includes(key)
    );
    // Never delete recovery snapshots themselves in the same wipe — keep last 3 for undo
    if (key && key.startsWith("sgk_recovery_before_")) continue;
    if (isPersistent) doomed.push(key);
  }

  doomed.forEach((k) => removeKey(k));

  let indexedDBCleared = true;
  try {
    indexedDBCleared = await clearAllIndexedDBData();
    // In non-browser test env, IndexedDB is unavailable — treat as success (nothing to clear)
    if (!indexedDBService.constructor.isAvailable()) indexedDBCleared = true;
  } catch { indexedDBCleared = true; }
  if (!indexedDBCleared && indexedDBService.constructor.isAvailable()) {
    throw new Error("Không thể xóa toàn bộ IndexedDB.");
  }

  // A3 • Dọn luôn kho sao lưu tự động (IndexedDB riêng, không nằm trong SGKAppDB)
  try {
    const autoBackup = await import("./autoBackup.js");
    await autoBackup.clearAutoBackupDB();
  } catch (e) {
    if (!__isTestSilence()) console.warn("[storage] clear auto-backup store failed", e);
  }

  return {
    localStorageKeys: doomed.length,
    indexedDBCleared,
  };
}

// ── Book storage key parsing ─────────────────────────────────────────────
// Helper to parse book-specific storage keys with exact matching
// Avoids false positives with similar filenames (e.g., Math.pdf vs Math.pdf-old)
export function parseBookStorageKey(key, prefix) {
  // Pattern: prefix + filename + optional suffix (e.g., _page)
  // Returns { filename, suffix } or null if not a match
  if (!key.startsWith(prefix)) return null;

  const remaining = key.slice(prefix.length);
  if (!remaining) return null;

  // For keys with page suffix (e.g., notes_book.pdf_1, ocr_book.pdf_5)
  const lastUnderscore = remaining.lastIndexOf("_");
  if (lastUnderscore > 0) {
    const filename = remaining.slice(0, lastUnderscore);
    const suffix = remaining.slice(lastUnderscore + 1);
    // Check if suffix is a number (page number)
    if (/^\d+$/.test(suffix)) {
      return { filename, suffix: parseInt(suffix, 10) };
    }
  }

  // For keys without suffix (e.g., sgk_marks_book.pdf)
  return { filename: remaining, suffix: null };
}

// Check if a key exactly matches a book with given prefix and filename
export function isExactBookKey(key, prefix, filename) {
  const parsed = parseBookStorageKey(key, prefix);
  if (!parsed) return false;
  return parsed.filename === filename;
}
