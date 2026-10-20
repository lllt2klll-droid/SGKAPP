// ─── Whiteboard ⇄ Word (.docx) ───
// Import: .docx -> objects/connectors trên board (giữ headings, lists, tables, ảnh)
// Export: board -> file .docx thật (mở/sửa bằng Word)
// Dùng sẵn deps: `mammoth` (đọc) + `docx` (ghi). Không thêm dependency mới.

import { uid, blankObject, ensureFits } from "./whiteboardStore.js";
import { docxFontOf, boardDocxFont } from "./whiteboardFonts.js";
import { normalizeBulletStyle, stripBulletMark, bulletPrefix, parseRichSegments } from "./mindmapEngine.js";

const MAX_BLOCKS = 300;
const MAX_TEXT_LEN = 1200;

function fileNameOf(file) {
  return String(file?.name || "tai-lieu").replace(/\.docx?$/i, "").trim() || "tai-lieu";
}

function isLegacyDoc(file) {
  return /\.doc$/i.test(file?.name || "") && !/\.docx$/i.test(file?.name || "");
}

// ── Parse .docx -> blocks trung gian ──
// Mỗi block: { type: 'h1'|'h2'|'h3'|'p'|'bullet'|'number'|'table'|'image'|'quote', text, src?, rows? }
export async function parseDocxToBlocks(file) {
  if (!file) throw new Error("Chưa chọn file Word.");
  if (isLegacyDoc(file)) {
    throw new Error("File .doc (Word 97-2003) không đọc được. Hãy mở bằng Word → Lưu thành .docx rồi nhập lại.");
  }
  if (!/\.docx$/i.test(file?.name || "")) throw new Error("Chỉ nhận file Word (.docx).");
  const arrayBuffer = await file.arrayBuffer();
  const mammothMod = await import("mammoth");
  const mammoth = mammothMod?.default || mammothMod;
  let html = "";
  try {
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
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      { styleMap: ["u => u", "strike => s"], ...(convertImage ? { convertImage } : {}) },
    );
    html = String(result?.value || "");
  } catch {
    throw new Error("Không đọc được file .docx (file hỏng hoặc có mật khẩu?).");
  }
  if (!html.trim()) throw new Error("File Word không có nội dung để nhập.");
  const blocks = htmlToBlocks(html);
  if (!blocks.length) throw new Error("File Word không có nội dung để nhập.");
  return { blocks: blocks.slice(0, MAX_BLOCKS), title: fileNameOf(file) };
}

function textOf(el, limit = MAX_TEXT_LEN) {
  const t = String(el?.textContent || "").replace(/\s+/g, " ").trim();
  return t.slice(0, limit);
}

