// ── Scan AI Service — phân tích vùng SGK và tạo học liệu ────────────────
// Uses aiService.js for all AI calls (consistent error handling, retry, timeout).
import aiService, { getFriendlyErrorMessage } from "../aiService.js";
import { loadSettings } from "../settingsStore.js";
import { dataUrlToBase64 } from "./scanCapture.js";
import { getGeminiApiKey } from "../storage.js";

function getModel() {
  try { return loadSettings().ai?.model || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; }
}
function getApiKeySafe() {
  try {
    const k = getGeminiApiKey();
    if (k) return k;
  } catch {}
  return "";
}

function tryParseJSON(s) {  try { return { ok: true, value: JSON.parse(s) }; } catch {}
  try { return { ok: true, value: JSON.parse(s.replace(/,\s*([}\]])/g, "$1")) }; } catch {}
  return { ok: false, value: null };
}

function stripFences(s) {
  return String(s || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function parseJSONSafe(text) {
  if (!text) return null;
  const t = stripFences(text);

  // 1) Parse toàn chuỗi trước (bắt JSON bọc kép "...{...}..." nguyên vẹn)
  let r = tryParseJSON(t);
  let result = r.ok ? r.value : null;

  // 2) Fallback: cắt khối {...} / [...] khi AI chèn chữ xung quanh
  if (!r.ok) {
    const objStart = t.indexOf("{");
    const objEnd = t.lastIndexOf("}");
    const arrStart = t.indexOf("[");
    const arrEnd = t.lastIndexOf("]");
    let cand = null;
    if (objStart >= 0 && objEnd > objStart) {
      cand = t.slice(objStart, objEnd + 1);
    } else if (arrStart >= 0 && arrEnd > arrStart) {
      cand = t.slice(arrStart, arrEnd + 1);
    } else {
      cand = t;
    }
    r = tryParseJSON(cand);
    if (!r.ok) return null;
    result = r.value;
  }

  // Unwrap double-encoded JSON: AI đôi khi trả chuỗi JSON chứa JSON
  // ("{\"title\": ...}") — parse lặp tới khi ra object/array.
  for (let i = 0; i < 3 && typeof result === "string"; i++) {
    const inner = stripFences(result);
    if (!inner) break;
    const r2 = tryParseJSON(inner);
    if (!r2.ok) break;
    result = r2.value;
  }
  // Vẫn là string (AI trả văn bản thuần) → coi như parse thất bại để UI dùng fallback raw
  if (typeof result === "string") return null;
  return result;
}

function normalizeAnalysis(parsed, text, book, page) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      subject: parsed.subject || book?.subject || "Khác",
      grade: Number(parsed.grade) || book?.grade || 1,
      topic: parsed.topic || "",
      content: parsed.content || text.slice(0, 1000),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      existingQuestions: Array.isArray(parsed.existingQuestions) ? parsed.existingQuestions : [],
      suggestedMaterials: Array.isArray(parsed.suggestedMaterials) && parsed.suggestedMaterials.length ? parsed.suggestedMaterials : ["worksheet", "question", "game"],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      raw: text,
      source: { book: book?.filename || book?.title || "", page },
    };
  }
  return null;
}

/**
 * Phân tích vùng scan: image + metadata → structured analysis
 * @param {{dataUrl:string, book:object, page:number}} scan
 */
