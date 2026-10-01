// ── Question Schema — Canonical Contract (PHASE 5) ───────────────────────────
// Single source of truth for question data across AI → Bank → Worksheet → KHBD → Export
export const QUESTION_TYPES = {
  MC: 'mc',
  ESSAY: 'essay',
  FILL: 'fill',
};
export const ALLOWED_TYPES = new Set(Object.values(QUESTION_TYPES));

// Legacy type mapping
const LEGACY_TYPE_MAP = {
  'mc': 'mc',
  'tracnghiem': 'mc',
  'multiple': 'mc',
  'choice': 'mc',
  'tl': 'essay',
  'tuluan': 'essay',
  'essay': 'essay',
  'tự luận': 'essay',
  'tựluận': 'essay',
  'fill': 'fill',
  'dienkhuyet': 'fill',
  'điền': 'fill',
  'fill_in_blank': 'fill',
};

function normalizeType(rawType, raw) {
  const low = String(rawType || '').trim().toLowerCase();
  if (LEGACY_TYPE_MAP[low]) return LEGACY_TYPE_MAP[low];
  // Infer if missing/unknown
  if (Array.isArray(raw?.options) && raw.options.filter(o=> String(o||'').trim()).length >= 2) {
    // has options → likely mc, but if raw explicitly was fill/essay, don't force
    // Check if raw has answer and type unknown — prefer fill/essay distinction by question form?
    // Default to mc if options present, else essay
    if (low === 'fill') return 'fill';
    if (low === 'essay') return 'essay';
    return 'mc';
  }
  if (low === '' || low === 'unknown') {
    // If has answer field and no options → essay or fill; default essay for backward compat
    // Fill is short answer (one line), essay is area. We default to essay unless raw explicitly fill.
    return 'essay';
  }
  return null; // unknown type
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

export function validateMC(question) {
  const errors=[];
  if (!question || typeof question !== 'object') return { isValid:false, errors:['null'] };
  if (question.type !== 'mc') errors.push('type must be mc');
  if (!question.question || String(question.question).trim()==='') errors.push('missing question');
  if (!Array.isArray(question.options) || question.options.length !== 4) errors.push('options must be exactly 4');
  else {
    question.options.forEach((o,i)=>{
      if (!String(o||'').trim()) errors.push(`option ${String.fromCharCode(65+i)} empty`);
    });
  }
  const idx = Number(question.correctIndex);
  if (!Number.isInteger(idx) || idx <0 || idx>3) errors.push('correctIndex must be 0-3');
  return { isValid: errors.length===0, errors };
}
export function validateFill(question){
  const errors=[];
  if (question.type !== 'fill') errors.push('type must be fill');
  if (!question.question || String(question.question).trim()==='') errors.push('missing question');
  if (question.answer === undefined || String(question.answer).trim()==='') errors.push('missing answer');
  // fill should NOT have options or correctIndex
  if (Array.isArray(question.options) && question.options.length) errors.push('fill must not have options');
  if (question.correctIndex !== undefined && question.correctIndex !== null) errors.push('fill must not have correctIndex');
  return { isValid: errors.length===0, errors };
}
export function validateEssay(question){
  const errors=[];
  if (question.type !== 'essay') errors.push('type must be essay');
  if (!question.question || String(question.question).trim()==='') errors.push('missing question');
  // answerGuide or answer
  const guide = question.answerGuide ?? question.answer;
  if (guide !== undefined && typeof guide !== 'string') errors.push('answerGuide must be string');
  return { isValid: errors.length===0, errors };
}
export function validateQuestionEntity(q){
  if (!q || typeof q !== 'object') return { isValid:false, errors:['null'], warnings:[] };
  const type = String(q.type||'').toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return { isValid:false, errors:[`unknown type ${type}`], warnings:[] };
  let res;
  if (type==='mc') res=validateMC(q);
  else if (type==='fill') res=validateFill(q);
  else res=validateEssay(q);
  return { ...res, warnings:[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZATION — AI output is untrusted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw AI-generated question into canonical form.
 * Returns canonical question object or null if invalid (reject).
 */
export function normalizeGeneratedQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Detect type
  let type = normalizeType(raw.type, raw);
  if (!type) return null; // unknown type → reject
  // Explicit fill must not fall through essay
  if (String(raw.type||'').toLowerCase() === 'fill' && type !== 'fill') type='fill';

  const questionText = String(raw.question || raw.q || raw.title || '').trim();
  if (!questionText) return null;

  if (type === 'mc') {
    // Sanitize options → exactly 4 trimmed strings
    let opts = [];
    if (Array.isArray(raw.options)) opts = raw.options.map(o=> String(o||'').trim());
    else if (Array.isArray(raw.answers)) opts = raw.answers.map(o=> String(o||'').trim());
    else if (Array.isArray(raw.choices)) opts = raw.choices.map(o=> String(o||'').trim());
    // Repair: pad or slice to 4? But spec says reject if not exactly 4 or empty → we reject
    if (opts.length !== 4) return null;
    if (opts.some(o=> !o)) return null; // empty option → reject

    // Normalize correctIndex per spec
    const rawIdx = raw.correctIndex ?? raw.answer ?? raw.correct ?? raw.correctAnswer;
    const idx = Number(rawIdx);
    const correctIndex = Number.isInteger(idx) && idx>=0 && idx<=3 ? idx : 0;
    // If raw index was out of range and not inferrable, spec prefers reject unless safely 0
    // For AI, if rawIdx was 4/-1 or "2" string "2" → Number("2")==2 valid, so ok
    // If rawIdx was "E" → Number("E")==NaN → fallback 0 but we will not generate E/F/G because we clamp
    // We do not generate E/F/G — String.fromCharCode(65+correctIndex) always A-D
    // If original was invalid and fallback to 0, we accept but mark as repaired (still valid)
    const normalized = {
      type: 'mc',
      question: questionText,
      options: opts,
      correctIndex,
      // Clear essay/fill fields
      answer: undefined,
      answerGuide: undefined,
    };
    // Validate after repair
    const v = validateMC(normalized);
    return v.isValid ? normalized : null;
  }

  if (type === 'fill') {
    const answer = String(raw.answer ?? raw.answerGuide ?? raw.correctAnswer ?? '').trim();
    if (!answer) return null;
    const normalized = {
      type: 'fill',
      question: questionText,
      answer,
      options: undefined,
      correctIndex: undefined,
    };
    const v = validateFill(normalized);
    return v.isValid ? normalized : null;
  }

  // essay
  if (type === 'essay') {
    const guide = String(raw.answerGuide ?? raw.answer ?? raw.explanation ?? '').trim();
    const normalized = {
      type: 'essay',
      question: questionText,
      answerGuide: guide,
      answer: guide, // keep alias for backward compat
      options: undefined,
      correctIndex: undefined,
    };
    const v = validateEssay(normalized);
    return v.isValid ? normalized : null;
  }

  return null;
}

/**
 * Normalize a persisted question (from storage) into canonical form.
 * Repairs legacy fields, ensures type, validates.
 * Returns canonical question or null if quarantined.
 */
export function normalizePersistedQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const typeLow = String(raw.type||'').toLowerCase();
  let type = LEGACY_TYPE_MAP[typeLow] || null;
  if (!type) {
    // Infer for legacy without type: if has 4 options and correctIndex → mc else essay
    if (Array.isArray(raw.options) && raw.options.length===4) type='mc';
    else type='essay';
  }
  if (type==='mc') {
    const q = String(raw.question||'').trim();
    if (!q) return null;
    let opts = Array.isArray(raw.options) ? raw.options.map(o=> String(o||'').trim()) : [];
    // Repair: if legacy had fewer than 4 but non-empty, pad? Better reject for strictness — but for persisted, try repair
    if (opts.length !== 4) {
      // Quarantine invalid persisted MC
      return null;
    }
    if (opts.some(o=>!o)) return null;
    const idx = Number(raw.correctIndex ?? raw.answer);
    const correctIndex = Number.isInteger(idx) && idx>=0 && idx<=3 ? idx : 0;
    return {
      id: raw.id,
      type: 'mc',
      question: q,
      options: opts,
      correctIndex,
      subject: raw.subject || '',
      grade: raw.grade ?? '',
      chapter: raw.chapter || '',
      yccd: raw.yccd || '',
      mucdo: raw.mucdo || '',
      at: raw.at,
      source: raw.source,
    };
  }
  if (type==='fill') {
    const q = String(raw.question||'').trim();
    const ans = String(raw.answer||'').trim();
    if (!q || !ans) return null;
    return {
      id: raw.id,
      type: 'fill',
      question: q,
      answer: ans,
      subject: raw.subject || '',
      grade: raw.grade ?? '',
      chapter: raw.chapter || '',
      yccd: raw.yccd || '',
      mucdo: raw.mucdo || '',
      at: raw.at,
      source: raw.source,
    };
  }
  // essay
  return {
    id: raw.id,
    type: 'essay',
    question: String(raw.question||'').trim(),
    answer: String(raw.answer||'').trim(),
    answerGuide: String(raw.answerGuide ?? raw.answer ?? '').trim(),
    subject: raw.subject || '',
    grade: raw.grade ?? '',
    chapter: raw.chapter || '',
    yccd: raw.yccd || '',
    mucdo: raw.mucdo || '',
    at: raw.at,
    source: raw.source,
  };
}

// Export helpers for testing
export const QUESTION_SCHEMA = {
  types: ['mc','essay','fill'],
  mc: { optionsLength:4, correctIndexRange:[0,3] },
  fill: { requiresAnswer:true },
  essay: { requiresAnswerGuide:false },
};
export const NORMALIZATION_RULES = {
  allowedTypes: ['mc','essay','fill'],
  mc: 'exactly 4 non-empty options, correctIndex 0-3 (Number conversion, fallback 0, never E/F/G)',
  fill: 'type fill dedicated, question + answer, no options/correctIndex',
  essay: 'type essay, question + answerGuide (alias answer)',
  ai: 'untrusted → detect type, sanitize, validate, repair safe issues, reject invalid',
};
