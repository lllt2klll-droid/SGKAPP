// Data layer for personal teaching tools: Ideas, Tasks, Internship — THỐNG NHẤT QUA storage.js
// All data stored via unified storage (sgk_ prefix, backup-aware, quota-safe)
import { emitIdeaCreated, emitTaskCompleted } from './missionEvents.js';
import { readJSON, saveJSON, removeKey } from './storage.js';
import { moveToTrash as _moveToTrashIdea, TRASH_TYPE as _TRASH_TYPE_IDEA } from "./trashStore.js";
import { appEvents as _appEventsPersonal, AppEvents as _AppEventsPersonal } from './core/appEvents.js';
function notifyDataUpdated(detail){ try{ _appEventsPersonal.emit(_AppEventsPersonal.DATA_UPDATED, detail||{source:"personalDB"});}catch{} }

// ============================================================
// IDEAS — kho ý tưởng dạy học chi tiết (schema v2, GDPT 2018)
// ============================================================
export const IDEAS_STORAGE_KEY = "sgk_ideas";

export const IDEA_TYPES = [
  { id: "troChoi", label: "Trò chơi học tập", icon: "🎮" },
  { id: "dongVai", label: "Đóng vai / Sắm vai", icon: "🎭" },
  { id: "thiNghiem", label: "Thí nghiệm / Thực hành", icon: "🔬" },
  { id: "thaoLuan", label: "Thảo luận nhóm", icon: "💬" },
  { id: "tram", label: "Học theo trạm", icon: "🚏" },
  { id: "duAn", label: "Dự án mini", icon: "📦" },
  { id: "keChuyen", label: "Kể chuyện / Đọc diễn cảm", icon: "📖" },
  { id: "amNhac", label: "Hát – Vận động", icon: "🎵" },
  { id: "vanDong", label: "Vận động / Thể chất", icon: "🤸" },
  { id: "trucQuan", label: "Trực quan / Đồ dùng", icon: "🖼️" },
  { id: "congNghe", label: "Ứng dụng CNTT / AI", icon: "💻" },
  { id: "danhGia", label: "Đánh giá vui", icon: "✅" },
  { id: "khac", label: "Khác", icon: "💡" },
];

export const IDEA_PHASES = [
  { id: "chung", label: "Dùng mọi lúc", icon: "💡" },
  { id: "khoiDong", label: "Khởi động", icon: "🎯" },
  { id: "khamPha", label: "Khám phá / Hình thành kiến thức", icon: "🔍" },
  { id: "luyenTap", label: "Luyện tập – Thực hành", icon: "✏️" },
  { id: "vanDung", label: "Vận dụng – Trải nghiệm", icon: "🧩" },
  { id: "danDo", label: "Củng cố / Dặn dò", icon: "📌" },
];

export const IDEA_FORMATS = [
  { id: "caNhan", label: "Cá nhân" },
  { id: "capDoi", label: "Cặp đôi" },
  { id: "nhomNho", label: "Nhóm nhỏ (3–4)" },
  { id: "nhomLon", label: "Nhóm lớn (5–6)" },
  { id: "caLop", label: "Cả lớp" },
  { id: "tram", label: "Trạm / Góc" },
];

export const IDEA_DIFFICULTIES = [
  { id: "de", label: "Dễ — chuẩn bị < 10 phút" },
  { id: "trungBinh", label: "Trung bình — 10–30 phút" },
  { id: "kho", label: "Công phu — > 30 phút" },
];

export const IDEA_STATUSES = [
  { id: "nhap", label: "Nháp", color: "#64748b" },
  { id: "sanSang", label: "Sẵn sàng dạy", color: "#2d73ff" },
  { id: "daThu", label: "Đã dạy thử", color: "#16a34a" },
  { id: "canCaiThien", label: "Cần cải tiến", color: "#f59e0b" },
];

export const IDEA_LIMITS = { titleMin: 1, titleMax: 150, summaryMax: 500, textMax: 8000, stepMax: 12 };

