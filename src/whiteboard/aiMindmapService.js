// ── AI Mindmap Service — tạo sơ đồ tư duy bám sát nội dung người dùng gửi ──
// Nguyên tắc: KHÔNG BỊA. Mọi nhãn nhánh/con phải là trích xuất hoặc rút gọn
// sát nghĩa từ văn bản/ảnh được gửi. Có bước validate thứ 2 đối chiếu nhãn
// với nguồn; nếu vẫn bịa sau 1 lần retry → throw (không đưa lên canvas).
// Không có API key / AI gián đoạn → fallback local tách dòng (vẫn đúng nguồn).

import aiService, { getFriendlyErrorMessage } from "../aiService.js";
import { getGeminiApiKey } from "../storage.js";
import { loadSettings } from "../settingsStore.js";
import { PLAN_LIMITS } from "./mindmapEngine.js";

const LIMITS = {
  topic: PLAN_LIMITS.topic,
  branches: PLAN_LIMITS.branches,
  children: PLAN_LIMITS.children,
  label: PLAN_LIMITS.label,
  sourceChars: 12000, // cắt bớt nguồn quá dài (giữ head + tail)
  imageBytes: 8 * 1024 * 1024,
};

// ── Hủy xuyên suốt pipeline (C1): aiService chỉ giữ controller của call đang chạy,
// giữa 2 chặng gen → validate → retry không có gì để abort nên cần thêm cờ chung.
let _cancelFlag = false;
function throwIfCancelled() {
  if (_cancelFlag) {
    const e = new Error("Đã hủy tạo sơ đồ.");
    e.code = "CANCELLED";
    throw e;
  }
}
// Lỗi key sai/hết hạn (401/403) không được fallback local che lấp (C2)
function isAuthError(e) {
  if (!e) return false;
  if (e.status === 401 || e.status === 403) return true;
  return /API Key không hợp lệ/i.test(String(e.message || ""));
}

function getModel() {
  try { return loadSettings().ai?.model || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; }
}

function getApiKeySafe() {
  try { return getGeminiApiKey() || ""; } catch { return ""; }
}

// ── Parse JSON bền (fence, chữ bao quanh, trailing comma, double-encode) ──
function stripFences(s) {
  return String(s || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function tryParseJSON(s) {
  try { return { ok: true, value: JSON.parse(s) }; } catch {}
  try { return { ok: true, value: JSON.parse(stripTrailingCommas(s)) }; } catch {}
  return { ok: false, value: null };
}
// Chỉ xóa dấu phẩy thừa NGOÀI string (tránh ăn "a,}b" trong nhãn)
function stripTrailingCommas(s) {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue; // bỏ phẩy thừa
    }
    out += ch;
  }
  return out;
}
export function parsePlanJSON(text) {
  if (!text) return null;
  const t = stripFences(text);
  let r = tryParseJSON(t);
  let result = r.ok ? r.value : null;
  if (!r.ok) {
    const objStart = t.indexOf("{"), objEnd = t.lastIndexOf("}");
    const arrStart = t.indexOf("["), arrEnd = t.lastIndexOf("]");
    const objOk = objStart >= 0 && objEnd > objStart;
    const arrOk = arrStart >= 0 && arrEnd > arrStart;
    let cand = t;
    if (objOk && arrOk) cand = arrStart < objStart ? t.slice(arrStart, arrEnd + 1) : t.slice(objStart, objEnd + 1);
    else if (objOk) cand = t.slice(objStart, objEnd + 1);
    else if (arrOk) cand = t.slice(arrStart, arrEnd + 1);
    r = tryParseJSON(cand);
    if (!r.ok) return null;
    result = r.value;
  }
  for (let i = 0; i < 3 && typeof result === "string"; i++) {
    const inner = stripFences(result);
    if (!inner) break;
    const r2 = tryParseJSON(inner);
    if (!r2.ok) break;
    result = r2.value;
  }
  if (typeof result === "string") return null;
  return result;
}

