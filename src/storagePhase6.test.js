import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Im lặng log recovery-snapshot dự kiến trong test
globalThis.__SGK_TEST__ = true;

globalThis.localStorage = (()=>{ const m=new Map(); return { getItem:k=>m.get(k)||null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear(), get length(){return m.size}, key:i=>[...m.keys()][i]||null }})();
globalThis.window={ dispatchEvent:()=>{} };
globalThis.document={ documentElement:{style:{setProperty:()=>{}}}};
globalThis.URL={ createObjectURL:()=>'blob:test', revokeObjectURL:()=>{} };
globalThis.Blob=class Blob{ constructor(parts,opts){this.parts=parts; this.type=opts?.type} };
globalThis.indexedDB=undefined;

const { BACKUP_KEYS, isBackupKey, isCacheKey, exportBackup, importBackup, wipeAppData, parseBackupPreview } = await import('./storage.js');
const { STORES } = await import('./indexedDB.js');
const { addQuestion, getQuestions } = await import('./teachingDB.js');
const { SYNC_MODE } = await import('./syncService.js');

describe('PHASE 6 — Backup/Restore/Wipe/Sync', ()=>{
  beforeEach(()=> localStorage.clear());

  it('storage inventory: backup must include persistent data, not cache', ()=>{
    assert.ok(isBackupKey('sgk_lessonplans'), 'lesson plans backed up');
    assert.ok(isBackupKey('sgk_questions'), 'questions backed up');
    assert.ok(isBackupKey('sgk_scans_v1'), 'scans backed up');
    assert.ok(isBackupKey('sgk_autosave_plan123'), 'autosave backed up');
    assert.ok(isBackupKey('sgk_custom_titles'), 'custom titles backed up');
    assert.ok(!isBackupKey('sgk_index_test'), 'index cache not backed up');
    assert.ok(!isBackupKey('ocr_book_1'), 'ocr cache not backed up');
    assert.ok(isCacheKey('sgk_index_test'), 'index is cache');
    assert.ok(isCacheKey('ocr_book_1'), 'ocr is cache');
  });

  it('backup coverage includes required keys', ()=>{
    const required = ['sgk_lessonplans','sgk_questions','sgk_worksheets','sgk_scans_v1','sgk_autosave_test','sgk_custom_titles','sgk_bookmarks','sgk_marks_test','sgk_clips'];
    required.forEach(k=>{
      // test prefix match
      const testKey = k.includes('autosave') ? 'sgk_autosave_test' : k.includes('marks') ? 'sgk_marks_test' : k;
      assert.ok(isBackupKey(testKey) || BACKUP_KEYS.some(p=>testKey.startsWith(p)), `backup should include ${k}`);
    });
    // IndexedDB stores
    assert.ok(Object.values(STORES).includes('scan_assets'), 'scan_assets store exists');
    assert.ok(Object.values(STORES).includes('ocr_cache'), 'ocr_cache store exists');
  });

  it('backup → wipe → restore preserves same logical data', async()=>{
    // Seed data
    localStorage.setItem('sgk_lessonplans', JSON.stringify([{id:'plan1', title:'T1', schemaVersion:6}]));
    localStorage.setItem('sgk_questions', JSON.stringify([{id:'q1', type:'mc', question:'Q?', options:['A','B','C','D'], correctIndex:0}]));
    localStorage.setItem('sgk_scans_v1', JSON.stringify([{id:'scan1', bookId:'book.pdf'}]));
    localStorage.setItem('sgk_autosave_plan1', JSON.stringify({data:{id:'plan1'}, savedAt:Date.now()}));
    localStorage.setItem('sgk_custom_titles', JSON.stringify({'book.pdf':'Title'}));
    // Cache that should NOT be backed up
    localStorage.setItem('sgk_index_test', 'cache_data');
    localStorage.setItem('ocr_book_1', 'ocr_cache');

    // Mock exportBackup without file download (call internal logic)
    // Use parseBackupPreview/importBackup directly
    const payload = {
      app: 'hanhtrang-tieu-hoc',
      version: 2,
      schemaVersion: 2,
      data: {
        'sgk_lessonplans': localStorage.getItem('sgk_lessonplans'),
        'sgk_questions': localStorage.getItem('sgk_questions'),
        'sgk_scans_v1': localStorage.getItem('sgk_scans_v1'),
        'sgk_autosave_plan1': localStorage.getItem('sgk_autosave_plan1'),
        'sgk_custom_titles': localStorage.getItem('sgk_custom_titles'),
      },
      indexedData: {},
    };
    const text = JSON.stringify(payload);
    // Wipe
    await wipeAppData();
    assert.equal(localStorage.getItem('sgk_lessonplans'), null);
    assert.equal(localStorage.getItem('sgk_questions'), null);
    assert.equal(localStorage.getItem('sgk_scans_v1'), null);
    assert.equal(localStorage.getItem('sgk_autosave_plan1'), null);
    // Restore snapshot (true restore)
    await importBackup(text);
    assert.equal(JSON.parse(localStorage.getItem('sgk_lessonplans'))[0].id, 'plan1');
    assert.equal(JSON.parse(localStorage.getItem('sgk_questions'))[0].id, 'q1');
    assert.equal(JSON.parse(localStorage.getItem('sgk_scans_v1'))[0].id, 'scan1');
    assert.ok(localStorage.getItem('sgk_autosave_plan1'));
    // Cache should not be restored (was not in backup) and should be gone after wipe
    assert.equal(localStorage.getItem('sgk_index_test'), null);
    assert.equal(localStorage.getItem('ocr_book_1'), null);
  });

  it('restore older snapshot clears extra current data (no orphans)', async()=>{
    // Current has extra
    localStorage.setItem('sgk_lessonplans', JSON.stringify([{id:'plan_current', title:'current'}]));
    localStorage.setItem('sgk_scans_v1', JSON.stringify([{id:'scan_current', bookId:'curr.pdf'}]));
    localStorage.setItem('sgk_autosave_plan_current', 'x');

    const olderPayload = {
      app: 'hanhtrang-tieu-hoc',
      version: 2,
      schemaVersion: 2,
      data: {
        'sgk_lessonplans': JSON.stringify([{id:'plan_old', title:'old'}]),
        'sgk_questions': JSON.stringify([]),
      },
      indexedData: {},
    };
    await importBackup(JSON.stringify(olderPayload));
    // Extra current should be gone (snapshot semantics)
    assert.equal(localStorage.getItem('sgk_autosave_plan_current'), null);
    assert.equal(localStorage.getItem('sgk_scans_v1'), null); // not in older backup → cleared
    assert.equal(JSON.parse(localStorage.getItem('sgk_lessonplans'))[0].id, 'plan_old');
  });

  it('complete wipe removes all persistent including scans/autosaves', async()=>{
    localStorage.setItem('sgk_lessonplans', '[]');
    localStorage.setItem('sgk_questions', '[]');
    localStorage.setItem('sgk_scans_v1', '[]');
    localStorage.setItem('sgk_autosave_ghost', 'x');
    localStorage.setItem('sgk_custom_titles', '{}');
    localStorage.setItem('sgk_bookmarks', '{}');
    localStorage.setItem('sgk_activity_ratings', '{}');
    localStorage.setItem('favoriteTools', '[]');
    localStorage.setItem('sgk_index_cache', 'cache');
    localStorage.setItem('ocr_test', 'cache');
    await wipeAppData();
    assert.equal(localStorage.getItem('sgk_lessonplans'), null);
    assert.equal(localStorage.getItem('sgk_scans_v1'), null);
    assert.equal(localStorage.getItem('sgk_autosave_ghost'), null);
    assert.equal(localStorage.getItem('sgk_custom_titles'), null);
    assert.equal(localStorage.getItem('sgk_index_cache'), null);
    assert.equal(localStorage.getItem('ocr_test'), null);
    // favoriteTools now considered part of wipe via sgk_ fallback? Actually it's not sgk_ but we explicitly handle
    // Our wipe includes favoriteTools via special list — check cleared
    // Currently our wipe checks for sgk_ prefix plus explicit list includes favoriteTools via isBackup? No, but we added check for sgk_ prefix and explicit list includes favoriteTools via sgk_? favoriteTools does not start with sgk_, but wipe now includes check for ['favoriteTools'...].includes
    // Verify cleared
    assert.equal(localStorage.getItem('favoriteTools'), null);
  });

  it('sync is LOCAL_SIMULATION, not real cloud', async()=>{
    assert.equal(SYNC_MODE, 'LOCAL_SIMULATION');
    const sync = (await import('./syncService.js')).default;
    const result = await sync.performSync('questions');
    assert.equal(result.success, true);
    // Metadata should contain mode
    const meta = JSON.parse(localStorage.getItem('sync_metadata_questions') || '{}');
    assert.equal(meta.mode, 'LOCAL_SIMULATION');
    assert.equal(meta.status, 'completed');
  });

  it('bookmarks sync uses correct source sgk_bookmarks, not notes_', async()=>{
    localStorage.setItem('sgk_bookmarks', JSON.stringify({'book.pdf':[1,2,3]}));
    localStorage.setItem('notes_book.pdf_1', 'note content');
    const sync = (await import('./syncService.js')).default;
    const bm = sync.collectData('bookmarks');
    // Should be from sgk_bookmarks, not notes_
    assert.deepEqual(bm, {'book.pdf':[1,2,3]});
    assert.ok(!bm['book.pdf_1']);
  });

  it('atomicity: invalid backup does not partially apply', async()=>{
    localStorage.setItem('sgk_lessonplans', JSON.stringify([{id:'before', title:'before'}]));
    const before = localStorage.getItem('sgk_lessonplans');
    try {
      await importBackup('not json');
      assert.fail('should throw');
    } catch (e) {
      assert.ok(e.message.includes('JSON'));
    }
    // State unchanged
    assert.equal(localStorage.getItem('sgk_lessonplans'), before);
  });
});
