// Shared localStorage helpers for user data: bookmarks, vocabulary notebook,
// quiz history. Used by both the reader (BookReader.jsx) and the dashboard (App.jsx).
import { emitBookmarkCreated, emitReviewDone, emitVocabCreated } from './missionEvents.js';
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove } from './safeStorage.js';

export const KEYS = {
  bookmarks: 'sgk_bookmarks',   // { [filename]: number[] }  PDF pages, ascending
  vocab: 'sgk_vocab',           // VocabEntry[]
  quiz: 'sgk_quiz_history',     // QuizRecord[]
  theme: 'sgk_theme',
  favs: 'sgk_favs',
  history: 'sgk_history',
  counts: 'sgk_counts',
  viewMode: 'sgk_view_mode',
  sortBy: 'sgk_sort_by',
  geminiKey: 'GEMINI_API_KEY',
};

export function readJSON(key, fallback) {
  let validator = null;
  if (Array.isArray(fallback)) validator = Array.isArray;
  else if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) validator = (v) => v && typeof v === "object" && !Array.isArray(v);
  try {
    return safeGetJSON(key, fallback, validator);
  } catch (e) {
    console.warn("[userdata] readJSON failed for", key, e);
    return fallback;
  }
}

export function saveJSON(key, value) {
  const res = safeSetJSON(key, value);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] QuotaExceededError on", key, "-", res.message);
    else console.warn("[safeStorage] saveJSON failed for", key, ":", res.error, res.message);
    return false;
  }
  return true;
}
import { appEvents as _appEventsUserData, AppEvents as _AppEventsUserData } from "./core/appEvents.js";
function notifyDataUpdated(detail = {}) {
  try { _appEventsUserData.emit(_AppEventsUserData.DATA_UPDATED, { source: "userdata", ...detail }); } catch (e) { console.warn("[userdata] notifyDataUpdated failed", e); }
}

// ── Bookmarks ─────────────────────────────────────────────────────
export function getAllBookmarks() {
  const m = readJSON(KEYS.bookmarks, {});
  const out = {};
  for (const [file, pages] of Object.entries(m)) {
    if (Array.isArray(pages)) out[file] = [...pages].sort((a, b) => a - b);
  }
  return out;
}

export function bookmarkPagesFor(file) { return getAllBookmarks()[file] || []; }

export function toggleBookmark(file, page) {
  const m = getAllBookmarks();
  const had = (m[file] || []).includes(page);
  const pages = had
    ? (m[file] || []).filter(p => p !== page)
    : [...(m[file] || []), page].sort((a, b) => a - b);
  if (pages.length) m[file] = pages; else delete m[file];
  saveJSON(KEYS.bookmarks, m);
  notifyDataUpdated();
  if(!had){
    try{ emitBookmarkCreated(file, page); }catch (e) { console.warn("[userdata] emitBookmarkCreated failed", e); }
  }
  return pages;
}

export function removeBookmark(file, page) {
  const m = getAllBookmarks();
  if (m[file]) {
    m[file] = m[file].filter(p => p !== page);
    if (!m[file].length) delete m[file];
    saveJSON(KEYS.bookmarks, m);
    notifyDataUpdated();
  }
}

export function clearBookmarksForFile(file) {
  const m = getAllBookmarks();
  if (m[file]) { delete m[file]; saveJSON(KEYS.bookmarks, m); }
  // also clear labels — per-book keys isolation: sgk_bookmark_labels uses file#page prefix
  try {
    const labels = readJSON('sgk_bookmark_labels', {});
    let changed = false;
    for (const k of Object.keys(labels)) {
      if (k.startsWith(file + '#')) { delete labels[k]; changed = true; }
    }
    if (changed) saveJSON('sgk_bookmark_labels', labels);
  } catch (e) { console.warn("[userdata] clearBookmarksForFile labels failed", e); }
}

export function getBookmarkLabel(file, page) {
  const m = readJSON('sgk_bookmark_labels', {});
  return m[`${file}#${page}`] || '';
}
export function setBookmarkLabel(file, page, label) {
  const m = readJSON('sgk_bookmark_labels', {});
  const key = `${file}#${page}`;
  const trimmed = String(label || '').trim().slice(0, 60);
  if (trimmed) m[key] = trimmed;
  else delete m[key];
  saveJSON('sgk_bookmark_labels', m);
  return m[key] || '';
}

export function latestBookmarks() {
  const m = getAllBookmarks();
  return new Set(Object.entries(m).flatMap(([file, pages]) => pages.map(p => `${file}#${p}`)));
}

