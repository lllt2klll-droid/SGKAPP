// ── Research data layer: page marks (CTGDPT 2018 tags), clip collections,
// reference bibliography, personal concept notebook, citation helpers. ──
import { readJSON, saveJSON, saveBatch, getList, addItem, updateItem, removeItem, makeId, now } from './storage.js';
import { safeGetJSON, safeSetJSON, safeGetString, safeRemove } from './safeStorage.js';
import { findTocBook } from './tocData.js';
import indexedDBService, { STORES } from './indexedDB.js';
import { emitClipCreated, emitConceptCreated, emitEvidenceCreated, emitNoteCreated, emitReferenceCreated } from './missionEvents.js';

// Helper to merge localStorage and IndexedDB data for indexed lists
async function getMergedIndexedList({
  store,
  localKey,
  sortFn,
}) {
  const localItems = _safeGetList(localKey);

  if (!indexedDBService.constructor.isAvailable()) {
    return [...localItems].sort(sortFn);
  }

  try {
    const indexedItems = await indexedDBService.getAll(store);

    const merged = new Map();

    for (const item of localItems) {
      if (item?.id) {
        merged.set(item.id, item);
      }
    }

    for (const item of indexedItems) {
      if (item?.id) {
        merged.set(item.id, item);
      }
    }

    return [...merged.values()].sort(sortFn);
  } catch (err) {
    console.error(`Failed merged read for ${localKey}:`, err);
    return [...localItems].sort(sortFn);
  }
}

import { appEvents, AppEvents, DataDomains } from "./core/appEvents.js";
function notifyDataUpdated(detail) {
  const d = detail || { source: "researchDB" };
  try { appEvents.emit(AppEvents.DATA_UPDATED, d); } catch (e) { console.warn("[researchDB] appEvents emit failed", e); }
}
// ── safeStorage helpers (audit) ──
function _safeGetList(key){ return safeGetJSON(key, [], Array.isArray); }
function _safeGetObj(key){ return safeGetJSON(key, {}, v=>v&&typeof v==="object" && !Array.isArray(v)); }
function _updateItemSafe(key, id, patch){ const list=_safeGetList(key); return list.map(it=> it.id===id?{...it,...patch,id:it.id}:it); }
function _addItemSafe(key, item){ const list=_safeGetList(key); return [item,...list]; }
function _safeSave(key, value){
  const res=safeSetJSON(key, value);
  if(!res.ok){ if(res.quota) console.warn("[safeStorage] QuotaExceededError on", key, "-", res.message); else console.warn("[safeStorage] save failed for", key, ":", res.error, res.message); return false; }
  return true;
}
// Helper to handle saveJSON errors consistently — safeStorage audit
function safeSave(key, value, operation = 'save') {
  const res = safeSetJSON(key, value);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] QuotaExceededError on", key, "-", res.message);
    else console.warn("[safeStorage] save failed for", key, ":", res.error, res.message);
    console.error(`Failed to ${operation} ${key}:`, res.error || res.message);
    return false;
  }
  notifyDataUpdated({ source: "researchDB", key, operation });
  return true;
}

// ────────────────────────────────────────────────────────────────────
// PAGE MARKS (gắn thẻ theo chuẩn CTGDPT 2018 trên từng trang)
// Key: sgk_marks_<filename> → { [pdfPage]: Mark }
// Mark = { yccd: string[], mach: string, mucdo: string, tieuDe: string,
//          tiet: string, thietBi: string[], ghiChu: string, at: number }
// ────────────────────────────────────────────────────────────────────
export function getMarksFor(book) {
  // per-book keys isolation: sgk_marks_\${book.filename}
  return _safeGetObj(`sgk_marks_${book.filename}`);
}

export function getPageMark(book, pdfPage) {
  return getMarksFor(book)[pdfPage] || null;
}

export function savePageMark(book, pdfPage, mark) {
  const all = getMarksFor(book);
  if (mark && (mark.yccd?.length || mark.mach || mark.mucdo || mark.tieuDe || mark.tiet || mark.thietBi?.length || mark.ghiChu)) {
    all[pdfPage] = { ...mark, at: now() };
  } else {
    delete all[pdfPage];
  }
  safeSave(`sgk_marks_${book.filename}`, all, 'save page mark');
  return all;
}

