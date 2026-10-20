// ── Bộ dữ liệu mẫu dùng cho nút "Tự động làm" ở từng chế độ ────────
// Tất cả hàm đều CHỈ THÊM MỚI: không xóa, không ghi đè dữ liệu thật;
// mục nào đã có (trùng tên/trang/nội dung) sẽ tự bỏ qua.
import { getVocab, addVocabEntry, addQuizRecord } from './userdata.js';
import {
  getCollections, addCollection, getClips, addClip,
  getRefs, addManualRef, upsertBookRef,
  savePageMark, getPageMark, chapterForPage,
} from './researchDB.js';
import { machsForSubject, yccdFor, MUC_DO } from './ctgpt.js';
import { addQuestion, addActivity } from './teachingDB.js';
import { getIdeas, createIdea } from './personalDB.js';
import { makeId } from './storage.js';
import { savePlan as saveKhbdV2Plan, importLegacyPlan as toKhbdV2Plan } from './khbd/planModel.js';

export const SAMPLE_SEARCH_QUERY = 'phép cộng';

// ── Sổ tay từ vựng ────────────────────────────────────────────────
const VOCAB_SAMPLES = {
  math: [
    { word: 'phép cộng', page: 31, meaning: 'Phép tính gộp hai số (hoặc nhiều số) lại thành một số, kết quả gọi là tổng. VD: 3 + 2 = 5.', grade: 1 },
    { word: 'hình vuông', page: 34, meaning: 'Hình có bốn cạnh bằng nhau và bốn góc vuông. VD: viên gạch lát nền thường có dạng hình vuông.', grade: 1 },
    { word: 'số chục', page: 42, meaning: 'Cách đếm nhóm mười đơn vị thành một chục. VD: 10 que tính là một chục que tính.', grade: 1 },
  ],
  viet: [
    { word: 'từ chỉ hoạt động', page: 29, meaning: 'Từ chỉ việc làm, hành động của con người, con vật hoặc sự vật. VD: chạy, nhảy, đọc sách.', grade: 1 },
    { word: 'khổ thơ', page: 45, meaning: 'Đoạn thơ được tách riêng trên trang giấy, gồm một số dòng thơ liên tiếp; một bài thơ thường có nhiều khổ.', grade: 1 },
    { word: 'nhân hóa', page: 52, meaning: 'Biện pháp gán cho sự vật, con vật những đặc điểm, hành động, cảm xúc của con người. VD: "Chị gió vui đùa cùng lá cây".', grade: 1 },
  ],
};

export function fillSampleVocab(books) {
  if (!books.length) return 0;
  const mathBook = books.find(b => /toán/i.test(b.subject || '')) || books[0];
  const viBook = books.find(b => /tiếng việt/i.test(b.subject || '')) || books[1] || books[0];
  const entries = [
    ...VOCAB_SAMPLES.math.map(s => ({ ...s, file: mathBook.filename, bookTitle: mathBook.title, grade: mathBook.grade })),
    ...VOCAB_SAMPLES.viet.map(s => ({ ...s, file: viBook.filename, bookTitle: viBook.title, grade: viBook.grade })),
  ];
  let added = 0;
  entries.forEach(s => {
    const dup = getVocab().find(e => e.word === s.word && e.file === s.file && e.page === s.page && e.grade === s.grade);
    if (!dup) { addVocabEntry(s); added += 1; }
  });
  return added;
}

// ── Lịch sử luyện tập trắc nghiệm (thống kê) ──────────────────────
export function fillSampleQuiz(books) {
  const b = books.find(x => /toán/i.test(x.subject || '')) || books[0];
  const base = b ? { file: b.filename, title: b.title, grade: b.grade, page: 21 } : { file: '', title: 'Toán 1 — Tập 2', grade: 1, page: 21 };
  addQuizRecord({ ...base, score: 4, total: 5, at: Date.now() - 86400000 });
  addQuizRecord({ ...base, score: 5, total: 5, at: Date.now() - 3600000 });
  return 2;
}

// ── Danh mục tài liệu tham khảo ───────────────────────────────────
const MANUAL_REFS = [
  { authors: 'Bộ Giáo dục và Đào tạo', year: 2020, title: 'Thông tư số 27/2020/TT-BGDĐT quy định về đánh giá học sinh tiểu học', publisher: 'Bộ Giáo dục và Đào tạo', place: 'Hà Nội', note: 'Văn bản pháp quy về đánh giá thường xuyên, định kỳ và hồ sơ đánh giá học sinh tiểu học.', file: '' },
  { authors: 'Lê Văn Tám', year: 2023, title: 'Phương pháp dạy học Toán ở Tiểu học', publisher: 'NXB Giáo dục Việt Nam', place: 'Hà Nội', note: 'Tài liệu tham khảo cho sinh viên sư phạm tiểu học khi thiết kế kế hoạch bài dạy.', file: '' },
];

