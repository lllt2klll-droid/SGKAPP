// ── So sánh song song: 2 trang / 2 bài / 2 cuốn sách ───────────────
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
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
  Rows2,
  Columns2,
  X,
  NotebookPen,
  ListChecks,
  Eraser,
} from "lucide-react";
import { getApiBase } from "../services/apiConfig.js";
import { pdfjsLib } from "../reader/pdfjs-config.js";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "../safeStorage.js";
import { citationFor } from "../data/researchDB.js";
import { exportWord, printToPdf } from "../services/exportDoc.js";
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
} from "../reader/compareUtils.js";
import SampleButton from "./SampleButton.jsx";
import { fillSampleCompare } from "../data/sampleData.js";
import CompareSide from "./CompareSide.jsx";
import CompareToolbar from "./CompareToolbar.jsx";
import CompareSummary from "./CompareSummary.jsx";
import CompareHint from "./CompareHint.jsx";
import CompareNotes from "./CompareNotes.jsx";
import CompareSplitHandle from "./CompareSplitHandle.jsx";

const API_BASE = getApiBase();

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
      <CompareToolbar
        ready={ready}
        shortA={shortA}
        shortB={shortB}
        linked={linked}
        toggleLinked={toggleLinked}
        bookA={bookA}
        bookB={bookB}
        swapSides={swapSides}
        docA={docA}
        docB={docB}
        syncPages={syncPages}
        stacked={stacked}
        setStacked={setStacked}
        zoom={zoom}
        setZoom={setZoom}
        zoomBy={zoomBy}
        runSample={runSample}
        canRunSample={bookList.length >= 2}
        copyReport={copyReport}
        copied={copied}
        copyFailed={copyFailed}
        exportReport={exportReport}
        doPrint={doPrint}
      />

      {!hintOff && <CompareHint onDismiss={dismissHint} />}

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
            <CompareSplitHandle
              ratio={splitRatio}
              onDragStart={onSplitDragStart}
              onReset={resetSplit}
              setRatio={setSplitRatio}
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
        <CompareSummary
          linked={linked}
          pageDiff={pageDiff}
          totalDiff={totalDiff}
          ready={ready}
          bookA={bookA}
          bookB={bookB}
          displayA={displayA}
          displayB={displayB}
          totalA={totalA}
          totalB={totalB}
          citationFor={citationFor}
        />
      )}

      <CompareNotes
        open={noteOpen}
        setOpen={setNoteOpen}
        note={note}
        noteSnippet={noteSnippet}
        onChange={setNote}
        onSave={saveNote}
        onInsertTemplate={insertNoteTemplate}
        onCopyReport={copyReport}
        onClear={clearNote}
        ready={ready}
      />
    </div>
  );
}
