// ─── Export manager: PNG / JPG / SVG / PDF / JSON ───
// Không thêm dependency. PDF dùng cửa sổ in (ảnh PNG độ phân giải cao, fit trang).

// ─── Export manager: PNG / JPG / SVG / PDF / JSON ───
// Không thêm dependency. PDF dùng cửa sổ in (ảnh PNG độ phân giải cao, fit trang).

// webfont (Google Fonts) vào SVG để file tải về giữ đúng font đang hiển thị
// (SVG nạp qua <img>/blob là document biệt lập, không thấy font của trang).

import { effectiveBoardFont, WB_DEFAULT_FONT_STACK } from "./whiteboardFonts.js";

export function boardBounds(objects, connectors = null, pad = 60) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  (Array.isArray(objects) ? objects : []).forEach((o) => {
    if (!o) return;
    if (o.kind === "stroke" && Array.isArray(o.points) && o.points.length) {
      o.points.forEach((p) => {
        minX = Math.min(minX, o.x + p.x); minY = Math.min(minY, o.y + p.y);
        maxX = Math.max(maxX, o.x + p.x); maxY = Math.max(maxY, o.y + p.y);
      });
    } else {
      minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + (o.width || 0)); maxY = Math.max(maxY, o.y + (o.height || 0));
    }
  });
  // L12: elbow midpoint / control cong + đầu mũi tên có thể lòi ngoài node → nới thêm
  try {
    const list = Array.isArray(connectors) ? connectors : null;
    if (list && list.some((c) => c && (c.type === "elbow" || c.type === "curve"))) {
      minX -= 30; minY -= 30; maxX += 30; maxY += 30;
    }
  } catch {}
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1200, h: 800 };
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeFileName(name, fallback = "bang-trang") {
  const s = String(name || fallback).trim() || fallback;
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || fallback
  );
}

// P0: board 5000px * zoom2 * scale2 = canvas 20000px → OOM. Cap kích thước raster.
const MAX_RASTER_DIM = 4096;
function capRasterSize(w, h) {
  const m = Math.max(w, h);
  if (m <= MAX_RASTER_DIM) return { w, h };
  const k = MAX_RASTER_DIM / m;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// P0: JSON export phải strip blob: URL ephemeral (chết sau reload) — chỉ giữ imageId + data: URL
// (dùng chung cho snapshot phiên bản để khỏi phình storage)
export function stripBoardForExport(board) {
  try {
    const copy = JSON.parse(JSON.stringify(board));
    if (Array.isArray(copy.objects)) {
      for (const o of copy.objects) {
        if (o && typeof o.src === "string" && o.src.startsWith("blob:")) o.src = null;
      }
    }
    return copy;
  } catch {
    return board;
  }
}

// P0: inline <image> blob:/objectURL thành dataURL trước khi serialize để PNG/PDF không bị trắng
// khi URL đã revoke hoặc khi SVG load qua blob URL riêng (không cùng document).
async function inlineCloneImages(clone) {
  try {
    const imgs = clone.querySelectorAll ? [...clone.querySelectorAll("image")] : [];
    if (!imgs.length) return;
    const jobs = imgs.map(async (el) => {
      const href = el.getAttribute("href") || el.getAttribute("xlink:href");
      if (!href || href.startsWith("data:")) return;
      if (!href.startsWith("blob:")) return;
      try {
        const res = await fetch(href);
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ""));
          r.onerror = () => reject(r.error || new Error("read failed"));
          r.readAsDataURL(blob);
        });
        if (dataUrl && dataUrl.startsWith("data:")) {
          el.setAttribute("href", dataUrl);
          try { el.setAttribute("xlink:href", dataUrl); } catch {}
        }
      } catch {}
    });
    await Promise.all(jobs);
  } catch {}
}

