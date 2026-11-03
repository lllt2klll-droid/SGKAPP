// ── Book Identity — canonical resolver (PHASE 7) ────────────────────────────
// ONE canonical identity: bookId === filename (stable, from server PDF list)
// Legacy compatibility is centralized here — do not scatter `bookId || filename` chains.
// Design: filename IS the stable identity (server sanitizes + dedup ensures uniqueness).
// Migration: when filename changes (PUT rename for .txt/.md), storage.migrateBookData(old→new)
// performs transaction-like move of ALL dependent data (localStorage + IndexedDB + lessonPlans).
// Future: if UUID introduced, this module is the single migration point — legacy filename keys
// will be detected and moved to bookId-based keys without data loss.

/**
 * Resolve canonical book identifier from various shapes.
 * Priority: bookId > filename > id > key > book.filename > book.key
 * @param {Object|string} bookOrScan - book object, scan, ref, or string
 * @returns {string} canonical id (filename) or ""
 */
export function resolveBookId(bookOrScan) {
  if (!bookOrScan) return "";
  if (typeof bookOrScan === 'string') return bookOrScan;
  return (
    bookOrScan.bookId ||
    bookOrScan.filename ||
    bookOrScan.id ||
    bookOrScan.key ||
    bookOrScan.book?.filename ||
    bookOrScan.book?.key ||
    bookOrScan.book?.id ||
    ""
  );
}

/**
 * Resolve book filename specifically (alias to resolveBookId for legacy code)
 */
export function resolveBookFilename(book) {
  return resolveBookId(book);
}

/**
 * Get filename for comparison (used in orphan checks)
 */
export function bookIdEquals(bookA, bookB) {
  return resolveBookId(bookA) === resolveBookId(bookB);
}

/**
 * Stable identity helper — returns canonical book object shape.
 * Current: { id: filename, filename }
 * Future-proof: if server ever returns id UUID, prefers id.
 */
export function ensureBookIdentity(book) {
  const fid = resolveBookId(book);
  if (!fid) return null;
  return { id: fid, filename: fid, title: book?.title || fid };
}

/**
 * Legacy detection: returns true if a storage key appears to be legacy filename-based
 * and should be migrated via storage.migrateBookData
 */
export function isLegacyFilenameKey(key, filename) {
  return typeof key === 'string' && typeof filename === 'string' && key.includes(filename);
}
