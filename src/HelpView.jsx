import React, { useState, useMemo, useEffect } from "react";
import { safeGetJSON, safeSetJSON } from "./safeStorage";
import {
  BookOpen,
  Sparkles,
  Search,
  GraduationCap,
  Settings,
  FileText,
  Library,
  Lightbulb,
  ClipboardCheck,
  BarChart3,
  NotebookPen,
  Tags,
  TrendingUp,
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
  "tro-ly-ai": "Trợ lý & AI",
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

// Dữ liệu hướng dẫn — bao quát toàn bộ NAVIGATION_CONFIG + FOOTER_NAV + các tính năng ngầm
// (Scan, OCR, TTS, Bảng lệnh, Thùng rác, Sổ tay từ vựng…).
// Coverage được test tự đối chiếu tại src/helpCoverage.test.js — thêm view mới mà quên cập nhật
// help là npm test fail ngay.
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
      { id: "s3", t: "Thử hỏi AI 1 câu", d: "Bấm bong bóng góc phải → gõ “Tóm tắt trang này” → AI trả lời ngay. Muốn tìm gì cứ bấm Ctrl+K." },
    ],
    tip: "Chưa có sách? Bấm “Thêm sách” trên header để kéo thả file PDF/DOCX/Ảnh vào. Bấm nhầm vẫn có Hoàn tác (6 giây).",
    cta: { label: "Mở Thư viện ngay", view: "library" },
  },
  {
    id: "ai",
    groupId: "tro-ly-ai",
    group: "Trợ lý & AI",
    title: "Trợ lý sư phạm AI — bong bóng góc phải",
    icon: <Sparkles size={18} />,
    color: "#7c3aed",
    summary: "Hỏi bất kỳ điều gì về sách/app, 6 gợi ý soạn nhanh, quét SGK và lưu câu trả lời vào sổ tay.",
    steps: [
      { id: "ai1", t: "Mở & hỏi", d: "Bấm bong bóng góc phải → gõ câu hỏi (“Tóm tắt trang này”, “Cách xuất giáo án ra Word?”) hoặc chọn 1 trong 6 gợi ý: mục tiêu, 5 câu trắc nghiệm, giáo án 45 phút, ma trận, rubric, phân hoá." },
      { id: "ai2", t: "Quét SGK ngay trong trợ lý", d: "Chip “📷 Quét SGK” → chọn vùng ảnh trang sách → AI dựng học liệu (trò chơi, phiếu, câu hỏi…)." },
      { id: "ai3", t: "Lưu & quản lý hội thoại", d: "Mỗi câu trả lời có nút “Lưu sổ tay” (lưu vào Sổ tay từ vựng). Gửi lại, sao chép, tải hội thoại hoặc Xóa ngay trong panel." },
    ],
    tip: "Gõ Ctrl+K để tìm mọi thứ (mục lục, sách, ghi chú, từ vựng) dù đang ở màn hình nào.",
    cta: { label: "Mở Cài đặt AI", view: null, action: "settings" },
  },
  {
    id: "dashboard",
    groupId: "workspace",
    group: "Không gian làm việc",
    title: "Tổng quan — Bảng điều khiển",
    icon: <BarChart3 size={18} />,
    color: "#0f172a",
    summary: "12 thẻ KPI, quick actions, giáo án gần đây và ô “Tất cả công cụ” dẫn tới mọi tính năng.",
    steps: [
      { id: "db1", t: "Xem số liệu", d: "12 thẻ KPI: Sách, Đang đọc, Đánh dấu, Từ vựng, Trích đoạn, Nhiệm vụ, Giáo án, Ý tưởng, Bảng trắng, Ghi chú, Khái niệm, Tham khảo — bấm “Từ vựng →” là mở thẳng Sổ tay." },
      { id: "db2", t: "Tiếp tục & Quick actions", d: "Khối “Đang đọc” quay lại đúng trang; các nút Soạn Word, Soạn giáo án, Tạo câu hỏi, Nghiên cứu, Bảng trắng mở ngay việc cần làm." },
      { id: "db3", t: "Tất cả công cụ", d: "Cuộn xuống ô “Tất cả công cụ” (~20 công cụ, có ô tìm kiếm) và khối “Scan gần đây” mở lại lịch sử quét ảnh." },
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
    summary: "Tìm, lọc, sắp xếp, yêu thích, đổi tên, xóa (có thùng rác) và thêm sách mới (PDF, DOCX, EPUB, ảnh…).",
    steps: [
      { id: "lib1", t: "Tìm, lọc & sắp xếp", d: "Ô tìm kiếm → gõ tên sách. Dùng chip Lớp / Môn / Tập, “Yêu thích”, và menu sắp xếp (lớp, tên, dung lượng, gần đây, tiến độ). Bấm “Xóa lọc” để trở lại." },
      { id: "lib2", t: "Yêu thích & tiến độ", d: "Bấm ⭐ trên bìa để ghim. Vòng % trên bìa = % đã đọc (tự lưu khi bạn lật trang)." },
      { id: "lib3", t: "Thêm sách mới", d: "Header → “Thêm sách” (kéo thả PDF/DOCX/PPTX/XLSX/TXT/MD/EPUB/ảnh), “🔗” thêm từ link, “📝” tạo từ văn bản. Thông báo có nút Hoàn tác 6 giây." },
      { id: "lib4", t: "Đổi tên / Xóa an toàn", d: "Hover bìa → ✏️ đổi tên, 🗑️ xóa (có xác nhận) → sách vào Thùng rác, khôi phục được ở Sao lưu & Khôi phục → Thùng rác." },
    ],
    tip: "Mẹo người mới: Gõ “Toán 2” hoặc “Tiếng Việt 1” vào ô tìm kiếm — lọc tức thì.",
    cta: { label: "Đến Thư viện", view: "library" },
  },
  {
    id: "reader",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Đọc sách — 2 trang, mục lục AI & công cụ",
    icon: <BookOpen size={18} />,
    color: "#1d4ed8",
    summary: "Đọc như sách giấy: lật trang, zoom, mục lục dựng từ ảnh, đánh dấu, đọc to, bảng lệnh và panel AI.",
    steps: [
      { id: "r1", t: "Lật trang & nhảy trang", d: "← → lật trang, nút < > ở toolbar, Ctrl+G nhảy đúng trang, Home/End về đầu/cuối, lăn chuột cũng được." },
      { id: "r2", t: "Mục lục & phóng to", d: "Bấm “Mục lục” (phím t) → chọn bài/tuần. Có ảnh trang mục lục? Kéo tối đa 6 ảnh vào panel Mục lục → AI dựng mục lục tự động. Zoom bằng + / − / f (vừa khung trang)." },
      { id: "r3", t: "Đánh dấu & Sổ tay từ vựng", d: "Ctrl+D đánh dấu trang → xem ở “Đánh dấu”. Bôi đen từ → “Thêm vào sổ tay từ vựng” (chưa có nghĩa thì AI tự tra trước khi lưu)." },
      { id: "r4", t: "Công cụ khi đọc", d: "Alt+K mở bảng lệnh 20+ lệnh · Ctrl+Shift+C panel AI (Hỏi/Phân tích/Sư phạm/Giáo án) · 🔊 đọc to 0.7–1.5x · ✂ Quét vùng · OCR · sửa sách như Word / xuất .docx." },
    ],
    tip: "Ctrl+K là tìm kiếm TOÀN CỤC (dùng mọi nơi); Alt+K chỉ là bảng lệnh khi đang đọc sách. Tạo mục lục từ ảnh cần API Key.",
    cta: { label: "Thử Tiếp tục đọc", view: "continue" },
  },
  {
    id: "vocab",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Sổ tay từ vựng — bảng, AI & thống kê",
    icon: <NotebookPen size={18} />,
    color: "#0891b2",
    badge: "Mới",
    summary: "Thêm/sửa từ, AI giải nghĩa hàng loạt, biến từ thành câu hỏi, thống kê và xuất CSV/Word.",
    steps: [
      { id: "v1", t: "Thêm & tìm từ", d: "Sidebar “Từ vựng” (Alt+5) → “Thêm từ” (từ, nghĩa, sách, trang, thẻ). Sửa nghĩa: double-click ô nghĩa. Ctrl+K gõ từ → mở thẳng sổ tay với từ khóa." },
      { id: "v2", t: "AI hàng loạt", d: "Chọn nhiều dòng → “AI giải nghĩa” (10 từ/lần, bấm Dừng được) · “AI soạn câu” hoặc “Tạo câu hỏi” đẩy thẳng vào Ngân hàng câu hỏi." },
      { id: "v3", t: "Thống kê & xuất", d: "Tab Thống kê: tổng từ, theo sách/lớp/ngày. Xuất CSV hoặc Word theo bộ lọc hiện tại; xóa vào Thùng rác (giữ 30 ngày) kèm nút Hoàn tác." },
      { id: "v4", t: "Lưu từ từ 3 nơi", d: "Khi đọc sách (bôi đen), trong Trợ lý AI (“Lưu sổ tay”) và Panel thuật ngữ (“Lưu vào sổ tay”) — tất cả cùng vào 1 sổ." },
    ],
    cta: { label: "Mở Sổ tay từ vựng", view: "vocab" },
  },
  {
    id: "whiteboard",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Bảng trắng — Vẽ, ghi chú & sơ đồ AI",
    icon: <Palette size={18} />,
    color: "#be185d",
    summary: "Vẽ tự do, sticky, chèn ảnh, AI tạo sơ đồ tư duy, lưu theo từng sách — đồng bộ với Reader.",
    steps: [
      { id: "wb1", t: "Mở bảng", d: "Trong Thư viện SGK → “Bảng trắng” (Alt+B) hoặc trong Reader → toolbar bút → “Mở bảng trắng”." },
      { id: "wb2", t: "Vẽ & chèn", d: "Chọn bút, màu, sticky, chèn ảnh; phím V/H/P/T/S/L đổi công cụ, Ctrl+Z/Y hoàn tác, lưới & bám snap giúp thẳng hàng. Lưu tự động." },
      { id: "wb3", t: "AI & xuất", d: "AI tạo sơ đồ tư duy (tree/radial) từ ý tưởng. Xuất PNG/PDF, sao chép sang Phiếu học tập hoặc Giáo án." },
    ],
    cta: { label: "Mở Bảng trắng", view: "whiteboard" },
  },
  {
    id: "internship",
    groupId: "workspace-library",
    group: "Không gian làm việc · Thư viện SGK",
    title: "Thực tập — Nhật ký thực tập",
    icon: <School size={18} />,
    color: "#7c3aed",
    summary: "Ghi nhật ký trường lớp theo ngày, phản ánh sau giờ dạy và xem lịch thực tập — không phải chấm bài tập.",
    steps: [
      { id: "it1", t: "Thêm nhật ký", d: "Sidebar “Thực tập” → “Thêm nhật ký” → điền trường, lớp, môn, chủ đề, hoạt động, số giờ. Tự lưu, sửa/xóa có xác nhận." },
      { id: "it2", t: "Phản ánh sau giờ dạy", d: "Mở nhật ký → khối “Phản ánh sau giờ dạy”: mức thành công, điểm cần cải thiện, mức tham gia, nhận xét của GV." },
      { id: "it3", t: "Lịch & tìm kiếm", d: "Lịch tháng có chấm ngày có nhật ký; ô tìm kiếm lọc theo trường / lớp / môn. Thống kê hiện “số nhật ký, số phản ánh”." },
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
    summary: "Soạn giáo án đầy đủ mẫu KTSP (bìa, I–V, hoạt động A/B/C/D) rồi xuất .docx giữ nguyên định dạng + logo KTSP.",
    steps: [
      { id: "ls1", t: "Soạn trực tiếp", d: "Giáo án → “Kế hoạch mới” → điền bìa, YCCĐ, đồ dùng, hoạt động A/B/C/D (bước GV/HS), điều chỉnh, phụ lục. Tự động lưu nháp." },
      { id: "ls2", t: "Từ sách/AI", d: "Trong sách: tab Soạn dạy → AI dựng bài → tự lưu vào Giáo án và mở sẵn để chỉnh. Panel AI có tab Giáo án tạo nhanh từ trang." },
      { id: "ls3", t: "Xuất Word", d: "Bấm “Thêm KHBD (.docx)” — copy file mẫu, thay chỗ trống bằng ô đã nhập, gắn logo KTSP, tải .docx ngay." },
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
    summary: "Kho hoạt động theo từng bài — dùng lại khi soạn, nhập từ ảnh, xuất Word đề + đáp án.",
    steps: [
      { id: "ac1", t: "Tìm & dùng lại", d: "Hoạt động → lọc theo Lớp/Môn/Bài → Xem/Chơi, sao chép nội dung sang hoạt động trong Giáo án." },
      { id: "ac2", t: "Nhập từ ảnh", d: "Bấm “Nhập từ ảnh” → chọn ảnh (tối đa 10, ≤10MB) → AI dựng hoạt động soạn sẵn để chỉnh." },
      { id: "ac3", t: "Xuất Word & đánh giá", d: "Hoạt động game có “Xuất Word (đề + đáp án)”; đánh giá hoạt động bằng sao để lần sau chọn nhanh." },
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
      { id: "ws1", t: "Tạo phiếu", d: "Phiếu học tập (Alt+W) → “Tạo phiếu” → chọn nguồn (Giáo án / Ngân hàng câu hỏi)." },
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
    summary: "Thêm câu hỏi theo bài, nhập từ ảnh, trộn đề cân bằng mức độ (Nhận biết–Vận dụng).",
    steps: [
      { id: "qb1", t: "Thêm câu hỏi", d: "Ngân hàng câu hỏi (Alt+Q) → “Câu hỏi mới” → chọn Lớp/Môn/Bài → nhập stem + đáp án + mức độ." },
      { id: "qb2", t: "Tạo đề ngẫu nhiên", d: "Bấm “Đề ngẫu nhiên” → chọn số câu & tỷ lệ mức độ → hệ thống trộn → lưu thành Phiếu học tập." },
      { id: "qb3", t: "Nhập từ ảnh & dùng lớp", d: "“Nhập từ ảnh” để AI chuyển ảnh thành câu hỏi. In đề hoặc chiếu lên bảng; đáp án tự ẩn/hiện." },
    ],
    cta: { label: "Mở Ngân hàng câu hỏi", view: "questionbank" },
  },
  {
    id: "research",
    groupId: "workspace-nghien-cuu",
    group: "Không gian làm việc · Nghiên cứu",
    title: "Tìm kiếm toàn cục & So sánh sách",
    icon: <FileSearch size={18} />,
    color: "#0891b2",
    summary: "Ctrl+K tìm mọi nơi (mục lục, sách, ghi chú, từ vựng, giáo án) và so sánh 2 sách kề nhau.",
    steps: [
      { id: "re1", t: "Ctrl+K — tìm kiếm toàn cục", d: "Gõ không dấu vẫn ra; kết quả theo thứ tự Mục lục → Sách → Ghi chú → Từ vựng → Bảng trắng → Giáo án…, bấm là mở đúng nơi. Tôn trọng Cài đặt → Tìm kiếm (hoa/thường, fuzzy)." },
      { id: "re2", t: "Tìm kiếm toàn văn", d: "View Tìm kiếm (Alt+6): gõ cụm cần tìm trong tất cả sách & ghi chú → highlight đúng trang, bấm để mở sách tại trang đó." },
      { id: "re3", t: "So sánh 2 sách", d: "So sánh (Alt+7) → chọn 2 cuốn → xem mục lục & nội dung kề nhau, copy phần khác biệt. Gắn thẻ nhanh: “Gắn thẻ” → lưu & tự sang trang kế." },
    ],
    tip: "Esc đóng overlay từng lớp một — tìm xong bấm Esc là về lại đúng chỗ đang làm.",
    cta: { label: "Thử Ctrl+K", view: "search" },
  },
  {
    id: "scan",
    groupId: "workspace-nang-cao",
    group: "Không gian làm việc · Công cụ nâng cao",
    title: "Quét vùng SGK bằng AI (Scan)",
    icon: <Scissors size={18} />,
    color: "#d97706",
    badge: "AI",
    summary: "Kéo chọn vùng ảnh trên trang sách → AI dựng học liệu: nguyên bản, trò chơi, phiếu, câu hỏi, ghi chú.",
    steps: [
      { id: "sc1", t: "Mở công cụ quét", d: "Mở sách → toolbar bấm ✂ “Quét vùng” (hoặc Ctrl+Shift+X), hoặc chip “📷 Quét SGK” trong Trợ lý AI góc phải." },
      { id: "sc2", t: "Phân tích & chọn loại", d: "Kéo chọn vùng → AI đọc ảnh → chọn đầu ra: Nguyên bản / Ghép đôi / Quiz / Kahoot / Phiếu học tập / Câu hỏi / Hoạt động / Ghi chú." },
      { id: "sc3", t: "Duyệt & lưu", d: "Tùy chỉnh nội dung → Duyệt & lưu. Xem lại ở Tổng quan → “Scan gần đây” hoặc mục Lịch sử quét." },
    ],
    tip: "Chụp vùng chữ rõ nét, tránh mép cong. Tính năng này cần Gemini API Key.",
    cta: { label: "Mở sách để quét", view: "library" },
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
      { id: "ad1", t: "Ma trận & Gắn thẻ", d: "Trong sách bấm “Gắn thẻ CTGDPT” → chọn YCCĐ → Ma trận (Alt+8) tự tổng hợp mạch kiến thức, xuất Word." },
      { id: "ad2", t: "Kiểm kê & Thống kê", d: "Kiểm kê rà soát bài tập theo YCCĐ (trang có câu hỏi/bài tập); Thống kê ngôn ngữ đếm từ, tần suất, trích đoạn." },
      { id: "ad3", t: "Khái niệm & Bộ sưu tập", d: "Khái niệm (sổ thuật ngữ gắn trang), Tài liệu tham khảo, Bộ công cụ dữ liệu (trích đoạn hay) — đều xuất Word/PDF." },
    ],
    cta: { label: "Mở Ma trận", view: "matrix" },
  },
  {
    id: "tasks",
    groupId: "cong-viec",
    group: "Công việc",
    title: "Nhiệm vụ, Ý tưởng & Thống kê — có XP & tập trung",
    icon: <ClipboardCheck size={18} />,
    color: "#ea580c",
    summary: "Todo-list kiểu game: 5 tab nhiệm vụ, XP/Streak/Thành tựu, chế độ tập trung, ý tưởng sư phạm, biểu đồ tiến độ.",
    steps: [
      { id: "ta1", t: "5 tab nhiệm vụ", d: "Nhiệm vụ (Alt+T) → Hôm nay · Việc cần làm · Lịch sử · Mục tiêu · Thành tựu. Tích hoàn thành để lên Level, giữ Streak, nhận Thử thách tháng." },
      { id: "ta2", t: "Chế độ tập trung", d: "Bật timer tập trung khi soạn giáo án/thiết dạy — đồng hồ đếm giúp làm việc đủ nhịp, tránh xao nhãng." },
      { id: "ta3", t: "Ý tưởng & Thống kê", d: "Ý tưởng: lưu trò chơi/hoạt động dạy học để dùng lại. Thống kê: biểu đồ sách đã mở, % hoàn thành, từ vựng (bấm “Từ vựng →”), có “Đặt lại thống kê cuốn này”." },
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
    summary: "Lưu mọi link hay (GitHub, Figma, Canva…) thành ô vuông, kéo thả sắp xếp như desktop.",
    steps: [
      { id: "wt1", t: "Thêm link", d: "Bấm “Thêm Link mới” → dán URL (vd https://github.com/...) → đặt tên ngắn gọn → Lưu. Chỉ nhận http(s) + chống trùng." },
      { id: "wt2", t: "Mở & sắp xếp", d: "Click ô để mở tab mới. Kéo thả ô để đổi chỗ, vị trí tự lưu localStorage." },
      { id: "wt3", t: "Sửa / Xóa", d: "Hover ô → ✏️ sửa, 🗑️ xóa. Tìm nhanh bằng ô tìm kiếm trên đầu (tìm cả tên lẫn link)." },
    ],
    tip: "Đặt tên 2 dòng (vd “GitHub Của Tôi”) để ô vuông gọn đẹp.",
    cta: { label: "Mở Kho Công cụ", view: "webtools" },
  },
  {
    id: "datatools",
    groupId: "tien-ich",
    group: "Tiện ích",
    title: "Sao lưu, Thùng rác & Khôi phục",
    icon: <DatabaseBackup size={18} />,
    color: "#16a34a",
    summary: "Xuất 1 file JSON, sao lưu tự động theo lịch, thùng rác khôi phục được, chẩn đoán & dọn rác lưu trữ.",
    steps: [
      { id: "dt1", t: "Xuất & Khôi phục", d: "Sao lưu & Khôi phục → “Xuất ngay” → tải hanhtrang-backup-YYYY-MM-DD.json (lưu OneDrive/USB). “Khôi phục từ file” → xem preview → tick “Tôi hiểu” → xác nhận → tự reload." },
      { id: "dt2", t: "Sao lưu tự động & Thùng rác", d: "Khối “Sao lưu tự động” giữ snapshot theo ngày/tuần/tháng (Khôi phục/Xóa bản). Thùng rác: sách, từ vựng (30 ngày)… → Khôi phục hoặc Xóa vĩnh viễn." },
      { id: "dt3", t: "Tổng quan & Chẩn đoán", d: "Xem quick-stats (mục, dung lượng), nhóm theo tính năng, Quét lưu trữ / Sửa lỗi, Chẩn đoán mồ côi, Mục lục — Nhập từ Excel (Tải mẫu / Xuất Excel)." },
    ],
    tip: "Header hiện “Lần cuối: …” sau khi xuất — dùng để nhắc sao lưu định kỳ.",
    cta: { label: "Mở Sao lưu & Khôi phục", view: "datatools" },
  },
  {
    id: "glossary",
    groupId: "tien-ich",
    group: "Tiện ích",
    title: "Từ điển & Thuật ngữ",
    icon: <GraduationCap size={18} />,
    color: "#0369a1",
    summary: "Tra thuật ngữ ngay khi đọc (phím g), lưu ý nghĩa vào Sổ tay từ vựng, tìm lại bằng Ctrl+K.",
    steps: [
      { id: "gl1", t: "Mở từ điển khi đọc", d: "Trong sách → ngăn “Công cụ nâng cao” → “Từ điển” (phím g) — tra ngay tại trang đang đọc, không mất chỗ." },
      { id: "gl2", t: "Lưu vào sổ tay", d: "Mỗi mục có nút “Lưu vào sổ tay” → tự gắn thẻ “thuật ngữ”, xuất hiện trong Sổ tay từ vựng để ôn lại." },
      { id: "gl3", t: "Tra lại nhanh", d: "Ctrl+K → gõ thuật ngữ → nhóm kết quả Từ vựng/Thuật ngữ hiển thị, bấm là mở đúng mục." },
    ],
    cta: { label: "Mở Từ điển", view: "glossary" },
  },
  {
    id: "shortcuts",
    groupId: "tien-ich",
    group: "Tiện ích",
    title: "Phím tắt toàn app",
    icon: <Keyboard size={18} />,
    color: "#475569",
    summary: "Ctrl+K tìm toàn cục, Alt+K bảng lệnh khi đọc, Alt+1–8 điều hướng, hàng chím phím đọc sách — đổi được.",
    steps: [
      { id: "sh1", t: "Chung & điều hướng", d: "Ctrl+K tìm kiếm toàn cục · F1 mở Trợ giúp · Esc đóng overlay từng lớp. Alt+1→8: Tổng quan, Thư viện, Tiếp tục đọc, Đánh dấu, Từ vựng, Tìm, So sánh, Ma trận; Alt+L Giáo án, Alt+A Hoạt động, Alt+W Phiếu, Alt+Q Ngân hàng, Alt+B Bảng trắng, Alt+T Nhiệm vụ." },
      { id: "sh2", t: "Khi đọc sách", d: "← → lật trang · Ctrl+G nhảy trang · Ctrl+D đánh dấu · + / − zoom · f vừa khung · t mục lục · Alt+K bảng lệnh · Ctrl+Shift+C hỏi AI · Ctrl+Shift+X quét vùng · Ctrl+Shift+V đọc to · g từ điển." },
      { id: "sh3", t: "Đổi phím yêu thích", d: "Cài đặt → Phím tắt → sửa combo bất kỳ; các hint Ctrl+K/Esc trong app tự đổi theo (macOS dùng Cmd thay Ctrl)." },
    ],
    cta: { label: "Mở Cài đặt → Phím tắt", view: null, action: "settings", section: "keyboard" },
  },
  {
    id: "settings",
    groupId: "tien-ich",
    group: "Tiện ích",
    title: "Cài đặt — 18 mục cho mọi tính năng",
    icon: <Settings size={18} />,
    color: "#475569",
    summary: "1 nơi cho giao diện, đọc sách, AI, phím tắt, thông báo, trợ năng — mọi thay đổi lưu & áp dụng ngay.",
    steps: [
      { id: "st1", t: "Giao diện nhanh", d: "Header → ☀️/🌙/🖥️ chuyển Sáng/Tối/Tự động. Vào Cài đặt → Giao diện để đổi màu chủ đạo, cỡ chữ & mật độ." },
      { id: "st2", t: "18 mục, 4 nhóm", d: "Chung · Học tập & Đọc (Trình đọc, Soạn Word, Thư viện, Bảng trắng, Nhiệm vụ) · AI & Dữ liệu (AI Gemini, Tìm kiếm, Xuất, Sao lưu) · Hệ thống (Hành vi & Âm thanh, Thông báo, Phím tắt, Trợ năng, Riêng tư, Nâng cao, Giới thiệu). Có thanh tìm cài đặt + “Khôi phục mặc định cho mục này”." },
      { id: "st3", t: "API Key cho AI", d: "Cài đặt → AI Gemini → dán key (aistudio.google.com) → “Kiểm tra”. Header có chấm trạng thái AI — bấm vào là mở đúng mục này; sidebar hiện nút “Cấu hình” khi chưa có key." },
    ],
    tip: "Chưa có API Key vẫn đọc sách, ghi chú, làm phiếu bình thường — AI chỉ phụ thêm.",
    cta: { label: "Mở Cài đặt", view: null, action: "settings", section: "general" },
  },
];

const QUICK_STARTS = [
  { icon: <BookOpen size={16} />, label: "Đọc sách đầu tiên", desc: "Mở 1 cuốn & lật 3 trang", view: "library" },
  { icon: <NotebookPen size={16} />, label: "Sổ tay từ vựng", desc: "AI giải nghĩa & tạo câu hỏi", view: "vocab" },
  { icon: <FileText size={16} />, label: "Tạo giáo án", desc: "Mẫu KTSP, xuất .docx", view: "lessonplans" },
  { icon: <Database size={16} />, label: "Tạo đề", desc: "Ngân hàng câu hỏi", view: "questionbank" },
];

// Hint phím tắt trong panel — khớp DEFAULT_SHORTCUTS (src/keyboardShortcuts.js)
const SHORTCUT_HINTS = [
  { keys: ["Ctrl", "K"], sep: "+", t: "Tìm kiếm toàn cục" },
  { keys: ["Alt", "K"], sep: "+", t: "Bảng lệnh khi đọc" },
  { keys: ["←", "→"], sep: " ", t: "Lật trang sách" },
  { keys: ["Ctrl", "D"], sep: "+", t: "Đánh dấu trang" },
  { keys: ["F1"], sep: "", t: "Mở Trợ giúp" },
  { keys: ["Esc"], sep: "", t: "Đóng overlay từng lớp" },
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
    if (mod.cta?.action === "settings" && onOpenSettings) return onOpenSettings(mod.cta.section || "ai");
    if (mod.cta?.view && onNavigate) return onNavigate(mod.cta.view);
    if (onNavigate && mod.id) {
      // fallback: map id to view
      const map = { library: "library", reader: "library", lesson: "lessonplans", qbank: "questionbank", research: "search", tasks: "tasks", webtools: "webtools", ai: "vocab", glossary: "glossary" };
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
              {SHORTCUT_HINTS.map((sc) => (
                <div key={sc.t} className="help-kbd">
                  <span>
                    {sc.keys.map((k, i) => (
                      <React.Fragment key={k + i}>
                        {i > 0 && sc.sep}
                        <kbd>{k}</kbd>
                      </React.Fragment>
                    ))}
                  </span> {sc.t}
                </div>
              ))}
              <div className="help-kbd-help">Danh sách đầy đủ: module “Phím tắt toàn app” ↓ hoặc Cài đặt → Phím tắt</div>
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
                        <button className="btn btn-secondary btn-sm" onClick={() => onOpenSettings("ai")}><Settings size={14}/> Mở Cài đặt</button>
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
            <p>Bấm bong bóng góc phải để hỏi AI bất kỳ câu nào về ứng dụng — ví dụ: “Cách xuất giáo án ra Word?”</p>
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