export async function analyzeScan({ dataUrl, book, page }) {
  if (!dataUrl) throw new Error("Thiếu ảnh vùng quét. Hãy khoanh lại vùng SGK.");
  const base64 = dataUrlToBase64(dataUrl);
  if (!base64 || base64.length < 100) throw new Error("Ảnh vùng quét quá nhỏ hoặc rỗng.");
  const mime = "image/jpeg";
  const model = getModel();
  const apiKey = getApiKeySafe();
  if (!apiKey) throw new Error("Chưa có API Key Gemini. Vào Cài đặt → AI để nhập khóa.");

  const prompt = `Bạn là chuyên gia SGK tiểu học GDPT 2018 (bộ Kết nối tri thức).
Hãy phân tích VÙNG SGK được khoanh trong ảnh.

Sách: ${book?.title || book?.filename || "SGK"} — Lớp ${book?.grade || "?"} — Môn ${book?.subject || "?"} — Trang ${page}
Yêu cầu:
- Xác định chủ đề, môn, lớp (suy ra nếu thiếu), kiến thức chính, từ khóa, dạng bài (bài tập, đoạn văn, bảng, sơ đồ…)
- TRÍCH NGUYÊN VĂN 100% câu hỏi / đề bài / dữ liệu / bảng / sơ đồ có trong hình vào existingQuestions (mỗi phần tử là 1 câu/1 bài, SAO CHÉP từng chữ, giữ số liệu, dấu câu — TUYỆT ĐỐI không diễn đạt lại, không tóm tắt, không gộp câu)
- Trích đoạn văn bản súc tích 200-400 chữ vào content (giữ nguyên từ ngữ SGK)
- Đề xuất 2-3 mục tiêu có thể khai thác
- Nếu hình mờ/khó đọc: ghi confidence thấp (0.4-0.6) và ghi chú cần kiểm tra
- KHÔNG bịa nội dung ngoài ảnh

Trả về JSON thuần (không markdown fence):
{
  "subject": "Toán",
  "grade": 3,
  "topic": "phép chia có dư",
  "content": "Trích nguyên văn súc tích 200-400 chữ…",
  "keyPoints": ["ý chính 1","ý chính 2"],
  "existingQuestions": ["Câu 1: …"],
  "suggestedMaterials": ["game","worksheet","question"],
  "confidence": 0.85,
  "source": {"book":${JSON.stringify(book?.filename || "")},"page":${Number(page) || 0}}
}`;

  let text;
  try {
    text = await aiService.callAI({
      apiKey,
      model,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: base64 } },
          { text: prompt },
        ],
      }],
      systemInstruction: { parts: [{ text: "Bạn là trợ lý sư phạm AI đọc SGK — chỉ bám sát nội dung trong ảnh, không bịa. Luôn trả về JSON hợp lệ." }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: "application/json" },
      requestId: `scan-analyze-${Date.now()}`,
    });
  } catch (e) {
    // Giữ nguyên AIError (CANCELLED/TIMEOUT/NO_API_KEY…) — wrap thành Error thường làm mất code
    if (e && typeof e.code === "string" && e.code) throw e;
    throw new Error(getFriendlyErrorMessage(e.status, e.message) || e.message || "AI phân tích lỗi");
  }

  const parsed = parseJSONSafe(text);
  const norm = normalizeAnalysis(parsed, text, book, page);
  if (norm) return norm;
  // fallback: return raw text as content with warning confidence
  return {
    subject: book?.subject || "Khác",
    grade: book?.grade || 1,
    topic: "",
    content: text.slice(0, 1200),
    keyPoints: [],
    existingQuestions: [],
    suggestedMaterials: ["worksheet", "question", "game"],
    confidence: 0.45,
    raw: text,
    source: { book: book?.filename || book?.title, page },
  };
}

// ── Helpers for generation prompts ───────────────────────────────────────
function fidelityInstruction(fidelity, keepOriginal) {
  if (keepOriginal || fidelity === "Giữ nguyên gốc") return "GIỮ NGUYÊN GỐC tuyệt đối: sao chép nguyên văn 100% câu hỏi/bài tập/số liệu trong ảnh, không diễn đạt lại, không đổi đáp án, không thêm kiến thức ngoài SGK. Chỉ được bổ sung câu hỏi mới SAU khối nguyên bản và ghi rõ nguồn.";
  if (fidelity === "Sáng tạo mở rộng") return "Có thể mở rộng, thêm ví dụ liên hệ thực tế nhưng vẫn bám mục tiêu SGK.";
  if (fidelity === "Biến đổi nhẹ") return "Biến đổi nhẹ: giữ cấu trúc SGK, diễn đạt lại cho tự nhiên, thêm 1-2 câu hỏi mở rộng.";
  return "Bám sát SGK tuyệt đối: không đổi số liệu/đáp án, không thêm kiến thức ngoài SGK.";
}

