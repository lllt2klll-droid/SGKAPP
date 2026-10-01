// ── Mission Store ── local-first, timezone-safe, anti-exploit
import { MISSION_TEMPLATES, DIFFICULTY, XP_BY_DIFFICULTY, LEVELS, levelForXp, ACHIEVEMENTS } from './missionRegistry.js';
import { makeId, readJSON, saveJSON } from './storage.js';
import { safeGetJSON, safeSetJSON, safeGetString, safeRemove } from './safeStorage.js';
export { levelForXp };

const KEYS = {
  missions: 'sgk_missions', // Mission[]
  streak: 'sgk_mission_streak',
  xp: 'sgk_mission_xp',
  achievements: 'sgk_achievements',
  processed: 'sgk_mission_processed', // { [eventId]: true }
  weekly: 'sgk_mission_weekly',
  monthly: 'sgk_mission_monthly',
  history: 'sgk_mission_history', // optional aggregated
};

// ── date helpers (local timezone) ── unified
export function todayStr(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export const getLocalDateKey = todayStr;
export function parseDate(s){ const [y,m,da]=s.split('-').map(Number); return new Date(y,m-1,da); }
export function addDaysStr(base, delta){
  const dt=parseDate(base); dt.setDate(dt.getDate()+delta); return todayStr(dt);
}
export function weekStartStr(dateStr, weekStart=1){
  const d=parseDate(dateStr); let dow=d.getDay(); //0 Sun
  let diff=(dow - weekStart +7)%7; d.setDate(d.getDate()-diff); return todayStr(d);
}

// safe read/write wrappers with validation — safeStorage audit
function load(key, fallback){
  let validator=null;
  if(key===KEYS.missions) validator=Array.isArray;
  else if(key===KEYS.processed) validator=v=>v&&typeof v==="object" && !Array.isArray(v);
  else if([KEYS.streak, KEYS.xp, KEYS.achievements, KEYS.weekly, KEYS.monthly, KEYS.history].includes(key)) validator=v=>v&&typeof v==="object" && !Array.isArray(v);
  else if(Array.isArray(fallback)) validator=Array.isArray;
  else if(fallback && typeof fallback==="object") validator=v=>v&&typeof v==="object" && !Array.isArray(v);
  const parsed = safeGetJSON(key, fallback, validator);
  // Additional sanitize (giữ dữ liệu cũ nếu validator fail đã fallback)
  try{
    if(parsed===fallback) return fallback;
    if(key === KEYS.missions){
      if(!Array.isArray(parsed)) return fallback;
      return parsed.map(m => normalizeMission(m));
    }
    if(key === KEYS.streak){
      if(!parsed || typeof parsed !== 'object') return fallback;
      return {
        currentStreak: Math.max(0, Number(parsed.currentStreak)||0),
        longestStreak: Math.max(0, Number(parsed.longestStreak)||0),
        lastCompletedDate: parsed.lastCompletedDate || null,
        totalDaysCompleted: Math.max(0, Number(parsed.totalDaysCompleted)||0)
      };
    }
    if(key === KEYS.xp){
      if(!parsed || typeof parsed !== 'object') return fallback;
      return {
        totalXp: Math.max(0, Number(parsed.totalXp)||0),
        level: Math.max(1, Number(parsed.level)||1),
        lastAwardAt: parsed.lastAwardAt || null
      };
    }
    if(key === KEYS.achievements){
      if(!parsed || typeof parsed !== 'object') return fallback;
      return {
        unlocked: typeof parsed.unlocked === 'object' ? parsed.unlocked : {}
      };
    }
    return parsed;
  }catch(e){ console.warn("[missionStore] load sanitize failed for", key, e); return fallback; }
}
function save(key, val){
  const res = safeSetJSON(key, val);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] QuotaExceededError on", key, "-", res.message);
    else console.warn("[safeStorage] save failed for", key, ":", res.error, res.message);
    return false;
  }
  return true;
}

