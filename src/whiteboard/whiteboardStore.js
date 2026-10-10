// ─── Whiteboard storage — boards CRUD + autosave (localStorage, namespaced) ───
// Không đụng tới keys của module khác. Mọi key bắt đầu bằng "sgk_wb_".

import { readJSON, saveJSON } from "../storage.js";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove, listKeys } from "../safeStorage.js";
import { appEvents, AppEvents, DataDomains } from "../core/appEvents.js";
import indexedDBService, { STORES } from "../indexedDB.js";
import { purgeUnreferencedImageBlobs } from "./imageStore.js";
function _emitWB(action, id){ try{ appEvents.emit(AppEvents.WHITEBOARD_UPDATED, { action, id, domain: DataDomains.WHITEBOARD }); appEvents.emit(AppEvents.DATA_UPDATED, { domain: DataDomains.WHITEBOARD, action, id }); }catch{} }

export const WB_INDEX_KEY = "sgk_wb_index"; // [{id,name,createdAt,updatedAt}]
export const WB_BOARD_KEY = (id) => `sgk_wb_board_${id}`;
export const WB_PENDING_KEY = "sgk_wb_pending"; // payload "Đưa vào Whiteboard" từ module khác
export const WB_MIGRATION_KEY = "sgk_wb_migration_v1";

// ── IDB canonical for boards (TASK 1) ──
async function idbAvailable() { try { return indexedDBService.constructor.isAvailable(); } catch { return false; } }
async function idbGetBoard(id) { try { return await indexedDBService.get(STORES.WB_BOARDS, id); } catch { return null; } }
async function idbGetAllBoards() { try { return await indexedDBService.getAll(STORES.WB_BOARDS); } catch { return []; } }
async function idbPutBoard(board) { try { return await indexedDBService.set(STORES.WB_BOARDS, board.id, board); } catch { return false; } }
async function idbDeleteBoard(id) { try { return await indexedDBService.delete(STORES.WB_BOARDS, id); } catch { return false; } }
async function _idbFail(scope, id) {
  try {
    if (!(await idbAvailable())) return;
    console.error(`[whiteboardStore] ${scope} IDB failed`, id);
  } catch {}
}

// Migration LS -> IDB (TASK 2+17+18) — missing-index recovery, per-ID verify, preserve LS on fail
export async function migrateWhiteboardToIDB() {
  try {
    const done = safeGetString(WB_MIGRATION_KEY, null);
    if (done === "1") return { migrated: false, reason: "already" };
    if (!(await idbAvailable())) return { migrated: false, reason: "IDB unavailable" };
    // Combine index + scan legacy keys (index may be missing/corrupt)
    const idx = readJSON(WB_INDEX_KEY, null);
    const idxIds = new Set(Array.isArray(idx) ? idx.map((e) => e?.id).filter(Boolean) : []);
    let scannedIds = [];
    try {
      const allKeys = listKeys();
      scannedIds = allKeys.filter((k) => k && k.startsWith("sgk_wb_board_")).map((k) => k.slice("sgk_wb_board_".length)).filter(Boolean);
    } catch {}
    const allIds = new Set([...idxIds, ...scannedIds]);
    if (allIds.size === 0) {
      const existing = await idbGetAllBoards();
      if (existing.length > 0) { safeSetString(WB_MIGRATION_KEY, "1"); _idbBoardsCache = existing; _idbCacheReady = true; return { migrated: false, reason: "IDB already has boards" }; }
      safeSetString(WB_MIGRATION_KEY, "1");
      return { migrated: false, reason: "no LS boards" };
    }
    const boards = [];
    for (const id of allIds) {
      const raw = readJSON(WB_BOARD_KEY(id), null);
      if (!raw || !validateBoard(raw)) continue;
      boards.push(normalizeBoard(raw));
    }
    if (boards.length === 0) { safeSetString(WB_MIGRATION_KEY, "1"); return { migrated: false, reason: "no valid boards" }; }
    for (const b of boards) {
      const ok = await idbPutBoard(b);
      if (!ok) throw new Error(`put ${b.id} failed`);
    }
    // Per-ID verify (TASK 18) — not just count
    const after = await idbGetAllBoards();
    const afterIds = new Set(after.map((b) => b.id));
    for (const b of boards) {
      const v = await idbGetBoard(b.id);
      if (!v || v.id !== b.id) throw new Error(`verify board ${b.id} missing`);
      if (!afterIds.has(b.id)) throw new Error(`verify after missing ${b.id}`);
    }
    safeSetString(WB_MIGRATION_KEY, "1");
    _idbBoardsCache = boards;
    _idbCacheReady = true;
    // Remove legacy LS keys only after verify
    for (const id of allIds) safeRemove(WB_BOARD_KEY(id));
    safeRemove(WB_INDEX_KEY);
    return { migrated: true, count: boards.length };
  } catch (e) {
    console.warn("[whiteboardStore] migrate failed, preserve LS", e);
    return { migrated: false, error: e.message };
  }
}
// Auto-migrate on import (best-effort, no await)
try { if (typeof window !== "undefined") setTimeout(() => { migrateWhiteboardToIDB().catch(()=>{}); }, 500); } catch {}

