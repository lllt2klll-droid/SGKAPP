import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  lazy,
  useRef,
} from "react";
import { getApiBase } from "./apiConfig";
import { getBreadcrumb as getBreadcrumbCore, buildNavSections as buildNavSectionsCore, getFooterNav, normalizeExpandedKeys as normalizeExpandedKeysCore } from "./core/navigationRegistry.js";
import { appEvents as appEventsCore, AppEvents as AppEventsCore } from "./core/appEvents.js";
import { BookProvider } from "./core/bookContext.js";
import { VIEW_REGISTRY, getViewEntry } from "./core/viewRegistry.js";
import { toFriendlyError } from "./core/errors.js";
import BookCover from "./BookCover";
import TextBookModal from "./TextBookModal";
import { storageNoticeLevel, storageNoticeText } from "./storageNotice.js";
import { preventWindowDrop, hasFilesInDataTransfer } from "./components/fileDropzoneUtils.js";

// -- Chunk load retry: khắc phục 404 stale chunk sau khi build mới (PWA) --
function lazyWithRetry(factory, retries = 1) {
  return lazy(async () => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await factory();
      } catch (err) {
        const msg = String(err?.message || "");
        const isChunkError = msg.includes("Failed to fetch") || msg.includes("dynamically imported") || msg.includes("Loading chunk") || msg.includes("Importing a module script failed");
        if (isChunkError && i < retries) {
          // Th? cập nhật SW rồi reload một lần
          try {
            if ("serviceWorker" in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r of regs) { try { await r.update(); } catch {} }
            }
          } catch {}
          // bust cache: reload với timestamp
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Chunk load failed");
  });
}
import { getShortcut, matchesShortcut } from "./keyboardShortcuts.js";
import { bookProgress, progressFromPages, READ_STATUS } from "./readingProgress.js";
import {
  PRIMARY_SUBJECTS,
  getSubjectCatalog,
  syncCatalogWithBooks,
  sortSubjects,
} from "./subjectCatalog";
import {
  Settings,
  Search,
  BookOpen,
  RefreshCw,
  X,
  Plus,
  Check,
  Sparkles,
  Upload,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Library,
  Clock,
  Star,
  BarChart3,
  GraduationCap,
  HelpCircle,
  Sun,
  Moon,
  Monitor,
  LayoutGrid,
  List,
  ArrowUpDown,
  Trash2,
  BookOpenCheck,
  TrendingUp,
  CheckCheck,
  Bookmark,
  BookmarkCheck,
  NotebookPen,
  Award as AwardIcon,
  FileSearch,
  Columns2,
  Tags,
  ClipboardList,
  Scissors,
  FileText,
  Puzzle,
  ListChecks,
  Database,
  DatabaseBackup,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Lightbulb,
  ClipboardCheck,
  School,
  Pencil,
  RotateCcw,
  Edit3,
  Wrench,
  AppWindow,
  Globe,
  Palette,
  Maximize,
  Minimize,
} from "lucide-react";
const BookReader = lazyWithRetry(() => import("./BookReader"));
const GlossaryPanel = lazyWithRetry(() => import("./GlossaryPanel"));
const LobbyBubble = lazyWithRetry(() =>
  import("./UtilityBubble").then((module) => ({ default: module.LobbyBubble })),
);
const SearchView = lazyWithRetry(() => import("./SearchView"));
const CompareView = lazyWithRetry(() => import("./CompareView"));
const MatrixView = lazyWithRetry(() => import("./MatrixView"));
const DashboardView = lazyWithRetry(() => import("./DashboardView"));
const IdeasView = lazyWithRetry(() => import("./IdeasView"));
const InternshipView = lazyWithRetry(() => import("./InternshipView"));
import GlobalSearch from "./GlobalSearch";
const LangStatsView = lazyWithRetry(() => import("./LangStatsView"));
const InventoryView = lazyWithRetry(() => import("./InventoryView"));
const CollectionsView = lazyWithRetry(() => import("./CollectionsView"));
const ConceptsView = lazyWithRetry(() => import("./ConceptsView"));
const ReferencesView = lazyWithRetry(() => import("./ReferencesView"));
const ActivitiesView = lazyWithRetry(() => import("./ActivitiesView"));
const QuestionBankView = lazyWithRetry(() => import("./QuestionBankView"));
const WorksheetsView = lazyWithRetry(() => import("./WorksheetsView"));
const DataToolsView = lazyWithRetry(() => import("./DataToolsView"));
const WebToolboxView = lazyWithRetry(() => import("./WebToolboxView"));
const WhiteboardView = lazyWithRetry(() => import("./whiteboard/WhiteboardView.jsx"));
import { getQuestions } from "./teachingDB";
import { getPlans as getKhbdV2Plans } from "./khbd/planModel";
import { getClips, getRefs, getConcepts, countMarks } from "./researchDB";
import { saveJSON, exportBackup } from "./storage";
import { moveToTrash, takeFromTrash, listTrash, listTrashByType, TRASH_TYPE, TRASH_TTL_DAYS } from "./trashStore";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "./safeStorage";
import SampleButton from "./SampleButton";
import DataTable from "./DataTable";
import AssistantBubble from "./AssistantBubble";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import { fillSampleVocab, fillSampleQuiz } from "./sampleData";
import MissionWidget from "./MissionWidget";
import SettingsCenter from "./SettingsCenter";
import { loadSettings, saveSettings, applySettings, getStartPage, recordLastView, shouldConfirmDelete, shouldShowNotifications, vibrateFeedback, refreshNotificationTimer, updateSettings } from "./settingsStore";
import {
  ensureTodayMissions,
  evaluateStreakOnDate,
  todayStr,
  migrateMissions,
} from "./missionStore";
import { emitBookOpened } from "./missionEvents";
import {
  getAllBookmarks,
  removeBookmark,
  clearBookmarksForFile,
  getBookmarkLabel,
  setBookmarkLabel,
  getVocab,
  removeVocabEntry,
  clearVocab,
  updateVocabMeaning,
  getQuizHistory,
  clearQuizHistory,
  formatDateTime,
  clearLastPages,
} from "./userdata";
import { getGeminiApiKey, setGeminiApiKey } from "./storage";
import { formatSuggestedBookTitle } from "./bookUtils";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { pdfjsLib } from "./pdfjs-config";
import { buildIndex, needsRebuild, getIndexMeta } from "./searchIndex";

const API_BASE = getApiBase();

// -- localStorage keys --------------------------------------------
const LS = {
  theme: "sgk_theme", // 'light' | 'dark' | 'system'
  geminiKey: "GEMINI_API_KEY",
  favs: "sgk_favs", // string[] of filenames
  history: "sgk_history", // { filename, at }[]
  counts: "sgk_counts", // { filename: number }
  viewMode: "sgk_view_mode", // 'grid' | 'list'
  sortBy: "sgk_sort_by",
  lastPage: (f) => `lastPage_${f}`,
  lastTotal: (f) => `lastTotal_${f}`,
};

function loadJSON(key, fallback) {
  return safeGetJSON(key, fallback);
}

// -- Debounced value hook • tinh tế: input phản hồi ngay nhưng lọc/list debounce 200ms --
function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const SORT_OPTIONS = [
  { id: "grade", label: "Lớp + môn" },
  { id: "name", label: "Tên A→Z" },
  { id: "nameDesc", label: "Tên Z→A" },
  { id: "size", label: "Kích thước nhỏ→lớn" },
  { id: "sizeDesc", label: "Kích thước lớn→nhỏ" },
  { id: "recent", label: "Mở gần đây" },
  { id: "progress", label: "Tiến độ cao→thấp" },
  { id: "progressAsc", label: "Tiến độ thấp→cao" },
];

const SUBJECTS = PRIMARY_SUBJECTS; // giữ nguyên master, chi tiết trong subjectCatalog.js
const TERMS = [1, 2];

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Unified error contract • log typed error + friendly message for teacher
    try {
      const ui = toFriendlyError(error);
      console.error(`[AppErrorBoundary:${ui.type}]`, ui.message, error, errorInfo);
    } catch { console.error("App error boundary caught:", error, errorInfo); }
  }

  handleChunkReload = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) { try { await r.unregister(); } catch {} }
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const k of keys) { try { await caches.delete(k); } catch {} }
      }
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const rawMsg = String(this.state.error?.message || "");
      const friendly = (()=>{ try{ return toFriendlyError(this.state.error); }catch{ return { message: rawMsg, type:"AppError" }; }})();
      const isChunk = rawMsg.includes("Failed to fetch") || rawMsg.includes("dynamically imported") || rawMsg.includes("Loading chunk") || rawMsg.includes("Importing a module");
      const displayMsg = isChunk
        ? "Phiên bản mới vừa được cập nhật • trình duyệt đang giữ bản cũ. Hãy tải lại để nhận bản mới (sẽ xóa cache cũ)."
        : (friendly.message || "Thầy/cô hãy tải lại trang nhé.");
      return (
        <div className="error-fallback" style={{ padding: 24, textAlign: "center" }}>
          <h2 className="error-fallback-title">Có lỗi xảy ra{friendly.type && friendly.type !== "AppError" ? ` • ${friendly.type}` : ""}</h2>
          <p className="body-text" style={{ maxWidth: 520, margin: "8px auto", color: "var(--text-muted)" }}>
            {displayMsg}
          </p>
          {isChunk && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4 }}>Chi tiết: {rawMsg.slice(0, 180)}</p>}
          {!isChunk && friendly.recoverable === false && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Mã lỗi: {String(friendly.type || "").slice(0,60)}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} className="btn btn-secondary">Tải lại</button>
            {isChunk && <button onClick={this.handleChunkReload} className="btn btn-primary">Xóa cache & tải lại</button>}
            {friendly.action === "clearCache" && !isChunk && <button onClick={this.handleChunkReload} className="btn btn-primary">Xóa cache & tải lại</button>}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const ViewFallback = ({ label = "Đang tải nội dung..." }) => (
  <div className="dash-empty view-fallback">
    <div className="spinner spinner-sm" />
    <p className="body-muted">{label}</p>
  </div>
);

// Tên hiển thị tiếng Việt cho các nhóm điều hướng (giữ nguyên id/key gốc để không vỡ storage/logic)
const SECTION_VI = {
  WORKSPACE: "Không gian làm việc",
  "CÔNG VIỆC": "Công việc",
  "KHO CÔNG CỤ": "Kho công cụ",
  "TIỆN ÍCH": "Tiện ích",
};

// Chuẩn hóa key expandedSections qua core/navigationRegistry (pure, có unit test) — wrapper giữ chỗ gọi cũ.
function normalizeExpandedKeys(obj) {
  try { return normalizeExpandedKeysCore(obj, buildNavSectionsCore({})); } catch { return obj; }
}

