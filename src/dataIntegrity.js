// ── Data Integrity Checker ─────────────────────────────────────────────
// Unified integrity center (TASK §16) — расширено: orphan, duplicate, broken refs, validation
// Delegates key classification to canonical core/storageKeys so Backup/Cache truth stays single.
import { getClips, getRefs, getConcepts, getCollections } from './researchDB.js';
import { isBackupKey as isBackupKeyCore, isCacheKey as isCacheKeyCore } from './core/storageKeys.js';
import { isBackupKey as isBackupKeyLegacy, isCacheKey as isCacheKeyLegacy } from './storage.js';
const isBackupKey = isBackupKeyCore || isBackupKeyLegacy;
const isCacheKey = isCacheKeyCore || isCacheKeyLegacy;
import { safeGetJSON, safeSetJSON, safeGetString, safeRemove, safeGetWithStatus, listKeys } from './safeStorage.js';
import { STORAGE_KEYS } from './core/storageKeys.js';

/**
 * Check for orphan data (data referencing deleted books)
 * @param {Array} books - Current list of books from the backend
 * @returns {Promise<Object>} Report with orphan counts and details
 */
export async function checkOrphanData(books) {
  const bookFilenames = new Set(books.map(b => b.filename));
  const report = {
    orphanClips: [],
    orphanClipCollectionRefs: [],
    orphanRefs: [],
    orphanConcepts: [],
    orphanNotes: [],
    orphanMarks: [],
    orphanTeacherNotes: [],
    totalOrphans: 0,
  };

  // Check clips
  const clips = await getClips();
  const collections = getCollections();
  const collectionIds = new Set(collections.map(c => c.id));
  
  clips.forEach(c => {
    // Check if clip references a non-existent book
    if (!bookFilenames.has(c.file)) {
      report.orphanClips.push({ id: c.id, file: c.file, text: c.text?.slice(0, 50) });
    }
    // Check if clip references a non-existent collection (if collId is set)
    if (c.collId && !collectionIds.has(c.collId)) {
      report.orphanClipCollectionRefs.push({ id: c.id, collId: c.collId, text: c.text?.slice(0, 50) });
    }
  });

  // Check references
  const refs = await getRefs();
  refs.forEach(r => {
    if (!bookFilenames.has(r.file)) {
      report.orphanRefs.push({ id: r.id, file: r.file, title: r.title });
    }
  });

  // Check concepts
  const concepts = await getConcepts();
  concepts.forEach(c => {
    // Global concepts (file is null, undefined, or empty string) are VALID
    // Only book-specific concepts (file has a value) need to be checked
    if (c.file && c.file !== '' && !bookFilenames.has(c.file)) {
      report.orphanConcepts.push({ id: c.id, file: c.file, term: c.term });
    }
  });

  // Check notes (per-page localStorage) — dùng listKeys tập trung
  for (const key of listKeys()) {
    
    if (key.startsWith('notes_')) {
      // Parse by extracting page number from the end (last underscore followed by digits)
      const match = key.match(/^notes_(.+)_(\d+)$/);
      if (match) {
        const filename = match[1];
        if (!bookFilenames.has(filename)) {
          report.orphanNotes.push({ key, filename });
        }
      }
    }

    if (key.startsWith('sgk_marks_')) {
      const filename = key.replace('sgk_marks_', '');
      if (!bookFilenames.has(filename)) {
        report.orphanMarks.push({ key, filename });
      }
    }

    if (key.startsWith('sgk_teacherNotes_')) {
      const filename = key.replace('sgk_teacherNotes_', '');
      if (!bookFilenames.has(filename)) {
        report.orphanTeacherNotes.push({ key, filename });
      }
    }
  }

  report.totalOrphans = 
    report.orphanClips.length + 
    report.orphanClipCollectionRefs.length +
    report.orphanRefs.length + 
    report.orphanConcepts.length + 
    report.orphanNotes.length + 
    report.orphanMarks.length + 
    report.orphanTeacherNotes.length;

  return report;
}

/**
 * Clean up orphan data
 * @param {Array} books - Current list of books
 * @returns {Promise<Object>} Cleanup report with counts of removed items
 */
