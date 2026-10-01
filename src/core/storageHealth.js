// ── Storage Health — kiểm tra lưu trữ chi tiết (lỗi ở đâu) ───────────
// Dùng chung cho Settings/DataTools: quét localStorage + IndexedDB, phân loại lỗi theo nơi.
// Không tự sửa, chỉ báo cáo: corrupted JSON, schema invalid, quota, unknown keys, orphan per-book, mismatch IDB/LS.

import { STORAGE_KEYS, BACKUP_KEYS, isBackupKey, isCacheKey } from "./storageKeys.js";
import { safeGetWithStatus, isCorrupted, safeGetString, listKeys, safeRemove } from "../safeStorage.js";
import { STORES } from "../indexedDB.js";

function classifyKey(key) {
  if (isBackupKey(key)) return "backup";
  if (isCacheKey(key)) return "cache";
  if (key.startsWith("sgk_")) return "sgk_unknown";
  if (key.startsWith("sync_") || key.startsWith("backup_") || key.startsWith("ai_")) return "other_known";
  return "unknown";
}

// Các key lưu chuỗi thuần (không JSON) — không báo corrupted khi parse JSON thất bại
const STRING_KEYS = new Set([
  STORAGE_KEYS.GEMINI_KEY,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.SIDEBAR_W,
  STORAGE_KEYS.SIDEBAR_COLLAPSED,
  STORAGE_KEYS.SIDEBAR_W,
  STORAGE_KEYS.TOC_W,
  STORAGE_KEYS.AI_W,
  "SGK_TEACHER_MODE",
  "coverPages_TLHT-GiA-o-da-c-mA-i-tr-a-ng-2025.pdf",
]);

function tryParseInfo(key) {
  if (STRING_KEYS.has(key)) {
    const v = safeGetString(key, null);
    if (v === null) return { status: "missing", ok: true };
    return { status: "ok", ok: true, data: v };
  }
  const st = safeGetWithStatus(key, null);
  // st: {ok, found, data, error, message}
  if (!st.found) return { status: "missing", ok: true };
  if (!st.ok) return { status: st.error, ok: false, message: st.message, raw: safeGetString(key, "") };
  return { status: "ok", ok: true, data: st.data };
}

