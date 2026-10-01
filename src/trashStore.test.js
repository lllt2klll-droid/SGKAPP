import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Im lặng log của storage/autoBackup trong test
globalThis.__SGK_TEST__ = true;

globalThis.localStorage = (()=>{ const m=new Map(); return { getItem:k=>m.get(k)||null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), clear:()=>m.clear(), get length(){return m.size}, key:i=>[...m.keys()][i]||null }})();
globalThis.window = { dispatchEvent:()=>{}, addEventListener:()=>{}, removeEventListener:()=>{} };
globalThis.document = { documentElement:{ style:{ setProperty:()=>{} } } };
globalThis.URL = { createObjectURL:()=>'blob:test', revokeObjectURL:()=>{} };
globalThis.Blob = class Blob { constructor(parts, opts){ this.parts=parts; this.type=opts?.type; } };
globalThis.indexedDB = undefined;

const {
  moveToTrash, takeFromTrash, removeFromTrash, emptyTrash, purgeExpiredTrash,
  listTrash, listTrashByType, trashCount, isExpired, daysLeft,
  TRASH_TTL_DAYS, TRASH_TTL_MS, TRASH_TYPE, TRASH_TYPE_LABEL,
} = await import('./trashStore.js');
const { appEvents, AppEvents } = await import('./core/appEvents.js');
const { deletePlan, savePlan, getPlan } = await import('./khbd/planModel.js');
const { deleteQuestion, restoreQuestion, getQuestions, clearQuestions } = await import('./teachingDB.js');
const { purgeExpiredTrashNow } = await import('./trashPurge.js');
const {
  autoBackupIntervalMs, isAutoBackupDue, getAutoBackupMeta,
  listAutoBackupSnapshots, runAutoBackup,
} = await import('./autoBackup.js');
const { isBackupKey, exportBackup, wipeAppData, parseBackupPreview } = await import('./storage.js');

// Không có file sao lưu → không cần IndexedDB
const AUTO_META_KEY = 'sgk_autobackup_meta';
const DAY = 86400000;

function seedExpired(...items) {
  const old = Date.now() - TRASH_TTL_MS - DAY;
  localStorage.setItem('sgk_trash', JSON.stringify(items.map((x) => ({
    id: x.id, type: x.type || TRASH_TYPE.BOOK, label: x.label || x.id, meta: x.meta || {}, payload: x.payload || {},
    deletedAt: old, expiresAt: old + TRASH_TTL_MS,
  }))));
}