// ── Missions ── with dateKey migration adapter
function normalizeMission(m){
  if(!m) return m;
  // migrate dateKey <-> date, ensure both exist and are local date
  if(!m.date && m.dateKey) m.date = m.dateKey;
  if(!m.dateKey && m.date) m.dateKey = m.date;
  if(!m.date) m.date = todayStr();
  if(!m.dateKey) m.dateKey = m.date;
  // clamp progress
  if(typeof m.progress!=='number' || isNaN(m.progress)) m.progress=0;
  if(typeof m.target!=='number' || isNaN(m.target) || m.target<=0) m.target=1;
  m.progress = Math.max(0, Math.min(m.target, m.progress));
  if(m.progress>=m.target && !m.completed){ /* keep completed flag as is, don't auto complete here */ }
  return m;
}
export function getAllMissions(){
  const v = load(KEYS.missions, []);
  const arr = Array.isArray(v)? v : [];
  let mutated=false;
  const out = arr.map(raw=>{
    const before = JSON.stringify(raw);
    const n = normalizeMission({...raw});
    if(JSON.stringify(n)!==before) mutated=true;
    return n;
  });
  if(mutated) save(KEYS.missions, out);
  return out;
}
export function saveAllMissions(list){ 
  const normalized = (list||[]).map(m=> normalizeMission({...m}));
  return save(KEYS.missions, normalized); 
}
export function getMissionsByDate(dateStr){
  return getAllMissions().filter(m=> (m.date===dateStr || m.dateKey===dateStr));
}
export function getTodayMissions(){ return getMissionsByDate(todayStr()); }

// Streak
export function getStreak(){
  const v=load(KEYS.streak, null);
  if(v && typeof v.currentStreak==='number') return v;
  return { currentStreak:0, longestStreak:0, lastCompletedDate:null, totalDaysCompleted:0 };
}
export function saveStreak(s){ return save(KEYS.streak, s); }

// XP
export function getXpState(){
  const v=load(KEYS.xp, null);
  if(v && typeof v.totalXp==='number') return v;
  return { totalXp:0, level:1, lastAwardAt:null };
}
export function saveXpState(s){ return save(KEYS.xp, s); }

// Achievements
export function getAchievements(){
  const v=load(KEYS.achievements, null);
  if(v && v.unlocked) return v;
  return { unlocked:{} };
}
export function saveAchievements(a){ return save(KEYS.achievements, a); }

// Processed events (cap 800)
export function getProcessed(){
  const v=load(KEYS.processed, {});
  return v && typeof v==='object' ? v : {};
}
export function saveProcessed(p){
  // cap size: keep latest ~800 entries (approx via key count)
  const keys=Object.keys(p);
  if(keys.length>800){
    const keep = keys.slice(keys.length-800);
    const np={}; keep.forEach(k=> np[k]=p[k]); return save(KEYS.processed, np);
  }
  return save(KEYS.processed, p);
}
export function hasProcessed(eventId){ return !!getProcessed()[eventId]; }
export function markProcessed(eventId){ const p=getProcessed(); p[eventId]=Date.now(); saveProcessed(p); }