function download(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── Giữ đúng font khi xuất file ──
// SVG serialize rồi nạp qua blob URL là document biệt lập: không kế thừa CSS trang
// và không thấy webfont đã nạp. Nên: (1) bảo đảm mọi <text> có font-family,
// (2) nhúng @font-face (woff2 → data URL) của các font bảng đang dùng vào clone.
const FONT_CSS_PARAMS = {
  "Quicksand": "Quicksand:wght@400;500;600;700",
  "Be Vietnam Pro": "Be+Vietnam+Pro:wght@400;500;600;700",
  "Mulish": "Mulish:wght@400;500;600;700",
  "Andika": "Andika:wght@400;700",
  "Noto Serif": "Noto+Serif:wght@400;600;700",
};
const _fontFaceCache = new Map(); // key families -> css text (đã inline data URL)

function usedWebFamilies(board) {
  const stacks = new Set();
  try {
    if (board && typeof board.defaultFontFamily === "string" && board.defaultFontFamily.trim()) {
      stacks.add(board.defaultFontFamily);
    }
    for (const o of (board?.objects || [])) {
      if (o && typeof o.fontFamily === "string" && o.fontFamily.trim()) stacks.add(o.fontFamily);
    }
    stacks.add(WB_DEFAULT_FONT_STACK);
  } catch {}
  const haystack = [...stacks].join("\n");
  return Object.keys(FONT_CSS_PARAMS).filter((fam) => haystack.includes(fam));
}

function fetchBlobAsDataUrl(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`font fetch ${res.status}`);
    return res.blob();
  }).then((blob) => new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error || new Error("read failed"));
      r.readAsDataURL(blob);
    } catch (e) { reject(e); }
  }));
}

async function buildEmbeddedFontCss(families) {
  const key = [...families].sort().join("|");
  if (_fontFaceCache.has(key)) return _fontFaceCache.get(key);
  const params = families.map((f) => `family=${FONT_CSS_PARAMS[f]}`).join("&");
  const cssUrl = `https://fonts.googleapis.com/css2?${params}&display=swap`;
  const cssRes = await fetch(cssUrl);
  if (!cssRes.ok) throw new Error(`font css ${cssRes.status}`);
  let css = await cssRes.text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))].slice(0, 40);
  await Promise.all(urls.map(async (u) => {
    try {
      const dataUrl = await fetchBlobAsDataUrl(u);
      if (dataUrl && dataUrl.startsWith("data:")) css = css.split(u).join(dataUrl);
    } catch {}
  }));
  _fontFaceCache.set(key, css);
  return css;
}

