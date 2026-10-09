/**
 * ssrfGuard.js — Secure remote resource fetcher (SSRF protection)
 * Implements TOCTOU-safe DNS validation, manual redirects, streaming limits, PDF signature checks.
 */
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────
export const MAX_REDIRECTS = 3;
export const MAX_REMOTE_FILE_SIZE = 80 * 1024 * 1024; // 80 MB
export const DEFAULT_OVERALL_TIMEOUT_MS = 15000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
export const DEFAULT_HEADERS_TIMEOUT_MS = 8000;
export const DEFAULT_BODY_TIMEOUT_MS = 15000;
export const DEFAULT_DNS_TIMEOUT_MS = 5000;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
// Only 80/443 or no explicit port. Empty = default for scheme.
const ALLOWED_PORTS = new Set(["", "80", "443"]);

// Metadata hostnames to block even if they miraculously resolve to public (defense-in-depth)
const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.google",
  "metadata.google.com",
  "169.254.169.254",
  // common cloud metadata
  "instance-data",
  "instance-data.ec2.internal",
  "metadata.aws.internal",
]);

// ──────────────────────────────────────────────────────────────
// IP helpers
// ──────────────────────────────────────────────────────────────
function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

function isIPv4InCidr(ip, cidrIp, prefixLen) {
  const ipInt = ipv4ToInt(ip);
  const cidrInt = ipv4ToInt(cidrIp);
  if (prefixLen === 0) return true;
  const mask = prefixLen === 32 ? 0xffffffff : (~((1 << (32 - prefixLen)) - 1) >>> 0);
  return (ipInt & mask) === (cidrInt & mask);
}

// IPv4 CIDR block list (minimum per spec + extras)
const IPV4_BLOCKS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IANA special
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

