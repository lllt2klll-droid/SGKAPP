// Domain logic cho sổ tay từ vựng: lọc, thống kê, xuất dữ liệu, sinh câu hỏi.
// Không đụng localStorage — đọc/ghi do userdata.js đảm nhiệm.
import { normalizeGeneratedQuestion } from "./questionSchema.js";

const MAX_TAGS = 20;
const MAX_TAG_LEN = 24;

export function normalizeTags(raw) {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const t = String(item || "").trim().slice(0, MAX_TAG_LEN);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function tagsToString(tags) {
  return normalizeTags(tags).join(", ");
}

// So khớp không dấu: "phep" khớp "phép", "Đồng bằng" khớp "đong bang".
export function normalizeQuery(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function entryMatches(entry, normQuery) {
  if (!normQuery) return true;
  const fields = [entry.word, entry.meaning, entry.bookTitle, entry.file, tagsToString(entry.tags)];
  return fields.some((f) => normalizeQuery(f).includes(normQuery));
}

export function filterVocabEntries(list, { query = "", file = null, missingMeaning = false, tag = null } = {}) {
  const normQuery = normalizeQuery(query).trim();
  const normTag = normalizeQuery(tag);
  return (Array.isArray(list) ? list : []).filter((e) => {
    if (!e) return false;
    if (file && (e.file || "") !== file) return false;
    if (missingMeaning && String(e.meaning || "").trim()) return false;
    if (normTag && !normalizeTags(e.tags).some((t) => normalizeQuery(t) === normTag)) return false;
    return entryMatches(e, normQuery);
  });
}

export function collectTags(list) {
  const counts = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    for (const t of normalizeTags(e && e.tags)) {
      const key = t.toLowerCase();
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { tag: t, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "vi"));
}

export function dayKey(t) {
  const d = t instanceof Date ? t : new Date(t || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDayLabel(key) {
  const [, m, d] = String(key).split("-");
  return `${d}/${m}`;
}

export function computeDaySeries(list, days = 7) {
  const n = Math.max(1, Math.min(365, Number(days) || 7));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Map();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    buckets.set(dayKey(d), 0);
  }
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || !e.at) continue;
    const k = dayKey(e.at);
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, label: formatDayLabel(date), count }));
}

export function computeVocabStats(list) {
  const arr = Array.isArray(list) ? list : [];
  const byFile = new Map();
  const byGrade = new Map();
  let missingMeaning = 0;
  let tagged = 0;
  let lastAt = 0;
  for (const e of arr) {
    if (!e) continue;
    const f = e.file || "";
    const prev = byFile.get(f);
    if (prev) prev.count += 1;
    else byFile.set(f, { file: f, title: e.bookTitle || f || "(không gắn sách)", count: 1 });
    const g = Number.isFinite(Number(e.grade)) && Number(e.grade) > 0 ? Number(e.grade) : 0;
    byGrade.set(g, (byGrade.get(g) || 0) + 1);
    if (!String(e.meaning || "").trim()) missingMeaning += 1;
    if (normalizeTags(e.tags).length) tagged += 1;
    if ((e.at || 0) > lastAt) lastAt = e.at || 0;
  }
  return {
    total: arr.length,
    missingMeaning,
    withMeaning: arr.length - missingMeaning,
    tagged,
    lastAt,
    byFile: [...byFile.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "vi")),
    byGrade: [...byGrade.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => a.grade - b.grade),
  };
}

export function entriesNeedingMeaning(list, selectedIds) {
  const arr = Array.isArray(list) ? list : [];
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const scope = selected.size ? arr.filter((e) => selected.has(e.id)) : arr;
  return scope.filter((e) => e && !String(e.meaning || "").trim());
}

