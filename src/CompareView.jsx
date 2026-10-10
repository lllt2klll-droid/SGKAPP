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
} from "lucide-react";
import { getApiBase } from "./apiConfig";
import { pdfjsLib } from "./pdfjs-config";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "./safeStorage";
import { citationFor } from "./researchDB";
import { exportWord, printToPdf, escapeHtml, nl2br } from "./exportDoc";
import SampleButton from "./SampleButton";
import { fillSampleCompare } from "./sampleData";
import DataTable from "./DataTable";
import { clampPage } from "./reader/pageNavigation";

const API_BASE = getApiBase();

// Key ghi chú theo cặp sách, không phụ thuộc thứ tự A/B để swap không mất note.
// encodeURIComponent để filename chứa "__" không gây trùng key giữa các cặp khác nhau.
function cmpNoteKeyFor(a, b) {
  if (a && b) return `sgk_cmpnote_${[a, b].sort().map(encodeURIComponent).join("__")}`;
  return `sgk_cmpnote_${encodeURIComponent(a || b)}`;
}

// Gom sách theo "Lớp X · Môn" để dropdown dễ chọn với người dùng phổ thông.
// Sách thiếu thông tin vào nhóm "Chưa phân loại".
function groupBooks(list) {
  const map = new Map();
  for (const b of list) {
    const gRaw = b.grade ?? b.lop;
    const gNum = Number(gRaw);
    const s = (b.subject || "").trim();
    const label = Number.isFinite(gNum) && String(gRaw).trim() !== ""
      ? `Lớp ${gNum}${s ? " · " + s : ""}`
      : (s || "Chưa phân loại");
    const gradeSort = Number.isFinite(gNum) ? gNum : 999;
    if (!map.has(label)) map.set(label, { label, gradeSort, items: [] });
    map.get(label).items.push(b);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => a.gradeSort - b.gradeSort || a.label.localeCompare(b.label, "vi"));
  groups.forEach((g) => g.items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "vi")));
  return groups;
}

