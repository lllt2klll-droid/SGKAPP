// ─── Whiteboard Image Store — Blob trong IndexedDB, board JSON chỉ lưu imageId ───
// Unified into central SGKAppDB (STORES.WB_IMAGES) for backup/wipe coverage.
// Keeps legacy SGKWhiteboardDB fallback + one-time migration.
import indexedDBService, { STORES } from "../indexedDB.js";

const LEGACY_DB_NAME = "SGKWhiteboardDB";
const LEGACY_STORE = "wb_images";
const CENTRAL_STORE = STORES.WB_IMAGES;

function openLegacyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _migrated = false;
let _migratePromise = null;
async function migrateLegacyIfNeeded() {
  if (_migrated) return;
  if (_migratePromise) { try { await _migratePromise; } catch {} return; }
  _migratePromise = (async () => {
  try {
    if (!indexedDBService.constructor.isAvailable()) return;
    // Try legacy DB
    let legacyDb = null;
    try { legacyDb = await openLegacyDB(); } catch { return; }
    const legacyRecs = await new Promise((res) => {
      try {
        const tx = legacyDb.transaction(LEGACY_STORE, "readonly");
        const req = tx.objectStore(LEGACY_STORE).getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      } catch { res([]); }
    });
    legacyDb.close();
    if (!legacyRecs.length) return;
    // Migrate each to central
    for (const rec of legacyRecs) {
      if (!rec?.id || !rec?.blob) continue;
      try {
        const existing = await indexedDBService.get(CENTRAL_STORE, rec.id);
        if (existing) continue;
        await indexedDBService.set(CENTRAL_STORE, rec.id, { id: rec.id, blob: rec.blob, createdAt: rec.createdAt || Date.now() });
      } catch {}
    }
    // Best-effort clear legacy after success
    try {
      const db2 = await openLegacyDB();
      await new Promise((res) => {
        try {
          const tx = db2.transaction(LEGACY_STORE, "readwrite");
          tx.objectStore(LEGACY_STORE).clear();
          tx.oncomplete = () => res();
          tx.onerror = () => res();
        } catch { res(); }
      });
      db2.close();
    } catch {}
  } catch {}
  })();
  try { await _migratePromise; } catch {}
  _migrated = true;
}

export async function saveImageBlob(blob) {
  await migrateLegacyIfNeeded();
  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  // Primary: central DB
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const ok = await indexedDBService.set(CENTRAL_STORE, id, { id, blob, createdAt: Date.now() });
      if (ok) return id;
    } catch {}
  }
  // Fallback: legacy DB
  const db = await openLegacyDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(LEGACY_STORE, "readwrite");
    tx.objectStore(LEGACY_STORE).put({ id, blob, createdAt: Date.now() });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
  return id;
}

export async function getImageBlob(id) {
  if (!id) return null;
  await migrateLegacyIfNeeded();
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const rec = await indexedDBService.get(CENTRAL_STORE, id);
      if (rec?.blob) return rec.blob;
      if (rec && rec instanceof Blob) return rec; // if stored raw
    } catch {}
  }
  // Fallback legacy
  try {
    const db = await openLegacyDB();
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction(LEGACY_STORE, "readonly");
      const req = tx.objectStore(LEGACY_STORE).get(id);
      req.onsuccess = () => res(req.result?.blob || null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return blob;
  } catch { return null; }
}

export async function deleteImageBlob(id) {
  await migrateLegacyIfNeeded();
  if (indexedDBService.constructor.isAvailable()) {
    try { await indexedDBService.delete(CENTRAL_STORE, id); } catch {}
  }
  try {
    const db = await openLegacyDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(LEGACY_STORE, "readwrite");
      tx.objectStore(LEGACY_STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {}
}

export function blobToObjectURL(blob) {
  return URL.createObjectURL(blob);
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error || new Error("read blob failed"));
      r.readAsDataURL(blob);
    } catch (e) { reject(e); }
  });
}

/**
 * Xóa blob CHỈ khi không còn board nào tham chiếu (chống xóa nhầm ảnh dùng chung
 * giữa board gốc + board nhân bản — cả 2 giữ cùng imageId).
 * @param {string} id imageId cần xóa
 * @param {Array} boards mọi board để quét (mỗi board có .objects[].imageId)
 * @param {string|null} excludeBoardId board sắp thay ảnh (vẫn tính là còn dùng nếu board khác giữ)
 * @returns {Promise<boolean>} true nếu đã xóa, false nếu còn được tham chiếu
 */
export async function deleteImageBlobIfOrphan(id, boards, excludeBoardId = null, excludeObjectId = null) {
  if (!id) return false;
  try {
    const list = Array.isArray(boards) ? boards : [];
    for (const b of list) {
      if (!b || !Array.isArray(b.objects)) continue;
      if (excludeBoardId && b.id === excludeBoardId) {
        // board đang thay ảnh: chỉ coi là còn dùng nếu object KHÁC vẫn giữ imageId
        const stillUsed = b.objects.some((o) => o && o.imageId === id && o.id !== excludeObjectId);
        if (stillUsed) return false;
        continue;
      }
      if (b.objects.some((o) => o && o.imageId === id)) return false;
    }
  } catch {}
  await deleteImageBlob(id);
  return true;
}

// ── Garbage collection: xoá blob không còn board nào tham chiếu ───
// Board có thể share imageId (duplicate board) → không được xoá theo board,
// phải scan toàn bộ board rồi mới xoá blob mồ côi.
async function listCentralIds() {
  if (!indexedDBService.constructor.isAvailable()) return [];
  try {
    const recs = await indexedDBService.getAll(CENTRAL_STORE);
    return (Array.isArray(recs) ? recs : []).map((r) => (r && r.id) || null).filter(Boolean);
  } catch { return []; }
}

async function listLegacyIds() {
  try {
    const db = await openLegacyDB();
    const ids = await new Promise((res) => {
      try {
        const tx = db.transaction(LEGACY_STORE, "readonly");
        const req = tx.objectStore(LEGACY_STORE).getAllKeys();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      } catch { res([]); }
    });
    db.close();
    return ids;
  } catch { return []; }
}

/** Liệt kê mọi imageId đang tồn tại (central + legacy) */
export async function listImageBlobIds() {
  await migrateLegacyIfNeeded();
  const [a, b] = await Promise.all([listCentralIds(), listLegacyIds()]);
  return [...new Set([...a, ...b])];
}

/**
 * Xoá mọi blob không nằm trong referencedIds.
 * @param {Set<string>|string[]} referencedIds imageId còn được mọi board sử dụng
 * @returns {Promise<number>} số blob đã xoá
 */
export async function purgeUnreferencedImageBlobs(referencedIds) {
  await migrateLegacyIfNeeded();
  const used = referencedIds instanceof Set ? referencedIds : new Set(referencedIds || []);
  const ids = await listImageBlobIds();
  let removed = 0;
  for (const id of ids) {
    if (used.has(id)) continue;
    await deleteImageBlob(id);
    removed++;
  }
  return removed;
}

// Re-export for callers that want to list/clear all (used by wipe)
export async function clearAllImageBlobs() {
  await migrateLegacyIfNeeded();
  if (indexedDBService.constructor.isAvailable()) {
    try { await indexedDBService.clear(CENTRAL_STORE); } catch {}
  }
  try {
    const db = await openLegacyDB();
    await new Promise((res) => {
      try {
        const tx = db.transaction(LEGACY_STORE, "readwrite");
        tx.objectStore(LEGACY_STORE).clear();
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      } catch { res(); }
    });
    db.close();
  } catch {}
}
