// ── AI soạn KHBD đầy đủ từ trang sách ───────────────────────────────────
// Luồng: BookReader (thông số đã chấp nhận: tên bài + từ trang tới trang +
// thời lượng + phương pháp + phân hóa) → snapshot trang (chữ + ảnh) →
// buildLessonPrompt → Gemini (JSON thuần) → aiJsonToPlan → lưu kho khbd_v2
// → mở trong module Giáo án ĐÃ ĐIỀN ĐẦY ĐỦ (không khung trống).
import { mkActivity, importLegacyPlan } from "./planModel";
import { normalizeBMinutes, splitMinutes } from "./planFromPages";

export const LESSON_METHODS = ["Trực quan", "Hỏi đáp", "Thảo luận nhóm", "Trải nghiệm"];

// Danh sách CHUẨN được phép dùng trong ô ppdh (phương pháp đánh giá) — lấy theo
// PPDH tiểu học GDPT 2018 và mẫu KHBD hiện hành. AI chỉ được chọn trong danh
// sách này, cấm đặt tên bịa.
export const DANH_GIA_ALLOWED = [
  "Quan sát", "Vấn đáp", "Nhận xét", "Chấm chéo", "Chữa bài", "Phát biểu",
  "Luyện viết", "Tự đánh giá", "Đánh giá sản phẩm", "Kiểm tra nhanh",
];