// ── IDB cache for sync fallback (TASK 1 — boards in IDB, LS legacy only) ──
let _idbBoardsCache = null;
let _idbCacheReady = false;
async function warmIdbCache() {
  try {
    if (!(await idbAvailable())) return;
    const all = await idbGetAllBoards();
    _idbBoardsCache = Array.isArray(all) ? all : [];
    _idbCacheReady = true;
  } catch {}
}
try { if (typeof window !== "undefined") setTimeout(() => { warmIdbCache().catch(()=>{}); }, 600); } catch {}
// Helper to sync cache after writes
function _updateCache(board) {
  if (!_idbBoardsCache) _idbBoardsCache = [];
  const idx = _idbBoardsCache.findIndex((b) => b.id === board.id);
  if (idx >= 0) _idbBoardsCache[idx] = board;
  else _idbBoardsCache.unshift(board);
}
function _removeFromCache(id) {
  if (_idbBoardsCache) _idbBoardsCache = _idbBoardsCache.filter((b) => b.id !== id);
}

// ── Ref-scan: gom mọi board (IDB + LS legacy) để purge blob mồ côi / sourceRef ──
async function _allBoardsForScan() {
  const map = new Map();
  if (await idbAvailable()) {
    try {
      const all = await idbGetAllBoards();
      for (const b of Array.isArray(all) ? all : []) if (b && b.id) map.set(b.id, b);
    } catch {}
  }
  try {
    for (const k of listKeys()) {
      if (!k || !k.startsWith("sgk_wb_board_")) continue;
      const id = k.slice("sgk_wb_board_".length);
      if (!id || map.has(id)) continue;
      const b = readJSON(k, null);
      if (b && typeof b === "object" && b.id) map.set(b.id, b);
    }
  } catch {}
  return [...map.values()];
}

function _refMatches(sourceRef, filename) {
  if (!sourceRef || typeof sourceRef !== "object") return false;
  return sourceRef.filename === filename || sourceRef.bookId === filename || sourceRef.file === filename;
}

async function _persistRefChange(board) {
  const next = stripEphemeralSrc({ ...board, updatedAt: now() });
  if (await idbAvailable()) {
    try {
      const ok = await idbPutBoard(next);
      if (!ok) return false;
      _updateCache(next);
      _emitWB("updated", board.id);
      return true;
    } catch { return false; }
  }
  if (safeGetString(WB_MIGRATION_KEY, null) === "1") return false; // IDB canonical nhưng không ghi được
  try { persistBoard(next); return true; } catch { return false; }
}

/**
 * XOÁ blob ảnh không còn board nào tham chiếu (chống orphan sau khi xoá board).
 * Board duplicate chia sẻ imageId → chỉ xoá khi không board nào dùng nữa.
 * @returns {Promise<number>} số blob đã xoá
 */
export async function purgeOrphanImageBlobs() {
  try {
    const boards = await _allBoardsForScan();
    const used = new Set();
    for (const b of boards) for (const o of (b.objects || [])) if (o && o.imageId) used.add(o.imageId);
    return await purgeUnreferencedImageBlobs(used);
  } catch (e) {
    console.warn("[whiteboardStore] purgeOrphanImageBlobs failed", e);
    return 0;
  }
}

/**
 * Xoá liên kết sách (sourceRef) khỏi mọi object trên mọi bảng khi SÁCH BỊ XÓA.
 * Trả về số board đã sửa.
 */
export async function purgeBookRefs(filename) {
  if (!filename) return 0;
  let changed = 0;
  try {
    const boards = await _allBoardsForScan();
    for (const b of boards) {
      const objs = Array.isArray(b.objects) ? b.objects : [];
      if (!objs.some((o) => _refMatches(o && o.sourceRef, filename))) continue;
      const next = {
        ...b,
        objects: objs.map((o) => (_refMatches(o && o.sourceRef, filename) ? { ...o, sourceRef: null, citation: "" } : o)),
      };
      if (await _persistRefChange(next)) changed++;
    }
  } catch (e) {
    console.warn("[whiteboardStore] purgeBookRefs failed", e);
  }
  return changed;
}

/**
 * Cập nhật sourceRef theo tên file MỚI khi SÁCH BỊ ĐỔI TÊN (tránh link chết).
 * Trả về số board đã sửa.
 */
export async function migrateBookRefs(oldFilename, newFilename) {
  if (!oldFilename || !newFilename || oldFilename === newFilename) return 0;
  let changed = 0;
  try {
    const boards = await _allBoardsForScan();
    for (const b of boards) {
      const objs = Array.isArray(b.objects) ? b.objects : [];
      if (!objs.some((o) => _refMatches(o && o.sourceRef, oldFilename))) continue;
      const next = {
        ...b,
        objects: objs.map((o) => {
          if (!_refMatches(o && o.sourceRef, oldFilename)) return o;
          const ref = o.sourceRef || {};
          const migrated = { ...ref, filename: newFilename };
          if (ref.bookId === oldFilename) migrated.bookId = newFilename;
          if (ref.file === oldFilename) migrated.file = newFilename;
          return { ...o, sourceRef: migrated };
        }),
      };
      if (await _persistRefChange(next)) changed++;
    }
  } catch (e) {
    console.warn("[whiteboardStore] migrateBookRefs failed", e);
  }
  return changed;
}

