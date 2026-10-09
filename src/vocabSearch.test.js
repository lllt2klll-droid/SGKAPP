// ─── Lỗi #15 + #17 — vocab bookTitle guard & coverage hở ────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveVocabBookTitle } from "./vocabSearch.js";

globalThis.__SGK_TEST__ = true;

const BOOKS = [
  { filename: "toan-3.pdf", title: "Toán lớp 3" },
  { filename: "tieng-viet-2.pdf", title: "Tiếng Việt 2" },
];

describe("vocabSearch — resolveVocabBookTitle (lỗi #15)", () => {
  it("books undefined KHÔNG ném — trả '' (trước đây books.find ném TypeError)", () => {
    assert.equal(resolveVocabBookTitle({ word: "mèo", file: "a.pdf" }, undefined), "");
    assert.equal(resolveVocabBookTitle({ word: "mèo", file: "a.pdf" }, null), "");
    assert.equal(resolveVocabBookTitle({ word: "mèo", file: "a.pdf" }, "not-an-array"), "");
  });

  it("khớp file → title của sách", () => {
    assert.equal(resolveVocabBookTitle({ file: "toan-3.pdf" }, BOOKS), "Toán lớp 3");
  });

  it("không khớp file → ''", () => {
    assert.equal(resolveVocabBookTitle({ file: "khong-ton-tai.pdf" }, BOOKS), "");
    assert.equal(resolveVocabBookTitle({}, BOOKS), "");
  });

  it("v.bookTitle ưu tiên hơn tra cứu theo file", () => {
    assert.equal(resolveVocabBookTitle({ bookTitle: "Tiêu đề gán tay", file: "toan-3.pdf" }, BOOKS), "Tiêu đề gán tay");
  });

  it("books undefined nhưng có bookTitle vẫn hiển thị", () => {
    assert.equal(resolveVocabBookTitle({ bookTitle: "Sách nào đó" }, undefined), "Sách nào đó");
  });
});
