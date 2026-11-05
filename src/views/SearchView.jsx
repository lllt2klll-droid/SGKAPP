// ── Tìm kiếm toàn văn xuyên toàn bộ thư viện sách (offline) ────────
import React, { useState, useEffect } from "react";
import {
  Search,
  BookOpen,
  Loader2,
  Trash2,
  FileSearch,
  CheckCircle2,
  CircleDashed,
  Wrench,
  Layers,
  StickyNote,
  Clock,
  X,
} from "lucide-react";
import { getApiBase } from "../services/apiConfig.js";
import { pdfjsLib } from "../reader/pdfjs-config.js";
import {
  getIndexMeta,
  buildIndex,
  deleteIndex,
  searchAll,
} from "../data/searchIndex.js";
import { indexCoverage } from "../services/textutils.js";
import { findTocBook } from "../data/tocData.js";
import SampleButton from "./SampleButton.jsx";
import { SAMPLE_SEARCH_QUERY } from "../data/sampleData.js";
import DataTable from "./DataTable.jsx";
import { safeGetJSON } from "../safeStorage.js";
import { getSearchConfig, applySearchConfig } from "../services/settingsStore.js";
import { searchNotes, getNoteKindLabel } from "../data/noteSearch.js";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from "../data/searchRecent.js";

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const normalizeSearch = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const normIncludes = (haystack, needleNorm) => {
  if (!needleNorm) return false;
  return normalizeSearch(haystack).includes(needleNorm);
};

const API_BASE = getApiBase();

