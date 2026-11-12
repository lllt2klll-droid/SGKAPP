export function normVi(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function mapDefaultTypeToFilter(type) {
  if (type === "toc") return "toc";
  if (type === "notes") return "note";
  return "all";
}

export function buildQuickCommands(onNavigateRef, disabledViews) {
  const go = (view, options) => () => onNavigateRef.current(view, options);
  const commands = [
    { id: "cmd-dashboard", view: "dashboard", title: "Đi tới: Tổng quan", subtitle: "Mở trang tổng quan", keywords: "tong quan dashboard home", action: go("dashboard") },
    { id: "cmd-library", view: "library", title: "Đi tới: Thư viện sách", subtitle: "Mở thư viện", keywords: "thu vien library sach", action: go("library") },
    { id: "cmd-search", view: "search", title: "Đi tới: Tìm kiếm nâng cao", subtitle: "Mở trang Tìm kiếm", keywords: "tim kiem search nang cao", action: go("search") },
    { id: "cmd-lessonplans", view: "lessonplans", title: "Đi tới: Giáo án", subtitle: "Mở danh sách giáo án", keywords: "giao an khbd lessonplan", action: go("lessonplans") },
    { id: "cmd-activities", view: "activities", title: "Đi tới: Hoạt động", subtitle: "Mở hoạt động học tập", keywords: "hoat dong activity", action: go("activities") },
    { id: "cmd-worksheets", view: "worksheets", title: "Đi tới: Phiếu học tập", subtitle: "Mở phiếu", keywords: "phieu worksheet", action: go("worksheets") },
    { id: "cmd-questionbank", view: "questionbank", title: "Đi tới: Ngân hàng câu hỏi", subtitle: "Mở ngân hàng câu hỏi", keywords: "cau hoi question ngan hang", action: go("questionbank") },
    { id: "cmd-vocab", view: "vocab", title: "Đi tới: Từ vựng", subtitle: "Mở sổ tay từ vựng", keywords: "tu vung vocab", action: go("vocab") },
    { id: "cmd-tasks", view: "tasks", title: "Đi tới: Nhiệm vụ", subtitle: "Mở hub nhiệm vụ", keywords: "nhiem vu task mission", action: go("tasks") },
    { id: "cmd-ideas", view: "ideas", title: "Đi tới: Ý tưởng", subtitle: "Mở ý tưởng dạy học", keywords: "y tuong idea", action: go("ideas") },
    { id: "cmd-references", view: "references", title: "Đi tới: Tài liệu tham khảo", subtitle: "Mở tham khảo", keywords: "tham khao reference tai lieu", action: go("references") },
    { id: "cmd-collections", view: "collections", title: "Đi tới: Bộ sưu tập", subtitle: "Mở bộ sưu tập", keywords: "bo suu tap collection", action: go("collections") },
    { id: "cmd-whiteboard", view: "whiteboard", title: "Đi tới: Bảng trắng", subtitle: "Mở bảng trắng", keywords: "bang trang whiteboard", action: go("whiteboard") },
    { id: "cmd-new-idea", view: "ideas", title: "Tạo mới: Ý tưởng", subtitle: "Mở Ý tưởng để thêm", keywords: "tao moi new idea", action: go("ideas") },
    { id: "cmd-new-task", view: "tasks", title: "Tạo mới: Nhiệm vụ", subtitle: "Mở Nhiệm vụ để thêm việc", keywords: "tao moi new task viec", action: go("tasks", { tab: "tasks" }) },
    { id: "cmd-new-plan", view: "lessonplans", title: "Tạo mới: Giáo án", subtitle: "Mở Giáo án để soạn", keywords: "tao moi new giao an khbd", action: go("lessonplans") },
  ];
  return disabledViews && disabledViews.size
    ? commands.filter((command) => !disabledViews.has(command.view))
    : commands;
}
