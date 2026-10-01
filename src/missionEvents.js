// ── Mission Events ── lightweight local event bus + emit helpers (unified via core/appEvents)
import { applyEvent, todayStr, getAchievements } from './missionStore.js';
import { soundManager } from './audio/soundManager.js';
import { appEvents, AppEvents } from './core/appEvents.js';

const listeners = new Set();

export function onMissionUpdate(fn){
  listeners.add(fn);
  // also subscribe to unified bus so DATA_UPDATED → mission flow is consistent
  const off2 = appEvents.on(AppEvents.MISSIONS_UPDATED, fn);
  return ()=> { listeners.delete(fn); try{ off2(); }catch{} };
}
function notify(updated){
  listeners.forEach(fn=>{
    try{ fn(updated); }catch{}
  });
  // dispatch via unified bus (still fires window CustomEvent for legacy)
  try{ appEvents.emit(AppEvents.MISSIONS_UPDATED, updated); }catch{}
  try{ appEvents.emit(AppEvents.DATA_UPDATED, { domain: "missions", action:"updated" }); }catch{}
}

export function emitMissionEvent(type, eventId, payload={}, amount=1){
  if(!type || !eventId) return;
  let beforeAch = null;
  try { beforeAch = getAchievements(); } catch {}
  const res = applyEvent({ type, eventId, payload, amount });
  if(res.updated) notify(res);
  // Sound — only on actual progress, not every event
  try {
    if (res.completedIds && res.completedIds.length > 0) {
      soundManager.play("missionComplete");
    }
    // Achievement unlocked detection
    if (beforeAch) {
      const after = getAchievements();
      const beforeCount = Object.keys(beforeAch.unlocked || {}).length;
      const afterCount = Object.keys(after.unlocked || {}).length;
      if (afterCount > beforeCount) soundManager.play("achievementUnlock");
    }
  } catch {}
  return res;
}

// Helpers to build ids idempotently — use LOCAL date
export function emitBookOpened(filename){
  const date=todayStr();
  return emitMissionEvent('BOOK_OPENED', `book_opened_${filename}_${date}`);
}
export function emitPageRead(filename, pdfPage){
  const date=todayStr();
  return emitMissionEvent('PAGE_READ', `page_read_${filename}_${pdfPage}_${date}`);
}
export function emitPagesRead(filename, fromPage, toPage){
  // each page counted separately but batch via loop? single event with amount delta
  // Safer: emit per page id to ensure deduplication per page
  let last=null;
  for(let p=fromPage; p<=toPage; p++){
    last = emitPageRead(filename, p);
  }
  return last;
}
export function emitBookmarkCreated(filename, page){
  return emitMissionEvent('BOOKMARK_CREATED', `bookmark_${filename}_${page}`);
}
export function emitNoteCreated(filename, page){
  // note may not have file; fallback generic
  const id = filename ? `note_${filename}_${page}_${Date.now()}` : `note_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  return emitMissionEvent('NOTE_CREATED', id);
}
export function emitVocabCreated(id){
  return emitMissionEvent('VOCAB_CREATED', `vocab_${id}`);
}
export function emitConceptCreated(id){
  return emitMissionEvent('CONCEPT_CREATED', `concept_${id}`);
}
export function emitEvidenceCreated(id){
  return emitMissionEvent('EVIDENCE_CREATED', `evidence_${id}`);
}
export function emitClipCreated(id){
  return emitMissionEvent('CLIP_CREATED', `clip_${id}`);
}
export function emitIdeaCreated(id){
  return emitMissionEvent('IDEA_CREATED', `idea_${id}`);
}
export function emitLessonPlanCreated(id){
  return emitMissionEvent('LESSON_PLAN_CREATED', `lp_${id}`);
}
export function emitLessonPlanEdited(id){
  return emitMissionEvent('LESSON_PLAN_EDITED', `lp_edit_${id}_${todayStr()}`);
}
export function emitQuestionCreated(id){
  return emitMissionEvent('QUESTION_CREATED', `q_${id}`);
}
export function emitWorksheetCreated(id){
  return emitMissionEvent('WORKSHEET_CREATED', `ws_${id}`);
}
export function emitActivityCreated(id){
  return emitMissionEvent('ACTIVITY_CREATED', `act_${id}`);
}
export function emitTaskCompleted(id){
  return emitMissionEvent('TASK_COMPLETED', `task_${id}`);
}
export function emitReferenceCreated(id){
  return emitMissionEvent('REFERENCE_CREATED', `ref_${id}`);
}
export function emitReviewDone(id){
  const key = id || `${todayStr()}_${Date.now()}`;
  return emitMissionEvent('REVIEW_DONE', `review_${key}`);
}