function keepOriginalBlock(analysis) {
  const list = Array.isArray(analysis?.existingQuestions) ? analysis.existingQuestions.filter(Boolean) : [];
  if (!list.length) return "— (vùng này không có câu hỏi riêng; giữ nguyên đoạn trích/bảng/sơ đồ làm nguồn)";
  return list.map((q, i) => `${i + 1}. ${q}`).join("\n");
}

/**
 * Tạo học liệu từ scan + loại đã chọn
 * Supports: game, worksheet, question, activity, note
 */
export async function generateMaterial({ scan, analysis, materialType, config }) {
  if (!scan?.dataUrl) throw new Error("Thiếu ảnh vùng quét.");
  const base64 = dataUrlToBase64(scan.dataUrl);
  const mime = "image/jpeg";
  const model = getModel();
  const apiKey = getApiKeySafe();
  if (!apiKey) throw new Error("Chưa có API Key Gemini.");
  const book = scan.book || {};

  const keepOriginal = !!config?.keepOriginal || config?.fidelity === "Giữ nguyên gốc" || materialType === "original";
  const basePrompt = `Nguồn SGK: "${book.title || book.filename || "SGK"}" — Lớp ${book.grade || "?"} — Môn ${book.subject || analysis?.subject || "?"} — Trang ${scan.page}
Chủ đề AI: ${analysis?.topic || "(chưa rõ)"}
Trích SGK: ${analysis?.content?.slice(0, 700) || "(xem ảnh)"}
Từ khóa: ${(analysis?.keyPoints || []).slice(0, 5).join("; ") || "—"}
Câu hỏi/bài tập GỐC trong ảnh (PHẢI giữ nguyên văn):
${keepOriginalBlock(analysis)}
Chỉ dẫn GV: ${config?.teacherInstruction || "—"}
Mức bám nguồn: ${config?.fidelity || "Giữ nguyên gốc"} — ${fidelityInstruction(config?.fidelity, keepOriginal)}
${keepOriginal ? "QUY TẮC GIỮ GỐC: mọi câu trong khối gốc phải xuất hiện NGUYÊN VĂN (kèm cờ origin:\"sgk_original\"), đứng đầu danh sách, theo đúng thứ tự trong sách." : ""}`;

  const originRule = keepOriginal
    ? `\nQUY TẮC BẮT BUỘC: đưa toàn bộ câu gốc ở trên vào đầu mảng questions, mỗi câu giữ NGUYÊN TỪNG CHỮ và thêm "origin":"sgk_original". Câu bổ sung (nếu có) đặt SAU và thêm "origin":"ai".`
    : "";

  // Tùy chỉnh nâng cao trong ScanModal: xáo trộn vị trí đáp án đúng (câu trắc nghiệm)
  const shuffleRule = config?.randomizeAnswers
    ? `\nXÁO TRỘN ĐÁP ÁN: với câu trắc nghiệm, đặt đáp án đúng ở vị trí ngẫu nhiên trong options (không để luôn ở vị trí đầu), không lặp lại cùng một vị trí cho mọi câu.`
    : "";

  let prompt = "";
  let maxTokens = 3000;
  if (materialType === "original") {
    prompt = `${basePrompt}
Nhiệm vụ: SỐ HÓA NGUYÊN BẢN vùng SGK trên — giữ nguyên 100% câu hỏi/bài tập/đề bài/số liệu, không diễn đạt lại.
- Mỗi câu/bài gốc là 1 phần tử questions: {q:"<nguyên văn từng chữ>", question:"<nguyên văn>", type:"essay", origin:"sgk_original", mucdo:"${config?.level || "Hiểu"}"}
- Nếu câu gốc là trắc nghiệm trong sách (có A/B/C/D): giữ options nguyên văn + correctIndex đúng theo sách, origin sgk_original.
- KHÔNG tự bịa thêm câu mới. Nếu ảnh mờ không đọc được: để nguyên văn đọc được + thêm "(cần đối chiếu sách)" vào explanation.
Trả về JSON thuần:
{"title":"Nguyên bản ${book.title || "SGK"} tr.${scan.page}","instructions":"Phiếu giữ nguyên câu hỏi/bài tập SGK — in trực tiếp","questions":[{"q":"<nguyên văn>","question":"<nguyên văn>","type":"essay","origin":"sgk_original","mucdo":"${config?.level || "Hiểu"}","yccd":""}]}`;
    maxTokens = 4000;
  } else if (materialType === "game") {
    const gameType = config?.gameType || "Quiz";
    const n = Math.min(20, Math.max(3, Number(config?.numQuestions) || 8));
    prompt = `${basePrompt}
Nhiệm vụ: Tạo TRÒ CHƠI học tập dạng "${gameType}" cho HS tiểu học.
Yêu cầu: ${n} câu, độ khó ${config?.difficulty || "Trung bình"}, đối tượng ${config?.audience || "Cá nhân"}, thời lượng ${config?.timeLimit || "5 phút"}.
- Nếu là Ghép đôi: tạo pairs [{a:"...vi...", b:"..."}]
- Nếu Quiz/Kahoot: tạo questions [{q:"...", options:["A","B","C","D"], answer:0 (0-3), explanation:"..."}]
Ngôn ngữ: tiếng Việt, vui nhộn nhưng chính xác sư phạm.${originRule}${shuffleRule}
Trả về JSON thuần:
{"title":"Tên trò chơi","type":"${gameType}","instructions":"Hướng dẫn chơi 2-3 câu","questions":[{"q":"...","options":["A","B","C","D"],"answer":0,"explanation":"...","origin":"sgk_original"}],"timeLimit":"5 phút"}`;
    maxTokens = 4500;
  } else if (materialType === "worksheet") {
    const qType = config?.questionType || "Trắc nghiệm";
    const n = Math.min(20, Math.max(5, Number(config?.numQuestions) || 10));
    prompt = `${basePrompt}
Nhiệm vụ: Tạo PHIẾU HỌC TẬP (in được) ${n} câu, loại "${qType}", mức độ ${config?.level || "Hiểu"}, ${config?.withAnswer ? "CÓ đáp án/ hướng dẫn chấm" : "KHÔNG cần in đáp án"}.
Cấu trúc mỗi câu: {q:"đề", type:"mc|essay|fill", options:["A","B","C","D"] (nếu mc), answer:0 hoặc "đáp án mẫu", explanation:"", mucdo:"Biết|Hiểu|Vận dụng", yccd:"", origin:"sgk_original|ai"}${originRule}${shuffleRule}
Trả về JSON thuần:
{"title":"Tiêu đề phiếu","instructions":"Hướng dẫn HS 1-2 câu","questions":[{"q":"...","type":"mc","options":["A","B","C","D"],"answer":0,"explanation":"...","mucdo":"Hiểu","yccd":"","origin":"sgk_original"}]}`;
    maxTokens = 5000;
  } else if (materialType === "question") {
    const n = Math.min(20, Math.max(3, Number(config?.numQuestions) || 10));
    prompt = `${basePrompt}
Nhiệm vụ: Tạo ${n} CÂU HỎI cho NGÂN HÀNG (mỗi câu độc lập, chuẩn GDPT 2018).
Loại: ${config?.questionType || "Trắc nghiệm"} (nếu "Tự luận" thì bỏ options), mức độ ${config?.level || "Hiểu"}.
Mỗi câu: {question:"...", type:"mc|essay", options:["A","B","C","D"], correctIndex:0, answer:"giải thích/đáp án tự luận", mucdo:"${config?.level || "Hiểu"}", yccd:"...", origin:"sgk_original|ai"}${originRule}${shuffleRule}
Trả về JSON thuần:
{"questions":[{"question":"...","type":"mc","options":["A","B","C","D"],"correctIndex":0,"answer":"","mucdo":"${config?.level || "Hiểu"}","yccd":"","origin":"sgk_original"}]}`;
    maxTokens = 4000;
  } else if (materialType === "activity") {
    prompt = `${basePrompt}
Nhiệm vụ: Tạo 1 HOẠT ĐỘNG DẠY HỌC dùng trong Kế hoạch bài dạy (KHBD).
Giai đoạn: ${config?.phase || "Luyện tập"} (khoiDong|khamPha|luyenTap|vanDung)
Yêu cầu: tên hoạt động, mục tiêu (1-2 câu), thời lượng ${config?.duration || "15 phút"}, cách tiến hành (GV làm gì / HS làm gì), sản phẩm, đánh giá.
Trả về JSON thuần:
{"name":"Tên hoạt động","phase":"${config?.phase || "luyenTap"}","duration":"15 phút","objective":"...","content":"Mô tả chung","steps":[{"teacherAction":"GV: ...","studentAction":"HS: ..."}],"assessment":"...","products":"..."}`;
    maxTokens = 3000;
  } else {
    // note
    prompt = `${basePrompt}
Nhiệm vụ: Tạo GHI CHÚ có cấu trúc (dạng Cornell / tóm tắt) từ vùng SGK trên để GV lưu nhanh.
Gồm: tiêu đề, tóm tắt, ý chính (bullet), câu hỏi gợi mở, liên hệ thực tế.
Trả về JSON thuần:
{"title":"Tiêu đề ghi chú","summary":"Tóm tắt 2-3 câu","keyPoints":["..."],"questions":["..."],"content":"Nội dung ghi chú đầy đủ (markdown nhẹ được)"}`;
    maxTokens = 2000;
  }

  let text;
  try {
    text = await aiService.callAI({
      apiKey,
      model,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: base64 } }, { text: prompt }] }],
      systemInstruction: { parts: [{ text: "Bạn là trợ lý tạo học liệu bám sát SGK tiểu học. Ưu tiên cao nhất: giữ NGUYÊN VĂN câu hỏi/bài tập/số liệu trong ảnh, không diễn đạt lại, không đổi đáp án. Luôn trả JSON hợp lệ." }] },
      generationConfig: { temperature: 0.55, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
      requestId: `scan-gen-${materialType}-${Date.now()}`,
    });
  } catch (e) {
    // Giữ nguyên AIError (CANCELLED/TIMEOUT/NO_API_KEY…) — wrap thành Error thường làm mất code
    if (e && typeof e.code === "string" && e.code) throw e;
    throw new Error(getFriendlyErrorMessage(e.status, e.message) || e.message || "AI tạo học liệu lỗi");
  }

  let parsed = parseJSONSafe(text);
  // Chuẩn hóa hình dạng: mảng trần → {questions}; questions dạng chuỗi → parse; tỉa title
  try {
    if (Array.isArray(parsed)) {
      parsed = { questions: parsed };
    } else if (parsed && typeof parsed === "object") {
      if (typeof parsed.questions === "string") {
        const qParsed = parseJSONSafe(parsed.questions);
        if (Array.isArray(qParsed)) parsed.questions = qParsed;
      }
      for (const k of ["title", "name"]) {
        if (typeof parsed[k] === "string") parsed[k] = parsed[k].trim().replace(/^["“”']+|["“”']+$/g, "");
      }
    }
  } catch {}
  // Đảm bảo giữ gốc phía client: nếu AI bỏ sót câu gốc, tự chèn nguyên văn lên đầu
  try {
    const originals = Array.isArray(analysis?.existingQuestions) ? analysis.existingQuestions.filter(Boolean) : [];
    if ((keepOriginal || materialType === "original") && originals.length && parsed && Array.isArray(parsed.questions)) {
      const hasText = (q) => String(q?.q || q?.question || "").trim();
      const existing = new Set(parsed.questions.map(hasText));
      const missing = originals.filter((t) => t && !existing.has(String(t).trim()));
      if (missing.length) {
        const injected = missing.map((t) => ({
          q: t, question: t, type: "essay", origin: "sgk_original", keepOriginal: true,
          mucdo: config?.level || "Hiểu", yccd: analysis?.topic || "",
        }));
        parsed.questions = [...injected, ...parsed.questions];
      } else {
        // đánh dấu các câu trùng gốc để UI gắn nhãn
        const origSet = new Set(originals.map((t) => String(t).trim()));
        parsed.questions = parsed.questions.map((q) => (
          origSet.has(hasText(q)) ? { ...q, origin: q.origin || "sgk_original" } : q
        ));
      }
    }
  } catch {}
  // AI không trả JSON hợp lệ → báo lỗi rõ cho UI, tránh bước sau hiển thị nội dung rỗng
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI không trả về JSON hợp lệ cho học liệu. Vui lòng thử lại.");
  }
  return { raw: text, parsed, materialType, config };
}

