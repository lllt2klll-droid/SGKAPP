// ── Xuất phiếu học tập ra file Word .docx THẬT (lib `docx`) ─────────────
// - 2 mẫu đầu phiếu: "full" (quốc hiệu + trường/lớp + điểm/lời phê + giờ) và "compact" (gọn)
// - Đáp án GIỮ NGUYÊN logic cũ: chỉ xuất khi (withAnswers && ws.showAnswers), cùng định dạng "Câu i: X"
// - Trộn là TÙY CHỌN lúc xuất, không đụng dữ liệu gốc: shuffleQuestions / shuffleOptions (MC)
// - Khổ A4, lề chuẩn, Times New Roman — mở Word không lệch font
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from "docx";
import { dl } from "./exportDoc.js";

const FONT = "Times New Roman";
// A4: 11906 x 16838 twips · lề trên/dưới/phải 2cm (1134), trái 2.5cm (1418)
const PAGE = {
  size: { width: 11906, height: 16838 },
  margins: { top: 1134, bottom: 1134, left: 1418, right: 1134 },
};
const INK = "111111";
const MUTED = "595959";
const NO_BORDER = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideH: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideV: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
const THIN = (color = "999999") => ({ style: BorderStyle.SINGLE, size: 6, color });

function T(text, opts = {}) {
  return new TextRun({ text: String(text ?? ""), font: FONT, size: 26, color: INK, ...opts });
}
function P(children, opts = {}) {
  const kids = Array.isArray(children) ? children : [children];
  return new Paragraph({ spacing: { after: 120, line: 276 }, ...opts, children: kids });
}
function center(text, opts = {}, pOpts = {}) {
  return P([T(text, opts)], { alignment: AlignmentType.CENTER, ...pOpts });
}
export function stripHtml(s) {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function todayLine() {
  const d = new Date();
  return `Ngày ${String(d.getDate()).padStart(2, "0")} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

// Lọc options rỗng nhưng GIỮ đúng đáp án (so theo nội dung, không theo index cũ)
// Dùng chung cho editor/preview/TXT/DOCX để đáp án hiển thị NHẤT QUÁN khắp phiếu
export function cleanOptions(q) {
  const raw = Array.isArray(q.options) ? q.options : [];
  const list = raw.map((o) => stripHtml(o)).filter((o) => o !== "");
  let correct = -1;
  const ci = Number(q.correctIndex);
  const correctText = Number.isInteger(ci) && ci >= 0 && ci < raw.length ? stripHtml(raw[ci]) : "";
  if (correctText) correct = list.indexOf(correctText);
  return { list, correct };
}

function headerFull(ws, school, timeMinutes) {
  const out = [];
  const grade = ws.grade ? `Lớp ${ws.grade}` : "";
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDER,
    rows: [new TableRow({
      children: [
        new TableCell({ borders: NO_BORDER, width: { size: 50, type: WidthType.PERCENTAGE }, children: [center(`TRƯỜNG ${school || "........................"}`, { bold: true, size: 24 }), center(grade || "Lớp: ........", { size: 24 })] }),
        new TableCell({ borders: NO_BORDER, width: { size: 50, type: WidthType.PERCENTAGE }, children: [center("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true, size: 24 }), center("Độc lập – Tự do – Hạnh phúc", { bold: true, size: 24 }), center("—————", { size: 22, color: MUTED })] }),
      ],
    })],
  }));
  out.push(P([], { spacing: { after: 60 } }));
  out.push(center("PHIẾU HỌC TẬP", { bold: true, size: 36 }));
  if (ws.subject) out.push(center(`Môn: ${ws.subject}`, { size: 26 }));
  if (timeMinutes) out.push(center(`Thời gian làm bài: ${timeMinutes} phút (không kể thời gian phát đề)`, { italics: true, size: 24, color: MUTED }));
  out.push(P([], { spacing: { after: 60 } }));
  out.push(P([T("Họ và tên: ........................................................"), T("   Lớp: ................", {})]));
  out.push(P([T(todayLine(), { italics: true, color: MUTED })]));
  // Ô điểm / lời phê
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [center("Điểm", { bold: true })] }),
          new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [P([T("Lời phê của giáo viên", { bold: true })], { alignment: AlignmentType.CENTER }), P([], {}), P([], {}), P([], { spacing: { after: 0 } })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [P([], {}), P([], { spacing: { after: 0 } })] }),
          new TableCell({ children: [P([T("Chữ ký", { italics: true, color: MUTED })], { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })] }),
        ],
      }),
    ],
  }));
  if (ws.intro) out.push(P([T(stripHtml(ws.intro), { italics: true })], { spacing: { before: 200 } }));
  return out;
}

function headerCompact(ws) {
  const out = [];
  out.push(center(ws.title || "Phiếu học tập", { bold: true, size: 32 }));
  const meta = [ws.subject, ws.grade ? `Lớp ${ws.grade}` : ""].filter(Boolean).join(" • ");
  if (meta) out.push(center(meta, { size: 24, color: MUTED }));
  out.push(P([T("Họ và tên: ................................................"), T("   Ngày: ....................", {})]));
  if (ws.intro) out.push(P([T(stripHtml(ws.intro), { italics: true })]));
  return out;
}

function questionBlocks(q, num, withAnswers) {
  const blocks = [];
  const stem = stripHtml(q.question) || "(câu hỏi trống)";
  blocks.push(P([T(`Câu ${num}.  `, { bold: true }), T(stem)], { keepNext: true }));
  if (q.type === "mc") {
    const { list } = cleanOptions(q);
    list.forEach((o, oi) => {
      blocks.push(P([T(`${String.fromCharCode(65 + oi)}.  `, { bold: true }), T(o)], { indent: { left: 360 }, keepLines: true }));
    });
  } else if (q.type === "fill") {
    if (withAnswers && q.answer) {
      blocks.push(P([T("Đáp án:  ", { bold: true }), T(stripHtml(q.answer))], { indent: { left: 360 } }));
    } else {
      blocks.push(P([T("Trả lời:  ", { color: MUTED }), T("................................................................................................................", { color: "BBBBBB" })], { indent: { left: 360 } }));
    }
  } else {
    // essay
    if (withAnswers && (q.answer || q.answerGuide)) {
      blocks.push(P([T("Hướng dẫn:  ", { bold: true }), T(stripHtml(q.answer || q.answerGuide))], { indent: { left: 360 } }));
    } else {
      for (let i = 0; i < 5; i++) {
        blocks.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 120, line: 360 }, border: { bottom: THIN("BBBBBB") }, children: [T("")] }));
      }
    }
  }
  return blocks;
}

function answerBlocks(items) {
  // items: [{ num, text }] — cùng định dạng bản cũ: "Câu i: ..."
  const out = [];
  out.push(P([], {}));
  out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
  out.push(center("ĐÁP ÁN", { bold: true, size: 30 }));
  items.forEach(({ num, text }) => {
    out.push(P([T(`Câu ${num}:  `, { bold: true }), T(text)], { keepLines: true }));
  });
  return out;
}

/**
 * @param {object} ws worksheet {title, subject, grade, intro, note, showAnswers}
 * @param {Array} questions mảng câu hỏi đã resolve (bỏ qua id thiếu do caller lọc)
 * @param {object} opts { template: 'full'|'compact', school, timeMinutes, withAnswers, shuffleQuestions, shuffleOptions }
 */
export function buildWorksheetDocx(ws, questions, opts = {}) {
  const w = ws || {};
  const o = {
    template: opts.template === "compact" ? "compact" : "full",
    school: opts.school ?? w.school ?? "",
    timeMinutes: Number(opts.timeMinutes ?? w.timeMinutes ?? 0) || 0,
    withAnswers: Boolean(opts.withAnswers && w.showAnswers),
    shuffleQuestions: Boolean(opts.shuffleQuestions),
    shuffleOptions: Boolean(opts.shuffleOptions),
  };
  const children = [];
  children.push(...(o.template === "full" ? headerFull(w, o.school, o.timeMinutes) : headerCompact(w)));

  let list = (questions || []).filter(Boolean);
  if (o.shuffleQuestions) list = shuffled(list);
  const answerItems = [];
  list.forEach((q, i) => {
    const num = i + 1;
    let qq = q;
    if (o.shuffleOptions && q.type === "mc") {
      const { list: opts2, correct } = cleanOptions(q);
      const order = shuffled(opts2.map((_, idx) => idx));
      const remapped = order.map((idx) => opts2[idx]);
      const newCorrect = order.indexOf(correct);
      qq = { ...q, options: remapped, correctIndex: newCorrect };
    }
    children.push(...questionBlocks(qq, num, o.withAnswers));
    if (o.withAnswers) {
      if (qq.type === "mc") {
        const { correct } = cleanOptions(qq);
        answerItems.push({ num, text: correct >= 0 ? String.fromCharCode(65 + correct) : "—" });
      } else if (qq.type === "fill") {
        answerItems.push({ num, text: `(điền khuyết) ${stripHtml(qq.answer) || "—"}` });
      } else {
        answerItems.push({ num, text: `(tự luận) ${stripHtml(qq.answer || qq.answerGuide) || "—"}` });
      }
    }
  });

  if (w.note) children.push(P([T(stripHtml(w.note), { italics: true })], { alignment: AlignmentType.CENTER }));
  if (o.withAnswers) children.push(...answerBlocks(answerItems));

  return new Document({
    creator: "Hành trang Tiểu học",
    title: w.title || "Phiếu học tập",
    sections: [{ properties: { page: PAGE }, children }],
  });
}

export async function exportWorksheetDocx(ws, questions, opts = {}) {
  if (!ws) return false;
  try {
    const doc = buildWorksheetDocx(ws, questions, opts);
    const blob = await Packer.toBlob(doc);
    dl(blob, `Phiếu học tập - ${ws.title || "phieu"}.docx`);
    return true;
  } catch (e) {
    console.error("[worksheetDocx] export failed:", e);
    return false;
  }
}
