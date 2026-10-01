// reader/zoomController.js — extracted from BookReader.jsx (P1 low coupling)
// Pure helpers, no React dependency, safe to reuse
// FREE ZOOM: không auto zoom — người dùng tự do phóng to/thu nhỏ, chỉ clamp để tránh vỡ layout / OOM
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 10;
export const ZOOM_STEP = 0.1;
export const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800, 1000];

export function clampZoom(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 1.0;
  if (v <= 0) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
}

export function calcFitZoom({ availWidth, pageWidth, twoPageMode, pageNum, numPages }) {
  if (!pageWidth || !availWidth) return 1.0;
  const total = twoPageMode && pageNum + 1 <= numPages ? pageWidth * 2 + 16 : pageWidth;
  if (total <= 0) return 1.0;
  const raw = availWidth / total;
  return clampZoom(parseFloat(raw.toFixed(2)));
}

export function calcWheelZoom(oldZoom, deltaY, deltaMode = 0) {
  // Normalize line/page deltas to pixel scale (deltaMode: 0=pixel, 1=line, 2=page)
  let dy = deltaY;
  if (deltaMode === 1) dy *= 16;
  else if (deltaMode === 2) dy *= 400;
  // clamp delta to avoid huge jumps on trackpad burst
  dy = Math.max(-400, Math.min(400, dy));
  const factor = Math.exp(-dy * 0.0025);
  const raw = oldZoom * factor;
  return clampZoom(parseFloat(raw.toFixed(3)));
}

export function zoomIn(current) {
  const c = Number(current) || 1;
  // geometric step: 12% per click, feels natural at any scale, keeps free zoom
  return clampZoom(parseFloat((c * 1.12).toFixed(3)));
}
export function zoomOut(current) {
  const c = Number(current) || 1;
  return clampZoom(parseFloat((c / 1.12).toFixed(3)));
}
