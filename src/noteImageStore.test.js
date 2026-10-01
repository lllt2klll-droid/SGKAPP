import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
globalThis.__SGK_TEST__ = true;
// Node không có indexedDB → noteImageStore phải fallback inline, không throw
globalThis.indexedDB = undefined;
const { default: indexedDBService } = await import("./indexedDB.js");
assert.equal(indexedDBService.constructor.isAvailable(), false);

if (typeof localStorage === "undefined") {
  global.localStorage = (() => {
    const store = new Map();
    return {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
      clear() { store.clear(); },
      key(i) { return [...store.keys()][i] || null; },
      get length() { return store.size; },
    };
  })();
}

const store = await import("./noteImageStore.js");
const safe = await import("./safeStorage.js");

describe("noteImageStore — fix bộ nhớ đầy ghi chú", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("isNoteImageRef phân biệt ref mới và base64 cũ", () => {
    assert.equal(store.isNoteImageRef("idb:noteimg_abc"), true);
    assert.equal(store.isNoteImageRef("data:image/jpeg;base64,/9j/"), false);
    assert.equal(store.isNoteImageRef(""), false);
    assert.equal(store.isNoteImageRef(null), false);
  });

  it("fallback khi không có IndexedDB: giữ inline, không mất ảnh", async () => {
    const big = "data:image/jpeg;base64," + "A".repeat(20000);
    const saved = await store.saveNoteImage(big, "book.pdf");
    assert.equal(saved, big); // không IDB → giữ nguyên để khỏi mất dữ liệu
    const arr = await store.persistNoteImages([big, "idb:keep_me"], "book.pdf");
    assert.deepEqual(arr, [big, "idb:keep_me"]); // ref cũ tái sử dụng
  });

  it("ảnh nhỏ < 8KB luôn giữ inline (khỏi tốn record IDB)", async () => {
    const small = "data:image/png;base64," + "B".repeat(100);
    assert.equal(await store.saveNoteImage(small), small);
  });

  it("getNoteImageSrc với inline trả về ngay, ref thiếu IDB trả về rỗng nhưng không throw", async () => {
    const inline = "data:image/jpeg;base64,XYZ";
    assert.equal(await store.getNoteImageSrc(inline), inline);
    assert.equal(await store.getNoteImageSrc("idb:missing_no_idb"), "");
  });

  it("dataUrlToBlob/blob round-trip (nếu có Blob/FileReader)", async () => {
    if (typeof Blob === "undefined" || typeof FileReader === "undefined") return;
    const dataUrl = "data:image/jpeg;base64," + Buffer.from("hello-image").toString("base64");
    const blob = store.dataUrlToBlob(dataUrl);
    assert.ok(blob instanceof Blob);
    const back = await store.blobToDataUrl(blob);
    assert.ok(String(back).startsWith("data:image/jpeg"));
  });
});

describe("safeStorage quota retry — tự dọn cache cứu ghi chú", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("freeSpaceForNotes chỉ xóa cache, không đụng notes_/marks_/teacherNotes_", () => {
    localStorage.setItem("notes_book.pdf_1", JSON.stringify([{ id: 1 }]));
    localStorage.setItem("sgk_marks_book.pdf", "{}");
    localStorage.setItem("sgk_teacherNotes_book.pdf", "{}");
    localStorage.setItem("ai_image_cache", JSON.stringify({ big: "x".repeat(1000) }));
    localStorage.setItem("ocr_book.pdf_1", "cache-ocr");
    localStorage.setItem("__corrupted__notes_x_123", "{bad");
    const { freed } = safe.freeSpaceForNotes();
    assert.ok(freed >= 3);
    assert.ok(localStorage.getItem("notes_book.pdf_1") !== null);
    assert.ok(localStorage.getItem("sgk_marks_book.pdf") !== null);
    assert.ok(localStorage.getItem("sgk_teacherNotes_book.pdf") !== null);
    assert.equal(localStorage.getItem("ai_image_cache"), null);
    assert.equal(localStorage.getItem("ocr_book.pdf_1"), null);
  });

  it("safeSetJSONWithQuotaRetry: quota lần đầu → dọn cache → lưu được", async () => {
    // Giả lập localStorage gần đầy: setItem ném quota khi value lớn VÀ còn cache
    const real = { get: localStorage.getItem.bind(localStorage) };
    void real;
    localStorage.setItem("ai_image_cache", "x".repeat(5000));
    let failOnce = true;
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => {
      if (failOnce && String(v).length > 1000) {
        failOnce = false;
        const e = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        throw e;
      }
      return origSet(k, v);
    };
    try {
      const r = safe.safeSetJSONWithQuotaRetry("notes_book.pdf_9", [{ id: 1, text: "x".repeat(2000) }]);
      assert.equal(r.ok, true);
      assert.equal(localStorage.getItem("ai_image_cache"), null); // cache đã bị dọn để cứu note
    } finally {
      localStorage.setItem = origSet;
    }
  });
});