export function uid(prefix = "o") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function now() {
  return Date.now();
}

export function blankBoard(name = "Bảng mới") {
  const id = uid("b");
  const t = now();
  return {
    id,
    name,
    createdAt: t,
    updatedAt: t,
    zoom: 1,
    pan: { x: 40, y: 40 },
    grid: true,
    snap: false,
    smartAlign: true,
    smartSpacing: true,
    objects: [],
    connectors: [],
  };
}

export function blankObject(kind, patch = {}) {
  return {
    id: uid("o"),
    kind, // node | text | shape | note | image | stroke
    parentId: null,
    groupId: null,
    x: 100,
    y: 100,
    width: 160,
    height: 64,
    text: "",
    shape: "rounded", // rect|rounded|circle|ellipse|diamond|triangle
    fill: "#ffffff",
    stroke: "#334155",
    strokeWidth: 2,
    strokeDash: "", // "" solid | "6 4" dashed | "2 4" dotted
    color: "#1e293b",
    fontSize: 15,
    bold: false,
    italic: false,
    align: "center",
    src: null, // image dataURL (legacy) — mới dùng imageId + IndexedDB
    imageId: null, // id trỏ Blob trong IndexedDB
    points: null, // stroke: [{x,y}...] tương đối theo x/y
    penColor: "#1d4ed8",
    penWidth: 3,
    autoSize: false,
    locked: false,
    collapsed: false,
    z: 0,
    sourceRef: null, // { filename, title, page, bookPage, chapter, citation }
    citation: "", // hiển thị trích dẫn ngắn
    ...patch,
  };
}

export function getWrapLines(text, width, fontSize) {
  const maxChars = Math.max(3, Math.floor((width - 16) / (fontSize * 0.62)));
  const out = [];
  String(text || "").split("\n").forEach((para) => {
    if (!para) { out.push(""); return; }
    const words = para.split(/\s+/);
    let line = "";
    words.forEach((w) => {
      // nếu từ quá dài vượt maxChars thì cắt từ
      if (w.length > maxChars) {
        if (line) { out.push(line); line = ""; }
        for (let i = 0; i < w.length; i += maxChars) out.push(w.slice(i, i + maxChars));
        return;
      }
      const cand = line ? line + " " + w : w;
      if (cand.length > maxChars && line) { out.push(line); line = w; }
      else line = cand;
    });
    out.push(line);
  });
  return out.slice(0, 48);
}

export function getFittedSize(text, width, height, fontSize = 14) {
  const fs = Number(fontSize) || 14;
  const lines = getWrapLines(text, width, fs);
  const lh = fs * 1.3;
  const reqH = Math.ceil(lines.length * lh + 18);
  const longest = Math.max(0, ...lines.map((l) => l.length));
  const neededW = Math.ceil(longest * fs * 0.62 + 24);
  let newW = width;
  let newH = Math.max(height, reqH);
  if (neededW > width && longest >= Math.max(3, Math.floor((width - 16) / (fs * 0.62))) - 1) {
    newW = Math.min(520, Math.max(width, neededW));
    const newLines = getWrapLines(text, newW, fs);
    const newReqH = Math.ceil(newLines.length * lh + 18);
    newH = Math.max(height, newReqH);
    return { width: newW, height: newH, lines: newLines };
  }
  return { width: newW, height: newH, lines };
}

export function ensureFits(obj) {
  if (!obj.text || typeof obj.text !== 'string' || obj.kind === 'image' || obj.kind === 'stroke') return obj;
  const fs = Number(obj.fontSize) || 14;
  // nếu autoSize bật thì tính theo nội dung tự nhiên (không gò theo width cũ)
  if (obj.autoSize) {
    const lines = String(obj.text).split("\n");
    const maxLen = Math.max(6, ...lines.map((l) => l.length));
    const estW = Math.min(520, Math.max(120, Math.ceil(maxLen * fs * 0.62 + 24)));
    const estLines = getWrapLines(obj.text, estW, fs);
    const estH = Math.ceil(estLines.length * fs * 1.3 + 18);
    const nw = Math.max(120, estW);
    const nh = Math.max(48, estH);
    if (nw !== obj.width || nh !== obj.height) return { ...obj, width: nw, height: nh };
    return obj;
  }
  const { width: nw, height: nh } = getFittedSize(obj.text, obj.width, obj.height, fs);
  if (nw !== obj.width || nh !== obj.height) return { ...obj, width: nw, height: nh };
  return obj;
}

function stripEphemeralSrc(board) {
  // image src = blob: URL is ephemeral (revoked on unmount/reload). Persist only imageId; src will be re-hydrated from IndexedDB.
  // Keep dataURL for legacy boards without imageId.
  const copy = { ...board, objects: (board.objects || []).map((o) => (o.imageId ? { ...o, src: null } : o)) };
  return copy;
}