export function buildCsvRows(entries, byFilename) {
  const rows = [["Từ", "Nghĩa / ghi chú", "Thẻ", "Sách", "Trang", "Lớp", "Ngày lưu"]];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e) continue;
    const title = (byFilename && byFilename.get(e.file)?.title) || e.bookTitle || e.file || "";
    const date = e.at ? new Date(e.at).toLocaleDateString("vi-VN") : "";
    rows.push([e.word || "", e.meaning || "", tagsToString(e.tags), title, e.page || "", e.grade || "", date]);
  }
  return rows;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildVocabDocHtml(entries, byFilename, { title = "Sổ tay từ vựng" } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const rows = list
    .map((e) => {
      const book = (byFilename && byFilename.get(e.file)?.title) || e.bookTitle || e.file || "—";
      const place = `${book}${e.page ? ` — trang ${e.page}` : ""}`;
      return `<tr><td>${esc(e.word) || "—"}</td><td>${esc(e.meaning) || "—"}</td><td>${esc(place)}</td></tr>`;
    })
    .join("");
  const today = new Date().toLocaleDateString("vi-VN");
  return `
    <h2>${esc(title)}</h2>
    <p class="meta">Ngày xuất: ${today} • ${list.length} từ</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">
      <thead>
        <tr style="background:#eef2f7;">
          <th style="width:22%">Từ</th>
          <th style="width:53%">Nghĩa / ghi chú</th>
          <th style="width:25%">Sách — Trang</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="3">Không có dữ liệu</td></tr>`}</tbody>
    </table>`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shorten(s, n = 90) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// Sinh câu trắc nghiệm không AI: xen kẽ từ→nghĩa và nghĩa→từ.
// Trả về { questions, skipped } — bỏ qua từ không đủ 4 phương án khác biệt.
export function buildMcQuestions(entries, limit = 20) {
  const candidates = (Array.isArray(entries) ? entries : []).filter(
    (e) => e && String(e.word || "").trim(),
  );
  const src = candidates.filter((e) => String(e.meaning || "").trim());
  const questions = [];
  const skipped = candidates
    .filter((e) => !String(e.meaning || "").trim())
    .map((e) => String(e.word).trim());
  for (let i = 0; i < src.length && questions.length < limit; i++) {
    const entry = src[i];
    const sameBook = src.filter((x) => x !== entry && (x.file || "") === (entry.file || ""));
    const others = [...shuffle(sameBook), ...shuffle(src.filter((x) => !sameBook.includes(x)))];

    const wordToMeaning = i % 2 === 0;
    const correct = shorten(wordToMeaning ? entry.meaning : entry.word, 120);
    const pool = wordToMeaning
      ? others.map((x) => shorten(x.meaning, 120))
      : others.map((x) => shorten(x.word, 60));
    const distractors = [];
    const seen = new Set([correct.toLowerCase()]);
    for (const p of pool) {
      const key = String(p || "").toLowerCase();
      if (!p || seen.has(key)) continue;
      seen.add(key);
      distractors.push(p);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      skipped.push(entry.word);
      continue;
    }
    const options = shuffle([correct, ...distractors]);
    const correctIndex = options.indexOf(correct);
    const question = wordToMeaning
      ? `Nghĩa của từ "${entry.word}" là gì?`
      : `Từ nào có nghĩa: "${shorten(entry.meaning, 120)}"?`;
    questions.push({
      type: "mc",
      question,
      options,
      correctIndex,
      grade: Number(entry.grade) || null,
      __vocabId: entry.id,
    });
  }
  return { questions, skipped };
}

// Prompt giải nghĩa chuẩn học thuật cho SINH VIÊN ĐẠI HỌC VÀ CAO HỌC:
// từ loại/lĩnh vực → định nghĩa → ví dụ → thuật ngữ liên quan.
// Vẫn nêu lớp của sách nguồn (SGK lớp X) để AI nắm ngữ cảnh xuất xứ của từ.
export function buildExplainPrompt(entries, grade) {
  const list = Array.isArray(entries) ? entries : [];
  const lines = list
    .map((e, i) => `${i + 1}. "${String(e.word || "").trim()}"`)
    .join("\n");
  const context = grade ? ` (trích từ SGK lớp ${grade})` : "";
  return `Giải nghĩa ${list.length} từ/cụm từ sau${context} cho SINH VIÊN ĐẠI HỌC VÀ CAO HỌC: ngôn ngữ chuẩn mực, chính xác, súc tích, KHÔNG dùng emoji.
