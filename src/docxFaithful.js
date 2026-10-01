// ── Docx → HTML giữ nguyên định dạng (faithful converter) ────────────────
// Dùng chung cho browser (Vite) và Node (server.js) — không phụ thuộc DOM.
// Giữ: font chữ + cỡ chữ (pt), màu chữ, highlight, đậm/nghiêng/gạch chân,
// lên/xuống chỉ số, căn lề, thụt lề, giãn dòng, headings, lists (bullets +
// numbering đa cấp), bảng (độ rộng, viền, màu nền ô, gộp ô, table style),
// ảnh inline + floating (kích thước gốc từ extent, alt), textbox (VML/DML),
// hyperlink, footnotes/endnotes, tabs, page-break, ký hiệu Symbol.
// Bỏ qua (có warnings): header/footer, comments, OLE objects, revision-deleted
// text (hiển thị như Word: chỉ text cuối).
import JSZip from "jszip";

// ══ XML parser tối giản (đủ cho OOXML do Word/LibreOffice sinh ra) ════════
function parseXml(src) {
  const root = { type: "el", name: "#root", attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const n = src.length;
  const cur = () => stack[stack.length - 1];
  const addText = (t) => {
    if (!t) return;
    const top = cur();
    const last = top.children[top.children.length - 1];
    if (last && last.type === "text") last.value += t;
    else top.children.push({ type: "text", value: t });
  };
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { addText(decodeEnt(src.slice(i))); break; }
    if (lt > i) addText(decodeEnt(src.slice(i, lt)));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      addText(end < 0 ? "" : src.slice(lt + 9, end));
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith("<?", lt) || src.startsWith("<!", lt)) {
      const end = src.indexOf(">", lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const gt = src.indexOf(">", lt + 1);
    if (gt < 0) break;
    let tag = src.slice(lt + 1, gt).trim();
    if (tag[0] === "/") {
      const name = local(tag.slice(1).trim().split(/\s+/)[0]);
      while (stack.length > 1 && cur().name !== name) stack.pop();
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }
    const selfClose = tag.endsWith("/");
    if (selfClose) tag = tag.slice(0, -1).trim();
    const m = tag.match(/^([^\s]+)/);
    const name = local(m ? m[1] : "x");
    const attrs = {};
    const attrRe = /([^\s=]+)\s*=\s*("[^"]*"|'[^']*')/g;
    let am;
    while ((am = attrRe.exec(tag))) attrs[local(am[1])] = decodeEnt(am[2].slice(1, -1));
    const el = { type: "el", name, attrs, children: [] };
    cur().children.push(el);
    if (!selfClose) stack.push(el);
    i = gt + 1;
  }
  return root;
}
function local(qname) {
  const s = String(qname || "");
  const c = s.indexOf(":");
  return c < 0 ? s : s.slice(c + 1);
}
function decodeEnt(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function rootEl(parsed) {
  const k = (parsed.children || []).filter((c) => c.type === "el");
  return k.length ? k[0] : { type: "el", name: "", attrs: {}, children: [] };
}
function kids(el, ...names) {
  if (!el || !el.children) return [];
  if (!names.length) return el.children.filter((c) => c.type === "el");
  const set = new Set(names);
  return el.children.filter((c) => c.type === "el" && set.has(c.name));
}
function first(el, ...names) {
  const k = kids(el, ...names);
  return k.length ? k[0] : null;
}
function findDeep(el, name) {
  if (!el || !el.children) return null;
  for (const ch of el.children) {
    if (ch.type !== "el") continue;
    if (ch.name === name) return ch;
    const f = findDeep(ch, name);
    if (f) return f;
  }
  return null;
}
function findAllDeep(el, name, acc = []) {
  if (!el || !el.children) return acc;
  for (const ch of el.children) {
    if (ch.type !== "el") continue;
    if (ch.name === name) acc.push(ch);
    findAllDeep(ch, name, acc);
  }
  return acc;
}
function resolveAlternate(el) {
  if (!el || el.name !== "AlternateContent") return el;
  return first(el, "Choice") || first(el, "Fallback") || el;
}

// ══ Đơn vị ═══════════════════════════════════════════════════════════════
const emuToPx = (v) => Math.round((Number(v) || 0) / 9525);
const dxaToPt = (v) => (Number(v) || 0) / 20;
const dxaToPx = (v) => Math.round(((Number(v) || 0) / 20) * (96 / 72));
const halfPtToPt = (v) => (Number(v) || 0) / 2;
const pct50ToPct = (v) => (Number(v) || 0) / 50;
function vmlLenToPx(s) {
  const m = String(s || "").trim().match(/^(-?[\d.]+)\s*(pt|in|cm|mm|px)?$/i);
  if (!m) return null;
  const v = Number(m[1]);
  const u = (m[2] || "px").toLowerCase();
  if (u === "pt") return Math.round((v * 96) / 72);
  if (u === "in") return Math.round(v * 96);
  if (u === "cm") return Math.round((v * 96) / 2.54);
  if (u === "mm") return Math.round((v * 96) / 25.4);
  return Math.round(v);
}
const trimNum = (v) => String(Math.round(Number(v) * 100) / 100);

const HIGHLIGHTS = {
  yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF",
  blue: "#0000FF", red: "#FF0000", darkBlue: "#000080", darkCyan: "#008080",
  darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0", black: "#000000",
};
// Symbol font: Greek + toán thông dụng (sách giáo khoa hay dùng)
const SYMBOL_GREEK = {
  A: "Α", B: "Β", G: "Γ", D: "Δ", E: "Ε", Z: "Ζ", H: "Η", Q: "Θ", I: "Ι", K: "Κ",
  L: "Λ", M: "Μ", N: "Ν", X: "Ξ", O: "Ο", P: "Π", R: "Ρ", S: "Σ", T: "Τ", U: "Υ",
  F: "Φ", C: "Χ", Y: "Ψ", W: "Ω", a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ",
  h: "η", q: "θ", i: "ι", k: "κ", l: "λ", m: "μ", n: "ν", x: "ξ", o: "ο", p: "π",
  r: "ρ", s: "σ", t: "τ", u: "υ", f: "φ", c: "χ", y: "ψ", w: "ω",
};
const SYMBOL_MISC = { 34: "∀", 36: "∃", 39: "∋", 40: "{", 41: "∅", 60: "≤", 62: "≥", 165: "•", 172: "¬", 176: "°", 180: "×", 183: "⋅", 184: "÷", 215: "Ø" };

// ══ Đọc rPr / pPr ════════════════════════════════════════════════════════
function readFonts(rPr) {
  if (!rPr) return null;
  const f = first(rPr, "rFonts");
  if (!f) return null;
  const a = f.attrs || {};
  return { ascii: a.ascii || null, hAnsi: a.hAnsi || null, eastAsia: a.eastAsia || null, cs: a.cs || null, asciiTheme: a.asciiTheme || null, hAnsiTheme: a.hAnsiTheme || null };
}
function themedFont(t, theme) {
  if (!t || !theme) return null;
  return /major/i.test(t) ? theme.major || null : theme.minor || null;
}
function pickFont(fonts, theme) {
  if (!fonts) return null;
  return fonts.ascii || fonts.hAnsi || themedFont(fonts.asciiTheme, theme) || themedFont(fonts.hAnsiTheme, theme) || fonts.eastAsia || fonts.cs || null;
}
function readRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  o.fonts = readFonts(rPr);
  const sz = first(rPr, "sz");
  if (sz && /^[0-9]+$/.test(sz.attrs.val || "")) o.sizePt = halfPtToPt(sz.attrs.val);
  const color = first(rPr, "color");
  if (color && color.attrs.val && !/^auto$/i.test(color.attrs.val)) o.color = "#" + String(color.attrs.val).toUpperCase();
  const hi = first(rPr, "highlight");
  if (hi && HIGHLIGHTS[hi.attrs.val]) o.highlight = HIGHLIGHTS[hi.attrs.val];
  if (first(rPr, "b")) o.bold = true;
  if (first(rPr, "i")) o.italic = true;
  const u = first(rPr, "u");
  if (u && (u.attrs.val || "single") !== "none") o.underline = u.attrs.val || "single";
  if (first(rPr, "strike") || first(rPr, "dstrike")) o.strike = true;
  const va = first(rPr, "vertAlign");
  if (va && /^(superscript|subscript)$/.test(va.attrs.val || "")) o.vertAlign = va.attrs.val;
  if (first(rPr, "caps")) o.caps = true;
  if (first(rPr, "smallCaps")) o.smallCaps = true;
  if (first(rPr, "vanish") || first(rPr, "webHidden")) o.hidden = true;
  const fill = shdFill(first(rPr, "shd"));
  if (fill) o.shading = fill;
  return o;
}
function shdFill(shd) {
  if (!shd) return null;
  const a = shd.attrs || {};
  if ((a.val || "clear") === "nil") return null;
  if (a.fill && !/^(auto|none)$/i.test(a.fill)) return "#" + String(a.fill).toUpperCase();
  return null;
}
function readPPr(pPr) {
  const o = {};
  if (!pPr) return o;
  const jc = first(pPr, "jc");
  if (jc && jc.attrs.val) o.align = jc.attrs.val;
  const ind = first(pPr, "ind");
  if (ind) {
    const a = ind.attrs || {};
    if (a.left != null) o.indentLeftDxa = Number(a.left) || 0;
    else if (a.start != null) o.indentLeftDxa = Number(a.start) || 0;
    if (a.hanging != null) o.hangingDxa = Number(a.hanging) || 0;
    if (a.firstLine != null) o.firstLineDxa = Number(a.firstLine) || 0;
  }
  const sp = first(pPr, "spacing");
  if (sp) {
    const a = sp.attrs || {};
    if (a.before != null) o.spaceBeforePt = dxaToPt(a.before);
    if (a.after != null) o.spaceAfterPt = dxaToPt(a.after);
    if (a.line != null) {
      const v = Number(a.line) || 0;
      if ((a.lineRule || "auto") === "auto") o.lineHeight = trimNum(v / 240);
      else if (v) o.lineHeightPt = dxaToPt(v);
    }
  }
  const fill = shdFill(first(pPr, "shd"));
  if (fill) o.shading = fill;
  const ol = first(pPr, "outlineLvl");
  if (ol && ol.attrs.val != null) o.outlineLvl = Number(ol.attrs.val);
  const numPr = first(pPr, "numPr");
  if (numPr) {
    const numId = first(numPr, "numId");
    const ilvl = first(numPr, "ilvl");
    if (numId) o.numId = numId.attrs.val;
    if (ilvl) o.ilvl = Number(ilvl.attrs.val) || 0;
  }
  const pStyle = first(pPr, "pStyle");
  if (pStyle) o.pStyle = pStyle.attrs.val || null;
  return o;
}
function readTblBorders(bordersEl) {
  const o = {};
  if (!bordersEl) return o;
  const styleMap = { single: "solid", thick: "solid", double: "double", dotted: "dotted", dashed: "dashed", threeDEmboss: "ridge", threeDEngrave: "groove", outset: "outset", inset: "inset" };
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
    const el = first(bordersEl, side);
    if (!el) continue;
    const a = el.attrs || {};
    const val = String(a.val || "single").toLowerCase();
    if (val === "nil" || val === "none") { o[side] = "none"; continue; }
    const style = styleMap[val] || "solid";
    const wPt = a.sz ? Math.max(0.5, (Number(a.sz) || 8) / 8) : 0.75;
    const color = a.color && !/^(auto|00000000)$/i.test(a.color) ? `#${a.color}` : "#000000";
    o[side] = `${trimNum(wPt)}pt ${style} ${color}`;
  }
  return o;
}
function bordersToCss(b) {
  const t = b.top, l = b.left, bo = b.bottom, r = b.right;
  if (t === "none" && l === "none" && bo === "none" && r === "none") return "";
  if (t && t === l && t === bo && t === r) return `border:${t}`;
  const parts = [];
  if (t) parts.push(`border-top:${t}`);
  if (l) parts.push(`border-left:${l}`);
  if (bo) parts.push(`border-bottom:${bo}`);
  if (r) parts.push(`border-right:${r}`);
  return parts.join(";");
}
function mapAlign(v) {
  if (!v) return null;
  const t = String(v).toLowerCase();
  if (t === "center") return "center";
  if (t === "right" || t === "end") return "right";
  if (t === "both" || t === "distribute" || t === "justify") return "justify";
  return "left";
}
function mergeRPr(base, over) {
  const o = { ...(base || {}) };
  if (!over) return o;
  for (const k of ["bold", "italic", "strike", "caps", "smallCaps", "hidden", "color", "highlight", "shading", "sizePt", "font", "vertAlign", "underline"]) {
    if (over[k] !== undefined && over[k] !== null && over[k] !== false) o[k] = over[k];
  }
  if (over.fonts) o.fonts = over.fonts;
  return o;
}

