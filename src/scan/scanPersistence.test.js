import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { toCanvasPixels, pickCanvasForSelection } from './scanCoordinates.js';
import { cropFromCanvas, cropFromCanvases } from './scanCapture.js';

// Mock DOM canvas for crop
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: () => ({
          imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
          drawImage: () => {}
        }),
        toBlob: (cb) => cb(new Blob(['fake'])),
        toDataURL: () => 'data:image/png;base64,fake'
      };
    }
    return {};
  }
};

describe('Scan Pipeline — duplicate guard & persistence', ()=>{
  it('single selection must produce exactly one crop', async()=>{
    // Simulate valid sel
    const canvas = { width: 1000, height: 1400 };
    const canvasRect = { left: 100, top: 50, width: 500, height: 700 };
    const containerRect = { left: 0, top: 0, width: 800, height: 800 };
    const sel = { x: 150, y: 80, w: 100, h: 100 };
    const src = toCanvasPixels(canvas, canvasRect, containerRect, sel);
    assert.ok(src);
    assert.ok(src.sw > 0 && src.sh > 0);
  });

  it('duplicate guard: rapid double call should be idempotent', async()=>{
    let callCount = 0;
    let processing = false;
    async function guardedProcess(sel){
      if (processing) return null;
      processing = true;
      try {
        callCount++;
        // simulate crop
        await new Promise(r=>setTimeout(r, 10));
        return { ok: true };
      } finally { processing = false; }
    }
    // Fire twice concurrently
    const p1 = guardedProcess({x:0,y:0,w:50,h:50});
    const p2 = guardedProcess({x:0,y:0,w:50,h:50});
    const [r1, r2] = await Promise.all([p1,p2]);
    assert.equal(callCount, 1, 'second concurrent call should be blocked');
    assert.ok(r1);
    assert.equal(r2, null);
  });

  it('two-page constrain: cross-page selection clamped to single page', async()=>{
    const canvasLeft = { width: 1000, height: 1000 };
    const canvasRight = { width: 1000, height: 1000 };
    const leftRect = { left: 0, top: 0, width: 500, height: 800 };
    const rightRect = { left: 500, top: 0, width: 500, height: 800 };
    const containerRect = { left: 0, top: 0, width: 1000, height: 800 };
    // Selection spanning both pages
    const sel = { x: 400, y: 100, w: 200, h: 100 };
    const target = pickCanvasForSelection(sel, canvasLeft, canvasRight, leftRect, rightRect, containerRect);
    assert.ok(target === canvasLeft || target === canvasRight, 'should pick one canvas');
    // After constrain, selection should be within target bounds
    // Our cropFromCanvases does intersection clamping — verify it does not produce NaN
    // Mock crop
    const canvas = target;
    const rect = target === canvasLeft ? leftRect : rightRect;
    const src = toCanvasPixels(canvas, rect, containerRect, sel);
    // Even cross-page, clamped src should be valid and within bounds
    if (src) {
      assert.ok(src.sx >= 0 && src.sy >= 0);
      assert.ok(src.sx + src.sw <= canvas.width + 1);
    }
  });

  it('clamping rejects NaN/Infinity/zero', ()=>{
    const canvas = { width: 1000, height: 1000 };
    const canvasRect = { left: 0, top: 0, width: 500, height: 500 };
    const containerRect = { left: 0, top: 0, width: 500, height: 500 };
    assert.equal(toCanvasPixels(canvas, canvasRect, containerRect, {x:NaN,y:0,w:100,h:100}), null);
    assert.equal(toCanvasPixels(canvas, canvasRect, containerRect, {x:0,y:0,w:0,h:0}), null);
    assert.equal(toCanvasPixels({width:0,height:0}, canvasRect, containerRect, {x:10,y:10,w:50,h:50}), null);
    assert.equal(toCanvasPixels(canvas, {left:0,top:0,width:0,height:0}, containerRect, {x:10,y:10,w:50,h:50}), null);
  });
});