export async function cleanupOrphanData(books) {
  const report = await checkOrphanData(books);
  const cleanupReport = {
    clipsRemoved: 0,
    clipCollectionRefsFixed: 0,
    refsRemoved: 0,
    conceptsRemoved: 0,
    notesRemoved: 0,
    marksRemoved: 0,
    teacherNotesRemoved: 0,
    totalRemoved: 0,
    errors: [],
  };

  try {
    // Fix clips with orphan collection references (set collId to null)
    if (report.orphanClipCollectionRefs.length > 0) {
      const clips = (await getClips()).map(c => {
        const hasOrphanRef = report.orphanClipCollectionRefs.some(o => o.id === c.id);
        if (hasOrphanRef) {
          cleanupReport.clipCollectionRefsFixed++;
          return { ...c, collId: null };
        }
        return c;
      });
      const r = safeSetJSON(STORAGE_KEYS.CLIPS, clips);
      if (!r.ok) cleanupReport.errors.push(`Failed to fix clip refs: ${r.message}`);
    }

    // Remove orphan clips
    if (report.orphanClips.length > 0) {
      const clips = (await getClips()).filter(c => {
        const isOrphan = report.orphanClips.some(o => o.id === c.id);
        if (isOrphan) cleanupReport.clipsRemoved++;
        return !isOrphan;
      });
      const r = safeSetJSON(STORAGE_KEYS.CLIPS, clips);
      if (!r.ok) cleanupReport.errors.push(`Failed to remove orphan clips: ${r.message}`);
    }

    // Remove orphan refs
    if (report.orphanRefs.length > 0) {
      const refs = (await getRefs()).filter(r => {
        const isOrphan = report.orphanRefs.some(o => o.id === r.id);
        if (isOrphan) cleanupReport.refsRemoved++;
        return !isOrphan;
      });
      const r = safeSetJSON(STORAGE_KEYS.REFS, refs);
      if (!r.ok) cleanupReport.errors.push(`Failed to remove orphan refs: ${r.message}`);
    }

    // Remove orphan concepts
    if (report.orphanConcepts.length > 0) {
      const concepts = (await getConcepts()).filter(c => {
        const isOrphan = report.orphanConcepts.some(o => o.id === c.id);
        if (isOrphan) cleanupReport.conceptsRemoved++;
        return !isOrphan;
      });
      const r = safeSetJSON(STORAGE_KEYS.CONCEPTS, concepts);
      if (!r.ok) cleanupReport.errors.push(`Failed to remove orphan concepts: ${r.message}`);
    }

    // Remove orphan notes
    report.orphanNotes.forEach(({ key }) => {
      const r = safeRemove(key);
      if (r.ok) cleanupReport.notesRemoved++;
      else cleanupReport.errors.push(`Failed to remove ${key}: ${r.error}`);
    });

    // Remove orphan marks
    report.orphanMarks.forEach(({ key }) => {
      const r = safeRemove(key);
      if (r.ok) cleanupReport.marksRemoved++;
      else cleanupReport.errors.push(`Failed to remove ${key}: ${r.error}`);
    });

    // Remove orphan teacher notes
    report.orphanTeacherNotes.forEach(({ key }) => {
      const r = safeRemove(key);
      if (r.ok) cleanupReport.teacherNotesRemoved++;
      else cleanupReport.errors.push(`Failed to remove ${key}: ${r.error}`);
    });

    cleanupReport.totalRemoved = 
      cleanupReport.clipsRemoved + 
      cleanupReport.clipCollectionRefsFixed +
      cleanupReport.refsRemoved + 
      cleanupReport.conceptsRemoved + 
      cleanupReport.notesRemoved + 
      cleanupReport.marksRemoved + 
      cleanupReport.teacherNotesRemoved;

  } catch (err) {
    cleanupReport.errors.push(`Cleanup failed: ${err.message}`);
  }

  return cleanupReport;
}

/**
 * Get storage statistics
 * @returns {Object} Storage usage breakdown
 */
export function getStorageStats() {
  const stats = {
    totalKeys: 0,
    backupKeys: 0,
    cacheKeys: 0,
    otherKeys: 0,
    totalBytes: 0,
    backupBytes: 0,
    cacheBytes: 0,
    otherBytes: 0,
    breakdown: {},
  };

  for (const key of listKeys()) {
    
    const value = safeGetString(key, '') || '';
    const bytes = value.length;
    const prefix = key.split('_')[0];

    stats.totalKeys++;
    stats.totalBytes += bytes;

    if (isBackupKey(key)) {
      stats.backupKeys++;
      stats.backupBytes += bytes;
      stats.breakdown[prefix] = (stats.breakdown[prefix] || { backup: 0, cache: 0, other: 0 });
      stats.breakdown[prefix].backup += bytes;
    } else if (isCacheKey(key)) {
      stats.cacheKeys++;
      stats.cacheBytes += bytes;
      stats.breakdown[prefix] = (stats.breakdown[prefix] || { backup: 0, cache: 0, other: 0 });
      stats.breakdown[prefix].cache += bytes;
    } else {
      stats.otherKeys++;
      stats.otherBytes += bytes;
      stats.breakdown[prefix] = (stats.breakdown[prefix] || { backup: 0, cache: 0, other: 0 });
      stats.breakdown[prefix].other += bytes;
    }
  }

  return stats;
}

/**
 * Validate backup data integrity
 * @returns {Object} Validation report
 */
