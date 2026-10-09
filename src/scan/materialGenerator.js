// ── Material Generator — adapter từ scan AI → repository hiện có ─────────
// Reuse existing saveWorksheet, addQuestion, addClip, createIdea — không tạo store mới.
// Tất cả bản ghi đều có source provenance {type:'sgk_scan', bookId, page, crop, scanId} + thumbnail.
import { addQuestion, saveWorksheet } from "../teachingDB.js";
import { addClip, getCollections, addCollection } from "../researchDB.js";
import { createIdea } from "../personalDB.js";
import { makeId } from "../storage.js";
import { normalizeMucdo } from "../questionSchema.js";

function sourceMeta(scan, extra) {
  return {
    type: "sgk_scan",
    bookId: scan.book?.filename || scan.book?.key || "",
    bookName: scan.book?.title || "",
    subject: scan.book?.subject || scan.analysis?.subject || "",
    grade: scan.book?.grade || scan.analysis?.grade || 1,
    page: scan.page,
    crop: scan.crop || null,
    thumbnail: (scan.dataUrl || "").slice(0, 60000), // searchable preview
    createdAt: new Date().toISOString(),
    scanId: scan.id || makeId("scan"),
    fidelity: extra?.fidelity || scan.fidelity || "",
    keepOriginal: !!extra?.keepOriginal,
  };
}

function thumb(scan) {
  // keep thumbnail small for localStorage, full image already in IndexedDB via scanStore
  return (scan.dataUrl || "").slice(0, 50000);
}

