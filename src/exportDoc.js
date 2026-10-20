// ── Export helpers: Word (.doc via HTML), print→PDF, TXT, CSV. ─────
// Word: we emit a tidy HTML file with a .doc extension — Word mở trực
// tiếp. PDF: mở cửa sổ in (chọn "Save as PDF" trong hộp thoại in).
// CSV: thêm BOM để Excel đọc đúng tiếng Việt.
import { safeGetJSON } from "./safeStorage.js";

// ── Khổ giấy mặc định: A4, căn lề chuẩn (trên 2 / dưới 2 / trái 2,5 / phải 2 cm) ──
// Word (.doc) và cửa sổ in (browser) đều đọc @page này → mọi file xuất ra
// đã mở trên Word/PDF đều là A4 dọc với lề chuẩn, font chữ vẫn giữ nguyên
// (mỗi tài liệu tự đặt font bằng style inline riêng của nó).
const PAGE_STYLE = `
  @page {
    size: A4 portrait;
    margin: 56.7pt 56.7pt 56.7pt 70.9pt;
  }

  @page WordSection1 {
    size: 595.3pt 841.9pt;
    margin: 56.7pt 56.7pt 56.7pt 70.9pt;

    mso-page-orientation: portrait;

    mso-header-margin: 0pt;
    mso-footer-margin: 0pt;
    mso-header: h1;
    mso-first-header: fh1;
    mso-title-page: yes;
  }

  div.WordSection1 {
    page: WordSection1;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    width: auto;
    background: white;
  }
  p.MsoHeader, p.MsoFooter { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; color: #767171; }
`;

const DOC_STYLE = `
  body {
    margin: 0;
    padding: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 14pt;
    color: #111;
    line-height: 1.15;
  }

  .ktsp-document,
  .ktsp-document * {
    box-sizing: border-box;
  }

  .ktsp-document p {
    margin: 0;
    padding: 0;
    line-height: 1.15;
  }

  .ktsp-document table {
    border-collapse: collapse;
    border-spacing: 0;
  }
`;

function wrapDoc(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="author" content="Nguyễn Tuấn"><meta name="copyright" content="© 2026 Nguyễn Tuấn">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotShowRevisions/><w:DoNotPrintRevisions/></w:WordDocument></xml><![endif]-->
<style>${PAGE_STYLE}${DOC_STYLE}</style>
</head><body>
<div style="mso-element:header" id="fh1"><p class="MsoHeader" style="text-align:center;line-height:1;">&nbsp;</p></div>
<div style="mso-element:header" id="h1"><p class="MsoHeader" style="text-align:center;line-height:1;"><!--[if supportFields]><span style="mso-element:field-begin"></span> = PAGE -1 <span style="mso-element:field-separator"></span><![endif]--><span style="mso-no-proof:yes">1</span><!--[if supportFields]><span style="mso-element:field-end"></span><![endif]--></p></div>
<div class="WordSection1"><div class="ktsp-document">${bodyHtml}</div></div></body></html>`;
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function nl2br(s) {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

export function dl(blob, filename) {
  // Cài đặt → Xuất dữ liệu → "Mốc thời gian trong tên file": none / date / datetime
  // includeTimestamp=false là công tắc tắt (backup cũ) — ưu tiên trước filenameStamp
  try {
    const settings = safeGetJSON("sgk_settings", null);
    const expCfg = settings?.export || {};
    let style = ["date", "datetime", "none"].includes(expCfg.filenameStamp) ? expCfg.filenameStamp : "date";
    if (expCfg.includeTimestamp === false) style = "none";
    if (style !== "none" && filename && !/_20\d{2}[-_]?\d{2}[-_]?\d{2}/.test(filename)) {
      const dot = String(filename).lastIndexOf(".");
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      const dateStr = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      const stamp = style === "datetime"
        ? `_${dateStr}_${p2(d.getHours())}${p2(d.getMinutes())}`
        : `_${dateStr}`;
      filename = (dot > 0 ? filename.slice(0, dot) : filename) + stamp + (dot > 0 ? filename.slice(dot) : "");
    }
  } catch {}
  let url = "";
  try {
    url = URL.createObjectURL(blob);
  } catch (e) {
    console.warn("[exportDoc] createObjectURL failed (blob quá lớn?):", e?.message);
    return false;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    try { URL.revokeObjectURL(url); } catch {}
  }, 1500);
  return true;
}

export function safeName(s) {
  return (
    String(s || "tai-lieu")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\\/:*?"<>|]+/g, "-")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120)
      .replace(/[. ]+$/g, "") || "tai-lieu"
  );
}

// ── Word (.doc) ────────────────────────────────────────────────────
export function exportWord(title, bodyHtml) {
  const blob = new Blob(["\ufeff" + wrapDoc(title, bodyHtml)], {
    type: "application/msword;charset=utf-8",
  });
  dl(blob, `${safeName(title)}.doc`);
}

// ── Print → PDF (browser print dialog lets the user pick "Save as PDF") ──
// Trả về false khi popup bị chặn (caller tự báo bằng toast inline thay vì alert chặn UI).
// Chờ fonts + ảnh xong (tối đa 1.5s) rồi mới print để không mất chữ/ảnh.
export function printToPdf(title, bodyHtml) {
  let w = null;
  try {
    w = window.open("", "_blank", "width=900,height=700");
  } catch { w = null; }
  if (!w) {
    console.warn("[exportDoc] print popup blocked");
    return false;
  }
  try {
    w.document.write(wrapDoc(title, bodyHtml));
    w.document.close();
  } catch (e) {
    console.warn("[exportDoc] print write failed:", e?.message);
    return false;
  }
  let done = false;
  const runner = () => {
    if (done) return;
    done = true;
    try { w.focus(); w.print(); } catch {}
  };
  try {
    const waits = [];
    if (w.document?.fonts?.ready) waits.push(w.document.fonts.ready.catch(() => {}));
    const imgs = Array.from(w.document?.images || []);
    waits.push(...imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((res) => {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
        setTimeout(res, 1500);
      });
    }));
    Promise.race([
      Promise.all(waits).catch(() => {}),
      new Promise((res) => setTimeout(res, 1500)),
    ]).then(runner);
  } catch {
    setTimeout(runner, 400);
  }
  return true;
}

// ── TXT ────────────────────────────────────────────────────────────
export function exportTxt(title, content) {
  const blob = new Blob(["\ufeff" + content], {
    type: "text/plain;charset=utf-8",
  });
  dl(blob, `${safeName(title)}.txt`);
}

// ── CSV (Excel-friendly) ───────────────────────────────────────────
export function exportCsv(title, rows) {
  const esc = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" });
  dl(blob, `${safeName(title)}.csv`);
}

// ── Shared document scaffolds ──────────────────────────────────────
export function docHeader(title, metaLines = []) {
  return `<h1>${escapeHtml(title)}</h1><div class="meta">${metaLines.map(nl2br).join(" • ")}</div>`;
}

export function dlBtn(targetUrl, label) {
  return `<a class="download" href="${targetUrl}">${escapeHtml(label)}</a>`;
}