export function clearMarksForBook(book) {
  safeSave(`sgk_marks_${book.filename}`, {}, 'clear marks');
}

export function listMarks(book) {
  return Object.entries(getMarksFor(book))
    .map(([p, m]) => ({ page: parseInt(p, 10), ...m }))
    .sort((a, b) => a.page - b.page);
}

export function countMarks(book) { return listMarks(book).length; }

// ────────────────────────────────────────────────────────────────────
// TEACHER NOTES (ghi chú dạy học riêng per book — không đồng bộ với AI/cloud)
// NoteKey = sgk_teacherNotes_<filename> → { [page]: { title, note, at } }
// Sử dụng cho: điểm nhấn, câu hỏi để đặt, ví dụ thực tế, lỗi thường gặp, ý tưởng sau clase
// ────────────────────────────────────────────────────────────────────
export function getTeacherNotes(book) {
  // per-book isolation: sgk_teacherNotes_\${book.filename}
  return _safeGetObj(`sgk_teacherNotes_${book.filename}`);
}

export function saveTeacherNote(book, pdfPage, noteData) {
  const all = getTeacherNotes(book);
  const isNew = !(all[pdfPage]) && noteData && noteData.title !== '';
  if (noteData && noteData.title !== '') {
    all[pdfPage] = { ...noteData, at: now() };
  } else {
    delete all[pdfPage];
  }
  safeSave(`sgk_teacherNotes_${book.filename}`, all, 'save teacher note');
  // Đồng bộ nhiệm vụ: ghi chú dạy học = NOTE_CREATED (chỉ khi tạo mới)
  if(isNew){
    try{ emitNoteCreated(book.filename, pdfPage); }catch(e){ console.warn("[researchDB] emitNoteCreated failed", e); }
  }
  return all;
}

export function clearTeacherNotesForBook(book) {
  safeSave(`sgk_teacherNotes_${book.filename}`, {}, 'clear teacher notes');
}

export function listTeacherNotes(book) {
  return Object.entries(getTeacherNotes(book))
    .map(([p, n]) => ({ page: parseInt(p, 10), title: n.title, note: n.note, at: n.at }))
    .sort((a, b) => a.page - b.page);
}

// ────────────────────────────────────────────────────────────────────
// COLLECTIONS + CLIPS (bộ sưu tập trích đoạn theo chủ đề nghiên cứu)
// Collection = { id, name, desc, at }
// Clip = { id, collId, file, bookTitle, grade, subject, page (PDF), text, at }
// ────────────────────────────────────────────────────────────────────
const COLL_KEY = 'sgk_collections';
const CLIP_KEY = 'sgk_clips';

export function getCollections() { return _safeGetList(COLL_KEY); }
export function getCollection(id) { return getCollections().find(c => c.id === id) || null; }
export function addCollection(name, desc = '') {
  const item = { id: makeId('coll'), name: String(name).trim(), desc: String(desc).trim(), at: now() };
  safeSave(COLL_KEY, _addItemSafe(COLL_KEY, item), 'add collection');
  return item;
}
export function updateCollection(id, patch) { safeSave(COLL_KEY, _updateItemSafe(COLL_KEY, id, patch), 'update collection'); }
export async function deleteCollection(id) {
  const clips = await getClips();

  const clipsToDelete = clips.filter(
    clip => clip.collId === id
  );

  for (const clip of clipsToDelete) {
    await deleteClip(clip.id);
  }

  const nextCollections = getCollections().filter(
    collection => collection.id !== id
  );

  safeSave(
    COLL_KEY,
    nextCollections,
    'delete collection'
  );

  return true;
}
export function renameCollection(id, name, desc) { updateCollection(id, { name: String(name).trim(), desc: String(desc).trim() }); }

export async function getClips() {
  return getMergedIndexedList({
    store: STORES.CLIPS,
    localKey: CLIP_KEY,
    sortFn: (a, b) => (b.at || 0) - (a.at || 0),
  });
}

