import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bookPageNumber, resolvePageRange, totalBookPagesFor } from "./pageRange.js";

describe("BookReader printed-page ranges", () => {
  it("keeps the PDF cover out of printed page numbers", () => {
    assert.equal(bookPageNumber(1), 1);
    assert.equal(bookPageNumber(8), 7);
    assert.equal(totalBookPagesFor({ isWordFile: false, numPages: 8 }), 7);
    assert.equal(totalBookPagesFor({ isWordFile: true, htmlPagesLength: 4 }), 4);
  });

  it("uses the current printed page when no range is entered", () => {
    assert.equal(resolvePageRange("", "", 20, 6), null);
    assert.deepEqual(resolvePageRange("6", "", 20, 2), { from: 6, to: 6 });
    assert.deepEqual(resolvePageRange("", "8", 20, 6), { from: 6, to: 8 });
  });

  it("rejects reversed ranges and requests over the seven-page limit", () => {
    assert.match(resolvePageRange("9", "8", 20, 1).error, /kết thúc/);
    assert.match(resolvePageRange("1", "8", 20, 1).error, /Tối đa 7 trang/);
    assert.deepEqual(resolvePageRange("3", "9", 20, 1), { from: 3, to: 9 });
  });
});
