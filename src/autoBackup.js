// ── A3 • SAO LƯU TỰ ĐỘNG (hàng tuần) ─────────────────────────────────────
// Snapshot lưu trong IndexedDB RIÊNG ("SGKAutoBackup") — không đụng SGKAppDB
// nên không làm đổi version DB chính, và không bao giờ bị lẫn vào file sao lưu
// thủ công (tránh "sao lưu chứa sao lưu" phình to vô hạn).
//
// Nội dung snapshot = mọi key localStorage thuộc diện sao lưu + IndexedDB dạng
// chữ (bỏ ảnh wb/note/scan để giữ file nhỏ). Format giống hệt file xuất tay,
// nên đọc được bằng parseBackupPreview()/importBackup().

import { buildBackupPayload } from "./storage.js";
import { safeGetJSON, safeSetJSON } from "./safeStorage.js";
import { loadSettings } from "./settingsStore.js";

const DB_NAME = "SGKAutoBackup";
const DB_VERSION = 1;
const STORE = "snapshots";
const META_KEY = "sgk_autobackup_meta";
const DAY_MS = 86400000;

// Ảnh blob có thể nặng hàng chục MB — không đưa vào bản sao lưu tự động
const SKIP_STORES = ["wb_images", "note_images", "scan_assets"];

const FREQ_DAYS = { daily: 1, weekly: 7, monthly: 30 };
const DEFAULT_KEEP = 4;

function silence() {
  try {
    if (globalThis.__SGK_TEST__ === true) return true;
    if (typeof process !== "undefined" && process?.env?.SGK_SILENCE_TEST_LOGS === "1") return true;
  } catch {}
  return false;
}

function hasIDB() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

let _dbPromise = null;

function openDB() {
  if (!hasIDB()) return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return _dbPromise;
}

/** Chạy 1 request ghi trong transaction, resolve khi transaction complete. */
function tx(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const req = fn(store);
      let result;
      if (req && typeof req === "object" && "onsuccess" in req) {
        req.onsuccess = () => { result = req.result; };
      }
      t.oncomplete = () => resolve(result);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function getAutoBackupMeta() {
  const meta = safeGetJSON(META_KEY, null, (d) => d && typeof d === "object" && !Array.isArray(d));
  if (!meta || !Array.isArray(meta.snapshots)) {
    return { lastRun: null, lastSuccess: null, lastError: null, snapshots: [] };
  }
  return {
    lastRun: meta.lastRun || null,
    lastSuccess: meta.lastSuccess || null,
    lastError: meta.lastError || null,
    snapshots: meta.snapshots.filter((s) => s && typeof s === "object"),
  };
}

function saveMeta(meta) {
  return safeSetJSON(META_KEY, meta);
}

/** Bao lâu chạy 1 lần — Cài đặt → Sao lưu → autoBackupFrequency (daily/weekly/monthly) */
export function autoBackupIntervalMs(settings) {
  const freq = String(settings?.backup?.autoBackupFrequency || "weekly").toLowerCase();
  const days = FREQ_DAYS[freq] || 7;
  return days * DAY_MS;
}

export function isAutoBackupDue(settings) {
  if (!settings?.backup?.autoBackup) return false;
  const meta = getAutoBackupMeta();
  const last = Number(meta.lastSuccess) || 0;
  if (!last) return true;
  return Date.now() - last >= autoBackupIntervalMs(settings);
}

/**
 * Chạy 1 lần sao lưu tự động.
 * @returns {Promise<{ok:boolean, id?:string, bytes?:number, error?:string}>}
 */
export async function runAutoBackup(reason = "scheduled") {
  const startedAt = Date.now();
  const meta = getAutoBackupMeta();
  meta.lastRun = startedAt;

  try {
    const settings = loadSettings();
    const keep = Math.max(1, Number(settings?.backup?.keepBackups) || DEFAULT_KEEP);

    const payload = await buildBackupPayload({
      label: `auto:${reason}`,
      skipStores: SKIP_STORES,
    });
    const text = JSON.stringify(payload, null, 1);

    const db = await openDB();
    if (!db) {
      meta.lastError = "NO_IDB";
      saveMeta(meta);
      return { ok: false, error: "NO_IDB" };
    }

    const record = {
      id: `ab_${startedAt}`,
      createdAt: startedAt,
      label: payload.label,
      bytes: text.length,
      localCount: Object.keys(payload.data || {}).length,
      payload: text,
    };
    await tx(db, "readwrite", (store) => store.put(record));

    meta.lastSuccess = startedAt;
    meta.lastError = null;
    meta.snapshots = [
      { id: record.id, createdAt: record.createdAt, bytes: record.bytes, localCount: record.localCount },
      ...(meta.snapshots || []).slice(0, Math.max(0, keep - 1)),
    ];
    const dropped = (meta.snapshots || []).slice(keep);
    meta.snapshots = (meta.snapshots || []).slice(0, keep);

    for (const d of dropped) {
      try { await tx(db, "readwrite", (store) => store.delete(d.id)); } catch {}
    }

    const saved = saveMeta(meta);
    if (saved && saved.ok === false) {
      if (!silence()) console.warn("[autoBackup] meta not persisted — snapshot still in IDB", saved.error);
    }
    if (!silence()) console.info(`[autoBackup] ${reason}: ${record.bytes} bytes, ${record.localCount} keys`);
    return { ok: true, id: record.id, bytes: record.bytes };
  } catch (err) {
    meta.lastError = String(err?.message || err);
    try { saveMeta(meta); } catch {}
    if (!silence()) console.warn("[autoBackup] failed", err);
    return { ok: false, error: String(err?.message || err) };
  }
}

export function listAutoBackupSnapshots() {
  return getAutoBackupMeta().snapshots;
}

export async function getAutoBackupPayload(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, "readonly");
      const req = t.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result?.payload || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteAutoBackup(id) {
  const db = await openDB();
  if (!db) return false;
  await tx(db, "readwrite", (store) => store.delete(id));
  const meta = getAutoBackupMeta();
  meta.snapshots = (meta.snapshots || []).filter((s) => s.id !== id);
  saveMeta(meta);
  return true;
}

export async function clearAutoBackupDB() {
  const db = await openDB();
  if (db) await tx(db, "readwrite", (store) => store.clear());
  try { saveMeta({ lastRun: null, lastSuccess: null, lastError: null, snapshots: [] }); } catch {}
  return true;
}
