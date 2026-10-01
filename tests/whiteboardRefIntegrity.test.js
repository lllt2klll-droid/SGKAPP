// P0 — Whiteboard ref integrity: không còn orphan sourceRef khi xoá sách,
// không còn link chết khi đổi tên sách, không còn blob mồ côi khi xoá bảng.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

globalThis.__SGK_TEST__ = true;
globalThis.localStorage = (()=>{ const m=new Map(); return { getItem:k=>m.get(k)??null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear(), get length(){return m.size}, key:i=>[...m.keys()][i]??null }})();
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = { dispatchEvent: () => {} };
globalThis.indexedDB = undefined; // force LS fallback (IDB unavailable in Node)

const wb = await import("../src/whiteboard/whiteboardStore.js");
const storage = await import("../src/storage.js");

function makeBoard(name, refs) {
  const b = wb.blankBoard(name);
  for (const ref of refs) {
    b.objects.push(wb.blankObject("node", {
      text: ref ? `linked:${ref.filename}` : "plain",
      sourceRef: ref || null,
      citation: ref?.citation || "",
    }));
  }
  wb.persistBoard(b);
  return b;
}

beforeEach(() => localStorage.clear());

test("purgeBookRefs: xoá sourceRef của sách bị xoá, giữ sách khác", async () => {
  const ref = { filename: "gone.pdf", page: 3, citation: "SGK Toán 3 - tr.3" };
  const other = { filename: "keep.pdf", page: 1, citation: "SGK Tiếng Việt 3 - tr.1" };
  const b = makeBoard("B1", [ref, other, null]);
  // Lưu trực tiếp (persistBoard đã ghi) → verify trước
  assert.equal(wb.loadBoard(b.id).objects[0].sourceRef.filename, "gone.pdf");

  const changed = await wb.purgeBookRefs("gone.pdf");
  assert.equal(changed, 1, "1 board bị sửa");

  const after = wb.loadBoard(b.id);
  assert.equal(after.objects[0].sourceRef, null, "sourceRef của sách đã xoá bị xoá");
  assert.equal(after.objects[0].citation, "", "citation rỗng");
  assert.equal(after.objects[1].sourceRef.filename, "keep.pdf", "sách khác giữ nguyên");
  assert.equal(after.objects[1].citation, "SGK Tiếng Việt 3 - tr.1");
  assert.equal(after.objects[2].sourceRef, null, "object không ref vẫn null");
  assert.equal(after.objects[2].text, "plain", "nội dung object không đổi");
});

test("purgeBookRefs: khớp cả bookId/file (sourceRef legacy)", async () => {
  const b = makeBoard("B2", [{ bookId: "legacy.pdf", page: 2 }]);
  await wb.purgeBookRefs("legacy.pdf");
  assert.equal(wb.loadBoard(b.id).objects[0].sourceRef, null);
});

test("purgeBookRefs: sách không tồn tại → không sửa gì", async () => {
  const ref = { filename: "keep.pdf", page: 1, citation: "c" };
  const b = makeBoard("B3", [ref]);
  assert.equal(await wb.purgeBookRefs("missing.pdf"), 0);
  assert.equal(wb.loadBoard(b.id).objects[0].sourceRef.filename, "keep.pdf");
});

test("migrateBookRefs: đổi tên sách → sourceRef trỏ tên mới, không link chết", async () => {
  const b = makeBoard("B4", [
    { filename: "old.pdf", bookId: "old.pdf", file: "old.pdf", page: 7, citation: "SGK" },
    { filename: "other.pdf", page: 1 },
  ]);
  const changed = await wb.migrateBookRefs("old.pdf", "new.pdf");
  assert.equal(changed, 1);
  const after = wb.loadBoard(b.id);
  assert.equal(after.objects[0].sourceRef.filename, "new.pdf");
  assert.equal(after.objects[0].sourceRef.bookId, "new.pdf");
  assert.equal(after.objects[0].sourceRef.file, "new.pdf");
  assert.equal(after.objects[0].sourceRef.page, 7, "page giữ nguyên");
  assert.equal(after.objects[1].sourceRef.filename, "other.pdf", "ref khác không đổi");
});

test("migrateBookRefs: tên cũ = tên mới hoặc thiếu tham số → no-op", async () => {
  const b = makeBoard("B5", [{ filename: "a.pdf" }]);
  assert.equal(await wb.migrateBookRefs("a.pdf", "a.pdf"), 0);
  assert.equal(await wb.migrateBookRefs("", "b.pdf"), 0);
  assert.equal(await wb.migrateBookRefs(null, null), 0);
  assert.equal(wb.loadBoard(b.id).objects[0].sourceRef.filename, "a.pdf");
});

test("removeBookData end-to-end: xoá sách → whiteboard không còn link tới sách đó", async () => {
  const f = "xoa-sach.pdf";
  localStorage.setItem(`notes_${f}_1`, "n");
  localStorage.setItem(`ocr_${f}_1`, "o");
  const b = makeBoard("B6", [{ filename: f, page: 5, citation: "SGK Toán 3 - tr.5" }]);

  const ok = await storage.removeBookData(f);
  assert.equal(ok, true);

  const after = wb.loadBoard(b.id);
  assert.ok(after, "bảng vẫn tồn tại (không bị xoá oan)");
  assert.equal(after.objects[0].sourceRef, null, "sourceRef của sách đã xoá bị purge");
  assert.equal(after.objects[0].citation, "");
  assert.equal(localStorage.getItem(`notes_${f}_1`), null, "dữ liệu per-book đã xoá");
});

test("migrateBookData end-to-end: đổi tên sách → sourceRef trên whiteboard cập nhật theo", async () => {
  const oldF = "ten-cu.pdf", newF = "ten-moi.pdf";
  localStorage.setItem(`notes_${oldF}_1`, "note");
  const b = makeBoard("B7", [{ filename: oldF, page: 9, citation: "SGK" }]);

  const res = await storage.migrateBookData(oldF, newF);
  assert.equal(res.ok, true);

  const after = wb.loadBoard(b.id);
  assert.equal(after.objects[0].sourceRef.filename, newF, "ref đổi theo tên mới");
  assert.equal(localStorage.getItem(`notes_${newF}_1`), "note", "dữ liệu per-book migrate");
  assert.equal(localStorage.getItem(`notes_${oldF}_1`), null);
});

test("purgeOrphanImageBlobs: IDB không khả dụng → không throw, trả 0", async () => {
  const b = makeBoard("B8", [null]);
  assert.equal(await wb.purgeOrphanImageBlobs(), 0);
  assert.ok(wb.loadBoard(b.id), "bảng vẫn an toàn");
});

test("deleteBoard: LS fallback không throw và xoá bảng khỏi index", async () => {
  const b = makeBoard("B9", [{ filename: "f.pdf" }]);
  wb.deleteBoard(b.id);
  assert.equal(wb.loadBoard(b.id), null, "bảng đã xoá");
  assert.ok(!wb.listBoards().some((e) => e.id === b.id), "index không còn bảng");
});
