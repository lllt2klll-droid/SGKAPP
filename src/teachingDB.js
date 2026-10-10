// ── Teaching data layer: lesson plans (khung GDPT 2018), activities
// library, worksheets, question bank. Everything is local + offline. ──
import { makeId, now } from "./storage.js";
import { safeGetJSON, safeSetJSON } from "./safeStorage.js";
import { appEvents, AppEvents } from "./core/appEvents.js";
function notifyDataUpdated(detail){
  const d = detail||{source:"teachingDB"};
  try{ appEvents.emit(AppEvents.DATA_UPDATED, d); }catch(e){ console.warn("[teachingDB] appEvents emit failed", e); }
  // legacy window dispatch kept via appEvents (also fires synthetic storage)
}
// ── safeStorage helpers (audit) ──
function _getListSafe(key){ return safeGetJSON(key, [], Array.isArray); }
function _saveSafe(key, value){
  const res = safeSetJSON(key, value);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] QuotaExceededError on", key, "-", res.message);
    else console.warn("[safeStorage] save failed for", key, ":", res.error, res.message);
    return false;
  }
  return true;
}
function _addItemSafe(key, item, opts={}){ const list=_getListSafe(key); const unshift=opts.unshift!==false; const cap=opts.cap||0; const next=unshift?[item,...list]:[...list,item]; return cap>0?next.slice(0,cap):next; }
function _updateItemSafe(key, id, patch){ const list=_getListSafe(key); return list.map(it=> it.id===id?{...it,...patch,id:it.id}:it); }
import {
  emitActivityCreated,
  emitQuestionCreated,
  emitWorksheetCreated,
} from "./missionEvents.js";
import { validateQuestionEntity, normalizePersistedQuestion, normalizeGeneratedQuestion } from "./questionSchema.js";
import { moveToTrash, TRASH_TYPE } from "./trashStore.js";

// ── teachingDB: kho dùng chung (kho hoạt động, ngân hàng câu hỏi, phiếu).
// Module KHBD cũ (lesson plans sec/stt) đã xóa — Giáo án mới dùng src/khbd/planModel.js (khbd_v2_*).

export const PHASES = [
  { id: "khoiDong", label: "Khởi động", icon: "🎯" },
  { id: "khamPha", label: "Khám phá / Hình thành kiến thức", icon: "🔍" },
  { id: "luyenTap", label: "Luyện tập – Thực hành", icon: "✏️" },
  { id: "vanDung", label: "Vận dụng – Trải nghiệm", icon: "🧩" },
  { id: "danDo", label: "Dặn dò / Giao nhiệm vụ", icon: "📌" },
];


// ────────────────────────────────────────────────────────────────────
// ACTIVITIES LIBRARY (hoạt động dạy học mẫu để tái sử dụng)
// Activity = { id, phase, name, content, grade?, subject?, tags: string[], at }
// ────────────────────────────────────────────────────────────────────
const ACT_KEY = "sgk_activities";

export function getActivities() {
  return _getListSafe(ACT_KEY).sort((a, b) => (b.at || 0) - (a.at || 0));
}
export function addActivity(a) {
  const item = {
    ...a,
    id: makeId("act"),
    name: String(a.name || "").trim(),
    content: String(a.content || "").trim(),
    tags: Array.isArray(a.tags)
      ? a.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
    at: now(),
  };
  _saveSafe(ACT_KEY, _addItemSafe(ACT_KEY, item));
  try {
    emitActivityCreated(item.id);
  } catch (e) { console.warn("[teachingDB] operation failed", e); }
  notifyDataUpdated({source:"teachingDB", op:"addActivity", id:item.id});
  return item;
}
export function updateActivity(id, patch) {
  const list = _getListSafe(ACT_KEY);
  const item = list.find((x) => x.id === id);
  if (item) {
    _saveSafe(
      ACT_KEY,
      list.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              name: String(patch.name ?? x.name).trim(),
              content: String(patch.content ?? x.content).trim(),
            }
          : x,
      ),
    );
    notifyDataUpdated({source:"teachingDB", op:"updateActivity", id});
  }
}
export function deleteActivity(id) {
  _saveSafe(
    ACT_KEY,
    _getListSafe(ACT_KEY).filter((a) => a.id !== id),
  );
  notifyDataUpdated({source:"teachingDB", op:"deleteActivity", id});
}

