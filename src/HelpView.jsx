import React, { useState, useMemo, useEffect } from "react";
import { safeGetJSON, safeSetJSON } from "./safeStorage";
import {
  BookOpen,
  Sparkles,
  Search,
  GraduationCap,
  Settings,
  Monitor,
  Columns2,
  FileText,
  Library,
  Lightbulb,
  ClipboardCheck,
  BarChart3,
  Clock,
  Bookmark,
  NotebookPen,
  Tags,
  ClipboardList,
  TrendingUp,
  Globe,
  AppWindow,
  DatabaseBackup,
  RefreshCw,
  School,
  Puzzle,
  ListChecks,
  Database,
  FileSearch,
  Scissors,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Check,
  Play,
  ArrowRight,
  X,
  Star,
  Eye,
  Layers,
  Wand2,
  MessageCircle,
  Upload,
  Keyboard,
  ExternalLink,
  CheckCheck,
  Palette,
} from "lucide-react";

const LS_PROGRESS = "sgk_help_progress";

function useHelpProgress() {
  const [progress, setProgress] = useState(() => {
    try {
      return safeGetJSON(LS_PROGRESS, {}, (v) => v && typeof v === "object" && !Array.isArray(v));
    } catch (e) {
      console.warn("[HelpView] safeGetJSON failed for LS_PROGRESS", e);
      return {};
    }
  });
  useEffect(() => {
    try {
      const res = safeSetJSON(LS_PROGRESS, progress);
      if (!res.ok) {
        if (res.quota) console.warn("[safeStorage] Quota exceeded on LS_PROGRESS", res);
        else console.warn("[HelpView] safeSetJSON failed for LS_PROGRESS", res);
      }
    } catch (e) {
      console.warn("[HelpView] save progress failed", e);
    }
  }, [progress]);
  const toggle = (id) => setProgress((p) => ({ ...p, [id]: !p[id] }));
  const reset = () => setProgress({});
  return { progress, toggle, reset, setProgress };
}

// Nhóm module: groupId là key ổn định cho lọc/logic (không dấu, không đổi khi đổi tên hiển thị),
// group là label tiếng Việt cho UI. Badge + tìm kiếm dùng groupId trước, rớt về group để tương thích.
const HELP_GROUPS = {
  "bat-dau": "Bắt đầu",
  "workspace": "Không gian làm việc",
  "workspace-library": "Không gian làm việc · Thư viện SGK",
  "workspace-soan-day": "Không gian làm việc · Soạn dạy",
  "workspace-ngan-hang": "Không gian làm việc · Ngân hàng",
  "workspace-nghien-cuu": "Không gian làm việc · Nghiên cứu",
  "workspace-nang-cao": "Không gian làm việc · Công cụ nâng cao",
  "cong-viec": "Công việc",
  "kho-cong-cu": "Kho công cụ",
  "tien-ich": "Tiện ích",
};
const helpGroupLabel = (mod) => HELP_GROUPS[mod.groupId] || mod.group || "";

