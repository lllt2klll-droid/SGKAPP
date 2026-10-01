// ─── Export manager: PNG / JPG / SVG / PDF / JSON ───
// Không thêm dependency. PDF dùng cửa sổ in (ảnh PNG độ phân giải cao, fit trang).

export function boardBounds(objects, pad = 60) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach((o) => {
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
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1200, h: 800 };
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function download(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function serializeNode(svgNode) {
  const clone = svgNode.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

// view = {zoom, pan:{x,y}, w, h} (kích thước viewport px hiện tại)
function cloneWithViewBox(svgEl, view, scope, objects) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  let vx = 0, vy = 0, vw = view.w, vh = view.h;
  if (scope === "content") {
    const bb = boardBounds(objects || []);
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

export function exportSVG(board, svgEl, scope = "all", view = null) {
  try {
    let str;
    if (scope === "content" && view) {
      const { clone } = cloneWithViewBox(svgEl, view, "content", board.objects);
      str = serializeNode(clone);
      // đảm bảo nền trắng cho SVG content
      const vb = clone.getAttribute("viewBox").split(" ");
      str = str.replace(/<svg[^>]*>/, (m) => `${m}<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>`);
    } else {
      str = serializeNode(svgEl);
    }
    const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    download(url, `${board.name || "bang-trang"}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    console.error("SVG export failed:", e);
    return false;
  }
}

export function exportJSON(board) {
  try {
    const blob = new Blob([JSON.stringify({ app: "sgk-whiteboard", version: 1, board }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(url, `${board.name || "bang-trang"}.json`);
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
    const { clone, vw, vh } = cloneWithViewBox(svgEl, v, scope, board.objects);
    const parts = clone.getAttribute("viewBox").split(" ");
    let str = serializeNode(clone);
    str = str.replace(/<svg[^>]*>/, (m) => `${m}<rect x="${parts[0]}" y="${parts[1]}" width="${vw}" height="${vh}" fill="#ffffff"/>`);
    const canvas = await svgToCanvas(str, vw, vh);
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    download(canvas.toDataURL(mime, 0.92), `${board.name || "bang-trang"}.${format === "jpg" ? "jpg" : "png"}`);
    return true;
  } catch (e) {
    console.error("Raster export failed:", e);
    return false;
  }
}

export async function exportPDF(board, svgEl, scope = "content", view = null) {
  try {
    const v = view || { zoom: 1, pan: { x: 0, y: 0 }, w: 1200, h: 800 };
    const { clone, vw, vh } = cloneWithViewBox(svgEl, v, scope, board.objects);
    const parts = clone.getAttribute("viewBox").split(" ");
    let str = serializeNode(clone);
    str = str.replace(/<svg[^>]*>/, (m) => `${m}<rect x="${parts[0]}" y="${parts[1]}" width="${vw}" height="${vh}" fill="#ffffff"/>`);
    const canvas = await svgToCanvas(str, vw, vh);
    const url = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return false;
    const landscape = vw >= vh;
    win.document.write(`<html><head><title>${esc(board.name || "bang-trang")}</title><style>@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:10mm}body{margin:0;display:flex;align-items:center;justify-content:center}img{max-width:100%;height:auto}</style></head><body><img src="${url}" onload="setTimeout(()=>{window.print()},300)"/></body></html>`);
    win.document.close();
    return true;
  } catch (e) {
    console.error("PDF export failed:", e);
    return false;
  }
}
