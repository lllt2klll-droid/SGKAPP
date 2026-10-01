// Data layer for personal teaching tools: Ideas, Tasks, Internship — THỐNG NHẤT QUA storage.js
// All data stored via unified storage (sgk_ prefix, backup-aware, quota-safe)
import { emitIdeaCreated, emitTaskCompleted } from './missionEvents.js';
import { readJSON, saveJSON, removeKey } from './storage.js';
import { appEvents as _appEventsPersonal, AppEvents as _AppEventsPersonal } from './core/appEvents.js';
function notifyDataUpdated(detail){ try{ _appEventsPersonal.emit(_AppEventsPersonal.DATA_UPDATED, detail||{source:"personalDB"});}catch{} }

// ============================================================
// IDEAS
// ============================================================
export const IDEAS_STORAGE_KEY = "sgk_ideas";

export function getIdeas() {
  const v = readJSON(IDEAS_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
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
  const ideas = getIdeas();
  const nowIso = new Date().toISOString();
  const newIdea = {
    ...ideaData,
    id: `idea_${Date.now()}`,
    createdAt: ideaData?.createdAt || nowIso,
    updatedAt: nowIso,
  };
  const updated = [...ideas, newIdea];
  const ok = saveIdeas(updated) ? newIdea : null;
  if(ok){ try{ emitIdeaCreated(ok.id); }catch{} }
  return ok;
}

export function updateIdea(id, updates) {
  const ideas = getIdeas();
  const updated = ideas.map((idea) =>
    idea.id === id
      ? { ...idea, ...updates, updatedAt: new Date().toISOString() }
      : idea
  );
  return saveIdeas(updated);
}

export function deleteIdea(id) {
  const ideas = getIdeas();
  const updated = ideas.filter((idea) => idea.id !== id);
  return saveIdeas(updated);
}

export function getIdeaById(id) {
  const ideas = getIdeas();
  return ideas.find((idea) => idea.id === id) || null;
}

// ============================================================
// TASKS
// ============================================================
export const TASKS_STORAGE_KEY = "sgk_tasks";

export function getTasks() {
  const v = readJSON(TASKS_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
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