export async function runStorageHealth({ books = [], includeIDB = true } = {}) {
  const at = Date.now();
  const bookSet = new Set((books || []).map(b => b?.filename).filter(Boolean));
  const allKeys = (()=>{ try{ return listKeys().sort(); }catch{ return []; }})();

  const corrupted = [];
  const schemaInvalid = [];
  const unknownKeys = [];
  const otherKnownKeys = [];
  const perBookOrphans = [];
  const quota = { available: true, error: null, estimate: null };
  const backupMissing = [];
  const idb = { available: typeof indexedDB !== "undefined", stores: {} };

  // Check availability — CỐ Ý dùng localStorage trực tiếp: đây là probe đo tầng thô,
  // không qua safeStorage (safeStorage nuốt lỗi sẽ làm probe mất ý nghĩa).
  try {
    const t = "__health_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
  } catch (e) { quota.available = false; quota.error = e.message; }

  // Navigator storage estimate (best-effort)
  try {
    if (navigator?.storage?.estimate) {
      const est = await navigator.storage.estimate();
      quota.estimate = est;
    }
  } catch {}

  // Per-key scan
  for (const key of allKeys) {
    const cls = classifyKey(key);
    if (cls === "unknown") unknownKeys.push({ key, bytes: (safeGetString(key,"") || "").length });
    if (cls === "other_known") otherKnownKeys.push({ key, bytes: (safeGetString(key,"") || "").length });

    // Corrupted / schema check for backup keys
    if (cls === "backup") {
      const info = tryParseInfo(key);
      if (info.status === "CORRUPTED_DATA") corrupted.push({ key, where: "localStorage JSON parse", message: info.message, rawPreview: (info.raw || "").slice(0, 200) });
      else if (info.status === "SCHEMA_INVALID") schemaInvalid.push({ key, where: "validator", message: info.message });
      // Per-book prefix orphan detection
      const prefixes = [STORAGE_KEYS.MARKS_PREFIX, STORAGE_KEYS.TEACHER_NOTES_PREFIX, STORAGE_KEYS.NOTES_PREFIX, STORAGE_KEYS.STUDYNOTES_PREFIX, STORAGE_KEYS.CMPNOTE_PREFIX, STORAGE_KEYS.LAST_PAGE_PREFIX, STORAGE_KEYS.LAST_TOTAL_PREFIX, STORAGE_KEYS.AUTOSAVE_PREFIX, STORAGE_KEYS.WB_BOARD_PREFIX];
      for (const pref of prefixes) {
        if (key.startsWith(pref)) {
          const filename = key.slice(pref.length);
          // sgk_autosave_ stores planId not filename, skip bookSet check for it
          if (pref === STORAGE_KEYS.AUTOSAVE_PREFIX) continue;
          if (pref === STORAGE_KEYS.WB_BOARD_PREFIX) continue;
          if (bookSet.size > 0 && filename && !bookSet.has(filename)) {
            perBookOrphans.push({ key, prefix: pref, filename, where: "per-book orphan", reason: "filename not in books" });
          }
          break;
        }
      }
      // Special: toc_ cache orphan
      if (key.startsWith(STORAGE_KEYS.TOC_FILE_PREFIX) && bookSet.size > 0) {
        const filename = key.slice(STORAGE_KEYS.TOC_FILE_PREFIX.length);
        if (filename && !bookSet.has(filename)) perBookOrphans.push({ key, prefix: STORAGE_KEYS.TOC_FILE_PREFIX, filename, where: "toc cache orphan" });
      }
    }
    if (cls === "cache" && isCorrupted(key)) {
      corrupted.push({ key, where: "cache JSON corrupted", message: "JSON.parse failed" });
    }
  }

  // Backup expected keys missing (not an error, just info)
  for (const bk of BACKUP_KEYS) {
    if (bk.endsWith("_")) continue;
    try { if (safeGetString(bk, null) === null) backupMissing.push(bk); } catch {}
  }

  // IDB quick counts
  if (includeIDB && idb.available) {
    try {
      const { default: idx } = await import("../indexedDB.js");
      for (const store of Object.values(STORES)) {
        try { const all = await idx.getAll(store); idb.stores[store] = { count: Array.isArray(all) ? all.length : 0 }; } catch (e) { idb.stores[store] = { count: -1, error: e.message }; }
      }
      // Mismatch check: LS vs IDB for hybrid domains
      const hybrids = [
        { lsKey: STORAGE_KEYS.CLIPS, store: STORES.CLIPS },
        { lsKey: STORAGE_KEYS.REFS, store: STORES.REFS },
        { lsKey: STORAGE_KEYS.CONCEPTS, store: STORES.CONCEPTS },
        { lsKey: STORAGE_KEYS.EVIDENCE, store: STORES.EVIDENCE },
      ];
      idb.mismatch = [];
      for (const { lsKey, store } of hybrids) {
        try {
          const lsRaw = safeGetString(lsKey, null);
          const lsCount = lsRaw ? (JSON.parse(lsRaw)?.length ?? 0) : 0;
          const idbCount = idb.stores[store]?.count ?? 0;
          if (lsCount > 0 && idbCount > 0 && lsCount !== idbCount) idb.mismatch.push({ lsKey, store, lsCount, idbCount, where: "LS fallback not cleared after IDB migration" });
        } catch {}
      }
      // Orphan assets: WB_IMAGES without board, SCAN without metadata — IDB canonical, LS legacy only (fix: đọc IDB whiteboard_boards, không đọc LS đã migrate)
      idb.orphanAssets = [];
      try {
        const referenced = new Set();
        // Ưu tiên IDB whiteboard_boards (canonical sau migration), fallback LS sgk_wb_index nếu IDB chưa có
        let boards = [];
        try { boards = await idx.getAll(STORES.WB_BOARDS); } catch {}
        if (!boards || boards.length === 0) {
          // Fallback legacy LS khi chưa migrate
          const wbIdx = safeGetString(STORAGE_KEYS.WB_INDEX, null);
          const boardIds = wbIdx ? (JSON.parse(wbIdx) || []).map((e) => e.id) : [];
          for (const bid of boardIds) {
            try {
              const raw = safeGetString(`${STORAGE_KEYS.WB_BOARD_PREFIX}${bid}`, null);
              if (!raw) continue;
              const board = JSON.parse(raw);
              boards.push(board);
            } catch {}
          }
        }
        for (const board of boards || []) {
          for (const o of board.objects || []) if (o?.imageId) referenced.add(o.imageId);
        }
        const wbImages = await idx.getAll(STORES.WB_IMAGES);
        for (const rec of wbImages || []) {
          if (rec?.id && !referenced.has(rec.id)) idb.orphanAssets.push({ store: STORES.WB_IMAGES, id: rec.id, where: "WB_IMAGES without board reference", size: rec.blob?.size || 0 });
        }
        const scans = await idx.getAll(STORES.SCAN);
        const scanMetaIds = new Set((safeGetString(STORAGE_KEYS.SCANS, null) ? (JSON.parse(safeGetString(STORAGE_KEYS.SCANS, null)) || []).map((s) => s.id) : []));
        for (const s of scans || []) if (s?.id && !scanMetaIds.has(s.id)) idb.orphanAssets.push({ store: STORES.SCAN, id: s.id, where: "SCAN asset without LS meta", bookId: s.bookId });
      } catch {}
    } catch {}
  }

  // ── KHBD mới (khbd_v2_*) + tồn dư kho cũ ──────────────────────────
  const khbd = { count: 0, bytes: 0, invalid: [], oversized: [], legacyKeys: [] };
  try {
    const raw = safeGetString(STORAGE_KEYS.KHBD_V2_PLANS, null);
    if (raw !== null) {
      khbd.bytes = raw.length;
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) khbd.invalid.push({ id: "(root)", reason: "khbd_v2_plans không phải mảng" });
        else {
          khbd.count = arr.length;
          arr.forEach((p, i) => {
            if (!p || typeof p !== "object" || !p.id) khbd.invalid.push({ id: `#${i}`, reason: "thiếu id" });
            else {
              if (!Array.isArray(p.hoatDong)) khbd.invalid.push({ id: p.id, reason: "thiếu hoatDong" });
              const size = JSON.stringify(p).length;
              if (size > 1024 * 1024) khbd.oversized.push({ id: p.id, title: p.title || "", bytes: size });
            }
          });
        }
      } catch (e) { khbd.invalid.push({ id: "(parse)", reason: "JSON hỏng: " + (e.message || e) }); }
    }
  } catch {}
  try {
    for (const k of allKeys) {
      if (k === STORAGE_KEYS.LESSON_PLANS || k === STORAGE_KEYS.LESSON_PLANS_LEGACY || k === STORAGE_KEYS.LESSON_PLANS_FAV || k.startsWith(STORAGE_KEYS.AUTOSAVE_PREFIX)) {
        khbd.legacyKeys.push({ key: k, bytes: (safeGetString(k, "") || "").length });
      }
    }
  } catch {}
  // ── totalErrors chỉ tính lỗi thực sự làm mất dữ liệu (corrupted/mismatch/perBookOrphans), orphanAssets là WARNING vương vãi cần dọn thủ công, không tính vào healthy
  const totalErrors = corrupted.length + schemaInvalid.length + perBookOrphans.length + (idb.mismatch?.length || 0);
  const orphanCount = idb.orphanAssets?.length || 0;
  const summary = {
    at,
    totalKeys: allKeys.length,
    corrupted: corrupted.length,
    schemaInvalid: schemaInvalid.length,
    unknownKeys: unknownKeys.length,
    perBookOrphans: perBookOrphans.length,
    idbMismatch: idb.mismatch?.length || 0,
    orphanAssets: orphanCount,
    quotaAvailable: quota.available,
    totalErrors,
    healthy: totalErrors === 0 && quota.available,
    hasWarnings: orphanCount > 0,
  };

  return {
    summary,
    corrupted,
    schemaInvalid,
    unknownKeys,
    otherKnownKeys,
    perBookOrphans,
    orphanAssets: idb.orphanAssets || [],
    backupMissing,
    quota,
    idb,
    allKeys,
    khbd,
  };
}