export function ideaTypeLabel(id) { return IDEA_TYPES.find((t) => t.id === id)?.label || "Khác"; }
export function ideaPhaseLabel(id) { return IDEA_PHASES.find((t) => t.id === id)?.label || "Dùng mọi lúc"; }
export function ideaFormatLabel(id) { return IDEA_FORMATS.find((t) => t.id === id)?.label || id || "—"; }
export function ideaStatusLabel(id) { return IDEA_STATUSES.find((t) => t.id === id)?.label || "Nháp"; }

export function validateIdeaData(d = {}) {
  const title = String(d.title ?? "").trim();
  if (!title) throw new Error("Tiêu đề ý tưởng không được để trống.");
  if (title.length > IDEA_LIMITS.titleMax) throw new Error(`Tiêu đề tối đa ${IDEA_LIMITS.titleMax} ký tự (đang ${title.length}).`);
  for (const [k, max] of [["summary", IDEA_LIMITS.summaryMax], ["description", IDEA_LIMITS.textMax], ["objectives", 2000], ["materials", 2000], ["variations", 3000], ["assessment", 2000], ["classroomTips", 2000], ["competencies", 1000]]) {
    const s = String(d[k] ?? "");
    if (s.length > max) throw new Error(`Trường ${k} tối đa ${max} ký tự (đang ${s.length}).`);
  }
  if (d.type && !IDEA_TYPES.some((t) => t.id === d.type)) throw new Error("Loại hình ý tưởng không hợp lệ.");
  if (d.phase && !IDEA_PHASES.some((t) => t.id === d.phase)) throw new Error("Giai đoạn không hợp lệ.");
  if (d.format && !IDEA_FORMATS.some((t) => t.id === d.format)) throw new Error("Hình thức tổ chức không hợp lệ.");
  if (d.difficulty && !IDEA_DIFFICULTIES.some((t) => t.id === d.difficulty)) throw new Error("Độ khó không hợp lệ.");
  if (d.status && !IDEA_STATUSES.some((t) => t.id === d.status)) throw new Error("Trạng thái không hợp lệ.");
  if (d.duration != null && d.duration !== "" && !(Number(d.duration) >= 1 && Number(d.duration) <= 120)) throw new Error("Thời lượng phải từ 1–120 phút.");
  if (d.rating != null && d.rating !== "" && !(Number(d.rating) >= 0 && Number(d.rating) <= 5)) throw new Error("Đánh giá phải từ 0–5 sao.");
  if (Array.isArray(d.steps) && d.steps.length > IDEA_LIMITS.stepMax) throw new Error(`Tối đa ${IDEA_LIMITS.stepMax} bước tiến hành.`);
}

