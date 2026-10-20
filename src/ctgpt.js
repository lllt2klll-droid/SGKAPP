// ── Thư viện chuẩn tham khảo CTGDPT 2018 (cô đọng) ─────────────────
// Tổng hợp cô đọng mạch kiến thức + YÊU CẦU CẦN ĐẠT của môn Toán và
// Tiếng Việt (lớp 1–5) theo Chương trình GDPT 2018 (Ban hành kèm Thông tư
// 32/2018/TT-BGDĐT). Đây là bản tóm lược PHỤC VỤ NGHIÊN CỨU — khi soạn
// chính thức hãy đối chiếu văn bản gốc (bạn có thể bổ sung đúng nguyên
// văn cho từng bài trong phần “Gắn thẻ trang”).
// Mức độ đánh giá theo Thông tư 27/2020/TT-BGDĐT: Biết — Hiểu — Vận dụng.

export const MUC_DO = ['Biết', 'Hiểu', 'Vận dụng'];

export const MACHS = {
  math: [
    { id: 'm1', name: 'Số và phép tính', color: '#5b8def' },
    { id: 'm2', name: 'Hình học và đo lường', color: '#e0913c' },
    { id: 'm3', name: 'Thống kê và xác suất', color: '#7bc36a' },
  ],
  viet: [
    { id: 'v1', name: 'Đọc', color: '#9b7bd8' },
    { id: 'v2', name: 'Viết', color: '#e05a7e' },
    { id: 'v3', name: 'Nói và nghe', color: '#37a9a0' },
    { id: 'v4', name: 'Tiếng Việt (từ ngữ – ngữ pháp)', color: '#b8860b' },
  ],
};