export function formatHealthReport(r) {
  const s = r.summary;
  const warn = s.hasWarnings ? ` | Cảnh báo vương vãi: ${s.orphanAssets}` : "";
  const lines = [`Tổng keys: ${s.totalKeys} | Lỗi: ${s.totalErrors}${warn} | Quota: ${s.quotaAvailable ? "OK" : "FAIL"} | ${s.healthy ? "Khỏe" : "Có lỗi"}`];
  if (r.corrupted.length) lines.push(`Corrupted JSON (${r.corrupted.length}): ` + r.corrupted.map(c => `${c.key} @${c.where}`).join(", "));
  if (r.schemaInvalid.length) lines.push(`Schema invalid (${r.schemaInvalid.length}): ` + r.schemaInvalid.map(c => c.key).join(", "));
  if (r.perBookOrphans.length) lines.push(`Orphan per-book (${r.perBookOrphans.length}): ` + r.perBookOrphans.slice(0, 5).map(o => o.key).join(", "));
  if (r.unknownKeys.length) lines.push(`Unknown/vương vãi (${r.unknownKeys.length}): ` + r.unknownKeys.slice(0, 5).map(u => u.key).join(", "));
  if (r.idb?.mismatch?.length) lines.push(`IDB/LS mismatch: ` + r.idb.mismatch.map(m => `${m.lsKey} LS=${m.lsCount} IDB=${m.idbCount}`).join(", "));
  if (r.orphanAssets?.length || r.idb?.orphanAssets?.length) {
    const oa = r.orphanAssets || r.idb?.orphanAssets || [];
    lines.push(`Vương vãi cần dọn thủ công (${oa.length}): ` + oa.slice(0,3).map(o=>`${o.store}:${o.id} @${o.where} size=${o.size||0}`).join(", ") + (oa.length>3?` +${oa.length-3} nữa`:""));
  }
  if (r.khbd) {
    const k = r.khbd;
    const kb = (k.bytes / 1024).toFixed(1);
    lines.push(`KHBD mới: ${k.count} bài (${kb}KB)` +
      (k.invalid.length ? ` | LỖI ${k.invalid.length}: ` + k.invalid.slice(0,3).map(x=>`${x.id} (${x.reason})`).join(", ") : " | hợp lệ") +
      (k.oversized.length ? ` | Nặng >1MB: ` + k.oversized.map(x=>`${x.title || x.id}`).join(", ") : "") +
      (k.legacyKeys.length ? ` | Tồn dư kho cũ: ${k.legacyKeys.length} key` : " | sạch kho cũ"));
  }
  return lines.join("\n");
}