/** Chuẩn hóa 1 ý tưởng cũ (v1: title/description/subject/grade/tags) sang schema v2 đầy đủ. */
export function normalizeIdea(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const nowIso = new Date().toISOString();
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => String(t).trim()).filter(Boolean)
    : String(raw.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  const steps = Array.isArray(raw.steps)
    ? raw.steps.slice(0, IDEA_LIMITS.stepMax).map((s, i) => ({
        id: s?.id || `step_${i + 1}`,
        title: String(s?.title || s?.name || `Bước ${i + 1}`).slice(0, 120),
        content: String(s?.content || s?.desc || "").slice(0, 2000),
        minutes: Number(s?.minutes) >= 1 ? Math.min(120, Number(s.minutes)) : "",
      }))
    : [];
  const trials = Array.isArray(raw.trials)
    ? raw.trials.filter((t) => t && typeof t === "object").map((t) => ({
        id: t.id || `trial_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: t.date || nowIso.slice(0, 10),
        className: String(t.className || ""),
        students: Number(t.students) || "",
        result: String(t.result || ""),
        note: String(t.note || ""),
        createdAt: t.createdAt || nowIso,
      }))
    : [];
  return {
    ...raw, // giữ trường ngoài schema v2 (thumbnail, category, content, at… — tránh mất dữ liệu từ scan/legacy)
    id: raw.id || `idea_${Date.now()}`,
    title: String(raw.title || "").trim().slice(0, IDEA_LIMITS.titleMax),
    summary: String(raw.summary || "").slice(0, IDEA_LIMITS.summaryMax),
    description: String(raw.description || "").slice(0, IDEA_LIMITS.textMax),
    subject: String(raw.subject || ""),
    grade: String(raw.grade || ""),
    type: IDEA_TYPES.some((t) => t.id === raw.type) ? raw.type : (tags.some((t) => /trò chơi|game/i.test(t)) ? "troChoi" : "khac"),
    phase: IDEA_PHASES.some((t) => t.id === raw.phase) ? raw.phase : "chung",
    format: IDEA_FORMATS.some((t) => t.id === raw.format) ? raw.format : "",
    difficulty: IDEA_DIFFICULTIES.some((t) => t.id === raw.difficulty) ? raw.difficulty : "",
    status: IDEA_STATUSES.some((t) => t.id === raw.status) ? raw.status : (trials.length ? "daThu" : "nhap"),
    objectives: String(raw.objectives || ""),
    materials: String(raw.materials || ""),
    steps,
    variations: String(raw.variations || ""),
    assessment: String(raw.assessment || ""),
    classroomTips: String(raw.classroomTips || raw.tips || ""),
    competencies: String(raw.competencies || ""),
    duration: raw.duration === "" || raw.duration == null ? "" : Number(raw.duration) || "",
    prepTime: String(raw.prepTime || ""),
    tags,
    favorite: !!raw.favorite,
    rating: Math.max(0, Math.min(5, Number(raw.rating) || 0)),
    trials,
    triedCount: Number(raw.triedCount) || trials.length || 0,
    lastTriedAt: raw.lastTriedAt || (trials[0]?.date ? new Date(trials[0].date).toISOString() : null),
    relatedBookId: raw.relatedBookId || "",
    relatedLessonPlanId: raw.relatedLessonPlanId || "",
    source: raw.source || "tuTao",
    createdAt: raw.createdAt || nowIso,
    updatedAt: raw.updatedAt || raw.createdAt || nowIso,
  };
}

export function getIdeas() {
  const v = readJSON(IDEAS_STORAGE_KEY, []);
  const list = Array.isArray(v) ? v : [];
  let needSave = false;
  const normed = list.map((raw) => {
    const n = normalizeIdea(raw);
    if (!n) { needSave = true; return null; }
    // phát hiện bản cũ thiếu trường v2 → cần persist 1 lần
    if (raw && (raw.steps === undefined || raw.status === undefined || raw.summary === undefined)) needSave = true;
    if (!n.title) { return null; }
    return n;
  }).filter(Boolean);
  if (needSave) {
    try { saveJSON(IDEAS_STORAGE_KEY, normed); } catch {}
  }
  return normed;
}

export function saveIdeas(ideas) {
  try {
    saveJSON(IDEAS_STORAGE_KEY, ideas);
    notifyDataUpdated({source:"personalDB", key:IDEAS_STORAGE_KEY});
    return true;
  } catch (e) {
    console.error("Failed to save ideas:", e);
    return false;
  }
}

export function createIdea(ideaData) {
  validateIdeaData(ideaData || {});
  const ideas = getIdeas();
  const nowIso = new Date().toISOString();
  const base = normalizeIdea({ ...ideaData, createdAt: ideaData?.createdAt || nowIso, updatedAt: nowIso });
  const newIdea = { ...base, id: `idea_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: ideaData?.createdAt || nowIso, updatedAt: nowIso };
  const updated = [...ideas, newIdea];
  const ok = saveIdeas(updated) ? newIdea : null;
  if(ok){ try{ emitIdeaCreated(ok.id); }catch{} }
  return ok;
}

export function updateIdea(id, updates) {
  const ideas = getIdeas();
  const cur = ideas.find((x) => x.id === id);
  if (!cur) return false;
  const raw = { ...cur, ...updates, id, createdAt: cur.createdAt };
  try { validateIdeaData(raw); } catch { return false; }
  const merged = normalizeIdea(raw);
  merged.updatedAt = new Date().toISOString();
  const updated = ideas.map((idea) => (idea.id === id ? merged : idea));
  return saveIdeas(updated);
}

export function deleteIdea(id) {
  // Xóa = chuyển vào Thùng rác 30 ngày (nhất quán activities/questions/worksheets)
  try {
    const cur = getIdeas().find((x) => x && x.id === id);
    if (cur) {
      const { moveToTrash: _mtt, TRASH_TYPE: _tt } = _trashLazy();
      if (_mtt && _tt) _mtt({ type: _tt.IDEA || "idea", label: cur.title || "Ý tưởng", meta: { subject: cur.subject, grade: cur.grade }, payload: cur });
    }
  } catch {}
  const ideas = getIdeas();
  const updated = ideas.filter((idea) => idea.id !== id);
  return saveIdeas(updated);
}

function _trashLazy() {
  return { moveToTrash: _moveToTrashIdea, TRASH_TYPE: _TRASH_TYPE_IDEA };
}

export function restoreIdea(payload) {
  if (!payload || typeof payload !== "object" || !payload.id) return false;
  const list = getIdeas();
  if (list.some((x) => x && x.id === payload.id)) return true;
  const n = normalizeIdea(payload);
  if (!n?.title) return false;
  return saveIdeas([n, ...list]);
}

export function duplicateIdea(id) {
  const cur = getIdeas().find((x) => x.id === id);
  if (!cur) return null;
  const copy = normalizeIdea({ ...cur, title: `${cur.title} (bản sao)`, trials: [], triedCount: 0, lastTriedAt: null, status: "nhap", favorite: false });
  return createIdea(copy);
}

export function toggleFavoriteIdea(id) {
  const cur = getIdeas().find((x) => x.id === id);
  if (!cur) return false;
  return updateIdea(id, { favorite: !cur.favorite });
}

export function rateIdea(id, rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return updateIdea(id, { rating: r });
}

export function logTrial(id, trial = {}) {
  const cur = getIdeas().find((x) => x.id === id);
  if (!cur) return false;
  const nowIso = new Date().toISOString();
  const entry = {
    id: `trial_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    date: trial.date || nowIso.slice(0, 10),
    className: String(trial.className || ""),
    students: trial.students === "" || trial.students == null ? "" : Number(trial.students) || "",
    result: String(trial.result || ""),
    note: String(trial.note || "").slice(0, 2000),
    createdAt: nowIso,
  };
  const trials = [entry, ...(cur.trials || [])].slice(0, 50);
  return updateIdea(id, { trials, triedCount: trials.length, lastTriedAt: nowIso, status: cur.status === "nhap" ? "daThu" : cur.status });
}

export function removeTrial(ideaId, trialId) {
  const cur = getIdeas().find((x) => x.id === ideaId);
  if (!cur) return false;
  const trials = (cur.trials || []).filter((t) => t.id !== trialId);
  return updateIdea(ideaId, { trials, triedCount: trials.length, lastTriedAt: trials[0]?.createdAt || null });
}

export function getIdeaById(id) {
  const ideas = getIdeas();
  return ideas.find((idea) => idea.id === id) || null;
}

export function getIdeaStats() {
  const ideas = getIdeas();
  const bySubject = {}, byType = {}, byPhase = {}, byStatus = {};
  let fav = 0, tried = 0, withSteps = 0;
  for (const it of ideas) {
    if (it.subject) bySubject[it.subject] = (bySubject[it.subject] || 0) + 1;
    if (it.type) byType[it.type] = (byType[it.type] || 0) + 1;
    if (it.phase) byPhase[it.phase] = (byPhase[it.phase] || 0) + 1;
    if (it.status) byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    if (it.favorite) fav++;
    if ((it.triedCount || 0) > 0 || (it.trials || []).length > 0) tried++;
    if ((it.steps || []).length > 0) withSteps++;
  }
  return { total: ideas.length, fav, tried, withSteps, bySubject, byType, byPhase, byStatus };
}

export function getAllIdeaTags() {
  const s = new Set();
  for (const it of getIdeas()) for (const t of (it.tags || [])) if (t) s.add(t);
  return [...s].sort((a, b) => a.localeCompare(b, "vi"));
}

export function exportIdeasJSON() {
  return { app: "sgk-ideas", version: 2, exportedAt: new Date().toISOString(), count: getIdeas().length, ideas: getIdeas() };
}

export function importIdeasJSON(data, mode = "merge") {
  const arr = Array.isArray(data) ? data : data?.ideas;
  if (!Array.isArray(arr)) throw new Error("File JSON không chứa danh sách ý tưởng.");
  const valid = arr.map(normalizeIdea).filter((x) => x?.title);
  if (mode === "replace") {
    saveIdeas(valid.map((x, i) => ({ ...x, id: x.id || `idea_imp_${Date.now()}_${i}` })));
    return valid.length;
  }
  const cur = getIdeas();
  const keys = new Set(cur.map((x) => `${x.title}@@${x.subject}@@${x.grade}`));
  let added = 0;
  const next = [...cur];
  for (const x of valid) {
    const k = `${x.title}@@${x.subject}@@${x.grade}`;
    if (keys.has(k)) continue;
    keys.add(k);
    next.unshift({ ...x, id: x.id || `idea_imp_${Date.now()}_${added}` });
    added++;
  }
  saveIdeas(next);
  return added;
}

// ============================================================
// TASKS
// ============================================================
export const TASKS_STORAGE_KEY = "sgk_tasks";

export function getTasks() {
  const v = readJSON(TASKS_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
}

export const TASK_LIMITS = { titleMin: 1, titleMax: 120, descMax: 2000, categoryMax: 40 };
export function validateTaskData(d = {}) {
  const title = String(d.title ?? "").trim();
  if (!title) throw new Error("Tên việc không được để trống.");
  if (title.length > TASK_LIMITS.titleMax) throw new Error(`Tên việc tối đa ${TASK_LIMITS.titleMax} ký tự (đang ${title.length}).`);
  const desc = String(d.description ?? "");
  if (desc.length > TASK_LIMITS.descMax) throw new Error(`Mô tả tối đa ${TASK_LIMITS.descMax} ký tự.`);
  const cat = String(d.category ?? "");
  if (cat.length > TASK_LIMITS.categoryMax) throw new Error(`Danh mục tối đa ${TASK_LIMITS.categoryMax} ký tự.`);
  if (d.priority != null && !["low", "medium", "high"].includes(String(d.priority))) {
    throw new Error("Ưu tiên không hợp lệ.");
  }
  if (d.dueDate) {
    const t = Date.parse(d.dueDate);
    if (!Number.isFinite(t)) throw new Error("Hạn hoàn thành không phải ngày hợp lệ.");
  }
}

export function saveTasks(tasks) {
  try {
    saveJSON(TASKS_STORAGE_KEY, tasks);
    notifyDataUpdated({source:"personalDB", key:TASKS_STORAGE_KEY});
    return true;
  } catch (e) {
    console.error("Failed to save tasks:", e);
    return false;
  }
}

export function createTask(taskData) {
  validateTaskData(taskData);
  const tasks = getTasks();
  const nowIso = new Date().toISOString();
  const newTask = {
    ...taskData,
    id: `task_${Date.now()}`,
    createdAt: taskData?.createdAt || nowIso,
    updatedAt: nowIso,
    // Việc mới tạo luôn chưa hoàn thành — tick hoàn thành mới emit TASK_COMPLETED (chống tạo sẵn completed để farm XP)
    completed: false,
  };
  const updated = [...tasks, newTask];
  return saveTasks(updated) ? newTask : null;
}

export function updateTask(id, updates) {
  // Đổi trạng thái hoàn thành phải đi qua toggleTaskComplete để emit TASK_COMPLETED —
  // bỏ qua `completed` nếu caller vô tình/ký sinh kèm theo.
  const { completed: _ignored, ...safeUpdates } = updates || {};
  const tasks = getTasks();
  const cur = tasks.find((t) => t.id === id);
  if (cur) validateTaskData({ ...cur, ...safeUpdates });
  const updated = tasks.map((task) =>
    task.id === id
      ? { ...task, ...safeUpdates, updatedAt: new Date().toISOString() }
      : task
  );
  return saveTasks(updated);
}

export function deleteTask(id) {
  const tasks = getTasks();
  const updated = tasks.filter((task) => task.id !== id);
  return saveTasks(updated);
}

export function toggleTaskComplete(id) {
  const tasks = getTasks();
  const target = tasks.find(t=> t.id===id);
  const willComplete = target && !target.completed;
  const updated = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
  const ok = saveTasks(updated);
  if(ok && willComplete){ try{ emitTaskCompleted(id); }catch{} }
  return ok;
}

export function getTaskById(id) {
  const tasks = getTasks();
  return tasks.find((task) => task.id === id) || null;
}

export function getTasksByStatus(status) {
  const tasks = getTasks();
  if (status === "completed") return tasks.filter((t) => t.completed);
  if (status === "pending") return tasks.filter((t) => !t.completed);
  return tasks;
}

export function getTasksByPriority(priority) {
  const tasks = getTasks();
  return tasks.filter((t) => t.priority === priority);
}

// ============================================================
// INTERNSHIP
// ============================================================
export const INTERNSHIP_STORAGE_KEY = "sgk_internship";

export function getInternshipEntries() {
  const v = readJSON(INTERNSHIP_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function saveInternshipEntries(entries) {
  try {
    saveJSON(INTERNSHIP_STORAGE_KEY, entries);
    notifyDataUpdated({source:"personalDB", key:INTERNSHIP_STORAGE_KEY});
    return true;
  } catch (e) {
    console.error("Failed to save internship entries:", e);
    return false;
  }
}

export function createInternshipEntry(entryData) {
  const entries = getInternshipEntries();
  const newEntry = {
    id: `internship_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reflection: null,
    ...entryData,
  };
  const updated = [...entries, newEntry];
  return saveInternshipEntries(updated) ? newEntry : null;
}

export function updateInternshipEntry(id, updates) {
  const entries = getInternshipEntries();
  const updated = entries.map((entry) =>
    entry.id === id
      ? { ...entry, ...updates, updatedAt: new Date().toISOString() }
      : entry
  );
  return saveInternshipEntries(updated);
}

export function deleteInternshipEntry(id) {
  const entries = getInternshipEntries();
  const updated = entries.filter((entry) => entry.id !== id);
  return saveInternshipEntries(updated);
}

export function getInternshipEntryById(id) {
  const entries = getInternshipEntries();
  return entries.find((entry) => entry.id === id) || null;
}

export function updateInternshipReflection(id, reflectionData) {
  const entries = getInternshipEntries();
  const updated = entries.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          reflection: reflectionData,
          updatedAt: new Date().toISOString(),
        }
      : entry
  );
  return saveInternshipEntries(updated);
}

