import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Clock,
  Bookmark,
  NotebookPen,
  BarChart3,
  Lightbulb,
  FileText,
  Puzzle,
  Database,
  ListChecks,
  ClipboardCheck,
  ArrowRight,
  Plus,
  Check,
  X,
  Sparkles,
  Search,
  Grid3x3,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Palette,
  Scissors,
} from "lucide-react";
import { getTasks, toggleTaskComplete } from "./personalDB";
import { getIdeas } from "./personalDB";
import { getQuestions } from "./teachingDB";
import { getPlans as getKhbdPlans } from "./khbd/planModel";
import MissionWidget from "./MissionWidget";
import ScanHistory from "./scan/ScanHistory";
import { getScans } from "./scan/scanStore";
import { loadSettings } from "./settingsStore";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "./safeStorage";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { bookProgress } from "./readingProgress.js";

export default function DashboardView({
  books,
  history,
  totalBookmarks,
  vocabCount,
  plansCount,
  questionCount,
  totalClips,
  totalMarks,
  lastPageMap,
  lastTotalMap,
  onNavigate,
}) {
  const [tasks, setTasks] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [lessonPlans, setLessonPlans] = useState([]);
  const [showAllTools, setShowAllTools] = useState(false);
  const [toolQuery, setToolQuery] = useState("");
  const [workflowCollapsed, setWorkflowCollapsed] = useState(() => {
    try {
      return safeGetString("sgk_workflow_collapsed", "false") === "true";
    } catch (e) {
      console.warn("[DashboardView] safeGetString failed for sgk_workflow_collapsed", e);
      return false;
    }
  });
  const [scans, setScans] = useState(() => getScans());
  const [whiteboards, setWhiteboards] = useState(() => {
    try {
      const idx = safeGetJSON("sgk_wb_index", [], Array.isArray);
      return Array.isArray(idx) ? idx.slice(0, 3) : [];
    } catch (e) {
      console.warn("[DashboardView] safeGetJSON failed for sgk_wb_index", e);
      return [];
    }
  });
  const [conceptsCount, setConceptsCount] = useState(0);
  const [refsCount, setRefsCount] = useState(0);
  // A3 • Trạng thái sao lưu — hiện trên hero để không bao giờ quên
  const [backupStatus, setBackupStatus] = useState(null);
  const displayName = (()=>{ try{ return loadSettings().general?.displayName || ""; }catch{ return ""; }})();

  // Load data — thống nhất qua storage.js + IndexedDB, đồng bộ toàn app via appEvents
  useEffect(() => {
    const load = async () => {
      setTasks(getTasks());
      setIdeas(getIdeas());
      setLessonPlans(getKhbdPlans());
      setScans(getScans());
      try {
        const idx = safeGetJSON("sgk_wb_index", [], Array.isArray);
        setWhiteboards(Array.isArray(idx) ? idx.slice(0, 3) : []);
      } catch (e) {
        console.warn("[DashboardView] safeGetJSON failed for sgk_wb_index", e);
      }
      try {
        const { getConcepts } = await import("./researchDB.js");
        const { getRefs } = await import("./researchDB.js");
        const [c, r] = await Promise.all([getConcepts(), getRefs()]);
        setConceptsCount(Array.isArray(c) ? c.length : 0);
        setRefsCount(Array.isArray(r) ? r.length : 0);
      } catch {}
      // A3 • tính mốc sao lưu gần nhất (thủ công hoặc tự động)
      try {
        const autoBackup = await import("./autoBackup.js");
        const meta = autoBackup.getAutoBackupMeta();
        const s = loadSettings();
        const manualIso = s.backup?.lastBackupTime;
        const manual = manualIso ? (Date.parse(manualIso) || 0) : Number(safeGetString("sgk_last_backup", "0")) || 0;
        const auto = Number(meta.lastSuccess) || 0;
        const at = Math.max(manual, auto);
        setBackupStatus({
          at,
          never: !at,
          stale: !at || Date.now() - at > 7 * 86400000,
          autoAt: auto,
        });
      } catch { setBackupStatus({ at: 0, never: true, stale: true, autoAt: 0 }); }
    };
    load();
    const h = () => load();
    const off1 = appEvents.on(AppEvents.DATA_UPDATED, h);
    const off2 = appEvents.on(AppEvents.WHITEBOARD_UPDATED, h);
    const off3 = appEvents.on(AppEvents.INDEX_READY, h);
    return () => {
      off1(); off2(); off3();
    };
  }, []);

  useEffect(() => {
    if (!showAllTools) return;
    setToolQuery("");
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowAllTools(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAllTools]);

  // Refresh scans when scan-saved event fires — via appEvents
  useEffect(() => {
    const onScanSaved = () => setScans(getScans());
    const off = appEvents.on(AppEvents.SCAN_SAVED, onScanSaved);
    const off2 = appEvents.on(AppEvents.DATA_UPDATED, onScanSaved);
    return () => {
      off(); off2();
    };
  }, []);

  // Tính toán thống nhất toàn app — sách Word/PDF, bookmark, vocab, clips, marks
  const totalBooks = books?.length || 0;
  const wordBooks = books?.filter(b=> /\.(html|htm|txt|md)$/i.test(b.filename||"")).length || 0;
  const pdfBooks = totalBooks - wordBooks;
  const continueCount = history?.length || 0;
  const pendingTasks = tasks.filter((t) => !t.completed).length;
  const totalIdeas = ideas?.length || 0;

  const kpiCards = [
    {
      id: "books",
      icon: <BookOpen size={20} />,
      label: "Sách",
      value: totalBooks,
      sub: wordBooks ? `${pdfBooks} PDF · ${wordBooks} Word` : undefined,
      color: "var(--pen-blue)",
      bg: "var(--pen-blue-soft)",
    },
    {
      id: "continue",
      icon: <Clock size={20} />,
      label: "Đang đọc",
      value: continueCount,
      color: "var(--success)",
      bg: "var(--success-soft)",
    },
    {
      id: "bookmarks",
      icon: <Bookmark size={20} />,
      label: "Đánh dấu",
      value: totalBookmarks || 0,
      color: "var(--warning)",
      bg: "var(--warning-soft)",
    },
    {
      id: "vocab",
      icon: <NotebookPen size={20} />,
      label: "Từ vựng",
      value: vocabCount || 0,
      color: "var(--pen-blue)",
      bg: "var(--pen-blue-soft)",
    },
    {
      id: "clips",
      icon: <Scissors size={20} />,
      label: "Trích đoạn",
      value: totalClips || 0,
      color: "var(--primary)",
      bg: "var(--primary-light)",
    },
    {
      id: "tasks",
      icon: <ClipboardCheck size={20} />,
      label: "Nhiệm vụ",
      value: pendingTasks,
      color: "var(--warning)",
      bg: "var(--warning-soft)",
    },
    {
      id: "plans",
      icon: <FileText size={20} />,
      label: "Giáo án",
      value: plansCount,
      color: "var(--purple)",
      bg: "var(--purple-soft)",
    },
    {
      id: "ideas",
      icon: <Lightbulb size={20} />,
      label: "Ý tưởng",
      value: totalIdeas,
      color: "var(--red-action)",
      bg: "var(--danger-soft)",
    },
    {
      id: "whiteboard",
      icon: <Palette size={20} />,
      label: "Bảng trắng",
      value: whiteboards.length,
      color: "var(--primary)",
      bg: "var(--primary-light)",
    },
    {
      id: "marks",
      icon: <Bookmark size={20} />,
      label: "Ghi chú",
      value: totalMarks || 0,
      color: "var(--success)",
      bg: "var(--success-soft)",
    },
    {
      id: "concepts",
      icon: <Lightbulb size={20} />,
      label: "Khái niệm",
      value: conceptsCount,
      color: "var(--purple)",
      bg: "var(--purple-soft)",
    },
    {
      id: "refs",
      icon: <BookOpen size={20} />,
      label: "Tham khảo",
      value: refsCount,
      color: "var(--pen-blue)",
      bg: "var(--pen-blue-soft)",
    },
  ];

  // Quick Actions — thống nhất toàn app, thêm Word
  const mainQuickActions = [
    {
      id: "read",
      icon: <BookOpen size={20} />,
      label: "Tiếp tục đọc",
      description: "Đọc sách từ thư viện",
      view: "continue",
    },
    {
      id: "word",
      icon: <FileText size={20} />,
      label: "Soạn Word",
      description: "Tạo sách Word mới",
      view: "word",
    },
    {
      id: "lessonplans",
      icon: <FileText size={20} />,
      label: "Soạn giáo án",
      description: "Tạo giáo án mới",
      view: "lessonplans",
    },
    {
      id: "questionbank",
      icon: <Database size={20} />,
      label: "Tạo câu hỏi",
      description: "Thêm vào ngân hàng câu hỏi",
      view: "questionbank",
    },
    {
      id: "research",
      icon: <Search size={20} />,
      label: "Nghiên cứu",
      description: "Tìm kiếm và so sánh",
      view: "search",
    },
    {
      id: "whiteboard",
      icon: <Palette size={20} />,
      label: "Bảng trắng",
      description: "Vẽ sơ đồ tư duy",
      view: "whiteboard",
    },
  ];

  // All Tools — đồng bộ navigationConfig toàn app
  const allTools = [
    {
      id: "library",
      icon: <BookOpen size={18} />,
      label: "Thư viện sách",
      view: "library",
    },
    {
      id: "word",
      icon: <FileText size={18} />,
      label: "Soạn Word",
      view: "word",
    },
    {
      id: "whiteboard",
      icon: <Palette size={18} />,
      label: "Bảng trắng",
      view: "whiteboard",
    },
    {
      id: "continue",
      icon: <Clock size={18} />,
      label: "Tiếp tục đọc",
      view: "continue",
    },
    {
      id: "marks",
      icon: <Bookmark size={18} />,
      label: "Đánh dấu",
      view: "marks",
    },
    {
      id: "vocab",
      icon: <NotebookPen size={18} />,
      label: "Từ vựng",
      view: "vocab",
    },
    {
      id: "search",
      icon: <Search size={18} />,
      label: "Tìm kiếm",
      view: "search",
    },
    {
      id: "compare",
      icon: <Grid3x3 size={18} />,
      label: "So sánh",
      view: "compare",
    },
    {
      id: "matrix",
      icon: <ClipboardCheck size={18} />,
      label: "Ma trận",
      view: "matrix",
    },
    {
      id: "concepts",
      icon: <Lightbulb size={18} />,
      label: "Khái niệm",
      view: "concepts",
    },
    {
      id: "references",
      icon: <BookOpen size={18} />,
      label: "Tài liệu tham khảo",
      view: "references",
    },
    {
      id: "collections",
      icon: <ListChecks size={18} />,
      label: "Bộ công cụ dữ liệu",
      view: "collections",
    },
    {
      id: "lessonplans",
      icon: <FileText size={18} />,
      label: "Giáo án",
      view: "lessonplans",
    },
    {
      id: "activities",
      icon: <Puzzle size={18} />,
      label: "Hoạt động",
      view: "activities",
    },
    {
      id: "questionbank",
      icon: <Database size={18} />,
      label: "Ngân hàng câu hỏi",
      view: "questionbank",
    },
    {
      id: "worksheets",
      icon: <ListChecks size={18} />,
      label: "Phiếu học tập",
      view: "worksheets",
    },
    {
      id: "ideas",
      icon: <Lightbulb size={18} />,
      label: "Ý tưởng dạy học",
      view: "ideas",
    },
    {
      id: "tasks",
      icon: <ClipboardCheck size={18} />,
      label: "Nhiệm vụ",
      view: "tasks",
    },
    {
      id: "stats",
      icon: <BarChart3 size={18} />,
      label: "Thống kê học tập",
      view: "stats",
    },
    {
      id: "internship",
      icon: <ClipboardCheck size={18} />,
      label: "Thực tập",
      view: "internship",
    },
  ];

  const handleNavigate = (view, opts) => {
    if (view === "word") {
      try { appEvents.emit(AppEvents.OPEN_WORD_EDITOR, {}); } catch {}
      return;
    }
    // Hub nhiệm vụ (`tasks` = MissionsView daily + việc cần làm): đi qua onNavigate → App.closeBook,
    // closeBook tự hub-emit để MissionsView đã mount đổi tab. Không emit ở đây để tránh double.
    if (onNavigate) {
      onNavigate(view, opts);
    }
  };

  const filteredTools = allTools.filter((tool) =>
    tool.label.toLowerCase().includes(toolQuery.trim().toLowerCase()),
  );

  const handleToggleTask = (taskId) => {
    // Đồng bộ nhiệm vụ: đi qua personalDB để emit TASK_COMPLETED + DATA_UPDATED duy nhất
    try { toggleTaskComplete(taskId); } catch (e) { console.warn("[DashboardView] toggleTaskComplete failed", e); }
    try { setTasks(getTasks()); } catch { setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, completed: !t.completed } : t)); }
  };

  // Continue learning cards (tiến độ chuẩn readingProgress.js — đồng bộ Thư viện)
  const continueBooks = history
    .slice(0, 4)
    .map((item) => {
      const book = books.find((b) => b.filename === item.filename);
      if (!book) return null;
      const { page, total, pct } = bookProgress(book.filename, lastPageMap, lastTotalMap);
      return {
        book,
        lastPage: page,
        totalPages: total,
        progress: pct,
      };
    })
    .filter(Boolean);

  // Tasks preview (pending tasks only, max 5)
  const pendingTasksList = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => {
      if (a.priority === "high" && b.priority !== "high") return -1;
      if (a.dueDate && b.dueDate)
        return new Date(a.dueDate) - new Date(b.dueDate);
      return 0;
    })
    .slice(0, 5);

  // Activity chart data (simple bar chart using real data)
  const hasActivityData =
    continueCount > 0 || plansCount > 0 || questionCount > 0;
  const activityData = [
    { label: "Đọc sách", value: continueCount, color: "var(--pen-blue)" },
    { label: "Giáo án", value: plansCount, color: "var(--success)" },
    { label: "Câu hỏi", value: questionCount, color: "var(--warning)" },
    { label: "Ý tưởng", value: totalIdeas, color: "var(--purple)" },
    { label: "Word", value: wordBooks, color: "var(--primary)" },
    { label: "Bảng trắng", value: whiteboards.length, color: "var(--primary-light)" },
  ];
  const maxActivityValue = Math.max(...activityData.map((d) => d.value), 1);
  // Phân bố môn học — hiển thị hợp lý, đồng bộ thư viện (top 6, có Word/PDF)
  const subjectCounts = books.reduce((acc,b)=>{ const s=b.subject||"Khác"; acc[s]=(acc[s]||0)+1; return acc; },{});
  const subjectEntries = Object.entries(subjectCounts).sort((a,b)=> b[1]-a[1]);
  const displaySubjects = subjectEntries.length ? subjectEntries.slice(0,6) : [];
  const hasSubjects = displaySubjects.length>0;

  // Insight thật 100% từ dữ liệu (không ước lượng)
  const completedTasks = tasks.filter((t) => t.completed).length;
  const taskRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const todayLabel = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

  // Cột phải co giãn bằng thanh kéo ở giữa (nhớ độ rộng)
  const [sideW, setSideW] = useState(() => {
    try {
      const v = parseInt(safeGetString("sgk_db_sidew", "330"), 10);
      return Number.isFinite(v) ? Math.min(520, Math.max(260, v)) : 330;
    } catch { return 330; }
  });
  const sideWRef = React.useRef(sideW);
  sideWRef.current = sideW;
  const startDivDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWRef.current;
    const onMove = (ev) => {
      const nw = Math.min(520, Math.max(260, Math.round(startW + (startX - ev.clientX))));
      setSideW(nw);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try { safeSetString("sgk_db_sidew", String(sideWRef.current)); } catch {}
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const workflowStages = [
    { id: "read", label: "Đọc hiểu", count: continueCount, icon: <BookOpen size={19} />, view: "continue" },
    { id: "word", label: "Soạn Word", count: wordBooks, icon: <FileText size={19} />, view: "word" },
    { id: "plans", label: "Giáo án", count: plansCount, icon: <FileText size={19} />, view: "lessonplans" },
    { id: "acts", label: "Hoạt động", count: lessonPlans.length, icon: <Puzzle size={19} />, view: "activities" },
    { id: "bank", label: "Câu hỏi", count: questionCount, icon: <Database size={19} />, view: "questionbank" },
    { id: "research", label: "Nghiên cứu", count: (totalClips || 0) + conceptsCount + refsCount, icon: <Search size={19} />, view: "search" },
    { id: "board", label: "Bảng trắng", count: whiteboards.length, icon: <Palette size={19} />, view: "whiteboard" },
  ];

  return (
    <div className="db-root">
      <style>{`
        .db-root { display:flex; flex-direction:column; gap:14px; }
        .db-hero { position:relative; overflow:hidden; border-radius:16px; padding:20px 22px; color:#fff;
          background:linear-gradient(120deg, var(--color-action-strong, #1e3a8a) 0%, var(--color-action, #2563eb) 55%, #8b5cf6 100%);
          box-shadow:0 12px 30px color-mix(in srgb, var(--color-action, #2563eb) 28%, transparent); }
        .db-hero::after { content:""; position:absolute; right:-70px; top:-70px; width:250px; height:250px; border-radius:50%;
          background:radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 65%); pointer-events:none; }
        .db-hero::before { content:""; position:absolute; right:60px; bottom:-90px; width:190px; height:190px; border-radius:50%;
          background:radial-gradient(circle, rgba(255,255,255,0.13) 0%, transparent 65%); pointer-events:none; }
        .db-hello { margin:0; font-size:1.35rem; font-weight:800; letter-spacing:-0.2px; }
        .db-date { margin:5px 0 0; font-size:12.5px; opacity:0.92; }
        .db-hero-sub { margin:8px 0 0; font-size:12.5px; opacity:0.92; display:flex; gap:7px; flex-wrap:wrap; }
        .db-hero-sub b { background:rgba(255,255,255,0.18); padding:2px 9px; border-radius:999px; font-weight:700; }
        .db-quick { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:9px; margin-top:15px; position:relative; z-index:1; }
        .db-qa { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.25);
          background:rgba(255,255,255,0.14); color:#fff; cursor:pointer; font-size:13px; font-weight:700; backdrop-filter:blur(6px); text-align:left; }
        .db-qa:hover { background:rgba(255,255,255,0.24); }
        .db-qa small { display:block; font-size:10.5px; font-weight:500; opacity:0.85; }
        .db-qa-ic { width:34px; height:34px; border-radius:10px; background:rgba(255,255,255,0.22); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
        .db-sec { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; }
        .db-sec-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:11px; }
        .db-sec-title { margin:0; font-size:0.95rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:8px; }
        .db-sec-title svg { color:var(--color-action, var(--primary)); }
        .db-kpis { display:grid; grid-template-columns:repeat(auto-fill, minmax(128px, 1fr)); gap:9px; }
        .db-kpi { display:flex; align-items:center; gap:10px; padding:10px 11px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; transition:transform 0.13s ease, box-shadow 0.13s ease; }
        .db-kpi:hover { transform:translateY(-2px); box-shadow:0 8px 18px rgba(15,23,42,0.09); }
        .db-kpi-ic { width:36px; height:36px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
        .db-kpi-val { font-size:1.12rem; font-weight:800; color:var(--text-dark); line-height:1.1; }
        .db-kpi-label { font-size:10.5px; color:var(--text-muted); font-weight:600; }
        .db-kpi-sub { font-size:9.5px; color:var(--text-muted); }
        .db-pipe { display:flex; align-items:stretch; gap:0; overflow-x:auto; padding-bottom:2px; }
        .db-stage { flex:1 1 0; min-width:104px; display:flex; flex-direction:column; align-items:center; gap:5px; background:none; border:none; padding:6px 4px; border-radius:10px; cursor:pointer; position:relative; }
        .db-stage:hover { background:var(--color-action-soft, #eff6ff); }
        .db-stage::before { content:""; position:absolute; top:24px; left:calc(-50% + 26px); right:calc(50% + 26px); height:2px; border-radius:99px; background:#e2e8f0; }
        .db-stage:first-child::before { display:none; }
        .db-stage-ic { width:38px; height:38px; border-radius:12px; background:var(--color-action-soft, var(--primary-light)); color:var(--color-action-strong, var(--primary)); display:inline-flex; align-items:center; justify-content:center; position:relative; z-index:1; border:1px solid var(--border-color); }
        .db-stage-label { font-size:11px; font-weight:700; color:var(--text-dark); white-space:nowrap; }
        .db-stage-count { font-size:10px; font-weight:800; color:var(--color-action-strong, var(--primary)); background:var(--color-action-soft, var(--primary-light)); padding:1px 8px; border-radius:999px; }
        .db-main { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; align-items:start; }
        .db-div { display:none; align-items:stretch; justify-content:center; cursor:ew-resize; border-radius:8px; min-height:120px; }
        @media (min-width: 1100px) { .db-main { grid-template-columns:minmax(0,1fr) 12px minmax(0, var(--db-side, 330px)); gap:0 10px; } .db-div { display:flex; } }
        .db-div:hover .db-div-bar, .db-div:active .db-div-bar { background:var(--color-action, var(--primary)); }
        .db-div-bar { width:4px; border-radius:99px; background:#e2e8f0; position:relative; transition:background 0.15s ease; }
        .db-div-bar::after { content:"⋮"; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:11px; font-weight:800; color:#94a3b8; background:var(--surface); border:1px solid #e2e8f0; border-radius:99px; width:18px; height:30px; display:flex; align-items:center; justify-content:center; }
        .db-div:hover .db-div-bar::after { color:var(--color-action-strong, var(--primary)); border-color:var(--color-action, var(--primary)); }
        .db-col { display:flex; flex-direction:column; gap:14px; min-width:0; }
        .db-item { display:flex; gap:10px; align-items:center; padding:9px 10px; border-radius:10px; border:1px solid transparent; cursor:pointer; }
        .db-item:hover { background:var(--surface-soft); border-color:var(--border-color); }
        .db-item-ic { width:36px; height:36px; border-radius:10px; background:var(--color-action-soft, var(--primary-light)); color:var(--color-action-strong, var(--primary)); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; font-size:11px; font-weight:800; }
        .db-item-t { font-size:0.85rem; font-weight:700; color:var(--text-dark); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
        .db-item-m { font-size:11px; color:var(--text-muted); }
        .db-bar { height:7px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; margin-top:6px; }
        .db-bar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, var(--primary)); }
        .db-link { display:inline-flex; align-items:center; gap:4px; background:none; border:none; color:var(--color-action-strong, var(--primary)); font-size:12px; font-weight:800; cursor:pointer; padding:8px 4px 0; }
        .db-check { width:21px; height:21px; border-radius:7px; border:2px solid #cbd5e1; background:#fff; display:inline-flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; flex-shrink:0; }
        .db-check.on { background:#16a34a; border-color:#16a34a; }
        .db-abars { display:flex; flex-direction:column; gap:9px; }
        .db-abar { display:grid; grid-template-columns:96px 1fr 30px; gap:9px; align-items:center; font-size:12px; }
        .db-abar-track { height:9px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; }
        .db-abar-fill { height:100%; border-radius:99px; min-width:3px; }
        .db-abar-val { font-weight:800; color:var(--text-dark); text-align:right; }
        .db-subj { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:9px; }
        .db-subj-card { border:1px solid var(--border-color); border-radius:11px; padding:10px 12px; cursor:pointer; background:var(--surface); }
        .db-subj-card:hover { border-color:var(--color-action, var(--primary)); }
        .db-insights { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:9px; }
        .db-insight { border-radius:12px; padding:13px 14px; color:#fff; position:relative; overflow:hidden; }
        .db-insight small { font-size:11px; opacity:0.9; font-weight:600; }
        .db-insight b { display:block; font-size:1.5rem; font-weight:800; margin-top:2px; }
        .db-tools-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:9px; }
        .db-tool { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; font-size:13px; font-weight:700; color:var(--text-dark); text-align:left; }
        .db-tool:hover { border-color:var(--color-action, var(--primary)); box-shadow:0 6px 16px rgba(15,23,42,0.08); }
        .db-tool-ic { width:32px; height:32px; border-radius:9px; background:var(--color-action-soft, var(--primary-light)); color:var(--color-action-strong, var(--primary)); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>

      {/* Hero */}
      <div className="db-hero">
        <h1 className="db-hello">Chào {displayName ? displayName : "thầy/cô"} 👋</h1>
        <p className="db-date">{todayLabel}</p>
        <div className="db-hero-sub">
          <b>📚 {totalBooks} sách</b>
          {wordBooks > 0 && <b>📝 {wordBooks} Word</b>}
          {pendingTasks > 0 ? <b>📌 {pendingTasks} việc cần làm</b> : <b>✅ Không còn việc tồn</b>}
          {scans.length > 0 && <b>📷 {scans.length} scan SGK</b>}
        </div>
        {/* A3 • Dấu mốc sao lưu — bấm là mở Sao lưu & Khôi phục */}
        {backupStatus && (
          <button
            type="button"
            onClick={() => handleNavigate("datatools")}
            title="Mở Sao lưu & Khôi phục"
            className="db-backup-pill"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, margin: "0 0 8px",
              padding: "4px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700,
              cursor: "pointer",
              border: `1px solid ${(backupStatus.never || backupStatus.stale) ? "rgba(245,158,11,0.45)" : "var(--border-color)"}`,
              background: (backupStatus.never || backupStatus.stale) ? "rgba(245,158,11,0.12)" : "var(--surface)",
              color: (backupStatus.never || backupStatus.stale) ? "var(--warning-deep, #b45309)" : "var(--text-mid)",
            }}
          >
            {backupStatus.never
              ? "⚠️ Chưa từng sao lưu — bấm để sao lưu ngay"
              : backupStatus.stale
                ? `💾 Đã ${Math.max(1, Math.round((Date.now() - backupStatus.at) / 86400000))} ngày chưa sao lưu — bấm vào đây`
                : `💾 Đã sao lưu ${new Date(backupStatus.at).toLocaleString("vi-VN")}`}
          </button>
        )}
        <div className="db-quick">
          {mainQuickActions.map((action) => (
            <button key={action.id} className="db-qa" onClick={() => handleNavigate(action.view)}>
              <span className="db-qa-ic">{action.icon}</span>
              <span>{action.label}<small>{action.description}</small></span>
            </button>
          ))}
          <button className="db-qa" onClick={() => setShowAllTools(true)}>
            <span className="db-qa-ic"><MoreHorizontal size={20} /></span>
            <span>Tất cả công cụ<small>{allTools.length} khu vực</small></span>
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="db-sec">
        <div className="db-sec-head">
          <h2 className="db-sec-title"><BarChart3 size={16} /> Tổng quan số liệu</h2>
        </div>
        <div className="db-kpis">
          {kpiCards.map((card) => {
            const viewMap = { books:"library", continue:"continue", bookmarks:"marks", vocab:"vocab", clips:"collections", tasks:"tasks", plans:"lessonplans", ideas:"ideas", whiteboard:"whiteboard", marks:"marks", concepts:"concepts", refs:"references" };
            const targetView = viewMap[card.id];
            // KPI Nhiệm vụ mở thẳng tab việc cần làm trong hub; các KPI khác mở view tương ứng
            const go = () => { if (targetView) handleNavigate(targetView, card.id === "tasks" ? { tab: "tasks" } : undefined); };
            return (
              <div key={card.id} className="db-kpi" onClick={go}
                role={targetView ? "button" : undefined} tabIndex={targetView ? 0 : undefined}
                onKeyDown={(e) => targetView && e.key === "Enter" && go()} title={card.sub || card.label}>
                <span className="db-kpi-ic" style={{ color: card.color, background: card.bg }}>{card.icon}</span>
                <span><span className="db-kpi-val">{card.value}</span><br /><span className="db-kpi-label">{card.label}</span>
                {card.sub && <><br /><span className="db-kpi-sub">{card.sub}</span></>}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quy trình dạy học — bấm vào từng chặng để đi tới */}
      <div className="db-sec">
        <div className="db-sec-head">
          <h2 className="db-sec-title"><LayoutDashboard size={16} /> Quy trình dạy học</h2>
          <button className="btn btn-ghost btn-xs" onClick={() => {
              const next = !workflowCollapsed;
              setWorkflowCollapsed(next);
              try { safeSetString("sgk_workflow_collapsed", next ? "true" : "false"); } catch (e) { console.warn("[DashboardView] save workflow_collapsed failed", e); }
            }}
            aria-label={workflowCollapsed ? "Mở Quy trình dạy học" : "Thu hồi Quy trình dạy học"} aria-expanded={!workflowCollapsed}>
            {workflowCollapsed ? <><ChevronDown size={14} /> Mở</> : <><ChevronUp size={14} /> Thu hồi</>}
          </button>
        </div>
        {!workflowCollapsed && (
          <div className="db-pipe">
            {workflowStages.map((s) => (
              <button key={s.id} className="db-stage" onClick={() => handleNavigate(s.view)} title={`Đi tới ${s.label}`}>
                <span className="db-stage-ic">{s.icon}</span>
                <span className="db-stage-label">{s.label}</span>
                <span className="db-stage-count">{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nội dung chính 2 cột + thanh kéo giữa */}
      <div className="db-main" style={{ "--db-side": `${sideW}px` }}>
        <div className="db-col">
          {/* Đang đọc */}
          {continueBooks.length > 0 && (
            <div className="db-sec">
              <div className="db-sec-head">
                <h2 className="db-sec-title"><BookOpen size={16} /> Đang đọc{continueBooks.length > 3 && ` (${continueBooks.length})`}</h2>
              </div>
              {continueBooks.slice(0, 3).map(({ book, lastPage, totalPages, progress }) => (
                <div key={book.filename} className="db-item" onClick={() => onNavigate && onNavigate("library")} role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onNavigate && onNavigate("library")}>
                  <span className="db-item-ic">{book.subject?.slice(0, 2) || "📖"}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="db-item-t">{book.title}</span><br />
                    <span className="db-item-m">Trang {lastPage} / {totalPages} • {progress}%</span>
                    <span className="db-bar"><i style={{ width: `${progress}%` }} /></span>
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </div>
              ))}
              {continueBooks.length > 3 && (
                <button className="db-link" onClick={() => handleNavigate("library")}>Xem tất cả ({continueBooks.length}) <ChevronRight size={14} /></button>
              )}
            </div>
          )}

          {/* Giáo án gần đây */}
          {lessonPlans.length > 0 && (
            <div className="db-sec">
              <div className="db-sec-head">
                <h2 className="db-sec-title"><FileText size={16} /> Giáo án gần đây{lessonPlans.length > 3 && ` (${lessonPlans.length})`}</h2>
              </div>
              {lessonPlans.slice(0, 3).map((plan) => (
                <div key={plan.id} className="db-item" onClick={() => onNavigate && onNavigate("lessonplans", { planId: plan.id })} role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onNavigate && onNavigate("lessonplans", { planId: plan.id })}>
                  <span className="db-item-ic"><FileText size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="db-item-t">{plan.title}</span><br />
                    <span className="db-item-m">{plan.monHoc || plan.subject}{plan.lop || plan.grade ? ` • Lớp ${plan.lop || plan.grade}` : ""}</span>
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </div>
              ))}
              {lessonPlans.length > 3 && (
                <button className="db-link" onClick={() => handleNavigate("lessonplans")}>Xem tất cả ({lessonPlans.length}) <ChevronRight size={14} /></button>
              )}
            </div>
          )}

          {/* Phân bổ hoạt động */}
          {hasActivityData && (
            <div className="db-sec">
              <div className="db-sec-head"><h2 className="db-sec-title"><BarChart3 size={16} /> Phân bổ hoạt động</h2></div>
              <div className="db-abars">
                {activityData.map((item) => (
                  <div key={item.label} className="db-abar">
                    <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{item.label}</span>
                    <span className="db-abar-track"><span className="db-abar-fill" style={{ width: `${(item.value / maxActivityValue) * 100}%`, background: item.color }} /></span>
                    <span className="db-abar-val">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phân bố môn học */}
          <div className="db-sec">
            <div className="db-sec-head">
              <h2 className="db-sec-title"><BookOpen size={16} /> Phân bố theo môn học</h2>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", background: "var(--surface-soft)", border: "1px solid var(--border-color)", padding: "3px 9px", borderRadius: 999 }}>
                {totalBooks} sách • {pdfBooks} PDF • {wordBooks} Word
              </span>
            </div>
            {!hasSubjects ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", background: "var(--surface-soft)", border: "1px dashed var(--border-color)", borderRadius: 12 }}>
                Chưa có sách — thêm sách để xem phân bố
              </div>
            ) : (
              <>
                <div className="db-subj">
                  {displaySubjects.map(([name, count], idx) => {
                    const pct = totalBooks ? Math.round(count / totalBooks * 100) : 0;
                    const colors = ["var(--color-action)", "var(--color-success)", "#f59e0b", "#8b5cf6", "#06b6d4", "#ef4444"];
                    const wordInSubject = books.filter((b) => (b.subject || "Khác") === name && /\.(html|htm|txt|md)$/i.test(b.filename || "")).length;
                    return (
                      <div key={name} className="db-subj-card"
                        onClick={() => { try { appEvents.emit(AppEvents.FILTER_SUBJECT, { subject: name }); } catch {} handleNavigate("library"); }}
                        role="button" tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && handleNavigate("library")} title={`Lọc thư viện: ${name}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                          <span>{name}</span><span style={{ fontWeight: 800, color: colors[idx % colors.length] }}>{pct}%</span>
                        </div>
                        <div className="db-bar"><i style={{ width: `${pct}%`, background: colors[idx % colors.length] }} /></div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                          <span>{count} sách</span>{wordInSubject > 0 && <span style={{ color: "var(--primary)", fontWeight: 700 }}>{wordInSubject} Word</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Bấm vào môn để lọc thư viện</div>
              </>
            )}
          </div>

          {/* Bảng trắng */}
          {whiteboards.length > 0 && (
            <div className="db-sec">
              <div className="db-sec-head"><h2 className="db-sec-title"><Palette size={16} /> Bảng trắng ({whiteboards.length})</h2></div>
              {whiteboards.map((board) => (
                <div key={board.id} className="db-item" onClick={() => handleNavigate("whiteboard")} role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleNavigate("whiteboard")}>
                  <span className="db-item-ic"><Palette size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="db-item-t">{board.name}</span><br />
                    <span className="db-item-m">{new Date(board.updatedAt).toLocaleDateString("vi-VN")}</span>
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Thanh kéo điều chỉnh độ rộng cột (desktop) */}
        <div className="db-div" onPointerDown={startDivDrag} onDoubleClick={() => { setSideW(330); try { safeSetString("sgk_db_sidew", "330"); } catch {} }}
          role="separator" aria-orientation="vertical" aria-label="Kéo để điều chỉnh độ rộng cột (nhấp đúp để về mặc định)" title="Kéo để co giãn cột • Nhấp đúp về mặc định">
          <span className="db-div-bar" />
        </div>

        <div className="db-col">
          {/* Cần hoàn thành */}
          <div className="db-sec">
            <div className="db-sec-head">
              <h2 className="db-sec-title"><ClipboardCheck size={16} /> Cần hoàn thành</h2>
              {pendingTasks > 0 && <span className="db-stage-count" style={{ background: "#fef3c7", color: "#b45309" }}>{pendingTasks}</span>}
            </div>
            {pendingTasks === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 7 }}>
                <Check size={15} style={{ color: "#16a34a" }} /> Không còn việc tồn. Tuyệt vời!
              </div>
            ) : (
              <>
                {pendingTasksList.slice(0, 5).map((task) => (
                  <div key={task.id} className="db-item" style={{ cursor: "default" }}>
                    <button className="db-check" onClick={() => handleToggleTask(task.id)} aria-label="Đánh dấu hoàn thành"><Check size={12} /></button>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="db-item-t">{task.title}</span>
                      {task.dueDate && <><br /><span className="db-item-m">{new Date(task.dueDate).toLocaleDateString("vi-VN")}</span></>}
                    </span>
                  </div>
                ))}
                <button className="db-link" onClick={() => handleNavigate("tasks", { tab: "tasks" })}>Đi tới Việc cần làm <ChevronRight size={14} /></button>
              </>
            )}
          </div>

          {/* Nhiệm vụ / huy hiệu — hub `tasks` = daily missions + việc cần làm */}
          <MissionWidget books={books} onViewMissions={() => handleNavigate("tasks", { tab: "today" })} />

          {/* Scan gần đây */}
          {scans.length > 0 && (
            <div className="db-sec">
              <div className="db-sec-head"><h2 className="db-sec-title"><Scissors size={16} /> Scan gần đây ({scans.length})</h2></div>
              <ScanHistory
                bookFilename={null}
                onSelectScan={(scan) => {
                  if (scan.bookId || scan.book?.filename) {
                    const book = books.find((b) => b.filename === (scan.bookId || scan.book?.filename));
                    if (book) handleNavigate("library");
                  }
                }}
              />
            </div>
          )}

          {/* Chỉ số thật */}
          <div className="db-insights">
            <div className="db-insight" style={{ background: "linear-gradient(135deg, #16a34a, #059669)" }}>
              <small>Tiến độ nhiệm vụ</small><b>{taskRate}%</b>
              <small>{completedTasks}/{tasks.length} việc xong</small>
            </div>
            <div className="db-insight" style={{ background: "linear-gradient(135deg, var(--color-action, #2563eb), var(--color-action-active, #1e40af))" }}>
              <small>Sách đang đọc</small><b>{continueCount}</b>
              <small>trên {totalBooks} quyển</small>
            </div>
            <div className="db-insight" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
              <small>Scan SGK</small><b>{scans.length}</b>
              <small>vùng đã crop</small>
            </div>
          </div>
        </div>
      </div>

      {/* All Tools Modal */}
      {showAllTools && (
        <div className="modal-overlay dashboard-tools-overlay" onClick={() => setShowAllTools(false)}>
          <div className="modal-content tools-modal dashboard-tools-modal" onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="dashboard-tools-title">
            <div className="dashboard-tools-header">
              <div>
                <span className="dashboard-tools-eyebrow">Không gian làm việc</span>
                <h2 id="dashboard-tools-title">Tất cả công cụ</h2>
                <p>Chọn nhanh khu vực để tiếp tục công việc của thầy/cô.</p>
              </div>
              <button className="dashboard-tools-close" onClick={() => setShowAllTools(false)} aria-label="Đóng danh sách công cụ" title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="dashboard-tools-toolbar">
              <Search size={17} aria-hidden="true" />
              <input autoFocus value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Tìm công cụ..." aria-label="Tìm công cụ" />
              <span>{filteredTools.length}/{allTools.length}</span>
            </div>
            <div className="db-tools-grid" style={{ padding: "0.9rem 1.1rem 1.2rem" }}>
              {filteredTools.map((tool) => (
                <button key={tool.id} className="db-tool"
                  onClick={() => { handleNavigate(tool.view); setShowAllTools(false); setToolQuery(""); }}>
                  <span className="db-tool-ic">{tool.icon}</span>
                  <span>{tool.label}</span>
                  <ChevronRight size={15} style={{ marginLeft: "auto", color: "var(--text-muted)" }} />
                </button>
              ))}
            </div>
            {filteredTools.length === 0 && (
              <div className="dashboard-tools-empty">
                <Search size={24} />
                <strong>Không tìm thấy công cụ</strong>
                <span>Thử từ khóa khác.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
