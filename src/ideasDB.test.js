import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.__SGK_TEST__ = true;

globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: (i) => [...m.keys()][i] || null }; })();
globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.document = { documentElement: { style: { setProperty: () => {} } } };
globalThis.indexedDB = undefined;

const {
  getIdeas, createIdea, updateIdea, deleteIdea, getIdeaById,
  normalizeIdea, validateIdeaData, duplicateIdea, toggleFavoriteIdea,
  rateIdea, logTrial, removeTrial, getIdeaStats, getAllIdeaTags,
  exportIdeasJSON, importIdeasJSON, restoreIdea,
  IDEA_TYPES, IDEA_PHASES, IDEA_STATUSES, IDEAS_STORAGE_KEY,
} = await import('./personalDB.js');
const { listTrashByType, TRASH_TYPE } = await import('./trashStore.js');

describe('Ý tưởng dạy học — personalDB schema v2', () => {
  beforeEach(() => localStorage.clear());

  it('createIdea tạo bản ghi v2 đầy đủ trường', () => {
    const idea = createIdea({ title: 'Trò chơi ôn tập', subject: 'Toán', grade: '1' });
    assert.ok(idea.id);
    assert.equal(idea.title, 'Trò chơi ôn tập');
    assert.equal(idea.status, 'nhap');
    assert.deepEqual(idea.steps, []);
    assert.deepEqual(idea.trials, []);
    assert.equal(idea.favorite, false);
    assert.equal(idea.rating, 0);
    assert.equal(idea.type, 'khac');
    assert.equal(idea.phase, 'chung');
    assert.ok(idea.createdAt && idea.updatedAt);
  });

  it('createIdea từ chối tiêu đề rỗng', () => {
    assert.throws(() => createIdea({ title: '   ' }), /Tiêu đề/);
    assert.equal(getIdeas().length, 0);
  });

  it('validateIdeaData chặn loại hình / thời lượng / số bước sai', () => {
    assert.throws(() => validateIdeaData({ title: 'x', type: 'khong-co' }), /Loại hình/);
    assert.throws(() => validateIdeaData({ title: 'x', duration: 999 }), /Thời lượng/);
    assert.throws(() => validateIdeaData({ title: 'x', steps: Array.from({ length: 13 }, () => ({ title: 'a' })) }), /bước/);
  });

  it('normalizeIdea chuyển ý tưởng v1 (description/tags) sang v2', () => {
    const n = normalizeIdea({ id: 'idea_old', title: 'Ý cũ', description: 'Mô tả', tags: 'trò chơi, nhóm', createdAt: '2020-01-01' });
    assert.equal(n.id, 'idea_old');
    assert.deepEqual(n.tags, ['trò chơi', 'nhóm']);
    assert.equal(n.type, 'troChoi');
    assert.equal(n.status, 'nhap');
    assert.equal(n.summary, '');
    assert.equal(n.createdAt, '2020-01-01');
  });

  it('getIdeas tự migrate dữ liệu v1 trong storage', () => {
    localStorage.setItem(IDEAS_STORAGE_KEY, JSON.stringify([{ id: 'a', title: 'Cũ', description: 'x', tags: ['game'] }]));
    const list = getIdeas();
    assert.equal(list.length, 1);
    assert.ok(Array.isArray(list[0].steps));
    assert.equal(list[0].type, 'troChoi');
    const raw = JSON.parse(localStorage.getItem(IDEAS_STORAGE_KEY));
    assert.ok(Array.isArray(raw[0].steps), 'đã persist bản v2');
  });

  it('updateIdea gộp thay đổi và validate', () => {
    const idea = createIdea({ title: 'A' });
    assert.equal(updateIdea(idea.id, { title: 'B', rating: 9 }), false);
    assert.equal(updateIdea(idea.id, { title: 'B', subject: 'Tiếng Việt' }), true);
    const got = getIdeaById(idea.id);
    assert.equal(got.title, 'B');
    assert.equal(got.subject, 'Tiếng Việt');
  });

  it('deleteIdea chuyển vào Thùng rác 30 ngày và có thể khôi phục', () => {
    const idea = createIdea({ title: 'Xóa thử' });
    deleteIdea(idea.id);
    assert.equal(getIdeaById(idea.id), null);
    const trashed = listTrashByType(TRASH_TYPE.IDEA);
    assert.equal(trashed.length, 1);
    assert.equal(trashed[0].payload.title, 'Xóa thử');
    assert.equal(restoreIdea(trashed[0].payload), true);
    assert.ok(getIdeaById(idea.id));
  });

  it('duplicateIdea tạo bản sao có hậu tố và không copy nhật ký', () => {
    const idea = createIdea({ title: 'Gốc', favorite: true });
    logTrial(idea.id, { className: '1A', result: 'ok' });
    const copy = duplicateIdea(idea.id);
    assert.ok(copy.id !== idea.id);
    assert.match(copy.title, /\(bản sao\)$/);
    assert.equal(copy.favorite, false);
    assert.deepEqual(copy.trials, []);
    assert.equal(copy.status, 'nhap');
  });

  it('logTrial / removeTrial cập nhật triedCount + lastTriedAt + status', () => {
    const idea = createIdea({ title: 'Thử' });
    assert.equal(idea.status, 'nhap');
    logTrial(idea.id, { date: '2026-03-01', className: '1A', students: '30', result: 'Hứng thú' });
    let got = getIdeaById(idea.id);
    assert.equal(got.trials.length, 1);
    assert.equal(got.triedCount, 1);
    assert.equal(got.status, 'daThu');
    assert.ok(got.lastTriedAt);
    removeTrial(idea.id, got.trials[0].id);
    got = getIdeaById(idea.id);
    assert.equal(got.trials.length, 0);
    assert.equal(got.triedCount, 0);
  });

  it('toggleFavoriteIdea và rateIdea ghi giá trị đúng', () => {
    const idea = createIdea({ title: 'Fav' });
    toggleFavoriteIdea(idea.id);
    assert.equal(getIdeaById(idea.id).favorite, true);
    rateIdea(idea.id, 4);
    assert.equal(getIdeaById(idea.id).rating, 4);
    rateIdea(idea.id, 99);
    assert.equal(getIdeaById(idea.id).rating, 5);
  });

  it('getIdeaStats đếm tổng / yêu thích / đã thử / có bước', () => {
    const a = createIdea({ title: 'A', subject: 'Toán', type: 'troChoi', steps: [{ title: 'b1' }], favorite: true });
    createIdea({ title: 'B', subject: 'Toán', type: 'duAn' });
    logTrial(a.id, {});
    const s = getIdeaStats();
    assert.equal(s.total, 2);
    assert.equal(s.fav, 1);
    assert.equal(s.tried, 1);
    assert.equal(s.withSteps, 1);
    assert.equal(s.bySubject['Toán'], 2);
    assert.equal(s.byType['troChoi'], 1);
  });

  it('getAllIdeaTags tổng hợp thẻ duy nhất đã sắp xếp', () => {
    createIdea({ title: 'A', tags: ['zzz', 'aaa'] });
    createIdea({ title: 'B', tags: ['aaa', 'mmm'] });
    assert.deepEqual(getAllIdeaTags(), ['aaa', 'mmm', 'zzz']);
  });

  it('export/import JSON: merge bỏ qua trùng tiêu đề+môn+lớp', () => {
    createIdea({ title: 'Trùng', subject: 'Toán', grade: '1' });
    const dump = exportIdeasJSON();
    assert.equal(dump.version, 2);
    assert.equal(dump.count, 1);
    const added = importIdeasJSON({ ideas: [{ title: 'Trùng', subject: 'Toán', grade: '1' }, { title: 'Mới', subject: 'Toán', grade: '2' }] }, 'merge');
    assert.equal(added, 1);
    assert.equal(getIdeas().length, 2);
  });

  it('import JSON chế độ replace thay toàn bộ', () => {
    createIdea({ title: 'Cũ 1' });
    createIdea({ title: 'Cũ 2' });
    const n = importIdeasJSON({ ideas: [{ title: 'Mới' }] }, 'replace');
    assert.equal(n, 1);
    const list = getIdeas();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Mới');
  });

  it('import JSON từ chối dữ liệu không phải danh sách', () => {
    assert.throws(() => importIdeasJSON({ foo: 1 }), /danh sách/);
    assert.throws(() => importIdeasJSON(null), /danh sách/);
  });

  it('normalizeIdea giữ trường ngoài schema (thumbnail/category/source từ scan)', () => {
    const idea = createIdea({
      title: 'Ghi chú SGK', category: 'sgk_scan', content: 'nội dung',
      thumbnail: 'data:image/png;base64,xxxx',
      source: { type: 'sgk_scan', page: 12 },
    });
    const got = getIdeaById(idea.id);
    assert.equal(got.category, 'sgk_scan');
    assert.equal(got.content, 'nội dung');
    assert.equal(got.thumbnail, 'data:image/png;base64,xxxx');
    assert.equal(got.source.type, 'sgk_scan');
    assert.equal(got.source.page, 12);
  });

  it('getIdeas không persist lại khi bản ghi đã đủ schema v2', () => {
    const idea = createIdea({ title: 'Ổn định' });
    const before = localStorage.getItem(IDEAS_STORAGE_KEY);
    getIdeas();
    const after = localStorage.getItem(IDEAS_STORAGE_KEY);
    assert.equal(before, after);
    assert.ok(idea);
  });

  it('hằng số loại hình / giai đoạn / trạng thái có id duy nhất', () => {
    for (const arr of [IDEA_TYPES, IDEA_PHASES, IDEA_STATUSES]) {
      const ids = arr.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length);
    }
  });
});