export async function fillSampleRefs(books) {
  let added = 0;

  const existing = await getRefs();

  const existingKeys = new Set(
    existing.map(
      r =>
        `${r.authors}|${r.year}|${r.title}` 
    )
  );

  for (const ref of MANUAL_REFS) {
    const key =
      `${ref.authors}|${ref.year}|${ref.title}`;

    if (existingKeys.has(key)) {
      continue;
    }

    await addManualRef({
      ...ref,
      file: '',
    });

    existingKeys.add(key);
    added++;
  }

  const currentRefs = await getRefs();

  const existingBooks = new Set(
    currentRefs
      .map(r => r.file)
      .filter(Boolean)
  );

  for (
    const book of books
      .filter(b => !existingBooks.has(b.filename))
      .slice(0, 3)
  ) {
    await upsertBookRef(book);
    existingBooks.add(book.filename);
    added++;
  }

  return {
    added,
    autoBooks: Math.min(
      3,
      books.filter(
        b => !existingBooks.has(b.filename)
      ).length
    ),
  };
}

// ── Bộ sưu tập trích đoạn ─────────────────────────────────────────
const CLIP_TEXT = [
  '3 + 2 = ? Giáo viên hướng dẫn học sinh dùng que tính để gộp hai nhóm đồ vật rồi đọc to kết quả cho cả lớp nghe.',
  'Hình vuông có bốn cạnh bằng nhau và bốn góc đều là góc vuông. Giáo viên gợi ý học sinh kể tên vài đồ vật có dạng hình vuông.',
  'Buổi sáng, mẹ em thường tập thể dục cùng bà. Mẹ quét nhà, bà tưới cây còn em thì xếp sách vở lên bàn học.',
  'Sóng vỗ rì rào như đang vỗ tay chào các bạn nhỏ, cây dừa nghiêng mình như muốn trò chuyện.',
];

function ensureColl(name, desc) {
  let c = getCollections().find(x => x.name === name);
  if (!c) { addCollection(name, desc); c = getCollections().find(x => x.name === name); }
  return c;
}

export async function fillSampleClips(books) {
  if (!books.length) {
    return {
      collCount: 0,
      added: 0,
    };
  }

  const b1 =
    books.find(
      b => /toán/i.test(b.subject || '')
    ) || books[0];

  const b2 =
    books.find(
      b => /tiếng việt/i.test(b.subject || '')
    ) ||
      books[1] ||
      books[0];

  const collA =
    ensureColl(
      'Phép cộng trong phạm vi 10',
      'Gom bài tập và lời dẫn về phép cộng dùng cho kế hoạch bài dạy.'
    );

  const collB =
    ensureColl(
      'Biện pháp nhân hóa',
      'Trích đoạn văn bản văn học có nhân hóa để dạy Tiếng Việt.'
    );

  const existing = await getClips();

  let added = 0;

  for (const item of [
    {
      coll: collA,
      book: b1,
      page: 31,
      text: CLIP_TEXT[0],
    },
    {
      coll: collA,
      book: b1,
      page: 34,
      text: CLIP_TEXT[1],
    },
    {
      coll: collB,
      book: b2,
      page: 29,
      text: CLIP_TEXT[2],
    },
    {
      coll: collB,
      book: b2,
      page: 40,
      text: CLIP_TEXT[3],
    },
  ]) {
    if (!item.coll) continue;

    const duplicate = existing.some(
      clip =>
        clip.collId === item.coll.id &&
        clip.file === item.book.filename &&
        clip.page === item.page &&
        clip.text === item.text
    );

    if (duplicate) continue;

    await addClip({
      collId: item.coll.id,
      file: item.book.filename,
      bookTitle: item.book.title,
      grade: item.book.grade,
      subject: item.book.subject,
      page: item.page,
      text: item.text,
      chapter:
        chapterForPage(
          item.book,
          item.page
        ) || '',
    });

    added++;
  }

  return {
    collCount:
      (collA ? 1 : 0) +
      (collB ? 1 : 0),
    added,
  };
}

// ── Gắn thẻ CTGDPT + Ma trận dạy học ──────────────────────────────
export function fillSampleMarks(book) {
  if (!book) return 0;
  const machs = machsForSubject(book.subject || '');
  const yccd = yccdFor(book.subject || '', book.grade || 1).slice(0, 4).map(y => y.id);
  const pages = [21, 26, 31, 36, 41, 46];
  let added = 0;
  pages.forEach((pg, i) => {
    if (getPageMark(book, pg)) return;
    const m = machs[i % Math.max(1, machs.length)];
    savePageMark(book, pg, {
      yccd,
      mach: m ? m.id : '',
      mucdo: MUC_DO[i % MUC_DO.length],
      tieuDe: `${book.title} — bài luyện tập trang ${pg - 1}`,
      tiet: String((i % 3) + 1),
      thietBi: ['Bảng tương tác', 'Thẻ số', 'Phiếu bài tập'].slice(0, (i % 3) + 1),
      ghiChu: 'Trang gắn thẻ mẫu để kiểm thử ma trận dạy học.',
    });
    added += 1;
  });
  return added;
}