function htmlToBlocks(html) {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body?.firstElementChild || parsed.body;
  const blocks = [];
  const push = (b) => {
    if (!b) return;
    if ((b.type === "image" && b.src) || (b.text && b.text.trim())) blocks.push(b);
  };

  const walkList = (listEl, ordered) => {
    Array.from(listEl.children).forEach((li, idx) => {
      if (li.tagName?.toLowerCase() !== "li") return;
      // li có thể chứa nested list — tách text trực tiếp
      const clone = li.cloneNode(true);
      clone.querySelectorAll("ul,ol").forEach((n) => n.remove());
      const t = String(clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LEN);
      if (t) push({ type: ordered ? "number" : "bullet", text: t, index: idx + 1 });
      li.querySelectorAll(":scope > ul, :scope > ol").forEach((nested) => {
        walkList(nested, nested.tagName.toLowerCase() === "ol");
      });
    });
  };

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 3) {
      const t = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (t) push({ type: "p", text: t.slice(0, MAX_TEXT_LEN) });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = tag === "h1" ? "h1" : tag === "h2" ? "h2" : "h3";
      push({ type: level, text: textOf(node) });
    } else if (tag === "ul") {
      walkList(node, false);
    } else if (tag === "ol") {
      walkList(node, true);
    } else if (tag === "li") {
      const t = textOf(node);
      if (t) push({ type: "bullet", text: t });
    } else if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr")).slice(0, 40).map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).slice(0, 8).map((td) =>
          String(td.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
        ),
      ).filter((r) => r.some((c) => c));
      if (rows.length) push({ type: "table", text: rows.map((r) => r.join(" | ")).join("\n").slice(0, MAX_TEXT_LEN), rows });
      else {
        const t = textOf(node);
        if (t) push({ type: "p", text: t });
      }
    } else if (tag === "img") {
      const src = node.getAttribute("src") || "";
      if (src.startsWith("data:image")) push({ type: "image", text: node.getAttribute("alt") || "", src });
    } else if (tag === "blockquote") {
      const t = textOf(node);
      if (t) push({ type: "quote", text: t });
    } else if (tag === "figure" || tag === "div" || tag === "section" || tag === "article") {
      // đào sâu 1 cấp: headings / p / lists / img / table
      let hasChild = false;
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 1) {
          const ct = c.tagName.toLowerCase();
          if (/^h[1-6]$/.test(ct)) { push({ type: ct === "h1" ? "h1" : ct === "h2" ? "h2" : "h3", text: textOf(c) }); hasChild = true; }
          else if (ct === "ul") { walkList(c, false); hasChild = true; }
          else if (ct === "ol") { walkList(c, true); hasChild = true; }
          else if (ct === "img" && (c.getAttribute("src") || "").startsWith("data:image")) { push({ type: "image", text: c.getAttribute("alt") || "", src: c.getAttribute("src") }); hasChild = true; }
          else if (ct === "table") {
            const t = textOf(c);
            if (t) push({ type: "table", text: t });
            hasChild = true;
          } else if (ct === "p" || ct === "blockquote") {
            const imgs = c.querySelectorAll("img");
            if (imgs.length && c.textContent.trim().length < 4) {
              imgs.forEach((im) => {
                const s = im.getAttribute("src") || "";
                if (s.startsWith("data:image")) push({ type: "image", text: im.getAttribute("alt") || "", src: s });
              });
              hasChild = true;
            } else {
              const t = textOf(c);
              if (t) push({ type: ct === "blockquote" ? "quote" : "p", text: t });
              hasChild = true;
            }
          }
        } else if (c.nodeType === 3) {
          const t = String(c.textContent || "").replace(/\s+/g, " ").trim();
          if (t) { push({ type: "p", text: t.slice(0, MAX_TEXT_LEN) }); hasChild = true; }
        }
      });
      if (!hasChild) {
        const t = textOf(node);
        if (t) push({ type: "p", text: t });
      }
    } else {
      // p, pre, figcaption, span bọc ngoài...
      const imgs = node.querySelectorAll ? node.querySelectorAll("img") : [];
      if (imgs.length && String(node.textContent || "").trim().length < 4) {
        imgs.forEach((im) => {
          const s = im.getAttribute("src") || "";
          if (s.startsWith("data:image")) push({ type: "image", text: im.getAttribute("alt") || "", src: s });
        });
      } else {
        const t = textOf(node);
        if (t) push({ type: "p", text: t });
      }
    }
  });
  return blocks;
}

