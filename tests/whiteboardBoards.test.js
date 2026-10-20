// Quản lý "Bảng của bạn": sắp xếp + chi tiết + payload nhiều bảng.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SORTS,
  sortBoardEntries,
  formatBoardSizeKb,
  extractMultiBoardsPayload,
} from "../src/whiteboard/whiteboardHelpers.js";

describe("whiteboard boards manager", () => {
  it("BOARD_SORTS đủ 4 kiểu", () => {
    assert.deepEqual(BOARD_SORTS.map((s) => s.id), ["updated", "name", "objects", "created"]);
  });

  it("sortBoardEntries: mới nhất / tên / nhiều khối / tạo gần đây", () => {
    const entries = [
      { id: "b", name: "Xoài", updatedAt: 200, createdAt: 200 },
      { id: "a", name: "Ổi", updatedAt: 300, createdAt: 100 },
      { id: "c", name: "Cam", updatedAt: 100, createdAt: 300 },
    ];
    assert.deepEqual(sortBoardEntries(entries, "updated").map((e) => e.id), ["a", "b", "c"]);
    assert.deepEqual(sortBoardEntries(entries, "created").map((e) => e.id), ["c", "b", "a"]);
    const names = sortBoardEntries(entries, "name").map((e) => e.name);
    assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, "vi")));
    const details = { a: { objects: 1 }, b: { objects: 9 }, c: { objects: 5 } };
    assert.deepEqual(sortBoardEntries(entries, "objects", details).map((e) => e.id), ["b", "c", "a"]);
    // thiếu details → không crash, vẫn sắp được
    assert.equal(sortBoardEntries(entries, "objects", null).length, 3);
    assert.equal(sortBoardEntries(null, "updated").length, 0);
  });

  it("formatBoardSizeKb: KB/MB chuẩn", () => {
    assert.equal(formatBoardSizeKb(0), "0KB");
    assert.equal(formatBoardSizeKb(46080), "45KB");
    assert.equal(formatBoardSizeKb(1536), "1.5KB");
    assert.equal(formatBoardSizeKb(2 * 1024 * 1024), "2MB");
    assert.equal(formatBoardSizeKb("rác"), "0KB");
  });

  it("extractMultiBoardsPayload: nhận {boards} và mảng thô, từ chối đơn", () => {
    const one = { id: "x", objects: [{ id: "o1" }], connectors: [] };
    assert.deepEqual(extractMultiBoardsPayload({ boards: [one] }), [one]);
    assert.deepEqual(extractMultiBoardsPayload([one]), [one]);
    assert.equal(extractMultiBoardsPayload({ board: one }), null);
    assert.equal(extractMultiBoardsPayload(one), null);
    assert.equal(extractMultiBoardsPayload(null), null);
    assert.equal(extractMultiBoardsPayload("rác"), null);
  });
});
