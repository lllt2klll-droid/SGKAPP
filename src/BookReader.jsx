import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { getApiBase } from "./apiConfig";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { pdfjsLib } from "./pdfjs-config";
import { teacherCopy, TEACHER_SYSTEM_PROMPT } from "./appPersona";
import aiService, { getFriendlyErrorMessage, AIError } from "./aiService";
import MarkdownText from "./MarkdownText";
import PageRangePicker from "./PageRangePicker";
import { loadSettings, updateSettings } from "./settingsStore";
import { getShortcut, matchesShortcut } from "./keyboardShortcuts.js";
import { uiMessage } from "./core/errors.js";
import DOMPurify from "dompurify";
import { calcRenderScale } from "./reader/pdfRenderer.js";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  Edit3,
  Award,
  FileText,
  Send,
  Volume2,
  Sparkles,
  BookOpen,
  AlertCircle,
  Copy,
  Check,
  ChevronsRight,
  ChevronsLeft,
  Play,
  Pause,
  Square,
  X,
  Maximize2,
  Trash2,
  StickyNote,
  RotateCcw,
  GraduationCap,
  BookmarkPlus,
  BookmarkCheck,
  NotebookPen,
  FileSearch,
  Tag,
  Scissors,
  MoreVertical,
  Search,
  Layers,
  Star,
  Clock,
  Sun,
  ScanText,
  Database,
  Minus,
  Plus,
  Download,
  Upload,
  Palette,
  Loader2,
} from "lucide-react";
import CanvasWhiteboard from "./CanvasWhiteboard";
import StructuredNotes from "./StructuredNotes";
import GlossaryPanel from "./GlossaryPanel";
import PageTagDialog from "./PageTagDialog";
import {
  addClip,
  getCollections,
  addCollection,
  saveTeacherNote,
  citationFor,
  chapterForPage,
} from "./researchDB";
import { findTocBook, upsertTocBook, makeTocKey, makeFileTocKey } from "./tocData";
import { exportTocToExcel, exportTocSimple, parseTocExcel } from "./tocExcel";
import {
  TOC_AI_MAX_IMAGES,
  validateTocAiFiles,
  buildTocAiImageParts,
  buildTocAiPrompt,
  cleanTocAiItems,
} from "./tocAiService";
import ReaderMobileBar from "./components/ReaderMobileBar.jsx";
import ScanOverlay from "./scan/ScanOverlay";
import ScanModal from "./scan/ScanModal";
import ScanHistory from "./scan/ScanHistory";
import { cropFromCanvases } from "./scan/scanCapture";
import { createScan, saveScan } from "./scan/scanStore";
import {
  addQuestion,
  saveWorksheet,
} from "./teachingDB";
import { savePlan as saveKhbdV2 } from "./khbd/planModel";
import { LESSON_METHODS, AI_SYSTEM, buildLessonPrompt, extractPlanJson, aiJsonToPlan } from "./khbd/planAi";
import LessonUrlImport from "./khbd/LessonUrlImport";
import {
  GUIDE_IMAGE_MAX_COUNT,
  GUIDE_IMAGE_ACCEPT,
  validateGuideImageFile,
  fileToGuideDataUrl,
  dataUrlToBase64,
  makeGuideImageId,
  buildGuideImageParts,
} from "./khbd/guideImageParts";
import {
  bookmarkPagesFor,
  toggleBookmark,
  addVocabEntry,
  addQuizRecord,
  saveLastPage,
} from "./userdata";
import { getOCR, setOCR } from "./indexedDB";
import {
  emitPageRead,
  emitNoteCreated,
} from "./missionEvents";
import {
  clampZoom as clampZoomHelper,
  calcFitZoom,
  calcWheelZoom,
  zoomIn as zoomInHelper,
  zoomOut as zoomOutHelper,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_PRESETS,
} from "./reader/zoomController";
import { normalizeGeneratedQuestion } from "./questionSchema";
import { clampPage, nextPage } from "./reader/pageNavigation";
import { soundManager } from "./audio/soundManager.js";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove, safeSetJSONWithQuotaRetry } from "./safeStorage";
import {
  isNoteImageRef,
  persistNoteImages,
  resolveImageRefs,
  deleteNoteImages,
  primeImageCache,
} from "./noteImageStore.js";

// ─── Watermark / noise text cleaner ──────────────────────────────────────────
function cleanExtractedText(text) {
  if (!text) return "";
  let c = text;
  c = c.replace(/https?:\/\/\S+/gi, "");
  c = c.replace(/blogtailieu[\s.]*com[\s./]*[a-zA-Z0-9_-]*/gi, "");
  c = c.replace(/blogtailieu[\s.]*\w+[\s./]*\w*[-\w]*/gi, "");
  c = c.replace(/blogtailieu/gi, "");
  c = c.replace(/sách chia sẻ tại/gi, "");
  c = c.replace(/sach chia se tai/gi, "");
  c = c.replace(/chia sẻ tại/gi, "");
  c = c.replace(/giao\s*-\s*an\s*-\s*lo\s*p?\s*-\s*\d/gi, "");
  c = c.replace(/day\s*-\s*va\s*-\s*hoc/gi, "");
  c = c.replace(/\s*-\s*va\s*-\s*/gi, " ");
  // Protect fractions like 1/2 from being mangled, then strip leftover slashes
  const fracs = [];
  const marker = String.fromCharCode(1);
  c = c.replace(/(\d)\s*\/\s*(\d)/g, (m, a, b) => {
    fracs.push(`${a}/${b}`);
    return `${marker}${fracs.length - 1}${marker}`;
  });
  c = c.replace(/\/+/g, " ");
  c = c
    .split(marker)
    .map((part, i) => (i % 2 === 1 ? fracs[parseInt(part, 10)] : part))
    .join("");
  c = c.replace(/\s+/g, " ").trim();
  return c;
}

function sanitizeNoteHtml(html) {
  if (!html) return "";
  try {
    // DOMPurify parse trên document inert nên script/onerror KHÔNG thể chạy
    // trong lúc sanitize (cách cũ gán innerHTML lên div rồi mới dọn là đã trễ).
    // Allowlist y hệt bản cũ: chỉ b/strong/i/em/u/s/strike/br, không attribute.
    let out = DOMPurify.sanitize(String(html), {
      ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "s", "strike", "br"],
      ALLOWED_ATTR: [],
    }).trim();
    if (/^(<br\s*\/?>)+$/i.test(out)) out = "";
    return out;
  } catch {
    return String(html).replace(/<[^>]*>/g, "").slice(0, 4000);
  }
}
function plainTextFromHtml(html) {
  try {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return (tmp.textContent || tmp.innerText || "")
      .replace(/\u00A0/g, " ")
      .trim();
  } catch {
    return (html || "").replace(/<[^>]*>/g, " ").trim();
  }
}