// ── Ngân hàng câu hỏi ─────────────────────────────────────────────
const QUESTION_SAMPLES = [
  { type: 'mc', subject: 'Toán', grade: 1, chapter: 'Phép cộng trong phạm vi 10', yccd: 'Thực hiện được phép cộng trong phạm vi 10', mucdo: 'Biết', question: 'Kết quả của phép tính 3 + 2 là:', options: ['4', '5', '6', '7'], correctIndex: 1, answer: '' },
  { type: 'mc', subject: 'Toán', grade: 1, chapter: 'Phép cộng trong phạm vi 10', yccd: 'Vận dụng phép cộng vào tình huống thực tế', mucdo: 'Vận dụng', question: 'An có 4 quả cam, mẹ cho thêm 3 quả. An có tất cả bao nhiêu quả cam?', options: ['6 quả', '7 quả', '8 quả', '9 quả'], correctIndex: 1, answer: '' },
  { type: 'mc', subject: 'Toán', grade: 2, chapter: 'Phép nhân, bảng nhân 2', yccd: 'Bước đầu nhận biết ý nghĩa phép nhân', mucdo: 'Hiểu', question: '2 × 3 bằng mấy?', options: ['4', '5', '6', '8'], correctIndex: 2, answer: '' },
  { type: 'tl', subject: 'Toán', grade: 1, chapter: 'Phép cộng trong phạm vi 10', yccd: 'Vận dụng phép cộng', mucdo: 'Vận dụng', question: 'Viết một phép cộng có kết quả bằng 10 và giải thích cách em đã làm.', options: [], correctIndex: 0, answer: 'Nhiều đáp án đúng, VD: 6 + 4 = 10; em lấy 6 que tính gộp với 4 que tính được 1 chục que tính.' },
  { type: 'mc', subject: 'Tiếng Việt', grade: 1, chapter: 'Luyện từ và câu', yccd: 'Nhận biết từ chỉ hoạt động', mucdo: 'Biết', question: 'Từ nào dưới đây chỉ hoạt động?', options: ['trắng', 'chạy', 'bàn', 'vui'], correctIndex: 1, answer: '' },
  { type: 'mc', subject: 'Tiếng Việt', grade: 3, chapter: 'Luyện từ và câu', yccd: 'Bước đầu nhận biết biện pháp nhân hóa', mucdo: 'Hiểu', question: 'Trong câu "Chị gió vui đùa cùng lá cây", sự vật nào được nhân hóa?', options: ['Chị gió', 'lá cây', 'vui đùa', 'cùng'], correctIndex: 0, answer: '' },
  { type: 'tl', subject: 'Tiếng Việt', grade: 1, chapter: 'Viết đoạn văn', yccd: 'Viết được câu đơn giản', mucdo: 'Vận dụng', question: 'Viết một câu kể về gia đình em.', options: [], correctIndex: 0, answer: 'VD: Gia đình em gồm ba, mẹ, anh trai và em.' },
  { type: 'mc', subject: 'Tự nhiên và Xã hội', grade: 1, chapter: 'Cơ thể em', yccd: 'Kể tên các giác quan của cơ thể', mucdo: 'Biết', question: 'Mắt dùng để làm gì?', options: ['Nghe', 'Nhìn', 'Nếm', 'Ngửi'], correctIndex: 1, answer: '' },
];

export function fillSampleQuestions() {
  QUESTION_SAMPLES.forEach(q => addQuestion({ ...q }));
  return QUESTION_SAMPLES.length;
}

