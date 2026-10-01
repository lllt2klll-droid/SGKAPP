// ── So sánh song song: 2 trang / 2 bài / 2 cuốn sách ───────────────
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
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
} from "lucide-react";
import { getApiBase } from "./apiConfig";
import { pdfjsLib } from "./pdfjs-config";
import { readJSON, saveJSON } from "./storage";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "./safeStorage";
import { citationFor } from "./researchDB";
import { exportWord, printToPdf, escapeHtml, nl2br } from "./exportDoc";
import SampleButton from "./SampleButton";
import { fillSampleCompare } from "./sampleData";
import DataTable from "./DataTable";
import { clampPage } from "./reader/pageNavigation";

const API_BASE = getApiBase();

function CompareSide({
  label,
  book,
  books,
  onPickBook,
  doc,
  page,
  setPage,
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
        >
          {label}
        </span>
        <select
          className="sort-select"
          value={book ? book.filename : ""}
          onChange={(e) => onPickBook(e.target.value)}
          aria-label={`Chọn cuốn sách bên ${label}`}
        >
          <option value="">— Chọn cuốn sách bên {label} —</option>
          {books.map((b) => (
            <option key={b.filename} value={b.filename}>
              {b.title}
            </option>
          ))}
        </select>
        <div className="cmp-nav">
          <button
            className="btn-icon"
            onClick={() => setPage((p) => clampPage(p - 1, numPages))}
            disabled={!doc || displayPage <= 1}
            title="Trang trước (←)"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="cmp-pagenum">
            tr. <b>{doc ? displayPage : "—"}</b> /{" "}
            {doc ? numPages : "—"}
          </span>
          <button
            className="btn-icon"
            onClick={() => setPage((p) => clampPage(p + 1, numPages))}
            disabled={!doc || displayPage >= numPages}
            title="Trang sau (→)"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {error && <div className="cmp-error">{error}</div>}
      <div className="cmp-canvas-wrap" ref={wrapRef}>
        {loading ? (
          <div className="cmp-loading">
            <div className="spinner spinner-sm" />
            <p>Đang tải trang...</p>
          </div>
        ) : empty ? (
          <div className="cmp-empty">
            <BookOpen size={30} />
            <p>Chọn cuốn sách bên {label} để xem trang so sánh.</p>
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  );
}

export default function CompareView({
  books,
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
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);
  const wraps = useRef({});
  const renderGenRef = useRef(0);
  const boxRef = useRef(box);
  boxRef.current = box;
  const loadGenRef = useRef(0);
  const docsCacheRef = useRef(new Map());
  const stageRef = useRef(null);
  const [splitRatio, setSplitRatio] = useState(()=>{
    try{ const raw = safeGetString("sgk_compare_ratio", ""); const v=parseInt(raw||"",10); if(Number.isFinite(v)&&v>=25&&v<=75) return v; }catch (e) { console.warn("[CompareView] safeGetString failed for sgk_compare_ratio", e); }
    return 50;
  });
  useEffect(()=>{
    try{
      const res = safeSetString("sgk_compare_ratio", String(splitRatio));
      if (!res.ok) {
        if (res.quota) console.warn("[safeStorage] QuotaExceededError on sgk_compare_ratio: không thể lưu do bộ nhớ đầy");
        else console.warn("[CompareView] safeSetString failed for sgk_compare_ratio:", res.error);
      }
    }catch (e) { console.warn("[CompareView] safeSetString exception sgk_compare_ratio:", e); }
  }, [splitRatio]);
  const onSplitDragStart = useCallback((e)=>{
    e.preventDefault();
    const stage = stageRef.current;
    if(!stage) return;
    const rect = stage.getBoundingClientRect();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startR = splitRatio;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev)=>{
      const curX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const delta = curX - startX;
      const deltaPct = (delta / rect.width) * 100;
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
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive:false });
    window.addEventListener("touchend", onUp);
  }, [splitRatio]);

  const bookA = books.find((b) => b.filename === fileA) || null;
  const bookB = books.find((b) => b.filename === fileB) || null;

  // noteKey order-independent: same pair regardless of A/B order so swap doesn't lose note
  const noteKey = fileA && fileB ? `sgk_cmpnote_${[fileA, fileB].sort().join("__")}` : fileA || fileB ? `sgk_cmpnote_${fileA || fileB}` : null;

  const destroyDoc = useCallback((pdf) => {
    if (!pdf) return;
    try { pdf.destroy(); } catch (e) { console.warn("[CompareView] pdf.destroy failed", e); }
  }, []);

  const loadDoc = useCallback(async (file, setDoc, setErr, setPage, setLoading) => {
    const gen = ++loadGenRef.current;
    // destroy previous doc for this side via cache check done by caller effect
    if (!file || typeof file !== 'string') {
      setDoc(null);
      setErr("Tên file không hợp lệ.");
      setPage(1);
      setLoading(false);
      return;
    }
    // reuse cached doc if same file already loaded (fast swap)
    const cached = docsCacheRef.current.get(file);
    if (cached && cached.numPages) {
      if (gen !== loadGenRef.current) return;
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
      if (gen !== loadGenRef.current) {
        destroyDoc(pdf);
        return;
      }
      docsCacheRef.current.set(file, pdf);
      setDoc(pdf);
      setPage(1);
      setLoading(false);
    } catch (e) {
      console.error(e);
      if (gen !== loadGenRef.current) return;
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
    const prev = docA;
    loadDoc(fileA, setDocA, setErrA, setPageA, setLoadingA);
    return () => {
      // don't destroy immediately — keep in cache for fast swap; destroy only if file changed to different and cache evicts
      // but if fileA cleared, destroy previous
      if (!fileA && prev) destroyDoc(prev);
    };
  }, [fileA, loadDoc, destroyDoc]); // docA intentionally not in deps to avoid loop
  useEffect(() => {
    const prev = docB;
    loadDoc(fileB, setDocB, setErrB, setPageB, setLoadingB);
    return () => {
      if (!fileB && prev) destroyDoc(prev);
    };
  }, [fileB, loadDoc, destroyDoc]);

  // Link B to A while linked: align B every time A's page changes — clamp to B's range
  useEffect(() => {
    if (!linked) return;
    if (docA && docB) {
      const clamped = clampPage(pageA, docB.numPages);
      if (clamped !== pageB) setPageB(clamped);
    }
  }, [linked, docA, docB, pageA, pageB]);

  const toggleLinked = () => {
    const next = !linked;
    setLinked(next);
    if (next && docA && docB) {
      const clamped = clampPage(pageA, docB.numPages);
      setPageB(clamped);
      setSyncAnimating(true);
      setTimeout(() => setSyncAnimating(false), 300);
    }
  };

  // Navigate one side; in linked mode both move to the same page number clamped to each doc
  const navA = useCallback((p) => {
    const v = typeof p === "function" ? p(pageA) : p;
    const clampedA = docA ? clampPage(v, docA.numPages) : clampPage(v, 0);
    setPageA(clampedA);
    if (linked && docB) {
      const clampedB = clampPage(clampedA, docB.numPages);
      setPageB(clampedB);
    } else if (linked) {
      setPageB(clampedA);
    }
  }, [pageA, docA, docB, linked]);

  const navB = useCallback((p) => {
    const v = typeof p === "function" ? p(pageB) : p;
    const clampedB = docB ? clampPage(v, docB.numPages) : clampPage(v, 0);
    setPageB(clampedB);
    if (linked && docA) {
      const clampedA = clampPage(clampedB, docA.numPages);
      setPageA(clampedA);
    } else if (linked) {
      setPageA(clampedB);
    }
  }, [pageB, docA, docB, linked]);

  const swapSides = () => {
    // swap files, pages, errors atomically; docs will be reused from cache so no reload flicker
    const fA = fileA, fB = fileB, pA = pageA, pB = pageB, eA = errA, eB = errB, dA = docA, dB = docB;
    // swap docs immediately to avoid blank during file effect reload
    setDocA(dB);
    setDocB(dA);
    setFileA(fB);
    setFileB(fA);
    setPageA(clampPage(pB, dB ? dB.numPages : 0));
    setPageB(clampPage(pA, dA ? dA.numPages : 0));
    setErrA(eB);
    setErrB(eA);
    // Add animation feedback
    const stage = document.querySelector('.cmp-stage');
    if (stage) {
      stage.style.opacity = '0.5';
      setTimeout(() => {
        stage.style.opacity = '1';
      }, 200);
    }
  };

  // Measure the two canvas boxes so each page can auto-fit its box
  useEffect(() => {
    const a = wraps.current.A,
      b = wraps.current.B;
    const els = [a, b].filter(Boolean);
    if (!els.length) return;
    const measure = () => {
      const wa = a.clientWidth || 0;
      const wb = b.clientWidth || 0;
      const ha = a.clientHeight || 0;
      const hb = b.clientHeight || 0;
      // avoid 0 width when one side hidden/empty: fallback to the non-zero width
      let w = 0;
      if (wa > 0 && wb > 0) w = Math.min(wa, wb);
      else w = Math.max(wa, wb);
      let h = 0;
      if (ha > 0 && hb > 0) h = Math.max(ha, hb);
      else h = Math.max(ha, hb) || 520;
      // clamp to sane bounds so fit never 0
      w = Math.max(120, w);
      h = Math.max(200, h);
      setBox((bx) => (bx.w === w && bx.h === h ? bx : { w, h }));
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

  const [copied, setCopied] = useState(false);
  const [syncAnimating, setSyncAnimating] = useState(false);

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
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("[CompareView] clipboard write failed", e);
    }
  };

  // Render a PDF page fitted into its box: fit = contain(box, page at scale 1),
  // then zoom is a multiplier on top of the fitted size (100% = vừa khung)
  const renderSide = useCallback((doc, pdfPage, canvasEl, setLoading) => {
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
    const token = ++renderGenRef.current;
    (async () => {
      try {
        const page = await doc.getPage(clampPage(pdfPage, doc.numPages));
        if (token !== renderGenRef.current) return;
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
        if (token !== renderGenRef.current) return;
        setLoading(false);
      } catch (err) {
        console.error("Failed to render PDF page:", err);
        setLoading(false);
      }
    })();
  }, [zoom]);

  useEffect(() => {
    const gen = renderGenRef;
    if (docA && canvasARef.current) renderSide(docA, pageA, canvasARef.current, setLoadingA);
    else if (canvasARef.current) {
      const c = canvasARef.current.getContext("2d");
      if (c) c.clearRect(0, 0, canvasARef.current.width, canvasARef.current.height);
    }
    if (docB && canvasBRef.current) renderSide(docB, pageB, canvasBRef.current, setLoadingB);
    else if (canvasBRef.current) {
      const c = canvasBRef.current.getContext("2d");
      if (c) c.clearRect(0, 0, canvasBRef.current.width, canvasBRef.current.height);
    }
    return () => {
      gen.current++;
    };
  }, [docA, docB, pageA, pageB, zoom, box, renderSide]);

  // clamp pages when docs load / numPages changes
  useEffect(() => { if (docA) setPageA((p) => clampPage(p, docA.numPages)); }, [docA]);
  useEffect(() => { if (docB) setPageB((p) => clampPage(p, docB.numPages)); }, [docB]);

  // keyboard: Ctrl+L toggle linked, Ctrl+S swap
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "l") {
        e.preventDefault();
        toggleLinked();
      } else if (k === "s") {
        e.preventDefault();
        if (bookA || bookB) swapSides();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookA, bookB, linked, docA, docB, pageA, pageB]);

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
      html += `<tr>${r.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`;
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

  const pickA = (v) => {
    if (v && v === fileB) {
      alert("Bên B đang xem cuốn này. Chọn cuốn khác cho bên A.");
      return;
    }
    setFileA(v);
  };
  const pickB = (v) => {
    if (v && v === fileA) {
      alert("Bên A đang xem cuốn này. Chọn cuốn khác cho bên B.");
      return;
    }
    setFileB(v);
  };

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
                : "Đổi vị trí hai bên A ⇄ B (Ctrl+S)"
            }
          >
            <ArrowRightLeft size={13} /> Đổi bên
          </button>
          <SampleButton
            onRun={() => {
              const s = fillSampleCompare(books);
              if (!s) {
                alert("Cần ít nhất 2 cuốn sách trong thư viện để so sánh.");
                return;
              }
              setFileA(s.fileA);
              setFileB(s.fileB);
              setPageA(clampPage(s.pageA, 9999));
              setPageB(clampPage(s.pageB, 9999));
              setNote(s.note);
              const k = `sgk_cmpnote_${[s.fileA, s.fileB].sort().join("__")}`;
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
            disabled={books.length < 2}
          />
        </div>
        <div className="cmp-toolbar-group">
          <button
            className="btn-icon"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}
            disabled={zoom <= 0.5}
            title="Thu nhỏ (↓)"
          >
            <ZoomOut size={16} />
          </button>
          <span className="cmp-pagenum">{Math.round(zoom * 100)}%</span>
          <button
            className="btn-icon"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}
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
                : "Sao chép biên bản so sánh vào khay nhớ tạm"
            }
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copied ? "Đã chép" : "Biên bản"}
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportReport}
            disabled={!bookA || !bookB}
            title={
              !bookA || !bookB
                ? "Chọn 2 sách rồi thử lại"
                : "Xuất biên bản so sánh"
            }
          >
            <FileText size={13} /> Word
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={doPrint}
            disabled={!bookA || !bookB}
          >
            <Printer size={13} /> PDF
          </button>
        </div>
      </div>

      <div ref={stageRef} className={`cmp-stage ${syncAnimating ? "cmp-sync-anim" : ""}`} style={{ gridTemplateColumns: `${splitRatio}% 52px ${100 - splitRatio}%` }}>
        <CompareSide
          label="A"
          book={bookA}
          books={books}
          onPickBook={pickA}
          doc={docA}
          page={pageA}
          setPage={navA}
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
            title="Đổi vị trí hai bên A ⇄ B (Ctrl+S)"
          >
            <ArrowRightLeft size={16} />
          </button>
          <span className="cmp-pagenum">VS</span>
          <div
            className="cmp-split-resizer"
            onMouseDown={onSplitDragStart}
            onTouchStart={onSplitDragStart}
            onDoubleClick={()=>{
              setSplitRatio(50);
              try{
                const res = safeSetString("sgk_compare_ratio","50");
                if (!res.ok) {
                  if (res.quota) console.warn("[safeStorage] QuotaExceededError on sgk_compare_ratio: không thể lưu do bộ nhớ đầy");
                  else console.warn("[CompareView] safeSetString failed for sgk_compare_ratio:", res.error);
                }
              }catch (e) { console.warn("[CompareView] safeSetString exception sgk_compare_ratio:", e); }
            }}
            title="Kéo để đổi tỉ lệ 2 bên, double-click để cân bằng"
            aria-hidden="true"
          />
        </div>
        <CompareSide
          label="B"
          book={bookB}
          books={books}
          onPickBook={pickB}
          doc={docB}
          page={pageB}
          setPage={navB}
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
                tieuChi: "Trang so sánh",
                sachA: bookA ? String(docA ? clampPage(pageA, docA.numPages) : pageA) : "—",
                sachB: bookB ? String(docB ? clampPage(pageB, docB.numPages) : pageB) : "—",
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
