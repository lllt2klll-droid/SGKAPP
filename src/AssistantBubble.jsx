// ── AI Assistant Bubble Pro: Chat + Hướng dẫn sử dụng app + Điều hướng ──
// Thiết kế đồng bộ app (dùng CSS vars), hỗ trợ offline guide, action tags [MỞ: view],
// voice input (Web Speech), TTS đọc trả lời, tìm kiếm hội thoại, follow-ups.
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Send, X, Bot, Trash2, Settings, Check, Copy, Download, RefreshCw,
  NotebookPen, Sparkles, Mic, MicOff, Volume2, VolumeX, Search,
  BookOpen, Compass, MessageCircle, ChevronRight, ChevronDown,
  GraduationCap, Map, Keyboard, ExternalLink, Maximize2,
  Minimize2, ArrowRight, Lightbulb,
} from "lucide-react";
import { TEACHER_SYSTEM_PROMPT, APP_VIEWS, getViewLabel } from "./appPersona";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { loadSettings } from "./settingsStore";
import { soundManager } from "./audio/soundManager.js";
import { searchAll } from "./searchIndex";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove } from "./safeStorage";
import { addVocabEntry, getVocab, removeVocabEntry } from "./userdata";
import { getActivities, getQuestions, getWorksheets } from "./teachingDB";
import { getPlans } from "./khbd/planModel";

const MAX_MSGS = 60;
const HISTORY_KEY = "assistant_history";
const DRAFT_KEY = "assistant_draft";
const TAB_KEY = "assistant_tab";

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// P2 • nhãn ngắn cho chip "dữ liệu mới" trong header (bus DATA_UPDATED)
const DATA_DOMAIN_LABEL = {
  vocab: "từ vựng", bookmarks: "đánh dấu", notes: "ghi chú", marks: "gắn thẻ",
  lessonPlans: "giáo án", activities: "hoạt động", worksheets: "phiếu", questions: "câu hỏi",
  whiteboard: "bảng trắng", scans: "quét ảnh", clips: "trích đoạn", refs: "tham khảo",
  concepts: "khái niệm", collections: "bộ sưu tập", evidence: "bằng chứng", research: "nghiên cứu",
  missions: "nhiệm vụ", webtools: "kho web", books: "sách", quiz: "quiz",
  internship: "thực tập", settings: "cài đặt", searchIndex: "chỉ mục",
};
function dataDomainLabel(d) {
  const s = String(d || "").trim();
  return DATA_DOMAIN_LABEL[s] || (s ? s.slice(0, 24) : "dữ liệu");
}

function loadHistory() {
  try {
    const value = safeGetJSON(HISTORY_KEY, [], Array.isArray);
    if (!Array.isArray(value)) return [];
    return value
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
      .slice(-MAX_MSGS);
  } catch { return []; }
}