function mapDefaultType(t) {
  // Cài đặt → Tìm kiếm → Nhóm mặc định: content (toàn văn+mục lục) quy từ "books" cũ
  if (t === "content" || t === "toc" || t === "notes") return t;
  if (t === "books") return "content";
  return "all";
}
export default function SearchView({ books, onOpenBook }) {
  const [query, setQuery] = useState("");
  // Cài đặt tìm kiếm điều khiển trang này thật: nhóm mặc định, khớp dấu/hoa/cả từ, giới hạn
  const [searchCfg, setSearchCfg] = useState(() => { try { return getSearchConfig(); } catch { return { defaultType: "all", caseSensitive: false, wholeWord: false, fuzzyMatch: true, maxResults: 100 }; } });
  const [groupFilter, setGroupFilter] = useState(() => mapDefaultType(searchCfg.defaultType));
  useEffect(() => {
    // Đổi cài đặt khi đang mở trang: cập nhật giới hạn/khớp chữ ngay, giữ nhóm do người dùng đang chọn
    const h = (e) => {
      try { setSearchCfg(getSearchConfig(e?.detail)); } catch {}
    };
    window.addEventListener("sgk:settings-updated", h);
    return () => window.removeEventListener("sgk:settings-updated", h);
  }, []);
  // Matching dùng chung helper (nguồn duy nhất với GlobalSearch) — không tự
  // giữ một bản copy logic caseSensitive/wholeWord/fuzzy nữa.
  const matchText = (haystack, needle) => applySearchConfig(needle, haystack, searchCfg);
  // Phase 8: removed fake storage loop — SearchView listens only to INDEX_READY via appEvents
  const [building, setBuilding] = useState(null); // { file, done, total, kind }
  const [busyFiles, setBusyFiles] = useState({});
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState([]);
  const [tocResults, setTocResults] = useState([]);
  const [noteResults, setNoteResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches());
  const [, force] = useState(0);
  const refresh = () => force((x) => x + 1);
  const refreshRecent = () => setRecentSearches(getRecentSearches());


  // Per-book index status (read on every render)
  const statuses = books.reduce((m, b) => {
    m[b.filename] = getIndexMeta(b.filename);
    return m;
  }, {});
  const [indexQuery, setIndexQuery] = useState("");
  const [indexFilter, setIndexFilter] = useState("all");
  const indexedCount = books.filter((book) => !book.isLinkedBook && statuses[book.filename]).length;
  const filteredIndexBooks = books.filter((book) => {
    if (book.isLinkedBook) return false;
    const meta = statuses[book.filename];
    const matchesStatus = indexFilter === "all" || (indexFilter === "indexed" ? Boolean(meta) : !meta);
    const matchesQuery = normalizeSearch(`${book.title || ""} ${book.filename || ""}`)
      .includes(normalizeSearch(indexQuery.trim()));
    return matchesStatus && matchesQuery;
  });

  // Async search with debounce — toàn văn + mục lục + ghi chú
  useEffect(() => {
    const queryTrimmed = query.trim();
    if (queryTrimmed.length < 2) {
      setResults([]);
      setTocResults([]);
      setNoteResults([]);
      return;
    }

    // Mục lục: tính đồng bộ, không cần index — giới hạn theo Cài đặt → Tìm kiếm
    try {
      const tocFlat = [];
      const MAX_TOC = searchCfg.maxResults || 100;
      for (const book of books) {
        if (tocFlat.length >= MAX_TOC) break;
        let tocBook = null;
        try { tocBook = findTocBook(book); } catch (e) { console.warn("[SearchView] findTocBook failed", e); tocBook = null; }
        let items = tocBook?.items || null;
        if ((!items || !items.length) && book.filename) {
          try {
            const cached = safeGetJSON(`toc_${book.filename}`, null, (v) => v && typeof v === "object" && !Array.isArray(v));
            if (cached?.items?.length) items = cached.items;
          } catch (e) { console.warn("[SearchView] safeGetJSON failed for toc_" + book.filename, e); }
        }
        if (!items || !items.length) continue;
        for (const it of items) {
          if (tocFlat.length >= MAX_TOC) break;
          const haystack = `${it.title || ""} ${it.sub || ""} ${it.tuann ? `tuan ${it.tuann}` : ""}`;
          if (!matchText(haystack, queryTrimmed)) continue;
          const pdfPage = Number(it.pdfPage ?? it.page ?? 1) || 1;
          // Hiển thị số trang sách (book page) = pdfPage -1, mở đúng pdfPage
          const displayPage = Math.max(1, pdfPage - 1);
          tocFlat.push({
            id: `toc_${book.filename}_${pdfPage}_${tocFlat.length}`,
            sach: book.title,
            muc: `${it.title || "Mục"}${it.sub ? ` — ${it.sub}` : ""}`,
            trang: displayPage,
            tuann: it.tuann || "",
            depth: it.depth ?? 0,
            _book: book,
            _page: pdfPage,
          });
        }
      }
      setTocResults(tocFlat);
    } catch (e) {
      console.error("TOC search failed:", e);
      setTocResults([]);
    }

    // Ghi chú: tìm đồng bộ ngay (localStorage), không cần index — giới hạn theo Cài đặt
    try {
      const hits = searchNotes(queryTrimmed, books);
      // Map sang row cho DataTable
      const flatNotes = hits.slice(0, searchCfg.maxResults || 100).map((hit) => ({
        id: hit.id,
        sach: hit.book.title,
        trang: hit.displayPage,
        loai: getNoteKindLabel(hit.kind),
        doanKhop: hit.snippet || hit.title || "(trống)",
        _book: hit.book,
        _page: hit.pdfPage,
        _kind: hit.kind,
      }));
      setNoteResults(flatNotes);
    } catch (e) {
      console.warn("[SearchView] note search failed:", e);
      setNoteResults([]);
    }

    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const searchResults = await searchAll(queryTrimmed, books);
        const cap = searchCfg.maxResults || 100;
        setResults(Array.isArray(searchResults) ? searchResults.slice(0, cap) : searchResults);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, books, searchCfg]);

  // Lưu tìm kiếm gần đây — debounce 700ms để không lưu từng ký tự
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      addRecentSearch(q);
      refreshRecent();
    }, 700);
    return () => clearTimeout(id);
  }, [query]);

  // Refresh khi mount (nếu storage thay đổi từ GlobalSearch)
  useEffect(() => { refreshRecent(); }, []);

  const handleSelectRecent = (term) => setQuery(term);
  const handleRemoveRecent = (term) => {
    removeRecentSearch(term);
    refreshRecent();
  };
  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  const runBuild = async (book) => {
    if (!book || !book.filename) {
      setNotice("Không thể dựng chỉ mục: thông tin sách không hợp lệ.");
      return;
    }

    if (busyFiles[book.filename]) return;
    setBusyFiles((p) => ({ ...p, [book.filename]: true }));
    setBuilding({ file: book.filename, done: 0, total: 0, kind: "text" });
    try {
      setNotice("");
      const pdfUrl = `${API_BASE}/api/books/${encodeURIComponent(book.filename)}`;
      const pdf = await pdfjsLib.getDocument({ url: pdfUrl, isEvalSupported: false }).promise;
      await buildIndex(book, pdf, (pr) => {
        setBuilding({
          file: book.filename,
          done: pr.done,
          total: pr.total,
          kind: pr.kind,
        });
        if (pr.done === pr.total) setTimeout(refresh, 50);
      });
    } catch (err) {
      console.error("Index build failed:", err);
      setNotice(
        `Không dựng được chỉ mục cho "${book.title || "sách này"}": ${err.message || "lỗi không xác định"}`,
      );
    } finally {
      setBusyFiles((p) => ({ ...p, [book.filename]: false }));
      setBuilding((prev) => (prev?.file === book.filename ? null : prev));
      refresh();
    }
  };

  return (
    <div className="search-index-view">
      <section className="search-workspace">
        <div className="search-index-heading">
          <div className="search-index-heading-icon"><Search size={19} /></div>
          <div>
            <h2>Tìm kiếm thư viện</h2>
            <p>Tìm nhanh trong nội dung sách, mục lục và ghi chú của bạn.</p>
          </div>
          <span className="search-local-badge"><CheckCircle2 size={13} /> Tìm kiếm cục bộ</span>
        </div>
        <div className="fsearch search-index-field">
          <div className="search-index-input-wrap">
            <Search className="search-icon" size={18} />
            <input
              className="search-input"
              type="text"
              placeholder="Gõ cụm từ cần tìm trong tất cả sách & ghi chú (không phân biệt dấu)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="search-index-clear"
                onClick={() => setQuery("")}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <SampleButton
            label="Truy vấn mẫu"
            onRun={() => setQuery(SAMPLE_SEARCH_QUERY)}
            hint="Tự điền từ khóa mẫu để xem kết quả tìm kiếm toàn văn (chỉ cần các sách đã dựng chỉ mục)."
          />
        </div>
        <p className="search-index-help">
          Tìm không dấu, ví dụ gõ "so sanh" vẫn ra "so sánh", "phep cong"… Kết quả mục lục & ghi chú hiện ngay, kết quả toàn văn cần dựng chỉ mục trước.
        </p>
        <div className="search-result-tabs" role="tablist" aria-label="Nhóm kết quả">
          {[["all", "Tất cả"], ["content", "Toàn văn"], ["toc", "Mục lục"], ["notes", "Ghi chú"]].map(([v, t]) => (
            <button key={v} role="tab" aria-selected={groupFilter === v} onClick={() => setGroupFilter(v)}
              className={`search-result-tab ${groupFilter === v ? "active" : ""}`}>{t}</button>
          ))}
          <span className="search-index-config-hint">Nhóm mặc định & giới hạn lấy từ Cài đặt → Tìm kiếm</span>
        </div>

        {notice && (
          <div className="util-error mb-0-75">
            {notice}
          </div>
        )}

        {searching && (
          <div className="dash-empty p-2-5-1">
            <Loader2 size={40} className="spin" />
            <p>Đang tìm kiếm...</p>
          </div>
        )}

        {/* Kết quả mục lục — bổ sung, chuyển thẳng tới trang */}
        {(groupFilter === "all" || groupFilter === "content" || groupFilter === "toc") && tocResults.length > 0 && !searching && (() => {
          const tocColumns = [
            { key: "sach", label: "Sách", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
            { key: "muc", label: "Mục lục", sortable: true, render: (v, row) => (
              <span className="cell-clamp" style={{ paddingLeft: row.depth ? 12 : 0 }}>
                {row.depth ? "↳ " : ""}{v}{row.tuann ? ` · Tuần ${row.tuann}` : ""}
              </span>
            ) },
            { key: "trang", label: "Trang", sortable: true, width: "90px", align: "right" },
            { key: "thaoTac", label: "Thao tác", width: "120px", align: "center", render: (_, row) => <button className="btn btn-primary btn-xs" onClick={() => onOpenBook(row._book, row._page)}><Layers size={12} /> Mở trang</button> },
          ];
          return (
            <div className="mt-md">
              <h4 className="panel-title" style={{ marginBottom: 8 }}><Layers size={14} /> Mục lục khớp ({tocResults.length})</h4>
              <DataTable
                columns={tocColumns}
                data={tocResults}
                keyField="id"
                emptyText="Không có mục lục khớp"
                emptyHint={`Gõ không dấu vẫn tìm được, ví dụ "bai 1" khớp "Bài 1".`}
              />
            </div>
          );
        })()}

        {/* Kết quả ghi chú — ghim, bài học, dạy học, CTGDPT, so sánh */}
        {(groupFilter === "all" || groupFilter === "notes") && noteResults.length > 0 && !searching && (() => {
          const highlightNote = (text) => {
            const q = query.trim();
            if (!q || !text) return <span className="cell-clamp">{escapeHtml(text)}</span>;
            const parts = q.split(/\s+/).filter(Boolean);
            let html = escapeHtml(text);
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            parts.forEach(p => {
              try {
                const re = new RegExp(`(${esc(escapeHtml(p))})`, 'gi');
                html = html.replace(re, '<mark>$1</mark>');
              } catch (e) { console.warn("[SearchView] highlight note failed", e); }
            });
            return <span className="cell-clamp" dangerouslySetInnerHTML={{ __html: html }} />;
          };
          const noteColumns = [
            { key: "sach", label: "Sách", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
            { key: "trang", label: "Trang", sortable: true, width: "90px", align: "right" },
            { key: "loai", label: "Loại ghi chú", sortable: true, width: "150px", align: "center", render: (v) => <span className="tag-pill text-0-72">{v}</span> },
            { key: "doanKhop", label: "Nội dung ghi chú", sortable: false, render: (v) => highlightNote(v) },
            { key: "thaoTac", label: "Thao tác", width: "120px", align: "center", render: (_, row) => <button className="btn btn-primary btn-xs" aria-label={`Mở ${row.sach} trang ${row.trang}`} onClick={() => onOpenBook(row._book, row._page)}><StickyNote size={12} /> Mở ghi chú</button> },
          ];
          return (
            <div className="mt-md">
              <h4 className="panel-title" style={{ marginBottom: 8 }}><StickyNote size={14} /> Ghi chú khớp ({noteResults.length})</h4>
              <DataTable
                columns={noteColumns}
                data={noteResults}
                keyField="id"
                emptyText="Không có ghi chú khớp"
                emptyHint={`Gõ không dấu vẫn tìm được, ví dụ "muc tieu" khớp "mục tiêu".`}
              />
            </div>
          );
        })()}

        {!results.length && !tocResults.length && !noteResults.length && !searching && query.trim().length >= 2 && (
          <div className="dash-empty p-2-5-1">
            <FileSearch size={40} />
            <p>
              Không tìm thấy kết quả trong mục lục, ghi chú hay toàn văn. Hãy thử từ khóa khác hoặc chắc chắn các sách cần tìm đã được
              dựng chỉ mục (cột bên trái).
            </p>
          </div>
        )}

        {(groupFilter === "all" || groupFilter === "content") && results.length > 0 && (() => {
          const flat = [];
          results.forEach(r => {
            r.hits.slice(0, 20).forEach(h => {
              flat.push({
                id: `${r.book.filename}_${h.page}`,
                sach: r.book.title,
                trang: Math.max(1, h.page - 1),
                doanKhop: h.snippet,
                loai: h.kind || "text",
                _book: r.book,
                _page: h.page,
                _kind: h.kind,
              });
            });
          });
          // For multiple hits display: if a book has >1 hit, we still show each row but include total count in emptyHint
          const highlight = (text) => {
            const q = query.trim();
            if (!q || !text) return <span className="cell-clamp">{escapeHtml(text)}</span>;
            const parts = q.split(/\s+/).filter(Boolean);
            let html = escapeHtml(text);
            // escape regex
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            parts.forEach(p => {
              try {
                const re = new RegExp(`(${esc(escapeHtml(p))})`, 'gi');
                html = html.replace(re, '<mark>$1</mark>');
              } catch (e) { console.warn("[SearchView] highlight replace failed", e); }
            });
            return <span className="cell-clamp" dangerouslySetInnerHTML={{ __html: html }} />;
          };
          const columns = [
            { key: "sach", label: "Sách", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
            { key: "trang", label: "Trang", sortable: true, width: "90px", align: "right" },
            { key: "doanKhop", label: "Đoạn khớp", sortable: false, render: (v) => highlight(v) },
            { key: "loai", label: "Loại", sortable: true, width: "90px", align: "center", hideOnMobile: true, render: (v) => <span className="tag-pill text-0-72 text-uppercase">{v === "ocr" ? "OCR" : v === "image" ? "Ảnh" : "Text"}</span> },
            { key: "thaoTac", label: "Thao tác", width: "120px", align: "center", render: (_, row) => <button className="btn btn-secondary btn-xs" aria-label={`Mở ${row.sach} trang ${row.trang}`} onClick={() => onOpenBook(row._book, row._page)}><BookOpen size={12} /> Mở trang</button> },
          ];
          return (
            <div className="mt-md">
              <DataTable
                columns={columns}
                data={flat}
                keyField="id"
                emptyText="Không có kết quả"
                emptyHint={`Tìm thấy ${flat.length} đoạn khớp trong ${results.length} sách.`}
              />
              {results.some(r => r.totalHits > 20) && <p className="panel-hint mt-0-4">Mỗi sách chỉ hiện 20 kết quả đầu — tinh chỉnh từ khóa để lọc chính xác hơn. Một số sách có nhiều đoạn khớp trên cùng trang đã gộp.</p>}
            </div>
          );
        })()}

        {!query.trim() && !results.length && !tocResults.length && !noteResults.length && (
          recentSearches.length > 0 ? (
            <div className="search-recent-panel">
              <div className="search-recent-header">
                <h4 className="panel-title" style={{ margin: 0 }}><Clock size={14} /> Tìm kiếm gần đây</h4>
                <button className="btn btn-ghost btn-xs" onClick={handleClearRecent} title="Xóa tất cả">
                  <Trash2 size={12} /> Xóa tất cả
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recentSearches.map((term) => (
                  <span key={term} className="recent-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--background)", border: "1px solid var(--border-color)", borderRadius: 999, fontSize: "0.8125rem", fontWeight: 700 }}>
                    <button onClick={() => handleSelectRecent(term)} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: 0, color: "var(--text-dark)", font: "inherit" }}>
                      <Clock size={12} /> {term}
                    </button>
                    <button onClick={() => handleRemoveRecent(term)} aria-label={`Xóa ${term}`} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", color: "var(--text-muted)", padding: 2 }}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <p className="panel-hint" style={{ marginTop: 12 }}>Bấm vào từ khóa để tìm lại ngay. Lịch sử lưu trên trình duyệt này.</p>
            </div>
          ) : (
            <div className="dash-empty p-3-1">
              <Search size={44} />
              <p>
                Nhập ít nhất 2 ký tự để tìm trong mục lục, ghi chú và toàn văn của toàn bộ thư viện sách.
              </p>
              <p className="panel-hint">Mẹo: gõ &quot;bai 1&quot;, &quot;on tap&quot;, &quot;muc tieu&quot; đều tìm được mục lục / ghi chú tương ứng và chuyển thẳng tới trang.</p>
              <p className="panel-hint" style={{ fontSize: "0.6875rem", marginTop: 4 }}>Lịch sử tìm kiếm sẽ hiện ở đây sau khi bạn tìm kiếm</p>
            </div>
          )
        )}
      </section>

      <section className="search-index-manager">
        <div className="search-index-manager-header">
          <div>
            <div className="search-index-section-title">
              <span className="search-index-heading-icon"><Wrench size={17} /></span>
              <h2>Chỉ mục toàn văn</h2>
              <span className="search-index-count">{indexedCount} / {books.length} sách</span>
            </div>
            <p>Dựng chỉ mục một lần để tìm trong nội dung sách. Dữ liệu được lưu trên thiết bị, không cần internet.</p>
          </div>
          <div className="search-index-manager-summary">
            <span><CheckCircle2 size={14} /> {indexedCount} đã sẵn sàng</span>
            <span><CircleDashed size={14} /> {Math.max(0, books.length - indexedCount)} chưa lập chỉ mục</span>
          </div>
        </div>

        <div className="search-index-toolbar">
          <label className="search-index-book-search">
            <Search size={16} />
            <input
              type="search"
              value={indexQuery}
              onChange={(event) => setIndexQuery(event.target.value)}
              placeholder="Lọc theo tên sách..."
              aria-label="Lọc sách trong danh sách chỉ mục"
            />
            {indexQuery && (
              <button type="button" onClick={() => setIndexQuery("")} aria-label="Xóa từ khóa lọc">
                <X size={15} />
              </button>
            )}
          </label>
          <div className="search-index-filters" role="tablist" aria-label="Lọc trạng thái chỉ mục">
            {[["all", `Tất cả · ${books.length}`], ["pending", `Chưa lập chỉ mục · ${books.length - indexedCount}`], ["indexed", `Đã lập chỉ mục · ${indexedCount}`]].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={indexFilter === value}
                className={indexFilter === value ? "active" : ""}
                onClick={() => setIndexFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredIndexBooks.length ? (
          <div className="search-index-book-grid">
            {filteredIndexBooks.map((book) => {
              const meta = statuses[book.filename];
              const coverage = indexCoverage(meta);
              const isRunning = building?.file === book.filename;
              const progress = isRunning
                ? Math.round((building.done / Math.max(1, building.total)) * 100)
                : coverage;
              return (
                <article key={book.filename} className={`search-index-book-card ${meta ? "is-indexed" : ""}`}>
                  <div className="search-index-book-top">
                    <span className="search-index-book-icon"><BookOpen size={16} /></span>
                    <span className={`search-index-status ${meta ? "ready" : "pending"}`}>
                      {meta ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
                      {meta ? "Đã lập chỉ mục" : "Chưa lập chỉ mục"}
                    </span>
                  </div>
                  <h3 title={book.title}>{book.title}</h3>
                  <p className="search-index-book-detail">
                    {meta
                      ? `${coverage}% nội dung · ${meta.textPages + meta.ocrPages}/${meta.total} trang có chữ${meta.imagePages ? ` · ${meta.imagePages} trang ảnh` : ""}`
                      : "Lập chỉ mục để tìm kiếm toàn văn trong sách"}
                  </p>
                  {(meta || isRunning) && (
                    <div className="search-index-progress" aria-label={isRunning ? `Đang lập chỉ mục ${progress}%` : `Độ phủ ${coverage}%`}>
                      <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                    </div>
                  )}
                  <div className="search-index-book-actions">
                    {isRunning ? (
                      <span className="search-index-running">
                        <Loader2 size={14} className="spin" /> Đang xử lý {building.done}/{building.total}
                      </span>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => runBuild(book)}
                          disabled={busyFiles[book.filename]}
                        >
                          <Wrench size={13} /> {meta ? "Dựng lại" : "Dựng chỉ mục"}
                        </button>
                        {meta && (
                          <button
                            className="btn btn-secondary btn-xs search-index-delete"
                            title="Xóa chỉ mục"
                            aria-label={`Xóa chỉ mục ${book.title}`}
                            onClick={async () => {
                              if (!confirm(`Xóa chỉ mục "${book.title}"?`)) return;
                              try {
                                await deleteIndex(book.filename);
                                refresh();
                              } catch (err) {
                                console.error("Delete index failed:", err);
                                setNotice(`Không thể xóa chỉ mục "${book.title}".`);
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="search-index-empty">
            <FileSearch size={28} />
            <strong>{books.length ? "Không tìm thấy sách phù hợp" : "Thư viện chưa có sách"}</strong>
            <span>{books.length ? "Thử đổi từ khóa hoặc trạng thái lọc." : "Thêm sách vào thư viện để bắt đầu lập chỉ mục."}</span>
          </div>
        )}
        <p className="search-index-footnote"><FileSearch size={13} /> Trang dạng ảnh chưa OCR sẽ được bỏ qua; hãy OCR trong trình đọc rồi dựng lại chỉ mục để tìm nội dung.</p>
      </section>
    </div>
  );
}