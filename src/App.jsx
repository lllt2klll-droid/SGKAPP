import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  lazy,
  useRef,
} from "react";
import { apiUrl, getApiBase, writeHeaders } from "./services/apiConfig.js";
import { getBreadcrumb as getBreadcrumbCore, buildNavSections as buildNavSectionsCore, getFooterNav, normalizeExpandedKeys as normalizeExpandedKeysCore } from "./core/navigationRegistry.js";
import { appEvents as appEventsCore, AppEvents as AppEventsCore } from "./core/appEvents.js";
import { BookProvider } from "./core/bookContext.js";
import { VIEW_REGISTRY, getViewEntry } from "./core/viewRegistry.js";
import { toFriendlyError } from "./core/errors.js";
import TextBookModal from "./reader/TextBookModal.jsx";
import { storageNoticeLevel, storageNoticeText } from "./data/storageNotice.js";
import { APP_COPYRIGHT } from "./ai/appPersona.js";
import { preventWindowDrop } from "./components/fileDropzoneUtils.js";

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
          // Thử cập nhật SW rồi reload một lần
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
import { getShortcut, matchesShortcut } from "./services/keyboardShortcuts.js";
import { bookProgress, READ_STATUS } from "./reader/readingProgress.js";
import {
  PRIMARY_SUBJECTS,
  syncCatalogWithBooks,
} from "./data/subjectCatalog.js";
import {
  Settings,
  Search,
  Download,
  BookOpen,
  RefreshCw,
  X,
  Plus,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Trash2,
  DatabaseBackup,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Maximize,
  Minimize,
} from "lucide-react";
const BookReader = lazyWithRetry(() => import("./reader/BookReader.jsx"));
// P1 • view Từ điển đã gộp vào VocabView (tab Tra cứu); panel khi đọc vẫn dùng
// GlossaryPanel trực tiếp trong BookReader, không qua App nữa.
const LobbyBubble = lazyWithRetry(() =>
  import("./views/UtilityBubble.jsx").then((module) => ({ default: module.LobbyBubble })),
);
const SearchView = lazyWithRetry(() => import("./views/SearchView.jsx"));
const CompareView = lazyWithRetry(() => import("./views/CompareView.jsx"));
const MatrixView = lazyWithRetry(() => import("./views/MatrixView.jsx"));
const DashboardView = lazyWithRetry(() => import("./views/DashboardView.jsx"));
const IdeasView = lazyWithRetry(() => import("./views/IdeasView.jsx"));
const InternshipView = lazyWithRetry(() => import("./views/InternshipView.jsx"));
import GlobalSearch from "./views/GlobalSearch.jsx";
const LangStatsView = lazyWithRetry(() => import("./views/LangStatsView.jsx"));
const InventoryView = lazyWithRetry(() => import("./views/InventoryView.jsx"));
const CollectionsView = lazyWithRetry(() => import("./views/CollectionsView.jsx"));
const ReferencesView = lazyWithRetry(() => import("./views/ReferencesView.jsx"));
const ActivitiesView = lazyWithRetry(() => import("./views/ActivitiesView.jsx"));
const QuestionBankView = lazyWithRetry(() => import("./views/QuestionBankView.jsx"));
const WorksheetsView = lazyWithRetry(() => import("./views/WorksheetsView.jsx"));
const DataToolsView = lazyWithRetry(() => import("./views/DataToolsView.jsx"));
const WebToolboxView = lazyWithRetry(() => import("./views/WebToolboxView.jsx"));
const WhiteboardView = lazyWithRetry(() => import("./whiteboard/WhiteboardView.jsx"));
import { getQuestions } from "./data/teachingDB.js";
import { getPlans as getKhbdV2Plans } from "./khbd/planModel.js";
import { getClips, countMarks } from "./data/researchDB.js";
import { saveJSON, exportBackup } from "./data/storage.js";
import { moveToTrash, takeFromTrash, listTrash, listTrashByType, removeBooksFromTrashByFilename, TRASH_TYPE, TRASH_TTL_DAYS } from "./data/trashStore.js";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove } from "./safeStorage.js";
import VocabView from "./views/VocabView.jsx";
import BookmarksNotesView from "./views/BookmarksNotesView.jsx";
import AssistantBubble from "./ai/AssistantBubble.jsx";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import { fillSampleQuiz } from "./data/sampleData.js";
import MissionWidget from "./views/MissionWidget.jsx";
import SettingsCenter from "./views/SettingsCenter.jsx";
import { loadSettings, saveSettings, applySettings, getStartPage, recordLastView, shouldConfirmDelete, shouldShowNotifications, vibrateFeedback, refreshNotificationTimer, updateSettings } from "./services/settingsStore.js";
import {
  ensureTodayMissions,
  evaluateStreakOnDate,
  todayStr,
  migrateMissions,
} from "./data/missionStore.js";
import { emitBookOpened } from "./data/missionEvents.js";
import {
  getAllBookmarks,
  removeBookmark,
  clearBookmarksForFile,
  getVocab,
  removeVocabEntry,
  clearVocab,
  updateVocabMeaning,
  updateVocabEntry,
  addVocabEntry,
  getQuizHistory,
  clearQuizHistory,
  clearLastPages,
} from "./data/userdata.js";
import { getGeminiApiKey } from "./data/storage.js";
import { formatSuggestedBookTitle } from "./reader/bookUtils.js";
import { pdfjsLib } from "./reader/pdfjs-config.js";
import { buildIndex, needsRebuild, getIndexMeta } from "./data/searchIndex.js";
import { useFocusTrap } from "./ui/useFocusTrap.js";
import LibraryView from "./views/LibraryView.jsx";
import ContinueView from "./views/ContinueView.jsx";
import StatsView from "./views/StatsView.jsx";
import BatchUploadDialog from "./components/BatchUploadDialog.jsx";
import {
  BATCH_CHUNK_SIZE,
  BATCH_MAX_FILES,
  batchResultSummary,
  buildBatchItems,
  canLinkAll,
  chunkItems,
  sanitizeBatchTitle,
} from "./views/batchUpload.js";

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
  libFilters: "sgk_lib_filters", // { search, grade, subject, term, reading, favOnly }
  lastPage: (f) => `lastPage_${f}`,
  lastTotal: (f) => `lastTotal_${f}`,
};

function loadJSON(key, fallback) {
  return safeGetJSON(key, fallback);
}

