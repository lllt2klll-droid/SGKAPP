// Tests cho helpers thuần tách từ BookReader.jsx → src/reader/textClean.js
// Logic thuần, không cần DOM (sanitizeNoteHtml/plainTextFromHtml cần document
// nên không cover ở đây — giữ nguyên hành vi browser).
import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanExtractedText,
  tryParseJSONBookReader,
  parseJSONSafe,
} from "./textClean.js";

test("cleanExtractedText: bỏ URL và watermark, giữ phân số 1/2", () => {
  assert.equal(cleanExtractedText(""), "");
  assert.equal(cleanExtractedText(null), "");
  const out = cleanExtractedText("Bài 1 https://blogtailieu.com/abc sách chia sẻ tại blogtailieu xong");
  assert.ok(!out.includes("http"), "phải bỏ URL");
  assert.ok(!out.includes("blogtailieu"), "phải bỏ watermark");
  // phân số giữ nguyên khi không dính watermark (hành vi gốc)
  assert.ok(cleanExtractedText("ôn tập phân số 1/2 và 3/4 nhé").includes("1/2"), "phải giữ phân số");
});

test("cleanExtractedText: xóa slash lẻ, gọn khoảng trắng", () => {
  assert.equal(cleanExtractedText("a / b"), "a b");
  assert.equal(cleanExtractedText("  nhiều   khoảng  "), "nhiều khoảng");
});

test("tryParseJSONBookReader: JSON chuẩn ok, trailing comma ok, rác fail", () => {
  const r1 = tryParseJSONBookReader('{"a":1}');
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.value, { a: 1 });
  const r2 = tryParseJSONBookReader('{"a":1,}');
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.value, { a: 1 });
  const r3 = tryParseJSONBookReader("không phải json{{{");
  assert.equal(r3.ok, false);
  assert.equal(r3.value, null);
});

test("parseJSONSafe: parse mảng thuần, bóc code fence", () => {
  assert.deepEqual(parseJSONSafe('```json\n[{"title":"A","page":1}]\n```'), [
    { title: "A", page: 1 },
  ]);
  assert.deepEqual(parseJSONSafe('[{"a":1,}]'), [{ a: 1 }]);
});

test("parseJSONSafe: fallback cắt khối JSON khi AI chèn chữ xung quanh", () => {
  const v = parseJSONSafe('Chào thầy cô, đây là kết quả: [{"title":"Bài 1","page":12}] nhé!');
  assert.deepEqual(v, [{ title: "Bài 1", page: 12 }]);
  const o = parseJSONSafe('kết quả {"a": 2} hết');
  assert.deepEqual(o, { a: 2 });
});

test("parseJSONSafe: rỗng / chuỗi thuần → null", () => {
  assert.equal(parseJSONSafe(""), null);
  assert.equal(parseJSONSafe(null), null);
  assert.equal(parseJSONSafe('"chỉ là chuỗi"'), null);
  assert.equal(parseJSONSafe("không có json"), null);
});