// ── Blocks -> board objects (layout dọc, headings làm node cha, bullets nối vào) ──
export async function blocksToBoardObjects(blocks, { cx = 500, cy = 300 } = {}) {
  const objects = [];
  const connectors = [];
  const CONTENT_W = 460;
  let y = cy;
  const gap = 18;
  let lastHeadingId = null;
  let lastHeadingX = cx;

  const estH = (text, w, fs) => {
    const lines = String(text || " ").split("\n");
    const maxChars = Math.max(4, Math.floor((w - 16) / (fs * 0.62)));
    let total = 0;
    lines.forEach((ln) => {
      const words = ln.split(/\s+/).filter(Boolean);
      let cur = "";
      let n = 1;
      words.forEach((w) => {
        const cand = cur ? `${cur} ${w}` : w;
        if (cand.length > maxChars && cur) { n++; cur = w; }
        else cur = cand;
      });
      total += Math.max(1, n);
    });
    return Math.max(48, Math.ceil(total * fs * 1.32 + 20));
  };

  const addObj = (obj) => {
    objects.push(ensureFits(obj));
    return obj;
  };

  for (const b of blocks) {
    if (b.type === "h1" || b.type === "h2") {
      const w = b.type === "h1" ? 480 : 440;
      const h = Math.max(64, estH(b.text, w, 17));
      const o = addObj({
        ...blankObject("node"),
        x: cx - w / 2, y, width: w, height: Math.min(h, 160),
        text: b.text, fill: b.type === "h1" ? "#1d4ed8" : "#0d9488",
        color: "#ffffff", stroke: "transparent", strokeWidth: 0, fontSize: 16, bold: true,
      });
      y += o.height + gap + 6;
      lastHeadingId = o.id;
      lastHeadingX = cx;
    } else if (b.type === "h3") {
      const w = 400;
      const h = Math.max(52, estH(b.text, w, 15));
      const o = addObj({
        ...blankObject("node"),
        x: cx - w / 2, y, width: w, height: Math.min(h, 120),
        text: b.text, fill: "#fef3c7", color: "#92400e", stroke: "#f59e0b", strokeWidth: 1.5,
        fontSize: 15, bold: true, parentId: lastHeadingId,
      });
      if (lastHeadingId) connectors.push({ id: uid("c"), fromId: lastHeadingId, toId: o.id, type: "arrow", color: "#d97706", width: 2 });
      y += o.height + gap;
    } else if (b.type === "bullet" || b.type === "number") {
      const w = 420;
      const prefix = b.type === "number" ? `${b.index || "•"}. ` : "• ";
      const h = Math.max(48, estH(prefix + b.text, w, 14));
      const o = addObj({
        ...blankObject("node"),
        x: lastHeadingId ? lastHeadingX - w / 2 + 40 : cx - w / 2, y,
        width: w, height: Math.min(h, 200),
        text: prefix + b.text, fill: "#f8fafc", color: "#1e293b",
        stroke: "#2563eb", strokeWidth: 1.5, fontSize: 14, bold: false,
        parentId: lastHeadingId,
      });
      if (lastHeadingId) connectors.push({ id: uid("c"), fromId: lastHeadingId, toId: o.id, type: "line", color: "#94a3b8", width: 1.5 });
      y += o.height + gap;
    } else if (b.type === "quote") {
      const w = CONTENT_W;
      const h = Math.max(60, estH(b.text, w, 14));
      addObj({
        ...blankObject("note"),
        x: cx - w / 2, y, width: w, height: Math.min(h, 220),
        text: b.text, fill: "#ede9fe", stroke: "#8b5cf6", strokeWidth: 1, fontSize: 14,
      });
      y += Math.min(h, 220) + gap;
    } else if (b.type === "table") {
      const rows = Array.isArray(b.rows) ? b.rows : null;
      const cellText = rows ? rows.map((r) => "▏ " + r.join("  │  ")).join("\n") : b.text;
      const w = 480;
      const h = Math.max(80, estH(cellText, w, 13));
      addObj({
        ...blankObject("text"),
        x: cx - w / 2, y, width: w, height: Math.min(h, 320),
        text: cellText, fill: "#f1f8ff", stroke: "#0ea5e9", strokeWidth: 1.2, fontSize: 13,
      });
      y += Math.min(h, 320) + gap;
    } else if (b.type === "image") {
      const { w, h, imageId, src } = await imageBlockToBoardImage(b).catch(() => ({ w: 320, h: 200, imageId: null, src: b.src }));
      const iw = Math.min(360, w || 320);
      const ih = Math.min(260, h || 200);
      addObj({
        ...blankObject("image"),
        x: cx - iw / 2, y, width: iw, height: ih,
        src, imageId, text: b.text || "", fill: "#fff", stroke: "#e2e8f0", strokeWidth: 1,
      });
      y += ih + gap;
    } else {
      // đoạn văn thường -> text box
      const w = CONTENT_W;
      const h = Math.max(52, estH(b.text, w, 14));
      addObj({
        ...blankObject("text"),
        x: cx - w / 2, y, width: w, height: Math.min(h, 260),
        text: b.text, fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1.2, fontSize: 14,
      });
      y += Math.min(h, 260) + gap;
    }
  }
  return { objects, connectors };
}

