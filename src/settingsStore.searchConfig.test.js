// ─── Test applySearchConfig — nguồn matching DUY NHẤT cho SearchView/GlobalSearch ───
// Lỗi #7: Ctrl+K từng tự match luôn (luôn fuzzy, bỏ qua caseSensitive/wholeWord).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySearchConfig } from "./settingsStore.js";

globalThis.__SGK_TEST__ = true;

const cfg = (over = {}) => ({
  defaultType: "all",
  caseSensitive: false,
  wholeWord: false,
  fuzzyMatch: true,
  maxResults: 100,
  ...over,
});

describe("settingsStore — applySearchConfig", () => {
  it("mặc định: không phân biệt hoa, khớp không dấu", () => {
    assert.equal(applySearchConfig("sach", "Sách giáo khoa", cfg()), true);
    assert.equal(applySearchConfig("SÁCH", "sach giao khoa", cfg()), true);
    assert.equal(applySearchConfig("bai 1", "Bài 1 — Mở đầu", cfg()), true);
    assert.equal(applySearchConfig("abc", "Sách giáo khoa", cfg()), false);
  });

  it("caseSensitive=true phân biệt hoa thường", () => {
    const c = cfg({ caseSensitive: true });
    assert.equal(applySearchConfig("sgktest", "SGKTest", c), false);
    assert.equal(applySearchConfig("SGKTest", "SGKTest", c), true);
    // fuzzy vẫn bỏ dấu nhưng KHÔNG hạ case
    assert.equal(applySearchConfig("Sach", "Sách", c), true);
    assert.equal(applySearchConfig("SACH", "Sách", c), false);
  });

  it("wholeWord=true chỉ khớp cả từ, không khớp chuỗi con", () => {
    const c = cfg({ wholeWord: true });
    assert.equal(applySearchConfig("toan", "Toán học", c), true);
    assert.equal(applySearchConfig("oan", "Toán học", c), false, "chuỗi con không được khớp");
    assert.equal(applySearchConfig("hoc", "toanhọc", c), false, "nửa sau từ dính liền không được khớp");
    assert.equal(applySearchConfig("hoc", "toán học vui", c), true, "cả từ đứng riêng phải khớp");
  });

  it("wholeWord=false (mặc định) vẫn khớp chuỗi con", () => {
    assert.equal(applySearchConfig("oan", "Toán học", cfg()), true);
  });

  it("fuzzyMatch=false không tự bỏ dấu", () => {
    const c = cfg({ fuzzyMatch: false });
    assert.equal(applySearchConfig("sach", "Sách", c), false);
    assert.equal(applySearchConfig("sách", "Sách", c), true);
  });

  it("query rỗng / text rỗng → false, không ném lỗi", () => {
    assert.equal(applySearchConfig("", "Sách", cfg()), false);
    assert.equal(applySearchConfig("  ", "Sách", cfg()), false);
    assert.equal(applySearchConfig("sach", "", cfg()), false);
    assert.equal(applySearchConfig("sach", null, cfg()), false);
    assert.equal(applySearchConfig(null, "Sách", cfg()), false);
  });

  it("ký tự regex đặc biệt trong query không gây lỗi (đã escape)", () => {
    assert.equal(applySearchConfig("a+b", "bài a+b", cfg()), true);
    assert.equal(applySearchConfig("(x)", "ghi chú (x)", cfg()), true);
    assert.equal(applySearchConfig("a.b", "bài a.b", cfg()), true, "substring literal có dấu chấm vẫn khớp");
    assert.equal(applySearchConfig("a.b", "axb", cfg()), false, "mặc định substring — '.' không phải wildcard");
  });

  it("cfg truyền sẵn thì KHÔNG cần đọc localStorage (mọi case thuần túy)", () => {
    // Chỉ kiểm không ném — không truyền cfg sẽ rơi vào getSearchConfig (fallback có sẵn)
    assert.doesNotThrow(() => applySearchConfig("sach", "Sách"));
  });
});
