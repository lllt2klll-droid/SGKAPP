// ── Full-text search index for books ───────────────────────────────────────
// Builds and maintains a search index over book content (PDF text + OCR)
// Index is stored in IndexedDB for large data, with localStorage fallback
// Metadata stored under "sgk_idxmeta_<filename>"

import { readJSON, saveJSON } from "./storage.js";
import indexedDBService, { STORES, getOCR, setOCR } from "./indexedDB.js";
import { safeRemove } from "./safeStorage.js";
import { getApiBase } from "./apiConfig.js";
import { cleanExtractedText } from "./textutils.js";
import { ocrKey as ocrKeyHelper } from "./core/storageKeys.js";

const IDX_PREFIX = "sgk_idx_";
const IDX_META_PREFIX = "sgk_idxmeta_";

const IDX_KEY = (f) => `sgk_idx_${f}`;
const META_KEY = (f) => `sgk_idxmeta_${f}`;

export function indexKeyFor(file) { return IDX_KEY(file); }
export function metaKeyFor(file) { return META_KEY(file); }

export async function getIndex(file) {
  // Try IndexedDB first for large data
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const idbValue = await indexedDBService.get(STORES.SEARCH_INDEX, file);
      if (idbValue) return idbValue;
    } catch (err) {
      console.error(`IndexedDB get failed for ${file}, falling back to localStorage:`, err);
    }
  }
  // Fallback to localStorage
  return readJSON(IDX_KEY(file), null);
}

export function getIndexMeta(file) {
  return readJSON(META_KEY(file), null) || null;
}

export async function deleteIndex(filename) {
  try {
    // Clean up IndexedDB
    if (indexedDBService.constructor.isAvailable()) {
      try {
        await indexedDBService.delete(STORES.SEARCH_INDEX, filename);
      } catch (err) {
        console.error(`Failed to delete IndexedDB index for ${filename}:`, err);
      }
    }
    
    // Clean up all index key variants (current + legacy)
    const keys = [
      `sgk_idx_${filename}`,      // Current format
      `sgk_idxmeta_${filename}`, // Current format
      `sgk_index_${filename}`,   // Legacy format
      `sgk_meta_${filename}`,    // Legacy format
    ];
    keys.forEach(key => {
      const r = safeRemove(key);
      if (!r.ok) console.warn(`[searchIndex] safeRemove failed ${key}:`, r.error);
    });
  } catch (err) {
    console.error(`Failed to delete index for ${filename}:`, err);
  }
}

// Invalidate and mark index for rebuild (triggered on book changes)
export function invalidateIndex(filename) {
  try {
    const meta = getIndexMeta(filename);
    if (meta) {
      // Update meta to mark as stale
      const staleMeta = { ...meta, stale: true, invalidatedAt: Date.now() };
      saveJSON(META_KEY(filename), staleMeta);
      if (globalThis.__SGK_TEST__ !== true) console.debug(`Index marked as stale for ${filename}`);
    }
  } catch (err) {
    console.error(`Failed to invalidate index for ${filename}:`, err);
  }
}

// Check if index needs rebuild
export function needsRebuild(filename) {
  const meta = getIndexMeta(filename);
  if (!meta) return true; // No index exists, needs build
  if (meta.stale) return true; // Marked as stale
  // Optional: Rebuild if older than 7 days
  const AGE_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (Date.now() - (meta.builtAt || 0) > AGE_THRESHOLD) return true;
  return false;
}

// ── Text normalisation with original-position mapping ──────────────
// Returns { norm, map } where map[i] = index in the ORIGINAL string of
// the i-th character of norm (lengths match). Characters that vanish
// (combining marks) are dropped from norm but not from the document.
//
// Mapping logic:
// - Original character index → Normalize character → Normalized characters
// - All normalized chars from one original char map back to same original index
// - Combining marks are skipped in norm but DO NOT advance srcIdx (they belong to the same original char)
export function normMap(text) {
  const map = [];
  const lower = String(text || '').toLowerCase().replace(/đ/g, 'd');
  // Normalize to NFD form (decomposed) to separate base chars from combining marks
  const nfd = lower.normalize('NFD');
  let norm = '';
  let srcIdx = 0;

  for (let i = 0; i < nfd.length; i++) {
    const ch = nfd[i];
    const code = ch.charCodeAt(0);

    // Skip combining marks (diacritics) - they don't appear in normalized text
    // They belong to the same original character, so we DON'T advance srcIdx
    if (code >= 0x300 && code <= 0x36f) {
      continue;
    }

    // Keep base character - it maps to the current original character index
    norm += ch;
    map.push(srcIdx);
    srcIdx++;
  }

  return { norm, map };
}

