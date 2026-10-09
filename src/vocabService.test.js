import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

globalThis.__SGK_TEST__ = true;
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] || null,
  };
})();
globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.document = { documentElement: { style: { setProperty: () => {} } } };

const {
  normalizeTags,
  tagsToString,
  filterVocabEntries,
  collectTags,
  computeVocabStats,
  computeDaySeries,
  entriesNeedingMeaning,
  buildCsvRows,
  buildVocabDocHtml,
  buildMcQuestions,
  buildExplainPrompt,
  buildQuestionPrompt,
  parseAiQuestions,
  parseAiMeanings,
  chunked,
} = await import("./vocabService.js");

const {
  getVocab,
  addVocabEntry,
  updateVocabEntry,
  updateVocabMeaning,
  removeVocabEntry,
  restoreVocabEntries,
} = await import("./userdata.js");

const DAY = 86400000;

function entry(over = {}) {
  return {
    id: over.id || `v_${Math.random().toString(36).slice(2, 8)}`,
    word: "w",
    meaning: "m",
    file: "a.pdf",
    bookTitle: "Sách A",
    grade: 1,
    page: 3,
    at: Date.now(),
    ...over,
  };
}

describe("vocabService · tags", () => {
  it("chuẩn hoá thẻ: cắt phẩy, khử trùng, giới hạn độ dài", () => {
    assert.deepEqual(normalizeTags("unit 3, , Unit 3, từ khó"), ["unit 3", "từ khó"]);
    assert.deepEqual(normalizeTags(["a", "a", "b"]), ["a", "b"]);
    assert.deepEqual(normalizeTags(null), []);
    assert.equal(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 20);
    assert.equal(normalizeTags(["x".repeat(50)])[0].length, 24);
  });

  it("tagsToString ghép chuỗi phẩy", () => {
    assert.equal(tagsToString(["a", "b"]), "a, b");
    assert.equal(tagsToString([]), "");
  });

  it("collectTags đếm số lần dùng và sắp xếp giảm dần", () => {
    const tags = collectTags([entry({ tags: ["b", "a"] }), entry({ tags: ["b"] })]);
    assert.equal(tags[0].tag, "b");
    assert.equal(tags[0].count, 2);
    assert.equal(tags[1].count, 1);
  });
});

describe("vocabService · lọc", () => {
  const list = [
    entry({ id: "1", word: "phép cộng", meaning: "tổng hai số", file: "toan.pdf", grade: 1 }),
    entry({ id: "2", word: "âm nhạc", meaning: "", file: "vh.pdf", grade: 2, tags: ["unit3"] }),
    entry({ id: "3", word: "hình học", meaning: "", file: "toan.pdf", grade: 1 }),
  ];

  it("lọc theo từ khóa (không dấu, khớp nghĩa/thẻ)", () => {
    assert.equal(filterVocabEntries(list, { query: "phep" }).length, 1);
    assert.equal(filterVocabEntries(list, { query: "tổng" }).length, 1);
    assert.equal(filterVocabEntries(list, { query: "unit3" }).length, 1);
    assert.equal(filterVocabEntries(list, {}).length, 3);
  });

  it("lọc theo sách / thiếu nghĩa / thẻ", () => {
    assert.equal(filterVocabEntries(list, { file: "toan.pdf" }).length, 2);
    assert.deepEqual(filterVocabEntries(list, { missingMeaning: true }).map((e) => e.id), ["2", "3"]);
    assert.deepEqual(filterVocabEntries(list, { tag: "UNIT3" }).map((e) => e.id), ["2"]);
    assert.equal(filterVocabEntries(null, { query: "x" }).length, 0);
  });

  it("entriesNeedingMeaning: phạm vi chọn > lọc, bỏ qua từ đã có nghĩa", () => {
    assert.deepEqual(entriesNeedingMeaning(list, ["1", "2"]).map((e) => e.id), ["2"]);
    assert.deepEqual(entriesNeedingMeaning(list, null).map((e) => e.id), ["2", "3"]);
  });
});

