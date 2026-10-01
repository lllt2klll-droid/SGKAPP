// ── Unified Storage Adapter ───────────────────────────────────────────
// Contract: storage.get(domain,key) / set / remove / list  + domain helpers
// Internally delegates to safeStorage (localStorage) or indexedDB via
// canonical strategy per entity. Component code never needs to know where
// data lives.
//
// Canonical map (per TASK §8):
//   clips / refs / concepts / evidence / scans / OCR / searchIndex → IndexedDB canonical, localStorage legacy/fallback
//   bookmarks / vocab / notes / marks / collections / lessonPlans / activities / worksheets / questions / missions / settings / whiteboard → localStorage canonical
// For merged entities, read merges IDB+LS (IDB wins) and write goes to canonical.
//
// Backward-compat: re-exports legacy saveJSON/readJSON etc so old callers
// keep working while new code migrates to contract.

import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove, listKeys } from "../safeStorage.js";
import { readJSON as _readJSON_legacy, saveJSON as _saveJSON_legacy } from "../storage.js";
import indexedDBService, { STORES } from "../indexedDB.js";
import { isBackupKey, isCacheKey, STORAGE_KEYS } from "./storageKeys.js";
import { appEvents, AppEvents, DataDomains } from "./appEvents.js";

// ── Domain → storage mapping ──
const DOMAIN_CONFIG = {
  // localStorage domains — single key
  settings: { adapter: "ls", key: STORAGE_KEYS.SETTINGS },
  bookmarks: { adapter: "ls", key: STORAGE_KEYS.BOOKMARKS },
  bookmarkLabels: { adapter: "ls", key: STORAGE_KEYS.BOOKMARK_LABELS },
  vocab: { adapter: "ls", key: STORAGE_KEYS.VOCAB },
  quizHistory: { adapter: "ls", key: STORAGE_KEYS.QUIZ_HISTORY },
  collections: { adapter: "ls", key: STORAGE_KEYS.COLLECTIONS },
  lessonPlans: { adapter: "ls", key: STORAGE_KEYS.LESSON_PLANS },
  activities: { adapter: "ls", key: STORAGE_KEYS.ACTIVITIES },
  worksheets: { adapter: "ls", key: STORAGE_KEYS.WORKSHEETS },
  questions: { adapter: "ls", key: STORAGE_KEYS.QUESTIONS },
  ideas: { adapter: "ls", key: STORAGE_KEYS.IDEAS },
  tasks: { adapter: "ls", key: STORAGE_KEYS.TASKS },
  internship: { adapter: "ls", key: STORAGE_KEYS.INTERNSHIP },
  webtools: { adapter: "ls", key: STORAGE_KEYS.WEB_TOOLS },
  customTitles: { adapter: "ls", key: STORAGE_KEYS.CUSTOM_TITLES },
  activityRatings: { adapter: "ls", key: STORAGE_KEYS.ACTIVITY_RATINGS },
  favs: { adapter: "ls", key: STORAGE_KEYS.FAVS },
  history: { adapter: "ls", key: STORAGE_KEYS.HISTORY },
  counts: { adapter: "ls", key: STORAGE_KEYS.COUNTS },
  // per-file prefix domains (stored as separate keys per file, not single JSON)
  marks: { adapter: "ls-prefix", prefix: STORAGE_KEYS.MARKS_PREFIX },
  teacherNotes: { adapter: "ls-prefix", prefix: STORAGE_KEYS.TEACHER_NOTES_PREFIX },
  // whiteboard boards — IDB canonical after Phase3, LS legacy fallback only
  whiteboard: { adapter: "idb", idbStore: STORES.WB_BOARDS },
  scans: { adapter: "hybrid", lsKey: STORAGE_KEYS.SCANS, idbStore: STORES.SCAN },
  // hybrid (IndexedDB canonical + LS fallback)
  clips: { adapter: "hybrid", lsKey: STORAGE_KEYS.CLIPS, idbStore: STORES.CLIPS },
  refs: { adapter: "hybrid", lsKey: STORAGE_KEYS.REFS, idbStore: STORES.REFS },
  concepts: { adapter: "hybrid", lsKey: STORAGE_KEYS.CONCEPTS, idbStore: STORES.CONCEPTS },
  evidence: { adapter: "hybrid", lsKey: STORAGE_KEYS.EVIDENCE, idbStore: STORES.EVIDENCE },
  ocr: { adapter: "hybrid", idbStore: STORES.OCR },
  searchIndex: { adapter: "hybrid", idbStore: STORES.SEARCH_INDEX },
};

