import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Im lặng log rollback/quota dự kiến trong test
globalThis.__SGK_TEST__ = true;

globalThis.localStorage = (()=>{ const m=new Map(); return { getItem:k=>m.get(k)||null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear(), get length(){return m.size}, key:i=>[...m.keys()][i]||null }})();
globalThis.window={ dispatchEvent:()=>{} };
globalThis.document={ documentElement:{style:{setProperty:()=>{}}}};
globalThis.URL={ createObjectURL:()=>'blob:test', revokeObjectURL:()=>{} };
globalThis.Blob=class Blob{ constructor(parts,opts){this.parts=parts; this.type=opts?.type} };
globalThis.indexedDB=undefined;

const { migrateBookData, removeBookData } = await import('./storage.js');

describe('BOOK RENAME MIGRATION — P0 critical', ()=>{
  beforeEach(()=> localStorage.clear());

  it('migrates all per-book keys old -> new (notes, ocr, marks, idx, lastPage, chat, custom_titles, bookmarks)', async()=>{
    const oldF = 'old-book.pdf';
    const newF = 'new-book.pdf';
    localStorage.setItem(`notes_${oldF}_1`, 'note1');
    localStorage.setItem(`ocr_${oldF}_2`, 'ocr2');
    localStorage.setItem(`txt_${oldF}_3`, 'txt3');
    localStorage.setItem(`sgk_marks_${oldF}`, JSON.stringify({1:{yccd:[]}}));
    localStorage.setItem(`sgk_teacherNotes_${oldF}`, JSON.stringify({1:{title:'t'}}));
    localStorage.setItem(`sgk_idx_${oldF}`, JSON.stringify({pages:[]}));
    localStorage.setItem(`sgk_idxmeta_${oldF}`, JSON.stringify({builtAt:1}));
    localStorage.setItem(`lastPage_${oldF}`, '5');
    localStorage.setItem(`lastTotal_${oldF}`, '10');
    localStorage.setItem(`chat_${oldF}`, JSON.stringify({messages:[]}));
    localStorage.setItem('sgk_custom_titles', JSON.stringify({[oldF]:'Old Title'}));
    localStorage.setItem('sgk_bookmarks', JSON.stringify({[oldF]:[1,5]}));
    localStorage.setItem('sgk_bookmark_labels', JSON.stringify({[`${oldF}#1`]:'label'}));
    localStorage.setItem('sgk_vocab', JSON.stringify([{id:'v1', file:oldF, word:'a'}, {id:'v2', file:'other.pdf'}]));
    localStorage.setItem('sgk_quiz_history', JSON.stringify([{id:'q1', file:oldF}]));
    localStorage.setItem('sgk_clips', JSON.stringify([{id:'c1', file:oldF}, {id:'c2', file:'other.pdf'}]));
    localStorage.setItem('sgk_scans_v1', JSON.stringify([{id:'s1', bookId:oldF}, {id:'s2', bookId:'other.pdf'}]));
    // Kho KHBD cũ đã xóa — plan cũ (kể cả bookReference) được để nguyên, không migrate
    localStorage.setItem('sgk_lessonplans', JSON.stringify([{id:'lp1', title:'lp', metadata:{bookReference:{bookId:oldF, filename:oldF}}, hoatDong:[], updatedAt:1}]));
    const res = await migrateBookData(oldF, newF);
    assert.equal(res.ok, true);
    assert.equal(localStorage.getItem(`notes_${newF}_1`), 'note1');
    assert.equal(localStorage.getItem(`ocr_${newF}_2`), 'ocr2');
    assert.equal(localStorage.getItem(`sgk_marks_${newF}`), JSON.stringify({1:{yccd:[]}}));
    assert.equal(localStorage.getItem(`lastPage_${newF}`), '5');
    assert.equal(localStorage.getItem(`chat_${newF}`), JSON.stringify({messages:[]}));
    assert.equal(localStorage.getItem(`notes_${oldF}_1`), null, 'old cleaned');
    assert.equal(localStorage.getItem(`ocr_${oldF}_2`), null);
    const bm = JSON.parse(localStorage.getItem('sgk_bookmarks'));
    assert.deepEqual(bm[newF], [1,5]);
    assert.equal(bm[oldF], undefined);
    const lbls = JSON.parse(localStorage.getItem('sgk_bookmark_labels'));
    assert.equal(lbls[`${newF}#1`], 'label');
    assert.equal(lbls[`${oldF}#1`], undefined);
    const vocab = JSON.parse(localStorage.getItem('sgk_vocab'));
    assert.equal(vocab.find(v=>v.id==='v1').file, newF);
    const plans = JSON.parse(localStorage.getItem('sgk_lessonplans'));
    assert.equal(plans[0].metadata.bookReference.bookId, oldF, 'kế hoạch cũ không migrate');
  });

  it('delete cascade removes all dependent data (no orphan)', async()=>{
    const f = 'to-delete.pdf';
    localStorage.setItem(`notes_${f}_1`, 'n');
    localStorage.setItem(`ocr_${f}_1`, 'o');
    localStorage.setItem(`sgk_marks_${f}`, '{}');
    localStorage.setItem(`sgk_teacherNotes_${f}`, '{}');
    localStorage.setItem(`sgk_idx_${f}`, '{}');
    localStorage.setItem(`lastPage_${f}`, '1');
    localStorage.setItem(`chat_${f}`, '{}');
    localStorage.setItem('sgk_bookmarks', JSON.stringify({[f]:[1]}));
    localStorage.setItem('sgk_bookmark_labels', JSON.stringify({[`${f}#1`]:'x'}));
    localStorage.setItem('sgk_vocab', JSON.stringify([{id:'v1', file:f}]));
    localStorage.setItem('sgk_custom_titles', JSON.stringify({[f]:'t'}));
    localStorage.setItem('sgk_clips', JSON.stringify([{id:'c1', file:f}]));
    localStorage.setItem('sgk_scans_v1', JSON.stringify([{id:'s1', bookId:f}]));
    localStorage.setItem('sgk_lessonplans', JSON.stringify([{id:'lp1', metadata:{bookReference:{bookId:f}}, hoatDong:[{bookReference:{bookId:f}}]}]));
    const ok = await removeBookData(f);
    assert.equal(ok, true);
    assert.equal(localStorage.getItem(`notes_${f}_1`), null);
    assert.equal(localStorage.getItem(`ocr_${f}_1`), null);
    assert.equal(localStorage.getItem(`sgk_marks_${f}`), null);
    assert.equal(localStorage.getItem(`lastPage_${f}`), null);
    assert.equal(localStorage.getItem(`chat_${f}`), null);
    const bm = JSON.parse(localStorage.getItem('sgk_bookmarks')||'{}');
    assert.equal(bm[f], undefined);
    const vocab = JSON.parse(localStorage.getItem('sgk_vocab')||'[]');
    assert.equal(vocab.length, 0);
    const clips = JSON.parse(localStorage.getItem('sgk_clips')||'[]');
    assert.equal(clips.length, 0);
  });

  it('rename failure rollback preserves old data', async()=>{
    const oldF='fail-old.pdf', newF='fail-new.pdf';
    localStorage.setItem(`notes_${oldF}_1`, 'keep-me');
    localStorage.setItem('sgk_custom_titles', JSON.stringify({[oldF]:'title'}));
    // simulate failure by making new key throw on set (quota)
    const origSet = localStorage.setItem;
    let failOnce=true;
    localStorage.setItem = (k,v)=>{
      if(k===`notes_${newF}_1` && failOnce){ failOnce=false; throw new Error('simulated quota'); }
      return origSet.call(localStorage,k,v);
    };
    const res = await migrateBookData(oldF, newF);
    assert.equal(res.ok, false);
    // old data must still exist (rollback)
    assert.equal(localStorage.getItem(`notes_${oldF}_1`), 'keep-me');
    assert.equal(localStorage.getItem(`notes_${newF}_1`), null);
    localStorage.setItem = origSet;
  });

  it('isExactBookKey prevents false positives (Math.pdf vs Math.pdf-old)', async()=>{
    const { isExactBookKey } = await import('./storage.js');
    assert.equal(isExactBookKey('ocr_Math.pdf_1', 'ocr_', 'Math.pdf'), true);
    assert.equal(isExactBookKey('ocr_Math.pdf-old_1', 'ocr_', 'Math.pdf'), false);
    assert.equal(isExactBookKey('sgk_marks_Math.pdf', 'sgk_marks_', 'Math.pdf'), true);
    assert.equal(isExactBookKey('sgk_marks_Math.pdf-old', 'sgk_marks_', 'Math.pdf'), false);
  });
});

describe('LOCALHOST BINDING — server security', ()=>{
  it('server defaults to 127.0.0.1', async()=>{
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
    assert.ok(src.includes('127.0.0.1'), 'server must default to localhost');
  });
});
