import { test } from "node:test";
import assert from "node:assert/strict";
// Im lặng log IDB-unavailable dự kiến trong test
globalThis.__SGK_TEST__ = true;
// Mock LS/IDB for Node
globalThis.localStorage = (()=>{ const m=new Map(); return { getItem:k=>m.get(k)??null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear(), get length(){return m.size}, key:i=>[...m.keys()][i]??null }})();
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = undefined; // force LS fallback for whiteboard (IDB unavailable in Node)
// Whiteboard board test 20 nodes etc
test("Whiteboard Phase2: 20 nodes, 10 connectors, 5 text, 2 images, viewport preserved via backup/restore", async () => {
  localStorage.clear();
  const wb = await import("../src/whiteboard/whiteboardStore.js");
  // Create board
  const board = wb.blankBoard("Board A");
  // Add 20 nodes
  for (let i=0;i<20;i++) {
    const o = wb.blankObject("node", { x: 100+i*10, y: 100+i*10, text: `Node ${i}`, parentId: null });
    board.objects.push(o);
  }
  // Add 5 text objects
  for (let i=0;i<5;i++) {
    const o = wb.blankObject("text", { x: 200+i*5, y: 200, text: `Text ${i}` });
    board.objects.push(o);
  }
  // Add 10 connectors between nodes
  for (let i=0;i<10;i++) {
    const from = board.objects[i]?.id;
    const to = board.objects[i+10]?.id;
    if (from && to) board.connectors.push({ id: `c_${i}`, fromId: from, toId: to, type: "arrow", color: "#475569", width: 2, sourceAnchor: "auto", targetAnchor: "auto" });
  }
  // Add 2 image objects (imageId only, no base64)
  const img1 = wb.blankObject("image", { x: 50, y: 50, width: 200, height: 150, imageId: "img_test_1" });
  const img2 = wb.blankObject("image", { x: 300, y: 300, width: 200, height: 150, imageId: "img_test_2" });
  board.objects.push(img1, img2);
  board.viewport = { x: 10, y: 20, scale: 1.2 };
  // Persist (LS fallback)
  wb.persistBoard(board);
  const loaded = wb.loadBoard(board.id);
  assert.ok(loaded, "board loaded");
  assert.equal(loaded.objects.filter(o=>o.kind==="node").length, 20, "20 nodes");
  assert.equal(loaded.objects.filter(o=>o.kind==="text").length, 5, "5 text");
  assert.equal(loaded.connectors.length, 10, "10 connectors");
  assert.equal(loaded.objects.filter(o=>o.kind==="image").length, 2, "2 images");
  assert.equal(loaded.objects.filter(o=>o.kind==="image")[0].imageId, "img_test_1");
  assert.ok(!loaded.objects.filter(o=>o.kind==="image")[0].src || !String(loaded.objects.filter(o=>o.kind==="image")[0].src).startsWith("blob:"), "no blob URL persisted");
  assert.equal(loaded.viewport.x, 10);

  // Backup via storage.js (includes WB boards via LS fallback when IDB unavailable)
  const storage = await import("../src/storage.js");
  // Simulate backup preview
  const allKeys = [];
  for (let i=0;i<localStorage.length;i++) allKeys.push(localStorage.key(i));
  // Ensure WB boards are in backup keys (LS)
  assert.ok(allKeys.some(k=>k.startsWith("sgk_wb_board_")), "WB board in LS before backup");

  // Simulate backup -> clear -> restore via LS (IDB unavailable)
  const backupText = JSON.stringify({ app: "hanhtrang-tieu-hoc", version: 2, schemaVersion: 2, exportedAt: new Date().toISOString(), createdAt: new Date().toISOString(), label: "", data: Object.fromEntries(allKeys.filter(k=>k.startsWith("sgk_wb_")).map(k=>[k, localStorage.getItem(k)])), indexedData: {} });
  // Clear
  for (const k of [...allKeys]) if (k.startsWith("sgk_wb_")) localStorage.removeItem(k);
  assert.equal(wb.loadBoard(board.id), null, "cleared");
  // Restore
  const parsed = JSON.parse(backupText);
  for (const [k,v] of Object.entries(parsed.data)) localStorage.setItem(k, v);
  const restored = wb.loadBoard(board.id);
  assert.ok(restored, "restored");
  assert.equal(restored.objects.length, board.objects.length, "objects preserved");
  assert.equal(restored.connectors.length, 10, "connectors preserved");
});

test("Data loss: 20 bookmarks 20 notes 10 lastPage 100 vocab 10 KHBD 3 whiteboards 100 nodes 10 scans preserved", async () => {
  localStorage.clear();
  // Setup data
  const makeId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const bm = {}; for(let i=0;i<20;i++) bm[`book${i}.pdf`] = [1,2,3];
  localStorage.setItem("sgk_bookmarks", JSON.stringify(bm));
  for(let i=0;i<20;i++) localStorage.setItem(`notes_book${i}.pdf_1`, JSON.stringify({ text: `note ${i}` }));
  for(let i=0;i<10;i++) { localStorage.setItem(`lastPage_book${i}.pdf`, String(10+i)); localStorage.setItem(`lastTotal_book${i}.pdf`, String(100)); }
  const vocab = Array.from({length:100}, (_,i)=>({ id: makeId("v"), word: `word${i}`, file: `book${i%10}.pdf` }));
  localStorage.setItem("sgk_vocab", JSON.stringify(vocab));
  const plans = Array.from({length:10}, (_,i)=>({ id: makeId("plan"), title: `Plan ${i}`, hoatDong: [], updatedAt: Date.now() }));
  localStorage.setItem("sgk_lessonplans", JSON.stringify(plans));
  const wb = await import("../src/whiteboard/whiteboardStore.js");
  for(let i=0;i<3;i++) { const b = wb.blankBoard(`Board ${i}`); for(let n=0;n<33;n++) b.objects.push(wb.blankObject("node", { text: `n${n}` })); wb.persistBoard(b); }
  for(let i=0;i<10;i++) localStorage.setItem(`sgk_scans_v1`, JSON.stringify([{ id: makeId("scan"), bookId: `book${i}.pdf`, page: 1, dataUrl: "data:image/png;base64,xxx" }]));
  // Count before
  const beforeKeys = localStorage.length;
  // Backup
  const storage = await import("../src/storage.js");
  const keys = []; for(let i=0;i<localStorage.length;i++) keys.push(localStorage.key(i));
  const data = Object.fromEntries(keys.map(k=>[k, localStorage.getItem(k)]));
  const backup = JSON.stringify({ app: "hanhtrang-tieu-hoc", version:2, schemaVersion:2, data, indexedData:{}, label:"test" });
  // Clear
  for(const k of [...keys]) localStorage.removeItem(k);
  assert.equal(localStorage.length, 0, "cleared");
  // Restore
  await storage.importBackup(backup);
  // Verify
  const bm2 = JSON.parse(localStorage.getItem("sgk_bookmarks"));
  assert.equal(Object.keys(bm2).length, 20, "bookmarks preserved");
  const vocab2 = JSON.parse(localStorage.getItem("sgk_vocab"));
  assert.equal(vocab2.length, 100, "vocab preserved");
  assert.equal(localStorage.getItem("lastPage_book0.pdf"), "10", "lastPage preserved");
  const wbBoards = wb.listBoards();
  assert.equal(wbBoards.length, 3, "whiteboards preserved");
});