// Bỏ dấu + chuẩn hóa để so tên không phân biệt hoa/thường/dấu
const deAcc = (s) => String(s ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
  .replace(/\s+/g, " ").trim().toLowerCase();

// Ép ppdh về đúng DANH_GIA_ALLOWED — prompt đã cấm bịa nhưng AI vẫn có thể
// trả tên lạ; đây là TẦNG CHẶN CODE: giữ tên chuẩn (kể cả dạng "Nhận xét học
// sinh" → "Nhận xét"), bỏ tên bịa, không trùng. Không còn tên hợp lệ → để
// trống thay vì giữ tên bịa.
export function sanitizePpdh(raw) {
  const text = Array.isArray(raw) ? raw.filter((x) => typeof x === "string").join("; ")
    : (typeof raw === "string" ? raw : "");
  if (!text.trim()) return "";
  const allowed = DANH_GIA_ALLOWED.map((n) => ({ n, k: deAcc(n) }));
  const seen = new Set();
  const out = [];
  for (const tok of text.split(/[;,/\n|]+/).map((t) => t.trim()).filter(Boolean)) {
    const k = deAcc(tok);
    if (!k) continue;
    const hit = allowed.find((a) => a.k === k) || allowed.find((a) => k.includes(a.k));
    if (hit && !seen.has(hit.n)) { seen.add(hit.n); out.push(hit.n); }
  }
  return out.join("; ");
}

const METHOD_NOTE = {
  "Trực quan": "Ưu tiên ĐDDH trực quan (tranh, mô hình, que tính)",
  "Hỏi đáp": "Ưu tiên vấn đáp gợi mở",
  "Thảo luận nhóm": "Ưu tiên HĐ nhóm 4, phân vai, báo cáo",
  "Trải nghiệm": "Ưu tiên HĐ trải nghiệm, liên hệ thực tế",
};

export const AI_SYSTEM =
  "Bạn là chuyên gia soạn KẾ HOẠCH BÀI DẠY (KHBD) tiểu học theo mẫu Kế hoạch bài dạy của Trường Tiểu học Thực hành Đại học Sài Gòn, bám sát Chương trình GDPT 2018 và SÁCH GIÁO KHOA được đính kèm. " +
  "NGUYÊN TẮC BẤT DI BẤT DỊCH: (1) Chỉ mô tả những nội dung CÓ THẬT trong các trang SGK/ảnh SGV đính kèm — không bịa kiến thức, khái niệm, ví dụ, số liệu, tên trò chơi, bài tập hay trang sách không tồn tại. " +
  "(2) Tên phương pháp dạy học và kỹ thuật đánh giá phải nằm trong danh sách chuẩn được cấp trong prompt — tuyệt đối không dùng tên phương pháp tự chế, phương pháp không liên quan tới mục tiêu bài dạy. " +
  "(3) Thiếu dữ liệu cho mục nào thì viết ngắn gọn bám đúng bài học, không suy đoán, không copy mẫu giáo án chung chung.";

// Dựng prompt chi tiết từ thông số đã chấp nhận (thuần text, test được).
// guideImageCount: số ảnh tham khảo SGV đính kèm (0 = không có) — prompt dặn
// AI đọc và hòa trộn gợi ý SGV với nội dung SGK, thống nhất toàn app.
// custom: yêu cầu riêng do giáo viên gõ tự do (ô "Yêu cầu thêm cho AI") —
// được làm sạch, cắt tối đa 1500 ký tự rồi dặn AI ưu tiên thực hiện.
export function buildLessonPrompt({ title, lesson, from, to, duration, method, includeDiff, guideImageCount = 0, custom = "" }) {
  const dur = parseInt(duration, 10) || 35;
  const rangeLabel = to && to !== from ? `các trang ${from}–${to}` : `trang ${from}`;
  const m = LESSON_METHODS.includes(method) ? method : "Hỏi đáp";
  const methodNote = METHOD_NOTE[m];
  const guideN = Math.max(0, parseInt(guideImageCount, 10) || 0);
  const guideLine = guideN > 0
    ? `- Ảnh tham khảo SGV: có ${guideN} ảnh từ Sách giáo viên/tài liệu HDH đính kèm sau nội dung SGK. Hãy đọc kỹ (OCR) từng ảnh, lấy gợi ý về mục tiêu, cách tổ chức, câu hỏi gợi mở và phân hóa, rồi hòa trộn với nội dung SGK để soạn giáo án hoàn chỉnh (mâu thuẫn thì ưu tiên SGK).\n`
    : "";
  const customClean = String(custom || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  const customLine = customClean
    ? `- Yêu cầu riêng của giáo viên (ƯU TIÊN CAO NHẤT, phải thể hiện rõ trong giáo án): "${customClean}". Nếu yêu cầu mâu thuẫn cấu trúc chuẩn thì vẫn giữ đủ 6 hoạt động A/B/B/B/C/D và lồng yêu cầu vào nội dung phù hợp.\n`
    : "";
  const dgList = DANH_GIA_ALLOWED.join(", ");
  const guard =
    `- NGUYÊN TẮC BẮT BUỘC (chống bịa):\n` +
    `  + Chỉ viết nội dung xuất hiện trong các trang SGK được đính kèm (chữ và hình). Không bịa kiến thức, ví dụ, số liệu, tên trò chơi, bài tập, trang sách không có thật. Nếu trang sách không nêu rõ điều gì thì chỉ mô tả thao tác dạy học hợp lý với nội dung đã thấy, không suy đoán quá mức.\n` +
    `  + ppdh: CHỈ dùng tên trong danh sách sau — ${dgList}. CẤM đặt tên kỹ thuật đánh giá bịa ra.\n` +
    `  + mucTieu của mỗi hoạt động phải gắn với một yêu cầu cần đạt cụ thể của bài học, không viết mục tiêu chung chung như "giúp HS hứng thú" cho khu B/C.\n` +
    `  + ddGV/ddHS: chỉ liệt kê thiết bị thật sự dùng được (SGK, vở, bảng, tranh, mô hình, que tính, thẻ số, phiếu học tập, máy chiếu...), không liệt kê thiết bị không có thật.\n` +
    `  + Tên hoạt động (ten) phải bám đúng bài học cụ thể, không dùng tên chung chung như "Hoạt động 1".\n`;
  return (
    `Hãy soạn KẾ HOẠCH BÀI DẠY đầy đủ, chi tiết cho bài học ở ${rangeLabel}` +
    `${lesson ? ` (tên bài: "${lesson}")` : ""} (tên KHBD: "${title || lesson || "Bài học"}"). Yêu cầu cấu trúc:\n` +
    `- I. YÊU CẦU CẦN ĐẠT: nlDacThu (3 ý năng lực đặc thù, bám nội dung các trang trên), nlChung (3 ý năng lực chung), phamChat (3 ý phẩm chất), lienHeTichHop (liên hệ/tích hợp nếu có).\n` +
    `- II. THIẾT BỊ DẠY HỌC: ddGV (danh sách thiết bị giáo viên), ddHS (danh sách thiết bị học sinh).\n` +
    `- III. HOẠT ĐỘNG DẠY HỌC (hoatDong): đúng 6 hoạt động theo đúng thứ tự — 1 hoạt động "A" (Khởi động), 3 hoạt động "B" (Khám phá và Luyện tập, phù hợp nội dung bài), 1 hoạt động "C" (Vận dụng), 1 hoạt động "D" (Nối tiếp). ` +
    `Tổng thời lượng khoảng ${dur} phút (chia: Khởi động 5', Khám phá/Luyện tập 22', Vận dụng 5', Nối tiếp 3' nếu 35'; tỉ lệ tương tự nếu khác). ` +
    `Mỗi hoạt động gồm: section (BẮT BUỘC, đúng 1 ký tự: "A" cho Khởi động, "B" cho Khám phá/Luyện tập, "C" cho Vận dụng, "D" cho Nối tiếp), ten (tên), phut (số phút), mucTieu (mục tiêu), ppdh (phương pháp đánh giá — CHỈ chọn tên trong danh sách chuẩn), dddh (thiết bị/đồ dùng dạy học), ` +
    `cachTienHanh (cách tiến hành chi tiết từng bước, KHAI THÁC ĐÚNG nội dung chữ và hình trong các trang trên, không thêm hoạt động/bài tập không có trong sách), ` +
    `ketLuan (kết luận, bắt đầu bằng "⇨ Giáo viên rút ra kết luận:"), hs (hoạt động của học sinh). ` +
    `Phương pháp chủ đạo: ${m} (${methodNote}).\n` +
    guard +
    `- IV. ĐIỀU CHỈNH (dieuChinh), V. PHỤ LỤC (phuLuc).\n` +
    `- Thông tin đầu trang: title ("${title || lesson || ""}"), monHoc, lop, tuan, soTiet, namHoc, hoVaTen, mssvTT, lopDay, thoiGian ("${dur} phút").\n` +
    guideLine +
    customLine +
    (includeDiff
      ? `- Phân hóa: differentiation {support, advanced} — bắt buộc có phân hóa cho HS yếu/giỏi, mỗi mục 2 ý cụ thể bám nội dung bài.\n`
      : `- Không cần phân hóa riêng.\n`) +
    "Trả về CHỈ MỘT đối tượng JSON hợp lệ với đúng các khóa: title, monHoc, lop, tuan, soTiet, namHoc, hoVaTen, mssvTT, lopDay, thoiGian, nlDacThu, nlChung, phamChat, lienHeTichHop, ddGV, ddHS, differentiation, hoatDong, dieuChinh, phuLuc. " +
    "Mỗi phần tử trong hoatDong BẮT BUỘC có khóa \"section\" với đúng 1 ký tự \"A\"/\"B\"/\"C\"/\"D\". Không markdown, không giải thích, không dùng backtick. " +
    "Trong mọi chuỗi JSON: escape dấu ngoặc kép thành \\\", xuống dòng thành \\n, tuyệt đối không để ký tự xuống dòng thô hay dấu phẩy thừa ở cuối mảng/đối tượng."
  );
}

// Bóc đối tượng JSON từ câu trả lời AI (chịu được text thừa quanh JSON).
// Tự sửa 3 lỗi AI hay mắc: bọc markdown fence, dấu phẩy thừa cuối mảng/đối
// tượng, và output bị cắt cụt giữa chừng (tự đóng chuỗi/ngoặc còn dở).
function stripFences(s) {
  return String(s || "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
}
function fixTrailingCommas(s) {
  return String(s || "").replace(/,(\s*[}\]])/g, "$1");
}
function autoClose(s) {
  let out = String(s || "");
  let inStr = false;
  let esc = false;
  const stack = [];
  for (const ch of out) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if ((ch === "}" || ch === "]") && stack[stack.length - 1] === ch) {
      stack.pop();
    }
  }
  if (inStr) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}