export async function addClip({ collId, file, bookTitle, grade, subject, page, text, chapter }) {
  if (!collId || !file || !text) return null;
  const item = {
    id: makeId('clip'),
    collId,
    file,
    bookTitle: String(bookTitle || ''),
    grade: grade || 1,
    subject: String(subject || ''),
    page: parseInt(page, 10) || 1,
    text: String(text).trim().slice(0, 6000),
    chapter: String(chapter || ''),
    at: now(),
  };

  let saved = false;

  if (indexedDBService.constructor.isAvailable()) {
    try {
      saved = await indexedDBService.set(STORES.CLIPS, item.id, item);

      if (!saved) {
        throw new Error('IndexedDB returned false');
      }

      // Only remove fallback copy AFTER successful IndexedDB write.
      try {
        const localClips = _safeGetList(CLIP_KEY);
        const updated = localClips.filter(c => c.id !== item.id);
        { const _r=safeSetJSON(CLIP_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", CLIP_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", CLIP_KEY, ":", _r.error); } }
      } catch (e) { console.warn("[researchDB] operation failed", e); }
    } catch (err) {
      console.error('IndexedDB clip write failed, using localStorage fallback:', err);
      safeSave(CLIP_KEY, _addItemSafe(CLIP_KEY, item), 'add clip');
    }
  }

  if (!indexedDBService.constructor.isAvailable()) {
    safeSave(CLIP_KEY, _addItemSafe(CLIP_KEY, item), 'add clip');
  }

  // Evidence creation must never make the clip itself disappear.
  try {
    await addEvidence({
      type: 'clip',
      sourceId: item.id,
      file: item.file,
      page: item.page,
      text: item.text?.slice(0, 500),
    });
  } catch (err) {
    console.error('Failed to create evidence for clip:', err);
  }
  try{ emitClipCreated(item.id); }catch(e){ console.warn("[researchDB] emitClipCreated failed", e); }
  return item;
}

export async function updateClip(id, patch) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const existing = await indexedDBService.get(STORES.CLIPS, id);
      if (existing) {
        const updated = { ...existing, ...patch, id };
        const ok = await indexedDBService.set(STORES.CLIPS, id, updated);

        if (!ok) {
          throw new Error('IndexedDB update returned false');
        }

        return true;
      }
    } catch (err) {
      console.error('IndexedDB clip update failed, falling back to localStorage:', err);
    }
  }
  safeSave(CLIP_KEY, _updateItemSafe(CLIP_KEY, id, patch), 'update clip');
  return true;
}

export async function deleteClip(id) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const deleted = await indexedDBService.delete(STORES.CLIPS, id);
      
      if (deleted) {
        try {
          const localClips = _safeGetList(CLIP_KEY);
          const updated = localClips.filter(c => c.id !== id);
          { const _r=safeSetJSON(CLIP_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", CLIP_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", CLIP_KEY, ":", _r.error); } }
        } catch (e) { console.warn("[researchDB] operation failed", e); }
        
        return true;
      }
    } catch (err) {
      console.error('IndexedDB clip delete failed, falling back to localStorage:', err);
    }
  }
  
  const localClips = _safeGetList(CLIP_KEY);
  const updated = localClips.filter(c => c.id !== id);
  safeSave(CLIP_KEY, updated, 'delete clip');
  
  return true;
}

export async function moveClip(id, collId) { await updateClip(id, { collId }); }
export async function clipsOf(col) { 
  const clips = await getClips();
  return clips.filter(c => c.collId === col.id).sort((a, b) => b.at - a.at); 
}
export async function clipsForBook(file) { 
  const clips = await getClips();
  return clips.filter(c => c.file === file); 
}