describe('A2 • Thùng rác 30 ngày — trashStore', () => {
  beforeEach(() => localStorage.clear());

  it('moveToTrash → listTrash → takeFromTrash round-trip giữ nguyên payload', () => {
    const book = { filename: 'toan.pdf', title: 'Toán 5' };
    const item = moveToTrash({ type: TRASH_TYPE.BOOK, label: book.title, meta: { filename: book.filename }, payload: book });
    assert.ok(item && item.id, 'trả về item có id');
    assert.equal(item.type, 'book');
    assert.equal(item.label, 'Toán 5');
    assert.deepEqual(item.payload, book, 'payload giữ nguyên để khôi phục');
    assert.equal(listTrash().length, 1);
    assert.equal(trashCount(), 1);

    const back = takeFromTrash(item.id);
    assert.deepEqual(back.payload, book, 'undo trả lại đúng payload');
    assert.equal(listTrash().length, 0, 'đã lấy ra khỏi thùng rác');
    assert.equal(takeFromTrash('khong-ton-tai'), null, 'id lạ → null, không throw');
  });

  it('từ chối mục thiếu type hoặc payload (dữ liệu hỏng không vào được)', () => {
    assert.equal(moveToTrash({ type: '', label: 'x', payload: {} }), null);
    assert.equal(moveToTrash({ type: TRASH_TYPE.BOOK, label: 'x', payload: null }), null);
    assert.equal(listTrash().length, 0);
  });

  it('listTrashByType lọc đúng loại; label có tiếng Việt', () => {
    moveToTrash({ type: TRASH_TYPE.BOOK, label: 'Sách', meta: { filename: 'a.pdf' }, payload: { filename: 'a.pdf' } });
    moveToTrash({ type: TRASH_TYPE.PLAN, label: 'GA 1', payload: { id: 'p1' } });
    moveToTrash({ type: TRASH_TYPE.QUESTION, label: 'Q1', payload: { id: 'q1' } });
    assert.equal(listTrashByType(TRASH_TYPE.BOOK).length, 1);
    assert.equal(listTrashByType(TRASH_TYPE.PLAN).length, 1);
    assert.equal(listTrashByType(TRASH_TYPE.QUESTION).length, 1);
    assert.equal(listTrash().length, 3);
    assert.equal(TRASH_TYPE_LABEL.book, 'Sách');
    assert.equal(TRASH_TYPE_LABEL.plan, 'Giáo án');
    assert.equal(TRASH_TYPE_LABEL.question, 'Câu hỏi');
  });

  it('TTL đúng 30 ngày: mới → còn 30 ngày, quá hạn → isExpired + daysLeft 0', () => {
    const now = Date.now();
    localStorage.setItem('sgk_trash', JSON.stringify([
      { id: 'moi', type: 'book', label: 'moi', meta: {}, payload: {}, deletedAt: now, expiresAt: now + TRASH_TTL_MS },
      { id: 'gan', type: 'book', label: 'gan', meta: {}, payload: {}, deletedAt: now - 29 * DAY, expiresAt: now + DAY },
      { id: 'cu', type: 'book', label: 'cu', meta: {}, payload: {}, deletedAt: now - TRASH_TTL_MS - 1, expiresAt: now - 1 },
    ]));
    const [moi, gan, cu] = listTrash();
    assert.equal(TRASH_TTL_DAYS, 30, 'TTL cố định 30 ngày');
    assert.equal(isExpired(moi), false);
    assert.equal(daysLeft(moi), 30);
    assert.equal(isExpired(gan), false);
    assert.equal(daysLeft(gan), 1, 'còn 1 ngày trước khi hết hạn');
    assert.equal(isExpired(cu), true);
    assert.equal(daysLeft(cu), 0);
    assert.equal(isExpired(null), false);
    assert.equal(daysLeft(null), 0);
  });

  it('purgeExpiredTrash chỉ xóa mục quá hạn, giữ mục còn hạn', () => {
    seedExpired({ id: 'het-han', label: 'Sách cũ', meta: { filename: 'cu.pdf' } });
    const kept = moveToTrash({ type: TRASH_TYPE.BOOK, label: 'Sách mới', meta: { filename: 'moi.pdf' }, payload: { filename: 'moi.pdf' } });
    const expired = purgeExpiredTrash();
    assert.equal(expired.length, 1, 'chỉ 1 mục quá hạn');
    assert.equal(expired[0].id, 'het-han');
    assert.equal(listTrash().length, 1, 'mục còn hạn vẫn ở lại');
    assert.equal(listTrash()[0].id, kept.id);
  });

  it('giới hạn 300 mục (không phình vô hạn localStorage)', () => {
    for (let i = 0; i < 305; i++) {
      const item = moveToTrash({ type: TRASH_TYPE.QUESTION, label: `Q${i}`, payload: { id: `q${i}` } });
      assert.ok(item, 'vẫn nhận item mới');
    }
    assert.equal(listTrash().length, 300, 'cắt ở MAX_ITEMS');
    assert.equal(listTrash()[0].label, 'Q304', 'mới nhất nằm đầu');
  });

  it('removeFromTrash / emptyTrash xóa vĩnh viễn khỏi danh sách', () => {
    moveToTrash({ type: TRASH_TYPE.PLAN, label: 'GA', payload: { id: 'p' } });
    moveToTrash({ type: TRASH_TYPE.PLAN, label: 'GA2', payload: { id: 'p2' } });
    const first = listTrash()[0];
    removeFromTrash(first.id);
    assert.equal(listTrash().length, 1);
    assert.equal(takeFromTrash(first.id), null, 'đã xóa vĩnh viễn → không lấy lại được');
    emptyTrash();
    assert.equal(listTrash().length, 0);
    emptyTrash(); // idempotent
    assert.equal(listTrash().length, 0);
  });

  it('bắn DATA_UPDATED {source:"trashStore", type} để App cập nhật badge + thư viện', () => {
    const seen = [];
    const off = appEvents.on(AppEvents.DATA_UPDATED, (d) => seen.push(d));
    const book = moveToTrash({ type: TRASH_TYPE.BOOK, label: 'Sách', meta: { filename: 'a.pdf' }, payload: { filename: 'a.pdf' } });
    moveToTrash({ type: TRASH_TYPE.PLAN, label: 'GA', payload: { id: 'p' } });
    takeFromTrash(book.id);
    off();
    const trashEvents = seen.filter((d) => d && d.source === 'trashStore');
    assert.equal(trashEvents.length, 3);
    assert.equal(trashEvents[0].type, 'book', 'App chỉ fetchBooks khi type=book');
    assert.equal(trashEvents[1].type, 'plan');
    assert.equal(trashEvents[2].type, 'book');
    assert.equal(trashEvents[0].domain, 'trash');
  });

  it('Đưa sách vào thùng rác KHÔNG được đụng tới file (không gọi API xóa)', async () => {
    const realFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = async () => { called++; return { ok: true }; };
    try {
      moveToTrash({ type: TRASH_TYPE.BOOK, label: 'Sách', meta: { filename: 'a.pdf' }, payload: { filename: 'a.pdf' } });
    } finally { globalThis.fetch = realFetch; }
    assert.equal(called, 0, 'chỉ ẩn khỏi thư viện, file PDF vẫn còn trên máy');
  });

  it('sgk_trash thuộc diện sao lưu 1-file (không mất khi xuất file .json)', () => {
    assert.ok(isBackupKey('sgk_trash'), 'thùng rác phải được xuất cùng backup');
    assert.ok(isBackupKey('khbd_v2_plans'), 'giáo án thuộc backup');
  });

  it('Nút "Hoàn tác" 6 giây: lấy lại mục phát event type=book để App nạp lại thư viện', () => {
    const seen = [];
    const off = appEvents.on(AppEvents.DATA_UPDATED, (d) => seen.push(d));
    const book = { filename: 'van.pdf', title: 'Văn 5' };
    const trashed = moveToTrash({ type: TRASH_TYPE.BOOK, label: book.title, meta: { filename: book.filename }, payload: book });
    // App.jsx sau đó filter sách trong thùng rác khỏi thư viện
    const hidden = listTrashByType(TRASH_TYPE.BOOK).map((i) => i.meta.filename);
    assert.deepEqual(hidden, ['van.pdf']);

    const back = takeFromTrash(trashed.id); // bấm Hoàn tác
    off();

    assert.deepEqual(back.payload, book, 'payload còn nguyên để hiển thị lại');
    assert.equal(listTrash().length, 0, 'sách đã quay lại danh sách hiển thị');
    const last = seen.filter((d) => d && d.source === 'trashStore').pop();
    assert.equal(last.type, 'book', 'App nghe type=book sẽ gọi fetchBooks()');
  });
});