// ────────────────────────────────────────────────────────────────────
// QUESTION BANK (ngân hàng câu hỏi kèm đáp án + chuẩn) — PHASE 5 canonical
// Allowed types: mc | essay | fill
// mc: { id, type:'mc', question, options[4], correctIndex 0-3 }
// fill: { id, type:'fill', question, answer }
// essay: { id, type:'essay', question, answerGuide }
// ────────────────────────────────────────────────────────────────────
const QB_KEY = "sgk_questions";

export const MUC_DO = ["Biết", "Hiểu", "Vận dụng"];

// Migrate old questions on read — pure view, no auto-delete (P0 fix: avoid silent data loss on read)
// Invalid questions are quarantined to `sgk_questions_quarantine` instead of being silently dropped.
// Caller must explicitly call `repairQuestionsStorage()` to persist the cleaned list.
const QB_QUARANTINE_KEY = "sgk_questions_quarantine";
function migrateQuestionsOnRead(list) {
  const valid = [];
  const invalid = [];
  let needsRepair = false;
  for (const raw of list) {
    const norm = normalizePersistedQuestion(raw);
    if (!norm) { invalid.push(raw); needsRepair = true; continue; } // quarantine invalid
    const merged = { ...norm, id: raw.id, at: raw.at || norm.at || now() };
    if (JSON.stringify(merged) !== JSON.stringify(raw)) needsRepair = true;
    valid.push(merged);
  }
  if (needsRepair && (invalid.length || valid.length !== list.length)) {
    // Preserve invalid in quarantine (never silently delete) — P0 fix
    if (invalid.length) {
      try {
        const existingQ = safeGetJSON(QB_QUARANTINE_KEY, [], Array.isArray) || [];
        const mergedQ = [...existingQ];
        const seen = new Set(existingQ.map((x) => x?.id).filter(Boolean));
        for (const it of invalid) {
          if (it?.id && seen.has(it.id)) continue;
          mergedQ.push({ ...it, _quarantinedAt: now(), _reason: "invalid_question_schema" });
        }
        const rQ = safeSetJSON(QB_QUARANTINE_KEY, mergedQ);
        if (!rQ.ok) console.warn("[teachingDB] quarantine save failed", rQ);
        console.warn(`[teachingDB] quarantined ${invalid.length} invalid questions to ${QB_QUARANTINE_KEY}`);
      } catch (e) { console.warn("[teachingDB] quarantine failed", e); }
    }
    // Defer persisting cleaned list — only persist if safe and not during pure read
    // We still persist valid list but ONLY after quarantine succeeded, and with explicit log
    // To avoid breaking existing callers that rely on auto-repair, persist valid list but quarantine first
    try {
      const resM = safeSetJSON(QB_KEY, valid);
      if (!resM.ok) {
        if (resM.quota) console.warn("[safeStorage] QuotaExceededError on", QB_KEY, "-", resM.message);
        else console.warn("[safeStorage] migrateQuestions save failed", resM.error);
      } else if (invalid.length) {
        console.warn(`[teachingDB] auto-repaired ${QB_KEY}: ${list.length} -> ${valid.length} (quarantined ${invalid.length})`);
      }
    } catch (e) { console.warn("[teachingDB] migrateQuestionsOnRead save failed", e); }
  } else if (needsRepair) {
    // Only normalization changes, no invalid — safe to persist
    try { const resM=safeSetJSON(QB_KEY, valid); if(!resM.ok) console.warn("[teachingDB] normalize save failed", resM); } catch (e) { console.warn("[teachingDB] normalize save failed", e); }
  }
  return valid;
}
export function getQuarantinedQuestions() { return safeGetJSON(QB_QUARANTINE_KEY, [], Array.isArray) || []; }
export function restoreQuarantinedQuestion(id) {
  const q = getQuarantinedQuestions().find((x) => x.id === id);
  if (!q) return null;
  const cleaned = { ...q }; delete cleaned._quarantinedAt; delete cleaned._reason;
  // Try to re-add via canonical path (may still fail validation)
  try { return addQuestion(cleaned); } catch (e) { console.warn("[teachingDB] restore quarantined failed", e); return null; }
}
export function clearQuarantinedQuestions() { const r=safeSetJSON(QB_QUARANTINE_KEY, []); return r.ok; }

