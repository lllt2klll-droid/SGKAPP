// ── Tests cho TOC AI (đọc ảnh mục lục) — logic thuần, không cần DOM/AI ──
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOC_AI_MAX_IMAGES,
  validateTocAiFiles,
  buildTocAiPrompt,
  cleanTocAiItems,
} from "./tocAiService.js";

test("validateTocAiFiles: OK với ảnh hợp lệ, chặn sai MIME", () => {
  assert.deepEqual(validateTocAiFiles([{ name: "a.jpg", type: "image/jpeg", size: 1024 }]), []);
  const errs = validateTocAiFiles([{ name: "a.pdf", type: "application/pdf", size: 1024 }]);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /JPG, PNG, GIF, WebP/);
});

test("validateTocAiFiles: chặn trống và vượt số ảnh tối đa", () => {
  assert.match(validateTocAiFiles([])[0], /Chưa chọn ảnh/);
  const many = Array.from({ length: TOC_AI_MAX_IMAGES + 1 }, (_, i) => ({
    name: `${i}.jpg`,
    type: "image/jpeg",
    size: 100,
  }));
  assert.match(validateTocAiFiles(many)[0], /tối đa/);
});

test("buildTocAiPrompt: giữ nguyên số trang in, bỏ leader dots, trả JSON mảng", () => {
  const { userText, systemInstruction, generationConfig } = buildTocAiPrompt({
    bookTitle: "Tiếng Việt 5",
    subject: "Tiếng Việt",
    grade: 5,
    imageCount: 2,
    totalPages: 100,
  });
  assert.match(userText, /KHÔNG cộng\/trừ/);
  assert.match(userText, /BỎ dấu chấm nối/);
  assert.match(userText, /"page" tăng dần/);
  assert.match(userText, /\[{"title":"\.\.\.","page":12}/);
  assert.match(userText, /Sách: "Tiếng Việt 5"/);
  assert.ok(systemInstruction.parts[0].text.length > 10);
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.equal(generationConfig.thinkingConfig.thinkingBudget, 0); // không để thinking cắt mất JSON dài
});

test("cleanTocAiItems: bỏ dòng thiếu tên/trang, cắt leader dots, khử trùng, sắp theo trang", () => {
  const { items, warnings } = cleanTocAiItems([
    { title: "Bài 3 .......... 30", page: 30 },
    { title: "Bài 1 ..... 12", page: 12 },
    { title: "Bài 1 ..... 12", page: 12 }, // trùng
    { title: "   ", page: 5 }, // thiếu tên
    { title: "Bài 2", page: "xx" }, // thiếu trang
    { title: "Chương II", page: 20 },
  ]);
  assert.deepEqual(items.map((i) => i.title), ["Bài 1", "Chương II", "Bài 3"]);
  assert.deepEqual(items.map((i) => i.page), [12, 20, 30]);
  assert.ok(warnings.some((w) => w.includes("bỏ 3 dòng")));
});

test("cleanTocAiItems: nhận mảng lồng trong {items} và kẹp trang vượt totalPages", () => {
  const { items, warnings } = cleanTocAiItems(
    { items: [{ title: "Mở đầu", page: 3 }, { title: "Kết", page: 250 }] },
    { totalPages: 100 },
  );
  assert.equal(items.length, 2);
  assert.equal(items[1].page, 100);
  assert.ok(warnings.some((w) => w.includes("đã kẹp về 100")));
});

test("cleanTocAiItems: cảnh báo trang bị lặp và rỗng khi AI trả vô nghĩa", () => {
  const dup = cleanTocAiItems([
    { title: "A", page: 10 },
    { title: "B", page: 10 },
  ]);
  assert.ok(dup.warnings.some((w) => w.includes("trang bị lặp")));

  const empty = cleanTocAiItems(null);
  assert.equal(empty.items.length, 0);
  assert.ok(empty.warnings.length > 0);
});

test("cleanTocAiItems: số trang dạng '12.5'/'12-15'/'trang 12' lấy nhóm số đầu", () => {
  const { items } = cleanTocAiItems([
    { title: "A", page: "12.5" },
    { title: "B", page: "trang 30" },
    { title: "C", page: "40-42" },
  ]);
  assert.deepEqual(items.map((i) => i.page), [12, 30, 40]);
});

test("roundtrip: AI items → exportTocSimple (2 cột Tên/Trang) → parseTocExcel đọc lại đúng", async () => {
  const { exportTocSimple, parseTocExcel } = await import("./tocExcel.js");
  const items = [{ title: "Bài 1", page: 15 }, { title: "Bài 2", page: 20 }];
  const buf = await exportTocSimple([{ items }]);
  const books = await parseTocExcel(buf, {
    key: "test1",
    title: "Sách Test",
    grade: 5,
    subject: "Toan",
    term: 1,
  });
  const b = books.find((x) => x.key === "test1") || books[0];
  assert.equal(b.items.length, 2);
  assert.equal(b.items[0].title, "Bài 1");
  assert.equal(b.items[0].page, 15);
  assert.equal(b.items[1].page, 20);
  assert.equal(b.items[0].depth, 1); // luật cũ: "Bài ..." → depth 1
});
