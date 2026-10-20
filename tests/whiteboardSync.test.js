// Đồng bộ đa tab: phân biệt event tab mình vs tab khác (không ghi đè lén)
import { test } from "node:test";
import assert from "node:assert/strict";

test("isRemoteWhiteboardEvent: tin mình phát thì không phải remote", async () => {
  const { isRemoteWhiteboardEvent } = await import("../src/whiteboard/whiteboardIntegration.js");
  assert.equal(isRemoteWhiteboardEvent({ source: "whiteboard", origin: "tab-A", boardId: "b1" }, "tab-A"), false);
});

test("isRemoteWhiteboardEvent: tin tab khác / đường storage legacy là remote", async () => {
  const { isRemoteWhiteboardEvent } = await import("../src/whiteboard/whiteboardIntegration.js");
  assert.equal(isRemoteWhiteboardEvent({ source: "whiteboard", origin: "tab-B", boardId: "b1" }, "tab-A"), true);
  assert.equal(isRemoteWhiteboardEvent({ key: "sgk_wb_board_b1", source: "cross-tab-sync" }, "tab-A"), true);
});

test("isRemoteWhiteboardEvent: rác thì không phải remote", async () => {
  const { isRemoteWhiteboardEvent } = await import("../src/whiteboard/whiteboardIntegration.js");
  assert.equal(isRemoteWhiteboardEvent(null, "tab-A"), false);
  assert.equal(isRemoteWhiteboardEvent(undefined, "tab-A"), false);
  assert.equal(isRemoteWhiteboardEvent("b1", "tab-A"), false);
});