function emit(domain, action, id) {
  try { appEvents.emitDataUpdated({ domain, action, id }); } catch {}
}

// ── Migration version single source — CURRENT=3, v2 requires v3 migration (P0) ──
const CURRENT_STORAGE_MIGRATION_VERSION = "3";
function isHybridMigrated() {
  try {
    const v = safeGetString(STORAGE_KEYS.STORAGE_MIGRATION_VERSION, null);
    if (v === CURRENT_STORAGE_MIGRATION_VERSION) return true;
    if (v !== null && v > CURRENT_STORAGE_MIGRATION_VERSION) return true; // no downgrade
    // v === "2" or "1" or missing => migration required, NOT migrated
    // Legacy key v2: also requires v3 migration, do NOT treat as migrated
  } catch {}
  return false;
}
function isStorageMigrationComplete() { return isHybridMigrated(); }

// ── Low-level LS contract ──
export function lsGet(key, fallback=null, validator=null) { return safeGetJSON(key, fallback, validator); }
export function lsSet(key, value) {
  const r = safeSetJSON(key, value);
  if (!r.ok) return r;
  return r;
}
export function lsRemove(key) { return safeRemove(key); }

// ── Domain contract ──
export async function domainGet(domain, id = null) {
  const cfg = DOMAIN_CONFIG[domain];
  if (!cfg) throw new Error(`Unknown domain: ${domain}`);
  if (cfg.adapter === "ls-prefix") {
    if (id) return safeGetJSON(`${cfg.prefix}${id}`, null);
    // list all per-file keys with this prefix (for diagnostics / orphan check)
    const out = [];
    try {
      for (const k of listKeys()) {
        if (k && k.startsWith(cfg.prefix)) out.push({ key: k, data: safeGetJSON(k, null) });
      }
    } catch {}
    return out;
  }
  if (cfg.adapter === "idb") {
    const idbAvailable = (() => { try { return indexedDBService.constructor.isAvailable(); } catch { return false; } })();
    if (idbAvailable) {
      if (id) { try { const v = await indexedDBService.get(cfg.idbStore, id); if (v) return v; } catch {} }
      else { try { const all = await indexedDBService.getAll(cfg.idbStore); return Array.isArray(all) ? all : []; } catch {} }
    }
    // Fallback LS legacy only when IDB unavailable
    if (cfg.idbStore === STORES.WB_BOARDS) {
      if (id) return safeGetJSON(`${STORAGE_KEYS.WB_BOARD_PREFIX}${id}`, null);
      return safeGetJSON(STORAGE_KEYS.WB_INDEX, []);
    }
    return null;
  }
  if (cfg.adapter === "ls") {
    if (cfg.prefix) {
      // whiteboard legacy fallback (should not be used after migration)
      if (id) return safeGetJSON(`${cfg.prefix}${id}`, null);
      return safeGetJSON(cfg.index, []);
    }
    return safeGetJSON(cfg.key, null);
  }
  if (cfg.adapter === "hybrid") {
    const idbAvailable = (() => { try { return indexedDBService.constructor.isAvailable(); } catch { return false; } })();
    const migrated = isHybridMigrated();
    if (cfg.lsKey && !id) {
      // TASK 3-4: IDB canonical after migration — no merge
      if (idbAvailable && migrated) {
        try { const idb = await indexedDBService.getAll(cfg.idbStore); return Array.isArray(idb) ? idb : []; } catch { return []; }
      }
      if (idbAvailable) {
        // Before migration: merge LS+IDB (IDB wins) for backward compat
        let ls = [];
        try { ls = safeGetJSON(cfg.lsKey, []); if (!Array.isArray(ls)) ls = []; } catch { ls = []; }
        let idb = [];
        try { idb = await indexedDBService.getAll(cfg.idbStore); } catch {}
        const map = new Map();
        for (const it of ls) if (it?.id) map.set(it.id, it);
        for (const it of idb) if (it?.id) map.set(it.id, it);
        const noId = ls.filter(x=> !x?.id);
        return [...map.values(), ...noId];
      }
      // IDB unavailable: LS fallback only
      try { const ls = safeGetJSON(cfg.lsKey, []); return Array.isArray(ls) ? ls : []; } catch { return []; }
    }
    if (cfg.lsKey && id) {
      if (idbAvailable && migrated) {
        try { const v = await indexedDBService.get(cfg.idbStore, id); return v || null; } catch { return null; }
      }
      if (idbAvailable) {
        try { const v = await indexedDBService.get(cfg.idbStore, id); if (v) return v; } catch {}
      }
      // Fallback LS only when IDB unavailable or not migrated or IDB miss before migration
      try { const ls = safeGetJSON(cfg.lsKey, []); return (Array.isArray(ls) ? ls.find(x=> x.id===id) : null) || null; } catch { return null; }
    }
    // OCR / searchIndex by composite key handled elsewhere
    if (domain === "searchIndex" && id) {
      if (idbAvailable) { try { const v = await indexedDBService.get(STORES.SEARCH_INDEX, id); if (v) return v; } catch {} }
      // Fallback LS only when IDB unavailable or miss before migration
      if (!migrated || !idbAvailable) return _readJSON_legacy(`sgk_idx_${id}`, null);
      return null;
    }
  }
  return null;
}