export async function saveScanToWorksheets({ scan, analysis, generated }) {
  const parsed = generated?.parsed || {};
  const titleRaw = (parsed.title || "").trim();
  const title = titleRaw || `Phiếu từ SGK ${scan.book.title} — tr.${scan.page}`;
  const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (!qs.length) throw new Error("AI không tạo câu hỏi nào cho phiếu.");
  const qIds = [];
  for (const q of qs) {
    const questionText = (q.q || q.question || q.title || "").trim();
    if (!questionText) continue;
    const type = q.type === "essay" || q.type === "fill" ? q.type : "mc";
    const options = type === "mc" ? (Array.isArray(q.options) && q.options.length ? q.options.map((o)=>String(o)) : ["", "", "", ""]) : [];
    // answer may be index or text; correctIndex is 0-3
    let correctIndex = 0;
    if (typeof q.correctIndex === "number") correctIndex = q.correctIndex;
    else if (typeof q.answer === "number") correctIndex = q.answer;
    if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;
    const added = addQuestion({
      question: questionText,
      type,
      options,
      correctIndex,
      answer: typeof q.answer === "string" ? q.answer : (q.explanation || ""),
      explanation: q.explanation || "",
      subject: scan.book.subject || analysis?.subject || "",
      grade: scan.book.grade || analysis?.grade || 1,
      chapter: analysis?.topic || q.chapter || "",
      yccd: q.yccd || "",
      mucdo: normalizeMucdo(q.mucdo) || normalizeMucdo(q.level) || "Hiểu",
      origin: q.origin || null,
      keepOriginal: q.origin === "sgk_original",
      source: sourceMeta(scan, generated?.config),
      thumbnail: thumb(scan),
      aiMeta: { model: "gemini", generatedAt: new Date().toISOString() },
    });
    if (added?.id) qIds.push(added.id);
  }
  if (!qIds.length) throw new Error("Không tạo được câu hỏi nào.");
  const ws = {
    id: makeId("ws"),
    title,
    subject: scan.book.subject || analysis?.subject || "",
    grade: scan.book.grade || analysis?.grade || 1,
    intro: parsed.instructions || parsed.intro || analysis?.content?.slice(0, 220) || "",
    note: parsed.note || "",
    questions: qIds,
    showAnswers: false,
    source: sourceMeta(scan, generated?.config),
    thumbnail: thumb(scan),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveWorksheet(ws);
  return ws;
}

export async function saveScanToQuestions({ scan, analysis, generated }) {
  const qs = Array.isArray(generated?.parsed?.questions) ? generated.parsed.questions : [];
  if (!qs.length) throw new Error("AI không tạo câu hỏi nào.");
  const ids = [];
  for (const q of qs) {
    const questionText = (q.question || q.q || q.title || "").trim();
    if (!questionText) continue;
    const type = q.type === "essay" || q.type === "fill" ? q.type : "mc";
    let correctIndex = 0;
    if (typeof q.correctIndex === "number") correctIndex = q.correctIndex;
    else if (typeof q.answer === "number") correctIndex = q.answer;
    const added = addQuestion({
      question: questionText,
      type,
      options: type === "mc" ? (Array.isArray(q.options) ? q.options.map((o)=>String(o)) : ["", "", "", ""]) : [],
      correctIndex,
      answer: typeof q.answer === "string" ? q.answer : (q.explanation || q.answerText || ""),
      explanation: q.explanation || "",
      subject: scan.book.subject || analysis?.subject || "",
      grade: scan.book.grade || analysis?.grade || 1,
      chapter: analysis?.topic || q.chapter || "",
      yccd: q.yccd || "",
      mucdo: normalizeMucdo(q.mucdo) || normalizeMucdo(q.level) || "Hiểu",
      origin: q.origin || null,
      keepOriginal: q.origin === "sgk_original",
      source: sourceMeta(scan, generated?.config),
      thumbnail: thumb(scan),
      aiMeta: { model: "gemini", generatedAt: new Date().toISOString() },
    });
    if (added?.id) ids.push(added.id);
  }
  if (!ids.length) throw new Error("Không tạo được câu hỏi nào.");
  return ids;
}

export async function saveScanToClip({ scan, analysis, generated }) {
  // For "note" / clip — ensure we have a collection. Fallback to auto-named.
  let coll = null;
  try {
    const cols = getCollections();
    // prefer existing "SGK Scan" collection else first available
    coll = cols.find((c) => String(c.name).toLowerCase().includes("scan")) || cols[0] || null;
  } catch {}
  if (!coll) {
    try { coll = addCollection("SGK Scan — Ghi chú", "Ghi chú tự động từ quét SGK"); } catch {}
  }
  if (!coll?.id) throw new Error("Không tạo được bộ sưu tập cho ghi chú.");
  const parsed = generated?.parsed || {};
  const text = (parsed.content || parsed.summary || analysis?.content || scan.text || "").trim().slice(0, 6000) || "(không có văn bản)";
  const titlePart = parsed.title ? `${parsed.title}\n\n` : "";
  const clip = await addClip({
    collId: coll.id,
    file: scan.book.filename,
    bookTitle: scan.book.title,
    grade: scan.book.grade,
    subject: scan.book.subject,
    page: scan.page,
    text: titlePart + text,
    chapter: analysis?.topic || "",
  });
  if (clip) {
    clip.source = sourceMeta(scan);
    clip.thumbnail = thumb(scan);
  }
  return clip;
}

export async function saveScanToNote({ scan, analysis, generated }) {
  // Lưu vào personalDB (Ý tưởng dạy học) để "note" có kho riêng, vẫn searchable
  const parsed = generated?.parsed || {};
  const title = parsed.title || `Ghi chú SGK ${scan.book.title} tr.${scan.page}`;
  const content = parsed.content || parsed.summary || analysis?.content || "";
  const extra = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.join("\n• ") : "";
  const body = [content, extra ? `\nÝ chính:\n• ${extra}` : "", Array.isArray(parsed.questions) ? `\nCâu hỏi gợi mở:\n• ${parsed.questions.join("\n• ")}` : ""].join("\n").trim().slice(0, 8000);
  const idea = createIdea({
    title,
    description: body,
    content: body,
    subject: scan.book.subject || analysis?.subject || "",
    grade: scan.book.grade || analysis?.grade || 1,
    category: "sgk_scan",
    tags: ["sgk_scan", scan.book.subject, `tr${scan.page}`].filter(Boolean),
    source: sourceMeta(scan),
    thumbnail: thumb(scan),
  });
  // also push a clip for cross-search (không bắt buộc, fallback if idea fails)
  if (!idea) return saveScanToClip({ scan, analysis, generated });
  return idea;
}

export async function saveScanToActivity({ scan, analysis, generated }) {
  const parsed = generated?.parsed || {};
  const { addActivity } = await import("../teachingDB.js");
  const isGame = (generated?.materialType === "game") || (parsed.type && /game|ghép|quiz/i.test(String(parsed.type)));
  const name = parsed.name || parsed.title || `Hoạt động từ ${scan.book.title} tr.${scan.page}`;
  const content = parsed.content || parsed.instructions || parsed.summary || analysis?.content || "";
  const steps = Array.isArray(parsed.steps) && parsed.steps.length ? parsed.steps.map((s) => `GV: ${s.teacherAction || s.gv || ""}\nHS: ${s.studentAction || s.hs || ""}`).join("\n\n") : "";
  const fullContent = [content, steps ? `\n\nCách tiến hành:\n${steps}` : "", parsed.objective ? `\nMục tiêu: ${parsed.objective}` : "", parsed.assessment ? `\nĐánh giá: ${parsed.assessment}` : ""].join("").trim().slice(0, 8000);
  // phase mapping: support both legacy section ids
  const phaseMap = { khoiDong: "khoiDong", khamPha: "khamPha", luyenTap: "luyenTap", vanDung: "vanDung", danDo: "danDo" };
  const phase = phaseMap[parsed.phase] || parsed.phase || "luyenTap";
  const tags = ["sgk_scan", scan.book.subject || analysis?.subject || "", isGame ? "game" : "activity"].filter(Boolean);
  const newAct = addActivity({
    name,
    content: fullContent || "(chưa có nội dung)",
    phase,
    subject: scan.book.subject || analysis?.subject || "",
    grade: String(scan.book.grade || analysis?.grade || ""),
    tags,
    // stash full structured data for later rendering
    meta: {
      type: isGame ? "game" : "activity",
      gameType: parsed.type || (isGame ? (parsed.gameType || "Quiz") : ""),
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      pairs: Array.isArray(parsed.pairs) ? parsed.pairs : [],
      instructions: parsed.instructions || "",
      timeLimit: parsed.timeLimit || "",
    },
    source: sourceMeta(scan),
    thumbnail: thumb(scan),
  });
  if (newAct) {
    newAct.source = sourceMeta(scan);
    newAct.thumbnail = thumb(scan);
  }
  return newAct;
}

// Unified entry: dispatches correctly for 6 types (giữ nguyên cơ chế, thêm "original")
export async function saveScanMaterial({ scan, analysis, generated, materialType }) {
  const type = materialType || generated?.materialType || "note";
  // "Nguyên bản": lưu dạng phiếu in trực tiếp, câu gốc nguyên văn đứng đầu
  if (type === "original") {
    const withTitle = generated?.parsed?.title
      ? generated
      : { ...generated, parsed: { ...(generated?.parsed || {}), title: `Nguyên bản SGK ${scan.book?.title || ""} — tr.${scan.page}` } };
    return saveScanToWorksheets({ scan, analysis, generated: withTitle });
  }
  if (type === "worksheet") return saveScanToWorksheets({ scan, analysis, generated });
  if (type === "question") return saveScanToQuestions({ scan, analysis, generated });
  if (type === "game" || type === "activity") return saveScanToActivity({ scan, analysis, generated });
  if (type === "note") return saveScanToNote({ scan, analysis, generated });
  // fallback clip
  return saveScanToClip({ scan, analysis, generated });
}
