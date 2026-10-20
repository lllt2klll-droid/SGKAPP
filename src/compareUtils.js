// ── Helper thuần cho CompareView (KHÔNG chứa component) ─────────────────────
// Tách khỏi CompareView.jsx để file View chỉ còn state/render/effect.
// Mọi hàm giữ nguyên tên + logic, chỉ di chuyển vị trí.
import { escapeHtml, nl2br } from "./exportDoc";

export const NOTE_TEMPLATE = `Điểm GIỐNG nhau:\n- \nĐiểm KHÁC nhau:\n- \nNhận xét / đề xuất:\n- `;

// Key ghi chú theo cặp sách, không phụ thuộc thứ tự A/B để swap không mất note.
// encodeURIComponent để filename chứa "__" không gây trùng key giữa các cặp khác nhau.
export function cmpNoteKeyFor(a, b) {
  if (a && b) return `sgk_cmpnote_${[a, b].sort().map(encodeURIComponent).join("__")}`;
  return `sgk_cmpnote_${encodeURIComponent(a || b)}`;
}

// Gom sách theo "Lớp X · Môn" để dropdown dễ chọn với người dùng phổ thông.
// Sách thiếu thông tin vào nhóm "Chưa phân loại".
export function groupBooks(list) {
  const map = new Map();
  for (const b of list) {
    const gRaw = b.grade ?? b.lop;
    const gNum = Number(gRaw);
    const s = (b.subject || "").trim();
    const label = Number.isFinite(gNum) && String(gRaw).trim() !== ""
      ? `Lớp ${gNum}${s ? " · " + s : ""}`
      : (s || "Chưa phân loại");
    const gradeSort = Number.isFinite(gNum) ? gNum : 999;
    if (!map.has(label)) map.set(label, { label, gradeSort, items: [] });
    map.get(label).items.push(b);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => a.gradeSort - b.gradeSort || a.label.localeCompare(b.label, "vi"));
  groups.forEach((g) => g.items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "vi")));
  return groups;
}

export function copyTextFallback(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Đoạn xem trước ghi chú (logic cũ của `noteSnippet` trong CompareView). */
export function noteSnippetFor(note) {
  const FALLBACK = "Chưa có ghi chú — bấm để mở và ghi nhận điểm giống – khác của hai bản.";
  if (!note.trim()) return FALLBACK;
  const flat = note.replace(/\s+/g, " ").trim();
  return flat.slice(0, 96) + (flat.length > 96 ? "…" : "");
}

/** Rút gọn tiêu đề sách (logic cũ của shortA/shortB). */
export function shortTitle(title, max = 34) {
  const t = String(title || "");
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** Chênh lệch trang đang xem (null khi chưa đủ 2 bên). */
export function pageDiffOf(hasBoth, displayA, displayB) {
  if (!hasBoth) return null;
  return Math.abs(displayA - displayB);
}

/** Chênh lệch tổng số trang (null khi chưa đủ dữ liệu). */
export function totalDiffOf(totalA, totalB) {
  if (!(totalA > 0 && totalB > 0)) return null;
  return Math.abs(totalA - totalB);
}

/** Nội dung text của biên bản (logic cũ của copyReport). */
export function buildReportText({ titleA, titleB, displayA, displayB, note, citationA, citationB }) {
  const lines = [
    `BIÊN BẢN SO SÁNH SÁCH`,
    `A: ${titleA} — trang ${displayA}`,
    `B: ${titleB} — trang ${displayB}`,
    "",
  ];
  if (String(note || "").trim()) lines.push(`GHI CHÚ SO SÁNH:\n${note}`, "");
  lines.push(`TRÍCH DẪN:\nA: ${citationA}\nB: ${citationB}`);
  return lines.join("\n");
}

/** Bảng HTML của biên bản Word (logic cũ của exportReport). */
export function buildReportTableHtml({ titleA, titleB, displayA, displayB, note, citationA, citationB }) {
  const rows = [
    ["", "Sách A", "Sách B"],
    ["Tên sách", titleA, titleB],
    ["Trang so sánh", String(displayA), String(displayB)],
  ];
  let html = "<table>";
  rows.forEach((r, i) => {
    html += `<tr>${r.map((c) => (i === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`)).join("")}</tr>`;
  });
  html += "</table>";
  if (String(note || "").trim()) html += `<h2>Ghi chú so sánh</h2>${nl2br(note)}`;
  html += `<h3>Trích dẫn</h3><blockquote>A: ${escapeHtml(citationA)}</blockquote><blockquote>B: ${escapeHtml(citationB)}</blockquote><hr><small>Xuất lúc ${new Date().toLocaleString("vi-VN")}</small>`;
  return html;
}

/** Nội dung HTML để in/PDF (logic cũ của doPrint). */
export function buildPrintHtml({ titleA, titleB, displayA, displayB, note, citationA, citationB }) {
  return `<h1>Biên bản so sánh sách</h1><div class="meta">${escapeHtml(titleA)} (tr. ${displayA}) • ${escapeHtml(titleB)} (tr. ${displayB})</div>` +
    (String(note || "").trim() ? `<h2>Ghi chú so sánh</h2>${nl2br(note)}` : "") +
    `<h2>Trích dẫn</h2><blockquote>A: ${escapeHtml(citationA)}</blockquote><blockquote>B: ${escapeHtml(citationB)}</blockquote>`;
}