export async function domainSet(domain, id, value) {
  const cfg = DOMAIN_CONFIG[domain];
  if (!cfg) throw new Error(`Unknown domain: ${domain}`);
  if (cfg.adapter === "idb") {
    const idbAvailable = (() => { try { return indexedDBService.constructor.isAvailable(); } catch { return false; } })();
    if (idbAvailable) {
      let ok = false;
      try { ok = await indexedDBService.set(cfg.idbStore, id || value.id, value); } catch (e) { console.warn(`[storageAdapter] IDB set failed ${domain}`, e); ok = false; }
      if (ok) { emit(domain, "upsert", id || value.id); return true; }
      console.error(`[storageAdapter] IDB write failed for ${domain}, no LS fallback after migration`);
      return false;
    }
    // Fallback LS only when IDB unavailable and not migrated
    if (cfg.idbStore === STORES.WB_BOARDS) {
      const boardId = id || value.id;
      const r = safeSetJSON(`${STORAGE_KEYS.WB_BOARD_PREFIX}${boardId}`, value);
      if (r.ok) { try { const idx = safeGetJSON(STORAGE_KEYS.WB_INDEX, []); const arr = Array.isArray(idx)?idx:[]; const i=arr.findIndex(e=>e.id===boardId); const entry={id:boardId,name:value.name,createdAt:value.createdAt,updatedAt:value.updatedAt}; if(i>=0) arr[i]=entry; else arr.unshift(entry); safeSetJSON(STORAGE_KEYS.WB_INDEX, arr); } catch {} emit(domain, "upsert", boardId); return true; }
      return false;
    }
    return false;
  }
  if (cfg.adapter === "ls") {
    if (cfg.prefix && id) {
      const r = safeSetJSON(`${cfg.prefix}${id}`, value);
      if (r.ok) emit(domain, "upsert", id);
      return r.ok;
    }
    if (cfg.key) {
      const r = safeSetJSON(cfg.key, value);
      if (r.ok) emit(domain, Array.isArray(value) ? "set" : "upsert", id);
      return r.ok;
    }
  }
  if (cfg.adapter === "hybrid" && cfg.lsKey) {
    const isScans = cfg.lsKey === STORAGE_KEYS.SCANS;
    const isMigrated = isHybridMigrated();
    const idbAvailable = (() => { try { return indexedDBService.constructor.isAvailable(); } catch { return false; } })();
    if (idbAvailable) {
      let idbSuccess = false;
      try { const r = await indexedDBService.set(cfg.idbStore, id, value); idbSuccess = !!r; } catch (e) { console.warn(`[storageAdapter] IDB set failed ${domain}/${id}`, e); idbSuccess = false; }
      if (idbSuccess) {
        if (isMigrated && !isScans) { emit(domain, "upsert", id); return true; }
      } else {
        // IDB failed — fallback only if not migrated (legacy) or scans
        if (isMigrated && !isScans) { console.error(`[storageAdapter] IDB write failed and no LS fallback for migrated ${domain}`); return false; }
        // fall through to LS fallback
      }
      // Legacy LS sync until migration (or scans thumb)
      if (!isMigrated || isScans) {
        try {
          const ls = safeGetJSON(cfg.lsKey, []);
          const arr = Array.isArray(ls) ? ls : [];
          const idx = arr.findIndex(x=> x.id===id);
          const next = idx>=0 ? arr.map((x,i)=> i===idx ? value : x) : [value, ...arr];
          const r2 = safeSetJSON(cfg.lsKey, next);
          if (!r2.ok) { console.error(`[storageAdapter] LS fallback failed ${domain}/${id}`, r2.message); if (!idbSuccess) return false; }
        } catch (e) { if (!idbSuccess) return false; }
      }
      emit(domain, "upsert", id);
      return idbSuccess || (!isMigrated || isScans);
    } else {
      // IDB unavailable — LS fallback only (legacy)
      try {
        const ls = safeGetJSON(cfg.lsKey, []);
        const arr = Array.isArray(ls) ? ls : [];
        const idx = arr.findIndex(x=> x.id===id);
        const next = idx>=0 ? arr.map((x,i)=> i===idx ? value : x) : [value, ...arr];
        const r = safeSetJSON(cfg.lsKey, next);
        if (!r.ok) return false;
      } catch { return false; }
      emit(domain, "upsert", id);
      return true;
    }
  }
  return false;
}