// ── Daily generator ──
function shuffle(a){ const arr=[...a]; for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function pickTemplates({ difficulty='normal', focus='balanced', booksCount=0, dailyCount=3, bonusEnabled=true }){
  const pool = MISSION_TEMPLATES;
  let candidates = [...pool];
  
  // If no books, filter out missions that require books
  if(booksCount === 0){
    candidates = candidates.filter(t=> !t.requiresBook);
  }
  
  // Include master missions with low probability (5-10%) when difficulty allows
  const includeMaster = difficulty === 'master' || (difficulty !== 'easy' && Math.random() < 0.05);
  if(!includeMaster) {
    candidates = candidates.filter(t=> !t.isMaster);
  }

  // Focus filter priority — đồng bộ với MISSION_TYPES + template mới (note/review/reference)
  const focusMap = {
    reading: ['reading','book_opened','review'],
    research: ['research','evidence','clip','reference','review','note'],
    teaching: ['lesson_plan','question','activity','worksheet','idea'],
    materials: ['question','worksheet','activity','idea'],
    balanced: null
  };
  const focusTypes = focusMap[focus] || null;
  if(focusTypes){
    const prioritized = candidates.filter(c=> focusTypes.includes(c.type));
    const rest = candidates.filter(c=> !focusTypes.includes(c.type));
    candidates = [...prioritized, ...rest];
  }

  // difficulty handling
  if(difficulty==='adaptive'){
    difficulty = 'normal'; // độ khó thích ứng được chốt trong adaptiveDifficulty() trước khi gọi
  }
  // difficulty weights theo độ khó đã chốt (adaptive đã resolve ở generateDailyMissions)
  function diffWeight(d){
    if(difficulty==='easy') return d==='easy'? 3 : d==='normal'?1 :0.2;
    if(difficulty==='normal') return d==='easy'?1: d==='normal'?3: d==='hard'?1:0.2;
    if(difficulty==='hard') return d==='normal'?1: d==='hard'?3: d==='expert'?1:0.2;
    if(difficulty==='expert') return d==='hard'?1: d==='expert'?3:0.5;
    return 1;
  }

  // If no books, deprioritize READING missions heavily
  if(booksCount===0){
    candidates = candidates.filter(c=> c.type!=='reading' || c.difficulty==='easy');
    // boost non-reading
    candidates.sort((a,b)=>{
      const aRead = a.type==='reading'?1:0;
      const bRead = b.type==='reading'?1:0;
      return aRead-bRead;
    });
  }

  // Weighted shuffle: sort by weight desc then random within tiers
  const weighted = candidates.map(c=> ({ c, w: diffWeight(c.difficulty) + Math.random()*0.5 }));
  weighted.sort((a,b)=> b.w-a.w);
  let picked = weighted.slice(0, Math.min(dailyCount*3, weighted.length)).map(x=>x.c);
  picked = shuffle(picked).slice(0, dailyCount);

  // Ensure variety: avoid duplicate type if possible
  const seen=new Set(); const dedup=[];
  for(const t of picked){ if(!seen.has(t.type)){ dedup.push(t); seen.add(t.type);} }
  if(dedup.length < picked.length){
    const remaining = picked.filter(t=> !dedup.includes(t));
    // fill up to dailyCount with uniqueness relaxed
    while(dedup.length < dailyCount && remaining.length){ dedup.push(remaining.shift()); }
    while(dedup.length < dailyCount && candidates.length){ dedup.push(candidates[Math.floor(Math.random()*candidates.length)]); }
  } else {
    while(dedup.length < dailyCount){ dedup.push(picked[Math.floor(Math.random()*picked.length)]); }
  }
  let final = dedup.slice(0, dailyCount);

  // Bonus slot: 1 additional hard/expert if enabled
  let bonus=null;
  if(bonusEnabled){
    // Apply same constraint engine as main missions
    // Filter by books requirement
    let bonusPool = MISSION_TEMPLATES.filter(t=> {
      if(booksCount === 0 && t.requiresBook) return false;
      return ['hard','expert'].includes(t.difficulty);
    });
    // Filter by focus
    if(focusTypes){
      const prioritized = bonusPool.filter(c=> focusTypes.includes(c.type));
      const rest = bonusPool.filter(c=> !focusTypes.includes(c.type));
      bonusPool = [...prioritized, ...rest];
    }
    // Filter out duplicates with main missions
    bonusPool = bonusPool.filter(t=> !final.some(f=>f.type===t.type && f.difficulty===t.difficulty));
    if(bonusPool.length){
      const b = bonusPool[Math.floor(Math.random()*bonusPool.length)];
      bonus = { ...b, isBonus:true, xp: Math.round(b.xp*1.2) };
    }
  }
  return { missions: final, bonus };
}

// Adaptive difficulty state tracking
const ADAPTIVE_STATE_KEY = 'sgk_adaptive_difficulty_state';

function getAdaptiveState(){
  const v = safeGetJSON(ADAPTIVE_STATE_KEY, null, v=>v&&typeof v==="object" && !Array.isArray(v));
  if(v && typeof v==="object") return v;
  return { currentLevel: 'normal', lastEvaluated: null };
}

function saveAdaptiveState(state){
  const res = safeSetJSON(ADAPTIVE_STATE_KEY, state);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] QuotaExceededError on", ADAPTIVE_STATE_KEY, "-", res.message);
    else console.warn("[safeStorage] saveAdaptiveState failed:", res.error, res.message);
  }
}

function adaptiveDifficulty(){
  // Look at last 7 days completion rate
  const all=getAllMissions();
  const today=todayStr();
  const dates=[];
  for(let i=1;i<=7;i++) dates.push(addDaysStr(today,-i));
  const byDate={};
  dates.forEach(d=> byDate[d]= { total:0, done:0 });
  all.forEach(m=>{ if(byDate[m.date]){ byDate[m.date].total++; if(m.completed) byDate[m.date].done++; }});
  const totals = Object.values(byDate).filter(v=>v.total>0);
  if(!totals.length) return null;
  const avg = totals.reduce((a,v)=> a + (v.done/v.total),0)/totals.length;
  
  // Get current adaptive level from state (not from settings)
  const adaptiveState = getAdaptiveState();
  const currentDiff = adaptiveState.currentLevel || 'normal';
  
  // Difficulty levels in order
  const levels = ['easy', 'normal', 'hard', 'expert', 'master'];
  const currentIndex = levels.indexOf(currentDiff);
  
  // Determine new difficulty based on completion rate
  let targetIndex = currentIndex;
  if(avg >= 0.9) targetIndex = Math.min(levels.length - 1, currentIndex + 1);
  else if(avg >= 0.7) targetIndex = currentIndex; // keep same
  else if(avg >= 0.4) targetIndex = Math.max(0, currentIndex - 1);
  else targetIndex = Math.max(0, currentIndex - 1); // < 40%, decrease
  
  // Ensure max ±1 level change
  targetIndex = Math.max(currentIndex - 1, Math.min(currentIndex + 1, targetIndex));
  
  const newLevel = levels[targetIndex];
  // Update adaptive state
  saveAdaptiveState({ currentLevel: newLevel, lastEvaluated: today });
  
  return newLevel;
}