// Ảnh dataURL trong Word -> lưu vào imageStore (IndexedDB) để board nhẹ, fallback giữ dataURL
async function imageBlockToBoardImage(b) {
  const src = b.src || "";
  const size = await new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 320, h: 200 });
    img.src = src;
  });
  const maxW = 360, maxH = 260;
  const sc = Math.min(1, maxW / (size.w || 360), maxH / (size.h || 260));
  const w = Math.round((size.w || 360) * sc) || 320;
  const h = Math.round((size.h || 260) * sc) || 200;
  try {
    const { saveImageBlob } = await import("./imageStore.js");
    const res = await fetch(src);
    const blob = await res.blob();
    const imageId = await saveImageBlob(blob);
    const { blobToObjectURL } = await import("./imageStore.js");
    return { w, h, imageId, src: blobToObjectURL(blob) };
  } catch {
    return { w, h, imageId: null, src };
  }
}

// ── API gọn cho WhiteboardView: file -> { objects, connectors, title, count } ──
export async function importDocxToBoard(file, at = { cx: 500, cy: 300 }) {
  const { blocks, title } = await parseDocxToBlocks(file);
  const { objects, connectors } = await blocksToBoardObjects(blocks, at);
  // dịch chuyển để vùng trống: caller đã tính cx,cy từ findFreeSpot
  return { objects, connectors, title, blockCount: blocks.length };
}

// ── Export board -> .docx ──
function boardTextOf(o) {
  return String(o?.text || "").trim();
}

function dataUrlToBytes(src) {
  const m = String(src || "").match(/^data:(image\/(png|jpe?g|gif|bmp|webp));base64,(.+)$/i);
  if (!m) return null;
  try {
    const b64 = m[3];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let type = "png";
    const mime = m[1].toLowerCase();
    if (mime.includes("jpg") || mime.includes("jpeg")) type = "jpg";
    else if (mime.includes("gif")) type = "gif";
    else if (mime.includes("bmp")) type = "bmp";
    else if (mime.includes("webp")) type = "png"; // docx không hỗ trợ webp → giữ bytes, khai png để Word tự chuyển
    return { data: bytes, type };
  } catch { return null; }
}

async function imageIdToBytes(imageId) {
  if (!imageId) return null;
  try {
    const { getImageBlob } = await import("./imageStore.js");
    const blob = await getImageBlob(imageId);
    if (!blob) return null;
    const buf = new Uint8Array(await blob.arrayBuffer());
    const t = /png/i.test(blob.type) ? "png" : /gif/i.test(blob.type) ? "gif" : /bmp/i.test(blob.type) ? "bmp" : "jpg";
    return { data: buf, type: t };
  } catch { return null; }
}

async function srcToImageBytes(src, imageId = null) {
  if (src && String(src).startsWith("data:image")) {
    const direct = dataUrlToBytes(src);
    if (direct) return direct;
  }
  if (src && String(src).startsWith("blob:")) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      const t = /png/i.test(blob.type) ? "png" : /gif/i.test(blob.type) ? "gif" : "jpg";
      return { data: buf, type: t };
    } catch {}
  }
  // P0: board sau stripEphemeralSrc có src=null nhưng imageId còn → resolve từ IDB (path phổ biến nhất)
  if (imageId) return imageIdToBytes(imageId);
  return null;
}