// ──────────────────────────────────────────────────────────────
// IPv4-mapped IPv6 normalization: extract embedded IPv4
// e.g. ::ffff:127.0.0.1  -> 127.0.0.1
//      ::ffff:7f00:1  (hex variant) -> need to handle but we treat dotted form
// ──────────────────────────────────────────────────────────────
function extractIPv4FromMappedIPv6(ip) {
  // dotted form
  const m = String(ip).toLowerCase().match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return m[1];
  // hex form like ::ffff:7f00:1
  const hexM = String(ip).toLowerCase().match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexM) {
    const hi = parseInt(hexM[1], 16);
    const lo = parseInt(hexM[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function normalizeIPv6ForChecks(ip) {
  return String(ip).toLowerCase().trim();
}

export function isPrivateOrReservedIP(ipRaw) {
  let ip = String(ipRaw).trim();
  // Strip brackets [::1]
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const lower = ip.toLowerCase();

  // Check for IPv4-mapped IPv6 first
  const mapped = extractIPv4FromMappedIPv6(lower);
  if (mapped) {
    // Recursively check the embedded IPv4
    return isPrivateOrReservedIP(mapped);
  }

  // IPv4 path
  if (net.isIP(ip) === 4) {
    // Validate octets 0-255 (net.isIP already does)
    for (const [cidrIp, prefix] of IPV4_BLOCKS) {
      if (isIPv4InCidr(ip, cidrIp, prefix)) return true;
    }
    return false;
  }

  // IPv6 path
  if (net.isIP(ip) === 6) {
    const n = normalizeIPv6ForChecks(ip);
    // unspecified ::  or ::1
    if (n === "::" || n === "::1" || n === "0:0:0:0:0:0:0:0" || n === "0:0:0:0:0:0:0:1") return true;
    // Check for ::ffff:0:0 etc already handled via mapped extraction, but also block if still contains %
    // Unique local fc00::/7  -> fc* or fd*
    // Note: compressed form e.g. fc00::1, fd00::1
    // We check by expanding first hextet: if startsWith fc or fd
    // Safer: split first hextet
    // For n like "fc00::1" -> first part "fc00"
    // For n like "::ffff:127.0.0.1" already handled, but if not dotted, e.g. "::ffff:7f00:1" -> handled
    // For generic, check prefix
    // Use heuristic for compressed: if n starts with "fc" or "fd" then it's in fc00::/7
    // But "::1" already returned; for "fc00::" etc, n starts with fc00/fd00
    if (n.startsWith("fc") || n.startsWith("fd")) {
      // Verify first hextet is fc00-fdff: first two hex chars fc or fd is sufficient for /7
      // To avoid false positive like "fcec::" but that's still within /7? Actually fc00::/7 is fc00-fdff, so fc, fd are both inside.
      // So block.
      return true;
    }
    // fe80::/10  -> fe80 - febf
    if (n.startsWith("fe8") || n.startsWith("fe9") || n.startsWith("fea") || n.startsWith("feb")) {
      return true;
    }
    // ff00::/8 multicast
    if (n.startsWith("ff")) return true;
    // Additional check for link-local etc already covered
    // Also block IPv4-compatible ::ffff:0:0/96 already via mapped, but pure ::ffff:a.b.c.d is mapped
    // If still IPv6 and not in block lists, consider it public (e.g. 2606:...)
    return false;
  }

  // If not parseable as IP, treat as not private (caller should handle DNS)
  return false;
}

// ──────────────────────────────────────────────────────────────
// IP literal detection & normalization (decimal/hex/octal bypass)
// ──────────────────────────────────────────────────────────────
function decodeNumericPart(part) {
  const p = String(part).trim().toLowerCase();
  if (!p) return NaN;
  if (p.startsWith("0x")) {
    const v = parseInt(p, 16);
    return Number.isFinite(v) ? v : NaN;
  }
  if (p.startsWith("0") && p.length > 1 && /^[0-7]+$/.test(p)) {
    const v = parseInt(p, 8);
    return Number.isFinite(v) ? v : NaN;
  }
  if (/^\d+$/.test(p)) {
    const v = parseInt(p, 10);
    return Number.isFinite(v) ? v : NaN;
  }
  // hex without 0x? like "7f" – but ambiguous, treat as invalid for dotted IP
  return NaN;
}

function normalizeDottedNumericIP(hostname) {
  // Try to interpret hostname as dotted numeric IPv4 (supports hex/octal per octet)
  // Returns normalized dotted decimal or null if not an IP literal
  const raw = String(hostname).trim();
  if (!raw || raw.includes(":") || raw.includes("/")) return null;

  // Single integer forms: hex, octal, decimal (order matters: hex/octal before decimal)
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    const v = parseInt(raw, 16);
    if (v < 0 || v > 0xffffffff) return null;
    const a = (v >>> 24) & 0xff;
    const b = (v >>> 16) & 0xff;
    const c = (v >>> 8) & 0xff;
    const d = v & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }
  if (/^0[0-7]+$/.test(raw) && raw.length > 1) {
    const v = parseInt(raw, 8);
    if (v < 0 || v > 0xffffffff) return null;
    const a = (v >>> 24) & 0xff;
    const b = (v >>> 16) & 0xff;
    const c = (v >>> 8) & 0xff;
    const d = v & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }
  if (/^\d+$/.test(raw)) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > 0xffffffff) return null;
    const a = (v >>> 24) & 0xff;
    const b = (v >>> 16) & 0xff;
    const c = (v >>> 8) & 0xff;
    const d = v & 0xff;
    return `${a}.${b}.${c}.${d}`;
  }

  // Dotted forms
  if (!raw.includes(".")) return null;
  const parts = raw.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  // Each part must be numeric (decimal/hex/octal)
  const decoded = [];
  for (const part of parts) {
    if (!part) return null;
    const v = decodeNumericPart(part);
    if (!Number.isFinite(v) || v < 0) return null;
    decoded.push(v);
  }
  // Validate range per inet_aton rules:
  // 1 part: 0 - 4294967295 (already handled above, but dotted with 1 part is same)
  // 2 parts: a.b where a 0-255, b 0-16777215
  // 3 parts: a.b.c where a,b 0-255, c 0-65535
  // 4 parts: each 0-255
  if (decoded.length === 1) {
    const v = decoded[0];
    if (v > 0xffffffff) return null;
    return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
  }
  if (decoded.length === 2) {
    if (decoded[0] > 255 || decoded[1] > 16777215) return null;
    const b = decoded[1];
    return `${decoded[0]}.${(b >>> 16) & 0xff}.${(b >>> 8) & 0xff}.${b & 0xff}`;
  }
  if (decoded.length === 3) {
    if (decoded[0] > 255 || decoded[1] > 255 || decoded[2] > 65535) return null;
    const c = decoded[2];
    return `${decoded[0]}.${decoded[1]}.${(c >>> 8) & 0xff}.${c & 0xff}`;
  }
  if (decoded.length === 4) {
    if (decoded.some((v) => v > 255)) return null;
    return `${decoded[0]}.${decoded[1]}.${decoded[2]}.${decoded[3]}`;
  }
  return null;
}