export function listBoards() {
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (isMigrated) {
    if (_idbCacheReady && Array.isArray(_idbBoardsCache)) {
      return _idbBoardsCache.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt }));
    }
    // IDB canonical — trigger warm, return cached or empty (no LS seed)
    try { warmIdbCache().catch(()=>{}); } catch {}
    return _idbBoardsCache ? _idbBoardsCache.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt })) : [];
  }
  const idx = readJSON(WB_INDEX_KEY, null);
  if (Array.isArray(idx)) return idx;
  // Seed lần đầu (LS fallback only)
  const b = blankBoard("Bảng của tôi");
  try {
    saveJSON(WB_INDEX_KEY, [
      { id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt },
    ]);
    saveJSON(WB_BOARD_KEY(b.id), b);
    try { idbPutBoard(b).then((ok) => { _updateCache(b); if (ok === false) _idbFail("listBoards seed", b.id); }).catch((e) => console.error("[whiteboardStore] listBoards seed IDB error", e)); } catch {}
  } catch (e) { console.warn("[whiteboardStore] listBoards seed failed", e); }
  return [{ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt }];
}
export async function listBoardsAsync() {
  if (await idbAvailable()) {
    try {
      const all = await idbGetAllBoards();
      if (Array.isArray(all) && all.length > 0) {
        _idbBoardsCache = all;
        _idbCacheReady = true;
        return all.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt }));
      }
    } catch {}
  }
  return listBoards();
}

export function loadBoard(id) {
  // IDB cache first after migration
  if (safeGetString(WB_MIGRATION_KEY, null) === "1" && _idbCacheReady && Array.isArray(_idbBoardsCache)) {
    const cached = _idbBoardsCache.find((b) => b.id === id);
    if (cached) {
      const nb = normalizeBoard(cached);
      return nb;
    }
  }
  const b = readJSON(WB_BOARD_KEY(id), null);
  if (!b || typeof b !== "object") return null;
  if (!validateBoard(b)) return null;
  const nb = normalizeBoard(b);
  if (nb.objects.length !== (b.objects || []).length || nb.objects.some((o, i) => o.src !== (b.objects[i] || {}).src)) {
    try {
      const sanitized = stripEphemeralSrc(nb);
      saveJSON(WB_BOARD_KEY(id), { ...sanitized, updatedAt: b.updatedAt || now() });
      try { idbPutBoard({ ...sanitized, updatedAt: b.updatedAt || now() }).then((ok) => { _updateCache({ ...sanitized, updatedAt: b.updatedAt || now() }); if (ok === false) _idbFail("loadBoard sanitize", id); }).catch((e) => console.error("[whiteboardStore] loadBoard sanitize IDB error", e)); } catch {}
    } catch {}
  }
  return nb;
}
export async function loadBoardAsync(id) {
  if (await idbAvailable()) {
    try {
      const b = await idbGetBoard(id);
      if (b && validateBoard(b)) return normalizeBoard(b);
    } catch {}
  }
  return loadBoard(id);
}

export function persistBoard(board) {
  const sanitized = stripEphemeralSrc(board);
  const next = { ...sanitized, updatedAt: now() };
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  // IDB canonical after migration — persistence-first: cache+emit only after IDB verify (P0)
  if (isMigrated) {
    try {
      idbPutBoard(next).then((ok) => {
        if (ok) { _updateCache(next); _emitWB("updated", board.id); }
        else console.error("[whiteboardStore] persistBoard IDB failed", board.id);
      });
    } catch (e) { console.error("[whiteboardStore] persistBoard IDB error", e); }
    // Sync legacy API returns pending, caller should use persistBoardAsync for critical
    return { ...board, updatedAt: next.updatedAt, _pendingPersist: true };
  }
  saveJSON(WB_BOARD_KEY(board.id), next);
  try { idbPutBoard(next).then((ok) => { if (ok) _updateCache(next); else _idbFail("persistBoard(legacy)", board.id); }).catch((e) => console.error("[whiteboardStore] persistBoard(legacy) IDB error", e)); } catch {}
  try {
    const idx = readJSON(WB_INDEX_KEY, []);
    const arr = Array.isArray(idx) ? idx : [];
    const i = arr.findIndex((e) => e.id === board.id);
    const entry = { id: board.id, name: board.name, createdAt: board.createdAt, updatedAt: next.updatedAt };
    if (i >= 0) arr[i] = entry;
    else arr.unshift(entry);
    saveJSON(WB_INDEX_KEY, arr);
  } catch (e) { console.warn("[whiteboardStore] persistBoard index failed", e); }
  _emitWB("updated", board.id);
  return { ...board, updatedAt: next.updatedAt };
}
export async function persistBoardAsync(board) {
  const sanitized = stripEphemeralSrc(board);
  const next = { ...sanitized, updatedAt: now() };
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (await idbAvailable()) {
    const ok = await idbPutBoard(next);
    if (!ok) {
      console.error("[whiteboardStore] persistBoardAsync IDB failed", board.id);
      // After migration: IDB canonical, do NOT fallback to LS, do NOT emit success
      if (isMigrated) throw new Error("IDB persist failed");
      // Before migration: fallback to LS
    } else {
      _updateCache(next);
      _emitWB("updated", board.id);
      return { ...board, updatedAt: next.updatedAt, ok: true };
    }
  } else if (isMigrated) {
    throw new Error("IDB unavailable after migration");
  }
  // Fallback LS only when not migrated or IDB unavailable before migration
  if (!isMigrated) {
    try { saveJSON(WB_BOARD_KEY(board.id), next); } catch {}
    try {
      const idx = readJSON(WB_INDEX_KEY, []);
      const arr = Array.isArray(idx) ? idx : [];
      const i = arr.findIndex((e) => e.id === board.id);
      const entry = { id: board.id, name: board.name, createdAt: board.createdAt, updatedAt: next.updatedAt };
      if (i >= 0) arr[i] = entry;
      else arr.unshift(entry);
      saveJSON(WB_INDEX_KEY, arr);
    } catch {}
    _emitWB("updated", board.id);
    return { ...board, updatedAt: next.updatedAt, ok: true };
  }
  throw new Error("persistBoardAsync failed: IDB unavailable and migrated");
}

