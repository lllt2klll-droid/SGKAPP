// ── Note search helper — tìm kiếm thống nhất cho ghi chú ────────────────
// Quét tất cả loại ghi chú: pin (notes_*), structured (studynotes_*),
// teacher notes (sgk_teacherNotes_*), marks ghiChu (sgk_marks_*),
// comparison notes (sgk_cmpnote_*)
import { safeGetJSON, safeGetString, listKeysByPrefix } from "./safeStorage.js";

export const normalizeSearch = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const normIncludes = (haystack, needleNorm) => {
  if (!needleNorm) return false;
  return normalizeSearch(haystack).includes(needleNorm);
};

function plainFromHtml(html) {
  if (!html) return "";
  try {
    // In Node/test without DOM, fallback to regex
    if (typeof document === "undefined" || !document.createElement) {
      return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\u00A0/g, " ").trim();
  } catch {
    return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function snippetAround(text, qNorm, maxLen = 120) {
  if (!text) return "";
  const norm = normalizeSearch(text);
  const idx = qNorm ? norm.indexOf(qNorm) : -1;
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");
  // map back approximate: we search in normalized; find window around idx
  // For simplicity take substring centered on idx using plain length ratio
  // This is not exact char mapping but good enough for note preview
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, start + maxLen);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

// Scan pinned notes for one book: notes_<filename>_<pdfPage>
function collectPinNotes(book, qNorm) {
  const out = [];
  if (!book?.filename) return out;
  const prefix = `notes_${book.filename}_`;
  // Iterate localStorage keys (safe)
  let keys = [];
  try {
    keys = listKeysByPrefix(prefix);
  } catch {
    return out;
  }
  for (const key of keys) {
    const pagePart = key.slice(prefix.length);
    const pdfPage = parseInt(pagePart, 10);
    if (!Number.isFinite(pdfPage)) continue;
    const arr = safeGetJSON(key, [], Array.isArray);
    if (!Array.isArray(arr) || !arr.length) continue;
    for (const n of arr) {
      const raw = n.text || "";
      const plain = plainFromHtml(raw);
      const combined = plain + (n.images && n.images.length ? ` [${n.images.length} ảnh]` : "");
      if (!normIncludes(combined, qNorm) && !normIncludes(plain, qNorm)) continue;
      const displayPage = Math.max(1, (n.pdfPage || pdfPage) - 1);
      const pdfP = n.pdfPage || pdfPage;
      const title = plain ? plain.slice(0, 60) + (plain.length > 60 ? "…" : "") : "(ghi chú trống)";
      const snippet = snippetAround(plain || combined, qNorm, 140);
      out.push({
        id: `pin-${book.filename}-${n.id || pdfP}-${Math.random().toString(36).slice(2,6)}`,
        book,
        pdfPage: pdfP,
        displayPage,
        kind: "pin",
        rawText: plain,
        title,
        snippet,
        chapter: "",
        _orig: n,
      });
    }
  }
  return out;
}

function collectStructuredNotes(book, qNorm) {
  const out = [];
  if (!book?.filename) return out;
  const key = `studynotes_${book.filename}`;
  const arr = safeGetJSON(key, [], Array.isArray);
  if (!Array.isArray(arr) || !arr.length) return out;
  for (const n of arr) {
    const haystack = [n.chapter || "", n.mucTieu || "", n.noiDung || "", n.ppdh || "", n.cauHoi || ""].join(" ");
    if (!normIncludes(haystack, qNorm)) continue;
    // pageNum in structured notes is book page (user entered). Convert to pdfPage for navigation
    const bookPage = parseInt(n.pageNum, 10);
    const pdfPage = Number.isFinite(bookPage) && bookPage >= 1 ? bookPage + 1 : 1;
    const displayPage = Number.isFinite(bookPage) && bookPage >= 1 ? bookPage : Math.max(1, pdfPage - 1);
    // snippet: pick first field that matches
    let snippetSource = haystack;
    // Prefer the matching field for snippet
    for (const fid of ["mucTieu", "noiDung", "ppdh", "cauHoi", "chapter"]) {
      if (n[fid] && normIncludes(n[fid], qNorm)) { snippetSource = n[fid]; break; }
    }
    const snippet = snippetAround(String(snippetSource).replace(/\s+/g, " ").trim(), qNorm, 140);
    const title = (n.chapter ? `${n.chapter} — ` : "") + (n.mucTieu || n.noiDung || n.cauHoi || n.ppdh || "").slice(0, 50) || "Ghi chú bài học";
    out.push({
      id: `structured-${book.filename}-${n.id}`,
      book,
      pdfPage,
      displayPage,
      kind: "structured",
      rawText: haystack,
      title: title.slice(0, 70),
      snippet,
      chapter: n.chapter || "",
      _orig: n,
    });
  }
  return out;
}

function collectTeacherNotes(book, qNorm) {
  const out = [];
  if (!book?.filename) return out;
  const key = `sgk_teacherNotes_${book.filename}`;
  const obj = safeGetJSON(key, null, (v) => v && typeof v === "object" && !Array.isArray(v));
  if (!obj || typeof obj !== "object") return out;
  for (const [pageStr, data] of Object.entries(obj)) {
    if (!data || typeof data !== "object") continue;
    const haystack = `${data.title || ""} ${data.note || ""}`;
    if (!normIncludes(haystack, qNorm)) continue;
    const pdfPage = parseInt(pageStr, 10);
    if (!Number.isFinite(pdfPage)) continue;
    const displayPage = Math.max(1, pdfPage - 1);
    const snippet = snippetAround(String(data.note || data.title || "").replace(/\s+/g, " ").trim(), qNorm, 140);
    const title = data.title ? data.title.slice(0, 60) : (data.note || "").slice(0, 60) || "Ghi chú dạy học";
    out.push({
      id: `teacher-${book.filename}-${pageStr}`,
      book,
      pdfPage,
      displayPage,
      kind: "teacher",
      rawText: haystack,
      title,
      snippet,
      chapter: "",
      _orig: data,
    });
  }
  return out;
}

function collectMarkNotes(book, qNorm) {
  const out = [];
  if (!book?.filename) return out;
  const key = `sgk_marks_${book.filename}`;
  const obj = safeGetJSON(key, null, (v) => v && typeof v === "object" && !Array.isArray(v));
  if (!obj || typeof obj !== "object") return out;
  for (const [pageStr, m] of Object.entries(obj)) {
    if (!m || typeof m !== "object") continue;
    const haystack = `${m.tieuDe || ""} ${m.ghiChu || ""} ${Array.isArray(m.yccd) ? m.yccd.join(" ") : ""} ${m.mach || ""} ${m.mucdo || ""}`;
    if (!normIncludes(haystack, qNorm)) continue;
    const pdfPage = parseInt(pageStr, 10);
    if (!Number.isFinite(pdfPage)) continue;
    const displayPage = Math.max(1, pdfPage - 1);
    const primary = m.ghiChu || m.tieuDe || haystack;
    const snippet = snippetAround(String(primary).replace(/\s+/g, " ").trim(), qNorm, 140);
    const title = (m.tieuDe || m.ghiChu || "Đánh dấu CTGDPT").slice(0, 60);
    out.push({
      id: `mark-${book.filename}-${pageStr}`,
      book,
      pdfPage,
      displayPage,
      kind: "mark",
      rawText: haystack,
      title,
      snippet,
      chapter: "",
      _orig: m,
    });
  }
  return out;
}

function collectCompareNotes(books, qNorm) {
  const out = [];
  // sgk_cmpnote_* keys are per book pair or single book. We scan all localStorage
  // and attribute to the first matching book if possible
  let keys = [];
  try {
    keys = listKeysByPrefix("sgk_cmpnote_");
  } catch { return out; }
  const bookFilenames = new Set((books || []).map((b) => b.filename));
  for (const key of keys) {
    const raw = safeGetString(key, null);
    if (raw == null) continue;
    // value is JSON string of note string or object? In CompareView it's via safeGetJSON string, stored as JSON string
    let text = "";
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") text = parsed;
      else if (parsed && typeof parsed === "object" && parsed.text) text = parsed.text;
      else text = String(parsed || "");
    } catch {
      text = raw;
    }
    if (!text || !normIncludes(text, qNorm)) continue;
    // Try to map to a book: key is sgk_cmpnote_<fileA>__<fileB> or sgk_cmpnote_<file>
    const suffix = key.slice("sgk_cmpnote_".length);
    const parts = suffix.split("__");
    let matchedBook = null;
    for (const p of parts) {
      const b = (books || []).find((bk) => bk.filename === p);
      if (b) { matchedBook = b; break; }
    }
    if (!matchedBook && books && books.length) {
      // fallback: if suffix exactly matches a filename
      matchedBook = books.find((b) => suffix.includes(b.filename)) || books[0];
    }
    if (!matchedBook) continue;
    // Don't duplicate if already have a pin note identical? Just add
    const snippet = snippetAround(text.replace(/\s+/g, " ").trim(), qNorm, 140);
    const title = text.slice(0, 60).trim() + (text.length > 60 ? "…" : "");
    out.push({
      id: `cmp-${key}`,
      book: matchedBook,
      pdfPage: 1,
      displayPage: 1,
      kind: "compare",
      rawText: text,
      title: title || "Ghi chú so sánh",
      snippet,
      chapter: "",
      _orig: text,
    });
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────
export function searchNotes(query, books) {
  const qNorm = normalizeSearch(query);
  if (!qNorm) return [];
  const results = [];
  for (const book of books || []) {
    results.push(...collectPinNotes(book, qNorm));
    results.push(...collectStructuredNotes(book, qNorm));
    results.push(...collectTeacherNotes(book, qNorm));
    results.push(...collectMarkNotes(book, qNorm));
  }
  // compare notes are global per pair, add once
  results.push(...collectCompareNotes(books, qNorm));
  // dedup by id
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    deduped.push(r);
  }
  // sort: pin/structured first, then by book title
  const kindOrder = { pin: 0, structured: 1, teacher: 2, mark: 3, compare: 4 };
  deduped.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) || a.book.title.localeCompare(b.book.title, "vi"));
  return deduped.slice(0, 80); // cap 80
}

export function getNoteKindLabel(kind) {
  const map = {
    pin: "Ghim trên trang",
    structured: "Ghi chú bài học",
    teacher: "Ghi chú dạy học",
    mark: "Đánh dấu CTGDPT",
    compare: "Ghi chú so sánh",
  };
  return map[kind] || kind;
}

export { plainFromHtml };