export async function exportBoardToDocx(board) {
  // Mỗi khối trên board -> 1 Ô BẢNG (table cell) trong Word:
  // chữ nằm trong ô nên sửa trực tiếp được, màu nền/viền ô bám theo khối gốc.
  // Các khối ngang hàng nhau -> nằm chung 1 hàng bảng (giữ bố cục trái-phải).
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun,
    Table, TableRow, TableCell, WidthType, TableLayoutType, BorderStyle, ShadingType, VerticalAlign,
  } = await import("docx");
  const name = String(board?.name || "bang-trang").trim() || "bang-trang";
  const all = [...(board?.objects || [])].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const byId = new Map(all.map((o) => [o.id, o]));
  const connectors = Array.isArray(board?.connectors) ? board.connectors : [];

  // Font Word = font đang hiển thị của từng khối (object > font mặc định bảng > máy),
  // để file .docx mở ra giống màn hình whiteboard thay vì cứng Times New Roman.
  const boardFont = boardDocxFont(board);
  const PAGE_DXA = 9036; // A4usable sau trừ lề

  const hex6 = (c) => {
    const s = String(c || "").trim().toLowerCase();
    if (!s || s === "transparent") return null;
    const m = s.match(/^#([0-9a-f]{6})$/);
    if (m) return m[1].toUpperCase();
    const m3 = s.match(/^#([0-9a-f]{3})$/);
    if (m3) return m3[1].split("").map((x) => x + x).join("").toUpperCase();
    return null;
  };
  const pxToHalf = (px) => {
    const n = Number(px) || 14;
    return Math.max(16, Math.min(72, Math.round(n * 1.5)));
  };
  const borderSize = (w) => Math.max(2, Math.min(24, Math.round((Number(w) || 1) * 4)));
  const borderStyleOf = (dash) => {
    const d = String(dash || "").trim();
    if (d === "2 4") return BorderStyle.DOTTED;
    if (d) return BorderStyle.DASHED;
    return BorderStyle.SINGLE;
  };
  const alignOf = (o) => {
    const a = String(o?.align || "").toLowerCase();
    if (a === "left") return AlignmentType.LEFT;
    if (a === "right") return AlignmentType.RIGHT;
    if (a === "justify") return AlignmentType.JUSTIFIED;
    if (a === "center") return AlignmentType.CENTER;
    return o?.kind === "node" ? AlignmentType.CENTER : AlignmentType.LEFT;
  };
  const runOf = (o, text) => new TextRun({
    text: String(text ?? " "),
    font: docxFontOf(o, board),
    size: pxToHalf(o?.fontSize),
    bold: !!o?.bold || undefined,
    italics: !!o?.italic || undefined,
    color: hex6(o?.color) || undefined,
  });
  // Markdown-lite **đậm** / *nghiêng* trong node → nhiều TextRun giữ style khi xuất Word
  const runsOf = (o, text) => {
    const segs = parseRichSegments(text).filter((r) => r.t);
    if (!segs.length) return [runOf(o, " ")];
    return segs.map((r) => new TextRun({
      text: r.t,
      font: docxFontOf(o, board),
      size: pxToHalf(o?.fontSize),
      bold: r.bold || !!o?.bold || undefined,
      italics: r.italic || !!o?.italic || undefined,
      color: hex6(o?.color) || undefined,
    }));
  };

  // Gom khối thành hàng: khối sau chồng dọc với hàng hiện tại -> chung hàng (giữ bố cục ngang)
  // Dùng overlap dọc (>25% chiều cao nhỏ nhất) thay vì ngưỡng cứng 200px để không vỡ với node cao
  const items = all.filter((o) => o.kind !== "stroke");
  const rows = [];
  for (const o of items) {
    const oy = Number(o.y) || 0;
    const oh = Math.max(20, Number(o.height) || 40);
    const last = rows[rows.length - 1];
    let sameRow = false;
    if (last) {
      sameRow = last.some((x) => {
        const xy = Number(x.y) || 0;
        const xh = Math.max(20, Number(x.height) || 40);
        const overlap = Math.min(oy + oh, xy + xh) - Math.max(oy, xy);
        return overlap > Math.min(oh, xh) * 0.25;
      });
    }
    if (last && sameRow) last.push(o);
    else rows.push([o]);
  }
  rows.forEach((r) => r.sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0)));

  const kids = [];
  kids.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: name, font: boardFont, size: 36, bold: true, color: "1D4ED8" })],
  }));
  kids.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: `Xuất từ Whiteboard — ${items.length} khối, ${connectors.length} liên kết — ${new Date().toLocaleString("vi-VN")}`,
      font: boardFont, size: 20, italics: true, color: "64748B",
    })],
  }));
  kids.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({
      text: "Mỗi khối là một ô bảng — bấm vào ô để sửa chữ trực tiếp. (Hình dạng khối được giữ gần đúng dạng chữ nhật.)",
      font: boardFont, size: 20, italics: true, color: "64748B",
    })],
  }));

  let exported = 0;
  for (const row of rows) {
    const totalW = row.reduce((s, o) => s + Math.max(40, Number(o.width) || 160), 0) || 1;
    let cols = row.map((o) => Math.max(900, Math.round((Math.max(40, Number(o.width) || 160) / totalW) * PAGE_DXA)));
    cols[cols.length - 1] += PAGE_DXA - cols.reduce((a, b) => a + b, 0);

    const cells = [];
    for (let i = 0; i < row.length; i++) {
      const o = row[i];
      const paras = [];
      if (o.kind === "image") {
        const img = await srcToImageBytes(o.src, o.imageId).catch(() => null);
        if (img) {
          try {
            const W = Math.max(120, Math.min(480, Math.round(cols[i] * 0.0667)));
            const w0 = Number(o.width) || 320, h0 = Number(o.height) || 240;
            const H = Math.max(60, Math.min(360, Math.round((h0 / Math.max(1, w0)) * W)));
            paras.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ data: img.data, transformation: { width: W, height: H }, type: img.type })],
            }));
          } catch {}
        }
        const cap = boardTextOf(o);
        paras.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: cap ? cap.slice(0, 300) : "Ảnh minh họa", font: boardFont, size: 20, italics: true, color: "64748B" })],
        }));
      } else {
        const lines = boardTextOf(o).split("\n").slice(0, 30);
        const use = lines.length ? lines : [""];
        // bullets trong node cũng xuất ra Word (đánh số đếm riêng từng khối)
        const bstyle = normalizeBulletStyle(o.bullets);
        let bn = 0;
        use.forEach((ln) => {
          let t = String(ln).slice(0, 600) || " ";
          if (bstyle && t.trim()) { bn++; t = bulletPrefix(bstyle, bn) + stripBulletMark(t); }
          paras.push(new Paragraph({
            alignment: alignOf(o),
            children: runsOf(o, t),
          }));
        });
      }
      const strokeHex = hex6(o.stroke);
      const noBorder = !strokeHex || Number(o.strokeWidth) <= 0;
      const edge = noBorder
        ? { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
        : { style: borderStyleOf(o.strokeDash), size: borderSize(o.strokeWidth), color: strokeHex };
      const fill = hex6(o.fill);
      cells.push(new TableCell({
        width: { size: cols[i], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
        borders: { top: edge, bottom: edge, left: edge, right: edge },
        children: paras,
      }));
      exported++;
    }
    kids.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: cols,
      rows: [new TableRow({ children: cells })],
    }));
  }

  // Phụ lục liên kết sơ đồ (nếu có mindmap/connectors)
  const namedLinks = connectors
    .map((c) => {
      const a = byId.get(c.fromId), b = byId.get(c.toId);
      if (!a || !b) return null;
      const ta = boardTextOf(a).slice(0, 50), tb = boardTextOf(b).slice(0, 50);
      if (!ta || !tb) return null;
      return `“${ta}” → “${tb}”`;
    })
    .filter(Boolean)
    .slice(0, 60);
  if (namedLinks.length) {
    kids.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Sơ đồ liên kết", font: boardFont, size: 28, bold: true, color: "1D4ED8" })],
      spacing: { before: 320, after: 120 },
    }));
    namedLinks.forEach((s) => {
      kids.push(new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: s, font: boardFont, size: 22 })],
      }));
    });
  }

  if (!exported) throw new Error("Bảng trắng chưa có nội dung để xuất Word (nét vẽ tay không xuất được).");

  const doc = new Document({
    creator: "SGK App — Whiteboard",
    title: name,
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } } },
      children: kids,
    }],
  });
  const blob = await Packer.toBlob(doc);
  const safe = name.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 100) || "bang-trang";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch {} try { URL.revokeObjectURL(url); } catch {} }, 1500);
  return { blocks: exported, rows: rows.length, file: `${safe}.docx` };
}
