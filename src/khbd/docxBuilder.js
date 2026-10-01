// ── KHBD mới — dựng file .docx bám mẫu KTSP bằng lib `docx` (không cần gắn tay) ──
// Layout port từ mẫu: bìa (khung + logo + 28pt), tiêu đề, I.YCCD, II.Đồ dùng,
// III.Bảng 2 CỘT GV|HS (header xanh #DEEAF6, band vàng #FFF2CB / xanh lá #E2EFD9),
// IV.Điều chỉnh, V.Phụ lục. Times New Roman 14pt, A4 dọc.
// Mọi ô GV/HS đều lấy từ steps của hoạt động — chỗ nào chia 2 cột là nhập đủ 2 bên.

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, VerticalAlign, WidthType, TableLayoutType, BorderStyle,
  ShadingType, ImageRun, PageBreak,
} from "docx";
import { KTSP_ROUND_LOGO_B64 } from "../ktspLogo.js";
import { dataUrlToBytes, isPngDataUrl } from "./khbdImages.js";
import { bulletizeLines } from "./planModel.js";

const TNR = "Times New Roman";
const C = { red: "C00000", blue: "002060", green: "00B050", bandBlue: "DEEAF6", yellow: "FFF2CB", greenBg: "E2EFD9", black: "000000", ink: "111111" };
// A4 usable = 11906 - 1440 - 1440 = 9026 twips; GV 52% / HS 48%
const W_GV = 4694;
const W_HS = 4332;

function toText(s) {
  return String(s ?? "").replace(/\r\n?/g, "\n");
}
// Bài cũ lưu ketLuan đã có sẵn tiền tố "⇨ ..." trong khi mẫu cũng in tiền tố
// → lột ở đây để khỏi in đúp (lũy đẳng với importLegacyPlan).
function stripKetLuanPrefix(s) {
  return toText(s).replace(/^⇨\s*Giáo viên rút ra kết luận:\s*/i, "");
}
function run(text, opts = {}) {
  return new TextRun({ text: toText(text), font: TNR, size: 28, color: C.ink, ...opts });
}
function paras(text, opts = {}, pOpts = {}) {
  const lines = toText(text).split("\n");
  if (!lines.length) return [new Paragraph({ children: [run("", opts)], ...pOpts })];
  return lines.map((ln) => new Paragraph({ children: [run(ln || "", opts)], ...pOpts }));
}
function heading(text, color = C.red) {
  return new Paragraph({
    children: [run(text, { bold: true, color })],
    alignment: AlignmentType.JUSTIFY, spacing: { before: 240, after: 60 },
  });
}
function bandCell(text, fill, color = C.red) {
  return new TableCell({
    columnSpan: 2,
    shading: { fill, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [run(text, { bold: true, color })] })],
  });
}
function bandRow(text, fill, color) {
  return new TableRow({ children: [bandCell(text, fill, color)] });
}
const thinBorder = { style: BorderStyle.SINGLE, size: 8, color: C.black };
function borderedCell(children, width) {
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
  });
}
function headCell(text) {
  return new TableCell({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(text, { bold: true, color: C.blue })] })],
    shading: { fill: C.bandBlue, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
  });
}

function logoRun() {
  try {
    const b64 = String(KTSP_ROUND_LOGO_B64 || "").split(",").pop();
    const bytes = typeof Buffer !== "undefined"
      ? new Uint8Array(Buffer.from(b64, "base64"))
      : Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return new ImageRun({ type: "png", data: bytes, transformation: { width: 150, height: 150 } });
  } catch { return null; }
}

