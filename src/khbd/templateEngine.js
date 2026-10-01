// ── KHBD mới — engine fill file .docx mẫu bằng JSZip (không thêm dep) ──
// Cơ chế: copy nguyên file mẫu KHBD-mau.docx → thay {{placeholder}} trong
// word/document.xml (+ header/footer) bằng dữ liệu form → tải .docx giữ
// nguyên font/màu/khung của mẫu.
//
// Placeholder đơn (user tự gắn vào bản copy của mẫu — xem
// public/templates/README-placeholders.txt):
//   {{lop_cover}} {{mon_ten_bai}} {{sv}} {{mssv}} {{lop_sv}} {{gvhd}}
//   {{nam_hoc}} {{mon_hoc}} {{lop}} {{tuan}} {{so_tiet}} {{ten_bai}}
//   {{ho_ten}} {{mssv_tt}} {{lop_day}} {{thoi_gian}}
//   {{nl_dacthu_1}} {{nl_dacthu_2}} {{nl_dacthu_3}} {{lien_he}}
//   {{nl_chung_1}} {{nl_chung_2}} {{nl_chung_3}}
//   {{pham_chat_1}} {{pham_chat_2}} {{pham_chat_3}}
//   {{dd_gv}} {{dd_hs}} {{dieu_chinh}} {{phu_luc}}
// Khối lặp theo phân khu (bọc các đoạn/dòng cần nhân bản trong mẫu):
//   {{#HD_A}} ... {{/HD_A}}  {{#HD_B}} ... {{/HD_B}}
//   {{#HD_C}} ... {{/HD_C}}  {{#HD_D}} ... {{/HD_D}}
//   Bên trong khối HD dùng: {{hd_stt}} {{hd_ten}} {{hd_phut}}
//   {{hd_muctieu}} {{hd_ppdh}} {{hd_dddh}}
//   {{hd_gv}} {{hd_hs}} {{hd_ketluan}}
//   Khối bước lồng trong khối HD (tùy chọn):
//   {{#BUOC}} ... {{/BUOC}} với {{buoc_stt}} {{buoc_gv}} {{buoc_hs}}

import JSZip from "jszip";

export const TEMPLATE_URL = "templates/KHBD-mau.docx";
const WORD_PARTS = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];

// Module mới chỉ dùng ô text thuần (input/textarea) — KHÔNG strip thẻ HTML
// để tránh nuốt chữ người dùng (VD "a < b"). Chỉ chuẩn hóa xuống dòng.
function toText(s) {
  return String(s ?? "").replace(/\r\n?/g, "\n");
}

function escapeXml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Text thuần → XML Word: escape rồi xuống dòng thành <w:br/>
function textToWordXml(s) {
  const clean = toText(s);
  if (!clean) return "";
  return clean.split("\n").map(escapeXml).join("</w:t><w:br/><w:t xml:space=\"preserve\">");
}

// Gộp các placeholder bị Word chẻ thành nhiều <w:t> (do chính tả/format)
// thành 1 <w:t> duy nhất trong cùng đoạn <w:p>, giữ format của run đầu.
function mergeSplitPlaceholders(xml) {
  return xml.replace(/(<w:p[\s\S]*?<\/w:p>)/g, (para) => {
    if (!para.includes("{{") && !para.includes("}}")) return para;
    const runs = [...para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
    const joined = runs.map((m) => m[1]).join("");
    if (!/\{\{[\s\S]*?\}\}/.test(joined)) return para;
    // Tìm placeholder đầu tiên bị chẻ, gộp toàn bộ text của đoạn vào run đầu
    // rồi xóa text các run sau — đơn giản mà an toàn vì chỉ chạy khi có {{}}.
    let first = true;
    return para.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (full, inner, offset) => {
      if (first) {
        first = false;
        const attrs = /^<w:t(\s[^>]*)?>/.exec(full)?.[1] || ' xml:space="preserve"';
        return `<w:t${attrs}>${joined}</w:t>`;
      }
      const attrs = /^<w:t(\s[^>]*)?>/.exec(full)?.[1] || "";
      return `<w:t${attrs}></w:t>`;
    });
  });
}

function replaceAll(xml, key, valueXml) {
  const token = `{{${key}}}`;
  if (!xml.includes(token)) return xml;
  return xml.split(token).join(valueXml);
}

// Mở rộng khối {{#KEY}}...{{/KEY}}: clone ruột theo từng item.
// itemXmlFn(item, index) trả về ruột đã fill cho 1 item.
function expandBlock(xml, key, items, itemXmlFn) {
  const open = `{{#${key}}}`;
  const close = `{{/${key}}}`;
  const start = xml.indexOf(open);
  const end = xml.indexOf(close);
  if (start < 0 || end < 0 || end < start) return { xml, expanded: false };
  const before = xml.slice(0, start);
  const inner = xml.slice(start + open.length, end);
  const after = xml.slice(end + close.length);
  const filled = (items || []).map((it, i) => itemXmlFn(inner, it, i)).join("");
  return { xml: before + filled + after, expanded: true };
}

