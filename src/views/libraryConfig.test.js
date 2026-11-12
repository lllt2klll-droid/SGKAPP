import test from "node:test";
import assert from "node:assert/strict";
import { getRecentBooks, normalizeSubjectQuery } from "./libraryConfig.js";

test("normalizeSubjectQuery matches Vietnamese text without accents", () => {
  assert.equal(normalizeSubjectQuery("Địa lí"), "dia li");
});

test("getRecentBooks follows history order and skips missing and duplicate entries", () => {
  const books = [
    { filename: "a.pdf", title: "A" },
    { filename: "b.pdf", title: "B" },
  ];
  const history = [
    { filename: "b.pdf" },
    { filename: "missing.pdf" },
    { filename: "b.pdf" },
    { filename: "a.pdf" },
  ];

  assert.deepEqual(getRecentBooks(history, books), [books[1], books[0]]);
  assert.deepEqual(getRecentBooks(null, books), []);
});
