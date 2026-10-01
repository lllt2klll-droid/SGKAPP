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

const { buildLessonPrompt, extractPlanJson, aiJsonToPlan, sanitizePpdh, LESSON_METHODS } = await import('./planAi.js');

const SAMPLE_AI_JSON = {
  title: 'Bài 12 – Phép cộng trong phạm vi 10',
  monHoc: 'Toán', lop: '2',
  nlDacThu: ['Cộng 9 với một số', 'Vận dụng thực tế', 'Dùng que tính'],
  nlChung: ['Tự chủ', 'Giao tiếp', 'Giải quyết vấn đề'],
  phamChat: ['Chăm chỉ', 'Trung thực', 'Trách nhiệm'],
  lienHeTichHop: 'Mua bán',
  ddGV: ['Tranh', 'Que tính'], ddHS: ['SGK', 'Bảng con'],
  differentiation: { support: 'a', advanced: 'b' },
  hoatDong: [
    { section: 'A', ten: 'Khởi động', phut: '5', mucTieu: 'Hứng thú', ppdh: 'Quan sát', dddh: 'Thẻ', cachTienHanh: 'GV đố vui 9 + 1.', ketLuan: '⇨ Giáo viên rút ra kết luận: sẵn sàng.', hs: 'HS trả lời.' },
    { section: 'B', ten: 'Khám phá', phut: '8', mucTieu: 'Biết tách số', ppdh: 'Quan sát', dddh: 'Que tính', cachTienHanh: 'GV gắn 9 chấm đỏ 5 chấm xanh.', ketLuan: '⇨ Giáo viên rút ra kết luận: 9+5=14.', hs: 'HS thao tác que tính.' },
    { section: 'B', ten: 'Luyện tập 1', phut: '8', mucTieu: 'Làm đúng 8+4', ppdh: 'Nhận xét', dddh: 'Bảng con', cachTienHanh: 'GV giao bài 8+4.', ketLuan: '⇨ Giáo viên rút ra kết luận: làm đúng.', hs: 'HS làm bảng con.' },
    { section: 'B', ten: 'Luyện tập 2', phut: '8', mucTieu: 'Làm phiếu', ppdh: 'Chấm chéo', dddh: 'Phiếu', cachTienHanh: 'GV phát phiếu.', ketLuan: '⇨ Giáo viên rút ra kết luận: hoàn thành.', hs: 'HS đổi chéo chấm.' },
    { section: 'C', ten: 'Vận dụng', phut: '4', mucTieu: 'Chơi nhanh', ppdh: 'Quan sát', dddh: 'Thẻ', cachTienHanh: 'GV giơ thẻ.', ketLuan: '⇨ Giáo viên rút ra kết luận: nhanh.', hs: 'HS giơ đáp án.' },
    { section: 'D', ten: 'Nối tiếp', phut: '2', mucTieu: 'Dặn dò', ppdh: 'Nhận xét', dddh: 'Vở', cachTienHanh: 'GV dặn về đố người thân.', ketLuan: '⇨ Giáo viên rút ra kết luận: ghi nhớ.', hs: 'HS lắng nghe.' },
  ],
  dieuChinh: 'Thêm giờ cho HS yếu.', phuLuc: 'Phiếu bài tập.',
};