// ── Chuẩn hóa plan từ AI: cắt giới hạn, từ chối rỗng ──
export function normalizePlan(raw, fallbackTopic = "") {
  if (!raw || typeof raw !== "object") return null;
  const topic = String(raw.topic || fallbackTopic || "").trim().slice(0, LIMITS.topic);
  const arr = Array.isArray(raw.branches) ? raw.branches : [];
  const branches = [];
  for (const b of arr) {
    if (branches.length >= LIMITS.branches) break;
    let label = "";
    let children = [];
    if (typeof b === "string") {
      label = b.trim().slice(0, LIMITS.label);
    } else if (b && typeof b === "object") {
      label = String(b.label ?? b.name ?? "").trim().slice(0, LIMITS.label);
      const kids = Array.isArray(b.children) ? b.children : [];
      for (const c of kids) {
        if (children.length >= LIMITS.children) break;
        const s = String(c && typeof c === "object" ? (c.label ?? c.name ?? "") : c ?? "").trim().slice(0, LIMITS.label);
        if (s) children.push(s);
      }
    }
    if (label) branches.push({ label, children });
  }
  if (!topic || !branches.length) return null;
  return { topic, branches };
}

// ── Cắt nguồn quá dài, giữ head + tail ──
function clipSource(text) {
  const s = String(text || "");
  if (s.length <= LIMITS.sourceChars) return s;
  const head = s.slice(0, Math.floor(LIMITS.sourceChars * 0.7));
  const tail = s.slice(-Math.floor(LIMITS.sourceChars * 0.25));
  return `${head}\n...(cắt bớt phần giữa để vừa giới hạn)...\n${tail}`;
}

// ── Gom toàn bộ nguồn người dùng gửi thành 1 block cho prompt ──
export function buildSourceBlock({ topic = "", text = "", smallIdeas = [], hasImage = false } = {}) {
  const parts = [];
  if (topic) parts.push(`CHỦ ĐỀ TRUNG TÂM (bắt buộc dùng đúng): ${topic}`);
  const ideas = (Array.isArray(smallIdeas) ? smallIdeas : []).map((s) => String(s || "").trim()).filter(Boolean);
  if (text) parts.push(`VĂN BẢN NGUỒN:\n${clipSource(text)}`);
  if (hasImage) parts.push("ẢNH ĐÍNH KÈM: hãy đọc trực tiếp nội dung trong ảnh (chữ, bảng, sơ đồ...) và chỉ dùng những gì thấy trong ảnh.");
  // M3: cắt ý nhỏ trước khi gửi — 1 ý 10k ký tự không được phình payload
  if (ideas.length) parts.push(`Ý NHỎ NGƯỜI DÙNG GỬI (bắt buộc đưa vào sơ đồ, giữ nguyên nội dung):\n- ${ideas.map((s) => s.slice(0, 500)).join("\n- ")}`);
  if (!text && !hasImage && !ideas.length && topic) {
    parts.push("CHỈ CÓ CHỦ ĐỀ: dùng kiến thức đúng đắn về chủ đề, không bịa sai sự thật; nếu nguồn không đủ ý thì trả ít nhánh.");
  }
  return parts.join("\n\n");
}

const GENERATION_RULES = `NGUYÊT TẮC BẮT BUỘC:
1. CHỈ được lấy nội dung từ nguồn cung cấp. TUYỆT ĐỐI KHÔNG bịa thêm ý, ví dụ, số liệu, thuật ngữ không có trong nguồn.
2. Nhãn nhánh/con phải là trích xuất hoặc rút gọn sát nghĩa (paraphrase sát) từ nguồn; giữ nguyên thuật ngữ chuyên môn, tên riêng, số liệu gốc.
3. Nếu nguồn ít ý thì trả ít nhánh — KHÔNG kéo cho đủ số bằng cách bịa thêm.
4. Cấu trúc: 2-10 nhánh chính, mỗi nhánh tối đa 8 con, tối đa 3 cấp (tính chủ đề là 1 cấp). Số nhánh/con tự quyết theo độ dày nguồn.
5. Không thêm ghi chú, giải thích, markdown — chỉ JSON.`;