// ══ Converter chính ══════════════════════════════════════════════════════
export async function convertDocxToFaithfulHtml(input, opts = {}) {
  const warnings = [];
  const skipped = { n: 0 };
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const zip = await JSZip.loadAsync(buf);
  const readText = async (path) => {
    const f = zip.file(path);
    if (!f) return null;
    return f.async("string");
  };
  const docXml = await readText("word/document.xml");
  if (!docXml) throw new Error("Không tìm thấy word/document.xml (không phải file .docx hợp lệ).");
  const doc = parseXml(docXml);
  const body = first(rootEl(doc), "body");
  if (!body) throw new Error("File .docx không có nội dung.");

  // theme fonts
  const theme = { major: null, minor: null };
  try {
    const themeXml = await readText("word/theme/theme1.xml");
    if (themeXml) {
      const t = parseXml(themeXml);
      theme.major = first(findDeep(t, "majorFont"), "latin")?.attrs.typeface || null;
      theme.minor = first(findDeep(t, "minorFont"), "latin")?.attrs.typeface || null;
    }
  } catch { /* bỏ qua */ }

  // styles.xml
  const pStyles = new Map();
  const rStyles = new Map();
  const tableStyles = new Map();
  const docDefaults = { font: null, sizePt: null, color: null };
  try {
    const stylesXml = await readText("word/styles.xml");
    if (stylesXml) {
      const stylesEl = rootEl(parseXml(stylesXml));
      const dd = first(stylesEl, "docDefaults");
      if (dd) {
        const rpd = first(first(dd, "rPrDefault") || { children: [] }, "rPr");
        if (rpd) {
          const rr = readRPr(rpd);
          docDefaults.font = pickFont(rr.fonts, theme);
          docDefaults.sizePt = rr.sizePt || null;
          docDefaults.color = rr.color || null;
        }
      }
      for (const s of kids(stylesEl, "style")) {
        const a = s.attrs || {};
        const id = a.styleId;
        if (!id) continue;
        const basedOn = first(s, "basedOn")?.attrs.val || null;
        const entry = { id, type: a.type || null, basedOn, pPr: readPPr(first(s, "pPr")), rPr: readRPr(first(s, "rPr")) };
        if (a.type === "paragraph") pStyles.set(id, entry);
        else if (a.type === "character") rStyles.set(id, entry);
        else if (a.type === "table") {
          const tblPr = first(s, "tblPr");
          const ts = {
            id,
            borders: readTblBorders(tblPr && first(tblPr, "tblBorders")),
            wholeShd: shdFill(tblPr && first(tblPr, "shd")),
            firstRowShd: null, bandHShd: null,
          };
          for (const tsp of kids(s, "tblStylePr")) {
            const fill = shdFill(first(first(tsp, "tcPr") || { children: [] }, "shd"));
            if (tsp.attrs.type === "firstRow") ts.firstRowShd = fill;
            else if (tsp.attrs.type === "band1Horz" || tsp.attrs.type === "band1Vert") ts.bandHShd = fill;
          }
          tableStyles.set(id, ts);
        }
      }
    }
  } catch { warnings.push("Không đọc được styles.xml: dùng định dạng mặc định."); }

  const resolvePStyle = (id) => {
    const chain = [];
    let cur = id;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const s = pStyles.get(cur);
      if (!s) break;
      chain.unshift(s);
      cur = s.basedOn;
    }
    const pPr = {};
    const rPr = {};
    for (const s of chain) {
      Object.assign(pPr, s.pPr || {});
      Object.assign(rPr, s.rPr || {});
    }
    return { pPr, rPr };
  };
  const resolveRStyle = (id) => {
    const chain = [];
    let cur = id;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const s = rStyles.get(cur);
      if (!s) break;
      chain.unshift(s);
      cur = s.basedOn;
    }
    const rPr = {};
    for (const s of chain) Object.assign(rPr, s.rPr || {});
    return rPr;
  };

  // numbering.xml
  const nums = new Map();
  const abstracts = new Map();
  try {
    const numXml = await readText("word/numbering.xml");
    if (numXml) {
      const nxEl = rootEl(parseXml(numXml));
      for (const an of kids(nxEl, "abstractNum")) {
        const lvls = new Map();
        for (const lvl of kids(an, "lvl")) {
          lvls.set(Number(lvl.attrs.ilvl) || 0, {
            numFmt: first(lvl, "numFmt")?.attrs.val || "decimal",
            start: Number(first(lvl, "start")?.attrs.val) || 1,
          });
        }
        abstracts.set(String(an.attrs.abstractNumId), { levels: lvls });
      }
      for (const nm of kids(nxEl, "num")) {
        const overrides = new Map();
        for (const o of kids(nm, "lvlOverride")) {
          overrides.set(Number(o.attrs.ilvl) || 0, Number(first(o, "startOverride")?.attrs.val) || null);
        }
        nums.set(String(nm.attrs.numId), { abstract: first(nm, "abstractNumId")?.attrs.val ?? null, overrides });
      }
    }
  } catch { warnings.push("Không đọc được numbering.xml: danh sách đánh số hiển thị đơn giản."); }

  // rels
  const rels = new Map();
  try {
    const relsXml = await readText("word/_rels/document.xml.rels");
    if (relsXml) {
      for (const r of kids(rootEl(parseXml(relsXml)), "Relationship")) {
        rels.set(r.attrs.Id, { target: r.attrs.Target || "", type: r.attrs.Type || "" });
      }
    }
  } catch { /* bỏ qua */ }

  // footnotes / endnotes
  const notes = new Map();
  const loadNotes = async (part, type, tag) => {
    try {
      const xml = await readText(`word/${part}.xml`);
      if (!xml) return;
      for (const fn of kids(rootEl(parseXml(xml)), tag)) {
        const id = fn.attrs.id;
        if (id == null || Number(id) < 0) continue;
        notes.set(`${type}:${id}`, fn);
      }
    } catch { /* bỏ qua */ }
  };
  await loadNotes("footnotes", "footnote", "footnote");
  await loadNotes("endnotes", "endnote", "endnote");
  const usedNotes = [];

  // media
  const mediaCache = new Map();
  const loadMedia = async (target) => {
    const path = /^word\//i.test(target) ? target : `word/${String(target).replace(/^\/+/, "")}`;
    if (mediaCache.has(path)) return mediaCache.get(path);
    try {
      const f = zip.file(path);
      if (!f) return null;
      const b64 = await f.async("base64");
      const ext = (path.split(".").pop() || "").toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "bmp" ? "image/bmp" : ext === "webp" ? "image/webp" : "image/jpeg";
      const uri = `data:${mime};base64,${b64}`;
      mediaCache.set(path, uri);
      return uri;
    } catch { return null; }
  };

  const ctx = { imgCount: 0 };
  const baseRPrRoot = { font: docDefaults.font, sizePt: docDefaults.sizePt, color: docDefaults.color };

  // ── style builders ──
  const cssFontFam = (f) => (f ? `'${String(f).replace(/'/g, "")}',` : "");
  function runStyle(o) {
    const s = [];
    if (o.font) s.push(`font-family:${cssFontFam(o.font)}'Segoe UI','Be Vietnam Pro',Arial,sans-serif`);
    if (o.sizePt) s.push(`font-size:${trimNum(o.sizePt)}pt`);
    if (o.color) s.push(`color:${o.color}`);
    if (o.highlight) s.push(`background-color:${o.highlight}`);
    else if (o.shading) s.push(`background-color:${o.shading}`);
    if (o.bold) s.push("font-weight:bold");
    if (o.italic) s.push("font-style:italic");
    if (o.underline && o.underline !== "none") {
      const m = { double: "underline double", dotted: "underline dotted", dashed: "underline dashed", wave: "underline wavy", dash: "underline dashed", dotDash: "underline dashed" };
      s.push(`text-decoration:${m[o.underline] || "underline"}`);
    }
    if (o.strike) s.push("text-decoration:line-through");
    if (o.vertAlign === "superscript") s.push("vertical-align:super;font-size:smaller");
    if (o.vertAlign === "subscript") s.push("vertical-align:sub;font-size:smaller");
    if (o.caps) s.push("text-transform:uppercase");
    if (o.smallCaps) s.push("font-variant:small-caps");
    if (o.hidden) s.push("display:none");
    return s.join(";");
  }

  function symChar(font, hex) {
    const code = parseInt(String(hex || ""), 16);
    if (!Number.isFinite(code)) return null;
    if (/symbol/i.test(font || "")) {
      if (code >= 0xf041 && code <= 0xf077) {
        const g = SYMBOL_GREEK[String.fromCharCode(code - 0xf000)];
        if (g) return g;
      }
      if (SYMBOL_MISC[code] != null) return SYMBOL_MISC[code];
      return null;
    }
    if (/wingdings/i.test(font || "")) {
      const map = { 113: "☐", 82: "☑", 168: "◆", 216: "Ø" };
      if (map[code] != null) return map[code];
      return null;
    }
    if (code >= 32 && code <= 0xffff) return String.fromCharCode(code);
    return null;
  }

  function collectText(node) {
    let t = "";
    const rec = (n) => {
      if (!n) return;
      if (n.type === "text") { t += n.value; return; }
      if (n.name === "t") {
        t += (n.children || []).filter((c) => c.type === "text").map((c) => c.value).join("");
        return;
      }
      for (const c of n.children || []) rec(c);
    };
    rec(node);
    return t;
  }

  async function readDrawing(drawingEl) {
    let target = drawingEl.name === "AlternateContent" ? resolveAlternate(drawingEl) : drawingEl;
    let el = first(target, "inline") || first(target, "anchor");
    if (!el && target.name !== "inline" && target.name !== "anchor") {
      for (const ch of target.children || []) {
        if (ch.type !== "el") continue;
        el = first(ch, "inline") || first(ch, "anchor");
        if (el) break;
      }
    }
    if (!el && (target.name === "inline" || target.name === "anchor")) el = target;
    if (!el) return null;
    const extent = first(el, "extent");
    let w = extent ? emuToPx(extent.attrs.cx) : null;
    let h = extent ? emuToPx(extent.attrs.cy) : null;
    const docPr = first(el, "docPr");
    const alt = docPr?.attrs.descr || docPr?.attrs.name || "";
    const blip = findDeep(first(el, "graphic") || { children: [] }, "blip");
    const embed = blip?.attrs.embed;
    if (!embed || !rels.get(embed)) return null;
    const uri = await loadMedia(rels.get(embed).target);
    if (!uri) { warnings.push("Thiếu file ảnh nhúng trong .docx."); return null; }
    if (uri.length > (opts.imageMaxChars || 3500000)) {
      warnings.push("Ảnh quá lớn nên được thay bằng chú thích để giữ sách nhẹ.");
      return `<span style="color:#94a3b8;font-style:italic">[Ảnh minh họa${alt ? `: ${escapeHtml(alt)}` : ""}]</span>`;
    }
    if (w && w > 700) { h = h ? Math.round((h * 700) / w) : null; w = 700; }
    ctx.imgCount++;
    const size = w ? `width:${w}px;${h ? `height:${h}px;` : "height:auto;"}` : "";
    return `<img src="${uri}" alt="${escapeHtml(alt)}" style="${size}display:inline-block;vertical-align:middle;max-width:100%;height:auto;">`;
  }

  async function readPict(pictEl, baseRPr) {
    let out = "";
    for (const sh of findAllDeep(pictEl, "shape")) {
      const style = sh.attrs.style || "";
      let w = vmlLenToPx(/width\s*:\s*([^;]+)/i.exec(style)?.[1]);
      let h = vmlLenToPx(/height\s*:\s*([^;]+)/i.exec(style)?.[1]);
      const fill = sh.attrs.fillcolor || null;
      const imagedata = first(sh, "imagedata");
      const txbx = findDeep(sh, "txbxContent");
      if (imagedata?.attrs.id && rels.get(imagedata.attrs.id)) {
        const uri = await loadMedia(rels.get(imagedata.attrs.id).target);
        if (uri) {
          ctx.imgCount++;
          if (w && w > 700) { h = h ? Math.round((h * 700) / w) : null; w = 700; }
          const size = w ? `width:${w}px;${h ? `height:${h}px;` : "height:auto;"}` : "";
          const alt = imagedata.attrs.title || sh.attrs.title || "";
          out += `<img src="${uri}" alt="${escapeHtml(alt)}" style="${size}display:inline-block;vertical-align:middle;max-width:100%;height:auto;">`;
          continue;
        }
      }
      if (txbx) {
        const inner = await renderBlocks(kids(txbx, "p", "tbl"), baseRPr);
        const bg = fill && !/^(none|transparent)$/i.test(fill) ? `background-color:${fill};` : "background-color:#F8FAFC;";
        out += `<div class="docx-textbox" style="${bg}border:1px solid #94A3B8;border-radius:6px;padding:10px 14px;margin:10px 0;">${inner}</div>`;
      }
    }
    for (const wpsTx of findAllDeep(pictEl, "txbx")) {
      const content = first(wpsTx, "txbxContent");
      if (!content) continue;
      const inner = await renderBlocks(kids(content, "p", "tbl"), baseRPr);
      if (inner.trim()) out += `<div class="docx-textbox" style="background-color:#F8FAFC;border:1px solid #94A3B8;border-radius:6px;padding:10px 14px;margin:10px 0;">${inner}</div>`;
    }
    const directTx = first(pictEl, "txbxContent");
    if (directTx && !findAllDeep(pictEl, "shape").length) {
      const inner = await renderBlocks(kids(directTx, "p", "tbl"), baseRPr);
      if (inner.trim()) out += `<div class="docx-textbox" style="background-color:#F8FAFC;border:1px solid #94A3B8;border-radius:6px;padding:10px 14px;margin:10px 0;">${inner}</div>`;
    }
    return out || null;
  }

  // render inline children (dùng cho hyperlink / fldSimple)
  async function renderInlineKids(node, rPr) {
    const fake = { type: "el", name: "_frag", attrs: {}, children: node.children || [] };
    return renderRuns(fake, rPr);
  }

  async function renderRuns(pEl, baseRPr) {
    let out = "";
    // field HYPERLINK/PAGEREF dạng fldChar (begin/instr/separate/end) có thể nằm rải rác nhiều run
    let field = null;
    const emitRun = (text, rPr) => {
      if (text == null || text === "") return;
      if (field?.skip) return;
      const st = runStyle(rPr);
      const frag = st ? `<span style="${escapeHtml(st)}">${escapeHtml(text)}</span>` : escapeHtml(text);
      if (field?.linkHref) field.linkBuf += frag;
      else out += frag;
    };
    const parseFieldInstr = (instr) => {
      const m = instr.match(/HYPERLINK\s+"([^"]+)"/i) || instr.match(/HYPERLINK\s+(\S+)/i);
      if (m) return { href: m[1] };
      if (/PAGEREF/i.test(instr)) return { skip: true };
      return {};
    };
    const walk = async (node, curRPr) => {
      if (!node || node.type !== "el") return;
      if (node.name === "pPr" || node.name === "rPr") return;
      if (node.name === "r") {
        const rPrEl = first(node, "rPr");
        const direct = readRPr(rPrEl);
        const rsId = first(rPrEl || { children: [] }, "rStyle")?.attrs.val;
        const styled = rsId ? resolveRStyle(rsId) : {};
        const eff = mergeRPr(mergeRPr({ ...curRPr }, styled), direct);
        eff.font = pickFont(direct.fonts, theme) || pickFont(styled.fonts, theme) || curRPr.font || null;
        for (const ch of node.children || []) await walkInline(ch, eff);
        return;
      }
      if (node.name === "hyperlink") {
        const rid = node.attrs.id;
        let href = null;
        if (rid && rels.get(rid)) href = rels.get(rid).target;
        else if (node.attrs.anchor) href = `#${node.attrs.anchor}`;
        const inner = await renderInlineKids(node, curRPr);
        out += href ? `<a href="${escapeHtml(href)}" style="color:#0563C1;text-decoration:underline">${inner}</a>` : inner;
        return;
      }
      if (node.name === "fldSimple") {
        const instr = node.attrs.instr || "";
        const m = instr.match(/HYPERLINK\s+"([^"]+)"/i) || instr.match(/HYPERLINK\s+(\S+)/i);
        if (m) {
          const inner = await renderInlineKids(node, curRPr);
          out += `<a href="${escapeHtml(m[1])}" style="color:#0563C1;text-decoration:underline">${inner}</a>`;
        } else if (!/PAGEREF/i.test(instr)) {
          out += await renderInlineKids(node, curRPr);
        }
        return;
      }
      if (node.name === "ins" || node.name === "moveTo") {
        for (const ch of node.children || []) await walk(ch, curRPr);
        return;
      }
      if (node.name === "del" || node.name === "moveFrom" || node.name === "delText") return;
      if (node.name === "bookmarkStart" || node.name === "bookmarkEnd" || node.name === "proofErr"
        || node.name === "permStart" || node.name === "permEnd"
        || node.name === "commentRangeStart" || node.name === "commentRangeEnd") return;
      if (node.name === "AlternateContent") {
        const alt = resolveAlternate(node);
        for (const ch of alt.children || []) await walk(ch, curRPr);
        return;
      }
      if (node.name === "sdt") {
        const content = first(node, "sdtContent");
        if (content) for (const ch of content.children || []) await walk(ch, curRPr);
        return;
      }
      if (node.name === "oMath" || node.name === "oMathPara") {
        const t = collectText(node);
        if (t.trim()) emitRun(t, curRPr);
        else skipped.n++;
        return;
      }
      for (const ch of node.children || []) await walk(ch, curRPr);
    };
    const walkInline = async (node, eff) => {
      if (!node || node.type !== "el") return;
      switch (node.name) {
        case "t": {
          const keep = node.attrs.space === "preserve";
          let v = (node.children || []).filter((c) => c.type === "text").map((c) => c.value).join("");
          if (!keep) v = v.replace(/\s+/g, " ");
          emitRun(v, eff);
          return;
        }
        case "tab":
          out += `<span style="display:inline-block;width:2em"></span>`;
          return;
        case "br": {
          const t = node.attrs.type;
          if (t === "page" || t === "column") out += `<hr class="docx-pagebreak" style="border:none;border-top:2px dashed #94a3b8;margin:14px 0">`;
          else out += "<br>";
          return;
        }
        case "cr": out += "<br>"; return;
        case "noBreakHyphen": out += "&#8209;"; return;
        case "sym": {
          const ch = symChar(node.attrs.font, node.attrs.char);
          if (ch) emitRun(ch, eff);
          else skipped.n++;
          return;
        }
        case "drawing": {
          const img = await readDrawing(node);
          if (img) out += img;
          return;
        }
        case "pict": {
          const html = await readPict(node, eff);
          if (html) out += html;
          return;
        }
        case "footnoteReference":
        case "endnoteReference": {
          const type = node.name === "footnoteReference" ? "footnote" : "endnote";
          const id = node.attrs.id;
          if (id != null) {
            const num = usedNotes.length + 1;
            usedNotes.push({ key: `${type}:${id}`, num });
            out += `<sup style="color:#0563C1"> [${num}] </sup>`;
          }
          return;
        }
        case "commentReference": case "delText": case "delInstrText":
        case "rPr":
          return;
        case "fldChar": {
          const t = node.attrs.fldCharType;
          if (t === "begin") {
            if (field) field.depth = (field.depth || 0) + 1;
            else field = { instr: "", separated: false, linkHref: null, linkBuf: "", skip: false, depth: 0 };
          } else if (t === "separate") {
            if (field && !field.separated) {
              field.separated = true;
              const p = parseFieldInstr(field.instr || "");
              if (p.href) { field.linkHref = p.href; field.linkBuf = ""; }
              else if (p.skip) field.skip = true;
            }
          } else if (t === "end") {
            if (field && field.depth > 0) field.depth--;
            else if (field) {
              if (field.linkHref) out += `<a href="${escapeHtml(field.linkHref)}" style="color:#0563C1;text-decoration:underline">${field.linkBuf}</a>`;
              field = null;
            }
          }
          return;
        }
        case "instrText": {
          if (field && !field.separated) field.instr += (node.children || []).filter((c) => c.type === "text").map((c) => c.value).join("");
          return;
        }
        default:
          for (const ch of node.children || []) {
            if (ch.type === "text") emitRun(ch.value, eff);
            else await walkInline(ch, eff);
          }
      }
    };
    for (const ch of pEl.children || []) {
      if (ch.type !== "el") continue;
      if (ch.name === "pPr") continue;
      await walk(ch, baseRPr);
    }
    return out;
  }

  function levelInfo(numId, ilvl) {
    let lvl = { numFmt: "decimal", start: 1 };
    const entry = nums.get(String(numId));
    if (entry) {
      const abs = abstracts.get(String(entry.abstract));
      if (abs) {
        const l = abs.levels.get(ilvl) || abs.levels.get(0);
        if (l) lvl = { numFmt: l.numFmt, start: l.start };
      }
      const ov = entry.overrides.get(ilvl);
      if (ov) lvl.start = ov;
    }
    return { ...lvl, ordered: !/^(bullet|checkbox|picture)$/i.test(lvl.numFmt || "") };
  }

  function stripOuterPTag(html) {
    return String(html || "").replace(/^<(p|h[1-6])[^>]*>/i, "").replace(/<\/(p|h[1-6])>$/i, "");
  }

  function buildList(items) {
    let html = "";
    const stack = [];
    const openFor = (lvl) => {
      if (lvl.ordered) {
        const st = lvl.start && lvl.start !== 1 ? ` start="${lvl.start}"` : "";
        const t = { upperletter: "upper-alpha", lowerletter: "lower-alpha", upperroman: "upper-roman", lowerroman: "lower-roman", decimalzero: "decimal-leading-zero" }[String(lvl.numFmt || "").toLowerCase()] || "decimal";
        return `<ol${st} style="margin:4px 0;padding-left:1.8em;list-style-type:${t}">`;
      }
      return `<ul style="margin:4px 0;padding-left:1.8em;list-style-type:disc">`;
    };
    const closeTop = () => {
      const t = stack.pop();
      html += t.ordered ? "</ol>" : "</ul>";
    };
    for (const it of items) {
      const key = String(it.num.numId);
      const L = it.num.ilvl || 0;
      while (stack.length && (stack[stack.length - 1].ilvl > L || stack[stack.length - 1].numId !== key)) closeTop();
      if (!stack.length || stack[stack.length - 1].ilvl < L || stack[stack.length - 1].ordered !== it.lvl.ordered) {
        let from = stack.length ? stack[stack.length - 1].ilvl + 1 : 0;
        if (from > L) from = L;
        for (let l = from; l <= L; l++) {
          html += openFor(it.lvl);
          stack.push({ numId: key, ilvl: l, ordered: it.lvl.ordered });
        }
      }
      html += `<li>${stripOuterPTag(it.html)}</li>`;
    }
    while (stack.length) closeTop();
    return html;
  }

  async function renderParagraph(pEl, inBox) {
    const info = readPPr(first(pEl, "pPr"));
    const styleId = info.pStyle || null;
    const resolved = styleId ? resolvePStyle(styleId) : { pPr: {}, rPr: {} };
    if (info.numId == null && resolved.pPr.numId != null) {
      info.numId = resolved.pPr.numId;
      info.ilvl = resolved.pPr.ilvl ?? 0;
    }
    const effP = { ...resolved.pPr, ...info };
    // font style (vd Heading1) thắng docDefaults — mergeRPr không tự resolve tên font
    const styleFont = pickFont(resolved.rPr.fonts, theme);
    const baseRPr = mergeRPr({ ...baseRPrRoot }, resolved.rPr || {});
    baseRPr.font = styleFont || baseRPrRoot.font || null;
    const inner = await renderRuns(pEl, baseRPr);
    if (!inner.trim() && !/<img|docx-textbox|docx-pagebreak/.test(inner)) {
      const sp = effP.spaceAfterPt != null ? `margin:0 0 ${trimNum(effP.spaceAfterPt)}pt;` : "margin:0;";
      return { kind: "para", html: `<p style="${sp}min-height:1em;">&nbsp;</p>`, num: null };
    }
    const st = [];
    const align = mapAlign(effP.align);
    if (align && align !== "left") st.push(`text-align:${align}`);
    if (effP.indentLeftDxa) st.push(`margin-left:${trimNum(dxaToPt(effP.indentLeftDxa))}pt`);
    if (effP.hangingDxa) {
      st.push(`text-indent:-${trimNum(dxaToPt(effP.hangingDxa))}pt`);
      st.push(`padding-left:${trimNum(dxaToPt(effP.hangingDxa))}pt`);
    } else if (effP.firstLineDxa) st.push(`text-indent:${trimNum(dxaToPt(effP.firstLineDxa))}pt`);
    if (effP.spaceBeforePt) st.push(`margin-top:${trimNum(effP.spaceBeforePt)}pt`);
    if (effP.spaceAfterPt != null) st.push(`margin-bottom:${trimNum(effP.spaceAfterPt)}pt`);
    if (effP.lineHeight) st.push(`line-height:${effP.lineHeight}`);
    else if (effP.lineHeightPt) st.push(`line-height:${trimNum(effP.lineHeightPt)}pt`);
    if (effP.shading) st.push(`background-color:${effP.shading}`);
    const styleAttr = st.length ? ` style="${st.join(";")}"` : "";

    let tag = "p";
    const hm = styleId ? /^Heading([1-9])$/.exec(styleId) : null;
    if (hm) tag = `h${Math.min(6, Number(hm[1]))}`;
    else if (styleId === "Title") tag = "h1";
    else if (styleId === "Subtitle") tag = "h2";
    else if (effP.outlineLvl != null && effP.outlineLvl <= 2) tag = `h${effP.outlineLvl + 1}`;

    const num = effP.numId != null ? { numId: effP.numId, ilvl: effP.ilvl || 0 } : null;
    const item = { kind: "para", html: `<${tag}${styleAttr}>${inner}</${tag}>`, num, tag };
    if (num) item.lvl = levelInfo(num.numId, num.ilvl);
    void inBox;
    return item;
  }

  async function renderTableClean(tblEl) {
    const tblPr = first(tblEl, "tblPr") || { children: [], attrs: {} };
    const tStyle = tableStyles.get(first(tblPr, "tblStyle")?.attrs.val || "") || null;
    const tblW = first(tblPr, "tblW");
    const tblBorders = readTblBorders(first(tblPr, "tblBorders"));
    if (tStyle?.borders) for (const k of Object.keys(tStyle.borders)) tblBorders[k] = tblBorders[k] || tStyle.borders[k];
    const tblLook = first(tblPr, "tblLook")?.attrs || {};
    const firstRow = tblLook.firstRow !== "0";
    const bandHorz = tblLook.noHBand !== "1";

    const tst = [];
    const wtype = tblW?.attrs.type;
    if (wtype === "pct") tst.push(`width:${trimNum(Math.min(100, pct50ToPct(tblW.attrs.w)))}%`);
    else if (wtype === "dxa" && tblW.attrs.w !== "0") tst.push(`width:${dxaToPx(tblW.attrs.w)}px`);
    else tst.push("width:100%");
    const tAlign = mapAlign(first(tblPr, "jc")?.attrs.val);
    if (tAlign === "center") tst.push("margin-left:auto;margin-right:auto");
    else if (tAlign === "right") tst.push("margin-left:auto");
    if (tStyle?.wholeShd) tst.push(`background-color:${tStyle.wholeShd}`);

    const grid = kids(first(tblEl, "tblGrid") || { children: [] }, "gridCol").map((g) => dxaToPx(g.attrs.w));
    // pass 1: parse
    const matrix = [];
    for (const tr of kids(tblEl, "tr")) {
      const row = [];
      for (const tc of kids(tr, "tc")) {
        const tcPr = first(tc, "tcPr") || { children: [], attrs: [] };
        const tcW = first(tcPr, "tcW");
        const gridSpan = Math.max(1, Number(first(tcPr, "gridSpan")?.attrs.val) || 1);
        const vmEl = first(tcPr, "vMerge");
        const vMerge = vmEl ? vmEl.attrs.val || "continue" : null;
        const inner = await renderBlocks(kids(tc, "p", "tbl", "sdt"));
        row.push({
          tcW, gridSpan, vMerge,
          vAlign: first(tcPr, "vAlign")?.attrs.val || null,
          shd: shdFill(first(tcPr, "shd")),
          cellBorders: readTblBorders(first(tcPr, "tcBorders")),
          inner,
        });
      }
      matrix.push(row);
    }
    // pass 2: layout (vMerge continue gộp vào ô restart phía trên)
    const laid = []; // per row: [{d, col, owner}]
    const owners = new Map();
    for (let ri = 0; ri < matrix.length; ri++) {
      let col = 0;
      const outRow = [];
      for (const d of matrix[ri]) {
        if (d.vMerge === "continue") {
          const o = owners.get(col);
          if (o) {
            o.rowspan++;
            if (d.inner.trim()) o.extra += d.inner;
          } else skipped.n++;
          col += d.gridSpan;
          continue;
        }
        owners.delete(col);
        let owner = null;
        if (d.vMerge === "restart") {
          owner = { rowspan: 1, extra: "" };
          owners.set(col, owner);
        }
        outRow.push({ d, col, ri, owner });
        col += d.gridSpan;
      }
      laid.push(outRow);
      if (ri + 1 < matrix.length) {
        const nextCols = new Set();
        let nc = 0;
        for (const c of matrix[ri + 1]) {
          if (c.vMerge === "continue") nextCols.add(nc);
          nc += c.gridSpan;
        }
        for (const k of [...owners.keys()]) if (!nextCols.has(k)) owners.delete(k);
      }
    }
    // pass 3: emit
    let out = "";
    for (const outRow of laid) {
      let rowHtml = "";
      for (const { d, col, ri, owner } of outRow) {
        const cst = [];
        if (d.tcW) {
          if (d.tcW.attrs.type === "dxa" && d.tcW.attrs.w !== "0") cst.push(`width:${dxaToPx(d.tcW.attrs.w)}px`);
          else if (d.tcW.attrs.type === "pct") cst.push(`width:${trimNum(Math.min(100, pct50ToPct(d.tcW.attrs.w)))}%`);
        } else if (grid.length) {
          let gw = 0;
          for (let g = col; g < col + d.gridSpan && g < grid.length; g++) gw += grid[g] || 0;
          if (gw) cst.push(`width:${gw}px`);
        }
        cst.push(d.vAlign === "center" ? "vertical-align:middle" : d.vAlign === "bottom" ? "vertical-align:bottom" : "vertical-align:top");
        let bg = d.shd;
        if (!bg && ri === 0 && firstRow && tStyle?.firstRowShd) bg = tStyle.firstRowShd;
        if (!bg && bandHorz && tStyle?.bandHShd && ri % 2 === 1) bg = tStyle.bandHShd;
        if (!bg && tStyle?.wholeShd) bg = tStyle.wholeShd;
        if (bg) cst.push(`background-color:${bg}`);
        const eff = {};
        for (const side of ["top", "left", "bottom", "right"]) eff[side] = d.cellBorders[side] || tblBorders[side] || null;
        cst.push(bordersToCss(eff) || "border:none");
        if (ri === 0 && firstRow && !bg) cst.push("font-weight:bold");
        const colspan = d.gridSpan > 1 ? ` colspan="${d.gridSpan}"` : "";
        const rowspan = owner && owner.rowspan > 1 ? ` rowspan="${owner.rowspan}"` : "";
        const extra = owner ? owner.extra : "";
        rowHtml += `<td${colspan}${rowspan} style="${cst.join(";")}">${d.inner}${extra}</td>`;
      }
      out += `<tr>${rowHtml}</tr>`;
    }
    return `<table style="${tst.join(";")}"><tbody>${out}</tbody></table>`;
  }

  async function renderBlocks(nodes) {
    const parts = [];
    let listBuf = [];
    const flushList = () => {
      if (!listBuf.length) return;
      parts.push(buildList(listBuf));
      listBuf = [];
    };
    for (const node of nodes || []) {
      if (!node || node.type !== "el") continue;
      const n = node.name === "AlternateContent" ? resolveAlternate(node) : node;
      if (n.name === "p") {
        const b = await renderParagraph(n);
        if (b.num) listBuf.push(b);
        else { flushList(); parts.push(b.html); }
      } else if (n.name === "tbl") {
        flushList();
        parts.push(await renderTableClean(n));
      } else if (n.name === "sdt") {
        const content = first(n, "sdtContent");
        if (content) {
          flushList();
          parts.push(await renderBlocks(content.children || []));
        }
      } else if (n.name === "sectPr" || n.name === "bookmarkStart" || n.name === "bookmarkEnd") {
        continue;
      } else {
        skipped.n++;
      }
    }
    flushList();
    return parts.join("\n");
  }

  // ── main ──
  const main = await renderBlocks(kids(body, "p", "tbl", "sdt"));

  let notesHtml = "";
  if (usedNotes.length) {
    const items = [];
    for (const u of usedNotes) {
      const src = notes.get(u.key);
      const noteBody = src ? await renderBlocks(kids(src, "p", "tbl")) : "";
      items.push(`<li id="docx-note-${u.num}" style="font-size:0.85em;color:#334155">${noteBody || ""}</li>`);
    }
    if (items.length) notesHtml = `<div class="docx-notes" style="margin-top:16px;border-top:1px solid #CBD5E1;padding-top:8px"><ol style="padding-left:1.6em;margin:4px 0">${items.join("")}</ol></div>`;
  }

  const rootSt = [];
  if (docDefaults.font) rootSt.push(`font-family:'${docDefaults.font}','Segoe UI','Be Vietnam Pro',Arial,sans-serif`);
  if (docDefaults.sizePt) rootSt.push(`font-size:${trimNum(docDefaults.sizePt)}pt`);
  if (docDefaults.color) rootSt.push(`color:${docDefaults.color}`);
  const html = `<div class="docx-import"${rootSt.length ? ` style="${rootSt.join(";")}"` : ""}>\n${main}\n${notesHtml}\n</div>`;
  if (skipped.n) warnings.push(`Đã bỏ qua ${skipped.n} thành phần Word không hỗ trợ (giữ lại toàn bộ văn bản).`);
  return { html, warnings };
}