// Đọc filter thư viện đã lưu (có validate để dữ liệu cũ/hỏng không làm vỡ UI)
function loadLibFilters() {
  const d = safeGetJSON(LS.libFilters, null);
  if (!d || typeof d !== "object" || Array.isArray(d)) return {};
  const out = {};
  if (typeof d.search === "string" && d.search.trim()) out.search = d.search.slice(0, 200);
  if (d.grade === null || [1, 2, 3, 4, 5].includes(d.grade)) out.grade = d.grade;
  if (d.subject === null || (typeof d.subject === "string" && d.subject.trim())) out.subject = d.subject;
  if (d.term === null || [1, 2].includes(d.term)) out.term = d.term;
  if (d.reading === null || ["reading", "completed", "unread"].includes(d.reading)) out.reading = d.reading;
  if (typeof d.favOnly === "boolean") out.favOnly = d.favOnly;
  return out;
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

const BOOK_INFO_SUBJECTS = [...new Set([...PRIMARY_SUBJECTS, "Khác"])];
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

  handleSafeHome = () => {
    // Về thư viện an toàn KHÔNG reload (giữ dữ liệu soạn thảo chưa lưu ở view khác)
    try { this.props.onSafeHome?.(); } catch {}
    this.setState({ hasError: false, error: null });
  };

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
          {isChunk && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: -4 }}>Chi tiết: {rawMsg.slice(0, 180)}</p>}
          {!isChunk && friendly.recoverable === false && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Mã lỗi: {String(friendly.type || "").slice(0,60)}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
            {this.props.onSafeHome && <button onClick={this.handleSafeHome} className="btn btn-primary">Về thư viện an toàn</button>}
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
  const [openRequestId, setOpenRequestId] = useState(0);
  // Tang mỗi khi sách đang mở được sửa/lưu (TextBookModal) để BookReader tải lại nội dung mới
  const [bookContentNonce, setBookContentNonce] = useState(0);

  // Dashboard state — trang mở đầu tuân theo Cài đặt → Tổng quan → Trang mở mặc định
  // P1 • "glossary" bản cũ gộp vào vocab (tab Tra cứu) nên map về vocab tại đây
  const [view, setView] = useState(() => {
    try {
      const s = getStartPage();
      // P1 "glossary" → vocab (tab Tra cứu) • P2 "concepts" → vocab (đã gộp, dữ liệu migrate 1 lần)
      return s === "glossary" || s === "concepts" ? "vocab" : s;
    } catch { return "dashboard"; }
  }); // dashboard | library | continue | marks | vocab | stats | help | search | compare | matrix | langstats | inventory | collections | references | lessonplans | activities | worksheets | questionbank | datatools
  // Ghi nhớ trang cuối để "Lần cuối đã mở" hoạt động
  useEffect(() => { try { recordLastView(view); } catch {} }, [view]);
  // Deep-link nhẹ qua hash (#/library…): refresh giữ view, chia sẻ link được.
  // Dùng replaceState để không spam history (nút Back browser vẫn thoát như cũ).
  const [unknownView, setUnknownView] = useState("");
  useEffect(() => {
    try {
      const h = String(window.location.hash || "").replace(/^#\/?/, "").split(/[?/]/)[0];
      if (h && h !== view && typeof getViewEntry === "function" && getViewEntry(h)) {
        setView(h);
      } else if (h && typeof getViewEntry === "function" && !getViewEntry(h) && !["library", "dashboard"].includes(h)) {
        setUnknownView(h);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      const cur = String(window.location.hash || "");
      if (cur !== `#/${view}`) window.history.replaceState(null, "", `#/${view}`);
    } catch {}
  }, [view]);
  // Banner offline: PWA chạy local nhưng AI/fetch URL cần mạng
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine !== false : true));
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Tự động kiểm tra bản cập nhật mới khi mở ứng dụng (sau 3.5 giây)
  const [appUpdateNotice, setAppUpdateNotice] = useState(null);
  const [appUpdateDialogOpen, setAppUpdateDialogOpen] = useState(false);
  const [desktopUpdateStatus, setDesktopUpdateStatus] = useState({ status: "idle" });
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl("/api/update/check"));
        if (res.ok) {
          const data = await res.json();
          const pendingUpdate = safeGetJSON("sgk_pending_app_update", null);
          if (pendingUpdate?.version && pendingUpdate.version === data?.currentVersion) {
            safeRemove("sgk_pending_app_update");
            setAppUpdateNotice({
              ...data,
              hasUpdate: false,
              justUpdated: true,
              latestVersion: pendingUpdate.version,
              changelog: pendingUpdate.changelog || data.changelog || [],
            });
            setAppUpdateDialogOpen(true);
          } else if (data?.hasUpdate) {
            setAppUpdateNotice(data);
          }
        }
      } catch {}
    }, 3500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    return window.sgkUpdater?.onStatus((status) => {
      setDesktopUpdateStatus(status);
      if (status.status === "downloaded") setAppUpdateDialogOpen(true);
    });
  }, []);

  const startAppUpdate = async () => {
    setAppUpdateDialogOpen(true);
    setDesktopUpdateStatus({ status: "checking" });
    if (!window.sgkUpdater) {
      setDesktopUpdateStatus({
        status: "unsupported",
        message: "Tự cập nhật chỉ khả dụng trong ứng dụng Windows đã cài đặt.",
      });
      return;
    }
    try {
      const result = await window.sgkUpdater.checkForUpdates();
      if (!result?.supported) {
        setDesktopUpdateStatus({ status: "unsupported", message: result?.message || "Không thể tự cập nhật phiên bản này." });
        return;
      }
      if (result.downloaded) {
        setDesktopUpdateStatus({ status: "downloaded", version: result.version });
        return;
      }
      if (!result.available) {
        setDesktopUpdateStatus({ status: "not-available" });
        return;
      }
      await window.sgkUpdater.downloadUpdate();
    } catch (error) {
      setDesktopUpdateStatus({ status: "error", message: error?.message || "Không thể tải bản cập nhật." });
    }
  };

  const installDownloadedUpdate = async () => {
    const saved = safeSetJSON("sgk_pending_app_update", {
      version: appUpdateNotice?.latestVersion || desktopUpdateStatus.version,
      changelog: appUpdateNotice?.changelog || [],
    });
    if (!saved.ok) {
      console.warn("[App] Could not save pending update notice:", saved.error);
    }
    try {
      await window.sgkUpdater?.installUpdate();
    } catch (error) {
      setDesktopUpdateStatus({ status: "error", message: error?.message || "Không thể khởi động trình cài đặt." });
    }
  };

  const openUpdateReleases = async () => {
    try {
      if (window.sgkUpdater?.openReleases) {
        await window.sgkUpdater.openReleases();
      } else if (appUpdateNotice?.downloadUrl) {
        window.open(appUpdateNotice.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setDesktopUpdateStatus({ status: "error", message: error?.message || "Không thể mở trang tải bản Setup." });
    }
  };
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
    // assessment-group, research-group, notebook-group, advanced-group, work, webtools-section).
    // Trước đây key là LABEL tiếng Việt, và bản cũ từng ghi nhầm mất dấu ra localStorage
    // ("TRANG CH?", "CÔNG C? NÂNG CAO") nên: (a) không khớp id đang lưu trong localStorage
    // -> trạng thái thu/mở mất sau mỗi reload, (b) nhóm "Thư viện SGK" luôn bị thu gọn.
    const defaults = {
      workspace: true,
      "library-group": true,
      "teaching-group": true,
      "assessment-group": false,
      "research-group": false,
      "notebook-group": true,
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
  const [settingsSection, setSettingsSection] = useState("overview");
  const openSettings = (section = "overview") => {
    setSettingsSection(section);
    setShowSettings(true);
  };
  const [settingsState, setSettingsState] = useState(() => loadSettings());
  const autoIndexedBooksRef = useRef(new Set());
  const [uploadingBook, setUploadingBook] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  // B3 • Nút "Hoàn tác" 6s đi kèm thông báo đưa sách vào Thùng rác
  const [noticeUndo, setNoticeUndo] = useState(null); // { text, run }
  const [uploadError, setUploadError] = useState("");
  const [uploadDraft, setUploadDraft] = useState(null);
  const [batchUpload, setBatchUpload] = useState(null);
  const batchAbortRef = useRef(null);
  const [uploadThumb, setUploadThumb] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const uploadInputRef = useRef(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [editingTextBook, setEditingTextBook] = useState(null);
  const [lpOpenId, setLpOpenId] = useState(null);
  const [readerReturnTarget, setReaderReturnTarget] = useState(null);
  // Từ khóa lọc sổ tay từ vựng khi được mở từ Tìm kiếm toàn cục
  const [vocabQuery, setVocabQuery] = useState("");
  // tinh tế: thay confirm/prompt bằng modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  // A2 • số mục trong Thùng rác → badge ở mục "Dữ liệu & sao lưu"
  const [trashCount, setTrashCount] = useState(() => {
    try { return listTrash().length; } catch { return 0; }
  });
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameGrade, setRenameGrade] = useState(1);
  const [renameSubject, setRenameSubject] = useState("Khác");
  const [renameTerm, setRenameTerm] = useState(1);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlBooks, setUrlBooks] = useState([]);
  // Bẫy focus cho 3 modal (Tab xoay vòng, Escape đóng, trả focus)
  const deleteTrapRef = useFocusTrap(!!deleteTarget, () => setDeleteTarget(null));
  const renameTrapRef = useFocusTrap(!!renameTarget, () => { if (!renameSaving) setRenameTarget(null); });
  const urlTrapRef = useFocusTrap(!!showUrlModal, () => setShowUrlModal(false));
  const noticeTimerRef = useRef(null);
  // ── A1 • Cảnh báo bộ nhớ trình duyệt (quota + ước tính dung lượng) ──
  const [storageNotice, setStorageNotice] = useState(null); // { level: "warn" | "danger", text }
  const dismissedStorageLevelsRef = useRef({});
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  // App is designed for teachers - teacher mode is always enabled
  const teacherMode = true;

  // Filters • mở rộng cho 1-5 và đầy đủ môn, thêm Tập
  // Persist toàn bộ filter (trước đây chỉ sortBy được lưu → reload mất lọc)
  const [initialLibFilters] = useState(() => loadLibFilters());
  const [searchQuery, setSearchQuery] = useState(() => initialLibFilters.search || "");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const isSearching = searchQuery !== debouncedSearchQuery;
  const [gradeFilter, setGradeFilter] = useState(() => initialLibFilters.grade ?? null);
  const [subjectFilter, setSubjectFilter] = useState(() => initialLibFilters.subject ?? null);
  const [termFilter, setTermFilter] = useState(() => initialLibFilters.term ?? null); // null | 1 | 2
  const [readingStatusFilter, setReadingStatusFilter] = useState(() => initialLibFilters.reading ?? null); // null | reading | completed | unread
  const [favOnly, setFavOnly] = useState(() => initialLibFilters.favOnly ?? false);
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

  // Thông báo toàn app kèm nút "Hoàn tác" (dùng cho xóa từ vựng, ...)
  const notifyWithUndo = useCallback((text, undo) => {
    try { if (!shouldShowNotifications()) return; } catch {}
    setUploadNotice(text);
    setNoticeUndo(undo ? { text, run: undo } : null);
  }, []);

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

  // Bấm "Sao lưu ngay" trong banner → dùng cùng định dạng sao lưu toàn app.
  const handleBackupNow = useCallback(async () => {
    try {
      const result = await exportBackup();
      const saved = safeSetString("sgk_last_backup", String(Date.now()));
      if (!saved.ok) console.warn("[App] Could not store the last-backup timestamp", saved);
      appEventsCore.emit(AppEventsCore.DATA_UPDATED, { source: "backup-export" });
      dismissStorageNotice();
      setUploadNotice(`Đã tải file sao lưu (${result.total} mục). Hãy lưu file vào OneDrive/USB để an toàn.`);
    } catch (e) {
      setUploadError(`Sao lưu thất bại: ${e?.message || "lỗi không rõ"}`);
    }
  }, [dismissStorageNotice]);

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
    // Kho mới (khbd_v2_*) + kho cũ còn sót (sgk_lessonplans) • trừ trùng id
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
        // Giữ icon nút Đổi giao diện đồng bộ khi theme đổi từ Cài đặt
        try { if (e.detail?.appearance?.theme) setTheme(e.detail.appearance.theme); } catch {}
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

  // -- P2 • migration 1 lần: Sổ khái niệm (sgk_concepts) → Sổ tay từ vựng (sgk_vocab) --
  // Module "Khái niệm" đã gộp vào "Từ vựng"; dữ liệu cũ được chuyển tự động (dedupe, không mất gì).
  const conceptsMigratedRef = useRef(false);
  useEffect(() => {
    if (conceptsMigratedRef.current) return;
    const run = () => {
      if (conceptsMigratedRef.current) return;
      conceptsMigratedRef.current = true;
      import("./data/conceptsMigration.js")
        .then((m) => m.migrateConceptsToVocabOnce(books))
        .catch((e) => console.warn("[App] concepts migration failed:", e));
    };
    if (books.length) { run(); return; }
    // Chờ sách load xong (nối bookTitle/grade); không có sách thì vẫn chạy sau 5s
    const t = setTimeout(run, 5000);
    return () => clearTimeout(t);
  }, [books]);

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
  // -- Cài đặt → Tính năng: module đang mở bị tắt → quay về Tổng quan (chặn truy cập trực tiếp)
  useEffect(() => {
    try {
      const disabled = settingsState?.features?.disabled;
      if (Array.isArray(disabled) && disabled.includes(view)) setView("dashboard");
    } catch {}
  }, [view, settingsState?.features?.disabled]);
  // -- Lập lịch nhắc hằng ngày 1 lần khi app khởi động
  useEffect(() => { try { refreshNotificationTimer(loadSettings()); } catch {} }, []);
  // -- Apply settings + missions init • chỉ chạy khi loading chuyển false (1 lần), không rerun theo books.length
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
  const handleOpenBook = useCallback((book, initialPage = null, returnTarget = null) => {
    setReaderReturnTarget(returnTarget);
    setView("library");
    const at = Date.now();
    setOpenRequestId((id) => id + 1);
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
  // P1 • view Từ điển đã gộp vào VocabView (tab Tra cứu)
  const [vocabInitialTab, setVocabInitialTab] = useState("table");
  const closeBook = useCallback((targetView, opts) => {
    setCurrentBook(null);
    setOpenInitialPage(null);
    setDataVersion((v) => v + 1);
    if (opts && typeof opts.planId === "string" && opts.planId) setLpOpenId(opts.planId);
    // Hub nhiệm vụ: giữ tab được yêu cầu (today|tasks|...) để MissionsView mở đúng chỗ ngay lần mount đầu
    if (targetView === "tasks" && opts && typeof opts.tab === "string") setTasksInitialTab(opts.tab);
    // P1 • link cũ / Trợ giúp / AI còn trỏ "glossary" → mở Từ vựng ở tab Tra cứu
    if (targetView === "glossary") { setVocabInitialTab("lookup"); targetView = "vocab"; }
    // P1 • cho phép mở thẳng tab Tra cứu: onNavigate("vocab", { tab: "lookup" })
    if (targetView === "vocab" && opts && opts.tab === "lookup") setVocabInitialTab("lookup");
    const normalized = targetView || "library";
    // Validate via registry if available, but don't block navigation for inline/legacy views
    if (normalized !== "library" && typeof getViewEntry === "function" && !getViewEntry(normalized)) {
      console.warn(`[App] Unknown view "${normalized}", falling back to library`);
      setUnknownView(normalized);
      setView("library");
      return;
    }
    setUnknownView("");
    setView(normalized);
    // Báo cho view đã mount (vd hub Nhiệm vụ đổi tab) — đánh dấu source để handler bỏ qua, chống loop
    try { appEventsCore.emit(AppEventsCore.NAVIGATE, { view: normalized, tab: opts?.tab, planId: opts?.planId, source: "hub" }); } catch {}
  }, []);

  const handleBack = useCallback(() => {
    const target = readerReturnTarget;
    setReaderReturnTarget(null);
    closeBook(target?.view || "library", target?.planId ? { planId: target.planId } : undefined);
  }, [closeBook, readerReturnTarget]);

  // onNavigate cho GlobalSearch — PHẢI useCallback: inline arrow đổi reference mỗi
  // render App → effect tìm kiếm re-run (quét lại toàn bộ localStorage) dù query không đổi.
  const handleGlobalNavigate = useCallback((v, opts) => {
    // Phải đi qua closeBook (đóng sách + validate view + emit hub) nếu không
    // đang đọc sách sẽ che mất view đích — ví dụ bấm kết quả "Từ vựng" khi đọc.
    if (v === "vocab" && opts && typeof opts.query === "string") setVocabQuery(opts.query);
    closeBook(v, opts || {});
    setMobileNavOpen(false);
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
      const { view, tab, planId, query } = e.detail || {};
      if (view) {
        if (view === "vocab" && typeof query === "string") setVocabQuery(query);
        closeBook(view, { ...(planId ? { planId } : {}), ...(tab ? { tab } : {}) });
        setMobileNavOpen(false);
      }
    };
    const offDirect = (() => {
      try {
        return appEventsCore.on(AppEventsCore.NAVIGATE, (detail) => {
          if (!detail || detail.source === "hub") return;
          const { view, tab, planId, query } = detail || {};
          if (view) {
            if (view === "vocab" && typeof query === "string") setVocabQuery(query);
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
          `Đã đưa "${book.title}" vào Thùng rác — giữ ${TRASH_TTL_DAYS} ngày, khôi phục được ở Dữ liệu & sao lưu.`,
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
    setRenameGrade(Number(book.grade) || 1);
    setRenameSubject(BOOK_INFO_SUBJECTS.includes(book.subject) ? book.subject : "Khác");
    setRenameTerm(Number(book.term) === 2 ? 2 : 1);
    setRenameError("");
  }, []);
  const confirmRenameBook = useCallback(async () => {
    const book = renameTarget;
    if (!book || renameSaving) return;
    const newTitle = renameValue.trim();
    if (newTitle.length < 3 || newTitle.length > 160) {
      setRenameError("Tiêu đề cần từ 3 đến 160 ký tự.");
      return;
    }
    setRenameSaving(true);
    setRenameError("");
    try {
      const response = await fetch(`${API_BASE}/api/books/${encodeURIComponent(book.filename)}/metadata`, {
        method: "PATCH",
        headers: writeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: newTitle,
          grade: renameGrade,
          subject: renameSubject,
          term: renameTerm,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Không thể cập nhật thông tin sách.");
      if (!data?.book?.filename) throw new Error("Máy chủ chưa trả lại thông tin sách đã cập nhật.");

      const updatedBook = { ...data.book, title: newTitle };
      const oldFilename = data.oldFilename || book.filename;
      let syncWarning = "";
      if (oldFilename !== updatedBook.filename) {
        try {
          const { migrateBookData } = await import("./data/storage.js");
          const migration = await migrateBookData(oldFilename, updatedBook.filename);
          if (!migration.ok) {
            console.warn("[App] migrateBookData failed after book metadata update:", migration.error);
            syncWarning = "Thông tin sách đã lưu, nhưng một số ghi chú/đánh dấu cũ chưa được chuyển sang tên mới.";
          }
        } catch (e) {
          console.error("[App] migrateBookData failed after book metadata update:", e);
          syncWarning = "Thông tin sách đã lưu, nhưng không thể đồng bộ dữ liệu đọc cũ.";
        }
      }

      const customTitles = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
      if (oldFilename !== updatedBook.filename) delete customTitles[oldFilename];
      customTitles[updatedBook.filename] = newTitle;
      const titleSave = safeSetJSON("sgk_custom_titles", customTitles);
      if (!titleSave.ok) {
        console.warn("[App] Could not persist custom book title:", titleSave.error || titleSave.message);
        syncWarning = "Thông tin sách đã lưu, nhưng tên hiển thị chưa đồng bộ được vào bộ nhớ trình duyệt.";
      }

      setBooks((prev) => {
        const exists = prev.some((item) => item.filename === oldFilename || item.filename === updatedBook.filename);
        const next = prev.map((item) =>
          item.filename === oldFilename || item.filename === updatedBook.filename ? updatedBook : item
        );
        return exists ? next : [...next, updatedBook];
      });
      if (currentBook && (currentBook.filename === oldFilename || currentBook.filename === updatedBook.filename)) {
        setCurrentBook(updatedBook);
        setBookContentNonce((nonce) => nonce + 1);
      }
      setDataVersion((v) => v + 1);
      try { appEventsCore.emit(AppEventsCore.DATA_UPDATED, { domain: "books", action: "metadata_updated" }); }
      catch (e) { console.warn("[App] Could not publish book metadata update:", e); }
      try {
        if (shouldShowNotifications()) setUploadNotice(syncWarning || `Đã cập nhật thông tin "${newTitle}".`);
      } catch {
        setUploadNotice(syncWarning || `Đã cập nhật thông tin "${newTitle}".`);
      }
      setUploadError(syncWarning);
      setRenameTarget(null);
    } catch (e) {
      console.warn("[App] confirmRenameBook failed:", e);
      setRenameError(e.message || "Không thể cập nhật thông tin sách.");
    } finally {
      setRenameSaving(false);
    }
  }, [renameTarget, renameValue, renameGrade, renameSubject, renameTerm, currentBook, renameSaving]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveJSON(LS.history, []);
  }, []);

  // Fix 7 • xóa 1 cuốn khỏi "Tiếp tục đọc" (trước đây muốn bỏ 1 cuốn phải xóa hết)
  const removeHistoryEntry = useCallback((filename) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.filename !== filename);
      saveJSON(LS.history, next);
      return next;
    });
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
      // Use the canonical predicate so user conversations and drafts are preserved.
      let isCacheKey;
      try { isCacheKey = (await import("./core/storageKeys.js")).isCacheKey; } catch {
        const cachePrefixes = ["sgk_idx_", "sgk_idxmeta_", "sgk_index_", "sgk_meta_", "ocr_", "txt_", "toc_"];
        isCacheKey = (key) => cachePrefixes.some((prefix) => key.startsWith(prefix));
      }
      const { listKeys } = await import("./safeStorage.js");
      const { safeRemove } = await import("./safeStorage.js");
      const toRemove = listKeys().filter((key) => key && isCacheKey(key));
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
      try { const { runHybridMigrations } = await import("./data/storage.js"); await runHybridMigrations(); } catch {}
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
      if (book.isLinkedBook) return false;
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
              const { saveJSON } = await import("./data/storage.js");
              const { safeRemove } = await import("./safeStorage.js");
              try { saveJSON(`sgk_idxmeta_${book.filename}`, meta); } catch (e) { console.warn("Word idxmeta save failed", book.filename, e?.message); }
              // IDB-first (chứa được index lớn), localStorage chỉ best-effort:
              // saveJSON ném lỗi khi quota và còn xóa oan cache khác nên không được gọi trực tiếp
              const indexData = { pages, builtAt: now };
              let idbOk = false;
              try {
                const indexedDBService = (await import("./data/indexedDB.js")).default;
                if (indexedDBService.constructor.isAvailable()) {
                  await indexedDBService.set((await import("./data/indexedDB.js")).STORES.SEARCH_INDEX, book.filename, indexData);
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
            const { saveJSON } = await import("./data/storage.js");
            const now = Date.now();
            saveJSON(`sgk_idxmeta_${book.filename}`, { filename: book.filename, total: 1, textPages: 0, ocrPages: 0, imagePages: 1, builtAt: now, nonPdf: true });
            saveJSON(`sgk_idx_${book.filename}`, { pages: [], builtAt: now });
            try {
              const indexedDBService = (await import("./data/indexedDB.js")).default;
              if (indexedDBService.constructor.isAvailable()) {
                await indexedDBService.set((await import("./data/indexedDB.js")).STORES.SEARCH_INDEX, book.filename, { pages: [], builtAt: now });
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

  // Đóng modal bằng Esc + trả focus
  useEffect(() => {
    if (!deleteTarget && !renameTarget && !showUrlModal) return;
    const h = (e) => {
      if (e.key === "Escape") { setDeleteTarget(null); if (!renameSaving) setRenameTarget(null); setShowUrlModal(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [deleteTarget, renameTarget, showUrlModal, renameSaving]);

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
            "Backend đã kết nối nhưng thư viện chưa có sách.",
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
  // Persist filter thư viện (dùng bản debounce của search để tránh ghi mỗi ký tự)
  useEffect(() => {
    try {
      saveJSON(LS.libFilters, {
        search: debouncedSearchQuery || "",
        grade: gradeFilter,
        subject: subjectFilter,
        term: termFilter,
        reading: readingStatusFilter,
        favOnly,
      });
    } catch (e) { console.warn("[App] save libFilters failed:", e?.message); }
  }, [debouncedSearchQuery, gradeFilter, subjectFilter, termFilter, readingStatusFilter, favOnly]);

  // A2 • Xóa vĩnh viễn những mục đã quá 30 ngày trong Thùng rác (chỉ chạy khi mở app)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { purgeExpiredTrashNow } = await import("./data/trashPurge.js");
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

  // Bản desktop (Electron 32+) lấy được đường dẫn thật của file đã chọn.
  // Trình duyệt thường không có API này → sourcePath rỗng và chỉ dùng upload copy.
  const getLocalSourcePath = (file) => {
    try {
      if (window.sgkDesktopFiles?.getPathForFile) {
        return window.sgkDesktopFiles.getPathForFile(file) || "";
      }
    } catch (e) {
      console.warn("[App] Không lấy được đường dẫn file gốc:", e);
    }
    return "";
  };

  const prepareUploadCandidate = (file) => {
    if (!file) return;
    if (!isSupportedFile(file.name)) {
      setUploadError(`Định dạng chưa hỗ trợ. Hỗ trợ: ${SUPPORTED_EXTS_CLIENT.join(", ")}`);
      setUploadDraft(null);
      return;
    }
    const sourcePath = getLocalSourcePath(file);

    // Có đường dẫn gốc thì có thể liên kết (không copy) → không áp giới hạn
    // upload 50 MB. Chỉ chặn dung lượng khi thực sự phải gửi file lên server.
    if (file.size > 50 * 1024 * 1024 && !(sourcePath && file.name.toLowerCase().endsWith(".pdf"))) {
      setUploadError(`File quá lớn (${(file.size/1024/1024).toFixed(1)} MB). Giới hạn 50 MB khi sao chép vào thư viện.`);
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
      sourcePath,
    });
  };

  // Nhiều file → mở hộp thoại hàng loạt; một file → giữ luồng xem trước cũ.
  const prepareBatchUpload = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (files.length === 1) {
      prepareUploadCandidate(files[0]);
      return;
    }

    const { items, skipped } = buildBatchItems(files, {
      getSourcePath: getLocalSourcePath,
      getTitle: formatSuggestedBookTitle,
    });

    setUploadDraft(null);
    setUploadError(
      skipped > 0
        ? `Chỉ thêm tối đa ${BATCH_MAX_FILES} file mỗi lần; ${skipped} file còn lại đã được bỏ qua. Hãy thêm lần tiếp theo.`
        : ""
    );
    setUploadNotice("");
    setBatchUpload({
      items,
      // Tất cả file hợp lệ đều là PDF có đường dẫn gốc → mặc định "chỉ liên kết";
      // còn lại phải sao chép vào thư viện.
      mode: canLinkAll(items.filter((item) => item.status !== "invalid")) ? "link" : "copy",
      phase: "idle",
      progress: { current: 0, total: 0, percent: 0 },
      summary: "",
    });
  };

  const handleAddBook = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (files.length === 1) prepareUploadCandidate(files[0]);
    else prepareBatchUpload(files);
  };

  // Thêm lại sách từng bị xóa: entry thùng rác cũ phải được bỏ, nếu không
  // fetchBooks sẽ tiếp tục ẩn sách vừa thêm khỏi thư viện.
  const clearTrashForAddedBooks = (filenames) => {
    try {
      const list = (Array.isArray(filenames) ? filenames : [filenames]).filter(Boolean);
      if (list.length) removeBooksFromTrashByFilename(list);
    } catch (e) {
      console.warn("[App] removeBooksFromTrashByFilename failed:", e);
    }
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
        headers: writeHeaders(),
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
      clearTrashForAddedBooks(data?.book?.filename);
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

  // Chỉ liên kết file PDF gốc trên máy — không gửi nội dung file, không copy
  // vào books/. Chỉ khả dụng ở bản desktop vì cần đường dẫn tuyệt đối.
  const submitLinkLocal = async () => {
    const draft = uploadDraft;
    if (!draft?.sourcePath) {
      setUploadError("Không lấy được đường dẫn file gốc. Hãy chọn lại file trong bản desktop.");
      return;
    }
    const lowerName = String(draft.name || draft.file?.name || "").toLowerCase();
    if (!lowerName.endsWith(".pdf")) {
      setUploadError("Chỉ hỗ trợ liên kết file PDF. Với định dạng khác, hãy dùng nút sao chép.");
      return;
    }

    setUploadingBook(true);
    setUploadError("");
    setUploadNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/books/link-local`, {
        method: "POST",
        headers: writeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          path: draft.sourcePath,
          title: draft.title || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Không thể liên kết file PDF.");
      clearTrashForAddedBooks(data?.book?.filename);
      setUploadNotice(data.message || "Đã liên kết file PDF gốc (không sao chép).");
      setUploadDraft(null);
      await fetchBooks();
      try { const { appEvents, AppEvents } = await import("./core/appEvents.js"); appEvents.emit(AppEvents.DATA_UPDATED, { domain: "books", action: "linked_local" }); } catch {}
      setDataVersion((v) => v + 1);
    } catch (err) {
      setUploadError(err.message || "Không thể liên kết file PDF.");
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
        headers: writeHeaders(),
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
      clearTrashForAddedBooks(data?.book?.filename);
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

  // ── Thêm nhiều sách cùng lúc ──────────────────────────────────────────
  const closeBatchUpload = () => {
    if (batchUpload?.phase === "uploading") return;
    setBatchUpload(null);
  };

  const updateBatchItem = (id, patch) => {
    setBatchUpload((prev) => prev ? {
      ...prev,
      items: prev.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : prev);
  };

  const removeBatchItem = (id) => {
    setBatchUpload((prev) => prev ? {
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    } : prev);
  };

  const retryBatchUpload = () => {
    setBatchUpload((prev) => prev ? {
      ...prev,
      phase: "idle",
      summary: "",
      progress: { current: 0, total: 0, percent: 0 },
      items: prev.items.map((item) => item.status === "error"
        ? { ...item, status: "pending", error: "" }
        : item),
    } : prev);
  };

  const abortBatchUpload = () => {
    const controller = batchAbortRef.current;
    if (!controller) return;
    controller.aborted = true;
    try { controller.fetchAbort?.abort(); } catch {}
    for (const xhr of controller.xhrs) {
      try { xhr.abort(); } catch {}
    }
    controller.xhrs.clear();
  };

  // Tiêu đề sửa trong bảng hàng loạt phải được lưu cùng cơ chế với upload đơn
  // (sgk_custom_titles theo filename) — nếu không, thư viện sẽ hiển thị lại
  // tiêu đề suy ra từ tên file.
  const persistBatchCustomTitles = (entries) => {
    if (!entries.length) return;
    try {
      const custom = safeGetJSON("sgk_custom_titles", {}, (d) => d && typeof d === "object" && !Array.isArray(d));
      let changed = false;
      for (const { filename, title } of entries) {
        if (filename && title && !custom[filename]) {
          custom[filename] = title;
          changed = true;
        }
      }
      if (!changed) return;
      const result = safeSetJSON("sgk_custom_titles", custom);
      if (!result.ok && result.quota) {
        setUploadError("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy");
      } else if (!result.ok) {
        console.warn("[App] safeSetJSON failed sgk_custom_titles:", result.error);
      }
    } catch (e) {
      console.warn("[App] persistBatchCustomTitles failed:", e);
    }
  };

  const runBatchUpload = async () => {
    const current = batchUpload;
    if (!current || current.phase === "uploading") return;

    // Bản sao cục bộ: cập nhật tuần tự từng file rồi đẩy vào state một lần,
    // tránh setState dồn dập làm React gộp mất trạng thái trung gian.
    const items = current.items.map((item) => ({ ...item }));
    const pending = items.filter((item) => item.status === "pending");
    if (!pending.length) return;

    const mode = current.mode;
    const total = pending.length;
    const controller = { aborted: false, xhrs: new Set(), fetchAbort: new AbortController() };
    batchAbortRef.current = controller;
    let completed = 0;

    const publish = (patch = {}) => {
      setBatchUpload((prev) => prev ? {
        ...prev,
        ...patch,
        items: items.map((item) => ({ ...item })),
      } : prev);
    };

    const publishProgress = (fraction = 0) => {
      const safeFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
      const ratio = total > 0 ? (completed + safeFraction) / total : 0;
      publish({
        progress: {
          current: completed,
          total,
          percent: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
        },
      });
    };

    const markChunkUploading = (chunk) => {
      for (const item of chunk) {
        const local = items.find((entry) => entry.id === item.id);
        if (local) {
          local.status = "uploading";
          local.error = "";
        }
      }
    };

    const applyChunkResults = (chunk, data, fallbackError) => {
      const results = Array.isArray(data?.results) ? data.results : [];
      chunk.forEach((item, index) => {
        const local = items.find((entry) => entry.id === item.id);
        if (!local) return;
        const result = results[index];
        if (result?.ok) {
          local.status = "done";
          local.error = "";
          local.bookFilename = result.book?.filename || "";
        } else {
          local.status = "error";
          local.error = result?.error || fallbackError || "Không thể thêm file này.";
        }
      });
      completed += chunk.length;
    };

    publish({ phase: "uploading", summary: "", progress: { current: 0, total, percent: 0 } });

    try {
      const chunks = chunkItems(pending, BATCH_CHUNK_SIZE);
      for (const chunk of chunks) {
        if (controller.aborted) break;
        markChunkUploading(chunk);
        publishProgress(0);

        if (mode === "link") {
          const res = await fetch(`${API_BASE}/api/books/link-local-batch`, {
            method: "POST",
            headers: writeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              items: chunk.map((item) => ({
                path: item.sourcePath,
                title: sanitizeBatchTitle(item.title, formatSuggestedBookTitle(item.name)),
              })),
            }),
            signal: controller.fetchAbort.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (controller.aborted) break;
          if (!res.ok && !Array.isArray(data?.results)) {
            applyChunkResults(chunk, null, data?.error || "Không thể liên kết file PDF.");
          } else {
            applyChunkResults(chunk, data, data?.error);
          }
        } else {
          const form = new FormData();
          for (const item of chunk) form.append("files", item.file, item.name);
          form.append("titles", JSON.stringify(
            chunk.map((item) => sanitizeBatchTitle(item.title, formatSuggestedBookTitle(item.name)))
          ));

          const data = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            controller.xhrs.add(xhr);
            xhr.open("POST", `${API_BASE}/api/books/upload-batch`);
            try {
              const headers = writeHeaders();
              Object.entries(headers || {}).forEach(([key, value]) => {
                try { xhr.setRequestHeader(key, value); } catch {}
              });
            } catch {}
            xhr.upload.onprogress = (event) => {
              if (!event.lengthComputable || !event.total) return;
              publishProgress(event.loaded / event.total);
            };
            xhr.onload = () => {
              controller.xhrs.delete(xhr);
              let payload = {};
              try { payload = JSON.parse(xhr.responseText || "{}"); } catch {}
              resolve({ ok: xhr.status >= 200 && xhr.status < 300, data: payload });
            };
            xhr.onerror = () => {
              controller.xhrs.delete(xhr);
              reject(new Error("Mất kết nối tới máy chủ khi đang thêm sách."));
            };
            xhr.onabort = () => {
              controller.xhrs.delete(xhr);
              const abortError = new Error("aborted");
              abortError.name = "AbortError";
              reject(abortError);
            };
            xhr.send(form);
          });

          if (controller.aborted) break;
          if (!data.ok && !Array.isArray(data.data?.results)) {
            applyChunkResults(chunk, null, data.data?.error || "Không thể thêm sách.");
          } else {
            applyChunkResults(chunk, data.data, data.data?.error);
          }
        }

        publishProgress(0);
      }
    } catch (error) {
      if (!controller.aborted) {
        const message = error?.message || "Không thể thêm sách.";
        for (const item of items) {
          if (item.status === "uploading") {
            item.status = "error";
            item.error = message;
            completed += 1;
          }
        }
      }
    } finally {
      batchAbortRef.current = null;

      if (controller.aborted) {
        // File đang gửi dở có thể đã kịp lưu trên máy chủ → đánh dấu lỗi kèm
        // cảnh báo kiểm tra thư viện, tránh người dùng bấm thử lại gây trùng.
        for (const item of items) {
          if (item.status === "uploading") {
            item.status = "error";
            item.error = "Đã hủy khi đang lưu — kiểm tra thư viện trước khi thử lại.";
          }
        }
      }

      const done = items.filter((item) => item.status === "done").length;
      const failed = items.filter((item) => item.status === "error").length;
      const finished = done + failed;
      persistBatchCustomTitles(
        items
          .filter((item) => item.status === "done" && item.bookFilename)
          .map((item) => ({
            filename: item.bookFilename,
            title: sanitizeBatchTitle(item.title, formatSuggestedBookTitle(item.name)),
          }))
      );
      clearTrashForAddedBooks(
        items.filter((item) => item.status === "done" && item.bookFilename).map((item) => item.bookFilename)
      );
      setBatchUpload((prev) => prev ? {
        ...prev,
        phase: "done",
        summary: batchResultSummary({ done, failed, mode, aborted: controller.aborted }),
        progress: {
          current: completed,
          total,
          percent: total > 0 ? Math.round((finished / total) * 100) : 0,
        },
        items: items.map((item) => ({ ...item })),
      } : prev);

      if (done > 0) {
        try { await fetchBooks(); } catch {}
        try {
          const { appEvents, AppEvents } = await import("./core/appEvents.js");
          appEvents.emit(AppEvents.DATA_UPDATED, { domain: "books", action: mode === "link" ? "linked_local" : "created" });
        } catch {}
        setDataVersion((v) => v + 1);
      }
    }
  };

  const handleAddByUrl = () => {
    setUrlBooks([{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: "",
      title: "",
      subject: "Khác",
      grade: 1,
      term: 1,
      format: "pdf",
    }]);
    setUploadError("");
    setUploadNotice("");
    setShowUrlModal(true);
  };
  const confirmAddByUrl = async () => {
    if (!urlBooks.length) { setUploadError("Hãy thêm ít nhất một sách."); return; }
    for (const [index, item] of urlBooks.entries()) {
      if (!item.url.trim()) { setUploadError(`Sách ${index + 1}: vui lòng nhập link Google Drive.`); return; }
      if (item.title.trim().length < 3) { setUploadError(`Sách ${index + 1}: tiêu đề cần ít nhất 3 ký tự.`); return; }
      try {
        const url = new URL(item.url.trim());
        if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)) throw new Error();
      } catch {
        setUploadError(`Sách ${index + 1}: hãy dùng link chia sẻ https://drive.google.com hoặc https://docs.google.com.`);
        return;
      }
    }
    setUploadingBook(true);
    setUploadError("");
    setUploadNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/books/link`, {
        method: "POST",
        headers: writeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          books: urlBooks.map(({ url, title, subject, grade, term, format }) => ({
            url: url.trim(),
            title: title.trim(),
            subject,
            grade: Number(grade),
            term: Number(term),
            format,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Không thể thêm sách từ link.");
      clearTrashForAddedBooks((Array.isArray(data?.books) ? data.books : []).map((b) => b && b.filename));
      setShowUrlModal(false);
      setUrlBooks([]);
      setUploadNotice(data.message || "Đã thêm sách từ Google Drive.");
      await fetchBooks();
      try { appEventsCore.emit(AppEventsCore.DATA_UPDATED, { domain: "books", action: "linked" }); }
      catch (e) { console.warn("[App] Could not publish linked book update:", e); }
      setDataVersion((v) => v + 1);
    } catch (err) {
      setUploadError(err.message || "Không thể thêm sách từ link.");
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
          const { migrateBookData } = await import("./data/storage.js");
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
    clearTrashForAddedBooks(book?.filename);
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
  // hiddenViews ← Cài đặt → Tính năng: module tắt ẩn khỏi sidebar (đối số rỗng = không lọc)
  const NAV_SECTIONS = useMemo(() => buildNavSectionsCore({
    badges: {
      continue: history.length,
      marks: totalBookmarks,
      vocab: vocabCount,
      whiteboard: whiteboardCount,
      matrix: totalMarks,
      collections: totalClips,
      webtools: webToolsCount,
    },
    hiddenViews: settingsState?.features?.disabled || [],
  }), [history.length, totalBookmarks, vocabCount, whiteboardCount, totalMarks, totalClips, webToolsCount, settingsState?.features?.disabled]);
  const FOOTER_NAV = useMemo(() => {
    const base = getFooterNav(); // [{id:"settings",...},{id:"datatools",...},{id:"help",...}]
    const items = base.map(item => {
      const iconEl = item.icon ? React.createElement(item.icon, { size: 16 }) : null;
      if (item.id === "settings") return { id: item.id, icon: iconEl, label: item.label, action: () => openSettings() };
      return { id: item.id, icon: iconEl, label: item.label };
    });
    items.push({
      id: "assistant",
      icon: <Sparkles size={16} />,
      label: "Trợ lý AI",
      action: () => appEventsCore.emit(AppEventsCore.OPEN_ASSISTANT),
    });
    return items;
  }, []);

  // Breadcrumb • UNIFIED via core/navigationRegistry (single source)
  const getBreadcrumb = () => {
    try {
      const b = getBreadcrumbCore(view);
      return { ...b, section: SECTION_VI[b.section] || b.section || "" };
    } catch { return { label: String(view), section: "", subsection: null }; }
  };

  return (
    <AppErrorBoundary onSafeHome={() => { try { setView("library"); setCurrentBook(null); } catch {} }}>
      {!isOnline && (
        <div role="status" style={{ background: "#92400e", color: "#fff", textAlign: "center", fontSize: "0.8125rem", fontWeight: 700, padding: "6px 12px" }}>
          Đang offline — thư viện local vẫn dùng được, AI và tải từ URL sẽ chờ có mạng.
        </div>
      )}
      {unknownView && (
        <div role="status" style={{ background: "#1e3a8a", color: "#fff", textAlign: "center", fontSize: "0.8125rem", fontWeight: 600, padding: "6px 12px" }}>
          Không tìm thấy trang “{unknownView}” — đã về Thư viện.{" "}
          <button onClick={() => setUnknownView("")} style={{ textDecoration: "underline", background: "none", border: 0, color: "#fff", cursor: "pointer", fontWeight: 700 }}>Đóng</button>
        </div>
      )}
      <div
        className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <a
          href="#main-content"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            try { document.getElementById("main-content")?.focus?.(); } catch {}
          }}
        >
          Bỏ qua tới nội dung chính
        </a>
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
                title="Kéo để đổi độ rộng, double-click để reset"
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
                <img src="/favicon.svg" alt="" draggable="false" />
              </div>
              {!sidebarCollapsed && (
                <div className="logo-text-wrapper">
                  <h1>Hành trang Tiểu học</h1>
                  <p>THƯ VIỆN SỐ · AI</p>
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
              {!geminiKey && !sidebarCollapsed && (
                <button
                  type="button"
                  className="ai-config-link"
                  onClick={() => openSettings("ai")}
                  title="Mở Cài đặt → Gemini API"
                >
                  Cấu hình
                </button>
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
            {!sidebarCollapsed && (
              <div
                className="sidebar-copyright"
                title={APP_COPYRIGHT}
                style={{ padding: "6px 12px 2px", fontSize: "0.6875rem", opacity: 0.65, textAlign: "center", lineHeight: 1.4 }}
              >
                {APP_COPYRIGHT}
              </div>
            )}
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
        <main id="main-content" className="main-content" tabIndex={-1}>
          {/* Thông báo cập nhật phiên bản mới */}
          {(appUpdateNotice?.hasUpdate || appUpdateNotice?.justUpdated) && (
            <div
              className="dash-notice info"
              role="status"
              style={{
                margin: "0.55rem 1rem 0",
                display: "flex",
                gap: "0.6rem",
                alignItems: "center",
                flexWrap: "wrap",
                background: "linear-gradient(90deg, rgba(37, 99, 235, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)",
                border: "1px solid rgba(37, 99, 235, 0.25)",
              }}
            >
              <span aria-hidden="true">🎉</span>
              <span style={{ flex: "1 1 240px", fontWeight: 500 }}>
                {appUpdateNotice.justUpdated
                  ? <>Đã cập nhật lên <strong>v{appUpdateNotice.latestVersion}</strong>.</>
                  : <>Đã có bản cập nhật mới <strong>v{appUpdateNotice.latestVersion}</strong>.</>}
                {appUpdateNotice.changelog?.[0] ? ` — ${appUpdateNotice.changelog[0]}` : ""}
              </span>
              <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={appUpdateNotice.justUpdated ? () => setAppUpdateDialogOpen(true) : startAppUpdate}
                >
                  {appUpdateNotice.justUpdated ? "Xem thay đổi" : "Tải & cài đặt"}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setAppUpdateNotice(null)}
                  aria-label="Đóng thông báo cập nhật"
                >
                  <X size={13} />
                </button>
              </span>
            </div>
          )}
          {appUpdateDialogOpen && appUpdateNotice && (
            <div
              role="presentation"
              style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15, 23, 42, 0.55)", display: "grid", placeItems: "center", padding: 16 }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="app-update-title"
                style={{ width: "min(520px, 100%)", maxHeight: "min(80vh, 680px)", overflowY: "auto", borderRadius: 16, padding: 22, background: "var(--surface, #fff)", color: "var(--text-dark, #172033)", boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2 id="app-update-title" style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>
                      {appUpdateNotice.justUpdated ? "Cập nhật thành công" : `Bản cập nhật v${appUpdateNotice.latestVersion}`}
                    </h2>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      {appUpdateNotice.justUpdated
                        ? "Ứng dụng đã được cập nhật."
                        : "Bấm một lần để tải bản cập nhật và chuẩn bị cài đặt."}
                    </div>
                  </div>
                  <button className="header-action-btn" onClick={() => setAppUpdateDialogOpen(false)} aria-label="Đóng">
                    <X size={18} />
                  </button>
                </div>

                {!appUpdateNotice.justUpdated && (
                  <div role="status" style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "var(--surface-soft, #f3f6fb)", fontSize: "0.92rem" }}>
                    {desktopUpdateStatus.status === "checking" && "Đang kiểm tra bản cập nhật…"}
                    {desktopUpdateStatus.status === "available" && "Đã tìm thấy bản mới, đang chuẩn bị tải…"}
                    {desktopUpdateStatus.status === "downloading" && (
                      <>
                        <div>Đang tải bản cập nhật… {Math.floor(desktopUpdateStatus.percent || 0)}%</div>
                        <progress value={desktopUpdateStatus.percent || 0} max="100" style={{ width: "100%", marginTop: 8 }} />
                      </>
                    )}
                    {desktopUpdateStatus.status === "downloaded" && "Đã tải xong bản cập nhật. Khởi động lại để cài đặt."}
                    {desktopUpdateStatus.status === "not-available" && "Không tìm thấy gói cài đặt cập nhật cho phiên bản này."}
                    {desktopUpdateStatus.status === "unsupported" && (desktopUpdateStatus.message || "Phiên bản này chưa hỗ trợ tự cập nhật.")}
                    {desktopUpdateStatus.status === "error" && (desktopUpdateStatus.message || "Tải cập nhật thất bại.")}
                    {desktopUpdateStatus.status === "idle" && "Đang chuẩn bị cập nhật…"}
                  </div>
                )}

                <div style={{ marginTop: 18 }}>
                  <strong>{appUpdateNotice.justUpdated ? "Các thay đổi trong bản này" : "Có gì mới"}</strong>
                  {Array.isArray(appUpdateNotice.changelog) && appUpdateNotice.changelog.length > 0 ? (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 22, lineHeight: 1.55 }}>
                      {appUpdateNotice.changelog.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
                    </ul>
                  ) : (
                    <p style={{ margin: "8px 0 0", color: "var(--text-muted)" }}>Không có ghi chú phát hành.</p>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
                  {desktopUpdateStatus.status === "downloaded" && (
                    <button className="btn btn-primary" onClick={installDownloadedUpdate}>
                      Khởi động lại và cài đặt
                    </button>
                  )}
                  {desktopUpdateStatus.status === "unsupported" && (
                    <button
                      className="btn btn-primary"
                      onClick={openUpdateReleases}
                    >
                      Mở trang tải bản Setup
                    </button>
                  )}
                  {desktopUpdateStatus.status === "error" && (
                    <button className="btn btn-primary" onClick={startAppUpdate}>Thử lại</button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setAppUpdateDialogOpen(false)}>Đóng</button>
                </div>
              </section>
            </div>
          )}

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
                <button className="btn btn-secondary btn-xs" onClick={handleBackupNow}>
                  <DatabaseBackup size={13} /> Sao lưu ngay
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => { dismissStorageNotice(); setView("datatools"); }}>
                  Quản lý dữ liệu
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
                  key={currentBook.filename}
                  book={currentBook}
                  onBack={handleBack}
                  geminiKey={geminiKey}
                  initialPage={openInitialPage}
                  openRequestId={openRequestId}
                  onOpenLessonPlan={(id) => {
                   setReaderReturnTarget(null);
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
                    {appUpdateNotice?.hasUpdate && (
                      <button
                        className="header-action-btn"
                        onClick={startAppUpdate}
                        disabled={desktopUpdateStatus.status === "checking" || desktopUpdateStatus.status === "downloading"}
                        aria-label={`Tải bản cập nhật v${appUpdateNotice.latestVersion}`}
                        title={`Tải bản cập nhật v${appUpdateNotice.latestVersion}`}
                        style={{ color: "var(--primary-color, #2563EB)", borderColor: "rgba(37, 99, 235, 0.4)" }}
                      >
                        <Download size={18} />
                        <span
                          aria-hidden="true"
                          style={{ position: "absolute", top: -3, right: -3, width: 9, height: 9, borderRadius: "50%", background: "#ef4444", border: "2px solid var(--surface)" }}
                        />
                      </button>
                    )}

                    {/* Theme Toggle */}
                    <button
                      className="header-action-btn header-action-optional"
                      onClick={() => {
                        // FIX: controller ưu tiên settingsState.appearance.theme nên setTheme đơn lẻ chết —
                        // phải ghi xuyên qua settings (nguồn sự thật duy nhất)
                        const cur = settingsState?.appearance?.theme || theme;
                        const next = cur === "light" ? "dark" : cur === "dark" ? "system" : "light";
                        try { updateSettings({ appearance: { theme: next } }); } catch {}
                        setTheme(next);
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
                      className="header-action-btn header-action-optional"
                      onClick={handleClearCacheAndReload}
                      aria-label="Xóa cache và tải lại"
                      title="Xóa cache và tải lại"
                    >
                      <RefreshCw size={18} />
                    </button>

                    {/* Toàn màn hình • cạnh nút xóa cache */}
                    <button
                      className="header-action-btn header-action-optional"
                      onClick={toggleFullscreen}
                      aria-label={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
                      title={isFullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
                    >
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>

                    {/* AI Status Indicator */}
                    <button
                      type="button"
                      className={`ai-status-indicator ${geminiKey ? "active" : "missing"}`}
                      onClick={() => openSettings("ai")}
                      title={
                        geminiKey
                          ? "AI đã sẵn sàng • bấm để mở Cài đặt → Gemini API"
                          : "Chưa cấu hình API Key • bấm để mở Cài đặt → Gemini API"
                      }
                      aria-label={
                        geminiKey
                          ? "AI đã sẵn sàng, mở Cài đặt AI"
                          : "Chưa cấu hình API Key, mở Cài đặt AI"
                      }
                    >
                      <Sparkles size={18} />
                    </button>

                    {/* More Menu */}
                    <div className="header-more-menu">
                      <button
                        className="header-action-btn"
                        onClick={() => openSettings()}
                        aria-label="Cài đặt"
                        title="Cài đặt"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        className="btn btn-primary header-add-btn"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={uploadingBook}
                        aria-label="Thêm một hoặc nhiều sách từ tập tin (PDF, DOCX, EPUB, ảnh…)"
                        title="Thêm một hoặc nhiều file • hỗ trợ PDF, DOCX, PPTX, EPUB, TXT, MD, JPG/PNG…"
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
                          title="Thêm một hoặc nhiều sách từ link Google Drive"
                          aria-label="Thêm sách từ Google Drive"
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
                        multiple
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
                    onOpenSettings={() => openSettings("ai")}
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
                    onFilesSelect={prepareBatchUpload}
                    onUploadSubmit={submitUpload}
                    onLinkLocal={submitLinkLocal}
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
                    onRemoveEntry={removeHistoryEntry}
                  />
                )}
                {view === "marks" && (
                  <BookmarksNotesView
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
                    notify={notifyWithUndo}
                    onChanged={() => setDataVersion((v) => v + 1)}
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
                    onUpdate={updateVocabEntry}
                    onSave={addVocabEntry}
                    notify={notifyWithUndo}
                    initialQuery={vocabQuery}
                    onQueryConsumed={() => setVocabQuery("")}
                    initialTab={vocabInitialTab}
                    onTabConsumed={() => setVocabInitialTab("table")}
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
                    vocabCount={vocabCount}
                    onNavigate={closeBook}
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
                    references: { books, onNavigate: closeBook },
                    lessonplans: {
                      books,
                      onNavigate: closeBook,
                      onOpenBook: (book, page, planId) =>
                        handleOpenBook(book, page, { view: "lessonplans", planId }),
                      initialPlanId: lpOpenId,
                    },
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
                    help: { geminiKey, onOpenSettings: (section) => openSettings(section || "ai"), onNavigate: (v, opts) => closeBook(v, opts) },
                  };
                  const props = viewPropsMap[view] || {};
                  return (
                    <AppErrorBoundary key={view} onSafeHome={() => { try { setView("library"); } catch {} }}>
                      <Suspense fallback={<ViewFallback label={`Đang tải ${entry.label || view}...`} />}>
                        <Comp {...props} />
                      </Suspense>
                    </AppErrorBoundary>
                  );
                })()}
              </div>

              {/* LobbyBubble removed - using professional dashboard instead */}
            </>
          )}
        </main>

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
          onOpenSettings={(section) => openSettings(section || "ai")}
          teacherMode={teacherMode}
          onNavigate={handleGlobalNavigate}
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
          onNavigate={handleGlobalNavigate}
          onOpenBook={handleOpenBook}
        />

        {showSettings && (
          <SettingsCenter onClose={() => setShowSettings(false)} initialSection={settingsSection} />
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
            <div ref={deleteTrapRef} className="modal-content" onClick={(e)=>e.stopPropagation()} style={{maxWidth:"min(440px, calc(100vw - 20px))"}}>
              <div className="modal-header"><h2 id="del-title">Đưa sách vào thùng rác?</h2><button className="btn btn-ghost btn-xs" onClick={()=>setDeleteTarget(null)} aria-label="Đóng"><X size={16}/></button></div>
              <div style={{padding:"1rem 1.1rem"}}>
                <p className="text-body-sm">Đưa <strong>“{deleteTarget.title}”</strong> vào thùng rác? Sách sẽ ẩn khỏi thư viện nhưng <strong>giữ {TRASH_TTL_DAYS} ngày</strong> — bấm Khôi phục ở <em>Sao lưu &amp; Khôi phục</em> là về ngay, ghi chú/đánh dấu không mất.</p>
                <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end",marginTop:"1rem"}}>
                  <button className="btn btn-ghost" onClick={()=>setDeleteTarget(null)} data-initial-focus>Hủy</button>
                  <button className="btn btn-danger" onClick={() => confirmDeleteBook()}><Trash2 size={14}/> Vào thùng rác</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal chỉnh thông tin sách • metadata được dùng trong bộ lọc và thư viện */}
        {renameTarget && (
          <div className="modal-overlay" onClick={()=>{ if(!renameSaving) setRenameTarget(null); }} role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <div ref={renameTrapRef} className="modal-content" onClick={(e)=>e.stopPropagation()} style={{maxWidth:"min(560px, calc(100vw - 20px))"}}>
              <div className="modal-header"><h2 id="rename-title">Sửa thông tin sách</h2><button className="btn btn-ghost btn-xs" onClick={()=>setRenameTarget(null)} aria-label="Đóng" disabled={renameSaving}><X size={16}/></button></div>
              <div style={{padding:"1rem 1.1rem",display:"flex",flexDirection:"column",gap:"0.75rem"}}>
                <div>
                  <label className="form-label" htmlFor="rename-input">Tiêu đề sách</label>
                  <input id="rename-input" className="form-control" value={renameValue} maxLength={160} onChange={(e)=>{setRenameValue(e.target.value); setRenameError("");}} onKeyDown={(e)=>{ if(e.key==="Enter") confirmRenameBook(); if(e.key==="Escape" && !renameSaving) setRenameTarget(null); }} placeholder="Nhập tiêu đề..." autoFocus disabled={renameSaving} />
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:"0.6rem"}}>
                  <div>
                    <label className="form-label" htmlFor="rename-grade">Lớp</label>
                    <select id="rename-grade" className="sort-select" value={renameGrade} onChange={(e)=>setRenameGrade(Number(e.target.value))} disabled={renameSaving}>
                      {[1,2,3,4,5].map((grade)=><option key={grade} value={grade}>Lớp {grade}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label" htmlFor="rename-subject">Môn học</label>
                    <select id="rename-subject" className="sort-select" value={renameSubject} onChange={(e)=>setRenameSubject(e.target.value)} disabled={renameSaving}>
                      {BOOK_INFO_SUBJECTS.map((subject)=><option key={subject} value={subject}>{subject}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label" htmlFor="rename-term">Tập</label>
                    <select id="rename-term" className="sort-select" value={renameTerm} onChange={(e)=>setRenameTerm(Number(e.target.value))} disabled={renameSaving}>
                      <option value={1}>Tập 1</option>
                      <option value={2}>Tập 2</option>
                    </select>
                  </div>
                </div>
                <p className="text-body-sm" style={{margin:0}}>
                  Thông tin này dùng trong tìm kiếm và lọc thư viện. Khi cần đổi tên tệp, tiến độ đọc, ghi chú và đánh dấu sẽ được chuyển theo sách.
                </p>
                {renameError && <p className="form-error" role="alert" style={{margin:0}}>{renameError}</p>}
                <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end",marginTop:"0.25rem"}}>
                  <button className="btn btn-ghost" onClick={()=>setRenameTarget(null)} disabled={renameSaving}>Hủy</button>
                  <button className="btn btn-primary" onClick={confirmRenameBook} disabled={renameSaving}>
                    {renameSaving ? "Đang lưu..." : "Lưu thông tin"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal thêm từ URL • thay 2 prompt */}
        {showUrlModal && (
          <div className="modal-overlay" onClick={()=>setShowUrlModal(false)} role="dialog" aria-modal="true" aria-labelledby="url-title">
            <div ref={urlTrapRef} className="modal-content link-books-modal" onClick={(e)=>e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 id="url-title">Thêm sách bằng link</h2>
                  <p className="link-books-intro">Dán link chia sẻ Google Drive/Docs và bật quyền “Bất kỳ ai có liên kết”. Mỗi thẻ là một sách; không cần tải tệp lên.</p>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={()=>setShowUrlModal(false)} aria-label="Đóng"><X size={16}/></button>
              </div>
              <div className="link-books-content">
                <div className="link-book-drafts">
                  {urlBooks.map((item, index) => {
                    const update = (key, value) => setUrlBooks((prev) => prev.map((book) => book.id === item.id ? { ...book, [key]: value } : book));
                    return (
                      <section className="link-book-draft" key={item.id} aria-label={`Thông tin sách ${index + 1}`}>
                        <div className="link-book-draft-heading">
                          <span className="link-book-number">{String(index + 1).padStart(2, "0")}</span>
                          <strong>Sách {index + 1}</strong>
                          {urlBooks.length > 1 && (
                            <button
                              className="btn btn-ghost btn-xs"
                              type="button"
                              onClick={() => setUrlBooks((prev) => prev.filter((book) => book.id !== item.id))}
                              aria-label={`Xóa thẻ sách ${index + 1}`}
                              title="Xóa thẻ sách"
                            ><X size={14}/></button>
                          )}
                        </div>
                        <label className="form-label" htmlFor={`link-url-${item.id}`}>Link chia sẻ Google Drive / Docs</label>
                        <input
                          id={`link-url-${item.id}`}
                          className="form-control"
                          type="url"
                          value={item.url}
                          onChange={(e)=>update("url", e.target.value)}
                          placeholder="https://drive.google.com/file/d/..."
                          autoFocus={index === 0}
                        />
                        <label className="form-label" htmlFor={`link-title-${item.id}`}>Tên sách</label>
                        <input
                          id={`link-title-${item.id}`}
                          className="form-control"
                          value={item.title}
                          maxLength={160}
                          onChange={(e)=>update("title", e.target.value)}
                          placeholder="Ví dụ: Toán lớp 1 - Tập 1"
                        />
                        <div className="link-book-details">
                          <div>
                            <label className="form-label" htmlFor={`link-subject-${item.id}`}>Môn học</label>
                            <select id={`link-subject-${item.id}`} className="form-control" value={item.subject} onChange={(e)=>update("subject", e.target.value)}>
                              {BOOK_INFO_SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" htmlFor={`link-grade-${item.id}`}>Lớp</label>
                            <select id={`link-grade-${item.id}`} className="form-control" value={item.grade} onChange={(e)=>update("grade", e.target.value)}>
                              {[1,2,3,4,5].map((grade) => <option key={grade} value={grade}>Lớp {grade}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" htmlFor={`link-term-${item.id}`}>Tập</label>
                            <select id={`link-term-${item.id}`} className="form-control" value={item.term} onChange={(e)=>update("term", e.target.value)}>
                              <option value={1}>Tập 1</option>
                              <option value={2}>Tập 2</option>
                            </select>
                          </div>
                          <div>
                            <label className="form-label" htmlFor={`link-format-${item.id}`}>Định dạng</label>
                            <select id={`link-format-${item.id}`} className="form-control" value={item.format} onChange={(e)=>update("format", e.target.value)}>
                              <option value="pdf">PDF</option>
                              <option value="word">Word / DOC</option>
                            </select>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm link-book-add"
                  onClick={() => setUrlBooks((prev) => prev.length >= 30 ? prev : [...prev, {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    url: "", title: "", subject: "Khác", grade: 1, term: 1, format: "pdf",
                  }])}
                  disabled={urlBooks.length >= 30 || uploadingBook}
                ><Plus size={14}/> Thêm thẻ sách</button>
                {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
                <div className="link-book-actions">
                  <button className="btn btn-ghost" onClick={()=>setShowUrlModal(false)} disabled={uploadingBook}>Hủy</button>
                  <button className="btn btn-primary" onClick={confirmAddByUrl} disabled={uploadingBook}>
                    {uploadingBook ? "Đang lưu..." : `Thêm ${urlBooks.length} sách vào thư viện`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {batchUpload && (
          <BatchUploadDialog
            open
            items={batchUpload.items}
            mode={batchUpload.mode}
            phase={batchUpload.phase}
            progress={batchUpload.progress}
            summary={batchUpload.summary}
            canLink={canLinkAll(batchUpload.items.filter((item) => item.status !== "invalid"))}
            onClose={closeBatchUpload}
            onStart={runBatchUpload}
            onAbort={abortBatchUpload}
            onRetry={retryBatchUpload}
            onRemove={removeBatchItem}
            onTitleChange={(id, value) => updateBatchItem(id, { title: value })}
            onModeChange={(mode) => setBatchUpload((prev) => prev ? { ...prev, mode } : prev)}
          />
        )}
      </div>
    </AppErrorBoundary>
  );
}

// ------------------------------------------------------------------
// LIBRARY VIEW
// ------------------------------------------------------------------