// ── IndexedDB migration helpers for clips ─────────────────────────────
// These functions can be used to migrate clips from localStorage to IndexedDB
export async function migrateClipsToIndexedDB() {
  if (!indexedDBService.constructor.isAvailable()) {
    console.debug('IndexedDB not available, skipping clips migration');
    return false;
  }
  
  try {
    const localClips = _safeGetList(CLIP_KEY);
    if (localClips.length === 0) {
      console.debug('No clips to migrate');
      return true;
    }
    
    console.debug(`Migrating ${localClips.length} clips to IndexedDB...`);
    for (const clip of localClips) {
      const ok = await indexedDBService.set(STORES.CLIPS, clip.id, clip);
      if (!ok) {
        throw new Error(`Không thể migrate clip ${clip.id}`);
      }
    }
    
    // Only clear localStorage after all IndexedDB writes succeed
    { const _r=safeSetJSON(CLIP_KEY, []); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", CLIP_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", CLIP_KEY, ":", _r.error); } }
    
    console.debug('Clips migration completed');
    return true;
  } catch (err) {
    console.error('Clips migration failed:', err);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
// REFERENCES (thư mục tài liệu tham khảo — tự động + tay)
// Ref = { id, authors, year, title, publisher, place, note, source: 'auto'|'manual', file?, at, metadataStatus: 'unverified'|'verified' }
// ────────────────────────────────────────────────────────────────────
const REF_KEY = 'sgk_refs';

export async function getRefs() {
  return getMergedIndexedList({
    store: STORES.REFS,
    localKey: REF_KEY,
    sortFn: (a, b) =>
      (a.authors || '').localeCompare(
        b.authors || '',
        'vi'
      ) ||
      Number(a.year || 0) - Number(b.year || 0),
  });
}

export async function getRefForBook(book) {
  const refs = await getRefs();
  return refs.find(r => r.file === book.filename) || null;
}

export async function upsertBookRef(book) {
  const list = await getRefs();
  const existing = list.find(r => r.file === book.filename);
  const title = `${book.title} — Sách giáo khoa, bộ sách "Kết nối tri thức với cuộc sống"`;
  const data = {
    authors: 'Bộ Giáo dục và Đào tạo',
    year: book.subject === 'Toán' ? 2022 : 2023,
    title,
    publisher: 'NXB Giáo dục Việt Nam',
    place: 'Hà Nội',
    source: 'auto',
    file: book.filename,
    grade: book.grade,
    subject: book.subject,
    term: book.term,
    metadataStatus: 'unverified',
  };
  let next;
  if (existing) {
    next = list.map(r => (r.id === existing.id ? { ...existing, ...data, source: existing.source, metadataStatus: existing.metadataStatus || 'unverified' } : r));
  } else {
    next = _addItemSafe(REF_KEY, { ...data, id: makeId('ref'), at: now() });
  }

  if (indexedDBService.constructor.isAvailable()) {
    try {
      const item = next.find(r => r.file === book.filename);
      if (item) {
        const ok = await indexedDBService.set(STORES.REFS, item.id, item);

        if (!ok) {
          throw new Error('IndexedDB reference write returned false');
        }

        try {
          const localRefs = _safeGetList(REF_KEY);
          const updated = localRefs.filter(r => r.id !== item.id);
          { const _r=safeSetJSON(REF_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", REF_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", REF_KEY, ":", _r.error); } }
        } catch (e) { console.warn("[researchDB] operation failed", e); }
        return item;
      }
    } catch (err) {
      console.error('IndexedDB ref write failed, falling back to localStorage:', err);
    }
  }
  safeSave(REF_KEY, next, 'upsert book ref');
  return next.find(r => r.file === book.filename);
}

export async function addManualRef(ref) {
  const item = { ...ref, id: makeId('ref'), source: 'manual', metadataStatus: 'verified', at: now() };

  if (indexedDBService.constructor.isAvailable()) {
    try {
      const ok = await indexedDBService.set(STORES.REFS, item.id, item);

      if (!ok) {
        throw new Error('IndexedDB reference write returned false');
      }

      try {
        const localRefs = _safeGetList(REF_KEY);
        const updated = localRefs.filter(r => r.id !== item.id);
        { const _r=safeSetJSON(REF_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", REF_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", REF_KEY, ":", _r.error); } }
      } catch (e) { console.warn("[researchDB] operation failed", e); }
      try{ emitReferenceCreated(item.id); }catch(e){ console.warn("[researchDB] emitReferenceCreated failed", e); }
      return item;
    } catch (err) {
      console.error('IndexedDB ref write failed, falling back to localStorage:', err);
    }
  }
  safeSave(REF_KEY, _addItemSafe(REF_KEY, item), 'add manual ref');
  try{ emitReferenceCreated(item.id); }catch(e){ console.warn("[researchDB] emitReferenceCreated failed", e); }
  return item;
}

export async function updateRef(id, patch) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const existing = await indexedDBService.get(STORES.REFS, id);
      if (existing) {
        const updated = { ...existing, ...patch, id };
        const ok = await indexedDBService.set(STORES.REFS, id, updated);

        if (!ok) {
          throw new Error('IndexedDB reference update returned false');
        }

        return true;
      }
    } catch (err) {
      console.error('IndexedDB ref update failed, falling back to localStorage:', err);
    }
  }
  safeSave(REF_KEY, _updateItemSafe(REF_KEY, id, patch), 'update ref');
  return true;
}