// Dữ liệu hướng dẫn — khớp 100% NAV_SECTIONS + FOOTER_NAV hiện tại (đã xóa Đồng bộ, thêm Sao lưu)
const MODULES = [
  {
    id: "start",
    groupId: "bat-dau",
    group: "Bắt đầu",
    title: "Bắt đầu 60 giây — Dành cho người mới hoàn toàn",
    icon: <Wand2 size={18} />,
    color: "#2563eb",
    badge: "Bắt buộc",
    summary: "3 bước để đọc sách đầu tiên, không cần biết gì về công nghệ.",
    steps: [
      { id: "s1", t: "Mở Thư viện sách", d: "Bấm “Thư viện sách” ở sidebar trái. Bạn sẽ thấy các bìa sách theo Lớp / Môn." },
      { id: "s2", t: "Bấm “Đọc” trên 1 cuốn", d: "Sách mở dạng 2 trang như sách thật. Dùng ← → hoặc lăn chuột để lật trang." },
      { id: "s3", t: "Thử hỏi AI 1 câu", d: "Bấm bong bóng đỏ góc phải → gõ “Tóm tắt trang này” → AI trả lời ngay." },
    ],
    tip: "Chưa có sách? Bấm “Thêm sách” trên header để kéo thả file PDF/DOCX/Ảnh vào.",
    cta: { label: "Mở Thư viện ngay", view: "library" },
  },
  {
    id: "dashboard",
    groupId: "workspace",
    group: "Không gian làm việc",
    title: "Tổng quan — Bảng điều khiển",
    icon: <BarChart3 size={18} />,
    color: "#0f172a",
    summary: "Nhìn nhanh tiến độ, sách mới, nhiệm vụ và lối tắt tới mọi tính năng.",
    steps: [
      { id: "db1", t: "Xem số liệu", d: "Thẻ Tổng quan hiện số sách, % đã đọc, bookmark, từ vựng — đồng bộ với Thư viện." },
      { id: "db2", t: "Tiếp tục đọc", d: "Dải “Tiếp tục đọc” cho phép quay lại đúng trang đã dừng, không cần nhớ." },
      { id: "db3", t: "Lối tắt", d: "Các nút nhanh dẫn tới Giáo án, Phiếu, Ngân hàng câu hỏi, Tìm kiếm…" },
    ],
    cta: { label: "Mở Tổng quan", view: "dashboard" },
  },
  {
    id: "library",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Thư viện sách & Thêm sách",
    icon: <Library size={18} />,
    color: "#0ea5e9",
    summary: "Tìm, lọc, yêu thích, đổi tên, xóa và thêm sách mới (PDF, DOCX, EPUB, ảnh…).",
    steps: [
      { id: "lib1", t: "Tìm & lọc", d: "Ô tìm kiếm → gõ tên sách. Dùng chip Lớp / Môn / Tập, hoặc “Yêu thích”. Bấm “Xóa lọc” để trở lại." },
      { id: "lib2", t: "Yêu thích & tiến độ", d: "Bấm ⭐ trên bìa để ghim. Vòng % trên bìa = % đã đọc (tự lưu khi bạn lật trang)." },
      { id: "lib3", t: "Thêm sách mới", d: "Header → “Thêm sách” (kéo thả) hoặc “🔗” thêm từ link, “📝” tạo từ văn bản. Hỗ trợ 50MB/file, validate URL http(s) chặt." },
      { id: "lib4", t: "Đổi tên / Xóa", d: "Hover bìa → bấm ✏️ đổi tên, 🗑️ xóa (có xác nhận, xóa luôn file trên server)." },
    ],
    tip: "Mẹo người mới: Gõ “Toán 2” hoặc “Tiếng Việt 1” vào ô tìm kiếm — lọc tức thì.",
    cta: { label: "Đến Thư viện", view: "library" },
  },
  {
    id: "reader",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Đọc 2 trang, ghi nhớ & đánh dấu",
    icon: <BookOpen size={18} />,
    color: "#1d4ed8",
    summary: "Trải nghiệm đọc như sách giấy: 2 trang kề nhau, mục lục, phóng to, ghi nhớ trang cuối.",
    steps: [
      { id: "r1", t: "Lật trang", d: "← → trên bàn phím, hoặc nút < > ở toolbar. Lăn chuột cũng được." },
      { id: "r2", t: "Mục lục thông minh", d: "Bấm “Mục lục” → chọn bài/ tuần → nhảy đúng trang." },
      { id: "r3", t: "Đánh dấu & Từ vựng", d: "Bấm 🔖 trên toolbar → xem ở “Đánh dấu”. Bôi đen từ → “Lưu từ vựng” → xem ở Từ vựng." },
      { id: "r4", t: "Tiếp tục đọc", d: "Thoát sách → vào “Tiếp tục đọc” để quay lại đúng trang đã dừng (tự lưu localStorage)." },
    ],
    tip: "Toàn màn hình: bấm ⛶ để tập trung. Bấm Esc để thoát.",
    cta: { label: "Thử Tiếp tục đọc", view: "continue" },
  },
  {
    id: "whiteboard",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Bảng trắng — Vẽ & Ghi chú trên sách",
    icon: <Palette size={18} />,
    color: "#be185d",
    summary: "Vẽ tự do, thêm sticky, chèn ảnh, lưu theo từng sách — đồng bộ với Reader.",
    steps: [
      { id: "wb1", t: "Mở bảng", d: "Trong Thư viện SGK → “Bảng trắng” hoặc trong Reader → toolbar bút → “Mở bảng trắng”." },
      { id: "wb2", t: "Vẽ & chèn", d: "Chọn bút, màu, sticky, chèn ảnh. Kéo thả để sắp xếp, lưu tự động." },
      { id: "wb3", t: "Xuất & chia sẻ", d: "Xuất PNG/PDF, sao chép ra Phiếu học tập hoặc Giáo án." },
    ],
    cta: { label: "Mở Bảng trắng", view: "whiteboard" },
  },
  {
    id: "internship",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Thực tập — Bài tập thực hành",
    icon: <School size={18} />,
    color: "#7c3aed",
    summary: "Kho bài thực tập gắn với từng bài học, làm trực tiếp và chấm tự động.",
    steps: [
      { id: "it1", t: "Chọn bài", d: "Vào Thực tập → chọn Lớp/Môn/Bài → xem danh sách bài tập." },
      { id: "it2", t: "Làm & nộp", d: "Điền đáp án, bấm Nộp → hệ thống chấm và lưu lịch sử." },
      { id: "it3", t: "Xem lại", d: "Lịch sử thực tập lưu theo sách, có thể in PDF." },
    ],
    cta: { label: "Mở Thực tập", view: "internship" },
  },
  {
    id: "lesson",
    groupId: "workspace-soan-day",
    group: "Không gian làm việc · Soạn dạy",
    title: "Giáo án (mẫu KTSP)",
    icon: <FileText size={18} />,
    color: "#059669",
    summary: "Soạn giáo án đầy đủ mẫu KTSP TH TH ĐH Sài Gòn (bìa, I–V, hoạt động A/B/C/D) rồi xuất .docx giữ nguyên định dạng mẫu.",
    steps: [
      { id: "ls1", t: "Soạn trực tiếp", d: "Giáo án → “Kế hoạch mới” → điền bìa, YCCĐ, đồ dùng, hoạt động A/B/C/D (bước GV/HS), điều chỉnh, phụ lục. Tự động lưu nháp." },
      { id: "ls2", t: "Từ sách/AI", d: "Trong sách: tab Soạn dạy → AI dựng bài → tự lưu vào Giáo án và mở sẵn để chỉnh." },
      { id: "ls3", t: "Xuất Word", d: "Bấm “Thêm KHBD (.docx)” — copy file mẫu, thay chỗ trống bằng ô đã nhập, tải .docx ngay." },
    ],
    tip: "File mẫu nằm ở public/templates/KHBD-mau.docx — gắn {{placeholder}} theo README-placeholders.txt trong cùng thư mục.",
    cta: { label: "Mở Giáo án", view: "lessonplans" },
  },
  {
    id: "activities",
    groupId: "workspace-soan-day",
    group: "Không gian làm việc · Soạn dạy",
    title: "Hoạt động mẫu",
    icon: <Puzzle size={18} />,
    color: "#0891b2",
    summary: "Kho hoạt động theo từng bài — dùng lại khi soạn giáo án.",
    steps: [
      { id: "ac1", t: "Tìm hoạt động", d: "Hoạt động → lọc theo Lớp/Môn/Bài → xem chi tiết." },
      { id: "ac2", t: "Dùng lại khi soạn", d: "Xem chi tiết hoạt động mẫu rồi chép nội dung sang hoạt động trong Giáo án." },
      { id: "ac3", t: "Tạo mới", d: "Thêm hoạt động của bạn, gắn thẻ, lưu vào kho chung." },
    ],
    cta: { label: "Mở Hoạt động", view: "activities" },
  },
  {
    id: "worksheets",
    groupId: "workspace-soan-day",
    group: "Không gian làm việc · Soạn dạy",
    title: "Phiếu học tập",
    icon: <ListChecks size={18} />,
    color: "#16a34a",
    summary: "Tạo phiếu từ giáo án hoặc ngân hàng câu hỏi → xuất PDF/Word.",
    steps: [
      { id: "ws1", t: "Tạo phiếu", d: "Phiếu học tập → “Tạo phiếu” → chọn nguồn (Giáo án / Ngân hàng câu hỏi)." },
      { id: "ws2", t: "Chỉnh sửa", d: "Thêm/bớt câu, đổi thứ tự, gắn đáp án, đặt thời gian." },
      { id: "ws3", t: "Xuất & in", d: "Xuất PDF/Word để phát cho học sinh." },
    ],
    cta: { label: "Mở Phiếu học tập", view: "worksheets" },
  },
  {
    id: "qbank",
    groupId: "workspace-ngan-hang",
    group: "Không gian làm việc · Ngân hàng",
    title: "Ngân hàng câu hỏi & Tạo đề ngẫu nhiên",
    icon: <Database size={18} />,
    color: "#dc2626",
    summary: "Tạo câu hỏi theo bài, gắn mức độ (Nhận biết–Vận dụng), trộn đề cân bằng.",
    steps: [
      { id: "qb1", t: "Thêm câu hỏi", d: "Ngân hàng câu hỏi → “Thêm câu hỏi” → chọn Lớp/Môn/Bài → nhập stem + đáp án." },
      { id: "qb2", t: "Tạo đề ngẫu nhiên", d: "Bấm “Tạo đề ngẫu nhiên” → chọn số câu & tỷ lệ mức độ → hệ thống trộn → lưu thành Phiếu học tập." },
      { id: "qb3", t: "Sử dụng trong lớp", d: "In đề hoặc chiếu lên bảng; đáp án tự ẩn/hiện." },
    ],
    cta: { label: "Mở Ngân hàng câu hỏi", view: "questionbank" },
  },
  {
    id: "research",
    groupId: "workspace-nghien-cuu",
    group: "Không gian làm việc · Nghiên cứu",
    title: "Tìm kiếm & So sánh sách",
    icon: <FileSearch size={18} />,
    color: "#0891b2",
    summary: "Tìm toàn văn có highlight và so sánh 2 sách kề nhau.",
    steps: [
      { id: "re1", t: "Tìm kiếm toàn văn", d: "Tìm kiếm → gõ từ khóa → kết quả highlight đúng trang, bấm để mở sách tại trang đó. Dùng Ctrl+K." },
      { id: "re2", t: "So sánh 2 sách", d: "So sánh → chọn 2 cuốn → xem mục lục & nội dung kề nhau, copy khác biệt." },
      { id: "re3", t: "Phím tắt", d: "Ctrl+K mở tìm nhanh mọi nơi, ESC đóng modal." },
    ],
    tip: "Gắn thẻ nhanh: trong sách, bấm “Gắn thẻ” → lưu & tự sang trang kế.",
    cta: { label: "Thử Tìm kiếm", view: "search" },
  },
  {
    id: "advanced",
    groupId: "workspace-nang-cao",
    group: "Không gian làm việc · Công cụ nâng cao",
    title: "Ma trận, Kiểm kê, Thống kê & Bộ sưu tập",
    icon: <Tags size={18} />,
    color: "#7c3aed",
    summary: "Ma trận YCCĐ, Kiểm kê bài tập, Thống kê ngôn ngữ, Khái niệm, Tài liệu tham khảo, Bộ công cụ dữ liệu.",
    steps: [
      { id: "ad1", t: "Ma trận & Gắn thẻ", d: "Trong sách bấm “Gắn thẻ CTGDPT” → chọn YCCĐ → Ma trận tự tổng hợp, xuất Word." },
      { id: "ad2", t: "Kiểm kê & Thống kê", d: "Kiểm kê rà soát bài tập theo YCCĐ; Thống kê ngôn ngữ đếm từ, trích đoạn." },
      { id: "ad3", t: "Bộ sưu tập", d: "Bộ công cụ dữ liệu: sưu tập đoạn hay, Khái niệm, Tài liệu tham khảo — đều xuất Word/PDF." },
    ],
    cta: { label: "Mở Ma trận", view: "matrix" },
  },
  {
    id: "tasks",
    groupId: "cong-viec",
    group: "Công việc",
    title: "Nhiệm vụ, Ý tưởng & Thống kê học tập",
    icon: <ClipboardCheck size={18} />,
    color: "#ea580c",
    summary: "Quản lý việc dạy học như todo-list: nhiệm vụ, ý tưởng sư phạm, biểu đồ tiến độ.",
    steps: [
      { id: "ta1", t: "Nhiệm vụ", d: "Tạo nhiệm vụ, đặt hạn, đánh dấu hoàn thành. Tự nhắc theo ngày." },
      { id: "ta2", t: "Ý tưởng", d: "Lưu ý tưởng dạy học (trò chơi, hoạt động) → dùng lại khi soạn giáo án." },
      { id: "ta3", t: "Thống kê", d: "Thống kê → xem số sách đã mở, % hoàn thành, số từ vựng, bookmark — biểu đồ trực quan." },
    ],
    cta: { label: "Mở Nhiệm vụ", view: "tasks" },
  },
  {
    id: "webtools",
    groupId: "kho-cong-cu",
    group: "Kho công cụ",
    title: "Kho Công cụ Web — desktop của bạn",
    icon: <AppWindow size={18} />,
    color: "#2563eb",
    badge: "Mới",
    summary: "Lưu mọi link hay (GitHub, Figma, Canva…) thành ô vuông 2cm, kéo thả sắp xếp như desktop. Đã fix validate URL chặt.",
    steps: [
      { id: "wt1", t: "Thêm link", d: "Bấm “Thêm Link” → dán URL (vd https://github.com/...) → đặt tên ngắn gọn → Lưu. Validate http(s) + chống trùng." },
      { id: "wt2", t: "Mở & sắp xếp", d: "Click ô để mở tab mới. Kéo thả ô để đổi chỗ, vị trí tự lưu localStorage." },
      { id: "wt3", t: "Sửa / Xóa", d: "Hover ô → ✏️ sửa, 🗑️ xóa. Tìm nhanh bằng ô tìm kiếm trên đầu." },
    ],
    tip: "Đặt tên 2 dòng (vd “GitHub Của Tôi”) để ô vuông gọn đẹp.",
    cta: { label: "Mở Kho Công cụ", view: "webtools" },
  },
  {
    id: "datatools",
    groupId: "tien-ich",
    group: "Tiện ích",
    title: "Sao lưu & Khôi phục — 1 file JSON",
    icon: <DatabaseBackup size={18} />,
    color: "#16a34a",
    badge: "Đã khớp app",
    summary: "Xuất 1 file JSON (localStorage + IndexedDB), khôi phục ghi đè có preview, xóa dọn — khớp header/card/button toàn app.",
    steps: [
      { id: "dt1", t: "Xuất ngay", d: "Sao lưu & Khôi phục → header “Xuất ngay” hoặc card “Xuất file .json” → tải hanhtrang-backup-YYYY-MM-DD.json. Lưu OneDrive/USB." },
      { id: "dt2", t: "Khôi phục", d: "“Khôi phục từ file” → chọn JSON → xem preview (số keys, IndexedDB) → tick “Tôi hiểu” → Xác nhận → tự reload." },
      { id: "dt3", t: "Tổng quan & Dọn rác", d: "Xem quick-stats (mục, dung lượng, cache), nhóm theo tính năng (DataTable), Chẩn đoán mồ côi, Mục lục Excel." },
    ],
    tip: "Mẹo: Header hiện “Lần cuối: …” sau khi xuất — dùng để nhắc sao lưu định kỳ.",
    cta: { label: "Mở Sao lưu & Khôi phục", view: "datatools" },
  },
  {
    id: "settings",
    groupId: "tien-ich",
    group: "Tiện ích",
    title: "Cài đặt & Giao diện",
    icon: <Settings size={18} />,
    color: "#475569",
    summary: "1 nơi cho API Key, màu chủ đạo, sáng/tối, phím tắt — khớp header Cài đặt toàn app.",
    steps: [
      { id: "st1", t: "Giao diện", d: "Header → ☀️/🌙/🖥️ hoặc Cài đặt → Giao diện → chọn Sáng/Tối/Tự động. Đổi màu chủ đạo ngay lập tức." },
      { id: "st2", t: "Phím tắt", d: "Cài đặt → Phím tắt → xem Ctrl+K (tìm nhanh), ← → (lật trang), ESC." },
      { id: "st3", t: "API Key", d: "Cài đặt → dán Gemini API Key (aistudio.google.com) → Bấm ‘Kiểm tra’ → AI sẵn sàng." },
    ],
    cta: { label: "Mở Cài đặt", view: null, action: "settings" },
  },
];

