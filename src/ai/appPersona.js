// ── Central Persona Configuration for SGK App ─────────────────────────
// This file defines the unified persona and copy guidelines for the entire application.
// The app is designed for TEACHERS (giáo viên) to research SGK and prepare teaching materials.

export const APP_DEVELOPER = "Nguyễn Tuấn";
export const APP_COPYRIGHT = `© 2026 ${APP_DEVELOPER}. Bản quyền thuộc về tác giả.`;

export const APP_PERSONA = {
  // User role: who is using the app
  role: "teacher",

  // User label: how to refer to the user in UI
  label: "Giáo viên",

  // Address term: how to address the user (polite, professional)
  address: "Thầy/cô",

  // Audience: who the teacher is teaching
  audience: "Học sinh",

  // Audience address: how to refer to students in teacher-facing content
  audienceAddress: "học sinh",
};

// ── AI System Prompt for Teacher Context ─────────────────────────────
export const TEACHER_SYSTEM_PROMPT = `
Người dùng đang sử dụng ứng dụng là GIÁO VIÊN.

Bạn là trợ lý AI chuyên hỗ trợ giáo viên nghiên cứu Sách giáo khoa (SGK),
phân tích nội dung, chuẩn bị dạy học và thiết kế hoạt động giảng dạy theo
Chương trình GDPT 2018. Bạn ĐỒNG THỜI là hướng dẫn viên sử dụng app
"Hành trang Tiểu học / SGK App" — bạn biết mọi màn hình, mọi phím tắt,
mọi luồng thao tác và có thể cầm tay chỉ việc từng bước.

QUAN TRỌNG:
- Không coi người dùng là học sinh.
- Khi đề cập đến học sinh, hãy coi học sinh là đối tượng được giáo viên giảng dạy.
- Luôn trả lời theo góc nhìn: GIÁO VIÊN → HỌC SINH.
- Khi người dùng hỏi "làm thế nào / ở đâu / cách mở / hướng dẫn dùng app",
  hãy trả lời theo các bước ĐÁNH SỐ cụ thể, nêu đúng tên nút / phím tắt
  (ví dụ: Sidebar → Thư viện sách → nút "Đọc"; Ctrl+K tìm kiếm toàn cục;
  Alt+K bảng lệnh khi đọc; Ctrl+D đánh dấu; ✂ Quét vùng; g Từ điển).

Cấu trúc câu trả lời (khi phù hợp với yêu cầu):
1. Phân tích cho giáo viên
2. Kiến thức trọng tâm
3. Yêu cầu cần đạt (học sinh cần đạt được gì)
4. Điểm giáo viên cần lưu ý (khái niệm dễ nhầm, lỗi thường gặp)
5. Gợi ý tổ chức dạy học
6. Hoạt động dành cho học sinh
7. Câu hỏi gợi mở (giáo viên có thể sử dụng)
8. Đánh giá (cách kiểm tra mức độ đạt yêu cầu)
9. Gợi ý mở rộng

HƯỚNG DẪN ĐIỀU HƯỚNG TRONG APP:
- Khi gợi ý mở một màn hình, hãy kết thúc câu trả lời bằng 1 dòng action tag
  theo đúng cú pháp: [MỞ: viewId] hoặc nhiều tag cách nhau, ví dụ:
  [MỞ: library] [MỞ: lessonplans] [MỞ: questionbank]
- viewId hợp lệ: dashboard, library, vocab, lessonplans, activities,
  worksheets, questionbank, search, compare, matrix, tasks, ideas,
  internship, whiteboard, collections, references,
  webtools, datatools, help.
  (Muốn tra thuật ngữ hoặc ghi khái niệm: dùng [MỞ: vocab] — tab “Bảng”/“Tra cứu”.)
- Chỉ dùng tag khi thực sự cần điều hướng. Không bịa viewId ngoài danh sách.
- Nếu không có trích đoạn sách liên quan, hãy nói rõ và hướng dẫn lập chỉ mục /
  mở đúng sách, không tự bịa nội dung.

Ngôn ngữ: Tiếng Việt, chuyên nghiệp, súc tích, có cấu trúc rõ ràng.
Dùng Markdown gọn (tiêu đề ##, danh sách -, in đậm **) để dễ đọc trong khung chat.
`;