export async function verifyRefMetadata(id) {
  await updateRef(id, { metadataStatus: 'verified' });
}

export async function deleteRef(id) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      await indexedDBService.delete(STORES.REFS, id);
      try {
        const localRefs = _safeGetList(REF_KEY);
        const updated = localRefs.filter(r => r.id !== id);
        { const _r=safeSetJSON(REF_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", REF_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", REF_KEY, ":", _r.error); } }
      } catch (e) { console.warn("[researchDB] operation failed", e); }
      return;
    } catch (err) {
      console.error('IndexedDB ref delete failed, falling back to localStorage:', err);
    }
  }
  safeSave(REF_KEY, _safeGetList(REF_KEY).filter(r => r.id !== id), 'delete ref');
}

// ── IndexedDB migration helpers for refs ─────────────────────────────
export async function migrateRefsToIndexedDB() {
  if (!indexedDBService.constructor.isAvailable()) {
    console.debug('IndexedDB not available, skipping refs migration');
    return false;
  }
  
  try {
    const localRefs = _safeGetList(REF_KEY);
    if (localRefs.length === 0) {
      console.debug('No refs to migrate');
      return true;
    }
    
    console.debug(`Migrating ${localRefs.length} refs to IndexedDB...`);
    for (const ref of localRefs) {
      const ok = await indexedDBService.set(STORES.REFS, ref.id, ref);
      if (!ok) {
        throw new Error(`Không thể migrate ref ${ref.id}`);
      }
    }
    
    // Only clear localStorage after all IndexedDB writes succeed
    { const _r=safeSetJSON(REF_KEY, []); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", REF_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", REF_KEY, ":", _r.error); } }
    
    console.debug('Refs migration completed');
    return true;
  } catch (err) {
    console.error('Refs migration failed:', err);
    return false;
  }
}

// ── Bibliography formatting (APA-ish style cho tiếng Việt) ─────────
export function formatRef(r) {
  const verdict = r?.authors?.trim();
  const year = r?.year ? `(${r.year}).` : '';
  const title = r?.title?.trim();
  const pub = [r?.place?.trim(), r?.publisher?.trim()].filter(Boolean).join(': ');
  return [verdict, year, title, pub].filter(Boolean).join(' ');
}

// ────────────────────────────────────────────────────────────────────
// EVIDENCE SYSTEM (bằng chứng cho nghiên cứu - AI grounding)
// Evidence = { id, type: 'clip'|'page'|'concept'|'ref', sourceId, file, page?, text?, at, verified: boolean }
// Purpose: Track all evidence used in AI analysis to prevent hallucination
// ────────────────────────────────────────────────────────────────────
const EVIDENCE_KEY = 'sgk_evidence';

export async function getEvidence() {
  return getMergedIndexedList({
    store: STORES.EVIDENCE,
    localKey: EVIDENCE_KEY,
    sortFn: (a, b) => (b.at || 0) - (a.at || 0),
  });
}

export async function addEvidence(evidence) {
  const item = {
    ...evidence,
    id: makeId('ev'),
    verified: false,
    at: now()
  };

  if (indexedDBService.constructor.isAvailable()) {
    try {
      const ok = await indexedDBService.set(STORES.EVIDENCE, item.id, item);

      if (!ok) {
        throw new Error('IndexedDB evidence write returned false');
      }

      try {
        const localEvidence = _safeGetList(EVIDENCE_KEY);
        const updated = localEvidence.filter(e => e.id !== item.id);
        { const _r=safeSetJSON(EVIDENCE_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", EVIDENCE_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", EVIDENCE_KEY, ":", _r.error); } }
      } catch (e) { console.warn("[researchDB] operation failed", e); }
      // Đồng bộ nhiệm vụ: emit cả khi lưu IDB thành công (trước đây chỉ emit ở fallback)
      try{ emitEvidenceCreated(item.id); }catch(e){ console.warn("[researchDB] emitEvidenceCreated failed", e); }
      return item;
    } catch (err) {
      console.error('IndexedDB evidence write failed, falling back to localStorage:', err);
    }
  }
  safeSave(EVIDENCE_KEY, _addItemSafe(EVIDENCE_KEY, item), 'add evidence');
  try{ emitEvidenceCreated(item.id); }catch(e){ console.warn("[researchDB] emitEvidenceCreated failed", e); }
  return item;
}

