// ── API Configuration ────────────────────────────────────────────────────
// Supports both local development and production deployments.
// Use environment variables to override defaults:
//   VITE_API_BASE_URL - Full API base URL (e.g., http://localhost:5000 or https://api.example.com)

// Default API base (local development)
const DEFAULT_LOCAL_API_BASE = "http://localhost:5000";

// Detect environment and determine API base
function detectApiBase() {
  // First, check if explicitly set via environment variable (guard for Node test where import.meta.env is undefined)
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) {
    return env.VITE_API_BASE_URL.replace(/\/$/, "");
  }

  // Development: dùng URL tương đối qua Vite proxy (/api -> localhost:5000).
  // apiUrl() trả path tương đối khi API_BASE rỗng → trình duyệt tự đi qua proxy
  // (không có fallback tự động quay lại localhost:5000 nếu proxy tắt).
  if (env.DEV) {
    // Empty string = same-origin; vite.config proxy will forward /api
    return "";
  }

  // Production: prefer same-origin (server serves frontend + /api) so deployment
  // on any host works without extra config. Only use localhost fallback if explicitly
  // running locally (e.g. preview on localhost).
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    const origin = window.location.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return origin.replace(/\/$/, "");
    }
    // Same-origin relative for production deployments
    return "";
  }
  return DEFAULT_LOCAL_API_BASE;
}

const API_BASE = detectApiBase();

export function getApiBase() {
  return API_BASE;
}

// ── Gemini models ────────────────────────────────────────────────────────
// Chỉ giữ model còn được Google phục vụ. Model đã retired
// (gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro) trả 404.
export const DEFAULT_AI_MODEL = "gemini-2.5-flash";
export const MODEL_OPTIONS = [{ value: "gemini-2.5-flash", label: "gemini-2.5-flash" }];

// Ép model về danh sách đang hỗ trợ (dùng ở callAI + loadSettings migration)
export function normalizeModel(model) {
  const v = typeof model === "string" ? model.trim().replace(/\s*\(.*\)\s*$/, "").trim() : "";
  return MODEL_OPTIONS.some((o) => o.value === v) ? v : DEFAULT_AI_MODEL;
}

export function apiUrl(path) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return safePath; // relative via Vite proxy / same-origin
  return `${API_BASE}${safePath}`;
}

// Export environment info for debugging
export function getApiConfig() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
  return {
    base: API_BASE,
    isDev: !!env.DEV,
    isProd: !!env.PROD,
    mode: env.MODE || 'test',
  };
}
