// ── Book Context — shared Current Book across all modules ──────────
// Provides { filename, title, subject, grade, term, page, chapter, citation }
// Every module that needs "which book am I in?" reads this instead of
// re-deriving it differently.

import React, { createContext, useContext, useMemo } from "react";
import { chapterForPage as _chapterForPage, citationFor as _citationFor } from "../researchDB.js";

export const BookContext = createContext(null);

export function BookProvider({ book, page = null, children }) {
  const value = useMemo(() => {
    if (!book) return null;
    const pdfPage = Number(page) || 1;
    const bookPage = Math.max(1, pdfPage - 1);
    let chapter = "";
    let citation = "";
    try {
      chapter = typeof _chapterForPage === "function" ? _chapterForPage(book, pdfPage) || "" : "";
      citation = typeof _citationFor === "function" ? _citationFor(book, pdfPage) || "" : "";
    } catch {}
    if (!citation) citation = `${book.title || book.filename || "SGK"} — tr. ${bookPage}${chapter ? ` · ${chapter}` : ""}`;
    return {
      filename: book.filename || "",
      title: book.title || book.filename || "",
      subject: book.subject || "",
      grade: book.grade ?? null,
      term: book.term ?? null,
      size: book.size ?? null,
      page: pdfPage,
      bookPage,
      chapter,
      citation,
      raw: book,
    };
  }, [book, page]);
  return React.createElement(BookContext.Provider, { value }, children);
}

export function useBookContext() {
  return useContext(BookContext);
}

// Factory helpers for modules that don't use Provider (e.g., service layer)
export function makeBookContext(book, pdfPage = 1) {
  if (!book) return null;
  const bp = Math.max(1, Number(pdfPage) - 1);
  let chapter = "", citation = "";
  try {
    chapter = typeof _chapterForPage === "function" ? _chapterForPage(book, Number(pdfPage)) || "" : "";
    citation = typeof _citationFor === "function" ? _citationFor(book, Number(pdfPage)) || "" : "";
  } catch {}
  if (!citation) citation = `${book.title || book.filename} — tr. ${bp}${chapter ? ` · ${chapter}` : ""}`;
  return {
    filename: book.filename || "",
    title: book.title || "",
    subject: book.subject || "",
    grade: book.grade ?? null,
    term: book.term ?? null,
    page: Number(pdfPage) || 1,
    bookPage: bp,
    chapter,
    citation,
    raw: book,
  };
}

// SourceRef spec per TASK §11 — canonical: {filename,title,page,bookPage,chapter,citation,subject,grade}
export function makeSourceRef(bookCtx, extra = {}) {
  if (!bookCtx) return null;
  return {
    filename: bookCtx.filename,
    title: bookCtx.title,
    page: bookCtx.page,
    bookPage: bookCtx.bookPage,
    chapter: bookCtx.chapter || "",
    citation: bookCtx.citation || "",
    subject: bookCtx.subject || "",
    grade: bookCtx.grade ?? null,
    ...extra,
  };
}

// Normalize any legacy source shape into canonical SourceRef
// Handles: bookId/file/fileName/book/source/pageNumber/chapterTitle etc.
export function normalizeSourceRef(input, fallbackBook = null) {
  if (!input || typeof input !== "object") {
    if (fallbackBook) {
      const ctx = makeBookContext(fallbackBook, 1);
      return ctx ? makeSourceRef(ctx) : null;
    }
    return null;
  }
  // Already canonical? Check key fields
  if (input.filename && input.citation !== undefined) {
    // Ensure all canonical fields present with defaults
    return {
      filename: String(input.filename || input.file || input.fileName || input.bookId || fallbackBook?.filename || ""),
      title: String(input.title || input.bookTitle || fallbackBook?.title || input.filename || ""),
      page: Number(input.page ?? input.pageNumber ?? input.pdfPage ?? 1) || 1,
      bookPage: Number(input.bookPage ?? (Number(input.page ?? 1) - 1) ) || 1,
      chapter: String(input.chapter || input.chapterTitle || input.sub || ""),
      citation: String(input.citation || input.cite || ""),
      subject: String(input.subject || fallbackBook?.subject || ""),
      grade: input.grade ?? fallbackBook?.grade ?? null,
    };
  }
  const filename = String(input.filename || input.file || input.fileName || input.bookId || input.book || input.source || fallbackBook?.filename || "");
  const title = String(input.title || input.bookTitle || input.name || fallbackBook?.title || filename || "");
  const pageRaw = input.page ?? input.pageNumber ?? input.pdfPage ?? input.bookPage ?? 1;
  const page = Number(pageRaw) || 1;
  const bookPage = Number(input.bookPage ?? (page - 1)) || Math.max(1, page - 1);
  let chapter = String(input.chapter || input.chapterTitle || input.sub || "");
  let citation = String(input.citation || input.cite || "");
  const subject = String(input.subject || input.monHoc || fallbackBook?.subject || "");
  const grade = input.grade ?? input.lop ?? fallbackBook?.grade ?? null;
  // Auto-generate citation if missing and we have title/page
  if (!citation && filename) {
    citation = `${title || filename} — tr. ${bookPage}${chapter ? ` · ${chapter}` : ""}`;
  }
  return { filename, title, page, bookPage, chapter, citation, subject, grade };
}

export function isValidSourceRef(ref) {
  return !!(ref && typeof ref.filename === "string" && ref.filename.length > 0);
}