export function createBoard(name) {
  const b = blankBoard(name || `Bảng ${new Date().toLocaleString("vi-VN")}`);
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (isMigrated) {
    // IDB canonical — cache+emit only after IDB success
    try {
      idbPutBoard(b).then((ok) => {
        if (ok) { _updateCache(b); _emitWB("created", b.id); }
        else console.error("[whiteboardStore] createBoard IDB failed", b.id);
      });
    } catch (e) { console.error("[whiteboardStore] createBoard IDB error", e); }
    return b;
  }
  saveJSON(WB_BOARD_KEY(b.id), b);
  try { idbPutBoard(b).then((ok) => { if (ok) _updateCache(b); else _idbFail("createBoard(legacy)", b.id); }).catch((e) => console.error("[whiteboardStore] createBoard(legacy) IDB error", e)); } catch {}
  try {
    const idx = readJSON(WB_INDEX_KEY, []);
    const arr = Array.isArray(idx) ? idx : [];
    arr.unshift({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt });
    saveJSON(WB_INDEX_KEY, arr);
  } catch (e) { console.warn("[whiteboardStore] createBoard index failed", e); }
  _emitWB("created", b.id);
  return b;
}

export function deleteBoard(id) {
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (isMigrated) {
    // IDB canonical — cache only after delete success, no LS
    try {
      idbDeleteBoard(id).then((ok) => {
        if (ok) {
          _removeFromCache(id);
          _emitWB("deleted", id);
          // P0: dọn blob ảnh mà board này là người dùng cuối (fire-and-forget)
          try { purgeOrphanImageBlobs().catch(() => {}); } catch {}
        } else console.error("[whiteboardStore] deleteBoard IDB failed", id);
      });
    } catch (e) { console.error("[whiteboardStore] deleteBoard IDB error", e); }
    return;
  }
  try { idbDeleteBoard(id).then((ok) => { if (ok === false) _idbFail("deleteBoard(legacy)", id); _removeFromCache(id); }).catch((e) => console.error("[whiteboardStore] deleteBoard(legacy) IDB error", e)); } catch {}
  _removeFromCache(id);
  try {
    safeRemove(WB_BOARD_KEY(id));
    const idx = readJSON(WB_INDEX_KEY, []);
    saveJSON(
      WB_INDEX_KEY,
      (Array.isArray(idx) ? idx : []).filter((e) => e.id !== id),
    );
    _emitWB("deleted", id);
    try { purgeOrphanImageBlobs().catch(() => {}); } catch {}
  } catch (e) { console.warn("[whiteboardStore] deleteBoard failed", e); }
}

export function renameBoard(id, name) {
  const b = loadBoard(id);
  if (!b) return null;
  b.name = String(name || b.name).slice(0, 120);
  return persistBoard(b);
}