/**
 * Regenerate a single question (for preview editor)
 * @param {{scan, analysis, materialType, config, existingQuestion, index}}
 */
export async function regenerateQuestion({ scan, analysis, materialType, config, existingQuestion, index }) {
  if (!scan?.dataUrl) throw new Error("Thiếu ảnh vùng quét.");
  const base64 = dataUrlToBase64(scan.dataUrl);
  const model = getModel();
  const apiKey = getApiKeySafe();
  if (!apiKey) throw new Error("Chưa có API Key.");
  const book = scan.book || {};
  const existingQText = JSON.stringify(existingQuestion || {}).slice(0, 500);
  const prompt = `Nguồn SGK: "${book.title || ""}" — Lớp ${book.grade} — Môn ${book.subject} — Trang ${scan.page}
Chủ đề: ${analysis?.topic || ""} — ${analysis?.content?.slice(0, 400) || ""}
Câu cũ #${(index ?? 0) + 1}: ${existingQText}
Yêu cầu: Viết lại 1 câu hỏi MỚI thay thế câu trên, cùng mức độ ${config?.level || "Hiểu"}, loại ${config?.questionType || "Trắc nghiệm"}, bám SGK, không trùng.${config?.randomizeAnswers ? " Đặt đáp án đúng ở vị trí ngẫu nhiên trong options." : ""}
Trả JSON thuần (không markdown): {"q":"...","question":"...","type":"mc","options":["A","B","C","D"],"answer":0,"correctIndex":0,"explanation":"...","mucdo":"${config?.level || "Hiểu"}"}`;

  const text = await aiService.callAI({
    apiKey,
    model,
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: base64 } }, { text: prompt }] }],
    systemInstruction: { parts: [{ text: "Bạn là trợ lý tạo câu hỏi bám SGK, không bịa. Luôn trả JSON hợp lệ." }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 800, responseMimeType: "application/json" },
    requestId: `scan-regen-${Date.now()}`,
  });
  const parsed = parseJSONSafe(text);
  if (parsed && typeof parsed === "object") {
    // normalize to have q/question
    const q = parsed.q || parsed.question || "";
    // spread lên đầu để q/question vừa chuẩn hóa không bị parsed ghi đè
    return { ...parsed, q, question: q || parsed.question };
  }
  throw new Error("AI không trả về JSON hợp lệ cho câu hỏi mới");
}
