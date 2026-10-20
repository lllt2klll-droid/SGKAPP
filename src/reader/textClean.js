// src/reader/textClean.js — tách từ BookReader.jsx (helpers thuần đầu file)
// Giữ nguyên logic, không đổi tên hàm, không đổi thứ tự gọi.
import DOMPurify from "dompurify";

// ─── Watermark / noise text cleaner ──────────────────────────────────────────
export function cleanExtractedText(text) {
  if (!text) return "";
  let c = text;
  c = c.replace(/https?:\/\/\S+/gi, "");
  c = c.replace(/blogtailieu[\s.]*com[\s./]*[a-zA-Z0-9_-]*/gi, "");
  c = c.replace(/blogtailieu[\s.]*\w+[\s./]*\w*[-\w]*/gi, "");
  c = c.replace(/blogtailieu/gi, "");
  c = c.replace(/sách chia sẻ tại/gi, "");
  c = c.replace(/sach chia se tai/gi, "");
  c = c.replace(/chia sẻ tại/gi, "");
  c = c.replace(/giao\s*-\s*an\s*-\s*lo\s*p?\s*-\s*\d/gi, "");
  c = c.replace(/day\s*-\s*va\s*-\s*hoc/gi, "");
  c = c.replace(/\s*-\s*va\s*-\s*/gi, " ");
  // Protect fractions like 1/2 from being mangled, then strip leftover slashes
  const fracs = [];
  const marker = String.fromCharCode(1);
  c = c.replace(/(\d)\s*\/\s*(\d)/g, (m, a, b) => {
    fracs.push(`${a}/${b}`);
    return `${marker}${fracs.length - 1}${marker}`;
  });
  c = c.replace(/\/+/g, " ");
  c = c
    .split(marker)
    .map((part, i) => (i % 2 === 1 ? fracs[parseInt(part, 10)] : part))
    .join("");
  c = c.replace(/\s+/g, " ").trim();
  return c;
}

export function sanitizeNoteHtml(html) {
  if (!html) return "";
  try {
    // DOMPurify parse trên document inert nên script/onerror KHÔNG thể chạy
    // trong lúc sanitize (cách cũ gán innerHTML lên div rồi mới dọn là đã trễ).
    // Allowlist y hệt bản cũ: chỉ b/strong/i/em/u/s/strike/br, không attribute.
    let out = DOMPurify.sanitize(String(html), {
      ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "s", "strike", "br"],
      ALLOWED_ATTR: [],
    }).trim();
    if (/^(<br\s*\/?>)+$/i.test(out)) out = "";
    return out;
  } catch {
    return String(html).replace(/<[^>]*>/g, "").slice(0, 4000);
  }
}
export function plainTextFromHtml(html) {
  try {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return (tmp.textContent || tmp.innerText || "")
      .replace(/\u00A0/g, " ")
      .trim();
  } catch {
    return (html || "").replace(/<[^>]*>/g, " ").trim();
  }
}

export function tryParseJSONBookReader(s) {
  try { return { ok: true, value: JSON.parse(s) }; } catch {}
  try { return { ok: true, value: JSON.parse(String(s).replace(/,\s*([}\]])/g, "$1")) }; } catch {}
  return { ok: false, value: null };
}

export function parseJSONSafe(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // 1) Parse toàn chuỗi trước (đúng cho mảng thuần [...] mà prompt TOC yêu cầu)
  let r = tryParseJSONBookReader(t);
  if (r.ok) {
    let result = r.value;
    for (let i = 0; i < 3 && typeof result === "string"; i++) {
      const inner = result.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      if (!inner) break;
      const r2 = tryParseJSONBookReader(inner);
      if (!r2.ok) break;
      result = r2.value;
    }
    return typeof result === "string" ? null : result;
  }
  // 2) Fallback: cắt khối JSON khi AI chèn chữ xung quanh.
  // Ưu tiên khối bắt đầu TRƯỚC (ngoài cùng): mảng [...] bắt đầu trước {...} con bên trong.
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  const objOk = objStart >= 0 && objEnd > objStart;
  const arrOk = arrStart >= 0 && arrEnd > arrStart;
  let cand = t;
  if (objOk && arrOk) {
    cand = arrStart < objStart ? t.slice(arrStart, arrEnd + 1) : t.slice(objStart, objEnd + 1);
  } else if (arrOk) {
    cand = t.slice(arrStart, arrEnd + 1);
  } else if (objOk) {
    cand = t.slice(objStart, objEnd + 1);
  }
  r = tryParseJSONBookReader(cand);
  if (!r.ok) return null;
  let result = r.value;
  for (let i = 0; i < 3 && typeof result === "string"; i++) {
    const inner = result.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!inner) break;
    const r2 = tryParseJSONBookReader(inner);
    if (!r2.ok) break;
    result = r2.value;
  }
  return typeof result === "string" ? null : result;
}