export function parseIpLiteral(hostname) {
  let h = String(hostname).trim();
  // Strip brackets for IPv6 literals: [::1]
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const lower = h.toLowerCase();

  // IPv6 literal detection (contains colon)
  if (lower.includes(":")) {
    // net.isIP handles normalized, but also hex octal not relevant for IPv6
    // For IPv4-mapped with dotted, net.isIP returns 6? Actually ::ffff:127.0.0.1 returns 6
    if (net.isIP(h) === 6) return h;
    // Try bracketed already stripped, but still check
    if (net.isIP(lower) === 6) return lower;
    return null;
  }

  // Check dotted decimal direct
  if (net.isIP(h) === 4) return h;

  // Try numeric bypass normalization
  const normalized = normalizeDottedNumericIP(h);
  if (normalized && net.isIP(normalized) === 4) return normalized;

  return null;
}

// ──────────────────────────────────────────────────────────────
// URL validation
// ──────────────────────────────────────────────────────────────
export function isBlockedHostname(hostname) {
  const lower = String(hostname).toLowerCase().trim();
  // exact match or suffix? metadata.google.internal could be with prefix
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  // also block any hostname ending with .metadata.google.internal etc
  if (lower.endsWith(".metadata.google.internal")) return true;
  if (lower.endsWith(".metadata.google")) return true;
  if (lower === "metadata.google.internal") return true;
  // block 169.254.169.254 as hostname string (IP literal case handled separately)
  if (lower === "169.254.169.254") return true;
  return false;
}

export function validateRemoteUrl(urlString) {
  if (typeof urlString !== "string" || !urlString.trim()) {
    const e = new Error("URL is required");
    e.code = "INVALID_URL";
    throw e;
  }
  let u;
  try {
    u = new URL(String(urlString).trim());
  } catch {
    const e = new Error("Remote URL is not allowed");
    e.code = "INVALID_URL";
    throw e;
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    const e = new Error("Remote URL is not allowed");
    e.code = "BLOCKED_PROTOCOL";
    throw e;
  }

  // Must have hostname
  if (!u.hostname) {
    const e = new Error("Remote URL is not allowed");
    e.code = "INVALID_HOST";
    throw e;
  }

  // Reject credentials in URL
  if (u.username || u.password) {
    const e = new Error("Remote URL is not allowed");
    e.code = "CREDENTIALS_IN_URL";
    throw e;
  }

  // Port check: only allow default or 80/443
  if (u.port && !ALLOWED_PORTS.has(u.port)) {
    const e = new Error("Remote URL is not allowed");
    e.code = "BLOCKED_PORT";
    throw e;
  }

  // Hostname blocklist (defense in depth, before DNS)
  if (isBlockedHostname(u.hostname)) {
    const e = new Error("Remote URL is not allowed");
    e.code = "BLOCKED_HOSTNAME";
    throw e;
  }

  // If hostname is IP literal (including decimal/hex/octal bypass), validate immediately
  const ipLiteral = parseIpLiteral(u.hostname);
  if (ipLiteral) {
    if (isPrivateOrReservedIP(ipLiteral)) {
      const e = new Error("Remote URL is not allowed");
      e.code = "BLOCKED_IP";
      throw e;
    }
    // Also need to ensure IPv6 literals don't bypass: already checked
  }

  // Also check hostname === localhost (covers 0.0.0.0)
  const lowerHost = u.hostname.toLowerCase();
  if (lowerHost === "localhost" || lowerHost.endsWith(".localhost")) {
    const e = new Error("Remote URL is not allowed");
    e.code = "BLOCKED_HOSTNAME";
    throw e;
  }

  return u;
}