function coverSection(plan) {
  const kids = [];
  const center = (t, size = 28, bold = true) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: toText(t), font: TNR, size, bold, color: C.ink })] });
  kids.push(center("TRƯỜNG ĐẠI HỌC SÀI GÒN"));
  kids.push(center("TRƯỜNG TIỂU HỌC THỰC HÀNH ĐẠI HỌC SÀI GÒN"));
  const logo = logoRun();
  if (logo) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [logo], spacing: { before: 400, after: 400 } }));
  else kids.push(new Paragraph({ children: [run("")] }));
  kids.push(center(`KẾ HOẠCH BÀI DẠY LỚP ${plan.lop?.trim() ? toText(plan.lop) : "…"}`, 56));
  kids.push(center(`[${(plan.monHoc?.trim() ? toText(plan.monHoc).toUpperCase() : "MÔN")}: ${plan.title?.trim() ? toText(plan.title) : "TÊN BÀI"}]`, 56));
  kids.push(new Paragraph({ children: [run("")] }));
  kids.push(center(`Sinh viên kiến tập: ${toText(plan.sv)}`));
  kids.push(center(`MSSV:    ${toText(plan.mssv)}  (DGT…)`, 28));
  kids.push(center(`Lớp: ${toText(plan.lopSV)}`));
  kids.push(center(`Giáo viên hướng dẫn kiến tập: ${toText(plan.gvhd)}`));
  kids.push(new Paragraph({ children: [run("")] }));
  kids.push(new Paragraph({ children: [run("")] }));
  kids.push(center(`Năm học: ${toText(plan.namHoc) || "2024 - 2025"}`));
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  return kids;
}

function metaSection(plan) {
  const kids = [];
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run("KẾ HOẠCH BÀI DẠY", { bold: true, color: C.red })] }));
  const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
  const cell = (label, val) => new TableCell({
    borders: noBorder,
    children: [new Paragraph({ children: [run(label), run(toText(val) || "", { bold: true })] })],
  });
  const rows = [
    [`Môn học: `, plan.monHoc, `Lớp: `, plan.lop],
    [`Tuần: `, plan.tuan, `Số tiết: `, plan.soTiet],
    [`Tên bài học: `, plan.title, ``, ``],
    [`Họ và tên: `, plan.hoVaTen, `MSSV: `, plan.mssvTT],
    [`Lớp: `, plan.lopDay, ``, ``],
    [`Thời gian thực hiện: `, plan.thoiGian, ``, ``],
  ].map(([l1, v1, l2, v2]) => new TableRow({ children: [cell(l1, v1), cell(l2, v2)] }));
  kids.push(new Table({ layout: TableLayoutType.FIXED, columnWidths: [4513, 4513], rows }));
  return kids;
}

function objectivesSection(plan) {
  const kids = [heading("I. YÊU CẦU CẦN ĐẠT")];
  kids.push(new Paragraph({ children: [run("1. Năng lực đặc thù", { bold: true })] }));
  for (const v of plan.nlDacThu?.length ? plan.nlDacThu : ["", "", ""]) {
    kids.push(new Paragraph({ children: [run(`-  ${toText(v)}`)] }));
  }
  kids.push(new Paragraph({ children: [run(`* Liên hệ/ Tích hợp (nếu có)${toText(plan.lienHe).trim() ? " — " + toText(plan.lienHe).trim() : ""}`, { bold: true, italics: true })] }));
  kids.push(new Paragraph({ children: [run("2. Năng lực chung", { bold: true })], spacing: { before: 120 } }));
  for (const v of plan.nlChung?.length ? plan.nlChung : ["", "", ""]) {
    kids.push(new Paragraph({ children: [run(`-  ${toText(v)}`)] }));
  }
  kids.push(new Paragraph({ children: [run("3. Phẩm chất", { bold: true })], spacing: { before: 120 } }));
  for (const v of plan.phamChat?.length ? plan.phamChat : ["", "", ""]) {
    kids.push(new Paragraph({ children: [run(`-  ${toText(v)}`)] }));
  }
  return kids;
}

function materialsSection(plan) {
  const kids = [heading("II. ĐỒ DÙNG DẠY HỌC")];
  const block = (label, items) => {
    kids.push(new Paragraph({ children: [run(label)] }));
    const list = (items || []).map(toText).map((s) => s.trim()).filter(Boolean);
    for (const it of list.length ? list : [""]) {
      kids.push(new Paragraph({ children: [run(it ? `+ ${it}` : "")], indent: { left: 720 } }));
    }
  };
  block("- GV:", plan.ddGV);
  block("- HS:", plan.ddHS);
  return kids;
}