export function getInternshipEntriesBySchool(school) {
  const entries = getInternshipEntries();
  return entries.filter((e) => e.school === school);
}

export function getInternshipEntriesByDateRange(startDate, endDate) {
  const entries = getInternshipEntries();
  return entries.filter((e) => {
    if (!e.date) return false;
    const entryDate = new Date(e.date);
    return entryDate >= new Date(startDate) && entryDate <= new Date(endDate);
  });
}

// ============================================================
// UTILITIES
// ============================================================
export function exportPersonalData() {
  return {
    ideas: getIdeas(),
    tasks: getTasks(),
    internship: getInternshipEntries(),
    exportedAt: new Date().toISOString(),
  };
}

export function importPersonalData(data) {
  let success = true;
  if (data.ideas && Array.isArray(data.ideas)) {
    success = saveIdeas(data.ideas) && success;
  }
  if (data.tasks && Array.isArray(data.tasks)) {
    success = saveTasks(data.tasks) && success;
  }
  if (data.internship && Array.isArray(data.internship)) {
    success = saveInternshipEntries(data.internship) && success;
  }
  return success;
}

export function clearAllPersonalData() {
  removeKey(IDEAS_STORAGE_KEY);
  removeKey(TASKS_STORAGE_KEY);
  removeKey(INTERNSHIP_STORAGE_KEY);
}
