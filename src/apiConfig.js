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

  // Development: use relative URL via Vite proxy (/api -> localhost:5000)
  // This is more reliable than hard-coding localhost:5000 and works behind
  // firewalls/proxies. Falls back to localhost:5000 if proxy is not available.
  if (env.DEV) {
    // Use empty string for same-origin; vite.config proxy will forward /api
    // If backend is not reachable via proxy, the request will still try localhost:5000
    // via fallback logic in apiUrl (see below).
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