// ── Auto-repair — dọn vương vãi + mismatch + autosave lỗi ──
export async function repairStorageHealth({ dryRun = false } = {}) {
  const before = await runStorageHealth({});
  const actions = [];
  const legacyUnknown = ["SGK_TEACHER_MODE", "favoriteTools", "recentTools", "recentActions", "coverPages_TLHT-GiA-o-da-c-mA-i-tr-a-ng-2025.pdf"];
  // 1. Xóa __corrupted__ backups cũ (>1 ngày hoặc quá 5 cái)
  for (const u of before.unknownKeys) {
    if (u.key.startsWith("__corrupted__")) {
      if (!dryRun) safeRemove(u.key);
      actions.push(`removed ${u.key}`);
    }
  }
  for (const k of legacyUnknown) {
    if (before.unknownKeys.some(u=>u.key===k) || before.allKeys.includes(k)) {
      if (!dryRun) safeRemove(k);
      actions.push(`removed legacy ${k}`);
    }
  }
  for (const k of before.allKeys) {
    if (k.startsWith("sgk_autosave_") && (k.includes("=>") || k.length > 80 || k.includes("C(e),"))) {
      if (!dryRun) safeRemove(k);
      actions.push(`removed malformed autosave ${k.slice(0,60)}...`);
    }
  }
  // 4. IDB/LS mismatch: LS fallback chưa xóa sau migrate → xóa LS để IDB làm canonical
  for (const m of before.idb?.mismatch || []) {
    if (m.lsKey === STORAGE_KEYS.CLIPS && m.idbCount >= m.lsCount) {
      if (!dryRun) {
        try {
          const { safeSetJSON } = await import("../safeStorage.js");
          // Đồng bộ LS = IDB (xóa LS nếu IDB đủ)
          const { default: idx } = await import("../indexedDB.js");
          const all = await idx.getAll(m.store);
          safeSetJSON(m.lsKey, []); // clear LS, IDB là nguồn chính
        } catch {}
      }
      actions.push(`cleared LS ${m.lsKey} (IDB ${m.idbCount} canonical)`);
    }
  }
  const after = dryRun ? before : await runStorageHealth({});
  return { before, after, actions, dryRun };
}

export default { runStorageHealth, formatHealthReport, repairStorageHealth };