async function prepareCloneFonts(clone, board) {
  const fallback = effectiveBoardFont(board);
  try {
    clone.setAttribute("font-family", fallback);
    const texts = clone.querySelectorAll ? [...clone.querySelectorAll("text")] : [];
    texts.forEach((t) => {
      try { if (!t.getAttribute("font-family")) t.setAttribute("font-family", fallback); } catch {}
    });
  } catch {}
  // Chờ webfont của trang nạp xong (kẻo đo/chụp khi font còn swap) — best effort.
  try {
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {}
  // Nhúng @font-face để SVG biệt lập vẫn vẽ đúng font — offline/CSP chặn thì bỏ qua,
  // stack fallback hệ thống trong font-family vẫn giữ chữ Việt đọc được.
  try {
    const families = usedWebFamilies(board);
    if (!families.length) return;
    const css = await Promise.race([
      buildEmbeddedFontCss(families),
      new Promise((_, reject) => setTimeout(() => reject(new Error("font timeout")), 10000)),
    ]);
    if (css && css.includes("@font-face")) {
      const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleEl.textContent = css;
      clone.insertBefore(styleEl, clone.firstChild);
    }
  } catch {}
}

function serializeEl(node) {
  return new XMLSerializer().serializeToString(node);
}

function serializeNode(svgNode) {
  const clone = svgNode.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

// view = {zoom, pan:{x,y}, w, h} (kích thước viewport px hiện tại)
function cloneWithViewBox(svgEl, view, scope, objects, connectors = null) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  let vx = 0, vy = 0, vw = view.w, vh = view.h;
  if (scope === "content") {
    const bb = boardBounds(objects || [], connectors || null);
    vx = bb.x * view.zoom + view.pan.x;
    vy = bb.y * view.zoom + view.pan.y;
    vw = Math.max(50, bb.w * view.zoom);
    vh = Math.max(50, bb.h * view.zoom);
  }
  clone.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  clone.setAttribute("width", String(Math.round(vw)));
  clone.setAttribute("height", String(Math.round(vh)));
  return { clone, vw, vh };
}

function svgToCanvas(svgStr, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export async function exportSVG(board, svgEl, scope = "all", view = null) {
  try {
    let str;
    if (scope === "content" && view) {
      const { clone } = cloneWithViewBox(svgEl, view, "content", board.objects, board.connectors);
      await prepareCloneFonts(clone, board);
      // đảm bảo nền trắng cho SVG content
      const vb = clone.getAttribute("viewBox").split(" ");
      str = serializeNode(clone);
      str = str.replace(/<svg[^>]*>/, (m) => `${m}<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>`);
    } else {
      const solo = svgEl.cloneNode(true);
      solo.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      await prepareCloneFonts(solo, board);
      str = new XMLSerializer().serializeToString(solo);
    }
    const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    download(url, `${safeFileName(board.name)}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    console.error("SVG export failed:", e);
    return false;
  }
}

export function exportJSON(board) {
  try {
    const clean = stripBoardForExport(board);
    const blob = new Blob([JSON.stringify({ app: "sgk-whiteboard", version: 1, board: clean }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(url, `${safeFileName(board.name)}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    console.error("JSON export failed:", e);
    return false;
  }
}

export async function exportRaster(board, svgEl, format = "png", scope = "content", view = null) {
  try {
    const v = view || { zoom: 1, pan: { x: 0, y: 0 }, w: 1200, h: 800 };
    const { clone, vw, vh } = cloneWithViewBox(svgEl, v, scope, board.objects, board.connectors);
    await inlineCloneImages(clone);
    await prepareCloneFonts(clone, board);
    const parts = clone.getAttribute("viewBox").split(" ");
    let str = serializeNode(clone);
    str = str.replace(/<svg[^>]*>/, (m) => `${m}<rect x="${parts[0]}" y="${parts[1]}" width="${vw}" height="${vh}" fill="#ffffff"/>`);
    const capped = capRasterSize(vw, vh);
    const canvas = await svgToCanvas(str, capped.w, capped.h);
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL(mime, 0.92);
    } catch (e) {
      console.error("Raster export tainted (CORS image?)", e);
      return false;
    }
    download(dataUrl, `${safeFileName(board.name)}.${format === "jpg" ? "jpg" : "png"}`);
    return true;
  } catch (e) {
    console.error("Raster export failed:", e);
    return false;
  }
}

export async function exportPDF(board, svgEl, scope = "content", view = null) {
  try {
    const v = view || { zoom: 1, pan: { x: 0, y: 0 }, w: 1200, h: 800 };
    const { clone, vw, vh } = cloneWithViewBox(svgEl, v, scope, board.objects, board.connectors);
    await inlineCloneImages(clone);
    await prepareCloneFonts(clone, board);
    const parts = clone.getAttribute("viewBox").split(" ");
    let str = serializeNode(clone);
    str = str.replace(/<svg[^>]*>/, (m) => `${m}<rect x="${parts[0]}" y="${parts[1]}" width="${vw}" height="${vh}" fill="#ffffff"/>`);
    const capped = capRasterSize(vw, vh);
    const canvas = await svgToCanvas(str, capped.w, capped.h);
    let url = "";
    try {
      url = canvas.toDataURL("image/png");
    } catch (e) {
      console.error("PDF export tainted (CORS image?)", e);
      return false;
    }
    const win = window.open("", "_blank");
    if (!win) return false;
    const landscape = vw >= vh;
    win.document.write(`<html><head><title>${esc(safeFileName(board.name))}</title><style>@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:10mm}body{margin:0;display:flex;align-items:center;justify-content:center}img{max-width:100%;height:auto}</style></head><body><img src="${url}" onload="setTimeout(()=>{window.print()},300)"/></body></html>`);
    win.document.close();
    return true;
  } catch (e) {
    console.error("PDF export failed:", e);
    return false;
  }
}