export function buildGenerationPrompt(input) {
  // M4: topic cắt + gửi 1 lần (trước đây lặp 2 lần trong source block và topicLine, dài không cắt)
  const t = String(input?.topic || "").trim().slice(0, LIMITS.topic);
  const src = buildSourceBlock({ ...(input || {}), topic: "" });
  const topicLine = t
    ? `CHỦ ĐỀ TRUNG TÂM (dùng đúng y): ${t}`
    : "CHỦ ĐỀ TRUNG TÂM: để trống — hãy rút một tiêu đề ngắn từ nguồn.";
  return `Tạo sơ đồ tư duy (mindmap) dạng JSON từ nguồn dưới đây.\n\n${GENERATION_RULES}\n\n${topicLine}\n\n${src}\n\nTrả về JSON thuần đúng dạng:\n{"topic":"...","branches":[{"label":"...","children":["..."]}]}`;
}

export function buildValidationPrompt(input, plan) {
  const src = buildSourceBlock(input);
  const labels = [];
  if (plan?.topic) labels.push(`CHỦ ĐỀ: ${plan.topic}`);
  (plan?.branches || []).forEach((b, i) => {
    labels.push(`NHÁNH ${i + 1}: ${b.label}`);
    (b.children || []).forEach((c, j) => labels.push(`  CON ${i + 1}.${j + 1}: ${c}`));
  });
  return `Bạn là bộ kiểm tra CHỐNG BỊA. So sánh từng nhãn trong sơ đồ dưới đây với NGUỒN.

Quy tắc đánh giá:
- HỢP LỆ: nhãn là trích xuất hoặc rút gọn sát nghĩa của nội dung có trong nguồn.
- BỊA: nhãn đưa ra ý/thuật ngữ/số liệu KHÔNG có căn cứ trong nguồn (kể cả khi nó đúng về kiến thức chung — chỉ xét CÓ TRONG NGUỒN hay không).
- Nếu nguồn chỉ có chủ đề: chỉ đánh dấu nhãn BỊA khi nó mâu thuẫn với chủ đề hoặc bịa sự kiện/số liệu cụ thể không kiểm chứng được.

NGUỒN:
${src}

NHÃN CẦN KIỂM TRA:
${labels.join("\n")}

Trả JSON thuần dạng {"fabricated":["nhãn bịa 1",...]} — mảng rỗng nếu tất cả hợp lệ. Chỉ JSON, không markdown.`;
}

// ── Đọc file ảnh → base64 cho Gemini inlineData ──
const REJECTED_IMAGE_MIMES = new Set(["image/svg+xml", "image/heic", "image/heif"]);
export function fileToImagePart(file) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    // M10: file.type rỗng (kéo-thả/đổi tên) thì suy từ đuôi file thay vì mặc định jpeg rồi lỗi ở Gemini
    let mime = file.type || "";
    if (!mime) {
      const ext = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
      mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" }[ext] || "";
      if (!mime) { reject(new Error("Không xác định được loại ảnh — hãy chọn file JPG/PNG/WebP.")); return; }
    }
    if (!/^image\//.test(mime)) { reject(new Error("Chỉ chấp nhận file ảnh (JPG/PNG/WebP).")); return; }
    if (REJECTED_IMAGE_MIMES.has(String(mime).toLowerCase())) {
      reject(new Error("Gemini không đọc được ảnh SVG/HEIC — hãy chuyển sang JPG/PNG rồi thử lại."));
      return;
    }
    if (file.size > LIMITS.imageBytes) { reject(new Error("Ảnh vượt 8MB — hãy chọn ảnh nhỏ hơn.")); return; }
    if (typeof FileReader === "undefined") { reject(new Error("Trình duyệt không hỗ trợ đọc file này.")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const data = s.includes(",") ? s.slice(s.indexOf(",") + 1) : s;
      if (!data) { reject(new Error("Không đọc được nội dung ảnh.")); return; }
      resolve({ mimeType: mime, data });
    };
    reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
    reader.readAsDataURL(file);
  });
}

