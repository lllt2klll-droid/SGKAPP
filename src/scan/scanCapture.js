// ── Scan Capture — crop from canvas to blob / dataUrl (dpr/zoom safe) ──
import { toCanvasPixels, pickCanvasForSelection } from "./scanCoordinates.js";

const MAX_CROP_DIM = 3000; // increased for better OCR quality
const MIN_CROP_DIM = 200; // ensure minimum quality

/**
 * Crop a selection from a PDF canvas with high quality for OCR.
 * @param {HTMLCanvasElement} canvas
 * @param {DOMRect} canvasRect
 * @param {DOMRect} containerRect
 * @param {{x:number,y:number,w:number,h:number}} sel - in container coords
 * @returns {{blob:Blob, dataUrl:string, width:number, height:number}|null}
 */
export async function cropFromCanvas(canvas, canvasRect, containerRect, sel) {
  const src = toCanvasPixels(canvas, canvasRect, containerRect, sel);
  if (!src) return null;

  const { sx, sy, sw, sh } = src;

  // Validate source rect
  if (sw <= 0 || sh <= 0 || !Number.isFinite(sw) || !Number.isFinite(sh)) return null;

  // create offscreen canvas
  const out = document.createElement("canvas");
  
  // Calculate output dimensions - maintain aspect ratio
  let dw = sw;
  let dh = sh;
  
  // Only downscale if significantly larger than MAX_CROP_DIM
  const maxDim = Math.max(dw, dh);
  if (maxDim > MAX_CROP_DIM) {
    const scale = MAX_CROP_DIM / maxDim;
    dw = Math.round(dw * scale);
    dh = Math.round(dh * scale);
  }
  
  // Ensure minimum dimensions
  dw = Math.max(dw, MIN_CROP_DIM);
  dh = Math.max(dh, MIN_CROP_DIM);
  
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  // Enable high quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // draw cropped area scaled to out size
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, dw, dh);

  // Use PNG for better text quality in OCR, or high-quality JPEG
  // PNG is lossless and better for text extraction
  const blob = await new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
  const dataUrl = out.toDataURL("image/png");
  
  return { blob, dataUrl, width: dw, height: dh, srcRect: src };
}

/**
 * Handle two-page mode: pick correct canvas and crop.
 * Product supports single-page crop only — selection that crosses both pages is constrained to the page with larger overlap.
 * Coordinate pipeline preserved: container → displayed canvas → backing store, with clamping.
 */
export async function cropFromCanvases({ canvasLeft, canvasRight, leftRect, rightRect, containerRect, sel }) {
  const target = pickCanvasForSelection(sel, canvasLeft, canvasRight, leftRect, rightRect, containerRect);
  const rect = target === canvasLeft ? leftRect : rightRect;
  // Constrain selection to single page when in two-page mode (do not silently crop arbitrary spread)
  let constrainedSel = sel;
  if (canvasRight && leftRect && rightRect && containerRect) {
    const targetRel = {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      w: rect.width,
      h: rect.height,
    };
    // Intersect sel with target canvas displayed bounds; if overlaps, clamp sel to that intersection
    const ix = Math.max(sel.x, targetRel.x);
    const iy = Math.max(sel.y, targetRel.y);
    const ix2 = Math.min(sel.x + sel.w, targetRel.x + targetRel.w);
    const iy2 = Math.min(sel.y + sel.h, targetRel.y + targetRel.h);
    const iw = ix2 - ix;
    const ih = iy2 - iy;
    if (iw >= 10 && ih >= 10) {
      // Use intersection as effective selection (single-page constrained)
      constrainedSel = { x: ix, y: iy, w: iw, h: ih };
    } else {
      // Selection does not meaningfully overlap target — fallback to original sel (will be clamped later and may return null)
      constrainedSel = sel;
    }
  }
  return cropFromCanvas(target, rect, containerRect, constrainedSel);
}

/**
 * Convert dataUrl to base64 for Gemini inlineData
 */
export function dataUrlToBase64(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
