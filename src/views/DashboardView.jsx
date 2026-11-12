import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Check,
  X,
  Search,
  Grid3x3,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Palette,
  Scissors,
  Play,
  CalendarDays,
  ChevronLeft,
} from "lucide-react";
import { getTasks, toggleTaskComplete } from "../data/personalDB.js";
import { getIdeas } from "../data/personalDB.js";
import { getPlans as getKhbdPlans } from "../khbd/planModel.js";
import MissionWidget from "./MissionWidget.jsx";
import DashboardRecentItems from "./DashboardRecentItems.jsx";
import { KPI_VIEW_MAP } from "./dashboardPresentation.js";
import ScanHistory from "../scan/ScanHistory.jsx";
import { getScans } from "../scan/scanStore.js";
import { loadSettings, getDashboardConfig, isViewEnabled } from "../services/settingsStore.js";
import { safeGetJSON, safeGetString, safeSetString } from "../safeStorage.js";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { bookProgress } from "../reader/readingProgress.js";
import { STORAGE_KEYS } from "../core/storageKeys.js";

const internshipDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const internshipNoteExcerpt = (entry) => {
  const reflection = entry.reflection || {};
  const note = [entry.activities, reflection.notes, entry.topic]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!note) return "Nhật ký thực tập";
  return note.length > 150 ? `${note.slice(0, 147).trimEnd()}…` : note;
};

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
  const [internshipEntries, setInternshipEntries] = useState(() =>
    safeGetJSON(STORAGE_KEYS.INTERNSHIP, [], Array.isArray),
  );
  const [internshipMonth, setInternshipMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeInternshipDate, setActiveInternshipDate] = useState("");
  const [showAllTools, setShowAllTools] = useState(false);
  const [toolQuery, setToolQuery] = useState("");
  const heroRef = useRef(null);
  const floatingItemsRef = useRef(new Map());
  const floatingStateRef = useRef(new Map());
  const floatingDragRef = useRef(null);
  const floatingFramesRef = useRef(new Map());
  const suppressFloatingClickRef = useRef(false);
  const [heroHeight, setHeroHeight] = useState(() => {
    const stored = Number(safeGetString("sgk_dashboard_hero_height", "0"));
    return Number.isFinite(stored) && stored >= 238 && stored <= 620 ? stored : 0;
  });
  const heroResizeRef = useRef(null);
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
  const [refsCount, setRefsCount] = useState(0);
  // A3 • Trạng thái sao lưu — hiện trên hero để không bao giờ quên
  const [backupStatus, setBackupStatus] = useState(null);
  const displayName = (()=>{ try{ return loadSettings().general?.displayName || ""; }catch{ return ""; }})();

  // Cài đặt → Bảng điều khiển: bật/tắt từng khối ngay khi mở (đọc mỗi render nên đổi là thấy ngay)
  const dashCfg = getDashboardConfig();
  // Cài đặt → Tính năng: module đang tắt → ẩn quick action / KPI / tool dẫn tới nó
  const moduleOn = (vid) => isViewEnabled(vid);

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
        const { getRefs } = await import("../data/researchDB.js");
        const r = await getRefs();
        setRefsCount(Array.isArray(r) ? r.length : 0);
      } catch {}
      // Hiển thị thời điểm sao lưu thủ công gần nhất.
      try {
        const s = loadSettings();
        const manualIso = s.backup?.lastBackupTime;
        const manual = Number(safeGetString("sgk_last_backup", "0")) ||
          (manualIso ? Date.parse(manualIso) || 0 : 0);
        setBackupStatus({
          at: manual,
          never: !manual,
          stale: !manual || Date.now() - manual > 7 * 86400000,
        });
      } catch { setBackupStatus({ at: 0, never: true, stale: true }); }
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

  useEffect(() => {
    const refreshInternshipEntries = () => {
      setInternshipEntries(safeGetJSON(STORAGE_KEYS.INTERNSHIP, [], Array.isArray));
    };
    const unsubscribe = appEvents.on(AppEvents.INTERNSHIP_UPDATED, refreshInternshipEntries);
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEYS.INTERNSHIP) refreshInternshipEntries();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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
      color: "var(--secondary)",
      bg: "var(--secondary-light)",
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
      icon: <ListChecks size={20} />,
      label: "Ghi chú",
      value: totalMarks || 0,
      color: "var(--success)",
      bg: "var(--success-soft)",
    },
    {
      id: "refs",
      icon: <Database size={20} />,
      label: "Tham khảo",
      value: refsCount,
      color: "var(--pen-blue)",
      bg: "var(--pen-blue-soft)",
    },
  ];

  // Ẩn KPI của module đã tắt trong Cài đặt → Tính năng
  const visibleKpiCards = kpiCards.filter((c) => !KPI_VIEW_MAP[c.id] || moduleOn(KPI_VIEW_MAP[c.id]));
  const internshipEntriesByDate = useMemo(() => {
    const entriesByDate = new Map();
    for (const entry of internshipEntries) {
      if (!entry?.date) continue;
      const entriesForDate = entriesByDate.get(entry.date) || [];
      entriesForDate.push(internshipNoteExcerpt(entry));
      entriesByDate.set(entry.date, entriesForDate);
    }
    return entriesByDate;
  }, [internshipEntries]);
  const internshipCalendarDays = useMemo(() => {
    const start = new Date(internshipMonth.getFullYear(), internshipMonth.getMonth(), 1);
    const offset = (start.getDay() + 6) % 7;
    const daysInMonth = new Date(internshipMonth.getFullYear(), internshipMonth.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [internshipMonth]);
  const internshipToday = internshipDateKey(new Date());
  const internshipMonthLabel = internshipMonth.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });

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

  // Danh sách rút gọn theo module đang bật (Tính năng) — dùng cho nút nhanh + modal "Tất cả công cụ"
  const visibleQuickActions = mainQuickActions.filter((a) => moduleOn(a.view));

  const setFloatingTransform = (id, x, y, transition = "none") => {
    const node = floatingItemsRef.current.get(id);
    if (!node) return;
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    node.style.transition = transition;
    floatingStateRef.current.set(id, { ...(floatingStateRef.current.get(id) || {}), x, y });
  };

  const clampFloatingOffset = (id, x, y) => {
    const node = floatingItemsRef.current.get(id);
    const hero = heroRef.current;
    if (!node || !hero) return { x, y };
    const state = floatingStateRef.current.get(id) || { x: 0, y: 0 };
    const rect = node.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const baseLeft = rect.left - state.x;
    const baseTop = rect.top - state.y;
    return {
      x: Math.max(heroRect.left - baseLeft, Math.min(heroRect.right - (baseLeft + rect.width), x)),
      y: Math.max(heroRect.top - baseTop, Math.min(heroRect.bottom - (baseTop + rect.height), y)),
    };
  };

  const animateFloatingBack = (id, velocityX, velocityY) => {
    const previousFrame = floatingFramesRef.current.get(id);
    if (previousFrame) cancelAnimationFrame(previousFrame);
    let position = { ...(floatingStateRef.current.get(id) || { x: 0, y: 0 }) };
    let velocity = { x: velocityX, y: velocityY };
    let lastTime = performance.now();
    const tick = (now) => {
      const dt = Math.min(32, now - lastTime) / 16;
      lastTime = now;
      const stiffness = 0.045;
      const damping = Math.pow(0.82, dt);
      velocity.x = (velocity.x - position.x * stiffness * dt) * damping;
      velocity.y = (velocity.y - position.y * stiffness * dt) * damping;
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;
      position = clampFloatingOffset(id, position.x, position.y);
      setFloatingTransform(id, position.x, position.y);
      if (Math.abs(position.x) > 0.25 || Math.abs(position.y) > 0.25 || Math.abs(velocity.x) > 0.08 || Math.abs(velocity.y) > 0.08) {
        floatingFramesRef.current.set(id, requestAnimationFrame(tick));
      } else {
        setFloatingTransform(id, 0, 0);
        floatingFramesRef.current.delete(id);
      }
    };
    floatingFramesRef.current.set(id, requestAnimationFrame(tick));
  };

  const handleFloatingPointerDown = (event) => {
    const target = event.target.closest?.("[data-floating-id]");
    const hero = heroRef.current;
    if (!target || !hero || (event.button !== undefined && event.button !== 0)) return;
    const id = target.dataset.floatingId;
    const start = floatingStateRef.current.get(id) || { x: 0, y: 0 };
    let lastX = event.clientX;
    let lastY = event.clientY;
    let velocityX = 0;
    let velocityY = 0;
    let moved = false;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    target.classList.add("is-floating-dragging");
    floatingDragRef.current = { id };

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - lastX;
      const dy = moveEvent.clientY - lastY;
      velocityX = velocityX * 0.65 + dx * 0.35;
      velocityY = velocityY * 0.65 + dy * 0.35;
      if (Math.abs(moveEvent.clientX - (lastX - velocityX)) > 3 || Math.abs(moveEvent.clientY - (lastY - velocityY)) > 3) moved = true;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const current = floatingStateRef.current.get(id) || start;
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const bounded = clampFloatingOffset(id, nextX, nextY);
      setFloatingTransform(id, bounded.x, bounded.y);

      for (const [otherId, otherNode] of floatingItemsRef.current.entries()) {
        if (otherId === id) continue;
        const otherRect = otherNode.getBoundingClientRect();
        const draggedRect = target.getBoundingClientRect();
        const overlaps = draggedRect.left < otherRect.right && draggedRect.right > otherRect.left &&
          draggedRect.top < otherRect.bottom && draggedRect.bottom > otherRect.top;
        if (overlaps) {
          const pushX = draggedRect.left < otherRect.left ? 8 : -8;
          const pushY = draggedRect.top < otherRect.top ? 5 : -5;
          const otherState = floatingStateRef.current.get(otherId) || { x: 0, y: 0 };
          const pushed = clampFloatingOffset(otherId, otherState.x + pushX, otherState.y + pushY);
          setFloatingTransform(otherId, pushed.x, pushed.y);
        }
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      target.classList.remove("is-floating-dragging");
      floatingDragRef.current = null;
      if (moved) {
        suppressFloatingClickRef.current = true;
        window.setTimeout(() => { suppressFloatingClickRef.current = false; }, 700);
      }
      animateFloatingBack(id, velocityX, velocityY);
      for (const otherId of floatingItemsRef.current.keys()) {
        if (otherId !== id) animateFloatingBack(otherId, 0, 0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const handleHeroResizePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = heroRef.current?.getBoundingClientRect().height || 238;
    heroResizeRef.current = { startY, startHeight };
    const move = (moveEvent) => {
      const nextHeight = Math.max(238, Math.min(620, startHeight + moveEvent.clientY - startY));
      setHeroHeight(nextHeight);
    };
    const up = () => {
      const current = heroRef.current?.getBoundingClientRect().height || startHeight;
      safeSetString("sgk_dashboard_hero_height", String(Math.round(current)));
      heroResizeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  useEffect(() => {
    if (!heroHeight) return undefined;
    const frame = requestAnimationFrame(() => {
      for (const [id, state] of floatingStateRef.current.entries()) {
        const bounded = clampFloatingOffset(id, state.x, state.y);
        if (bounded.x !== state.x || bounded.y !== state.y) {
          setFloatingTransform(id, bounded.x, bounded.y);
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [heroHeight]);

  const visibleTools = allTools.filter((t) => moduleOn(t.view));

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

  const handleQuickClick = (action) => {
    if (suppressFloatingClickRef.current) return;
    handleNavigate(action.view);
  };

  const filteredTools = visibleTools.filter((tool) =>
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
      const { last, page, total, pct } = bookProgress(book.filename, lastPageMap, lastTotalMap);
      return {
        book,
        lastPdf: last,
        lastPage: page,
        totalPages: total,
        progress: pct,
        at: item.at,
      };
    })
    .filter(Boolean);

  // Giáo án gần đây — sắp theo lần sửa/cập nhật mới nhất
  const recentPlans = [...lessonPlans]
    .sort((a, b) => (Number(b.updatedAt) || Number(b.createdAt) || 0) - (Number(a.updatedAt) || Number(a.createdAt) || 0))
    .slice(0, 3);

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
    { label: "Ý tưởng", value: totalIdeas, color: "var(--secondary)" },
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

  return (
    <div className="db-root">
      <style>{`
        .db-root { display:flex; flex-direction:column; gap:16px; }
        .db-hero { position:relative; isolation:isolate; overflow:hidden; border-radius:22px; padding:26px 28px 22px; color:#fff;
          background:linear-gradient(120deg, var(--color-action-strong, #1e3a8a) 0%, var(--color-action, #2563eb) 50%, #7c3aed 100%);
          background-size:180% 180%; box-shadow:0 18px 42px color-mix(in srgb, var(--color-action, #2563eb) 30%, transparent);
          animation:dbHeroGradient 14s ease-in-out infinite; }
        .db-hero::after { content:""; position:absolute; right:-70px; top:-70px; width:250px; height:250px; border-radius:50%;
          background:radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.08) 28%, transparent 68%);
          pointer-events:none; z-index:-1; animation:dbOrbFloat 8s ease-in-out infinite; }
        .db-hero::before { content:""; position:absolute; right:60px; bottom:-90px; width:190px; height:190px; border-radius:50%;
          background:radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 66%); pointer-events:none; z-index:-1;
          animation:dbOrbFloat 10s ease-in-out -3s infinite reverse; }
        .db-hello { position:relative; z-index:1; margin:0; max-width:58%; font-size:clamp(1.45rem, 2.4vw, 2rem); font-weight:850; letter-spacing:-0.04em;
          line-height:1.12; text-wrap:balance; animation:dbHelloIn .65s cubic-bezier(.2,.8,.2,1) both; }
        .db-date { position:relative; z-index:1; margin:8px 0 0; font-size: 0.7813rem; opacity:0.9; letter-spacing:0.01em; animation:dbHelloIn .7s .08s cubic-bezier(.2,.8,.2,1) both; }
        .db-hero-sub { position:relative; z-index:1; margin:8px 0 0; font-size: 0.7813rem; opacity:0.92; display:flex; gap:7px; flex-wrap:wrap; }
        .db-hero-sub b { background:rgba(255,255,255,0.16); padding:5px 10px; border:1px solid rgba(255,255,255,0.16); border-radius:999px; font-weight:700; backdrop-filter:blur(8px); }
        .db-quick { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-top:22px; position:relative; z-index:2; }
        .db-qa { display:flex; align-items:center; min-height:58px; gap:10px; padding:10px 12px; border-radius:13px; border:1px solid rgba(255,255,255,0.25);
          background:rgba(255,255,255,0.13); color:#fff; cursor:pointer; font-size: 0.8125rem; font-weight:700; backdrop-filter:blur(10px); text-align:left;
          transition:transform .2s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease; }
        .db-qa:hover { background:rgba(255,255,255,0.23); border-color:rgba(255,255,255,0.42); transform:translateY(-3px); box-shadow:0 10px 22px rgba(15,23,42,.14); }
        .db-qa small { display:block; max-width:130px; font-size: 0.6563rem; font-weight:500; line-height:1.25; opacity:0.85; }
        .db-qa-ic { width:36px; height:36px; border-radius:11px; background:rgba(255,255,255,0.22); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
        .db-hero-art { position:absolute; top:8px; right:3.5%; width:260px; height:170px; pointer-events:none; z-index:0; }
        .db-hero-art::before { content:""; position:absolute; inset:24px 18px 2px 38px; border-radius:50%; background:radial-gradient(circle, rgba(255,255,255,.2), transparent 68%); filter:blur(4px); }
        .db-hero-orbit { position:absolute; border:1px solid rgba(255,255,255,.22); border-radius:50%; transform:rotate(-18deg); }
        .db-hero-orbit--one { inset:16px 18px 12px 35px; animation:dbOrbitSpin 18s linear infinite; }
        .db-hero-orbit--two { inset:34px -4px 28px 51px; transform:rotate(42deg); border-color:rgba(255,255,255,.13); animation:dbOrbitSpin 13s linear infinite reverse; }
        .db-hero-spark { position:absolute; color:rgba(255,255,255,.85); font-weight:800; }
        .db-hero-spark--one { top:15px; right:26px; font-size: 1.125rem; animation:dbSpark 3.2s ease-in-out infinite; }
        .db-hero-spark--two { bottom:30px; left:28px; font-size: 1.625rem; animation:dbSpark 4s .5s ease-in-out infinite reverse; }
        .db-hero-float { position:absolute; display:flex; align-items:center; gap:9px; color:#fff; border:1px solid rgba(255,255,255,.3); background:rgba(255,255,255,.14); box-shadow:0 12px 25px rgba(15,23,42,.16), inset 0 1px 0 rgba(255,255,255,.22); backdrop-filter:blur(10px); }
        .db-hero-float--main { top:43px; left:64px; padding:11px 14px; border-radius:15px; animation:dbFloatMain 5.5s ease-in-out infinite; }
        .db-hero-float--main b, .db-hero-float--main small { display:block; white-space:nowrap; }
        .db-hero-float--main b { font-size: 0.75rem; }
        .db-hero-float--main small { margin-top:2px; font-size: 0.625rem; opacity:.76; }
        .db-hero-float-icon { display:grid; width:38px; height:38px; place-items:center; border-radius:12px; color:#fff; background:linear-gradient(145deg, rgba(255,255,255,.36), rgba(255,255,255,.12)); }
        .db-hero-float--mini { right:0; bottom:17px; padding:7px 10px 7px 7px; border-radius:999px; font-size: 0.625rem; font-weight:800; animation:dbFloatMini 4.5s 1s ease-in-out infinite; }
        .db-hero-mini-check { display:grid; width:22px; height:22px; place-items:center; border-radius:50%; background:#4ade80; color:#14532d; }
        .db-sec { background:var(--surface); border:1px solid color-mix(in srgb, var(--border-color) 82%, var(--color-action) 18%); border-radius:16px; padding:16px 18px;
          box-shadow:0 5px 18px rgba(15,23,42,.035); transition:box-shadow .22s ease, border-color .22s ease, transform .22s ease; }
        .db-sec:hover { border-color:color-mix(in srgb, var(--border-color) 60%, var(--color-action) 40%); box-shadow:0 12px 28px rgba(15,23,42,.07); }
        .db-sec-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:11px; }
        .db-sec-title { margin:0; font-size:0.95rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:8px; }
        .db-sec-title svg { color:var(--color-action, var(--primary)); }
        .db-kpis { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:10px; }
        @media (max-width: 1280px) { .db-kpis { grid-template-columns:repeat(4, minmax(0, 1fr)); } }
        @media (max-width: 820px) { .db-kpis { grid-template-columns:repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 520px) { .db-kpis { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
        .db-kpi { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; transition:transform 0.13s ease, box-shadow 0.13s ease, border-color 0.13s ease; min-width:0; min-height:64px; }
        .db-kpi:hover { transform:translateY(-2px); box-shadow:0 8px 18px rgba(15,23,42,0.09); border-color:var(--color-action, var(--primary)); }
        .db-kpi-ic { width:36px; height:36px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
        .db-kpi-txt { display:flex; flex-direction:column; justify-content:center; gap:1px; min-width:0; line-height:1.2; }
        .db-kpi-val { font-size:1.12rem; font-weight:800; color:var(--text-dark); line-height:1.1; font-variant-numeric:tabular-nums; }
        .db-kpi-label { font-size: 0.6875rem; color:var(--text-muted); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-kpi-sub { font-size: 0.625rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-kpi-calendar-layout { display:grid; grid-template-columns:minmax(0, 1fr) 300px; gap:18px; align-items:start; }
        .db-kpi-calendar-layout .db-kpis { grid-template-columns:repeat(3, minmax(0, 1fr)); }
        .db-internship-calendar { box-sizing:border-box; width:300px; min-width:0; justify-self:end; padding:13px 14px; border:1px solid var(--border-color); border-radius:14px; background:var(--surface); }
        .db-internship-calendar-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
        .db-internship-calendar-title { display:flex; align-items:center; gap:7px; min-width:0; color:var(--text-dark); font-size:0.78rem; font-weight:800; }
        .db-internship-calendar-title svg { flex:none; color:var(--color-action, var(--primary)); }
        .db-internship-calendar-month { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:capitalize; }
        .db-internship-calendar-nav { display:flex; flex:none; gap:3px; }
        .db-internship-calendar-nav button { display:grid; width:27px; height:27px; place-items:center; border:1px solid var(--border-color); border-radius:7px; background:var(--surface); color:var(--text-mid); cursor:pointer; }
        .db-internship-calendar-nav button:hover { border-color:var(--color-action, var(--primary)); color:var(--color-action, var(--primary)); }
        .db-internship-calendar-weekdays, .db-internship-calendar-grid { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:3px; }
        .db-internship-calendar-weekdays { margin-bottom:3px; color:var(--text-muted); font-size:0.62rem; font-weight:700; text-align:center; }
        .db-internship-calendar-day { position:relative; display:grid; min-width:0; aspect-ratio:1; place-items:center; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--text-mid); font:inherit; font-size:0.7rem; }
        button.db-internship-calendar-day { cursor:pointer; }
        button.db-internship-calendar-day:hover, button.db-internship-calendar-day:focus-visible, .db-internship-calendar-day.is-today { border-color:color-mix(in srgb, var(--color-action, var(--primary)) 42%, var(--border-color)); outline:none; }
        .db-internship-calendar-day.has-note { border-color:color-mix(in srgb, var(--color-action, var(--primary)) 52%, var(--border-color)); background:color-mix(in srgb, var(--color-action, var(--primary)) 8%, var(--surface)); }
        .db-internship-calendar-day.has-note::after { position:absolute; bottom:2px; width:4px; height:4px; border-radius:50%; background:var(--color-action, var(--primary)); content:""; }
        .db-internship-calendar-tooltip { position:absolute; z-index:12; left:50%; bottom:calc(100% + 7px); display:none; width:220px; max-width:calc(100vw - 32px); max-height:150px; overflow:auto; padding:8px 10px; border:1px solid var(--border-color); border-radius:9px; background:var(--surface); box-shadow:0 8px 24px rgba(15,23,42,.2); color:var(--text-dark); font-size:0.7rem; font-weight:500; line-height:1.45; text-align:left; transform:translateX(-50%); white-space:normal; }
        .db-internship-calendar-day.has-note:hover .db-internship-calendar-tooltip, .db-internship-calendar-day.has-note:focus-visible .db-internship-calendar-tooltip, .db-internship-calendar-day.has-note.is-active .db-internship-calendar-tooltip { display:block; }
        @media (max-width: 820px) { .db-kpi-calendar-layout { grid-template-columns:1fr; } }
        @media (max-width: 520px) { .db-kpi-calendar-layout .db-kpis { grid-template-columns:repeat(2, minmax(0, 1fr)); } .db-internship-calendar { max-width:360px; width:100%; justify-self:center; } }
        .db-main { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; align-items:start; }
        .db-div { display:none; align-items:stretch; justify-content:center; cursor:ew-resize; border-radius:8px; min-height:120px; }
        @media (min-width: 1100px) { .db-main { grid-template-columns:minmax(0,1fr) 12px minmax(0, var(--db-side, 330px)); gap:0 10px; } .db-div { display:flex; } }
        .db-div:hover .db-div-bar, .db-div:active .db-div-bar { background:var(--color-action, var(--primary)); }
        .db-div-bar { width:4px; border-radius:99px; background:#e2e8f0; position:relative; transition:background 0.15s ease; }
        .db-div-bar::after { content:"⋮"; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size: 0.6875rem; font-weight:800; color:#94a3b8; background:var(--surface); border:1px solid #e2e8f0; border-radius:99px; width:18px; height:30px; display:flex; align-items:center; justify-content:center; }
        .db-div:hover .db-div-bar::after { color:var(--color-action-strong, var(--primary)); border-color:var(--color-action, var(--primary)); }
        .db-col { display:flex; flex-direction:column; gap:14px; min-width:0; }
        .db-item { display:flex; gap:10px; align-items:center; padding:9px 10px; border-radius:10px; border:1px solid transparent; cursor:pointer; }
        .db-item:hover { background:var(--surface-soft); border-color:var(--border-color); }
        .db-item-ic { width:36px; height:36px; border-radius:10px; background:var(--color-action-soft, var(--primary-light)); color:var(--color-action-strong, var(--primary)); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; font-size: 0.6875rem; font-weight:800; }
        .db-item-t { font-size:0.85rem; font-weight:700; color:var(--text-dark); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
        .db-item-m { font-size: 0.6875rem; color:var(--text-muted); }
        .db-bar { height:7px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; margin-top:6px; }
        .db-bar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, var(--primary)); }
        /* —— Khối "Đang đọc" + "Giáo án gần đây" (thiết kế lại) —— */
        .db-count { font-size: 0.6563rem; font-weight:800; line-height:1.7; padding:0 7px; border-radius:999px; color:var(--color-action-strong, var(--primary)); background:var(--color-action-soft, var(--primary-light)); }
        .db-sec-all { display:inline-flex; align-items:center; gap:2px; padding:4px 10px; border-radius:999px; border:1px solid var(--border-color); background:var(--surface); color:var(--text-muted); font-size: 0.6875rem; font-weight:800; cursor:pointer; transition:border-color .14s ease, background .14s ease, color .14s ease; }
        .db-sec-all:hover { color:var(--color-action-strong, var(--primary)); border-color:var(--color-action, var(--primary)); background:var(--color-action-soft, var(--primary-light)); }
        .db-duo { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap:14px; align-content:start; align-items:start; }
        .db-rows { display:flex; flex-direction:column; gap:8px; }
        .db-row { --h:215; display:flex; align-items:center; gap:11px; padding:9px 10px; border:1px solid var(--border-color); border-radius:12px; background:var(--surface); cursor:pointer; transition:border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
        .db-row:hover { border-color:hsl(var(--h) 60% 50% / 0.55); box-shadow:0 6px 16px hsl(var(--h) 60% 40% / 0.15); transform:translateY(-1px); }
        .db-row:focus-visible { outline:2px solid var(--color-action, var(--primary)); outline-offset:2px; }
        .db-row-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
        .db-row-line { display:flex; align-items:flex-start; gap:8px; }
        .db-row .db-item-t { flex:1; min-width:0; -webkit-line-clamp:2; }
        .db-pct { flex-shrink:0; font-size: 0.75rem; font-weight:800; font-variant-numeric:tabular-nums; color:var(--color-action-strong, var(--primary)); }
        .db-pct.is-done { color:var(--success, #16a34a); }
        .db-chips { display:flex; align-items:center; gap:5px; flex-wrap:wrap; min-width:0; }
        .db-progress { display:flex; align-items:center; gap:8px; }
        .db-progress .db-bar { flex:1; min-width:0; margin-top:0; height:6px; }
        .db-progress-n { flex-shrink:0; font-size: 0.6875rem; font-weight:700; font-variant-numeric:tabular-nums; color:var(--text-muted); white-space:nowrap; }
        .db-chip { font-size: 0.6563rem; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--surface-soft); border:1px solid var(--border-color); color:var(--text-muted); white-space:nowrap; }
        .db-chip--sub { color:hsl(var(--h) 65% 40%); background:hsl(var(--h) 70% 50% / 0.12); border-color:hsl(var(--h) 70% 50% / 0.32); }
        [data-theme="dark"] .db-chip--sub { color:hsl(var(--h) 80% 74%); }
        .db-meta { display:inline-flex; align-items:center; gap:4px; font-size: 0.6875rem; color:var(--text-muted); white-space:nowrap; }
        .db-row .db-bar { margin-top:0; height:6px; }
        .db-row .db-bar > i { background:linear-gradient(90deg, hsl(var(--h) 72% 60%), hsl(var(--h) 62% 44%)); transition:width .5s ease; }
        .db-cover { position:relative; flex-shrink:0; width:42px; height:52px; border-radius:7px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:linear-gradient(160deg, hsl(var(--h) 72% 60%), hsl(var(--h) 62% 42%)); box-shadow:0 3px 9px hsl(var(--h) 60% 40% / 0.32); }
        .db-cover-t { position:relative; z-index:2; font-size: 0.7813rem; font-weight:800; color:#fff; letter-spacing:0.3px; text-shadow:0 1px 2px rgba(0,0,0,0.35); }
        .db-cover-fill { position:absolute; left:0; right:0; bottom:0; z-index:1; background:linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.5)); transition:height .5s ease; }
        .db-cover-fill::after { content:""; position:absolute; left:0; right:0; top:0; height:2px; background:rgba(255,255,255,0.75); }
        .db-doc { flex-shrink:0; width:40px; height:40px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; color:hsl(var(--h) 65% 40%); background:hsl(var(--h) 70% 50% / 0.12); border:1px solid hsl(var(--h) 70% 50% / 0.3); }
        [data-theme="dark"] .db-doc { color:hsl(var(--h) 80% 74%); }
        .db-go { flex-shrink:0; width:30px; height:30px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:var(--surface-soft); border:1px solid var(--border-color); color:var(--text-muted); opacity:0.7; transition:background .15s ease, color .15s ease, border-color .15s ease, transform .15s ease, opacity .15s ease; }
        .db-row:hover .db-go, .db-row:focus-visible .db-go { opacity:1; color:#fff; background:var(--color-action, var(--primary)); border-color:transparent; transform:translateX(2px); }
        .db-link { display:inline-flex; align-items:center; gap:4px; background:none; border:none; color:var(--color-action-strong, var(--primary)); font-size: 0.75rem; font-weight:800; cursor:pointer; padding:8px 4px 0; }
        .db-check { width:21px; height:21px; border-radius:7px; border:2px solid #cbd5e1; background:#fff; display:inline-flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; flex-shrink:0; }
        .db-check.on { background:#16a34a; border-color:#16a34a; }
        .db-abars { display:flex; flex-direction:column; gap:5px; }
        .db-abar { --activity-color:var(--pen-blue); display:grid; grid-template-columns:minmax(88px, 110px) minmax(0, 1fr) 34px; gap:11px; align-items:center; min-height:32px; padding:2px 6px; border-radius:9px; font-size:0.75rem; transition:background .16s ease; }
        .db-abar:hover { background:color-mix(in srgb, var(--activity-color) 6%, transparent); }
        .db-abar-label { display:inline-flex; min-width:0; align-items:center; gap:8px; overflow:hidden; color:var(--text-muted); font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
        .db-abar-dot { width:7px; height:7px; flex:0 0 7px; border-radius:50%; background:var(--activity-color); box-shadow:0 0 0 3px color-mix(in srgb, var(--activity-color) 13%, transparent); }
        .db-abar-track { height:9px; border-radius:99px; background:color-mix(in srgb, var(--color-action, var(--primary)) 7%, var(--surface-soft)); border:1px solid color-mix(in srgb, var(--border-color) 76%, var(--color-action, var(--primary)) 24%); box-shadow:inset 0 1px 2px rgba(0,0,0,.12); overflow:hidden; }
        .db-abar-fill { display:block; height:100%; min-width:0; border-radius:inherit; background:linear-gradient(90deg, color-mix(in srgb, var(--activity-color) 72%, white), var(--activity-color)); box-shadow:inset 0 1px 0 rgba(255,255,255,.32), 0 0 10px color-mix(in srgb, var(--activity-color) 30%, transparent); transition:width .45s cubic-bezier(.2,.8,.2,1); }
        .db-abar-val { min-width:25px; padding:2px 6px; border:1px solid color-mix(in srgb, var(--activity-color) 24%, var(--border-color)); border-radius:999px; background:color-mix(in srgb, var(--activity-color) 10%, var(--surface)); color:var(--text-dark); font-size:.6875rem; font-weight:800; font-variant-numeric:tabular-nums; text-align:center; }
        .db-subj { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:9px; }
        .db-subj-card { border:1px solid var(--border-color); border-radius:11px; padding:10px 12px; cursor:pointer; background:var(--surface); }
        .db-subj-card:hover { border-color:var(--color-action, var(--primary)); }
        .db-insights { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:9px; }
        .db-insight { border-radius:12px; padding:13px 14px; color:#fff; position:relative; overflow:hidden; }
        .db-insight small { font-size: 0.6875rem; opacity:0.9; font-weight:600; }
        .db-insight b { display:block; font-size:1.5rem; font-weight:800; margin-top:2px; }
        .db-tools-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:9px; }
        .db-tool { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; font-size: 0.8125rem; font-weight:700; color:var(--text-dark); text-align:left; }
        .db-tool:hover { border-color:var(--color-action, var(--primary)); box-shadow:0 6px 16px rgba(15,23,42,0.08); }
        .db-tool-ic { width:32px; height:32px; border-radius:9px; background:var(--color-action-soft, var(--primary-light)); color:var(--color-action-strong, var(--primary)); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>

      {/* Hero — Cài đặt → Bảng điều khiển: tắt lời chào / thao tác nhanh là biến mất */}
      {(dashCfg.showGreeting || dashCfg.showQuickActions) && (
      <div className="db-hero" ref={heroRef} onPointerDown={handleFloatingPointerDown}
        style={heroHeight ? { "--db-hero-height": `${heroHeight}px` } : undefined}>
        <div className="db-hero-art" aria-hidden="true">
          <span className="db-hero-orbit db-hero-orbit--one" />
          <span className="db-hero-orbit db-hero-orbit--two" />
          <span className="db-hero-spark db-hero-spark--one">✦</span>
          <span className="db-hero-spark db-hero-spark--two">·</span>
          <div className="db-hero-float db-hero-float--main" data-floating-id="hero-card"
            ref={(node) => node ? floatingItemsRef.current.set("hero-card", node) : floatingItemsRef.current.delete("hero-card")}>
            <span className="db-hero-float-icon"><BookOpen size={22} /></span>
            <span><b>Không gian</b><small>chuẩn bị bài dạy</small></span>
          </div>
          <div className="db-hero-float db-hero-float--mini" data-floating-id="hero-status"
            ref={(node) => node ? floatingItemsRef.current.set("hero-status", node) : floatingItemsRef.current.delete("hero-status")}>
            <span className="db-hero-mini-check"><Check size={13} /></span>
            <span>Đã sẵn sàng</span>
          </div>
        </div>
        {dashCfg.showGreeting && (
          <>
            <h1 className="db-hello">Chào {displayName ? displayName : "thầy/cô"} 👋</h1>
            <p className="db-date">{todayLabel}</p>
          </>
        )}
        {(dashCfg.showGreeting || backupStatus) && (
          <div className="db-hero-status-row">
            {dashCfg.showGreeting && (
              <div className="db-hero-sub">
                <b data-floating-id="stat-books" ref={(node) => node ? floatingItemsRef.current.set("stat-books", node) : floatingItemsRef.current.delete("stat-books")}>📚 {totalBooks} sách</b>
                {wordBooks > 0 && <b data-floating-id="stat-word" ref={(node) => node ? floatingItemsRef.current.set("stat-word", node) : floatingItemsRef.current.delete("stat-word")}>📝 {wordBooks} Word</b>}
                {pendingTasks > 0 ? <b data-floating-id="stat-tasks" ref={(node) => node ? floatingItemsRef.current.set("stat-tasks", node) : floatingItemsRef.current.delete("stat-tasks")}>📌 {pendingTasks} việc cần làm</b> : <b data-floating-id="stat-tasks" ref={(node) => node ? floatingItemsRef.current.set("stat-tasks", node) : floatingItemsRef.current.delete("stat-tasks")}>✅ Không còn việc tồn</b>}
                {scans.length > 0 && <b data-floating-id="stat-scans" ref={(node) => node ? floatingItemsRef.current.set("stat-scans", node) : floatingItemsRef.current.delete("stat-scans")}>📷 {scans.length} scan SGK</b>}
              </div>
            )}
            {backupStatus && (
              <button data-floating-id="backup" ref={(node) => node ? floatingItemsRef.current.set("backup", node) : floatingItemsRef.current.delete("backup")}
                type="button"
                onClick={() => handleNavigate("datatools")}
                title="Mở Dữ liệu & sao lưu"
                className="db-backup-pill"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, margin: 0,
                  padding: "4px 11px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700,
                  cursor: "pointer",
                  border: `1px solid ${(backupStatus.never || backupStatus.stale) ? "rgba(245,158,11,0.45)" : "var(--border-color)"}`,
                  background: (backupStatus.never || backupStatus.stale) ? "rgba(245,158,11,0.12)" : "var(--surface)",
                  color: (backupStatus.never || backupStatus.stale) ? "var(--warning-deep, #b45309)" : "var(--text-mid)",
                }}
              >
                {backupStatus.never
                  ? "⚠️ Chưa sao lưu — mở trung tâm dữ liệu"
                  : backupStatus.stale
                    ? `💾 Đã ${Math.max(1, Math.round((Date.now() - backupStatus.at) / 86400000))} ngày chưa sao lưu — bấm vào đây`
                    : `💾 Đã sao lưu ${new Date(backupStatus.at).toLocaleString("vi-VN")}`}
              </button>
            )}
            <button className="db-hero-resize" type="button" aria-label="Điều chỉnh chiều cao thẻ xin chào"
              onPointerDown={handleHeroResizePointerDown} title="Kéo để điều chỉnh chiều cao thẻ xin chào">
              <span />
            </button>
          </div>
        )}
        {dashCfg.showQuickActions && (
        <div className="db-quick">
          {visibleQuickActions.map((action) => (
            <button
              key={action.id}
              data-floating-id={`quick-${action.id}`}
              ref={(node) => node ? floatingItemsRef.current.set(`quick-${action.id}`, node) : floatingItemsRef.current.delete(`quick-${action.id}`)}
              className="db-qa"
              onClick={() => handleQuickClick(action)}
            >
              <span className="db-qa-ic">{action.icon}</span>
              <span>{action.label}<small>{action.description}</small></span>
            </button>
          ))}
          <button
            data-floating-id="quick-all-tools"
            ref={(node) => node ? floatingItemsRef.current.set("quick-all-tools", node) : floatingItemsRef.current.delete("quick-all-tools")}
            className="db-qa"
            onClick={() => {
              if (!suppressFloatingClickRef.current) setShowAllTools(true);
            }}
          >
            <span className="db-qa-ic"><MoreHorizontal size={20} /></span>
            <span>Tất cả công cụ<small>{visibleTools.length} khu vực</small></span>
          </button>
        </div>
        )}
      </div>
      )}

      {/* KPI strip — Cài đặt → Bảng điều khiển → Dải số liệu */}
      {dashCfg.showKpis && visibleKpiCards.length > 0 && (
      <div className="db-sec">
        <div className="db-sec-head">
          <h2 className="db-sec-title"><BarChart3 size={16} /> Tổng quan số liệu</h2>
        </div>
        <div className="db-kpi-calendar-layout">
          <div className="db-kpis">
            {visibleKpiCards.map((card) => {
              const targetView = KPI_VIEW_MAP[card.id];
              // KPI Nhiệm vụ mở thẳng tab việc cần làm trong hub; các KPI khác mở view tương ứng
              const go = () => { if (targetView) handleNavigate(targetView, card.id === "tasks" ? { tab: "tasks" } : undefined); };
              return (
                <div key={card.id} className="db-kpi" onClick={go}
                  role={targetView ? "button" : undefined} tabIndex={targetView ? 0 : undefined}
                  onKeyDown={(e) => targetView && e.key === "Enter" && go()} title={card.sub || card.label}>
                  <span className="db-kpi-ic" style={{ color: card.color, background: card.bg }}>{card.icon}</span>
                  <span className="db-kpi-txt"><span className="db-kpi-val">{card.value}</span><span className="db-kpi-label">{card.label}</span>
                  {card.sub && <span className="db-kpi-sub">{card.sub}</span>}</span>
                </div>
              );
            })}
          </div>
          <section className="db-internship-calendar" aria-label="Lịch thực tập">
            <div className="db-internship-calendar-head">
              <div className="db-internship-calendar-title">
                <CalendarDays size={15} />
                <span className="db-internship-calendar-month">{internshipMonthLabel}</span>
              </div>
              <div className="db-internship-calendar-nav">
                <button type="button" aria-label="Tháng trước"
                  onClick={() => setInternshipMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  <ChevronLeft size={15} />
                </button>
                <button type="button" aria-label="Tháng sau"
                  onClick={() => setInternshipMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
            <div className="db-internship-calendar-weekdays" aria-hidden="true">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="db-internship-calendar-grid">
              {internshipCalendarDays.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} className="db-internship-calendar-day" aria-hidden="true" />;
                const date = new Date(internshipMonth.getFullYear(), internshipMonth.getMonth(), day);
                const dateKey = internshipDateKey(date);
                const notes = internshipEntriesByDate.get(dateKey) || [];
                const hasNotes = notes.length > 0;
                const classes = [
                  "db-internship-calendar-day",
                  dateKey === internshipToday ? "is-today" : "",
                  hasNotes ? "has-note" : "",
                  activeInternshipDate === dateKey ? "is-active" : "",
                ].filter(Boolean).join(" ");
                if (!hasNotes) return <span key={dateKey} className={classes}>{day}</span>;
                return (
                  <button key={dateKey} type="button" className={classes}
                    aria-label={`${day} tháng ${internshipMonth.getMonth() + 1}: ${notes.join(" ")}`}
                    aria-expanded={activeInternshipDate === dateKey}
                    onMouseEnter={() => setActiveInternshipDate(dateKey)}
                    onMouseLeave={() => setActiveInternshipDate((active) => active === dateKey ? "" : active)}
                    onClick={() => setActiveInternshipDate(dateKey)}
                    onKeyDown={(event) => { if (event.key === "Escape") setActiveInternshipDate(""); }}>
                    {day}
                    <span className="db-internship-calendar-tooltip" role="tooltip">{notes.map((note, noteIndex) => <span key={`${dateKey}-${noteIndex}`}>{note}</span>)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      )}

      {/* Nội dung chính 2 cột + thanh kéo giữa */}
      <div className="db-main" style={{ "--db-side": `${sideW}px` }}>
        <div className="db-col">
          {(dashCfg.showReading || dashCfg.showRecentPlans) && (
            <DashboardRecentItems
              continueBooks={dashCfg.showReading ? continueBooks : []}
              lessonPlans={lessonPlans}
              recentPlans={dashCfg.showRecentPlans ? recentPlans : []}
              onNavigate={handleNavigate}
            />
          )}

          {/* Phân bổ hoạt động */}
          {dashCfg.showStats && hasActivityData && (
            <div className="db-sec">
              <div className="db-sec-head"><h2 className="db-sec-title"><BarChart3 size={16} /> Phân bổ hoạt động</h2></div>
              <div className="db-abars">
                {activityData.map((item) => (
                  <div key={item.label} className="db-abar" style={{ "--activity-color": item.color }}>
                    <span className="db-abar-label"><span className="db-abar-dot" aria-hidden="true" />{item.label}</span>
                    <span className="db-abar-track" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={maxActivityValue} aria-valuenow={item.value}>
                      <span className="db-abar-fill" style={{ width: `${(item.value / maxActivityValue) * 100}%` }} />
                    </span>
                    <span className="db-abar-val">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phân bố môn học */}
          {dashCfg.showStats && (
          <div className="db-sec">
            <div className="db-sec-head">
              <h2 className="db-sec-title"><BookOpen size={16} /> Phân bố theo môn học</h2>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", background: "var(--surface-soft)", border: "1px solid var(--border-color)", padding: "3px 9px", borderRadius: 999 }}>
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
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.7813rem", fontWeight: 700 }}>
                          <span>{name}</span><span style={{ fontWeight: 800, color: colors[idx % colors.length] }}>{pct}%</span>
                        </div>
                        <div className="db-bar"><i style={{ width: `${pct}%`, background: colors[idx % colors.length] }} /></div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 5 }}>
                          <span>{count} sách</span>{wordInSubject > 0 && <span style={{ color: "var(--primary)", fontWeight: 700 }}>{wordInSubject} Word</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: "0.6875rem", color: "var(--text-muted)", textAlign: "center" }}>Bấm vào môn để lọc thư viện</div>
              </>
            )}
          </div>
          )}

          {/* Bảng trắng */}
          {dashCfg.showWhiteboards && whiteboards.length > 0 && (
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
          {dashCfg.showTasks && (
          <div className="db-sec">
            <div className="db-sec-head">
              <h2 className="db-sec-title"><ClipboardCheck size={16} /> Cần hoàn thành</h2>
              {pendingTasks > 0 && <span className="db-stage-count" style={{ background: "#fef3c7", color: "#b45309" }}>{pendingTasks}</span>}
            </div>
            {pendingTasks === 0 ? (
              <div style={{ fontSize: "0.7813rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 7 }}>
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
          )}

          {/* Nhiệm vụ / huy hiệu — hub `tasks` = daily missions + việc cần làm */}
          {dashCfg.showMissions && (
            <MissionWidget books={books} onViewMissions={() => handleNavigate("tasks", { tab: "today" })} />
          )}

          {/* Scan gần đây */}
          {dashCfg.showScans && scans.length > 0 && (
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
          {dashCfg.showStats && (
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
          )}
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
              <span>{filteredTools.length}/{visibleTools.length}</span>
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