export async function verifyEvidence(id) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const existing = await indexedDBService.get(STORES.EVIDENCE, id);
      if (existing) {
        const updated = { ...existing, verified: true, id };
        const ok = await indexedDBService.set(STORES.EVIDENCE, id, updated);

        if (!ok) {
          throw new Error('IndexedDB evidence update returned false');
        }

        return true;
      }
    } catch (err) {
      console.error('IndexedDB evidence update failed, falling back to localStorage:', err);
    }
  }

  const updated = _updateItemSafe(EVIDENCE_KEY, id, { verified: true });
  safeSave(EVIDENCE_KEY, updated, 'verify evidence');

  return true;
}

export async function getEvidenceForSource(sourceType, sourceId) {
  const evidence = await getEvidence();
  return evidence.filter(e => e.type === sourceType && e.sourceId === sourceId);
}

// ── IndexedDB migration helpers for evidence ─────────────────────────
export async function migrateEvidenceToIndexedDB() {
  if (!indexedDBService.constructor.isAvailable()) {
    console.debug('IndexedDB not available, skipping evidence migration');
    return false;
  }
  
  try {
    const localEvidence = _safeGetList(EVIDENCE_KEY);
    if (localEvidence.length === 0) {
      console.debug('No evidence to migrate');
      return true;
    }
    
    console.debug(`Migrating ${localEvidence.length} evidence items to IndexedDB...`);
    for (const ev of localEvidence) {
      const ok = await indexedDBService.set(STORES.EVIDENCE, ev.id, ev);
      if (!ok) {
        throw new Error(`Không thể migrate evidence ${ev.id}`);
      }
    }
    
    // Only clear localStorage after all IndexedDB writes succeed
    { const _r=safeSetJSON(EVIDENCE_KEY, []); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", EVIDENCE_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", EVIDENCE_KEY, ":", _r.error); } }
    
    console.debug('Evidence migration completed');
    return true;
  } catch (err) {
    console.error('Evidence migration failed:', err);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
// CONCEPTS (sổ khái niệm riêng — ghi tay, không phụ thuộc AI)
// Concept = { id, term, definition, category, file?, page?, at }
// ────────────────────────────────────────────────────────────────────
const CONC_KEY = 'sgk_concepts';

export async function getConcepts() {
  return getMergedIndexedList({
    store: STORES.CONCEPTS,
    localKey: CONC_KEY,
    sortFn: (a, b) =>
      (a.term || '').localeCompare(
        b.term || '',
        'vi'
      ),
  });
}

export async function addConcept(c) {
  const item = { ...c, term: String(c.term || '').trim(), id: makeId('conc'), at: now() };

  if (indexedDBService.constructor.isAvailable()) {
    try {
      const ok = await indexedDBService.set(STORES.CONCEPTS, item.id, item);

      if (!ok) {
        throw new Error('IndexedDB concept write returned false');
      }

      try {
        const localConcepts = _safeGetList(CONC_KEY);
        const updated = localConcepts.filter(c => c.id !== item.id);
        { const _r=safeSetJSON(CONC_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", CONC_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", CONC_KEY, ":", _r.error); } }
      } catch (e) { console.warn("[researchDB] operation failed", e); }
    } catch (err) {
      console.error('IndexedDB concept write failed, falling back to localStorage:', err);
      safeSave(CONC_KEY, _addItemSafe(CONC_KEY, item), 'add concept');
    }
  } else {
    safeSave(CONC_KEY, _addItemSafe(CONC_KEY, item), 'add concept');
  }

  // Automatically create evidence for the concept
  if (item.file) {
    await addEvidence({
      type: 'concept',
      sourceId: item.id,
      file: item.file,
      page: item.page,
      text: item.definition?.slice(0, 500)
    });
  }
  try{ emitConceptCreated(item.id); }catch(e){ console.warn("[researchDB] emitConceptCreated failed", e); }
  return item;
}

