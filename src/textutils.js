// ── Shared text utilities: page-text cleaning (watermarks), language
// statistics and inventory heuristics for SGK research. ──────────────

// ─── Watermark / noise text cleaner (moved here from BookReader) ───
export function cleanExtractedText(text) {
  if (!text) return '';
  let c = text;
  c = c.replace(/https?:\/\/\S+/gi, '');
  c = c.replace(/blogtailieu[\s.]*com[\s./]*[a-zA-Z0-9_-]*/gi, '');
  c = c.replace(/blogtailieu[\s.]*\w+[\s./]*\w*[-\w]*/gi, '');
  c = c.replace(/blogtailieu/gi, '');
  c = c.replace(/sách chia sẻ tại/gi, '');
  c = c.replace(/sach chia se tai/gi, '');
  c = c.replace(/chia sẻ tại/gi, '');
  c = c.replace(/giao\s*-\s*an\s*-\s*lo\s*p?\s*-\s*\d/gi, '');
  c = c.replace(/day\s*-\s*va\s*-\s*hoc/gi, '');
  c = c.replace(/\s*-\s*va\s*-\s*/gi, ' ');
  // Protect fractions like 1/2 from being mangled, then strip leftover slashes
  const fracs = [];
  const marker = String.fromCharCode(1);
  c = c.replace(/(\d)\s*\/\s*(\d)/g, (m, a, b) => {
    fracs.push(`${a}/${b}`);
    return `${marker}${fracs.length - 1}${marker}`;
  });
  c = c.replace(/\/+/g, ' ');
  c = c.split(marker).map((part, i) => (i % 2 === 1 ? fracs[parseInt(part, 10)] : part)).join('');
  c = c.replace(/\s+/g, ' ').trim();
  return c;
}

// ── Vietnamese stop words (small, practical set) ───────────────────
const STOPWORDS = new Set(`
và với cũng của là có được không thì như nhưng mà này đó đấy kia những các mỗi một hai ba
để cho về trên dưới trong ngoài ở tại khi thì vì nên tuy nhưng do bởi hoặc hay còn đã sẽ đang
sẽ đang lại rất hơn nhất cùng theo vào ra lên xuống đi làm nói viết đọc nghe xem thấy biết
cần phải nên muốn học sinh giáo viên thầy cô em bé bạn chúng tôi ta mình người con bố mẹ
bài tập trang số hình ảnh tranh câu trả lời câu hỏi hỏi trả lời đáp án nhé đó đây đâu sao
từ ngữ chữ tiếng âm vần dụng luyện tập thực hành vận dụng trải nghiệm khám phá hoạt động
`.trim().split(/\s+/).map((w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')));

export function isStopWord(w) {
  const k = String(w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  return STOPWORDS.has(k);
}

// Split a sentence-ish string into lowercase word tokens (Vietnamese:
// space-delimited syllables, punctuation stripped).
export function tokenizeWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function countSyllables(token) {
  return token.split('-').filter(Boolean).length;
}

// ── Language statistics for a page/chapter text ────────────────────
// Simple heuristics (phù hợp cho nghiên cứu thô, không phải đo chuẩn):
//  - avg words per sentence
//  - avg syllables per word
//  - estimated reading difficulty scale 1–5
export function sentenceList(text) {
  return String(text || '')
    .replace(/([.!?…])\s*(?=[A-ZĂÂĐÊÔƠƯa-zăâđêôơưẮẰẲẴẶ])/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function analyzeText(text) {
  const sentences = sentenceList(text);
  const words = tokenizeWords(text);
  const totalWords = words.length;
  const unique = new Set(words);
  const wps = sentences.length ? totalWords / sentences.length : 0;
  const spw = totalWords ? words.reduce((a, w) => a + countSyllables(w), 0) / totalWords : 0;
  // Difficulty 1..5 (rough): based on sentence length & word length
  let difficulty = 1;
  const score = wps * 0.5 + spw * 4;
  if (score >= 30) difficulty = 5;
  else if (score >= 22) difficulty = 4;
  else if (score >= 15) difficulty = 3;
  else if (score >= 9) difficulty = 2;
  const freq = {};
  for (const w of words) {
    if (isStopWord(w) || w.length < 2) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 60);
  return { sentences: sentences.length, words: totalWords, unique: unique.size, wps, spw, difficulty, top };
}

// ── Inventory heuristics: find questions / numbered tasks / markers ──
const TASK_MARKERS = /(bài\s*\d+|luyện tập|thực hành|vận dụng|trò chơi|hoạt động|thí nghiệm|em\s*hãy|em\s*đọc|em\s*viết|em\s*làm|em\s*tìm|em\s*đếm|em\s*kể|em\s*nói|em\s*chọn|em\s*nối|em\s*tô|kể chuyện|đọc bài)/i;

export function inventoryPage(text) {
  const out = { questions: [], tasks: [], hasImage: false, chars: 0 };
  if (!text) return out;
  out.chars = text.length;
  const sents = sentenceList(text);
  // Sentences that contain a question mark
  const qSents = sents.filter(s => /[?？]/.test(s));
  // Numbered items like 1. 2. 3. or a) b) c)
  const numbered = sents.filter(s => /(^|\s)\d+[.)、]|(^|\s)[a-d][.)、]/.test(s));
  // Explicit task markers
  const taskSents = sents.filter(s => TASK_MARKERS.test(s));
  out.questions = qSents.slice(0, 40).map(s => s.slice(0, 200));
  out.tasks = [...new Set([...numbered, ...taskSents].slice(0, 40))].map(s => s.slice(0, 200));
  out.hasImage = /(hình\s*\d+|tranh\s*\d+|minh họa|sơ đồ|bảng|đồ thị)/i.test(text);
  return out;
}

// Simple progress of a book from its index meta
export function indexCoverage(meta) {
  if (!meta || !meta.total) return 0;
  return Math.round(((meta.textPages + meta.ocrPages) / meta.total) * 100);
}