export async function domainRemove(domain, id) {
  const cfg = DOMAIN_CONFIG[domain];
  if (!cfg) throw new Error(`Unknown domain: ${domain}`);
  if (cfg.adapter === "idb") {
    const idbAvailable = (() => { try { return indexedDBService.constructor.isAvailable(); } catch { return false; } })();
    if (idbAvailable) {
      let ok = false;
      try { ok = await indexedDBService.delete(cfg.idbStore, id); } catch (e) { console.warn(`[storageAdapter] IDB delete failed ${domain}/${id}`, e); ok = false; }
      if (ok) { emit(domain, "deleted", id); return true; }
      console.error(`[storageAdapter] IDB delete failed for ${domain}/${id}`);
      return false;
    }
    // Fallback LS when IDB unavailable
    if (cfg.idbStore === STORES.WB_BOARDS) {
      safeRemove(`${STORAGE_KEYS.WB_BOARD_PREFIX}${id}`);
      try { const idx = safeGetJSON(STORAGE_KEYS.WB_INDEX, []); if (Array.isArray(idx)) safeSetJSON(STORAGE_KEYS.WB_INDEX, idx.filter(e=> e.id!==id)); } catch {}
      emit(domain, "deleted", id);
      return true;
    }
    return false;
  }
  if (cfg.adapter === "ls-prefix") {
    safeRemove(`${cfg.prefix}${id}`);
    emit(domain, "deleted", id);
    return true;
  }
  if (cfg.adapter === "ls" && cfg.prefix) {
    safeRemove(`${cfg.prefix}${id}`);
    try {
      const idx = safeGetJSON(cfg.index, []);
      if (Array.isArray(idx)) safeSetJSON(cfg.index, idx.filter(e=> e.id!==id));
    } catch {}
    emit(domain, "deleted", id);
    return true;
  }
  if (cfg.adapter === "hybrid" && cfg.lsKey) {
    if (indexedDBService.constructor.isAvailable()) { try { await indexedDBService.delete(cfg.idbStore, id); } catch {} }
    try {
      const ls = safeGetJSON(cfg.lsKey, []);
      if (Array.isArray(ls)) safeSetJSON(cfg.lsKey, ls.filter(x=> x.id!==id));
    } catch {}
    emit(domain, "deleted", id);
    return true;
  }
  return false;
}

export async function domainList(domain) {
  const v = await domainGet(domain, null);
  return Array.isArray(v) ? v : [];
}

// ── Legacy re-exports (so old imports keep working) ──
export { isBackupKey, isCacheKey, STORAGE_KEYS };
export const storage = {
  get: domainGet,
  set: domainSet,
  remove: domainRemove,
  list: domainList,
  lsGet, lsSet, lsRemove,
  isBackupKey, isCacheKey,
};
export default storage;