function parseJSONSafe(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  let cand = null;
  if (objStart >= 0 && objEnd > objStart) cand = t.slice(objStart, objEnd + 1);
  else if (arrStart >= 0 && arrEnd > arrStart) cand = t.slice(arrStart, arrEnd + 1);
  else cand = t;
  try {
    return JSON.parse(cand);
  } catch {
    try {
      const fixed = cand.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

const API_BASE = getApiBase();

export default function BookReader({
  book,
  onBack,
  geminiKey,
  initialPage = null,
  onOpenLessonPlan,
  onEditWord,
  contentVersion = 0,
}) {
  // ── file type helpers — dùng chung cho layout (PDF / Word html / ảnh) ──
  const fileExt = String(book.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || ".pdf";
  const isPdfFile = fileExt === ".pdf";
  const isWordFile = [".html",".htm",".txt",".md"].includes(fileExt);
  const isImgFileEarly = [".jpg",".jpeg",".png",".gif",".webp"].includes(fileExt);
  // ── PDF state ──────────────────────────────────────────────────
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfError, setPdfError] = useState("");
  const [pageNum, setPageNum] = useState(() => {
    // PDF pages: initialPage (from bookmarks/vocab jump, PDF numbering)
    if (
      initialPage != null &&
      Number.isFinite(Number(initialPage)) &&
      Number(initialPage) >= 1
    ) {
      return Math.max(1, Math.floor(Number(initialPage)));
    }
    const s = loadSettings();
    if (s.reading?.rememberLastPage !== false) {
      const rawPage = safeGetString(`lastPage_${book.filename}`, null);
      if (rawPage != null && rawPage !== "") {
        const n = parseInt(rawPage, 10);
        if (Number.isFinite(n) && n >= 1) return Math.max(1, n);
      }
      return 1;
    }
    return 1;
  });
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(() => {
    const s = loadSettings();
    // Free zoom: mặc định 100%, không ép fit, không clamp trên
    const raw = Number(s.reading?.defaultZoom);
    return Number.isFinite(raw) && raw > 0 ? clampZoomHelper(raw) : 1.0;
  });
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [zoomPillVisible, setZoomPillVisible] = useState(false);
  const zoomPillTimerRef = useRef(null);
  const [pageText, setPageText] = useState("");
  const [pageIsImage, setPageIsImage] = useState(false);
  const [pageImageBase64, setPageImageBase64] = useState("");
  const [rightPageText, setRightPageText] = useState("");
  const [rightPageIsImage, setRightPageIsImage] = useState(false);
  const [rightPageImageBase64, setRightPageImageBase64] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showOcrDrawer, setShowOcrDrawer] = useState(false);

  // Zoom pill transient — hiện % khi zoom thay đổi (tinh tế)
  useEffect(() => {
    setZoomPillVisible(true);
    if (zoomPillTimerRef.current) clearTimeout(zoomPillTimerRef.current);
    zoomPillTimerRef.current = setTimeout(() => setZoomPillVisible(false), 950);
    return () => clearTimeout(zoomPillTimerRef.current);
  }, [zoom]);

  // Close OCR drawer with Escape
  useEffect(() => {
    if (!showOcrDrawer) return;
    const h = (e) => {
      if (e.key === "Escape") setShowOcrDrawer(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showOcrDrawer]);

  // ── Range analysis ─────────────────────────────────────────
  const [analyzeFrom, setAnalyzeFrom] = useState("");
  const [analyzeTo, setAnalyzeTo] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisPages, setAnalysisPages] = useState([]);
  const [analysisCopied, setAnalysisCopied] = useState(false);
  // chi tiết phân tích — phục vụ quá trình
  const [analyzeDetail, setAnalyzeDetail] = useState("balanced");
  const [analyzeFocus, setAnalyzeFocus] = useState("all");
  const [analyzeIncludeTips, setAnalyzeIncludeTips] = useState(true);
  const [showAnalyzeOptions, setShowAnalyzeOptions] = useState(false);

  // ── View modes ──────────────────────────────────────────────────
  // State thay vì useMemo tĩnh: đang mở sách mà đổi Cài đặt (Sáng tạo/Độ dài/Model)
  // phải áp dụng ngay, không cần đóng/mở lại sách.
  const [settings, setSettings] = useState(() => loadSettings());
  const [twoPageMode, setTwoPageMode] = useState(() => {
    const s = loadSettings();
    return s.reading?.layout === "single" ? false : true;
  });
  const [aiCollapsed, setAiCollapsed] = useState(true);
  const [tocCollapsed, setTocCollapsed] = useState(() => {
    const s = loadSettings();
    return s.reading?.showTOC === false ? true : false;
  });
  const tocFileRef = useRef(null);
  const tocAiFileRef = useRef(null);
  const [tocAiBusy, setTocAiBusy] = useState(false);
  // ── Resizable panels (kéo như navbar) ──────────────────────────
  const [tocWidth, setTocWidth] = useState(() => {
    const raw = safeGetString("sgk_toc_w", null);
    const v = raw != null ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(v) && v >= 160 && v <= 560) return v;
    return 280;
  });
  const [aiWidth, setAiWidth] = useState(() => {
    const raw = safeGetString("sgk_ai_w", null);
    const v = raw != null ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(v) && v >= 240 && v <= 640) return v;
    return 380;
  });
  const tocDragRef = useRef(null);
  const aiDragRef = useRef(null);
  const onTocResizeStart = useCallback((e)=>{
    if(tocCollapsed) return;
    e.preventDefault();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startW = tocWidth;
    tocDragRef.current = { startX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove2 = (ev)=>{
      const curX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const nw = Math.max(160, Math.min(560, startW + (curX - startX)));
      setTocWidth(nw);
      const r = safeSetString("sgk_toc_w", String(nw));
      if (!r.ok && r.quota) console.warn("[BookReader] Quota exceeded for sgk_toc_w, giữ dữ liệu cũ", r.message);
      else if (!r.ok) console.warn("[BookReader] Failed to persist sgk_toc_w:", r.error);
    };
    const onUp = ()=>{
      tocDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove2);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove2);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove2);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove2, { passive:false });
    window.addEventListener("touchend", onUp);
  }, [tocCollapsed, tocWidth]);
  const onAiResizeStart = useCallback((e)=>{
    if(aiCollapsed) return;
    e.preventDefault();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startW = aiWidth;
    aiDragRef.current = { startX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove2 = (ev)=>{
      const curX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const delta = startX - curX; // kéo trái = tăng width (panel bên phải)
      const nw = Math.max(240, Math.min(640, startW + delta));
      setAiWidth(nw);
      const r = safeSetString("sgk_ai_w", String(nw));
      if (!r.ok && r.quota) console.warn("[BookReader] Quota exceeded for sgk_ai_w, giữ dữ liệu cũ", r.message);
      else if (!r.ok) console.warn("[BookReader] Failed to persist sgk_ai_w:", r.error);
    };
    const onUp = ()=>{
      aiDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove2);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove2);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove2);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove2, { passive:false });
    window.addEventListener("touchend", onUp);
  }, [aiCollapsed, aiWidth]);
  useEffect(()=>{
    const r = safeSetString("sgk_toc_w", String(tocWidth));
    if (!r.ok && r.quota) console.warn("[BookReader] Quota exceeded for sgk_toc_w, giữ dữ liệu cũ", r.message);
    else if (!r.ok) console.warn("[BookReader] Failed to persist sgk_toc_w:", r.error);
  }, [tocWidth]);
  useEffect(()=>{
    const r = safeSetString("sgk_ai_w", String(aiWidth));
    if (!r.ok && r.quota) console.warn("[BookReader] Quota exceeded for sgk_ai_w, giữ dữ liệu cũ", r.message);
    else if (!r.ok) console.warn("[BookReader] Failed to persist sgk_ai_w:", r.error);
  }, [aiWidth]);
  const [scanMode, setScanMode] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Word HTML book content — đồng bộ Setting editor/reading
  const [htmlBookContent, setHtmlBookContent] = useState("");
  const [htmlBookLoading, setHtmlBookLoading] = useState(false);
  const [htmlBookError, setHtmlBookError] = useState("");
  const [htmlZoom, setHtmlZoom] = useState(()=>{ try{ const s=loadSettings(); return s.editor?.defaultZoom || Math.round((s.reading?.defaultZoom||1)*100) || 100; }catch{ return 100; }});
  // Trạng thái xuất sách Word (.html) ra file .docx thật
  const [exportingWord, setExportingWord] = useState(false);
  useEffect(()=>{
    const onSettings=(e)=>{
      const ed=e.detail?.editor;
      const rd=e.detail?.reading;
      if(ed?.defaultZoom && ed.defaultZoom!==htmlZoom) setHtmlZoom(ed.defaultZoom);
      else if(rd?.defaultZoom && Math.round(rd.defaultZoom*100)!==htmlZoom && !ed?.defaultZoom) setHtmlZoom(Math.round(rd.defaultZoom*100));
    };
    window.addEventListener("sgk:settings-updated", onSettings);
    return ()=> window.removeEventListener("sgk:settings-updated", onSettings);
  },[htmlZoom]);
  const htmlBookPages = useMemo(()=>{
    const raw = htmlBookContent || "";
    if(!raw || raw.includes("Chưa có nội dung")||raw.includes("Chua co noi dung")) return [raw];
    try{
      const tmp=document.createElement("div");
      tmp.innerHTML=raw;
      const nodes=Array.from(tmp.childNodes);
      if(!nodes.length) return [raw];
      const pages=[]; let cur=""; let curLen=0; const limit=3000;
      const plainLen=(h)=>{ const d=document.createElement("div"); d.innerHTML=h; return (d.textContent||"").length; };
      const chunkLongBlock=(out, len)=>{
        if(len <= limit) return [out];
        try{
          const t=document.createElement("div"); t.innerHTML=out;
          const el=t.firstElementChild;
          if(!el) return [out];
          const tag=(el.tagName||"").toLowerCase();
          if(["table","pre","ul","ol"].includes(tag)) return [out];
          const text=(el.textContent||"").trim();
          if(!text || text.length <= limit) return [out];
          const chunks=[]; let pos=0;
          while(pos < text.length){
            let end=Math.min(pos+limit, text.length);
            if(end < text.length){ const sp=text.lastIndexOf(" ", end); if(sp > pos+800) end=sp; }
            const piece=text.slice(pos, end).trim();
            if(piece) chunks.push(`<${tag}>${piece.replace(/</g,"&lt;")}</${tag}>`);
            pos=end;
          }
          return chunks.length? chunks : [out];
        }catch{ return [out]; }
      };
      for(const n of nodes){
        const out=n.outerHTML ?? `<p>${(n.textContent||"").replace(/</g,"&lt;")}</p>`;
        const len=plainLen(out) || Math.ceil(out.length/3);
        const pieces=chunkLongBlock(out, len);
        for(const piece of pieces){
          const pLen=plainLen(piece) || Math.ceil(piece.length/3);
          if(curLen + pLen > limit && cur){ pages.push(cur); cur=piece; curLen=pLen; } else { cur+=piece; curLen+=pLen; }
        }
      }
      if(cur) pages.push(cur);
      return pages.length? pages : [raw];
    }catch{ return [raw]; }
  },[htmlBookContent]);

  // ── Advanced Tools Drawer State ─────────────────────────────────
  const [advancedToolsSearch, setAdvancedToolsSearch] = useState("");
  const [advancedToolsFilter, setAdvancedToolsFilter] = useState("all"); // all, favorites, recent
  const [favoriteTools, setFavoriteTools] = useState(() => {
    const v = safeGetJSON("favoriteTools", [], (x) => Array.isArray(x));
    return Array.isArray(v) ? v : [];
  });
  const [recentTools, setRecentTools] = useState(() => {
    const v = safeGetJSON("recentTools", [], (x) => Array.isArray(x));
    return Array.isArray(v) ? v : [];
  });

  // ── Command Palette State ───────────────────────────────────────
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteSearch, setCommandPaletteSearch] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [recentActions, setRecentActions] = useState(() => {
    const v = safeGetJSON("recentActions", [], (x) => Array.isArray(x));
    return Array.isArray(v) ? v : [];
  });

  // ── Page jump ──────────────────────────────────────────────────
  const [editingPage, setEditingPage] = useState(false);
  const [pageInputVal, setPageInputVal] = useState("");

  // ── AI panel tab ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("chat");

  // ── Sticky Notes ───────────────────────────────────────────────
  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [noteImages, setNoteImages] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  // Cache ref ảnh "idb:xxx" → dataURL hiển thị được (ảnh ghi chú giờ nằm ở IndexedDB).
  // note.images[] có thể chứa hỗn hợp base64 cũ (inline) và ref mới — helper này
  // giúp render đồng nhất mà không phải đọc IDB đồng bộ.
  const [resolvedNoteImgs, setResolvedNoteImgs] = useState({});
  const noteDisplaySrc = useCallback((src) => {
    if (!src || typeof src !== "string") return "";
    if (!isNoteImageRef(src)) return src;
    return resolvedNoteImgs[src] || "";
  }, [resolvedNoteImgs]);

  // ── Chat ───────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [preStudyPrompt, setPreStudyPrompt] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  // Bật khi BẤT KỲ luồng AI nào trong cuốn sách đang chạy (chat, phân tích, hỏi trang, quiz…)
  const [aiBusy, setAiBusy] = useState(false);
  const [chatEffort, setChatEffort] = useState(
    () => loadSettings().ai?.effort || "balanced",
  );
  const [chatResponseLength, setChatResponseLength] = useState(
    () => loadSettings().ai?.responseLength || "balanced",
  );
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [lengthMenuOpen, setLengthMenuOpen] = useState(false);
  const effortMenuRef = useRef(null);
  const lengthMenuRef = useRef(null);
  // Đồng bộ cài đặt AI từ Cài đặt → bảng Hỏi AI + chip "AI LIÊN KẾT" cập nhật tức thì
  useEffect(() => {
    const onAiSettings = (e) => {
      const s = e?.detail && typeof e.detail === "object" && Object.keys(e.detail).length
        ? e.detail
        : loadSettings();
      setSettings(s);
      if (s.ai?.effort) setChatEffort(s.ai.effort);
      if (s.ai?.responseLength) setChatResponseLength(s.ai.responseLength);
    };
    window.addEventListener("sgk:settings-updated", onAiSettings);
    return () => window.removeEventListener("sgk:settings-updated", onAiSettings);
  }, []);
  // đóng menu khi click ngoài — gọn gàng, không kẹt
  useEffect(() => {
    if (!effortMenuOpen && !lengthMenuOpen) return;
    const onDown = (e) => {
      if (effortMenuOpen && effortMenuRef.current && !effortMenuRef.current.contains(e.target)) setEffortMenuOpen(false);
      if (lengthMenuOpen && lengthMenuRef.current && !lengthMenuRef.current.contains(e.target)) setLengthMenuOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") { setEffortMenuOpen(false); setLengthMenuOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [effortMenuOpen, lengthMenuOpen]);
  const [chatFrom, setChatFrom] = useState("");
  const [chatTo, setChatTo] = useState("");
  const [quizFrom, setQuizFrom] = useState("");
  const [quizTo, setQuizTo] = useState("");
  // ── Giáo án từ trang sách (không AI): chọn từ trang tới trang ──
  const [planFrom, setPlanFrom] = useState("");
  const [planTo, setPlanTo] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planDuration, setPlanDuration] = useState("35");
  const [planMethod, setPlanMethod] = useState("Hỏi đáp");
  const [planIncludeDiff, setPlanIncludeDiff] = useState(true);
  // Yêu cầu riêng do GV gõ tự do — gửi kèm prompt để AI soạn theo ý người dùng
  const [planCustom, setPlanCustom] = useState("");
  const [planCreating, setPlanCreating] = useState(false);
  const [planError, setPlanError] = useState("");
  // ── Ảnh tham khảo SGV/HDH đính kèm giáo án (nhiều ảnh, session-only) ──
  // Mỗi item: {id, name, dataUrl (jpeg preview), base64}. Không lưu storage,
  // không đụng module khác — chỉ gửi kèm prompt khi bấm "Tạo giáo án bằng AI".
  const [planGuideImages, setPlanGuideImages] = useState([]);
  const [planGuideError, setPlanGuideError] = useState("");
  const [planGuideAdding, setPlanGuideAdding] = useState(false);
  const planGuideInputRef = useRef(null);
  const chatEndRef = useRef(null);
  // chi tiết sư phạm / soạn dạy / công cụ — phục vụ quá trình
  const [quizCount, setQuizCount] = useState(3);
  const [quizDifficulty, setQuizDifficulty] = useState("Hỗn hợp");
  const [quizType, setQuizType] = useState("Trắc nghiệm");
  const [quizIncludeExplain, setQuizIncludeExplain] = useState(true);
  const [showQuizOptions, setShowQuizOptions] = useState(false);

  // ── Drawing (DrawBoard v2 — state sống trong CanvasWhiteboard, đây chỉ giữ feedback AI) ──
  const [drawFeedback, setDrawFeedback] = useState("");
  const [drawLoading, setDrawLoading] = useState(false);

  // ── Quiz ───────────────────────────────────────────────────────
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizScore, setQuizScore] = useState(null);
  const [quizError, setQuizError] = useState("");
  const quizQuestionIdsRef = useRef([]);

  // ── TTS ────────────────────────────────────────────────────────
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsRate, setTtsRate] = useState(1.0);

  // ── Word lookup ────────────────────────────────────────────────
  const [selWord, setSelWord] = useState("");
  const [wordExpl, setWordExpl] = useState("");
  const [wordLoading, setWordLoading] = useState(false);
  const [savingWord, setSavingWord] = useState(false);

  // ── Study tools (TOC cột, structured notes, glossary) ─────
  const [tocItems, setTocItems] = useState([]);
  const [tocQuery, setTocQuery] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  // TOC page manual edit — click vào số trang để sửa
  const [editingTocIdx, setEditingTocIdx] = useState(null);
  const [editingTocVal, setEditingTocVal] = useState("");
  const [bulkDelta, setBulkDelta] = useState("");

  // ── Research: CTGDPT tags + clip collections (trích đoạn) ────
  const [showTag, setShowTag] = useState(false);
  const [showClip, setShowClip] = useState(false);
  const [clipText, setClipText] = useState("");
  const [clipCollName, setClipCollName] = useState("");
  const pendingSelRef = useRef("");

  // ── Bookmarks (đánh dấu trang) ────────────────────────────────
  const [bookmarkedPages, setBookmarkedPages] = useState(() =>
    bookmarkPagesFor(book.filename),
  );
  useEffect(() => {
    setBookmarkedPages(bookmarkPagesFor(book.filename));
  }, [book.filename]);

  // ── Compact toolbar popovers ───────────────────────────────────
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [showTtsMenu, setShowTtsMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const zoomMenuRef = useRef(null);
  const ttsMenuRef = useRef(null);
  const moreMenuRef = useRef(null);

  // ── Toasts ─────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);

  const canvasRef = useRef(null);
  const canvas2Ref = useRef(null);
  const renderTaskRef = useRef(null);
  const renderTask2Ref = useRef(null);
  const viewportContainerRef = useRef(null);
  const panStartRef = useRef(null);
  const panMovedRef = useRef(false);
  const lastPanEndRef = useRef(0);
  const manualZoomRef = useRef(true);
  const toastIdRef = useRef(0);
  const pendingPinIdRef = useRef(null);
  const renderGenRef = useRef(0);
  const pageWidthRef = useRef(0);
  const pageHeightRef = useRef(0);
  const aiAbortRef = useRef(null);
  const aiRequestRef = useRef(null);
  const noteEditableRef = useRef(null);
  const noteComposingRef = useRef(false);
  // Refs to keep fitToWidth stable — tránh tự động zoom khi đổi trang (pageNum thay đổi làm fitToWidth đổi identity → các effect fit lại vô tình chạy)
  const pageNumRef = useRef(pageNum);
  const numPagesRef = useRef(numPages);
  const twoPageModeRef = useRef(twoPageMode);
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  useEffect(() => { pageNumRef.current = pageNum; }, [pageNum]);
  useEffect(() => { numPagesRef.current = numPages; }, [numPages]);
  useEffect(() => { twoPageModeRef.current = twoPageMode; }, [twoPageMode]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panXRef.current = panX; }, [panX]);
  useEffect(() => { panYRef.current = panY; }, [panY]);

  const notify = useCallback((msg, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    // Semantic sound — single source, avoids duplicate per-caller sounds
    try {
      if (type === "success") soundManager.play("success");
      else if (type === "error") soundManager.play("error");
      else if (type === "warning") soundManager.play("warning");
      else if (type === "info") soundManager.play("notification");
    } catch {}
  }, []);

  // ── Xuất sách Word (.html) ra file .docx thật — giữ định dạng, mở bằng Word sửa tiếp ──
  const handleExportWord = useCallback(async ()=>{
    if (!htmlBookContent || !htmlBookContent.replace(/<[^>]*>/g," ").trim()) { notify("Sách chưa có nội dung để xuất Word.", "warning"); return; }
    setExportingWord(true);
    try {
      const { exportHtmlToDocx } = await import("./wordDocx.js");
      await exportHtmlToDocx(htmlBookContent, book.title || "tai-lieu-word");
      notify(`Đã xuất "${(book.title || "tài liệu Word").slice(0,48)}.docx" — mở bằng Word để xem/sửa tiếp.`, "success");
    } catch (e) {
      notify(uiMessage(e, "Không xuất được file Word."), "error");
    } finally {
      setExportingWord(false);
    }
  },[htmlBookContent, book.title, notify]);

  // ── Load PDF on book change ────────────────────────────────────
  const loadBook = useCallback(
    (b) => {
      // Validate book object
      if (!b || !b.filename) {
        setPdfError("Không thể mở sách: thông tin sách không hợp lệ.");
        notify("Không thể mở sách: thông tin sách không hợp lệ.", "error");
        return;
      }

      let active = true;
      // Abort any in-flight Gemini requests so replies from the old book
      // can never land in the new book's session
      if (aiAbortRef.current) aiAbortRef.current.abort();
      aiAbortRef.current = new AbortController();
      // Reset per-book UI state to prevent leak from previous book — free zoom không auto-fit
      manualZoomRef.current = true;
      setPanX(0);
      setPanY(0);
      setPdfDoc(null);
      setPdfError("");
      setPageText("");
      setPageIsImage(false);
      setPageImageBase64("");
      setQuizQuestions([]);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizError("");
      setQuizFrom("");
      setQuizTo("");
      setPlanFrom("");
      setPlanTo("");
      setPlanTitle("");
      setPlanCustom("");
      setPlanError("");
      setPlanGuideImages([]);
      setPlanGuideError("");
      if (planGuideInputRef.current) planGuideInputRef.current.value = "";
      setDrawFeedback("");
      setSelWord("");
      setWordExpl("");
      setTocItems([]);
      setShowNotes(false);
      setShowGlossary(false);
      // Load per-book chat: prefer saved history, else greeting (single set to avoid persist race) — per-book isolation via `chat_${filename}`
      const savedChat = safeGetJSON(`chat_${b.filename}`, null, (x) => x != null && typeof x === "object" && Array.isArray(x.messages));
      if (
        savedChat &&
        Array.isArray(savedChat.messages) &&
        savedChat.messages.length
      ) {
        setChatMessages(savedChat.messages);
      } else {
        setChatMessages([
          {
            role: "ai",
            text: `Chào thầy/cô! 🌟 Tôi sẵn sàng hỗ trợ thầy/cô nghiên cứu cuốn **"${b.title || "sách này"}"** rồi đây! Thầy/cô muốn phân tích nội dung gì không? 😊`,
          },
        ]);
      }
      setAnalysisPages([]);
      setAnalysisResult("");
      setAnalysisError("");
      setAnalyzeFrom("");
      setAnalyzeTo("");
      setChatFrom("");
      setChatTo("");

      const ext = String(b.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
      const isPdfExt = ext === ".pdf";
      if (!isPdfExt) {
        // Non-PDF: không dùng pdf.js, hiển thị viewer thay thế (xử lý ở phần render)
        setNumPages(1);
        setPdfError("");
        return;
      }
      const pdfUrl = `${API_BASE}/api/books/${encodeURIComponent(b.filename)}`;
      let loadingTask = null;
      let pdf = null;

      if (!pdfjsLib) {
        setPdfError("PDF.js chưa được tải. Vui lòng tải lại trang.");
        notify("PDF.js chưa được tải. Vui lòng tải lại trang.", "error");
        return;
      }

      loadingTask = pdfjsLib.getDocument({ url: pdfUrl, isEvalSupported: false });
      loadingTask.promise
        .then((loadedPdf) => {
          if (!active) {
            // If component unmounted during load, destroy the PDF immediately
            loadedPdf.destroy();
            return;
          }
          pdf = loadedPdf;
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setPdfError("");
          // Clamp start page to the loaded document (in case of stale bookmark/vocab record)
          setPageNum((p) =>
            Number.isFinite(p) ? Math.max(1, Math.min(p, pdf.numPages)) : 1,
          );
        })
        .catch((err) => {
          // AbortError / Transport destroyed khi chuyển sách nhanh — bỏ qua, không hiện lỗi
          const msg = String(err?.message || err?.name || "");
          const isAbort = err?.name === "AbortError" || msg.includes("AbortError") || msg.includes("Transport destroyed") || msg.includes("Worker was terminated") || msg.includes("cancel");
          if (isAbort) return;
          console.error("PDF load error:", err);
          if (active) {
            setPdfError(
              "Không thể mở sách. File PDF có thể bị hỏng hoặc máy chủ đang bận. Thầy/cô hãy thử lại nhé!",
            );
            notify("Không thể mở sách. Vui lòng thử lại.", "error");
          }
        });

      return () => {
        active = false;
        // Clean up PDF document to prevent memory leak
        if (pdf) {
          try {
            pdf.destroy();
          } catch (err) {
            console.error("Error destroying PDF document:", err);
          }
        }
        // Cancel loading task if still in progress
        if (loadingTask) {
          try {
            loadingTask.destroy();
          } catch (err) {
            console.error("Error destroying PDF loading task:", err);
          }
        }
      };
    },
    [notify],
  );

  useEffect(() => {
    const cleanup = loadBook(book);
    return cleanup;
  }, [book, loadBook]);

  // Persist chat history per book so each book keeps its own conversation — per-book isolation, quota handling không silently fail
  useEffect(() => {
    const key = `chat_${book.filename}`;
    const res = safeSetJSON(key, { messages: chatMessages.slice(-60) });
    if (!res.ok) {
      if (res.quota) {
        console.warn(`[BookReader] Quota exceeded for ${key}, giữ dữ liệu cũ và thử lưu rút gọn`, res.message);
        const fb = safeSetJSON(key, { messages: chatMessages.slice(-20) });
        if (!fb.ok) console.warn(`[BookReader] Fallback save failed for ${key}:`, fb.error, fb.message);
      } else {
        console.warn(`[BookReader] Failed to persist ${key}:`, res.error, res.message);
      }
    }
  }, [book.filename, chatMessages]);

  // ── Fit page to container width ──────────────────────────────── (delegated to reader/zoomController)
  const clampZoom = useCallback((value) => clampZoomHelper(value), []);

  // Clamp pan: khi trang nhỏ hơn khung thì khóa ở 0 (không trôi), ngược lại giữ trong biên — origin center center
  const clampPan = useCallback((px, py, curZoom) => {
    const container = viewportContainerRef.current;
    if (!container || !pageWidthRef.current) return { x: px, y: py };
    const availW = Math.max(220, container.clientWidth - 48);
    const availH = Math.max(200, container.clientHeight - 32 || 600);
    const isTwo = twoPageModeRef.current && pageNumRef.current + 1 <= numPagesRef.current;
    const gap = isTwo ? 16 : 0;
    const totalW = (isTwo ? pageWidthRef.current * 2 + gap : pageWidthRef.current) * curZoom;
    const pageH = pageHeightRef.current || pageWidthRef.current * 1.414;
    const totalH = pageH * curZoom;
    // Nếu nội dung vừa/khít khung → khóa pan = 0 để không trôi ra khoảng trắng
    if (totalW <= availW && totalH <= availH) return { x: 0, y: 0 };
    if (totalW <= availW) px = 0;
    if (totalH <= availH) py = 0;
    const maxX = totalW > availW ? (totalW - availW) / 2 + 32 : 0;
    const maxY = totalH > availH ? (totalH - availH) / 2 + 40 : 0;
    return {
      x: maxX ? Math.max(-maxX, Math.min(maxX, px)) : 0,
      y: maxY ? Math.max(-maxY, Math.min(maxY, py)) : 0,
    };
  }, []);

  const fitToWidth = useCallback((force = false) => {
    if (!pdfDoc) return;
    const container = viewportContainerRef.current;
    if (!container) return;
    // Free zoom: chỉ fit khi người dùng bấm nút "Vừa khổ trang" hoặc phím tắt (force=true)
    // Không tự động fit khi đổi trang / resize / chuyển chế độ
    if (manualZoomRef.current && !force) return;
    const avail = Math.max(220, container.clientWidth - 48);
    const cur = pageNumRef.current;
    const getW = pdfDoc
      .getPage(cur)
      .then((pg) => {
        const vp = pg.getViewport({ scale: 1 });
        if (cur === 1) {
          pageWidthRef.current = vp.width;
          pageHeightRef.current = vp.height;
        }
        return vp.width;
      })
      .catch(() => {
        if (pageWidthRef.current > 0) return pageWidthRef.current;
        return pdfDoc.getPage(1).then((pg) => {
          const vp = pg.getViewport({ scale: 1 });
          pageWidthRef.current = vp.width;
          pageHeightRef.current = vp.height;
          return vp.width;
        });
      });
    getW
      .then((w) => {
        const s = calcFitZoom({
          availWidth: avail,
          pageWidth: w,
          twoPageMode: twoPageModeRef.current,
          pageNum: pageNumRef.current,
          numPages: numPagesRef.current,
        });
        const clamped = clampPan(0, 0, s);
        setPanX(clamped.x);
        setPanY(clamped.y);
        setZoom(s);
      })
      .catch(() => {});
  }, [pdfDoc, clampPan]);

  const handleViewportWheel = useCallback(
    (event) => {
      if (!pdfDoc) return;
      const container = viewportContainerRef.current;
      if (!container) return;
      // Phân biệt trackpad: Ctrl/Cmd + wheel (pinch) => zoom, còn lại => pan (di chuyển)
      // Điều này giúp 2 ngón kéo trên touchpad sẽ pan, chỉ chụm/mở mới zoom
      const isZoomGesture = event.ctrlKey || event.metaKey;
      try {
        if (event.cancelable) event.preventDefault();
      } catch {}
      if (!isZoomGesture) {
        // Pan bằng wheel/trackpad 2 ngón (không zoom)
        let dx = event.deltaX;
        let dy = event.deltaY;
        if (event.deltaMode === 1) { dx *= 16; dy *= 16; }
        else if (event.deltaMode === 2) { dx *= 100; dy *= 100; }
        const rawX = panXRef.current - dx;
        const rawY = panYRef.current - dy;
        const clamped = clampPan(rawX, rawY, zoomRef.current);
        if (clamped.x !== panXRef.current) setPanX(clamped.x);
        if (clamped.y !== panYRef.current) setPanY(clamped.y);
        return;
      }
      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const oldZoom = zoomRef.current;
      const nextZoom = calcWheelZoom(oldZoom, event.deltaY, event.deltaMode);
      if (nextZoom === oldZoom) return;
      const scaleRatio = nextZoom / oldZoom;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const curPanX = panXRef.current;
      const curPanY = panYRef.current;
      const rawX = (curPanX - (pointerX - cx)) * scaleRatio + (pointerX - cx);
      const rawY = (curPanY - (pointerY - cy)) * scaleRatio + (pointerY - cy);
      const clamped = clampPan(rawX, rawY, nextZoom);
      setPanX(clamped.x);
      setPanY(clamped.y);
      setZoom(nextZoom);
      manualZoomRef.current = true;
    },
    [pdfDoc, clampPan],
  );

  // Gắn wheel native với passive:false để preventDefault chặn scroll trang và zoom mượt
  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el || !pdfDoc) return;
    const onWheelNative = (e) => {
      // Khi đang quét vùng thì không zoom
      if (scanMode) return;
      handleViewportWheel(e);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [pdfDoc, scanMode, handleViewportWheel]);

  // Pinch zoom + 2-finger pan cho touch devices / trackpad
  // 2 ngón kéo song song => pan (di chuyển), chụm/mở ngược chiều => zoom
  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el || !pdfDoc) return;
    let startDist = 0;
    let startZoom = 1;
    let startMid = null;
    let startPan = null;
    let mode = null; // 'pan' | 'zoom' | null
    const getDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const getMid = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        startDist = getDist(e.touches);
        startZoom = zoomRef.current;
        startMid = getMid(e.touches);
        startPan = { x: panXRef.current, y: panYRef.current };
        mode = null;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && startDist > 0 && startMid && startPan) {
        e.preventDefault();
        const dist = getDist(e.touches);
        const curMid = getMid(e.touches);
        const ratio = dist / startDist;
        const distDelta = Math.abs(dist - startDist);
        // Xác định cử chỉ: nếu khoảng cách thay đổi đủ lớn => zoom, ngược lại => pan
        if (!mode) {
          if (distDelta > 12 || Math.abs(ratio - 1) > 0.08) mode = "zoom";
          else if (Math.hypot(curMid.x - startMid.x, curMid.y - startMid.y) > 4) mode = "pan";
          else return; // chưa đủ ngưỡng
        }
        if (mode === "pan") {
          const dx = curMid.x - startMid.x;
          const dy = curMid.y - startMid.y;
          const clamped = clampPan(startPan.x + dx, startPan.y + dy, zoomRef.current);
          setPanX(clamped.x);
          setPanY(clamped.y);
          return;
        }
        // mode === "zoom": chụm/mở ngược chiều
        const next = clampZoomHelper(startZoom * ratio);
        if (next === zoomRef.current && Math.abs(curMid.x - startMid.x) < 1 && Math.abs(curMid.y - startMid.y) < 1) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        // Giữ điểm world dưới midpoint cố định, đồng thời cho phép midpoint di chuyển
        const wx = (startMid.x - rect.left - startPan.x) / startZoom;
        const wy = (startMid.y - rect.top - startPan.y) / startZoom;
        const newPan = {
          x: curMid.x - rect.left - wx * next,
          y: curMid.y - rect.top - wy * next,
        };
        const clamped = clampPan(newPan.x, newPan.y, next);
        setPanX(clamped.x);
        setPanY(clamped.y);
        setZoom(next);
        manualZoomRef.current = true;
      }
    };
    const onTouchEnd = () => { startDist = 0; startMid = null; startPan = null; mode = null; };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pdfDoc, clampPan]);

  const handlePanPointerDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      // Double left click must create note, not start pan
      if (event.detail === 2) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "button, a, input, textarea, select, [contenteditable], .note-pin, .note-popup, .note-input-popup, .note-input-popup *",
        )
      ) {
        return;
      }
      const container = viewportContainerRef.current;
      if (!container) return;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX,
        panY,
      };
      panMovedRef.current = false;
      setIsDraggingPan(true);
      // Do NOT use setPointerCapture — it suppresses native dblclick (note creation) on many browsers.
      // Pan still works within the container via pointermove; window-level fallback not needed.
    },
    [panX, panY],
  );

  const handlePanPointerMove = useCallback((event) => {
    if (!panStartRef.current) return;
    try {
      if (event.cancelable) event.preventDefault();
    } catch {}
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panMovedRef.current = true;
    const rawX = panStartRef.current.panX + dx;
    const rawY = panStartRef.current.panY + dy;
    const clamped = clampPan(rawX, rawY, zoomRef.current);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }, [clampPan]);

  const handlePanPointerUp = useCallback((event) => {
    if (!panStartRef.current) return;
    if (panMovedRef.current) lastPanEndRef.current = Date.now();
    panStartRef.current = null;
    setIsDraggingPan(false);
  }, []);

  const handlePanPointerLeave = useCallback(() => {
    if (!panStartRef.current) return;
    if (panMovedRef.current) lastPanEndRef.current = Date.now();
    panStartRef.current = null;
    setIsDraggingPan(false);
  }, []);

  // Free zoom: không tự động fit khi tải document — giữ zoom do người dùng chọn (mặc định 100%)
  useEffect(() => {
    if (!pdfDoc) return;
    // Chỉ khởi tạo pageWidthRef để hỗ trợ pan, không đổi zoom
    const container = viewportContainerRef.current;
    if (!container) return;
    const cur = pageNumRef.current;
    pdfDoc.getPage(cur).then((pg) => {
      const vp = pg.getViewport({ scale: 1 });
      pageWidthRef.current = vp.width;
      pageHeightRef.current = vp.height;
    }).catch(() => {});
  }, [pdfDoc]);

  // Free zoom: không tự động fit trên window resize — chỉ clamp pan nếu cần
  useEffect(() => {
    if (!pdfDoc) return;
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const c = clampPan(panXRef.current, panYRef.current, zoomRef.current);
        if (c.x !== panXRef.current) setPanX(c.x);
        if (c.y !== panYRef.current) setPanY(c.y);
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [pdfDoc]);

  // Free zoom: không tự động fit khi đổi layout — chỉ clamp pan để không trôi trang
  const refitIfNeeded = useCallback(() => {
    const c = clampPan(panXRef.current, panYRef.current, zoomRef.current);
    if (c.x !== panXRef.current) setPanX(c.x);
    if (c.y !== panYRef.current) setPanY(c.y);
  }, [clampPan]);

  useEffect(() => {
    refitIfNeeded();
  }, [twoPageMode, refitIfNeeded]);

  useEffect(() => {
    if (!pdfDoc) return;
    const id = setTimeout(refitIfNeeded, 360);
    return () => clearTimeout(id);
  }, [aiCollapsed, tocCollapsed, fullscreen, pdfDoc, refitIfNeeded]);

  // Clamp pan when zoom changes (prevents blank view after zoom max/min or expand)
  useEffect(() => {
    if (!pdfDoc) return;
    const c = clampPan(panX, panY, zoom);
    if (c.x !== panX) setPanX(c.x);
    if (c.y !== panY) setPanY(c.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp after zoom only
  }, [zoom]);

  // Free zoom: ResizeObserver chỉ clamp pan, không auto-fit
  useEffect(() => {
    if (!pdfDoc || typeof window === "undefined" || !window.ResizeObserver) return;
    const target = viewportContainerRef.current?.parentElement;
    if (!target) return;
    let t;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        const c = clampPan(panXRef.current, panYRef.current, zoomRef.current);
        if (c.x !== panXRef.current) setPanX(c.x);
        if (c.y !== panYRef.current) setPanY(c.y);
      }, 140);
    });
    ro.observe(target);
    const vp = viewportContainerRef.current;
    if (vp) ro.observe(vp);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [pdfDoc, fullscreen]);

  // ── Close compact popovers on outside click / Esc ──────────────
  useEffect(() => {
    if (!showZoomMenu && !showTtsMenu && !showMoreMenu) return;
    const onDocClick = (e) => {
      const t = e.target;
      if (
        zoomMenuRef.current &&
        !zoomMenuRef.current.contains(t) &&
        !t.closest?.("[data-zoom-trigger]")
      )
        setShowZoomMenu(false);
      if (
        ttsMenuRef.current &&
        !ttsMenuRef.current.contains(t) &&
        !t.closest?.("[data-tts-trigger]")
      )
        setShowTtsMenu(false);
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(t) &&
        !t.closest?.("[data-more-trigger]")
      )
        setShowMoreMenu(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowZoomMenu(false);
        setShowTtsMenu(false);
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showZoomMenu, showTtsMenu, showMoreMenu]);

  // ── Render page(s) when params change ─────────────────────────
  // A generation token guards against stale renders landing after a page change
  useEffect(() => {
    if (!pdfDoc) return;
    const token = ++renderGenRef.current;

    const renderOne = async (pNum, canvasEl, taskRef) => {
      if (!canvasEl || token !== renderGenRef.current) return null;
      if (taskRef.current) {
        taskRef.current.cancel();
        taskRef.current = null;
      }
      try {
        const page = await pdfDoc.getPage(pNum);
        if (token !== renderGenRef.current) return null;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = calcRenderScale(zoom, dpr);
        const vp = page.getViewport({ scale: renderScale });
        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
        }
        canvasEl.width = vp.width;
        canvasEl.height = vp.height;
        const cssVp = page.getViewport({ scale: clampZoomHelper(zoom) });
        canvasEl.style.width = `${cssVp.width}px`;
        canvasEl.style.height = `${cssVp.height}px`;
        canvasEl.style.imageRendering = "auto";
        const task = page.render({ canvasContext: ctx, viewport: vp });
        taskRef.current = task;
        await task.promise;
        if (token !== renderGenRef.current) return null;
        taskRef.current = null;
        return { page, canvasEl };
      } catch (err) {
        if (err.name !== "RenderingCancelledException") console.error(err);
        return null;
      }
    };

    const run = async () => {
      setIsRendering(true);
      try {
        if (token !== renderGenRef.current) return;
        const res = await renderOne(pageNum, canvasRef.current, renderTaskRef);
        if (token !== renderGenRef.current) return;

        const applyVisualState = async (
          pNum,
          canvasEl,
          pageStateSetter,
          textSetter,
          imageSetter,
        ) => {
          if (!canvasEl || !pageStateSetter) return;
          const page = await pdfDoc.getPage(pNum);
          const textContent = await page.getTextContent();
          const raw = textContent.items.map((i) => i.str).join(" ");
          const clean = cleanExtractedText(raw);
          const imageData = canvasEl
            .toDataURL("image/jpeg", 0.75)
            .split(",")[1];
          if (clean.length > 30) {
            textSetter(clean);
            pageStateSetter(false);
            imageSetter(imageData);
            return;
          }
          pageStateSetter(true);
          imageSetter(imageData);
          let cachedOcr = null;
          try {
            cachedOcr = await getOCR(book.filename, pNum);
          } catch {
            /* ignore */
          }
          if (cachedOcr) {
            textSetter(cachedOcr);
            pageStateSetter(false);
          } else {
            textSetter(
              "(Trang này dạng ảnh – AI đang nhận dạng hình ảnh để hỗ trợ giáo viên phân tích nội dung)",
            );
          }
        };

        if (res) {
          await applyVisualState(
            pageNum,
            res.canvasEl,
            setPageIsImage,
            setPageText,
            setPageImageBase64,
          );
        }

        if (twoPageMode && pageNum + 1 <= numPages) {
          const rightRes = await renderOne(
            pageNum + 1,
            canvas2Ref.current,
            renderTask2Ref,
          );
          if (token !== renderGenRef.current) return;
          if (rightRes) {
            await applyVisualState(
              pageNum + 1,
              rightRes.canvasEl,
              setRightPageIsImage,
              setRightPageText,
              setRightPageImageBase64,
            );
          }
        }
        if (token !== renderGenRef.current) return;

        if (token === renderGenRef.current) {
          const s = loadSettings();
          if (s.reading?.autoSaveProgress !== false) {
            saveLastPage(book.filename, pageNum, numPages);
          }
          try {
            emitPageRead(book.filename, pageNum);
            if (twoPageMode && pageNum + 1 <= numPages)
              emitPageRead(book.filename, pageNum + 1);
          } catch {}
        }
      } finally {
        if (token === renderGenRef.current) setIsRendering(false);
      }
    };

    run();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- latest ref values are intentionally read here
      renderGenRef.current++;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- latest ref values are intentionally read here
      const t1 = renderTaskRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- latest ref values are intentionally read here
      const t2 = renderTask2Ref.current;
      if (t1) t1.cancel();
      if (t2) t2.cancel();
    };
  }, [pdfDoc, pageNum, zoom, twoPageMode, numPages, book.filename]);

  // ── Load notes for the current spread (left page + right page) ─
  useEffect(() => {
    const merged = [...readPageNotes(pageNum), ...readPageNotes(pageNum + 1)];
    setNotes(merged);
    const pending = pendingPinIdRef.current;
    pendingPinIdRef.current = null;
    if (pending) {
      const found = merged.find((n) => n.id === pending);
      if (found) {
        setActiveNoteId(found.id);
        return;
      }
    }
    setActiveNoteId(null);
    setNoteInput(null);
    setNoteText("");
    setNoteImages([]);
    if (noteEditableRef.current) noteEditableRef.current.innerHTML = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readPageNotes is intentionally re-created each render
  }, [book, pageNum]);

  // ── Hydrate ảnh ghi chú từ IndexedDB (nền, không chặn render) ──
  // note.images[] chứa "idb:xxx" → resolve thành dataURL để <img> hiển thị được.
  useEffect(() => {
    let alive = true;
    const refs = new Set();
    for (const n of notes || []) for (const img of n?.images || []) if (isNoteImageRef(img)) refs.add(img);
    for (const img of noteImages || []) if (isNoteImageRef(img)) refs.add(img);
    const missing = [...refs].filter((r) => !resolvedNoteImgs[r]);
    if (!missing.length) return;
    resolveImageRefs(missing).then((map) => {
      if (!alive) return;
      const keys = Object.keys(map);
      if (!keys.length) return;
      setResolvedNoteImgs((prev) => ({ ...prev, ...map }));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolvedNoteImgs đọc để lọc missing
  }, [notes, noteImages]);

  // ── Tự di chuyển ảnh base64 cũ sang IndexedDB (1 lần / trang, nền) ──
  // Người dùng đang bị "bộ nhớ đầy" vì notes cũ ôm base64 trong localStorage.
  // Migration này viết lại key trang với ref "idb:xxx", giải phóng hàng MB quota
  // mà không mất ảnh nào. Chạy nền sau khi notes đã load, có guard tránh lặp.
  const migratedPagesRef = useRef(new Set());
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pages = [...new Set((notes || []).map((n) => n.pdfPage).filter(Number.isFinite))];
        for (const p of pages) {
          const mkey = `${book.filename}_${p}`;
          if (migratedPagesRef.current.has(mkey)) continue;
          migratedPagesRef.current.add(mkey);
          const key = `notes_${book.filename}_${p}`;
          const arr = safeGetJSON(key, [], (x) => Array.isArray(x));
          if (!Array.isArray(arr) || !arr.length) continue;
          const hasBigInline = arr.some((n) =>
            (n?.images || []).some((img) => typeof img === "string" && img.startsWith("data:") && img.length > 8 * 1024),
          );
          if (!hasBigInline) continue;
          const migrated = [];
          for (const n of arr) {
            if (!n?.images?.length) { migrated.push(n); continue; }
            const imgs = await persistNoteImages(n.images, book.filename);
            for (let i = 0; i < imgs.length; i++) {
              const ref = imgs[i];
              const src = n.images[i];
              if (isNoteImageRef(ref) && typeof src === "string" && src.startsWith("data:")) primeImageCache(ref, src);
            }
            migrated.push({ ...n, images: imgs });
          }
          if (!alive) return;
          const r = safeSetJSONWithQuotaRetry(key, migrated);
          if (r.ok) {
            setNotes((prev) => prev.map((n) => {
              const m = migrated.find((x) => x.id === n.id);
              return m || n;
            }));
            try {
              const allRefs = migrated.flatMap((n) => n.images || []).filter(isNoteImageRef);
              const map = await resolveImageRefs(allRefs);
              if (alive && Object.keys(map).length) setResolvedNoteImgs((prev) => ({ ...prev, ...map }));
            } catch {}
          }
        }
      } catch {}
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy khi notes/book đổi trang
  }, [notes, book.filename]);

  // ─── Note handlers ────────────────────────────────────────────
  const goToPage = useCallback(
    (n) => {
      const p = clampPage(n, numPages);
      const changed = p !== pageNum;
      setPageNum(p);
      setEditingPage(false);
      setPageInputVal("");
      if (changed) { try { soundManager.play("pageTurn"); } catch {} }
    },
    [numPages, pageNum],
  );

  // ── Bookmarks ─────────────────────────────────────────────────
  const isBookmarked = bookmarkedPages.includes(pageNum);
  const handleToggleBookmark = () => {
    // toggleBookmark (userdata.js) đã emit BOOKMARK_CREATED + DATA_UPDATED — không emit lại để tránh double-count
    const pages = toggleBookmark(book.filename, pageNum);
    setBookmarkedPages(pages);
    try { soundManager.play("bookmark"); } catch {}
    notify(
      pages.includes(pageNum)
        ? `Đã đánh dấu trang ${bookPage(pageNum)}.`
        : `Đã bỏ đánh dấu trang ${bookPage(pageNum)}.`,
    );
  };

  const jumpToPin = useCallback(
    (note) => {
      // Target page already visible: consume the pin immediately
      if (note.pdfPage === pageNum) {
        setActiveNoteId(note.id);
        return;
      }
      pendingPinIdRef.current = note.id;
      goToPage(note.pdfPage);
    },
    [goToPage, pageNum],
  );

  const refreshPins = useCallback(() => {
    setNotes([...readPageNotes(pageNum), ...readPageNotes(pageNum + 1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh current spread on demand
  }, [book.filename, pageNum]);

  // Keep a 2-page spread visible on load / when enabling 2-page mode.
  // Never snap when the user explicitly jumped to a page (bookmark/vocab/TOC).
  const explicitJumpRef = useRef(
    initialPage != null && Number(initialPage) >= 1,
  );
  useEffect(() => {
    if (
      twoPageMode &&
      numPages > 1 &&
      pageNum >= numPages &&
      !explicitJumpRef.current
    ) {
      setPageNum(numPages - 1);
    }
    explicitJumpRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only snap once per doc/mode change
  }, [twoPageMode, numPages]);

  // ── Auto-scroll chat ───────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Stop TTS on page change ────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setTtsActive(false);
    setTtsPaused(false);
  }, [pageNum]);

  // ── Close word bubble when clicking elsewhere ──────────────────
  useEffect(() => {
    if (!selWord) return;
    const close = () => setSelWord("");
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [selWord]);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  // Stable listener + latest-state closure — cực chi tiết, đọc từ settings.keyboard.shortcuts (mặc định đã có, user tự đổi trong Cài đặt > Phím tắt)
  const keyHandlerRef = useRef(() => {});
  keyHandlerRef.current = (e) => {
    if (matchesShortcut(e, getShortcut("global.close"))) {
      setEditingPage(false);
      setPageInputVal("");
      if (noteInput) {
        setNoteInput(null);
        setNoteText("");
        setNoteImages([]);
        if (noteEditableRef.current) noteEditableRef.current.innerHTML = "";
      }
      setSelWord("");
      setShowCommandPalette(false);
      setShowAdvancedDrawer(false);
      return;
    }
    const t = document.activeElement;
    const typing =
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable);
    // Bảng lệnh của Reader dùng phím riêng (reader.commandPalette — Alt+K).
    // Ctrl+K thuộc GlobalSearch: nếu vẫn bắt chung, Ctrl+K mở 2 overlay chồng nhau.
    if (matchesShortcut(e, getShortcut("reader.commandPalette"))) {
      e.preventDefault();
      setShowCommandPalette((v) => !v);
      setCommandPaletteSearch("");
      setSelectedCommandIndex(0);
      return;
    }
    if (typing || !pdfDoc || isRendering) return;
    // — Điều hướng trang —
    if (matchesShortcut(e, getShortcut("reader.prevPage"))) { e.preventDefault(); goToPage(pageNum - (twoPageMode ? 2 : 1)); return; }
    if (matchesShortcut(e, getShortcut("reader.nextPage"))) { e.preventDefault(); goToPage(pageNum + (twoPageMode ? 2 : 1)); return; }
    if (matchesShortcut(e, getShortcut("reader.goToPage"))) { e.preventDefault(); setEditingPage(true); setPageInputVal(String(bookPage(pageNum))); return; }
    if (matchesShortcut(e, getShortcut("reader.firstPage"))) { e.preventDefault(); goToPage(1); return; }
    if (matchesShortcut(e, getShortcut("reader.lastPage"))) { e.preventDefault(); goToPage(numPages); return; }
    // — Xem —
    if (matchesShortcut(e, getShortcut("reader.zoomIn"))) { e.preventDefault(); manualZoomRef.current = true; setZoom((z) => zoomInHelper(z)); return; }
    if (matchesShortcut(e, getShortcut("reader.zoomOut"))) { e.preventDefault(); manualZoomRef.current = true; setZoom((z) => zoomOutHelper(z)); return; }
    if (matchesShortcut(e, getShortcut("reader.fitToWidth"))) { e.preventDefault(); fitToWidth(true); return; }
    if (matchesShortcut(e, getShortcut("reader.toggleToc"))) { e.preventDefault(); setTocCollapsed((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.toggleAi"))) { e.preventDefault(); setAiCollapsed((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.toggleFullscreen"))) { e.preventDefault(); setFullscreen((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.toggleTwoPage"))) { e.preventDefault(); setTwoPageMode((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.toggleBookmark"))) { e.preventDefault(); handleToggleBookmark(); return; }
    // — AI —
    if (matchesShortcut(e, getShortcut("reader.aiChat"))) { e.preventDefault(); setAiCollapsed(false); setActiveTab("chat"); return; }
    if (matchesShortcut(e, getShortcut("reader.aiAnalyze"))) { e.preventDefault(); setAiCollapsed(false); setActiveTab("analyze"); return; }
    if (matchesShortcut(e, getShortcut("reader.aiQuiz"))) { e.preventDefault(); setAiCollapsed(false); setActiveTab("pedagogy"); return; }
    if (matchesShortcut(e, getShortcut("reader.aiLesson"))) { e.preventDefault(); setAiCollapsed(false); setActiveTab("lesson"); return; }
    if (matchesShortcut(e, getShortcut("reader.aiTools"))) { e.preventDefault(); setAiCollapsed(false); setActiveTab("tools"); return; }
    // — Công cụ —
    if (matchesShortcut(e, getShortcut("reader.ocr"))) { e.preventDefault(); setShowOcrDrawer((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.notes"))) { e.preventDefault(); setShowNotes((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.glossary"))) { e.preventDefault(); setShowGlossary((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.tags"))) { e.preventDefault(); setShowTag((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.clip"))) { e.preventDefault(); openClipDialog(); setShowClip(true); return; }
    if (matchesShortcut(e, getShortcut("reader.drawing"))) { e.preventDefault(); setAiCollapsed(false); setActiveTab("tools"); return; }
    if (matchesShortcut(e, getShortcut("reader.tts"))) { e.preventDefault(); setShowTtsMenu((v)=>!v); return; }
    if (matchesShortcut(e, getShortcut("reader.scan"))) { e.preventDefault(); setScanMode((v)=>!v); return; }
  };
  useEffect(() => {
    const onKey = (e) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable single subscription
  }, []);

  // Abort any remaining Gemini calls when the reader unmounts
  useEffect(
    () => () => {
      if (aiAbortRef.current) aiAbortRef.current.abort();
    },
    [],
  );

  // ─── Helpers ──────────────────────────────────────────────────
  const callAI = async (contents, systemInstruction, genConfig) => {
    if (!geminiKey) {
      throw new AIError(
        "Chưa có API Key! Hãy mở Cài đặt AI để nhập khóa nhé.",
        400,
        "NO_API_KEY",
      );
    }

    const bookSignal = aiAbortRef.current ? aiAbortRef.current.signal : null;
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const aiModel = (() => {
      try {
        return loadSettings().ai?.model || "gemini-2.5-flash";
      } catch {
        return "gemini-2.5-flash";
      }
    })();

    // Set up book abort listener
    let onBookAbort = null;
    if (bookSignal) {
      onBookAbort = () => aiService.cancelRequest(requestId);
      if (bookSignal.aborted) {
        aiService.cancelRequest(requestId);
        const drop = new Error("Đã đổi sách");
        drop.name = "BookChanged";
        throw drop;
      }
      bookSignal.addEventListener("abort", onBookAbort, { once: true });
    }

    try {
      // Phải nằm TRONG try: nếu throw phía trên thì finally không chạy →
      // ref/busy bị kẹt làm nút Dừng "đóng vai" đang chạy.
      aiRequestRef.current = requestId;
      setAiBusy(true);
      const text = await aiService.callAI({
        apiKey: geminiKey,
        model: aiModel,
        contents,
        systemInstruction,
        generationConfig: genConfig,
        requestId,
      });
      return text;
    } catch (err) {
      if (err.name === "BookChanged") throw err;
      // Đổi sách/unmount → abort → ném CANCELLED; 9 chỗ catch phía ngoài chỉ hiểu
      // "BookChanged" nên phải đổi tên để không hiện lỗi đỏ/ghi đè lên sách mới.
      if (err instanceof AIError && err.code === "CANCELLED" && bookSignal?.aborted) {
        const drop = new Error("Đã đổi sách");
        drop.name = "BookChanged";
        throw drop;
      }
      if (err instanceof AIError) throw err;
      throw new AIError(
        getFriendlyErrorMessage(err.status, err.message),
        err.status || 500,
        err.code || "AI_ERROR",
      );
    } finally {
      if (aiRequestRef.current === requestId) {
        aiRequestRef.current = null;
        setAiBusy(false);
      }
      if (bookSignal && onBookAbort) {
        bookSignal.removeEventListener("abort", onBookAbort);
      }
    }
  };

  // Nút Dừng: hủy request AI đang chạy trong cuốn sách này (không tự xóa ref —
  // phần finally của callAI lo việc đó để trạng thái busy luôn đúng)
  const stopAi = () => {
    const id = aiRequestRef.current;
    if (id) aiService.cancelRequest(id);
  };

  // Render any PDF page into a compressed JPEG (for AI to see pictures/diagrams)
  const renderPageAsJpeg = async (p, maxDim = 1100, quality = 0.72) => {
    try {
      const page = await pdfDoc.getPage(p);
      const vp = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport: vp,
      }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      return (await compressImageData(dataUrl, maxDim, quality)).split(",")[1];
    } catch {
      return "";
    }
  };

  const buildPageParts = async () => {
    // Word (html/txt/md) — dùng nội dung html y hệt PDF
    if (isWordFile) {
      const plain=(htmlBookContent||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
      const label=`Cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject}) — ${htmlBookPages.length||1} trang`;
      if (plain) return [{ text: `${label}. Nội dung:\n"${plain.slice(0,3500)}"` }];
      return [{ text: `${label}. Chưa có nội dung.` }];
    }
    const parts = [];
    const currentLabel = `Trang ${bookPage(pageNum)}/${totalBookPages || bookPage(numPages)} cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject})`;

    if (pageIsImage && pageImageBase64) {
      parts.push({
        text: `${currentLabel} hiển thị dạng hình ảnh, chữ chưa được nhận dạng. Hãy đọc kỹ cả chữ lẫn hình minh họa trong trang:`,
      });
      parts.push({
        inlineData: { mimeType: "image/jpeg", data: pageImageBase64 },
      });
    } else if (pageText) {
      parts.push({
        text: `${currentLabel}. Nội dung chữ của trang:\n"${pageText.slice(0, 900)}"`,
      });
      const img = await renderPageAsJpeg(pageNum);
      if (img) {
        parts.push({
          text: "Ngoài chữ trên, hãy xem kỹ ảnh chụp trang sách dưới đây để nhận diện đúng các hình vẽ, sơ đồ, bảng biểu, tranh minh họa trong bài rồi kết hợp cả chữ lẫn hình để trả lời:",
        });
        parts.push({ inlineData: { mimeType: "image/jpeg", data: img } });
      }
    }

    if (twoPageMode && pageNum + 1 <= numPages) {
      const rightLabel = `Trang ${bookPage(pageNum + 1)}/${totalBookPages || bookPage(numPages)} cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject})`;
      if (rightPageIsImage && rightPageImageBase64) {
        parts.push({
          text: `${rightLabel} là trang bên phải, hiển thị dạng hình ảnh, cần xem kỹ hình minh họa bên cạnh:`,
        });
        parts.push({
          inlineData: { mimeType: "image/jpeg", data: rightPageImageBase64 },
        });
      } else if (rightPageText) {
        parts.push({
          text: `${rightLabel}. Nội dung chữ của trang bên phải:\n"${rightPageText.slice(0, 900)}"`,
        });
        const img = await renderPageAsJpeg(pageNum + 1);
        if (img) {
          parts.push({
            text: "Trang bên phải có hình minh họa hoặc sơ đồ đi kèm, hãy xem thêm ảnh chụp bên dưới để nhận diện đúng nội dung:",
          });
          parts.push({ inlineData: { mimeType: "image/jpeg", data: img } });
        }
      }
    }

    return parts.length
      ? parts
      : [
          {
            text: `${currentLabel}. Không có dữ liệu hình ảnh hoặc chữ để phân tích.`,
          },
        ];
  };

  // Text of one page; if the page is image-only, render it as a JPEG instead
  const extractChatPage = async (p) => {
    if (isWordFile) {
      const idx=Math.max(1,p-1)-1;
      const plain=(htmlBookPages[idx]||htmlBookContent||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
      return { text: plain.slice(0,1500), image:"" };
    }
    const page = await pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    const clean = cleanExtractedText(tc.items.map((i) => i.str).join(" "));
    if (clean.length > 30) return { text: clean, image: "" };
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp })
      .promise;
    const url = await compressImageData(
      canvas.toDataURL("image/jpeg", 0.8),
      1100,
      0.7,
    );
    return { text: "", image: url.split(",")[1] };
  };

  // Parts for a chosen range of book pages (used by the Tutor chat)
  const buildRangeParts = async (from, to) => {
    if (isWordFile) {
      const partsW = [{ text: `Đây là các trang ${from}–${to} cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject}). Thầy/cô hỏi dựa trên các trang này:` }];
      const s = Math.max(1, from)-1, e = Math.min(htmlBookPages.length||1, to)-1;
      for(let i=s;i<=e;i++){
        const plain=(htmlBookPages[i]||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,1000);
        if(plain) partsW.push({ text: `\n--- Trang ${i+1} ---\n${plain}` });
      }
      return partsW;
    }
    const parts = [
      {
        text: `Đây là các trang sách ${from}–${to} cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject}). Thầy/cô hỏi dựa trên các trang này, hãy kết hợp cả chữ lẫn hình để trả lời theo góc nhìn sư phạm (giáo viên → học sinh):`,
      },
    ];
    for (let p = from + 1; p <= to + 1; p++) {
      const r = await extractChatPage(p);
      if (r.text) {
        parts.push({
          text: `\n--- Trang sách ${p - 1} ---\n${r.text.slice(0, 1000)}`,
        });
      } else if (r.image) {
        parts.push({
          text: `\n--- Trang sách ${p - 1} (dạng ảnh, đính kèm hình bên dưới) ---`,
        });
        parts.push({ text: `Ảnh trang ${p - 1}:` });
        parts.push({ inlineData: { mimeType: "image/jpeg", data: r.image } });
      }
    }
    return parts;
  };

  // Resolve a page range the user picked (null = current page only)
  const resolveRange = (fromVal, toVal) => {
    const total = totalBookPages || 1;
    const f =
      fromVal && !isNaN(parseInt(fromVal, 10))
        ? Math.max(1, Math.min(total, parseInt(fromVal, 10)))
        : null;
    const t =
      toVal && !isNaN(parseInt(toVal, 10))
        ? Math.max(1, Math.min(total, parseInt(toVal, 10)))
        : null;
    if (f == null && t == null) return null;
    const from = f ?? Math.min(t ?? total, bookPage(pageNum));
    const to = t ?? from;
    if (to < from)
      return {
        error: "Trang kết thúc phải lớn hơn hoặc bằng trang bắt đầu nhé!",
      };
    if (to - from + 1 > 7)
      return {
        error:
          "Tối đa 7 trang cho mỗi lần hỏi. Hãy thu hẹp khoảng trang rồi thử lại nhé!",
      };
    return { from, to };
  };

  // ── TOC cột: load per-file — ưu tiên cache per-file, rồi TOC riêng file, rồi static chung
  useEffect(() => {
    if (!pdfDoc) {
      setTocItems([]);
      return;
    }
    const cacheKey = `toc_${book.filename}`;
    const cached = safeGetJSON(cacheKey, null, (v) => v && typeof v === "object" && Array.isArray(v.items));
    if (cached && Array.isArray(cached.items) && cached.items.length) {
      setTocItems(cached.items);
      return;
    }
    const staticBook = findTocBook(book);
    if (staticBook?.items?.length) {
      const items = staticBook.items.map((it, idx) => ({
        ...it,
        pdfPage: it.page, // PDF page = printed page + offset (cover)
        title: it.title,
        page: it.page,
        depth: it.depth ?? 0,
      }));
      setTocItems(items);
      return;
    }
    let cancelled = false;
    pdfDoc
      .getOutline()
      .then(async (outline) => {
        if (cancelled || !outline?.length) return;
        const flat = [];
        const walk = async (items, depth) => {
          for (const item of items) {
            if (item.dest) {
              try {
                const idx = await pdfDoc.getPageIndex(item.dest[0]);
                flat.push({
                  title: item.title,
                  page: idx + 1,
                  pdfPage: idx + 1,
                  depth,
                });
              } catch {}
            }
            if (item.items?.length) await walk(item.items, depth + 1);
          }
        };
        await walk(outline, 0);
        if (!cancelled && flat.length) {
          setTocItems(flat);
          const r = safeSetJSON(cacheKey, { items: flat });
          if (!r.ok) console.warn(`[BookReader] Failed to cache TOC for ${cacheKey}:`, r.error, r.message, "giữ dữ liệu cũ");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, book]);

  // ── Word (html/txt/md) TOC: parse headings → y hệt PDF ── per-file
  useEffect(() => {
    if (!isWordFile) return;
    const cacheKeyW = `toc_${book.filename}`;
    const cachedW = safeGetJSON(cacheKeyW, null, (v) => v && typeof v === "object" && Array.isArray(v.items));
    if (cachedW && Array.isArray(cachedW.items) && cachedW.items.length) {
      setTocItems(cachedW.items);
      return;
    }
    // Ưu tiên TOC riêng file (fileKey) rồi mới static chung
    const staticWord = findTocBook(book);
    if (staticWord?.items?.length) {
      setTocItems(staticWord.items.map((it)=>({ ...it, pdfPage: it.page, page: it.page, depth: it.depth ?? 0 })));
      return;
    }
    if (!htmlBookContent || htmlBookLoading) {
      // chờ load xong sẽ chạy lại khi htmlBookPages thay đổi
      if(!htmlBookContent) setTocItems([]);
      return;
    }
    try {
      const tmp=document.createElement("div");
      tmp.innerHTML=htmlBookContent;
      const heads=tmp.querySelectorAll("h1,h2,h3");
      if(!heads.length){
        // fallback 1 mục cho sách word
        setTocItems([{ id:"word-toc-0", title: book.title || "Nội dung chính", page:1, pdfPage:1, depth:0 }]);
        return;
      }
      const items=Array.from(heads).map((el, idx)=>{
        const tag=el.tagName.toLowerCase();
        const depth=tag==="h1"?0: tag==="h2"?1:2;
        // phân trang ước lượng theo htmlBookPages
        const page=Math.min(htmlBookPages.length||1, Math.max(1, Math.floor(idx * (htmlBookPages.length||1) / heads.length)+1));
        return { id:`word-toc-${idx}`, title: (el.textContent||"").trim().slice(0,90) || `Mục ${idx+1}`, page, pdfPage: page, depth };
      });
      setTocItems(items);
    } catch { setTocItems([]); }
  }, [isWordFile, htmlBookContent, htmlBookLoading, htmlBookPages.length, book]);

  // ── Tải mục lục sách đang mở (nút trong mục lục) — tải từng sách
  const handleDownloadToc = async () => {
    try {
      const staticBook = findTocBook(book);
      let bookForExport;
      if (staticBook?.items?.length) {
        bookForExport = staticBook;
      } else if (tocItems.length) {
        bookForExport = {
          key: `${String(book.subject || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")}${book.grade}t${book.term}`,
          title: book.title || book.filename || "muc-luc",
          grade: book.grade,
          subject: book.subject,
          term: book.term,
          items: tocItems.map((it) => ({
            title: it.title || "",
            sub: it.sub || "",
            page: it.page || it.pdfPage || 1,
            depth: it.depth || 0,
            tuann: it.tuann || "",
          })),
        };
      } else {
        alert("Chưa có mục lục cho sách này để tải.");
        return;
      }
      const data = await exportTocSimple([bookForExport]);
      const blob = new Blob([data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName =
        String(book.title || book.filename || "muc-luc")
          .replace(/[^\w\u00C0-\u024F\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-") || "muc-luc";
      a.download = `muc-luc-${safeName}-2cot.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert("Không tải được mục lục: " + (e?.message || "lỗi"));
    }
  };
  // Nạp buffer Excel mục lục vào panel + store — dùng chung cho upload Excel
  // và luồng AI tạo mục lục từ ảnh (thay thế toàn bộ mục cũ).
  const applyTocBuffer = async (buf) => {
    const fileKey = makeFileTocKey(book);
    const selected = findTocBook(book) || {
      key: fileKey || `${String(book.subject || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")}${book.grade}t${book.term}`,
      title: book.title || book.filename || "muc-luc",
      grade: book.grade,
      subject: book.subject,
      term: book.term,
    };
    const parsed = await parseTocExcel(buf, selected);
    const forCurrent =
      parsed.find((b) => b.key === selected.key) || parsed[0];
    if (!forCurrent) throw new Error("Không đọc được mục lục");
    // Lưu per-file để không chia sẻ sang sách khác cùng subject/grade/term
    const toStore = fileKey ? { ...forCurrent, key: fileKey, title: book.title || forCurrent.title } : forCurrent;
    upsertTocBook(toStore);
    const newItems = toStore.items.map((it) => ({
      ...it,
      pdfPage: it.page,
      page: it.page,
    }));
    setTocItems(newItems);
    {
      const r = safeSetJSON(`toc_${book.filename}`, { items: newItems });
      if (!r.ok) console.warn(`[BookReader] Failed to persist toc_${book.filename}:`, r.error, r.message, "giữ dữ liệu cũ");
    }
    return { count: newItems.length, title: toStore.title };
  };

  const handleUploadToc = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const { count, title } = await applyTocBuffer(buf);
      alert(`Đã tải lên ${count} mục cho "${title}"`);
    } catch (e) {
      alert("Không tải được mục lục: " + (e?.message || "lỗi"));
    } finally {
      if (tocFileRef.current) tocFileRef.current.value = "";
    }
  };

  // ── TOC: AI đọc ẢNH trang mục lục → Excel 2 cột Tên/Trang → nạp thẳng vào panel
  const handleTocAiFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || tocAiBusy) return;
    if (!geminiKey) {
      notify("Chưa có API Key! Hãy mở Cài đặt AI để nhập khóa nhé.", "error");
      return;
    }
    const errs = validateTocAiFiles(files);
    if (errs.length) {
      notify(errs[0], "warning");
      if (tocAiFileRef.current) tocAiFileRef.current.value = "";
      return;
    }
    setTocAiBusy(true);
    try {
      const imageParts = await buildTocAiImageParts(files);
      if (!imageParts.length) {
        throw new Error("Không đọc được ảnh nào — hãy chọn ảnh JPG/PNG rõ nét trang mục lục.");
      }
      const totalPages = isWordFile ? (htmlBookPages.length || 0) : (numPages || 0);
      const { userText, systemInstruction, generationConfig } = buildTocAiPrompt({
        bookTitle: book.title,
        subject: book.subject,
        grade: book.grade,
        imageCount: imageParts.length / 2, // mỗi ảnh = 1 nhãn text + 1 inlineData
        totalPages,
      });
      const text = await callAI(
        [{ role: "user", parts: [...imageParts, { text: userText }] }],
        systemInstruction,
        generationConfig,
      );
      const { items, warnings } = cleanTocAiItems(parseJSONSafe(text), { totalPages });
      if (!items.length) {
        throw new Error("AI không nhận diện được mục nào từ ảnh — hãy chụp lại trang mục lục rõ nét hơn.");
      }
      // Dựng file Excel 2 cột Tên/Trang ngay trong bộ nhớ, nạp qua pipeline cũ
      const buf = await exportTocSimple([{ items }]);
      const { count } = await applyTocBuffer(buf);
      notify(`AI tạo ${count} mục lục từ ${imageParts.length / 2} ảnh mục lục.`, "success");
      if (warnings.length) notify(warnings.join(" · "), "warning");
    } catch (e) {
      if (e?.name === "BookChanged") return;
      if (e?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      console.warn("[BookReader] TOC AI failed:", e);
      notify(uiMessage(e, "Tạo mục lục bằng AI thất bại. Thử lại sau."), "error");
    } finally {
      setTocAiBusy(false);
      if (tocAiFileRef.current) tocAiFileRef.current.value = "";
    }
  };

  // ── TOC: sửa số trang thủ công — click vào số trang
  const startEditTocPage = useCallback((origIdx, currentBookPage) => {
    setEditingTocIdx(origIdx);
    setEditingTocVal(String(currentBookPage));
  }, []);
  const cancelEditTocPage = useCallback(() => {
    setEditingTocIdx(null);
    setEditingTocVal("");
  }, []);
  const saveEditTocPage = useCallback((origIdx) => {
    const raw = String(editingTocVal).trim();
    const n = parseInt(raw, 10);
    const total = isWordFile ? (htmlBookPages.length || 1) : (numPages ? Math.max(1, numPages - 1) : 9999);
    if (!Number.isFinite(n) || n < 1 || n > total) {
      notify(`Số trang phải từ 1 đến ${total}.`, "error");
      return;
    }
    // pdfPage = bookPage + 1 (Word file không cộng offset)
    const newPdfPage = isWordFile ? n : n + 1;
    const clampPdf = Math.max(1, Math.min(numPages || 9999, newPdfPage));
    setTocItems((prev) => {
      const next = prev.map((it, i) => i === origIdx ? { ...it, page: clampPdf, pdfPage: clampPdf } : it);
      // cache per-file
      const r = safeSetJSON(`toc_${book.filename}`, { items: next });
      if (!r.ok) console.warn(`[BookReader] Failed to persist toc_${book.filename}:`, r.error, "giữ dữ liệu cũ");
      // persist to custom TOC per-file (không ghi đè key chung)
      try {
        const fileKey = makeFileTocKey(book);
        const existing = findTocBook(book);
        // Ưu tiên fileKey để cô lập từng sách, tránh lỗi chia sẻ key chung
        const key = fileKey || existing?.key || makeTocKey(book);
        const title = existing?.title || book.title || book.filename || "muc-luc";
        const bookForStore = {
          key,
          title,
          grade: book.grade,
          subject: book.subject,
          term: book.term,
          items: next.map((it) => ({
            title: it.title || "",
            sub: it.sub || "",
            page: it.page || it.pdfPage || 1,
            depth: it.depth || 0,
            tuann: it.tuann || "",
            ...(it.id ? { id: it.id } : {}),
          })),
        };
        upsertTocBook(bookForStore);
      } catch (e) {
        console.warn("[BookReader] upsertTocBook failed", e);
      }
      return next;
    });
    setEditingTocIdx(null);
    setEditingTocVal("");
    notify(`Đã cập nhật trang thành ${n}.`, "success");
  }, [editingTocVal, isWordFile, htmlBookPages.length, numPages, book, notify]);

  // ── TOC: chỉnh toàn bộ — tăng/giảm tất cả số trang
  const persistTocItems = useCallback((next) => {
    const r = safeSetJSON(`toc_${book.filename}`, { items: next });
    if (!r.ok) console.warn(`[BookReader] Failed to persist toc_${book.filename}:`, r.error, "giữ dữ liệu cũ");
    try {
      const fileKey = makeFileTocKey(book);
      const existing = findTocBook(book);
      const key = fileKey || existing?.key || makeTocKey(book);
      const title = existing?.title || book.title || book.filename || "muc-luc";
      const bookForStore = {
        key,
        title,
        grade: book.grade,
        subject: book.subject,
        term: book.term,
        items: next.map((it) => ({
          title: it.title || "",
          sub: it.sub || "",
          page: it.page || it.pdfPage || 1,
          depth: it.depth || 0,
          tuann: it.tuann || "",
          ...(it.id ? { id: it.id } : {}),
        })),
      };
      upsertTocBook(bookForStore);
    } catch (e) {
      console.warn("[BookReader] upsertTocBook failed", e);
    }
  }, [book]);

  const handleBulkAdjust = useCallback((delta) => {
    if (!tocItems.length) { notify("Chưa có mục lục để chỉnh.", "warning"); return; }
    if (!Number.isFinite(delta) || delta === 0) { notify("Nhập số khác 0.", "error"); return; }
    const maxPdf = isWordFile ? (htmlBookPages.length || 1) : (numPages || 9999);
    const minPdf = 1;
    let clampedCount = 0;
    setTocItems((prev) => {
      const next = prev.map((it) => {
        const cur = it.page || it.pdfPage || 1;
        let np = cur + delta;
        const clamped = Math.max(minPdf, Math.min(maxPdf, np));
        if (clamped !== np) clampedCount++;
        return { ...it, page: clamped, pdfPage: clamped };
      });
      persistTocItems(next);
      return next;
    });
    // báo sau một tick để đếm đúng
    setTimeout(() => {
      const msg = delta > 0 ? `Đã tăng ${delta} trang cho toàn bộ (${tocItems.length} mục).` : `Đã giảm ${Math.abs(delta)} trang cho toàn bộ (${tocItems.length} mục).`;
      notify(clampedCount ? `${msg} (${clampedCount} mục bị chặn biên)` : msg, "success");
    }, 0);
  }, [tocItems, isWordFile, htmlBookPages.length, numPages, persistTocItems, notify]);

  const handleBulkDeltaApply = useCallback(() => {
    const raw = String(bulkDelta).trim();
    const d = parseInt(raw, 10);
    if (!raw || !Number.isFinite(d) || d === 0) { notify("Nhập số nguyên khác 0 (vd: 2 hoặc -2).", "error"); return; }
    handleBulkAdjust(d);
    setBulkDelta("");
  }, [bulkDelta, handleBulkAdjust, notify]);

  // ── Scan: canonical single pipeline + duplicate guard (PHASE 4)
  // 1 gesture = 1 selection = 1 crop = 1 persisted scan
  const selectionProcessingRef = useRef(false);
  const handleScanSelect = async (sel) => {
    if (selectionProcessingRef.current) return;
    selectionProcessingRef.current = true;
    try {
      const container = viewportContainerRef.current;
      const c1 = canvasRef.current;
      const c2 = canvas2Ref.current;

      // Validate canvas state
      if (!container) {
        alert("Không tìm thấy vùng hiển thị PDF. Vui lòng thử lại.");
        return;
      }
      if (!c1) {
        alert("Canvas chưa sẵn sàng. Đang tải PDF...");
        return;
      }

      // Check if canvas is currently rendering
      if (isRendering) {
        alert("Đang tải trang. Vui lòng đợi tải xong rồi quét lại.");
        return;
      }

      const c1Rect = c1.getBoundingClientRect();
      const c2Rect = c2 ? c2.getBoundingClientRect() : null;
      const contRect = container.getBoundingClientRect();

      // Validate canvas dimensions
      if (c1Rect.width <= 0 || c1Rect.height <= 0) {
        alert("Canvas chưa hiển thị. Vui lòng đợi tải xong.");
        return;
      }

      // Validate selection
      if (!sel || sel.w < 10 || sel.h < 10) {
        alert("Vùng quét quá nhỏ. Hãy chọn lại vùng lớn hơn.");
        return;
      }

      // map selection (container coords) to canvas pixels
      const canvasLeft = c1;
      const canvasRight = twoPageMode ? c2 : null;
      const leftRect = c1Rect;
      const rightRect = c2Rect;

      const result = await cropFromCanvases({
        canvasLeft,
        canvasRight,
        leftRect,
        rightRect,
        containerRect: contRect,
        sel,
      });

      if (!result || !result.dataUrl) {
        alert(
          "Không thể cắt vùng đã chọn. Vùng có thể nằm ngoài trang hoặc quá nhỏ.",
        );
        return;
      }

      const rawScan = createScan({
        book,
        page: pageNum,
        dataUrl: result.dataUrl,
        width: result.width,
        height: result.height,
        crop: { ...sel, srcRect: result.srcRect },
      });

      // persist immediately to history (so "Scan gần đây" shows even if modal cancelled)
      try {
        await saveScan(rawScan);
      } catch {}

      setScanPreview({
        ...rawScan,
        blob: result.blob,
        crop: { ...sel, srcRect: result.srcRect },
      });
      setScanMode(false);
    } catch (e) {
      console.error("Scan crop failed:", e);
      const errorMsg = e?.message || "Lỗi không xác định";
      alert(`Không thể cắt vùng đã chọn: ${errorMsg}. Thử lại.`);
    } finally {
      selectionProcessingRef.current = false;
    }
  };

  // ─── OCR (Gemini vision): extract text from visible page(s) ──
  const runOcr = async (force = false) => {
    if (ocrLoading) return;

    const pagesToScan = [pageNum];
    if (twoPageMode && pageNum + 1 <= numPages) {
      pagesToScan.push(pageNum + 1);
    }

    const targets = pagesToScan
      .map((p) => {
        const isCurrent = p === pageNum;
        const currentImage = isCurrent ? pageImageBase64 : rightPageImageBase64;
        const currentIsImage = isCurrent ? pageIsImage : rightPageIsImage;
        const currentText = isCurrent ? pageText : rightPageText;
        const sourceImage =
          currentImage ||
          (currentIsImage
            ? (isCurrent ? canvasRef.current : canvas2Ref.current)
                ?.toDataURL("image/jpeg", 0.75)
                .split(",")[1] || ""
            : "");
        const setter = isCurrent ? setPageText : setRightPageText;
        const imageSetter = isCurrent
          ? setPageImageBase64
          : setRightPageImageBase64;
        const imageStateSetter = isCurrent
          ? setPageIsImage
          : setRightPageIsImage;

        return {
          p,
          sourceImage,
          currentIsImage,
          currentText,
          setter,
          imageSetter,
          imageStateSetter,
        };
      })
      .filter(
        (target) =>
          target.currentIsImage || target.sourceImage || !target.currentText,
      );

    if (!targets.length) return;

    setOcrLoading(true);
    try {
      let doneCount = 0;
      for (const target of targets) {
        const { p, sourceImage, setter, imageSetter, imageStateSetter } =
          target;
        const ocrKey = `ocr_${book.filename}_${p}`;

        if (!sourceImage) {
          continue;
        }

        const cached = force ? null : await getOCR(book.filename, p);
        if (cached) {
          setter(cached);
          imageStateSetter(false);
          imageSetter(cached ? cached.slice(0, 0) : "");
          doneCount += 1;
          continue;
        }

        const sys =
          "Bạn là công cụ OCR (nhận dạng chữ) cho sách giáo khoa tiểu học tiếng Việt. Trích xuất TOÀN BỘ văn bản có trong ảnh trang sách, giữ nguyên cấu trúc bài tập, câu hỏi, số liệu, ký hiệu. Chỉ trả về văn bản nhận dạng được, không thêm lời bình, không giảng giải.";
        const resp = await callAI(
          [
            {
              role: "user",
              parts: [
                {
                  text: `Hãy nhận dạng (OCR) toàn bộ chữ trong trang ${bookPage(p)} cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject}):`,
                },
                { inlineData: { mimeType: "image/jpeg", data: sourceImage } },
              ],
            },
          ],
          sys,
          { temperature: 0.1, maxOutputTokens: 2500 },
        );
        const clean = cleanExtractedText(resp);
        if (!clean) {
          throw new Error(
            "AI không nhận dạng được chữ. Trang có thể không có chữ hoặc ảnh quá mờ.",
          );
        }

        setter(clean);
        imageStateSetter(false);
        try {
          await setOCR(book.filename, p, clean);
        } catch (err) {
          console.error(`Failed to save OCR for page ${p}:`, err);
          notify("Lưu OCR thất bại: bộ nhớ đầy", "error");
        }
        doneCount += 1;
      }

      if (doneCount > 0) {
        notify(
          targets.length > 1
            ? "Đã nhận dạng chữ cho cả 2 trang trong chế độ 2 trang. ✅"
            : force
              ? "Đã OCR lại trang thành công! ✅"
              : "Đã nhận dạng chữ trên trang thành công! ✅",
          "success",
        );
      }
    } catch (err) {
      if (err.name === "BookChanged") return;
      if (err?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      notify("OCR thất bại: " + err.message, "error");
    } finally {
      setOcrLoading(false);
    }
  };

  // ─── Note handlers ────────────────────────────────────────────
  const readPageNotes = (p) => {
    const key = `notes_${book.filename}_${p}`;
    const arr = safeGetJSON(key, [], (x) => Array.isArray(x));
    const list = Array.isArray(arr) ? arr : [];
    let touched = false;
    // One-time migration: legacy notes (no explicit pdfPage) belong to the
    // spread (right) page key — move them there and drop the stale copies — per-book isolation giữ nguyên
    const keep = [];
    for (const n of list) {
      if (n.pdfPage != null) {
        keep.push(n);
        continue;
      }
      const real = p + (n.wrapper || 0);
      if (real !== p) {
        const destKey = `notes_${book.filename}_${real}`;
        const dest = safeGetJSON(destKey, [], (x) => Array.isArray(x));
        const destArr = Array.isArray(dest) ? dest : [];
        const r = safeSetJSONWithQuotaRetry(destKey, [...destArr, { ...n, pdfPage: real }]);
        if (!r.ok) {
          console.warn(`[BookReader] Quota exceeded migrating note to ${destKey}, giữ dữ liệu cũ`, r.message);
          keep.push({ ...n, pdfPage: real });
        } else {
          touched = true;
        }
      } else {
        keep.push({ ...n, pdfPage: real });
      }
    }
    if (touched) {
      const r = safeSetJSONWithQuotaRetry(key, keep);
      if (!r.ok) {
        console.warn(`[BookReader] Quota exceeded saving migrated notes for ${key}, giữ dữ liệu cũ`, r.message);
        notify("Lưu ghi chú thất bại: bộ nhớ đầy", "error");
      }
    }
    return keep.map((n) => ({
      ...n,
      pdfPage: n.pdfPage ?? p + (n.wrapper || 0),
    }));
  };

  // Lưu ghi chú: ảnh lớn được chuyển vào IndexedDB trước (localStorage chỉ giữ
  // ref "idb:xxx" vài chục byte) nên không còn chạm quota 5MB. Ghi localStorage
  // dùng safeSetJSONWithQuotaRetry — khi đầy sẽ tự dọn cache tái tạo được rồi thử lại.
  const saveNote = async () => {
    if (!noteInput) return;
    const sanitized = sanitizeNoteHtml(noteText);
    const hasText = plainTextFromHtml(sanitized).length > 0;
    const hasImage = noteImages && noteImages.length > 0;
    if (!hasText && !hasImage) {
      notify("Vui lòng nhập nội dung ghi chú.", "error");
      return;
    }
    const pdfPage = pageNum + (noteInput.wrapper || 0);
    // Ước lượng dung lượng — chặn trước khi chạm quota để tránh spam QuotaExceededError.
    // Vì ảnh đã nằm ở IDB (ref ~20 byte), ngưỡng localStorage có thể cao hơn nhưng
    // vẫn giữ trần an toàn cho text + ref.
    const estSizeFor = (arr) => { try { return JSON.stringify(arr).length; } catch { return 0; } };
    let storedImages = [];
    try {
      storedImages = await persistNoteImages(noteImages, book.filename);
    } catch (e) {
      console.warn("[BookReader] persist note images failed, fallback inline", e?.message);
      storedImages = noteImages;
    }
    // Prime cache để ảnh vừa lưu hiển thị ngay không cần chờ resolve
    try {
      for (let i = 0; i < storedImages.length; i++) {
        const ref = storedImages[i];
        const src = noteImages[i];
        if (isNoteImageRef(ref) && typeof src === "string" && src.startsWith("data:")) primeImageCache(ref, src);
      }
    } catch {}
    const persistPayload = (key, payload) => {
      if (estSizeFor(payload) > 900 * 1024) {
        notify("Ghi chú quá lớn — hãy xóa bớt ảnh hoặc rút gọn nội dung", "error");
        return null;
      }
      const r = safeSetJSONWithQuotaRetry(key, payload);
      if (!r.ok) {
        if (r.quota) {
          console.warn(`[BookReader] Quota exceeded for ${key} dù đã dọn cache`, r.message);
          notify("Bộ nhớ trình duyệt đã đầy. Hãy vào Sao lưu & Khôi phục → Quản lý dữ liệu để xóa cache, rồi lưu lại.", "error");
        } else {
          console.warn(`[BookReader] Failed to save note for ${key}:`, r.error);
          notify("Lưu ghi chú thất bại, vui lòng thử lại", "error");
        }
        return null;
      }
      return r;
    };
    if (noteInput.editId) {
      // Ảnh cũ bị thay ra mà không còn dùng → xóa khỏi IDB để khỏi rác
      const oldNote = notes.find((n) => n.id === noteInput.editId);
      const removedImgs = (oldNote?.images || []).filter((img) => isNoteImageRef(img) && !storedImages.includes(img));
      const updated = notes.map((n) =>
        n.id === noteInput.editId
          ? {
              ...n,
              percentX: noteInput.percentX,
              percentY: noteInput.percentY,
              text: sanitized,
              images: storedImages,
            }
          : n,
      );
      const key = `notes_${book.filename}_${pdfPage}`;
      const payload = updated.filter((n) => n.pdfPage === pdfPage);
      const r = persistPayload(key, payload);
      if (!r) return;
      if (removedImgs.length) void deleteNoteImages(removedImgs);
      try {
        if (storedImages.some((s) => isNoteImageRef(s))) {
          const map = await resolveImageRefs(storedImages);
          if (Object.keys(map).length) setResolvedNoteImgs((prev) => ({ ...prev, ...map }));
        }
      } catch {}
      setNotes(updated);
      setNoteInput(null);
      setNoteText("");
      setNoteImages([]);
      if (noteEditableRef.current) noteEditableRef.current.innerHTML = "";
      notify("Đã cập nhật ghi chú!", "success");
      return;
    }
    const n = {
      id: Date.now(),
      wrapper: noteInput.wrapper || 0,
      percentX: noteInput.percentX,
      percentY: noteInput.percentY,
      text: sanitized,
      images: storedImages,
      pdfPage,
    };
    const updated = [...readPageNotes(pdfPage), n];
    const newKey = `notes_${book.filename}_${pdfPage}`;
    const rNew = persistPayload(newKey, updated);
    if (!rNew) return;
    try {
      if (storedImages.some((s) => isNoteImageRef(s))) {
        const map = await resolveImageRefs(storedImages);
        if (Object.keys(map).length) setResolvedNoteImgs((prev) => ({ ...prev, ...map }));
      }
    } catch {}
    setNotes((prev) => [...prev, n]);
    setNoteInput(null);
    setNoteText("");
    setNoteImages([]);
    if (noteEditableRef.current) noteEditableRef.current.innerHTML = "";
    try {
      emitNoteCreated(book.filename, pdfPage);
    } catch {}
    notify("Đã lưu ghi chú!", "success");
  };

  const startEditNote = (note) => {
    setNoteInput({
      wrapper: note.wrapper || 0,
      percentX: note.percentX,
      percentY: note.percentY,
      editId: note.id,
    });
    setNoteText(note.text || "");
    setNoteImages(note.images || []);
    setActiveNoteId(null);
    // Sync DOM after state update
    requestAnimationFrame(() => {
      const el = noteEditableRef.current;
      if (el) {
        el.innerHTML = sanitizeNoteHtml(note.text || "");
        el.focus();
        try {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch {}
      }
    });
  };

  const deleteNote = (id) => {
    const note = notes.find((n) => n.id === id);
    const rest = notes.filter((n) => n.id !== id);
    if (note) {
      const delKey = `notes_${book.filename}_${note.pdfPage}`;
      const r = safeSetJSONWithQuotaRetry(delKey, rest.filter((n) => n.pdfPage === note.pdfPage));
      if (!r.ok) {
        if (r.quota) console.warn(`[BookReader] Quota exceeded for ${delKey}, giữ dữ liệu cũ`, r.message);
        else console.warn(`[BookReader] Failed to delete note for ${delKey}:`, r.error);
        notify("Xóa ghi chú thất bại: bộ nhớ đầy", "error");
        return;
      }
      // Ảnh của note đã xóa không còn tham chiếu → dọn khỏi IndexedDB
      const refs = (note.images || []).filter(isNoteImageRef);
      const stillUsed = new Set();
      for (const n of rest) for (const img of n?.images || []) if (isNoteImageRef(img)) stillUsed.add(img);
      const orphan = refs.filter((r2) => !stillUsed.has(r2));
      if (orphan.length) void deleteNoteImages(orphan);
    }
    setNotes(rest);
    setActiveNoteId(null);
  };

  const deleteAllNotes = () => {
    if (!notes.length) return;
    if (!confirm("Xóa tất cả ghi chú của trang này?")) return;
    const pageSet = new Set([pageNum, pageNum + 1]);
    const removed = notes.filter((n) => pageSet.has(n.pdfPage));
    setNotes(notes.filter((n) => !pageSet.has(n.pdfPage)));
    [pageNum, pageNum + 1].forEach((p) => {
      try {
        safeRemove(`notes_${book.filename}_${p}`);
      } catch {
        /* ignore */
      }
    });
    const refs = [];
    for (const n of removed) for (const img of n?.images || []) if (isNoteImageRef(img)) refs.push(img);
    if (refs.length) void deleteNoteImages(refs);
    setActiveNoteId(null);
    notify("Đã xóa tất cả ghi chú của trang này.");
  };

  const handleCanvasDblClick = (e, wrapper = 0) => {
    // Only double left click creates a note — ignore right/middle/aux and modifier combos
    if (e.button !== undefined && e.button !== 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (scanMode || isRendering) return;
    // Ignore double clicks bubbling from note UI itself
    if (
      e.target instanceof HTMLElement &&
      e.target.closest(
        ".note-pin, .note-popup, .note-input-popup, button, a, input, textarea, select, [contenteditable]",
      )
    )
      return;
    // If the user just dragged to pan, don't create a note
    if (panMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (Date.now() - lastPanEndRef.current < 350) return;
    e.preventDefault();
    e.stopPropagation();
    const el = wrapper === 1 ? canvas2Ref.current : canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    // Ignore out-of-bounds clicks (e.g. gap between pages)
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    setNoteInput({
      wrapper,
      percentX: (x / rect.width) * 100,
      percentY: (y / rect.height) * 100,
    });
    setNoteText("");
    setNoteImages([]);
    setActiveNoteId(null);
    requestAnimationFrame(() => {
      const el = noteEditableRef.current;
      if (el) {
        el.innerHTML = "";
        el.focus();
      }
    });
  };

  // Sync contentEditable when a new note popup opens (fixes placeholder/focus/IME)
  useEffect(() => {
    if (!noteInput) return;
    const el = noteEditableRef.current;
    if (!el) return;
    const html = noteInput.editId ? sanitizeNoteHtml(noteText) : "";
    // Only reset when creating a new note; editing is handled by startEditNote
    if (!noteInput.editId) {
      el.innerHTML = html;
      requestAnimationFrame(() => el.focus());
    }
  }, [noteInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = (eOrFile) => {
    // Chấp nhận cả event input, File, FileList, mảng File (cho kéo-thả)
    const file = eOrFile?.target?.files?.[0] || (Array.isArray(eOrFile) ? eOrFile[0] : (eOrFile?.name ? eOrFile : eOrFile?.[0]));
    // Reset input để chọn lại cùng file vẫn hoạt động
    try { if (eOrFile?.target) eOrFile.target.value = ""; } catch {}
    if (!file) return;

    // Check file size (max 2MB trước nén)
    if (file.size > 2 * 1024 * 1024) {
      notify("Kích thước ảnh quá lớn (tối đa 2MB)", "error");
      return;
    }

    // Giới hạn số ảnh / ghi chú — tránh quota localStorage
    if (noteImages.length >= 4) {
      notify("Mỗi ghi chú tối đa 4 ảnh — hãy gộp hoặc xóa bớt", "warning");
      return;
    }

    // Check file type
    if (!(file.type || "").startsWith("image/")) {
      notify("Vui lòng chọn file ảnh", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target.result;
      // Nén ảnh qua canvas — ảnh gốc ghi chú giờ lưu ở IndexedDB nên nén chặt hơn
      // (640px, JPEG 0.55, ≤300KB/ảnh) để nhẹ RAM + nhanh hiển thị, vẫn đủ đọc chữ.
      try {
        const img = new window.Image();
        img.onload = () => {
          try {
            const maxW = 640, maxH = 640;
            let w = img.width, h = img.height;
            const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL("image/jpeg", 0.55);
            // Ước lượng dung lượng sau nén phải ≤ 300KB / ảnh
            if (compressed.length > 300 * 1024) {
              notify("Ảnh sau nén vẫn quá lớn — hãy chọn ảnh nhỏ hơn", "error");
              return;
            }
            // Kiểm tra tổng dung lượng ghi chú trên trang (text localStorage + ảnh
            // chờ lưu IDB) — trần 900KB để luôn cách xa quota 5MB dùng chung.
            const existing = safeGetJSON(`notes_${book.filename}_${pageNum + (noteInput?.wrapper || 0)}`, [], Array.isArray);
            const estExisting = (()=>{ try{ return JSON.stringify(existing).length; }catch{ return 0; }})();
            const pendingNew = noteImages.reduce((a, s)=>a + String(s?.length || 0), 0);
            if (estExisting + pendingNew + compressed.length > 900 * 1024) {
              notify("Trang này đã có quá nhiều ghi chú/ảnh — hãy xóa bớt trước khi thêm", "error");
              return;
            }
            setNoteImages((prev) => [...prev, compressed].slice(0, 4));
          } catch (err) {
            console.warn("[BookReader] compress failed, fallback raw", err);
            setNoteImages((prev) => [...prev, rawDataUrl].slice(0, 4));
          }
        };
        img.onerror = () => setNoteImages((prev) => [...prev, rawDataUrl].slice(0, 4));
        img.src = rawDataUrl;
      } catch {
        setNoteImages((prev) => [...prev, rawDataUrl].slice(0, 4));
      }
    };
    reader.onerror = () => {
      notify("Không thể đọc file ảnh", "error");
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = "";
  };

  const removeImage = (index) => {
    setNoteImages((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── TTS handlers ─────────────────────────────────────────────
  const speechOk = () =>
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Chrome loads voices asynchronously — wait (bounded) until a Vietnamese voice exists
  const ttsWaitRef = useRef(null);
  const waitForViVoice = () =>
    new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const found = () =>
        synth
          .getVoices()
          .some((v) => v.lang && v.lang.toLowerCase().startsWith("vi"));
      if (found())
        return resolve(
          synth
            .getVoices()
            .find((v) => v.lang && v.lang.toLowerCase().startsWith("vi")),
        );
      let tries = 0;
      const check = () => {
        if (found() || tries > 20) {
          cleanup();
          resolve(
            found()
              ? synth
                  .getVoices()
                  .find((v) => v.lang && v.lang.toLowerCase().startsWith("vi"))
              : null,
          );
        }
        tries += 1;
      };
      const onChanged = () => check();
      const interval = setInterval(check, 150);
      synth.addEventListener("voiceschanged", onChanged);
      const cleanup = () => {
        clearInterval(interval);
        synth.removeEventListener("voiceschanged", onChanged);
        if (ttsWaitRef.current === cleanup) ttsWaitRef.current = null;
      };
      ttsWaitRef.current = cleanup;
      // auto-timeout safety: force cleanup after 4s even if check stalls
      setTimeout(() => { if (ttsWaitRef.current === cleanup) cleanup(); }, 4000);
    });
  // Cleanup TTS wait if component unmounts before voices load
  useEffect(() => () => { if (ttsWaitRef.current) ttsWaitRef.current(); try{ window.speechSynthesis?.cancel(); }catch{} }, []);

  const handleTTS = () => {
    if (!speechOk()) {
      notify(
        "Trình duyệt này chưa hỗ trợ đọc to. Hãy dùng Chrome hoặc Edge nhé!",
        "error",
      );
      return;
    }
    if (ttsActive) {
      if (ttsPaused) {
        window.speechSynthesis.resume();
        setTtsPaused(false);
      } else {
        window.speechSynthesis.pause();
        setTtsPaused(true);
      }
      return;
    }
    if (pageIsImage) {
      notify(
        "Trang này dạng ảnh, chưa hỗ trợ đọc to. Hãy hỏi AI nhé!",
        "error",
      );
      return;
    }
    if (!pageText) {
      notify("Không có văn bản để đọc trên trang này.", "error");
      return;
    }
    (async () => {
      const vi = await waitForViVoice();
      const utt = new SpeechSynthesisUtterance(pageText.slice(0, 1500));
      utt.lang = "vi-VN";
      utt.rate = ttsRate;
      if (vi) utt.voice = vi;
      utt.onend = () => {
        setTtsActive(false);
        setTtsPaused(false);
      };
      utt.onerror = () => {
        setTtsActive(false);
        setTtsPaused(false);
      };
      setTtsActive(true);
      setTtsPaused(false);
      window.speechSynthesis.speak(utt);
    })();
  };

  const stopTTS = () => {
    if (!speechOk()) return;
    window.speechSynthesis.cancel();
    setTtsActive(false);
    setTtsPaused(false);
  };

  // ─── AI: Chat (multi-turn) ────────────────────────────────────
  const handleChat = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userText = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatLoading(true);
    try {
      // ── Prompt tuning theo 2 nút icon (gọn gàng) ──
      const effortPrompt = {
        quick: "MỨC ĐỘ NHANH: Trả lời trực tiếp, cực súc tích, bỏ qua suy luận dài. Chỉ nêu kết luận chính + 1 gợi ý dạy nhanh (≤5 dòng). Ưu tiên tốc độ.",
        balanced: "MỨC ĐỘ CÂN BẰNG: Cân bằng tốc độ và chiều sâu. Trình bày có cấu trúc 5–6 mục (Phân tích → Trọng tâm → YCCĐ → Lưu ý → Gợi ý tổ chức), đủ để dạy ngay.",
        deep: "MỨC ĐỘ SÂU: Suy luận từng bước (step-by-step), kiểm tra chéo nội dung SGK, nêu lỗi HS thường gặp, đối chiếu GDPT 2018, đề xuất hoạt động mở rộng và câu hỏi phân hóa. Ưu tiên chính xác sư phạm.",
      }[chatEffort] || "";
      const lengthPrompt = {
        concise: "ĐỘ DÀI NGẮN: Tối đa 80–120 từ, 4–6 bullet ngắn, không ví dụ dài, kết thúc bằng 1 câu hỏi gợi mở.",
        balanced: "ĐỘ DÀI VỪA: Khoảng 150–250 từ, cấu trúc rõ ràng, 1 ví dụ ngắn, ngôn ngữ sư phạm gọn, đọc xong trong 1–2 phút.",
        detailed: "ĐỘ DÀI DÀI: 350–500 từ, đầy đủ 8–9 mục (Phân tích → Trọng tâm → YCCĐ → Lưu ý → Tổ chức → Hoạt động HS → Câu hỏi → Đánh giá → Mở rộng), có bảng/mini-ví dụ nếu phù hợp.",
      }[chatResponseLength] || "";
      const sys = `${TEACHER_SYSTEM_PROMPT}\n\n[${effortPrompt}]\n[${lengthPrompt}]\nTuân thủ nghiêm mức độ và độ dài trên. Nếu mâu thuẫn, ưu tiên độ dài. Bám sát SGK lớp ${book?.grade || "?"} môn ${book?.subject || "?"}.`;

      // Build multi-turn history (skip greeting at index 0, drop error notices, keep last 12 messages)
      const history = chatMessages
        .slice(1)
        .filter((m) => !m.text.startsWith("⚠️") && !m.text.startsWith("⏹"))
        .slice(-12)
        .map((m) => ({
          role: m.role === "ai" ? "model" : "user",
          parts: [{ text: m.text }],
        }));

      // Analyzed range stays in memory so follow-up questions can reference it
      const ctxParts =
        analysisPages.length > 0
          ? [
              {
                text:
                  `\n[Ngữ cảnh đã phân tích trước đó — trang sách ${analysisPages[0].page}–${analysisPages[analysisPages.length - 1].page} của cuốn này. Thầy/cô có thể hỏi về nội dung dưới đây:]` +
                  analysisPages
                    .map((m) =>
                      m.text
                        ? `\n--- Trang ${m.page} ---\n${m.text.slice(0, 900)}`
                        : `\n--- Trang ${m.page} (ảnh, chưa nhận dạng chữ) ---`,
                    )
                    .join(""),
              },
            ]
          : [];

      // Use the chosen page range (like Phân tích) or the current page
      const range = resolveRange(chatFrom, chatTo);
      if (range?.error) {
        notify(range.error, "error");
        setChatLoading(false);
        return;
      }

      // Current user message includes the chosen pages + the question
      const current = {
        role: "user",
        parts: [
          ...ctxParts,
          ...(range
            ? await buildRangeParts(range.from, range.to)
            : await buildPageParts()),
          {
            text:
              `\nMục tiêu trước khi làm: ${preStudyPrompt.trim() || "Chuẩn bị dạy học"}\n` +
              `\nThầy/cô hỏi: "${userText}"`,
          },
        ],
      };

      const reply = await callAI([...history, current], sys, {
        temperature: Number.isFinite(settings.ai?.temperature)
          ? settings.ai.temperature
          : 0.5,
        maxOutputTokens:
          { concise: 1200, balanced: 2600, detailed: 4096 }[
            chatResponseLength
          ] || 2600,
        thinkingConfig: {
          thinkingBudget: { quick: 0, balanced: 1024, deep: 2048 }[chatEffort],
        },
      });
      setChatMessages((prev) => [...prev, { role: "ai", text: reply }]);
    } catch (err) {
      if (err.name === "BookChanged") return;
      // Người bấm Dừng → hiện phản hồi nhẹ nhàng, không phải lỗi
      if (err?.code === "CANCELLED") {
        setChatMessages((prev) => [...prev, { role: "ai", text: "⏹ Đã dừng." }]);
        return;
      }
      const friendly = getFriendlyErrorMessage(err.status, err.message);
      const help =
        err.status === 401
          ? `\n\n🔑 API Key không hợp lệ. Vào Cài đặt để cập nhật.`
          : err.status === 429
            ? `\n\n⏳ Quota Gemini đã hết. Thử lại sau hoặc đổi key.`
            : `\n\nKiểm tra: Internet, API Key, quota.`;
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", text: `⚠️ ${friendly}${help}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([
      {
        role: "ai",
        text: `Chào Thầy/cô! 🌟 Trợ lý sư phạm AI sẵn sàng hỗ trợ Thầy/cô nghiên cứu cuốn **"${book.title}"** rồi đây! Thầy/cô muốn phân tích nội dung gì không? 😊`,
      },
    ]);
    try {
      safeRemove(`chat_${book.filename}`);
    } catch {
      /* ignore */
    }
    notify("Đã bắt đầu hội thoại mới.");
  };

  // ─── AI: Quiz ─────────────────────────────────────────────────
  const generateQuiz = async () => {
    setQuizLoading(true);
    setQuizError("");
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    quizQuestionIdsRef.current = [];
    try {
      const sys = `Bạn là giáo viên tiểu học thiết kế đề trắc nghiệm theo chương trình SGK "Kết nối tri thức với cuộc sống".`;
      const range = resolveRange(quizFrom, quizTo);
      if (range?.error) {
        setQuizError(range.error);
        setQuizLoading(false);
        return;
      }
      const base = range
        ? await buildRangeParts(range.from, range.to)
        : await buildPageParts();
      const promptGoal =
        preStudyPrompt.trim() ||
        "Kiểm tra hiểu bài, tập trung vào nội dung chính và từ khó";
      const count = Math.max(3, Math.min(10, Number(quizCount) || 3));
      const diffMap = { "Nhận biết": "Mức Nhận biết", "Thông hiểu": "Mức Thông hiểu", "Vận dụng": "Mức Vận dụng", "Hỗn hợp": "Trộn đều Nhận biết/Thông hiểu/Vận dụng" };
      const typeMap = { "Trắc nghiệm": 'Trắc nghiệm 4 đáp án A B C D', "Tự luận": 'Tự luận ngắn (không có options, có đáp án mẫu)', "Điền khuyết": 'Điền khuyết (câu có chỗ trống ___)', "Hỗn hợp": 'Hỗn hợp Trắc nghiệm + Tự luận' };
      const globalEffortLabelQ = { quick: "Nhanh", balanced: "Cân bằng", deep: "Sâu" }[chatEffort] || "Cân bằng";
      const globalLengthLabelQ = { concise: "Ngắn", balanced: "Vừa", detailed: "Dài" }[chatResponseLength] || "Vừa";
      const parts = [
        ...base,
        {
          text: range
            ? `\nMục tiêu trước khi làm: ${promptGoal}\nTạo ${count} câu hỏi ${typeMap[quizType] || typeMap["Trắc nghiệm"]} phù hợp học sinh lớp ${book.grade} dựa trên các trang ${range.from}–${range.to}. Mức độ: ${diffMap[quizDifficulty] || diffMap["Hỗn hợp"]}. ${quizIncludeExplain ? "Mỗi câu kèm explanation ngắn (1 câu) cho giáo viên." : "Không cần explanation."} Chế độ AI toàn cục (liên kết): Mức độ ${globalEffortLabelQ} (${chatEffort}), Độ dài ${globalLengthLabelQ} (${chatResponseLength}) — đồng bộ từ Hỏi AI, không chạy độc lập. Trả về JSON thuần không có markdown fence:\n${quizType === "Tự luận" ? '[{"question":"...","type":"essay","answer":"...","explanation":"..."}]' : quizType === "Điền khuyết" ? '[{"question":"... ___ ...","type":"fill","answer":"...","explanation":"..."}]' : '[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"..."}]'}`
            : `\nMục tiêu trước khi làm: ${promptGoal}\nTạo ${count} câu hỏi ${typeMap[quizType] || typeMap["Trắc nghiệm"]} phù hợp học sinh lớp ${book.grade}. Mức độ: ${diffMap[quizDifficulty] || diffMap["Hỗn hợp"]}. ${quizIncludeExplain ? "Mỗi câu kèm explanation." : "Không cần explanation."} Chế độ AI toàn cục: ${globalEffortLabelQ}/${globalLengthLabelQ} (liên kết). Trả về JSON thuần không có markdown fence:\n${quizType === "Tự luận" ? '[{"question":"...","type":"essay","answer":"..."}]' : '[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"..."}]'}`,
        },
      ];
      const globalTokensQ = { concise: 1200, balanced: 2600, detailed: 4096 }[chatResponseLength] || 2600;
      const localTokensQ = count > 5 ? 3000 : 2000;
      const resp = await callAI([{ role: "user", parts }], sys, {
        temperature: quizDifficulty === "Vận dụng" ? 0.45 : 0.3,
        maxOutputTokens: Math.max(globalTokensQ, localTokensQ),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: { quick: 0, balanced: 1024, deep: 2048 }[chatEffort] || 1024 },
      });
      const parsed = parseJSONSafe(resp);
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0)
        throw new Error("AI trả lời không đúng định dạng. Hãy thử lại nhé!");
      // PHASE 5: AI output is untrusted — normalize, sanitize, validate, reject invalid
      const inferredType = quizType === "Tự luận" ? "essay" : quizType === "Điền khuyết" ? "fill" : "mc";
      const questions = parsed.slice(0, count).map((q) => normalizeGeneratedQuestion({
        type: q?.type || inferredType,
        question: q?.question || q?.q,
        options: q?.options || q?.choices || q?.answers,
        correctIndex: q?.correctIndex ?? q?.answer ?? q?.correct,
        answer: q?.explanation || q?.answer,
      })).filter(Boolean);
      if (questions.length === 0)
        throw new Error("AI trả lời không hợp lệ sau chuẩn hóa. Hãy thử lại nhé!");
      // Ensure no E/F/G from invalid indexes — correctIndex always 0-3 via normalization
      setQuizQuestions(questions);
    } catch (err) {
      if (err.name === "BookChanged") return;
      if (err?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      console.error(err);
      setQuizError("Không thể tạo đề trắc nghiệm: " + err.message);
    } finally {
      setQuizLoading(false);
    }
  };

  const saveQuizQuestions = () => {
    if (!quizQuestions.length) return [];
    if (quizQuestionIdsRef.current.length === quizQuestions.length)
      return quizQuestionIdsRef.current;
    const ids = quizQuestions.map(
      (q) =>
        addQuestion({
          type: "mc",
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          answer: q.options[q.correctIndex] || "",
          subject: book.subject || "",
          grade: book.grade || "",
          chapter: book.title || "",
          mucdo: "Hiểu",
          source: { file: book.filename, page: pageNum },
        }).id,
    );
    quizQuestionIdsRef.current = ids;
    return ids;
  };

  const saveQuizToQuestionBank = () => {
    saveQuizQuestions();
    notify(`Đã lưu ${quizQuestions.length} câu vào Ngân hàng câu hỏi.`);
  };

  const saveQuizAsWorksheet = () => {
    const questionIds = saveQuizQuestions();
    const worksheet = saveWorksheet({
      title: `Phiếu bài tập - ${book.title || "Nội dung sách"}`,
      subject: book.subject || "",
      grade: String(book.grade || ""),
      intro: "Học sinh hoàn thành các câu hỏi sau.",
      note: `Nguồn: ${book.title || book.filename}, trang ${bookPage(pageNum)}`,
      showAnswers: false,
      questions: questionIds,
      createdAt: Date.now(),
    });
    notify(`Đã lưu phiếu bài tập vào kho (${worksheet.title}).`);
  };

  // Guard against double-clicks double-recording the same quiz result
  const quizLockRef = useRef(false);
  const submitQuiz = () => {
    if (quizLockRef.current) return;
    quizLockRef.current = true;
    setQuizSubmitted(true);
    let correct = 0;
    quizQuestions.forEach((q, i) => {
      if (quizAnswers[i] === q.correctIndex) correct++;
    });
    setQuizScore(correct);
    addQuizRecord({
      at: Date.now(),
      file: book.filename,
      title: book.title,
      grade: book.grade,
      page: pageNum,
      score: correct,
      total: quizQuestions.length,
    });
    notify("Đã lưu kết quả vào lịch sử luyện tập. 📊");
    setTimeout(() => {
      quizLockRef.current = false;
    }, 800);
  };

  const scoreEmoji = (score, total) => {
    const pct = score / total;
    if (pct === 1)
      return "🌟 Xuất sắc! Thầy/cô đã hỗ trợ học sinh đạt kết quả tối đa!";
    if (pct >= 0.67)
      return "😊 Tốt lắm! Học sinh đã nắm vững phần lớn kiến thức!";
    if (pct >= 0.34)
      return "🙂 Khá ổn! Thầy/cô có thể củng cố thêm cho học sinh!";
    return "💪 Gợi ý: Thầy/cô hãy xem lại nội dung trọng tâm để hỗ trợ học sinh tốt hơn nhé!";
  };

  // ─── AI: Drawing check ────────────────────────────────────────
  const compressImageData = (dataUrl, maxDim = 1280, quality = 0.8) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext("2d");
        const _surface =
          getComputedStyle(document.documentElement).getPropertyValue(
            "--surface",
          ) || "#ffffff";
        ctx.fillStyle = _surface.trim() || "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const handleCheckDrawing = async (base64DataUrl) => {
    setDrawLoading(true);
    setDrawFeedback("");
    try {
      const b64 = (await compressImageData(base64DataUrl)).split(",")[1];
      const sys = `Bạn là trợ lý sư phạm AI hỗ trợ giáo viên đánh giá bài làm của học sinh. Nhận xét chuyên môn, khách quan, tích cực. Chỉ ra điểm đạt, gợi ý hướng dẫn học sinh sửa từng bước nhưng không cho đáp án cuối. Trình bày bằng Markdown có cấu trúc rõ ràng để giáo viên tham khảo khi giảng dạy.`;
      const parts = [
        ...(await buildPageParts()),
        {
          text: "\nĐây là bài làm của học sinh trên bảng viết (giáo viên cần đánh giá để hướng dẫn học sinh):",
        },
        { inlineData: { mimeType: "image/jpeg", data: b64 } },
      ];
      const feedback = await callAI([{ role: "user", parts }], sys, {
        temperature: 0.4,
      });
      setDrawFeedback(feedback);
    } catch (err) {
      if (err.name === "BookChanged") return;
      if (err?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      setDrawFeedback(`⚠️ Không chấm được bài: ${err.message}`);
    } finally {
      setDrawLoading(false);
    }
  };

  // ─── Ảnh tham khảo SGV cho giáo án: chọn / xóa (nhiều ảnh) ───────
  // Dùng helper dùng chung guideImageParts để validate + nén thống nhất toàn app.
  const handlePlanGuideSelect = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (planGuideImages.length + list.length > GUIDE_IMAGE_MAX_COUNT) {
      setPlanGuideError(`⚠️ Tối đa ${GUIDE_IMAGE_MAX_COUNT} ảnh SGV/lần. Đã có ${planGuideImages.length} ảnh.`);
      if (planGuideInputRef.current) planGuideInputRef.current.value = "";
      return;
    }
    setPlanGuideAdding(true);
    setPlanGuideError("");
    try {
      const next = [];
      for (const f of list) {
        const err = validateGuideImageFile(f);
        if (err) {
          setPlanGuideError(`⚠️ ${err}`);
          continue;
        }
        try {
          const dataUrl = await fileToGuideDataUrl(f);
          next.push({ id: makeGuideImageId(), name: f.name || "anh-sgv", dataUrl, base64: dataUrlToBase64(dataUrl) });
        } catch {
          setPlanGuideError(`⚠️ Không đọc được ảnh "${f.name || "ảnh"}".`);
        }
      }
      if (next.length) {
        setPlanGuideImages((prev) => [...prev, ...next].slice(0, GUIDE_IMAGE_MAX_COUNT));
        notify(`Đã thêm ${next.length} ảnh SGV tham khảo cho AI.`, "success");
      }
    } finally {
      setPlanGuideAdding(false);
      if (planGuideInputRef.current) planGuideInputRef.current.value = "";
    }
  };

  const handlePlanGuideRemove = (id) => {
    setPlanGuideImages((prev) => prev.filter((im) => im.id !== id));
    setPlanGuideError("");
  };

  const handlePlanGuideClear = () => {
    setPlanGuideImages([]);
    setPlanGuideError("");
    if (planGuideInputRef.current) planGuideInputRef.current.value = "";
  };

  // ─── Giáo án bằng AI: đọc trang sách + ảnh SGV + thông số → soạn FULL → mở trong Giáo án ──
  const handleAiCreatePlan = async () => {
    if (planCreating) return;
    if (!geminiKey) {
      setPlanError("\u26a0\ufe0f Chưa có Gemini API Key — vào Cài đặt → AI để nhập khóa.");
      return;
    }
    setPlanCreating(true);
    setPlanError("");
    try {
      const range = resolveRange(planFrom, planTo);
      if (range?.error) {
        setPlanError("\u26a0\ufe0f " + range.error);
        setPlanCreating(false);
        return;
      }
      const fromBook = range ? range.from : bookPage(pageNum);
      const toBook = range ? range.to : fromBook;
      const lessonName =
        [...tocItems].reverse().find((t) => (t.page || 0) <= fromBook + 1)?.title ||
        planTitle.trim() ||
        "";
      const title =
        planTitle.trim() ||
        lessonName ||
        ((book.title || "Bài học") + " (tr. " + fromBook + (toBook !== fromBook ? "\u2013" + toBook : "") + ")");
      // Snapshot các trang: chữ + ảnh (để AI đọc cả hình vẽ, sơ đồ)
      const base = range
        ? await buildRangeParts(range.from, range.to)
        : await buildPageParts();
      // Bảo đảm AI luôn thấy hình trang SGK: buildRangeParts chỉ đính ảnh khi
      // trang ít chữ; trang nhiều chữ nhưng có sơ đồ vẫn cần ảnh → bù thêm.
      if (!isWordFile && pdfDoc) {
        const hasBookImage = base.some((p) => p && p.inlineData);
        if (!hasBookImage) {
          const lo = range ? range.from + 1 : pageNum;
          const hi = range ? range.to + 1 : (twoPageMode && pageNum + 1 <= numPages ? pageNum + 1 : pageNum);
          for (let p = lo; p <= hi; p++) {
            try {
              const img = await renderPageAsJpeg(p);
              if (img) {
                base.push({ text: `Ảnh chụp trang sách ${p - 1} (xem kỹ hình vẽ, sơ đồ, bảng biểu rồi kết hợp với chữ ở trên):` });
                base.push({ inlineData: { mimeType: "image/jpeg", data: img } });
              }
            } catch {}
          }
        }
      }
      // Ảnh tham khảo SGV/HDH do GV tải lên (nhiều ảnh) — AI đọc qua inlineData
      const guideParts = buildGuideImageParts(planGuideImages);
      const prompt = buildLessonPrompt({
        title,
        lesson: lessonName,
        from: fromBook,
        to: toBook,
        duration: planDuration || "35",
        method: planMethod,
        includeDiff: planIncludeDiff,
        guideImageCount: planGuideImages.length,
        custom: planCustom,
      });
      // JSON mode: ép Gemini sinh JSON hợp lệ ngay từ đầu (chống lỗi
      // "Expected ',' or ']'" giữa mảng). Cắt cụt vẫn có thể xảy ra khi đụng
      // trần token — extractPlanJson tự đóng ngoặc bù.
      const jsonMode = { temperature: 0.55, maxOutputTokens: 12000, responseMimeType: "application/json" };
      const lessonParts = [...base, ...guideParts, { text: prompt }];
      const raw = await callAI(
        [{ role: "user", parts: lessonParts }],
        AI_SYSTEM,
        jsonMode,
      );
      // AI đôi khi trả JSON hỏng giữa chừng (thiếu phẩy, cắt cụt) —
      // extractPlanJson đã tự sửa các lỗi thường gặp; hỏng nặng thì gọi lại 1 lần.
      let obj = null;
      let lastErr = null;
      let lastRaw = raw;
      for (let attempt = 0; attempt < 2 && !obj; attempt++) {
        try {
          const rawText = attempt === 0 ? raw : await callAI(
            [{ role: "user", parts: lessonParts }],
            AI_SYSTEM,
            { ...jsonMode, temperature: 0.7 },
          );
          lastRaw = rawText;
          obj = extractPlanJson(rawText);
        } catch (e) {
          lastErr = e;
          if (attempt === 0) setPlanError("⚠️ AI trả về lỗi, đang tự thử lại…");
        }
      }
      if (!obj) {
        // Lưu raw để chẩn đoán lần sau (xem console hoặc localStorage khbd_last_ai_raw)
        try {
          const m = String(lastErr?.message || "").match(/position (\d+)/);
          const pos = m ? parseInt(m[1], 10) : -1;
          const context = pos >= 0
            ? String(lastRaw || "").slice(Math.max(0, pos - 300), pos + 300)
            : String(lastRaw || "").slice(-600);
          console.warn("[KHBD] AI JSON parse failed:", lastErr?.message, "\n--- context ---\n" + context);
          safeSetJSON("khbd_last_ai_raw", {
            at: Date.now(), error: String(lastErr?.message || lastErr),
            raw: String(lastRaw || "").slice(0, 20000),
          });
        } catch {}
        throw lastErr || new Error("AI không trả về giáo án.");
      }
      const plan = aiJsonToPlan(obj, {
        title,
        lesson: lessonName,
        subject: book.subject || "",
        grade: book.grade ? String(book.grade) : "",
        bookId: book.filename || book.id || "",
        bookTitle: book.title || book.filename || "",
        bookSeries: book.series || book.bookSeries || "",
        pageStart: fromBook,
        pageEnd: toBook,
        duration: planDuration || "35",
      });
      const saved = saveKhbdV2(plan);
      notify("AI đã soạn xong giáo án — mở trong module Giáo án để xem và sửa.");
      onOpenLessonPlan?.(saved.id);
    } catch (err) {
      if (err.name === "BookChanged") return;
      if (err?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      const hint = String(err?.message || "").includes("JSON")
        ? " Nếu vẫn lỗi, hãy thu hẹp khoảng trang (2–3 trang) rồi bấm lại."
        : "";
      setPlanError("⚠️ Không soạn được giáo án: " + (err.message || err) + hint);
    } finally {
      setPlanCreating(false);
    }
  };

  // ─── AI: Analyze a range of pages (max 7) ───────────────────
  // Always render the page as an image too, so AI sees pictures/diagrams
  const extractPageForAnalysis = async (p) => {
    const page = await pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    const raw = tc.items.map((i) => i.str).join(" ");
    const clean = cleanExtractedText(raw);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp })
      .promise;
    const url = await compressImageData(
      canvas.toDataURL("image/jpeg", 0.8),
      1100,
      0.7,
    );
    return { text: clean, image: url.split(",")[1] };
  };

  const runAnalysis = async () => {
    if (!pdfDoc || analysisLoading) return;
    const total = totalBookPages || 1;
    const from =
      analyzeFrom && !isNaN(parseInt(analyzeFrom, 10))
        ? Math.max(1, Math.min(total, parseInt(analyzeFrom, 10)))
        : bookPage(pageNum);
    const to =
      analyzeTo && !isNaN(parseInt(analyzeTo, 10))
        ? Math.max(1, Math.min(total, parseInt(analyzeTo, 10)))
        : from;
    if (to < from) {
      setAnalysisError(
        "Trang kết thúc phải lớn hơn hoặc bằng trang bắt đầu nhé!",
      );
      return;
    }
    if (to - from + 1 > 7) {
      setAnalysisError(
        "Tối đa 7 trang cho mỗi lần phân tích. Hãy chia nhỏ khoảng trang rồi thử lại nhé!",
      );
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisResult("");
    try {
      const parts = [];
      const pagesMeta = [];
      // Book page N maps to PDF page N + 1 (PDF page 1 is the cover) — lưu pdfPage để mở đúng trang trích
      for (let p = from + 1; p <= to + 1; p++) {
        const r = await extractPageForAnalysis(p);
        pagesMeta.push({ page: p, text: r.text });
        parts.push({
          text: r.text
            ? `\n===== Trang sách ${p - 1} =====\n${r.text.slice(0, 1600)}`
            : `\n===== Trang sách ${p - 1} (dạng ảnh, chưa nhận dạng chữ) =====`,
        });
        if (r.image) {
          parts.push({
            text: `Ảnh trang sách ${p - 1} (hãy kết hợp với chữ để nhận diện đúng hình vẽ, sơ đồ, bảng biểu):`,
          });
          parts.push({ inlineData: { mimeType: "image/jpeg", data: r.image } });
        }
      }
      const detailMap = { concise: "Ngắn gọn (80–120 từ, chỉ ý chính)", balanced: "Vừa phải (180–300 từ, đủ 5 mục)", detailed: "Chi tiết (400–600 từ, có ví dụ + bảng)" };
      const focusMap = {
        all: "## 1. TÓM TẮT NỘI DUNG (từng trang)\n## 2. KIẾN THỨC TRỌNG TÂM\n## 3. ĐIỂM HỌC SINH DỄ NHẦM / CẦN LƯU Ý\n## 4. GỢI Ý PHƯƠNG PHÁP DẠY HỌC\n## 5. CÂU HỎI ÔN TẬP GỢI Ý (3 câu)",
        summary: "## 1. TÓM TẮT NỘI DUNG (từng trang)\n## 2. KIẾN THỨC TRỌNG TÂM",
        questions: "## 1. CÂU HỎI ÔN TẬP GỢI Ý (5 câu) + ## 2. ĐÁP ÁN GỢI Ý",
        vocab: "## 1. TỪ KHÓ / THUẬT NGỮ (giải nghĩa ngắn) + ## 2. VÍ DỤ GẦN GŨI",
        keypoints: "## 1. KIẾN THỨC TRỌNG TÂM (bullet) + ## 2. SƠ ĐỒ TƯ DUY GỢI Ý",
      };
      const focusPrompt = focusMap[analyzeFocus] || focusMap.all;
      const sys =
        'Bạn là chuyên gia giáo dục tiểu học Việt Nam, rất thông thạo chương trình GDPT 2018 và bộ sách "Kết nối tri thức với cuộc sống".';
      const globalDetailTokens = { concise: 1800, balanced: 3500, detailed: 5000 }[chatResponseLength] || 3500;
      const localDetailTokens = { concise: 1800, balanced: 3500, detailed: 5000 }[analyzeDetail] || 3500;
      const maxTokensByDetail = Math.max(globalDetailTokens, localDetailTokens);
      const globalEffortLabel = { quick: "Nhanh", balanced: "Cân bằng", deep: "Sâu" }[chatEffort] || "Cân bằng";
      const globalLengthLabel = { concise: "Ngắn", balanced: "Vừa", detailed: "Dài" }[chatResponseLength] || "Vừa";
      const resp = await callAI(
        [
          {
            role: "user",
            parts: [
              {
                text: `Cuốn "${book.title}" (Lớp ${book.grade}, Môn ${book.subject}). Dưới đây là nội dung các trang sách từ ${from} đến ${to} (${to - from + 1} trang):`,
              },
              ...parts,
              {
                text: `\nHãy phân tích các trang từ ${from} đến ${to} theo yêu cầu:\n- Mức độ chi tiết: ${detailMap[analyzeDetail] || detailMap.balanced}\n- Trọng tâm: ${analyzeFocus === "all" ? "Toàn diện" : analyzeFocus}\n- ${analyzeIncludeTips ? "Bao gồm gợi ý dạy học cụ thể cho giáo viên." : "Không cần gợi ý dạy học, chỉ phân tích nội dung."}\n- Chế độ AI toàn cục (liên kết): Mức độ ${globalEffortLabel} (${chatEffort}), Độ dài ${globalLengthLabel} (${chatResponseLength}) — đồng bộ từ tab Hỏi AI, không chạy độc lập.\n\nCấu trúc yêu cầu:\n${focusPrompt}\nTrình bày bằng Markdown rõ ràng, dễ đọc. Bám sát SGK lớp ${book.grade}.`,
              },
            ],
          },
        ],
        sys,
        { temperature: 0.4, maxOutputTokens: maxTokensByDetail, thinkingConfig: { thinkingBudget: { quick: 0, balanced: 1024, deep: 2048 }[chatEffort] || 1024 } },
      );

      setAnalysisResult(resp);
      setAnalysisPages(pagesMeta.map((m) => ({ page: m.page, text: m.text })));
      notify(
        "Đã phân tích xong! Chuyển sang tab Trò chuyện để hỏi tiếp nhé. 💬",
        "success",
      );
    } catch (err) {
      if (err.name === "BookChanged") return;
      if (err?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      setAnalysisError("Không phân tích được: " + err.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const clearAnalysis = () => {
    setAnalysisPages([]);
    setAnalysisResult("");
    setAnalysisError("");
    setAnalyzeFrom("");
    setAnalyzeTo("");
  };

  const copyAnalysis = async () => {
    try {
      await navigator.clipboard.writeText(analysisResult);
      setAnalysisCopied(true);
      setTimeout(() => setAnalysisCopied(false), 2000);
    } catch {
      notify(
        "Không thể sao chép tự động. Hãy bôi đen và sao chép thủ công nhé!",
        "error",
      );
    }
  };

  const saveAnalysisToCollection = async () => {
    if (!analysisResult) return;
    const name = "AI - Phân tích sách";
    let coll = getCollections().find((c) => c.name === name);
    if (!coll) coll = addCollection(name, "Kết quả phân tích từ BookReader");
    await addClip({
      collId: coll.id,
      file: book.filename,
      bookTitle: book.title,
      grade: book.grade,
      subject: book.subject,
      page: analysisPages[0]?.page || pageNum,
      text: analysisResult,
      chapter: chapterForPage(book, pageNum),
    });
    notify("Đã lưu kết quả phân tích vào Bộ sưu tập.");
  };

  const saveChatToCollection = async () => {
    const transcript = chatMessages
      .filter((m) => m.text && !m.text.startsWith("⚠️"))
      .map((m) => `${m.role === "ai" ? "AI" : "Thầy/cô"}:\n${m.text}`)
      .join("\n\n");
    if (!transcript) return;
    const name = "AI - Hội thoại BookReader";
    let coll = getCollections().find((c) => c.name === name);
    if (!coll) coll = addCollection(name, "Hội thoại được lưu từ BookReader");
    await addClip({
      collId: coll.id,
      file: book.filename,
      bookTitle: book.title,
      grade: book.grade,
      subject: book.subject,
      page: pageNum,
      text: transcript,
      chapter: chapterForPage(book, pageNum),
    });
    notify("Đã lưu hội thoại vào Bộ sưu tập.");
  };

  const saveDrawingFeedback = () => {
    if (!drawFeedback) return;
    saveTeacherNote(book, pageNum, {
      title: "Nhận xét bài làm từ AI",
      note: drawFeedback,
    });
    notify("Đã lưu nhận xét AI vào Ghi chú giáo viên.");
  };

  // ─── Word selection ───────────────────────────────────────────
  const handleTextSelect = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length < 150) {
      setSelWord(sel);
      setWordExpl("");
    } else {
      setSelWord("");
    }
  };

  const explainWord = async () => {
    setWordLoading(true);
    setWordExpl("Đang tra nghĩa...");
    try {
      const resp = await callAI(
        [
          {
            role: "user",
            parts: [
              {
                text: `Giải nghĩa từ/cụm từ sau cho học sinh tiểu học lớp ${book.grade}: "${selWord}". Ngắn gọn 2-3 câu, dùng ví dụ gần gũi trẻ em, thêm emoji.`,
              },
            ],
          },
        ],
        "Bạn là trợ lý chuyên môn từ điển sư phạm tiểu học, giải thích chính xác, súc tích, hỗ trợ giáo viên chuẩn bị bài giảng theo chương trình GDPT 2018.",
      );
      setWordExpl(resp);
    } catch (err) {
      if (err.name === "BookChanged") return;
      if (err?.code === "CANCELLED") { notify("⏹ Đã dừng.", "info"); return; }
      setWordExpl("😢 " + err.message);
    } finally {
      setWordLoading(false);
    }
  };

  // Save selected word + explanation into the vocabulary notebook
  // Chưa có nghĩa + đã cấu hình Gemini → tự tra cứu trước khi lưu
  const saveWordToNotebook = async () => {
    if (!selWord || savingWord) return;
    const word = selWord.slice(0, 80);
    let meaning =
      wordExpl && !wordExpl.startsWith("😢") && !wordExpl.startsWith("Đang tra")
        ? wordExpl
        : "";
    if (!meaning && geminiKey) {
      setSavingWord(true);
      try {
        const resp = await callAI(
          [
            {
              role: "user",
              parts: [
                {
                  text: `Giải nghĩa từ/cụm từ sau cho học sinh tiểu học lớp ${book.grade}: "${word}". Ngắn gọn 2-3 câu, dùng ví dụ gần gũi trẻ em, thêm emoji.`,
                },
              ],
            },
          ],
          "Bạn là trợ lý chuyên môn từ điển sư phạm tiểu học, giải thích chính xác, súc tích, hỗ trợ giáo viên chuẩn bị bài giảng theo chương trình GDPT 2018.",
        );
        if (resp && !resp.startsWith("😢")) meaning = resp.trim();
      } catch (err) {
        // Đổi sách → BỎ lưu (tránh gắn từ cũ vào sách mới khi book/pageNum đã đổi);
        // lỗi mạng / quota / người bấm Dừng → vẫn lưu từ, chỉ thiếu nghĩa
        if (err && err.name === "BookChanged") return;
        console.warn("[BookReader] auto-explain on save failed:", err);
      } finally {
        setSavingWord(false);
      }
    }
    // addVocabEntry đã emit VOCAB_CREATED + DATA_UPDATED — không emit lại để tránh double-count
    addVocabEntry({
      word,
      meaning,
      file: book.filename,
      bookTitle: book.title,
      grade: book.grade,
      page: pageNum,
    });
    notify(`Đã thêm "${word.slice(0, 30)}" vào sổ tay từ vựng. 📓`);
    setSelWord("");
    setWordExpl("");
  };

  // ─── UI Tab Icons (collapsed mode) ───────────────────────────
  const AI_SECTIONS = [
    { id: "chat", icon: <MessageSquare size={20} />, label: "Hỏi AI" },
    { id: "analyze", icon: <FileSearch size={20} />, label: "Phân tích" },
    { id: "pedagogy", icon: <GraduationCap size={20} />, label: "Sư phạm" },
    { id: "lesson", icon: <FileText size={20} />, label: "Giáo án" },
    { id: "tools", icon: <Layers size={20} />, label: "Công cụ" },
  ];

  // Legacy tabs — đã gộp draw/quiz vào tools/pedagogy, giữ activeTab "draw"/"quiz" chỉ để redirect

  // Advanced tools for drawer - organized by category
  const ADVANCED_TOOLS = [
    {
      id: "ocr",
      icon: <ScanText size={20} />,
      label: "OCR",
      category: "Nghiên cứu",
      description: "Nhận diện văn bản từ hình ảnh",
      action: () => setShowOcrDrawer(true),
    },
    {
      id: "glossary",
      icon: <BookOpen size={20} />,
      label: "Từ điển",
      category: "Học tập",
      description: "Sổ tay thuật ngữ và từ vựng",
      action: () => setShowGlossary(true),
    },
    {
      id: "notes",
      icon: <NotebookPen size={20} />,
      label: "Ghi chú có cấu trúc",
      category: "Học tập",
      description: "Quản lý ghi chú theo trang",
      action: () => setShowNotes(true),
    },
    {
      id: "tags",
      icon: <Tag size={20} />,
      label: "Gắn thẻ CTGDPT",
      category: "Nghiên cứu",
      description: "Gắn thẻ chuẩn GDPT cho trang",
      action: () => setShowTag(true),
    },
    {
      id: "clip",
      icon: <Scissors size={20} />,
      label: "Lưu trích đoạn",
      category: "Nghiên cứu",
      description: "Lưu trích đoạn vào bộ sưu tập",
      action: () => setShowClip(true),
    },
    {
      id: "structured",
      icon: <FileText size={20} />,
      label: "Phân tích nâng cao",
      category: "Phân tích",
      description: "Phân tích nội dung trang sâu",
      action: () => { setAiCollapsed(false); setActiveTab("analyze"); },
    },
    {
      id: "drawing",
      icon: <Edit3 size={20} />,
      label: "Bảng vẽ",
      category: "Công cụ",
      description: "Vẽ và giải bài trên bảng (DrawBoard v2)",
      action: () => { setAiCollapsed(false); setActiveTab("tools"); },
    },
    {
      id: "data",
      icon: <Database size={20} />,
      label: "Dữ liệu",
      category: "Phân tích",
      description: "Xuất và phân tích dữ liệu",
      action: () => { setAiCollapsed(false); setActiveTab("analyze"); },
    },
    {
      id: "language",
      icon: <Volume2 size={20} />,
      label: "Ngôn ngữ",
      category: "Công cụ",
      description: "Công cụ ngôn ngữ và TTS — mở bảng đọc",
      action: () => setShowTtsMenu(true),
    },
  ];

  // Toggle favorite tool
  const toggleFavoriteTool = (toolId) => {
    setFavoriteTools((prev) => {
      const updated = prev.includes(toolId)
        ? prev.filter((id) => id !== toolId)
        : [...prev, toolId];
      const r = safeSetJSON("favoriteTools", updated);
      if (!r.ok) console.warn("[BookReader] Failed to persist favoriteTools, giữ dữ liệu cũ:", r.error, r.message);
      return updated;
    });
  };

  // Track recent tool usage
  const trackRecentTool = (toolId) => {
    setRecentTools((prev) => {
      const filtered = prev.filter((id) => id !== toolId);
      const updated = [toolId, ...filtered].slice(0, 5); // Keep last 5
      const r = safeSetJSON("recentTools", updated);
      if (!r.ok) console.warn("[BookReader] Failed to persist recentTools, giữ dữ liệu cũ:", r.error, r.message);
      return updated;
    });
  };

  // Execute tool action and track usage
  const executeTool = (tool) => {
    trackRecentTool(tool.id);
    tool.action();
    setShowAdvancedDrawer(false);
  };

  // Filter tools by search and filter type
  const filteredTools = ADVANCED_TOOLS.filter((tool) => {
    const matchesSearch =
      tool.label.toLowerCase().includes(advancedToolsSearch.toLowerCase()) ||
      tool.description
        .toLowerCase()
        .includes(advancedToolsSearch.toLowerCase());

    const matchesFilter =
      advancedToolsFilter === "all" ||
      (advancedToolsFilter === "favorites" &&
        favoriteTools.includes(tool.id)) ||
      (advancedToolsFilter === "recent" && recentTools.includes(tool.id));

    return matchesSearch && matchesFilter;
  });

  // Group tools by category
  const toolsByCategory = filteredTools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {});

  // PDF page 1 is the cover → book page numbers are PDF page − 1
  const bookPage = (p) => Math.max(1, p - 1);
  const totalBookPages = isWordFile ? (htmlBookPages.length||1) : (numPages ? Math.max(1, numPages - 1) : 0);
  const pageDisplay =
    twoPageMode && pageNum + 1 <= numPages
      ? `${bookPage(pageNum)}–${bookPage(pageNum + 1)}`
      : String(bookPage(pageNum));

  // ── Keyboard Event Listener for Command Palette (moved after COMMANDS definition) ──
  // Placeholder — real handler is defined after COMMANDS to ensure flattened indexing is correct

  // ── Command Definitions ─────────────────────────────────────────
  const COMMANDS = [
    // Navigation
    {
      id: "go-to-page",
      label: "Đi đến trang...",
      icon: <BookOpen size={16} />,
      category: "Điều hướng",
      action: () => {
        setEditingPage(true);
        setPageInputVal(String(bookPage(pageNum)));
      },
    },
    {
      id: "next-page",
      label: "Trang sau",
      icon: <ChevronRight size={16} />,
      category: "Điều hướng",
      action: () => goToPage(pageNum + (twoPageMode ? 2 : 1)),
    },
    {
      id: "prev-page",
      label: "Trang trước",
      icon: <ChevronLeft size={16} />,
      category: "Điều hướng",
      action: () => goToPage(pageNum - (twoPageMode ? 2 : 1)),
    },
    // View
    {
      id: "toggle-toc",
      label: "Bật/tắt Mục lục",
      icon: <BookOpen size={16} />,
      category: "Hiển thị",
      action: () => setTocCollapsed(!tocCollapsed),
    },
    {
      id: "toggle-ai",
      label: "Bật/tắt bảng AI",
      icon: <Sparkles size={16} />,
      category: "Hiển thị",
      action: () => setAiCollapsed(!aiCollapsed),
    },
    {
      id: "toggle-fullscreen",
      label: "Bật/tắt toàn màn hình",
      icon: <Maximize2 size={16} />,
      category: "Hiển thị",
      action: () => setFullscreen(!fullscreen),
    },
    {
      id: "toggle-two-page",
      label: "Bật/tắt chế độ 2 trang",
      icon: <Layers size={16} />,
      category: "Hiển thị",
      action: () => setTwoPageMode(!twoPageMode),
    },
    // AI Features
    {
      id: "ai-chat",
      label: "Hỏi AI",
      icon: <MessageSquare size={16} />,
      category: "AI",
      action: () => {
        setAiCollapsed(false);
        setActiveTab("chat");
      },
    },
    {
      id: "ai-analyze",
      label: "Phân tích trang",
      icon: <FileSearch size={16} />,
      category: "AI",
      action: () => {
        setAiCollapsed(false);
        setActiveTab("analyze");
      },
    },
    {
      id: "ai-quiz",
      label: "Tạo bài tập",
      icon: <Award size={16} />,
      category: "AI",
      action: () => {
        setAiCollapsed(false);
        setActiveTab("pedagogy");
      },
    },
    {
      id: "ai-lesson",
      label: "Tạo giáo án từ trang",
      icon: <FileText size={16} />,
      category: "Giáo án",
      action: () => {
        setAiCollapsed(false);
        setActiveTab("lesson");
      },
    },
    // Tools
    {
      id: "tool-ocr",
      label: "OCR - Nhận diện văn bản",
      icon: <ScanText size={16} />,
      category: "Công cụ",
      action: () => setShowOcrDrawer(true),
    },
    {
      id: "tool-notes",
      label: "Ghi chú có cấu trúc",
      icon: <NotebookPen size={16} />,
      category: "Công cụ",
      action: () => setShowNotes(true),
    },
    {
      id: "tool-glossary",
      label: "Từ điển",
      icon: <GraduationCap size={16} />,
      category: "Công cụ",
      action: () => setShowGlossary(true),
    },
    {
      id: "tool-tags",
      label: "Gắn thẻ CTGDPT",
      icon: <Tag size={16} />,
      category: "Công cụ",
      action: () => setShowTag(true),
    },
    {
      id: "tool-clip",
      label: "Lưu trích đoạn",
      icon: <Scissors size={16} />,
      category: "Công cụ",
      action: () => setShowClip(true),
    },
    {
      id: "tool-drawing",
      label: "Bảng nháp",
      icon: <Edit3 size={16} />,
      category: "Công cụ",
      action: () => {
        setAiCollapsed(false);
        setActiveTab("tools");
      },
    },
    // Zoom
    {
      id: "zoom-in",
      label: "Phóng to",
      icon: <ZoomIn size={16} />,
      category: "Thu phóng",
      action: () => {
        manualZoomRef.current = true;
        setZoom((z) => zoomInHelper(z));
      },
    },
    {
      id: "zoom-out",
      label: "Thu nhỏ",
      icon: <ZoomOut size={16} />,
      category: "Thu phóng",
      action: () => {
        manualZoomRef.current = true;
        setZoom((z) => zoomOutHelper(z));
      },
    },
    {
      id: "zoom-fit",
      label: "Vừa khổ trang",
      icon: <Maximize2 size={16} />,
      category: "Thu phóng",
      action: () => {
        fitToWidth(true);
      },
    },
    // Bookmark
    {
      id: "toggle-bookmark",
      label: isBookmarked ? "Bỏ đánh dấu trang" : "Đánh dấu trang",
      icon: isBookmarked ? (
        <BookmarkCheck size={16} />
      ) : (
        <BookmarkPlus size={16} />
      ),
      category: "Dấu trang",
      action: handleToggleBookmark,
    },
  ];

  // ── Command Palette Functions ───────────────────────────────────
  const getFilteredCommands = () => {
    if (!commandPaletteSearch.trim()) {
      return COMMANDS;
    }
    const search = commandPaletteSearch.toLowerCase();
    return COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(search) ||
        cmd.category.toLowerCase().includes(search),
    );
  };

  const executeCommand = (command) => {
    // Track recent action — dùng safeSetJSON, quota handling giữ dữ liệu cũ
    setRecentActions((prev) => {
      const filtered = prev.filter((id) => id !== command.id);
      const updated = [command.id, ...filtered].slice(0, 10); // Keep last 10
      const r = safeSetJSON("recentActions", updated);
      if (!r.ok) console.warn("[BookReader] Failed to persist recentActions, giữ dữ liệu cũ:", r.error, r.message);
      return updated;
    });

    // Execute command
    command.action();
    setShowCommandPalette(false);
  };

  const getRecentCommands = () => {
    return recentActions
      .map((id) => COMMANDS.find((cmd) => cmd.id === id))
      .filter(Boolean);
  };

  // ── Flattened commands for correct keyboard navigation (spec: 1.5 FIX)
  // Displayed list = recent + all (grouped) when not searching, else filtered.
  // This ensures highlight index === executed command index (no baseIdx+sectionIdx bug).
  const getDisplayedCommands = () => {
    if (commandPaletteSearch.trim()) {
      return getFilteredCommands();
    }
    const recents = getRecentCommands();
    // Flatten grouped categories in display order: recents first, then COMMANDS in order
    // COMMANDS order already equals categories.flatMap(...), so this matches UI globalIdx
    return [...recents, ...COMMANDS];
  };

  // ── Keyboard handler — uses flattened displayed list + shortcuts cực chi tiết ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (matchesShortcut(e, getShortcut("reader.commandPalette"))) {
        // Đã xử lý ở keyHandlerRef (tránh double toggle) — chỉ xử lý khi handler kia chưa bắt (fallback khi typing)
        const t = document.activeElement;
        const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        if (!typing) return; // đã toggle ở trên
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        setCommandPaletteSearch("");
        setSelectedCommandIndex(0);
        return;
      }
      if (e.key === "Escape" && showCommandPalette) {
        e.preventDefault();
        setShowCommandPalette(false);
        return;
      }
      if (showCommandPalette) {
        // Enter/↑↓ chỉ thuộc bảng lệnh khi đang gõ TRONG bảng lệnh.
        // Nếu focus ở ô nhập khác (ô tìm kiếm Ctrl+K của GlobalSearch, ô tìm mục lục…)
        // mà vẫn bắt, Enter chọn kết quả tìm kiếm sẽ đồng thời thực thi một lệnh
        // reader ẩn (vd "Đi đến trang...") — hai lớp cùng phản ứng một phím.
        const act = document.activeElement;
        const inPalette = !!(act && act.closest && act.closest(".command-palette"));
        const typing =
          act &&
          (act.tagName === "INPUT" ||
            act.tagName === "TEXTAREA" ||
            act.tagName === "SELECT" ||
            act.isContentEditable);
        if (typing && !inPalette) return;
        const displayed = getDisplayedCommands();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCommandIndex((prev) =>
            prev < displayed.length - 1 ? prev + 1 : prev,
          );
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          const cmd = displayed[selectedCommandIndex];
          if (cmd) executeCommand(cmd);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showCommandPalette,
    selectedCommandIndex,
    commandPaletteSearch,
    recentActions,
  ]);

  // Clamp selected index when filtered list shrinks (search typing) or recents change
  useEffect(() => {
    if (!showCommandPalette) return;
    const len = getDisplayedCommands().length;
    if (selectedCommandIndex >= len) {
      setSelectedCommandIndex(Math.max(0, len - 1));
    }
  }, [commandPaletteSearch, recentActions, showCommandPalette]);

  // Sticky-note pins + popup per page wrapper (0 = left page, 1 = right page)
  // Popups sit directly below the pin, centered on it
  const notesOverlay = (wrapper) => {
    const targetPdf = pageNum + wrapper;
    const popupPos = (p) => ({
      left: `${Math.min(Math.max(p.percentX, 1), 99)}%`,
      top: `calc(${Math.min(Math.max(p.percentY, 1), 99)}% + 14px)`,
      transform: "translateX(-50%)",
    });
    return (
      <>
        {notes
          .filter((n) => n.pdfPage === targetPdf)
          .map((note) => (
            <React.Fragment key={note.id}>
              <div
                style={{
                  position: "absolute",
                  left: `${Math.min(Math.max(note.percentX, 1), 99)}%`,
                  top: `${Math.min(Math.max(note.percentY, 1), 99)}%`,
                  transform: "translate(-50%,-50%)",
                  zIndex: 20,
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveNoteId(activeNoteId === note.id ? null : note.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="note-pin" title={plainTextFromHtml(note.text)}>
                  📌
                </div>
              </div>
              {activeNoteId === note.id && (
                <div
                  className="note-popup"
                  style={popupPos(note)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <div className="note-popup-head">
                    <span>📌 Nội dung ghi chú</span>
                    <button
                      className="note-popup-close"
                      onClick={() => setActiveNoteId(null)}
                      aria-label="Đóng ghi chú"
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    className="note-popup-body"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeNoteHtml(note.text),
                    }}
                  />
                  {note.images && note.images.length > 0 && (
                    <div className="note-popup-images">
                      {note.images.map((img, index) => {
                        const src = noteDisplaySrc(img);
                        if (!src) return null;
                        return (
                          <img
                            key={index}
                            src={src}
                            alt={`Note image ${index + 1}`}
                            className="note-popup-image"
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="note-popup-foot">
                    <button
                      className="btn btn-secondary"
                      onClick={() => startEditNote(note)}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      className="btn btn-secondary note-btn-danger"
                      onClick={() => deleteNote(note.id)}
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        {noteInput && (noteInput.wrapper || 0) === wrapper && (
          <div
            className="note-input-popup"
            style={popupPos(noteInput)}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="note-input-head">
              📌 {noteInput.editId ? "Sửa ghi chú" : "Thêm ghi chú"}
            </div>

            {/* Rich text toolbar */}
            <div className="note-toolbar">
              <button
                className="note-toolbar-btn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const el = noteEditableRef.current;
                  if (!el) return;
                  el.focus();
                  try {
                    document.execCommand("bold", false, null);
                  } catch {}
                  setNoteText(el.innerHTML);
                }}
                title="In đậm"
              >
                <b>B</b>
              </button>
              <button
                className="note-toolbar-btn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const el = noteEditableRef.current;
                  if (!el) return;
                  el.focus();
                  try {
                    document.execCommand("italic", false, null);
                  } catch {}
                  setNoteText(el.innerHTML);
                }}
                title="In nghiêng"
              >
                <i>I</i>
              </button>
              <button
                className="note-toolbar-btn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const el = noteEditableRef.current;
                  if (!el) return;
                  el.focus();
                  try {
                    document.execCommand("underline", false, null);
                  } catch {}
                  setNoteText(el.innerHTML);
                }}
                title="Gạch chân"
              >
                <u>U</u>
              </button>
              <button
                className="note-toolbar-btn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const el = noteEditableRef.current;
                  if (!el) return;
                  el.focus();
                  try {
                    document.execCommand("strikeThrough", false, null);
                  } catch {}
                  setNoteText(el.innerHTML);
                }}
                title="Gạch ngang"
              >
                <s>S</s>
              </button>
              <div className="note-toolbar-divider"></div>
              <label
                className="note-toolbar-btn note-image-btn"
                title="Thêm ảnh"
              >
                📷
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {/* Content editable div for rich text - uncontrolled to keep cursor/IME stable */}
            <div
              ref={noteEditableRef}
              className="note-content-editable"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Nhập ghi chú… (kéo thả ảnh vào đây cũng được)"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                const files = [...(e.dataTransfer?.files || [])].filter((f) => (f.type || "").startsWith("image/"));
                if (files.length) handleImageUpload(files[0]);
              }}
              onInput={(e) => {
                if (noteComposingRef.current) return;
                setNoteText(e.currentTarget.innerHTML);
              }}
              onCompositionStart={() => {
                noteComposingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                noteComposingRef.current = false;
                setNoteText(e.currentTarget.innerHTML);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData(
                  "text/plain",
                );
                try {
                  document.execCommand("insertText", false, text);
                } catch {
                  // fallback
                  const el = noteEditableRef.current;
                  if (el) {
                    document.execCommand("insertText", false, text);
                    setNoteText(el.innerHTML);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setNoteInput(null);
                  setNoteText("");
                  setNoteImages([]);
                  if (noteEditableRef.current)
                    noteEditableRef.current.innerHTML = "";
                }
              }}
            />

            {/* Image preview */}
            {noteImages.length > 0 && (
              <div className="note-images-preview">
                {noteImages.map((img, index) => {
                  const src = noteDisplaySrc(img);
                  if (!src) return null;
                  return (
                    <div key={index} className="note-image-item">
                      <img src={src} alt={`Note image ${index + 1}`} />
                      <button
                        className="note-image-remove"
                        onClick={() => removeImage(index)}
                        title="Xóa ảnh"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="note-input-foot">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setNoteInput(null);
                  setNoteText("");
                  setNoteImages([]);
                  if (noteEditableRef.current)
                    noteEditableRef.current.innerHTML = "";
                }}
              >
                Hủy
              </button>
              <button className="btn btn-primary" onClick={saveNote}>
                Lưu
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  // ─── RENDER ───────────────────────────────────────────────────
  // ── Research helpers: trích đoạn (clip) ──────────────────────
  const openClipDialog = () => {
    setClipCollName("");
    const sel = pendingSelRef.current;
    setClipText(sel || (pageIsImage ? "" : pageText));
    setShowClip(true);
  };

  const saveClip = () => {
    const name = clipCollName.trim();
    const text = clipText.trim();
    if (!name || !text) return;
    let coll = getCollections().find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (!coll) coll = addCollection(name, "");
    addClip({
      collId: coll.id,
      file: book.filename,
      bookTitle: book.title,
      grade: book.grade,
      subject: book.subject,
      page: pageNum,
      text,
      chapter: chapterForPage(book, pageNum),
    });
    notify(
      `Đã lưu trích đoạn vào bộ sưu tập "${name.length > 26 ? name.slice(0, 26) + "…" : name}".`,
    );
    setShowClip(false);
  };

  // ── HTML/Txt/Md book content fetcher (Word) ──
  useEffect(()=>{
    const ext = String(book.filename||"").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
    const isHtmlExt = [".html",".htm",".txt",".md"].includes(ext);
    if(!isHtmlExt) return;
    let cancelled=false;
    setHtmlBookLoading(true);
    setHtmlBookError("");
    fetch(`${API_BASE}/api/books/${encodeURIComponent(book.filename)}/content`)
      .then(async r=>{
        const data=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(data?.error||"Không tải được nội dung");
        if(cancelled) return;
        let c=data.content||"";
        // for txt/md plain, convert line breaks to <p> — nhưng nếu txt chứa html do Word (font/span) thì giữ để render y hệt html
        if(ext===".txt"){
          if(/<\s*(font|span|div|p|h[1-6]|ul|ol|li|table|strong|em|u|s|a|img|br|hr|blockquote)[^>]*>/i.test(c)){
            c=c.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"");
            if(!/<\s*(p|div|h1|h2|h3|ul|ol|table|blockquote)[^>]*>/i.test(c)){
              c=`<p>${c}</p>`;
            }
          } else {
            const esc=c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            c=esc.split(/\n\s*\n/).map(p=>`<p>${p.split("\n").join("<br>")}</p>`).join("");
          }
        } else if(ext===".md"){
          // minimal md already handled server? but fallback
          if(c.includes("#") && !c.includes("<h")){
            let h=c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            h=h.replace(/^###\s+(.*)$/gm,'<h3>$1</h3>').replace(/^##\s+(.*)$/gm,'<h2>$1</h2>').replace(/^#\s+(.*)$/gm,'<h1>$1</h1>');
            h=h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
            c=h.split("\n").map(l=> l.trim().startsWith("<")?l:`<p>${l}</p>`).join("");
          } else if(!c.includes("<")){
            const esc=c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            c=esc.split(/\n\s*\n/).map(p=>`<p>${p.split("\n").join("<br>")}</p>`).join("");
          }
        }
        // Sanitize MỘT LẦN tại điểm tải: mọi nơi dùng htmlBookContent
        // (render trang, extract TOC, export docx) đều nhận bản đã sạch
        setHtmlBookContent(DOMPurify.sanitize(c) || "<p style='color:#94a3b8; text-align:center; padding:48px 0;'>Chưa có nội dung</p>");
      })
      .catch(e=>{ if(!cancelled) setHtmlBookError(uiMessage(e, "Không tải được nội dung. Vui lòng thử lại.")); })
      .finally(()=>{ if(!cancelled) setHtmlBookLoading(false); });
    return ()=>{ cancelled=true; };
  },[book.filename, contentVersion]);

  // ── Non-PDF viewer — chỉ ảnh / định dạng lạ giữ layout riêng, còn Word (html/txt/md) sẽ dùng layout chuẩn với TOC + AI y hệt PDF ──
  if (!isPdfFile) {
    const fileUrl = `${API_BASE}/api/books/${encodeURIComponent(book.filename)}`;
    if (isImgFileEarly) {
      return (
        <div className={`reader-root ${fullscreen ? "fullscreen" : ""}`}>
          <div className="viewer-toolbar viewer-toolbar--compact">
            <div className="rtb-left">
              <button className="rtb-back" onClick={onBack} title="Quay lại thư viện"><ArrowLeft size={16} /> <span className="rtb-back-text">Thư viện</span></button>
              <span className="rtb-title" title={book.title}>{book.title}</span>
              <span className="tag-pill" style={{ marginLeft: 8, fontSize: "0.7rem" }}>{fileExt.toUpperCase().replace(".", "")}</span>
            </div>
            <div className="rtb-center">
              <a className="btn btn-secondary btn-sm" href={fileUrl} download={book.filename} title="Tải xuống"><Download size={14} /> Tải xuống</a>
            </div>
          </div>
          <div style={{ flex: 1, display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", background:"var(--bg)" }}>
            <img src={fileUrl} alt={book.title} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} />
          </div>
        </div>
      );
    }
    if (!isWordFile) {
      const fileUrl2 = `${API_BASE}/api/books/${encodeURIComponent(book.filename)}`;
      return (
        <div className={`reader-root ${fullscreen ? "fullscreen" : ""}`}>
          <div className="viewer-toolbar viewer-toolbar--compact">
            <div className="rtb-left">
              <button className="rtb-back" onClick={onBack} title="Quay lại thư viện"><ArrowLeft size={16} /> <span className="rtb-back-text">Thư viện</span></button>
              <span className="rtb-title" title={book.title}>{book.title}</span>
              <span className="tag-pill" style={{ marginLeft: 8, fontSize: "0.7rem" }}>{fileExt.toUpperCase().replace(".", "")}</span>
            </div>
            <div className="rtb-center">
              <a className="btn btn-secondary btn-sm" href={fileUrl2} download={book.filename} title="Tải xuống"><Download size={14} /> Tải xuống</a>
            </div>
          </div>
          <div style={{ flex: 1, display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem", background:"var(--bg)" }}>
            <div style={{ textAlign: "center", maxWidth: 520, padding: "2rem", background: "var(--surface)", border: "1px solid var(--border-color)", borderRadius: 16 }}>
              <FileText size={48} style={{ opacity: 0.5, marginBottom: 12 }} />
              <h3 style={{ margin: "0 0 0.5rem" }}>{book.title}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>Định dạng <b>{fileExt}</b> chưa xem trực tiếp. Hãy tải xuống để mở bằng ứng dụng phù hợp.</p>
              <a className="btn btn-primary" href={fileUrl2} download={book.filename}><Download size={16} /> Tải xuống {fileExt.toUpperCase()}</a>
            </div>
          </div>
        </div>
      );
    }
    // isWordFile (html/txt/md) -> không return sớm, rơi xuống layout chuẩn với TOC + AI bên dưới
  }
  // For Word files, isWordFile=true will tiếp tục xuống reader với TOC/AI

  return (
    <div className={`reader-root ${fullscreen ? "fullscreen" : ""}`}>
      {/* ── Toolbar ── compact 1-row (desktop) / 2-tier (mobile) ── */}
      <div className="viewer-toolbar viewer-toolbar--compact">
        {/* LEFT: Back + Title + TOC Toggle */}
        <div className="rtb-left">
          <button
            className="rtb-back"
            onClick={onBack}
            title="Quay lại thư viện"
            aria-label="Quay lại thư viện"
          >
            <ArrowLeft size={16} />{" "}
            <span className="rtb-back-text">Thư viện</span>
          </button>
          <button
            className={`btn-icon rtb-icon-btn ${tocCollapsed ? "" : "on"}`}
            onClick={() => setTocCollapsed(!tocCollapsed)}
            title={tocCollapsed ? "Mục lục" : "Ẩn mục lục"}
            aria-label={tocCollapsed ? "Mục lục" : "Ẩn mục lục"}
          >
            <BookOpen size={16} />
          </button>
          <span className="rtb-title" title={book.title}>
            {book.title}
          </span>
        </div>

        {/* CENTER: Nav + Zoom + Bookmark + TTS */}
        <div className="rtb-center">
          {isWordFile ? (
            <>
              <div className="rtb-nav">
                <span className="rtb-page-pill" style={{fontSize:"0.76rem", fontWeight:800, padding:"4px 10px"}}>{htmlBookPages.length} trang • {((htmlBookContent.replace(/<[^>]*>/g,"").length/1000).toFixed(1))}k ký tự</span>
              </div>
              <div className="rtb-zoom" data-zoom data-no-sound>
                <button className="btn-icon rtb-zoom-btn" data-no-sound data-zoom onClick={()=> { const nv=Math.max(70, htmlZoom-10); setHtmlZoom(nv); try{ updateSettings({ editor:{ defaultZoom: nv }});}catch{} }} disabled={htmlZoom<=70} title="Thu nhỏ — đồng bộ Cài đặt"><Minus size={14}/></button>
                <span className="rtb-zoom-pct" style={{fontSize:"0.76rem", fontWeight:800, minWidth:36, textAlign:"center"}}>{htmlZoom}%</span>
                <button className="btn-icon rtb-zoom-btn" data-no-sound data-zoom onClick={()=> { const nv=Math.min(150, htmlZoom+10); setHtmlZoom(nv); try{ updateSettings({ editor:{ defaultZoom: nv }});}catch{} }} disabled={htmlZoom>=150} title="Phóng to — đồng bộ Cài đặt"><Plus size={14}/></button>
              </div>
              {onEditWord && (
                <button className="btn btn-secondary btn-sm" onClick={onEditWord} title="Sửa sách này như trong Word (mở trình soạn Word)">
                  <Edit3 size={13} /> <span className="hide-mobile">Sửa như Word</span>
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={handleExportWord} disabled={exportingWord || htmlBookLoading} title="Xuất sách này ra file .docx thật — giữ định dạng, mở/sửa bằng Word">
                <Download size={13} /> <span className="hide-mobile">{exportingWord ? "Đang xuất..." : "Xuất Word"}</span>
              </button>
            </>
          ) : (
            <>
              {/* Page nav: ◀ 45–46/261 ▶ (single source of truth, no duplicate pill) */}
              <div className="rtb-nav">
            <button
              className="btn-icon rtb-nav-btn"
              onClick={() => goToPage(pageNum - (twoPageMode ? 2 : 1))}
              disabled={pageNum <= 1}
              title="Trang trước (←)"
              aria-label="Trang trước"
            >
              <ChevronLeft size={18} />
            </button>
            {editingPage ? (
              <input
                autoFocus
                type="number"
                min={1}
                max={totalBookPages || 1}
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(pageInputVal);
                    if (!isNaN(n) && n >= 1) goToPage(n + 1);
                  }
                  if (e.key === "Escape") {
                    setEditingPage(false);
                    setPageInputVal("");
                  }
                }}
                onBlur={() => {
                  const n = parseInt(pageInputVal);
                  if (!isNaN(n) && n >= 1) goToPage(n + 1);
                  else {
                    setEditingPage(false);
                    setPageInputVal("");
                  }
                }}
                className="rtb-page-input"
              />
            ) : (
              <button
                className="rtb-page-pill"
                onClick={() => {
                  setEditingPage(true);
                  setPageInputVal(String(bookPage(pageNum)));
                }}
                title="Click để nhập trang"
              >
                {pageDisplay} / {totalBookPages || "…"}
              </button>
            )}
            <button
              className="btn-icon rtb-nav-btn"
              onClick={() => goToPage(pageNum + (twoPageMode ? 2 : 1))}
              disabled={pageNum >= numPages}
              title="Trang sau (→)"
              aria-label="Trang sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Zoom: − 100% +  (with popup presets) — excluded from global click sound (user wants trừ zoom) */}
          <div className="rtb-zoom" data-zoom data-no-sound>
            <button
              className="btn-icon rtb-zoom-btn"
              data-no-sound
              data-zoom
              onClick={() => {
                manualZoomRef.current = true;
                setZoom((z) => zoomOutHelper(z));
              }}
              disabled={zoom <= ZOOM_MIN + 0.001}
              title="Thu nhỏ (-)"
              aria-label="Thu nhỏ"
            >
              <Minus size={14} />
            </button>
            <button
              className="rtb-zoom-pct"
              data-zoom-trigger
              data-no-sound
              data-zoom
              onClick={() => setShowZoomMenu((v) => !v)}
              title="Đổi mức zoom / vừa khổ trang (Ctrl+cuộn để zoom)"
              aria-haspopup="menu"
              aria-expanded={showZoomMenu}
            >
              {Math.round(zoom * 100)}%
            </button>
            {showZoomMenu && (
              <div
                className="rtb-pop rtb-zoom-pop"
                ref={zoomMenuRef}
                role="menu"
              >
                {(ZOOM_PRESETS || [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800, 1000]).map((p) => (
                  <button
                    key={p}
                    data-no-sound
                    data-zoom
                    className={`rtb-pop-item ${Math.round(zoom * 100) === p ? "on" : ""}`}
                    onClick={() => {
                      manualZoomRef.current = true;
                      setZoom(clampZoomHelper(p / 100));
                      setShowZoomMenu(false);
                    }}
                    role="menuitem"
                  >
                    {p}%
                  </button>
                ))}
                <div className="rtb-pop-sep" />
                <button
                  className="rtb-pop-item"
                  data-no-sound
                  data-zoom
                  onClick={() => {
                    fitToWidth(true);
                    setShowZoomMenu(false);
                  }}
                  role="menuitem"
                >
                  <Maximize2 size={14} /> Vừa khổ trang
                </button>
              </div>
            )}
            <button
              className="btn-icon rtb-zoom-btn"
              data-no-sound
              data-zoom
              onClick={() => {
                manualZoomRef.current = true;
                setZoom((z) => zoomInHelper(z));
              }}
              disabled={zoom >= ZOOM_MAX - 0.001}
              title="Phóng to (+)"
              aria-label="Phóng to"
            >
              <Plus size={14} />
            </button>
          </div>
            </>
          )}

          {/* Bookmark — always visible (PDF & Word) */}
          <button
            className={`btn-icon rtb-icon-btn ${isBookmarked ? "on" : ""}`}
            onClick={handleToggleBookmark}
            title={
              isBookmarked
                ? `Bỏ đánh dấu trang ${bookPage(pageNum)}`
                : `Đánh dấu trang ${bookPage(pageNum)}`
            }
            aria-label={isBookmarked ? "Bỏ đánh dấu trang" : "Đánh dấu trang"}
          >
            {isBookmarked ? (
              <BookmarkCheck size={16} fill="currentColor" />
            ) : (
              <BookmarkPlus size={16} />
            )}
          </button>

          {/* ✂ Quét vùng — SGK Scan */}
          <button
            className={`btn-icon rtb-icon-btn ${scanMode ? "on" : ""}`}
            onClick={() => setScanMode((v) => !v)}
            title="Khoanh vùng nội dung trên trang SGK để tạo học liệu bằng AI"
            aria-label="Quét vùng"
            aria-pressed={scanMode}
          >
            <Scissors size={16} />
          </button>

          {/* SGK → KHBD: đã gỡ theo module mới (soạn trực tiếp trong Giáo án) */}
          <button
            className="btn-icon rtb-icon-btn"
            onClick={async () => {
              const sel = (typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "") || pendingSelRef.current || "";
              const PLACEHOLDER = "Trang này dạng ảnh";
              const isPlaceholder = (s) => s && String(s).includes(PLACEHOLDER);
              let text = sel || "";
              if (!text) {
                const leftText = pageIsImage || isPlaceholder(pageText) ? "" : pageText;
                const rightText = rightPageIsImage || isPlaceholder(rightPageText) ? "" : rightPageText;
                text = leftText || rightText || "";
              }
              // Nếu vẫn rỗng và trang là ảnh → sẽ gửi ảnh thay vì placeholder
              if (isPlaceholder(text)) text = "";
              const pdfPage = pageNum;
              const bp = Math.max(1, pdfPage - 1);
              const ch = (() => { try { return chapterForPage(book, pdfPage); } catch { return ""; } })();
              const cit = (() => { try { return citationFor(book, pdfPage); } catch { return `${book.title || "SGK"} — tr. ${bp}`; } })();
              const title = `${book.title || "SGK"} — tr.${bp}${ch ? ` · ${ch}` : ""}`;
              const sourceRef = { filename: book.filename || "", title: book.title || "", page: pdfPage, bookPage: bp, chapter: ch || "", citation: cit, grade: book.grade || null, subject: book.subject || "" };
              const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
              const mindmapBranches = lines.length >= 3 ? lines.slice(0, 5).map((l) => l.slice(0, 30)) : null;
              // Nếu trang là ảnh, gửi kèm ảnh để Whiteboard tạo node ảnh thay vì note placeholder
              let imageDataUrl = null;
              if (pageIsImage && pageImageBase64) {
                imageDataUrl = `data:image/jpeg;base64,${pageImageBase64}`;
              } else if (rightPageIsImage && rightPageImageBase64) {
                imageDataUrl = `data:image/jpeg;base64,${rightPageImageBase64}`;
              }
              try {
                const { sendToWhiteboard } = await import("./whiteboard/whiteboardIntegration.js");
                if (!text && !imageDataUrl) {
                  notify("Trang này là ảnh chưa có chữ — hãy bấm “Nhận diện (OCR)” rồi thử lại, hoặc dùng Quét vùng để đưa ảnh vào Bảng trắng", "warning");
                  return;
                }
                sendToWhiteboard({ title, text: text || title, source: "bookReader", sourceRef, mindmapBranches, imageDataUrl });
                notify(imageDataUrl ? `Đã đưa ảnh tr.${bp} vào Whiteboard` : `Đã đưa tr.${bp} vào Whiteboard — bấm “Mở sách” trên board để quay lại`, "success");
              } catch {}
            }}
            title="Đưa vào Whiteboard (giữ nguồn trang & mục lục — trang ảnh sẽ gửi ảnh)"
            aria-label="Đưa vào Whiteboard"
          >
            <Palette size={16} />
          </button>

          {/* OCR — moved from bottom card to toolbar tool */}
          <button
            className={`btn-icon rtb-icon-btn ${showOcrDrawer ? "on" : ""}`}
            onClick={() => setShowOcrDrawer((v) => !v)}
            title="Nhận diện văn bản (OCR)"
            aria-label="Nhận diện văn bản"
            aria-pressed={showOcrDrawer}
          >
            <ScanText size={16} />
          </button>

          {/* TTS: single button → popup (preserves all TTS functions) */}
          <div className="rtb-tts-anchor">
            <button
              className={`btn-icon rtb-icon-btn ${ttsActive ? "on tts-on" : ""}`}
              data-tts-trigger
              onClick={() => setShowTtsMenu((v) => !v)}
              title={
                ttsActive
                  ? ttsPaused
                    ? "Tiếp tục đọc"
                    : "Đang đọc — bấm để điều khiển"
                  : "Đọc sách"
              }
              aria-haspopup="dialog"
              aria-expanded={showTtsMenu}
              aria-label="Đọc sách"
            >
              {ttsActive && !ttsPaused ? (
                <Pause size={15} />
              ) : ttsActive && ttsPaused ? (
                <Play size={15} />
              ) : (
                <Volume2 size={15} />
              )}
            </button>
            {showTtsMenu && (
              <div
                className="rtb-pop rtb-tts-pop"
                ref={ttsMenuRef}
                role="dialog"
                aria-label="Đọc sách"
              >
                <div className="rtb-pop-head">
                  <Volume2 size={14} /> Đọc sách
                </div>
                <div className="rtb-tts-actions">
                  <button
                    className="rtb-pop-item"
                    onClick={() => {
                      handleTTS();
                    }}
                  >
                    {ttsActive ? (
                      ttsPaused ? (
                        <Play size={14} />
                      ) : (
                        <Pause size={14} />
                      )
                    ) : (
                      <Play size={14} />
                    )}{" "}
                    {ttsActive ? (ttsPaused ? "Tiếp tục" : "Tạm dừng") : "Đọc"}
                  </button>
                  {ttsActive && (
                    <button
                      className="rtb-pop-item danger"
                      onClick={() => {
                        stopTTS();
                        setShowTtsMenu(false);
                      }}
                    >
                      <Square size={12} /> Dừng
                    </button>
                  )}
                </div>
                <div className="rtb-pop-label">Tốc độ</div>
                <div className="rtb-rate-row">
                  {[0.7, 1.0, 1.3, 1.5].map((r) => (
                    <button
                      key={r}
                      className={`rtb-rate ${ttsRate === r ? "on" : ""}`}
                      onClick={() => setTtsRate(r)}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <button
            className={`btn-icon rtb-icon-btn ${fullscreen ? "on" : ""}`}
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
          >
            <Maximize2 size={16} />
          </button>

          {/* Advanced Tools Drawer Toggle */}
          <button
            className={`btn-icon rtb-icon-btn ${showAdvancedDrawer ? "on" : ""}`}
            onClick={() => setShowAdvancedDrawer((v) => !v)}
            title="Công cụ nâng cao"
            aria-label="Công cụ nâng cao"
            aria-pressed={showAdvancedDrawer}
          >
            <MoreVertical size={16} />
          </button>
        </div>

        {/* RIGHT: AI Toggle */}
        <div className="rtb-right">
          <div className="rtb-ai-sep" aria-hidden />

          <button
            className={`rtb-ai-btn ${aiCollapsed ? "" : "on"}`}
            onClick={() => setAiCollapsed((c) => !c)}
            title={aiCollapsed ? "Mở bảng AI" : "Thu gọn bảng AI"}
            aria-label={aiCollapsed ? "Mở bảng AI" : "Thu gọn bảng AI"}
          >
            <Sparkles size={14} /> <span className="rtb-ai-label">AI</span>
            {aiCollapsed ? (
              <ChevronsLeft size={14} />
            ) : (
              <ChevronsRight size={14} />
            )}
          </button>
        </div>
      </div>

      {/* ── Main layout: TOC + PDF + AI Panel ─────────────────────────── */}
      <div className="reader-main">
        {/* Scrim mobile cho ngăn mục lục (desktop ẩn qua CSS) */}
        {!tocCollapsed && (
          <button
            type="button"
            className="reader-sheet-scrim reader-toc-scrim"
            onClick={() => setTocCollapsed(true)}
            aria-label="Đóng mục lục"
            tabIndex={-1}
          />
        )}
        {/* ── Left Panel: Table of Contents ──────────────────────────── */}
        {!tocCollapsed &&
          (() => {
            const q = tocQuery.trim().toLowerCase();
            const filteredToc = !q
              ? tocItems
              : tocItems.filter(
                  (it) =>
                    (it.title || "").toLowerCase().includes(q) ||
                    (it.sub || "").toLowerCase().includes(q),
                );
            const isActive = (pdfPage) =>
              pageNum === pdfPage || (twoPageMode && pageNum + 1 === pdfPage);
            return (
              <div className="reader-toc-panel" style={{ width: tocCollapsed ? undefined : `${tocWidth}px`, flex: tocCollapsed ? undefined : `0 0 ${tocWidth}px` }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  const dropped = [...(e.dataTransfer?.files || [])];
                  const imgs = dropped.filter((x) => String(x.type || "").toLowerCase().startsWith("image/"));
                  const xlsxF = dropped.find((x) => /\.(xlsx|xls)$/i.test(x.name || ""));
                  if (imgs.length) handleTocAiFiles(imgs);
                  else if (xlsxF) handleUploadToc(xlsxF);
                  else if (dropped.length) notify("Chỉ nhận file Excel (.xlsx/.xls) hoặc ẢNH mục lục (JPG/PNG/WebP)", "warning");
                }}
                title="Mẹo: kéo thả file Excel HOẶC ảnh trang mục lục vào đây (ảnh sẽ do AI đọc)"
              >
                <div className="reader-toc-header">
                  <h3 className="reader-toc-title">MỤC LỤC</h3>
                  <span className="toc-count">
                    {filteredToc.length}/{tocItems.length}
                  </span>
                  <input
                    ref={tocFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        handleUploadToc(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={tocAiFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files?.length)
                        handleTocAiFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => tocAiFileRef.current?.click()}
                    title={
                      tocAiBusy
                        ? "Đang AI đọc ảnh mục lục…"
                        : geminiKey
                          ? `Tạo mục lục bằng AI từ ảnh — chọn nhiều ảnh mục lục (tối đa ${TOC_AI_MAX_IMAGES})`
                          : "Cần cấu hình Gemini API Key trong Cài đặt AI"
                    }
                    aria-label="Tạo mục lục bằng AI từ ảnh"
                    disabled={tocAiBusy || !geminiKey}
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center" }}
                  >
                    {tocAiBusy ? <Loader2 size={14} className="spinner" /> : <Sparkles size={14} />}
                  </button>
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() => tocFileRef.current?.click()}
                    title="Tải lên hoặc kéo thả file Excel vào panel — chỉ cần 2 cột Tên và Trang (Excel)"
                    aria-label="Tải lên mục lục"
                  >
                    <Upload size={14} /> Tải lên
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={handleDownloadToc}
                    title="Tải xuống — 2 cột Tên/Trang (Excel)"
                    aria-label="Tải xuống mục lục"
                    disabled={!tocItems.length}
                  >
                    <Download size={14} />
                  </button>
                </div>
                <div className="reader-toc-search">
                  <input
                    type="text"
                    placeholder="Tìm kiếm..."
                    aria-label="Tìm kiếm mục lục"
                    value={tocQuery}
                    onChange={(e) => setTocQuery(e.target.value)}
                  />
                </div>
                {/* Bulk adjust toàn bộ số trang */}
                <div style={{ display: "flex", gap: 6, padding: "6px 8px", alignItems: "center", borderBottom: "1px solid var(--border-color, #e2e8f0)", background: "var(--bg-subtle, #f8fafc)", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Chỉnh toàn bộ:</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => handleBulkAdjust(-1)} disabled={!tocItems.length} title="Giảm 1 trang cho tất cả mục" aria-label="Giảm 1 trang toàn bộ" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <Minus size={12} />1
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => handleBulkAdjust(1)} disabled={!tocItems.length} title="Tăng 1 trang cho tất cả mục" aria-label="Tăng 1 trang toàn bộ" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <Plus size={12} />1
                  </button>
                  <input
                    type="number"
                    placeholder="+/-"
                    value={bulkDelta}
                    onChange={(e) => setBulkDelta(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBulkDeltaApply(); }}
                    style={{ width: 56, padding: "2px 6px", border: "1px solid var(--border-color, #cbd5e1)", borderRadius: 6, fontSize: "0.8rem", textAlign: "center" }}
                    title="Nhập số tăng/giảm (vd: 2 hoặc -3)"
                    aria-label="Nhập số tăng giảm toàn bộ"
                  />
                  <button className="btn btn-primary btn-xs" onClick={handleBulkDeltaApply} disabled={!tocItems.length || !String(bulkDelta).trim()} title="Áp dụng tăng/giảm nhập ở ô bên cạnh" aria-label="Áp dụng chỉnh toàn bộ">
                    Áp dụng
                  </button>
                </div>
                <div className="reader-toc-content">
                  {filteredToc.length ? (
                    filteredToc.map((item, idx) => {
                      const pdfPage = item.pdfPage || item.page;
                      const bookPageNum = Math.max(
                        1,
                        (item.page || pdfPage) - 1,
                      );
                      const origIdx = tocItems.indexOf(item);
                      const isEditing = editingTocIdx === origIdx;
                      return (
                        <div
                          key={item.id || `${item.page}-${origIdx}`}
                          className={`toc-item ${isActive(pdfPage) ? "active" : ""}`}
                          onClick={() => {
                            if (isEditing) return;
                            if (isWordFile) {
                              const el=document.getElementById(`word-page-${pdfPage}`);
                              if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
                              setPageNum(pdfPage);
                            } else goToPage(pdfPage); try { if (window.matchMedia("(max-width: 767.98px)").matches) setTocCollapsed(true); } catch {}
                          }}
                          title={isEditing ? `Đang sửa trang` : `Nhảy tới trang ${bookPageNum} — ${item.title} (click số trang để sửa)`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (isEditing) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (isWordFile) {
                                const el=document.getElementById(`word-page-${pdfPage}`);
                                if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
                                setPageNum(pdfPage);
                              } else goToPage(pdfPage); try { if (window.matchMedia("(max-width: 767.98px)").matches) setTocCollapsed(true); } catch {}
                            }
                          }}
                          style={{
                            paddingLeft: `${0.5 + (item.depth || 0) * 0.6}rem`,
                          }}
                        >
                          <span className="toc-item-lesson">{idx + 1}</span>
                          <span className="toc-item-name">
                            {item.title}
                            {item.sub ? ` — ${item.sub}` : ""}
                          </span>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editingTocVal}
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setEditingTocVal(e.target.value)}
                              onBlur={() => saveEditTocPage(origIdx)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveEditTocPage(origIdx); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelEditTocPage(); }
                                e.stopPropagation();
                              }}
                              onClick={(e) => e.stopPropagation()}
                               style={{ width: 56, textAlign: "right", fontWeight: 700, border: "1px solid var(--primary, #3b82f6)", borderRadius: 4, padding: "1px 4px", fontSize: "0.85em", background: "var(--input-bg)" }}
                              min={1}
                              max={isWordFile ? (htmlBookPages.length || 1) : (numPages ? numPages - 1 : 9999)}
                            />
                          ) : (
                            <span
                              className="toc-item-page"
                              onClick={(e) => { e.stopPropagation(); startEditTocPage(origIdx, bookPageNum); }}
                              title="Click để sửa số trang"
                              style={{ cursor: "pointer", borderBottom: "1px dashed var(--border-color, #cbd5e1)", paddingBottom: 1 }}
                            >{bookPageNum}</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="toc-empty">
                      Không tìm thấy mục nào khớp.
                    </div>
                  )}
                </div>
                {!tocCollapsed && (
                  <div
                    className="panel-resizer panel-resizer-right"
                    onMouseDown={onTocResizeStart}
                    onTouchStart={onTocResizeStart}
                    onDoubleClick={()=>{ setTocWidth(280); const r=safeSetString("sgk_toc_w","280"); if(!r.ok) console.warn("[BookReader] Failed to reset sgk_toc_w:", r.error, "giữ dữ liệu cũ"); }}
                    title="Kéo để đổi độ rộng, double-click để reset"
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })()}

        {/* ── PDF Viewer Panel ──────────────────────────────────── */}
        <div className="pdf-panel">
          {isWordFile ? (
            htmlBookLoading ? (
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:"60px 0", color:"var(--text-muted)", background:"#eef2f7"}}><div className="spinner" style={{width:28,height:28}}/><span>Đang tải nội dung...</span></div>
            ) : htmlBookError ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"#eef2f7", padding:"20px"}}>
                <div style={{ textAlign:"center", padding:"2rem", background:"var(--surface)", border:"1px solid var(--border-color)", borderRadius:12, maxWidth:520}}>
                  <AlertCircle size={28} style={{color:"var(--danger)", marginBottom:8}}/>
                  <p style={{color:"var(--danger)", fontWeight:700}}>{htmlBookError}</p>
                </div>
              </div>
            ) : (
              <div style={{ flex:1, overflow:"auto", background:"#eef2f7", padding:"18px", display:"flex", justifyContent:"flex-start", alignItems:"flex-start"}}>
                <div className={`word-book-pages ${htmlZoom!==100?'is-zoomed':''}`} style={{ width:"100%", maxWidth:860, "--word-zoom": `${htmlZoom}%` }}>
                  {htmlBookPages.map((pHtml, idx)=>(
                    <div key={idx} id={`word-page-${idx+1}`} className="word-book-page">
                      <div className="word-book-page-header">
                        <span>{book.subject} · Lớp {book.grade} · Tập {book.term}</span>
                        <span>{book.title.slice(0,32)}{book.title.length>32?"…":""} — {idx+1}/{htmlBookPages.length}</span>
                      </div>
                      <div className="word-book-content" dangerouslySetInnerHTML={{ __html: pHtml }} />
                      <div className="word-book-page-footer">
                        <span>SGK — {book.subject}</span>
                        <span>— Trang {idx+1} / {htmlBookPages.length} —</span>
                        <span>{new Date().toLocaleDateString("vi-VN")}</span>
                      </div>
                      <div className="word-page-number">{idx+1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : pdfError ? (
            <div className="pdf-error-overlay">
              <AlertCircle size={44} color="var(--accent)" />
              <p className="pdf-error-text">{pdfError}</p>
              <button
                className="btn btn-primary"
                onClick={() => loadBook(book)}
              >
                <RotateCcw size={16} /> Thử lại
              </button>
            </div>
          ) : (
            <>
              {/* Scrollable canvas area */}
              <div
                ref={viewportContainerRef}
                className="pdf-viewport-container"
                onPointerDown={scanMode ? undefined : handlePanPointerDown}
                onPointerMove={scanMode ? undefined : handlePanPointerMove}
                onPointerUp={scanMode ? undefined : handlePanPointerUp}
                onPointerLeave={scanMode ? undefined : handlePanPointerLeave}
                onPointerCancel={scanMode ? undefined : handlePanPointerUp}
                style={{
                  cursor: scanMode
                    ? "crosshair"
                    : isDraggingPan
                      ? "grabbing"
                      : "grab",
                  position: "relative",
                  touchAction: scanMode ? "auto" : "none",
                  userSelect: isDraggingPan ? "none" : "auto",
                }}
              >
                <div
                  className="pdf-view-inner"
                  style={{
                    transform: `translate(${panX}px, ${panY}px)`,
                    transformOrigin: "center center",
                    willChange: "transform",
                    transition: isDraggingPan ? "none" : "transform 0.12s ease",
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-start",
                    justifyContent: "center",
                  }}
                >
                  {/* Page 1 canvas */}
                  <div
                    className="pdf-canvas-box"
                    onDoubleClick={(e) => handleCanvasDblClick(e, 0)}
                    title="Nhấp đúp vào trang để thêm ghi chú"
                  >
                    <canvas ref={canvasRef} />

                    {notesOverlay(0)}

                    {isRendering && (
                      <div className="overlay-veil">
                        <div className="spinner" />
                      </div>
                    )}
                  </div>

                  {/* Page 2 canvas (two-page mode) */}
                  {twoPageMode && pageNum + 1 <= numPages && (
                    <div
                      className="pdf-canvas-box"
                      onDoubleClick={(e) => handleCanvasDblClick(e, 1)}
                      title="Nhấp đúp vào trang để thêm ghi chú"
                    >
                      <canvas ref={canvas2Ref} />
                      {notesOverlay(1)}
                    </div>
                  )}
                </div>
                {zoomPillVisible && (
                  <div className="zoom-pill" aria-live="polite">{Math.round(zoom * 100)}%</div>
                )}
                {scanMode && (
                  <ScanOverlay
                    containerRef={viewportContainerRef}
                    active={scanMode}
                    onSelect={handleScanSelect}
                    onCancel={() => setScanMode(false)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── AI Panel ─────────────────────────────────────────── */}
        {/* Scrim mobile cho bảng AI (desktop ẩn qua CSS) */}
        {!aiCollapsed && (
          <button
            type="button"
            className="reader-sheet-scrim reader-ai-scrim"
            onClick={() => setAiCollapsed(true)}
            aria-label="Đóng bảng AI"
            tabIndex={-1}
          />
        )}
        {!aiCollapsed ? (
          <div className="ai-panel" style={{ width: `${aiWidth}px`, flex: `0 0 ${aiWidth}px` }}>
            <div
              className="panel-resizer panel-resizer-left"
              onMouseDown={onAiResizeStart}
              onTouchStart={onAiResizeStart}
              onDoubleClick={()=>{ setAiWidth(380); const r=safeSetString("sgk_ai_w","380"); if(!r.ok) console.warn("[BookReader] Failed to reset sgk_ai_w:", r.error, "giữ dữ liệu cũ"); }}
              title="Kéo để đổi độ rộng, double-click để reset"
              aria-hidden="true"
            />
            {/* Section bar */}
            <div className="ai-tabs">
              {AI_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  className={`ai-tab ${activeTab === section.id ? "active" : ""}`}
                  onClick={() => setActiveTab(section.id)}
                >
                  {section.icon}
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
            {/* Global AI — liên kết mọi công cụ, không chạy độc lập — tinh tế, gọn, tương phản rõ */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.32rem", padding: "0.42rem 0.6rem", borderBottom: "1px solid rgba(226,232,240,0.9)", background: "var(--surface)", backdropFilter: "blur(4px)" }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", color: "var(--text-mid)", textTransform: "uppercase" }}>AI LIÊN KẾT</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--surface-soft)", border: "1px solid rgba(226,232,240,0.9)", padding: "2px 7px", borderRadius: 999, fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }} title={`Mức độ: ${{quick:"Nhanh",balanced:"Cân bằng",deep:"Sâu"}[chatEffort]}`}>⚡ { {quick:"Nhanh",balanced:"Cân bằng",deep:"Sâu"}[chatEffort] }</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--surface-soft)", border: "1px solid rgba(226,232,240,0.9)", padding: "2px 7px", borderRadius: 999, fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }} title={`Độ dài: ${{concise:"Ngắn",balanced:"Vừa",detailed:"Dài"}[chatResponseLength]}`}>↕ { {concise:"Ngắn",balanced:"Vừa",detailed:"Dài"}[chatResponseLength] }</span>
              {aiBusy ? (
                <button
                  className="btn btn-danger btn-xs"
                  style={{ marginLeft: "auto" }}
                  onClick={stopAi}
                  title="Dừng AI đang chạy"
                  aria-label="Dừng AI"
                >
                  <Square size={11} fill="currentColor" /> Dừng
                </button>
              ) : (
                <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: "var(--text-mid)", fontWeight: 600 }}>Áp dụng mọi công cụ</span>
              )}
              <button onClick={() => setActiveTab("chat")} title="Đổi mức độ / độ dài ở tab Hỏi AI" style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--color-action, var(--primary))", background: "var(--surface)", border: "1px solid var(--border-color)", padding: "2px 7px", borderRadius: 999, cursor: "pointer", boxShadow: "none" }}>Đổi →</button>
            </div>

            {/* Section content */}
            <div className="ai-tab-content">
              {/* ── Hỏi AI Section ─────────────────────────────── */}
              {activeTab === "chat" && (
                <>
                  <div className="chat-header">
                    <span
                      style={{
                        fontWeight: 800,
                        color: "var(--primary)",
                        fontSize: "0.9rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <Sparkles size={15} color="var(--secondary)" /> Trò chuyện
                      với Thầy AI
                    </span>
                    {chatMessages.length > 1 && (
                      <div className="bookreader-header-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={saveChatToCollection}
                          title="Lưu hội thoại vào Bộ sưu tập"
                        >
                          <BookmarkPlus size={13} /> Lưu
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={clearChat}
                          title="Bắt đầu hội thoại mới"
                        >
                          <Trash2 size={13} /> Hội thoại mới
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    className="form-control"
                    rows={2}
                    value={preStudyPrompt}
                    onChange={(e) => setPreStudyPrompt(e.target.value)}
                    placeholder="Ví dụ: Tóm tắt 3 ý chính, giải nghĩa từ khó và cho 3 câu hỏi ngắn…"
                    style={{ resize: "vertical", minHeight: 68 }}
                  />

                  {/* Page range selector — chat with several pages as context */}
                  <PageRangePicker
                    from={chatFrom}
                    to={chatTo}
                    setFrom={setChatFrom}
                    setTo={setChatTo}
                    total={totalBookPages}
                    currentBookPage={bookPage(pageNum)}
                  />
                  <div
                    className="chat-messages"
                    style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
                  >
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`chat-message ${msg.role === "ai" ? "message-ai" : "message-user"}`}
                      >
                        <MarkdownText text={msg.text} />
                      </div>
                    ))}
                    {chatLoading && (
                      <div
                        className="chat-message message-ai"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <div
                          className="spinner"
                          style={{ width: 14, height: 14 }}
                        />{" "}
                        Thầy AI đang suy nghĩ…
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {!geminiKey && (
                    <div style={{ padding:'6px 8px', background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, fontSize:'0.78rem', marginBottom:'0.25rem' }}>
                      ⚠️ Chưa có Gemini API Key — hãy vào <b>Cài đặt → Cấu hình API Gemini</b> để kích hoạt AI.
                    </div>
                  )}
                  <form className="chat-input-container" onSubmit={handleChat}>
                    <input
                      type="text"
                      className="chat-input"
                      placeholder={geminiKey ? "Hỏi thầy AI về bài học…" : "Cần cấu hình API Key để chat với AI…"}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading || !geminiKey}
                    />
                    <div
                      className="chat-ai-options chat-ai-options--icons"
                      aria-label="Tùy chọn trả lời AI"
                    >
                      <div ref={effortMenuRef} style={{ position:"relative" }}>
                        <button
                          type="button"
                          className={`chat-ai-icon-btn ${effortMenuOpen ? "is-open" : ""}`}
                          aria-label={`Mức độ: ${{quick:"Nhanh",balanced:"Cân bằng",deep:"Sâu"}[chatEffort] || chatEffort}`}
                          title={`Mức độ: ${{quick:"Nhanh",balanced:"Cân bằng",deep:"Sâu"}[chatEffort] || chatEffort} — bấm để chọn`}
                          disabled={chatLoading || !geminiKey}
                          aria-haspopup="menu"
                          aria-expanded={effortMenuOpen}
                          onClick={() => { setLengthMenuOpen(false); setEffortMenuOpen(v=>!v); }}
                        >
                          <span aria-hidden="true">⚡</span>
                        </button>
                        {effortMenuOpen && (
                          <div role="menu" className="chat-ai-pop" style={{ position:"absolute", bottom:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)", background:"var(--surface)", border:"1px solid var(--border-color)", borderRadius:10, boxShadow:"0 8px 24px rgba(15,23,42,0.12)", padding:4, minWidth:148, zIndex:20, display:"flex", flexDirection:"column", gap:2 }}>
                            {[
                              {v:"quick", label:"Nhanh", desc:"Trả lời nhanh"},
                              {v:"balanced", label:"Cân bằng", desc:"Cân bằng"},
                              {v:"deep", label:"Sâu", desc:"Suy nghĩ sâu"},
                            ].map(o=>(
                              <button key={o.v} role="menuitem" onClick={()=>{ setChatEffort(o.v); updateSettings({ ai: { effort: o.v }}); setEffortMenuOpen(false); }} style={{ textAlign:"left", padding:"6px 8px", borderRadius:7, border: o.v===chatEffort ? "1px solid var(--pen-blue)" : "1px solid transparent", background: o.v===chatEffort ? "var(--pen-blue-soft)" : "transparent", color: o.v===chatEffort ? "var(--pen-blue)" : "var(--text-dark)", fontWeight: o.v===chatEffort ? 800 : 600, fontSize:"0.75rem", cursor:"pointer", display:"flex", flexDirection:"column", gap:1 }}>
                                <span style={{ display:"flex", alignItems:"center", gap:6 }}><span aria-hidden>⚡</span> {o.label} {o.v===chatEffort && <Check size={12} style={{ marginLeft:"auto" }} />}</span>
                                <span style={{ fontSize:"0.62rem", color:"var(--text-muted)", fontWeight:500 }}>{o.desc}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div ref={lengthMenuRef} style={{ position:"relative" }}>
                        <button
                          type="button"
                          className={`chat-ai-icon-btn ${lengthMenuOpen ? "is-open" : ""}`}
                          aria-label={`Độ dài: ${{concise:"Ngắn",balanced:"Vừa",detailed:"Dài"}[chatResponseLength] || chatResponseLength}`}
                          title={`Độ dài: ${{concise:"Ngắn",balanced:"Vừa",detailed:"Dài"}[chatResponseLength] || chatResponseLength} — bấm để chọn`}
                          disabled={chatLoading || !geminiKey}
                          aria-haspopup="menu"
                          aria-expanded={lengthMenuOpen}
                          onClick={() => { setEffortMenuOpen(false); setLengthMenuOpen(v=>!v); }}
                        >
                          <span aria-hidden="true">↕</span>
                        </button>
                        {lengthMenuOpen && (
                          <div role="menu" className="chat-ai-pop" style={{ position:"absolute", bottom:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)", background:"var(--surface)", border:"1px solid var(--border-color)", borderRadius:10, boxShadow:"0 8px 24px rgba(15,23,42,0.12)", padding:4, minWidth:148, zIndex:20, display:"flex", flexDirection:"column", gap:2 }}>
                            {[
                              {v:"concise", label:"Ngắn", desc:"Ngắn gọn"},
                              {v:"balanced", label:"Vừa", desc:"Vừa phải"},
                              {v:"detailed", label:"Dài", desc:"Chi tiết"},
                            ].map(o=>(
                              <button key={o.v} role="menuitem" onClick={()=>{ setChatResponseLength(o.v); updateSettings({ ai: { responseLength: o.v }}); setLengthMenuOpen(false); }} style={{ textAlign:"left", padding:"6px 8px", borderRadius:7, border: o.v===chatResponseLength ? "1px solid var(--pen-blue)" : "1px solid transparent", background: o.v===chatResponseLength ? "var(--pen-blue-soft)" : "transparent", color: o.v===chatResponseLength ? "var(--pen-blue)" : "var(--text-dark)", fontWeight: o.v===chatResponseLength ? 800 : 600, fontSize:"0.75rem", cursor:"pointer", display:"flex", flexDirection:"column", gap:1 }}>
                                <span style={{ display:"flex", alignItems:"center", gap:6 }}><span aria-hidden>↕</span> {o.label} {o.v===chatResponseLength && <Check size={12} style={{ marginLeft:"auto" }} />}</span>
                                <span style={{ fontSize:"0.62rem", color:"var(--text-muted)", fontWeight:500 }}>{o.desc}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ padding: "0.6rem" }}
                      disabled={chatLoading || !geminiKey}
                      title={chatLoading ? "Đang trả lời — bấm Dừng ở thanh trên" : !geminiKey ? "Cần cấu hình Gemini API Key" : "Gửi"}
                      aria-label="Gửi"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                </>
              )}

              {/* ── Phân tích Section ─────────────────────────── */}
              {activeTab === "analyze" && (
                <div
                  style={{
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ border: "1px solid rgba(226,232,240,0.9)", borderRadius: 12, background: "var(--surface)", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-mid)", letterSpacing: "-0.01em" }}>📄 Trang:</span>
                      <input
                        type="number"
                        min={1}
                        max={totalBookPages || 1}
                        value={analyzeFrom}
                        onChange={(e) => setAnalyzeFrom(e.target.value)}
                        placeholder={`Từ ${bookPage(pageNum)}`}
                        aria-label="Trang bắt đầu phân tích"
                        style={{
                          width: 72,
                          padding: "0.32rem 0.4rem",
                          border: "1px solid rgba(226,232,240,0.95)",
                          borderRadius: 8,
                          fontFamily: "inherit",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          outline: "none",
                          color: "var(--text-dark)",
                          background: "var(--surface)",
                          textAlign: "center",
                          boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                        }}
                      />
                      <span
                        style={{ color: "var(--text-mid)", fontWeight: 800, fontSize: "0.72rem" }}
                      >
                        →
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={totalBookPages || 1}
                        value={analyzeTo}
                        onChange={(e) => setAnalyzeTo(e.target.value)}
                        placeholder={`Đến ${bookPage(pageNum)}`}
                        aria-label="Trang kết thúc phân tích"
                        style={{
                          width: 72,
                          padding: "0.32rem 0.4rem",
                          border: "1px solid rgba(226,232,240,0.95)",
                          borderRadius: 8,
                          fontFamily: "inherit",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          outline: "none",
                          color: "var(--text-dark)",
                          background: "var(--surface)",
                          textAlign: "center",
                          boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                        }}
                      />
                      <span style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: "var(--text-mid)", background: "var(--surface-soft)", border: "1px solid rgba(226,232,240,0.9)", padding: "2px 6px", borderRadius: 999 }}>≤ 7 trang</span>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={runAnalysis}
                      disabled={analysisLoading || !pdfDoc || !geminiKey}
                      title={!geminiKey ? "Cần cấu hình Gemini API Key" : "Phân tích"}
                      style={{ width: "100%", justifyContent: "center", padding: "0.55rem", borderRadius: 10, fontWeight: 800, letterSpacing: "-0.01em", boxShadow: "var(--shadow-sm)" }}
                    >
                      {analysisLoading ? (
                        <>
                          <div
                            className="spinner"
                            style={{ width: 13, height: 13 }}
                          />{" "}
                          Đang phân tích…
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} /> Phân tích
                        </>
                      )}
                    </button>
                  </div>
                  <div style={{ border: "1px solid rgba(226,232,240,0.9)", borderRadius: 12, overflow: "hidden", background: "var(--surface)", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
                    <button
                      onClick={() => setShowAnalyzeOptions((v) => !v)}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.48rem 0.6rem", border: "none", borderBottom: showAnalyzeOptions ? "1px solid rgba(226,232,240,0.75)" : "none", background: showAnalyzeOptions ? "var(--surface-soft)" : "var(--surface)", fontSize: "0.72rem", fontWeight: 750, color: "var(--text-dark)", cursor: "pointer", letterSpacing: "-0.01em" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>⚙ Chi tiết phân tích</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.68rem", fontWeight: 600, color: "var(--text-dark)", background: "var(--surface)", border: "1px solid rgba(226,232,240,0.9)", padding: "2px 7px", borderRadius: 999 }}>{analyzeFocus === "all" ? "Toàn diện" : analyzeFocus} · {analyzeDetail === "concise" ? "Ngắn" : analyzeDetail === "detailed" ? "Chi tiết" : "Cân bằng"} <span style={{ color: "var(--text-mid)" }}>{showAnalyzeOptions ? "▲" : "▼"}</span></span>
                    </button>
                    {showAnalyzeOptions && (
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", padding: "0.55rem 0.6rem", background: "var(--surface)", alignItems: "flex-end" }}>
                        <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 3 }}>Độ chi tiết
                          <select value={analyzeDetail} onChange={(e) => setAnalyzeDetail(e.target.value)} className="form-control" style={{ fontSize: "0.72rem", padding: "0.3rem 0.4rem", borderRadius: 8, minWidth: 92, fontWeight: 600, color: "var(--text-dark)", background: "var(--surface)", border: "1px solid var(--border-color)" }}>
                            <option value="concise">Ngắn gọn</option>
                            <option value="balanced">Cân bằng</option>
                            <option value="detailed">Chi tiết</option>
                          </select>
                        </label>
                        <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 3 }}>Trọng tâm
                          <select value={analyzeFocus} onChange={(e) => setAnalyzeFocus(e.target.value)} className="form-control" style={{ fontSize: "0.72rem", padding: "0.3rem 0.4rem", borderRadius: 8, minWidth: 110, fontWeight: 600, color: "var(--text-dark)", background: "var(--surface)", border: "1px solid var(--border-color)" }}>
                            <option value="all">Toàn diện</option>
                            <option value="summary">Tóm tắt</option>
                            <option value="keypoints">Ý chính</option>
                            <option value="questions">Câu hỏi</option>
                            <option value="vocab">Từ khó</option>
                          </select>
                        </label>
                        <label style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-dark)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "0.3rem 0", marginLeft: "auto" }}>
                          <input type="checkbox" checked={analyzeIncludeTips} onChange={(e) => setAnalyzeIncludeTips(e.target.checked)} style={{ accentColor: "var(--pen-blue)" }} /> Gợi ý dạy học
                        </label>
                      </div>
                    )}
                  </div>

                  {analysisError && (
                    <div className="util-error">{analysisError}</div>
                  )}

                  {analysisPages.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                        border: "1px solid var(--success)",
                        background: "var(--surface-soft)",
                        borderRadius: 8,
                        padding: "0.45rem 0.6rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "var(--success)",
                        }}
                      >
                        🧠 Đang nhớ ngữ cảnh trang {analysisPages[0].page}–
                        {analysisPages[analysisPages.length - 1].page} — sang
                        tab Trò chuyện để hỏi tiếp!
                      </span>
                      <button
                        className="btn btn-secondary"
                        onClick={clearAnalysis}
                        style={{
                          padding: "0.2rem 0.5rem",
                          fontSize: "0.7rem",
                          flexShrink: 0,
                        }}
                      >
                        Xóa ngữ cảnh
                      </button>
                    </div>
                  )}

                  {analysisResult && (
                    <div
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: 10,
                        padding: "0.75rem",
                        background: "var(--surface-soft)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.4rem",
                        }}
                      >
                        <strong
                          style={{
                            color: "var(--primary)",
                            fontSize: "0.82rem",
                          }}
                        >
                          📊 Kết quả phân tích
                        </strong>
                        <button
                          className="btn btn-secondary"
                          onClick={copyAnalysis}
                          style={{
                            padding: "0.2rem 0.5rem",
                            fontSize: "0.7rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          {analysisCopied ? (
                            <>
                              <Check size={12} /> Đã sao chép!
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Sao chép
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={saveAnalysisToCollection}
                          title="Lưu kết quả vào Bộ sưu tập"
                        >
                          <BookmarkPlus size={12} /> Lưu kho
                        </button>
                      </div>
                      <MarkdownText text={analysisResult} />
                    </div>
                  )}
                </div>
              )}

              {/* ── Sư phạm Section (includes Quiz) ─────────────────────────── */}
              {activeTab === "pedagogy" && (
                <div
                  style={{
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <h4
                      style={{
                        color: "var(--primary)",
                        marginBottom: "0.5rem",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                      }}
                    >
                      📝 Luyện tập với bài tập
                    </h4>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={preStudyPrompt}
                      onChange={(e) => setPreStudyPrompt(e.target.value)}
                      placeholder="Ví dụ: Tạo 3 câu hỏi dễ, kiểm tra hiểu bài và từ khó của học sinh lớp 2…"
                      style={{ resize: "vertical", minHeight: 68 }}
                    />
                    <PageRangePicker
                      from={quizFrom}
                      to={quizTo}
                      setFrom={setQuizFrom}
                      setTo={setQuizTo}
                      total={totalBookPages}
                      currentBookPage={bookPage(pageNum)}
                    />
                    <div style={{ border: "1px solid rgba(226,232,240,0.9)", borderRadius: 12, overflow: "hidden", background: "var(--surface)", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
                      <button
                        onClick={() => setShowQuizOptions((v) => !v)}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.48rem 0.6rem", border: "none", borderBottom: showQuizOptions ? "1px solid rgba(226,232,240,0.75)" : "none", background: showQuizOptions ? "var(--surface-soft)" : "var(--surface)", fontSize: "0.72rem", fontWeight: 750, color: "var(--text-dark)", cursor: "pointer", letterSpacing: "-0.01em" }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>⚙ Chi tiết bài tập</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.68rem", fontWeight: 600, color: "var(--text-dark)", background: "var(--surface)", border: "1px solid rgba(226,232,240,0.9)", padding: "2px 7px", borderRadius: 999 }}>{quizCount} câu · {quizDifficulty} <span style={{ color: "var(--text-mid)" }}>{showQuizOptions ? "▲" : "▼"}</span></span>
                      </button>
                      {showQuizOptions && (
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", padding: "0.55rem 0.6rem", background: "var(--surface)", alignItems: "flex-end" }}>
                        <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 3 }}>Số câu
                          <select value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))} className="form-control" style={{ fontSize: "0.72rem", padding: "0.3rem 0.4rem", borderRadius: 8, minWidth: 62, fontWeight: 600 }}>
                            <option value={3}>3 câu</option><option value={5}>5 câu</option><option value={8}>8 câu</option><option value={10}>10 câu</option>
                          </select>
                        </label>
                        <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 3 }}>Mức độ
                          <select value={quizDifficulty} onChange={(e) => setQuizDifficulty(e.target.value)} className="form-control" style={{ fontSize: "0.72rem", padding: "0.3rem 0.4rem", borderRadius: 8, minWidth: 92, fontWeight: 600 }}>
                            <option>Nhận biết</option><option>Thông hiểu</option><option>Vận dụng</option><option>Hỗn hợp</option>
                          </select>
                        </label>
                        <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 3 }}>Loại
                          <select value={quizType} onChange={(e) => setQuizType(e.target.value)} className="form-control" style={{ fontSize: "0.72rem", padding: "0.3rem 0.4rem", borderRadius: 8, minWidth: 102, fontWeight: 600 }}>
                            <option>Trắc nghiệm</option><option>Tự luận</option><option>Điền khuyết</option><option>Hỗn hợp</option>
                          </select>
                        </label>
                        <label style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-dark)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4, cursor: "pointer" }}>
                          <input type="checkbox" checked={quizIncludeExplain} onChange={(e) => setQuizIncludeExplain(e.target.checked)} style={{ accentColor: "var(--pen-blue)" }} /> Giải thích
                        </label>
                      </div>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={generateQuiz}
                      disabled={quizLoading || !geminiKey}
                      title={!geminiKey ? "Cần cấu hình Gemini API Key" : "Tạo bài tập"}
                      style={{ width: "100%", justifyContent: "center", borderRadius: 10, padding: "0.55rem", fontWeight: 800, letterSpacing: "-0.01em", boxShadow: "var(--shadow-sm)" }}
                    >
                      {quizLoading ? (
                        <>
                          <div
                            className="spinner"
                            style={{ width: 14, height: 14 }}
                          />{" "}
                          Đang tạo đề…
                        </>
                      ) : (
                        <>
                          <Award size={16} /> Tạo bài tập
                        </>
                      )}
                    </button>
                    {quizError && (
                      <div
                        role="alert"
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color: "var(--danger, #dc2626)",
                          background: "var(--danger-soft, rgba(220,38,38,0.08))",
                          border: "1px solid var(--danger, #dc2626)",
                          borderRadius: 8,
                          padding: "0.4rem 0.5rem",
                        }}
                      >
                        {quizError}
                      </div>
                    )}
                  </div>

                  {quizQuestions.length > 0 && (
                    <div
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: 10,
                        padding: "0.75rem",
                        background: "var(--surface-soft)",
                      }}
                    >
                      {quizQuestions.map((q, qi) => (
                        <div key={qi} style={{ marginBottom: "1rem" }}>
                          <p
                            style={{ fontWeight: 700, marginBottom: "0.5rem" }}
                          >
                            {qi + 1}. {q.question}
                          </p>
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className={`quiz-option ${quizAnswers[qi] === oi ? "selected" : ""}`}
                              onClick={() =>
                                !quizSubmitted &&
                                setQuizAnswers((p) => ({ ...p, [qi]: oi }))
                              }
                              style={{
                                padding: "0.4rem 0.6rem",
                                borderRadius: 6,
                                cursor: quizSubmitted ? "default" : "pointer",
                                background:
                                  quizAnswers[qi] === oi
                                    ? "var(--primary-light)"
                                    : "var(--surface)",
                                border:
                                  quizAnswers[qi] === oi
                                    ? "1px solid var(--primary)"
                                    : "1px solid var(--border-color)",
                                marginBottom: "0.25rem",
                                fontWeight: 800,
                                marginRight: 4,
                              }}
                              onKeyDown={(e) => {
                                if (
                                  (e.key === "Enter" || e.key === " ") &&
                                  !quizSubmitted
                                ) {
                                  e.preventDefault();
                                  setQuizAnswers((p) => ({ ...p, [qi]: oi }));
                                }
                              }}
                            >
                              <span style={{ fontWeight: 800, marginRight: 4 }}>
                                {String.fromCharCode(65 + oi)}.
                              </span>{" "}
                              {opt}
                            </div>
                          ))}
                          {quizSubmitted && (
                            <div
                              className="quiz-explanation"
                              style={{
                                marginTop: "0.5rem",
                                padding: "0.4rem 0.6rem",
                                borderRadius: 6,
                                fontSize: "0.78rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              <strong>💡</strong>{" "}
                              <MarkdownText text={q.explanation} />
                            </div>
                          )}
                        </div>
                      ))}

                      {!quizSubmitted ? (
                        <button
                          className="btn btn-accent"
                          onClick={submitQuiz}
                          style={{ width: "100%" }}
                          disabled={
                            Object.keys(quizAnswers).length <
                            quizQuestions.length
                          }
                        >
                          Nộp bài chấm điểm
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setQuizQuestions([]);
                            setQuizSubmitted(false);
                            setQuizAnswers({});
                            setQuizScore(null);
                          }}
                          style={{ width: "100%", marginTop: "0.5rem" }}
                        >
                          Làm lại bộ đề mới
                        </button>
                      )}
                      <div className="bookreader-save-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={saveQuizToQuestionBank}
                        >
                          <Database size={15} /> Lưu vào kho câu hỏi
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={saveQuizAsWorksheet}
                        >
                          <FileText size={15} /> Lưu thành phiếu
                        </button>
                      </div>
                    </div>
                  )}

                  {quizScore !== null && (
                    <div
                      style={{
                        background: "var(--success-soft)",
                        color: "var(--success)",
                        padding: "0.75rem",
                        borderRadius: 8,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      🎯 Điểm số: {quizScore}/{quizQuestions.length}
                    </div>
                  )}
                </div>
              )}

              {/* ── Công cụ Section (includes Drawing) ─────────────────────────── */}
              {activeTab === "tools" && (
                <div
                  style={{
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.65rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", padding: "0.42rem 0.5rem", border: "1px solid rgba(226,232,240,0.9)", borderRadius: 10, background: "var(--surface)", boxShadow: "0 1px 6px rgba(15,23,42,0.04)" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-dark)", letterSpacing: "-0.01em" }}>✏️ Bảng vẽ</span>
                    <span style={{ fontSize: "0.62rem", color: "var(--text-mid)", background: "var(--surface-soft)", border: "1px solid rgba(226,232,240,0.9)", padding: "1px 6px", borderRadius: 999, fontWeight: 600 }}>DrawBoard v2 · nhiều bảng · lưu tự động theo sách</span>
                  </div>
                  <CanvasWhiteboard
                    key={book?.filename || book?.id || "global"}
                    bookKey={book?.filename || book?.id || "global"}
                    onCheckDrawing={handleCheckDrawing}
                    isAnalyzing={drawLoading}
                  />
                  {drawFeedback && (
                    <div
                      style={{
                        background: "var(--primary-light)",
                        borderRadius: 10,
                        padding: "1rem",
                        border: "1px solid rgba(75,108,193,0.1)",
                      }}
                    >
                      <h4
                        style={{
                          color: "var(--primary)",
                          marginBottom: "0.5rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        🏫 Cô giáo AI nhận xét:
                      </h4>
                      <button
                        className="btn btn-secondary"
                        onClick={saveDrawingFeedback}
                        title="Lưu nhận xét vào Ghi chú giáo viên"
                      >
                        <BookmarkPlus size={13} /> Lưu ghi chú
                      </button>
                      <MarkdownText text={drawFeedback} />
                    </div>
                  )}
                </div>
              )}

              {/* ── Quiz Tab (legacy - redirect to pedagogy) ─────────────────────────── */}
              {activeTab === "quiz" && (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                  <p
                    style={{ color: "var(--text-muted)", marginBottom: "1rem" }}
                  >
                    Tính năng này đã được chuyển sang mục{" "}
                    <strong>Sư phạm</strong>
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveTab("pedagogy")}
                  >
                    Chuyển sang Sư phạm
                  </button>
                </div>
              )}

              {/* ── Draw Tab (legacy — gộp vào Công cụ / DrawBoard v2) ── */}
              {activeTab === "draw" && (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                  <p
                    style={{ color: "var(--text-muted)", marginBottom: "1rem" }}
                  >
                    Bảng vẽ đã nâng cấp và gộp vào mục{" "}
                    <strong>Công cụ</strong>
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveTab("tools")}
                  >
                    Mở bảng vẽ mới
                  </button>
                </div>
              )}

              {/* ── Giáo án bằng AI: đọc trang sách → soạn FULL → mở trong Giáo án ── */}
              {activeTab === "lesson" && (
                <div
                  style={{
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.65rem",
                    padding: "0.1rem",
                  }}
                >
                  {/* ── Nhập giáo án từ URL (ưu tiên kenhgiaovien): y hệt + AI chuẩn hóa ── */}
                  <LessonUrlImport
                    defaultDuration={planDuration || "35"}
                    compact
                    onImported={(id) => onOpenLessonPlan?.(id)}
                  />
                  <div style={{ border: "1px solid rgba(226,232,240,0.9)", borderRadius: 12, background: "var(--surface)", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 750, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 4 }}>
                      Tên bài
                      <input
                        className="form-control"
                        value={planTitle}
                        onChange={(e) => setPlanTitle(e.target.value)}
                        placeholder="VD: Bài 12 – Phép cộng trong phạm vi 10 (để trống = lấy từ mục lục)"
                        style={{ fontSize: "0.8rem", borderRadius: 10 }}
                      />
                    </label>
                    <PageRangePicker
                      from={planFrom}
                      to={planTo}
                      setFrom={setPlanFrom}
                      setTo={setPlanTo}
                      total={totalBookPages}
                      currentBookPage={bookPage(pageNum)}
                    />
                    <label style={{ fontSize: "0.72rem", fontWeight: 750, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 4 }}>
                      Thời lượng (1 tiết)
                      <select value={planDuration} onChange={(e) => setPlanDuration(e.target.value)} className="form-control" style={{ fontSize: "0.78rem", padding: "0.4rem 0.5rem", borderRadius: 10, fontWeight: 600 }}>
                        <option value="15">15 phút</option>
                        <option value="30">30 phút</option>
                        <option value="35">35 phút</option>
                        <option value="45">45 phút</option>
                      </select>
                    </label>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <label style={{ fontSize: "0.72rem", fontWeight: 750, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        Phương pháp
                        <select value={planMethod} onChange={(e) => setPlanMethod(e.target.value)} className="form-control" style={{ fontSize: "0.78rem", padding: "0.4rem 0.5rem", borderRadius: 10, fontWeight: 600 }}>
                          {LESSON_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-dark)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "0.45rem 0" }}>
                        <input type="checkbox" checked={planIncludeDiff} onChange={(e) => setPlanIncludeDiff(e.target.checked)} style={{ accentColor: "var(--pen-blue)" }} /> Phân hóa HS
                      </label>
                    </div>
                    {/* ── Yêu cầu thêm cho AI: ô nhập tự do theo ý giáo viên ── */}
                    <label style={{ fontSize: "0.72rem", fontWeight: 750, color: "var(--text-dark)", display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>✍️ Yêu cầu thêm cho AI <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>(tùy chọn — AI làm theo ý bạn)</span></span>
                        {planCustom.trim() && (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPlanCustom("")} disabled={planCreating} title="Xóa yêu cầu thêm">
                            <X size={12} /> Xóa
                          </button>
                        )}
                      </span>
                      <textarea
                        className="form-control"
                        value={planCustom}
                        onChange={(e) => setPlanCustom(e.target.value.slice(0, 1500))}
                        placeholder={"VD: khởi động bằng trò chơi đố vui; dùng que tính thật; thêm 2 bài tập nâng cao cho HS giỏi; lồng ghép bảo vệ môi trường; cách tiến hành viết ngắn gọn, dễ đọc…"}
                        rows={3}
                        maxLength={1500}
                        disabled={planCreating}
                        style={{ fontSize: "0.78rem", borderRadius: 10, resize: "vertical", minHeight: 56, lineHeight: 1.45 }}
                      />
                      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 500, color: "var(--text-muted)", fontSize: "0.66rem" }}>
                        <span>AI ưu tiên yêu cầu này cao nhất khi soạn.</span>
                        <span>{planCustom.trim().length}/1500</span>
                      </span>
                    </label>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {["🎮 Khởi động bằng trò chơi", "🖼️ Nhiều tranh trực quan", "🤝 Tăng hoạt động nhóm", "🌱 Lồng ghép thực tế", "📝 Thêm bài tập nâng cao", "✂️ Viết ngắn gọn"].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          className="btn btn-ghost btn-xs"
                          disabled={planCreating}
                          onClick={() => {
                            const tip = chip.replace(/^[^\s]+\s/, "");
                            setPlanCustom((prev) => {
                              const base = prev.trim();
                              if (!base) return tip + ". ";
                              if (base.includes(tip)) return prev;
                              return (base.replace(/\.*\s*$/, "") + "; " + tip.toLowerCase() + ". ").slice(0, 1500);
                            });
                          }}
                          title={`Thêm gợi ý: ${chip}`}
                          style={{ border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 999, fontSize: "0.68rem", padding: "0.2rem 0.55rem" }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    {/* ── Ảnh tham khảo SGV/HDH (nhiều ảnh) — AI đọc kèm trang SGK ── */}
                    <div style={{ border: "1.5px dashed var(--border-color, #cbd5e1)", borderRadius: 10, padding: "0.55rem", background: "var(--surface-soft, #f8fafc)", display: "flex", flexDirection: "column", gap: "0.5rem" }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (planCreating || planGuideAdding) return;
                        const files = [...(e.dataTransfer?.files || [])].filter((f) => (f.type || "").startsWith("image/"));
                        if (files.length) handlePlanGuideSelect(files);
                      }}
                      title="Mẹo: kéo thả nhiều ảnh SGV vào đây"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ fontSize: "0.74rem", fontWeight: 750, color: "var(--text-dark)" }}>
                          📷 Ảnh Sách giáo viên / HDH ({planGuideImages.length}/{GUIDE_IMAGE_MAX_COUNT})
                        </div>
                        {planGuideImages.length > 0 && (
                          <button className="btn btn-ghost btn-xs" onClick={handlePlanGuideClear} disabled={planCreating || planGuideAdding} title="Xóa hết ảnh SGV">
                            <Trash2 size={12} /> Xóa hết
                          </button>
                        )}
                      </div>
                      <input
                        ref={planGuideInputRef}
                        type="file"
                        accept={GUIDE_IMAGE_ACCEPT}
                        multiple
                        style={{ display: "none" }}
                        onChange={(e) => { handlePlanGuideSelect(e.target.files); e.target.value = ""; }}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => planGuideInputRef.current?.click()}
                        disabled={planCreating || planGuideAdding || planGuideImages.length >= GUIDE_IMAGE_MAX_COUNT}
                        title={planGuideImages.length >= GUIDE_IMAGE_MAX_COUNT ? `Tối đa ${GUIDE_IMAGE_MAX_COUNT} ảnh` : "Chụp/chọn hoặc kéo thả nhiều ảnh trang SGV để AI đọc kèm"}
                        style={{ width: "100%", justifyContent: "center", borderRadius: 10, fontWeight: 700 }}
                      >
                        {planGuideAdding ? (
                          <><div className="spinner" style={{ width: 13, height: 13 }} /> Đang thêm ảnh…</>
                        ) : (
                          <><Upload size={14} /> Thêm ảnh SGV (nhiều ảnh)</>
                        )}
                      </button>
                      {planGuideImages.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: "0.4rem" }}>
                          {planGuideImages.map((im, idx) => (
                            <div key={im.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-color, #e2e8f0)", background: "#fff" }}>
                              <img src={im.dataUrl} alt={im.name || `SGV ${idx + 1}`} style={{ width: "100%", height: 64, objectFit: "cover", display: "block" }} />
                              <div style={{ position: "absolute", top: 2, left: 2, background: "rgba(15,23,42,0.75)", color: "#fff", fontSize: "0.62rem", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>
                                {idx + 1}
                              </div>
                              <button
                                onClick={() => handlePlanGuideRemove(im.id)}
                                disabled={planCreating || planGuideAdding}
                                style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                                title={`Xóa ảnh ${idx + 1}`}
                                aria-label={`Xóa ảnh SGV ${idx + 1}`}
                              >
                                <X size={11} />
                              </button>
                              <div style={{ fontSize: "0.6rem", padding: "2px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-muted)" }} title={im.name}>
                                {im.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {planGuideError && (
                        <div style={{ fontSize: "0.72rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.35rem 0.5rem" }}>
                          {planGuideError}
                        </div>
                      )}
                      <p className="panel-hint" style={{ margin: 0, fontSize: "0.7rem" }}>
                        Chụp trang Sách giáo viên / sách HDH liên quan bài này — AI sẽ đọc (OCR) từng ảnh rồi hòa trộn gợi ý SGV với nội dung SGK để soạn giáo án hoàn chỉnh.
                      </p>
                    </div>
                    {!geminiKey && (
                      <div style={{ padding: "6px 8px", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, fontSize: "0.78rem" }}>
                        ⚠️ Chưa có Gemini API Key — hãy vào <b>Cài đặt → Cấu hình API Gemini</b> để AI soạn giáo án.
                      </div>
                    )}
                    {planError && (
                      <div style={{ fontSize: "0.78rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.4rem 0.55rem" }}>
                        {planError}
                      </div>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={handleAiCreatePlan}
                      disabled={planCreating || !geminiKey}
                      title={!geminiKey ? "Cần cấu hình Gemini API Key" : "AI đọc các trang đã chọn + ảnh SGV rồi soạn đầy đủ giáo án"}
                      style={{ width: "100%", justifyContent: "center", borderRadius: 10, padding: "0.55rem", fontWeight: 800, letterSpacing: "-0.01em", boxShadow: "var(--shadow-sm)" }}
                    >
                      {planCreating ? (
                        <>
                          <div className="spinner" style={{ width: 14, height: 14 }} />{" "}
                          AI đang đọc trang{planGuideImages.length ? ` + ${planGuideImages.length} ảnh SGV` : ""} và soạn giáo án…
                        </>
                      ) : (
                        <>
                          <FileText size={16} /> Tạo giáo án bằng AI{planGuideImages.length ? ` (${planGuideImages.length} ảnh SGV)` : ""}
                        </>
                      )}
                    </button>
                    <p className="panel-hint" style={{ margin: 0, fontSize: "0.72rem" }}>
                      AI đọc chữ + hình các trang đã chọn (tối đa 7 trang/lần){planGuideImages.length ? ` + ${planGuideImages.length} ảnh SGV tham khảo` : " (+ ảnh SGV nếu có)"} rồi soạn đầy đủ YCCD,
                      đồ dùng, hoạt động A/B/C/D theo thông số trên — bấm là có bản đầy đủ trong module Giáo án.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="ai-panel-collapsed">
            <button
              className="ai-collapsed-btn"
              onClick={() => setAiCollapsed(false)}
              title="Mở bảng AI"
              aria-label="Mở bảng AI"
            >
              <Sparkles size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ── Study tools: notes, glossary (TOC nay la cot) ───────────── */}
      {showNotes && (
        <StructuredNotes
          book={book}
          tocTitles={tocItems.map((i) => i.title)}
          pageNum={bookPage(pageNum)}
          onClose={() => setShowNotes(false)}
          onJumpToPin={jumpToPin}
          onPinsChanged={refreshPins}
        />
      )}
      {showGlossary && (
        <GlossaryPanel
          geminiKey={geminiKey}
          onClose={() => setShowGlossary(false)}
        />
      )}

      {/* ── Research: gắn thẻ CTGDPT + lưu trích đoạn ─────────── */}
      {showTag && (
        <PageTagDialog
          book={book}
          pdfPage={pageNum}
          numPages={numPages}
          onClose={() => setShowTag(false)}
          onJump={(p) => goToPage(p)}
        />
      )}

      {showClip && (
        <div className="modal-overlay" onClick={() => setShowClip(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  margin: 0,
                }}
              >
                <Scissors size={17} /> Lưu trích đoạn — Trang{" "}
                {bookPage(pageNum)}
              </h3>
              <button
                className="util-bubble-close dark"
                onClick={() => setShowClip(false)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            <div
              className="tag-body"
              style={{ display: "grid", gap: "0.6rem" }}
            >
              <p
                className="panel-hint"
                style={{
                  margin: 0,
                  background: "var(--surface-soft)",
                  borderLeft: "3px solid var(--primary-light)",
                  padding: "0.4rem 0.7rem",
                  borderRadius: "0 6px 6px 0",
                }}
              >
                <strong>Trích dẫn gốc:</strong> {citationFor(book, pageNum)}
              </p>
              <div>
                <label className="form-label">
                  Bộ sưu tập — gõ tên mới hoặc chọn bộ có sẵn *
                </label>
                <input
                  className="form-control"
                  list="clip-collection-names"
                  value={clipCollName}
                  onChange={(e) => setClipCollName(e.target.value)}
                  placeholder="VD: Phép cộng – Phạm vi 10; Văn bản đọc lớp 2…"
                />
                <datalist id="clip-collection-names">
                  {getCollections().map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="form-label">Nội dung trích đoạn *</label>
                <textarea
                  className="form-control"
                  rows={7}
                  value={clipText}
                  onChange={(e) => setClipText(e.target.value)}
                  placeholder="Chọn đoạn chữ trên trang rồi bấm nút Trích đoạn, hoặc tự dán nội dung…"
                />
                {pageIsImage && !pendingSelRef.current && (
                  <p className="panel-hint">
                    Trang này ở dạng ảnh — hãy bôi đen đoạn chữ trong bảng văn
                    bản phía dưới để có trích đoạn chính xác, hoặc nhập tay.
                  </p>
                )}
              </div>
              <div className="tag-foot">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowClip(false)}
                >
                  <X size={14} /> Hủy
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!clipText.trim() || !clipCollName.trim()}
                  onClick={saveClip}
                >
                  <Scissors size={14} /> Lưu trích đoạn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ─────────────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" ? "✅" : t.type === "error" ? "⚠️" : "💡"}{" "}
            {t.msg}
          </div>
        ))}
      </div>
      {/* ── Bảng lệnh (Command Palette) ─────────────────────────────────── */}
      {showCommandPalette && (
        <>
          <div
            className="modal-overlay"
            onClick={() => setShowCommandPalette(false)}
            aria-hidden="true"
          />
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Bảng lệnh"
          >
            <div className="command-palette-header">
              <Search size={18} />
              <input
                type="text"
                placeholder="Tìm công cụ, chức năng..."
                value={commandPaletteSearch}
                onChange={(e) => {
                  setCommandPaletteSearch(e.target.value);
                  setSelectedCommandIndex(0);
                }}
                autoFocus
                aria-label="Tìm kiếm lệnh"
              />
              <kbd>Esc</kbd>
            </div>

            <div className="command-palette-content">
              {/* Recent Actions */}
              {!commandPaletteSearch.trim() &&
                getRecentCommands().length > 0 && (
                  <div className="command-palette-section">
                    <div className="command-palette-section-title">
                      <Clock size={14} /> Gần đây
                    </div>
                    {getRecentCommands().map((cmd, idx) => (
                      <div
                        key={cmd.id}
                        className={`command-palette-item ${selectedCommandIndex === idx ? "selected" : ""}`}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedCommandIndex(idx)}
                      >
                        <span className="command-palette-item-icon">
                          {cmd.icon}
                        </span>
                        <span className="command-palette-item-label">
                          {cmd.label}
                        </span>
                        <span className="command-palette-item-category">
                          {cmd.category}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

              {/* All Commands by Category */}
              {!commandPaletteSearch.trim() ? (
                (() => {
                  const recentCount = getRecentCommands().length;
                  const categories = Object.entries(
                    COMMANDS.reduce((acc, cmd) => {
                      if (!acc[cmd.category]) acc[cmd.category] = [];
                      acc[cmd.category].push(cmd);
                      return acc;
                    }, {}),
                  );

                  let globalIdx = recentCount;

                  return categories.map(([category, commands]) => {
                    return (
                      <div key={category} className="command-palette-section">
                        <div className="command-palette-section-title">
                          {category}
                        </div>
                        {commands.map((cmd, cmdIdx) => {
                          const currentGlobalIdx = globalIdx;
                          globalIdx++;
                          return (
                            <div
                              key={cmd.id}
                              className={`command-palette-item ${selectedCommandIndex === currentGlobalIdx ? "selected" : ""}`}
                              onClick={() => executeCommand(cmd)}
                              onMouseEnter={() =>
                                setSelectedCommandIndex(currentGlobalIdx)
                              }
                            >
                              <span className="command-palette-item-icon">
                                {cmd.icon}
                              </span>
                              <span className="command-palette-item-label">
                                {cmd.label}
                              </span>
                              <span className="command-palette-item-category">
                                {cmd.category}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="command-palette-section">
                  {getFilteredCommands().map((cmd, idx) => (
                    <div
                      key={cmd.id}
                      className={`command-palette-item ${selectedCommandIndex === idx ? "selected" : ""}`}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedCommandIndex(idx)}
                    >
                      <span className="command-palette-item-icon">
                        {cmd.icon}
                      </span>
                      <span className="command-palette-item-label">
                        {cmd.label}
                      </span>
                      <span className="command-palette-item-category">
                        {cmd.category}
                      </span>
                    </div>
                  ))}
                  {getFilteredCommands().length === 0 && (
                    <div className="command-palette-empty">
                      Không tìm thấy lệnh nào
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="command-palette-footer">
              <span>
                <kbd>↑↓</kbd> để điều hướng
              </span>
              <span>
                <kbd>Enter</kbd> để chọn
              </span>
              <span>
                <kbd>Esc</kbd> để đóng
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Advanced Tools Drawer ─────────────────────────────────── */}
      {showAdvancedDrawer && (
        <>
          <div
            className="reader-advanced-overlay"
            onClick={() => setShowAdvancedDrawer(false)}
            aria-hidden="true"
          />
          <div
            className="reader-advanced-drawer open"
            role="dialog"
            aria-modal="true"
            aria-label="Công cụ nâng cao"
          >
            <div className="reader-advanced-header">
              <h3 className="reader-advanced-title">CÔNG CỤ NÂNG CAO</h3>
              <button
                className="btn-icon"
                onClick={() => setShowAdvancedDrawer(false)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="reader-advanced-search">
              <input
                type="text"
                placeholder="Tìm công cụ..."
                value={advancedToolsSearch}
                onChange={(e) => setAdvancedToolsSearch(e.target.value)}
                aria-label="Tìm công cụ nâng cao"
              />
            </div>

            {/* Filter tabs */}
            <div className="reader-advanced-filter-tabs">
              <button
                className={`filter-tab ${advancedToolsFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  setAdvancedToolsFilter("all");
                  setAdvancedToolsSearch("");
                }}
                aria-label="Tất cả công cụ"
              >
                <Search size={16} />
              </button>
              <button
                className={`filter-tab ${advancedToolsFilter === "favorites" ? "active" : ""}`}
                onClick={() => {
                  setAdvancedToolsFilter("favorites");
                  setAdvancedToolsSearch("");
                }}
                aria-label="Công cụ yêu thích"
              >
                <Star size={16} />
              </button>
              <button
                className={`filter-tab ${advancedToolsFilter === "recent" ? "active" : ""}`}
                onClick={() => {
                  setAdvancedToolsFilter("recent");
                  setAdvancedToolsSearch("");
                }}
                aria-label="Công cụ gần đây"
              >
                <Clock size={16} />
              </button>
            </div>

            <div className="reader-advanced-content">
              {/* Favorites Section */}
              {favoriteTools.length > 0 && (
                <div className="reader-advanced-section">
                  <div className="reader-advanced-section-title">
                    <Star size={14} fill="currentColor" /> Ghim
                  </div>
                  {favoriteTools.map((toolId) => {
                    const tool = ADVANCED_TOOLS.find((t) => t.id === toolId);
                    if (!tool) return null;
                    return (
                      <div
                        key={tool.id}
                        className="reader-advanced-tool"
                        onClick={() => executeTool(tool)}
                      >
                        <div className="reader-advanced-tool-icon">
                          {tool.icon}
                        </div>
                        <div className="reader-advanced-tool-info">
                          <span className="reader-advanced-tool-label">
                            {tool.label}
                          </span>
                          <span className="reader-advanced-tool-desc">
                            {tool.description}
                          </span>
                        </div>
                        <button
                          className="reader-advanced-tool-favorite"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteTool(tool.id);
                          }}
                          aria-label="Bỏ ghim"
                        >
                          <Star size={14} fill="currentColor" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recent Section */}
              {recentTools.length > 0 && (
                <div className="reader-advanced-section">
                  <div className="reader-advanced-section-title">
                    <Clock size={14} /> Dùng gần đây
                  </div>
                  {recentTools.map((toolId) => {
                    const tool = ADVANCED_TOOLS.find((t) => t.id === toolId);
                    if (!tool) return null;
                    return (
                      <div
                        key={tool.id}
                        className="reader-advanced-tool"
                        onClick={() => executeTool(tool)}
                      >
                        <div className="reader-advanced-tool-icon">
                          {tool.icon}
                        </div>
                        <div className="reader-advanced-tool-info">
                          <span className="reader-advanced-tool-label">
                            {tool.label}
                          </span>
                          <span className="reader-advanced-tool-desc">
                            {tool.description}
                          </span>
                        </div>
                        <button
                          className="reader-advanced-tool-favorite"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteTool(tool.id);
                          }}
                          aria-label={
                            favoriteTools.includes(tool.id) ? "Bỏ ghim" : "Ghim"
                          }
                        >
                          <Star
                            size={14}
                            fill={
                              favoriteTools.includes(tool.id)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All Tools by Category */}
              {Object.entries(toolsByCategory).map(([category, tools]) => (
                <div key={category} className="reader-advanced-section">
                  <div className="reader-advanced-section-title">
                    {category}
                  </div>
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="reader-advanced-tool"
                      onClick={() => executeTool(tool)}
                    >
                      <div className="reader-advanced-tool-icon">
                        {tool.icon}
                      </div>
                      <div className="reader-advanced-tool-info">
                        <span className="reader-advanced-tool-label">
                          {tool.label}
                        </span>
                        <span className="reader-advanced-tool-desc">
                          {tool.description}
                        </span>
                      </div>
                      <button
                        className="reader-advanced-tool-favorite"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteTool(tool.id);
                        }}
                        aria-label={
                          favoriteTools.includes(tool.id) ? "Bỏ ghim" : "Ghim"
                        }
                      >
                        <Star
                          size={14}
                          fill={
                            favoriteTools.includes(tool.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── OCR Drawer — floating overlay, not in main flow ── */}
      {showOcrDrawer && (
        <>
          <div
            className="ocr-drawer-overlay"
            onClick={() => setShowOcrDrawer(false)}
            aria-hidden="true"
          />
          <div
            className="ocr-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Nhận diện văn bản"
          >
            <div className="ocr-drawer-header">
              <h3 className="ocr-drawer-title">
                <ScanText size={16} /> Nhận diện văn bản (OCR)
              </h3>
              <button
                className="btn-icon"
                onClick={() => setShowOcrDrawer(false)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                <X size={16} />
              </button>
            </div>
            <div className="ocr-drawer-body">
              <div className="ocr-drawer-meta">
                <span className="ocr-page-info">
                  Trang hiện tại: {pageDisplay} / {totalBookPages || "…"}
                </span>
                {pageIsImage && <span className="tag-pill">Ảnh</span>}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => runOcr(!pageIsImage && !rightPageIsImage)}
                disabled={ocrLoading}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {ocrLoading ? (
                  <>
                    <span
                      className="spinner"
                      style={{ width: 14, height: 14 }}
                    />{" "}
                    Đang nhận dạng…
                  </>
                ) : (
                  <>
                    <ScanText size={14} />{" "}
                    {twoPageMode && pageNum + 1 <= numPages
                      ? "Nhận diện 2 trang"
                      : "Nhận diện trang"}
                  </>
                )}
              </button>
              {ocrLoading && (
                <div className="ocr-loading" role="status" aria-live="polite">
                  <div className="ocr-progress">
                    <div className="ocr-progress-fill" />
                  </div>
                  <p
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      textAlign: "center",
                      margin: "0.4rem 0 0",
                    }}
                  >
                    Đang xử lý trang {pageDisplay}…
                  </p>
                </div>
              )}
              <div className="ocr-result-wrap">
                <div className="ocr-result-header">
                  <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>
                    Kết quả
                  </span>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={async () => {
                      try {
                        const text =
                          twoPageMode && pageNum + 1 <= numPages
                            ? pageText + "\n\n---\n\n" + rightPageText
                            : pageText;
                        await navigator.clipboard.writeText(text);
                        notify("Đã sao chép OCR", "success");
                      } catch {
                        notify("Không sao chép được", "error");
                      }
                    }}
                    disabled={!pageText && !rightPageText}
                    title="Sao chép"
                  >
                    <Copy size={12} /> Sao chép
                  </button>
                </div>
                <div
                  className="ocr-result-text"
                  onMouseUp={handleTextSelect}
                  style={{ userSelect: "text" }}
                >
                  {pageText ? (
                    <p
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {pageText}
                      {twoPageMode && rightPageText
                        ? "\n\n--- Trang " +
                          bookPage(pageNum + 1) +
                          " ---\n\n" +
                          rightPageText
                        : ""}
                    </p>
                  ) : (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        margin: 0,
                      }}
                    >
                      {ocrLoading
                        ? "Đang quét chữ…"
                        : pageIsImage
                          ? "Trang ảnh — bấm Nhận diện để trích xuất chữ."
                          : "Chưa có văn bản. Bấm Nhận diện nếu cần."}
                    </p>
                  )}
                </div>
              </div>
              {selWord && (
                <div
                  className="ai-bubble-menu"
                  style={{ position: "static", marginTop: "0.6rem" }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      padding: "0.5rem",
                      borderBottom: "1px solid var(--primary-light)",
                      fontSize: "0.8rem",
                      fontWeight: 800,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      💡{" "}
                      <span style={{ color: "var(--accent)" }}>
                        "{selWord}"
                      </span>
                    </span>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelWord("")}
                      aria-label="Đóng"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {wordExpl ? (
                    <div
                      style={{
                        padding: "0.5rem",
                        fontSize: "0.8rem",
                        maxHeight: 120,
                        overflowY: "auto",
                      }}
                    >
                      <span style={{ whiteSpace: "pre-wrap" }}>{wordExpl}</span>
                    </div>
                  ) : (
                    <button
                      className="ai-bubble-item"
                      onClick={explainWord}
                      disabled={wordLoading || !geminiKey}
                      title={!geminiKey ? "Cần cấu hình Gemini API Key" : "AI giải nghĩa từ này"}
                    >
                      <Sparkles size={14} color="var(--secondary)" />{" "}
                      {wordLoading ? "Đang tra nghĩa…" : !geminiKey ? "Cần API Key để giải nghĩa" : "AI giải nghĩa từ này"}
                    </button>
                  )}
                  <div
                    style={{
                      padding: "0.5rem",
                      borderTop: "1px solid var(--primary-light)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                    }}
                  >
                    <button
                      className="ai-bubble-item"
                      onClick={saveWordToNotebook}
                      disabled={savingWord}
                      title={
                        savingWord
                          ? "Đang tra nghĩa bằng AI trước khi lưu…"
                          : !wordExpl && geminiKey
                            ? "Sẽ tự AI giải nghĩa rồi lưu"
                            : "Lưu ngay vào sổ tay từ vựng"
                      }
                    >
                      <NotebookPen size={14} color="var(--primary)" />{" "}
                      {savingWord ? "Đang tra & lưu…" : "Thêm vào sổ tay từ vựng"}
                    </button>
                  </div>
                </div>
              )}
              {notes.length > 0 && (
                <div className="ocr-notes">
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "0.78rem",
                      marginBottom: "0.35rem",
                    }}
                  >
                    📌 Ghi chú trang {pageDisplay} ({notes.length})
                  </div>
                  {notes.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.4rem",
                        fontSize: "0.78rem",
                        padding: "0.25rem 0",
                        borderBottom: "1px dashed var(--border-color)",
                      }}
                    >
                      <span style={{ flex: 1, wordBreak: "break-word" }}>
                        {n.text}
                      </span>
                      <button
                        onClick={() => deleteNote(n.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {notes.length > 5 && (
                    <p
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      + {notes.length - 5} ghi chú khác
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── SGK → KHBD Panel — floating overlay, append/merge, preview→confirm */}
      {scanPreview && (
        <ScanModal
          scan={scanPreview}
          onClose={() => setScanPreview(null)}
          onSaved={({ type, saved }) => {
            // thông báo và điều hướng nhẹ
            const dest =
              type === "worksheet"
                ? "phiếu học tập"
                : type === "question"
                  ? "ngân hàng câu hỏi"
                  : type === "game"
                    ? "kho hoạt động"
                    : "ghi chú";
            alert(`✓ Đã lưu vào ${dest}`);
            // optional: emit event để kho tự refresh
            try {
              appEvents.emit(AppEvents.SCAN_SAVED, { type, saved });
            } catch {}
            setScanPreview(null);
          }}
        />
      )}

      {/* SGK → KHBD Panel: đã gỡ theo module mới */}

      {/* ── Thanh điều khiển mobile kiểu app (desktop ẩn qua CSS) ── */}
      <ReaderMobileBar
        tocOpen={!tocCollapsed}
        aiOpen={!aiCollapsed}
        toolsOpen={showAdvancedDrawer}
        isWordFile={isWordFile}
        wordInfo={`${htmlBookPages.length} trang`}
        pageDisplay={pageDisplay}
        canPrev={!isWordFile && pageNum > 1}
        canNext={!isWordFile && pageNum < numPages}
        onToc={() => setTocCollapsed((v) => !v)}
        onAi={() => setAiCollapsed((c) => !c)}
        onTools={() => setShowAdvancedDrawer((v) => !v)}
        onPrev={() => goToPage(pageNum - (twoPageMode ? 2 : 1))}
        onNext={() => goToPage(pageNum + (twoPageMode ? 2 : 1))}
        onPageTap={() => {
          setEditingPage(true);
          setPageInputVal(String(bookPage(pageNum)));
        }}
      />
    </div>
  );
}