describe("vocabService · thống kê", () => {
  const now = Date.now();
  const list = [
    entry({ id: "1", file: "a.pdf", bookTitle: "A", grade: 1, at: now }),
    entry({ id: "2", file: "a.pdf", bookTitle: "A", grade: 1, at: now - DAY, meaning: "" }),
    entry({ id: "3", file: "b.pdf", bookTitle: "B", grade: 2, at: now - 3 * DAY, tags: ["x"] }),
  ];

  it("computeVocabStats tổng hợp theo sách, lớp, thiếu nghĩa", () => {
    const s = computeVocabStats(list);
    assert.equal(s.total, 3);
    assert.equal(s.missingMeaning, 1);
    assert.equal(s.withMeaning, 2);
    assert.equal(s.tagged, 1);
    assert.equal(s.byFile[0].file, "a.pdf");
    assert.equal(s.byFile[0].count, 2);
    assert.equal(s.byFile[1].count, 1);
    assert.deepEqual(s.byGrade.map((g) => g.grade), [1, 2]);
    assert.equal(s.lastAt, now);
  });

  it("computeDaySeries đếm đúng số từ theo ngày trong khoảng", () => {
    const series7 = computeDaySeries(list, 7);
    assert.equal(series7.length, 7);
    assert.equal(series7.reduce((a, d) => a + d.count, 0), 3);
    assert.match(series7[0].label, /^\d{2}\/\d{2}$/);
    const series30 = computeDaySeries(list, 30);
    assert.equal(series30.length, 30);
    const series1 = computeDaySeries(list, 1);
    assert.equal(series1.length, 1);
    assert.equal(series1[0].count, 1);
  });
});

describe("vocabService · xuất dữ liệu", () => {
  const books = new Map([["a.pdf", { title: "Toán 1" }]]);
  const list = [entry({ word: "cộng", meaning: "tổng", file: "a.pdf", page: 3 })];

  it("CSV có đúng 7 cột, hàng đầu là tiêu đề", () => {
    const rows = buildCsvRows(list, books);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].length, 7);
    assert.equal(rows[1][0], "cộng");
    assert.equal(rows[1][3], "Toán 1");
  });

  it("HTML Word escape ký tự đặc biệt và đủ số hàng", () => {
    const html = buildVocabDocHtml(
      [entry({ word: "<b>x</b>", meaning: 'a "b" & c', file: "a.pdf" })],
      books,
      { title: "Tiêu đề" },
    );
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.ok(html.includes("&amp;"));
    assert.ok(html.includes("Toán 1"));
    assert.ok(html.includes("Tiêu đề"));
    assert.ok(!html.includes("<b>x</b>"));
  });
});