export function normalizeText(text) {
  // Unified pipeline: lowercase → đ→d → NFD → remove combining marks → keep only alphanumeric
  const base = String(text || '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Keep only alphanumeric characters (Vietnamese base chars are already decomposed)
  return base.replace(/[^a-z0-9]+/gi, ' ');
}

export function tokenize(query) {
  return normalizeText(query).split(/\s+/).filter(Boolean).slice(0, 8);
}

// ── Build the index for one book ────────────────────────────────────
// Đồng bộ Word (html/txt/md) y hệt PDF — fetch content khi pdfDoc null
// onProgress({ done, total, page, kind }) — kind: 'text' | 'ocr' | 'image'
export async function buildIndex(book, pdfDoc, onProgress) {
  const isWord = /\.(html|htm|txt|md)$/i.test(book.filename || "");
  if (isWord) {
    // Word — fetch qua API như App.jsx, đồng bộ toàn app
    try {
      const API_BASE = getApiBase();
      const res = await fetch(`${API_BASE}/api/books/${encodeURIComponent(book.filename)}/content`);
      const data = await res.json().catch(()=>({}));
      let raw = data.content || "";
      const plain = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const pages = [];
      const chunk = 3000;
      for(let i=0, p=1; i < plain.length; i+=chunk, p++){
        const t = plain.slice(i, i+chunk);
        if(t.trim()) pages.push({ page:p, text:t, kind:"text" });
      }
      if(!pages.length) pages.push({ page:1, text: plain.slice(0,chunk)||"", kind:"text" });
      const builtAt = Date.now();
      const meta = { filename: book.filename, total: pages.length, textPages: pages.length, ocrPages:0, imagePages:0, builtAt, word:true };
      saveJSON(META_KEY(book.filename), meta);
      const indexData = { pages, builtAt };
      if (indexedDBService.constructor.isAvailable()) {
        try {
          await indexedDBService.set(STORES.SEARCH_INDEX, book.filename, indexData);
          safeRemove(IDX_KEY(book.filename));
        } catch { saveJSON(IDX_KEY(book.filename), indexData); }
      } else {
        saveJSON(IDX_KEY(book.filename), indexData);
      }
      return meta;
    } catch(e){ console.warn("buildIndex word failed", e); throw e; }
  }
  const total = pdfDoc.numPages || 0;
  const pages = [];
  let textPages = 0;
  let ocrPages = 0;
  let imagePages = 0;
  for (let p = 1; p <= total; p++) {
    let text = '';
    let kind = 'text';
    try {
      const page = await pdfDoc.getPage(p);
      const tc = await page.getTextContent();
      text = cleanExtractedText(tc.items.map(i => i.str).join(' '));
    } catch (err) { console.error(`Failed to extract text from page ${p}:`, err); text = ''; }
    if (text.length <= 30) {
      // OCR cache via unified helper (IDB canonical + LS fallback) — no direct localStorage string literal
      try {
        const cached = await getOCR(book.filename, p);
        if (cached && cached.length > 30) { text = cached; kind = 'ocr'; ocrPages++; }
        else { kind = 'image'; imagePages++; }
      } catch (err) { console.error(`Failed to get OCR cache for page ${p}:`, err); kind = 'image'; imagePages++; }
    } else {
      textPages++;
      // Cache via unified helper (IDB canonical + LS fallback)
      try {
        await setOCR(book.filename, p, text.slice(0, 4000));
      } catch (err) { console.error(`Failed to cache text for page ${p}:`, err); }
    }
    pages.push({ page: p, text: text.slice(0, 4000), kind });
    onProgress?.({ done: p, total, page: p, kind });
    // Yield to UI between pages
    if (p % 3 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const builtAt = Date.now();
  const meta = { filename: book.filename, total, textPages, ocrPages, imagePages, builtAt };
  saveJSON(META_KEY(book.filename), meta);
  
  // Save index to IndexedDB for large data, fallback to localStorage
  const indexData = { pages, builtAt };
  if (indexedDBService.constructor.isAvailable()) {
    try {
      const ok = await indexedDBService.set(STORES.SEARCH_INDEX, book.filename, indexData);

      if (!ok) {
        throw new Error(`IndexedDB search index write failed for ${book.filename}`);
      }

      // Clear localStorage to free space
      {
        const r = safeRemove(IDX_KEY(book.filename));
        if (!r.ok) console.warn(`[searchIndex] clear LS failed ${IDX_KEY(book.filename)}:`, r.error);
      }
    } catch (err) {
      console.error(`IndexedDB save failed for ${book.filename}, falling back to localStorage:`, err);
      saveJSON(IDX_KEY(book.filename), indexData);
    }
  } else {
    saveJSON(IDX_KEY(book.filename), indexData);
  }
  
  return meta;
}

// ── Search across indexed books ────────────────────────────────────
// Returns results grouped by book: [{ book, score, hits: [{page, snippet, marks}] }]
export async function searchAll(query, books) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const out = [];
  for (const book of books) {
    const idx = await getIndex(book.filename);
    if (!idx || !Array.isArray(idx.pages) || !idx.pages.length) continue;
    const bookHits = [];
    let bookScore = 0;
    for (const pg of idx.pages) {
      if (!pg.text) continue;
      const { norm, map } = normMap(pg.text);
      let allFound = true;
      let firstPos = -1;
      let score = 0;
      for (const tok of tokens) {
        const pos = norm.indexOf(tok);
        if (pos === -1) { allFound = false; break; }
        score += 1;
        if (firstPos === -1 || pos < firstPos) firstPos = pos;
        // count occurrences for better ranking
        let c = 0, from = 0;
        while ((from = norm.indexOf(tok, from)) !== -1) { c++; from += tok.length; }
        score += c;
      }
      if (!allFound) continue;
      bookScore += score;
      bookHits.push({ page: pg.page, kind: pg.kind, snippet: makeSnippet(pg.text, norm, map, firstPos), score });
    }
    if (bookHits.length) {
      bookHits.sort((a, b) => b.score - a.score);
      out.push({ book, score: bookScore, hits: bookHits.slice(0, 30), totalHits: bookHits.length });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Build a readable snippet around the first match (positions mapped back to original text)
function makeSnippet(original, norm, map, firstPos) {
  const head = 60, tail = 160;
  const start = Math.max(0, firstPos - head);
  const end = Math.min(map.length, firstPos + tail);
  const orgStart = map[start];
  const orgEnd = map[end - 1] + 1;
  let s = original.slice(orgStart, orgEnd).replace(/\s+/g, ' ').trim();
  if (orgStart > 0) s = '…' + s;
  if (orgEnd < original.length) s = s + '…';
  return s || original.slice(0, 240);
}