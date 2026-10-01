import { describe, it } from 'node:test';
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

const { guessSectionFromName, reassignSectionsByName, importLegacyPlan, bulletizeLines } = await import('./planModel.js');

describe('KHBD khu A/B/C/D — đoán + sửa', () => {
  it('guessSectionFromName chỉ nhận khi chắc chắn', () => {
    assert.equal(guessSectionFromName('A'), 'A');
    assert.equal(guessSectionFromName('b'), 'B');
    assert.equal(guessSectionFromName('A. Khởi động'), 'A');
    assert.equal(guessSectionFromName('B1. Khám phá'), 'B');
    assert.equal(guessSectionFromName('C. Vận dụng'), 'C');
    assert.equal(guessSectionFromName('khu D'), 'D');
    assert.equal(guessSectionFromName('Phần B'), 'B');
    assert.equal(guessSectionFromName('Khởi động'), null);
    assert.equal(guessSectionFromName('Củng cố kiến thức'), null, 'tên thường không được đoán bừa');
    assert.equal(guessSectionFromName('Luyện tập'), null);
    assert.equal(guessSectionFromName(''), null);
    assert.equal(guessSectionFromName(null), null);
    assert.equal(guessSectionFromName('E'), null);
  });

  it('reassignSectionsByName cứu bài AI dồn hết vào B (kiểu Bài 13)', () => {
    const acts = [
      { id: '1', section: 'B', ten: 'A. Khởi động' },
      { id: '2', section: 'B', ten: 'B1. Khám phá tình huống và hình thành kiến thức' },
      { id: '3', section: 'B', ten: 'B2. Hình thành quy tắc làm tròn' },
      { id: '4', section: 'B', ten: 'B3. Luyện tập củng cố' },
      { id: '5', section: 'B', ten: 'C. Vận dụng' },
      { id: '6', section: 'B', ten: 'D. Nối tiếp' },
    ];
    const { acts: next, fixed } = reassignSectionsByName(acts);
    assert.deepEqual(next.map((a) => a.section), ['A', 'B', 'B', 'B', 'C', 'D']);
    assert.equal(fixed, 3, 'chỉ 3 HĐ A/C/D bị chuyển, 3 HĐ B giữ nguyên');
    // Không đột biến mảng gốc
    assert.ok(acts.every((a) => a.section === 'B'));
  });

  it('importLegacyPlan chịu section AI viết bừa', () => {
    const p = importLegacyPlan({
      title: 'Bài test',
      hoatDong: [
        { section: 'A. Khởi động', ten: 'Khởi động' },
        { section: 'khu b', ten: 'Khám phá' },
        { ten: 'Luyện tập' },
        { sec: 'C', ten: 'Vận dụng' },
      ],
    });
    assert.deepEqual(p.hoatDong.map((a) => a.section), ['A', 'B', 'B', 'C']);
  });

  it('bulletizeLines: khối văn bản thành từng dòng "- "', () => {
    const out = bulletizeLines('GV ổn định tổ chức, cho HS hát. Sau đó đố vui 9 + 1 bằng mấy? Cuối cùng dẫn vào bài mới.');
    const lines = out.split('\n');
    assert.equal(lines.length, 3);
    assert.ok(lines.every((l) => l.startsWith('- ')), 'mọi dòng đều bullet -');
    assert.ok(lines[1].includes('đố vui'));
  });

  it('bulletizeLines: lũy đẳng + tách marker Bước + không tách nhầm viết tắt', () => {
    // Đã có bullet thì giữ nguyên, không gắn 2 lần
    assert.equal(bulletizeLines('- Câu một.\n- Câu hai.'), '- Câu một.\n- Câu hai.');
    // Marker "Bước N:" của AI được tách dòng, bỏ marker, gắn bullet
    const marked = bulletizeLines('Bước 1: GV đố vui. Bước 2: HS trả lời.');
    assert.equal(marked, '- GV đố vui.\n- HS trả lời.');
    // Viết tắt không bị tách: "VD." và "tr. 12" dính với câu sau
    const abbr = bulletizeLines('GV làm mẫu VD. như SGK tr. 12. HS quan sát.');
    assert.ok(abbr.includes('VD. như SGK tr. 12.'), 'không tách sau VD./tr.');
    assert.equal(abbr.split('\n').length, 2);
    // Rỗng vẫn rỗng
    assert.equal(bulletizeLines(''), '');
    assert.equal(bulletizeLines(null), '');
  });

  it('importLegacyPlan: cách tiến hành 1 khối thành nhiều dòng bullet', () => {
    const p = importLegacyPlan({
      title: 'Bài test',
      hoatDong: [
        { section: 'A', ten: 'Khởi động', cachTienHanh: 'GV ổn định. GV đố vui. HS trả lời.', hs: 'HS hát.' },
      ],
    });
    const gv = p.hoatDong[0].steps[0].gv;
    assert.ok(gv.startsWith('- '), 'dòng đầu bullet -');
    assert.equal(gv.split('\n').length, 3);
  });

  it('detag giữ dấu < trong nội dung Toán (2 < 5)', () => {
    const p = importLegacyPlan({
      title: 'Bài test',
      hoatDong: [
        { section: 'B', ten: 'Luyện tập', mucTieu: 'So sánh 2 < 5 thì thế nào?', cachTienHanh: 'GV hỏi.', hs: 'HS đáp.' },
      ],
    });
    assert.ok(p.hoatDong[0].mucTieu.includes('2 < 5'), 'không được ăn mất "2 < 5"');
    // Thẻ HTML thật vẫn lột
    const q = importLegacyPlan({ title: 'T', hoatDong: [{ ten: '<b>Đậm</b> text' }] });
    assert.equal(q.hoatDong[0].ten, 'Đậm text');
  });

  it('ketLuan không in đúp tiền tố ⇨', () => {
    const p = importLegacyPlan({
      title: 'Bài test',
      hoatDong: [
        { section: 'A', ten: 'Khởi động', ketLuan: '⇨ Giáo viên rút ra kết luận: HS hứng thú.' },
      ],
    });
    assert.equal(p.hoatDong[0].ketLuan, 'HS hứng thú.');
  });

  it('bulletizeLines bỏ dòng số lẻ trơ trọi của AI', () => {
    assert.equal(
      bulletizeLines('Xem ví dụ.\n3.\nGV đọc tiếp.'),
      '- Xem ví dụ.\n- GV đọc tiếp.',
    );
  });
});