const NOTE_TEMPLATE = `Điểm GIỐNG nhau:\n- \nĐiểm KHÁC nhau:\n- \nNhận xét / đề xuất:\n- `;

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
  return (
    <div className="cmp-side">
      <div className="cmp-head">
        <span
          className={`cmp-tag ${label === "A" ? "cmp-tag-a" : "cmp-tag-b"}`}
          title={label === "A" ? "Sách bên trái" : "Sách bên phải"}
        >
          {label}
        </span>
        <select
          className="sort-select cmp-book-select"
          value={book ? book.filename : ""}
          onChange={(e) => onPickBook(e.target.value)}
          aria-label={`Chọn sách cho bên ${sideName}`}
        >
          <option value="">— Sách bên {sideName} —</option>
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
        <div className="cmp-nav">
          <button
            className="btn-icon"
            onClick={onFirst}
            disabled={!doc || displayPage <= 1}
            title="Về trang đầu"
            aria-label="Về trang đầu"
          >
            <ChevronsLeft size={17} />
          </button>
          <button
            className="btn-icon"
            onClick={onPrev}
            disabled={!doc || displayPage <= 1}
            title={linked ? "Trang trước (← khi bật Song song)" : "Trang trước"}
            aria-label="Trang trước"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="cmp-pagenum" title={doc ? `Đang xem trang ${displayPage} / ${numPages}` : "Chưa chọn sách"}>
            tr. <PageInput page={displayPage} disabled={!doc} onJump={onJump} /> /{" "}
            {doc ? numPages : "—"}
          </span>
          <button
            className="btn-icon"
            onClick={onNext}
            disabled={!doc || displayPage >= numPages}
            title={linked ? "Trang sau (→ khi bật Song song)" : "Trang sau"}
            aria-label="Trang sau"
          >
            <ChevronRight size={17} />
          </button>
          <button
            className="btn-icon"
            onClick={onLast}
            disabled={!doc || displayPage >= numPages}
            title="Tới trang cuối"
            aria-label="Tới trang cuối"
          >
            <ChevronsRight size={17} />
          </button>
        </div>
      </div>
      {error && <div className="cmp-error">{error}</div>}
      <div className="cmp-canvas-wrap cmp-canvas-relative" ref={wrapRef}>
        {empty ? (
          <div className="cmp-empty">
            {!hasBooks ? (
              <>
                <LibraryBig size={30} />
                <p>Thư viện chưa có sách nào.<br />Hãy thêm sách PDF ở trang Thư viện trước.</p>
              </>
            ) : (
              <>
                <BookOpen size={30} />
                <p>
                  Bước 1: chọn <b>sách bên {sideName}</b> ở menu phía trên 👆
                  <br />
                  Bước 2: lật trang, ghi nhận xét rồi xuất biên bản Word/PDF.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} style={loading ? { opacity: 0.35, pointerEvents: "none" } : undefined} />
            {loading && (
              <div className="cmp-loading cmp-loading-overlay" aria-live="polite">
                <div className="spinner spinner-sm" />
                <p>Đang tải trang...</p>
              </div>
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

  const copyTextFallback = (text) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  };

  const copyReport = async () => {
    if (!bookA || !bookB) return;
    const displayA = docA ? clampPage(pageA, docA.numPages) : pageA;
    const displayB = docB ? clampPage(pageB, docB.numPages) : pageB;
    const lines = [
      `BIÊN BẢN SO SÁNH SÁCH`,
      `A: ${bookA.title} — trang ${displayA}`,
      `B: ${bookB.title} — trang ${displayB}`,
      "",
    ];
    if (note.trim()) lines.push(`GHI CHÚ SO SÁNH:\n${note}`, "");
    lines.push(
      `TRÍCH DẪN:\nA: ${citationFor(bookA, displayA)}\nB: ${citationFor(bookB, displayB)}`,
    );
    const text = lines.join("\n");
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
    const rows = [
      ["", "Sách A", "Sách B"],
      ["Tên sách", bookA.title, bookB.title],
      [
        "Trang so sánh",
        String(displayA),
        String(displayB),
      ],
    ];
    let html = "<table>";
    rows.forEach((r, i) => {
      html += `<tr>${r.map((c) => (i === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`)).join("")}</tr>`;
    });
    html += "</table>";
    if (note.trim()) html += `<h2>Ghi chú so sánh</h2>${nl2br(note)}`;
    html += `<h3>Trích dẫn</h3><blockquote>A: ${escapeHtml(citationFor(bookA, displayA))}</blockquote><blockquote>B: ${escapeHtml(citationFor(bookB, displayB))}</blockquote><hr><small>Xuất lúc ${new Date().toLocaleString("vi-VN")}</small>`;
    exportWord(`So sánh — ${bookA.title} vs ${bookB.title}`, html);
  };

  const doPrint = () => {
    if (!bookA || !bookB) return;
    const displayA = docA ? clampPage(pageA, docA.numPages) : pageA;
    const displayB = docB ? clampPage(pageB, docB.numPages) : pageB;
    printToPdf(
      `So sánh — ${bookA.title} vs ${bookB.title}`,
      `<h1>Biên bản so sánh sách</h1><div class="meta">${escapeHtml(bookA.title)} (tr. ${displayA}) • ${escapeHtml(bookB.title)} (tr. ${displayB})</div>` +
        (note.trim() ? `<h2>Ghi chú so sánh</h2>${nl2br(note)}` : "") +
        `<h2>Trích dẫn</h2><blockquote>A: ${escapeHtml(citationFor(bookA, displayA))}</blockquote><blockquote>B: ${escapeHtml(citationFor(bookB, displayB))}</blockquote>`,
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

  const noteSnippet = note.trim()
    ? note.replace(/\s+/g, " ").trim().slice(0, 96) +
      (note.replace(/\s+/g, " ").trim().length > 96 ? "…" : "")
    : "Chưa có ghi chú — bấm để mở và ghi nhận điểm giống – khác của hai bản.";

  return (
    <div className="cmp-root">
      <div className="cmp-toolbar">
        <div className="cmp-toolbar-group">
          <ArrowLeftRight size={16} />
          <span className="ui-s-ce0242">So sánh sách</span>
          <button
            className="btn btn-secondary btn-xs"
            onClick={toggleLinked}
            title="Bật: hai bên luôn cùng số trang. Tắt: lật trang độc lập từng bên. (Ctrl+L)"
          >
            {linked ? <Link2 size={13} /> : <Unlink size={13} />}{" "}
            {linked ? "Chuyển trang song song" : "Trang độc lập"}
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={swapSides}
            disabled={!bookA && !bookB}
            title={
              !bookA && !bookB
                ? "Chọn 2 sách rồi thử lại"
                : "Đổi vị trí hai bên trái ⇄ phải (Ctrl+S)"
            }
          >
            <ArrowRightLeft size={13} /> Đổi bên
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={syncPages}
            disabled={!docA || !docB}
            title={
              !docA || !docB
                ? "Mở 2 sách rồi thử lại"
                : "Cho bên phải về cùng số trang với bên trái"
            }
          >
            <Equal size={13} /> Về cùng trang
          </button>
          <SampleButton
            onRun={() => {
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
            }}
            disabled={bookList.length < 2}
          />
        </div>
        <div className="cmp-toolbar-group">
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setStacked((s) => !s)}
            title={stacked ? "Chuyển sang xem 2 sách cạnh nhau (trái–phải)" : "Chuyển sang xem 2 sách chồng lên nhau (trên–dưới), dễ dùng trên điện thoại"}
          >
            {stacked ? <Columns2 size={13} /> : <Rows2 size={13} />}{" "}
            {stacked ? "Xem ngang" : "Xem dọc"}
          </button>
          <button
            className="btn-icon"
            onClick={() => zoomBy(-0.1)}
            disabled={zoom <= 0.5}
            title="Thu nhỏ (↓)"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="cmp-pagenum cmp-zoom-reset"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            title="Bấm để về cỡ vừa khung (100%)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="btn-icon"
            onClick={() => zoomBy(0.1)}
            disabled={zoom >= 2}
            title="Phóng to (↑)"
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={copyReport}
            disabled={!bookA || !bookB}
            title={
              !bookA || !bookB
                ? "Chọn 2 sách rồi thử lại"
                : copyFailed
                  ? "Không chép được — trình duyệt chặn khay nhớ tạm"
                  : "Sao chép biên bản so sánh vào khay nhớ tạm"
            }
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copied ? "Đã chép" : copyFailed ? "Chép thất bại" : "Biên bản"}
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportReport}
            disabled={!bookA || !bookB}
            title={
              !bookA || !bookB
                ? "Chọn 2 sách rồi thử lại"
                : "Tải biên bản so sánh (kèm ghi chú) về file Word"
            }
          >
            <FileText size={13} /> Tải Word
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={doPrint}
            disabled={!bookA || !bookB}
            title={
              !bookA || !bookB
                ? "Chọn 2 sách rồi thử lại"
                : "Mở bản in để in ra giấy hoặc lưu thành PDF"
            }
          >
            <Printer size={13} /> In / PDF
          </button>
        </div>
      </div>

      {!hintOff && (
        <div className="cmp-hint" role="note">
          <span>
            💡 <b>Mẹo:</b> bật <b>«Song song»</b> để lật 2 bên cùng lúc • gõ <b>số trang rồi Enter</b> để
            nhảy tới trang • <b>ghi chú tự lưu</b> theo từng cặp sách • app <b>nhớ cặp sách</b> đang mở.
          </span>
          <button className="btn-icon" onClick={dismissHint} title="Ẩn mẹo này" aria-label="Ẩn mẹo này">
            <X size={14} />
          </button>
        </div>
      )}

      <div ref={stageRef} className={`cmp-stage ${syncAnimating ? "cmp-sync-anim" : ""} ${stacked ? "cmp-stage-stacked" : ""}`} style={stacked ? undefined : { gridTemplateColumns: `minmax(0, ${splitRatio}fr) 52px minmax(0, ${100 - splitRatio}fr)` }}>
        <CompareSide
          label="A"
          sideName="trái (A)"
          book={bookA}
          bookGroups={bookGroups}
          hasBooks={bookList.length > 0}
          onPickBook={pickA}
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
        <div className="cmp-swap" style={{ position:"relative" }}>
          <span
            className={`cmp-link-chip ${linked ? "cmp-link-on" : "cmp-link-off"}`}
          >
            {linked ? <Link2 size={11} /> : <Unlink size={11} />}{" "}
            {linked ? "Song song" : "Độc lập"}
          </span>
          <button
            className="cmp-swap-btn"
            onClick={swapSides}
            disabled={!bookA && !bookB}
            title={stacked ? "Đổi vị trí hai bên trên ⇄ dưới (Ctrl+S)" : "Đổi vị trí hai bên trái ⇄ phải (Ctrl+S)"}
          >
            <ArrowRightLeft size={16} />
          </button>
          <span className="cmp-pagenum">VS</span>
          {!stacked && (
          <div
            className="cmp-split-resizer"
            onMouseDown={onSplitDragStart}
            onTouchStart={onSplitDragStart}
            onDoubleClick={resetSplit}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); setSplitRatio((r) => Math.max(25, r - 2)); }
              else if (e.key === "ArrowRight") { e.preventDefault(); setSplitRatio((r) => Math.min(75, r + 2)); }
              else if (e.key === "Home") { e.preventDefault(); resetSplit(); }
            }}
            title="Kéo để đổi tỉ lệ 2 bên, double-click để cân bằng"
            role="separator"
            aria-orientation="vertical"
            aria-label="Điều chỉnh tỉ lệ 2 bên"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={splitRatio}
            tabIndex={0}
          />
          )}
        </div>
        <CompareSide
          label="B"
          sideName="phải (B)"
          book={bookB}
          bookGroups={bookGroups}
          hasBooks={bookList.length > 0}
          onPickBook={pickB}
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
        <div className="stat-section mt-md">
          <h3 className="ui-s-446672">Tóm tắt so sánh</h3>
          <DataTable
            columns={[
              {
                key: "tieuChi",
                label: "Tiêu chí",
                sortable: true,
                render: (v) => <span className="cell-clamp">{v}</span>,
              },
              {
                key: "sachA",
                label: "Sách A",
                sortable: true,
                render: (v) => (
                  <span className="cell-clamp ui-s-e52491">{v}</span>
                ),
              },
              {
                key: "sachB",
                label: "Sách B",
                sortable: true,
                render: (v) => (
                  <span className="cell-clamp ui-s-e52491">{v}</span>
                ),
              },
            ]}
            data={[
              {
                id: "ten",
                tieuChi: "Tên sách",
                sachA: bookA ? bookA.title : "—",
                sachB: bookB ? bookB.title : "—",
              },
              {
                id: "trang",
                tieuChi: "Trang đang xem",
                sachA: bookA ? String(docA ? clampPage(pageA, docA.numPages) : pageA) : "—",
                sachB: bookB ? String(docB ? clampPage(pageB, docB.numPages) : pageB) : "—",
              },
              {
                id: "tongsotrang",
                tieuChi: "Tổng số trang",
                sachA: docA ? String(docA.numPages) : "—",
                sachB: docB ? String(docB.numPages) : "—",
              },
              {
                id: "trich",
                tieuChi: "Trích dẫn",
                sachA: bookA ? citationFor(bookA, docA ? clampPage(pageA, docA.numPages) : pageA) : "—",
                sachB: bookB ? citationFor(bookB, docB ? clampPage(pageB, docB.numPages) : pageB) : "—",
              },
            ]}
            keyField="id"
            emptyText="Chưa chọn đủ 2 sách"
          />
        </div>
      )}

      <div className="cmp-note">
        <div
          className="cmp-note-bar"
          onClick={() => setNoteOpen((o) => !o)}
          title="Mở/đóng ghi chú so sánh — tự lưu theo cặp sách"
        >
          <strong>📝 Ghi chú so sánh</strong>
          <span className="cmp-note-snippet">{noteSnippet}</span>
          {noteOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </div>
        {noteOpen && (
          <div className="cmp-note-body">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Ghi nhận điểm giống – khác, cách triển khai nội dung, độ phù hợp… (tự lưu theo cặp sách)"
            />
            <div className="cmp-note-actions">
              <button className="btn btn-secondary btn-xs" onClick={saveNote}>
                💾 Lưu ghi chú
              </button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={insertNoteTemplate}
                title="Chèn khung mẫu Giống nhau / Khác nhau / Đề xuất vào ghi chú"
              >
                <Plus size={13} /> Chèn mẫu nhận xét
              </button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={copyReport}
                disabled={!bookA || !bookB}
              >
                Chép biên bản so sánh
              </button>
              <span className="ui-s-da4293">
                Ghi chú tự lưu theo từng cặp sách
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