// ──────────────────────────────────────────────────────────────
// DNS resolution with validation & timeout
// ──────────────────────────────────────────────────────────────
export async function resolveAndValidateHost(hostname, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  let h = String(hostname).trim();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);

  // If hostname is already an IP literal (including bypass), don't DNS, just validate
  const literal = parseIpLiteral(h);
  if (literal) {
    if (isPrivateOrReservedIP(literal)) {
      const e = new Error("Remote URL is not allowed");
      e.code = "BLOCKED_IP";
      throw e;
    }
    return [literal];
  }

  // Block hostname directly before DNS
  if (isBlockedHostname(h)) {
    const e = new Error("Remote URL is not allowed");
    e.code = "BLOCKED_HOSTNAME";
    throw e;
  }

  // Perform DNS lookup with timeout
  let results;
  try {
    const lookupPromise = dns.lookup(h, { all: true, verbatim: true });
    const timer = new Promise((_, reject) =>
      setTimeout(() => {
        const e = new Error("DNS timeout");
        e.code = "DNS_TIMEOUT";
        reject(e);
      }, timeoutMs).unref?.() || setTimeout(() => {}, timeoutMs)
    );
    // Use race but ensure we handle correctly without unref issues
    results = await Promise.race([lookupPromise, timer]);
  } catch (err) {
    // On DNS failure, treat as not allowed (don't leak internal)
    if (err.code === "DNS_TIMEOUT" || err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      const e = new Error("Remote URL is not allowed");
      e.code = "DNS_FAILED";
      e.cause = err;
      throw e;
    }
    // For other lookup errors, also generic
    const e = new Error("Remote URL is not allowed");
    e.code = "DNS_FAILED";
    e.cause = err;
    throw e;
  }

  if (!results || results.length === 0) {
    const e = new Error("Remote URL is not allowed");
    e.code = "DNS_NO_RESULTS";
    throw e;
  }

  // Validate EVERY resolved IP
  for (const r of results) {
    const ip = r.address;
    if (isPrivateOrReservedIP(ip)) {
      const e = new Error("Remote URL is not allowed");
      e.code = "BLOCKED_IP";
      throw e;
    }
    // Also check mapped variant
    const mapped = extractIPv4FromMappedIPv6(ip);
    if (mapped && isPrivateOrReservedIP(mapped)) {
      const e = new Error("Remote URL is not allowed");
      e.code = "BLOCKED_IP";
      throw e;
    }
  }

  return results.map((r) => r.address);
}

