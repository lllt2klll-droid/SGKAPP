import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (()=>{ const m=new Map(); return { getItem:k=>m.get(k)||null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear(), get length(){return m.size}, key:i=>[...m.keys()][i]||null }})();
globalThis.window={ dispatchEvent:()=>{}, addEventListener:()=>{}, removeEventListener:()=>{} };

const { normalizeGeneratedQuestion, validateQuestionEntity, QUESTION_SCHEMA } = await import('./questionSchema.js');
const { addQuestion, getQuestions, deleteQuestion, getWorksheets, saveWorksheet } = await import('./teachingDB.js');

describe('PHASE 5 — Question Schema', ()=>{
  beforeEach(()=> localStorage.clear());

  it('valid MC passes', ()=>{
    const q = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:2 });
    assert.ok(q);
    assert.equal(q.type,'mc');
    assert.equal(q.correctIndex,2);
    assert.equal(q.options.length,4);
  });
  it('invalid MC missing options → reject', ()=>{
    const q = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B'], correctIndex:0 });
    assert.equal(q, null);
  });
  it('invalid MC empty option → reject', ()=>{
    const q = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','','C','D'], correctIndex:0 });
    assert.equal(q, null);
  });
  it('correctIndex = -1 → fallback 0 (never E)', ()=>{
    const q = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:-1 });
    assert.ok(q);
    assert.equal(q.correctIndex, 0);
    assert.equal(String.fromCharCode(65+q.correctIndex), 'A');
  });
  it('correctIndex = 4 → fallback 0', ()=>{
    const q = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:4 });
    assert.ok(q);
    assert.equal(q.correctIndex, 0);
  });
  it('correctIndex = "2" string → 2', ()=>{
    const q = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:"2" });
    assert.ok(q);
    assert.equal(q.correctIndex, 2);
  });
  it('fill dedicated schema', ()=>{
    const q = normalizeGeneratedQuestion({ type:'fill', question:'Fill?', answer:'42' });
    assert.ok(q);
    assert.equal(q.type,'fill');
    assert.equal(q.answer,'42');
    assert.equal(q.options, undefined);
    // fill must not fall through essay
    const v = validateQuestionEntity(q);
    assert.equal(v.isValid, true);
  });
  it('essay dedicated schema', ()=>{
    const q = normalizeGeneratedQuestion({ type:'essay', question:'Essay?', answerGuide:'guide' });
    assert.ok(q);
    assert.equal(q.type,'essay');
    assert.ok(q.answerGuide);
  });
  it('malformed AI response → reject', ()=>{
    assert.equal(normalizeGeneratedQuestion(null), null);
    assert.equal(normalizeGeneratedQuestion({}), null);
    assert.equal(normalizeGeneratedQuestion({ question:'', options:['A','B','C','D'], correctIndex:0 }), null);
  });
  it('missing type inferred or rejected', ()=>{
    const q = normalizeGeneratedQuestion({ question:'Q?', options:['A','B','C','D'], correctIndex:0 });
    // missing type but has options → inferred mc
    assert.ok(q);
    assert.equal(q.type,'mc');
  });
  it('unknown type → reject', ()=>{
    const q = normalizeGeneratedQuestion({ type:'unknownXYZ', question:'Q?' });
    assert.equal(q, null);
  });
  it('delete Question leaves khbd_v2 plans untouched (no questionLinks in new shape)', async()=>{
    const { mkPlan, savePlan, getPlan } = await import('./khbd/planModel.js');
    const q = addQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:0 });
    const p = mkPlan(); p.title = 't'; p.hoatDong = [];
    const saved = savePlan(p);
    deleteQuestion(q.id);
    const target = getPlan(saved.id);
    assert.ok(target, 'plan moi phai con nguyen');
    assert.equal(target.title, 't');
  });
  it('delete Question cascades to worksheet refs', async()=>{
    const q = addQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:0 });
    const ws = saveWorksheet({ title:'ws', questions:[q.id] });
    deleteQuestion(q.id);
    const after = getWorksheets().find(w=>w.id===ws.id);
    assert.deepEqual(after?.questions || [], []);
  });
  it('export handles all types without E/F/G', ()=>{
    const mc = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:3 });
    assert.equal(String.fromCharCode(65+mc.correctIndex), 'D');
    // Invalid index fallback
    const bad = normalizeGeneratedQuestion({ type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:10 });
    assert.equal(String.fromCharCode(65+bad.correctIndex), 'A'); // never E
    const fill = normalizeGeneratedQuestion({ type:'fill', question:'F?', answer:'ans' });
    assert.equal(fill.type,'fill');
    // Export for fill should have answer line, not options
    assert.equal(fill.options, undefined);
    const essay = normalizeGeneratedQuestion({ type:'essay', question:'E?', answerGuide:'guide' });
    assert.equal(essay.type,'essay');
  });
  it('no invalid Question may enter persistent storage', ()=>{
    assert.throws(()=> addQuestion({ type:'mc', question:'Q?', options:['A','','C','D'], correctIndex:0 }), /Invalid/);
    assert.throws(()=> addQuestion({ type:'mc', question:'', options:['A','B','C','D'], correctIndex:0 }), /Invalid/);
    // Valid passes
    const q = addQuestion({ type:'mc', question:'Valid?', options:['A','B','C','D'], correctIndex:0 });
    assert.ok(getQuestions().find(x=>x.id===q.id));
  });
  it('worksheet cascade on delete', ()=>{
    const q1 = addQuestion({ type:'mc', question:'Q1?', options:['A','B','C','D'], correctIndex:0 });
    const q2 = addQuestion({ type:'mc', question:'Q2?', options:['A','B','C','D'], correctIndex:1 });
    const ws = saveWorksheet({ id:'ws1', title:'WS', subject:'', grade:'', questions:[q1.id, q2.id], showAnswers:false });
    deleteQuestion(q1.id);
    const wss = getWorksheets();
    const updated = wss.find(w=>w.id==='ws1');
    assert.ok(!updated.questions.includes(q1.id));
    assert.ok(updated.questions.includes(q2.id));
  });
});
