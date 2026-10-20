// ── So sánh song song: 2 trang / 2 bài / 2 cuốn sách ───────────────
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  FileText,
  Printer,
  Copy,
  Check,
  ArrowRightLeft,
  Link2,
  Unlink,
  ChevronUp,
  ChevronDown,
  Plus,
  Equal,
  Rows2,
  Columns2,
  X,
  LibraryBig,
  Scale,
  NotebookPen,
  ListChecks,
  Eraser,
} from "lucide-react";
import { getApiBase } from "./apiConfig";
import { pdfjsLib } from "./pdfjs-config";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "./safeStorage";
import { citationFor } from "./researchDB";
import { exportWord, printToPdf } from "./exportDoc";
import {
  cmpNoteKeyFor,
  groupBooks,
  NOTE_TEMPLATE,
  copyTextFallback,
  noteSnippetFor,
  shortTitle,
  pageDiffOf,
  totalDiffOf,
  buildReportText,
  buildReportTableHtml,
  buildPrintHtml,
} from "./compareUtils";
import SampleButton from "./SampleButton";
import { fillSampleCompare } from "./sampleData";
import { clampPage } from "./reader/pageNavigation";

const API_BASE = getApiBase();

// Ô gõ số trang rồi Enter để nhảy tới — cho người dùng phổ thông khỏi bấm
// từng trang. Tự đồng bộ khi trang đổi từ bên kia (chế độ Song song).
function PageInput({ page, disabled, onJump }) {
  const [draft, setDraft] = useState(String(page));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(String(page)); }, [page, focused]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onJump(n);
    else setDraft(String(page));
  };
  return (
    <input
      className="cmp-page-input"
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      aria-label="Gõ số trang rồi Enter để nhảy tới trang đó"
      title="Gõ số trang rồi Enter để nhảy tới trang đó"
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setDraft(String(page)); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
        else if (e.key === "Escape") { setDraft(String(page)); e.currentTarget.blur(); }
      }}
    />
  );
}

