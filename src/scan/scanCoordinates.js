// ── Scan Coordinates — viewport → canvas conversion (zoom/dpr/transform aware) ──

/**
 * Helper: Validate and normalize a rectangle
 */
export function normalizeRect(x, y, w, h) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

/**
 * Helper: Clamp rectangle to bounds
 */
export function clampRect(rect, maxX, maxY) {
  const { x, y, w, h } = rect;
  const clampedX = Math.max(0, Math.min(x, maxX));
  const clampedY = Math.max(0, Math.min(y, maxY));
  const clampedW = Math.max(0, Math.min(w, maxX - clampedX));
  const clampedH = Math.max(0, Math.min(h, maxY - clampedY));
  return { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
}

/**
 * Convert a selection rect (in viewportContainer client coords) to canvas pixel coords.
 * 
 * Coordinate pipeline:
 * 1. Container Space (sel.x, sel.y relative to viewportContainer)
 * 2. Canvas Display Space (selection relative to displayed canvas on screen)
 * 3. Canvas Backing Store Space (actual canvas pixels)
 * 
 * CRITICAL: getBoundingClientRect() ALREADY includes CSS transforms (translate + scale).
 * Therefore we do NOT manually subtract pan or divide by zoom - the DOM rect reflects the
 * actual displayed geometry after all transforms are applied.
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element to crop from
 * @param {DOMRect} canvasRect - canvas.getBoundingClientRect() (includes CSS transform)
 * @param {DOMRect} containerRect - viewportContainer.getBoundingClientRect()
 * @param {{x:number,y:number,w:number,h:number}} sel - selection in container coords
 * @returns {{sx:number,sy:number,sw:number,sh:number}|null} - source rect in canvas pixels
 */
export function toCanvasPixels(canvas, canvasRect, containerRect, sel) {
  // Validate inputs
  if (!canvas || !canvasRect || !containerRect || !sel) return null;
  if (sel.w < 10 || sel.h < 10) return null; // too small
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;

  // Normalize selection (handle negative width/height)
  const normSel = normalizeRect(sel.x, sel.y, sel.w, sel.h);

  // Step 1: Calculate selection relative to canvas in container space
  // Both selection and canvas are in container coordinates
  // canvasRect already includes CSS transforms (pan + zoom)
  const canvasInContainerX = canvasRect.left - containerRect.left;
  const canvasInContainerY = canvasRect.top - containerRect.top;
  
  const selRelToCanvasX = normSel.x - canvasInContainerX;
  const selRelToCanvasY = normSel.y - canvasInContainerY;

  // Step 2: Canvas Backing Store Space
  // Convert from displayed CSS pixels to actual canvas backing store pixels
  // canvasRect.width/height = displayed size (after zoom)
  // canvas.width/height = backing store size (actual pixels)
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;

  let sx = selRelToCanvasX * scaleX;
  let sy = selRelToCanvasY * scaleY;
  let sw = normSel.w * scaleX;
  let sh = normSel.h * scaleY;

  // Step 3: Clamp to canvas bounds
  const clamped = clampRect({ x: sx, y: sy, w: sw, h: sh }, canvas.width, canvas.height);

  // Final validation
  if (clamped.w < 10 || clamped.h < 10) return null;
  if (clamped.w <= 0 || clamped.h <= 0 || !Number.isFinite(clamped.w) || !Number.isFinite(clamped.h)) return null;

  return { sx: clamped.x, sy: clamped.y, sw: clamped.w, sh: clamped.h };
}

/**
 * Determine which canvas (left/right) the selection belongs to in two-page mode.
 * Uses intersection area to determine which canvas the selection primarily overlaps.
 * Falls back to center-point distance if intersection is ambiguous.
 * 
 * @param {{x:number,y:number,w:number,h:number}} sel - selection in container coords
 * @param {HTMLCanvasElement} canvasLeft - left canvas element
 * @param {HTMLCanvasElement} canvasRight - right canvas element  
 * @param {DOMRect} leftRect - left canvas getBoundingClientRect
 * @param {DOMRect} rightRect - right canvas getBoundingClientRect
 * @param {DOMRect} containerRect - container getBoundingClientRect
 * @returns {HTMLCanvasElement} - the canvas to crop from
 */
export function pickCanvasForSelection(sel, canvasLeft, canvasRight, leftRect, rightRect, containerRect) {
  if (!canvasRight || !rightRect) return canvasLeft;
  if (!canvasLeft || !leftRect) return canvasRight;

  // Convert canvas rects to container-relative coordinates
  const leftRel = {
    x: leftRect.left - containerRect.left,
    y: leftRect.top - containerRect.top,
    w: leftRect.width,
    h: leftRect.height
  };
  
  const rightRel = {
    x: rightRect.left - containerRect.left,
    y: rightRect.top - containerRect.top,
    w: rightRect.width,
    h: rightRect.height
  };

  // Calculate intersection area with each canvas
  function intersectionArea(selRect, canvasRect) {
    const xOverlap = Math.max(0, Math.min(selRect.x + selRect.w, canvasRect.x + canvasRect.w) - Math.max(selRect.x, canvasRect.x));
    const yOverlap = Math.max(0, Math.min(selRect.y + selRect.h, canvasRect.y + canvasRect.h) - Math.max(selRect.y, canvasRect.y));
    return xOverlap * yOverlap;
  }

  // Both selections must be in the same coordinate space (container space)
  const leftArea = intersectionArea(sel, leftRel);
  const rightArea = intersectionArea(sel, rightRel);

  // If selection clearly overlaps one canvas more
  if (leftArea > rightArea * 1.5) return canvasLeft;
  if (rightArea > leftArea * 1.5) return canvasRight;

  // Fallback: use center point distance for ambiguous cases
  const midX = sel.x + sel.w / 2;
  const leftCenter = leftRel.x + leftRel.w / 2;
  const rightCenter = rightRel.x + rightRel.w / 2;

  const distLeft = Math.abs(midX - leftCenter);
  const distRight = Math.abs(midX - rightCenter);
  
  return distLeft <= distRight ? canvasLeft : canvasRight;
}