export function generateDailyMissions({ date=todayStr(), settings={}, books=[] }={}){
  const missionsObj = settings.missions || {};
  // Validate dailyCount to prevent corrupted data
  let dailyCount = Number(missionsObj.dailyCount);
  if(isNaN(dailyCount) || dailyCount < 2 || dailyCount > 6) {
    dailyCount = 3; // fallback to default
  }
  const difficulty = missionsObj.difficulty || 'normal';
  const focus = missionsObj.focus || 'balanced';
  const bonusEnabled = missionsObj.bonusEnabled !== false;
  const adaptive = difficulty==='adaptive';
  let effDifficulty = difficulty;
  if(adaptive){
    const adv = adaptiveDifficulty();
    effDifficulty = adv || 'normal';
  }
  const { missions, bonus } = pickTemplates({
    difficulty: effDifficulty,
    focus,
    booksCount: books.length||0,
    dailyCount,
    bonusEnabled
  });
  const createdAt = new Date().toISOString();
  const makeMission=(tmpl, idx, isBonus=false)=>{
    const m={
      id: `mission_${date}_${idx}_${makeId('m').slice(0,6)}`,
      date,
      type: tmpl.type,
      difficulty: tmpl.difficulty,
      title: tmpl.title,
      description: tmpl.desc || tmpl.description || '',
      target: tmpl.target || 1,
      progress: 0,
      completed: false,
      xp: tmpl.xp,
      category: tmpl.category || 'reading',
      isBonus: !!isBonus || !!tmpl.isBonus,
      createdAt,
      completedAt: null,
      relatedTaskId: null,
    };
    return m;
  };
  const result = missions.map((t,i)=> makeMission(t,i,false));
  if(bonus) result.push(makeMission(bonus, result.length, true));
  return result;
}

export function ensureTodayMissions({ settings={}, books=[] }={}){
  const missionsObj = settings.missions || {};
  // Respect enabled setting - if disabled, don't generate new missions
  if(missionsObj.enabled === false) {
    return getMissionsByDate(todayStr());
  }
  // Respect autoGenerate setting - if disabled, don't auto-generate
  if(missionsObj.autoGenerate === false) {
    return getMissionsByDate(todayStr());
  }
  const date=todayStr();
  const existing = getMissionsByDate(date);
  // Idempotency guard: if missions already exist for today, return them
  if(existing.length>0) return existing;
  // Generate new missions
  const gen = generateDailyMissions({ date, settings, books });
  const all = getAllMissions();
  const next=[...all, ...gen];
  saveAllMissions(next);
  return gen;
}

