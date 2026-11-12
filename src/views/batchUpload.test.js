import test from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_CHUNK_SIZE,
  BATCH_COPY_MAX_BYTES,
  BATCH_MAX_FILES,
  batchFileExt,
  batchResultSummary,
  buildBatchItems,
  canLinkAll,
  chunkItems,
  countBatchStatuses,
  isLinkablePdfItem,
  sanitizeBatchTitle,
} from "./batchUpload.js";

const file = (name, size = 1024) => ({ name, size });

test("batchFileExt nhận đuôi file, kể cả tên có dấu cách", () => {
  assert.equal(batchFileExt("Sách Toán 1.PDF"), ".pdf");
  assert.equal(batchFileExt("bai-giang.docx"), ".docx");
  assert.equal(batchFileExt("khong-co-duoi"), "");
  assert.equal(batchFileExt(""), "");
});

test("buildBatchItems giữ file hợp lệ ở trạng thái chờ", () => {
  const { items, skipped } = buildBatchItems([file("toan-1.pdf"), file("tieng-viet.docx")], {
    getTitle: (name) => `Tựa ${name}`,
  });
  assert.equal(skipped, 0);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.status), ["pending", "pending"]);
  assert.equal(items[0].title, "Tựa toan-1.pdf");
  assert.equal(items[0].id, "batch-0");
});

test("buildBatchItems đánh dấu định dạng không hỗ trợ", () => {
  const { items } = buildBatchItems([file("virus.exe")]);
  assert.equal(items[0].status, "invalid");
  assert.match(items[0].error, /Định dạng chưa hỗ trợ/);
});

test("buildBatchItems đánh dấu file rỗng", () => {
  const { items } = buildBatchItems([file("rong.pdf", 0)]);
  assert.equal(items[0].status, "invalid");
  assert.match(items[0].error, /0 byte/);
});

test("PDF lớn chỉ hợp lệ khi có đường dẫn gốc để liên kết", () => {
  const big = BATCH_COPY_MAX_BYTES + 1;

  const copyOnly = buildBatchItems([file("sach-lon.pdf", big)]).items[0];
  assert.equal(copyOnly.status, "invalid");
  assert.match(copyOnly.error, /Giới hạn 80 MB/);

  const linkable = buildBatchItems([file("sach-lon.pdf", big)], {
    getSourcePath: () => "D:\\Desktop\\sach-lon.pdf",
  }).items[0];
  assert.equal(linkable.status, "pending");
  assert.equal(isLinkablePdfItem(linkable), true);
});

test("buildBatchItems chống trùng trong cùng lần chọn", () => {
  const { items } = buildBatchItems([file("a.pdf", 10), file("A.PDF", 10)]);
  assert.equal(items[0].status, "pending");
  assert.equal(items[1].status, "invalid");
  assert.match(items[1].error, /Trùng/);
});

test("buildBatchItems giới hạn số file mỗi lần", () => {
  const files = Array.from({ length: BATCH_MAX_FILES + 5 }, (_, i) => file(`sach-${i}.pdf`, i + 1));
  const { items, skipped } = buildBatchItems(files);
  assert.equal(items.length, BATCH_MAX_FILES);
  assert.equal(skipped, 5);
});

test("sanitizeBatchTitle bỏ tiêu đề quá ngắn và cắt 160 ký tự", () => {
  assert.equal(sanitizeBatchTitle("", "Tựa gợi ý"), "Tựa gợi ý");
  assert.equal(sanitizeBatchTitle("ab", "Tựa gợi ý"), "Tựa gợi ý");
  assert.equal(sanitizeBatchTitle("  Toán 1  ", "x"), "Toán 1");
  assert.equal(sanitizeBatchTitle("a".repeat(200), "x").length, 160);
});

test("canLinkAll chỉ đúng khi mọi file là PDF có đường dẫn gốc", () => {
  const pdfs = [
    { name: "a.pdf", sourcePath: "C:\\a.pdf" },
    { name: "b.PDF", sourcePath: "C:\\b.pdf" },
  ];
  assert.equal(canLinkAll(pdfs), true);
  assert.equal(canLinkAll([...pdfs, { name: "c.docx", sourcePath: "C:\\c.docx" }]), false);
  assert.equal(canLinkAll([{ name: "a.pdf", sourcePath: "" }]), false);
  assert.equal(canLinkAll([]), false);
});

test("chunkItems chia đều và giữ nguyên thứ tự", () => {
  const items = Array.from({ length: BATCH_CHUNK_SIZE * 2 + 3 }, (_, i) => i);
  const chunks = chunkItems(items);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, BATCH_CHUNK_SIZE);
  assert.equal(chunks[2].length, 3);
  assert.deepEqual(chunks.flat(), items);
  assert.deepEqual(chunkItems([], 10), []);
});

test("countBatchStatuses đếm đúng từng trạng thái", () => {
  const counts = countBatchStatuses([
    { status: "pending" },
    { status: "done" },
    { status: "done" },
    { status: "error" },
    { status: "invalid" },
    { status: "la" },
  ]);
  assert.equal(counts.total, 6);
  assert.equal(counts.done, 2);
  assert.equal(counts.error, 1);
  assert.equal(counts.invalid, 1);
  assert.equal(counts.pending, 1);
});

test("batchResultSummary phản ánh đủ/sai và chế độ liên kết", () => {
  assert.equal(batchResultSummary({ done: 3 }), "Đã thêm 3 sách vào thư viện.");
  assert.match(batchResultSummary({ done: 2, failed: 1 }), /2 sách, 1 file lỗi/);
  assert.match(batchResultSummary({ done: 0, failed: 2 }), /Không thêm được sách nào/);
  assert.match(batchResultSummary({ done: 4, mode: "link" }), /liên kết 4 sách/);
  assert.match(batchResultSummary({ aborted: true }), /Đã hủy/);
});