// ── Ô GV: mục tiêu + PPDH/ĐDDH + từng bước GV (+ ảnh GV) + kết luận ──
// ── Ô HS: từng bước HS (+ ảnh HS) song song từng bước GV ──
function imgParas(imgs, maxW = 380) {
  const out = [];
  for (const im of imgs || []) {
    if (!im || typeof im.dataUrl !== "string" || !im.dataUrl.startsWith("data:image")) continue;
    try {
      const bytes = dataUrlToBytes(im.dataUrl);
      if (!bytes.length) continue;
      const w0 = Number(im.width) > 0 ? Number(im.width) : maxW;
      const h0 = Number(im.height) > 0 ? Number(im.height) : Math.round(maxW * 0.75);
      const s = Math.min(1, maxW / w0);
      out.push(new Paragraph({
        children: [new ImageRun({
          type: isPngDataUrl(im.dataUrl) ? "png" : "jpg",
          data: bytes,
          transformation: { width: Math.max(1, Math.round(w0 * s)), height: Math.max(1, Math.round(h0 * s)) },
        })],
      }));
    } catch {}
  }
  return out;
}
function gvCellParas(act) {
  const out = [];
  out.push(new Paragraph({ children: [run("a. Mục tiêu: ", { bold: true }), run(toText(act.mucTieu))], alignment: AlignmentType.JUSTIFY }));
  out.push(new Paragraph({ children: [run("b. Phương pháp, hình thức tổ chức:", { bold: true })], alignment: AlignmentType.JUSTIFY }));
  out.push(new Paragraph({ children: [run("PPDH: ", { bold: true }), run(toText(act.ppdh))], alignment: AlignmentType.JUSTIFY }));
  out.push(new Paragraph({ children: [run("ĐDDH: ", { bold: true }), run(toText(act.dddh))], alignment: AlignmentType.JUSTIFY }));
  out.push(new Paragraph({ children: [run("Cách tiến hành:", { bold: true })], alignment: AlignmentType.JUSTIFY }));
  const steps = Array.isArray(act.steps) ? act.steps : [];
  let anyGv = false;
  steps.forEach((s, i) => {
    // Bài cũ lưu cách tiến hành 1 khối → bulletize lại lúc xuất (lũy đẳng)
    // để mỗi câu xuống dòng riêng, đầu dòng "- ". Nhiều dòng thì "Bước N:"
    // đứng riêng 1 dòng, 1 dòng giữ nguyên "Bước N: ..." như cũ.
    const t = bulletizeLines(toText(s.gv).trim());
    if (t) {
      anyGv = true;
      const lines = t.split("\n");
      const head = { alignment: AlignmentType.JUSTIFY, indent: { left: 360 } };
      if (lines.length > 1) {
        out.push(new Paragraph({ children: [run(`Bước ${i + 1}:`)], ...head }));
        out.push(...paras(lines.join("\n"), {}, head));
      } else {
        out.push(...paras(`Bước ${i + 1}: ${t.replace(/^-\s*/, "")}`, {}, head));
      }
    }
    const imgs = imgParas(s.gvImgs);
    if (imgs.length) { anyGv = true; out.push(...imgs); }
  });
  if (!anyGv) out.push(new Paragraph({ children: [run("")] }));
  out.push(new Paragraph({
    children: [run("⇨ Giáo viên rút ra kết luận: ", { bold: true, italics: true, color: C.red }), run(stripKetLuanPrefix(toText(act.ketLuan)))],
    alignment: AlignmentType.JUSTIFY, spacing: { before: 120 },
  }));
  return out;
}
function hsCellParas(act) {
  const out = [];
  const steps = Array.isArray(act.steps) ? act.steps : [];
  let anyHs = false;
  steps.forEach((s, i) => {
    const t = toText(s.hs).trim();
    if (t) {
      anyHs = true;
      out.push(...paras(`Bước ${i + 1}: ${t}`, {}, { alignment: AlignmentType.JUSTIFY }));
    }
    const imgs = imgParas(s.hsImgs);
    if (imgs.length) { anyHs = true; out.push(...imgs); }
  });
  if (!anyHs) out.push(new Paragraph({ children: [run("")] }));
  return out;
}

const SEC_HEAD = {
  A: "A. Hoạt động Khởi động",
  B: "B. Hoạt động Khám phá và Luyện tập",
  C: "C. Hoạt động Vận dụng",
  D: "D. Hoạt động Nối tiếp",
};

