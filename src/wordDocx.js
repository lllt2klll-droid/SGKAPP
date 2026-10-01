// ── Word (.docx) ⇄ Sách Word (.html) — giữ nguyên định dạng ────────────
// Import: .docx -> HTML ngữ nghĩa (headings, bold/italic/underline,
// lists, tables, ảnh nhúng) qua mammoth — hiển thị dạng sách không đổi.
// Export: HTML sách -> file .docx thật qua lib `docx` (giữ headings,
// định dạng chữ, căn lề, lists, tables, ảnh) — mở bằng Word sửa tiếp được.
import mammoth from "mammoth";

export function isDocxFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return name.endsWith(".docx");
}

export function isLegacyDocFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return name.endsWith(".doc") && !name.endsWith(".docx");
}

function sanitizeHtml(html) {
  let out = String(html || "");
  out = out.replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  out = out.replace(/<\s*(iframe|object|embed|form|input|button|select|textarea)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(iframe|object|embed|form|input|button|select|textarea)[^>]*\/?>/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '$1="#"');
  return out.trim();
}

// Sanitize HTML soạn/paste trước khi lưu lên máy chủ — giữ toàn bộ định dạng
// (style, class, bảng, ảnh), chỉ bỏ script/iframe/form + event handlers + javascript: URLs.
// BookReader render bằng dangerouslySetInnerHTML nên đây là lớp phòng thủ cần thiết.
export function sanitizeRichHtml(html) {
  return sanitizeHtml(html);
}

// ── Import .docx -> HTML (client-side, giữ nguyên định dạng) ──
// Thử faithful converter trước (font/cỡ/màu/căn lề/bảng/ảnh đúng Word),
// rớt lại mammoth khi file lạ.
export async function importDocxToHtml(file) {
  if (!file) throw new Error("Chưa chọn file Word.");
  if (isLegacyDocFile(file)) {
    throw new Error("File .doc (Word 97-2003) không đọc trực tiếp được. Hãy mở bằng Word → Lưu thành .docx rồi nhập lại.");
  }
  if (!isDocxFile(file)) throw new Error("Chỉ nhận file Word (.docx).");
  const arrayBuffer = await file.arrayBuffer();
  try {
    const { convertDocxToFaithfulHtml } = await import("./docxFaithful.js");
    const out = await convertDocxToFaithfulHtml(arrayBuffer);
    const html = sanitizeHtml(out?.html || "");
    if (html && html.replace(/<[^>]*>/g, " ").trim()) {
      const warnings = Array.isArray(out?.warnings)
        ? out.warnings.map((w) => (typeof w === "string" ? w : w?.message)).filter(Boolean).slice(0, 5)
        : [];
      return { html, warnings };
    }
  } catch (e) {
    console.warn("[wordDocx] faithful import failed, fallback mammoth:", e?.message);
  }
  let convertImage;
  try {
    if (mammoth?.images?.imgElement) {
      convertImage = mammoth.images.imgElement((image) =>
        image.read("base64").then((data) => ({
          src: `data:${image.contentType};base64,${data}`,
          style: "max-width:100%;height:auto;",
        })),
      );
    }
  } catch {}
  let result;
  try {
    result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: ["u => u", "strike => s", "comment-reference => sup"],
        ...(convertImage ? { convertImage } : {}),
      },
    );
  } catch {
    throw new Error("Không đọc được file .docx (file hỏng hoặc có mật khẩu?).");
  }
  const html = sanitizeHtml(result?.value || "");
  if (!html || !html.replace(/<[^>]*>/g, " ").trim()) {
    throw new Error("File Word không có nội dung để nhập.");
  }
  const warnings = Array.isArray(result?.messages)
    ? result.messages.map((m) => m?.message).filter(Boolean).slice(0, 5)
    : [];
  return { html: `<div class="docx-import">\n${html}\n</div>`, warnings };
}

// ── Export HTML sách -> file .docx thật (mở/sửa bằng Word) ──
function pxToHalfPoints(px) {
  const n = parseFloat(px);
  if (!Number.isFinite(n)) return undefined;
  // 1px ≈ 0.75pt → half-points = px * 1.5
  return Math.max(16, Math.min(96, Math.round(n * 1.5)));
}

function cssColorToHex(color) {
  if (!color) return undefined;
  const c = String(color).trim().toLowerCase();
  if (c === "transparent" || c === "inherit" || c === "initial") return undefined;
  const m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) {
    const h = [m[1], m[2], m[3]]
      .map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, "0"))
      .join("");
    if (h === "000000") return undefined; // đen mặc định — bỏ qua cho gọn
    return h.toUpperCase();
  }
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    if (h === "000000") return undefined;
    return h.toUpperCase();
  }
  return undefined;
}