export function extractPlanJson(raw) {
  const s0 = stripFences(String(raw || ""));
  const start = s0.indexOf("{");
  const end = s0.lastIndexOf("}");
  const core = start >= 0 && end > start ? s0.slice(start, end + 1) : s0;
  const attempts = [core, fixTrailingCommas(core), autoClose(fixTrailingCommas(core))];
  let lastErr = null;
  for (const cand of attempts) {
    try {
      const obj = JSON.parse(cand);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
      throw new Error("dữ liệu không phải đối tượng");
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("AI trả về JSON lỗi: " + (lastErr?.message || "dữ liệu không hợp lệ"));
}

function blankActivity(section, ten, phut) {
  const a = mkActivity(section);
  a.ten = ten;
  a.phut = String(phut);
  return a;
}

// Chuẩn hóa output AI thành plan shape mới đầy đủ, KHÔNG BAO GIỜ trống:
// - YCCD/đồ dùng/HĐ thiếu → bù khung trống để form và Word không vỡ;
// - phút khu B chuẩn hóa về đúng tổng thời lượng.
export function aiJsonToPlan(obj, meta = {}) {
  const src = obj && typeof obj === "object" ? obj : {};
  const p = importLegacyPlan(src);
  const dur = parseInt(meta.duration, 10) || 35;
  const lesson = String(meta.lesson || src.lesson || p.title || "").trim();

  p.title = String(meta.title || src.title || src.tenBai || lesson || p.title || "Bài học mới").trim();
  if (meta.subject !== undefined) p.monHoc = String(meta.subject || src.monHoc || src.subject || p.monHoc || "");
  if (meta.grade !== undefined) p.lop = String(meta.grade || src.lop || src.grade || p.lop || "");
  p.thoiGian = `${dur} phút`;

  const pageStart = Number(meta.pageStart) || null;
  const pageEnd = Number(meta.pageEnd) || pageStart;
  p.bookReferences = [
    {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bookId: meta.bookId || "",
      bookTitle: meta.bookTitle || "",
      bookSeries: meta.bookSeries || "",
      subject: meta.subject || "",
      grade: String(meta.grade || ""),
      lesson: lesson || p.title,
      chapter: "",
      pageStart,
      pageEnd,
      activityId: null,
      purpose: "content",
    },
  ];
  p.metadata = {
    ...(p.metadata || {}),
    textbook: meta.bookTitle || "",
    textbookSeries: meta.bookSeries || "",
    lesson,
    bookId: meta.bookId || "",
  };

  // Bù khu còn thiếu để không bao giờ trống KHBD
  const mins = splitMinutes(dur);
  const bySec = { A: [], B: [], C: [], D: [] };
  for (const a of p.hoatDong || []) {
    const s = String(a.section || "B").toUpperCase();
    if (bySec[s]) bySec[s].push({ ...a, section: s });
  }
  if (!bySec.A.length) bySec.A.push(blankActivity("A", "Khởi động", mins.A));
  if (!bySec.B.length)
    bySec.B.push(
      blankActivity("B", "Khám phá 1", mins.B1),
      blankActivity("B", "Luyện tập 2", mins.B2),
      blankActivity("B", "Luyện tập 3", mins.B3),
    );
  if (!bySec.C.length) bySec.C.push(blankActivity("C", "Vận dụng", mins.C));
  if (!bySec.D.length) bySec.D.push(blankActivity("D", "Nối tiếp", mins.D));
  // Chuẩn hóa phút khu B về đúng tổng (AI hay chia lệch)
  const numMin = (v, fb) => (Number(v) > 0 ? Math.round(Number(v)) : fb);
  const aMin = numMin(bySec.A[0]?.phut, mins.A);
  const cMin = numMin(bySec.C[0]?.phut, mins.C);
  const dMin = numMin(bySec.D[0]?.phut, mins.D);
  bySec.A[0].phut = String(aMin);
  bySec.C[0].phut = String(cMin);
  bySec.D[0].phut = String(dMin);
  const rest = Math.max(bySec.B.length, dur - aMin - cMin - dMin);
  const bMinutes = normalizeBMinutes(bySec.B, rest);
  bySec.B.forEach((a, i) => { a.phut = String(bMinutes[i]); });
  p.hoatDong = [...bySec.A, ...bySec.B, ...bySec.C, ...bySec.D];
  // Chặn ppdh bịa ở code: lọc whitelist kể cả khi AI vi phạm prompt
  for (const a of p.hoatDong) a.ppdh = sanitizePpdh(a.ppdh);
  return p;
}