export default function App() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking");
  const [currentBook, setCurrentBook] = useState(null);
  const [openInitialPage, setOpenInitialPage] = useState(null);
  // Tang mỗi khi sách đang mở được sửa/lưu (TextBookModal) để BookReader tải lại nội dung mới
  const [bookContentNonce, setBookContentNonce] = useState(0);

  // Dashboard state — trang mở đầu tuân theo Cài đặt → Tổng quan → Trang mở mặc định
  const [view, setView] = useState(() => { try { return getStartPage(); } catch { return "dashboard"; } }); // dashboard | library | continue | marks | vocab | stats | glossary | help | search | compare | matrix | langstats | inventory | collections | concepts | references | lessonplans | activities | worksheets | questionbank | datatools
  // Ghi nhớ trang cuối để "Lần cuối đã mở" hoạt động
  useEffect(() => { try { recordLastView(view); } catch {} }, [view]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const v = safeGetString("sgk_sidebar_collapsed", null);
    return v === "true";
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const raw = safeGetString("sgk_sidebar_w", "");
    const v = parseInt(raw || "", 10);
    if (Number.isFinite(v) && v >= 180 && v <= 420) return v;
    return 280;
  });
  const sidebarDragRef = useRef(null);
  const onSidebarResizeStart = useCallback((e)=>{
    if(sidebarCollapsed) return;
    e.preventDefault();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startW = sidebarWidth;
    sidebarDragRef.current = { startX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev)=>{
      const curX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const nw = Math.max(180, Math.min(420, startW + (curX - startX)));
      setSidebarWidth(nw);
      try {
        const res = safeSetString("sgk_sidebar_w", String(nw));
        if (!res.ok && res.quota) {
          console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
        } else if (!res.ok) {
          console.warn("[App] safeSetString failed for sgk_sidebar_w:", res.error);
        }
      } catch (e) { console.warn("[App] safeSetString exception sgk_sidebar_w:", e); }
    };
    const onUp = ()=>{
      sidebarDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive:false });
    window.addEventListener("touchend", onUp);
  }, [sidebarCollapsed, sidebarWidth]);
  useEffect(()=>{ try{ const res = safeSetString("sgk_sidebar_w", String(sidebarWidth)); if (!res.ok && res.quota) console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy"); else if (!res.ok) console.warn("[App] safeSetString failed sgk_sidebar_w:", res.error); } catch(e){ console.warn("[App] safeSetString exception sgk_sidebar_w:", e);} }, [sidebarWidth]);
  const [expandedSections, setExpandedSections] = useState(() => {
    // Key phải là ID ổn định từ NAVIGATION_CONFIG (workspace, library-group, teaching-group,
    // assessment-group, research-group, advanced-group, work, webtools-section).
    // Trước đây key là LABEL tiếng Việt, và bản cũ từng ghi nhầm mất dấu ra localStorage
    // ("TRANG CH?", "CÔNG C? NÂNG CAO") nên: (a) không khớp id đang lưu trong localStorage
    // -> trạng thái thu/mở mất sau mỗi reload, (b) nhóm "Thư viện SGK" luôn bị thu gọn.
    const defaults = {
      workspace: true,
      "library-group": true,
      "teaching-group": true,
      "assessment-group": false,
      "research-group": false,
      "advanced-group": false,
      work: true,
      "webtools-section": true,
    };
    const parsed = safeGetJSON("sgk_expanded_sections", null, (d) => d && typeof d === "object" && !Array.isArray(d));
    if (!parsed) return { ...defaults };

    // Legacy migrations: key label của bản cũ → id mới (giữ nguyên hành vi map cũ).
    const legacy = { ...parsed };
    const carry = (fromKeys, toKey) => {
      for (const k of fromKeys) {
        if (k in legacy && !(toKey in legacy)) legacy[toKey] = legacy[k];
      }
    };
    // 2 mục dưới đây là KEY DỮ LIỆU CŨ ĐÃ LƯU trong localStorage — KHÔNG phải text hiển
    // thị, CẤM "sửa" thành "TRANG CHỦ"/"CÔNG CỤ NÂNG CAO": người dùng còn giữ key mất
    // dấu sẽ mất trạng thái thu/mở nếu bỏ dạng hỏng.
    carry(["TRANG CHỦ", "TRANG CH?"], "workspace");
    carry(["HỌC TẬP"], "workspace");
    carry(["ĐỌC & TÀI LIỆU"], "library-group");
    carry(["NGHIÊN CỨU"], "research-group");
    carry(["SOẠN DẠY"], "teaching-group");
    carry(["CÔNG CỤ NÂNG CAO", "CÔNG C? NÂNG CAO"], "work");

    // Label còn lại → id (đồng thời bỏ key label trùng khi id đã có).
    const normalized = normalizeExpandedKeys(legacy);
    // parsed (đã lưu) ghi đè defaults — đây chính là dòng bị thiếu khiến trạng thái không được đọc lại.
    return { ...defaults, ...normalized };
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const v = safeGetString(LS.theme, null);
    return v || "system";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsState, setSettingsState] = useState(() => loadSettings());
  const autoIndexedBooksRef = useRef(new Set());
  const [uploadingBook, setUploadingBook] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  // B3 • Nút "Hoàn tác" 6s đi kèm thông báo đưa sách vào Thùng rác
  const [noticeUndo, setNoticeUndo] = useState(null); // { text, run }
  const [uploadError, setUploadError] = useState("");
  const [uploadDraft, setUploadDraft] = useState(null);
  const [uploadThumb, setUploadThumb] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const uploadInputRef = useRef(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [editingTextBook, setEditingTextBook] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [lpOpenId, setLpOpenId] = useState(null);
  // tinh tế: thay confirm/prompt bằng modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  // A2 • số mục trong Thùng rác → badge ở mục "Sao lưu & Khôi phục"
  const [trashCount, setTrashCount] = useState(() => {
    try { return listTrash().length; } catch { return 0; }
  });
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const noticeTimerRef = useRef(null);
  // ── A1 • Cảnh báo bộ nhớ trình duyệt (quota + ước tính dung lượng) ──
  const [storageNotice, setStorageNotice] = useState(null); // { level: "warn" | "danger", text }
  const dismissedStorageLevelsRef = useRef({});
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [keyError, setKeyError] = useState("");
  const [testingKey, setTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  // App is designed for teachers - teacher mode is always enabled
  const teacherMode = true;

  // Filters • mở rộng cho 1-5 và đầy đủ môn, thêm Tập
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const isSearching = searchQuery !== debouncedSearchQuery;
  const [gradeFilter, setGradeFilter] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState(null);
  const [termFilter, setTermFilter] = useState(null); // null | 1 | 2
  const [readingStatusFilter, setReadingStatusFilter] = useState(null); // null | reading | completed | unread
  const [favOnly, setFavOnly] = useState(false);
  const [viewMode, setViewMode] = useState(() => loadJSON(LS.viewMode, "grid"));
  const [sortBy, setSortBy] = useState(() => loadJSON(LS.sortBy, "grade"));

  // Persisted collections
  const [favs, setFavs] = useState(() => loadJSON(LS.favs, []));
  const [history, setHistory] = useState(() => loadJSON(LS.history, []));
  const [counts, setCounts] = useState(() => loadJSON(LS.counts, {}));

  // Bumped whenever localStorage-backed data changes (reader return, deletes, etc.)
  const [dataVersion, setDataVersion] = useState(0);

  // Keep subject catalog persistent • sync discovered subjects from books into master catalog
  useEffect(() => {
    if (books && books.length) {
      try {
        syncCatalogWithBooks(books);
      } catch {}
    }
  }, [books]);

  // Chống lỗi phổ biến nhất: thả file ngoài dropzone làm trình duyệt mở file / mất trang
  useEffect(() => preventWindowDrop(), []);

  // Tự động ẩn thông báo sau 5s, có hover pause (tinh tế)
  useEffect(() => {
    if (!uploadNotice && !uploadError) return;
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setUploadNotice(""); setUploadError(""); setNoticeUndo(null);
    }, 5500);
    return () => clearTimeout(noticeTimerRef.current);
  }, [uploadNotice, uploadError]);

  const showStorageNotice = useCallback((level, text) => {
    setStorageNotice((prev) => {
      if (prev && prev.level === level) return prev;
      if (dismissedStorageLevelsRef.current[level]) return prev;
      return { level, text };
    });
  }, []);

  const dismissStorageNotice = useCallback(() => {
    setStorageNotice((prev) => {
      if (prev) dismissedStorageLevelsRef.current[prev.level] = true;
      return null;
    });
  }, []);

  // Ước tính dung lượng trình duyệt: >90% cảnh báo, >98% báo nguy hiểm
  const checkStorageQuota = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.storage?.estimate) return;
      const est = await navigator.storage.estimate();
      // A1 • ngưỡng 90%/98% sống trong storageNotice.js để test được
      const res = storageNoticeLevel(est?.usage, est?.quota);
      if (!res || res.level === "ok") return;
      showStorageNotice(res.level, storageNoticeText(res.level, res.pct));
    } catch { /* trình duyệt không hỗ trợ estimate → bỏ qua */ }
  }, [showStorageNotice]);

  useEffect(() => {
    const off = appEventsCore.on(AppEventsCore.STORAGE_QUOTA_EXCEEDED, (detail) => {
      showStorageNotice("danger", (detail && detail.message) || "Bộ nhớ trình duyệt đã đầy: thao tác lưu vừa thất bại. Hãy Sao lưu ngay rồi dọn cache.");
    });
    checkStorageQuota();
    const timer = setInterval(checkStorageQuota, 5 * 60 * 1000);
    return () => { try { if (typeof off === "function") off(); } catch {} clearInterval(timer); };
  }, [checkStorageQuota, showStorageNotice]);

  // Bấm "Sao lưu ngay" trong banner → xuất file + ghi mốc thời gian
  const handleBackupNow = useCallback(async () => {
    try {
      const result = await exportBackup();
      const iso = new Date().toISOString();
      try { safeSetString("sgk_last_backup", String(Date.now())); } catch {}
      try { updateSettings({ backup: { lastBackupTime: iso } }); } catch {}
      dismissStorageNotice();
      setUploadNotice(`Đã tải file sao lưu (${result.total} mục). Hãy lưu file vào OneDrive/USB để an toàn.`);
    } catch (e) {
      setUploadError(`Sao lưu thất bại: ${e?.message || "lỗi không rõ"}`);
    }
  }, [dismissStorageNotice]);

  // ── A3 • Tự sao lưu định kỳ — mở app là chạy 1 lần nếu đã đến hạn ──
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const autoBackup = await import("./autoBackup.js");
        let settings = loadSettings();
        // Migr 1 lần: bản cũ đặt autoBackup=false → bật lần đầu, sau đó tôn trọng lựa chọn của cô/thầy
        try {
          if (!safeGetString("sgk_autobackup_v1", null)) {
            settings = { ...settings, backup: { ...(settings.backup || {}), autoBackup: true } };
            saveSettings(settings);
            safeSetString("sgk_autobackup_v1", "1");
          }
        } catch {}
        if (cancelled || !autoBackup.isAutoBackupDue(settings)) return;
        const res = await autoBackup.runAutoBackup("startup");
        if (cancelled || !res.ok) return;
        try { appEventsCore.emit(AppEventsCore.DATA_UPDATED, { source: "auto-backup" }); } catch {}
        setUploadNotice("Đã tự sao lưu nền — bản gần nhất xem ở Sao lưu & Khôi phục.");
      } catch (e) {
        console.warn("[App] auto backup failed:", e);
      }
    }, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Tạo thumbnail cho ảnh upload
  useEffect(() => {
    if (!uploadDraft?.file) { setUploadThumb(""); return; }
    if (uploadDraft.file.type?.startsWith("image/")) {
      const url = URL.createObjectURL(uploadDraft.file);
      setUploadThumb(url);
      return () => URL.revokeObjectURL(url);
    }
    setUploadThumb("");
  }, [uploadDraft]);

  // Last-read page per book (PDF page numbers) • per-book keys không trộn
  const lastPageMap = useMemo(() => {
    void dataVersion; // re-read localStorage whenever the data version bumps
    const map = {};
    books.forEach((b) => {
      const s = safeGetString(LS.lastPage(b.filename), null);
      if (s) map[b.filename] = parseInt(s, 10) || 0;
    });
    return map;
  }, [books, dataVersion]);

  // Total PDF pages per book (recorded by the reader when a book is opened) • per-book keys không trộn
  const lastTotalMap = useMemo(() => {
    void dataVersion;
    const map = {};
    books.forEach((b) => {
      const s = safeGetString(LS.lastTotal(b.filename), null);
      if (s) map[b.filename] = parseInt(s, 10) || 0;
    });
    return map;
  }, [books, dataVersion]);

  // Refresh localStorage-backed collections when returning from the reader
  const bookmarksMap = useMemo(() => {
    void dataVersion;
    return getAllBookmarks();
  }, [dataVersion]);
  const totalBookmarks = useMemo(
    () => Object.values(bookmarksMap).reduce((a, p) => a + p.length, 0),
    [bookmarksMap],
  );
  const vocabList = useMemo(() => {
    void dataVersion;
    return getVocab();
  }, [dataVersion]);
  const vocabCount = vocabList.length;
  const quizHistory = useMemo(() => {
    void dataVersion;
    return getQuizHistory();
  }, [dataVersion]);
  const plansCount = useMemo(() => {
    void dataVersion;
    // Kho mới (khbd_v2_*) + kho cu còn sót (sgk_lessonplans) • tr? trùng id
    try {
      const ids = new Set();
      for (const p of getKhbdV2Plans()) ids.add(p.id);
      const legacy = safeGetJSON("sgk_lessonplans", [], Array.isArray) || [];
      for (const p of legacy) ids.add(p.id);
      return ids.size;
    } catch { return 0; }
  }, [dataVersion]);
  const questionCount = useMemo(() => {
    void dataVersion;
    return getQuestions().length;
  }, [dataVersion]);
  const [totalClips, setTotalClips] = useState(0);

  useEffect(() => {
    let alive = true;
    const loadTotalClips = async () => {
      try {
        const clips = await getClips();
        if (alive) {
          setTotalClips(Array.isArray(clips) ? clips.length : 0);
        }
      } catch (err) {
        console.error("Failed to load total clips:", err);
        if (alive) {
          setTotalClips(0);
        }
      }
    };

    loadTotalClips();
    return () => {
      alive = false;
    };
  }, [dataVersion]);
  const totalMarks = useMemo(() => {
    void dataVersion;
    return books.reduce((a, b) => a + countMarks(b), 0);
  }, [books, dataVersion]);
  const getWebToolsCount = () => {
    const arr = safeGetJSON("sgk_web_tools", [], (d) => Array.isArray(d));
    return Array.isArray(arr) ? arr.length : 0;
  };
  const [webToolsCount, setWebToolsCount] = useState(() => getWebToolsCount());
  useEffect(() => {
    const upd = () => setWebToolsCount(getWebToolsCount());
    window.addEventListener("sgk:webtools-updated", upd);
    window.addEventListener("sgk:data-updated", upd);
    return () => {
      window.removeEventListener("sgk:webtools-updated", upd);
      window.removeEventListener("sgk:data-updated", upd);
    };
  }, []);
  const getWhiteboardCount = () => {
    const arr = safeGetJSON("sgk_wb_index", [], (d) => Array.isArray(d));
    return Array.isArray(arr) ? arr.length : 0;
  };
  const [whiteboardCount, setWhiteboardCount] = useState(() => getWhiteboardCount());
  useEffect(() => {
    const updWb = () => setWhiteboardCount(getWhiteboardCount());
    window.addEventListener("sgk:data-updated", updWb);
    window.addEventListener("sgk:whiteboard-updated", updWb);
    return () => {
      window.removeEventListener("sgk:data-updated", updWb);
      window.removeEventListener("sgk:whiteboard-updated", updWb);
    };
  }, []);

  // Apply color system immediately on mount so custom accent shows before books load
  useEffect(() => {
    try {
      const s = loadSettings();
      applySettings(s);
      // also set data-theme early
      const t = s.appearance?.theme || "system";
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const dark = t === "dark" || (t === "system" && mq.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    } catch {}
  }, []);

  // -- Settings listener • mount-only, không phụ thuộc loading/books để không bị lỡ event —
  useEffect(() => {
    const onSettings = (e) => {
      if (e.detail) {
        setSettingsState(e.detail);
        setGeminiKey(getGeminiApiKey());
        applySettings(e.detail);
        try { refreshNotificationTimer(e.detail); } catch {}
        try {
          const lib = e.detail?.library;
          if (lib) {
            if (typeof lib.viewMode === "string" && lib.viewMode) setViewMode(lib.viewMode);
            if (typeof lib.sortBy === "string" && lib.sortBy) setSortBy(lib.sortBy);
          }
        } catch {}
      }
    };
    window.addEventListener("sgk:settings-updated", onSettings);
    return () => window.removeEventListener("sgk:settings-updated", onSettings);
  }, []);

  // -- Sidebar tuân theo Cài đặt → Giao diện → Thanh điều hướng (auto = giữ tay người dùng)
  useEffect(() => {
    try {
      const mode = settingsState?.appearance?.sidebar || "auto";
      if (mode === "collapsed") setSidebarCollapsed(true);
      else if (mode === "expanded") setSidebarCollapsed(false);
    } catch {}
  }, [settingsState?.appearance?.sidebar]);
  // -- Tắt "Nhóm theo môn" là xổ tất cả + xóa lọc môn đang chọn
  useEffect(() => {
    try {
      if (settingsState?.library?.groupBySubject === false) setSubjectFilter(null);
    } catch {}
  }, [settingsState?.library?.groupBySubject]);
  // -- Lập lịch nhắc hằng ngày 1 lần khi app khởi động
  useEffect(() => { try { refreshNotificationTimer(loadSettings()); } catch {} }, []);
  // -- Apply settings + missions init • ch? chạy khi loading chuyển false (1 lần), không rerun theo books.length
  useEffect(() => {
    if (loading) return;
    try {
      migrateMissions();
    } catch {}
    const s = loadSettings();
    setSettingsState(s);
    applySettings(s);
    // sync theme state from settings if exists
    if (s.appearance && s.appearance.theme) setTheme(s.appearance.theme);
    // ensure missions for today - only after books are loaded
    try {
      ensureTodayMissions({ settings: s, books });
    } catch {}
    try {
      evaluateStreakOnDate(todayStr());
    } catch {}
  }, [loading]);
  // re-ensure missions when books change - only after loading is complete
  useEffect(() => {
    if (loading) return;
    try {
      const s = loadSettings();
      ensureTodayMissions({ settings: s, books });
    } catch {}
  }, [loading, books]);

  // -- Theme controller • sets data-theme AND re-applies accent semantics so custom color adapts to light/dark --
  useEffect(() => {
    const effTheme = settingsState?.appearance?.theme || theme;
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const t = effTheme;
      const dark = t === "dark" || (t === "system" && mq.matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", dark ? "#0B1220" : "#2563EB");
      // Re-apply accent with correct light/dark semantics so custom color updates instantly
      try {
        const cur = settingsState || loadSettings();
        applySettings(cur);
      } catch {}
    };
    apply();
    try {
      const res = safeSetString(LS.theme, effTheme);
      if (!res.ok && res.quota) {
        console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
      } else if (!res.ok) {
        console.warn("[App] safeSetString failed for theme:", res.error);
      }
    } catch (e) { console.warn("[App] safeSetString exception theme:", e); }
    // Re-apply once settingsState is hydrated (after books load applySettings may have run with stale theme)
    try {
      const cur = settingsState || loadSettings();
      applySettings(cur);
    } catch {}
    if (effTheme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme, settingsState]);

  // Reset to library view when opening a book or returning
  // Tôn trọng Cài đặt: Riêng tư → Ghi nhớ lịch sử (tắt = không lưu) + Hành vi → Rung
  const handleOpenBook = useCallback((book, initialPage = null) => {
    const at = Date.now();
    setOpenInitialPage(initialPage);
    setCurrentBook(book);
    try {
      emitBookOpened(book.filename);
    } catch {}
    try { vibrateFeedback(15); } catch {}
    let remember = true;
    try { remember = loadSettings().privacy?.rememberHistory !== false; } catch {}
    if (!remember) return;
    setHistory((prev) => {
      const next = [
        { filename: book.filename, at },
        ...prev.filter((h) => h.filename !== book.filename),
      ].slice(0, 20);
      saveJSON(LS.history, next);
      return next;
    });
    setCounts((prev) => {
      const next = { ...prev, [book.filename]: (prev[book.filename] || 0) + 1 };
      saveJSON(LS.counts, next);
      return next;
    });
  }, []);

  // Leave the reader (any exit path) and refresh localStorage-backed collections
  // View IDs validated via viewRegistry when possible • unknown IDs fall back to library
  const [tasksInitialTab, setTasksInitialTab] = useState("today");
  const closeBook = useCallback((targetView, opts) => {
    setCurrentBook(null);
    setOpenInitialPage(null);
    setDataVersion((v) => v + 1);
    if (opts && typeof opts.planId === "string" && opts.planId) setLpOpenId(opts.planId);
    // Hub nhiệm vụ: giữ tab được yêu cầu (today|tasks|...) để MissionsView mở đúng chỗ ngay lần mount đầu
    if (targetView === "tasks" && opts && typeof opts.tab === "string") setTasksInitialTab(opts.tab);
    const normalized = targetView || "library";
    // Validate via registry if available, but don't block navigation for inline/legacy views
    if (normalized !== "library" && typeof getViewEntry === "function" && !getViewEntry(normalized)) {
      console.warn(`[App] Unknown view "${normalized}", falling back to library`);
      setView("library");
      return;
    }
    setView(normalized);
    // Báo cho view đã mount (vd hub Nhiệm vụ đổi tab) — đánh dấu source để handler bỏ qua, chống loop
    try { appEventsCore.emit(AppEventsCore.NAVIGATE, { view: normalized, tab: opts?.tab, planId: opts?.planId, source: "hub" }); } catch {}
  }, []);

  const handleBack = useCallback(() => {
    closeBook("library");
  }, [closeBook]);

  // Open source from scan badge (global event)
  useEffect(() => {
    const onOpenSource = (e) => {
      const { filename, page } = e.detail || {};
      if (!filename) return;
      const found = books.find((b) => b.filename === filename);
      if (found) {
        handleOpenBook(found, page || 1);
      } else {
        // fallback: try to show message
        console.warn("Source book not found:", filename);
      }
    };
    window.addEventListener("sgk:open-source", onOpenSource);
    return () => window.removeEventListener("sgk:open-source", onOpenSource);
  }, [books, handleOpenBook]);

  // Unified navigation hub • whiteboard và các module khác dùng chung
  // Luồng duy nhất: event → closeBook → hub-emit (source:'hub') cho view đã mount.
  // Bỏ qua event marked (đã nhận direct) và event nguồn hub để chống loop/double.
  useEffect(() => {
    const onNavigate = (e) => {
      try { if (e && e.__fromAppEvents) return; } catch {}
      const { view, tab, planId } = e.detail || {};
      if (view) {
        closeBook(view, { ...(planId ? { planId } : {}), ...(tab ? { tab } : {}) });
        setMobileNavOpen(false);
      }
    };
    const offDirect = (() => {
      try {
        return appEventsCore.on(AppEventsCore.NAVIGATE, (detail) => {
          if (!detail || detail.source === "hub") return;
          const { view, tab, planId } = detail || {};
          if (view) {
            closeBook(view, { ...(planId ? { planId } : {}), ...(tab ? { tab } : {}) });
            setMobileNavOpen(false);
          }
        });
      } catch { return null; }
    })();
    window.addEventListener("sgk:navigate", onNavigate);
    return () => { window.removeEventListener("sgk:navigate", onNavigate); try { if (typeof offDirect === "function") offDirect(); } catch {} };
  }, [closeBook]);

  const toggleFav = useCallback((filename) => {
    setFavs((prev) => {
      const next = prev.includes(filename)
        ? prev.filter((f) => f !== filename)
        : [...prev, filename];
      saveJSON(LS.favs, next);
      return next;
    });
  }, []);

  const confirmDeleteBook = useCallback(
    async (directBook) => {
      const book = directBook || deleteTarget;
      if (!book) return;
      setDeleteTarget(null);
      // Cài đặt → Hành vi → "Hiện bong bóng thông báo": tắt là không hiện tin thành công
      const say = (m, undo) => {
        try { if (!shouldShowNotifications()) return; } catch {}
        setUploadNotice(m);
        setNoticeUndo(undo ? { text: m, run: undo } : null);
      };
      try {
        // A2 • XÓA = chuyển vào Thùng rác (30 ngày). File PDF chưa bị đụng tới,
        // mọi ghi chú/đánh dấu/tiến độ của sách vẫn giữ nguyên → khôi phục 1 bấm là về.
        const trashed = moveToTrash({
          type: TRASH_TYPE.BOOK,
          label: book.title,
          meta: { filename: book.filename },
          payload: book,
        });
        if (!trashed) throw new Error("Không đưa được sách vào thùng rác (bộ nhớ trình duyệt đầy?).");
        setBooks((prev) => prev.filter((b) => b.filename !== book.filename));
        if (currentBook?.filename === book.filename) closeBook("library");
        setDataVersion((v) => v + 1);
        say(
          `Đã đưa "${book.title}" vào Thùng rác — giữ ${TRASH_TTL_DAYS} ngày, khôi phục được ở Sao lưu & Khôi phục.`,
          () => {
            let back = null;
            try { back = takeFromTrash(trashed.id); } catch (e) { console.warn("undo trash failed:", e); }
            if (!back) { setNoticeUndo(null); return; }
            setUploadNotice(`Đã hoàn tác — "${back.label}" đã trở lại thư viện.`);
            setNoticeUndo(null);
          },
        );
      } catch (err) {
        console.error("Delete book error:", err);
        setError(err.message || "không thể xóa sách.");
      }
    },
    [deleteTarget, closeBook, currentBook],
  );
  // Tôn trọng Cài đặt → Hành vi → "Hỏi trước khi xóa": tắt là xóa ngay không hỏi
  const handleDeleteBook = useCallback(
    (book) => {
      if (!book || !book.filename) {
        setError("không thể xóa sách: thông tin sách không hợp lệ.");
        return;
      }
      let needConfirm = true;
      try { needConfirm = shouldConfirmDelete(); } catch {}
      if (!needConfirm) { confirmDeleteBook(book); return; }
      setDeleteTarget(book);
    },
    [confirmDeleteBook],
  );

  const handleRenameBook = useCallback((book) => {
    if (!book) return;
    setRenameTarget(book);
    setRenameValue(book.title);
  }, []);
  const confirmRenameBook = useCallback(() => {
    const book = renameTarget;
    if (!book) return;
    const newTitle = renameValue.trim();
    if (!newTitle || newTitle === book.title) { setRenameTarget(null); return; }
    if (newTitle.length < 2) { setError("Tên sách phải ít nhất 2 ký tự."); return; }
    const customTitles = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
    customTitles[book.filename] = newTitle;
    try {
      const res = safeSetJSON("sgk_custom_titles", customTitles);
      if (!res.ok) {
        if (res.quota) {
          setError("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
        } else {
          setError(res.message || "Không thể đổi tên sách.");
        }
        return;
      }
      setBooks((prev) => prev.map((b) => b.filename === book.filename ? { ...b, title: newTitle } : b));
      setDataVersion((v) => v + 1);
      try { if (shouldShowNotifications()) setUploadNotice("Đã đổi tên sách thành công."); } catch { setUploadNotice("Đã đổi tên sách thành công."); }
    } catch (e) { console.warn("[App] confirmRenameBook failed:", e); setError(e.message || "Không thể đổi tên sách."); }
    finally { setRenameTarget(null); }
  }, [renameTarget, renameValue]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveJSON(LS.history, []);
  }, []);

  const resetStats = useCallback(() => {
    setCounts({});
    saveJSON(LS.counts, {});
    setHistory([]);
    saveJSON(LS.history, []);
    clearQuizHistory();
    clearLastPages(books.map((b) => b.filename));
    setDataVersion((v) => v + 1);
  }, [books]);

  const clearQuiz = useCallback(() => {
    clearQuizHistory();
    setDataVersion((v) => v + 1);
  }, []);

  const handleClearCacheAndReload = useCallback(async () => {
    try {
      // Unified via core/storageKeys (single source) • keep legacy list as fallback
      let cachePrefixes;
      try { cachePrefixes = (await import("./core/storageKeys.js")).STORAGE_KEYS.CACHE_PREFIXES; } catch { cachePrefixes = ["sgk_idx_", "sgk_idxmeta_", "sgk_index_", "sgk_meta_", "ocr_", "txt_", "chat_"]; }
      const { listKeys } = await import("./safeStorage.js");
      const { safeRemove } = await import("./safeStorage.js");
      const toRemove = listKeys().filter(k => k && cachePrefixes.some((p) => k.startsWith(p)));
      toRemove.forEach((k) => { const r = safeRemove(k); if (!r.ok) console.warn("[App] remove cache failed", k, r.error); });
      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          for (const k of keys) try { await caches.delete(k); } catch {}
        } catch {}
      }
      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) try { await r.unregister(); } catch {}
        } catch {}
      }
    } catch {}
    window.location.reload();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error("Fullscreen error:", e);
      alert("không thể chuyển toàn màn hình: " + (e.message || "Trình duyệt không hỗ trợ"));
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Storage migration: LS hybrid -> IDB canonical (idempotent, verify before cleanup)
  useEffect(() => {
    (async () => {
      try { const { runHybridMigrations } = await import("./storage.js"); await runHybridMigrations(); } catch {}
    })();
  }, []);
  // Fetch books
  useEffect(() => {
    // .catch là lưới an toàn: fetchBooks đã bọc try/catch/finally nên không bao giờ reject
    fetchBooks().catch((err) => {
      console.error("fetchBooks unhandled:", err);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleDataUpdated = (e) => {
      setDataVersion((v) => v + 1);
      // A2 • Thùng rác đổi → cập nhật badge + tải lại danh sách sách (khôi phục sách lấy lại từ server)
      try { setTrashCount(listTrash().length); } catch {}
      try {
        const d = e && e.detail;
        const src = d && d.source;
        if (src === "trashStore") { if (!d.type || d.type === "book") fetchBooks(); }
        else if (src === "trash-restore" || src === "trash-purge") fetchBooks();
      } catch {}
    };
    window.addEventListener("sgk:data-updated", handleDataUpdated);
    return () =>
      window.removeEventListener("sgk:data-updated", handleDataUpdated);
  }, []);

  // Build missing/stale indexes in the background without blocking the library.
  // CHỈ chạy khi người dùng bật "Tự index sách mới" (Cài đặt → Thư viện).
  // Mặc định TẮT: nếu không, mở app lần đầu trên trình duyệt mới sẽ tải trọn
  // thư viện (~97 PDF / 1,4 GB) chỉ để lập chỉ mục, mà không báo người dùng.
  // Cách lập chỉ mục thủ công: tab "Tìm toàn văn" → nút "Dựng chỉ mục".
  useEffect(() => {
    if (loading) return;
    if (!settingsState?.library?.autoIndexNewBooks) return undefined;

    let cancelled = false;
    const pending = books.filter((book) => {
      if (!book?.filename) return false;
      if (autoIndexedBooksRef.current.has(book.filename)) return false;
      const meta = getIndexMeta(book.filename);
      if (!meta) return true;
      return needsRebuild(book.filename);
    });
    if (!pending.length) return undefined;

    const buildPendingIndexes = async () => {
      for (const book of pending) {
        if (cancelled) return;
        const ext = String(book.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
        const isPdf = ext === ".pdf";
        const isWord = [".html",".htm",".txt",".md"].includes(ext);
        if (!isPdf) {
          if (isWord) {
            // Word (html/txt/md) • đồng bộ: lập chỉ mục thực tế nội dung để Tìm kiếm/Kiểm kê/AI y hệt PDF
            try {
              const res = await fetch(`${API_BASE}/api/books/${encodeURIComponent(book.filename)}/content`);
              const data = await res.json().catch(()=>({}));
              let raw = data.content || "";
              // txt/md có thể chứa html do Word foreColor, giữ nguyên strip tags
              const plain = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
              const pages = [];
              const chunk = 3000;
              for(let i=0, p=1; i < plain.length; i+=chunk, p++){
                const t = plain.slice(i, i+chunk);
                if(t.trim()) pages.push({ page: p, text: t, kind: "text" });
              }
              if(!pages.length) pages.push({ page:1, text: plain.slice(0,chunk) || "", kind:"text" });
              const now = Date.now();
              const meta = { filename: book.filename, total: pages.length, textPages: pages.length, ocrPages:0, imagePages:0, builtAt: now, word:true };
              const { saveJSON } = await import("./storage.js");
              const { safeRemove } = await import("./safeStorage.js");
              try { saveJSON(`sgk_idxmeta_${book.filename}`, meta); } catch (e) { console.warn("Word idxmeta save failed", book.filename, e?.message); }
              // IDB-first (chứa được index lớn), localStorage ch? best-effort:
              // saveJSON ném lỗi khi quota và còn xóa oan cache khác nên không được gọi trực tiếp
              const indexData = { pages, builtAt: now };
              let idbOk = false;
              try {
                const indexedDBService = (await import("./indexedDB.js")).default;
                if (indexedDBService.constructor.isAvailable()) {
                  await indexedDBService.set((await import("./indexedDB.js")).STORES.SEARCH_INDEX, book.filename, indexData);
                  idbOk = true;
                  try { safeRemove(`sgk_idx_${book.filename}`); } catch {}
                }
              } catch (e) { console.warn("Word index IDB save failed", book.filename, e?.message); }
              if (!idbOk) {
                try {
                  saveJSON(`sgk_idx_${book.filename}`, indexData);
                } catch (e) { console.warn("Word index LS fallback failed (quota?)", book.filename, e?.message); }
              }
              try { const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.INDEX_READY, { filename: book.filename }); } catch {}
            } catch(e){ console.warn("Word index failed", book.filename, e); }
            continue;
          }
          try {
            const { saveJSON } = await import("./storage.js");
            const now = Date.now();
            saveJSON(`sgk_idxmeta_${book.filename}`, { filename: book.filename, total: 1, textPages: 0, ocrPages: 0, imagePages: 1, builtAt: now, nonPdf: true });
            saveJSON(`sgk_idx_${book.filename}`, { pages: [], builtAt: now });
            try {
              const indexedDBService = (await import("./indexedDB.js")).default;
              if (indexedDBService.constructor.isAvailable()) {
                await indexedDBService.set((await import("./indexedDB.js")).STORES.SEARCH_INDEX, book.filename, { pages: [], builtAt: now });
              }
            } catch {}
          } catch {}
          continue;
        }
        autoIndexedBooksRef.current.add(book.filename);
        try {
          const pdfUrl = `${API_BASE}/api/books/${encodeURIComponent(book.filename)}`;
          const pdf = await pdfjsLib.getDocument({ url: pdfUrl, isEvalSupported: false }).promise;
          await buildIndex(book, pdf);
          try {
            const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.INDEX_READY, { filename: book.filename });
          } catch {}
        } catch (err) {
          console.warn(`Auto index failed for ${book.filename}:`, err);
          autoIndexedBooksRef.current.delete(book.filename);
        }
      }
    };

    void buildPendingIndexes();
    return () => {
      cancelled = true;
    };
  }, [books, loading, settingsState?.library?.autoIndexNewBooks]);

  // Close settings modal with Escape
  useEffect(() => {
    if (!showSettings) return;
    const h = (e) => {
      if (e.key === "Escape") setShowSettings(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showSettings]);

  // Close mobile drawer with Escape and handle body scroll lock
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && mobileNavOpen) setMobileNavOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.classList.add("sidebar-open");
      document.documentElement.style.overflowX = "clip";
    } else {
      document.body.classList.remove("sidebar-open");
      document.documentElement.style.overflowX = "";
    }
    return () => {
      document.body.classList.remove("sidebar-open");
      document.documentElement.style.overflowX = "";
    };
  }, [mobileNavOpen]);

  // Đóng modal tinh từ bằng Esc + tr? focus
  useEffect(() => {
    if (!deleteTarget && !renameTarget && !showUrlModal) return;
    const h = (e) => {
      if (e.key === "Escape") { setDeleteTarget(null); setRenameTarget(null); setShowUrlModal(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [deleteTarget, renameTarget, showUrlModal]);

  // -- Global keyboard shortcuts cực chi tiết (đọc từ settings.keyboard.shortcuts, mặc định đã có) --
  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      // Không chặn khi đang gõ, trừ global palette/search
      if (typing && !matchesShortcut(e, getShortcut("global.commandPalette")) && !matchesShortcut(e, getShortcut("global.search")) && e.key !== "Escape") return;
      if (currentBook) return; // khi đang đọc, để BookReader xử lý
      const navMap = {
        "nav.dashboard": "dashboard",
        "nav.library": "library",
        "nav.continue": "continue",
        "nav.marks": "marks",
        "nav.vocab": "vocab",
        "nav.search": "search",
        "nav.compare": "compare",
        "nav.matrix": "matrix",
        "nav.lessonplans": "lessonplans",
        "nav.activities": "activities",
        "nav.worksheets": "worksheets",
        "nav.questionbank": "questionbank",
        "nav.whiteboard": "whiteboard",
        "nav.tasks": "tasks",
      };
      for (const [sid, viewId] of Object.entries(navMap)) {
        if (matchesShortcut(e, getShortcut(sid))) { e.preventDefault(); closeBook(viewId); setMobileNavOpen(false); return; }
      }
      if (matchesShortcut(e, getShortcut("global.search"))) { e.preventDefault(); closeBook("search"); return; }
      if (matchesShortcut(e, getShortcut("global.help"))) { e.preventDefault(); closeBook("help"); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentBook, closeBook]);

  const fetchBooks = async () => {
    setLoading(true);
    setError("");
    setBackendStatus("checking");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Fallback bases để khắc phục preview 4173 vs server 5000 và file://
    const basesToTry = [];
    const seen = new Set();
    const pushBase = (b) => {
      const v = String(b || "").replace(/\/$/, "");
      if (!seen.has(v)) { seen.add(v); basesToTry.push(v); }
    };
    pushBase(API_BASE);
    // Nếu API_BASE là rỗng (relative) hoặc là preview origin, thử localhost:5000
    pushBase("http://localhost:5000");
    pushBase("http://127.0.0.1:5000");
    // Thử relative cuối cùng
    pushBase("");

    // IMPORTANT: toàn bộ phần xử lý phải nằm trong MỘT try/catch/finally duy nhất.
    // Trước đây 2 lệnh `throw` (AbortError ở vòng lặp và "không có res") nằm NGOÀI try
    // nên `finally { setLoading(false) }` không bao giờ chạy -> spinner treo vô hạn
    // khi backend chậm/treo quá 8 giây, và Promise bị reject không ai bắt.
    try {
      let res = null;
      let lastErr = null;
      for (const base of basesToTry) {
        try {
          // Bỏ double slash sau http:
          const cleanUrl = base ? `${base}/api/books` : `/api/books`;
          res = await fetch(cleanUrl, { signal: controller.signal });
          if (res) break;
        } catch (e) {
          lastErr = e;
          // Hết ngân sách 8s -> không retry nữa, thoát vòng lặp để vào nhánh lỗi chung
          if (e?.name === "AbortError") break;
          continue;
        }
      }
      if (!res) throw lastErr || new Error("Không thể kết nối backend.");

      if (!res.ok) {
        throw new Error(`Máy chủ không phản hồi (${res.status}).`);
      }

      const data = await res.json();
      let nextBooks = Array.isArray(data) ? data : [];

      // Validate book objects
      nextBooks = nextBooks.filter(book => {
        if (!book || typeof book !== 'object') return false;
        if (!book.filename || typeof book.filename !== 'string') return false;
        if (!book.title || typeof book.title !== 'string') return false;
        return true;
      });

      // Áp dụng tên tùy chỉnh từ localStorage • an toàn kể cả khi JSON corrupted
      const customTitles = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d==="object" && !Array.isArray(d));
      nextBooks = nextBooks.map((book) => ({
        ...book,
        title: customTitles[book.filename] || book.title,
      }));

      // A2 • Ẩn những sách đang nằm trong Thùng rác (file vẫn còn trên máy)
      try {
        const trashedFiles = new Set(
          listTrashByType(TRASH_TYPE.BOOK)
            .map((i) => i && i.meta && i.meta.filename)
            .filter(Boolean),
        );
        if (trashedFiles.size) nextBooks = nextBooks.filter((b) => !trashedFiles.has(b.filename));
      } catch {}

      setBooks(nextBooks);
      setBackendStatus(nextBooks.length > 0 ? "ok" : "empty");

      if (nextBooks.length === 0) {
        setError(
          "Backend đã kết nối nhưng chưa có file PDF trong thư mục sách.",
        );
      }
    } catch (err) {
      console.error("fetchBooks failed:", err);

      setBackendStatus("error");
      setBooks((prev) => (prev.length ? prev : []));
      if (!books.length) {
        if (err?.name === "AbortError") {
          setError(
            "Không thể kết nối backend local trong 8 giây. Hãy kiểm tra server đang chạy tại http://localhost:5000.",
          );
        } else {
          setError(err?.message || "Không thể tải danh sách sách.");
        }
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  // Persist view/sort prefs
  // IMPORTANT: effect PHAI tra undefined — saveJSON tra `true` (va throw khi quota),
  // neu tra truc tiep thi React se goi `true()` luc cleanup -> crash toan app.
  useEffect(() => {
    try { saveJSON(LS.viewMode, viewMode); } catch (e) { console.warn("[App] save viewMode failed:", e?.message); }
  }, [viewMode]);
  useEffect(() => {
    try { saveJSON(LS.sortBy, sortBy); } catch (e) { console.warn("[App] save sortBy failed:", e?.message); }
  }, [sortBy]);

  // A2 • Xóa vĩnh viễn những mục đã quá 30 ngày trong Thùng rác (chỉ chạy khi mở app)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { purgeExpiredTrashNow } = await import("./trashPurge.js");
        const r = await purgeExpiredTrashNow();
        if (cancelled || !r.expired) return;
        setDataVersion((v) => v + 1);
        fetchBooks();
        try { appEventsCore.emit(AppEventsCore.DATA_UPDATED, { source: "trash-purge" }); } catch {}
      } catch (e) { console.warn("[App] trash purge failed:", e); }
    }, 6000);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Derived data ----------------------------------------------
  const sortedBooks = useMemo(() => {
    const arr = [...books];
    const getProgress = (book) => bookProgress(book.filename, lastPageMap, lastTotalMap).pct;
    const getLastOpenedAt = (book) => {
      const h = history.find((x) => x.filename === book.filename);
      return h ? h.at : 0;
    };
    switch (sortBy) {
      case "name":
        arr.sort((a, b) => a.title.localeCompare(b.title, "vi"));
        break;
      case "nameDesc":
        arr.sort((a, b) => b.title.localeCompare(a.title, "vi"));
        break;
      case "size":
        arr.sort((a, b) => a.size - b.size);
        break;
      case "sizeDesc":
        arr.sort((a, b) => b.size - a.size);
        break;
      case "recent":
        arr.sort((a, b) => getLastOpenedAt(b) - getLastOpenedAt(a));
        break;
      case "progress":
        arr.sort((a, b) => getProgress(b) - getProgress(a));
        break;
      case "progressAsc":
        arr.sort((a, b) => getProgress(a) - getProgress(b));
        break;
      default:
        arr.sort(
          (a, b) =>
            a.grade - b.grade ||
            a.subject.localeCompare(b.subject, "vi") ||
            a.term - b.term,
        );
    }
    return arr;
  }, [books, sortBy, history, lastPageMap, lastTotalMap]);

  const filteredBooks = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return sortedBooks.filter((b) => {
      const matchesSearch = !q || b.title.toLowerCase().includes(q);
      const matchesGrade = !gradeFilter || b.grade === gradeFilter;
      const matchesSubject = !subjectFilter || b.subject === subjectFilter;
      const matchesTerm = !termFilter || b.term === termFilter;
      const matchesFav = !favOnly || favs.includes(b.filename);
      // Reading status: reading/completed/unread (chuẩn readingProgress.js)
      let matchesReading = true;
      if (readingStatusFilter) {
        const { status } = bookProgress(b.filename, lastPageMap, lastTotalMap);
        if (readingStatusFilter === "reading") matchesReading = status === READ_STATUS.READING;
        else if (readingStatusFilter === "completed") matchesReading = status === READ_STATUS.DONE;
        else if (readingStatusFilter === "unread") matchesReading = status === READ_STATUS.UNREAD;
      }
      return (
        matchesSearch &&
        matchesGrade &&
        matchesSubject &&
        matchesTerm &&
        matchesFav &&
        matchesReading
      );
    });
  }, [
    sortedBooks,
    debouncedSearchQuery,
    gradeFilter,
    subjectFilter,
    termFilter,
    favOnly,
    favs,
    readingStatusFilter,
    lastPageMap,
    lastTotalMap,
  ]);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    if (!geminiKey.trim()) {
      setKeyError("Vui lòng nhập Gemini API Key trước khi lưu.");
      return;
    }
    setKeyError("");
    try {
      setGeminiApiKey(geminiKey);
      const res = safeSetString("SGK_TEACHER_MODE", teacherMode ? "1" : "0");
      if (!res.ok && res.quota) {
        console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
      } else if (!res.ok) {
        console.warn("[App] safeSetString failed SGK_TEACHER_MODE:", res.error);
      }
    } catch (e) { console.warn("[App] safeSetString exception SGK_TEACHER_MODE:", e); }
    setShowSettings(false);
  };

  const handleTestKey = async () => {
    if (!geminiKey.trim()) {
      setKeyTestResult({
        ok: false,
        msg: "Vui lòng nhập API Key trước khi kiểm tra.",
      });
      return;
    }
    setTestingKey(true);
    setKeyTestResult(null);
    try {
      const model = (() => {
        try {
          return loadSettings().ai?.model || "gemini-2.5-flash";
        } catch {
          return "gemini-2.5-flash";
        }
      })();
      const text = await aiService.callAI({
        apiKey: geminiKey.trim(),
        model,
        contents: [{ role: "user", parts: [{ text: "Xin chào" }] }],
        systemInstruction: { parts: [{ text: "Chỗ trợ lại: OK" }] },
        generationConfig: { temperature: 0, maxOutputTokens: 50 },
        timeout: 30000,
        maxRetries: 1,
        requestId: `test-key-${Date.now()}`,
      });
      setKeyTestResult({
        ok: true,
        msg: "Kết nối thành công! API Key hoạt động tốt.",
      });
    } catch (err) {
      console.error(err);
      const friendly = getFriendlyErrorMessage(err.status, err.message);
      const isNoResponse =
        err.code === "NO_RESPONSE" ||
        (err.message || "").includes("không đưa ra câu trả lời");
      const hint = isNoResponse
        ? "⚠️ AI trả về rỗng, hãy thử lại hoặc chọn model gemini-1.5-flash."
        : err.status === 500
          ? "⚠️ Kiểm tra backend (http://localhost:5000/api/health) đang chạy."
          : err.status === 401 || err.status === 403 || err.status === 400
            ? "⚠️ Kiểm tra API Key tại aistudio.google.com"
            : "";
      setKeyTestResult({
        ok: false,
        msg: `${friendly}${err.status ? ` [${err.status}]` : ""}${hint}`,
      });
    } finally {
      setTestingKey(false);
    }
  };

  const hasActiveFilters =
    gradeFilter !== null ||
    subjectFilter !== null ||
    termFilter !== null ||
    readingStatusFilter !== null ||
    searchQuery.trim() !== "" ||
    favOnly;

  const clearFilters = () => {
    setGradeFilter(null);
    setSubjectFilter(null);
    setTermFilter(null);
    setReadingStatusFilter(null);
    setSearchQuery("");
    setFavOnly(false);
  };

  const SUPPORTED_EXTS_CLIENT = [".pdf",".docx",".doc",".pptx",".ppt",".xlsx",".xls",".txt",".md",".html",".htm",".epub",".jpg",".jpeg",".png",".gif",".webp"];
  const isSupportedFile = (name) => SUPPORTED_EXTS_CLIENT.some((ext) => String(name || "").toLowerCase().endsWith(ext));
  const prepareUploadCandidate = (file) => {
    if (!file) return;
    if (!isSupportedFile(file.name)) {
      setUploadError(`Định dạng chưa hỗ trợ. Hỗ trợ: ${SUPPORTED_EXTS_CLIENT.join(", ")}`);
      setUploadDraft(null);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError(`File quá lớn (${(file.size/1024/1024).toFixed(1)} MB). Giới hạn 50 MB.`);
      setUploadDraft(null);
      return;
    }

    setUploadError("");
    setUploadNotice("");
    setUploadDraft({
      file,
      name: file.name,
      size: file.size,
      title: formatSuggestedBookTitle(file.name),
    });
  };

  const handleAddBook = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    prepareUploadCandidate(file);
    event.target.value = "";
  };

  const submitUpload = async () => {
    if (!uploadDraft?.file) return;
    setUploadingBook(true);
    setUploadError("");
    setUploadNotice("");

    try {
      const form = new FormData();
      form.append("file", uploadDraft.file);
      if (uploadDraft.title) form.append("title", uploadDraft.title);
      const res = await fetch(`${API_BASE}/api/books/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Không thể thêm sách.");
      }
      try {
        const fname = data?.book?.filename;
        const title = uploadDraft.title || data?.book?.title;
        if (fname && title) {
          const custom = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
          if (!custom[fname]) {
            custom[fname] = title;
            const res = safeSetJSON("sgk_custom_titles", custom);
            if (!res.ok && res.quota) {
              setUploadError("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
              console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
            } else if (!res.ok) {
              console.warn("[App] safeSetJSON failed sgk_custom_titles:", res.error);
            }
          }
        }
      } catch (e) { console.warn("[App] submitUpload customTitles failed:", e); }
      setUploadNotice(data.message || "Đã thêm sách vào thư viện.");
      setUploadDraft(null);
      await fetchBooks();
      try { const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.DATA_UPDATED, { domain: "books", action: "created" }); } catch {}
      setDataVersion((v) => v + 1);
    } catch (err) {
      setUploadError(err.message || "Không thể thêm sách.");
    } finally {
      setUploadingBook(false);
    }
  };

  const submitDocxImport = async () => {
    if (!uploadDraft?.file) return;
    const lowerName = String(uploadDraft.name || uploadDraft.file?.name || "").toLowerCase();
    if (!lowerName.endsWith(".docx")) {
      setUploadError("Chỉ nhập được file Word (.docx). Với file .doc, hãy mở bằng Word và Lưu thành .docx rồi nhập lại.");
      return;
    }
    setUploadingBook(true);
    setUploadError("");
    setUploadNotice("");

    try {
      const form = new FormData();
      form.append("file", uploadDraft.file);
      if (uploadDraft.title) form.append("title", uploadDraft.title);
      const res = await fetch(`${API_BASE}/api/books/import-docx`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Không thể nhập file Word.");
      }
      try {
        const fname = data?.book?.filename;
        const title = uploadDraft.title || data?.book?.title;
        if (fname && title) {
          const custom = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
          if (!custom[fname]) {
            custom[fname] = title;
            const r = safeSetJSON("sgk_custom_titles", custom);
            if (!r.ok && r.quota) setUploadError("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
          }
        }
      } catch (e) { console.warn("[App] submitDocxImport customTitles failed:", e); }
      const warn = Array.isArray(data?.warnings) && data.warnings.length
        ? ` (Lưu ý: ${data.warnings[0]})`
        : "";
      setUploadNotice((data.message || "Đã nhập Word thành sách (giữ nguyên định dạng).") + warn);
      setUploadDraft(null);
      await fetchBooks();
      try { const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.DATA_UPDATED, { domain: "books", action: "imported_docx" }); } catch {}
      setDataVersion((v) => v + 1);
    } catch (err) {
      setUploadError(err.message || "Không thể nhập file Word.");
    } finally {
      setUploadingBook(false);
    }
  };

  const handleAddByUrl = () => {
    setUrlInput("");
    setUrlTitle("");
    setShowUrlModal(true);
  };
  const confirmAddByUrl = async () => {
    if (!urlInput.trim()) { setUploadError("Vui lòng nhập URL."); return; }
    try { new URL(urlInput.trim()); } catch { setUploadError("URL không hợp lệ."); return; }
    setShowUrlModal(false);
    setUploadingBook(true);
    setUploadError("");
    setUploadNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/books/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim(), title: urlTitle.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Không thể tải từ URL.");
      setUploadNotice(data.message || "Đã thêm sách từ URL.");
      await fetchBooks();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setUploadError(err.message || "Không thể tải từ URL.");
    } finally {
      setUploadingBook(false);
    }
  };

  const handleCreateFromText = () => {
    setEditingTextBook(null);
    setShowTextModal(true);
  };
  // Dashboard ? Soạn Word + Lọc môn • via appEvents (bridge to window kept for compat)
  useEffect(() => {
    const onOpenWord = () => handleCreateFromText();
    const onFilterSubject = (detail) => {
      const subj = detail?.subject;
      if (subj) {
        setSubjectFilter(subj);
        closeBook("library");
        setMobileNavOpen(false);
        try{ window.scrollTo({top:0, behavior:"smooth"});}catch{}
      }
    };
    const off1 = appEventsCore.on("sgk:open-word-editor", onOpenWord);
    const off2 = appEventsCore.on("sgk:filter-subject", onFilterSubject);
    return () => { off1(); off2(); };
  }, [closeBook]);
  const handleEditTextBook = (book) => {
    const ext = String(book.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
    if (![".txt", ".md", ".html", ".htm"].includes(ext)) {
      setUploadError("Chỉ hỗ trợ sửa sách văn bản (.txt / .md / .html). Với PDF/ảnh, hãy thay thế bằng upload mới.");
      return;
    }
    setEditingTextBook(book);
    setShowTextModal(true);
  };
  const handleTextBookSuccess = async (book, oldFilename) => {
    // Transaction-like migration khi đổi tên file (.txt/.md): migrate toàn bộ dữ liệu local từ oldFilename -> newFilename trước khi cleanup
    try {
      if (oldFilename && oldFilename !== book.filename) {
        try {
          const { migrateBookData } = await import("./storage.js");
          const res = await migrateBookData(oldFilename, book.filename);
          if (!res.ok) console.warn("migrateBookData failed:", res.error);
        } catch (e) { console.error("migrateBookData import/call failed:", e); }
        // Đồng bộ custom titles cho file mới nếu title khác parse (migrateBookData đã xử lý nhưng đảm bảo) • per-book keys không trộn
        try {
          if (book.title) {
            const c2 = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
            c2[book.filename] = book.title;
            const res = safeSetJSON("sgk_custom_titles", c2);
            if (!res.ok && res.quota) {
              setUploadError("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
              console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
            } else if (!res.ok) {
              console.warn("[App] safeSetJSON failed sgk_custom_titles:", res.error);
            }
          }
        } catch (e) { console.warn("[App] handleTextBookSuccess c2 failed:", e); }
      } else if (book?.title && book?.filename) {
        const custom = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
        custom[book.filename] = book.title;
        try {
          const res = safeSetJSON("sgk_custom_titles", custom);
          if (!res.ok && res.quota) {
            setUploadError("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
            console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
          } else if (!res.ok) {
            console.warn("[App] safeSetJSON failed sgk_custom_titles:", res.error);
          }
        } catch (e) { console.warn("[App] handleTextBookSuccess custom failed:", e); }
      }
    } catch (e) { console.warn("[App] handleTextBookSuccess outer failed:", e); }
    setUploadNotice(editingTextBook ? `Đã cập nhật "${book.title}".` : `Đã tạo sách "${book.title}".`);
    setUploadError("");
    await fetchBooks();
    // Nếu sách đang mở chính là sách vừa sửa (kể cả khi bị đổi tên file),
    // cập nhật currentBook + báo BookReader tải lại nội dung mới
    try {
      if (currentBook && (currentBook.filename === oldFilename || currentBook.filename === book.filename)) {
        setCurrentBook(book);
        setBookContentNonce((n) => n + 1);
      }
    } catch (e) { console.warn("[App] refresh currentBook after text edit failed:", e); }
    setDataVersion((v) => v + 1);
    try { const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.DATA_UPDATED, { domain: "books", action: "created_textbook" }); } catch {}
  };

  // Navigation • single source via core/navigationRegistry (badge counts injected)
  const NAV_SECTIONS = useMemo(() => buildNavSectionsCore({
    badges: {
      continue: history.length,
      marks: totalBookmarks,
      vocab: vocabCount,
      whiteboard: whiteboardCount,
      matrix: totalMarks,
      collections: totalClips,
      webtools: webToolsCount,
    }
  }), [history.length, totalBookmarks, vocabCount, whiteboardCount, totalMarks, totalClips, webToolsCount]);
  const FOOTER_NAV = useMemo(() => {
    const base = getFooterNav(); // [{id:"settings",...},{id:"datatools",...},{id:"help",...}]
    return base.map(item => {
      const iconEl = item.icon ? React.createElement(item.icon, { size: 16 }) : null;
      if (item.id === "settings") return { id: item.id, icon: iconEl, label: item.label, action: () => setShowSettings(true) };
      return { id: item.id, icon: iconEl, label: item.label };
    });
  }, []);

  // Breadcrumb • UNIFIED via core/navigationRegistry (single source)
  const getBreadcrumb = () => {
    try {
      const b = getBreadcrumbCore(view);
      return { ...b, section: SECTION_VI[b.section] || b.section || "" };
    } catch { return { label: String(view), section: "", subsection: null }; }
  };

  return (
    <AppErrorBoundary>
      <div
        className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        {/* -- Sidebar ------------------------------------------- */}
        <aside
          className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileNavOpen ? "mobile-open" : ""}`}
          style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px`, flex: `0 0 ${sidebarWidth}px` }}
        >
          {!sidebarCollapsed && (
            <div
              className="panel-resizer panel-resizer-right"
              onMouseDown={onSidebarResizeStart}
              onTouchStart={onSidebarResizeStart}
              onDoubleClick={()=>{ setSidebarWidth(280); try{ const res = safeSetString("sgk_sidebar_w","280"); if (!res.ok && res.quota) console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy"); else if (!res.ok) console.warn("[App] safeSetString failed sgk_sidebar_w:", res.error);} catch(e){ console.warn("[App] safeSetString exception sgk_sidebar_w:", e);} }}
              title="Kéo để đổi để rộng, double-click để reset"
              aria-hidden="true"
            />
          )}
          <div className="sidebar-header">
            <a
              className="sidebar-logo"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                closeBook("library");
                setMobileNavOpen(false);
              }}
              title="Về trang chủ"
              aria-label="Về trang chủ"
            >
              <div className="logo-icon" aria-hidden="true">
                📚
              </div>
              {!sidebarCollapsed && (
                <div className="logo-text-wrapper">
                  <h1>Hành trang Tiểu học</h1>
                  <p>AI • Lớp 1 • Lớp 5</p>
                </div>
              )}
            </a>
            <button
              className="btn-sidebar-toggle"
              onClick={() => {
                const newVal = !sidebarCollapsed;
                setSidebarCollapsed(newVal);
                try {
                  const res = safeSetString("sgk_sidebar_collapsed", newVal ? "true" : "false");
                  if (!res.ok && res.quota) console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
                  else if (!res.ok) console.warn("[App] safeSetString failed sgk_sidebar_collapsed:", res.error);
                } catch (err) {
                  console.warn("[App] safeSetString exception sgk_sidebar_collapsed:", err);
                }
              }}
              title={
                sidebarCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"
              }
              aria-label={
                sidebarCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"
              }
            >
              {sidebarCollapsed ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
          </div>

          <div className="sidebar-menu-wrapper">
            {NAV_SECTIONS.map((sec) => {
              const label = sec.label || "";
              const secKey = sec.id || label;
              const isLargeSection = !!sec.large;
              const isExpanded = isLargeSection ? true : (sidebarCollapsed || (expandedSections[secKey] ?? expandedSections[label]));
              return (
                <div
                  key={sec.id || sec.label}
                  className={`sidebar-section ${isExpanded ? "expanded" : "collapsed"}${isLargeSection ? " sidebar-section-large" : ""}`}
                >
                  <button
                    className={`sidebar-section-header${isLargeSection ? " sidebar-section-header-large" : ""}`}
                    onClick={() => {
                      if (isLargeSection || sidebarCollapsed) return;
                      const next = {
                        ...expandedSections,
                        [secKey]: !(expandedSections[secKey] ?? expandedSections[label]),
                      };
                      if (secKey !== label) delete next[label]; // dọn key label cũ sau migrate
                      setExpandedSections(next);
                      try {
                        const res = safeSetJSON("sgk_expanded_sections", next);
                        if (!res.ok && res.quota) console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
                        else if (!res.ok) console.warn("[App] safeSetJSON failed sgk_expanded_sections:", res.error);
                      } catch (err) {
                        console.warn("[App] safeSetJSON exception sgk_expanded_sections:", err);
                      }
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`${SECTION_VI[label] || label} ${isExpanded ? "thu gọn" : "mở rộng"}`}
                    disabled={isLargeSection}
                  >
                    <span className="sidebar-section-title">{SECTION_VI[label] || sec.label}</span>
                    {!sidebarCollapsed && !isLargeSection && (
                      <span
                        className="sidebar-section-arrow"
                        aria-hidden="true"
                      >
                        {(expandedSections[secKey] ?? expandedSections[label]) ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                      </span>
                    )}
                  </button>
                  <nav className="sidebar-nav" aria-label={SECTION_VI[label] || label}>
                    {sec.items.map((item) => {
                      const isActive = view === item.id;
                      const showBadge =
                        typeof item.badge === "number" && item.badge > 0;
                      const promo = item.promo;
                      const isLargeItem = !!item.large;
                      return (
                        <button
                          key={item.id}
                          className={`nav-item${isActive ? " active" : ""}${promo ? " nav-item-promo" : ""}${isLargeItem ? " nav-item-large" : ""}`}
                          onClick={() => {
                            closeBook(item.id);
                            setMobileNavOpen(false);
                          }}
                          aria-label={item.label}
                          aria-current={isActive ? "page" : undefined}
                          title={item.label}
                        >
                          <span className="nav-item-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          {!sidebarCollapsed && (
                            <span className="nav-item-text">{item.label}</span>
                          )}
                          {showBadge && !sidebarCollapsed && (
                            <span
                              className="nav-item-badge"
                              aria-label={`${item.badge} mục`}
                            >
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                          {showBadge && sidebarCollapsed && (
                            <span
                              className="nav-item-badge-dot"
                              aria-hidden="true"
                              title={`${item.badge} mục`}
                            ></span>
                          )}
                        </button>
                      );
                    })}
                    {sec.subsections &&
                      sec.subsections.map((sub) => {
                        const subLabel = sub.label || "";
                        const subKey = sub.id || subLabel;
                        const subExpanded =
                          sidebarCollapsed || (expandedSections[subKey] ?? expandedSections[subLabel]);
                        return (
                          <div
                            key={sub.id || sub.label}
                            className={`sidebar-subsection ${subExpanded ? "expanded" : "collapsed"}`}
                          >
                            <button
                              className="sidebar-subsection-header"
                              onClick={() => {
                                if (sidebarCollapsed) return;
                                const next = {
                                  ...expandedSections,
                                  [subKey]: !(expandedSections[subKey] ?? expandedSections[subLabel]),
                                };
                                if (subKey !== subLabel) delete next[subLabel]; // dọn key label cũ sau migrate
                                setExpandedSections(next);
                                try {
                                  const res = safeSetJSON("sgk_expanded_sections", next);
                                  if (!res.ok && res.quota) console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
                                  else if (!res.ok) console.warn("[App] safeSetJSON failed sgk_expanded_sections:", res.error);
                                } catch (err) {
                                  console.warn("[App] safeSetJSON exception sgk_expanded_sections:", err);
                                }
                              }}
                              aria-expanded={subExpanded}
                              aria-label={`${subLabel} ${subExpanded ? "thu gọn" : "mở rộng"}`}
                            >
                              <span className="sidebar-subsection-title">
                                {sub.label}
                              </span>
                              {!sidebarCollapsed && (
                                <span
                                  className="sidebar-subsection-arrow"
                                  aria-hidden="true"
                                >
                                  {(expandedSections[subKey] ?? expandedSections[subLabel]) ? (
                                    <ChevronDown size={10} />
                                  ) : (
                                    <ChevronRight size={10} />
                                  )}
                                </span>
                              )}
                            </button>
                            <nav
                              className="sidebar-nav sidebar-subsection-nav"
                              aria-label={sub.label}
                            >
                              {sub.items.map((item) => {
                                const isActive = view === item.id;
                                const showBadge =
                                  typeof item.badge === "number" &&
                                  item.badge > 0;
                                return (
                                  <button
                                    key={item.id}
                                    className={`nav-item nav-item-sub${isActive ? " active" : ""}`}
                                    onClick={() => {
                                      closeBook(item.id);
                                      setMobileNavOpen(false);
                                    }}
                                    aria-label={item.label}
                                    aria-current={isActive ? "page" : undefined}
                                    title={item.label}
                                  >
                                    <span
                                      className="nav-item-icon"
                                      aria-hidden="true"
                                    >
                                      {item.icon}
                                    </span>
                                    {!sidebarCollapsed && (
                                      <span className="nav-item-text">
                                        {item.label}
                                      </span>
                                    )}
                                    {showBadge && !sidebarCollapsed && (
                                      <span
                                        className="nav-item-badge"
                                        aria-label={`${item.badge} mục`}
                                      >
                                        {item.badge > 99 ? "99+" : item.badge}
                                      </span>
                                    )}
                                    {showBadge && sidebarCollapsed && (
                                      <span
                                        className="nav-item-badge-dot"
                                        aria-hidden="true"
                                        title={`${item.badge} mục`}
                                      ></span>
                                    )}
                                  </button>
                                );
                              })}
                            </nav>
                          </div>
                        );
                      })}
                  </nav>
                </div>
              );
            })}
          </div>

          <div className="sidebar-footer">
            <div
              className={`sidebar-ai-status ${geminiKey ? "ok" : "no"}`}
              title={geminiKey ? "AI đã sẵn sàng" : "Chưa cấu hình API Key"}
              role="status"
              aria-live="polite"
            >
              <span
                className={`ai-dot ${geminiKey ? "ok" : "no"}`}
                aria-hidden="true"
              >
                <span className="ai-dot-inner"></span>
              </span>
              {!sidebarCollapsed && (
                <span className="ai-status-text">
                  {geminiKey ? "AI đã sẵn sàng" : "Chưa có API Key"}
                </span>
              )}
            </div>

            <nav className="sidebar-footer-nav" aria-label="Tiện ích">
              {FOOTER_NAV.map((item) => {
                const isActive = view === item.id;
                const showBadge = item.id === "datatools" && trashCount > 0;
                return (
                  <button
                    key={item.id}
                    className={`nav-item nav-item-utility${isActive ? " active" : ""}`}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      } else {
                        closeBook(item.id);
                      }
                      setMobileNavOpen(false);
                    }}
                    aria-label={showBadge ? `${item.label} — ${trashCount} mục trong thùng rác` : item.label}
                    aria-current={isActive ? "page" : undefined}
                    title={showBadge ? `${item.label} — ${trashCount} mục` : item.label}
                  >
                    <span className="nav-item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="nav-item-text">{item.label}</span>
                    )}
                    {showBadge && !sidebarCollapsed && (
                      <span className="nav-item-badge" aria-label={`${trashCount} mục`}>
                        {trashCount > 99 ? "99+" : trashCount}
                      </span>
                    )}
                    {showBadge && sidebarCollapsed && (
                      <span className="nav-item-badge-dot" aria-hidden="true" title={`${trashCount} mục`}></span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>
        {mobileNavOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          ></div>
        )}

        {/* -- Main content -------------------------------------- */}
        <div className="main-content">
          {/* A1 • Cảnh báo bộ nhớ — hiện ở mọi khu vực kể cả khi đang đọc sách */}
          {storageNotice && (
            <div
              className={"dash-notice " + (storageNotice.level === "danger" ? "error" : "warn")}
              role="alert"
              style={{ margin: "0.55rem 1rem 0", display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}
            >
              <span aria-hidden="true">{storageNotice.level === "danger" ? "🛑" : "⚠️"}</span>
              <span style={{ flex: "1 1 240px" }}>{storageNotice.text}</span>
              <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button className="btn btn-danger btn-xs" onClick={handleBackupNow}>
                  <DatabaseBackup size={13} /> Sao lưu ngay
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => { dismissStorageNotice(); setView("datatools"); }}>
                  Dọn & Khôi phục
                </button>
                <button className="btn btn-ghost btn-xs" onClick={dismissStorageNotice} aria-label="Đóng cảnh báo bộ nhớ">
                  <X size={13} />
                </button>
              </span>
            </div>
          )}

          {backendStatus === "error" && !currentBook && (
            <div className="dash-empty backend-error-card">
              <BookOpen size={46} />
              <p className="backend-error-text">{error}</p>
              <button className="btn btn-primary mt-md" onClick={fetchBooks}>
                <RefreshCw size={15} /> Kiểm tra lại kết nối
              </button>
            </div>
          )}

          {currentBook ? (
            <Suspense fallback={<ViewFallback label="Đang mở sách..." />}>
              <BookProvider book={currentBook} page={openInitialPage}>
                <BookReader
                  book={currentBook}
                  onBack={handleBack}
                  geminiKey={geminiKey}
                  initialPage={openInitialPage}
                  onOpenLessonPlan={(id) => {
                    setLpOpenId(id);
                    closeBook("lessonplans");
                  }}
                  onEditWord={() => handleEditTextBook(currentBook)}
                  contentVersion={bookContentNonce}
                />
              </BookProvider>
            </Suspense>
          ) : (
            <>
              <header className="global-header">
                {backendStatus !== "ok" && !currentBook && (
                  <div
                    className={
                      "dash-notice " +
                      (backendStatus === "error" ? "error" : "warn")
                    }
                    role="alert"
                  >
                    <span aria-hidden="true">
                      {backendStatus === "error" ? "❌" : "⚠️"}
                    </span>
                    {backendStatus === "error"
                      ? "Backend không phản hồi. Hãy kiểm tra máy chủ Express trên cổng 5000."
                      : "Không có dữ liệu sách đang hiển thị; hãy kiểm tra thư mục PDF hoặc chạy lại tải dữ liệu."}
                  </div>
                )}
                <div className="global-header-content">
                  {/* Left: Breadcrumb */}
                  <div className="global-header-left">
                    <button
                      className="mobile-menu-btn"
                      onClick={() => setMobileNavOpen((v) => !v)}
                      aria-label={mobileNavOpen ? "Đóng menu" : "Mở menu"}
                      aria-expanded={mobileNavOpen}
                    >
                      <span className="hamburger-line"></span>
                      <span className="hamburger-line"></span>
                      <span className="hamburger-line"></span>
                    </button>
                    <nav className="breadcrumb" aria-label="Điều hướng">
                      {(() => {
                        const breadcrumb = getBreadcrumb();
                        return (
                          <>
                            <span className="breadcrumb-section">
                              {breadcrumb.section}
                            </span>
                            {breadcrumb.subsection && (
                              <>
                                <span className="breadcrumb-separator">/</span>
                                <span className="breadcrumb-subsection">
                                  {breadcrumb.subsection}
                                </span>
                              </>
                            )}
                            <span className="breadcrumb-separator">/</span>
                            <span className="breadcrumb-current">
                              {breadcrumb.label}
                            </span>
                          </>
                        );
                      })()}
                    </nav>
                  </div>

                  {/* Right: Actions */}
                  <div className="global-header-right">
                    {/* Global Search Trigger • đồng bộ với Ctrl+K */}
                    <button
                      className="header-action-btn"
                      onClick={() => { try{ import("./core/appEvents.js").then(m=>m.appEvents.emit(m.AppEvents.OPEN_GLOBAL_SEARCH)); }catch{} }}
                      aria-label={`Tìm kiếm nhanh (${getShortcut("global.commandPalette")})`}
                      title={`Tìm kiếm nhanh (${getShortcut("global.commandPalette")})`}
                    >
                      <Search size={18} />
                    </button>

                    {/* Theme Toggle */}
                    <button
                      className="header-action-btn"
                      onClick={() => {
                        if (theme === "light") setTheme("dark");
                        else if (theme === "dark") setTheme("system");
                        else setTheme("light");
                      }}
                      aria-label="Đổi giao diện"
                        title="Đổi giao diện"
                    >
                      {theme === "light" && <Sun size={18} />}
                      {theme === "dark" && <Moon size={18} />}
                      {theme === "system" && <Monitor size={18} />}
                    </button>

                      {/* Xóa cache & tải lại • góc trên bên phải, chỉ icon mũi tên 360° */}
                    <button
                      className="header-action-btn"
                      onClick={handleClearCacheAndReload}
                      aria-label="Xóa cache và tải lại"
                      title="Xóa cache và tải lại"
                    >
                      <RefreshCw size={18} />
                    </button>

                    {/* Toàn màn hình • cạnh nút xóa cache */}
                    <button
                      className="header-action-btn"
                      onClick={toggleFullscreen}
                      aria-label={isFullscreen ? "Thoát toàn màn hình" : "toán màn hình"}
                      title={isFullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
                    >
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>

                    {/* AI Status Indicator */}
                    <div
                      className={`ai-status-indicator ${geminiKey ? "active" : ""}`}
                      title={
                        geminiKey ? "AI đã sẵn sàng" : "Chưa cấu hình API Key"
                      }
                      aria-label={
                        geminiKey ? "AI đã sẵn sàng" : "Chưa cấu hình API Key"
                      }
                      role="status"
                    >
                      <Sparkles size={18} />
                    </div>

                    {/* More Menu */}
                    <div className="header-more-menu">
                      <button
                        className="header-action-btn"
                        onClick={() => setShowSettings(true)}
                        aria-label="Cài đặt"
                        title="Cài đặt"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        className="btn btn-primary header-add-btn"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={uploadingBook}
                        aria-label="Thêm sách từ tập tin (PDF, DOCX, EPUB, ảnh…)"
                        title="Thêm từ file • hỗ trợ PDF, DOCX, PPTX, EPUB, TXT, MD, JPG/PNG…"
                      >
                        <Plus size={16} />
                        <span className="hide-mobile">
                          {uploadingBook ? "Đang thêm..." : "Thêm sách"}
                        </span>
                      </button>
                      <div className="header-add-group" style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginLeft: "0.35rem" }}>
                        <button
                          className="btn btn-secondary btn-sm header-add-btn-mini"
                          onClick={handleAddByUrl}
                          disabled={uploadingBook}
                          title="Thêm sách từ URL (dán link https://…)"
                          aria-label="Thêm từ URL"
                        >
                          🔗
                        </button>
                        <button
                          className="btn btn-secondary btn-sm header-add-btn-mini"
                          onClick={handleCreateFromText}
                          disabled={uploadingBook}
                          title="Tạo sách từ văn bản (nhập tiêu đề + nội dung)"
                          aria-label="Tạo từ văn bản"
                        >
                          ✏️
                        </button>
                      </div>
                      <input
                        ref={uploadInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.md,.epub,.jpg,.jpeg,.png,.gif,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,text/plain,application/epub+zip,image/*"
                        hidden
                        onChange={handleAddBook}
                        aria-hidden="true"
                        tabIndex={-1}
                      />
                    </div>
                  </div>
                </div>
              </header>

              <div className="dash-body">
                {/* Inline views: require local App state/closures • intentionally not registry-driven */}
                {view === "library" && (
                  <LibraryView
                    books={filteredBooks}
                    booksAll={books}
                    history={history}
                    totalBookmarks={totalBookmarks}
                    vocabCount={vocabCount}
                    totalMarks={totalMarks}
                    totalClips={totalClips}
                    plansCount={plansCount}
                    questionCount={questionCount}
                    lastPageMap={lastPageMap}
                    lastTotalMap={lastTotalMap}
                    favs={favs}
                    onToggleFav={toggleFav}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    isSearching={isSearching}
                    gradeFilter={gradeFilter}
                    setGradeFilter={setGradeFilter}
                    subjectFilter={subjectFilter}
                    setSubjectFilter={setSubjectFilter}
                    termFilter={termFilter}
                    setTermFilter={setTermFilter}
                    readingStatusFilter={readingStatusFilter}
                    setReadingStatusFilter={setReadingStatusFilter}
                    favOnly={favOnly}
                    setFavOnly={setFavOnly}
                    hasActiveFilters={hasActiveFilters}
                    clearFilters={clearFilters}
                    geminiKey={geminiKey}
                    onOpenSettings={() => setShowSettings(true)}
                    uploadNotice={uploadNotice}
                    uploadError={uploadError}
                    noticeUndo={noticeUndo}
                    uploadDraft={uploadDraft}
                    uploadThumb={uploadThumb}
                    onDismissNotice={() => { setUploadNotice(""); setUploadError(""); setNoticeUndo(null); if(noticeTimerRef.current) clearTimeout(noticeTimerRef.current); }}
                    isDragActive={dragActive}
                    setDragActive={setDragActive}
                    uploadingBook={uploadingBook}
                    loading={loading}
                    error={error}
                    onRetry={fetchBooks}
                    onOpenBook={handleOpenBook}
                    onDeleteBook={handleDeleteBook}
                    onRenameBook={handleRenameBook}
                    onEditTextBook={handleEditTextBook}
                    onAddBook={() => uploadInputRef.current?.click()}
                    onFileSelect={prepareUploadCandidate}
                    onUploadSubmit={submitUpload}
                    onImportDocx={submitDocxImport}
                    onClearUpload={() => setUploadDraft(null)}
                    backendStatus={backendStatus}
                  />
                )}
                {view === "continue" && (
                  <ContinueView
                    books={books}
                    history={history}
                    lastPageMap={lastPageMap}
                    lastTotalMap={lastTotalMap}
                    onOpenBook={handleOpenBook}
                    onClear={clearHistory}
                  />
                )}
                {view === "marks" && (
                  <BookmarksView
                    books={books}
                    bookmarksMap={bookmarksMap}
                    onOpenBook={handleOpenBook}
                    onRemove={(f, p) => {
                      removeBookmark(f, p);
                      setDataVersion((v) => v + 1);
                    }}
                    onClearFile={(f) => {
                      clearBookmarksForFile(f);
                      setDataVersion((v) => v + 1);
                    }}
                  />
                )}
                {view === "vocab" && (
                  <VocabView
                    vocab={vocabList}
                    books={books}
                    geminiKey={geminiKey}
                    onOpenBook={handleOpenBook}
                    onRemove={removeVocabEntry}
                    onClear={clearVocab}
                    onUpdateMeaning={updateVocabMeaning}
                    onChanged={() => setDataVersion((v) => v + 1)}
                  />
                )}
                {view === "stats" && (
                  <StatsView
                    books={books}
                    counts={counts}
                    lastPageMap={lastPageMap}
                    lastTotalMap={lastTotalMap}
                    favs={favs}
                    quizHistory={quizHistory}
                    onReset={resetStats}
                    onSampleQuiz={() => {
                      fillSampleQuiz(books);
                      setDataVersion((v) => v + 1);
                    }}
                    onOpenBook={handleOpenBook}
                  />
                )}
                {/* Registry-driven views: resolved via viewRegistry • single source, lazy-loaded */}
                {(() => {
                  // Single source = VIEW_REGISTRY: component === null → view inline ở trên
                  const entry = getViewEntry(view);
                  if (!entry || !entry.component) return null;
                  const Comp = entry.component;
                  const viewPropsMap = {
                    search: { books, onOpenBook: handleOpenBook },
                    compare: { books },
                    matrix: { books, onOpenBook: handleOpenBook },
                    langstats: { books },
                    inventory: { books, onOpenBook: handleOpenBook },
                    collections: { books, onOpenBook: handleOpenBook, onNavigate: closeBook },
                    concepts: { books, onNavigate: closeBook },
                    references: { books, onNavigate: closeBook },
                    lessonplans: { books, onNavigate: closeBook, initialPlanId: lpOpenId },
                    activities: { books, onNavigate: closeBook },
                    worksheets: { books, onNavigate: closeBook },
                    questionbank: { books, onNavigate: closeBook },
                    datatools: {},
                    dashboard: { books, history, totalBookmarks, vocabCount, plansCount, questionCount, totalClips, totalMarks, lastPageMap, lastTotalMap, onNavigate: closeBook },
                    ideas: { books, onNavigate: closeBook },
                    tasks: { books, initialTab: tasksInitialTab },
                    internship: {},
                    webtools: {},
                    whiteboard: {},
                    glossary: { geminiKey, inline: true },
                    help: { geminiKey, onOpenSettings: () => setShowSettings(true), onNavigate: (v) => closeBook(v) },
                  };
                  const props = viewPropsMap[view] || {};
                  return (
                    <Suspense fallback={<ViewFallback label={`Đang tải ${entry.label || view}...`} />}>
                      <Comp {...props} />
                    </Suspense>
                  );
                })()}
              </div>

              {/* LobbyBubble removed - using professional dashboard instead */}
            </>
          )}
        </div>

        {!currentBook && (
          <MobileBottomNav
            view={view}
            onNavigate={(v) => {
              closeBook(v);
              setMobileNavOpen(false);
            }}
            onOpenMenu={() => setMobileNavOpen(true)}
          />
        )}

        <AssistantBubble
          geminiKey={geminiKey}
          onOpenSettings={() => setShowSettings(true)}
          teacherMode={teacherMode}
          appContext={{
            view,
            currentBook,
            books,
            settings: settingsState,
            favoritesCount: favs.length,
            historyCount: history.length,
          }}
        />

        {/* GlobalSearch: ĐÚNG 1 instance, luôn mount (ngoài .app-shell nên chạy cả khi đang đọc sách).
            Trùng render sẽ đăng ký keydown/sgk:open-global-search 2 lần -> Ctrl+K mở 2 overlay chồng nhau. */}
        <GlobalSearch
          books={books}
          onNavigate={(v, opts) => { if (opts && opts.planId) setLpOpenId(opts.planId); if (v === "tasks" && opts && typeof opts.tab === "string") setTasksInitialTab(opts.tab); setView(v); try { if (v === "tasks" && opts && typeof opts.tab === "string") appEventsCore.emit(AppEventsCore.NAVIGATE, { view: v, tab: opts.tab, source: "hub" }); } catch {} }}
          onOpenBook={handleOpenBook}
        />

        {showSettings && (
          <SettingsCenter onClose={() => setShowSettings(false)} />
        )}

        {showTextModal && (
          <TextBookModal
            open={showTextModal}
            editingBook={editingTextBook}
            onClose={() => {
              setShowTextModal(false);
              setEditingTextBook(null);
            }}
            onSuccess={handleTextBookSuccess}
          />
        )}

        {/* Tinh tế: modal xác nhận xóa • thay confirm */}
        {deleteTarget && (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)} role="alertdialog" aria-modal="true" aria-labelledby="del-title">
            <div className="modal-content" onClick={(e)=>e.stopPropagation()} onKeyDown={(e)=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); setDeleteTarget(null); } }} style={{maxWidth:"min(440px, calc(100vw - 20px))"}}>
              <div className="modal-header"><h2 id="del-title">Đưa sách vào thùng rác?</h2><button className="btn btn-ghost btn-xs" onClick={()=>setDeleteTarget(null)} aria-label="Đóng"><X size={16}/></button></div>
              <div style={{padding:"1rem 1.1rem"}}>
                <p className="text-body-sm">Đưa <strong>“{deleteTarget.title}”</strong> vào thùng rác? Sách sẽ ẩn khỏi thư viện nhưng <strong>giữ {TRASH_TTL_DAYS} ngày</strong> — bấm Khôi phục ở <em>Sao lưu &amp; Khôi phục</em> là về ngay, ghi chú/đánh dấu không mất.</p>
                <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end",marginTop:"1rem"}}>
                  <button className="btn btn-ghost" onClick={()=>setDeleteTarget(null)} autoFocus>Hủy</button>
                  <button className="btn btn-danger" onClick={() => confirmDeleteBook()}><Trash2 size={14}/> Vào thùng rác</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal đổi tên • thay prompt */}
        {renameTarget && (
          <div className="modal-overlay" onClick={()=>setRenameTarget(null)} role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <div className="modal-content" onClick={(e)=>e.stopPropagation()} style={{maxWidth:"min(440px, calc(100vw - 20px))"}}>
              <div className="modal-header"><h2 id="rename-title">Đổi tên sách</h2><button className="btn btn-ghost btn-xs" onClick={()=>setRenameTarget(null)} aria-label="Đóng"><X size={16}/></button></div>
              <div style={{padding:"1rem 1.1rem"}}>
                <label className="form-label" htmlFor="rename-input">Tên mới</label>
                <input id="rename-input" className="form-control" value={renameValue} onChange={(e)=>setRenameValue(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") confirmRenameBook(); if(e.key==="Escape") setRenameTarget(null); }} placeholder="Nhập tên mới..." autoFocus />
                <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end",marginTop:"1rem"}}>
                  <button className="btn btn-ghost" onClick={()=>setRenameTarget(null)}>Hủy</button>
                  <button className="btn btn-primary" onClick={confirmRenameBook}>Lưu</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal thêm từ URL • thay 2 prompt */}
        {showUrlModal && (
          <div className="modal-overlay" onClick={()=>setShowUrlModal(false)} role="dialog" aria-modal="true" aria-labelledby="url-title">
            <div className="modal-content" onClick={(e)=>e.stopPropagation()} style={{maxWidth:"min(480px, calc(100vw - 20px))"}}>
              <div className="modal-header"><h2 id="url-title">Thêm sách từ URL</h2><button className="btn btn-ghost btn-xs" onClick={()=>setShowUrlModal(false)} aria-label="Đóng"><X size={16}/></button></div>
              <div style={{padding:"1rem 1.1rem",display:"flex",flexDirection:"column",gap:"0.7rem"}}>
                <div>
                  <label className="form-label" htmlFor="url-input">URL file</label>
                  <input id="url-input" className="form-control" value={urlInput} onChange={(e)=>setUrlInput(e.target.value)} placeholder="https://... .pdf / .docx / .epub / .png" autoFocus />
                </div>
                <div>
                  <label className="form-label" htmlFor="url-title-input">Tiêu đề (tùy chọn)</label>
                  <input id="url-title-input" className="form-control" value={urlTitle} onChange={(e)=>setUrlTitle(e.target.value)} placeholder="Để trống sẽ tự nhận diện" />
                </div>
                <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end"}}>
                  <button className="btn btn-ghost" onClick={()=>setShowUrlModal(false)}>Hủy</button>
                  <button className="btn btn-primary" onClick={confirmAddByUrl}>Thêm</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppErrorBoundary>
  );
}

// ------------------------------------------------------------------
// LIBRARY VIEW
// ------------------------------------------------------------------
function LibraryView({
  books,
  booksAll,
  history,
  totalBookmarks,
  vocabCount,
  totalMarks,
  totalClips,
  plansCount,
  questionCount,
  loading,
  error,
  onRetry,
  onOpenBook,
  onDeleteBook,
  onRenameBook,
  onAddBook,
  onFileSelect,
  onUploadSubmit,
  onImportDocx,
  onClearUpload,
  lastPageMap,
  lastTotalMap,
  favs,
  onToggleFav,
  viewMode,
  setViewMode,
  sortBy,
  setSortBy,
  searchQuery,
  setSearchQuery,
  isSearching,
  uploadThumb,
  onDismissNotice,
  gradeFilter,
  setGradeFilter,
  subjectFilter,
  setSubjectFilter,
  termFilter,
  setTermFilter,
  readingStatusFilter,
  setReadingStatusFilter,
  favOnly,
  setFavOnly,
  hasActiveFilters,
  clearFilters,
  geminiKey,
  onOpenSettings,
  uploadNotice,
  uploadError,
  noticeUndo,
  uploadDraft,
  isDragActive,
  setDragActive,
  uploadingBook,
  backendStatus,
  onEditTextBook,
}) {
  const historyBooks = (() => {
    if (!history || !booksAll) return [];
    const map = new Map(booksAll.map((b) => [b.filename, b]));
    const seen = new Set();
    const out = [];
    for (const h of history) {
      if (seen.has(h.filename)) continue;
      const b = map.get(h.filename);
      if (b) {
        out.push(b);
        seen.add(h.filename);
      }
      if (out.length >= 10) break;
    }
    return out;
  })();

  const [continueCollapsed, setContinueCollapsed] = React.useState(() => {
    const v = safeGetString("sgk_continue_collapsed", null);
    return v === "true";
  });
  const [showSubjectPicker, setShowSubjectPicker] = React.useState(false);

  // Đóng panel môn khi click ngoài
  React.useEffect(() => {
    if (!showSubjectPicker) return;
    const onDown = (e) => {
      if (!e.target.closest?.(".lib-subject-anchor")) setShowSubjectPicker(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSubjectPicker]);

  // Danh mục môn học giữ nguyên đã đổi sách • lấy từ catalog persistent
  const subjectCatalog = useMemo(() => {
    try {
      return sortSubjects(getSubjectCatalog());
    } catch {
      return [...SUBJECTS];
    }
  }, [booksAll]);

  const favCount = favs ? favs.length : 0;

  // stats values derived from real data
  const statItems = [
    {
      icon: "📚",
      value: booksAll ? booksAll.length : books.length,
      label: "Sách",
      sub: "Kết nối tri thức",
    },
    {
      icon: "🔖",
      value: totalBookmarks ?? 0,
      label: "Đánh dấu",
      sub: "trang đã lưu",
    },
    {
      icon: "📖",
      value: history ? history.length : 0,
      label: "Đang học",
      sub: "cuốn gần đây",
    },
    { icon: "📝", value: vocabCount ?? 0, label: "Từ vựng", sub: "đã lưu" },
  ];

  // Drag counter chống nhấp nháy khi kéo qua các thẻ con
  const dragCounterRef = React.useRef(0);

  return (
    <div
      className={`library-command-center libx-root ${isDragActive ? "drag-over" : ""}`}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!hasFilesInDataTransfer(e)) return; dragCounterRef.current += 1; if (!isDragActive) setDragActive(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} if (!isDragActive && hasFilesInDataTransfer(e)) setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = Math.max(0, dragCounterRef.current - 1); if (dragCounterRef.current === 0) setDragActive(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounterRef.current = 0;
        setDragActive(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) onFileSelect(file);
      }}
    >
      <style>{`
        .libx-root { display:flex; flex-direction:column; gap:13px; }
        .libx-stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:9px; }
        .libx-stat { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:13px; border:1px solid var(--border-color); background:var(--surface); }
        .libx-stat-ic { width:37px; height:37px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; background:var(--color-action-soft, var(--primary-light)); }
        .libx-stat-val { font-size:1.15rem; font-weight:800; color:var(--text-dark); line-height:1.1; }
        .libx-stat-label { font-size:10.5px; color:var(--text-muted); font-weight:600; }
        .libx-sec-head { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
        .libx-sec-title { margin:0; font-size:0.93rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:7px; }
        .libx-sec-title svg { color:var(--color-action, var(--primary)); }
        .libx-sec-hint { font-size:11px; color:var(--text-muted); }
        .libx-strip { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:9px; }
        .libx-cont { display:flex; gap:10px; align-items:center; padding:9px 10px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; }
        .libx-cont:hover { border-color:var(--color-action, var(--primary)); box-shadow:0 6px 16px rgba(15,23,42,0.08); }
        .libx-cont-cover { width:52px; flex-shrink:0; border-radius:7px; overflow:hidden; border:1px solid var(--border-color); }
        .libx-cont-t { font-size:0.83rem; font-weight:700; color:var(--text-dark); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
        .libx-cont-m { font-size:10.5px; color:var(--text-muted); }
        .libx-bar { height:6px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; margin-top:5px; }
        .libx-bar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, var(--primary)); }
        .libx-cta { margin-left:auto; flex-shrink:0; font-size:11px; font-weight:800; color:#fff; background:var(--color-action, var(--primary)); padding:6px 11px; border-radius:999px; }
        .libx-hero { display:flex; align-items:center; gap:12px; flex-wrap:wrap; border-radius:13px; padding:12px 15px; color:#fff;
          background:linear-gradient(120deg, var(--color-action-strong, #1e3a8a), var(--color-action, #2563eb) 60%, var(--color-action-active, #1e40af)); }
        .libx-hero h2 { margin:0; font-size:0.92rem; display:flex; align-items:center; gap:7px; }
        .libx-hero p { margin:3px 0 0; font-size:11.5px; opacity:0.92; }
        .libx-toolbar { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 13px; display:flex; flex-direction:column; gap:9px; }
        .libx-trow { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .libx-search { flex:1 1 210px; min-width:170px; position:relative; }
        .libx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .libx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .libx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .libx-seg { display:inline-flex; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
        .libx-seg button { border:none; background:#fff; padding:8px 11px; cursor:pointer; color:#64748b; display:inline-flex; }
        .libx-seg button.active { background:var(--color-action, var(--primary)); color:#fff; }
        .libx-fbtn { font-size:12px; font-weight:700; padding:6px 11px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; color:#475569; cursor:pointer; }
        .libx-fbtn.active { background:var(--color-action, var(--primary)); border-color:var(--color-action, var(--primary)); color:#fff; }
        .libx-count { font-size:12px; color:var(--text-muted); }
        .libx-count strong { color:var(--text-dark); font-size:13px; }
        .libx-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(215px, 1fr)); gap:12px; }
        .libx-book { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; overflow:hidden; cursor:pointer; transition:transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease; display:flex; flex-direction:column; }
        .libx-book:hover { transform:translateY(-3px); box-shadow:0 12px 26px rgba(15,23,42,0.12); border-color:var(--color-action, var(--primary)); }
        .libx-cover { position:relative; background:linear-gradient(135deg, var(--color-action-soft, #dbeafe), #ede9fe); aspect-ratio:1/1; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        .libx-cover .book-cover { width:100% !important; height:100% !important; min-height:100%; padding:0 !important; border:none !important; font-size:2rem; }
        .libx-fav { position:absolute; top:8px; right:8px; width:30px; height:30px; border-radius:999px; border:1px solid rgba(255,255,255,0.6); background:rgba(15,23,42,0.35); color:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(4px); }
        .libx-fav.on { background:#f59e0b; border-color:#f59e0b; }
        .libx-grade { position:absolute; left:8px; bottom:8px; font-size:10px; font-weight:800; color:#fff; background:rgba(15,23,42,0.55); padding:3px 8px; border-radius:999px; backdrop-filter:blur(4px); }
        .libx-body { padding:10px 12px 11px; display:flex; flex-direction:column; gap:6px; flex:1; }
        .libx-title { margin:0; font-size:0.85rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.35em; }
        .libx-meta { font-size:11px; color:var(--text-muted); display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .libx-foot { display:flex; gap:6px; align-items:center; margin-top:auto; padding-top:7px; border-top:1px dashed var(--border-color); }
        .libx-open { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12.5px; font-weight:800; padding:8px 10px; border-radius:10px; border:none; background:var(--color-action, var(--primary)); color:#fff; cursor:pointer; }
        .libx-open:hover { filter:brightness(1.08); }
        .libx-icobtn { width:32px; height:32px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; }
        .libx-icobtn:hover { border-color:var(--color-action, var(--primary)); color:var(--color-action-strong, var(--primary)); }
        .libx-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .libx-row { display:flex; gap:11px; align-items:center; background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:9px 12px; cursor:pointer; }
        .libx-row:hover { border-color:var(--color-action, var(--primary)); }
        .libx-row-cover { width:46px; flex-shrink:0; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); }
        .libx-list { display:flex; flex-direction:column; gap:8px; }
      `}</style>
      {isDragActive && (
        <div className="global-drag-overlay" aria-hidden="true"><span>Thả file để thêm vào thư viện</span></div>
      )}
      {/* Backend error is already shown in header; only show empty-specific notices here */}

      {/* Quick stats */}
      <section className="libx-stats" aria-label="Thống kê nhanh">
        {statItems.map((it) => (
          <div key={it.label} className="libx-stat">
            <span className="libx-stat-ic" aria-hidden="true">{it.icon}</span>
            <span>
              <span className="libx-stat-val">{it.value}</span><br />
              <span className="libx-stat-label">{it.label} • {it.sub}</span>
            </span>
          </div>
        ))}
      </section>

      {/* Tiếp tục học strip • có thể thu hồi, không xóa logic (giữ historyBooks) */}
      {historyBooks.length > 0 && (
        <section aria-label="Tiếp tục học">
          <div className="libx-sec-head">
            <h2 className="libx-sec-title"><Clock size={15} /> Tiếp tục học</h2>
            <span className="libx-sec-hint">{historyBooks.length} cuốn g?n dạy</span>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => {
                const next = !continueCollapsed;
                setContinueCollapsed(next);
                try {
                  const res = safeSetString("sgk_continue_collapsed", next ? "true" : "false");
                  if (!res.ok && res.quota) console.warn("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
                  else if (!res.ok) console.warn("[App] safeSetString failed sgk_continue_collapsed:", res.error);
                } catch (e) { console.warn("[App] safeSetString exception sgk_continue_collapsed:", e); }
              }}
              aria-label={continueCollapsed ? "Mở rộng Tiếp tục học" : "Thu hồi Tiếp tục học"}
              aria-expanded={!continueCollapsed}
              title={continueCollapsed ? "Mở rộng" : "Thu hồi"}
              style={{ marginLeft: "auto" }}
            >
              {continueCollapsed ? <><ChevronDown size={14} /> Mở</> : <><ChevronUp size={14} /> Thu hồi</>}
            </button>
          </div>
          {!continueCollapsed && (
            <div className="libx-strip">
              {historyBooks.map((book) => {
                const { page, total, pct } = bookProgress(book.filename, lastPageMap, lastTotalMap);
                const last = lastPageMap[book.filename] || 0;
                return (
                  <div
                    key={book.filename}
                    className="libx-cont"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenBook(book, last || null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenBook(book, last || null);
                      }
                    }}
                    aria-label={`Tiếp tục đọc ${book.title}`}
                  >
                    <span className="libx-cont-cover">
                      <BookCover book={book} lastPage={last} numPages={total} height={64} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="libx-cont-t" title={book.title}>{book.title}</span><br />
                      <span className="libx-cont-m">Lớp {book.grade} • {book.subject}{page > 0 && total > 0 ? ` • Tr.${page}/${total}` : " • Chưa đọc"}</span>
                      {page > 0 && total > 0 && (
                        <span className="libx-bar" aria-label={`Tiến để ${pct}%`}><i style={{ width: pct + "%" }} /></span>
                      )}
                    </span>
                    <span className="libx-cta">Tiếp tục</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Welcome hero */}
      <div className="libx-hero">
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2><Sparkles size={14} /> Học cùng AI • đọc, ghi chú, làm bài</h2>
          <p>Chọn một cuốn sách bên dưới để mở chế độ đọc 2 trang, trò chuyện với AI, làm bài tập và ghi chú trực tiếp trên trang sách.</p>
        </div>
        {!geminiKey && (
          <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", flexShrink: 0 }} onClick={onOpenSettings}>
            Cấu hình Gemini API
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="libx-toolbar">
        <div className="libx-trow">
          <div className={`libx-search ${isSearching ? "is-searching" : ""}`}>
              <Search className="search-icon" size={16} aria-hidden="true" />
              <input
                type="text"
                className="search-input"
                placeholder="Tìm sách theo tên, môn, lớp..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Tìm sách"
                aria-busy={isSearching}
              />
              {isSearching && <span className="search-busy" aria-hidden="true"><span className="spinner spinner-sm" style={{width:14,height:14,borderWidth:2}}/></span>}
              {searchQuery && !isSearching && (
                <button
                  onClick={() => setSearchQuery("")}
                  title="Xóa tìm kiếm"
                  aria-label="Xóa tìm kiếm"
                  className="search-clear"
                >
                  <X size={14} />
                </button>
              )}
              {searchQuery && isSearching && (
                <button
                  onClick={() => setSearchQuery("")}
                  title="Xóa tìm kiếm"
                  aria-label="Xóa tìm kiếm"
                  className="search-clear"
                  style={{right:28}}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="toolbar-sort">
              <ArrowUpDown size={14} aria-hidden="true" />
              <select
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sắp xếp"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="libx-seg" role="group" aria-label="Kiểu hiển thị">
              <button
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
                aria-label="Xem lưới"
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                aria-label="Xem danh sách"
                aria-pressed={viewMode === "list"}
              >
                <List size={14} />
              </button>
            </div>
          </div>
          <div className="libx-trow">
            <div className="filter-group compact">
              <span className="filter-label hide-mobile">Lớp:</span>
              <button
                className={`libx-fbtn lib-grade-btn ${gradeFilter === null ? "active" : ""}`}
                onClick={() => setGradeFilter(null)}
                aria-label="Tất cả lớp"
              >
                Tất cả
              </button>
              {[1, 2, 3, 4, 5].map((g) => (
                <button
                  key={g}
                  className={`libx-fbtn lib-grade-btn ${gradeFilter === g ? "active" : ""}`}
                  onClick={() => setGradeFilter(g)}
                  aria-label={`Lớp ${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="lib-subject-anchor filter-group compact">
              <span className="filter-label hide-mobile">Môn:</span>
              <button
                className="libx-fbtn lib-subject-trigger"
                onClick={() => setShowSubjectPicker((v) => !v)}
                aria-expanded={showSubjectPicker}
                aria-haspopup="dialog"
              >
                <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subjectFilter ?? "Tất cả"}
                </span>
                <ChevronDown size={13} style={{ transform: showSubjectPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
              </button>
              {showSubjectPicker && (
                <div className="lib-subject-panel" role="dialog" aria-label="Chọn môn học">
                  <div className="lib-subject-panel-head">
                    <span>Chọn môn học • {subjectCatalog.length} môn</span>
                    <button className="lib-subject-close" onClick={() => setShowSubjectPicker(false)} aria-label="Đóng">
                      <X size={12} />
                    </button>
                  </div>
                  <div className="lib-subject-grid">
                    <button
                      className={`libx-fbtn ${subjectFilter === null ? "active" : ""}`}
                      onClick={() => {
                        setSubjectFilter(null);
                        setShowSubjectPicker(false);
                      }}
                    >
                      Tất cả
                    </button>
                    {subjectCatalog.map((s) => (
                      <button
                        key={s}
                        className={`libx-fbtn ${subjectFilter === s ? "active" : ""}`}
                        onClick={() => {
                          setSubjectFilter(s);
                          setShowSubjectPicker(false);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="filter-group compact">
              <span className="filter-label hide-mobile">Tập:</span>
              <button
                className={`libx-fbtn ${termFilter === null ? "active" : ""}`}
                onClick={() => setTermFilter(null)}
              >
                Tất cả
              </button>
              {[1, 2].map((t) => (
                <button
                  key={t}
                  className={`libx-fbtn ${termFilter === t ? "active" : ""}`}
                  onClick={() => setTermFilter(t)}
                >
                  tập {t}
                </button>
              ))}
            </div>
            <div className="filter-group compact">
              <span className="filter-label hide-mobile">Tiến để:</span>
              <button
                className={`libx-fbtn ${readingStatusFilter === null ? "active" : ""}`}
                onClick={() => setReadingStatusFilter(null)}
              >
                Tất cả
              </button>
              <button
                className={`libx-fbtn ${readingStatusFilter === "reading" ? "active" : ""}`}
                onClick={() =>
                  setReadingStatusFilter(
                    readingStatusFilter === "reading" ? null : "reading",
                  )
                }
              >
                Đang đọc
              </button>
              <button
                className={`libx-fbtn ${readingStatusFilter === "completed" ? "active" : ""}`}
                onClick={() =>
                  setReadingStatusFilter(
                    readingStatusFilter === "completed" ? null : "completed",
                  )
                }
              >
                Đã đọc
              </button>
              <button
                className={`libx-fbtn ${readingStatusFilter === "unread" ? "active" : ""}`}
                onClick={() =>
                  setReadingStatusFilter(
                    readingStatusFilter === "unread" ? null : "unread",
                  )
                }
              >
                Chưa đọc
              </button>
            </div>
            <div className="filter-group compact lib-fav-row">
              <span className="filter-label hide-mobile" style={{ visibility: "hidden" }} aria-hidden="true">
                Yêu thích:
              </span>
              <button
                className={`libx-fbtn ${favOnly ? "active" : ""}`}
                onClick={() => setFavOnly((v) => !v)}
                aria-pressed={favOnly}
                title="Chỉ hiển thị sách yêu thích"
              >
                <span className="ui-s-24cad3">
                  <Star size={13} fill={favOnly ? "currentColor" : "none"} /> Yêu thích
                </span>
              </button>
            </div>
          </div>
        <div className="libx-trow" style={{ alignItems: "center" }}>
          <span className="libx-count" aria-live="polite" aria-atomic="true">
            <strong>{books.length}</strong> cuốn
            {hasActiveFilters ? <span> • đã lọc trên {booksAll?.length ?? books.length}</span> : null}
          </span>
          <span className="sr-only" aria-live="polite">Hiển thị {books.length} trên {booksAll?.length ?? books.length} cuốn</span>
          {hasActiveFilters && (
            <button className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X size={12} /> Xóa lọc
            </button>
          )}
        </div>
      </div>

      {(uploadNotice || uploadError) && (
        <div
          className={"upload-notice " + (uploadError ? "error" : "ok")}
          role="status"
          aria-live="polite"
        >
          <span>{uploadError || uploadNotice}</span>
          {!uploadError && noticeUndo && noticeUndo.text === uploadNotice && (
            <button
              className="btn btn-primary btn-xs"
              onClick={() => { try { noticeUndo.run(); } catch (e) { console.warn("undo failed:", e); } }}
              style={{ marginLeft: 8 }}
            >
              <RotateCcw size={13} /> {noticeUndo.label || "Hoàn tác"}
            </button>
          )}
          <button className="btn btn-ghost btn-xs" onClick={onDismissNotice} aria-label="Đóng thông báo" style={{marginLeft:8}}><X size={14}/></button>
        </div>
      )}

      {uploadDraft && (
        <div
          className="upload-preview-card"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!hasFilesInDataTransfer(e)) return; dragCounterRef.current += 1; setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = Math.max(0, dragCounterRef.current - 1); if (dragCounterRef.current === 0) setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            dragCounterRef.current = 0;
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onFileSelect(file);
          }}
        >
          <div className="upload-preview-icon" aria-hidden="true">
            {uploadThumb ? <img src={uploadThumb} alt="preview" style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:"1px solid var(--border-color)"}}/> : "📕"}
          </div>
          <div className="upload-preview-info">
            <div className="upload-preview-label">Xem trước trước khi lưu</div>
            <div className="upload-preview-name">{uploadDraft.name}</div>
            <div className="upload-preview-meta">
              {(uploadDraft.size / (1024 * 1024)).toFixed(2)} MB •{" "}
              {uploadDraft.title}
            </div>
            {String(uploadDraft.name || "").toLowerCase().endsWith(".docx") && (
              <div className="upload-preview-meta" style={{ marginTop: 4, color: "var(--primary)", fontWeight: 600 }}>
                💡 File Word: Nhập thành Sách Word để giữ nguyên định dạng — đọc dạng sách, sửa như Word, xuất lại .docx.
              </div>
            )}
            {String(uploadDraft.name || "").toLowerCase().endsWith(".doc") && !String(uploadDraft.name || "").toLowerCase().endsWith(".docx") && (
              <div className="upload-preview-meta" style={{ marginTop: 4, color: "var(--warning, #b45309)", fontWeight: 600 }}>
                File .doc (Word cũ): hãy mở bằng Word và Lưu thành .docx rồi mới nhập để giữ nguyên định dạng.
              </div>
            )}
          </div>
          <div className="upload-preview-actions">
            {String(uploadDraft.name || "").toLowerCase().endsWith(".docx") && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={onImportDocx}
                disabled={uploadingBook}
                title="Chuyển .docx thành sách Word: giữ nguyên định dạng, đọc dạng sách, sửa như Word, xuất lại .docx"
              >
                {uploadingBook ? "Đang nhập..." : "📥 Nhập thành Sách Word"}
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={onUploadSubmit}
              disabled={uploadingBook}
              title={String(uploadDraft.name || "").toLowerCase().endsWith(".docx") ? "Lưu file gốc (đọc/tải xuống, không chuyển dạng sách)" : undefined}
            >
              {uploadingBook ? "Đang lưu..." : String(uploadDraft.name || "").toLowerCase().endsWith(".docx") ? "Lưu file gốc" : "Lưu vào thư viện"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onClearUpload}
              disabled={false}
              title={uploadingBook ? "Hủy và bỏ qua kết quả đang lưu" : "Hủy"}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {!uploadDraft && (
        <div
          className={"upload-dropzone " + (isDragActive ? "active" : "")}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!hasFilesInDataTransfer(e)) return; dragCounterRef.current += 1; setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = Math.max(0, dragCounterRef.current - 1); if (dragCounterRef.current === 0) setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            dragCounterRef.current = 0;
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onFileSelect(file);
          }}
          onClick={onAddBook}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAddBook();
            }
          }}
          aria-label="Kéo file PDF vào đây hoặc nhấn để chọn sách"
        >
          <div className="upload-dropzone-icon" aria-hidden="true">
            <Upload size={18} />
          </div>
          <div className="upload-dropzone-title">Kéo & thả file PDF vào đây</div>
          <div className="upload-dropzone-subtitle">
            hoặc nhấn để chọn sách mới • hỗ trợ PDF, DOCX, EPUB, ảnh
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state" aria-busy="true" aria-label="Đang tải">
          <div className="skeleton-grid">
            {Array.from({length:8}).map((_,i)=>(
              <div key={i} className="skeleton-card">
                <div className="skeleton-cover" />
                <div className="skeleton-line" style={{width:"70%"}}/>
                <div className="skeleton-line" style={{width:"50%"}}/>
              </div>
            ))}
          </div>
          <p className="loading-hint">Đang tải danh sách sách giáo khoa...</p>
        </div>
      ) : backendStatus === "error" && !loading ? (
        <div className="empty-state error-state" role="alert">
          <div className="empty-icon">🔌</div>
          <h3>Không thể kết nối máy chủ</h3>
          <p>
            {error || "Hãy chắc chắn máy chủ backend đang chạy trên cổng 5000."}
          </p>
          <button className="btn btn-primary" onClick={onRetry}>
            <RefreshCw size={14} /> Thử lại
          </button>
        </div>
      ) : books.length === 0 && !loading ? (
        hasActiveFilters ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>Không tìm thấy sách phù hợp</h3>
            <p>Thử nới lỏng bộ lọc hoặc từ khóa tìm kiếm.</p>
            <button className="btn btn-secondary" onClick={clearFilters}>
              <RefreshCw size={14} /> Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <h3>Thư viện đang trống</h3>
            <p>Thêm sách PDF để bắt đầu nhé.</p>
            <button className="btn btn-primary" onClick={onAddBook}>
              <Plus size={14} /> Thêm sách
            </button>
          </div>
        )
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="libx-grid">
              {books.map((book) => (
                <BookCard
                  key={book.filename}
                  book={book}
                  lastPage={lastPageMap[book.filename] || 0}
                  numPages={lastTotalMap[book.filename] || 0}
                  fav={favs.includes(book.filename)}
                  onToggleFav={() => onToggleFav(book.filename)}
                  onOpen={() => onOpenBook(book)}
                  onDelete={() => onDeleteBook(book)}
                  onRename={() => onRenameBook(book)}
                  onEditText={() => onEditTextBook?.(book)}
                />
              ))}
            </div>
          ) : (
            <div className="libx-list">
              {books.map((row) => {
                const { page, total, pct } = bookProgress(row.filename, lastPageMap, lastTotalMap);
                const last = lastPageMap[row.filename] || 0;
                const isFav = favs.includes(row.filename);
                const _ext = String(row.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
                return (
                  <div key={row.filename} className="libx-row" role="button" tabIndex={0}
                    onClick={() => onOpenBook(row)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenBook(row); } }}
                    aria-label={`Mở sách ${row.title}`}>
                    <span className="libx-row-cover">
                      <BookCover book={row} lastPage={last} numPages={total} height={56} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="libx-cont-t" title={row.title}>{row.title}</span><br />
                      <span className="libx-cont-m">Lớp {row.grade} • {row.subject} • Tập {row.term}</span>
                      {page > 0 && total > 0
                        ? <span className="libx-bar" style={{ maxWidth: 220 }}><i style={{ width: pct + "%" }} /></span>
                        : <span className="libx-cont-m">Chưa đọc</span>}
                    </span>
                    <button className="libx-icobtn" style={isFav ? { color: "#f59e0b", borderColor: "#fde68a", background: "#fffbeb" } : undefined}
                      onClick={(e) => { e.stopPropagation(); onToggleFav(row.filename); }}
                      aria-label={isFav ? "Bộ yêu thích" : "Thêm yêu thích"} title={isFav ? "Bộ yêu thích" : "Thêm yêu thích"}>
                      <Star size={14} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    {[".txt", ".md"].includes(_ext) && (
                      <button className="libx-icobtn" onClick={(e) => { e.stopPropagation(); onEditTextBook?.(row); }} aria-label="Sửa nội dung" title="Sửa nội dung (chỉ .txt/.md)"><Edit3 size={14} /></button>
                    )}
                    <button className="libx-icobtn" onClick={(e) => { e.stopPropagation(); onRenameBook(row); }} aria-label="Đổi tên" title="mũi tên"><Pencil size={14} /></button>
                    <button className="libx-icobtn danger" onClick={(e) => { e.stopPropagation(); onDeleteBook(row); }} aria-label="Xóa" title="Xóa"><Trash2 size={14} /></button>
                    <button className="libx-open" style={{ flex: "0 0 auto" }} onClick={(e) => { e.stopPropagation(); onOpenBook(row); }}><BookOpen size={13} /> Mở</button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BookCard({
  book,
  lastPage,
  numPages = 0,
  fav,
  onToggleFav,
  onOpen,
  onDelete,
  onRename,
  onEditText,
}) {
  const { page, pct } = progressFromPages(lastPage, numPages);
  return (
    <div
      className="libx-book"
      role="button"
      tabIndex={0}
      aria-label={`Mở sách ${book.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="libx-cover">
        <BookCover book={book} lastPage={lastPage} numPages={numPages} />
        <button
          className={`libx-fav ${fav ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          aria-label={fav ? "Bộ yêu thích" : "Thêm yêu thích"}
          title={fav ? "Bộ yêu thích" : "Thêm yêu thích"}
        >
          <Star size={14} fill={fav ? "currentColor" : "none"} />
        </button>
        <span className="libx-grade">Lớp {book.grade} • {book.subject}</span>
      </div>
      <div className="libx-body">
        <h4 className="libx-title" title={book.title}>
          {book.title}
        </h4>
        <div className="libx-meta">
          <span>Tập {book.term}</span>
          <span>—</span>
          <span>{(book.size / (1024 * 1024)).toFixed(1)} MB</span>
        </div>
        {page > 0 && numPages > 0 ? (
          <>
            <div className="libx-bar" aria-label={`Tiến để ${pct}%`}>
              <i style={{ width: pct + "%" }} />
            </div>
            <span className="libx-meta">Trang {page}/{numPages} • {pct}%</span>
          </>
        ) : (
          <span className="libx-meta">Chưa đọc</span>
        )}
        <div className="libx-foot">
          <button
            className="libx-open"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            aria-label={`Mở sách ${book.title}`}
          >
            <BookOpen size={13} /> {page > 0 ? "Tiếp tục" : "Mở sách"}
          </button>
          <button
            className="libx-icobtn"
            onClick={(e) => {
              e.stopPropagation();
              onRename?.();
            }}
            aria-label={`đổi tên sách ${book.title}`}
            title="Đổi tên"
          >
            <Pencil size={14} />
          </button>
          {(() => {
            const _ext = String(book.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
            if ([".txt", ".md"].includes(_ext)) {
              return (
                <button
                  className="libx-icobtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditText?.();
                  }}
                  aria-label={`Sửa nội dung ${book.title}`}
                  title="Sửa nội dung van bản"
                >
                  <Edit3 size={14} />
                </button>
              );
            }
            return null;
          })()}
          <button
            className="libx-icobtn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            aria-label={`Xóa sách ${book.title}`}
            title="Xóa sách"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// CONTINUE VIEW
// ------------------------------------------------------------------
function ContinueView({
  books,
  history,
  lastPageMap,
  lastTotalMap,
  onOpenBook,
  onClear,
}) {
  const byFilename = useMemo(
    () => new Map(books.map((b) => [b.filename, b])),
    [books],
  );
  const entries = history
    .map((h) => ({ at: h.at, book: byFilename.get(h.filename) }))
    .filter((e) => e.book)
    .sort((a, b) => b.at - a.at);

  if (!entries.length) {
    return (
      <div className="dash-empty">
        <Clock size={46} />
        <p>
          Thầy/cô chưa mở cuốn sách nào. Hãy chọn một cuốn trong Thư viện để bắt
          đầu!
        </p>
      </div>
    );
  }

  const tableData = entries.map(({ book, at }) => {
    const last = lastPageMap[book.filename] || 0;
    const total = lastTotalMap[book.filename] || 0;
    const page = last > 0 ? Math.max(1, last - 1) : 0;
    const pct =
      total > 1 && page > 0
        ? Math.min(100, Math.round((page / Math.max(1, total - 1)) * 100))
        : 0;
    return {
      filename: book.filename,
      book,
      at,
      title: book.title,
      grade: book.grade,
      subject: book.subject,
      page,
      total,
      pct,
    };
  });

  return (
    <div>
      <div className="data-table-toolbar">
        <div className="data-table-toolbar-left">
          <span className="ui-s-a80a05">
            {entries.length} cuốn đã mở g?n dạy
          </span>
        </div>
        <div className="data-table-toolbar-right">
          <button className="btn btn-secondary btn-xs" onClick={onClear}>
            <Trash2 size={13} /> Xóa lịch sử
          </button>
        </div>
      </div>
      <DataTable
        columns={[
          {
            key: "title",
            label: "Sách",
            sortable: true,
            render: (v, row) => (
              <div className="ui-s-c932cc">
                <div
                  style={{
                    width: 52,
                    flexShrink: 0,
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <BookCover
                    book={row.book}
                    lastPage={lastPageMap[row.book.filename] || 0}
                    numPages={lastTotalMap[row.book.filename] || 0}
                    height={56}
                  />
                </div>
                <div>
                  <div className="ui-s-0dbc82 cell-clamp" title={row.title}>
                    {row.title}
                  </div>
                  <div className="ui-s-300269">
                    Lớp {row.grade} • {row.subject} • Tập {row.book.term}
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: "page",
            label: "Trang hiện tải",
            width: "120px",
            align: "right",
            sortable: true,
            render: (v, row) => (row.page > 0 ? `${row.page}` : "—"),
          },
          {
            key: "total",
            label: "Tổng trang",
            width: "110px",
            align: "right",
            hideOnMobile: true,
            render: (v) => v || "?",
          },
          {
            key: "pct",
            label: "Tiến để",
            width: "140px",
            render: (_, row) =>
              row.page > 0 && row.total > 0 ? (
                <div>
                  <div className="progress-mini">
                    <div
                      className="progress-mini-fill"
                      style={{ width: row.pct + "%" }}
                    ></div>
                  </div>
                  <div className="ui-s-eb441c">{row.pct}%</div>
                </div>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: "at",
            label: "Lần đọc gần nhất",
            width: "160px",
            sortable: true,
            hideOnMobile: true,
            render: (v) => formatDateTime(v),
          },
          {
            key: "_actions",
            label: "Thao tác",
            width: "130px",
            align: "right",
            render: (_, row) => (
              <span className="data-table-actions">
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => onOpenBook(row.book)}
                >
                  <BookOpenCheck size={12} /> Tiếp tục
                </button>
              </span>
            ),
          },
        ]}
        data={tableData}
        keyField="filename"
        emptyText="Chưa có lịch sử"
        onRowClick={(row) => onOpenBook(row.book)}
      />
    </div>
  );
}

function BookmarksView({
  books,
  bookmarksMap,
  onOpenBook,
  onRemove,
  onClearFile,
}) {
  const [tick, setTick] = useState(0);
  const byFilename = useMemo(
    () => new Map(books.map((b) => [b.filename, b])),
    [books],
  );
  const fileNames = Object.keys(bookmarksMap).filter((f) => byFilename.has(f));
  const total = fileNames.reduce((a, f) => a + bookmarksMap[f].length, 0);

  if (!total) {
    return (
      <div className="dash-empty">
        <Bookmark size={46} />
        <p>
          Chưa có trang nào được đánh dấu. Mở một cuốn sách và bấm nút ★ đánh
          dấu để lưu trang quan trọng!
        </p>
      </div>
    );
  }

  // Flatten to table rows: each bookmark is a row (with optional label)
  void tick;
  const rows = [];
  fileNames.forEach((filename) => {
    const book = byFilename.get(filename);
    bookmarksMap[filename].forEach((pdfPage) => {
      const bookPage = Math.max(1, pdfPage - 1);
      const label = getBookmarkLabel(filename, pdfPage);
      rows.push({
        id: filename + "-" + pdfPage,
        filename,
        pdfPage,
        bookPage,
        bookTitle: book.title,
        book,
        grade: book.grade,
        subject: book.subject,
        label,
      });
    });
  });

  return (
    <div>
      <div className="data-table-toolbar">
        <div className="data-table-toolbar-left">
          <span className="ui-s-a80a05">
            {total} đánh dấu trong {fileNames.length} sách
          </span>
        </div>
        <div className="data-table-toolbar-right">
          <span className="ui-s-300269">Gợi ý: bấm dòng để nhảy tới trang</span>
        </div>
      </div>
      <DataTable
        columns={[
          {
            key: "bookPage",
            label: "Trang",
            width: "90px",
            align: "right",
            sortable: true,
            render: (v) => <span className="tag-pill">Trang {v}</span>,
          },
          {
            key: "bookTitle",
            label: "Sách",
            sortable: true,
            render: (v, row) => (
              <div>
                <div className="ui-s-5db84c cell-clamp" title={row.bookTitle}>
                  {row.bookTitle}
                </div>
                <div className="ui-s-300269">
                  Lớp {row.grade} • {row.subject}
                </div>
              </div>
            ),
          },
          {
            key: "label",
            label: "Ghi chú",
            sortable: true,
            hideOnMobile: true,
            render: (v) =>
              v ? (
                <span className="cell-clamp" title={v}>
                  {v}
                </span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: "grade",
            label: "Lớp",
            width: "80px",
            align: "center",
            hideOnMobile: true,
          },
          { key: "subject", label: "Môn", width: "100px", hideOnMobile: true },
          {
            key: "_actions",
            label: "Thao tác",
            width: "240px",
            align: "right",
            render: (_, row) => (
              <span className="data-table-actions">
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    const cur = getBookmarkLabel(row.filename, row.pdfPage);
                    const next = window.prompt(
                      "Tên gợi nhớ cho bookmark:",
                      cur || `Trang ${row.bookPage}`,
                    );
                    if (next !== null) {
                      setBookmarkLabel(row.filename, row.pdfPage, next);
                      setTick((t) => t + 1);
                    }
                  }}
                  title="Đổi tên"
                  aria-label="Đổi tên"
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => onOpenBook(row.book, row.pdfPage)}
                >
                  <BookmarkCheck size={12} /> Mở
                </button>
                <button
                  className="btn btn-danger btn-xs"
                  onClick={() => onRemove(row.filename, row.pdfPage)}
                  title="Bộ đánh dấu"
                  aria-label="Bộ đánh dấu"
                >
                  <X size={12} />
                </button>
              </span>
            ),
          },
        ]}
        data={rows}
        keyField="id"
        emptyText="Chưa có đánh dấu"
        onRowClick={(row) => onOpenBook(row.book, row.pdfPage)}
      />
      <div className="ui-s-e4c77a">
        {fileNames.map((fn) => {
          const book = byFilename.get(fn);
          return (
            <button
              key={fn}
              className="btn btn-secondary btn-xs"
              onClick={() => onClearFile(fn)}
            >
              <Trash2 size={12} /> Xóa hết {book.title.slice(0, 18)} (
              {bookmarksMap[fn].length})
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VocabView({
  vocab,
  books,
  geminiKey,
  onOpenBook,
  onRemove,
  onClear,
  onUpdateMeaning,
  onChanged,
}) {
  const [query, setQuery] = useState("");
  const [explainingId, setExplainingId] = useState(null);

  const byFilename = useMemo(
    () => new Map(books.map((b) => [b.filename, b])),
    [books],
  );

  const autoFillVocab = () => {
    const n = fillSampleVocab(books);
    onChanged();
    alert(
      n
        ? `Đã thêm ${n} từ vựng mẫu vào sổ tay.`
                : "Không thêm mới: các từ mẫu đã có sẵn trong sổ tay rồi.",
    );
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? vocab.filter(
          (v) =>
            v.word.toLowerCase().includes(q) ||
            (v.meaning || "").toLowerCase().includes(q),
        )
      : vocab;
  }, [vocab, query]);

  const explainAgain = async (entry) => {
    if (!geminiKey || explainingId) return;
    setExplainingId(entry.id);
    try {
      const text = await aiService.callAI({
        apiKey: geminiKey,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Giải nghĩa từ/cụm từ sau để giáo viên có thể giải thích cho học sinh tiểu học lớp ${entry.grade || 1}: "${entry.word}". Ngắn gọn 2-3 câu, dùng văn phong gần gũi, thêm emoji. Giải thích theo góc nhìn giáo viên.`,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: "Bạn là trợ lý từ điển hỗ trợ giáo viên giải thích từ vựng cho học sinh tiểu học.",
            },
          ],
        },
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        timeout: 60000,
        maxRetries: 2,
        requestId: `vocab_${entry.id}`,
      });
      if (text) {
        onUpdateMeaning(entry.id, text.trim());
        onChanged();
      }
    } catch (e) {
      alert(
        getFriendlyErrorMessage(e.status, e.message) || "Không thể giải nghĩa.",
      );
    } finally {
      setExplainingId(null);
    }
  };

  if (!vocab.length) {
    return (
      <div className="dash-empty">
        <NotebookPen size={46} />
        <p>
          Chưa có từ vựng nào. Hãy bôi đen từ trong sách và chọn “Lưu từ vựng”, hoặc
          bấm nút “Thêm mẫu” bên dưới.
        </p>
        <button className="btn btn-primary" onClick={autoFillVocab}>
          Thêm mẫu
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="data-table-toolbar">
        <div className="data-table-toolbar-left">
          <div className="search-input-wrapper ui-s-903b9c">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              className="search-input"
              placeholder="Tìm từ / nghĩa…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Tìm từ vựng"
            />
            {query && (
              <button
                className="search-clear"
                onClick={() => setQuery("")}
                aria-label="Xóa"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <span className="ui-s-1f9717">
            {filtered.length}/{vocab.length} t?
          </span>
        </div>
        <div className="data-table-toolbar-right">
          <button className="btn btn-secondary btn-xs" onClick={autoFillVocab}>
            Tự động làm
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => {
              if (confirm("Xóa toàn bộ sổ tay?")) {
                onClear();
                onChanged();
              }
            }}
          >
            <Trash2 size={12} /> Xóa hết
          </button>
        </div>
      </div>
      <DataTable
        columns={[
          {
            key: "word",
            label: "Từ",
            sortable: true,
            render: (v) => <span className="ui-s-0dbc82">{v}</span>,
          },
          {
            key: "meaning",
            label: "Nghĩa / ghi chú",
            render: (v, row) =>
              v ? (
                <span className="cell-clamp" title={v}>
                  {v}
                </span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: "file",
            label: "Sách",
            hideOnMobile: true,
            render: (v) =>
              v ? (
                <span className="ui-s-ec599c">
                  {(byFilename.get(v)?.title || v).slice(0, 24)}
                </span>
              ) : (
                "—"
              ),
          },
          {
            key: "page",
            label: "Trang",
            width: "80px",
            align: "right",
            sortable: true,
            hideOnMobile: true,
            render: (v) => (v ? String(Math.max(1, v - 1)) : "—"),
          },
          {
            key: "_actions",
            label: "Thao tác",
            width: "200px",
            align: "right",
            render: (_, row) => (
              <span className="data-table-actions">
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    const b = byFilename.get(row.file);
                    if (b) onOpenBook(b, row.page || 1);
                  }}
                  title={row.file ? "Mở sách" : "Từ vựng thủ công • chưa gắn sách"}
                  disabled={!row.file}
                >
                  <BookOpen size={12} />
                </button>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => explainAgain(row)}
                  disabled={!!explainingId || !geminiKey}
                  title={
                    geminiKey ? "Giải nghĩa lại bằng AI" : "Cần cấu hình Gemini"
                  }
                >
                  {explainingId === row.id ? (
                    "..."
                  ) : (
                    <>
                      <Sparkles size={12} /> Giải nghĩa
                    </>
                  )}
                </button>
                <button
                  className="btn btn-danger btn-xs"
                  onClick={() => {
                    onRemove(row.id);
                    onChanged();
                  }}
                  title="Xóa"
                  aria-label="Xóa"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ),
          },
        ]}
        data={filtered}
        keyField="id"
        emptyText={
          query ? `Không tìm thấy kết quả cho "${query}"` : "Chưa có dữ liệu"
        }
        emptyHint={query ? "Hãy thay đổi từ khóa." : ""}
      />
    </div>
  );
}

function StatsView({
  books,
  counts,
  lastPageMap,
  lastTotalMap,
  favs,
  quizHistory,
  onReset,
  onOpenBook,
  onSampleQuiz,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterFav, setFilterFav] = useState(false);
  const [filterProgress, setFilterProgress] = useState("all");
  const [rowSort, setRowSort] = useState("count"); // count | pct | title | quizAvg

  const totalBooks = books.length;
  const openedBooks = Object.keys(counts).filter((k) => (counts[k] || 0) > 0);
  const totalOpened = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
  const totalPagesRead = books.reduce(
    (a, b) => a + bookProgress(b.filename, lastPageMap, lastTotalMap).page,
    0,
  );
  const totalFavs = favs.length;

  // Tính toán thống kê luyện tập theo từng cuốn sách
  const quizStatsByBook = quizHistory.reduce((acc, r) => {
    if (!acc[r.file]) {
      acc[r.file] = { count: 0, totalScore: 0, totalQuestions: 0 };
    }
    acc[r.file].count += 1;
    acc[r.file].totalScore += r.score || 0;
    acc[r.file].totalQuestions += r.total || 0;
    return acc;
  }, {});

  // Dữ liệu bảng thống kê tổng hợp (sách + luyện tập) • theo chuẩn readingProgress.js
  const allRows = books
    .map((b) => {
      const { page: lp, total, pct } = bookProgress(b.filename, lastPageMap, lastTotalMap);
      const c = counts[b.filename] || 0;
      const isFav = favs.includes(b.filename);

      // Thống kê luyện tập cho cuốn sách này
      const quizStats = quizStatsByBook[b.filename] || {
        count: 0,
        totalScore: 0,
        totalQuestions: 0,
      };
      const quizAvg =
        quizStats.totalQuestions > 0
          ? Math.round((quizStats.totalScore / quizStats.totalQuestions) * 100)
          : 0;

      return {
        book: b,
        count: c,
        lastPage: lp,
        totalPages: total,
        pct,
        status: pct >= 100 ? READ_STATUS.DONE : pct > 0 ? READ_STATUS.READING : READ_STATUS.UNREAD,
        isFav,
        quizCount: quizStats.count,
        quizAvg: quizAvg,
        totalCorrect: quizStats.totalScore,
      };
    })
    .sort((a, b) => b.count - a.count || b.lastPage - a.lastPage);

  // Lọc dữ liệu theo các tiêu chí
  const filteredRows = allRows.filter((row) => {
    // Tìm kiếm theo tên sách, môn học
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      row.book.subject.toLowerCase().includes(searchLower) ||
      row.book.title.toLowerCase().includes(searchLower) ||
      `${row.book.grade}. ${row.book.subject}`
        .toLowerCase()
        .includes(searchLower);

    // Lọc theo môn học
    const matchesSubject =
      filterSubject === "all" || row.book.subject === filterSubject;

    // Lọc theo lớp
    const matchesGrade =
      filterGrade === "all" || row.book.grade === filterGrade;

    // Lọc theo yêu thích
    const matchesFav = !filterFav || row.isFav;

    // Lọc theo tiến để (chuẩn readingProgress.js)
    let matchesProgress = true;
    if (filterProgress === "notStarted") matchesProgress = row.status === READ_STATUS.UNREAD;
    else if (filterProgress === "inProgress") matchesProgress = row.status === READ_STATUS.READING;
    else if (filterProgress === "completed") matchesProgress = row.status === READ_STATUS.DONE;

    return (
      matchesSearch &&
      matchesSubject &&
      matchesGrade &&
      matchesFav &&
      matchesProgress
    );
  });

  // Lấy danh sách môn học và lớp để lọc
  const subjects = [...new Set(books.map((b) => b.subject))].sort();
  const grades = [...new Set(books.map((b) => b.grade))].sort((a, b) => a - b);

  // tổng hợp luyện tập toàn kho + Sắp xếp hàng theo chặn lựa
  const quizTotals = useMemo(() => quizHistory.reduce(
    (s, r) => ({ n: s.n + 1, score: s.score + (r.score || 0), total: s.total + (r.total || 0) }),
    { n: 0, score: 0, total: 0 },
  ), [quizHistory]);
  const quizAvgAll = quizTotals.total > 0 ? Math.round((quizTotals.score / quizTotals.total) * 100) : 0;
  const statusCounts = useMemo(() => {
    const c = { notStarted: 0, reading: 0, completed: 0 };
    allRows.forEach((r) => {
      if (r.status === READ_STATUS.DONE) c.completed += 1;
      else if (r.status === READ_STATUS.READING) c.reading += 1;
      else c.notStarted += 1;
    });
    return c;
  }, [allRows]);
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    if (rowSort === "pct") arr.sort((a, b) => b.pct - a.pct);
    else if (rowSort === "title") arr.sort((a, b) => String(a.book.title || "").localeCompare(String(b.book.title || ""), "vi"));
    else if (rowSort === "quizAvg") arr.sort((a, b) => b.quizAvg - a.quizAvg);
    else arr.sort((a, b) => b.count - a.count || b.lastPage - a.lastPage);
    return arr;
  }, [filteredRows, rowSort]);
  return (
    <div className="stx-root">
      <style>{`
        .stx-root { display:flex; flex-direction:column; gap:13px; }
        .stx-head { background:linear-gradient(135deg, rgba(45,115,255,0.09), rgba(139,92,246,0.07)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:11px; }
        .stx-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .stx-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .stx-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #2d73ff)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #2d73ff) 35%, transparent); }
        .stx-actions { display:flex; gap:8px; margin-left:auto; flex-wrap:wrap; align-items:center; }
        .stx-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(128px, 1fr)); gap:9px; }
        .stx-kpi { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); }
        .stx-kpi-ic { width:37px; height:37px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; background:var(--color-action-soft, var(--primary-light)); }
        .stx-kpi-val { font-size:1.12rem; font-weight:800; color:var(--text-dark); line-height:1.1; }
        .stx-kpi-label { font-size:10.5px; color:var(--text-muted); font-weight:600; }
        .stx-toolbar { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 13px; display:flex; flex-direction:column; gap:9px; }
        .stx-trow { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .stx-search { flex:1 1 200px; min-width:170px; position:relative; }
        .stx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .stx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .stx-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; display:inline-flex; }
        .stx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .stx-check { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#475569; cursor:pointer; border:1px solid #e2e8f0; border-radius:999px; padding:6px 12px; background:#fff; }
        .stx-check.on { background:var(--color-action-soft, #eff6ff); border-color:var(--color-action, #2d73ff); color:var(--color-action-strong, #1d4ed8); }
        .stx-count { font-size:12px; color:var(--text-muted); }
        .stx-count strong { color:var(--text-dark); }
        .stx-charts { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; }
        .stx-card { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:13px 14px; }
        .stx-card h4 { margin:0 0 10px; font-size:0.9rem; color:var(--text-dark); display:flex; align-items:center; gap:7px; }
        .stx-bar-row { display:grid; grid-template-columns:110px 1fr 34px; gap:9px; align-items:center; font-size:12px; margin-bottom:7px; }
        .stx-track { height:9px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; }
        .stx-fill { height:100%; border-radius:99px; min-width:3px; }
        .stx-bar-val { font-weight:800; color:var(--text-dark); text-align:right; }
        .stx-segbar { display:flex; height:12px; border-radius:99px; overflow:hidden; border:1px solid var(--border-color); margin:10px 0 4px; }
        .stx-segbar i { display:block; height:100%; }
        .stx-legend { display:flex; gap:12px; flex-wrap:wrap; font-size:11.5px; color:var(--text-muted); }
        .stx-legend b { color:var(--text-dark); }
        .stx-dot { display:inline-block; width:9px; height:9px; border-radius:99px; margin-right:5px; }
        .stx-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:10px; }
        .stx-book { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 12px; cursor:pointer; transition:border-color 0.14s ease, box-shadow 0.14s ease; }
        .stx-book:hover { border-color:var(--color-action, var(--primary)); box-shadow:0 8px 20px rgba(15,23,42,0.09); }
        .stx-book-top { display:flex; gap:9px; align-items:flex-start; }
        .stx-book-cover { width:44px; flex-shrink:0; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); }
        .stx-book-cover .book-cover { overflow:hidden; }
        .stx-book-cover .book-cover div { font-size:0; }
        .stx-book-t { margin:0; font-size:0.85rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .stx-book-m { font-size:11px; color:var(--text-muted); }
        .stx-pbar { height:8px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; margin-top:8px; }
        .stx-pbar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, var(--primary)); }
        .stx-book-stats { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .stx-chip { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; background:#f8fafc; border:1px solid #e2e8f0; color:#475569; display:inline-flex; align-items:center; gap:4px; }
        .stx-chip.good { background:#f0fdf4; border-color:#bbf7d0; color:#15803d; }
        .stx-chip.warn { background:#fffbeb; border-color:#fde68a; color:#b45309; }
        .stx-chip.act { background:var(--color-action-soft, #eff6ff); border-color:var(--color-action-soft, #dbeafe); color:var(--color-action-strong, #1d4ed8); }
        .stx-book-foot { display:flex; gap:6px; margin-top:9px; align-items:center; }
        .stx-open { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:800; padding:7px 10px; border-radius:9px; border:none; background:var(--color-action, var(--primary)); color:#fff; cursor:pointer; }
        .stx-icobtn { width:31px; height:31px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; }
        .stx-icobtn:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .stx-empty { text-align:center; padding:34px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
      `}</style>

      {/* Header + KPI */}
      <div className="stx-head">
        <div className="stx-title-row">
          <h3 className="stx-title"><span className="stx-title-ic">📊</span> Thống kê tổng quan</h3>
          <div className="stx-actions">
            <SampleButton label="Tự động làm" size="xs" onRun={onSampleQuiz}
              hint="Thêm 2 kết quả luyện tập trắc nghiệm mẫu để xem thống kê hoạt động." />
            <button className="btn btn-secondary btn-xs" onClick={onReset}><Trash2 size={13} /> Đặt lại</button>
          </div>
        </div>
        <div className="stx-kpis">
          <div className="stx-kpi"><span className="stx-kpi-ic">📚</span><span><span className="stx-kpi-val">{totalBooks}</span><br /><span className="stx-kpi-label">Sách</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">📖</span><span><span className="stx-kpi-val">{totalOpened}</span><br /><span className="stx-kpi-label">Lượt mở</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">📄</span><span><span className="stx-kpi-val">{totalPagesRead}</span><br /><span className="stx-kpi-label">Trang đã đọc</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">❤️</span><span><span className="stx-kpi-val">{totalFavs}</span><br /><span className="stx-kpi-label">Yêu thích</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">📝</span><span><span className="stx-kpi-val">{quizTotals.n}</span><br /><span className="stx-kpi-label">Bài luyện tập</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">⭐</span><span><span className="stx-kpi-val">{quizAvgAll}%</span><br /><span className="stx-kpi-label">Điểm TB</span></span></div>
        </div>
      </div>

          {/* Bộ lọc và tìm kiếm */}
      <div className="stx-toolbar">
        <div className="stx-trow">
          <div className="stx-search">
            <Search size={15} />
            <input type="text" placeholder="Tìm tên sách, môn…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Tìm sách" />
            {searchQuery && <button className="stx-search-clear" onClick={() => setSearchQuery("")} aria-label="Xóa tìm kiếm"><X size={13} /></button>}
          </div>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} aria-label="Lọc môn">
            <option value="all">Mọi môn</option>
            {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
          <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} aria-label="Lọc lớp">
            <option value="all">Mọi lớp</option>
            {grades.map((grade) => <option key={grade} value={grade}>Lớp {grade}</option>)}
          </select>
          <select value={filterProgress} onChange={(e) => setFilterProgress(e.target.value)} aria-label="Lọc tiến để">
            <option value="all">Mọi tiến độ</option>
            <option value="notStarted">Chưa bắt đầu</option>
            <option value="inProgress">Đang đọc</option>
            <option value="completed">Đã hoàn thành</option>
          </select>
          <select value={rowSort} onChange={(e) => setRowSort(e.target.value)} aria-label="Sắp xếp" title="Sắp xếp">
            <option value="count">Lượt mở ?</option>
            <option value="pct">Tiến để ?</option>
            <option value="quizAvg">Điểm TB ?</option>
            <option value="title">Tên A→Z</option>
          </select>
          <button className={`stx-check${filterFav ? " on" : ""}`} onClick={() => setFilterFav((v) => !v)} aria-pressed={filterFav}>
            {filterFav ? <Check size={13} /> : <Star size={13} />} Yêu thích
          </button>
        </div>
        <div className="stx-count">Hiển thị <strong>{filteredRows.length}/{allRows.length}</strong> sách</div>
      </div>

          {/* Biểu đồ thống kê */}
      <div className="stx-charts">
        <div className="stx-card">
          <h4>📊 Lượt mở theo môn học</h4>
          {subjects.slice(0, 6).map((subject) => {
            const totalReads = allRows
              .filter((row) => row.book.subject === subject)
              .reduce((sum, row) => sum + row.count, 0);
            const maxReads = Math.max(
              1,
              ...subjects.map((s) =>
                allRows
                  .filter((row) => row.book.subject === s)
                  .reduce((sum, row) => sum + row.count, 0),
              ),
            );
            return (
              <div key={subject} className="stx-bar-row">
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{subject}</span>
                <span className="stx-track"><span className="stx-fill" style={{ width: `${(totalReads / maxReads) * 100}%`, background: "var(--color-action, var(--primary))" }} /></span>
                <span className="stx-bar-val">{totalReads}</span>
              </div>
            );
          })}
        </div>

        <div className="stx-card">
          <h4>📈 Tiến độ đọc (đồng bộ toàn app)</h4>
          <div className="stx-legend">
            <span><i className="stx-dot" style={{ background: "#cbd5e1" }} />Chưa bắt đầu <b>{statusCounts.notStarted}</b></span>
            <span><i className="stx-dot" style={{ background: "var(--color-action, var(--primary))" }} />Đang đọc <b>{statusCounts.reading}</b></span>
            <span><i className="stx-dot" style={{ background: "#16a34a" }} />hoàn thành <b>{statusCounts.completed}</b></span>
          </div>
          {allRows.length > 0 && (
            <div className="stx-segbar" role="img" aria-label={`Chưa bắt đầu ${statusCounts.notStarted}, đang đọc ${statusCounts.reading}, hoàn thành ${statusCounts.completed}`}>
              <i style={{ width: `${(statusCounts.notStarted / allRows.length) * 100}%`, background: "#cbd5e1" }} />
              <i style={{ width: `${(statusCounts.reading / allRows.length) * 100}%`, background: "var(--color-action, var(--primary))" }} />
              <i style={{ width: `${(statusCounts.completed / allRows.length) * 100}%`, background: "#16a34a" }} />
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            {totalPagesRead} trang đã đọc • {totalOpened} Lượt mở sách
          </div>
        </div>
      </div>

      {/* Th? từng sách */}
      {sortedRows.length === 0 ? (
        <div className="stx-empty">
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>Không tìm thấy sách phù hợp</p>
          <p style={{ margin: 0, fontSize: 12 }}>Hãy thay đổi bộ lọc hoặc tìm kiếm.</p>
        </div>
      ) : (
        <div className="stx-grid">
          {sortedRows.map((row) => (
            <article key={row.book.filename} className="stx-book" role="button" tabIndex={0}
              onClick={() => onOpenBook(row.book)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenBook(row.book); } }}
              title={`Mở sách ${row.book.title}`} aria-label={`Mở sách ${row.book.title}`}>
              <div className="stx-book-top">
                <span className="stx-book-cover">
                  <BookCover book={row.book} lastPage={lastPageMap[row.book.filename] || 0} numPages={lastTotalMap[row.book.filename] || 0} height={62} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="stx-book-t" title={row.book.title}>
                    {row.isFav && <Star size={12} style={{ color: "#f59e0b", verticalAlign: -1 }} fill="#f59e0b" />} {row.book.title}
                  </span><br />
                  <span className="stx-book-m">Lớp {row.book.grade} • {row.book.subject} • Tập {row.book.term}</span>
                </span>
              </div>
              <div className="stx-pbar" aria-label={`Tiến độ ${row.pct}%`}>
                <i style={{ width: `${row.pct}%`, background: row.pct >= 100 ? "#16a34a" : "var(--color-action, var(--primary))" }} />
              </div>
              <div className="stx-book-stats">
                <span className="stx-chip act">📖 {row.pct}% • Tr.{row.lastPage}/{row.totalPages}</span>
                <span className="stx-chip">📚 {row.count} Lượt mở</span>
                {row.quizCount > 0
                  ? <span className={`stx-chip ${row.quizAvg >= 60 ? "good" : "warn"}`}>📝 {row.quizCount} bài • TB {row.quizAvg}%</span>
                  : <span className="stx-chip">Chưa luyện tập</span>}
              </div>
              <div className="stx-book-foot">
                <button className="stx-open" onClick={(e) => { e.stopPropagation(); onOpenBook(row.book); }}><BookOpen size={13} /> Mở sách</button>
                <button className="stx-icobtn" onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Đặt lại thống kê cho "${row.book.title}"?`)) {
                      const newCounts = { ...counts };
                      newCounts[row.book.filename] = 0;
                      try {
                        const res = safeSetJSON("sgk_counts", newCounts);
                        if (!res.ok && res.quota) { alert("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy"); console.warn("Quota sgk_counts"); }
                        else if (!res.ok) { console.warn("[App] safeSetJSON failed sgk_counts:", res.error); }
                      } catch (e) { console.warn("[App] safeSetJSON exception sgk_counts:", e); }
                      window.location.reload();
                    }
                  }} title="Đặt lại thống kê cuốn này" aria-label="Đặt lại thống kê"><RotateCcw size={13} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// HelpView moved to src/HelpView.jsx • interactive, module-by-module guide