describe('AI soạn KHBD — planAi', () => {
  beforeEach(() => localStorage.clear());

  it('buildLessonPrompt gói đủ thông số đã chấp nhận', () => {
    assert.ok(Array.isArray(LESSON_METHODS) && LESSON_METHODS.includes('Hỏi đáp'));
    const prompt = buildLessonPrompt({
      title: 'Bài 12', lesson: 'Bài 12', from: 12, to: 14,
      duration: '35', method: 'Trực quan', includeDiff: true,
    });
    for (const needle of ['Bài 12', '12–14', '35 phút', 'Trực quan', 'hoatDong', 'cachTienHanh', 'differentiation', 'JSON', '"section"']) {
      assert.ok(prompt.includes(needle), `prompt thiếu: ${needle}`);
    }
  });

  it('extractPlanJson bóc JSON giữa text thừa + báo lỗi rõ', () => {
    const obj = extractPlanJson('Chào thầy cô!\n{"a":1,"b":[2]}\nHết.');
    assert.deepEqual(obj, { a: 1, b: [2] });
    assert.throws(() => extractPlanJson('không có json ở đây'), /JSON lỗi/);
    assert.throws(() => extractPlanJson('{"a":}'), /JSON lỗi/);
  });

  it('extractPlanJson tự sửa lỗi AI hay mắc', () => {
    // Bọc markdown fence
    assert.deepEqual(extractPlanJson('```json\n{"a":1}\n```'), { a: 1 });
    // Dấu phẩy thừa cuối mảng/đối tượng
    assert.deepEqual(extractPlanJson('{"a":[1,2,],"b":1,}'), { a: [1, 2], b: 1 });
    // Output bị cắt cụt giữa chừng (thiếu đóng ngoặc)
    assert.deepEqual(extractPlanJson('{"a":{"b":[1,2'), { a: { b: [1, 2] } });
    // Cắt cụt giữa chuỗi
    assert.deepEqual(extractPlanJson('{"a":"xyz'), { a: 'xyz' });
  });

  it('aiJsonToPlan: output AI thành plan đầy đủ, phút chuẩn tổng', () => {
    const p = aiJsonToPlan(SAMPLE_AI_JSON, {
      title: 'Bài 12 – Phép cộng trong phạm vi 10', lesson: 'Bài 12',
      subject: 'Toán', grade: '2', bookId: 'toan2.pdf', bookTitle: 'Toán 2',
      pageStart: 12, pageEnd: 14, duration: '35',
    });
    assert.equal(p.title, 'Bài 12 – Phép cộng trong phạm vi 10');
    assert.equal(p.thoiGian, '35 phút');
    assert.equal(p.hoatDong.length, 6);
    assert.deepEqual(p.hoatDong.map((a) => a.section), ['A', 'B', 'B', 'B', 'C', 'D']);
    // Nội dung AI được giữ nguyên, không trống
    const b1 = p.hoatDong[1];
    assert.equal(b1.ten, 'Khám phá');
    assert.ok(b1.steps[0].gv.includes('9 chấm đỏ'), 'giữ cách tiến hành AI');
    assert.ok(b1.steps[0].hs.includes('que tính'), 'giữ HĐ HS của AI');
    assert.ok(p.hoatDong[0].ketLuan.includes('sẵn sàng'), 'giữ nội dung kết luận AI');
    assert.ok(!p.hoatDong[0].ketLuan.includes('⇨'), 'lột tiền tố ⇨ trong data (mẫu Word tự in 1 lần)');
    // AI chia 5+8+8+8+4+2=35 → giữ nguyên vì đã khớp
    const total = p.hoatDong.reduce((n, a) => n + (parseInt(a.phut, 10) || 0), 0);
    assert.equal(total, 35);
    assert.equal(p.bookReferences[0].pageStart, 12);
    assert.equal(p.bookReferences[0].pageEnd, 14);
  });

  it('aiJsonToPlan: AI thiếu khu / thiếu phút thì bù khung + chuẩn tổng', () => {
    const thin = {
      title: 'Bài thiếu', hoatDong: [
        { section: 'B', ten: 'Chỉ có B', cachTienHanh: 'Làm gì đó.', hs: 'HS làm.' },
      ],
    };
    const p = aiJsonToPlan(thin, { duration: '35', pageStart: 1, pageEnd: 1 });
    const secs = p.hoatDong.map((a) => a.section);
    for (const s of ['A', 'B', 'C', 'D']) assert.ok(secs.includes(s), `phải bù khu ${s}`);
    for (const a of p.hoatDong) {
      assert.ok(a.steps.length >= 1, 'mỗi HĐ ≥1 bước');
      assert.ok(Number(a.phut) > 0, `HĐ "${a.ten}" phải có phút`);
    }
    const total = p.hoatDong.reduce((n, a) => n + (parseInt(a.phut, 10) || 0), 0);
    assert.equal(total, 35);
  });

  it('sanitizePpdh: chỉ giữ tên trong DANH_GIA_ALLOWED, không phân biệt hoa/thường + dấu', () => {
    assert.equal(sanitizePpdh('Đánh giá sản phẩm; Phát biểu; Quan sát'), 'Đánh giá sản phẩm; Phát biểu; Quan sát');
    assert.equal(sanitizePpdh('quan sát, NHẬN XÉT'), 'Quan sát; Nhận xét');
    assert.equal(sanitizePpdh('Tên bịa 123; Kỹ thuật do AI bịa ra'), '');
    assert.equal(sanitizePpdh(''), '');
    assert.equal(sanitizePpdh(null), '');
    assert.equal(sanitizePpdh(['Quan sát', 'Vấn đáp']), 'Quan sát; Vấn đáp');
  });

  it('aiJsonToPlan: ppdh bịa bị lọc ở code — tên lạ biến mất, tên chuẩn giữ nguyên', () => {
    const raw = {
      title: 'Bài lọc ppdh',
      hoatDong: [
        { section: 'A', ten: 'Khởi động', phut: '5', ppdh: 'Đánh giá bí ẩn; Quan sát', cachTienHanh: 'GV hỏi.', hs: 'HS trả lời.' },
        { section: 'B', ten: 'Khám phá', phut: '10', ppdh: 'quan sát, Nhận xét học sinh', cachTienHanh: 'GV nêu.', hs: 'HS làm.' },
        { section: 'C', ten: 'Vận dụng', phut: '10', ppdh: 'Bịa hoàn toàn XYZ', cachTienHanh: 'GV giao.', hs: 'HS làm.' },
        { section: 'D', ten: 'Nối tiếp', phut: '10', ppdh: '', cachTienHanh: 'GV dặn.', hs: 'HS nghe.' },
      ],
    };
    const p = aiJsonToPlan(raw, { duration: '35', pageStart: 1, pageEnd: 1 });
    const byTen = Object.fromEntries(p.hoatDong.map((a) => [a.ten, a.ppdh]));
    assert.equal(byTen['Khởi động'], 'Quan sát', 'bỏ tên bịa, giữ tên chuẩn');
    assert.equal(byTen['Khám phá'], 'Quan sát; Nhận xét', 'chuẩn hóa hoa/thường + gạt tên thừa');
    assert.equal(byTen['Vận dụng'], '', 'toàn tên bịa → để trống, không giữ');
    assert.equal(byTen['Nối tiếp'], '', 'ppdh trống vẫn trống');
  });

  it('aiJsonToPlan: section AI viết bừa vẫn về đúng khu', () => {
    const messy = {
      title: 'Bài Z',
      hoatDong: [
        { section: 'A. Khởi động', ten: 'A. Khởi động', cachTienHanh: 'GV đố vui.', hs: 'HS trả lời.' },
        { section: 'khu B', ten: 'Khám phá', cachTienHanh: 'GV nêu vấn đề.', hs: 'HS quan sát.' },
        { ten: 'Luyện tập', cachTienHanh: 'GV giao bài.', hs: 'HS làm bài.' },
        { section: 'C', ten: 'Vận dụng', cachTienHanh: 'GV tổ chức trò chơi.', hs: 'HS chơi.' },
        { section: 'D. Nối tiếp', ten: 'D. Nối tiếp', cachTienHanh: 'GV dặn dò.', hs: 'HS nghe.' },
      ],
    };
    const p = aiJsonToPlan(messy, { duration: '35', pageStart: 1, pageEnd: 2 });
    assert.deepEqual(p.hoatDong.map((a) => a.section), ['A', 'B', 'B', 'C', 'D']);
  });
});