// ── Local fallback: tách dòng văn bản → plan, nhận diện thụt lề/gạch đầu dòng ──
// Không dùng AI: mọi nhãn đều lấy nguyên từ dòng đã gửi (chỉ bỏ marker đầu dòng).
export function buildLocalPlan({ topic = "", text = "", smallIdeas = [] } = {}) {
  const ideas = (Array.isArray(smallIdeas) ? smallIdeas : []).map((s) => String(s || "").trim()).filter(Boolean);
  const rawLines = String(text || "").split(/\r?\n/);
  const items = [];
  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    const expanded = raw.replace(/\t/g, "    ");
    const indent = (expanded.match(/^ */) || [""])[0].length;
    let label = expanded.trim();
    let isBullet = false;
    const m = label.match(/^([-–—•*+]|\d+[.)]|[a-z][.)])\s+/i);
    if (m) { label = label.slice(m[0].length).trim(); isBullet = true; }
    if (!label) continue;
    items.push({ indent, isBullet, label: label.slice(0, LIMITS.label) });
  }

  let t = String(topic || "").trim().slice(0, LIMITS.topic);
  // Không có chủ đề → dòng đầu tiên thành chủ đề (rút gọn), phần còn lại là nhánh
  if (!t && items.length) {
    t = items[0].label.slice(0, LIMITS.topic);
    items.shift();
  }
  if (!items.length && ideas.length === 0) {
    if (!t) return null;
    // Chỉ có 1 dòng đã dùng làm chủ đề + không có ý nhỏ → không đủ dữ liệu tạo nhánh.
    // Trả null để caller báo LOCAL_EMPTY rõ ràng (trước đây trả branches:[] rồi vẫn throw, gây nhầm).
    return null;
  }
  // Chỉ có chủ đề + ý nhỏ (không có text nhiều dòng) → dùng ý nhỏ làm nhánh
  if (!items.length && ideas.length > 0) {
    if (!t) return null;
    return { topic: t, branches: ideas.slice(0, LIMITS.branches).map((label) => ({ label: String(label).slice(0, LIMITS.label), children: [] })) };
  }

  // Gắn nhãn bullet vào nhánh đứng trước (bullet cùng cột với dòng thường → con của nó)
  const lines = [];
  let prevPlain = null;
  for (const it of items) {
    let effIndent = it.indent;
    if (it.isBullet && prevPlain && it.indent <= prevPlain.indent && !prevPlain.isBullet) {
      effIndent = prevPlain.indent + 1;
    }
    lines.push({ ...it, effIndent });
    if (!it.isBullet) prevPlain = it; else if (prevPlain && it.indent > prevPlain.indent) prevPlain = it;
  }

  // Xây cây theo effIndent (stack), depth > 2 → gộp vào cấp 2 gần nhất
  const branches = [];
  const dropped = { branches: 0, children: 0 }; // M9: đếm dữ liệu bị bỏ do vượt giới hạn
  const stack = []; // {indent, branch}
  for (const ln of lines) {
    while (stack.length && ln.effIndent <= stack[stack.length - 1].indent) stack.pop();
    if (!stack.length) {
      if (branches.length >= LIMITS.branches) { dropped.branches++; continue; }
      const br = { label: ln.label, children: [] };
      branches.push(br);
      stack.push({ indent: ln.effIndent, branch: br });
    } else {
      const top = stack[stack.length - 1];
      if (top.branch.children.length < LIMITS.children) top.branch.children.push(ln.label);
      else dropped.children++;
      stack.push({ indent: ln.effIndent, branch: top.branch });
    }
  }

  // Ý nhỏ (user gửi) luôn được thêm vào — không bịa, chỉ thêm đúng phần user gửi
  for (let ii = 0; ii < ideas.length; ii++) {
    const idea = ideas[ii];
    if (branches.length >= LIMITS.branches) { dropped.branches += ideas.length - ii; break; }
    const key = idea.toLowerCase();
    if (branches.some((b) => b.label.toLowerCase() === key)) continue;
    branches.push({ label: idea.slice(0, LIMITS.label), children: [] });
  }

  if (!t || !branches.length) return null;
  return { topic: t, branches, dropped };
}