export function duplicateBoard(id, suffix = " (bản sao)") {
  // Compatibility wrapper — sync, optimistic (legacy). Persistence-critical callers should use await duplicateBoardAsync(id)
  const b = loadBoard(id);
  if (!b) return null;
  const idMap = new Map();
  const clone = {
    ...b,
    id: uid("b"),
    name: (b.name || "Bảng") + suffix,
    createdAt: now(),
    updatedAt: now(),
    objects: (b.objects || []).map((o) => {
      const nid = uid("o");
      idMap.set(o.id, nid);
      const src = o.imageId ? null : o.src;
      return { ...o, id: nid, src, parentId: o.parentId ? idMap.get(o.parentId) || o.parentId : null };
    }),
    connectors: (b.connectors || []).map((c) => ({ ...c, id: uid("c") })),
  };
  const known = new Set(clone.objects.map((o) => o.id));
  clone.objects = clone.objects.map((o) => ({
    ...o,
    parentId: o.parentId && idMap.has(o.parentId) ? idMap.get(o.parentId) : o.parentId && [...idMap.values()].includes(o.parentId) ? o.parentId : null,
  }));
  clone.connectors = clone.connectors.map((c) => ({
    ...c,
    fromId: idMap.get(c.fromId) || c.fromId,
    toId: idMap.get(c.toId) || c.toId,
  })).filter((c) => known.has(c.fromId) && known.has(c.toId));
  const isDupMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (isDupMigrated) {
    // IDB canonical — fire-and-forget legacy compat, cache only after verify
    try {
      idbPutBoard(clone).then((ok) => {
        if (ok) { _updateCache(clone); _emitWB("created", clone.id); }
        else console.error("[whiteboardStore] duplicateBoard IDB failed", clone.id);
      });
    } catch (e) { console.error("[whiteboardStore] duplicateBoard IDB error", e); }
    return clone;
  } else {
    saveJSON(WB_BOARD_KEY(clone.id), clone);
    try {
      const idx = readJSON(WB_INDEX_KEY, []);
      const arr = Array.isArray(idx) ? idx : [];
      arr.unshift({ id: clone.id, name: clone.name, createdAt: clone.createdAt, updatedAt: clone.updatedAt });
      saveJSON(WB_INDEX_KEY, arr);
    } catch (e) { console.warn("[whiteboardStore] duplicateBoard index failed", e); }
    try { idbPutBoard(clone).then((ok) => { if (ok) _updateCache(clone); else _idbFail("duplicateBoard(legacy)", clone.id); }).catch((e) => console.error("[whiteboardStore] duplicateBoard(legacy) IDB error", e)); } catch {}
    _emitWB("created", clone.id);
    return clone;
  }
}

// ── Async persistence-first APIs — canonical after migration (TASK 2-6) ──
export async function createBoardAsync(name) {
  const b = blankBoard(name || `Bảng ${new Date().toLocaleString("vi-VN")}`);
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (await idbAvailable()) {
    const ok = await idbPutBoard(b);
    if (!ok) throw new Error("IDB createBoard failed");
    _updateCache(b);
    _emitWB("created", b.id);
    return b;
  }
  if (isMigrated) throw new Error("IDB unavailable after migration");
  // Fallback LS before migration
  saveJSON(WB_BOARD_KEY(b.id), b);
  try {
    const idx = readJSON(WB_INDEX_KEY, []);
    const arr = Array.isArray(idx) ? idx : [];
    arr.unshift({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt });
    saveJSON(WB_INDEX_KEY, arr);
  } catch {}
  _updateCache(b);
  _emitWB("created", b.id);
  return b;
}
export async function deleteBoardAsync(id) {
  const isMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (await idbAvailable()) {
    const ok = await idbDeleteBoard(id);
    if (!ok) throw new Error("IDB deleteBoard failed");
    _removeFromCache(id);
    _emitWB("deleted", id);
    try { await purgeOrphanImageBlobs(); } catch {}
    return true;
  }
  if (isMigrated) throw new Error("IDB unavailable after migration");
  safeRemove(WB_BOARD_KEY(id));
  try {
    const idx = readJSON(WB_INDEX_KEY, []);
    saveJSON(WB_INDEX_KEY, (Array.isArray(idx) ? idx : []).filter((e) => e.id !== id));
  } catch {}
  _removeFromCache(id);
  _emitWB("deleted", id);
  try { await purgeOrphanImageBlobs(); } catch {}
  return true;
}
export async function duplicateBoardAsync(id, suffix = " (bản sao)") {
  const b = await loadBoardAsync(id);
  if (!b) throw new Error("Source board not found");
  const idMap = new Map();
  const clone = {
    ...b,
    id: uid("b"),
    name: (b.name || "Bảng") + suffix,
    createdAt: now(),
    updatedAt: now(),
    objects: (b.objects || []).map((o) => {
      const nid = uid("o");
      idMap.set(o.id, nid);
      return { ...o, id: nid, src: o.imageId ? null : o.src, parentId: o.parentId ? idMap.get(o.parentId) || o.parentId : null };
    }),
    connectors: (b.connectors || []).map((c) => ({ ...c, id: uid("c") })),
  };
  const known = new Set(clone.objects.map((o) => o.id));
  clone.objects = clone.objects.map((o) => ({
    ...o,
    parentId: o.parentId && idMap.has(o.parentId) ? idMap.get(o.parentId) : o.parentId && [...idMap.values()].includes(o.parentId) ? o.parentId : null,
  }));
  clone.connectors = clone.connectors.map((c) => ({
    ...c,
    fromId: idMap.get(c.fromId) || c.fromId,
    toId: idMap.get(c.toId) || c.toId,
  })).filter((c) => known.has(c.fromId) && known.has(c.toId));
  const isDupMigrated = safeGetString(WB_MIGRATION_KEY, null) === "1";
  if (await idbAvailable()) {
    const ok = await idbPutBoard(clone);
    if (!ok) throw new Error("IDB duplicateBoard failed");
    _updateCache(clone);
    _emitWB("created", clone.id);
    return clone;
  }
  if (isDupMigrated) throw new Error("IDB unavailable after migration");
  saveJSON(WB_BOARD_KEY(clone.id), clone);
  try {
    const idx = readJSON(WB_INDEX_KEY, []);
    const arr = Array.isArray(idx) ? idx : [];
    arr.unshift({ id: clone.id, name: clone.name, createdAt: clone.createdAt, updatedAt: clone.updatedAt });
    saveJSON(WB_INDEX_KEY, arr);
  } catch {}
  _updateCache(clone);
  _emitWB("created", clone.id);
  return clone;
}