// ──────────────────────────────────────────────────────────────
// Low-level HTTP request pinned to validated IP (DNS rebinding protection)
// ──────────────────────────────────────────────────────────────
function doHttpRequest(urlObj, validatedIp, opts) {
  const maxSize = opts.maxSize ?? MAX_REMOTE_FILE_SIZE;
  const connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const headersTimeoutMs = opts.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS;
  const bodyTimeoutMs = opts.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  const overallTimeoutMs = opts.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;
    const port = urlObj.port ? Number(urlObj.port) : isHttps ? 443 : 80;
    // Path must not include hash
    const path = `${urlObj.pathname || "/"}${urlObj.search || ""}`;

    const hostHeader = urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : "");

    const requestOptions = {
      host: validatedIp,
      port,
      path,
      method: "GET",
      headers: {
        Host: hostHeader,
        "User-Agent": "sgk-app-ssrf-guard/1.0",
        Accept: "*/*, application/pdf",
        Connection: "close",
      },
      // For TLS SNI
      servername: urlObj.hostname,
      // Do not use proxy; no agent with proxy
      // Ensure we don't disable TLS verification
      rejectUnauthorized: true,
    };

    // Handle IPv6 host: Node's http.request expects host without brackets
    // validatedIp already without brackets

    let overallTimer;
    let headersTimer;
    let bodyTimer;
    let settled = false;

    const cleanup = () => {
      if (overallTimer) clearTimeout(overallTimer);
      if (headersTimer) clearTimeout(headersTimer);
      if (bodyTimer) clearTimeout(bodyTimer);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { req.destroy(); } catch {}
      reject(err);
    };

    const succeed = (val) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };

    const req = lib.request(requestOptions, (res) => {
      // Headers received: clear headers timer
      if (headersTimer) clearTimeout(headersTimer);

      const status = res.statusCode;
      const headers = res.headers;

      // Handle redirect: don't consume body fully, just drain
      if (status >= 300 && status < 400 && headers.location) {
        // Drain to free socket
        res.resume();
        res.on("error", () => {});
        succeed({ statusCode: status, headers, isRedirect: true, body: null });
        return;
      }

      // For non-redirect success/error, handle body streaming with size limit
      if (status < 200 || status >= 300) {
        // Error status: still drain but treat as error upstream
        // We still need to consume to avoid leak, but we can just resume
        // However we want to return body for error diagnostics (not leaked to client)
        let total = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          total += chunk.length;
          if (total > 4096) { res.destroy(); } // limit error body
          else chunks.push(chunk);
        });
        res.on("end", () => {
          succeed({ statusCode: status, headers, isRedirect: false, body: Buffer.concat(chunks) });
        });
        res.on("error", (e) => fail(e));
        return;
      }

      // 2xx – stream body with hard limit
      let total = 0;
      const chunks = [];

      const resetBodyTimer = () => {
        if (bodyTimer) clearTimeout(bodyTimer);
        bodyTimer = setTimeout(() => {
          try { res.destroy(); } catch {}
          fail(Object.assign(new Error("Body timeout"), { code: "BODY_TIMEOUT" }));
        }, bodyTimeoutMs);
        bodyTimer.unref?.();
      };

      resetBodyTimer();

      res.on("data", (chunk) => {
        resetBodyTimer();
        total += chunk.length;
        if (total > maxSize) {
          try { res.destroy(); } catch {}
          fail(Object.assign(new Error(`Response size exceeds limit ${maxSize}`), { code: "SIZE_EXCEEDED" }));
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        if (bodyTimer) clearTimeout(bodyTimer);
        const body = Buffer.concat(chunks);
        succeed({ statusCode: status, headers, isRedirect: false, body });
      });

      res.on("error", (e) => {
        if (bodyTimer) clearTimeout(bodyTimer);
        fail(e);
      });
    });

    req.on("error", (e) => fail(e));

    // Overall timeout
    overallTimer = setTimeout(() => {
      fail(Object.assign(new Error("Overall request timeout"), { code: "OVERALL_TIMEOUT" }));
    }, overallTimeoutMs);
    overallTimer.unref?.();

    // Headers timeout: if no response headers within this time
    headersTimer = setTimeout(() => {
      fail(Object.assign(new Error("Headers timeout"), { code: "HEADERS_TIMEOUT" }));
    }, headersTimeoutMs);
    headersTimer.unref?.();

    // Connect timeout
    req.on("socket", (socket) => {
      if (socket.connecting) {
        const ct = setTimeout(() => {
          try { socket.destroy(); } catch {}
          fail(Object.assign(new Error("Connection timeout"), { code: "CONNECT_TIMEOUT" }));
        }, connectTimeoutMs);
        ct.unref?.();
        socket.once("connect", () => clearTimeout(ct));
        socket.once("close", () => clearTimeout(ct));
        socket.once("error", () => clearTimeout(ct));
      }
    });

    // Ensure minimal headers only, no proxy env usage
    // Node http does not auto-use proxy, so nothing to disable

    req.end();
  });
}