// Câu báo số dòng bị bỏ (dùng cho warning local)
export function droppedNote(dropped) {
  const parts = [];
  if (dropped && dropped.branches > 0) parts.push(`${dropped.branches} nhánh`);
  if (dropped && dropped.children > 0) parts.push(`${dropped.children} ý con`);
  if (!parts.length) return "";
  return `Đã bỏ qua ${parts.join(" + ")} vượt giới hạn (tối đa ${LIMITS.branches} nhánh × ${LIMITS.children} con).`;
}

// ── Gọi AI sinh plan ──
async function aiGeneratePlan({ apiKey, model, input, imagePart, feedback }) {
  const prompt = buildGenerationPrompt(input);
  // M2: escape + cắt feedback retry — nhãn chứa quote/dài làm hỏng prompt, phình token
  const fbList = (Array.isArray(feedback) ? feedback : [])
    .slice(0, 6)
    .map((f) => String(f || "").trim().slice(0, 60).replace(/\\/g, "\\\\").replace(/"/g, '\\"'))
    .filter(Boolean);
  const fb = fbList.length
    ? `\n\nLẦN TRƯỚC BẠN ĐÃ BỊA CÁC NHÃN SAO (cần sửa/bỏ, chỉ lấy từ nguồn): ${fbList.map((f) => `"${f}"`).join(", ")}`
    : "";
  const parts = [];
  if (imagePart) parts.push({ inlineData: imagePart });
  parts.push({ text: prompt + fb });
  const text = await aiService.callAI({
    apiKey,
    model,
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: "Bạn là trợ lý tạo sơ đồ tư duy bám sát nguồn, không bịa nội dung. Luôn trả JSON hợp lệ đúng dạng yêu cầu." }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 2400, responseMimeType: "application/json" },
    timeout: 45000,
    maxRetries: 2, // H6: mạng chập chờn 1 lần được thử lại thay vì rớt ngay
    requestId: `wb-mindmap-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const raw = parsePlanJSON(text);
  if (!raw) throw new Error("AI không trả về JSON hợp lệ.");
  return raw;
}

// ── Gọi AI validate nhãn vs nguồn ──
async function aiValidatePlan({ apiKey, model, input, imagePart, plan }) {
  const prompt = buildValidationPrompt(input, plan);
  const parts = [];
  if (imagePart) parts.push({ inlineData: imagePart });
  parts.push({ text: prompt });
  const text = await aiService.callAI({
    apiKey,
    model,
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: "Bạn là bộ kiểm tra chống bịa cho sơ đồ tư duy. Chỉ trả JSON." }] },
    generationConfig: { temperature: 0.0, maxOutputTokens: 800, responseMimeType: "application/json" },
    timeout: 30000,
    maxRetries: 2, // H6: như trên
    requestId: `wb-mindmap-val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const parsed = parsePlanJSON(text);
  // H2: JSON hợp lệ nhưng sai schema (vd {"fabricated":"none"}) là đáng ngờ → lỗi cứng,
  // không được hạ thành warning cho qua. Chỉ rác không parse được mới là lỗi thoáng qua.
  if (parsed && !Array.isArray(parsed.fabricated)) {
    const err = new Error("AI kiểm tra chống bịa trả về sai định dạng — không đưa sơ đồ lên bảng. Hãy bấm Tạo lại.");
    err.code = "VALIDATE_SCHEMA";
    throw err;
  }
  const fab = parsed && Array.isArray(parsed.fabricated) ? parsed.fabricated : null;
  if (!fab) throw new Error("Không kiểm tra được độ bám nguồn.");
  return fab.map((s) => String(s || "").trim()).filter(Boolean);
}

// Hủy mọi request mindmap đang chạy (nút Hủy / đóng modal trong WhiteboardView)
export function cancelMindmapRequests() {
  _cancelFlag = true;
  try { aiService.cancelRequestsByPrefix("wb-mindmap-"); } catch {}
}

// ── API chính ──
// Trả về: { plan, mode: "ai"|"local", warnings: string[], checked: boolean }
// Throw: lỗi người dùng thấy được (không có key + chỉ có ảnh, AI bịa sau retry...)
export async function generateMindmapPlan({
  topic = "",
  text = "",
  imageFile = null,
  smallIdeas = [],
  apiKey = null,
  onStage = null, // H6: (stage) => void — "gen" | "validate" | "retry-gen" | "retry-validate" để UI báo tiến trình
} = {}) {
  const t = String(topic || "").trim();
  const body = String(text || "").trim();
  const ideas = (Array.isArray(smallIdeas) ? smallIdeas : []).map((s) => String(s || "").trim()).filter(Boolean);
  const hasImage = !!imageFile;
  const hasText = !!body;
  const hasContent = hasText || hasImage || ideas.length > 0;

  if (!t && !hasContent) {
    const err = new Error("Nhập chủ đề, dán văn bản hoặc chọn ảnh để tạo sơ đồ.");
    err.code = "NO_INPUT";
    throw err;
  }
  // Pipeline mới → xóa cờ hủy cũ (nút Hủy/đóng modal của lần trước không ảnh hưởng lần này)
  _cancelFlag = false;

  const key = (apiKey ?? getApiKeySafe()) || "";

  // ── Không có key ──
  if (!key) {
    if (hasImage && !hasText && !ideas.length) {
      const err = new Error("Đọc ảnh cần Gemini API Key. Vào Cài đặt → AI để thêm khóa, hoặc dán văn bản thay ảnh.");
      err.code = "NO_KEY_IMAGE";
      throw err;
    }
    if (!hasText && !ideas.length) {
      const err = new Error("Chỉ có chủ đề mà không có API Key — hãy dán văn bản để tạo từ đúng nội dung, hoặc thêm API Key trong Cài đặt.");
      err.code = "NO_KEY_TOPIC_ONLY";
      throw err;
    }
    const plan = buildLocalPlan({ topic: t, text: body, smallIdeas: ideas });
    if (!plan || !plan.branches.length) {
      const err = new Error("Văn bản chưa đủ ý để tạo sơ đồ. Hãy dán nhiều dòng hơn hoặc thêm API Key cho AI.");
      err.code = "LOCAL_EMPTY";
      throw err;
    }
    const warns = ["Không có API Key — tạo sơ đồ từ đúng văn bản bạn gửi (không dùng AI)."];
    if (hasImage) warns.push("Ảnh đính kèm bị bỏ qua (đọc ảnh cần Gemini API Key).");
    if (ideas.length) warns.push(`${ideas.length} ý nhỏ bạn gửi đã được đưa vào sơ đồ theo yêu cầu.`);
    const dn = droppedNote(plan.dropped);
    if (dn) warns.push(dn);
    return { plan, mode: "local", warnings: warns, checked: false };
  }

  // ── Có key → AI ──
  const model = getModel();
  // Ảnh lỗi đọc được thì dùng text/ý nhỏ tiếp thay vì throw thẳng (C2: không mất cả sơ đồ vì 1 file ảnh)
  let imagePart = null;
  const preWarns = [];
  if (hasImage) {
    try {
      imagePart = await fileToImagePart(imageFile);
    } catch (e) {
      preWarns.push(`Không đọc được ảnh (${e?.message || "lỗi file"}) — chỉ dùng văn bản/ý nhỏ.`);
    }
  }
  const input = { topic: t, text: body, smallIdeas: ideas, hasImage: !!imagePart };

  const fallbackIfText = (e) => {
    if (hasText || ideas.length) {
      const plan = buildLocalPlan({ topic: t, text: body, smallIdeas: ideas });
      if (plan && plan.branches.length) {
        const warns = [...preWarns, `AI gián đoạn (${e?.message || "lỗi kết nối"}) — tạo từ đúng văn bản bạn gửi.`];
        if (hasImage && imagePart) warns.push("Ảnh đính kèm bị bỏ qua trong sơ đồ local này (chỉ AI mới đọc được ảnh).");
        if (ideas.length) warns.push(`${ideas.length} ý nhỏ bạn gửi đã được đưa vào sơ đồ theo yêu cầu.`);
        const dn = droppedNote(plan.dropped);
        if (dn) warns.push(dn);
        return { plan, mode: "local", warnings: warns, checked: false };
      }
    }
    return null;
  };
  const stage = (s) => { try { if (onStage) onStage(s); } catch {} };
  // H4: nói rõ nguồn bị cắt giữa + ý nhỏ bị nhồi vào — áp cho mọi kết quả đường AI
  const srcNotes = [];
  if (body.length > LIMITS.sourceChars) srcNotes.push("Văn bản quá dài — AI chỉ đọc phần đầu + cuối, phần giữa bị cắt.");
  if (ideas.length) srcNotes.push(`${ideas.length} ý nhỏ bạn gửi đã được đưa vào sơ đồ theo yêu cầu.`);
  const aiWarns = (extra = []) => [...preWarns, ...srcNotes, ...extra];

  let plan = null;
  try {
    throwIfCancelled();
    stage("gen");
    const raw = await aiGeneratePlan({ apiKey: key, model, input, imagePart, feedback: null });
    throwIfCancelled();
    plan = normalizePlan(raw, t);
    // M1: AI trả array trần (thiếu topic) thì báo đúng bệnh thay vì lỗi chung
    if (!plan && Array.isArray(raw)) throw new Error("AI trả về danh sách thay vì sơ đồ (thiếu chủ đề). Hãy bấm Tạo lại hoặc bổ sung nguồn.");
    if (!plan) throw new Error("AI trả về dữ liệu sơ đồ không hợp lệ.");
  } catch (e) {
    if (e?.code === "CANCELLED" || _cancelFlag) {
      const err = new Error("Đã hủy tạo sơ đồ.");
      err.code = "CANCELLED";
      throw err;
    }
    // C2: key sai/hết hạn phải báo thẳng — không fallback local che lấp
    if (isAuthError(e)) {
      const err = new Error("API Key không hợp lệ hoặc hết hạn — kiểm tra lại trong Cài đặt → AI. Chưa tạo sơ đồ nào.");
      err.code = "AUTH";
      err.status = e?.status;
      throw err;
    }
    const fb = fallbackIfText(e);
    if (fb) return fb;
    throw new Error(getFriendlyErrorMessage(e?.status, e?.message) || e?.message || "AI tạo sơ đồ thất bại. Thử lại nhé!");
  }

  // ── Validate thứ 2: đối chiếu nhãn với nguồn (chống bịa) ──
  // Chỉ validate khi có nguồn thực (văn bản/ảnh/ý nhỏ); chỉ có chủ đề thì không có gì để đối chiếu.
  if (!hasContent) {
    return { plan, mode: "ai", warnings: aiWarns(["Chỉ có chủ đề — AI tự mở rộng, không đối chiếu được nguồn. Hãy kiểm tra kỹ nội dung."]), checked: false };
  }

  let fabricated = [];
  try {
    throwIfCancelled();
    stage("validate");
    fabricated = await aiValidatePlan({ apiKey: key, model, input, imagePart, plan });
    throwIfCancelled();
  } catch (e) {
    if (e?.code === "CANCELLED" || _cancelFlag) {
      const err = new Error("Đã hủy tạo sơ đồ.");
      err.code = "CANCELLED";
      throw err;
    }
    // H2: validator sai schema là đáng ngờ → lỗi cứng, không cho qua bằng warning
    if (e?.code === "VALIDATE_SCHEMA") throw e;
    // Không kiểm tra được → vẫn cho dùng nhưng cảnh báo rõ
    return { plan, mode: "ai", warnings: aiWarns([`Không đối chiếu được độ bám nguồn (${e?.message || "lỗi"}) — hãy tự kiểm tra nội dung.`]), checked: false };
  }

  if (!fabricated.length) {
    return { plan, mode: "ai", warnings: aiWarns(), checked: true };
  }

  // ── Retry 1 lần kèm feedback các nhãn bịa ──
  try {
    throwIfCancelled();
    stage("retry-gen");
    const raw2 = await aiGeneratePlan({ apiKey: key, model, input, imagePart, feedback: fabricated });
    throwIfCancelled();
    const plan2 = normalizePlan(raw2, t);
    if (!plan2 && Array.isArray(raw2)) throw new Error("AI trả về danh sách thay vì sơ đồ sau retry (thiếu chủ đề).");
    if (!plan2) throw new Error("AI trả về dữ liệu không hợp lệ sau retry.");
    let fab2 = [];
    try {
      throwIfCancelled();
      stage("retry-validate");
      fab2 = await aiValidatePlan({ apiKey: key, model, input, imagePart, plan: plan2 });
      throwIfCancelled();
    } catch (e) {
      // Người dùng dừng → không được nuốt thành cảnh báo
      if (e?.code === "CANCELLED" || _cancelFlag) {
        const err = new Error("Đã hủy tạo sơ đồ.");
        err.code = "CANCELLED";
        throw err;
      }
      if (e?.code === "VALIDATE_SCHEMA") throw e;
      // Validate lỗi lần 2 → chấp nhận plan đã sửa, cảnh báo
      return { plan: plan2, mode: "ai", warnings: aiWarns([`Đã sửa các nhãn bịa (${fabricated.slice(0, 3).join(", ")}) nhưng không kiểm tra lại được.`]), checked: false };
    }
    if (!fab2.length) {
      return { plan: plan2, mode: "ai", warnings: aiWarns([`Đã sửa ${fabricated.length} nhãn bịa từ lần tạo trước.`]), checked: true };
    }
    // Vẫn bịa sau retry → báo lỗi, KHÔNG đưa lên canvas
    const err = new Error(`AI vẫn bịa nội dung không có trong nguồn: "${fab2.slice(0, 3).join('", "')}". Hãy bổ sung nguồn chi tiết hơn hoặc thử lại.`);
    err.code = "FABRICATED";
    throw err;
  } catch (e) {
    if (e?.code === "FABRICATED" || e?.code === "VALIDATE_SCHEMA" || e?.code === "CANCELLED" || _cancelFlag) {
      if (_cancelFlag && e?.code !== "FABRICATED" && e?.code !== "VALIDATE_SCHEMA") {
        const err = new Error("Đã hủy tạo sơ đồ.");
        err.code = "CANCELLED";
        throw err;
      }
      throw e;
    }
    if (isAuthError(e)) {
      const err = new Error("API Key không hợp lệ hoặc hết hạn — kiểm tra lại trong Cài đặt → AI. Chưa tạo sơ đồ nào.");
      err.code = "AUTH";
      err.status = e?.status;
      throw err;
    }
    const fb = fallbackIfText(e);
    if (fb) return fb;
    throw new Error(getFriendlyErrorMessage(e?.status, e?.message) || e?.message || "AI tạo sơ đồ thất bại. Thử lại nhé!");
  }
}
