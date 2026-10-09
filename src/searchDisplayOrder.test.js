// ─── Test thứ tự hiển thị kết quả Ctrl+K — index phẳng PHẢI khớp nhóm render ───
// Lỗi cũ: render sắp nhóm theo TYPE_ORDER nhưng keyboard index theo thứ tự đẩy
// của mảng results (book → toc → … → note) → Enter chạy lệnh kết quả KHÁC item
// đang highlight.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupResultsForDisplay, TYPE_ORDER, typeRank } from "./searchDisplayOrder.js";

globalThis.__SGK_TEST__ = true;

const r = (type, id) => ({ type, id, title: id });

describe("searchDisplayOrder — groupResultsForDisplay", () => {
  it("kết quả đẩy theo thứ tự book→toc vẫn hiển thị toc trước (TYPE_ORDER)", () => {
    const input = [r("book", "b1"), r("toc", "t1")];
    const { displayGroups, flatResults } = groupResultsForDisplay(input);
    assert.deepEqual(
      displayGroups.map((g) => g.type),
      ["toc", "book"],
      "nhóm toc phải đứng trước book dù book bị đẩy vào trước",
    );
    assert.deepEqual(
      flatResults.map((x) => x.id),
      ["t1", "b1"],
      "index phẳng phải theo đúng thứ tự render",
    );
  });

  it("mọi type có trong TYPE_ORDER được xếp đúng theo TYPE_ORDER", () => {
    // Đẩy ngược thứ tự: collection trước, toc sau
    const input = [...TYPE_ORDER].reverse().map((t) => r(t, `id-${t}`));
    const { displayGroups } = groupResultsForDisplay(input);
    assert.deepEqual(
      displayGroups.map((g) => g.type),
      TYPE_ORDER,
      "thứ tự nhóm phải đúng TYPE_ORDER",
    );
  });

  it("flatResults === concat của displayGroups (Enter trúng đúng item đang highlight)", () => {
    const input = [
      r("book", "b1"),
      r("toc", "t1"),
      r("note", "n1"),
      r("book", "b2"),
      r("toc", "t2"),
      r("note", "n2"),
    ];
    const { displayGroups, flatResults } = groupResultsForDisplay(input);
    assert.deepEqual(
      flatResults,
      displayGroups.flatMap((g) => g.items),
      "flat phải là nối thẳng các nhóm theo đúng thứ tự render",
    );
    // Không mất/đôi item
    assert.equal(flatResults.length, input.length);
    assert.equal(new Set(flatResults.map((x) => x.id)).size, input.length);
  });

  it("type lạ không có trong TYPE_ORDER bị đẩy xuống cuối, không phải lên đầu", () => {
    const input = [r("unknown-type", "u1"), r("toc", "t1"), r("book", "b1")];
    const { displayGroups, flatResults } = groupResultsForDisplay(input);
    assert.deepEqual(
      displayGroups.map((g) => g.type),
      ["toc", "book", "unknown-type"],
      "type lạ phải xuống cuối (indexOf=-1 không được biến thành đầu bảng)",
    );
    assert.equal(flatResults[flatResults.length - 1].id, "u1");
  });

  it("typeRank nhất quán với TYPE_ORDER", () => {
    assert.equal(typeRank("toc"), 0);
    assert.equal(typeRank("collection"), TYPE_ORDER.length - 1);
    assert.equal(typeRank("khong-ton-tai"), TYPE_ORDER.length);
  });

  it("input rỗng / null không ném lỗi", () => {
    assert.deepEqual(groupResultsForDisplay([]), { displayGroups: [], flatResults: [] });
    assert.deepEqual(groupResultsForDisplay(null), { displayGroups: [], flatResults: [] });
    assert.deepEqual(groupResultsForDisplay(undefined), { displayGroups: [], flatResults: [] });
  });

  it("item thiếu type bị bỏ qua thay vì làm hỏng nhóm", () => {
    const { flatResults } = groupResultsForDisplay([null, { id: "x" }, r("toc", "t1")]);
    assert.equal(flatResults.length, 1);
    assert.equal(flatResults[0].id, "t1");
  });
});