export function getQuestions() {
  const raw = _getListSafe(QB_KEY);
  const migrated = migrateQuestionsOnRead(raw);
  return migrated.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export function addQuestion(q) {
  // Normalize if coming from AI / raw input; validate canonical
  // Accept both legacy UI payloads and already-normalized objects
  let normalized = null;
  // If q appears to be raw AI (has question + options/correctIndex without validation), try normalizeGenerated
  // For UI, q already has type mc/essay/fill; we normalize via persisted path
  if (q && typeof q === 'object' && q.type && ['mc','essay','fill'].includes(String(q.type))) {
    // Try persisted normalization first
    normalized = normalizePersistedQuestion({ ...q, id: q.id || makeId("q") });
    if (!normalized) {
      // Fallback to generated normalization (handles missing/extra fields)
      normalized = normalizeGeneratedQuestion(q);
      if (normalized) normalized.id = q.id || makeId("q");
    }
  } else {
    normalized = normalizeGeneratedQuestion(q) || normalizePersistedQuestion({ ...q, id: q.id || makeId("q") });
  }
  if (!normalized) {
    throw new Error('Invalid question: rejected by canonical validation');
  }
  const v = validateQuestionEntity(normalized);
  if (!v.isValid) throw new Error('Invalid question: ' + v.errors.join(', '));
  const item = {
    ...normalized,
    id: normalized.id || makeId("q"),
    at: normalized.at || now(),
    // Preserve extra metadata
    subject: q.subject ?? normalized.subject ?? '',
    grade: q.grade ?? normalized.grade ?? '',
    chapter: q.chapter ?? normalized.chapter ?? '',
    yccd: q.yccd ?? normalized.yccd ?? '',
    mucdo: q.mucdo ?? normalized.mucdo ?? '',
    source: q.source ?? normalized.source ?? null,
  };
  // Ensure canonical fields clean
  if (item.type === 'mc') { item.answer = undefined; item.answerGuide = undefined; }
  if (item.type === 'fill') { item.options = undefined; item.correctIndex = undefined; item.answerGuide = undefined; }
  if (item.type === 'essay') { item.options = undefined; item.correctIndex = undefined; }

  _saveSafe(QB_KEY, _addItemSafe(QB_KEY, item));
  try { emitQuestionCreated(item.id); } catch (e) { console.warn("[teachingDB] operation failed", e); }
  notifyDataUpdated({source:"teachingDB", op:"addQuestion", id:item.id});
  return item;
}
export function updateQuestion(id, patch) {
  const existing = _getListSafe(QB_KEY).find(x=>x.id===id);
  if (!existing) throw new Error('Question not found');
  const merged = { ...existing, ...patch, id };
  const normalized = normalizePersistedQuestion(merged) || normalizeGeneratedQuestion(merged);
  if (!normalized) throw new Error('Invalid question update');
  const v = validateQuestionEntity({ ...normalized, id });
  if (!v.isValid) throw new Error('Invalid question update: ' + v.errors.join(', '));
  const final = { ...normalized, id, subject: patch.subject ?? normalized.subject ?? existing.subject, grade: patch.grade ?? existing.grade, chapter: patch.chapter ?? existing.chapter, yccd: patch.yccd ?? existing.yccd, mucdo: patch.mucdo ?? existing.mucdo, source: patch.source ?? existing.source, at: existing.at };
  if (final.type === 'mc') { final.answer = undefined; final.answerGuide = undefined; }
  if (final.type === 'fill') { final.options = undefined; final.correctIndex = undefined; final.answerGuide = undefined; }
  if (final.type === 'essay') { final.options = undefined; final.correctIndex = undefined; }
  _saveSafe(QB_KEY, _updateItemSafe(QB_KEY, id, final));
  notifyDataUpdated({source:"teachingDB", op:"updateQuestion", id});
}
export function deleteQuestion(id) {
  // A2 • Xóa = chuyển vào Thùng rác (giữ 30 ngày)
  try {
    const q = _getListSafe(QB_KEY).find((x) => x && x.id === id);
    if (q) moveToTrash({ type: TRASH_TYPE.QUESTION, label: q.question || "Câu hỏi", meta: { grade: q.grade, subject: q.subject }, payload: q });
  } catch {}
  _saveSafe(QB_KEY, _getListSafe(QB_KEY).filter((q) => q.id !== id));
  // (Kho KHBD cũ đã xóa — questionLinks trên plan cũ không còn được dùng.)
  // PHASE 5: Also remove from worksheets
  try {
    const wss = _getListSafe(WS_KEY);
    let wChanged = false;
    const updatedWs = wss.map(ws=>{
      if (!Array.isArray(ws.questions)) return ws;
      const filtered = ws.questions.filter(qid=> qid !== id);
      if (filtered.length !== ws.questions.length) { wChanged=true; return { ...ws, questions: filtered, updatedAt: now() }; }
      return ws;
    });
    if (wChanged) _saveSafe(WS_KEY, updatedWs);
  } catch (e) { console.warn("[teachingDB] operation failed", e); }
  notifyDataUpdated({source:"teachingDB", op:"deleteQuestion", id});
}
export function clearQuestions() {
  _saveSafe(QB_KEY, []);
  // (Kho KHBD cũ đã xóa — không còn cascade questionLinks.)
  try {
    const wss = _getListSafe(WS_KEY);
    const updatedWs = wss.map(ws=> Array.isArray(ws.questions) && ws.questions.length ? { ...ws, questions: [], updatedAt: now() } : ws);
    _saveSafe(WS_KEY, updatedWs);
  } catch (e) { console.warn("[teachingDB] operation failed", e); }
  notifyDataUpdated({source:"teachingDB", op:"clearQuestions"});
}

// A2 • Khôi phục 1 câu hỏi từ Thùng rác — trả về true nếu đã chèn lại
export function restoreQuestion(q) {
  if (!q || typeof q !== "object" || !q.id) return false;
  const list = _getListSafe(QB_KEY);
  if (list.some((x) => x && x.id === q.id)) return true;
  const ok = _saveSafe(QB_KEY, [q, ...list]);
  if (ok) notifyDataUpdated({ source: "teachingDB", op: "restoreQuestion", id: q.id });
  return ok;
}

// ────────────────────────────────────────────────────────────────────
// WORKSHEETS (phiếu học tập / phiếu bài tập in được)
// Worksheet = { id, title, subject, grade, intro, note,
//               questions: string[] (question ids), showAnswers, at, updatedAt }
// ────────────────────────────────────────────────────────────────────
const WS_KEY = "sgk_worksheets";

export function getWorksheets() {
  return _getListSafe(WS_KEY).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}
export function getWorksheet(id) {
  return getWorksheets().find((w) => w.id === id) || null;
}
export function saveWorksheet(ws) {
  const list = _getListSafe(WS_KEY);
  const isNew = !list.some((w) => w.id === ws.id);
  const fresh = { ...ws, updatedAt: now() };
  const idx = list.findIndex((w) => w.id === ws.id);
  let next;
  if (idx >= 0) next = list.map((w) => (w.id === ws.id ? fresh : w));
  else next = [fresh, ...list];
  _saveSafe(WS_KEY, next);
  if (isNew) {
    try {
      emitWorksheetCreated(fresh.id);
    } catch (e) { console.warn("[teachingDB] operation failed", e); }
  }
  notifyDataUpdated({source:"teachingDB", op:"saveWorksheet", id:fresh.id, isNew});
  return fresh;
}
export function deleteWorksheet(id) {
  _saveSafe(
    WS_KEY,
    _getListSafe(WS_KEY).filter((w) => w.id !== id),
  );
  notifyDataUpdated({source:"teachingDB", op:"deleteWorksheet", id});
}