export async function updateConcept(id, patch) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const existing = await indexedDBService.get(STORES.CONCEPTS, id);
      if (existing) {
        const updated = { ...existing, ...patch, id };
        const ok = await indexedDBService.set(STORES.CONCEPTS, id, updated);

        if (!ok) {
          throw new Error('IndexedDB concept update returned false');
        }

        return true;
      }
    } catch (err) {
      console.error('IndexedDB concept update failed, falling back to localStorage:', err);
    }
  }
  safeSave(CONC_KEY, _updateItemSafe(CONC_KEY, id, patch), 'update concept');
  return true;
}

export async function deleteConcept(id) {
  if (indexedDBService.constructor.isAvailable()) {
    try {
      await indexedDBService.delete(STORES.CONCEPTS, id);
      try {
        const localConcepts = _safeGetList(CONC_KEY);
        const updated = localConcepts.filter(c => c.id !== id);
        { const _r=safeSetJSON(CONC_KEY, updated); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", CONC_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", CONC_KEY, ":", _r.error); } }
      } catch (e) { console.warn("[researchDB] operation failed", e); }
      return;
    } catch (err) {
      console.error('IndexedDB concept delete failed, falling back to localStorage:', err);
    }
  }
  safeSave(CONC_KEY, _safeGetList(CONC_KEY).filter(c => c.id !== id), 'delete concept');
}

export async function conceptCategories() {
  const s = new Set(['Năng lực', 'Phẩm chất', 'PPDH', 'Đánh giá', 'Kiến thức môn', 'Khác']);
  const concepts = await getConcepts();
  concepts.forEach(c => { if (c.category) s.add(c.category); });
  return [...s];
}

// ── IndexedDB migration helpers for concepts ───────────────────────────
export async function migrateConceptsToIndexedDB() {
  if (!indexedDBService.constructor.isAvailable()) {
    console.debug('IndexedDB not available, skipping concepts migration');
    return false;
  }
  
  try {
    const localConcepts = _safeGetList(CONC_KEY);
    if (localConcepts.length === 0) {
      console.debug('No concepts to migrate');
      return true;
    }
    
    console.debug(`Migrating ${localConcepts.length} concepts to IndexedDB...`);
    for (const concept of localConcepts) {
      const ok = await indexedDBService.set(STORES.CONCEPTS, concept.id, concept);
      if (!ok) {
        throw new Error(`Không thể migrate concept ${concept.id}`);
      }
    }
    
    // Only clear localStorage after all IndexedDB writes succeed
    { const _r=safeSetJSON(CONC_KEY, []); if(!_r.ok){ if(_r.quota) console.warn("[safeStorage] QuotaExceededError on", CONC_KEY, "-", _r.message); else console.warn("[safeStorage] save failed for", CONC_KEY, ":", _r.error); } }
    
    console.debug('Concepts migration completed');
    return true;
  } catch (err) {
    console.error('Concepts migration failed:', err);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
// CITATION helper — chuẩn trích dẫn từ (sách, trang, chương)
// PDF page 1 = bìa, nên trang sách = pdfPage − 1
// ────────────────────────────────────────────────────────────────────
export function chapterAt(book, bookPageNumber) {
  try {
    const tb = findTocBook(book);
    if (!tb || !Array.isArray(tb.items)) return '';
    let best = { title: '', depth: 99, page: 0 };
    for (const it of tb.items) {
      const p = parseInt(it.page, 10);
      if (!Number.isFinite(p)) continue;
      // TOC 'pages' are stored as PDF page numbers
      if (p <= bookPageNumber + 1 && p > best.page) best = { title: it.title, depth: it.depth ?? 0, page: p };
    }
    return best.title || '';
  } catch (e) { console.warn("[researchDB] chapterAt failed", e); return ''; }
}

export function citationFor(book, pdfPage, { structure = true, chapter = true } = {}) {
  const bp = Math.max(1, pdfPage - 1);
  const parts = [book?.title || 'Sách'];
  parts.push(`Lớp ${book?.grade || '?'}${book?.term === 2 ? ' (Tập 2)' : ''}`);
  const ch = chapter && chapterAt(book, bp);
  const tail = [];
  if (structure && ch) tail.push(`Chương/Chủ đề: ${ch}`);
  tail.push(`tr. ${bp}`);
  return `${parts.join(', ')} — ${tail.join('; ')}`;
}

// ── Best-effort clip text for the current page (used by the reader) ─
export function chapterForPage(book, pdfPage) {
  return chapterAt(book, Math.max(1, pdfPage - 1));
}

export { removeItem as removeItemFromList };