// ── Kho hoạt động dạy học ─────────────────────────────────────────
const ACTIVITY_SAMPLES = [
  { phase: 'khoiDong', name: 'Trò chơi "Truyền điện cộng nhanh"', grade: '1', subject: 'Toán', tags: ['Trò chơi', 'Khởi động'], content: '<p><b>Cách chơi:</b> Giáo viên tổ chức học sinh xếp vòng tròn. Giáo viên nêu phép tính 3 + 2, học sinh đầu dãy trả lời rồi ra tiếp một phép tính khác cho bạn kế bên.</p><p><b>Thời gian:</b> 3 – 4 phút.</p>' },
  { phase: 'khoiDong', name: 'Hát vận động "Đếm sao"', grade: '1', subject: 'Toán', tags: ['Hát', 'Khởi động'], content: '<p>Giáo viên dẫn dắt cả lớp hát và vỗ tay theo nhịp bài “Đếm sao”, đếm to từ 1 đến 10 để ôn lại các số trong phạm vi 10.</p>' },
  { phase: 'khamPha', name: 'Quan sát tranh và nêu phép tính', grade: '1', subject: 'Toán', tags: ['Quan sát', 'Khám phá'], content: '<p>Giáo viên hướng dẫn học sinh quan sát tranh khởi động trong SGK, kể chuyện theo tranh rồi nêu phép tính phù hợp: "Có 3 con chim và 2 con chim nữa, tất cả là 5 con chim".</p>' },
  { phase: 'khamPha', name: 'Dùng que tính tìm kết quả phép cộng', grade: '1', subject: 'Toán', tags: ['Trực quan', 'Khám phá'], content: '<p>Giáo viên hướng dẫn học sinh dùng que tính gộp hai nhóm (3 + 2) để tìm kết quả, sau đó nêu cách làm bằng lời cho bạn nghe.</p>' },
  { phase: 'luyenTap', name: 'Luyện tập bảng con: phép cộng trong phạm vi 10', grade: '1', subject: 'Toán', tags: ['Bảng con', 'Luyện tập'], content: '<p>Giáo viên đọc phép tính, học sinh viết kết quả vào bảng con rồi giơ bảng để cả lớp so sánh, nhận xét.</p>' },
  { phase: 'luyenTap', name: 'Làm việc nhóm đôi giải bài tập trong SGK', grade: '1', subject: 'Toán', tags: ['Nhóm đôi', 'Luyện tập'], content: '<p>Giáo viên tổ chức học sinh làm việc nhóm đôi: hai bạn ngồi cạnh nhau trao đổi cách làm bài 2, bài 3 trong SGK; bạn này hỏi, bạn kia trả lời rồi đổi vai.</p>' },
  { phase: 'vanDung', name: 'Giải bài toán thực tế "Đi chợ cùng mẹ"', grade: '1', subject: 'Toán', tags: ['Thực tế', 'Vận dụng'], content: '<p>Giáo viên đưa tranh cảnh đi chợ, hướng dẫn học sinh đặt câu chuyện có phép cộng rồi giải: "Mẹ mua 4 quả trứng, mua thêm 3 quả nữa. Hỏi mẹ mua tất cả bao nhiêu quả trứng?"</p>' },
  { phase: 'danDo', name: 'Củng cố và giao bài về nhà', grade: '1', subject: 'Toán', tags: ['Củng cố'], content: '<p>Giáo viên hướng dẫn cả lớp nhắc lại cách thực hiện phép cộng trong phạm vi 10; giáo viên giao bài tập về nhà và dặn học sinh tập đếm đồ vật trong gia đình.</p>' },
];

export function fillSampleActivities() {
  ACTIVITY_SAMPLES.forEach(a => addActivity(a));
  return ACTIVITY_SAMPLES.length;
}

