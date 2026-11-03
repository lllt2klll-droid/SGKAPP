import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.__SGK_TEST__ = true;
globalThis.localStorage = (() => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };
})();
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = undefined;

test("canvas settings sync across saved boards without changing their content", async () => {
  localStorage.clear();
  const store = await import("../src/whiteboard/whiteboardStore.js");
  const boards = [store.blankBoard("One"), store.blankBoard("Two")];
  boards[0].objects.push(store.blankObject("node", { text: "Keep me" }));
  const first = store.blankObject("node", { text: "First" });
  const second = store.blankObject("node", { text: "Second" });
  boards[1].objects.push(first, second);
  boards[1].connectors.push({ id: "c1", fromId: first.id, toId: second.id });
  boards[0].grid = false;
  boards[1].smartSpacing = false;
  boards.forEach(store.persistBoard);

  const result = await store.applyCanvasSettingsToAllBoards({
    grid: true,
    snap: true,
    smartAlign: false,
    smartSpacing: true,
  });

  assert.deepEqual(result, { total: 2, updated: 2 });
  for (const original of boards) {
    const saved = await store.loadBoardAsync(original.id);
    assert.equal(saved.grid, true);
    assert.equal(saved.snap, true);
    assert.equal(saved.smartAlign, false);
    assert.equal(saved.smartSpacing, true);
    assert.deepEqual(saved.objects.map((object) => object.text), original.objects.map((object) => object.text));
    assert.equal(saved.connectors.length, original.connectors.length);
  }
});

test("canvas settings sync rejects malformed preferences", async () => {
  const store = await import("../src/whiteboard/whiteboardStore.js");
  await assert.rejects(
    store.applyCanvasSettingsToAllBoards({ grid: true }),
    /Cài đặt canvas không hợp lệ/,
  );
});

test("legacy quick-branch arrow preference migrates into whiteboard settings", async () => {
  localStorage.clear();
  const settingsStore = await import("../src/services/settingsStore.js");
  localStorage.setItem("sgk:whiteboard-branch-arrows", "0");
  localStorage.setItem(settingsStore.SETTINGS_KEY, JSON.stringify({ whiteboard: { grid: false } }));

  const settings = settingsStore.loadSettings();
  assert.equal(settings.whiteboard.grid, false);
  assert.equal(settings.whiteboard.showBranchArrows, false);
});