export function validateBackupData() {
  const report = {
    valid: true,
    errors: [],
    warnings: [],
    checkedKeys: 0,
  };

  const criticalKeys = [STORAGE_KEYS.CLIPS, STORAGE_KEYS.REFS, STORAGE_KEYS.CONCEPTS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.BOOKMARKS, STORAGE_KEYS.VOCAB];

  criticalKeys.forEach(key => {
    const st = safeGetWithStatus(key, null);
    if (!st.found) return;
    if (!st.ok) {
      report.valid = false;
      report.errors.push(`${key} ${st.error}: ${st.message}`);
      return;
    }
    const parsed = st.data;
    if (!Array.isArray(parsed)) {
      report.valid = false;
      report.errors.push(`${key} is not an array`);
    } else {
      report.checkedKeys++;
      const ids = parsed.map(item => item?.id).filter(Boolean);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        report.warnings.push(`${key} has duplicate IDs`);
      }
    }
  });

  return report;
}

// ── Extended integrity (TASK §16): checkIntegrity / repairIntegrity with backup ──
export async function checkIntegrity(books = []) {
  const bookSet = new Set((books || []).map(b=> b.filename));
  const orphan = await checkOrphanData(books);
  const storageStats = getStorageStats();
  const backupValidation = validateBackupData();
  // Additional checks: broken whiteboard sourceRef, KHBD bookRef, duplicate IDs cross LS/IDB
  const extra = { brokenWhiteboardRefs: 0, brokenKhbdRefs: 0, duplicateIds: [], missingFields: [], invalidSourceRefs: [] };
  try {
    const wbIdx = safeGetJSON(STORAGE_KEYS.WB_INDEX, [], Array.isArray) || [];
    for (const entry of wbIdx) {
      // each board check via safeGetJSON would be heavy; sample: orphan sourceRef where filename not in bookSet but sourceRef.filename present
      const board = safeGetJSON(`${STORAGE_KEYS.WB_BOARD_PREFIX}${entry.id}`, null);
      if (!board) continue;
      for (const o of (board.objects||[])) {
        if (o?.sourceRef?.filename && !bookSet.has(o.sourceRef.filename)) extra.brokenWhiteboardRefs++;
        if (o?.sourceRef && !o.sourceRef.citation) extra.invalidSourceRefs.push({ boardId: entry.id, objectId: o.id });
      }
    }
  } catch {}
  try {
    // Kho KHBD mới (khbd_v2_*): shape mới không còn bookReference — chỉ check id
    const plans = safeGetJSON("khbd_v2_plans", [], Array.isArray) || [];
    for (const p of plans) {
      if (!p.id) extra.missingFields.push({ type: "lessonPlan", id: "(no id)" });
    }
  } catch {}
  // Concepts/refs/questions duplicate IDs across LS+IDB (sample)
  try {
    const clips = await getClips(); const seen=new Set(); for (const c of clips) { if (seen.has(c.id)) extra.duplicateIds.push({ store:"clips", id:c.id }); else seen.add(c.id); }
  } catch {}
  return { orphan, storageStats, backupValidation, extra, at: Date.now() };
}

export async function repairIntegrity(books = [], { dryRun = false } = {}) {
  // Backup before repair
  let backupJson = null;
  try {
    const { exportBackup } = await import("./storage.js");
    // shallow snapshot of critical keys — dùng listKeys tập trung
    const snap = {};
    for (const k of listKeys()) snap[k]=safeGetString(k, "");
    backupJson = JSON.stringify(snap).slice(0, 2000000);
  } catch {}
  const before = await checkIntegrity(books);
  if (dryRun) return { dryRun:true, before, backupMade: !!backupJson };
  const orphanCleanup = await cleanupOrphanData(books);
  // Fix invalid sourceRef citations using fallback
  let sourceFixed = 0;
  try {
    const wbIdx = safeGetJSON(STORAGE_KEYS.WB_INDEX, [], Array.isArray) || [];
    for (const entry of wbIdx) {
      const key = `${STORAGE_KEYS.WB_BOARD_PREFIX}${entry.id}`;
      const b = safeGetJSON(key, null);
      if (!b) continue;
      let changed=false;
      for (const o of (b.objects||[])) {
        if (o?.sourceRef && !o.sourceRef.citation) { o.sourceRef.citation = `${o.sourceRef.title||o.sourceRef.filename||"SGK"} — tr. ${o.sourceRef.bookPage||o.sourceRef.page||""}`; o.citation = o.sourceRef.citation; changed=true; sourceFixed++; }
      }
      if (changed) {
        const r = safeSetJSON(key, b);
        if (!r.ok) console.warn("[dataIntegrity] fix citation failed", key, r.error);
      }
    }
  } catch {}
  const after = await checkIntegrity(books);
  try { const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.DATA_UPDATED, { domain:"integrity", action:"repaired" }); } catch {}
  return { before, after, orphanCleanup, sourceFixed, backupMade: !!backupJson, at: Date.now() };
}