Trả về MỘT mảng JSON hợp lệ, không thêm văn bản ngoài JSON, mỗi phần tử dạng {"word":"<từ y hệt>","meaning":"<nội dung>"}.
Trong "meaning", trình bày gọn theo từng dòng, mỗi dòng bắt đầu bằng dấu •:
• Từ loại / lĩnh vực: ...
• Định nghĩa: 1–2 câu học thuật, chuẩn xác và đủ sâu cho sinh viên đại học và cao học; nếu từ có nhiều nghĩa, ưu tiên nghĩa dùng trong ngữ cảnh giáo dục
• Ví dụ: 1 câu thực tế (học tập hoặc đời sống)
• Liên quan: từ đồng nghĩa / trái nghĩa / thuật ngữ gần nghĩa (bỏ dòng nếu không có)
Nếu từ là tiếng nước ngoài, ghi thêm phiên âm IPA ngay sau từ. Giữ nguyên chính tả từ gốc ở trường "word".
Danh sách từ:
${lines}`;
}

export function buildQuestionPrompt(entries, bookTitle, grade) {
  const lines = (Array.isArray(entries) ? entries : [])
    .map((e, i) => `${i + 1}. "${String(e.word || "").trim()}"`)
    .join("\n");
  return `Dựa trên các từ vựng sau${bookTitle ? ` trích từ sách "${bookTitle}"` : ""}${grade ? ` (lớp ${grade})` : ""}, hãy soạn câu hỏi TRẮC NGHIỆM cho từng từ (đúng 1 câu/từ).\nYêu cầu: câu hỏi kiểm tra khả năng chọn nghĩa đúng của từ; mỗi câu có ĐÚNG 4 phương án khác nhau (1 đúng, 3 sai hợp lý); "correctIndex" là chỉ số 0-3 của phương án đúng.\nTrả về MỘT mảng JSON hợp lệ, không văn bản ngoài JSON: [{"question":"...","options":["a","b","c","d"],"correctIndex":0}]\nDanh sách từ:\n${lines}`;
}

// AI trả về JSON câu hỏi → normalize bằng questionSchema. Câu lỗi bị bỏ qua.
export function parseAiQuestions(text) {
  const raw = String(text || "").trim();
  if (!raw) return { questions: [], failed: 0 };
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  let parsed = null;
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed)) return { questions: [], failed: 1 };
  const questions = [];
  for (const item of parsed) {
    const norm = normalizeGeneratedQuestion(item);
    if (norm && norm.type === "mc") questions.push(norm);
  }
  return { questions, failed: parsed.length - questions.length };
}

// AI trả về mảng {word, meaning} → Map(word → meaning)
export function parseAiMeanings(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return new Map();
  let parsed = null;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return new Map();
  }
  const map = new Map();
  if (!Array.isArray(parsed)) return map;
  for (const item of parsed) {
    const word = String(item?.word || "").trim();
    const meaning = String(item?.meaning || "").trim();
    if (word && meaning) map.set(word.toLowerCase(), meaning);
  }
  return map;
}

// Key tra cứu không dấu + lowercase — AI hay trả từ không dấu ("bang" cho "bảng")
export function meaningKey(word) {
  return String(word || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}

// Tra nghĩa: khớp thô trước, không được thì khớp không dấu
export function lookupMeaning(map, word) {
  const raw = String(word || "").trim().toLowerCase();
  if (!raw || !map) return "";
  return map.get(raw) || map.get(meaningKey(raw)) || "";
}

export function chunked(list, size = 10) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
