// P2 • test kiểm tra link (stub fetch, không chạm mạng thật)
import test from "node:test";
import assert from "node:assert/strict";
import { checkLinkStatus, countFailedLink } from "./webtoolsCheck.js";

const okFetch = async () => ({});
const failFetch = async () => { throw new Error("boom"); };
const headFailGetOk = async (u, o) => {
  if (o && o.method === "HEAD") throw new Error("head blocked");
  return {};
};
const hangingFetch = (u, o) =>
  new Promise((_, rej) => {
    const sig = o && o.signal;
    if (sig && typeof sig.addEventListener === "function") {
      sig.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        rej(e);
      });
    }
  });

test("HEAD ok → reachable", async () => {
  const r = await checkLinkStatus("https://example.com", { fetchFn: okFetch });
  assert.equal(r.ok, true);
});

test("HEAD bị chặn, GET ok → vẫn reachable", async () => {
  const calls = [];
  const r = await checkLinkStatus("https://example.com", {
    fetchFn: (u, o) => { calls.push(o && o.method); return headFailGetOk(u, o); },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ["HEAD", "GET"]);
});

test("cả hai đều lỗi → unreachable", async () => {
  const r = await checkLinkStatus("https://example.com", { fetchFn: failFetch });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unreachable");
});

test("treo quá timeout → timeout", async () => {
  const r = await checkLinkStatus("https://example.com", { fetchFn: hangingFetch, timeoutMs: 30 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "timeout");
});

test("URL bẩn → bad-url, không gọi fetch", async () => {
  let called = 0;
  const r = await checkLinkStatus("javascript:alert(1)", { fetchFn: () => { called++; return {}; } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "bad-url");
  assert.equal(called, 0);
});

test("đếm link lỗi", () => {
  assert.equal(countFailedLink({ a: "ok", b: "fail", c: "fail", d: "checking" }), 2);
  assert.equal(countFailedLink({}), 0);
});