// ── Progress engine ──
// Event = { type: string, eventId: string, payload?: any, amount?: number }
export function applyEvent(event){
  if(!event || !event.type || !event.eventId) return { updated:[], xpAwarded:0, completedIds:[] };
  if(hasProcessed(event.eventId)) return { updated:[], xpAwarded:0, completedIds:[] };
  // Check if missions are enabled - if disabled, no progress, XP, streak, or achievement updates
  const settingsRaw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
  const missionsSetting = settingsRaw?.missions;
  if(missionsSetting && missionsSetting.enabled === false) {
    return { updated:[], xpAwarded:0, completedIds:[] };
  }
  const date=todayStr();
  const all=getAllMissions();
  let changed=false;
  let xpAwarded=0;
  const completedIds=[];
  // map event type to mission types that care
  const eventToMissionTypes={
    BOOK_OPENED: ['book_opened'],
    PAGE_READ: ['reading'],
    BOOKMARK_CREATED: ['bookmark'],
    NOTE_CREATED: ['note'],
    VOCAB_CREATED: ['vocabulary'],
    CONCEPT_CREATED: ['research'],
    EVIDENCE_CREATED: ['evidence'],
    REFERENCE_CREATED: ['reference'],
    CLIP_CREATED: ['clip'],
    IDEA_CREATED: ['idea'],
    LESSON_PLAN_CREATED: ['lesson_plan'],
    LESSON_PLAN_EDITED: ['lesson_plan'],
    QUESTION_CREATED: ['question'],
    WORKSHEET_CREATED: ['worksheet'],
    ACTIVITY_CREATED: ['activity'],
    TASK_COMPLETED: ['task'],
    REVIEW_DONE: ['review'],
  };
  const interested = eventToMissionTypes[event.type] || [];
  if(interested.length===0) {
    // mark processed anyway to avoid re-processing
    markProcessed(event.eventId);
    return { updated:[], xpAwarded:0, completedIds:[] };
  }
  const amount = Number(event.amount)||1;
  for(const m of all){
    if(m.date!==date) continue;
    if(m.completed) continue;
    if(!interested.includes(m.type)) continue;
    // idempotency per mission: store processed events per mission? use global processed as guard already, but ensure same event doesn't double count across missions of same type
    // For distinct missions of same type, the same event should count for all? Spec says each event should have idempotency globally — so one PAGE_READ event should count toward one reading mission? We'll allow it to count for all reading missions today — but avoid double credit for same event on reload via global guard + per-mission processed set would be finer.
    // We add per-mission guard via m._processedIds (persisted optionally)
    const midProcessedKey = `${event.eventId}__${m.id}`;
    if(hasProcessed(midProcessedKey)) continue;
    // progress
    m.progress = Math.min(m.target, (m.progress||0) + amount);
    if(m.progress >= m.target && !m.completed){
      m.completed = true;
      m.completedAt = new Date().toISOString();
      completedIds.push(m.id);
      xpAwarded += m.xp || XP_BY_DIFFICULTY[m.difficulty] || 10;
    }
    // Include streak bonus? handled separately
    changed=true;
    markProcessed(midProcessedKey);
  }
  if(changed){
    // also mark original eventId
    markProcessed(event.eventId);
    saveAllMissions(all);
    // XP + streak + achievements
    if(xpAwarded>0){
      addXp(xpAwarded, { reason:'mission', date });
    }
    // daily completion bonus if all main missions done (exclude bonus)
    const remainingAfter = all.filter(mm=> mm.date===date && !mm.isBonus && !mm.completed);
    const mainTotal = all.filter(mm=> mm.date===date && !mm.isBonus).length;
    const mainDone = all.filter(mm=> mm.date===date && !mm.isBonus && mm.completed).length;
    if(mainTotal>0 && remainingAfter.length===0){
      // check if we've already given daily bonus
      const bonusKey=`daily_bonus_${date}`;
      if(!hasProcessed(bonusKey)){
        const bonusXp=20;
        addXp(bonusXp, { reason:'daily_bonus', date });
        markProcessed(bonusKey);
        xpAwarded += bonusXp;
      }
    }
    // update streak if at least min missions completed
    updateStreakIfNeeded(all, date);
    // achievements
    checkAndUnlockAchievements();
  } else {
    markProcessed(event.eventId);
  }
  return { updated: getMissionsByDate(date), xpAwarded, completedIds };
}

export function incrementProgress(missionId, delta=1){
  // Check if missions are enabled
  const settingsRaw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
  const missionsSetting = settingsRaw?.missions;
  if(missionsSetting && missionsSetting.enabled === false) {
    return null;
  }
  const all=getAllMissions();
  const m=all.find(x=>x.id===missionId);
  if(!m || m.completed) return null;
  m.progress = Math.min(m.target, (m.progress||0)+delta);
  if(m.progress>=m.target){ 
    m.completed=true; 
    m.completedAt=new Date().toISOString(); 
    const xp=m.xp||10; 
    addXp(xp,{reason:'manual'}); 
  }
  saveAllMissions(all);
  updateStreakIfNeeded(all, todayStr());
  checkAndUnlockAchievements();
  return m;
}

export function completeMission(missionId){
  // Check if missions are enabled
  const settingsRaw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
  const missionsSetting = settingsRaw?.missions;
  if(missionsSetting && missionsSetting.enabled === false) {
    return null;
  }
  const all=getAllMissions();
  const m=all.find(x=>x.id===missionId);
  if(!m || m.completed) return null;
  m.progress=m.target; m.completed=true; m.completedAt=new Date().toISOString();
  const xp=m.xp||10;
  addXp(xp,{reason:'manual'});
  saveAllMissions(all);
  updateStreakIfNeeded(all, todayStr());
  checkAndUnlockAchievements();
  // daily bonus check
  const date=todayStr();
  const mainTotal=all.filter(mm=> mm.date===date && !mm.isBonus).length;
  const mainDone=all.filter(mm=> mm.date===date && !mm.isBonus && mm.completed).length;
  if(mainDone===mainTotal && !hasProcessed(`daily_bonus_${date}`)){
    addXp(20,{reason:'daily_bonus', date}); markProcessed(`daily_bonus_${date}`);
  }
  return m;
}

