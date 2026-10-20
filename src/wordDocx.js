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
  out = out.replace(/<\s*(iframe|object|embed|form|input|button|select|textarea|link|meta|base|title)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(iframe|object|embed|form|input|button|select|textarea|link|meta|base)[^>]*\/?>/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '$1="#"');
  // style="...javascript:... / expression(...) / vbscript:..." vẫn chạy ở một số trình đọc
  out = out.replace(/\s*style\s*=\s*("[^"]*"|'[^']*')/gi, (m, q) => {
    const quote = q[0];
    let css = q.slice(1, -1);
    if (/javascript\s*:|vbscript\s*:|expression\s*\(|behaviou?r\s*:/i.test(css)) return "";
    // bỏ url(javascript:...) lẻ trong style nhưng giữ url ảnh thường
    css = css.replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]*\)/gi, "url()");
    return ` style=${quote}${css}${quote}`;
  });
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
  // 1px ≈ 0.75pt → half-points = px * 1.5 (giữ 6pt–72pt, không cắt chữ trang trí)
  return Math.max(12, Math.min(144, Math.round(n * 1.5)));
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
    return { data: bytes, type, width: readImageWidth(bytes, type), height: readImageHeight(bytes, type) };
  } catch {
    return null;
  }
}

// Đọc kích thước thật từ header ảnh để giữ đúng tỷ lệ (không méo ảnh dọc)
function readPngSize(b) {
  try {
    if (b.length < 24) return null;
    if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
    const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return w > 0 && h > 0 && w < 20000 && h < 20000 ? { w, h } : null;
  } catch { return null; }
}
function readGifSize(b) {
  try {
    if (b.length < 10) return null;
    const w = b[6] | (b[7] << 8);
    const h = b[8] | (b[9] << 8);
    return w > 0 && h > 0 ? { w, h } : null;
  } catch { return null; }
}
function readBmpSize(b) {
  try {
    if (b.length < 26 || b[0] !== 0x42 || b[1] !== 0x4d) return null;
    const w = b[18] | (b[19] << 8) | (b[20] << 16) | (b[21] << 24);
    const h = Math.abs(b[22] | (b[23] << 8) | (b[24] << 16) | (b[25] << 24));
    return w > 0 && h > 0 ? { w, h } : null;
  } catch { return null; }
}
function readJpegSize(b) {
  try {
    let i = 2;
    while (i + 8 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      // SOF0-SOF3, SOF5-SOF15 (trừ DHT/JPG/DAC)
      if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) {
        const h = (b[i + 5] << 8) | b[i + 6];
        const w = (b[i + 7] << 8) | b[i + 8];
        return w > 0 && h > 0 ? { w, h } : null;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
    return null;
  } catch { return null; }
}
function readImageSize(bytes, type) {
  if (type === "png") return readPngSize(bytes);
  if (type === "jpg") return readJpegSize(bytes);
  if (type === "gif") return readGifSize(bytes);
  if (type === "bmp") return readBmpSize(bytes);
  return null;
}
function readImageWidth(bytes, type) {
  return readImageSize(bytes, type)?.w ?? null;
}
function readImageHeight(bytes, type) {
  return readImageSize(bytes, type)?.h ?? null;
}
// Vừa khung 480px rộng (tối đa cao 640px), giữ tỷ lệ; ảnh dọc không còn bị méo
const IMG_MAX_W = 480;
const IMG_MAX_H = 640;
function fitImage(img, el) {
  // Ưu tiên width/height ghi trên thẻ <img>, sau đó là kích thước thật trong bytes
  let w = parseInt(el?.getAttribute?.("width"), 10);
  let h = parseInt(el?.getAttribute?.("height"), 10);
  if (!Number.isFinite(w) || w <= 0) w = img.width || null;
  if (!Number.isFinite(h) || h <= 0) h = img.height || null;
  if (!w || !h) return { width: IMG_MAX_W, height: Math.round(IMG_MAX_W * 2 / 3) };
  const scale = Math.min(IMG_MAX_W / w, IMG_MAX_H / h, 1);
  // Không phóng to ảnh nhỏ (giữ nét), chỉ thu ảnh lớn
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  return { width: dw, height: dh };
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
            runs.push(new ImageRun({ data: img.data, transformation: fitImage(img, node), type: img.type }));
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

  function blockToDocx(el, listCtx = null, listLevel = 0) {
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
          return [new Paragraph({ alignment: alignment || AlignmentType.CENTER, children: [new ImageRun({ data: img.data, transformation: fitImage(img, el), type: img.type })] })];
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
      const lvl = Math.min(Math.max(listLevel, 0), 8);
      const ctx = listCtx
        ? (listCtx.bullet ? { bullet: { level: lvl } } : { numbering: { reference: "default-numbering", level: lvl } })
        : { bullet: { level: lvl } };
      // Chạy inline TRỪ list con (tránh lặp text của ul/ol lồng)
      const own = Array.from(el.childNodes).filter((c) => {
        const ct = c.tagName?.toLowerCase?.();
        return ct !== "ul" && ct !== "ol";
      });
      const holder = el.ownerDocument.createElement("span");
      own.forEach((c) => holder.appendChild(c.cloneNode(true)));
      const out = [new Paragraph({ ...ctx, alignment, children: inlineRuns(holder) })];
      // list lồng trong <li> (ul/ol con) → level + 1
      Array.from(el.children).forEach((child) => {
        const ct = child.tagName?.toLowerCase();
        if (ct === "ul" || ct === "ol") out.push(...blockToDocx(child, listCtx || ctx, lvl + 1));
      });
      return out;
    }
    if (tag === "ul") {
      const lvl = Math.min(Math.max(listLevel, 0), 8);
      const out = [];
      Array.from(el.children).forEach((li) => {
        if (li.tagName?.toLowerCase() === "li") out.push(...blockToDocx(li, { bullet: { level: lvl } }, lvl));
      });
      return out.length ? out : [new Paragraph({ bullet: { level: lvl }, children: inlineRuns(el) })];
    }
    if (tag === "ol") {
      const lvl = Math.min(Math.max(listLevel, 0), 8);
      const out = [];
      Array.from(el.children).forEach((li) => {
        if (li.tagName?.toLowerCase() === "li") out.push(...blockToDocx(li, { numbering: { reference: "default-numbering", level: lvl } }, lvl));
      });
      return out.length ? out : [new Paragraph({ numbering: { reference: "default-numbering", level: lvl }, children: inlineRuns(el) })];
    }
    if (tag === "table") {
      try {
        const rows = Array.from(el.querySelectorAll("tr"));
        if (!rows.length) return [new Paragraph({ children: inlineRuns(el) })];
        // Đếm cột = max(sum colspan) để chia đều độ rộng
        let maxCols = 1;
        rows.forEach((tr) => {
          let cols = 0;
          tr.querySelectorAll("th,td").forEach((td) => {
            const cs = parseInt(td.getAttribute("colspan"), 10);
            cols += Number.isFinite(cs) && cs > 1 ? Math.min(cs, 12) : 1;
          });
          if (cols > maxCols) maxCols = cols;
        });
        const colW = Math.floor(9036 / Math.max(1, maxCols));
        // rowspan: theo dõi ô đang merge dọc theo từng cột
        const vSpans = new Array(maxCols).fill(0);
        const tRows = rows.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("th,td"));
          const tCells = [];
          let colIdx = 0;
          const nextCells = [];
          cells.forEach((td) => {
            // bỏ qua cột đang bị rowspan từ hàng trên chiếm
            while (colIdx < maxCols && vSpans[colIdx] > 0) { vSpans[colIdx]--; colIdx++; }
            const cs = parseInt(td.getAttribute("colspan"), 10);
            const rs = parseInt(td.getAttribute("rowspan"), 10);
            const colSpan = Number.isFinite(cs) && cs > 1 ? Math.min(cs, 12) : 1;
            const rowSpan = Number.isFinite(rs) && rs > 1 ? Math.min(rs, 20) : 1;
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
            const cellOpts = {
              width: { size: colW * colSpan, type: WidthType.DXA },
              children: cellChildren,
              shading: isHeader ? { fill: "EDF2F7" } : undefined,
            };
            if (colSpan > 1) cellOpts.columnSpan = colSpan;
            if (rowSpan > 1) {
              cellOpts.verticalMerge = "restart";
              for (let k = 0; k < colSpan && colIdx + k < maxCols; k++) vSpans[colIdx + k] = rowSpan - 1;
            }
            nextCells.push(new TableCell(cellOpts));
            colIdx += colSpan;
          });
          // các cột còn lại đang merge dọc → ô tiếp nối
          while (colIdx < maxCols) {
            if (vSpans[colIdx] > 0) {
              vSpans[colIdx]--;
              nextCells.push(new TableCell({ width: { size: colW, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "" })] })], verticalMerge: "continue" }));
            }
            colIdx++;
          }
          return new TableRow({ children: nextCells.length ? nextCells : [new TableCell({ width: { size: colW, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "" })] })] })] });
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
