import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] || null,
  };
})();
globalThis.window = { dispatchEvent: () => {} };
globalThis.document = { documentElement: { style: { setProperty: () => {} } } };

const {
  PENDING_KEY, MAX_RANGE_PAGES,
  savePendingPayload, loadPendingPayload, clearPendingPayload,
  splitMinutes, buildPlanFromPages,
} = await import('./planFromPages.js');

describe('KHBD từ trang sách (không AI) — planFromPages', () => {
  beforeEach(() => localStorage.clear());

  it('splitMinutes: tổng phút luôn khớp thời lượng (35 và 45)', () => {
    for (const total of [15, 30, 35, 45]) {
      const m = splitMinutes(total);
      assert.equal(m.A + m.B1 + m.B2 + m.B3 + m.C + m.D, total, `tổng phải = ${total}`);
    }
    const m35 = splitMinutes(35);
    assert.deepEqual([m35.A, m35.C, m35.D], [5, 5, 3]);
  });

  it('buildPlanFromPages: fill đủ khung 6 HĐ A/B×3/C/D + tham chiếu sách–trang', () => {
    const p = buildPlanFromPages({
      bookId: 'toan2.pdf', bookTitle: 'Toán 2', subject: 'Toán', grade: '2',
      lesson: 'Bài 12 – Phép cộng trong phạm vi 10',
      title: 'Bài 12 – Phép cộng trong phạm vi 10',
      pageStart: 12, pageEnd: 14, duration: '35',
      excerpts: [{ page: 12, text: '9 + 5 = ?' }, { page: 13, text: 'Luyện tập' }],
    });
    assert.equal(p.title, 'Bài 12 – Phép cộng trong phạm vi 10');
    assert.equal(p.monHoc, 'Toán');
    assert.equal(p.lop, '2');
    assert.equal(p.thoiGian, '35 phút');
    assert.equal(p.hoatDong.length, 6);
    assert.deepEqual(p.hoatDong.map((a) => a.section), ['A', 'B', 'B', 'B', 'C', 'D']);
    const totalMin = p.hoatDong.reduce((n, a) => n + (parseInt(a.phut, 10) || 0), 0);
    assert.equal(totalMin, 35, 'tổng phút 6 HĐ phải = 35');
    for (const a of p.hoatDong) {
      assert.ok(a.ten, 'mỗi HĐ phải có tên');
      assert.ok(a.mucTieu, 'mỗi HĐ phải có mục tiêu gợi ý');
      assert.ok(Array.isArray(a.steps) && a.steps.length >= 1, 'mỗi HĐ giữ ≥1 bước GV|HS');
      for (const s of a.steps) {
        assert.ok(String(s.gv || '').trim(), `bước của "${a.ten}" phải có HĐ GV`);
        assert.ok(String(s.hs || '').trim(), `bước của "${a.ten}" phải có HĐ HS`);
      }
    }
    const bActs = p.hoatDong.filter((a) => a.section === 'B');
    assert.equal(bActs.length, 3);
    for (const a of bActs) {
      assert.equal(a.steps.length, 3, `HĐ "${a.ten}" phải có đủ Bước 1/2/3`);
    }
    assert.equal(p.bookReferences.length, 1);
    assert.equal(p.bookReferences[0].pageStart, 12);
    assert.equal(p.bookReferences[0].pageEnd, 14);
    assert.equal(p.bookReferences[0].bookId, 'toan2.pdf');
    assert.ok(p.phuLuc.includes('Toán 2') && p.phuLuc.includes('12'), 'phụ lục ghi nguồn sách–trang');
    assert.equal(p.sourceSnapshot.length, 2);
  });

  it('structure tùy chỉnh: tên/phút/số bước khu B theo từng bài', () => {
    const p = buildPlanFromPages({
      bookTitle: 'Tiếng Việt 1', subject: 'Tiếng Việt', grade: '1',
      lesson: 'Bài 5 – Âm a',
      title: 'Bài 5 – Âm a',
      pageStart: 20, pageEnd: 21, duration: '35',
      excerpts: [{ page: 20, text: 'a. cá. ba. Hình cái ca.' }],
      structure: { b: [
        { ten: 'Làm quen âm a', phut: 10, steps: 2 },
        { ten: 'Đọc – viết', phut: 12, steps: 4 },
      ] },
    });
    // 1 A + 2 B + 1 C + 1 D = 5 HĐ
    assert.equal(p.hoatDong.length, 5);
    assert.deepEqual(p.hoatDong.map((a) => a.section), ['A', 'B', 'B', 'C', 'D']);
    const bActs = p.hoatDong.filter((a) => a.section === 'B');
    assert.equal(bActs[0].ten, 'Làm quen âm a');
    assert.equal(bActs[1].ten, 'Đọc – viết');
    assert.equal(bActs[0].steps.length, 2);
    assert.equal(bActs[1].steps.length, 4);
    const totalMin = p.hoatDong.reduce((n, a) => n + (parseInt(a.phut, 10) || 0), 0);
    assert.equal(totalMin, 35, 'phút đã nhập (10+12) được giữ, tổng vẫn = 35');
  });

  it('bước khu B trích nội dung thật của từng bài (không cố định)', () => {
    const p = buildPlanFromPages({
      bookTitle: 'Toán 2', lesson: 'Bài X', title: 'Bài X',
      pageStart: 1, pageEnd: 1, duration: '35',
      excerpts: [{ page: 1, text: 'Nội dung độc nhất của bài này là con mèo vàng.' }],
      structure: { b: [{ ten: 'Tìm hiểu', steps: 2 }] },
    });
    const b = p.hoatDong.find((a) => a.section === 'B');
    assert.ok(b.steps[0].gv.includes('con mèo vàng'), 'bước 1 phải trích câu của bài');
  });
  it('chuẩn hóa phút: nhập lố thì co giãn về đúng tổng', () => {
    const p = buildPlanFromPages({
      bookTitle: 'Toán 2', lesson: 'Bài Y', title: 'Bài Y',
      pageStart: 1, pageEnd: 2, duration: '35',
      excerpts: [],
      structure: { b: [
        { ten: 'HĐ một', phut: 15, steps: 2 },
        { ten: 'HĐ hai', phut: 15, steps: 2 },
      ] },
    });
    const bActs = p.hoatDong.filter((a) => a.section === 'B');
    const bSum = bActs.reduce((n, a) => n + (parseInt(a.phut, 10) || 0), 0);
    assert.equal(bSum, 22, 'khu B nhập 15+15=30 phải co về đúng 22');
    const totalMin = p.hoatDong.reduce((n, a) => n + (parseInt(a.phut, 10) || 0), 0);
    assert.equal(totalMin, 35);
  });

  it('pending payload vòng tròn BookReader → Giáo án', () => {
    assert.equal(MAX_RANGE_PAGES, 7);
    savePendingPayload({ bookId: 'tv1.pdf', title: 'Bài 1', pageStart: 5, pageEnd: 6 });
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY));
    assert.equal(raw.bookId, 'tv1.pdf');
    assert.ok(raw.createdAt, 'có createdAt');
    const loaded = loadPendingPayload();
    assert.equal(loaded.title, 'Bài 1');
    clearPendingPayload();
    assert.equal(loadPendingPayload(), null);
  });
});