const QUICK_STARTS = [
  { icon: <BookOpen size={16} />, label: "Đọc sách đầu tiên", desc: "Mở 1 cuốn & lật 3 trang", view: "library" },
  { icon: <Sparkles size={16} />, label: "Hỏi AI 1 câu", desc: "Tóm tắt bài học", view: "vocab" },
  { icon: <FileText size={16} />, label: "Tạo giáo án", desc: "Mẫu KTSP, xuất .docx", view: "lessonplans" },
  { icon: <Database size={16} />, label: "Tạo đề", desc: "Ngân hàng câu hỏi", view: "questionbank" },
];

export default function HelpView({ geminiKey, onOpenSettings, onNavigate }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("start");
  const [stepIdx, setStepIdx] = useState(0);
  const { progress, toggle, reset } = useHelpProgress();
  const [showShortcuts, setShowShortcuts] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return MODULES;
    return MODULES.filter((m) =>
      (m.title + m.summary + helpGroupLabel(m) + " " + (m.groupId || "") + m.steps.map((x) => x.t + x.d).join(" ")).toLowerCase().includes(s)
    );
  }, [q]);

  const totalSteps = useMemo(() => MODULES.reduce((a, m) => a + m.steps.length, 0), []);
  const doneSteps = useMemo(() => MODULES.reduce((a, m) => a + m.steps.filter((s) => progress[s.id]).length, 0), [progress]);
  const pct = Math.round((doneSteps / Math.max(1, totalSteps)) * 100);

  const navigate = (mod) => {
    if (mod.cta?.action === "settings" && onOpenSettings) return onOpenSettings();
    if (mod.cta?.view && onNavigate) return onNavigate(mod.cta.view);
    if (onNavigate && mod.id) {
      // fallback: map id to view
      const map = { library: "library", reader: "library", lesson: "lessonplans", qbank: "questionbank", research: "search", tasks: "tasks", webtools: "webtools", ai: "vocab" };
      if (map[mod.id] && onNavigate) onNavigate(map[mod.id]);
    }
  };

  return (
    <div className="help-v2">
      {/* Hero */}
      <div className="help-hero">
        <div className="help-hero-left">
          <div className="help-hero-badge"><Star size={12} /> Dành cho người mới — không cần kinh nghiệm</div>
          <h1 className="help-hero-title"><span className="help-hero-grad">Trợ giúp</span> tinh tế — cầm tay chỉ việc</h1>
          <p className="help-hero-sub">
            Mỗi module có <strong>3 bước làm được ngay</strong>, checklist tương tác và nút “Thử ngay”. 
            Hoàn thành checklist — tiến độ tự lưu trên máy bạn.
          </p>
          <div className="help-hero-actions">
            <button className="btn btn-primary help-hero-cta" onClick={() => { setOpenId("start"); setStepIdx(0); setTimeout(()=>document.querySelector(".help-walk")?.scrollIntoView({ behavior:"smooth", block:"start" }), 80); }}>
              <Play size={16}/> Bắt đầu 60 giây
            </button>
            <button className="btn btn-secondary" onClick={() => setShowShortcuts((v)=>!v)} aria-expanded={showShortcuts}>
              <Keyboard size={14}/> Phím tắt
            </button>
            <span className="help-progress-text">{doneSteps}/{totalSteps} bước</span>
          </div>
          <div className="help-progress">
            <div className="help-progress-fill" style={{ width: pct + "%" }} />
          </div>
          {pct === 100 && <div className="help-celebrate">🎉 Tuyệt vời — bạn đã nắm toàn bộ ứng dụng!</div>}
        </div>
        <div className="help-hero-right">
          <div className="help-search">
            <Search size={14} />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Tìm module: AI, giáo án, thêm sách..." aria-label="Tìm trợ giúp" />
            {q && <button className="help-search-clear" onClick={()=>setQ("")} aria-label="Xóa"><X size={12}/></button>}
          </div>
          <div className="help-quick">
            <div className="help-quick-title">Thử nhanh</div>
            <div className="help-quick-grid">
              {QUICK_STARTS.map((s)=>(
                <button key={s.label} className="help-quick-card" onClick={() => onNavigate && onNavigate(s.view)}>
                  <span className="help-quick-icon">{s.icon}</span>
                  <span className="help-quick-label">{s.label}</span>
                  <span className="help-quick-desc">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {showShortcuts && (
            <div className="help-shortcuts">
              <div className="help-shortcuts-head">Phím tắt hữu ích <button className="btn btn-ghost btn-xs" onClick={()=>setShowShortcuts(false)}><X size={12}/></button></div>
              <div className="help-kbd"><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span> Tìm nhanh</div>
              <div className="help-kbd"><span><kbd>←</kbd> <kbd>→</kbd></span> Lật trang sách</div>
              <div className="help-kbd"><span><kbd>Esc</kbd></span> Đóng modal / thoát toàn màn hình</div>
            </div>
          )}
        </div>
      </div>

      {/* Walkthrough 60s */}
      <div className="help-walk">
        <div className="help-walk-head">
          <h2><Layers size={16}/> Lộ trình 60 giây</h2>
          <span className="help-walk-hint">Bấm “Tiếp” để xem từng bước — có thể bấm “Thử ngay” ở bất kỳ bước nào</span>
        </div>
        <div className="help-walk-steps">
          {MODULES[0].steps.map((st, i)=>(
            <button key={st.id} className={`help-walk-step ${i===stepIdx?"active":""} ${progress[st.id]?"done":""}`} onClick={()=>setStepIdx(i)}>
              <span className="help-walk-num">{progress[st.id] ? <Check size={12}/> : i+1}</span>
              <span className="help-walk-stitle">{st.t}</span>
            </button>
          ))}
        </div>
        <div className="help-walk-card">
          <div className="help-walk-card-left">
            <div className="help-walk-card-title">Bước {stepIdx+1}: {MODULES[0].steps[stepIdx].t}</div>
            <p className="help-walk-card-desc">{MODULES[0].steps[stepIdx].d}</p>
            <div className="help-walk-card-actions">
              <button className="btn btn-primary btn-sm" onClick={() => {
                const map = ["library","library","vocab"];
                const v = map[stepIdx] || "library";
                if (onNavigate) onNavigate(v);
              }}>
                Thử ngay <ArrowRight size={14}/>
              </button>
              <button className={`btn btn-sm ${progress[MODULES[0].steps[stepIdx].id]?"btn-secondary":"btn-ghost"}`} onClick={()=>toggle(MODULES[0].steps[stepIdx].id)}>
                {progress[MODULES[0].steps[stepIdx].id] ? <><Check size={14}/> Đã làm</> : "Đánh dấu đã làm"}
              </button>
            </div>
          </div>
          <div className="help-walk-nav">
            <button className="btn btn-ghost btn-sm" disabled={stepIdx===0} onClick={()=>setStepIdx((v)=>Math.max(0,v-1))}>← Trước</button>
            <button className="btn btn-secondary btn-sm" disabled={stepIdx===MODULES[0].steps.length-1} onClick={()=>setStepIdx((v)=>Math.min(MODULES[0].steps.length-1,v+1))}>Tiếp →</button>
          </div>
        </div>
      </div>

      {/* Modules accordion */}
      <div className="help-modules">
        <div className="help-modules-head">
          <h2><HelpCircle size={16}/> Hướng dẫn từng module</h2>
          <div className="help-modules-actions">
            <span className="help-modules-count">{filtered.length} module</span>
            <button className="btn btn-ghost btn-xs" onClick={()=>{ if(confirm("Xóa toàn bộ tiến độ checklist?")) reset(); }} title="Xóa tiến độ checklist"><RefreshCw size={12}/> Đặt lại</button>
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="help-empty">
            <Search size={20}/><p>Không tìm thấy “{q}”</p><button className="btn btn-ghost btn-sm" onClick={()=>setQ("")}>Xóa lọc</button>
          </div>
        )}

        <div className="help-accordion">
          {filtered.map((mod) => {
            const isOpen = openId === mod.id;
            const done = mod.steps.filter((s)=>progress[s.id]).length;
            const total = mod.steps.length;
            const allDone = done === total;
            return (
              <div key={mod.id} data-mod={mod.id} className={`help-mod ${isOpen?"open":""} ${allDone?"done":""}`}>
                <button
                  className="help-mod-header"
                  onClick={() => setOpenId(isOpen ? null : mod.id)}
                  aria-expanded={isOpen}
                >
                  <span className="help-mod-icon" style={{ background: "var(--color-action-soft, var(--primary-light))", color: "var(--color-action, var(--primary))", borderColor: "var(--border-color)" }}>
                    {mod.icon}
                  </span>
                  <span className="help-mod-meta">
                    <span className="help-mod-group">{helpGroupLabel(mod)}</span>
                    <span className="help-mod-title">{mod.title}</span>
                    <span className="help-mod-summary">{mod.summary}</span>
                  </span>
                  <span className="help-mod-right">
                    {mod.badge && <span className="help-mod-badge" style={{ background: "var(--color-action, var(--primary))" }}>{mod.badge}</span>}
                    <span className={`help-mod-pct ${allDone?"ok":""}`}>{done}/{total}</span>
                    <span className="help-mod-chevron">{isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="help-mod-body">
                    <ol className="help-steps">
                      {mod.steps.map((st, idx)=>(
                        <li key={st.id} className={`help-step ${progress[st.id]?"checked":""}`}>
                          <button className="help-step-check" onClick={()=>toggle(st.id)} aria-label={progress[st.id]?"Bỏ đánh dấu":"Đánh dấu đã làm"}>
                            <span className="help-check-box">{progress[st.id] && <Check size={12}/>}</span>
                          </button>
                          <div className="help-step-content">
                            <div className="help-step-title"><span className="help-step-num">{idx+1}</span> {st.t}</div>
                            <div className="help-step-desc">{st.d}</div>
                          </div>
                        </li>
                      ))}
                    </ol>

                    {mod.tip && <div className="help-tip"><Lightbulb size={14}/> {mod.tip}</div>}

                    {/* Module-specific extras */}
                    {mod.id === "ai" && (
                      <div className="help-ai-card">
                        <div className={`help-ai-status ${geminiKey?"ok":"warn"}`}>
                          <span className="help-ai-dot" /> {geminiKey ? "AI đã sẵn sàng" : "Chưa có API Key — vẫn dùng được phần đọc & ghi chú"}
                        </div>
                        {!geminiKey && (
                          <ol className="help-mini-steps">
                            <li>Mở <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">aistudio.google.com <ExternalLink size={10}/></a> → đăng nhập Google</li>
                            <li>Bấm “Get API key” → “Create API key” → Copy</li>
                            <li>Quay lại đây → bấm “Mở Cài đặt” → dán vào ô Gemini → “Kiểm tra”</li>
                          </ol>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={onOpenSettings}><Settings size={14}/> Mở Cài đặt</button>
                      </div>
                    )}

                    <div className="help-mod-footer">
                      {mod.cta && (
                        <button className="btn btn-primary btn-sm" onClick={()=>navigate(mod)}>
                          <Play size={14}/> {mod.cta.label} <ArrowRight size={14}/>
                        </button>
                      )}
                      <span className="help-mod-footer-hint"><Eye size={12}/> Bấm checklist để lưu tiến độ — tự động trên máy này</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer help */}
      <div className="help-footer">
        <div className="help-footer-card">
          <MessageCircle size={18}/>
          <div>
            <strong>Cần hỗ trợ thêm?</strong>
            <p>Bấm bong bóng đỏ góc phải để hỏi AI bất kỳ câu nào về ứng dụng — ví dụ: “Cách xuất giáo án ra Word?”</p>
          </div>
        </div>
        <div className="help-footer-card">
          <Upload size={18}/>
          <div>
            <strong>Mẹo cho người mới</strong>
            <p>Đừng lo bấm nhầm — mọi thao tác đều có xác nhận & có thể hoàn tác. Hãy thử checklist ở trên!</p>
          </div>
        </div>
      </div>
    </div>
  );
}