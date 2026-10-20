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
  libFilters: 'sgk_lib_filters',
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
import { appEvents as _appEventsUserData, AppEvents as _AppEventsUserData, DataDomains as _DataDomainsUserData } from "./core/appEvents.js";
function plainFromHtmlLocal(html) {
  if (!html) return "";
  try {
    if (typeof document !== "undefined" && document.createElement) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      return (tmp.textContent || tmp.innerText || "").replace(/ /g, " ").trim();
    }
  } catch {}
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function notifyDataUpdated(detail = {}) {
  try { _appEventsUserData.emit(_AppEventsUserData.DATA_UPDATED, { source: "userdata", ...detail }); } catch (e) { console.warn("[userdata] notifyDataUpdated failed", e); }
}
// P0 • event riêng cho từ vựng (alias tự sinh DATA_UPDATED + qua cross-tab)
function notifyVocabUpdated(op, id) {
  try { _appEventsUserData.emit(_AppEventsUserData.VOCAB_UPDATED, { source: "userdata", domain: _DataDomainsUserData.VOCAB, op, id }); }
  catch (e) { console.warn("[userdata] notifyVocabUpdated failed", e); }
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
  notifyDataUpdated({ domain: _DataDomainsUserData.BOOKMARKS, op: "toggleBookmark", id: `${file}#${page}` });
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
    notifyDataUpdated({ domain: _DataDomainsUserData.BOOKMARKS, op: "removeBookmark", id: `${file}#${page}` });
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

// ── Ghi chú ghim trên trang (notes_<file>_<pdfPage>) — đọc gộp toàn cục ──
// Dùng cho tab "Ghi chú đã lưu" trong Đánh dấu: liệt kê mọi ghi chú user đã
// lưu trong BookReader (text HTML + ảnh), kèm plain text để tìm kiếm/hiển thị.
export function getAllPinNotes() {
  let keys = [];
  try {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("notes_")) out.push(k);
    }
    keys = out;
  } catch { return []; }
  const notes = [];
  let fallbackSeq = 0;
  for (const key of keys) {
    // notes_<filename>_<pdfPage> — filename có thể chứa "_" nên cắt từ cuối
    const rest = key.slice("notes_".length);
    const idx = rest.lastIndexOf("_");
    if (idx === -1) continue;
    const file = rest.slice(0, idx);
    const pdfPage = parseInt(rest.slice(idx + 1), 10);
    if (!file || !Number.isFinite(pdfPage)) continue;
    let arr = [];
    try { arr = safeGetJSON(key, [], Array.isArray); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    for (const n of arr) {
      if (!n || typeof n !== "object") continue;
      const text = typeof n.text === "string" ? n.text : "";
      const plain = plainFromHtmlLocal(text);
      const images = Array.isArray(n.images) ? n.images : [];
      const pp = Number(n.pdfPage) || pdfPage;
      notes.push({
        key,
        file,
        pdfPage: pp,
        bookPage: Math.max(1, pp - 1),
        // n.id là Date.now() khi lưu; fallback kèm seq để không trùng _rid khi 2 ghi chú trống cùng trang
        // (loại "#" khỏi fallback để _rid `file#pdf#id` tách được từ cuối lên)
        id: n.id ?? `${pp}-${fallbackSeq++}-${plain.slice(0, 8).replace(/#/g, "-")}`,
        text,
        plain,
        images,
        imageCount: images.length,
        percentX: n.percentX,
        percentY: n.percentY,
      });
    }
  }
  // mới nhất trước: id là Date.now() khi lưu → sort desc, fallback theo trang
  notes.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0) || a.pdfPage - b.pdfPage);
  return notes;
}

export function deletePinNote(file, pdfPage, noteId) {
  const key = `notes_${file}_${pdfPage}`;
  let arr = [];
  try { arr = safeGetJSON(key, [], Array.isArray); } catch { return false; }
  if (!Array.isArray(arr) || !arr.length) return false;
  const rest = arr.filter((n) => String(n?.id) !== String(noteId));
  if (rest.length === arr.length) return false;
  try {
    const res = safeSetJSON(key, rest);
    if (!res.ok) return false;
  } catch { return false; }
  try { notifyDataUpdated({ domain: _DataDomainsUserData.BOOKS, op: "deletePinNote", id: `${file}#${pdfPage}#${noteId}` }); } catch {}
  return true;
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
  // P0 • chỉ bắn event riêng (alias tự sinh DATA_UPDATED) — tránh refresh 2 lần
  notifyVocabUpdated("addVocabEntry", dup ? dup.id : next[0]?.id);
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
  // P0 • chỉ bắn event riêng (alias tự sinh DATA_UPDATED)
  notifyVocabUpdated("removeVocabEntry", id);
  return next;
}

export function updateVocabMeaning(id, meaning) {
  const next = readJSON(KEYS.vocab, []).map(e => (e.id === id ? { ...e, meaning } : e));
  saveJSON(KEYS.vocab, next);
  // P0 • chỉ bắn event riêng (alias tự sinh DATA_UPDATED)
  notifyVocabUpdated("updateVocabMeaning", id);
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
  // P0 • chỉ bắn event riêng (alias tự sinh DATA_UPDATED) — tránh refresh 2 lần
  notifyVocabUpdated("updateVocabEntry", id);
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
  // P0 • khôi phục hàng loạt: event riêng kèm domain
  notifyVocabUpdated("restoreVocabEntries");
  return next;
}

export function clearVocab() {
  saveJSON(KEYS.vocab, []);
  // P0 • event riêng kèm domain
  notifyVocabUpdated("clearVocab");
}

// ── Quiz history ──────────────────────────────────────────────────
// QuizRecord = { at, file, title, grade, page, score, total }
export function getQuizHistory() {
  return readJSON(KEYS.quiz, []).sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function addQuizRecord(record) {
  const entry = { ...record, id: record.id || makeRecordId() };
  // Giữ 200 bản MỚI NHẤT: append rồi cắt đuôi (trước đây slice(0,200) giữ 200
  // cũ nhất, bản mới nhất bị vứt khi đã đầy).
  const list = readJSON(KEYS.quiz, [])
    .concat([entry])
    .slice(-200);
  if (!saveJSON(KEYS.quiz, list)) return list;
  notifyDataUpdated({ domain: _DataDomainsUserData.QUIZ, op: "addQuizRecord", id: entry.id });
  // Đồng bộ nhiệm vụ: mỗi lượt quiz = 1 REVIEW_DONE (idempotent theo id)
  try{ emitReviewDone(entry.id); }catch(e){ console.warn("[userdata] emitReviewDone failed", e); }
  return list;
}

export function clearQuizHistory() {
  saveJSON(KEYS.quiz, []);
  notifyDataUpdated({ domain: _DataDomainsUserData.QUIZ, op: "clearQuizHistory" });
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
    try { notifyDataUpdated({ domain: _DataDomainsUserData.BOOKS, op: "saveLastPage", id: file }); } catch (e) { console.warn("[userdata] notifyDataUpdated failed", e); }
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