// ──────────────────────────────────────────────────────────────
// safeFetch: validates URL, resolves, validates IP, handles manual redirects
// Returns { finalUrl, status, headers, body: Buffer }
// ──────────────────────────────────────────────────────────────
export async function safeFetch(initialUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const maxSize = options.maxSize ?? MAX_REMOTE_FILE_SIZE;
  const overallTimeoutMs = options.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS;
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const headersTimeoutMs = options.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  const dnsTimeoutMs = options.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;

  let currentUrl = String(initialUrl).trim();
  const visited = new Set();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (visited.has(currentUrl)) {
      const e = new Error("Remote URL is not allowed");
      e.code = "REDIRECT_LOOP";
      throw e;
    }
    visited.add(currentUrl);

    // Validate URL shape
    const urlObj = validateRemoteUrl(currentUrl);

    // Re-resolve DNS at every hop (rebinding protection) and validate ALL IPs
    const ips = await resolveAndValidateHost(urlObj.hostname, { timeoutMs: dnsTimeoutMs });
    const validatedIp = ips[0]; // all are public, pick first (pinned)

    // Pinned fetch
    const result = await doHttpRequest(urlObj, validatedIp, {
      maxSize,
      overallTimeoutMs,
      connectTimeoutMs,
      headersTimeoutMs,
      bodyTimeoutMs,
    });

    // Handle redirect
    if (result.isRedirect) {
      if (redirectCount >= maxRedirects) {
        const e = new Error("Remote URL is not allowed");
        e.code = "TOO_MANY_REDIRECTS";
        throw e;
      }
      const location = result.headers.location;
      if (!location) {
        const e = new Error("Remote URL is not allowed");
        e.code = "INVALID_REDIRECT";
        throw e;
      }
      // Strict Location parsing: must resolve to http/https after resolution
      let nextUrl;
      try {
        nextUrl = new URL(String(location).trim(), currentUrl).toString();
      } catch {
        const e = new Error("Remote URL is not allowed");
        e.code = "INVALID_REDIRECT_LOCATION";
        throw e;
      }
      // Validate next URL before looping (will be re-validated at top of loop including DNS)
      // Quick scheme check to avoid leaking cross-protocol (e.g. file:)
      try {
        const nx = new URL(nextUrl);
        if (!ALLOWED_PROTOCOLS.has(nx.protocol)) {
          const e = new Error("Remote URL is not allowed");
          e.code = "REDIRECT_BLOCKED_PROTOCOL";
          throw e;
        }
        if (nx.username || nx.password) {
          const e = new Error("Remote URL is not allowed");
          e.code = "REDIRECT_CREDENTIALS";
          throw e;
        }
        if (nx.port && !ALLOWED_PORTS.has(nx.port)) {
          const e = new Error("Remote URL is not allowed");
          e.code = "REDIRECT_BLOCKED_PORT";
          throw e;
        }
      } catch (err) {
        if (err.code && err.message === "Remote URL is not allowed") throw err;
        const e = new Error("Remote URL is not allowed");
        e.code = "INVALID_REDIRECT_URL";
        throw e;
      }
      currentUrl = nextUrl;
      continue;
    }

    // Not redirect: must be 2xx
    if (result.statusCode < 200 || result.statusCode >= 300) {
      const e = new Error("Remote URL is not allowed");
      e.code = "FETCH_FAILED";
      e.status = result.statusCode;
      throw e;
    }

    // Success: return body and metadata
    return {
      finalUrl: currentUrl,
      status: result.statusCode,
      headers: result.headers,
      body: result.body,
    };
  }

  const e = new Error("Remote URL is not allowed");
  e.code = "TOO_MANY_REDIRECTS";
  throw e;
}

// ──────────────────────────────────────────────────────────────
// File signature helpers
// ──────────────────────────────────────────────────────────────
export function isPdfBuffer(buf) {
  if (!buf || buf.length < 5) return false;
  return buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function detectExtensionFromBuffer(buf, contentType) {
  // Prefer magic, then content-type, then extension fallback
  if (isPdfBuffer(buf)) return ".pdf";
  const ct = String(contentType || "").toLowerCase().split(";")[0].trim();
  // Map known content-types
  const map = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/epub+zip": ".epub",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  if (map[ct]) return map[ct];
  return null; // unknown -> must reject, not default to .pdf
}

// Minimal logger (server-side only, never leaks to client)
export function ssrfLog(entry) {
  const safe = { ...entry };
  // scrub credentials if url contains @
  if (safe.url) {
    try {
      const u = new URL(safe.url);
      if (u.username || u.password) {
        u.username = "***";
        u.password = "***";
        safe.url = u.toString();
      }
    } catch {}
  }
  if (safe.finalUrl) {
    try {
      const u = new URL(safe.finalUrl);
      if (u.username || u.password) {
        u.username = "***";
        u.password = "***";
        safe.finalUrl = u.toString();
      }
    } catch {}
  }
  console.warn("[SSRF]", JSON.stringify({ ts: new Date().toISOString(), ...safe }));
}