// ── XP / Level ──
export function addXp(amount, meta={}){
  // Check if XP is enabled
  const settingsRaw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
  const missionsSetting = settingsRaw?.missions;
  if(missionsSetting && missionsSetting.xpEnabled === false) {
    // Return current state without adding XP
    return getXpState();
  }
  const s=getXpState();
  const next={ ...s, totalXp: Math.max(0, s.totalXp + amount), lastAwardAt: new Date().toISOString() };
  next.level = levelForXp(next.totalXp).current.level;
  saveXpState(next);
  // streak bonus +5 if applicable — handled in updateStreakIfNeeded
  return next;
}
export function getXp(){ return getXpState().totalXp; }
export function getLevelInfo(){ const s=getXpState(); return levelForXp(s.totalXp); }

// ── Streak ──
export function updateStreakIfNeeded(allMissions, dateStr){
  const settingsRaw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
  const missionsSetting = settingsRaw?.missions;
  if(missionsSetting && missionsSetting.streakEnabled===false) return getStreak();
  const minRequired = Math.max(1, Number(missionsSetting?.minMissionsForStreak)||1);
  // Determine if today qualifies
  const todayMissions = allMissions.filter(m=> m.date===dateStr && !m.isBonus);
  const done = todayMissions.filter(m=> m.completed).length;
  const streak = getStreak();
  // Only update when at least minRequired completed and not already counted today
  if(done >= minRequired){
    if(streak.lastCompletedDate===dateStr) return streak; // already counted
    // Check consecutive
    const prevDate = streak.lastCompletedDate;
    let newStreak=streak.currentStreak;
    if(prevDate){
      const expected = addDaysStr(prevDate,1);
      if(dateStr===expected) newStreak = streak.currentStreak +1;
      else if(dateStr > expected) newStreak =1; // gap resets to 1
      else newStreak = streak.currentStreak+1;
    } else {
      newStreak=1;
    }
    const longest = Math.max(streak.longestStreak||0, newStreak);
    const next={ currentStreak:newStreak, longestStreak:longest, lastCompletedDate:dateStr, totalDaysCompleted:(streak.totalDaysCompleted||0)+ (streak.lastCompletedDate===dateStr?0:1) };
    saveStreak(next);
    // streak bonus +5 xp per streak day after 2
    if(newStreak>=2 && !hasProcessed(`streak_bonus_${dateStr}`)){
      addXp(5, {reason:'streak', date:dateStr});
      markProcessed(`streak_bonus_${dateStr}`);
    }
    checkAndUnlockAchievements();
    return next;
  }
  // If gap >1 day without completion, streak resets logically on next generation? We handle reset on evaluation next day
  // Check if streak should be reset due to missed day
  if(streak.lastCompletedDate){
    const expected = addDaysStr(streak.lastCompletedDate,1);
    if(dateStr > expected){
      // missed at least one day; reset current but keep longest
      // Only reset if no completion today (done < min) and date has advanced past expected
      // We don't reset immediately unless we move to next day; caller will check via evaluateStreakOnDate
    }
  }
  return streak;
}
export function evaluateStreakOnDate(currentDateStr){
  const streak=getStreak();
  if(!streak.lastCompletedDate) return streak;
  const expected=addDaysStr(streak.lastCompletedDate,1);
  if(currentDateStr > expected){
    // gap without qualifying day — reset
    const next={ ...streak, currentStreak:0 };
    saveStreak(next);
    return next;
  }
  return streak;
}