// ─── Offline guides — trả lời tức thì KHÔNG cần API key ──────────────
const GUIDES = [
  {
    id: "start", icon: "🚀", title: "Bắt đầu 60 giây", view: "library",
    desc: "Đọc cuốn sách đầu tiên, hỏi AI 1 câu.",
    keywords: ["bắt đầu", "mới", "đầu tiên", "làm quen", "60 giây", "huong dan"],
    steps: [
      { t: "Mở Thư viện sách", d: "Sidebar trái → “Thư viện sách”. Thấy các bìa sách theo Lớp / Môn." },
      { t: "Bấm “Đọc” trên 1 cuốn", d: "Sách mở dạng 2 trang như sách thật. Dùng ← → hoặc lăn chuột để lật trang." },
      { t: "Thử hỏi AI 1 câu", d: "Bấm bong bóng AI góc phải → gõ “Tóm tắt trang này”. Hoặc bấm Ctrl+K để tìm mọi thứ." },
    ],
  },
  {
    id: "read", icon: "📚", title: "Đọc sách như sách thật", view: "library",
    desc: "Lật trang, mục lục AI, zoom, đánh dấu, đọc to.",
    keywords: ["đọc", "lật trang", "mục lục", "zoom", "phóng to", "đánh dấu", "đọc to", "trang"],
    steps: [
      { t: "Lật & nhảy trang", d: "← → lật trang · Ctrl+G nhảy đúng trang · Home/End đầu–cuối." },
      { t: "Mục lục (phím t)", d: "Bấm “Mục lục” → chọn bài. Có ảnh mục lục? Kéo tối đa 6 ảnh vào → AI dựng mục lục tự động." },
      { t: "Đánh dấu & đọc to", d: "Ctrl+D đánh dấu trang · 🔊 đọc to 0.7–1.5x · phím g mở Từ điển ngay tại trang." },
    ],
  },
  {
    id: "ai", icon: "✨", title: "Trợ lý AI làm được gì?", view: null,
    desc: "Soạn giáo án, trắc nghiệm, ma trận, rubric, phân hoá…",
    keywords: ["ai", "trợ lý", "api", "key", "gemini", "hỏi", "soạn"],
    steps: [
      { t: "Hỏi bất kỳ điều gì", d: "Gõ: “Soạn mục tiêu Phép cộng phạm vi 10 (Toán 1)” hoặc “Tạo 5 câu trắc nghiệm Toán 2”." },
      { t: "Lấy API Key miễn phí", d: "Mở aistudio.google.com → Get API key → Copy → Cài đặt → AI Gemini → dán → “Kiểm tra”." },
      { t: "Lưu câu trả lời", d: "Mỗi câu trả lời có nút Sao chép · Lưu sổ tay · Đọc to · Gửi lại." },
    ],
  },
  {
    id: "lesson", icon: "📄", title: "Soạn giáo án mẫu KTSP", view: "lessonplans",
    desc: "Bìa, I–V, hoạt động A/B/C/D, xuất .docx + logo.",
    keywords: ["giáo án", "khbd", "kế hoạch", "soạn", "ktsp", "word", "docx"],
    steps: [
      { t: "Tạo kế hoạch mới", d: "Giáo án → “Kế hoạch mới” → điền bìa, YCCĐ, đồ dùng, hoạt động A/B/C/D." },
      { t: "Nhờ AI dựng từ sách", d: "Trong sách: tab Soạn dạy → AI dựng bài → tự lưu vào Giáo án để chỉnh." },
      { t: "Xuất Word", d: "Bấm “Thêm KHBD (.docx)” → tải file giữ nguyên định dạng + logo KTSP." },
    ],
  },
  {
    id: "quiz", icon: "🗂️", title: "Tạo đề kiểm tra", view: "questionbank",
    desc: "Ngân hàng câu hỏi, đề ngẫu nhiên, phiếu học tập.",
    keywords: ["đề", "kiểm tra", "câu hỏi", "trắc nghiệm", "ma trận", "phiếu", "ngân hàng"],
    steps: [
      { t: "Thêm câu hỏi", d: "Ngân hàng câu hỏi (Alt+Q) → “Câu hỏi mới” → chọn Lớp/Môn/Bài + mức độ." },
      { t: "Đề ngẫu nhiên", d: "Bấm “Đề ngẫu nhiên” → chọn số câu & tỷ lệ Nhận biết–Vận dụng → lưu thành Phiếu." },
      { t: "Nhập từ ảnh", d: "“Nhập từ ảnh” → AI chuyển ảnh thành câu hỏi soạn sẵn." },
    ],
  },
  {
    id: "scan", icon: "📷", title: "Quét SGK bằng AI", view: "library",
    desc: "Kéo chọn vùng ảnh → AI dựng trò chơi, phiếu, câu hỏi.",
    keywords: ["quét", "scan", "ảnh", "chụp", "vùng", "ocr"],
    steps: [
      { t: "Mở công cụ", d: "Mở sách → toolbar ✂ “Quét vùng” (Ctrl+Shift+X)." },
      { t: "Kéo chọn vùng", d: "Kéo vùng chữ rõ nét → AI đọc ảnh → chọn đầu ra: Quiz / Kahoot / Phiếu / Ghi chú." },
      { t: "Duyệt & lưu", d: "Chỉnh nội dung → Duyệt & lưu → xem lại ở Tổng quan → “Scan gần đây”." },
    ],
  },
  {
    id: "vocab", icon: "📝", title: "Sổ tay từ vựng", view: "vocab",
    desc: "AI giải nghĩa hàng loạt, tạo câu hỏi, xuất Word.",
    keywords: ["từ vựng", "từ", "nghĩa", "sổ tay", "glossary", "thuật ngữ"],
    steps: [
      { t: "Thêm từ", d: "Sidebar “Từ vựng” (Alt+5) → “Thêm từ”. Double-click ô nghĩa để sửa." },
      { t: "AI hàng loạt", d: "Chọn nhiều dòng → “AI giải nghĩa” (10 từ/lần) · “Tạo câu hỏi” đẩy vào Ngân hàng." },
      { t: "Lưu từ 3 nơi", d: "Khi đọc (bôi đen) · trong Trợ lý (“Lưu sổ tay”) · panel Thuật ngữ — cùng vào 1 sổ." },
    ],
  },
  {
    id: "board", icon: "🎨", title: "Bảng trắng & sơ đồ AI", view: "whiteboard",
    desc: "Vẽ, sticky, chèn ảnh, AI tạo sơ đồ tư duy.",
    keywords: ["bảng", "vẽ", "trắng", "sơ đồ", "tư duy", "sticky"],
    steps: [
      { t: "Mở bảng", d: "“Bảng trắng” (Alt+B) hoặc trong Reader → toolbar bút → “Mở bảng trắng”." },
      { t: "Vẽ & chèn", d: "Bút, màu, sticky, chèn ảnh · V/H/P/T/S/L đổi công cụ · Ctrl+Z hoàn tác. Tự lưu." },
      { t: "AI & xuất", d: "AI tạo sơ đồ tree/radial từ ý tưởng → xuất PNG/PDF." },
    ],
  },
  {
    id: "search", icon: "🔍", title: "Tìm mọi thứ với Ctrl+K", view: "search",
    desc: "Mục lục, sách, ghi chú, từ vựng, giáo án…",
    keywords: ["tìm", "kiếm", "search", "ctrl+k", "so sánh", "compare"],
    steps: [
      { t: "Ctrl+K mọi nơi", d: "Gõ không dấu vẫn ra. Kết quả Mục lục → Sách → Ghi chú → Từ vựng → Giáo án… bấm là mở đúng nơi." },
      { t: "Tìm toàn văn (Alt+6)", d: "Gõ cụm cần tìm trong tất cả sách → highlight đúng trang." },
      { t: "So sánh 2 sách (Alt+7)", d: "Chọn 2 cuốn → xem mục lục & nội dung kề nhau." },
    ],
  },
  {
    id: "tasks", icon: "✅", title: "Nhiệm vụ, XP & tập trung", view: "tasks",
    desc: "Todo kiểu game: streak, level, thành tựu.",
    keywords: ["nhiệm vụ", "việc", "todo", "xp", "streak", "tập trung", "ý tưởng"],
    steps: [
      { t: "5 tab nhiệm vụ", d: "Nhiệm vụ (Alt+T) → Hôm nay · Việc cần làm · Lịch sử · Mục tiêu · Thành tựu." },
      { t: "Chế độ tập trung", d: "Bật timer khi soạn giáo án để làm việc đủ nhịp." },
      { t: "Ý tưởng & Thống kê", d: "Lưu trò chơi/hoạt động để dùng lại · xem biểu đồ tiến độ." },
    ],
  },
  {
    id: "backup", icon: "💾", title: "Sao lưu & Thùng rác", view: "datatools",
    desc: "Xuất 1 file JSON, khôi phục, chẩn đoán.",
    keywords: ["sao lưu", "backup", "khôi phục", "thùng rác", "xóa", "xuất", "json"],
    steps: [
      { t: "Xuất ngay", d: "Sao lưu & Khôi phục → “Xuất ngay” → lưu file hanhtrang-backup-YYYY-MM-DD.json ra OneDrive/USB." },
      { t: "Thùng rác", d: "Sách / từ vựng xóa nhầm → vào Thùng rác → Khôi phục (giữ 30 ngày)." },
      { t: "Sao lưu tự động", d: "Bật snapshot theo ngày/tuần/tháng để không bao giờ mất dữ liệu." },
    ],
  },
  {
    id: "keys", icon: "⌨️", title: "Phím tắt toàn app", view: null,
    desc: "Ctrl+K, Alt+K, Alt+1–8, phím đọc sách.",
    keywords: ["phím", "tắt", "shortcut", "keyboard", "ctrl", "alt", "esc", "f1"],
    steps: [
      { t: "Chung", d: "Ctrl+K tìm toàn cục · F1 Trợ giúp · Esc đóng overlay từng lớp." },
      { t: "Điều hướng", d: "Alt+1→8: Tổng quan, Thư viện, Đọc tiếp, Đánh dấu, Từ vựng, Tìm, So sánh, Ma trận · Alt+L giáo án · Alt+Q ngân hàng · Alt+B bảng · Alt+T nhiệm vụ." },
      { t: "Khi đọc", d: "← → lật trang · Ctrl+G nhảy trang · Ctrl+D đánh dấu · +/− zoom · f vừa khung · t mục lục · Alt+K bảng lệnh · g từ điển." },
    ],
  },
];

// So khớp không dấu để gõ "cach quet" hay "cách quét" đều ra guide
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function matchGuides(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];
  const nq = norm(q);
  const words = nq.split(/\s+/);
  return GUIDES.map((g) => {
    let score = 0;
    const hay = norm(
      g.title + " " + g.desc + " " + g.keywords.join(" ") + " " + g.steps.map((s) => s.t + " " + s.d).join(" "),
    );
    for (const kw of g.keywords) {
      if (q.includes(kw) || nq.includes(norm(kw))) score += 3;
    }
    for (const w of words) if (w.length > 2 && hay.includes(w)) score += 1;
    if (/huong dan|cach|huong|lam sao|o dau|mo |dung|sach|quyet|quet|scan|phim|tat|backup|sao luu|giao an|them sach|su dung/.test(nq)) score += 1;
    return { g, score };
  })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.g)
    .slice(0, 3);
}