// ─── Cycle detection — data layer, không chỉ UI ───
export function hasCycle(objects) {
  const parent = new Map(objects.map((o) => [o.id, o.parentId]));
  for (const o of objects) {
    const seen = new Set();
    let cur = o.parentId;
    while (cur) {
      if (cur === o.id) return true;
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = parent.get(cur) || null;
    }
  }
  return false;
}
export function wouldCreateCycle(objects, childId, newParentId) {
  if (!newParentId) return false;
  if (childId === newParentId) return true;
  const parent = new Map(objects.map((o) => [o.id, o.parentId]));
  parent.set(childId, newParentId);
  let cur = newParentId;
  const seen = new Set([childId]);
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parent.get(cur) || null;
  }
  return false;
}
export function repairCycles(objects) {
  // cắt parentId gây cycle về null theo thứ tự an toàn
  const parent = new Map(objects.map((o) => [o.id, o.parentId]));
  for (const o of objects) {
    if (wouldCreateCycle(objects.filter((x) => x.id !== o.id).concat([{ ...o, parentId: null }]), o.id, o.parentId)) {
      // actually test original
    }
    if (o.parentId && wouldCreateCycle(objects, o.id, o.parentId)) {
      o.parentId = null;
    }
  }
  return objects;
}

// ─── Validate JSON import — không để JSON lỗi crash app ───
const VALID_KINDS = new Set(["node", "text", "shape", "note", "image", "stroke"]);
const VALID_SHAPES = new Set(["rect", "rounded", "circle", "ellipse", "diamond", "triangle"]);
const VALID_CONN = new Set(["line", "arrow", "double", "elbow"]);
const VALID_ANCHOR = new Set(["auto", "top", "right", "bottom", "left"]);

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

