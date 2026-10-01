import test from "node:test";
import assert from "node:assert/strict";

const getBaseUrl = (hostname = "", origin = "") => {
  const host = String(hostname || "").toLowerCase();
  const protocol = String(origin || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]")
    return "http://localhost:5000";
  if (
    protocol.startsWith("http://localhost") ||
    protocol.startsWith("http://127.0.0.1") ||
    protocol.startsWith("http://[::1]")
  )
    return "http://localhost:5000";
  return "";
};

test("uses local backend", () => {
  assert.equal(getBaseUrl("localhost", "http://localhost:5173"), "http://localhost:5000");
  assert.equal(getBaseUrl("127.0.0.1", "http://127.0.0.1:5173"), "http://localhost:5000");
});