function buildSimpleMap(plan) {
  const g = (v) => textToWordXml(v);
  const list = (arr) => g((arr || []).filter((x) => toText(x).trim()).map((x) => `+ ${toText(x).trim()}`).join("\n"));
  const m = {
    lop_cover: g(plan.lop || "..."),
    mon_ten_bai: g(`${(plan.monHoc || "MÔN").toUpperCase()}: ${plan.title || "TÊN BÀI"}`),
    sv: g(plan.sv), mssv: g(plan.mssv), lop_sv: g(plan.lopSV), gvhd: g(plan.gvhd),
    nam_hoc: g(plan.namHoc || "2024 - 2025"),
    mon_hoc: g(plan.monHoc), lop: g(plan.lop), tuan: g(plan.tuan), so_tiet: g(plan.soTiet),
    ten_bai: g(plan.title), ho_ten: g(plan.hoVaTen), mssv_tt: g(plan.mssvTT),
    lop_day: g(plan.lopDay), thoi_gian: g(plan.thoiGian),
    lien_he: g(plan.lienHe),
    dd_gv: list(plan.ddGV), dd_hs: list(plan.ddHS),
    dieu_chinh: g(plan.dieuChinh),
    phu_luc: g(plan.phuLuc),
  };
  (plan.nlDacThu || []).forEach((v, i) => { m[`nl_dacthu_${i + 1}`] = g(v); });
  (plan.nlChung || []).forEach((v, i) => { m[`nl_chung_${i + 1}`] = g(v); });
  (plan.phamChat || []).forEach((v, i) => { m[`pham_chat_${i + 1}`] = g(v); });
  return m;
}

function fillHdInner(inner, act, idx) {
  let out = inner;
  const steps = Array.isArray(act.steps) ? act.steps : [];
  const gvJoined = steps.map((s) => toText(s.gv).trim()).filter(Boolean).join("\n");
  const hsJoined = steps.map((s) => toText(s.hs).trim()).filter(Boolean).join("\n");
  const map = {
    hd_stt: textToWordXml(String(idx + 1)),
    hd_ten: textToWordXml(act.ten),
    hd_phut: textToWordXml(act.phut || "..."),
    hd_muctieu: textToWordXml(act.mucTieu),
    hd_ppdh: textToWordXml(act.ppdh),
    hd_dddh: textToWordXml(act.dddh),
    hd_gv: textToWordXml(gvJoined),
    hd_hs: textToWordXml(hsJoined),
    hd_ketluan: textToWordXml(act.ketLuan),
  };
  // Khối bước lồng nhau (nếu mẫu có) — nhân bản theo từng bước
  const r = expandBlock(out, "BUOC", steps, (buocInner, st, si) =>
    replaceAll(replaceAll(replaceAll(buocInner,
      "buoc_stt", textToWordXml(String(si + 1))),
      "buoc_gv", textToWordXml(st.gv)),
      "buoc_hs", textToWordXml(st.hs)));
  out = r.xml;
  for (const [k, v] of Object.entries(map)) out = replaceAll(out, k, v);
  return out;
}

export function fillXmlPart(xml, plan) {
  let out = mergeSplitPlaceholders(xml);
  const simple = buildSimpleMap(plan);
  for (const [k, v] of Object.entries(simple)) out = replaceAll(out, k, v);
  const bySec = { A: [], B: [], C: [], D: [] };
  for (const a of plan.hoatDong || []) {
    const s = (a.section || "B").toUpperCase();
    if (bySec[s]) bySec[s].push(a);
  }
  for (const sec of ["A", "B", "C", "D"]) {
    const r = expandBlock(out, `HD_${sec}`, bySec[sec], fillHdInner);
    out = r.xml;
  }
  return out;
}

function safeName(s) {
  return String(s || "bai-hoc").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 100) || "bai-hoc";
}

function downloadBlob(blob, plan) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `KHBD - ${safeName(plan.title || plan.monHoc || "bai-hoc")}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1500);
}

export async function exportPlanDocx(plan, opts = {}) {
  if (!plan) throw new Error("Chưa có kế hoạch để xuất.");
  // Đường 1: mẫu có placeholder {{...}} do user gắn → copy mẫu + fill (giữ 100% format mẫu)
  try {
    const url = opts.templateUrl || `${import.meta.env.BASE_URL || "/"}${TEMPLATE_URL}`;
    const res = await fetch(url);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      let touched = 0;
      for (const part of WORD_PARTS) {
        const f = zip.file(part);
        if (!f) continue;
        const xml = await f.async("string");
        if (!xml.includes("{{")) continue;
        zip.file(part, fillXmlPart(xml, plan));
        touched++;
      }
      if (touched > 0) {
        const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        downloadBlob(blob, plan);
        return { mode: "template" };
      }
    }
  } catch (e) {
    console.warn("[KHBD] fill theo mẫu thất bại, chuyển sang dựng tự động:", e?.message || e);
  }
  // Đường 2: tự dựng .docx bám mẫu KTSP (bìa, I–V, bảng 2 cột GV|HS) — luôn chạy được
  const { downloadGeneratedDocx } = await import("./docxBuilder.js");
  await downloadGeneratedDocx(plan);
  return { mode: "generated" };
}

// Đếm placeholder còn trống trong mẫu (để báo user gắn thiếu)
export async function inspectTemplate(templateUrl) {
  const url = templateUrl || `${import.meta.env.BASE_URL || "/"}${TEMPLATE_URL}`;
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const out = {};
  for (const part of WORD_PARTS) {
    const f = zip.file(part);
    if (!f) continue;
    const xml = mergeSplitPlaceholders(await f.async("string"));
    const found = [...xml.matchAll(/\{\{(#?\/?[A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]);
    if (found.length) out[part] = [...new Set(found)];
  }
  return out;
}