// ── Kho ý tưởng dạy học chi tiết (IdeasView schema v2) ────────────────
const IDEA_SAMPLES = [
  {
    title: 'Trò chơi “Ai nhanh hơn” — luyện phản xạ phép cộng trong phạm vi 10',
    summary: 'Chia lớp thành 2 đội, giáo viên đọc phép tính, đội nào giơ đáp án đúng và nhanh hơn sẽ ghi điểm.',
    subject: 'Toán', grade: '1', type: 'troChoi', phase: 'luyenTap', format: 'nhomLon', difficulty: 'de',
    status: 'sanSang', duration: 7, prepTime: '5 phút', favorite: true, rating: 5,
    objectives: 'Củng cố phép cộng trong phạm vi 10; rèn phản xạ tính nhẩm nhanh và tinh thần đồng đội.',
    materials: 'Thẻ số 0–10 cho mỗi đội; bảng ghi điểm; chuông/trống nhỏ.',
    tags: ['Trò chơi', 'Tính nhẩm', 'Luyện tập'],
    steps: [
      { title: 'Chia đội & phổ biến luật', content: 'Chia lớp thành 2 đội đều nhau. Mỗi đội cử 1 bạn giơ thẻ đáp án. Giáo viên đọc phép tính, đội nào giơ đúng và nhanh hơn được 1 điểm.', minutes: 2 },
      { title: 'Tổ chức chơi', content: 'Giáo viên lần lượt đọc 8–10 phép tính (4 + 1, 2 + 3, 5 + 2…). Cả lớp đếm ngược “3 – 2 – 1” rồi hai đội giơ thẻ.', minutes: 4 },
      { title: 'Tổng kết & trao thưởng', content: 'Cộng điểm, tuyên dương đội thắng. Mời 1–2 học sinh nêu lại cách nhẩm nhanh.', minutes: 1 },
    ],
    variations: 'Với lớp đã vững, đổi luật: nêu kết quả rồi yêu cầu tìm phép tính (đảo ngược). Có thể dùng bảng con thay thẻ số.',
    assessment: 'Quan sát tốc độ và độ chính xác của từng học sinh; ghi nhận em còn lúng túng để hỗ trợ tiết sau.',
    classroomTips: 'Xếp hai đội quay mặt vào bảng để không nhìn bài nhau. Giữ nhịp độ nhanh, tránh để đội thua mất hứng.',
    competencies: 'Giao tiếp – hợp tác; giải quyết vấn đề; tính toán.',
  },
  {
    title: 'Đóng vai “Đi chợ cùng mẹ” — vận dụng phép cộng vào tình huống thực tế',
    summary: 'Học sinh sắm vai người mua hàng, dùng phép cộng để tính số lượng đồ mua được.',
    subject: 'Toán', grade: '1', type: 'dongVai', phase: 'vanDung', format: 'capDoi', difficulty: 'trungBinh',
    status: 'daThu', duration: 15, prepTime: '15 phút', favorite: false, rating: 4,
    objectives: 'Vận dụng phép cộng trong phạm vi 10 vào tình huống mua bán gần gũi; phát triển ngôn ngữ toán học.',
    materials: 'Tranh cảnh chợ; thẻ hình quả trứng, quả cam; tiền giấy đồ chơi.',
    tags: ['Đóng vai', 'Thực tế', 'Vận dụng'],
    steps: [
      { title: 'Giới thiệu tình huống', content: 'Giáo viên chiếu tranh chợ, kể: “Mẹ mua 4 quả trứng, mua thêm 3 quả nữa”.', minutes: 3 },
      { title: 'Sắm vai nhóm đôi', content: 'Hai bạn đóng vai mẹ và em nhỏ, dùng thẻ hình mô phỏng việc mua hàng và nói ra phép cộng.', minutes: 8 },
      { title: 'Trình diễn & chốt', content: '2–3 cặp trình diễn trước lớp; cả lớp nhận xét và viết phép tính 4 + 3 = 7.', minutes: 4 },
    ],
    variations: 'Đổi số lượng theo trình độ lớp. Có thể cho “gian hàng” với nhiều món để học sinh tự chọn tình huống.',
    assessment: 'Đánh giá qua câu nói của học sinh khi sắm vai: có nêu đúng phép tính và kết quả không.',
    classroomTips: 'Chuẩn bị thẻ hình đủ cho mỗi cặp. Khuyến khích dùng câu đầy đủ: “Mẹ mua tất cả … quả”.',
    competencies: 'Giao tiếp; vận dụng toán học vào thực tiễn.',
  },
  {
    title: 'Thí nghiệm “Vật chìm – vật nổi” khám phá khoa học quanh em',
    summary: 'Học sinh dự đoán và kiểm chứng vật nổi hay chìm trong nước, ghi kết quả vào bảng nhóm.',
    subject: 'Tự nhiên và Xã hội', grade: '2', type: 'thiNghiem', phase: 'khamPha', format: 'nhomNho', difficulty: 'trungBinh',
    status: 'canCaiThien', duration: 25, prepTime: '20 phút', favorite: true, rating: 4,
    objectives: 'Bước đầu nhận biết vật nổi/chìm; rèn kỹ năng quan sát, dự đoán và ghi chép khoa học.',
    materials: 'Chậu nước; các vật nhỏ (nút áo, viên sỏi, lá cây, gỗ, nhựa, kim loại); khăn lau; bảng dự đoán.',
    tags: ['Thí nghiệm', 'Khám phá', 'Khoa học'],
    steps: [
      { title: 'Dự đoán', content: 'Mỗi nhóm nhận bảng có 6 vật, thảo luận và đánh dấu dự đoán nổi/chìm trước khi thử.', minutes: 6 },
      { title: 'Thử nghiệm', content: 'Lần lượt thả từng vật vào chậu nước, quan sát và ghi kết quả thực tế bên cạnh dự đoán.', minutes: 12 },
      { title: 'So sánh & kết luận', content: 'Các nhóm so sánh dự đoán với kết quả, nêu nhận xét: vật nhẹ thường nổi, vật nặng – kim loại thường chìm.', minutes: 7 },
    ],
    variations: 'Cho học sinh tự mang vật từ nhà. Có thể mở rộng: vật nào nổi khi bóp méo thay đổi hình dạng.',
    assessment: 'Kiểm tra bảng ghi của nhóm; hỏi vì sao em đoán vật đó nổi/chìm.',
    classroomTips: 'Lót khăn dưới chậu để tránh ướt bàn. Nhắc nhở không uống nước thí nghiệm.',
    competencies: 'Khoa học; giải quyết vấn đề; hợp tác.',
  },
  {
    title: 'Học theo trạm: ôn tập 4 kỹ năng Tiếng Việt luyện tập nhóm',
    summary: 'Lớp chia thành 4 trạm Đọc – Viết – Nói – Nghe, học sinh luân phiên hoàn thành nhiệm vụ mỗi trạm.',
    subject: 'Tiếng Việt', grade: '3', type: 'tram', phase: 'luyenTap', format: 'tram', difficulty: 'kho',
    status: 'sanSang', duration: 35, prepTime: '30 phút', favorite: false, rating: 5,
    objectives: 'Ôn luyện đồng thời 4 kỹ năng; rèn tự chủ và quản lý thời gian cho học sinh.',
    materials: '4 góc trạm với phiếu nhiệm vụ; đồng hồ/bộ đếm thời gian; sổ ghi kết quả.',
    tags: ['Trạm', 'Ôn tập', 'Tự chủ'],
    steps: [
      { title: 'Chuẩn bị trạm', content: 'Bố trí 4 trạm quanh lớp, mỗi trạm đặt phiếu nhiệm vụ và đồ dùng. Phổ biến cách di chuyển và thời gian 8 phút/trạm.', minutes: 5 },
      { title: 'Luân phiên trạm', content: 'Học sinh theo nhóm di chuyển khi có hiệu lệnh, hoàn thành nhiệm vụ ở mỗi trạm và ghi kết quả.', minutes: 24 },
      { title: 'Chia sẻ chung', content: 'Đại diện nhóm chia sẻ sản phẩm ở mỗi trạm; giáo viên nhấn mạnh điểm cần lưu ý.', minutes: 6 },
    ],
    variations: 'Giảm còn 3 trạm nếu lớp đông. Trạm Nghe có thể dùng đoạn ghi âm ngắn thay đọc trực tiếp.',
    assessment: 'Thu phiếu kết quả của từng trạm; đánh giá qua mức độ hoàn thành và hợp tác trong nhóm.',
    classroomTips: 'Tạo tín hiệu chuyển trạm rõ ràng (nhạc/tiếng vỗ). Phân công nhóm trưởng giữ trật tự và đồ dùng.',
    competencies: 'Tự chủ – tự học; giao tiếp – hợp tác.',
  },
  {
    title: 'Hát và vận động theo nhịp “Đếm sao” khởi động giờ Toán',
    summary: 'Cả lớp hát và vỗ tay theo nhịp, đếm to từ 1 đến 10 để ôn số và tạo không khí vui vẻ.',
    subject: 'Toán', grade: '1', type: 'amNhac', phase: 'khoiDong', format: 'caLop', difficulty: 'de',
    status: 'daThu', duration: 5, prepTime: '3 phút', favorite: false, rating: 4,
    objectives: 'Ôn đếm số trong phạm vi 10; tạo hứng thú đầu giờ và rèn vận động nhịp nhàng.',
    materials: 'Nhạc/loa (nếu có); không gian đứng cho cả lớp.',
    tags: ['Hát', 'Khởi động', 'Vận động'],
    steps: [
      { title: 'Làm mẫu', content: 'Giáo viên hát mẫu và vỗ tay theo phách, hướng dẫn học sinh đếm “một sao, hai sao…” đến mười.', minutes: 2 },
      { title: 'Cả lớp cùng hát', content: 'Cả lớp vừa hát vừa vỗ tay, mỗi lần vỗ đếm một số.', minutes: 3 },
    ],
    variations: 'Với lớp thích vận động, đổi thành vừa đếm vừa nhảy theo nhịp. Có thể cho 1 bạn làm “nhạc trưởng”.',
    assessment: 'Quan sát cả lớp đếm đúng và tham gia tích cực.',
    classroomTips: 'Giữ bài ngắn, vui, tránh kéo dài gây mệt cho học sinh lớp 1.',
    competencies: 'Năng khiếu nghệ thuật; hứng khởi học tập.',
  },
  {
    title: 'Dự án mini “Góc cây xanh lớp em” — trồng và theo dõi cây trong 2 tuần',
    summary: 'Mỗi tổ nhận một chậu cây nhỏ, quan sát và ghi nhật ký sinh trưởng, trình bày kết quả sau 2 tuần.',
    subject: 'Tự nhiên và Xã hội', grade: '3', type: 'duAn', phase: 'vanDung', format: 'nhomNho', difficulty: 'kho',
    status: 'nhap', duration: 40, prepTime: 'sau giờ học', favorite: true, rating: 5,
    objectives: 'Tìm hiểu điều kiện sống của cây; rèn quan sát, ghi chép, kiên nhẫn và làm việc nhóm.',
    materials: 'Chậu nhỏ, đất, hạt giống/cây con; bình tưới; phiếu nhật ký theo dõi.',
    tags: ['Dự án', 'Khoa học', 'Kiên nhẫn'],
    steps: [
      { title: 'Khởi động dự án', content: 'Giáo viên giới thiệu mục tiêu, chia tổ nhận cây và phiếu nhật ký. Thống nhất ngày ghi chép.', minutes: 10 },
      { title: 'Trồng cây', content: 'Các tổ trồng cây vào chậu, đặt tên và đặt ở nơi có ánh sáng. Ghi ngày trồng.', minutes: 15 },
      { title: 'Theo dõi & trình bày', content: 'Hằng ngày quan sát, ghi chiều cao/số lá. Sau 2 tuần, mỗi tổ trình bày kết quả và rút ra điều học được.', minutes: 15 },
    ],
    variations: 'So sánh cây đặt chỗ sáng và chỗ tối (theo dõi song song). Có thể mời phụ huynh cùng nhắc tưới cây.',
    assessment: 'Đánh giá qua phiếu nhật ký (đầy đủ, trung thực) và phần trình bày của nhóm.',
    classroomTips: 'Phân công người tưới cây luân phiên để không quên. Nhắc phải rửa tay sau khi chăm cây.',
    competencies: 'Tự chủ; hợp tác; khoa học.',
  },
];

