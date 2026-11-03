import assert from "node:assert/strict";
import test from "node:test";
import { isWheelZoomGesture } from "./zoomController.js";

test("mouse wheel gestures zoom without a modifier", () => {
  assert.equal(isWheelZoomGesture({ deltaX: 0, deltaY: 3, deltaMode: 1 }), true);
  assert.equal(isWheelZoomGesture({ deltaX: 0, deltaY: -100, deltaMode: 0 }), true);
});

test("smooth trackpad scrolling pans unless the user pinches to zoom", () => {
  assert.equal(isWheelZoomGesture({ deltaX: 0, deltaY: 12.5, deltaMode: 0 }), false);
  assert.equal(isWheelZoomGesture({ deltaX: 4, deltaY: 0, deltaMode: 0 }), false);
  assert.equal(isWheelZoomGesture({ ctrlKey: true, deltaX: 0, deltaY: 12, deltaMode: 0 }), true);
  assert.equal(isWheelZoomGesture({ metaKey: true, deltaX: 0, deltaY: 12, deltaMode: 0 }), true);
});
