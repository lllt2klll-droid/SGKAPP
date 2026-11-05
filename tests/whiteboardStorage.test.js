import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.__SGK_TEST__ = true;
globalThis.indexedDB = undefined;

const storage = new Map();
let failBoardWrites = false;
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    if (failBoardWrites && key.startsWith("sgk_wb_board_")) {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  },
  key(index) {
    return [...storage.keys()][index] ?? null;
  },
  get length() {
    return storage.size;
  },
};

const store = await import("../src/whiteboard/whiteboardStore.js");

test("whiteboard saves report localStorage failures instead of claiming success", async () => {
  localStorage.clear();
  const board = store.blankBoard("Lưu thành công");
  const saved = await store.persistBoardAsync(board);
  assert.equal(saved.ok, true);
  assert.equal(store.loadBoard(board.id)?.name, board.name);

  const failedBoard = store.blankBoard("Hết dung lượng");
  failBoardWrites = true;
  await assert.rejects(store.persistBoardAsync(failedBoard), /Batch save failed/);
  await assert.rejects(store.createBoardAsync("Không thể tạo"), /Batch save failed/);
  failBoardWrites = false;

  assert.equal(store.loadBoard(failedBoard.id), null);
  assert.equal(store.listBoards().some((entry) => entry.id === failedBoard.id), false);
});