// ── Vocabulary notebook ───────────────────────────────────────────
// VocabEntry = { id, word, meaning, file, bookTitle, grade, page, at }
export function getVocab() {
  return readJSON(KEYS.vocab, []).sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function addVocabEntry(entry) {
  const list = readJSON(KEYS.vocab, []);
  // avoid exact duplicates of the same word on the same page — per-book isolation via file field
  const dup = list.find(e => e.word === entry.word && e.file === entry.file && e.page === entry.page);
  let next;
  if (dup) {
    next = list.map(e => (e.id === dup.id ? { ...e, meaning: entry.meaning || e.meaning, at: Date.now() } : e));
  } else {
    next = [{ ...entry, id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() }, ...list];
  }
  saveJSON(KEYS.vocab, next);
  notifyDataUpdated();
  try{
    const newId = dup ? dup.id : next[0]?.id;
    if(newId){
      emitVocabCreated(newId);
    }
  }catch (e) { console.warn("[userdata] emitVocabCreated failed", e); }
  return next;
}

export function removeVocabEntry(id) {
  const next = readJSON(KEYS.vocab, []).filter(e => e.id !== id);
  saveJSON(KEYS.vocab, next);
  notifyDataUpdated();
  return next;
}

export function updateVocabMeaning(id, meaning) {
  const next = readJSON(KEYS.vocab, []).map(e => (e.id === id ? { ...e, meaning } : e));
  saveJSON(KEYS.vocab, next);
  notifyDataUpdated();
  return next;
}

// Sửa nhiều trường 1 lúc (từ, nghĩa, sách, trang, lớp, tags) — giữ nguyên id
export function updateVocabEntry(id, patch = {}) {
  let changed = false;
  const next = readJSON(KEYS.vocab, []).map(e => {
    if (e.id !== id) return e;
    changed = true;
    const merged = { ...e };
    for (const k of ["word", "meaning", "file", "bookTitle", "page", "grade"]) {
      if (k in patch) merged[k] = patch[k];
    }
    if ("tags" in patch) merged.tags = Array.isArray(patch.tags) ? patch.tags : [];
    return merged;
  });
  if (changed) {
    saveJSON(KEYS.vocab, next);
    notifyDataUpdated();
  }
  return next;
}

// Khôi phục từ Thùng rác / Hoàn tác: gộp theo id, không nhân bản
export function restoreVocabEntries(entries) {
  const incoming = (Array.isArray(entries) ? entries : []).filter(e => e && e.id);
  if (!incoming.length) return readJSON(KEYS.vocab, []);
  const list = readJSON(KEYS.vocab, []);
  const ids = new Set(incoming.map(e => e.id));
  const next = [...incoming, ...list.filter(e => !ids.has(e.id))];
  saveJSON(KEYS.vocab, next);
  notifyDataUpdated();
  return next;
}

export function clearVocab() {
  saveJSON(KEYS.vocab, []);
  notifyDataUpdated();
}

// ── Quiz history ──────────────────────────────────────────────────
// QuizRecord = { at, file, title, grade, page, score, total }
export function getQuizHistory() {
  return readJSON(KEYS.quiz, []).sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function addQuizRecord(record) {
  const entry = { ...record, id: record.id || makeRecordId() };
  const list = readJSON(KEYS.quiz, [])
    .concat([entry])
    .slice(0, 200);
  saveJSON(KEYS.quiz, list);
  notifyDataUpdated();
  // Đồng bộ nhiệm vụ: mỗi lượt quiz = 1 REVIEW_DONE (idempotent theo id)
  try{ emitReviewDone(entry.id); }catch(e){ console.warn("[userdata] emitReviewDone failed", e); }
  return list;
}

export function clearQuizHistory() {
  saveJSON(KEYS.quiz, []);
  notifyDataUpdated();
}

// ── Misc ──────────────────────────────────────────────────────────
export function formatDateTime(t) {
  try {
    return new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// Last-read page + total page count per book (values are PDF pages)
export function lastPageKey(file) { return `lastPage_${file}`; }
export function lastTotalKey(file) { return `lastTotal_${file}`; }

export function saveLastPage(file, pageNum, numPages) {
  // per-book keys isolation: lastPage_<filename>, lastTotal_<filename>
  const r1 = safeSetString(lastPageKey(file), String(pageNum));
  if (!r1.ok) {
    if (r1.quota) console.warn("[safeStorage] QuotaExceededError on", lastPageKey(file), "-", r1.message);
    else console.warn("[safeStorage] saveLastPage failed for", lastPageKey(file), ":", r1.error, r1.message);
  }
  if (Number.isFinite(Number(numPages)) && Number(numPages) > 0) {
    const r2 = safeSetString(lastTotalKey(file), String(numPages));
    if (!r2.ok) {
      if (r2.quota) console.warn("[safeStorage] QuotaExceededError on", lastTotalKey(file), "-", r2.message);
      else console.warn("[safeStorage] saveLastPage failed for", lastTotalKey(file), ":", r2.error, r2.message);
    }
  }
  // only notify if at least one succeeded; giữ dữ liệu cũ nếu quota
  if (r1.ok) {
    try { notifyDataUpdated(); } catch (e) { console.warn("[userdata] notifyDataUpdated failed", e); }
  }
}

export function numPagesFor(file) {
  try {
    const s = safeGetString(lastTotalKey(file), null);
    return s ? parseInt(s, 10) || 0 : 0;
  } catch (e) { console.warn("[userdata] numPagesFor failed", e); return 0; }
}

export function clearLastPages(files) {
  try {
    files.forEach(f => {
      const r1 = safeRemove(lastPageKey(f));
      if (!r1.ok) console.warn("[userdata] clearLastPages remove failed", lastPageKey(f), r1.error);
      const r2 = safeRemove(lastTotalKey(f));
      if (!r2.ok) console.warn("[userdata] clearLastPages remove failed", lastTotalKey(f), r2.error);
    });
  } catch (e) { console.warn("[userdata] clearLastPages failed", e); }
}

// ── Quiz record identity ──────────────────────────────────────────
export function makeRecordId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}