// Parse [MỞ: viewId] (chấp nhận cả biến thể không dấu [MO: ...]) → buttons điều hướng
const VALID_VIEWS = new Set(APP_VIEWS.map((v) => v.id));
function parseActions(raw) {
  const actions = [];
  const text = String(raw || "").replace(/\[(?:MỞ|MO):\s*([a-zA-Z0-9_]+)\]/g, (_, v) => {
    const id = String(v).toLowerCase();
    if (VALID_VIEWS.has(id)) actions.push({ view: id, label: getViewLabel(id) });
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text, actions };
}

function wantsGuideAnswer(q) {
  return /huong dan|cach|huong|lam sao|o dau|mo|dung|su dung|quet|scan|them sach|phim|tat|backup|sao luu|giao an.*word|keyboard|ctrl|alt/.test(
    norm(q),
  );
}

// ─── Mẹo theo từng màn hình: mở tới đâu → trợ lý hiện mẹo tới đó ────
// Guide có sẵn (GUIDES[].view) tự khớp; view chưa có guide riêng thì dùng tips viết tay.
const VIEW_EXTRA_TIPS = {
  dashboard: { guides: ["start"], tips: ["12 thẻ KPI — bấm “Từ vựng →” là mở thẳng Sổ tay.", "Khối “Đang đọc” quay lại đúng trang đang dở.", "Ô “Tất cả công cụ” (~20 công cụ) có ô tìm kiếm."] },
  activities: { guides: ["quiz"], tips: ["Lọc theo Lớp/Môn/Bài rồi bấm Xem/Chơi thử.", "“Nhập từ ảnh” (tối đa 10 ảnh) → AI dựng hoạt động sẵn để chỉnh.", "Chấm sao hoạt động hay để lần sau chọn nhanh."] },
  worksheets: { guides: ["quiz"], tips: ["“Tạo phiếu” từ nguồn Giáo án hoặc Ngân hàng câu hỏi.", "Đổi thứ tự, gắn đáp án, đặt thời gian trước khi xuất.", "Xuất PDF/Word để phát cho học sinh."] },
  compare: { guides: ["search"], tips: ["Chọn 2 cuốn để xem mục lục & nội dung kề nhau.", "“Gắn thẻ” nhanh rồi tự sang trang kế.", "Copy phần khác biệt để đối chiếu chương trình."] },
  matrix: { guides: [], tips: ["Trong sách bấm “Gắn thẻ CTGDPT” → chọn YCCĐ.", "Ma trận (Alt+8) tự tổng hợp mạch kiến thức.", "Xuất Word để kẹp hồ sơ chuyên môn."] },
  ideas: { guides: ["tasks"], tips: ["Lưu trò chơi/hoạt động dạy học để dùng lại.", "Gắn Lớp/Môn để lọc nhanh khi soạn.", "Ý tưởng hay → chuyển thành Hoạt động 1 chạm."] },
  internship: { guides: [], tips: ["“Thêm nhật ký” theo ngày: trường, lớp, môn, số giờ.", "Viết “Phản ánh sau giờ dạy” ngay khi còn nhớ.", "Lịch tháng chấm ngày có nhật ký — bấm để xem lại."] },
  collections: { guides: ["search"], tips: ["Lưu trích đoạn hay khi đang đọc để dùng lại.", "Gom theo chủ đề bài dạy cho dễ tìm.", "Xuất Word/PDF khi cần in."] },
  references: { guides: [], tips: ["Lưu nguồn tham khảo theo từng bài.", "Copy trích dẫn đúng định dạng.", "Mở lại 1 chạm khi soạn giáo án."] },
  glossary: { guides: ["vocab"], tips: ["Khi đọc sách bấm phím g để tra ngay.", "Nút “Lưu vào sổ tay” gắn thẻ “thuật ngữ”.", "Ctrl+K gõ thuật ngữ để mở lại."] },
  webtools: { guides: [], tips: ["“Thêm Link mới” — chỉ nhận http(s), chống trùng.", "Kéo thả ô để sắp xếp như desktop.", "Ô tìm kiếm lọc cả tên lẫn link."] },
  help: { guides: ["keys"], tips: ["Mỗi module có 3 bước + checklist lưu tự động.", "“Bắt đầu 60 giây” là lộ trình nhanh nhất.", "Xong checklist 100% là nắm toàn app."] },
};

// Trả về { guides: [...guide], extra: [...] } cho màn hình hiện tại
function getViewTip(view) {
  const direct = GUIDES.filter((g) => g.view === view);
  const extra = VIEW_EXTRA_TIPS[view];
  const byId = extra?.guides?.length
    ? extra.guides.map((id) => GUIDES.find((g) => g.id === id)).filter(Boolean)
    : [];
  const guides = [...direct];
  for (const g of byId) if (!guides.some((x) => x.id === g.id)) guides.push(g);
  if (!guides.length && !extra?.tips?.length) return null;
  return { guides, extra: extra?.tips || [] };
}

const QUICK_GROUPS = [
  {
    label: "📝 Soạn dạy",
    items: [
      "Soạn mục tiêu bài học: Phép cộng trong phạm vi 10 (Toán 1)",
      "Soạn giáo án 45 phút: Luyện đọc — Tập đọc lớp 3",
      "Tạo ma trận đề 10 câu cho bài kiểm tra 15 phút Toán 4",
    ],
  },
  {
    label: "❓ Hỏi & kiểm tra",
    items: [
      "Tạo 5 câu hỏi trắc nghiệm Toán lớp 2 có đáp án",
      "Mẫu rubric chấm bài tự luận tiểu học",
      "Gợi ý 3 biến thể phân hoá cho HS nhanh / chuẩn / chậm",
    ],
  },
  {
    label: "🧭 Dùng app",
    items: [
      "Hướng dẫn thêm sách mới vào thư viện",
      "Cách quét SGK để tạo câu hỏi?",
      "Phím tắt nào hữu ích nhất khi đọc sách?",
      "Cách xuất giáo án ra Word?",
    ],
  },
];

function followUpsFor(text, lastQ) {
  const t = ((text || "") + " " + (lastQ || "")).toLowerCase();
  const out = [];
  if (/giáo án|khbd|kế hoạch/.test(t)) out.push("Tạo ma trận đề từ giáo án này?", "Gợi ý hoạt động khởi động 5 phút?");
  if (/trắc nghiệm|câu hỏi|đề/.test(t)) out.push("Tạo thêm 5 câu mức Vận dụng?", "Xuất các câu này thành phiếu học tập thế nào?");
  if (/quét|scan|ảnh|ocr/.test(t)) out.push("Hướng dẫn quét SGK để tạo quiz?", "Quét xong lưu ở đâu?");
  if (/thư viện|thêm sách|sách/.test(t)) out.push("Cách đánh dấu trang đang đọc?", "Cách tìm kiếm toàn văn trong sách?");
  if (/sao lưu|backup|thùng rác|mất/.test(t)) out.push("Cách khôi phục sách đã xóa?", "Sao lưu tự động bật ở đâu?");
  out.push("Tóm tắt lại ngắn gọn hơn?");
  return [...new Set(out)].slice(0, 3);
}

// ─── Markdown gọn (headings, lists, code, quote, table-lite) ──────────
function MarkdownText({ text }) {
  if (!text) return null;
  const renderInline = (str) => {
    const parts = String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
      if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={i} className="aia-code">{p.slice(1, -1)}</code>;
      return <React.Fragment key={i}>{p}</React.Fragment>;
    });
  };
  const lines = String(text).split("\n");
  const els = [];
  let ul = [], ol = [];
  const flush = () => {
    if (ul.length) { els.push(<ul key={`u${els.length}`} className="aia-md-ul">{ul}</ul>); ul = []; }
    if (ol.length) { els.push(<ol key={`o${els.length}`} className="aia-md-ol">{ol}</ol>); ol = []; }
  };
  lines.forEach((line, i) => {
    if (line.startsWith("### ")) { flush(); els.push(<h5 key={i} className="aia-md-h5">{renderInline(line.slice(4))}</h5>); }
    else if (line.startsWith("## ")) { flush(); els.push(<h4 key={i} className="aia-md-h4">{renderInline(line.slice(3))}</h4>); }
    else if (line.startsWith("# ")) { flush(); els.push(<h3 key={i} className="aia-md-h3">{renderInline(line.slice(2))}</h3>); }
    else if (/^>\s?/.test(line)) { flush(); els.push(<blockquote key={i} className="aia-md-quote">{renderInline(line.replace(/^>\s?/, ""))}</blockquote>); }
    else if (/^(-|\*)\s+/.test(line)) { if (ol.length) flush(); ul.push(<li key={i}>{renderInline(line.replace(/^(-|\*)\s+/, ""))}</li>); }
    else if (/^\d+\.\s/.test(line)) { if (ul.length) flush(); ol.push(<li key={i}>{renderInline(line.replace(/^\d+\.\s+/, ""))}</li>); }
    else if (line.trim() === "---" || line.trim() === "***") { flush(); els.push(<hr key={i} className="aia-md-hr" />); }
    else if (line.trim() === "") { flush(); }
    else { flush(); els.push(<p key={i} className="aia-md-p">{renderInline(line)}</p>); }
  });
  flush();
  return <div className="aia-md">{els}</div>;
}

