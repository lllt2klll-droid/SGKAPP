// P2 • Kiểm tra link chết cho Kho Công cụ Web.
// Chạy session-only (không ghi storage): HEAD trước, GET dự phòng vì một số
// host chặn HEAD. Dùng no-cors nên chỉ biết "tới được / không", không đọc status
// — đủ để gắn cờ link lỗi cho giáo viên dọn kho.
export async function checkLinkStatus(url, { fetchFn, timeoutMs = 8000 } = {}) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return { ok: false, reason: "bad-url" };
  const run = typeof fetchFn === "function" ? fetchFn : (typeof fetch !== "undefined" ? fetch : null);
  if (!run) return { ok: false, reason: "no-fetch" };
  const attempt = async (method) => {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs) : null;
    try {
      await run(u, { method, mode: "no-cors", redirect: "follow", signal: ctrl ? ctrl.signal : undefined });
      return true;
    } finally {
      if (t) clearTimeout(t);
    }
  };
  try {
    if (await attempt("HEAD")) return { ok: true };
  } catch {
    // rơi xuống thử GET
  }
  try {
    if (await attempt("GET")) return { ok: true };
    return { ok: false, reason: "unreachable" };
  } catch (e) {
    return { ok: false, reason: e && e.name === "AbortError" ? "timeout" : "unreachable" };
  }
}

export function countFailedLink(statusMap) {
  return Object.values(statusMap || {}).filter((s) => s === "fail").length;
}