function CompareSide({
  label,
  sideName,
  book,
  bookGroups,
  hasBooks,
  onPickBook,
  onClearBook,
  doc,
  page,
  onPrev,
  onNext,
  onFirst,
  onLast,
  onJump,
  linked,
  numPages,
  canvasRef,
  error,
  empty,
  wrapRef,
  loading,
}) {
  const displayPage = doc ? clampPage(page, numPages) : page;
  const pct = doc && numPages > 0 ? Math.round((displayPage / numPages) * 100) : 0;
  const isA = label === "A";
  return (
    <div className={`cmp-side cmp-side-v2 ${isA ? "cmp-side-a" : "cmp-side-b"}`}>
      <div className="cmp-head-v2">
        <div className="cmp-bookline">
          <span
            className={`cmp-badge ${isA ? "cmp-badge-a" : "cmp-badge-b"}`}
            title={isA ? "Sách bên trái (A)" : "Sách bên phải (B)"}
          >
            {label}
          </span>
          <div className="cmp-bookmeta">
            <select
              className="cmp-book-select-v2"
              value={book ? book.filename : ""}
              onChange={(e) => onPickBook(e.target.value)}
              aria-label={`Chọn sách cho bên ${sideName}`}
              title={book ? book.title : `Chọn sách cho bên ${sideName}`}
            >
              <option value="">— Chọn sách bên {sideName} —</option>
              {bookGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((b) => (
                    <option key={b.filename} value={b.filename}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="cmp-book-sub">
              {doc ? (
                <>{numPages} trang • {pct}% đã xem</>
              ) : book ? (
                <>Đang mở sách…</>
              ) : (
                <>Chưa chọn sách</>
              )}
            </span>
          </div>
          {book ? (
            <button
              className="cmp-clear-btn"
              onClick={onClearBook}
              title={`Bỏ chọn sách bên ${sideName}`}
              aria-label={`Bỏ chọn sách bên ${sideName}`}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="cmp-navline">
          <div className="cmp-nav-v2" role="group" aria-label={`Điều hướng trang bên ${sideName}`}>
            <button
              className="cmp-nav-btn"
              onClick={onFirst}
              disabled={!doc || displayPage <= 1}
              title="Về trang đầu"
              aria-label="Về trang đầu"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              className="cmp-nav-btn"
              onClick={onPrev}
              disabled={!doc || displayPage <= 1}
              title={linked ? "Trang trước (← khi bật Song song)" : "Trang trước"}
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="cmp-pagenum-v2" title={doc ? `Đang xem trang ${displayPage} / ${numPages}` : "Chưa chọn sách"}>
              <span className="cmp-tr">tr.</span>
              <PageInput page={displayPage} disabled={!doc} onJump={onJump} />
              <span className="cmp-total">/ {doc ? numPages : "—"}</span>
            </span>
            <button
              className="cmp-nav-btn"
              onClick={onNext}
              disabled={!doc || displayPage >= numPages}
              title={linked ? "Trang sau (→ khi bật Song song)" : "Trang sau"}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="cmp-nav-btn"
              onClick={onLast}
              disabled={!doc || displayPage >= numPages}
              title="Tới trang cuối"
              aria-label="Tới trang cuối"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
          <div className="cmp-progress" aria-hidden="true">
            <div className={`cmp-progress-fill ${isA ? "fill-a" : "fill-b"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {error && <div className="cmp-error-v2">{error}</div>}
      <div className="cmp-canvas-wrap cmp-canvas-relative cmp-canvas-v2" ref={wrapRef}>
        {empty ? (
          <div className="cmp-empty-v2">
            {!hasBooks ? (
              <>
                <span className="cmp-empty-icon"><LibraryBig size={28} /></span>
                <p className="cmp-empty-title">Thư viện chưa có sách nào</p>
                <p className="cmp-empty-desc">Hãy thêm sách PDF ở trang Thư viện trước, rồi quay lại so sánh.</p>
              </>
            ) : (
              <>
                <span className="cmp-empty-icon"><BookOpen size={28} /></span>
                <p className="cmp-empty-title">Bên {label} đang trống</p>
                <ol className="cmp-empty-steps">
                  <li><b>1.</b> Chọn <b>sách bên {sideName}</b> ở menu phía trên</li>
                  <li><b>2.</b> Lật trang để đối chiếu nội dung</li>
                  <li><b>3.</b> Ghi nhận xét rồi xuất biên bản</li>
                </ol>
              </>
            )}
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} style={loading ? { opacity: 0.35, pointerEvents: "none" } : undefined} />
            {loading && (
              <div className="cmp-loading cmp-loading-overlay" aria-live="polite">
                <div className="spinner spinner-sm" />
                <p>Đang tải trang {displayPage}…</p>
              </div>
            )}
            {doc && !loading && (
              <span className="cmp-page-float">tr. {displayPage} / {numPages}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CompareView({
  books = [],
  initialFileA = "",
  initialFileB = "",
}) {
  const [fileA, setFileA] = useState(initialFileA || "");
  // Phase 8: removed fake storage loop — DATA_UPDATED via appEvents is single bus, no synthetic storage needed
  const [fileB, setFileB] = useState(initialFileB || "");
  const [docA, setDocA] = useState(null);
  const [docB, setDocB] = useState(null);
  const [pageA, setPageA] = useState(1);
  const [pageB, setPageB] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [linked, setLinked] = useState(true);
  const [errA, setErrA] = useState("");
  const [errB, setErrB] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [syncAnimating, setSyncAnimating] = useState(false);
  const [boxA, setBoxA] = useState({ w: 0, h: 0 });
  const [boxB, setBoxB] = useState({ w: 0, h: 0 });
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);
  const wraps = useRef({});
  // Mỗi bên dùng token render/load riêng — trước đây dùng chung 1 counter
  // nên mở 2 sách cùng lúc thì bên render/load sau sẽ hủy bỏ bên trước
  // (bên A kẹt ở "Đang tải trang..." hoặc trang trắng).
  const renderGenARef = useRef(0);
  const renderGenBRef = useRef(0);
  const boxARef = useRef(boxA);
  boxARef.current = boxA;
  const boxBRef = useRef(boxB);
  boxBRef.current = boxB;
  const loadGenARef = useRef(0);
  const loadGenBRef = useRef(0);
  const docsCacheRef = useRef(new Map());
  // Refs luôn mới nhất để điều hướng không bị stale closure khi bấm nhanh
  const pageARef = useRef(pageA);
  pageARef.current = pageA;
  const pageBRef = useRef(pageB);
  pageBRef.current = pageB;
  const docARef = useRef(docA);
  docARef.current = docA;
  const docBRef = useRef(docB);
  docBRef.current = docB;
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  const stageRef = useRef(null);
  // Timer tập trung để unmount giữa chừng (đổi view khi animation/timeout
  // đang chạy) không còn setState lên component đã gỡ.
  const timersRef = useRef([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; }, []);
  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);
  // Snapshot state mới nhất cho các handler ổn định (keyboard, swap, pick)
  // để effect phím tắt chỉ đăng ký 1 lần, không gỡ/lắp lại mỗi lần lật trang.
  const stateRef = useRef(null);
  stateRef.current = { fileA, fileB, pageA, pageB, errA, errB, docA, docB };
  const [splitRatio, setSplitRatio] = useState(()=>{
    try{ const raw = safeGetString("sgk_compare_ratio", ""); const v=parseInt(raw||"",10); if(Number.isFinite(v)&&v>=25&&v<=75) return v; }catch (e) { console.warn("[CompareView] safeGetString failed for sgk_compare_ratio", e); }
    return 50;
  });
  // Xem dọc (chồng 2 sách lên nhau) thân thiện với điện thoại/máy tính bảng.
  // Mặc định xem dọc khi màn hình hẹp, nhớ lựa chọn cho lần sau.
  const [stacked, setStacked] = useState(() => {
    try {
      const raw = safeGetString("sgk_compare_stacked", "");
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch (e) { console.warn("[CompareView] safeGetString failed for sgk_compare_stacked", e); }
    return typeof window !== "undefined" && window.innerWidth < 900;
  });
  // Thanh Mẹo cho người mới — tắt 1 lần là nhớ, không hiện lại.
  const [hintOff, setHintOff] = useState(() => {
    try { return safeGetString("sgk_compare_hint", "") === "off"; }
    catch (e) { console.warn("[CompareView] safeGetString failed for sgk_compare_hint", e); return false; }
  });
  const dismissHint = useCallback(() => {
    setHintOff(true);
    try {
      const res = safeSetString("sgk_compare_hint", "off");
      if (!res.ok) console.warn("[CompareView] safeSetString failed for sgk_compare_hint:", res.error);
    } catch (e) { console.warn("[CompareView] safeSetString exception sgk_compare_hint:", e); }
  }, []);
  useEffect(()=>{
    try{
      const res = safeSetString("sgk_compare_ratio", String(splitRatio));
      if (!res.ok) {
        if (res.quota) console.warn("[safeStorage] QuotaExceededError on sgk_compare_ratio: không thể lưu do bộ nhớ đầy");
        else console.warn("[CompareView] safeSetString failed for sgk_compare_ratio:", res.error);
      }
    }catch (e) { console.warn("[CompareView] safeSetString exception sgk_compare_ratio:", e); }
  }, [splitRatio]);
  useEffect(()=>{
    try{
      const res = safeSetString("sgk_compare_stacked", stacked ? "1" : "0");
      if (!res.ok) console.warn("[CompareView] safeSetString failed for sgk_compare_stacked:", res.error);
    }catch (e) { console.warn("[CompareView] safeSetString exception sgk_compare_stacked:", e); }
  }, [stacked]);
  const dragCleanupRef = useRef(null);
  useEffect(() => () => { dragCleanupRef.current?.(); dragCleanupRef.current = null; }, []);
  const onSplitDragStart = useCallback((e)=>{
    if (e.cancelable) e.preventDefault();
    const stage = stageRef.current;
    if(!stage) return;
    const rect = stage.getBoundingClientRect();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startR = splitRatio;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev)=>{
      // chặn cuộn trang trên mobile khi đang kéo (listener đã đăng ký passive:false)
      if (ev.cancelable) ev.preventDefault();
      const curX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const delta = curX - startX;
      const deltaPct = rect.width ? (delta / rect.width) * 100 : 0;
      const nr = Math.max(25, Math.min(75, startR + deltaPct));
      setSplitRatio(Math.round(nr));
    };
    const onUp = ()=>{
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      if (dragCleanupRef.current === onUp) dragCleanupRef.current = null;
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = onUp;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive:false });
    window.addEventListener("touchend", onUp);
  }, [splitRatio]);
  const resetSplit = useCallback(() => setSplitRatio(50), []);

  const bookList = Array.isArray(books) ? books : [];
  const bookGroups = useMemo(() => groupBooks(bookList), [bookList]);
  const bookA = bookList.find((b) => b.filename === fileA) || null;
  const bookB = bookList.find((b) => b.filename === fileB) || null;

  // noteKey order-independent: same pair regardless of A/B order so swap doesn't lose note
  const noteKey = fileA || fileB ? cmpNoteKeyFor(fileA, fileB) : null;

  // Nhớ cặp sách đang so sánh — mở lại trang là tiếp tục ngay, khỏi chọn lại.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !bookList.length) return;
    if (initialFileA || initialFileB) { restoredRef.current = true; return; }
    restoredRef.current = true;
    try {
      const raw = safeGetString("sgk_compare_last", "");
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return;
      if (o.a && bookList.some((b) => b.filename === o.a)) setFileA(o.a);
      if (o.b && bookList.some((b) => b.filename === o.b)) setFileB(o.b);
    } catch (e) { console.warn("[CompareView] restore last pair failed", e); }
  }, [bookList, initialFileA, initialFileB]);
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      safeSetString("sgk_compare_last", JSON.stringify({ a: fileA || "", b: fileB || "" }));
    } catch (e) { console.warn("[CompareView] save last pair failed", e); }
  }, [fileA, fileB]);

  // Sách bị xóa/đổi tên khi đang mở so sánh → dọn bên đó thay vì treo doc cũ.
  // Chỉ dọn khi thư viện đã có dữ liệu (tránh xóa oan lúc books đang tải).
  useEffect(() => {
    if (!bookList.length) return;
    const s = stateRef.current;
    if (s.fileA && !bookList.some((b) => b.filename === s.fileA)) {
      setFileA(""); setDocA(null); setPageA(1); setErrA("");
    }
    if (s.fileB && !bookList.some((b) => b.filename === s.fileB)) {
      setFileB(""); setDocB(null); setPageB(1); setErrB("");
    }
  }, [bookList]);

  // Đồng bộ khi props initial đổi từ bên ngoài (hiện App chưa dùng, giữ cho API ổn định)
  useEffect(() => {
    if (initialFileA && initialFileA !== stateRef.current.fileA) {
      setFileA(initialFileA); setPageA(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFileA]);
  useEffect(() => {
    if (initialFileB && initialFileB !== stateRef.current.fileB) {
      setFileB(initialFileB); setPageB(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFileB]);

  const destroyDoc = useCallback((pdf) => {
    if (!pdf) return;
    try { pdf.destroy(); } catch (e) { console.warn("[CompareView] pdf.destroy failed", e); }
  }, []);

  const loadDoc = useCallback(async (file, setDoc, setErr, setPage, setLoading, genRef) => {
    const gen = ++genRef.current;
    // destroy previous doc for this side via cache check done by caller effect
    if (!file || typeof file !== 'string') {
      setDoc(null);
      setErr("");
      setPage(1);
      setLoading(false);
      return;
    }
    // reuse cached doc if same file already loaded (fast swap)
    const cached = docsCacheRef.current.get(file);
    if (cached && cached.numPages) {
      if (gen !== genRef.current) return;
      setDoc(cached);
      setErr("");
      setPage((p) => clampPage(p, cached.numPages));
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const pdfUrl = `${API_BASE}/api/books/${encodeURIComponent(file)}`;
      const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, isEvalSupported: false });
      const pdf = await loadingTask.promise;
      if (gen !== genRef.current) {
        destroyDoc(pdf);
        return;
      }
      // Bên kia có thể vừa tải xong cùng file này (so sánh 2 trang cùng 1 sách):
      // dùng chung doc trong cache thay vì giữ 2 bản trùng (rò bộ nhớ).
      const raced = docsCacheRef.current.get(file);
      if (raced && raced.numPages && raced !== pdf) {
        destroyDoc(pdf);
        setDoc(raced);
        setErr("");
        setPage((p) => clampPage(p, raced.numPages));
        setLoading(false);
        return;
      }
      docsCacheRef.current.set(file, pdf);
      setDoc(pdf);
      // Giữ trang hiện tại (clamp theo sách mới) thay vì ép về 1:
      // nút Mẫu đặt trang 46 trước khi load xong; còn khi user tự chọn sách
      // thì pickA/pickB đã reset về 1 rồi nên không sợ rò trang sách cũ.
      setPage((p) => clampPage(p, pdf.numPages));
      setLoading(false);
    } catch (e) {
      console.error(e);
      if (gen !== genRef.current) return;
      setDoc(null);
      setErr("Không mở được sách này. File có thể bị hỏng hoặc server đang bận.");
      setLoading(false);
    }
  }, [destroyDoc]);

  // cleanup cached docs on unmount
  useEffect(() => {
    return () => {
      for (const pdf of docsCacheRef.current.values()) destroyDoc(pdf);
      docsCacheRef.current.clear();
    };
  }, [destroyDoc]);

  useEffect(() => {
    loadDoc(fileA, setDocA, setErrA, setPageA, setLoadingA, loadGenARef);
  }, [fileA, loadDoc]);
  useEffect(() => {
    loadDoc(fileB, setDocB, setErrB, setPageB, setLoadingB, loadGenBRef);
  }, [fileB, loadDoc]);

  // Link B to A while linked: align B every time A's page changes — clamp to B's range
  useEffect(() => {
    if (!linked) return;
    if (docA && docB) {
      const clamped = clampPage(pageA, docB.numPages);
      if (clamped !== pageB) setPageB(clamped);
    }
  }, [linked, docA, docB, pageA, pageB]);

  const toggleLinked = useCallback(() => {
    const next = !linkedRef.current;
    setLinked(next);
    if (next && docARef.current && docBRef.current) {
      setPageB(clampPage(pageARef.current, docBRef.current.numPages));
      setSyncAnimating(true);
      later(() => setSyncAnimating(false), 300);
    }
  }, [later]);

  // Navigate one side; in linked mode both move to the same page number clamped to each doc.
  // Dùng ref để không bị stale khi bấm liên tục.
  const goA = useCallback((dir) => {
    const cur = pageARef.current;
    const totalA = docARef.current ? docARef.current.numPages : 0;
    const nextA = clampPage(cur + dir, totalA);
    setPageA(nextA);
    if (linkedRef.current) {
      const totalB = docBRef.current ? docBRef.current.numPages : 0;
      setPageB(totalB ? clampPage(nextA, totalB) : nextA);
    }
  }, []);

  const goB = useCallback((dir) => {
    const cur = pageBRef.current;
    const totalB = docBRef.current ? docBRef.current.numPages : 0;
    const nextB = clampPage(cur + dir, totalB);
    setPageB(nextB);
    if (linkedRef.current) {
      const totalA = docARef.current ? docARef.current.numPages : 0;
      setPageA(totalA ? clampPage(nextB, totalA) : nextB);
    }
  }, []);

  // Nhảy tới số trang tuyệt đối (ô gõ trang, nút đầu/cuối).
  // Chế độ Song song: bên còn lại đi theo cùng số trang như khi bấm nút.
  const goToA = useCallback((p) => {
    const totalA = docARef.current ? docARef.current.numPages : 0;
    if (!totalA) return;
    const nextA = clampPage(p, totalA);
    setPageA(nextA);
    if (linkedRef.current) {
      const totalB = docBRef.current ? docBRef.current.numPages : 0;
      setPageB(totalB ? clampPage(nextA, totalB) : nextA);
    }
  }, []);

  const goToB = useCallback((p) => {
    const totalB = docBRef.current ? docBRef.current.numPages : 0;
    if (!totalB) return;
    const nextB = clampPage(p, totalB);
    setPageB(nextB);
    if (linkedRef.current) {
      const totalA = docARef.current ? docARef.current.numPages : 0;
      setPageA(totalA ? clampPage(nextB, totalA) : nextB);
    }
  }, []);

  // Cho 2 bên về cùng số trang (khi đang Trang độc lập rồi muốn khớp lại).
  const syncPages = useCallback(() => {
    const s = stateRef.current;
    if (!s.docA || !s.docB) return;
    setPageB(clampPage(s.pageA, s.docB.numPages));
    setSyncAnimating(true);
    later(() => setSyncAnimating(false), 300);
  }, [later]);

  const swapSides = useCallback(() => {
    // swap files, pages, errors atomically; docs will be reused from cache so no reload flicker
    const s = stateRef.current;
    const dA = s.docA, dB = s.docB;
    // swap docs immediately to avoid blank during file effect reload
    setDocA(dB);
    setDocB(dA);
    setFileA(s.fileB);
    setFileB(s.fileA);
    setPageA(clampPage(s.pageB, dB ? dB.numPages : 0));
    setPageB(clampPage(s.pageA, dA ? dA.numPages : 0));
    setErrA(s.errB);
    setErrB(s.errA);
    // Add animation feedback
    const stage = stageRef.current;
    if (stage) {
      stage.style.opacity = '0.5';
      later(() => { stage.style.opacity = '1'; }, 200);
    }
  }, [later]);

  const zoomBy = useCallback((d) => {
    setZoom((z) => Math.min(2, Math.max(0.5, +(z + d).toFixed(1))));
  }, []);

  // Measure each canvas box separately so the split ratio actually affects fit.
  // Trước đây dùng chung 1 box = min(2 bên) nên kéo tỉ lệ không có tác dụng.
  useEffect(() => {
    const a = wraps.current.A,
      b = wraps.current.B;
    const els = [a, b].filter(Boolean);
    if (!els.length) return;
    const measure = () => {
      if (a) {
        const w = Math.max(120, a.clientWidth || 0);
        const h = Math.max(200, a.clientHeight || 0);
        setBoxA((bx) => (bx.w === w && bx.h === h ? bx : { w, h }));
      }
      if (b) {
        const w = Math.max(120, b.clientWidth || 0);
        const h = Math.max(200, b.clientHeight || 0);
        setBoxB((bx) => (bx.w === w && bx.h === h ? bx : { w, h }));
      }
    };
    const ro = new ResizeObserver(measure);
    els.forEach((el) => ro.observe(el));
    measure();
    const onWinResize = () => measure();
    window.addEventListener("resize", onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
    };
  }, []);

  // Restore / persist comparison note per book pair — per-book isolation, quota handling
  useEffect(() => {
    if (!noteKey) { setNote(""); return; }
    try {
      const val = safeGetJSON(noteKey, "");
      setNote(typeof val === "string" ? val : "");
    } catch (e) { console.warn("[CompareView] safeGetJSON failed for " + noteKey, e); setNote(""); }
  }, [noteKey]);

  // Auto-save note when it changes (debounced via onBlur + effect) — persist immediately so swap doesn't lose
  const noteRef = useRef("");
  noteRef.current = note;

  useEffect(() => {
    if (!noteKey) return;
    // save on unmount / key change
    return () => {
      try {
        const res = safeSetJSON(noteKey, noteRef.current);
        if (!res.ok) {
          if (res.quota) console.warn("[safeStorage] QuotaExceededError on " + noteKey + ": không thể lưu do bộ nhớ đầy");
          else console.warn("[CompareView] safeSetJSON failed for " + noteKey + ":", res.error);
        }
      } catch (e) { console.warn("[CompareView] safeSetJSON exception " + noteKey + ":", e); }
    };
  }, [noteKey]);

  // also persist on every note change (throttled by storage write, cheap)
  useEffect(() => {
    if (!noteKey) return;
    const t = setTimeout(() => {
      try {
        const res = safeSetJSON(noteKey, note);
        if (!res.ok) {
          if (res.quota) console.warn("[safeStorage] QuotaExceededError on " + noteKey + ": không thể lưu do bộ nhớ đầy");
          else console.warn("[CompareView] safeSetJSON failed for " + noteKey + ":", res.error);
        }
      } catch (e) { console.warn("[CompareView] safeSetJSON exception " + noteKey + ":", e); }
    }, 400);
    return () => clearTimeout(t);
  }, [note, noteKey]);

  const saveNote = () => {
    if (!noteKey) return;
    try {
      const res = safeSetJSON(noteKey, note);
      if (!res.ok) {
        if (res.quota) console.warn("[safeStorage] QuotaExceededError on " + noteKey + ": không thể lưu do bộ nhớ đầy");
        else console.warn("[CompareView] safeSetJSON failed for " + noteKey + ":", res.error);
      }
    } catch (e) { console.warn("[CompareView] safeSetJSON exception " + noteKey + ":", e); }
  };

  const copyReport = async () => {
    if (!bookA || !bookB) return;
    const displayA = docA ? clampPage(pageA, docA.numPages) : pageA;
    const displayB = docB ? clampPage(pageB, docB.numPages) : pageB;
    const text = buildReportText({
      titleA: bookA.title,
      titleB: bookB.title,
      displayA,
      displayB,
      note,
      citationA: citationFor(bookA, displayA),
      citationB: citationFor(bookB, displayB),
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!copyTextFallback(text)) {
        throw new Error("clipboard unavailable");
      }
      setCopyFailed(false);
      setCopied(true);
      later(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("[CompareView] clipboard write failed", e);
      if (!copyTextFallback(text)) {
        setCopyFailed(true);
        later(() => setCopyFailed(false), 3000);
      } else {
        setCopied(true);
        later(() => setCopied(false), 2000);
      }
    }
  };

  // Render a PDF page fitted into its box: fit = contain(box, page at scale 1),
  // then zoom is a multiplier on top of the fitted size (100% = vừa khung).
  // genRef + boxRef truyền riêng từng bên để 2 bên render song song không hủy nhau.
  const renderSide = useCallback((doc, pdfPage, canvasEl, setLoading, genRef, boxRef) => {
    if (!doc || !canvasEl) return;
    if (!Number.isFinite(pdfPage) || pdfPage < 1 || pdfPage > doc.numPages) {
      // clamp and retry once
      const clamped = clampPage(pdfPage, doc.numPages);
      if (clamped !== pdfPage) {
        // caller will correct page state; just clear canvas for now
        const ctx = canvasEl.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }
      return;
    }
    setLoading(true);
    const token = ++genRef.current;
    (async () => {
      try {
        const page = await doc.getPage(clampPage(pdfPage, doc.numPages));
        if (token !== genRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const { w, h } = boxRef.current;
        const fit = w && h && base.width && base.height ? Math.min(w / base.width, h / base.height) : 1;
        const safeFit = Number.isFinite(fit) && fit > 0 ? fit : 1;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: safeFit * zoom * dpr });
        const ctx = canvasEl.getContext("2d");
        if (!ctx) { setLoading(false); return; }
        canvasEl.width = vp.width;
        canvasEl.height = vp.height;
        canvasEl.style.width = `${vp.width / dpr}px`;
        canvasEl.style.height = `${vp.height / dpr}px`;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (token !== genRef.current) return;
        setLoading(false);
      } catch (err) {
        if (token !== genRef.current) return;
        console.error("Failed to render PDF page:", err);
        setLoading(false);
      }
    })();
  }, [zoom]);

  useEffect(() => {
    if (docA && canvasARef.current) renderSide(docA, pageA, canvasARef.current, setLoadingA, renderGenARef, boxARef);
    else if (canvasARef.current) {
      const c = canvasARef.current.getContext("2d");
      if (c) c.clearRect(0, 0, canvasARef.current.width, canvasARef.current.height);
    }
    return () => {
      renderGenARef.current++;
    };
  }, [docA, pageA, zoom, boxA, renderSide]);

  useEffect(() => {
    if (docB && canvasBRef.current) renderSide(docB, pageB, canvasBRef.current, setLoadingB, renderGenBRef, boxBRef);
    else if (canvasBRef.current) {
      const c = canvasBRef.current.getContext("2d");
      if (c) c.clearRect(0, 0, canvasBRef.current.width, canvasBRef.current.height);
    }
    return () => {
      renderGenBRef.current++;
    };
  }, [docB, pageB, zoom, boxB, renderSide]);

  // clamp pages when docs load / numPages changes
  useEffect(() => { if (docA) setPageA((p) => clampPage(p, docA.numPages)); }, [docA]);
  useEffect(() => { if (docB) setPageB((p) => clampPage(p, docB.numPages)); }, [docB]);

  // keyboard: Ctrl+L toggle linked, Ctrl+S swap, ←/→ lật trang, ↑/↓ zoom.
  // Bỏ qua khi đang gõ trong ô nhập. Chỉ đăng ký 1 lần nhờ handler ổn định.
  useEffect(() => {
    const inField = (t) => !!t?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
    const onKey = (e) => {
      if (inField(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "l") {
          e.preventDefault();
          toggleLinked();
        } else if (k === "s") {
          e.preventDefault();
          const s = stateRef.current;
          if (s.fileA || s.fileB) swapSides();
        }
        return;
      }
      if (e.altKey) return;
      const s = stateRef.current;
      const hasDoc = !!(s.docA || s.docB);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Lật song song qua bên A (tự đồng bộ B khi linked); khi độc lập
        // phím tắt không biết lật bên nào nên nhường cho nút từng bên.
        if (!linkedRef.current || !hasDoc) return;
        e.preventDefault();
        goA(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!hasDoc) return;
        e.preventDefault();
        zoomBy(e.key === "ArrowUp" ? 0.1 : -0.1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleLinked, swapSides, goA, zoomBy]);

  const exportReport = () => {
    if (!bookA || !bookB) return;
    const displayA = docA ? clampPage(pageA, docA.numPages) : pageA;
    const displayB = docB ? clampPage(pageB, docB.numPages) : pageB;
    const html = buildReportTableHtml({
      titleA: bookA.title,
      titleB: bookB.title,
      displayA,
      displayB,
      note,
      citationA: citationFor(bookA, displayA),
      citationB: citationFor(bookB, displayB),
    });
    exportWord(`So sánh — ${bookA.title} vs ${bookB.title}`, html);
  };

  const doPrint = () => {
    if (!bookA || !bookB) return;
    const displayA = docA ? clampPage(pageA, docA.numPages) : pageA;
    const displayB = docB ? clampPage(pageB, docB.numPages) : pageB;
    printToPdf(
      `So sánh — ${bookA.title} vs ${bookB.title}`,
      buildPrintHtml({
        titleA: bookA.title,
        titleB: bookB.title,
        displayA,
        displayB,
        note,
        citationA: citationFor(bookA, displayA),
        citationB: citationFor(bookB, displayB),
      }),
    );
  };

  // Cho phép 2 bên mở cùng 1 sách để so sánh 2 trang/bài trong cùng cuốn.
  const pickA = useCallback((v) => {
    setPageA(1);
    setFileA(v);
  }, []);
  const pickB = useCallback((v) => {
    setPageB(1);
    setFileB(v);
  }, []);

  const insertNoteTemplate = useCallback(() => {
    setNoteOpen(true);
    setNote((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n\n" + NOTE_TEMPLATE : NOTE_TEMPLATE));
  }, []);

  const noteSnippet = noteSnippetFor(note);

  const clearA = useCallback(() => {
    setFileA(""); setDocA(null); setPageA(1); setErrA("");
  }, []);
  const clearB = useCallback(() => {
    setFileB(""); setDocB(null); setPageB(1); setErrB("");
  }, []);
  const clearNote = useCallback(() => {
    if (!window.confirm("Xóa toàn bộ ghi chú của cặp sách này?")) return;
    setNote("");
    if (noteKey) {
      try { safeSetJSON(noteKey, ""); } catch (e) { console.warn("[CompareView] clear note failed", e); }
    }
  }, [noteKey]);

  const displayA = docA ? clampPage(pageA, docA.numPages) : pageA;
  const displayB = docB ? clampPage(pageB, docB.numPages) : pageB;
  const totalA = docA ? docA.numPages : 0;
  const totalB = docB ? docB.numPages : 0;
  const pageDiff = bookA && bookB && docA && docB ? pageDiffOf(true, displayA, displayB) : null;
  const totalDiff = totalDiffOf(totalA, totalB);
  const titleA = String(bookA?.title || "");
  const titleB = String(bookB?.title || "");
  const shortA = shortTitle(titleA);
  const shortB = shortTitle(titleB);
  const ready = !!(bookA && bookB);

  const runSample = () => {
    const s = fillSampleCompare(bookList);
    if (!s) {
      alert("Cần ít nhất 2 cuốn sách trong thư viện để so sánh.");
      return;
    }
    setFileA(s.fileA);
    setFileB(s.fileB);
    setPageA(clampPage(s.pageA, 9999));
    setPageB(clampPage(s.pageB, 9999));
    setNote(s.note);
    setNoteOpen(true);
    const k = cmpNoteKeyFor(s.fileA, s.fileB);
    try {
      const res = safeSetJSON(k, s.note);
      if (!res.ok) {
        if (res.quota) console.warn("[safeStorage] QuotaExceededError on " + k + ": không thể lưu do bộ nhớ đầy");
        else console.warn("[CompareView] safeSetJSON failed for " + k + ":", res.error);
      }
    } catch (e) { console.warn("[CompareView] safeSetJSON exception " + k + ":", e); }
    alert(
      "Đã mở mẫu so sánh 2 trang cùng một nội dung và ghi sẵn ghi chú. Bạn có thể chỉnh sửa ghi chú rồi xuất biên bản.",
    );
  };

  return (
    <div className="cmp-root cmp-root-v2">
      <div className="cmp-toolbar-v2">
        <div className="cmp-title-block">
          <span className="cmp-title-icon"><ArrowLeftRight size={16} /></span>
          <div className="cmp-title-text">
            <strong>So sánh sách</strong>
            <small>{ready ? `${shortA}  ⇄  ${shortB}` : "Chọn 2 sách để bắt đầu đối chiếu"}</small>
          </div>
          <span className={`cmp-ready-pill ${ready ? "on" : ""}`}>{ready ? "Đã sẵn sàng" : "Chưa đủ 2 sách"}</span>
        </div>
        <div className="cmp-controls">
          <div className="cmp-seg" role="tablist" aria-label="Chế độ chuyển trang">
            <button
              role="tab"
              aria-selected={linked}
              className={`cmp-seg-btn ${linked ? "active" : ""}`}
              onClick={() => { if (!linked) toggleLinked(); }}
              title="Bật: hai bên luôn cùng số trang (Ctrl+L)"
            >
              <Link2 size={13} /> Song song
            </button>
            <button
              role="tab"
              aria-selected={!linked}
              className={`cmp-seg-btn ${!linked ? "active" : ""}`}
              onClick={() => { if (linked) toggleLinked(); }}
              title="Tắt: lật trang độc lập từng bên (Ctrl+L)"
            >
              <Unlink size={13} /> Độc lập
            </button>
          </div>
          <div className="cmp-group">
            <button
              className="cmp-btn"
              onClick={swapSides}
              disabled={!bookA && !bookB}
              title={!bookA && !bookB ? "Chọn 2 sách rồi thử lại" : "Đổi vị trí hai bên (Ctrl+S)"}
            >
              <ArrowRightLeft size={13} /> <span>Đổi bên</span>
            </button>
            <button
              className="cmp-btn"
              onClick={syncPages}
              disabled={!docA || !docB}
              title={!docA || !docB ? "Mở 2 sách rồi thử lại" : "Cho bên phải về cùng số trang với bên trái"}
            >
              <Equal size={13} /> <span>Về cùng trang</span>
            </button>
            <button
              className="cmp-btn"
              onClick={() => setStacked((s) => !s)}
              title={stacked ? "Chuyển sang xem 2 sách cạnh nhau (trái–phải)" : "Chuyển sang xem chồng lên nhau (trên–dưới), dễ dùng trên điện thoại"}
            >
              {stacked ? <Columns2 size={13} /> : <Rows2 size={13} />}{" "}
              <span>{stacked ? "Xem ngang" : "Xem dọc"}</span>
            </button>
          </div>
          <span className="cmp-vdiv" aria-hidden="true" />
          <div className="cmp-group cmp-zoom-group">
            <button className="cmp-icon-btn" onClick={() => zoomBy(-0.1)} disabled={zoom <= 0.5} title="Thu nhỏ (↓)" aria-label="Thu nhỏ">
              <ZoomOut size={15} />
            </button>
            <button className="cmp-zoom-pill" onClick={() => setZoom(1)} disabled={zoom === 1} title="Bấm để về cỡ vừa khung (100%)">
              {Math.round(zoom * 100)}%
            </button>
            <button className="cmp-icon-btn" onClick={() => zoomBy(0.1)} disabled={zoom >= 2} title="Phóng to (↑)" aria-label="Phóng to">
              <ZoomIn size={15} />
            </button>
          </div>
          <span className="cmp-vdiv" aria-hidden="true" />
          <div className="cmp-group">
            <SampleButton onRun={runSample} disabled={bookList.length < 2} />
            <button
              className="cmp-btn"
              onClick={copyReport}
              disabled={!ready}
              title={!ready ? "Chọn 2 sách rồi thử lại" : copyFailed ? "Không chép được — trình duyệt chặn khay nhớ tạm" : "Sao chép biên bản so sánh vào khay nhớ tạm"}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
              <span>{copied ? "Đã chép" : copyFailed ? "Chép thất bại" : "Biên bản"}</span>
            </button>
            <button className="cmp-btn" onClick={exportReport} disabled={!ready} title={!ready ? "Chọn 2 sách rồi thử lại" : "Tải biên bản so sánh (kèm ghi chú) về file Word"}>
              <FileText size={13} /> <span>Tải Word</span>
            </button>
            <button className="cmp-btn cmp-btn-primary" onClick={doPrint} disabled={!ready} title={!ready ? "Chọn 2 sách rồi thử lại" : "Mở bản in để in ra giấy hoặc lưu thành PDF"}>
              <Printer size={13} /> <span>In / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {!hintOff && (
        <div className="cmp-hint-v2" role="note">
          <span className="cmp-hint-ico">💡</span>
          <span className="cmp-hint-txt">
            Bật <b>Song song</b> để lật 2 bên cùng lúc • gõ <b>số trang rồi Enter</b> để nhảy tới trang • <b>ghi chú tự lưu</b> theo từng cặp sách • phím tắt <kbd>←</kbd><kbd>→</kbd> lật trang, <kbd>Ctrl</kbd>+<kbd>L</kbd> đổi chế độ, <kbd>Ctrl</kbd>+<kbd>S</kbd> đổi bên
          </span>
          <button className="cmp-icon-btn sm" onClick={dismissHint} title="Ẩn mẹo này" aria-label="Ẩn mẹo này">
            <X size={13} />
          </button>
        </div>
      )}

      <div ref={stageRef} className={`cmp-stage cmp-stage-v2 ${syncAnimating ? "cmp-sync-anim" : ""} ${stacked ? "cmp-stage-stacked" : ""}`} style={stacked ? undefined : { gridTemplateColumns: `minmax(0, ${splitRatio}fr) 64px minmax(0, ${100 - splitRatio}fr)` }}>
        <CompareSide
          label="A"
          sideName="trái (A)"
          book={bookA}
          bookGroups={bookGroups}
          hasBooks={bookList.length > 0}
          onPickBook={pickA}
          onClearBook={clearA}
          doc={docA}
          page={pageA}
          onPrev={() => goA(-1)}
          onNext={() => goA(1)}
          onFirst={() => goToA(1)}
          onLast={() => goToA(Number.MAX_SAFE_INTEGER)}
          onJump={goToA}
          linked={linked}
          numPages={docA?.numPages || 0}
          canvasRef={canvasARef}
          error={errA}
          empty={!docA && !errA && !loadingA}
          loading={loadingA}
          wrapRef={(el) => {
            wraps.current.A = el;
          }}
        />
        <div className="cmp-mid">
          <span className={`cmp-link-chip-v2 ${linked ? "on" : "off"}`}>
            <span className="dot" aria-hidden="true" />
            {linked ? <Link2 size={11} /> : <Unlink size={11} />}{" "}
            {linked ? "Song song" : "Độc lập"}
          </span>
          <button
            className="cmp-swap-btn-v2"
            onClick={swapSides}
            disabled={!bookA && !bookB}
            title={stacked ? "Đổi vị trí hai bên trên ⇄ dưới (Ctrl+S)" : "Đổi vị trí hai bên trái ⇄ phải (Ctrl+S)"}
            aria-label="Đổi bên A và B"
          >
            <ArrowRightLeft size={16} />
          </button>
          <span className="cmp-vs">VS</span>
          {!stacked && (
          <div
            className="cmp-split-resizer-v2"
            onMouseDown={onSplitDragStart}
            onTouchStart={onSplitDragStart}
            onDoubleClick={resetSplit}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); setSplitRatio((r) => Math.max(25, r - 2)); }
              else if (e.key === "ArrowRight") { e.preventDefault(); setSplitRatio((r) => Math.min(75, r + 2)); }
              else if (e.key === "Home") { e.preventDefault(); resetSplit(); }
            }}
            title="Kéo để đổi tỉ lệ 2 bên, double-click để cân bằng 50/50"
            role="separator"
            aria-orientation="vertical"
            aria-label="Điều chỉnh tỉ lệ 2 bên"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={splitRatio}
            tabIndex={0}
          >
            <span className="grip" aria-hidden="true"><i /><i /><i /></span>
          </div>
          )}
        </div>
        <CompareSide
          label="B"
          sideName="phải (B)"
          book={bookB}
          bookGroups={bookGroups}
          hasBooks={bookList.length > 0}
          onPickBook={pickB}
          onClearBook={clearB}
          doc={docB}
          page={pageB}
          onPrev={() => goB(-1)}
          onNext={() => goB(1)}
          onFirst={() => goToB(1)}
          onLast={() => goToB(Number.MAX_SAFE_INTEGER)}
          onJump={goToB}
          linked={linked}
          numPages={docB?.numPages || 0}
          canvasRef={canvasBRef}
          error={errB}
          empty={!docB && !errB && !loadingB}
          loading={loadingB}
          wrapRef={(el) => {
            wraps.current.B = el;
          }}
        />
      </div>

      {(bookA || bookB) && (
        <section className="cmp-summary" aria-label="Tóm tắt so sánh">
          <div className="cmp-summary-head">
            <h3><Scale size={15} /> Tóm tắt so sánh</h3>
            <div className="cmp-summary-pills">
              <span className={`cmp-pill ${linked ? "green" : "gray"}`}>{linked ? "Song song" : "Độc lập"}</span>
              {pageDiff != null && (
                <span className={`cmp-pill ${pageDiff === 0 ? "green" : "amber"}`}>
                  {pageDiff === 0 ? "Đang cùng trang" : `Lệch ${pageDiff} trang`}
                </span>
              )}
              {totalDiff != null && totalDiff !== 0 && (
                <span className="cmp-pill blue">Chênh {totalDiff} trang tổng</span>
              )}
              <span className="cmp-pill gray">{ready ? "2 / 2 sách" : "1 / 2 sách"}</span>
            </div>
          </div>
          <div className="cmp-summary-table" role="table" aria-label="Bảng tóm tắt so sánh">
            <div className="cmp-summary-row cmp-summary-headrow" role="row">
              <span role="columnheader">Tiêu chí</span>
              <span role="columnheader"><i className="mini-badge a">A</i> Sách A</span>
              <span role="columnheader"><i className="mini-badge b">B</i> Sách B</span>
            </div>
            <div className="cmp-summary-row" role="row">
              <span className="crit" role="cell">Tên sách</span>
              <span role="cell" className="val" title={bookA?.title || ""}>{bookA ? bookA.title : "—"}</span>
              <span role="cell" className="val" title={bookB?.title || ""}>{bookB ? bookB.title : "—"}</span>
            </div>
            <div className="cmp-summary-row" role="row">
              <span className="crit" role="cell">Trang đang xem</span>
              <span role="cell">
                <strong className="page-big a-t">{bookA ? displayA : "—"}</strong>
                {totalA > 0 && <small className="muted"> / {totalA} ({Math.round((displayA / totalA) * 100)}%)</small>}
              </span>
              <span role="cell">
                <strong className="page-big b-t">{bookB ? displayB : "—"}</strong>
                {totalB > 0 && <small className="muted"> / {totalB} ({Math.round((displayB / totalB) * 100)}%)</small>}
              </span>
            </div>
            <div className="cmp-summary-row" role="row">
              <span className="crit" role="cell">Tổng số trang</span>
              <span role="cell">{totalA || "—"}</span>
              <span role="cell">
                {totalB || "—"}
                {totalDiff != null && totalDiff !== 0 && <em className="diff-tag">±{totalDiff}</em>}
              </span>
            </div>
            <div className="cmp-summary-row" role="row">
              <span className="crit" role="cell">Trích dẫn</span>
              <span role="cell" className="cite">{bookA ? citationFor(bookA, displayA) : "—"}</span>
              <span role="cell" className="cite">{bookB ? citationFor(bookB, displayB) : "—"}</span>
            </div>
          </div>
        </section>
      )}

      <section className={`cmp-note-card ${noteOpen ? "open" : ""}`} aria-label="Ghi chú so sánh">
        <button
          className="cmp-note-head"
          onClick={() => setNoteOpen((o) => !o)}
          aria-expanded={noteOpen}
          title="Mở/đóng ghi chú so sánh — tự lưu theo cặp sách"
        >
          <span className="cmp-note-ico"><NotebookPen size={15} /></span>
          <span className="cmp-note-title">
            <strong>Ghi chú so sánh</strong>
            <small>
              <span className="autosave-dot" aria-hidden="true" />
              Tự lưu theo cặp sách • {note.trim() ? `${note.trim().length} ký tự` : "chưa có nội dung"}
            </small>
          </span>
          <span className="cmp-note-snippet">{noteSnippet}</span>
          {noteOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
        {noteOpen && (
          <div className="cmp-note-body-v2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              rows={6}
              placeholder={"Điểm GIỐNG nhau:\n- …\n\nĐiểm KHÁC nhau:\n- …\n\nNhận xét / đề xuất:\n- …\n\n(tự lưu theo cặp sách)"}
              aria-label="Nội dung ghi chú so sánh"
            />
            <div className="cmp-note-foot">
              <div className="cmp-note-btns">
                <button className="cmp-btn" onClick={saveNote} title="Lưu ghi chú ngay">
                  <Check size={13} /> <span>Lưu</span>
                </button>
                <button
                  className="cmp-btn"
                  onClick={insertNoteTemplate}
                  title="Chèn khung mẫu Giống nhau / Khác nhau / Đề xuất vào ghi chú"
                >
                  <Plus size={13} /> <span>Chèn mẫu</span>
                </button>
                <button className="cmp-btn" onClick={copyReport} disabled={!ready} title="Chép biên bản so sánh">
                  <Copy size={13} /> <span>Chép biên bản</span>
                </button>
                {note.trim() && (
                  <button className="cmp-btn danger" onClick={clearNote} title="Xóa ghi chú của cặp sách này">
                    <Eraser size={13} /> <span>Xóa</span>
                  </button>
                )}
              </div>
              <span className="cmp-note-hint"><ListChecks size={12} /> Mẹo: ghi 3 ý Giống – Khác – Đề xuất rồi xuất Word/PDF.</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