// Dữ liệu CTGDPT trong file này chỉ có Toán và Tiếng Việt.
// Với môn khác trả [] (khớp cách yccdFor() lọc) thay vì ép bộ mạch Tiếng Việt.
export function machsForSubject(subject) {
  const s = String(subject || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
  if (s === 'toan') return MACHS.math;
  if (s === 'tieng viet') return MACHS.viet;
  return [];
}

// ── Yêu cầu cần đạt (tham khảo cô đọng theo lớp) ───────────────────
// YCCD = { id, subject, grade, machId, text }
export const YCCD = [
  // ─── TOÁN LỚP 1 ───
  { id: 't1m1a', subject: 'Toán', grade: 1, machId: 'm1', text: 'Đọc, viết, đếm, so sánh các số trong phạm vi 100' },
  { id: 't1m1b', subject: 'Toán', grade: 1, machId: 'm1', text: 'Nhận biết cấu tạo số có hai chữ số (chục, đơn vị)' },
  { id: 't1m1c', subject: 'Toán', grade: 1, machId: 'm1', text: 'Thực hiện cộng, trừ (không nhớ) trong phạm vi 100' },
  { id: 't1m1d', subject: 'Toán', grade: 1, machId: 'm1', text: 'Giải bài toán có lời văn bằng một phép tính cộng hoặc trừ' },
  { id: 't1m2a', subject: 'Toán', grade: 1, machId: 'm2', text: 'Nhận biết hình vuông, hình tròn, hình tam giác, hình chữ nhật; khối lập phương, khối hộp chữ nhật' },
  { id: 't1m2b', subject: 'Toán', grade: 1, machId: 'm2', text: 'Nhận biết dài hơn, ngắn hơn; đo độ dài bằng đơn vị xăng-ti-mét' },
  { id: 't1m2c', subject: 'Toán', grade: 1, machId: 'm2', text: 'Đọc giờ đúng trên đồng hồ; nhận biết ngày, tuần, tháng' },
  { id: 't1m3a', subject: 'Toán', grade: 1, machId: 'm3', text: 'Thu thập, phân loại và đếm số lượng một số sự vật theo dấu hiệu cho trước' },
  // ─── TOÁN LỚP 2 ───
  { id: 't2m1a', subject: 'Toán', grade: 2, machId: 'm1', text: 'Đọc, viết, so sánh các số trong phạm vi 1 000' },
  { id: 't2m1b', subject: 'Toán', grade: 2, machId: 'm1', text: 'Thực hiện cộng, trừ (có nhớ) trong phạm vi 1 000' },
  { id: 't2m1c', subject: 'Toán', grade: 2, machId: 'm1', text: 'Thuộc và vận dụng bảng nhân, bảng chia 2, 3, 4, 5' },
  { id: 't2m1d', subject: 'Toán', grade: 2, machId: 'm1', text: 'Tìm số hạng, số bị trừ, số trừ, thừa số, số bị chia chưa biết trong bài tập đơn giản' },
  { id: 't2m2a', subject: 'Toán', grade: 2, machId: 'm2', text: 'Nhận biết ki-lô-gam, lít; thực hành cân, đong đơn giản' },
  { id: 't2m2b', subject: 'Toán', grade: 2, machId: 'm2', text: 'Nhận biết đề-xi-mét, mét, ki-lô-mét; tính độ dài đường gấp khúc' },
  { id: 't2m3a', subject: 'Toán', grade: 2, machId: 'm3', text: 'Đọc và nhận xét được bảng số liệu đơn giản; nhận biết khả năng xảy ra (chắc chắn, có thể, không thể)' },
  // ─── TOÁN LỚP 3 ───
  { id: 't3m1a', subject: 'Toán', grade: 3, machId: 'm1', text: 'Đọc, viết, so sánh các số trong phạm vi 100 000' },
  { id: 't3m1b', subject: 'Toán', grade: 3, machId: 'm1', text: 'Thực hiện cộng, trừ, nhân (số có đến 4 chữ số), chia (số có đến 3 chữ số cho số có một chữ số)' },
  { id: 't3m1c', subject: 'Toán', grade: 3, machId: 'm1', text: 'Tính giá trị biểu thức có đến hai dấu phép tính, tìm thành phần chưa biết' },
  { id: 't3m1d', subject: 'Toán', grade: 3, machId: 'm1', text: 'Giải bài toán có lời văn bằng hai bước tính' },
  { id: 't3m2a', subject: 'Toán', grade: 3, machId: 'm2', text: 'Nhận biết và tính được chu vi, diện tích hình chữ nhật, hình vuông' },
  { id: 't3m2b', subject: 'Toán', grade: 3, machId: 'm2', text: 'Nhận biết mi-li-mét, gam; đọc, viết số đo khối lượng, dung tích' },
  { id: 't3m3a', subject: 'Toán', grade: 3, machId: 'm3', text: 'Đọc, mô tả số liệu từ bảng, biểu đồ đơn giản; nhận biết khả năng xảy ra qua một số tình huống' },
  // ─── TOÁN LỚP 4 ───
  { id: 't4m1a', subject: 'Toán', grade: 4, machId: 'm1', text: 'Đọc, viết, so sánh số tự nhiên đến hàng triệu; nhận biết dãy số tự nhiên' },
  { id: 't4m1b', subject: 'Toán', grade: 4, machId: 'm1', text: 'Thực hiện cộng, trừ, nhân, chia số tự nhiên (nhân, chia với số có đến hai chữ số)' },
  { id: 't4m1c', subject: 'Toán', grade: 4, machId: 'm1', text: 'Vận dụng tính chất giao hoán, kết hợp, phân phối để tính hợp lý' },
  { id: 't4m1d', subject: 'Toán', grade: 4, machId: 'm1', text: 'Nhận biết phân số, so sánh hai phân số cùng mẫu hoặc khác mẫu; thực hiện cộng, trừ phân số cùng mẫu' },
  { id: 't4m2a', subject: 'Toán', grade: 4, machId: 'm2', text: 'Nhận biết góc nhọn, góc vuông, góc tù, góc bẹt; hai đường thẳng song song, vuông góc' },
  { id: 't4m2b', subject: 'Toán', grade: 4, machId: 'm2', text: 'Tính chu vi, diện tích hình bình hành, hình thoi; biết đơn vị đo diện tích mét vuông, đề-xi-mét vuông' },
  { id: 't4m3a', subject: 'Toán', grade: 4, machId: 'm3', text: 'Đọc, mô tả số liệu từ biểu đồ cột, biểu đồ tranh; tìm số trung bình cộng' },
  // ─── TOÁN LỚP 5 ───
  { id: 't5m1a', subject: 'Toán', grade: 5, machId: 'm1', text: 'Đọc, viết, so sánh số thập phân; chuyển đổi giữa phân số thập phân và số thập phân' },
  { id: 't5m1b', subject: 'Toán', grade: 5, machId: 'm1', text: 'Thực hiện các phép tính với số thập phân; ước lượng kết quả trong tình huống thực tế' },
  { id: 't5m1c', subject: 'Toán', grade: 5, machId: 'm1', text: 'Thực hiện phép cộng, trừ, nhân, chia phân số; giải bài toán có lời văn hợp các phép tính với phân số, số thập phân' },
  { id: 't5m1d', subject: 'Toán', grade: 5, machId: 'm1', text: 'Giải bài toán về quan hệ tỉ lệ, tỉ số phần trăm (tìm tỉ số phần trăm của hai số, tìm một số biết phần trăm)' },
  { id: 't5m2a', subject: 'Toán', grade: 5, machId: 'm2', text: 'Nhận biết hình hộp chữ nhật, hình lập phương, hình trụ, hình cầu; tính diện tích xung quanh, diện tích toàn phần, thể tích' },
  { id: 't5m2b', subject: 'Toán', grade: 5, machId: 'm2', text: 'Đổi đơn vị đo độ dài, khối lượng, diện tích, thể tích, thời gian trong các tình huống thực tế' },
  { id: 't5m3a', subject: 'Toán', grade: 5, machId: 'm3', text: 'Đọc, mô tả số liệu từ biểu đồ; tính tỉ số phần trăm; nhận biết một số mô hình xác suất đơn giản' },

  // ─── TIẾNG VIỆT LỚP 1 ───
  { id: 'v1d1', subject: 'Tiếng Việt', grade: 1, machId: 'v1', text: 'Nhận biết và đọc đúng âm, vần; đọc trơn từ ngữ, câu, đoạn ngắn (tốc độ hợp lý)' },
  { id: 'v1d2', subject: 'Tiếng Việt', grade: 1, machId: 'v1', text: 'Hiểu nghĩa từ ngữ trong bài đọc; trả lời được câu hỏi về nội dung đoạn văn ngắn' },
  { id: 'v1v1', subject: 'Tiếng Việt', grade: 1, machId: 'v2', text: 'Viết đúng chữ thường, chữ hoa; chép và viết chính tả từ ngữ, câu ngắn (tốc độ 30–35 chữ/15 phút)' },
  { id: 'v1v2', subject: 'Tiếng Việt', grade: 1, machId: 'v2', text: 'Viết được câu đơn giản, hoàn thiện câu theo gợi ý (tưởng tượng sáng tạo theo tranh)' },
  { id: 'v1n1', subject: 'Tiếng Việt', grade: 1, machId: 'v3', text: 'Nghe hiểu câu chuyện ngắn, bài thơ; kể lại được một đoạn theo tranh' },
  { id: 'v1n2', subject: 'Tiếng Việt', grade: 1, machId: 'v3', text: 'Nói rõ ràng, tự tin trong giao tiếp, chào hỏi, cảm ơn, xin lỗi trong tình huống quen thuộc' },
  { id: 'v1g1', subject: 'Tiếng Việt', grade: 1, machId: 'v4', text: 'Nhận biết âm, vần, tiếng, từ, câu; dấu thanh, chữ hoa/chữ thường' },
  // ─── TIẾNG VIỆT LỚP 2 ───
  { id: 'v2d1', subject: 'Tiếng Việt', grade: 2, machId: 'v1', text: 'Đọc rõ ràng, ngắt nghỉ hợp lý văn bản ngắn; tốc độ 40–60 chữ/phút' },
  { id: 'v2d2', subject: 'Tiếng Việt', grade: 2, machId: 'v1', text: 'Hiểu ý chính của đoạn, bài; trả lời câu hỏi; nhận biết nhân vật, sự việc, chi tiết quan trọng' },
  { id: 'v2v1', subject: 'Tiếng Việt', grade: 2, machId: 'v2', text: 'Viết chính tả đoạn văn ngắn theo tốc độ quy định; viết hoa đúng quy tắc, đúng dấu câu cơ bản' },
  { id: 'v2v2', subject: 'Tiếng Việt', grade: 2, machId: 'v2', text: 'Viết được đoạn văn kể/ tả ngắn về người, vật, sự việc quen thuộc; viết tin nhắn, thiệp mời' },
  { id: 'v2n1', subject: 'Tiếng Việt', grade: 2, machId: 'v3', text: 'Nghe – kể lại câu chuyện đã nghe, đã đọc; nói theo chủ điểm, nêu ý kiến cá nhân đơn giản' },
  { id: 'v2g1', subject: 'Tiếng Việt', grade: 2, machId: 'v4', text: 'Mở rộng vốn từ theo chủ đề; nhận biết từ chỉ sự vật, hoạt động, đặc điểm; câu và dấu chấm, dấu phẩy' },
  // ─── TIẾNG VIỆT LỚP 3 ───
  { id: 'v3d1', subject: 'Tiếng Việt', grade: 3, machId: 'v1', text: 'Đọc thành tiếng văn bản dài hơn, tốc độ 70–80 chữ/phút; đọc thầm nắm thông tin chính' },
  { id: 'v3d2', subject: 'Tiếng Việt', grade: 3, machId: 'v1', text: 'Tóm tắt ý chính từng đoạn; nêu được nội dung chính của bài; liên hệ với bản thân' },
  { id: 'v3v1', subject: 'Tiếng Việt', grade: 3, machId: 'v2', text: 'Viết đoạn văn 4–6 câu theo đúng mục đích (kể, tả, nêu ý kiến); dùng dấu câu đúng' },
  { id: 'v3v2', subject: 'Tiếng Việt', grade: 3, machId: 'v2', text: 'Viết được một số văn bản quen thuộc: thư, bưu thiếp, mục lục, thông báo ngắn' },
  { id: 'v3n1', subject: 'Tiếng Việt', grade: 3, machId: 'v3', text: 'Nói rõ ý kiến, trình bày một nội dung đơn giản trước tập thể; biết lắng nghe và phản hồi' },
  { id: 'v3g1', subject: 'Tiếng Việt', grade: 3, machId: 'v4', text: 'Mở rộng vốn từ theo chủ điểm; nhận biết từ chỉ hoạt động, đặc điểm; câu kể, câu hỏi, câu khiến' },
  // ─── TIẾNG VIỆT LỚP 4 ───
  { id: 'v4d1', subject: 'Tiếng Việt', grade: 4, machId: 'v1', text: 'Đọc trôi chảy, diễn cảm văn bản nghệ thuật, giọng phù hợp nội dung' },
  { id: 'v4d2', subject: 'Tiếng Việt', grade: 4, machId: 'v1', text: 'Xác định đề tài, chủ đề, mạch cảm xúc; nêu được ý nghĩa và bài học rút ra từ văn bản' },
  { id: 'v4v1', subject: 'Tiếng Việt', grade: 4, machId: 'v2', text: 'Viết bài văn kể chuyện, miêu tả có bố cục rõ ràng (mở bài, thân bài, kết bài)' },
  { id: 'v4v2', subject: 'Tiếng Việt', grade: 4, machId: 'v2', text: 'Viết đoạn văn nêu tình cảm, cảm xúc; tóm tắt văn bản; viết thư, đơn, báo cáo đơn giản' },
  { id: 'v4n1', subject: 'Tiếng Việt', grade: 4, machId: 'v3', text: 'Trình bày ý kiến cá nhân, tham gia thảo luận nhóm; nói có mục đích, có phản hồi phù hợp' },
  { id: 'v4g1', subject: 'Tiếng Việt', grade: 4, machId: 'v4', text: 'Mở rộng vốn từ theo chủ điểm; nhận biết danh từ, động từ, tính từ; câu chủ ngữ – vị ngữ' },
  // ─── TIẾNG VIỆT LỚP 5 ───
  { id: 'v5d1', subject: 'Tiếng Việt', grade: 5, machId: 'v1', text: 'Đọc lưu loát, diễn cảm; đọc thầm và nắm chắc nội dung, nghệ thuật của văn bản' },
  { id: 'v5d2', subject: 'Tiếng Việt', grade: 5, machId: 'v1', text: 'Nhận xét, đánh giá chi tiết, hình ảnh, nhân vật; hiểu nghĩa tường minh và hàm ẩn trong văn bản đơn giản' },
  { id: 'v5v1', subject: 'Tiếng Việt', grade: 5, machId: 'v2', text: 'Viết bài văn kể, tả, bày tỏ cảm xúc có cấu trúc chặt chẽ; viết đoạn văn lập luận ngắn' },
  { id: 'v5v2', subject: 'Tiếng Việt', grade: 5, machId: 'v2', text: 'Viết biên bản, đơn từ, báo cáo, thư theo yêu cầu; viết chương trình hoạt động đơn giản' },
  { id: 'v5n1', subject: 'Tiếng Việt', grade: 5, machId: 'v3', text: 'Trình bày, thuyết trình ngắn có dàn ý; tranh luận, bảo vệ ý kiến với lý lẽ và bằng chứng' },
  { id: 'v5g1', subject: 'Tiếng Việt', grade: 5, machId: 'v4', text: 'Nhận biết câu ghép, trạng ngữ, từ đồng nghĩa, trái nghĩa, từ đa nghĩa; liên kết câu trong đoạn văn' },
];

export function yccdFor(subject, grade) {
  return YCCD.filter(y => y.subject === subject && y.grade === grade);
}

export function machById(subject, id) {
  return machsForSubject(subject).find(m => m.id === id) || null;
}

export function yccdById(id) {
  return YCCD.find(y => y.id === id) || null;
}

// ── Khung hoạt động dạy học (mẫu) ─────────────────────────────────
export const ACTIVITY_FRAMES = {
  khoiDong: ['Trò chơi “Ai nhanh hơn”', 'Hát/nghe bài hát liên quan bài học', 'Quan sát tranh và nêu nhận xét', 'Kể lại việc làm ở nhà liên quan bài học', 'Ôn lại bài đã học qua câu hỏi nhanh'],
  khamPha: ['Làm việc nhóm đôi đọc – tìm hiểu nội dung', 'Quan sát mẫu vật/hình ảnh và rút ra kiến thức mới', 'Thảo luận nhóm 4 rồi đại diện trình bày', 'GV giảng giải kết hợp hỏi đáp gợi mở', 'Thực hành thí nghiệm/hoạt động trải nghiệm nhỏ'],
  luyenTap: ['Làm bài tập cá nhân vào vở', 'Trò chơi học tập “Tiếp sức”', 'Chơi đố bạn / đố vui', 'Luyện tập theo cặp đôi (đọc – viết, hỏi – đáp)', 'Phiếu bài tập trắc nghiệm nhanh'],
  vanDung: ['Liên hệ kiến thức với cuộc sống (kể ví dụ thực tế)', 'Vẽ sơ đồ tư duy tóm tắt bài', 'Sắm vai tình huống vận dụng', 'Giải bài toán/viết đoạn văn sáng tạo mở rộng', 'Đọc/giới thiệu một bài ngoài sách giáo khoa'],
  danDo: ['Chuẩn bị bài mới (đọc trước, sưu tầm tranh ảnh)', 'Hoàn thành bài tập về nhà trong sách', 'Trao đổi với người thân về nội dung bài học', 'Làm bài tập vận dụng trên phiếu', 'Kể cho người thân câu chuyện đã học'],
};