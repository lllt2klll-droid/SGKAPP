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
  Bookmark,
  StickyNote,
  NotebookPen,
  Clock,
  X,
} from "lucide-react";
import { getApiBase } from "./apiConfig";
import { pdfjsLib } from "./pdfjs-config";
import {
  getIndexMeta,
  buildIndex,
  deleteIndex,
  searchAll,
} from "./searchIndex";
import { indexCoverage } from "./textutils";
import { findTocBook } from "./tocData.js";
import SampleButton from "./SampleButton";
import { SAMPLE_SEARCH_QUERY } from "./sampleData";
import DataTable from "./DataTable";
import { safeGetJSON } from "./safeStorage";
import { getSearchConfig } from "./settingsStore.js";
import { searchNotes, getNoteKindLabel } from "./noteSearch.js";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from "./searchRecent.js";

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
  const matchText = (haystack, needle) => {
    let q = String(needle || ""), hay = String(haystack || "");
    if (!q) return false;
    if (!searchCfg.caseSensitive) { q = q.toLowerCase(); hay = hay.toLowerCase(); }
    if (searchCfg.fuzzyMatch) {
      const norm = (s) => String(s).replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      q = norm(q); hay = norm(hay);
    }
    if (!q) return false;
    if (searchCfg.wholeWord) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try { return new RegExp(`(^|\\W)${esc}(\\W|$)`, searchCfg.caseSensitive ? "" : "i").test(hay); }
      catch { return hay.split(/\s+/).includes(q); }
    }
    return hay.includes(q);
  };
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
    <div className="view-row">
      {/* Left: library index status */}
      <div className="view-col view-col-320">
        <div className="panel-box">
          <h3 className="panel-title">
            <Wrench size={16} /> Chỉ mục toàn văn
          </h3>
          <p className="panel-hint">
            Dựng chỉ mục cho từng sách một lần (đọc lớp chữ của PDF, dùng lại
            chữ đã OCR). Trang dạng ảnh chưa OCR sẽ bỏ qua — giáo viên hãy OCR trong sách
            rồi dựng lại để tìm kiếm nội dung phục vụ nghiên cứu và soạn giáo án.
          </p>
          <div className="idx-list view-scroll">
            {books.map((b) => {
              const meta = statuses[b.filename];
              const cov = indexCoverage(meta);
              const isRunning = building?.file === b.filename;
              return (
                <div key={b.filename} className="idx-row">
                  <div className="idx-info">
                    <span className="idx-name">{b.title}</span>
                    <span className="idx-sub">
                      {!meta && (
                        <>
                          <CircleDashed size={11} /> Chưa dựng chỉ mục
                        </>
                      )}
                      {meta && (
                        <>
                          <CheckCircle2 size={11} /> {cov}% chữ (
                          {meta.textPages + meta.ocrPages}/{meta.total} trang
                          {meta.imagePages ? `, ${meta.imagePages} ảnh` : ""})
                        </>
                      )}
                    </span>
                    {isRunning && (
                      <div className="idx-bar">
                        <div
                          className="idx-bar-fill"
                          style={{
                            width: `${Math.round((building.done / Math.max(1, building.total)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="idx-actions">
                    {isRunning ? (
                      <span className="idx-running">
                        <Loader2 size={13} className="spin" /> {building.done}/
                        {building.total}
                      </span>
                    ) : (
                      <>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => runBuild(b)}
                          disabled={busyFiles[b.filename]}
                        >
                          {meta ? "Dựng lại" : "Dựng chỉ mục"}
                        </button>
                        {meta && (
                          <button
                            className="btn btn-secondary btn-xs danger"
                            title="Xóa chỉ mục"
                            onClick={async () => {
                              if (!confirm(`Xóa chỉ mục "${b.title}"?`)) {
                                return;
                              }
                              try {
                                await deleteIndex(b.filename);
                                refresh();
                              } catch (err) {
                                console.error('Delete index failed:', err);
                                setNotice(`Không thể xóa chỉ mục "${b.title}".`);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="panel-hint mt-0-7">
            <FileSearch size={12} className="align-neg-2" /> Chỉ mục
            là bản lưu cục bộ trong trình duyệt (không cần internet).
          </p>
        </div>
      </div>

      {/* Right: search */}
      <div className="view-col view-col-rest">
        <div className="fsearch">
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
              className="btn btn-secondary btn-xs"
              onClick={() => setQuery("")}
            >
              Xóa
            </button>
          )}
          <SampleButton
            label="Truy vấn mẫu"
            onRun={() => setQuery(SAMPLE_SEARCH_QUERY)}
            hint="Tự điền từ khóa mẫu để xem kết quả tìm kiếm toàn văn (chỉ cần các sách đã dựng chỉ mục)."
          />
        </div>
        <p className="panel-hint">
          Tìm không dấu, ví dụ gõ "so sanh" vẫn ra "so sánh", "phep cong"… Kết quả mục lục & ghi chú hiện ngay, kết quả toàn văn cần dựng chỉ mục trước.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "2px 0 4px" }} role="tablist" aria-label="Nhóm kết quả">
          {[["all", "Tất cả"], ["content", "Toàn văn"], ["toc", "Mục lục"], ["notes", "Ghi chú"]].map(([v, t]) => (
            <button key={v} role="tab" aria-selected={groupFilter === v} onClick={() => setGroupFilter(v)}
              className={`btn btn-xs ${groupFilter === v ? "btn-primary" : "btn-secondary"}`}>{t}</button>
          ))}
          <span className="panel-hint" style={{ margin: 0 }}>· Nhóm mặc định & giới hạn lấy từ Cài đặt → Tìm kiếm</span>
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
            <div className="panel-box" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h4 className="panel-title" style={{ margin: 0 }}><Clock size={14} /> Tìm kiếm gần đây</h4>
                <button className="btn btn-ghost btn-xs" onClick={handleClearRecent} title="Xóa tất cả">
                  <Trash2 size={12} /> Xóa tất cả
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recentSearches.map((term) => (
                  <span key={term} className="recent-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--background)", border: "1px solid var(--border-color)", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
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
              <p className="panel-hint" style={{ fontSize: 11, marginTop: 4 }}>Lịch sử tìm kiếm sẽ hiện ở đây sau khi bạn tìm kiếm</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}