function activitiesSection(plan) {
  const kids = [heading("III. HOẠT ĐỘNG DẠY HỌC")];
  const rows = [new TableRow({ children: [headCell("Hoạt động của giáo viên"), headCell("Hoạt động của học sinh")] })];
  const bySec = { A: [], B: [], C: [], D: [] };
  for (const a of plan.hoatDong || []) {
    const s = String(a.section || "B").toUpperCase();
    if (bySec[s]) bySec[s].push(a);
  }
  const zoneTotal = (acts) => {
    const t = acts.reduce((sum, a) => sum + (Number(a.phut) && Number.isFinite(Number(a.phut)) ? Number(a.phut) : 0), 0);
    return t > 0 ? String(t) : "…";
  };
  for (const sec of ["A", "B", "C", "D"]) {
    const acts = bySec[sec];
    if (!acts.length) {
      rows.push(bandRow(`${SEC_HEAD[sec]} (… phút)`, C.yellow));
      rows.push(new TableRow({ children: [borderedCell([new Paragraph({ children: [run("")] })], W_GV), borderedCell([new Paragraph({ children: [run("")] })], W_HS)] }));
      continue;
    }
    if (sec === "B") {
      rows.push(bandRow(`${SEC_HEAD[sec]} (${zoneTotal(acts)} phút)`, C.yellow));
      acts.forEach((act, i) => {
        rows.push(bandRow(`${i + 1}. Hoạt động ${i + 1}: ${toText(act.ten).trim() || "…"} (${toText(act.phut).trim() || "…"} phút)`, C.greenBg, C.green));
        rows.push(new TableRow({ children: [borderedCell(gvCellParas(act), W_GV), borderedCell(hsCellParas(act), W_HS)] }));
      });
    } else {
      acts.forEach((act, i) => {
        const label = acts.length > 1 && sec === "A" && i > 0
          ? `${i + 1}. Hoạt động ${i + 1}: ${toText(act.ten).trim() || "…"} (${toText(act.phut).trim() || "…"} phút)`
          : `${SEC_HEAD[sec]}${toText(act.ten).trim() ? `: ${toText(act.ten).trim()}` : ""} (${toText(act.phut).trim() || zoneTotal(acts)} phút)`;
        rows.push(bandRow(label, C.yellow));
        rows.push(new TableRow({ children: [borderedCell(gvCellParas(act), W_GV), borderedCell(hsCellParas(act), W_HS)] }));
      });
    }
  }
  kids.push(new Table({ layout: TableLayoutType.FIXED, columnWidths: [W_GV, W_HS], rows }));
  return kids;
}

function tailSection(plan) {
  const kids = [heading("IV. ĐIỀU CHỈNH SAU BÀI DẠY:")];
  const adj = toText(plan.dieuChinh).trim();
  if (adj) kids.push(...paras(adj, {}, { alignment: AlignmentType.JUSTIFY }));
  else for (let i = 0; i < 6; i++) kids.push(new Paragraph({ children: [run("................................................................................................................................")] }));
  kids.push(heading("V. PHỤ LỤC TIẾT DẠY"));
  const phu = toText(plan.phuLuc).trim();
  kids.push(...(phu ? paras(phu, {}, { alignment: AlignmentType.JUSTIFY }) : [new Paragraph({ children: [run("")] })]));
  return kids;
}

export function buildKhbdDocument(plan) {
  const p = plan || {};
  return new Document({
    creator: "SGK App",
    title: `KHBD - ${toText(p.title) || "bai-hoc"}`,
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        ...coverSection(p),
        ...metaSection(p),
        ...objectivesSection(p),
        ...materialsSection(p),
        ...activitiesSection(p),
        ...tailSection(p),
      ],
    }],
  });
}

function safeName(s) {
  return String(s || "bai-hoc").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 100) || "bai-hoc";
}

export async function downloadGeneratedDocx(plan) {
  const doc = buildKhbdDocument(plan);
  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `KHBD - ${safeName(plan.title || plan.monHoc || "bai-hoc")}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1500);
  return true;
}