export function fillSampleIdeas() {
  const existing = new Set(getIdeas().map((i) => `${i.title}@@${i.subject}@@${i.grade}`));
  let added = 0;
  for (const idea of IDEA_SAMPLES) {
    const key = `${idea.title}@@${idea.subject}@@${idea.grade}`;
    if (existing.has(key)) continue;
    try { createIdea(idea); existing.add(key); added++; } catch (e) { console.warn('[sampleData] createIdea failed', e); }
  }
  return added;
}

// ── Kế hoạch bài dạy mẫu KTSP (kho mới khbd_v2_*) ─────────────────────
export function fillSampleLessonPlan() {
  const p = {
    id: `khbd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    title: 'Phép cộng trong phạm vi 10 (tiết 1)',
  };
  p.sv = 'Nguyễn Thị Hồng';
  p.mssv = 'DGT011.022.345';
  p.lopSV = 'Lớp 4A';
  p.gvhd = 'Cô Trần Thu Hà';
  p.namHoc = '2024 - 2025';
  p.monHoc = 'Toán';
  p.lop = '1';
  p.tuan = '19';
  p.soTiet = '1';
  p.hoVaTen = 'Nguyễn Thị Hồng';
  p.mssvTT = 'DGT011.022.345';
  p.lopDay = '1A2';
  p.thoiGian = 'Sáng thứ Ba, tuần 19 (tiết 1)';
  p.nlDacThu = [
    'Thực hiện được phép cộng hai số có kết quả không quá 10.',
    'Vận dụng phép cộng vào tình huống thực tế gần gũi.',
    'Diễn đạt được bằng lời cách tìm kết quả phép cộng.',
  ];
  p.lienHeTichHop = 'Liên hệ môn Tự nhiên và Xã hội: đếm số lượng vật nuôi trong gia đình.';
  p.nlChung = [
    'Tự chủ, tự học: dùng que tính tự khám phá phép cộng.',
    'Giao tiếp, hợp tác: trao đổi cách làm trong hoạt động nhóm đôi.',
    'Giải quyết vấn đề, sáng tạo: tìm nhiều cách tính khác nhau.',
  ];
  p.phamChat = [
    'Chăm chỉ: tích cực luyện tập trên bảng con.',
    'Trách nhiệm: giữ gìn đồ dùng học tập và hoàn thành nhiệm vụ được giao.',
  ];
  p.ddGV = ['SGK Toán 1, SGV Toán 1', 'Bộ đồ dùng dạy học Toán 1', 'Thẻ số 0 – 10', 'Máy chiếu trình chiếu tranh khởi động'];
  p.ddHS = ['SGK Toán 1', 'Bộ thẻ số 0 – 10', 'Que tính', 'Bảng con', 'Vở ô li'];
  let n = 1;
  const mk = (sec, stt, phut, ten, mucTieu, ppdh, dddh, cachTienHanh, ketLuan, hs, full) => ({
    id: makeId('hd'), sec, stt, ten, phut, mucTieu, ppdh, dddh, cachTienHanh, ketLuan, hs, full,
  });
  p.hoatDong = [
    mk('A', 1, '5', 'Khởi động', 'Tạo hứng thú và ôn lại cách đếm, cách so sánh số trong phạm vi 10.',
      'Trò chơi “Truyền điện”.', 'Thẻ số 0 – 10; bảng con.',
      '<p>Giới thiệu trò chơi: cô nêu phép đếm hoặc số, học sinh trả lời nhanh rồi ra tiếp cho bạn kế bên.</p><p>Quan sát, ghi nhận mức độ tham gia của từng học sinh.</p>',
      'Cả lớp chơi đúng luật, các số từ 0 đến 10 đã được nhắc lại liên tục.',
      'Tham gia trò chơi, giơ thẻ số trả lời nhanh theo hiệu lệnh.', true),
    mk('B', 1, '8', 'Khám phá cách tính 3 + 2', 'Thực hiện được phép cộng hai số bằng trực quan.',
      'Trực quan, hỏi – đáp.', 'Que tính; tranh SGK.',
      '<p>Chiếu tranh khởi động, hỏi: “Có mấy con chim? Thêm mấy con? Có tất cả mấy con?”</p><p>Hướng dẫn dùng que tính gộp hai nhóm để tìm kết quả.</p><p>Viết phép tính 3 + 2 = 5 lên bảng, giải thích tên gọi số hạng, tổng.</p>',
      'Muốn tìm tổng ta gộp các nhóm đồ vật lại rồi đếm tất cả.',
      'Dùng que tính gộp, đếm và nêu kết quả; đọc phép tính 3 + 2 = 5.', true),
    mk('B', 2, '10', 'Luyện tập trên bảng con', 'Củng cố phép cộng trong phạm vi 10, phản xạ nhanh.',
      'Thực hành luyện tập.', 'Bảng con; thẻ số.',
      '<p>Đọc lần lượt các phép tính: 4 + 1, 2 + 3, 5 + 2, 6 + 3…</p><p>Học sinh viết kết quả vào bảng con, giơ lên; nhận xét và chữa ngay những trường hợp sai.</p>',
      'Luyện tập nhiều lần giúp học sinh tính nhanh và đúng.',
      'Viết kết quả vào bảng con, giải thích cách tính khi được hỏi.', true),
    mk('B', 3, '7', 'Giải bài tập SGK theo nhóm đôi', 'Vận dụng phép cộng vào bài tập sách giáo khoa.',
      'Hợp tác, thảo luận.', 'SGK; phiếu bài tập.',
      '<p>Yêu cầu từng cặp làm bài 2, bài 3 trong SGK.</p><p>Quan sát, hỗ trợ cặp còn lúng túng; gọi đại diện trình bày.</p>',
      'Cùng trao đổi sẽ giúp mọi học sinh đều được thực hành nói cách làm.',
      'Trao đổi với bạn, trình bày bài làm trước lớp khi được mời.', true),
    mk('C', 1, '6', 'Vận dụng: bài toán đi chợ', 'Vận dụng phép cộng vào tình huống thực tế.',
      'Nêu và giải quyết vấn đề.', 'Tranh đi chợ; thẻ số.',
      '<p>Chiếu tranh, mời học sinh đặt câu chuyện: mẹ mua 3 quả cam, mua thêm 2 quả.</p><p>Hướng dẫn viết phép tính và trả lời bằng câu đầy đủ.</p>',
      'Toán học giúp ta giải quyết các tình huống gặp hằng ngày.',
      'Đặt câu chuyện, viết phép tính 3 + 2 = 5 và trả lời: “Mẹ mua tất cả 5 quả cam”.', true),
    mk('D', 1, '3', 'Nối tiếp', 'Củng cố bài học và giao nhiệm vụ về nhà.',
      'Hỏi – đáp, nêu gương.', 'Bảng con; phiếu bài tập.',
      '<p>Hỏi: “Hôm nay em học được điều gì?” Mời 2 – 3 học sinh nhắc lại cách tính.</p><p>Giao bài về nhà: đếm số đồ vật trong gia đình và nêu một phép cộng cho ba mẹ nghe.</p>',
      'Nhắc lại kiến thức trọng tâm giúp học sinh ghi nhớ lâu.',
      'Nhắc lại cách thực hiện phép cộng trong phạm vi 10.', true),
  ];
  p.dieuChinh = '';
  p.phuLuc = 'Tranh khởi động bài 12 (phóng to); phiếu bài tập số 1 in sẵn cho cả lớp.';
  const saved = saveKhbdV2Plan(toKhbdV2Plan(p));
  return saved;
}

// ── So sánh song song 2 cuốn sách ─────────────────────────────────
export function fillSampleCompare(books) {
  if (books.length < 2) return null;
  const math = books.filter(b => /toán/i.test(b.subject || ''));
  const a = math[0] || books[0];
  const b = math[1] || books.find(x => x.filename !== a.filename) || books[1];
  if (!b || b.filename === a.filename) return null;
  return {
    fileA: a.filename,
    fileB: b.filename,
    pageA: 46,
    pageB: 46,
    note: 'Cả hai bản đều trình bày bài Luyện tập phép cộng. Bản A dùng nhiều trò chơi khởi động hơn, bản B chú trọng hệ thống bài tập viết. Nên kết hợp: dùng trò chơi của A để mở bài, dùng bài tập của B để củng cố.', 
  };
}