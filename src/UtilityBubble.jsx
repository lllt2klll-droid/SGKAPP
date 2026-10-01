import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  X,
  LayoutGrid,
  Plus,
  Dices,
  BookOpen,
  Sparkles,
  FileSearch,
  Lightbulb,
  FileText,
  Puzzle,
  Database,
  ListChecks,
  ClipboardCheck,
  Library,
  Search,
  Scissors,
} from "lucide-react";
import { findTocBook } from "./tocData";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { loadSettings } from "./settingsStore";
import { safeGetJSON, safeSetJSON, safeGetString } from "./safeStorage.js";
import FileDropzone from "./components/FileDropzone.jsx";

// ─── Floating utility bubble (collapsible panel like a chat bubble) ──────────
export default function UtilityBubble({
  icon,
  title,
  badge = 0,
  children,
  defaultOpen = false,
  align = "left",
  className = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const bubbleRef = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Drag & Drop handlers
  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('.util-bubble-header')) {
      e.preventDefault();
      setIsDragging(true);
      const rect = bubbleRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      if (bubbleRef.current) {
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        // Keep within viewport
        const maxX = window.innerWidth - bubbleRef.current.offsetWidth;
        const maxY = window.innerHeight - bubbleRef.current.offsetHeight;
        bubbleRef.current.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        bubbleRef.current.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        bubbleRef.current.style.right = 'auto';
        bubbleRef.current.style.bottom = 'auto';
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const isToc = className.includes("util-bubble--toc");
  const bubblePos = isToc
    ? { right: "5.8rem", left: "auto" }
    : align === "right"
      ? { right: "1.25rem", left: "auto" }
      : { left: "1.25rem", right: "auto" };
  const z = isToc ? 4999 : 5000;
  return (
    <div
      className={`util-bubble ${align === "right" ? "util-bubble--right" : ""} ${className}`.trim()}
      ref={bubbleRef}
      style={{ position: "fixed", bottom: "1.25rem", zIndex: z, ...bubblePos }}
    >
      {open && (
        <div className="util-bubble-panel">
          <div className="util-bubble-header" onMouseDown={handleHeaderMouseDown}>
            <span
              className="flex-row gap-sm"
            >
              {icon} {title}
            </span>
            <button
              className="util-bubble-close"
              onClick={() => setOpen(false)}
              aria-label="Đóng bong bóng tiện ích"
            >
              <X size={16} />
            </button>
          </div>
          <div className="util-bubble-body">{children}</div>
        </div>
      )}
      <button
        className="util-bubble-fab"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Đóng" : title}
        aria-label={title}
      >
        {icon}
        {badge > 0 && <span className="util-bubble-badge">{badge}</span>}
      </button>
    </div>
  );
}

// ─── Lobby variant: library stats + shortcuts ────────────────────────────────
export function LobbyBubble({ books, geminiKey, onOpenBook, onOpenGlossary }) {
  const stats = useMemo(() => {
    const byGrade = {};
    const bySubject = {};
    books.forEach((b) => {
      byGrade[b.grade] = (byGrade[b.grade] || 0) + 1;
      bySubject[b.subject] = (bySubject[b.subject] || 0) + 1;
    });
    return { total: books.length, byGrade, bySubject };
  }, [books]);

  const openRandom = () => {
    if (!books.length) return;
    onOpenBook(books[Math.floor(Math.random() * books.length)]);
  };

  return (
    <UtilityBubble
      icon={<LayoutGrid size={18} />}
      title="Tiện ích thư viện"
      badge={stats.total}
    >
      <div className="util-stat-grid">
        <div className="util-stat">
          <strong>{stats.total}</strong>
          <span>Cuốn sách</span>
        </div>
        {[1, 2, 3, 4, 5].map((g) =>
          stats.byGrade[g] ? (
            <div className="util-stat" key={g}>
              <strong>{stats.byGrade[g]}</strong>
              <span>Lớp {g}</span>
            </div>
          ) : null,
        )}
        {Object.entries(stats.bySubject).map(([s, n]) => (
          <div className="util-stat" key={s}>
            <strong>{n}</strong>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <button
        className="btn btn-primary util-btn"
        onClick={openRandom}
        disabled={!books.length}
      >
        <Dices size={15} /> Mở sách ngẫu nhiên
      </button>
      <button className="btn btn-secondary util-btn" onClick={onOpenGlossary}>
        <BookOpen size={15} /> Bảng thuật ngữ sư phạm
      </button>
      <div className={`util-key ${geminiKey ? "ok" : "no"}`}>
        {geminiKey
          ? "✅ AI đã sẵn sàng"
          : "⚠️ Chưa có API Key — mở Cài đặt AI nhé!"}
      </div>
    </UtilityBubble>
  );
}

// ─── Book variant: table of contents of the open book ────────────────────────
const normStr = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "");

export function BookTocBubble({
  book,
  pdfDoc,
  numPages,
  geminiKey,
  currentPage,
  onJumpPage,
  onTocChange,
  twoPageMode = false,
}) {
  const cacheKey = `toc_${book.filename}`;
  const staticBook = useMemo(() => findTocBook(book), [book]);
  // Static items carry PDF page numbers (printed page + TOC_PDF_OFFSET)
  const staticToc = useMemo(
    () =>
      staticBook
        ? staticBook.items.map((it, idx) => ({
            ...it,
            page: it.page,
            depth: it.depth ?? 0,
            _idx: idx,
          }))
        : [],
    [staticBook],
  );
  // Static coverage: how far into the book the printed TOC reaches
  const staticCoverage = useMemo(() => {
    if (!staticToc.length || !numPages) return -1;
    const lastPage = Math.max(...staticToc.map((it) => it.page));
    return (lastPage / numPages) * 100;
  }, [staticToc, numPages]);
  const [toc, setToc] = useState([]);
  const [source, setSource] = useState(""); // 'static' | 'pdf' | 'ai'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualFileName, setManualFileName] = useState("");
  const [manualTocOpen, setManualTocOpen] = useState(false);

  const parseManualToc = useCallback((rawText) => {
    const text = String(rawText || "").trim();
    if (!text) {
      throw new Error("Vui lòng nhập mục lục hoặc chọn file mục lục.");
    }

    const trimmed = text
      .replace(/```json|```/gi, "")
      .replace(/\r/g, "")
      .trim();

    try {
      const json = JSON.parse(trimmed);
      if (!Array.isArray(json)) throw new Error("JSON mục lục phải là mảng.");
      const items = json
        .map((item) => ({
          title: String(item?.title || "").trim(),
          page: Number(item?.page ?? item?.pageNumber ?? 0),
          depth: Number(item?.depth || 0),
          sub: String(item?.sub || "").trim(),
        }))
        .filter(
          (item) => item.title && Number.isFinite(item.page) && item.page > 0,
        );
      if (items.length)
        return items.map((item) => ({ ...item, page: Math.max(1, item.page) }));
    } catch (e) {
      throw new Error("Lỗi phân tích JSON mục lục: " + (e?.message || "dữ liệu không hợp lệ"));
    }

    const rows = trimmed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(
          /^(.*?)(?:\s*[|,;]\s*|\s+-\s+|\s+)(\d{1,4})\s*$/,
        );
        if (match) {
          return { title: match[1].trim(), page: Number(match[2]) };
        }
        const fallback = line.match(/^(.*?)(\d{1,4})$/);
        return fallback
          ? { title: fallback[1].trim(), page: Number(fallback[2]) }
          : null;
      })
      .filter(Boolean)
      .map((item) => ({
        title: item.title.replace(/^[-•*]+\s*/, ""),
        page: Math.max(1, Number(item.page) || 1),
        depth: 0,
        sub: "",
      }))
      .filter((item) => item.title);

    if (!rows.length) {
      throw new Error(
        "Không đọc được định dạng mục lục. Hãy dùng định dạng JSON hoặc 'title | page'.",
      );
    }

    return rows;
  }, []);

  const applyManualToc = useCallback(
    (rawText, label = "mục lục thủ công") => {
      try {
        const items = parseManualToc(rawText);
        const safeItems = items
          .map((item, idx) => ({
            ...item,
            title: String(item.title || `Mục ${idx + 1}`).trim(),
            page: Math.min(
              numPages || 999,
              Math.max(1, Number(item.page) || 1),
            ),
            depth: 0,
          }))
          .sort((a, b) => a.page - b.page);

        setToc(safeItems);
        setSource("manual");
        onTocChange?.(safeItems);
        setError("");
        setManualText("");
        setManualFileName("");
        try {
          safeSetJSON(cacheKey, { items: safeItems, source: "manual", label });
        } catch {
          /* ignore */
        }
      } catch (err) {
        setError(err.message || "Không thể thêm mục lục.");
      }
    },
    [cacheKey, numPages, onTocChange, parseManualToc],
  );

  const handleManualFile = useCallback(
    async (file) => {
      if (!file) return;
      const ok = [".txt", ".json", ".csv", ".md"].some((ext) =>
        file.name.toLowerCase().endsWith(ext),
      );
      if (!ok) {
        setError("Tệp mục lục phải là .txt, .json, .csv hoặc .md.");
        return;
      }
      setManualFileName(file.name);
      const text = await file.text().catch(() => "");
      if (!text) {
        setError("File mục lục rỗng hoặc không đọc được nội dung.");
        return;
      }
      applyManualToc(text, file.name);
    },
    [applyManualToc],
  );

  const isActive = (pdfPage) =>
    currentPage === pdfPage ||
    (twoPageMode && currentPage > 1 && pdfPage === currentPage + 1);

  const visibleToc = useMemo(() => {
    const q = normStr(query.trim());
    if (!q) return toc;
    return toc.filter(
      (it) => normStr(it.title).includes(q) || normStr(it.sub).includes(q),
    );
  }, [toc, query]);

  // Load outline embedded in PDF (cached in localStorage) — only if no static TOC
  useEffect(() => {
    if (!pdfDoc) {
      setToc([]);
      setSource("");
      onTocChange?.([]);
      return;
    }
    if (staticToc.length) {
      setToc(staticToc);
      setSource("static");
      onTocChange?.(staticToc);
      return;
    }
    let cancelled = false;
    setToc([]);
    setSource("");
    setError("");
    try {
      const cached = safeGetString(cacheKey, null);
      if (cached) {
        const { items, source: src } = JSON.parse(cached);
        if (Array.isArray(items) && items.length) {
          setToc(items);
          setSource(src);
          onTocChange?.(items);
          return;
        }
      }
    } catch {
      /* ignore broken cache */
    }

    pdfDoc
      .getOutline()
      .then(async (outline) => {
        if (cancelled || !outline || !outline.length) return;
        const flat = [];
        const walk = async (items, depth) => {
          for (const item of items) {
            if (item.dest) {
              try {
                const idx = await pdfDoc.getPageIndex(item.dest[0]);
                if (!cancelled)
                  flat.push({ title: item.title, page: idx + 1, depth });
              } catch {
                /* skip unresolvable dest */
              }
            }
            if (item.items && item.items.length)
              await walk(item.items, depth + 1);
          }
        };
        await walk(outline, 0);
        if (!cancelled && flat.length) {
          setToc(flat);
          setSource("pdf");
          onTocChange?.(flat);
          try {
            safeSetJSON(cacheKey, { items: flat, source: "pdf" });
          } catch {
            /* storage full */
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, cacheKey, staticToc, onTocChange]);

  // Generate TOC with AI (estimated pages), cached per book
  const generateTocAI = async () => {
    if (!geminiKey) {
      setError("Chưa có API Key! Hãy mở Cài đặt AI để nhập khóa nhé.");
      return;
    }
    setLoading(true);
    setError("");
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    
    try {
      const sys =
        'Bạn là chuyên gia sách giáo khoa tiểu học Việt Nam, hỗ trợ giáo viên nghiên cứu SGK theo chương trình GDPT 2018.';
      const prompt = `Hãy tạo mục lục cho sách giáo khoa "${book.title}" (Lớp ${book.grade}, Môn ${book.subject}) theo bộ sách "Kết nối tri thức với cuộc sống". Sách PDF có tổng cộng ${numPages} trang, gồm cả bìa, giới thiệu và mục lục. Hãy liệt kê từ 5 đến 12 mục chính (chương/chủ đề/bài học) với số trang ước lượng hợp lý dựa trên cấu trúc chuẩn của SGK để giáo viên dễ dàng nghiên cứu và soạn giáo án. Trả về JSON thuần, không có markdown fence, đúng định dạng: [{"title":"Tên mục","page":số_trang}]`;
      
      const model = (()=>{ try{ return loadSettings().ai?.model || "gemini-2.5-flash"; } catch{ return "gemini-2.5-flash"; } })();
      const text = await aiService.callAI({
        apiKey: geminiKey,
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: sys }] },
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        requestId,
      });
      
      if (!text) throw new Error("AI không trả về mục lục. Hãy thử lại nhé!");
      // Robust fence handling: trim, strip ```json fences, then extract JSON array
      let cleaned = text.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      // Extract from first [ to last ]
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start === -1 || end === -1 || end <= start)
        throw new Error("AI trả lời không đúng định dạng. Hãy thử lại nhé!");
      let parsed;
      try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { throw new Error("AI trả lời JSON lỗi: " + e.message); }
      if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error("AI trả lời không đúng định dạng. Hãy thử lại nhé!");
      const items = parsed
        .map((m) => ({
          title: String(m?.title || "").trim(),
          page: parseInt(m?.page, 10),
        }))
        .filter((m) => m.title)
        .map((m) => ({
          title: m.title,
          page: Math.max(
            1,
            Math.min(numPages || 999, isNaN(m.page) ? 1 : m.page),
          ),
          depth: 0,
        }))
        .sort((a, b) => a.page - b.page);
      if (!items.length)
        throw new Error("AI trả lời không đúng định dạng. Hãy thử lại nhé!");
      setToc(items);
      setSource("ai");
      onTocChange?.(items);
      try {
        safeSetJSON(cacheKey, { items, source: "ai" });
      } catch {
        /* storage full */
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err.status, err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <UtilityBubble
      icon={<BookOpen size={18} />}
      title="Mục lục"
      badge={toc.length}
      defaultOpen={false}
      align="right"
      className="util-bubble--toc"
    >
      {source && (
        <div className={`util-toc-source ${source === "ai" ? "ai" : ""}`}>
          {source === "static"
            ? "📖 Mục lục sách (giảng dạy theo tuần)"
            : source === "pdf"
              ? "📄 Mục lục từ PDF"
              : "✨ Mục lục AI — trang ước lượng"}
        </div>
      )}

      {source === "static" && staticCoverage >= 0 && staticCoverage < 80 && (
        <div className="util-toc-source ai">
          ⚠️ Mục lục sách chỉ phủ tới ~{Math.round(staticCoverage)}% cuốn sách —
          thử mục lục AI đầy đủ hơn bên dưới
        </div>
      )}

      {error && <div className="util-error">{error}</div>}

      <div
        style={{
          display: "grid",
          gap: "0.55rem",
          marginBottom: "0.75rem",
          padding: "0.65rem",
          border: "1px solid rgba(42, 93, 158, 0.18)",
          borderRadius: "10px",
          background: "rgba(247, 250, 255, 0.8)",
        }}
      >
        <button
          type="button"
          onClick={() => setManualTocOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: "0.72rem",
            fontWeight: 800,
            color: "var(--primary)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span> {manualTocOpen ? "−" : "+"} Thêm mục lục thủ công</span>
        </button>

        {manualTocOpen && (
          <>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={4}
              placeholder={
                'Ví dụ:\n1. Bài 1: Khởi động | 12\n2. Bài 2: Tập đọc | 25\nhoặc JSON: [{"title":"Bài 1","page":12}]'
              }
              style={{
                width: "100%",
                resize: "vertical",
                border: "1px solid rgba(42, 93, 158, 0.3)",
                borderRadius: "8px",
                padding: "0.55rem 0.65rem",
                fontFamily: "inherit",
                fontSize: "0.78rem",
                lineHeight: 1.5,
                background: "var(--bg-card)",
              }}
            />
            <div className="flex-row-gap-sm">
              <button
                className="btn btn-primary util-btn"
                onClick={() => applyManualToc(manualText)}
                disabled={!manualText.trim() || loading}
              >
                <BookOpen size={15} /> Dùng mục lục đã nhập
              </button>
            </div>
            <FileDropzone
              accept=".txt,.json,.csv,.md"
              multiple={false}
              title="Kéo thả file mục lục vào đây hoặc bấm để chọn"
              hint=".txt / .json / .csv / .md"
              compact
              onFiles={(f) => handleManualFile(Array.isArray(f) ? f[0] : f)}
              onError={(m) => setError(m)}
            />
            {manualFileName && (
              <div className="text-0-7 text-muted">
                Tệp đang dùng: {manualFileName}
              </div>
            )}
          </>
        )}
      </div>

      {toc.length > 0 && (
        <div className="util-toc-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm trong mục lục (${toc.length} mục)…`}
            aria-label="Tìm trong mục lục"
          />
        </div>
      )}

      {visibleToc.length > 0 ? (
        <div className="toc-table-wrap">
          <table className="toc-table" role="table" aria-label="Mục lục">
            <thead>
              <tr>
                <th className="toc-th-bai">Bài</th>
                <th className="toc-th-title">Tên bài</th>
                <th className="toc-th-page">Trang</th>
              </tr>
            </thead>
            <tbody>
              {visibleToc.map((item, i) => {
                const bookPage = Math.max(1, item.page - 1);
                const baiLabel = `Bài ${i + 1}`;
                const active = isActive(item.page);
                return (
                  <tr
                    key={i}
                    className={`toc-row${active ? " active" : ""}`}
                    onClick={() => onJumpPage(item.page)}
                    title={`Nhảy tới trang ${bookPage} — ${item.title}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onJumpPage(item.page);
                      }
                    }}
                  >
                    <td className="toc-col-bai">{baiLabel}</td>
                    <td
                      className="toc-col-title"
                      style={{ paddingLeft: `${0.55 + (item.depth || 0) * 0.65}rem` }}
                    >
                      <span className="toc-title-text">{item.title}</span>
                      {item.sub ? <span className="toc-sub">{item.sub}</span> : null}
                      {item.tuann ? <span className="toc-tuan">Tuần {item.tuann}</span> : null}
                    </td>
                    <td className="toc-col-page">
                      <span className="toc-page-pill">{bookPage}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && (
          <div className="util-empty">
            <FileSearch size={26} style={{ opacity: 0.4 }} />
            <p>
              {toc.length
                ? "Không tìm thấy mục nào khớp."
                : geminiKey
                  ? "Sách này không có mục lục nhúng trong PDF. Hãy tạo mục lục bằng AI nhé!"
                  : "Sách này không có mục lục nhúng trong PDF."}
            </p>
          </div>
        )
      )}

      {!toc.length && !loading && (
        <button
          className="btn btn-primary util-btn"
          onClick={generateTocAI}
          disabled={!geminiKey || loading}
        >
          <Sparkles size={15} /> Tạo mục lục bằng AI
        </button>
      )}
      {toc.length > 0 && geminiKey && source !== "static" && (
        <button
          className="btn btn-secondary util-btn"
          onClick={generateTocAI}
          disabled={loading}
        >
          <Sparkles size={15} /> Tạo lại bằng AI
        </button>
      )}
      {toc.length > 0 && geminiKey && source === "static" && (
        <button
          className="btn btn-secondary util-btn"
          onClick={generateTocAI}
          disabled={loading}
        >
          <Sparkles size={15} /> Dùng mục lục AI thay thế
        </button>
      )}
      {staticToc.length > 0 && source && source !== "static" && (
        <button
          className="btn btn-secondary util-btn"
          onClick={() => {
            setToc(staticToc);
            setSource("static");
            onTocChange?.(staticToc);
            setQuery("");
          }}
          disabled={loading}
        >
          <BookOpen size={15} /> Dùng mục lục sách
        </button>
      )}
      {loading && (
        <div className="util-loading">
          <div className="spinner w-14-h-14" /> Đang tạo
          mục lục…
        </div>
      )}
    </UtilityBubble>
  );
}

// ─── Learning Hub variant: quick actions for learning assistant ───────────────
export function LearningHubBubble({ onNavigate }) {
  const quickActions = [
    {
      id: "search",
      icon: <Search size={16} />,
      label: "Tìm nhanh",
      description: "Tìm kiếm toàn văn",
      view: "search",
    },
    {
      id: "ideas",
      icon: <Lightbulb size={16} />,
      label: "Lưu ý tưởng",
      description: "Lưu ý tưởng dạy học",
      view: "ideas",
    },
    {
      id: "lessonplans",
      icon: <FileText size={16} />,
      label: "Tạo KHBD",
      description: "Soạn kế hoạch bài dạy",
      view: "lessonplans",
    },
    {
      id: "activities",
      icon: <Puzzle size={16} />,
      label: "Tạo hoạt động",
      description: "Tạo hoạt động mẫu",
      view: "activities",
    },
    {
      id: "questionbank",
      icon: <Database size={16} />,
      label: "Tạo câu hỏi",
      description: "Thêm vào ngân hàng câu hỏi",
      view: "questionbank",
    },
    {
      id: "collections",
      icon: <Scissors size={16} />,
      label: "Lưu trích đoạn",
      description: "Lưu đoạn văn quan trọng",
      view: "collections",
    },
    {
      id: "references",
      icon: <Library size={16} />,
      label: "Thêm tham khảo",
      description: "Thêm tài liệu tham khảo",
      view: "references",
    },
    {
      id: "tasks",
      icon: <ClipboardCheck size={16} />,
      label: "Việc cần làm",
      description: "Quản lý nhiệm vụ cá nhân",
      view: "tasks",
    },
  ];

  const handleAction = (action) => {
    if (onNavigate) {
      onNavigate(action.view);
    }
  };

  return (
    <UtilityBubble
      icon={<Sparkles size={18} />}
      title="Trợ lý học tập"
      align="right"
    >
      <div className="learning-hub-grid">
        {quickActions.map((action) => (
          <button
            key={action.id}
            className="learning-hub-action"
            onClick={() => handleAction(action)}
            title={action.description}
          >
            <span className="learning-hub-icon">{action.icon}</span>
            <span className="learning-hub-label">{action.label}</span>
          </button>
        ))}
      </div>
    </UtilityBubble>
  );
}
