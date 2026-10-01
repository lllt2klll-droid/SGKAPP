// ── AI Mindmap Service — tạo sơ đồ tư duy bám sát nội dung người dùng gửi ──
// Nguyên tắc: KHÔNG BỊA. Mọi nhãn nhánh/con phải là trích xuất hoặc rút gọn
// sát nghĩa từ văn bản/ảnh được gửi. Có bước validate thứ 2 đối chiếu nhãn
// với nguồn; nếu vẫn bịa sau 1 lần retry → throw (không đưa lên canvas).
// Không có API key / AI gián đoạn → fallback local tách dòng (vẫn đúng nguồn).

import aiService, { getFriendlyErrorMessage } from "../aiService.js";
import { getGeminiApiKey } from "../storage.js";
import { loadSettings } from "../settingsStore.js";

const LIMITS = {
  topic: 200,
  branches: 10,
  children: 8,
  label: 120,
  sourceChars: 12000, // cắt bớt nguồn quá dài (giữ head + tail)
  imageBytes: 8 * 1024 * 1024,
};

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
  try { return { ok: true, value: JSON.parse(s.replace(/,\s*([}\]])/g, "$1")) }; } catch {}
  return { ok: false, value: null };
}
export function parsePlanJSON(text) {
  if (!text) return null;
  const t = stripFences(text);
  let r = tryParseJSON(t);
  let result = r.ok ? r.value : null;
  if (!r.ok) {
    const objStart = t.indexOf("{"), objEnd = t.lastIndexOf("}");
    const arrStart = t.indexOf("["), arrEnd = t.lastIndexOf("]");
    let cand = null;
    if (objStart >= 0 && objEnd > objStart) cand = t.slice(objStart, objEnd + 1);
    else if (arrStart >= 0 && arrEnd > arrStart) cand = t.slice(arrStart, arrEnd + 1);
    else cand = t;
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
  if (ideas.length) parts.push(`Ý NHỎ NGƯỜI DÙNG GỬI (bắt buộc đưa vào sơ đồ, giữ nguyên nội dung):\n- ${ideas.join("\n- ")}`);
  if (!text && !hasImage && !ideas.length && topic) {
    parts.push("CHỈ CÓ CHỦ ĐỀ: dùng kiến thức đúng đắn về chủ đề, không bịa sai sự thật; nếu nguồn không đủ ý thì trả ít nhánh.");
  }
  return parts.join("\n\n");
}

const GENERATION_RULES = `NGUYÊT TẮC BẮT BUỘC:
1. CHỈ được lấy nội dung từ nguồn cung cấp. TUYỆT ĐỐI KHÔNG bịa thêm ý, ví dụ, số liệu, thuật ngữ không có trong nguồn.
2. Nhãn nhánh/con phải là trích xuất hoặc rút gọn sát nghĩa (paraphrase sát) từ nguồn; giữ nguyên thuật ngữ chuyên môn, tên riêng, số liệu gốc.
3. Nếu nguồn ít ý thì trả ít nhánh — KHÔNG kéo cho đủ số bằng cách bịa thêm.
4. Cấu trúc: 2-8 nhánh chính, mỗi nhánh tối đa 4 con, tối đa 3 cấp (tính chủ đề là 1 cấp). Số nhánh/con tự quyết theo độ dày nguồn.
5. Không thêm ghi chú, giải thích, markdown — chỉ JSON.`;

export function buildGenerationPrompt(input) {
  const src = buildSourceBlock(input);
  const topicLine = input?.topic
    ? `CHỦ ĐỀ TRUNG TÂM (dùng đúng y): ${input.topic}`
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
export function fileToImagePart(file) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    const mime = file.type || "image/jpeg";
    if (!/^image\//.test(mime)) { reject(new Error("Chỉ chấp nhận file ảnh (JPG/PNG/WebP).")); return; }
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
    // Chỉ có 1 dòng (đã dùng làm chủ đề) → không đủ ý, nhưng vẫn cho tạo với nhánh từ chính dòng đó
    return { topic: t, branches: [] };
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
  const stack = []; // {indent, branch}
  for (const ln of lines) {
    while (stack.length && ln.effIndent <= stack[stack.length - 1].indent) stack.pop();
    if (!stack.length) {
      if (branches.length >= LIMITS.branches) continue;
      const br = { label: ln.label, children: [] };
      branches.push(br);
      stack.push({ indent: ln.effIndent, branch: br });
    } else {
      const top = stack[stack.length - 1];
      if (top.branch.children.length < LIMITS.children) top.branch.children.push(ln.label);
      stack.push({ indent: ln.effIndent, branch: top.branch });
    }
  }

  // Ý nhỏ (user gửi) luôn được thêm vào — không bịa, chỉ thêm đúng phần user gửi
  for (const idea of ideas) {
    if (branches.length >= LIMITS.branches) break;
    if (branches.some((b) => b.label === idea)) continue;
    branches.push({ label: idea.slice(0, LIMITS.label), children: [] });
  }

  if (!t || !branches.length) return null;
  return { topic: t, branches };
}

// ── Gọi AI sinh plan ──
async function aiGeneratePlan({ apiKey, model, input, imagePart, feedback }) {
  const prompt = buildGenerationPrompt(input);
  const fb = (Array.isArray(feedback) && feedback.length)
    ? `\n\nLẦN TRƯỚC BẠN ĐÃ BỊA CÁC NHÃN SAO (cần sửa/bỏ, chỉ lấy từ nguồn): ${feedback.map((f) => `"${f}"`).join(", ")}`
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
    maxRetries: 1,
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
    maxRetries: 1,
    requestId: `wb-mindmap-val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const parsed = parsePlanJSON(text);
  const fab = parsed && Array.isArray(parsed.fabricated) ? parsed.fabricated : null;
  if (!fab) throw new Error("Không kiểm tra được độ bám nguồn.");
  return fab.map((s) => String(s || "").trim()).filter(Boolean);
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
    return { plan, mode: "local", warnings: ["Không có API Key — tạo sơ đồ từ đúng văn bản bạn gửi (không dùng AI)."], checked: false };
  }

  // ── Có key → AI ──
  const input = { topic: t, text: body, smallIdeas: ideas, hasImage };
  const model = getModel();
  let imagePart = null;
  if (hasImage) imagePart = await fileToImagePart(imageFile);

  const fallbackIfText = (e) => {
    if (hasText || ideas.length) {
      const plan = buildLocalPlan({ topic: t, text: body, smallIdeas: ideas });
      if (plan && plan.branches.length) {
        return { plan, mode: "local", warnings: [`AI gián đoạn (${e?.message || "lỗi kết nối"}) — tạo từ đúng văn bản bạn gửi.`], checked: false };
      }
    }
    return null;
  };

  let plan = null;
  try {
    const raw = await aiGeneratePlan({ apiKey: key, model, input, imagePart, feedback: null });
    plan = normalizePlan(raw, t);
    if (!plan) throw new Error("AI trả về dữ liệu sơ đồ không hợp lệ.");
  } catch (e) {
    if (e?.code === "CANCELLED") throw e;
    const fb = fallbackIfText(e);
    if (fb) return fb;
    throw new Error(getFriendlyErrorMessage(e?.status, e?.message) || e?.message || "AI tạo sơ đồ thất bại. Thử lại nhé!");
  }

  // ── Validate thứ 2: đối chiếu nhãn với nguồn (chống bịa) ──
  // Chỉ validate khi có nguồn thực (văn bản/ảnh/ý nhỏ); chỉ có chủ đề thì không có gì để đối chiếu.
  if (!hasContent) {
    return { plan, mode: "ai", warnings: ["Chỉ có chủ đề — AI tự mở rộng, không đối chiếu được nguồn. Hãy kiểm tra kỹ nội dung."], checked: false };
  }

  let fabricated = [];
  try {
    fabricated = await aiValidatePlan({ apiKey: key, model, input, imagePart, plan });
  } catch (e) {
    if (e?.code === "CANCELLED") throw e;
    // Không kiểm tra được → vẫn cho dùng nhưng cảnh báo rõ
    return { plan, mode: "ai", warnings: [`Không đối chiếu được độ bám nguồn (${e?.message || "lỗi"}) — hãy tự kiểm tra nội dung.`], checked: false };
  }

  if (!fabricated.length) {
    return { plan, mode: "ai", warnings: [], checked: true };
  }

  // ── Retry 1 lần kèm feedback các nhãn bịa ──
  try {
    const raw2 = await aiGeneratePlan({ apiKey: key, model, input, imagePart, feedback: fabricated });
    const plan2 = normalizePlan(raw2, t);
    if (!plan2) throw new Error("AI trả về dữ liệu không hợp lệ sau retry.");
    let fab2 = [];
    try {
      fab2 = await aiValidatePlan({ apiKey: key, model, input, imagePart, plan: plan2 });
    } catch {
      // Validate lỗi lần 2 → chấp nhận plan đã sửa, cảnh báo
      return { plan: plan2, mode: "ai", warnings: [`Đã sửa các nhãn bịa (${fabricated.slice(0, 3).join(", ")}) nhưng không kiểm tra lại được.`], checked: false };
    }
    if (!fab2.length) {
      return { plan: plan2, mode: "ai", warnings: [`Đã sửa ${fabricated.length} nhãn bịa từ lần tạo trước.`], checked: true };
    }
    // Vẫn bịa sau retry → báo lỗi, KHÔNG đưa lên canvas
    const err = new Error(`AI vẫn bịa nội dung không có trong nguồn: "${fab2.slice(0, 3).join('", "')}". Hãy bổ sung nguồn chi tiết hơn hoặc thử lại.`);
    err.code = "FABRICATED";
    throw err;
  } catch (e) {
    if (e?.code === "FABRICATED" || e?.code === "CANCELLED") throw e;
    const fb = fallbackIfText(e);
    if (fb) return fb;
    throw new Error(getFriendlyErrorMessage(e?.status, e?.message) || e?.message || "AI tạo sơ đồ thất bại. Thử lại nhé!");
  }
}
