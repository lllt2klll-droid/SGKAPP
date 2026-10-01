// reader/pdfRenderer.js — prepared for Phase30
// Pure helpers for PDF rendering; integration deferred to avoid regression
// Current BookReader still renders via canvasRef directly (see BookReader.jsx:623-739)
// Future: extract `renderOne(pageNum, canvasEl, taskRef, pdfDoc, zoom)` here
export function calcRenderScale(zoom, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
  const z = clampZoom(zoom);
  // Avoid OOM: cap canvas so that pageWidth*scale < 5000px. Large zoom keeps crispness but reduces DPR
  const effectiveDpr = z > 3 ? Math.min(dpr, 1.25) : z > 2 ? Math.min(dpr, 1.5) : dpr;
  return z * effectiveDpr;
}
function clampZoom(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 0.1;
  return Math.min(10, Math.max(0.1, n));
}
export function calcViewportSize(pageWidth, renderScale) {
  return { width: pageWidth * renderScale, height: pageWidth * renderScale * 1.414 };
}