export function normalizeBoard(b) {
  const board = { ...blankBoard(b.name || "Bảng nhập"), ...b };
  board.objects = (Array.isArray(b.objects) ? b.objects : [])
    .filter((o) => o && typeof o === "object" && VALID_KINDS.has(o.kind) && !(o.kind === "note" && typeof o.text === "string" && String(o.text).includes("Trang này dạng ảnh")))
    .map((o, idx) => {
      // Fix persisted ephemeral blob: URL (lost after reload/revoke) → clear src so resolver re-hydrates from IndexedDB
      let src = o.src || null;
      if (o.imageId && src && typeof src === "string" && src.startsWith("blob:")) src = null;
      // Also if imageId exists, src is transient; clear persisted blob URL to force re-resolve
      if (o.imageId && src && typeof src === "string" && src.startsWith("blob:")) src = null;
      return {
        ...blankObject(o.kind),
        ...o,
        id: String(o.id || uid("o")),
        x: num(o.x, 100),
        y: num(o.y, 100),
        width: Math.max(8, num(o.width, 120)),
        height: Math.max(8, num(o.height, 48)),
        text: typeof o.text === "string" ? o.text.slice(0, 5000) : "",
        shape: VALID_SHAPES.has(o.shape) ? o.shape : "rounded",
        strokeDash: typeof o.strokeDash === "string" ? o.strokeDash.slice(0, 20) : "",
        parentId: o.parentId ? String(o.parentId) : null,
        groupId: o.groupId ? String(o.groupId) : null,
        locked: !!o.locked,
        collapsed: !!o.collapsed,
        z: Number.isFinite(Number(o.z)) ? Number(o.z) : idx,
        imageId: o.imageId ? String(o.imageId) : null,
        src,
        sourceRef: o.sourceRef && typeof o.sourceRef === "object" ? o.sourceRef : null,
        citation: typeof o.citation === "string" ? o.citation.slice(0, 300) : (o.sourceRef?.citation || ""),
      };
    });
  const ids = new Set(board.objects.map((o) => o.id));
  board.connectors = (Array.isArray(b.connectors) ? b.connectors : [])
    .filter((c) => c && typeof c === "object" && ids.has(c.fromId) && ids.has(c.toId) && c.fromId !== c.toId)
    .map((c) => ({
      id: String(c.id || uid("c")),
      fromId: String(c.fromId),
      toId: String(c.toId),
      type: VALID_CONN.has(c.type) ? c.type : "arrow",
      color: typeof c.color === "string" ? c.color : "#475569",
      width: Math.min(12, Math.max(1, num(c.width, 2))),
      sourceAnchor: VALID_ANCHOR.has(c.sourceAnchor) ? c.sourceAnchor : "auto",
      targetAnchor: VALID_ANCHOR.has(c.targetAnchor) ? c.targetAnchor : "auto",
    }));
  // parentId trỏ tới id không tồn tại -> null, và chỉ node mới được làm parent
  board.objects = board.objects.map((o) => {
    if (!o.parentId || !ids.has(o.parentId)) return { ...o, parentId: null };
    const parent = board.objects.find((p) => p.id === o.parentId);
    if (!parent || parent.kind !== "node" || o.kind !== "node") return { ...o, parentId: null };
    return o;
  });
  // repair cycles an toàn
  if (hasCycle(board.objects)) {
    board.objects = repairCycles(board.objects);
  }
  // DEDUP: sửa board đã bị lặp nhiều ảnh/note do BookReader emit 3 lần (cực nặng)
  // Giữ 1 object cho mỗi content hash (kind+text+source) trong cùng board
  if (board.objects.length > 1) {
    const seen = new Map();
    const deduped = [];
    for (const o of board.objects) {
      const textKey = String(o.text || "").slice(0, 50);
      const srcKey = o.sourceRef ? `${o.sourceRef.filename || ""}#${o.sourceRef.page || ""}` : "";
      // image: dedup theo source gốc, không theo imageId (mỗi lần lặp tạo imageId mới nhưng cùng trang)
      const key = o.kind === "image" ? `image|${srcKey}|${o.width}x${o.height}` : `${o.kind}|${textKey}|${srcKey}`;
      if (seen.has(key)) {
        const prev = seen.get(key);
        // nếu vị trí gần nhau (<250px) hoặc cùng source thì là duplicate do bug → bỏ
        const near = Math.abs(prev.x - o.x) < 250 && Math.abs(prev.y - o.y) < 250;
        const sameSource = !!srcKey && srcKey === `${prev.sourceRef?.filename || ""}#${prev.sourceRef?.page || ""}`;
        if (near || sameSource) continue;
      }
      seen.set(key, o);
      deduped.push(o);
    }
    if (deduped.length !== board.objects.length) {
      const removed = board.objects.length - deduped.length;
      console.warn(`[whiteboardStore] dedup ${removed} duplicate objects (BookReader heavy bug)`);
      board.objects = deduped;
      const kept = new Set(deduped.map((x) => x.id));
      board.connectors = board.connectors.filter((c) => kept.has(c.fromId) && kept.has(c.toId));
      // parentId trỏ tới object đã bị xóa → null
      board.objects = board.objects.map((o) => (o.parentId && !kept.has(o.parentId) ? { ...o, parentId: null } : o));
    }
  }
  board.zoom = Math.min(3, Math.max(0.2, num(b.zoom, 1)));
  board.pan = { x: num(b?.pan?.x, 40), y: num(b?.pan?.y, 40) };
  board.smartSpacing = b.smartSpacing !== false;
  board.smartAlign = b.smartAlign !== false;
  board.objects = board.objects.map((o) => ({ ...o, autoSize: !!o.autoSize }));
  // đảm bảo box chứa vừa chữ (tự tăng kích thước hợp lý)
  board.objects = board.objects.map((o) => ensureFits(o));
  // sort by z để render đúng thứ tự
  board.objects.sort((a, b2) => (a.z || 0) - (b2.z || 0));
  return board;
}

export function validateBoard(b) {
  if (!b || typeof b !== "object") return false;
  if (!Array.isArray(b.objects) || !Array.isArray(b.connectors)) return false;
  return true;
}

export function parseBoardJSON(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "File JSON không hợp lệ: " + e.message };
  }
  const cand = raw && raw.board ? raw.board : raw;
  if (!validateBoard(cand)) return { ok: false, error: "Dữ liệu không phải Whiteboard (thiếu objects/connectors)." };
  try {
    const board = normalizeBoard({ ...cand, id: uid("b"), name: String(cand.name || "Bảng nhập").slice(0, 120) });
    return { ok: true, board };
  } catch (e) {
    return { ok: false, error: "Không thể chuẩn hoá dữ liệu: " + e.message };
  }
}

// ─── Hook "Đưa nội dung vào Whiteboard" cho module khác (KHBD/SGK) ───
// Module khác chỉ cần: window.dispatchEvent(new CustomEvent("sgk:send-to-whiteboard",{detail:{title,text}}))
// WhiteboardView lắng nghe + tạo node từ nội dung. Không sửa module khác.
export function consumePendingPayload() {
  try {
    const data = safeGetJSON(WB_PENDING_KEY, null, (v) => v && typeof v === "object");
    if (data === null) return null;
    safeRemove(WB_PENDING_KEY);
    return data;
  } catch (e) {
    console.warn("[whiteboardStore] consumePendingPayload failed", e);
    return null;
  }
}

export function queuePendingPayload(payload) {
  const res = safeSetJSON(WB_PENDING_KEY, { ...payload, at: now() });
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] Quota exceeded saving sgk_wb_pending:", res.message);
    else console.warn("[safeStorage] Failed to save sgk_wb_pending:", res.message);
    return false;
  }
  try { appEvents.emit(AppEvents.SEND_TO_WHITEBOARD, payload); } catch (e) { console.warn("[whiteboardStore] dispatch failed", e); }
  return true;
}