function dataUrlToImageData(src) {
  try {
    const m = String(src || "").match(/^data:(image\/(png|jpe?g|gif|bmp|webp));base64,(.+)$/i);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    // docx/ImageRun không hỗ trợ webp — bỏ qua để giữ placeholder chữ thay vì file lỗi
    if (mime.includes("webp")) return null;
    const b64 = m[3];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let type = "png";
    if (mime.includes("jpg") || mime.includes("jpeg")) type = "jpg";
    else if (mime.includes("gif")) type = "gif";
    else if (mime.includes("bmp")) type = "bmp";
    return { data: bytes, type };
  } catch {
    return null;
  }
}

function parseStyle(el) {
  const out = {};
  try {
    const st = el?.style || {};
    if (st.textAlign) out.align = st.textAlign;
    if (st.color) out.color = cssColorToHex(st.color);
    if (st.fontSize) out.size = pxToHalfPoints(st.fontSize);
    if (st.fontFamily) {
      const f = String(st.fontFamily).split(",")[0].replace(/['"]/g, "").trim();
      if (f && f.toLowerCase() !== "inherit") out.font = f.slice(0, 40);
    }
    if (st.backgroundColor) {
      const h = cssColorToHex(st.backgroundColor);
      if (h) out.highlight = h;
    }
    if (st.fontWeight && (st.fontWeight === "bold" || Number(st.fontWeight) >= 600)) out.bold = true;
    if (st.fontStyle === "italic") out.italic = true;
    if (st.textDecoration?.includes("underline")) out.underline = true;
    if (st.textDecoration?.includes("line-through")) out.strike = true;
  } catch {}
  return out;
}

export async function exportHtmlToDocx(html, title = "sach-word") {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } = await import("docx");
  const parsed = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const root = parsed.body?.firstElementChild || parsed.body;

  const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };

  function inlineRuns(container, inherited = {}) {
    const runs = [];
    const walk = (node, fmt) => {
      if (node.nodeType === 3) {
        const text = node.textContent || "";
        if (!text) return;
        // Giữ khoảng trắng có nghĩa, bỏ text rỗng thuần
        if (!text.trim()) {
          runs.push(new TextRun({ text: " ", ...runProps(fmt) }));
          return;
        }
        // Tách theo dòng để giữ <br>
        const parts = text.split("\n");
        parts.forEach((part, i) => {
          if (i > 0) runs.push(new TextRun({ break: 1 }));
          if (part) runs.push(new TextRun({ text: part, ...runProps(fmt) }));
        });
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      const css = parseStyle(node);
      const next = { ...fmt };
      if (tag === "strong" || tag === "b") next.bold = true;
      if (tag === "em" || tag === "i") next.italic = true;
      if (tag === "u") next.underline = true;
      if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
      if (tag === "code") next.font = next.font || "Consolas";
      if (css.bold) next.bold = true;
      if (css.italic) next.italic = true;
      if (css.underline) next.underline = true;
      if (css.strike) next.strike = true;
      if (css.color) next.color = css.color;
      if (css.size) next.size = css.size;
      if (css.font) next.font = css.font;
      if (css.highlight) next.highlight = css.highlight;
      if (tag === "br") {
        runs.push(new TextRun({ break: 1 }));
        return;
      }
      if (tag === "img") {
        const img = dataUrlToImageData(node.getAttribute("src"));
        if (img) {
          try {
            runs.push(new ImageRun({ data: img.data, transformation: { width: 480, height: 320 }, type: img.type }));
          } catch {
            runs.push(new TextRun({ text: `[Ảnh: ${node.getAttribute("alt") || "minh họa"}]`, italics: true }));
          }
        } else {
          runs.push(new TextRun({ text: `[Ảnh: ${node.getAttribute("alt") || "minh họa"}]`, italics: true }));
        }
        return;
      }
      if (tag === "a") {
        const href = node.getAttribute("href") || "";
        const linkFmt = { ...next };
        if (/^https?:\/\//i.test(href)) {
          linkFmt.underline = true;
          if (!linkFmt.color) linkFmt.color = "0563C1";
        }
        node.childNodes.forEach((c) => walk(c, linkFmt));
        return;
      }
      node.childNodes.forEach((c) => walk(c, next));
    };
    const runProps = (fmt) => {
      const p = {};
      if (fmt.bold) p.bold = true;
      if (fmt.italic) p.italics = true;
      if (fmt.underline) p.underline = {};
      if (fmt.strike) p.strike = true;
      if (fmt.color) p.color = fmt.color;
      if (fmt.size) p.size = fmt.size;
      if (fmt.font) p.font = fmt.font;
      if (fmt.highlight) p.shading = { fill: fmt.highlight };
      return p;
    };
    container.childNodes.forEach((c) => walk(c, inherited));
    if (!runs.length) runs.push(new TextRun({ text: "" }));
    return runs;
  }

  function blockToDocx(el, listCtx = null) {
    if (el.nodeType === 3) {
      const t = (el.textContent || "").trim();
      if (!t) return [];
      return [new Paragraph({ children: [new TextRun({ text: t })] })];
    }
    if (el.nodeType !== 1) return [];
    const tag = el.tagName.toLowerCase();
    const css = parseStyle(el);
    const alignment = alignMap[css.align];

    if (tag === "img") {
      const img = dataUrlToImageData(el.getAttribute("src"));
      if (img) {
        try {
          return [new Paragraph({ alignment: alignment || AlignmentType.CENTER, children: [new ImageRun({ data: img.data, transformation: { width: 480, height: 320 }, type: img.type })] })];
        } catch {}
      }
      return [new Paragraph({ children: [new TextRun({ text: `[Ảnh: ${el.getAttribute("alt") || "minh họa"}]`, italics: true })] })];
    }
    if (tag === "hr") {
      return [new Paragraph({ thematicBreak: true })];
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = tag === "h1" ? HeadingLevel.HEADING_1 : tag === "h2" ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      return [new Paragraph({ heading: level, alignment, children: inlineRuns(el, { bold: tag === "h1" || tag === "h2" }) })];
    }
    if (tag === "li") {
      return [new Paragraph({ ...(listCtx || { bullet: { level: 0 } }), alignment, children: inlineRuns(el) })];
    }
    if (tag === "ul") {
      const out = [];
      Array.from(el.children).forEach((li) => {
        if (li.tagName?.toLowerCase() === "li") out.push(...blockToDocx(li, { bullet: { level: 0 } }));
      });
      return out.length ? out : [new Paragraph({ bullet: { level: 0 }, children: inlineRuns(el) })];
    }
    if (tag === "ol") {
      const out = [];
      Array.from(el.children).forEach((li) => {
        if (li.tagName?.toLowerCase() === "li") out.push(...blockToDocx(li, { numbering: { reference: "default-numbering", level: 0 } }));
      });
      return out.length ? out : [new Paragraph({ numbering: { reference: "default-numbering", level: 0 }, children: inlineRuns(el) })];
    }
    if (tag === "table") {
      try {
        const rows = Array.from(el.querySelectorAll("tr"));
        if (!rows.length) return [new Paragraph({ children: inlineRuns(el) })];
        // Đếm cột lớn nhất để chia đều độ rộng
        let maxCols = 1;
        rows.forEach((tr) => {
          const cols = tr.querySelectorAll("th,td").length;
          if (cols > maxCols) maxCols = cols;
        });
        const colW = Math.floor(9036 / Math.max(1, maxCols));
        const tRows = rows.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("th,td"));
          const tCells = (cells.length ? cells : [document.createElement("td")]).map((td) => {
            const isHeader = td.tagName.toLowerCase() === "th" || !!tr.parentElement?.tagName?.match(/thead/i);
            const cellChildren = [];
            // Mỗi ô: tách block con, fallback inline
            let hasBlock = false;
            Array.from(td.childNodes).forEach((c) => {
              const parts = blockToDocx(c);
              parts.forEach((p) => {
                if (p instanceof Paragraph) { cellChildren.push(p); hasBlock = true; }
              });
            });
            if (!hasBlock) cellChildren.push(new Paragraph({ children: inlineRuns(td, isHeader ? { bold: true } : {}) }));
            return new TableCell({ width: { size: colW, type: WidthType.DXA }, children: cellChildren, shading: isHeader ? { fill: "EDF2F7" } : undefined });
          });
          return new TableRow({ children: tCells });
        });
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tRows })];
      } catch {
        return [new Paragraph({ children: inlineRuns(el) })];
      }
    }
    if (tag === "blockquote") {
      return [new Paragraph({ alignment, indent: { left: 720 }, children: inlineRuns(el, { italic: true }) })];
    }
    if (tag === "pre") {
      const t = el.textContent || "";
      return t.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })] }));
    }
    if (tag === "figure" || tag === "div" || tag === "section" || tag === "article") {
      const out = [];
      Array.from(el.childNodes).forEach((c) => out.push(...blockToDocx(c)));
      return out.length ? out : [new Paragraph({ children: [new TextRun({ text: "" })] })];
    }
    // p, h*, span inline-level bọc ngoài, figcaption...
    return [new Paragraph({ alignment, spacing: { after: 160 }, children: inlineRuns(el) })];
  }

  const children = [];
  Array.from(root.childNodes).forEach((node) => {
    blockToDocx(node).forEach((b) => {
      if (b && typeof b === "object") children.push(b);
    });
  });
  if (!children.length) children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: "decimal",
            text: `%${i + 1}.`,
            alignment: AlignmentType.LEFT,
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } } },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const safe = String(title || "sach-word").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 120) || "sach-word";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
  return true;
}
