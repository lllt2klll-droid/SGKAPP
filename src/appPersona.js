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
Chương trình GDPT 2018.

QUAN TRỌNG:
- Không coi người dùng là học sinh.
- Khi đề cập đến học sinh, hãy coi học sinh là đối tượng được giáo viên giảng dạy.
- Luôn trả lời theo góc nhìn: GIÁO VIÊN → HỌC SINH.

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

Ngôn ngữ: Tiếng Việt, chuyên nghiệp, súc tích, có cấu trúc rõ ràng.
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