// ── Achievements ──
// Đếm local (sync, nhanh) + hợp nhất IndexedDB (async) — researchDB/evidence/clips/refs/concepts
// đã chuyển sang IDB nên chỉ đọc localStorage sẽ luôn thiếu → achievements không bao giờ mở.
function collectStatsSync(){
  // gather counts for achievement checks — per-book keys isolation: lastPage_<filename>
  let totalPagesRead=0;
  try{
    const keys=Object.keys(localStorage);
    keys.forEach(k=>{
      if(k.startsWith('lastPage_')){
        const v=parseInt(safeGetString(k, '0')||'0',10);
        if(v>0) totalPagesRead += Math.max(0, v-1);
      }
    });
  }catch(e){ console.warn("[missionStore] collectStats pages failed", e); }
  const lsCount=(key, isObj=false)=>{
    try{
      const v= load(key, isObj?{}:[]);
      if(isObj) return Object.values(v||{}).reduce((a,p)=> a + (Array.isArray(p)?p.length:0),0);
      return Array.isArray(v)?v.length:0;
    }catch(e){ console.warn("[missionStore] operation failed", e); return 0; }
  };
  const totalEvidence=lsCount('sgk_evidence'), totalClips=lsCount('sgk_clips'),
        totalRefs=lsCount('sgk_refs'), totalConcepts=lsCount('sgk_concepts');
  // IndexedDB counts not reliably available sync; approximate with local
  const totalIdeas = lsCount('sgk_ideas');
  const totalLessonPlans = (()=>{ try{ const v=load('khbd_v2_plans',[]); const l=load('sgk_lessonplans',[]); const ids=new Set(); if(Array.isArray(v)) v.forEach(p=>ids.add(p.id)); if(Array.isArray(l)) l.forEach(p=>ids.add(p.id)); return ids.size;} catch (e) { console.warn("[missionStore] operation failed", e); return 0; }})();
  const totalQuestions = lsCount('sgk_questions');
  const totalVocab = lsCount('sgk_vocab');
  const totalBookmarks = lsCount('sgk_bookmarks', true);
  const xpState=getXpState();
  const streak=getStreak();
  const allM=getAllMissions();
  const completedByDate=new Set(allM.filter(m=> m.completed).map(m=> m.date));
  return {
    totalPagesRead, totalEvidence, totalClips, totalConcepts, totalRefs,
    totalIdeas, totalLessonPlans, totalQuestions, totalVocab, totalBookmarks,
    totalXp: xpState.totalXp, level: xpState.level,
    currentStreak: streak.currentStreak, longestStreak: streak.longestStreak,
    totalDaysCompleted: completedByDate.size,
  };
}
function collectStats(){ return collectStatsSync(); }
async function collectStatsAsync(){
  const base = collectStatsSync();
  // Hợp nhất số liệu IndexedDB (researchDB) — best-effort, không vỡ khi IDB lỗi
  try{
    const { getEvidence, getClips, getRefs, getConcepts } = await import('./researchDB.js');
    const [ev, cl, rf, co] = await Promise.allSettled([getEvidence(), getClips(), getRefs(), getConcepts()]);
    if(ev.status==='fulfilled' && Array.isArray(ev.value)) base.totalEvidence = Math.max(base.totalEvidence, ev.value.length);
    if(cl.status==='fulfilled' && Array.isArray(cl.value)) base.totalClips = Math.max(base.totalClips, cl.value.length);
    if(rf.status==='fulfilled' && Array.isArray(rf.value)) base.totalRefs = Math.max(base.totalRefs, rf.value.length);
    if(co.status==='fulfilled' && Array.isArray(co.value)) base.totalConcepts = Math.max(base.totalConcepts, co.value.length);
  }catch(e){ console.warn("[missionStore] collectStatsAsync IDB merge failed", e); }
  return base;
}
export function checkAndUnlockAchievements(){
  // Check if achievements are enabled
  const settingsRaw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
  const missionsSetting = settingsRaw?.missions;
  if(missionsSetting && missionsSetting.achievementsEnabled === false) {
    return getAchievements();
  }
  // Sync pass (local) — mở khóa ngay những gì đếm được; IDB pass chạy nền补足
  const stats=collectStatsSync();
  const ach=getAchievements();
  let changed=false;
  for(const def of ACHIEVEMENTS){
    if(ach.unlocked[def.id]) continue;
    try{
      if(def.check(stats)){
        ach.unlocked[def.id]= new Date().toISOString();
        changed=true;
      }
    } catch (e) { console.warn("[missionStore] operation failed", e); }
  }
  if(changed) saveAchievements(ach);
  // Async pass — hợp nhất IDB rồi kiểm tra lại (fire-and-forget, tương thích caller sync cũ)
  try{
    const p = collectStatsAsync().then(full=>{
      const cur = getAchievements();
      let changed2=false;
      for(const def of ACHIEVEMENTS){
        if(cur.unlocked[def.id]) continue;
        try{ if(def.check(full)){ cur.unlocked[def.id]= new Date().toISOString(); changed2=true; } }catch{}
      }
      if(changed2){
        saveAchievements(cur);
        try{ markProcessed(`ach_async_${todayStr()}`); }catch{}
      }
      return cur;
    }).catch(()=> ach);
    // Nếu caller await được thì trả promise resolve về bản mới nhất
    if(p && typeof p.then==='function'){
      p.catch(()=>{});
      // Giữ tương thích sync: trả về ach hiện tại, nhưng gắn .then để caller mới có thể await
      // (không break code cũ dùng return value sync)
    }
  }catch{}
  return ach;
}