// ─── Main ─────────────────────────────────────────────────────────────
export default function AssistantBubble({
  geminiKey, onOpenSettings, teacherMode = true, appContext = {}, onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(() => { try { return safeGetString(TAB_KEY, "chat") || "chat"; } catch { return "chat"; } });
  const [messages, setMessages] = useState(() => loadHistory());
  const [input, setInput] = useState(() => { try { return safeGetString(DRAFT_KEY, "") || ""; } catch { return ""; } });
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  // P2 • Hoàn tác lưu sổ tay (6s, theo mẫu Hoàn tác của App): chỉ khi thêm mới thật,
  // gộp trùng nghĩa thì không offer (xóa sẽ mất nghĩa cũ)
  const [undoSave, setUndoSave] = useState(null); // { msgId, entryId, word }
  const undoTimerRef = useRef(null);
  // P2 • Nghe bus dữ liệu để ngữ cảnh AI luôn tươi (kể cả tab khác đổi):
  // chỉ setState, KHÔNG emit → không loop.
  const [dataTick, setDataTick] = useState(0);
  const [lastDataEvent, setLastDataEvent] = useState(null); // { domain, at }
  useEffect(() => {
    let off = null;
    try {
      off = appEvents.on(AppEvents.DATA_UPDATED, (d) => {
        setDataTick((t) => t + 1);
        try { setLastDataEvent({ domain: (d && (d.domain || d.source)) || "dữ liệu", at: Date.now() }); } catch {}
      });
    } catch {}
    return () => { try { if (off) off(); } catch {} if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, []);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [guideQuery, setGuideQuery] = useState("");
  const [openGuide, setOpenGuide] = useState("start");
  const [followUps, setFollowUps] = useState([]);
  const [copyError, setCopyError] = useState("");
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);

  const wrapRef = useRef(null);
  const chatBodyRef = useRef(null);
  const guideListRef = useRef(null);
  const inputRef = useRef(null);
  const activeReqRef = useRef(null);
  const versionRef = useRef(0);
  const recogRef = useRef(null);
  // Chống double-send: nhánh offline không set loading nên bấm 2 chip liên tiếp
  // sẽ tính cùng `messages` cũ → mất 1 tin. Ref này khóa trong suốt send().
  const busyRef = useRef(false);
  // Gương của `open` cho pushBot: callback AI về sau khi user đã đóng panel
  // thì closure `open` cũ vẫn true → mất badge unread. Ref luôn đúng.
  const openRef = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);

  const viewLabel = appContext?.view ? getViewLabel(appContext.view) : null;
  const modelName = (() => { try { return loadSettings().ai?.model || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; } })();

  // Mẹo của màn hình đang mở — đổi màn hình là banner + tab Hướng dẫn cập nhật theo
  const currentView = appContext?.view || "dashboard";
  const viewTip = useMemo(() => getViewTip(currentView), [currentView]);
  const [tipDismissed, setTipDismissed] = useState(null);
  useEffect(() => { setTipDismissed(null); }, [currentView]);
  // Mở tới màn hình nào → tab Hướng dẫn tự mở đúng guide của màn hình đó
  useEffect(() => {
    if (viewTip?.guides?.length) setOpenGuide(viewTip.guides[0].id);
  }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps
  const openGuideDetail = (g) => { setOpenGuide(g.id); setTab("guide"); };
  const askAboutView = () => {
    const g0 = viewTip?.guides?.[0];
    setTab("chat");
    setTimeout(() => send(g0
      ? `Giải thích chi tiết cho giáo viên: ${g0.title} — ${g0.desc}. Các bước: ${g0.steps.map((s) => s.t).join("; ")}`
      : `Hướng dẫn chi tiết cho giáo viên cách dùng màn hình ${viewLabel || currentView} trong app Hành trang Tiểu học, từng bước cụ thể kèm phím tắt.`), 60);
  };

  const persist = (msgs) => {
    try { safeSetJSON(HISTORY_KEY, msgs.slice(-MAX_MSGS)); } catch {}
  };
  useEffect(() => { try { if (input.trim()) safeSetString(DRAFT_KEY, input); else safeRemove(DRAFT_KEY); } catch {} }, [input]);
  useEffect(() => { try { safeSetString(TAB_KEY, tab); } catch {} }, [tab]);

  const stopSpeech = () => { try { window.speechSynthesis?.cancel?.(); } catch {} };
  useEffect(() => () => { if (activeReqRef.current) aiService.cancelRequest(activeReqRef.current); versionRef.current += 1; try { recogRef.current?.stop?.(); } catch {} stopSpeech(); }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open ]);
  useEffect(() => { if (open) { setUnread(0); stopSpeech(); const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); } }, [open, tab]);
  // Chat: auto-scroll xuống cuối khi có tin mới; Guide: về đầu khi đổi tab/tìm kiếm
  useEffect(() => { if (tab === "chat" && chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight; }, [messages, loading, tab]);
  useEffect(() => { if (tab === "guide" && guideListRef.current) guideListRef.current.scrollTop = 0; }, [tab, guideQuery]);
  useEffect(() => { if (!confirmClear) return; const t = setTimeout(() => setConfirmClear(false), 3000); return () => clearTimeout(t); }, [confirmClear]);

  // Drag panel theo header
  const [dragging, setDragging] = useState(false);
  const [dragOff, setDragOff] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const onHeaderDown = (e) => {
    if (e.target.closest("button, input, textarea, a")) return;
    if (!panelRef.current) return;
    e.preventDefault(); setDragging(true);
    const r = panelRef.current.getBoundingClientRect();
    setDragOff({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  useEffect(() => {
    if (!dragging) return;
    const mv = (e) => {
      if (!panelRef.current) return;
      const x = Math.max(0, Math.min(e.clientX - dragOff.x, window.innerWidth - panelRef.current.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - dragOff.y, window.innerHeight - panelRef.current.offsetHeight));
      Object.assign(panelRef.current.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" });
    };
    const up = () => setDragging(false);
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
  }, [dragging, dragOff]);

  const callAI = async (body, requestId) => {
    let model = "gemini-2.5-flash";
    try { model = loadSettings().ai?.model || model; } catch {}
    try {
      return await aiService.callAI({ apiKey: geminiKey, model, contents: body.contents, systemInstruction: body.systemInstruction, generationConfig: body.generationConfig, requestId });
    } catch (err) {
      if (err?.status) throw err;
      const e = new Error(getFriendlyErrorMessage(err?.status, err?.message)); e.status = err?.status; e.code = err?.code; throw e;
    }
  };

  const pushBot = (base, extra) => {
    const next = [...base, { id: genId(), role: "assistant", at: Date.now(), ...extra }];
    setMessages(next); persist(next);
    if (!openRef.current) setUnread((u) => u + 1);
    setFollowUps(followUpsFor(extra.text, extra.retryText));
    return next;
  };

  const buildAppContext = async (query) => {
    const books = Array.isArray(appContext.books) ? appContext.books : [];
    let relevantText = [];
    try {
      const results = await searchAll(query, books);
      relevantText = results.flatMap((r) => r.hits.slice(0, 3).map((h) => ({ book: r.book.title || r.book.filename, page: h.page, snippet: h.snippet }))).slice(0, 6);
    } catch {}
    // P2 • số liệu thật lúc gửi (đọc live từ service nên luôn khớp,
    // kể cả tab khác vừa đổi): AI trả lời theo đúng sổ tay/kho của giáo viên.
    const counts = {};
    try { counts.vocab = getVocab().length; } catch {}
    try { counts.questions = getQuestions().length; } catch {}
    try { counts.activities = getActivities().length; } catch {}
    try { counts.worksheets = getWorksheets().length; } catch {}
    try { counts.lessonPlans = getPlans().length; } catch {}
    return {
      app: "Hành trang Tiểu học / SGK App",
      currentView: appContext.view || "dashboard",
      currentViewLabel: viewLabel,
      currentBook: appContext.currentBook ? { title: appContext.currentBook.title || appContext.currentBook.filename } : null,
      bookCount: books.length,
      relevantBookExtracts: relevantText,
      userDataCounts: counts,
      // P2 • số hiệu bản dữ liệu: mỗi DATA_UPDATED (kể cả từ tab khác) tăng 1,
      // AI biết ngữ cảnh vừa mới thay đổi mà không cần đọc lại toàn bộ kho.
      dataRevision: dataTick,
    };
  };

  // Điều hướng nhưng GIỮ panel mở để mẹo của màn hình mới hiện ra ngay
  const goView = (v) => {
    if (onNavigate) { try { onNavigate(v); } catch {} return; }
    // P2 • fallback qua bus thay vì window.dispatchEvent trực tiếp (đúng kiến trúc appEvents)
    try { appEvents.emit(AppEvents.NAVIGATE, { view: v, source: "assistant" }); } catch {}
  };

  const send = async (raw) => {
    const q = (raw ?? input).trim();
    if (!q || loading || busyRef.current) return;
    busyRef.current = true;
    setInput("");
    try { if (inputRef.current) inputRef.current.style.height = "auto"; } catch {}
    setFollowUps([]);
    const base = [...messages, { id: genId(), role: "user", text: q, at: Date.now() }];
    setMessages(base); persist(base);

    // 1) Ưu tiên trả lời OFFLINE bằng guide có sẵn (không cần mạng/key)
    const hits = matchGuides(q);
    const wantsGuide = wantsGuideAnswer(q);
    if (hits.length && (wantsGuide || !geminiKey)) {
      const g = hits[0];
      const others = hits.slice(1).map((x) => `· ${x.icon} ${x.title}`).join("\n");
      pushBot(base, {
        text: `## ${g.icon} ${g.title}\n\n${g.desc}\n\n${g.steps.map((s, i) => `${i + 1}. **${s.t}** — ${s.d}`).join("\n")}${others ? `\n\n> Liên quan:\n${others}` : ""}`,
        guideId: g.id,
        actions: g.view ? [{ view: g.view, label: getViewLabel(g.view) }] : [],
        retryText: q,
        offline: !geminiKey,
      });
      if (geminiKey && wantsGuide) {
        // vẫn gợi ý hỏi sâu thêm bằng AI ở follow-up
        setFollowUps([`Hỏi AI chi tiết về “${g.title}”?`, ...followUpsFor("", q)].slice(0, 3));
      }
      try { soundManager.play("aiComplete"); } catch {}
      busyRef.current = false;
      return;
    }

    // 2) Cần API key mới gọi AI
    if (!geminiKey) {
      pushBot(base, { text: "Chưa có API Key nên tôi chỉ trả lời được các câu **hướng dẫn dùng app** (đã có sẵn offline). Để hỏi tự do bằng AI, Thầy/cô dán key Gemini nhé — miễn phí, làm 1 lần 1 phút.", openSettings: true, retryText: q });
      busyRef.current = false;
      return;
    }

    setLoading(true);
    const requestId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    activeReqRef.current = requestId;
    const ver = ++versionRef.current;
    try {
      const history = messages.slice(-11).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
      const ctx = await buildAppContext(q);
      const body = {
        contents: [...history, { role: "user", parts: [{ text: q }] }],
        systemInstruction: { parts: [{ text: `${TEACHER_SYSTEM_PROMPT}\n\nNGỮ CẢNH APP HIỆN TẠI:\n${JSON.stringify(ctx, null, 2)}` }] },
        generationConfig: (() => {
          const s = loadSettings(); const L = { concise: 900, balanced: 2000, detailed: 3500 };
          return { temperature: Number.isFinite(s.ai?.temperature) ? s.ai.temperature : 0.5, maxOutputTokens: L[s.ai?.responseLength] || 2000 };
        })(),
      };
      const rawText = await callAI(body, requestId);
      if (ver !== versionRef.current) return;
      const { text, actions } = parseActions(rawText);
      pushBot(base, { text, actions, retryText: q });
      try { soundManager.play("aiComplete"); } catch {}
    } catch (err) {
      if (err?.code !== "CANCELLED" && ver === versionRef.current)
        pushBot(base, { text: `⚠️ ${err.message}`, error: true, retryText: q });
    } finally {
      if (activeReqRef.current === requestId) activeReqRef.current = null;
      setLoading(false);
      busyRef.current = false;
    }
  };

  const askAboutGuide = (g) => { setTab("chat"); setTimeout(() => send(`Giải thích chi tiết cho giáo viên: ${g.title} — ${g.desc}. Các bước: ${g.steps.map((s) => s.t).join("; ")}`), 60); };

  const clearChat = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    if (activeReqRef.current) aiService.cancelRequest(activeReqRef.current);
    versionRef.current += 1; setLoading(false); setMessages([]); persist([]); setFollowUps([]); setConfirmClear(false);
  };

  const downloadChat = (md) => {
    if (!messages.length) return;
    const content = md
      ? `# Hội thoại Trợ lý AI — ${new Date().toLocaleString("vi-VN")}\n\n` + messages.map((m) => `## ${m.role === "user" ? "🧑 Bạn" : "🤖 Trợ lý"}\n\n${m.text}`).join("\n\n---\n\n")
      : messages.map((m) => `${m.role === "user" ? "Bạn" : "Trợ lý AI"}:\n${m.text}`).join("\n\n---\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `tro-ly-ai-${new Date().toISOString().slice(0, 10)}.${md ? "md" : "txt"}`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const copyMsg = async (id, text) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    } catch { setCopyError("Không sao chép được — hãy chọn thủ công."); setTimeout(() => setCopyError(""), 3000); }
  };

  const saveToNotebook = (id, text) => {
    try {
      const idx = messages.findIndex((m) => m.id === id);
      let question = "";
      for (let i = idx - 1; i >= 0; i--) if (messages[i]?.role === "user") { question = messages[i].text; break; }
      const word = String(question || "").trim().slice(0, 80) || "Ghi chú từ Trợ lý AI";
      // P2 • guard: phát hiện gộp trùng y hệt userdata.addVocabEntry
      // (word + file "" + page null) → chỉ offer Hoàn tác khi thêm mới thật.
      // Gộp nghĩa cũ thì xóa sẽ mất nghĩa cũ nên không offer.
      let dup = null;
      try {
        const list = getVocab();
        dup = list.find((e) => e && e.word === word && (e.file || "") === "" && (e.page ?? null) === null) || null;
      } catch {}
      addVocabEntry({ word, meaning: String(text || "").slice(0, 1500), file: "", bookTitle: "", grade: null, page: null, tags: ["trợ lý ai"] });
      if (!dup) {
        let newId = null;
        try { newId = getVocab()[0]?.id || null; } catch {}
        if (newId) {
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          setUndoSave({ msgId: id, entryId: newId });
          undoTimerRef.current = setTimeout(() => setUndoSave(null), 6000);
        }
      }
      setSavedId(id); setTimeout(() => setSavedId((v) => (v === id ? null : v)), 2500);
    } catch { setCopyError("Không lưu được (bộ nhớ đầy?)."); setTimeout(() => setCopyError(""), 3000); }
  };

  // P2 • Hoàn tác lưu sổ tay trong 6s (khôi phục đúng trạng thái trước khi bấm Lưu)
  const undoNotebookSave = () => {
    if (!undoSave) return;
    try { removeVocabEntry(undoSave.entryId); } catch {}
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoSave(null);
    setSavedId(null);
  };

  const speak = (id, text) => {
    const synth = (() => { try { return window.speechSynthesis; } catch { return null; } })();
    if (!synth?.speak) { setCopyError("Trình duyệt không hỗ trợ đọc to."); setTimeout(() => setCopyError(""), 2500); return; }
    try {
      if (speakingId === id) { synth.cancel(); setSpeakingId(null); return; }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 1200));
      u.lang = "vi-VN"; u.onend = () => setSpeakingId(null); u.onerror = () => setSpeakingId(null);
      setSpeakingId(id); synth.speak(u);
    } catch { setCopyError("Trình duyệt không hỗ trợ đọc to."); setTimeout(() => setCopyError(""), 2500); }
  };

  const toggleListen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setCopyError("Trình duyệt chưa hỗ trợ nhập giọng nói (hãy dùng Chrome)."); setTimeout(() => setCopyError(""), 3000); return; }
    if (listening) { try { recogRef.current?.stop(); } catch {} setListening(false); return; }
    try {
      const r = new SR(); recogRef.current = r;
      r.lang = "vi-VN"; r.interimResults = false;
      r.onresult = (e) => {
        const t = e.results?.[0]?.[0]?.transcript;
        if (t) { setInput((v) => (v ? v + " " : "") + t); requestAnimationFrame(() => autoGrow(inputRef.current)); }
      };
      r.onend = () => setListening(false); r.onerror = () => setListening(false);
      r.start(); setListening(true);
    } catch { setListening(false); }
  };

  const fmtTime = (at) => { try { return new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  const filteredChat = useMemo(() => {
    const s = chatQuery.trim().toLowerCase();
    if (!s) return messages;
    const ns = norm(s);
    return messages.filter((m) => m.text.toLowerCase().includes(s) || norm(m.text).includes(ns));
  }, [messages, chatQuery]);

  const filteredGuides = useMemo(() => {
    const s = guideQuery.trim().toLowerCase();
    if (!s) return GUIDES;
    const ns = norm(s);
    return GUIDES.filter((g) => {
      const hay = (g.title + " " + g.desc + " " + g.keywords.join(" ") + " " + g.steps.map((x) => x.t + " " + x.d).join(" ")).toLowerCase();
      return hay.includes(s) || norm(hay).includes(ns);
    });
  }, [guideQuery]);

  const autoGrow = (el) => { if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 132) + "px"; };

  return (
    <div className="aia-wrap" ref={wrapRef}>
      {open && (
        <div id="aia-panel" role="dialog" aria-modal="true" aria-label="Trợ lý AI sư phạm"
          ref={panelRef} className={`aia-panel pro${expanded ? " expanded" : ""}`}>
          {/* Header */}
          <div className="aia-pro-head" onMouseDown={onHeaderDown}>
            <span className="aia-avatar" aria-hidden><Bot size={20} /></span>
            <span className="aia-pro-titles">
              <span className="aia-pro-name">Trợ lý AI <span className={`aia-status ${geminiKey ? "ok" : "warn"}`} title={geminiKey ? "AI đã sẵn sàng" : "Chưa có API key — vẫn dùng hướng dẫn offline"}>{geminiKey ? "● Sẵn sàng" : "● Offline"}</span></span>
              <span className="aia-pro-sub">{viewLabel ? `Đang ở ${viewLabel}` : "Giáo viên → Học sinh"} · {modelName}{lastDataEvent ? ` · Mới: ${dataDomainLabel(lastDataEvent.domain)}` : ""}</span>
            </span>
            <div className="aia-header-actions">
              <button className="aia-hbtn" onClick={() => setExpanded((v) => !v)} title={expanded ? "Thu gọn" : "Mở rộng"} aria-label={expanded ? "Thu gọn" : "Mở rộng"}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
              <button className={`aia-hbtn${confirmClear ? " confirm" : ""}`} onClick={clearChat} title="Xóa hội thoại" aria-label="Xóa hội thoại">{confirmClear ? "Chắc chắn?" : <Trash2 size={14} />}</button>
              <button className="aia-hbtn" onClick={() => downloadChat(true)} title="Tải hội thoại (.md)" aria-label="Tải hội thoại" disabled={!messages.length}><Download size={14} /></button>
              <button className="aia-hbtn" onClick={() => setOpen(false)} title="Đóng (Esc)" aria-label="Đóng"><X size={15} /></button>
            </div>
          </div>

          {/* Tabs */}
          <div className="aia-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "chat"} className={`aia-tab${tab === "chat" ? " active" : ""}`} onClick={() => setTab("chat")}><MessageCircle size={14} /> Trò chuyện {messages.length > 0 && <span className="aia-tab-count">{messages.length}</span>}</button>
            <button role="tab" aria-selected={tab === "guide"} className={`aia-tab${tab === "guide" ? " active" : ""}`} onClick={() => setTab("guide")}><Compass size={14} /> Hướng dẫn app</button>
            {!geminiKey && tab === "chat" && (
              <button className="aia-key-cta" onClick={onOpenSettings} title="Dán Gemini API key (miễn phí)"><Settings size={12} /> Lấy AI</button>
            )}
          </div>

          {tab === "chat" ? (
            <>
              {/* Banner mẹo của màn hình đang mở — mở tới đâu hiện mẹo tới đó */}
              {viewTip && tipDismissed !== currentView && (
                <div className="aia-viewtip" role="note" aria-label={`Mẹo cho ${viewLabel}`}>
                  <span className="aia-viewtip-icon" aria-hidden>📌</span>
                  <div className="aia-viewtip-text">
                    <strong>Mẹo {viewLabel || "màn hình này"}:</strong>{" "}
                    {viewTip.guides[0]
                      ? `${viewTip.guides[0].icon} ${viewTip.guides[0].title} — ${viewTip.guides[0].steps[0].t}: ${viewTip.guides[0].steps[0].d}`
                      : viewTip.extra[0]}
                  </div>
                  <div className="aia-viewtip-btns">
                    {viewTip.guides[0] && (
                      <button className="aia-viewtip-go" onClick={() => openGuideDetail(viewTip.guides[0])} title="Xem hướng dẫn chi tiết">Chi tiết</button>
                    )}
                    <button className="aia-viewtip-go ghost" onClick={askAboutView} title="Nhờ AI giải thích sâu">Hỏi AI</button>
                    <button className="aia-viewtip-x" onClick={() => setTipDismissed(currentView)} title="Ẩn mẹo màn hình này" aria-label="Ẩn mẹo"><X size={12} /></button>
                  </div>
                </div>
              )}
              {messages.length > 4 && (
                <div className="aia-search-row">
                  <Search size={13} />
                  <input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="Tìm trong hội thoại…" aria-label="Tìm trong hội thoại" />
                  {chatQuery && <button onClick={() => setChatQuery("")} aria-label="Xóa tìm kiếm"><X size={12} /></button>}
                </div>
              )}
              <div className="aia-body" ref={chatBodyRef} role="log" aria-live="polite">
                {messages.length === 0 && !loading && (
                  <div className="aia-welcome">
                    <div className="aia-welcome-hero">
                      <span className="aia-welcome-bot"><Sparkles size={22} /></span>
                      <div>
                        <strong>Xin chào Thầy/cô! 👋</strong>
                        <p>Tôi vừa là <b>trợ lý soạn dạy</b>, vừa là <b>hướng dẫn viên dùng app</b>. Hỏi gì cũng được — từ giáo án, đề kiểm tra đến “nút này ở đâu?”.</p>
                      </div>
                    </div>
                    {!geminiKey && (
                      <button className="aia-notice" onClick={onOpenSettings}>
                        <Settings size={13} /> Chưa có API Key — bấm để lấy key miễn phí (1 phút). Hướng dẫn app vẫn chạy offline.
                      </button>
                    )}
                    {QUICK_GROUPS.map((gr) => (
                      <div key={gr.label} className="aia-qgroup">
                        <div className="aia-qgroup-label">{gr.label}</div>
                        <div className="aia-chips">
                          {gr.items.map((s) => (
                            <button key={s} className="aia-chip" onClick={() => send(s)} disabled={loading} title={s}>{s.length > 44 ? s.slice(0, 44) + "…" : s}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button className="aia-guide-entry" onClick={() => setTab("guide")}><Map size={14} /> Mở bản đồ hướng dẫn app <ChevronRight size={14} /></button>
                  </div>
                )}

                {(chatQuery ? filteredChat : messages).map((m) => (
                  <div key={m.id} className={`aia-msg ${m.role === "user" ? "user" : m.error ? "error" : "bot"}`}>
                    {m.role === "user" ? <span>{m.text}</span> : (
                      <>
                        <MarkdownText text={m.text} />
                        {m.offline && <span className="aia-offline-tag">⚡ Trả lời offline — không cần mạng</span>}
                        {m.openSettings && (
                          <span className="aia-act-row">
                            <button className="btn btn-primary btn-sm aia-act-btn" onClick={onOpenSettings}><Settings size={13} /> Mở Cài đặt AI</button>
                            <a className="aia-mini-link" href="https://aistudio.google.com/" target="_blank" rel="noreferrer">aistudio.google.com <ExternalLink size={10} /></a>
                          </span>
                        )}
                        {Array.isArray(m.actions) && m.actions.length > 0 && (
                          <span className="aia-act-row">
                            {m.actions.map((a) => (
                              <button key={a.view} className="aia-goto" onClick={() => goView(a.view)} title={`Mở ${a.label}`}><ArrowRight size={12} /> Mở {a.label}</button>
                            ))}
                          </span>
                        )}
                        {m.guideId && (
                          <span className="aia-act-row">
                            <button className="aia-copy" onClick={() => { const g = GUIDES.find((x) => x.id === m.guideId); if (g) askAboutGuide(g); }} title="Nhờ AI giải thích sâu hơn"><Sparkles size={12} /> Giải thích sâu bằng AI</button>
                          </span>
                        )}
                        {!m.openSettings && (
                          <span className="aia-msg-actions">
                            {m.retryText && !loading && (
                              <button className="aia-copy" onClick={() => send(m.retryText)} title="Gửi lại"><RefreshCw size={12} /> {m.error ? "Thử lại" : "Làm mới"}</button>
                            )}
                            <button className="aia-copy" onClick={() => copyMsg(m.id, m.text)} title="Sao chép">{copiedId === m.id ? <><Check size={12} /> Đã chép</> : <><Copy size={12} /> Chép</>}</button>
                            {!m.error && (
                              <>
                                <button className="aia-copy" onClick={() => saveToNotebook(m.id, m.text)} title="Lưu vào Sổ tay từ vựng">{savedId === m.id ? <><Check size={12} /> Đã lưu</> : <><NotebookPen size={12} /> Sổ tay</>}</button>
                                {undoSave && undoSave.msgId === m.id && (
                                  <button className="aia-copy" onClick={undoNotebookSave} title="Xóa mục vừa lưu, về như trước khi bấm Lưu (6 giây)"><RefreshCw size={12} /> Hoàn tác</button>
                                )}
                                <button className="aia-copy" onClick={() => speak(m.id, m.text)} title="Đọc to / dừng">{speakingId === m.id ? <><VolumeX size={12} /> Dừng</> : <><Volume2 size={12} /> Đọc</>}</button>
                              </>
                            )}
                          </span>
                        )}
                      </>
                    )}
                    <span className="aia-msg-time">{fmtTime(m.at)}</span>
                  </div>
                ))}
                {chatQuery && filteredChat.length === 0 && (
                  <div className="aia-empty-note">Không tìm thấy “{chatQuery}” trong hội thoại.</div>
                )}

                {loading && (
                  <div className="aia-typing" aria-label="AI đang trả lời"><span /><span /><span /><em>AI đang soạn…</em></div>
                )}

                {!loading && followUps.length > 0 && messages.length > 0 && (
                  <div className="aia-follow">
                    <span className="aia-follow-label"><Lightbulb size={12} /> Hỏi tiếp:</span>
                    {followUps.map((f) => <button key={f} className="aia-chip sm" onClick={() => send(f)}>{f}</button>)}
                  </div>
                )}
              </div>
              {copyError && <div className="aia-error" role="status">{copyError}</div>}

              <form className="aia-input-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <button type="button" className={`aia-icon-btn${listening ? " live" : ""}`} onClick={toggleListen} title={listening ? "Dừng nghe" : "Nhập bằng giọng nói"} aria-label="Nhập giọng nói">{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>
                <textarea ref={inputRef} className="aia-input" value={input}
                  onChange={(e) => { setInput(e.target.value); autoGrow(e.target); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={geminiKey ? "Hỏi: giáo án, đề kiểm tra, hoặc “cách…” dùng app…" : "Hỏi cách dùng app (offline) — hoặc lấy API key để hỏi tự do…"}
                  disabled={loading} aria-label="Câu hỏi cho trợ lý AI" rows={1} />
                <button className="aia-send" type="submit"
                  disabled={!loading && !input.trim()}
                  onClick={(e) => { if (loading) { e.preventDefault(); if (activeReqRef.current) aiService.cancelRequest(activeReqRef.current); } }}
                  aria-label={loading ? "Dừng" : "Gửi"} title={loading ? "Dừng yêu cầu" : "Gửi (Enter)"}>
                  {loading ? <X size={18} /> : <Send size={17} />}
                </button>
              </form>
              <div className="aia-foot-hint"><Keyboard size={11} /> Enter gửi · Shift+Enter xuống dòng · Esc đóng</div>
            </>
          ) : (
            /* ── TAB HƯỚNG DẪN ── */
            <div className="aia-guide-tab">
              <div className="aia-search-row">
                <Search size={13} />
                <input value={guideQuery} onChange={(e) => setGuideQuery(e.target.value)} placeholder="Tìm hướng dẫn: giáo án, quét, sao lưu, phím tắt…" aria-label="Tìm hướng dẫn" />
                {guideQuery && <button onClick={() => setGuideQuery("")} aria-label="Xóa"><X size={12} /></button>}
                <span className="aia-count" title="Số hướng dẫn đang hiện">{filteredGuides.length}/{GUIDES.length}</span>
              </div>
              <div className="aia-guide-list" ref={guideListRef}>
                {filteredGuides.length === 0 && <div className="aia-empty-note">Không thấy hướng dẫn cho “{guideQuery}”. Thử từ khác hoặc hỏi AI ở tab Trò chuyện.</div>}
                {filteredGuides.map((g) => {
                  const isOpen = openGuide === g.id;
                  const isHere = g.view && g.view === currentView;
                  return (
                    <div key={g.id} className={`aia-guide-card${isOpen ? " open" : ""}${isHere ? " here" : ""}`}>
                      <button className="aia-guide-head" onClick={() => setOpenGuide(isOpen ? null : g.id)} aria-expanded={isOpen}>
                        <span className="aia-guide-icon">{g.icon}</span>
                        <span className="aia-guide-meta"><strong>{g.title} {isHere && <span className="aia-here-badge">📌 Đang ở đây</span>}</strong><small>{g.desc}</small></span>
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      {isOpen && (
                        <div className="aia-guide-body">
                          <ol>{g.steps.map((s, i) => <li key={i}><strong>{s.t}.</strong> {s.d}</li>)}</ol>
                          <div className="aia-act-row">
                            {g.view && <button className="aia-goto" onClick={() => goView(g.view)}><ArrowRight size={12} /> Mở {getViewLabel(g.view)}</button>}
                            <button className="aia-copy" onClick={() => askAboutGuide(g)}><Sparkles size={12} /> Hỏi AI chi tiết</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="aia-appmap">
                  <div className="aia-appmap-title"><GraduationCap size={13} /> Bản đồ app — bấm để đi ngay</div>
                  <div className="aia-appmap-grid">
                    {APP_VIEWS.map((v) => (
                      <button key={v.id} className={`aia-appmap-item${v.id === currentView ? " here" : ""}`} onClick={() => goView(v.id)} title={v.id === currentView ? `Đang ở ${v.label} — ${v.desc}` : v.desc}><span>{v.icon}</span><small>{v.id === currentView ? `📍 ${v.label}` : v.label}</small></button>
                    ))}
                  </div>
                  <div className="aia-act-row">
                    <button className="aia-copy" onClick={() => goView("help")}><BookOpen size={12} /> Mở Trợ giúp chi tiết</button>
                    <button className="aia-copy" onClick={() => onOpenSettings?.("keyboard")}><Keyboard size={12} /> Đổi phím tắt</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <button className={`aia-fab pro${!geminiKey && !open ? " pulse" : ""}`} onClick={() => setOpen((o) => !o)}
        title={open ? "Đóng trợ lý (Esc)" : geminiKey ? "Trợ lý AI — hỏi & hướng dẫn app" : "Trợ lý AI — hướng dẫn app (chưa có API key)"}
        aria-label={open ? "Đóng trợ lý" : "Mở trợ lý AI"} aria-expanded={open} aria-controls="aia-panel">
        {open ? <X size={24} /> : <><Bot size={26} /><span className="aia-fab-spark"><Sparkles size={13} /></span>{unread > 0 && <span className="aia-badge">{unread > 9 ? "9+" : unread}</span>}</>}
      </button>
    </div>
  );
}
