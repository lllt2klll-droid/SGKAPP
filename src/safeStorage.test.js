import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
// Im lặng log corrupted/quota dự kiến trong test
globalThis.__SGK_TEST__ = true;
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove, safeGetWithStatus } from "./safeStorage.js";

// Mock localStorage for Node
if (typeof localStorage === "undefined") {
  global.localStorage = (() => {
    const store = new Map();
    return {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k,v) {
        // Simulate quota at 5MB-ish: throw after 100 keys or large value
        if (store.size > 100) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
        if (String(v).length > 100000) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
        store.set(k, String(v));
      },
      removeItem(k) { store.delete(k); },
      clear() { store.clear(); },
      key(i) { return [...store.keys()][i] || null; },
      get length() { return store.size; },
    };
  })();
}

describe("safeStorage - regression tests", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("Test 1 - Save: create -> save -> reload -> data exists", () => {
    const data = { items: [1,2,3], version: 1 };
    const res = safeSetJSON("test_save", data);
    assert.equal(res.ok, true);
    const loaded = safeGetJSON("test_save", null, (v)=> v && Array.isArray(v.items));
    assert.deepEqual(loaded, data);
    // Simulate reload: read again
    const reloaded = safeGetJSON("test_save", null);
    assert.deepEqual(reloaded, data);
  });

  it("Test 2 - Update: create A -> update A -> reload -> latest A exists", () => {
    safeSetJSON("test_update", { items: [1], version: 1 });
    safeSetJSON("test_update", { items: [1,2,3], version: 2 });
    const loaded = safeGetJSON("test_update", null);
    assert.equal(loaded.version, 2);
    assert.deepEqual(loaded.items, [1,2,3]);
  });

  it("Test 3 - Delete: create -> delete -> reload -> deleted", () => {
    safeSetJSON("test_delete", { x: 1 });
    safeRemove("test_delete");
    const loaded = safeGetJSON("test_delete", "FALLBACK");
    assert.equal(loaded, "FALLBACK");
    assert.equal(localStorage.getItem("test_delete"), null);
  });

  it("Test 4 - Corrupted data: valid, invalid, valid -> valid still works", () => {
    safeSetJSON("KEY_A", { ok: 1 });
    // Directly inject corrupted JSON bypassing safe helper
    localStorage.setItem("KEY_B", "{ invalid json,,,");
    safeSetJSON("KEY_C", { ok: 3 });
    const a = safeGetJSON("KEY_A", null);
    const b = safeGetJSON("KEY_B", "FALLBACK_B");
    const c = safeGetJSON("KEY_C", null);
    assert.deepEqual(a, { ok: 1 });
    assert.equal(b, "FALLBACK_B");
    assert.deepEqual(c, { ok: 3 });
    // Ensure corrupted was backed up and not crash
    const statusB = safeGetWithStatus("KEY_B", null);
    assert.equal(statusB.ok, false);
    assert.equal(statusB.error, "CORRUPTED_DATA");
  });

  it("Test 4b - Corrupted schema: JSON valid but wrong schema -> fallback", () => {
    localStorage.setItem("KEY_SCHEMA", JSON.stringify({ items: "abc" }));
    const data = safeGetJSON("KEY_SCHEMA", { items: [] }, (v)=> Array.isArray(v.items));
    assert.deepEqual(data, { items: [] });
  });

  it("Test 4c - Edge cases: null, empty, 'null', '{}', '[]', malformed", () => {
    // empty string
    localStorage.setItem("EDGE_EMPTY", "");
    assert.equal(safeGetJSON("EDGE_EMPTY", "FB"), "FB");
    // "null"
    localStorage.setItem("EDGE_NULL_STR", "null");
    assert.equal(safeGetJSON("EDGE_NULL_STR", "FB"), null); // JSON.parse("null") = null, validator not set -> returns null
    // "{}" with array validator -> fallback
    localStorage.setItem("EDGE_OBJ", "{}");
    assert.deepEqual(safeGetJSON("EDGE_OBJ", [], (v)=> Array.isArray(v)), []);
    // "[]" with object validator -> fallback
    localStorage.setItem("EDGE_ARR", "[]");
    assert.deepEqual(safeGetJSON("EDGE_ARR", {}, (v)=> v && typeof v==="object" && !Array.isArray(v)), {});
    // malformed
    localStorage.setItem("EDGE_BAD", "{bad:}");
    assert.equal(safeGetJSON("EDGE_BAD", "FB"), "FB");
  });

  it("Test 5 - Quota: mock setItem throw QuotaExceededError -> app not crash, returns quota error", () => {
    const large = "x".repeat(200000);
    const res = safeSetJSON("test_quota", { data: large });
    assert.equal(res.ok, false);
    assert.equal(res.quota, true);
    assert.equal(res.error, "QUOTA_EXCEEDED");
    // Ensure old data not deleted if existed
    safeSetJSON("test_quota_keep", { keep: true });
    const before = safeGetJSON("test_quota_keep", null);
    // Try quota again with same key (should fail but not delete)
    const quotaRes = safeSetJSON("test_quota_keep", { data: large });
    if (!quotaRes.ok && quotaRes.quota) {
      const after = safeGetJSON("test_quota_keep", null);
      assert.deepEqual(after, { keep: true });
    }
  });

  it("Test 6 - Isolation: Book A page 50, Book B page 3 -> reload isolation", () => {
    safeSetString("lastPage_bookA.pdf", "50");
    safeSetString("lastPage_bookB.pdf", "3");
    assert.equal(safeGetString("lastPage_bookA.pdf", null), "50");
    assert.equal(safeGetString("lastPage_bookB.pdf", null), "3");
    // Corrupt A should not affect B
    localStorage.setItem("lastPage_bookA.pdf", "not-a-number-corrupted-but-string");
    // safeGetString still returns string, but per-book isolation holds
    assert.equal(safeGetString("lastPage_bookB.pdf", null), "3");
    // For JSON per-book keys
    safeSetJSON("sgk_marks_bookA.pdf", { 1: { yccd: [] } });
    safeSetJSON("sgk_marks_bookB.pdf", { 5: { yccd: [] } });
    // Corrupt A
    localStorage.setItem("sgk_marks_bookA.pdf", "{corrupted");
    const a = safeGetJSON("sgk_marks_bookA.pdf", { fallback: true });
    const b = safeGetJSON("sgk_marks_bookB.pdf", null);
    assert.deepEqual(a, { fallback: true });
    assert.deepEqual(b, { 5: { yccd: [] } });
  });

  it("Test 7 - Reload: data persists after simulated reload", () => {
    safeSetJSON("sgk_settings", { version: 1, appearance: { theme: "dark" } });
    safeSetJSON("sgk_bookmarks", { "book.pdf": [1,5] });
    // Simulate reload by re-reading
    const settings = safeGetJSON("sgk_settings", null);
    const bookmarks = safeGetJSON("sgk_bookmarks", null);
    assert.equal(settings.appearance.theme, "dark");
    assert.deepEqual(bookmarks, { "book.pdf": [1,5] });
    // Update settings without overwriting other keys (test 6 from audit: no overwrite)
    const cur = safeGetJSON("sgk_settings", {});
    const next = { ...cur, appearance: { ...cur.appearance, theme: "light" } };
    safeSetJSON("sgk_settings", next);
    const after = safeGetJSON("sgk_settings", null);
    assert.equal(after.appearance.theme, "light");
    // bookmarks should still exist (not overwritten)
    const bmAfter = safeGetJSON("sgk_bookmarks", null);
    assert.deepEqual(bmAfter, { "book.pdf": [1,5] });
  });
});