// Weekly / Monthly aggregates
// Ngày đầu tuần lấy từ Cài đặt → Tổng quan (general.weekStart), mặc định Thứ Hai
function settingsWeekStart(settings={}){
  try {
    if(settings?.general?.weekStart === 0) return 0;
    const raw = safeGetJSON('sgk_settings', null, v=>v&&typeof v==="object" && !Array.isArray(v));
    if(raw?.general?.weekStart === 0) return 0;
  } catch {}
  return 1;
}
export function getWeeklyProgress(weekStartDateStr, settings={}){
  const missionsObj = settings.missions || {};
  if(missionsObj.weeklyGoalsEnabled === false) {
    return null; // disabled
  }
  const start=weekStartStr(weekStartDateStr||todayStr(), settingsWeekStart(settings));
  const dates=[]; for(let i=0;i<7;i++) dates.push(addDaysStr(start,i));
  const all=getAllMissions();
  const byDate={};
  dates.forEach(d=> byDate[d]= { total:0, done:0, xp:0 });
  all.forEach(m=>{ if(byDate[m.date]){ byDate[m.date].total++; byDate[m.date].xp+= m.xp||0; if(m.completed) byDate[m.date].done++; } });
  const total=dates.reduce((a,d)=> a+byDate[d].total,0);
  const done=dates.reduce((a,d)=> a+byDate[d].done,0);
  // reading pages this week (approx via lastPage? better via mission progress type reading)
  const pagesThisWeek = all.filter(m=> dates.includes(m.date) && m.type==='reading').reduce((a,m)=> a + (m.completed? m.target: m.progress),0);
  const ideasThisWeek = load('sgk_ideas',[]).filter(it=>{ const at=it.at||it.createdAt; if(!at) return false; const ds=todayStr(new Date(at)); return dates.includes(ds); }).length;
  return { start, dates, byDate, total, done, pagesThisWeek, ideasThisWeek };
}

export function getMonthlyChallenge(settings={}){
  const missionsObj = settings.missions || {};
  if(missionsObj.monthlyChallengeEnabled === false) {
    return null; // disabled
  }
  const nowStr=todayStr();
  const month=nowStr.slice(0,7);
  const all=getAllMissions();
  const monthMissions=all.filter(m=> m.date.startsWith(month));
  const pagesThisMonth = monthMissions.filter(m=> m.type==='reading').reduce((a,m)=> a + (m.completed? m.target: m.progress),0);
  const ideasThisMonth = (()=>{ try{ return load('sgk_ideas',[]).filter(it=>{ const d=it.at||it.createdAt; if(!d) return false; return new Date(d).toISOString().slice(0,7)===month; }).length;} catch (e) { console.warn("[missionStore] operation failed", e); return 0; }})();
  const doneCount=monthMissions.filter(m=> m.completed).length;
  // challenge definition stored or default
  const stored=load(KEYS.monthly,null);
  if(stored && stored.month===month) return { ...stored, pagesThisMonth, ideasThisMonth, doneCount, total: monthMissions.length };
  const challenge={ month, type:'reading', target:200, title:'Đọc 200 trang SGK', desc:'Thử thách tháng', createdAt: new Date().toISOString() };
  save(KEYS.monthly, challenge);
  return { ...challenge, pagesThisMonth, ideasThisMonth, doneCount, total: monthMissions.length };
}

// History buckets
export function getMissionHistory({ range='all' }={}){
  const all=getAllMissions().slice().sort((a,b)=> b.date.localeCompare(a.date));
  if(range==='today') return all.filter(m=> m.date===todayStr());
  if(range==='week'){ const s=weekStartStr(todayStr(), settingsWeekStart()); return all.filter(m=> m.date>=s); }
  if(range==='month'){ const mo=todayStr().slice(0,7); return all.filter(m=> m.date.startsWith(mo)); }
  return all;
}

// Migration helper: ensure structures exist
const SCHEMA_VERSION_KEY = 'sgk_mission_schema_version';
const CURRENT_SCHEMA_VERSION = 1;

export function migrateMissions(){
  try{
    const storedVersion = safeGetString(SCHEMA_VERSION_KEY, null);
    const version = storedVersion ? parseInt(storedVersion, 10) : 0;
    if(version >= CURRENT_SCHEMA_VERSION) return; // already migrated
    // Initialize structures
    getAllMissions();
    getStreak();
    getXpState();
    getAchievements();
    getProcessed();
    // Update schema version — quota handled
    { const r=safeSetJSON(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION.toString()); if(!r.ok){ if(r.quota) console.warn("[safeStorage] QuotaExceededError on", SCHEMA_VERSION_KEY, "-", r.message); else console.warn("[safeStorage] migrateMissions save failed", r.error); } }
  } catch (e) { console.warn("[missionStore] migrateMissions failed", e); }
}