// ── Helper Functions for Consistent Copy ───────────────────────────────
export function teacherCopy(key, fallback = "") {
  const copies = {
    // Common UI elements
    "user.select_book": "Thầy/cô hãy chọn một cuốn sách để bắt đầu phân tích.",
    "user.select_page": "Chọn trang để phân tích.",
    "user.ask_ai":
      "Hỏi: soạn giáo án, tạo câu hỏi, gợi ý hoạt động, ma trận đề…",
    "user.welcome":
      "Xin chào! Tôi là trợ lý AI hỗ trợ giáo viên nghiên cứu SGK và chuẩn bị bài dạy.",

    // BookReader context
    "reader.purpose": "Công cụ đọc và nghiên cứu SGK dành cho giáo viên.",
    "reader.ocr_hint":
      "Phân tích nội dung trang này để giáo viên chuẩn bị bài.",
    "reader.chat_welcome": `Chào ${APP_PERSONA.address}! 🌟 Tôi sẵn sàng hỗ trợ ${APP_PERSONA.address} nghiên cứu cuốn sách này rồi đây! ${APP_PERSONA.address} muốn phân tích nội dung gì không?`,

    // Tools context
    "lesson_plan.purpose": "Công cụ soạn/phân tích/quản lý kế hoạch bài dạy.",
    "question_bank.purpose":
      "Ngân hàng câu hỏi dành cho giáo viên tạo đề kiểm tra.",
    "worksheet.purpose":
      "Công cụ tạo phiếu học tập để giáo viên giao cho học sinh.",
    "notes.purpose": "Ghi chú nghiên cứu/dạy học của giáo viên.",

    // AI actions
    "ai.analyze_page": "Phân tích nội dung trang này",
    "ai.summarize": "Tóm tắt nội dung để giáo viên chuẩn bị bài",
    "ai.key_points": "Xác định kiến thức trọng tâm",
    "ai.requirements": "Phân tích yêu cầu cần đạt",
    "ai.suggest_questions": "Đề xuất câu hỏi gợi mở",
    "ai.design_activity": "Đề xuất hoạt động giáo viên tổ chức cho học sinh",
  };

  return copies[key] || fallback;
}

// ── Context Object for AI API Calls ───────────────────────────────────
export function buildAIContext(book, lesson, page, content) {
  return {
    userRole: APP_PERSONA.role,
    audience: APP_PERSONA.audience,
    taskType: "teaching_preparation",
    book: book?.title || "",
    lesson: lesson || "",
    page: page || "",
    content: content || "",
  };
}

// ── App views map — dùng chung cho Trợ lý AI (action tags + hướng dẫn) ──
export const APP_VIEWS = [
  { id: "dashboard", label: "Tổng quan", icon: "📊", desc: "KPI, đang đọc, quick actions" },
  { id: "library", label: "Thư viện sách", icon: "📚", desc: "Tìm, lọc, thêm sách, đọc 2 trang" },
  { id: "vocab", label: "Sổ tay từ vựng", icon: "📝", desc: "AI giải nghĩa, tạo câu hỏi, xuất Word" },
  { id: "lessonplans", label: "Giáo án", icon: "📄", desc: "Mẫu KTSP, xuất .docx giữ định dạng" },
  { id: "activities", label: "Hoạt động mẫu", icon: "🧩", desc: "Kho hoạt động, nhập từ ảnh" },
  { id: "worksheets", label: "Phiếu học tập", icon: "📋", desc: "Tạo phiếu từ giáo án / câu hỏi" },
  { id: "questionbank", label: "Ngân hàng câu hỏi", icon: "🗂️", desc: "Tạo đề ngẫu nhiên theo mức độ" },
  { id: "search", label: "Tìm kiếm", icon: "🔍", desc: "Tìm toàn văn + Ctrl+K toàn cục" },
  { id: "compare", label: "So sánh sách", icon: "📖", desc: "Xem 2 sách kề nhau" },
  { id: "matrix", label: "Ma trận YCCĐ", icon: "🏷️", desc: "Gắn thẻ CTGDPT, xuất Word" },
  { id: "tasks", label: "Nhiệm vụ", icon: "✅", desc: "Todo + XP, streak, tập trung" },
  { id: "ideas", label: "Ý tưởng", icon: "💡", desc: "Lưu trò chơi / hoạt động dạy học" },
  { id: "whiteboard", label: "Bảng trắng", icon: "🎨", desc: "Vẽ, sticky, sơ đồ AI" },
  { id: "collections", label: "Bộ sưu tập", icon: "🗃️", desc: "Trích đoạn hay" },
  { id: "references", label: "Tài liệu tham khảo", icon: "📑", desc: "Nguồn tham khảo" },
  { id: "glossary", label: "Từ điển", icon: "🎓", desc: "Tra thuật ngữ khi đọc (phím g)" },
  { id: "internship", label: "Thực tập", icon: "🏫", desc: "Nhật ký + phản ánh sau giờ dạy" },
  { id: "webtools", label: "Kho công cụ Web", icon: "🧰", desc: "Lưu link hay như desktop" },
  { id: "datatools", label: "Sao lưu & Khôi phục", icon: "💾", desc: "Xuất JSON, thùng rác" },
  { id: "help", label: "Trợ giúp", icon: "❓", desc: "Cầm tay chỉ việc từng module" },
];

export function getViewLabel(viewId) {
  const v = APP_VIEWS.find((x) => x.id === viewId);
  return v ? `${v.icon} ${v.label}` : viewId;
}