describe("vocabService · sinh câu hỏi", () => {
  const list = [
    entry({ id: "1", word: "con mèo", meaning: "loài vật nuôi" }),
    entry({ id: "2", word: "con chó", meaning: "loài vật canh nhà" }),
    entry({ id: "3", word: "con gà", meaning: "loài vật đẻ trứng" }),
    entry({ id: "4", word: "con vịt", meaning: "loài vật bơi dưới nước" }),
    entry({ id: "5", word: "thiếu nghĩa", meaning: "" }),
  ];

  it("buildMcQuestions trả về câu mc hợp lệ, xen kẽ 2 chiều", () => {
    const { questions, skipped } = buildMcQuestions(list, 20);
    assert.equal(questions.length, 4);
    assert.deepEqual(skipped, ["thiếu nghĩa"]);
    for (const q of questions) {
      assert.equal(q.type, "mc");
      assert.equal(q.options.length, 4);
      assert.ok(q.options.every((o) => String(o).trim()));
      assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4, "phương án phải khác nhau");
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.question.includes('"'));
    }
    const wordFirst = questions.filter((q) => q.question.startsWith("Nghĩa của từ"));
    assert.equal(wordFirst.length, 2, "xen kẽ 2 câu từ→nghĩa");
    const meaningFirst = questions.filter((q) => q.question.startsWith("Từ nào có nghĩa"));
    assert.equal(meaningFirst.length, 2, "và 2 câu nghĩa→từ");
  });

  it("buildMcQuestions tôn trọng limit", () => {
    const { questions } = buildMcQuestions(list, 2);
    assert.equal(questions.length, 2);
  });

  it("buildMcQuestions bỏ qua danh sách không đủ phương án", () => {
    const { questions, skipped } = buildMcQuestions([list[0]]);
    assert.equal(questions.length, 0);
    assert.deepEqual(skipped, ["con mèo"]);
  });

  it("parseAiQuestions nhận JSON hợp lệ, bỏ câu lỗi", () => {
    const text = JSON.stringify([
      { question: "Nghĩa của từ 'mèo'?", options: ["a", "b", "c", "d"], correctIndex: 1 },
      { question: "Câu lỗi", options: ["a", "b"], correctIndex: 0 },
      { question: "", options: ["a", "b", "c", "d"], correctIndex: 0 },
    ]);
    const { questions, failed } = parseAiQuestions(`\`\`\`json\n${text}\n\`\`\``);
    assert.equal(questions.length, 1);
    assert.equal(failed, 2);
    assert.equal(questions[0].correctIndex, 1);
    assert.deepEqual(parseAiQuestions("không phải json").questions, []);
    assert.deepEqual(parseAiQuestions("").questions, []);
  });

  it("parseAiMeanings ánh xạ word → meaning (không phân biệt hoa thường)", () => {
    const map = parseAiMeanings('[{"word":"Mèo","meaning":"con vật"},{"word":" ","meaning":"x"}]');
    assert.equal(map.get("mèo"), "con vật");
    assert.equal(map.size, 1);
    assert.equal(parseAiMeanings("lỗi").size, 0);
  });

  it("prompt chứa đủ danh sách từ và ngữ cảnh sách", () => {
    const explain = buildExplainPrompt(list.slice(0, 2), 1);
    assert.ok(explain.includes('"con mèo"'));
    assert.ok(explain.includes('"con chó"'));
    assert.ok(explain.includes("lớp 1"));
    const q = buildQuestionPrompt(list.slice(0, 2), "Toán 1", 2);
    assert.ok(q.includes("Toán 1"));
    assert.ok(q.includes('"con mèo"'));
    assert.ok(q.includes("correctIndex"));
  });

  it("chunked chia đúng nhóm 10", () => {
    const chunks = chunked(Array.from({ length: 23 }, (_, i) => i), 10);
    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks[2], [20, 21, 22]);
  });
});

describe("userdata · sổ tay từ vựng", () => {
  beforeEach(() => localStorage.clear());

  it("add → update patch giữ id, sửa được nhiều trường", () => {
    addVocabEntry({ word: "abc", meaning: "", file: "a.pdf", page: 1 });
    const [created] = getVocab();
    assert.equal(created.word, "abc");

    updateVocabEntry(created.id, { meaning: "nghĩa mới", tags: ["unit1"] });
    const [updated] = getVocab();
    assert.equal(updated.id, created.id);
    assert.equal(updated.meaning, "nghĩa mới");
    assert.deepEqual(updated.tags, ["unit1"]);
    assert.equal(updated.word, "abc", "patch không đụng trường khác");

    updateVocabEntry("không-tồn-tại", { meaning: "x" });
    assert.equal(getVocab().length, 1);
  });

  it("updateVocabMeaning chỉ đổi nghĩa", () => {
    addVocabEntry({ word: "abc", meaning: "", file: "a.pdf" });
    const [e] = getVocab();
    updateVocabMeaning(e.id, "giải thích");
    const [after] = getVocab();
    assert.equal(after.meaning, "giải thích");
    assert.equal(after.id, e.id);
  });

  it("restoreVocabEntries gộp theo id, không nhân bản", () => {
    addVocabEntry({ word: "a", file: "1.pdf" });
    addVocabEntry({ word: "b", file: "1.pdf" });
    const before = getVocab();
    const removed = before[0];
    removeVocabEntry(removed.id);
    assert.equal(getVocab().length, 1);

    restoreVocabEntries([removed]);
    const after = getVocab();
    assert.equal(after.length, 2);
    assert.equal(new Set(after.map((e) => e.id)).size, 2);

    restoreVocabEntries([removed]);
    assert.equal(getVocab().length, 2, "khôi phục lại không tạo bản trùng");

    assert.equal(restoreVocabEntries([]).length, 2);
    assert.equal(restoreVocabEntries([{ id: "x" }, null]).length, 3);
  });
});