describe('A2 • Lifecycle xóa → khôi phục (tích hợp domain)', () => {
  beforeEach(() => localStorage.clear());

  it('deletePlan → thùng rác → savePlan(payload) là giáo án về lại', () => {
    savePlan({ id: 'p1', title: 'GV Toán 5 tuần 1', section: 'A' });
    assert.ok(getPlan('p1'));

    deletePlan('p1');
    assert.equal(getPlan('p1'), null, 'đã ẩn khỏi danh sách');
    const trashed = listTrashByType(TRASH_TYPE.PLAN);
    assert.equal(trashed.length, 1);
    assert.equal(trashed[0].label, 'GV Toán 5 tuần 1');
    assert.equal(trashed[0].payload.id, 'p1', 'payload đủ để khôi phục');

    // Đúng nút "Khôi phục" ở DataToolsView: lấy ra khỏi thùng rác trước, rồi ghi lại
    const taken = takeFromTrash(trashed[0].id);
    savePlan(taken.payload);
    const back = getPlan('p1');
    assert.ok(back, 'khôi phục 1 bấm là về');
    assert.equal(back.title, 'GV Toán 5 tuần 1');
    assert.equal(listTrashByType(TRASH_TYPE.PLAN).length, 0, 'đã lấy ra khỏi thùng rác');
  });

  it('deleteQuestion → thùng rác → restoreQuestion(payload) là câu hỏi về lại', () => {
    localStorage.setItem('sgk_questions', JSON.stringify([
      { id: 'q1', type: 'mc', question: '2 + 2 = ?', options: ['3', '4', '5', '6'], correctIndex: 1, grade: 1, subject: 'toan' },
      { id: 'q2', type: 'mc', question: '3 + 3 = ?', options: ['5', '6', '7', '8'], correctIndex: 1, grade: 1, subject: 'toan' },
    ]));

    deleteQuestion('q1');
    assert.deepEqual(getQuestions().map((q) => q.id), ['q2'], 'đã ẩn khỏi ngân hàng');
    const trashed = listTrashByType(TRASH_TYPE.QUESTION);
    assert.equal(trashed.length, 1);
    assert.equal(trashed[0].payload.id, 'q1');

    const taken = takeFromTrash(trashed[0].id);
    assert.equal(restoreQuestion(taken.payload), true);
    const ids = getQuestions().map((q) => q.id).sort();
    assert.deepEqual(ids, ['q1', 'q2'], 'khôi phục đúng câu hỏi, không nhân bản');
    assert.equal(restoreQuestion(taken.payload), true, 'khôi phục lần 2 không tạo trùng');
    assert.equal(getQuestions().filter((q) => q.id === 'q1').length, 1);
    assert.equal(listTrash().length, 0, 'đã lấy ra khỏi thùng rác');
  });

  it('clearQuestions (dọn kho) KHÔNG đi qua thùng rác — cố ý, không hoàn tác được', () => {
    localStorage.setItem('sgk_questions', JSON.stringify([{ id: 'q1', type: 'mc', question: '?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }]));
    clearQuestions();
    assert.equal(getQuestions().length, 0);
    assert.equal(listTrashByType(TRASH_TYPE.QUESTION).length, 0);
  });
});

describe('A2 • trashPurge — xóa vĩnh viễn sau 30 ngày', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('chưa có mục hết hạn → không gọi API, không mất gì', async () => {
    localStorage.clear();
    moveToTrash({ type: TRASH_TYPE.BOOK, label: 'Sách mới', meta: { filename: 'moi.pdf' }, payload: {} });
    let called = 0;
    globalThis.fetch = async () => { called++; return { ok: true }; };
    const r = await purgeExpiredTrashNow();
    assert.deepEqual(r, { expired: 0, purgedBooks: 0 });
    assert.equal(called, 0);
    assert.equal(listTrash().length, 1, 'sách vẫn trong thùng rác');
  });

  it('quá hạn → xóa file sách qua API + dọn dữ liệu, mục khác cũng bị purge', async () => {
    localStorage.clear();
    seedExpired(
      { id: 'b1', label: 'Sách cũ', meta: { filename: 'cu.pdf' } },
      { id: 'q1', type: TRASH_TYPE.QUESTION, label: 'Câu cũ', payload: { id: 'qx' } },
    );
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push({ url: String(url), method: opts?.method }); return { ok: true }; };

    const r = await purgeExpiredTrashNow();
    assert.equal(r.expired, 2, 'cả 2 mục đều hết hạn');
    assert.equal(r.purgedBooks, 1, 'chỉ sách mới tính là đã xóa file');
    assert.equal(calls.length, 1, 'chỉ gọi API xóa file cho sách');
    assert.equal(calls[0].method, 'DELETE');
    assert.ok(calls[0].url.includes('cu.pdf'), `đúng file: ${calls[0].url}`);
    assert.equal(listTrash().length, 0, 'thùng rác sạch sau purge');
  });
});

describe('A3 • Sao lưu tự động — helper thuần', () => {
  beforeEach(() => localStorage.clear());

  it('autoBackupIntervalMs: daily/weekly/monthly + mặc định là weekly', () => {
    assert.equal(autoBackupIntervalMs({ backup: { autoBackupFrequency: 'daily' } }), DAY);
    assert.equal(autoBackupIntervalMs({ backup: { autoBackupFrequency: 'weekly' } }), 7 * DAY);
    assert.equal(autoBackupIntervalMs({ backup: { autoBackupFrequency: 'monthly' } }), 30 * DAY);
    assert.equal(autoBackupIntervalMs({}), 7 * DAY, 'không có cài đặt → weekly');
    assert.equal(autoBackupIntervalMs({ backup: { autoBackupFrequency: 'hourly' } }), 7 * DAY, 'giá lạ → fallback weekly');
    assert.equal(autoBackupIntervalMs({ backup: { autoBackupFrequency: 'WEEKLY' } }), 7 * DAY, 'không phân biệt hoa/thường');
  });

  it('isAutoBackupDue: tắt → false; bật mà chưa từng chạy → true', () => {
    assert.equal(isAutoBackupDue({ backup: { autoBackup: false } }), false, 'tắt là không chạy nền');
    assert.equal(isAutoBackupDue({ backup: { autoBackup: true } }), true);
    assert.equal(isAutoBackupDue(undefined), false);
  });

  it('isAutoBackupDue: trong kỳ → false; quá kỳ → true', () => {
    localStorage.setItem(AUTO_META_KEY, JSON.stringify({ lastRun: Date.now(), lastSuccess: Date.now(), snapshots: [] }));
    assert.equal(isAutoBackupDue({ backup: { autoBackup: true, autoBackupFrequency: 'weekly' } }), false);

    localStorage.setItem(AUTO_META_KEY, JSON.stringify({ lastRun: Date.now() - 8 * DAY, lastSuccess: Date.now() - 8 * DAY, snapshots: [] }));
    assert.equal(isAutoBackupDue({ backup: { autoBackup: true, autoBackupFrequency: 'weekly' } }), true, 'quá 7 ngày → tới kỳ');
    assert.equal(isAutoBackupDue({ backup: { autoBackup: true, autoBackupFrequency: 'monthly' } }), false, 'chưa tới 30 ngày');
  });

  it('getAutoBackupMeta fallback an toàn khi chưa có / meta hỏng', () => {
    const empty = { lastRun: null, lastSuccess: null, lastError: null, snapshots: [] };
    assert.deepEqual(getAutoBackupMeta(), empty, 'chưa từng sao lưu');

    localStorage.setItem(AUTO_META_KEY, 'không phải json');
    assert.deepEqual(getAutoBackupMeta(), empty, 'json hỏng → fallback, không throw');

    localStorage.setItem(AUTO_META_KEY, JSON.stringify({ snapshots: 'sai kiểu' }));
    assert.deepEqual(getAutoBackupMeta(), empty, 'snapshots không phải mảng → fallback');

    localStorage.setItem(AUTO_META_KEY, JSON.stringify({ lastRun: 1, lastSuccess: 2, snapshots: [null, 7, { id: 'ab_1', createdAt: 3 }] }));
    const meta = getAutoBackupMeta();
    assert.equal(meta.lastSuccess, 2);
    assert.deepEqual(meta.snapshots, [{ id: 'ab_1', createdAt: 3 }], 'bỏ phần tử hỏng trong danh sách snapshot');
    assert.deepEqual(listAutoBackupSnapshots(), [{ id: 'ab_1', createdAt: 3 }]);
  });

  it('runAutoBackup khi trình duyệt không có IndexedDB → báo NO_IDB, không ném lỗi', async () => {
    assert.equal(typeof globalThis.indexedDB, 'undefined', 'test này chạy ở môi trường không có IDB');
    const r = await runAutoBackup('test');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'NO_IDB');
    assert.equal(getAutoBackupMeta().lastError, 'NO_IDB');
    assert.equal(listAutoBackupSnapshots().length, 0, 'không tạo snapshot giả');
  });
});

describe('A3 • Snapshot sao lưu tự động đọc được bằng luồng khôi phục sẵn có', () => {
  beforeEach(() => localStorage.clear());

  it('buildBackupPayload → parseBackupPreview hợp lệ (đúng format file xuất tay)', async () => {
    localStorage.setItem('sgk_questions', JSON.stringify([{ id: 'q1', type: 'mc', question: '?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }]));
    const { buildBackupPayload } = await import('./storage.js');
    const payload = await buildBackupPayload({ label: 'auto:test', skipStores: ['wb_images', 'note_images', 'scan_assets'] });
    assert.equal(payload.app, 'hanhtrang-tieu-hoc');
    assert.equal(payload.label, 'auto:test');
    assert.equal(payload.data.sgk_questions, localStorage.getItem('sgk_questions'), 'giữ nguyên chuỗi gốc');

    const preview = parseBackupPreview(JSON.stringify(payload, null, 1));
    assert.equal(preview.valid, true, `preview phải hợp lệ: ${preview.error || ''}`);
    assert.ok(preview.preview);
  });

  it('xóa sạch → wipeAppData không bỏ sót thùng rác lẫn giáo án', async () => {
    moveToTrash({ type: TRASH_TYPE.BOOK, label: 'Sách', meta: { filename: 'a.pdf' }, payload: { filename: 'a.pdf' } });
    savePlan({ id: 'p1', title: 'GA' });
    localStorage.setItem('sgk_questions', JSON.stringify([{ id: 'q1', type: 'mc', question: '?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }]));

    await wipeAppData();
    assert.equal(localStorage.getItem('sgk_trash'), null, 'thùng rác bị xóa cùng');
    assert.equal(localStorage.getItem('khbd_v2_plans'), null, 'giáo án bị xóa cùng');
    assert.equal(localStorage.getItem('sgk_questions'), null);
    assert.equal(localStorage.getItem('sgk_index_test'), null);
  });

  it('exportBackup chạy được ở môi trường không có document.createElement (không crash)', async () => {
    // exportBackup cần <a download> — ở test chúng ta chỉ cần nó không ném ra ngoài
    const realCreate = globalThis.document.createElement;
    let href = null;
    globalThis.document.createElement = (tag) => {
      if (tag !== 'a') return realCreate?.(tag);
      return { set href(v) { href = v; }, get href() { return href; }, click() {}, style: {}, setAttribute() {}, remove() {} };
    };
    try {
      const out = await exportBackup('test');
      assert.ok(out === undefined || out === null || typeof out === 'object', 'không ném lỗi');
      assert.ok(href && href.startsWith('blob:'), 'tạo được blob URL để tải xuống');
    } finally {
      globalThis.document.createElement = realCreate;
    }
  });
});
