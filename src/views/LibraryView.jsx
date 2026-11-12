import React, { useMemo } from "react";
import { ArrowUpDown, BookOpen, BookOpenCheck, BookmarkCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight, Clock, Edit3, LayoutGrid, List, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import BookCover from "../reader/BookCover.jsx";
import BookCard from "./BookCard.jsx";
import LibraryStyles from "./LibraryStyles.jsx";
import LibraryStats from "./LibraryStats.jsx";
import { bookProgress } from "../reader/readingProgress.js";
import { hasFilesInDataTransfer } from "../components/fileDropzoneUtils.js";
import { safeGetString, safeSetString } from "../safeStorage.js";
import { getSubjectCatalog, sortSubjects } from "../data/subjectCatalog.js";
import { getRecentBooks, normalizeSubjectQuery, SORT_OPTIONS, SUBJECTS } from "./libraryConfig.js";

export default function LibraryView({
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
  onFilesSelect,
  onUploadSubmit,
  onLinkLocal,
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
  const historyBooks = getRecentBooks(history, booksAll);

  const [continueCollapsed, setContinueCollapsed] = React.useState(() => {
    const v = safeGetString("sgk_continue_collapsed", null);
    return v === "true";
  });
  const [showSubjectPicker, setShowSubjectPicker] = React.useState(false);
  const [subjectQuery, setSubjectQuery] = React.useState("");
  // Fix 4 • cách lưu file .docx: radio thay vì 2 nút dễ nhầm ("Nhập Word" vs "Lưu gốc")
  const [docxMode, setDocxMode] = React.useState("import"); // import | keep
  const isDocxDraft = String(uploadDraft?.name || "").toLowerCase().endsWith(".docx");
  const isPdfDraft = String(uploadDraft?.name || "").toLowerCase().endsWith(".pdf");
  const canLinkLocal = isPdfDraft && Boolean(uploadDraft?.sourcePath);
  React.useEffect(() => { setDocxMode("import"); }, [uploadDraft]);
  // Fix 5 • menu "..." gom nút hàng trên mobile (desktop vẫn hiện đủ nút)
  const [openRowMenu, setOpenRowMenu] = React.useState(null); // filename đang mở menu
  React.useEffect(() => {
    if (!openRowMenu) return;
    const onDown = (e) => {
      if (!e.target.closest?.(".libx-rowmenu-anchor")) setOpenRowMenu(null);
    };
    // Esc đóng menu dù focus đang ở nút "..." (ngoài menu), không chỉ khi focus trong menu
    const onKey = (e) => { if (e.key === "Escape") setOpenRowMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openRowMenu]);
  // Phân trang thư viện: tránh render hết 70+ BookCard cùng lúc gây lag
  const LIB_PAGE_SIZE = 24;
  const [libPage, setLibPage] = React.useState(1);

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

  // Tìm nhanh trong panel chọn môn (không dấu: gõ "toan" ra "Toán")
  const filteredSubjectCatalog = React.useMemo(() => {
    const q = normalizeSubjectQuery(subjectQuery.trim());
    if (!q) return subjectCatalog;
    return subjectCatalog.filter((s) => normalizeSubjectQuery(s).includes(q));
  }, [subjectCatalog, subjectQuery]);

  const favCount = favs ? favs.length : 0;

  // Reset về trang 1 khi filter/search/sort đổi; kẹp trang khi danh sách rút ngắn
  const totalLibPages = Math.max(1, Math.ceil((books?.length || 0) / LIB_PAGE_SIZE));
  React.useEffect(() => {
    setLibPage(1);
  }, [searchQuery, gradeFilter, subjectFilter, termFilter, readingStatusFilter, favOnly, sortBy]);
  React.useEffect(() => {
    if (libPage > totalLibPages) setLibPage(totalLibPages);
  }, [totalLibPages, libPage]);
  // Fix 5 • đổi trang/danh sách thì đóng menu "..." (tránh menu mồ côi)
  React.useEffect(() => { setOpenRowMenu(null); }, [libPage, books]);
  const pagedBooks = React.useMemo(() => {
    const start = (libPage - 1) * LIB_PAGE_SIZE;
    return (books || []).slice(start, start + LIB_PAGE_SIZE);
  }, [books, libPage]);
  const libPageFrom = (books?.length || 0) === 0 ? 0 : (libPage - 1) * LIB_PAGE_SIZE + 1;
  const libPageTo = Math.min(books?.length || 0, libPage * LIB_PAGE_SIZE);

  // Drag counter chống nhấp nháy khi kéo qua các thẻ con
  const dragCounterRef = React.useRef(0);

  // Kéo-thả nhiều file: >1 file mở luồng hàng loạt, 1 file giữ luồng xem trước.
  const handleDropFiles = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    if (files.length > 1 && onFilesSelect) onFilesSelect(files);
    else onFileSelect?.(files[0]);
  };

  return (
    <div
      className={`library-command-center libx-root ${isDragActive ? "drag-over" : ""}`}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!hasFilesInDataTransfer(e)) return; dragCounterRef.current += 1; if (!isDragActive) setDragActive(true); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} if (!isDragActive && hasFilesInDataTransfer(e)) setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = Math.max(0, dragCounterRef.current - 1); if (dragCounterRef.current === 0) setDragActive(false); }}
      onDrop={handleDropFiles}
    >
      <LibraryStyles />
      {isDragActive && (
        <div className="global-drag-overlay" aria-hidden="true"><span>Thả file để thêm một hoặc nhiều sách</span></div>
      )}
      {/* Backend error is already shown in header; only show empty-specific notices here */}

      <header className="libx-intro">
        <span className="libx-intro-mark" aria-hidden="true"><BookOpenCheck size={22} /></span>
        <div className="libx-intro-copy">
          <span className="libx-intro-eyebrow">KHÔNG GIAN HỌC TẬP</span>
          <h1>Hành trình đọc của bạn</h1>
          <p>Sách giáo khoa, bài đọc gần đây và từ vựng đã lưu — tất cả ở một nơi.</p>
        </div>
      </header>

      <LibraryStats books={books} booksAll={booksAll} history={history} totalBookmarks={totalBookmarks} vocabCount={vocabCount} />

      {/* Tiếp tục học strip • có thể thu hồi, không xóa logic (giữ historyBooks) */}
      {historyBooks.length > 0 && (
        <section className="libx-continue-section" aria-label="Tiếp tục học">
          <div className="libx-sec-head">
            <h2 className="libx-sec-title"><Clock size={15} /> Tiếp tục học</h2>
            <span className="libx-sec-hint">{historyBooks.length} cuốn gần đây</span>
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
              {continueCollapsed ? <><ChevronDown size={14} /> Mở</> : <><ChevronUp size={14} /> Thu gọn</>}
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
        <span className="libx-hero-icon" aria-hidden="true"><Sparkles size={19} /></span>
        <div className="libx-hero-copy">
          <span className="libx-hero-eyebrow">HỌC TẬP TƯƠNG TÁC</span>
          <h2>Đọc sách theo cách của bạn</h2>
          <p>Mở sách để đọc hai trang, trò chuyện cùng AI, làm bài tập và ghi chú trực tiếp.</p>
        </div>
        {geminiKey
          ? <button className="libx-hero-action" onClick={() => document.getElementById("libx-book-catalog")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Chọn sách <ChevronRight size={15} /></button>
          : <button className="libx-hero-action" onClick={onOpenSettings}>Cấu hình AI <ChevronRight size={15} /></button>}
      </div>

      {/* Toolbar */}
      <div className="libx-toolbar" id="libx-book-catalog">
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
                onClick={() => { if (!showSubjectPicker) setSubjectQuery(""); setShowSubjectPicker((v) => !v); }}
                aria-expanded={showSubjectPicker}
                aria-haspopup="dialog"
              >
                <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subjectFilter ?? "Tất cả"}
                </span>
                <ChevronDown size={13} style={{ transform: showSubjectPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
              </button>
              {showSubjectPicker && (
                <div className="lib-subject-panel" role="dialog" aria-modal="false" aria-label="Chọn môn học">
                  <div className="lib-subject-panel-head">
                    <span>Chọn môn học • {subjectQuery.trim() === "" ? subjectCatalog.length + 1 : filteredSubjectCatalog.length + (normVi("Tất cả").includes(normVi(subjectQuery.trim())) ? 1 : 0)} kết quả</span>
                    <button className="lib-subject-close" onClick={() => setShowSubjectPicker(false)} aria-label="Đóng">
                      <X size={12} />
                    </button>
                  </div>
                  <div style={{ position: "relative", marginBottom: 8 }}>
                    <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
                    <input
                      type="text"
                      value={subjectQuery}
                      onChange={(e) => setSubjectQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && subjectQuery.trim() !== "") {
                          if (filteredSubjectCatalog.length > 0) {
                            setSubjectFilter(filteredSubjectCatalog[0]);
                            setShowSubjectPicker(false);
                          } else if (normVi("Tất cả").includes(normVi(subjectQuery.trim()))) {
                            setSubjectFilter(null);
                            setShowSubjectPicker(false);
                          }
                        } else if (e.key === "Escape") {
                          setShowSubjectPicker(false);
                        }
                      }}
                      placeholder="Gõ để lọc nhanh (vd: toan)..."
                      aria-label="Lọc môn học"
                      autoFocus
                      style={{ width: "100%", padding: "7px 28px 7px 30px", borderRadius: 9, border: "1px solid #e2e8f0", fontSize: "0.7813rem", background: "#fff", color: "#334155", outline: "none" }}
                    />
                    {subjectQuery && (
                      <button
                        onClick={() => setSubjectQuery("")}
                        aria-label="Xóa lọc môn"
                        title="Xóa lọc môn"
                        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "inline-flex", padding: 2 }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="lib-subject-grid">
                    {(subjectQuery.trim() === "" || normVi("Tất cả").includes(normVi(subjectQuery.trim()))) && (
                      <button
                        className={`libx-fbtn ${subjectFilter === null ? "active" : ""}`}
                        onClick={() => {
                          setSubjectFilter(null);
                          setShowSubjectPicker(false);
                        }}
                      >
                        Tất cả
                      </button>
                    )}
                    {filteredSubjectCatalog.map((s) => (
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
                  {filteredSubjectCatalog.length === 0 && !normVi("Tất cả").includes(normVi(subjectQuery.trim())) && (
                    <div style={{ padding: "10px 4px 2px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Không tìm thấy môn phù hợp “{subjectQuery.trim()}”. <button className="btn btn-ghost btn-xs" onClick={() => setSubjectQuery("")}>Xóa lọc</button>
                    </div>
                  )}
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
              <span className="filter-label hide-mobile">Tiến độ:</span>
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
          onDrop={handleDropFiles}
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
            {String(uploadDraft.name || "").toLowerCase().endsWith(".doc") && !String(uploadDraft.name || "").toLowerCase().endsWith(".docx") && (
              <div className="upload-preview-meta" style={{ marginTop: 4, color: "var(--warning, #b45309)", fontWeight: 600 }}>
                File .doc (Word cũ): hãy mở bằng Word và Lưu thành .docx rồi mới nhập để giữ nguyên định dạng.
              </div>
            )}
            {canLinkLocal && (
              <div className="upload-preview-meta" style={{ marginTop: 6, wordBreak: "break-all" }} title={uploadDraft.sourcePath}>
                📎 <strong>File gốc:</strong> {uploadDraft.sourcePath}
              </div>
            )}
            {canLinkLocal && (
              <div className="upload-preview-meta" style={{ marginTop: 4, color: "var(--warning, #b45309)" }}>
                Liên kết không sao chép file. Nếu file gốc bị di chuyển, đổi tên hoặc xóa, sách sẽ không mở được.
              </div>
            )}
          </div>
          <div className="upload-preview-actions">
            {isDocxDraft ? (
              <div className="docx-choice">
                <div role="radiogroup" aria-label="Cách lưu file Word" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label className={`docx-opt ${docxMode === "import" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="docx-mode"
                      checked={docxMode === "import"}
                      onChange={() => setDocxMode("import")}
                      disabled={uploadingBook}
                    />
                    <span>
                      <strong>📥 Nhập thành Sách Word <em className="docx-rec">khuyên dùng</em></strong>
                      <small>Giữ nguyên định dạng — đọc dạng sách, sửa như Word, xuất lại .docx.</small>
                    </span>
                  </label>
                  <label className={`docx-opt ${docxMode === "keep" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="docx-mode"
                      checked={docxMode === "keep"}
                      onChange={() => setDocxMode("keep")}
                      disabled={uploadingBook}
                    />
                    <span>
                      <strong>Lưu file gốc</strong>
                      <small>Chỉ đọc/tải xuống, không chuyển dạng sách.</small>
                    </span>
                  </label>
                </div>
                <div className="docx-confirm-row">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={docxMode === "import" ? onImportDocx : onUploadSubmit}
                    disabled={uploadingBook}
                  >
                    {uploadingBook
                      ? (docxMode === "import" ? "Đang nhập..." : "Đang lưu...")
                      : (docxMode === "import" ? "📥 Nhập thành Sách Word" : "Lưu file gốc")}
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
            ) : (
              <>
                {canLinkLocal && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={onLinkLocal}
                    disabled={uploadingBook}
                    title="Không sao chép file — đọc trực tiếp từ vị trí hiện tại trên máy"
                  >
                    {uploadingBook ? "Đang liên kết..." : "📎 Chỉ liên kết file gốc"}
                  </button>
                )}
                <button
                  className={canLinkLocal ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
                  onClick={onUploadSubmit}
                  disabled={uploadingBook}
                >
                  {uploadingBook ? "Đang lưu..." : (canLinkLocal ? "Sao chép vào thư viện" : "Lưu vào thư viện")}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={onClearUpload}
                  disabled={false}
                  title={uploadingBook ? "Hủy và bỏ qua kết quả đang lưu" : "Hủy"}
                >
                  Hủy
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!uploadDraft && (
        <div
          className={"upload-dropzone " + (isDragActive ? "active" : "")}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!hasFilesInDataTransfer(e)) return; dragCounterRef.current += 1; setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = Math.max(0, dragCounterRef.current - 1); if (dragCounterRef.current === 0) setDragActive(false); }}
          onDrop={handleDropFiles}
          onClick={onAddBook}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAddBook();
            }
          }}
          aria-label="Kéo một hoặc nhiều file vào đây hoặc nhấn để chọn sách"
        >
          <div className="upload-dropzone-icon" aria-hidden="true">
            <Upload size={18} />
          </div>
          <div className="upload-dropzone-title">Kéo &amp; thả một hoặc nhiều file vào đây</div>
          <div className="upload-dropzone-subtitle">
            hoặc nhấn để chọn nhiều sách cùng lúc • hỗ trợ PDF, DOCX, EPUB, ảnh
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
              {pagedBooks.map((book) => (
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
              {pagedBooks.map((row) => {
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
                      {row.isLinkedBook && (
                        <a
                          className="libx-drive-link"
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={row.sourceUrl}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >Mở link sách ↗</a>
                      )}
                      {row.isExternalBook && (
                        <span
                          className="libx-cont-m"
                          style={{ marginLeft: 8, color: row.missing ? "var(--danger, #dc2626)" : "var(--text-secondary)" }}
                          title={row.externalPath || ""}
                        >
                          {row.missing ? "⚠ File gốc không còn" : "📎 File gốc trên máy"}
                        </span>
                      )}
                      {page > 0 && total > 0
                        ? <span className="libx-bar" style={{ maxWidth: 220 }}><i style={{ width: pct + "%" }} /></span>
                        : <span className="libx-cont-m">Chưa đọc</span>}
                    </span>
                    <button className="libx-icobtn libx-hide-mobile" style={isFav ? { color: "#f59e0b", borderColor: "#fde68a", background: "#fffbeb" } : undefined}
                      onClick={(e) => { e.stopPropagation(); onToggleFav(row.filename); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
                      aria-label={isFav ? "Bộ yêu thích" : "Thêm yêu thích"} title={isFav ? "Bộ yêu thích" : "Thêm yêu thích"}>
                      <Star size={14} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    {[".txt", ".md"].includes(_ext) && (
                      <button className="libx-icobtn libx-hide-mobile" onClick={(e) => { e.stopPropagation(); onEditTextBook?.(row); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }} aria-label="Sửa nội dung" title="Sửa nội dung (chỉ .txt/.md)"><Edit3 size={14} /></button>
                    )}
                    <button className="libx-icobtn libx-hide-mobile" onClick={(e) => { e.stopPropagation(); onRenameBook(row); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }} aria-label="Sửa thông tin sách" title="Sửa thông tin sách"><Pencil size={14} /></button>
                    <button className="libx-icobtn danger libx-hide-mobile" onClick={(e) => { e.stopPropagation(); onDeleteBook(row); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }} aria-label="Xóa" title="Xóa"><Trash2 size={14} /></button>
                    <span className="libx-rowmenu-anchor">
                      <button
                        className="libx-icobtn libx-rowmenu-btn"
                        onClick={(e) => { e.stopPropagation(); setOpenRowMenu((cur) => (cur === row.filename ? null : row.filename)); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
                        aria-label={`Tùy chọn cho sách ${row.title}`}
                        aria-expanded={openRowMenu === row.filename}
                        aria-haspopup="menu"
                        title="Tùy chọn"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {openRowMenu === row.filename && (
                        <div
                          className="libx-rowmenu"
                          role="menu"
                          aria-label={`Tùy chọn cho sách ${row.title}`}
                        >
                          <button
                            className="libx-rowmenu-item"
                            role="menuitem"
                            onClick={(e) => { e.stopPropagation(); onToggleFav(row.filename); setOpenRowMenu(null); }}
                          >
                            <Star size={14} fill={isFav ? "currentColor" : "none"} /> {isFav ? "Bỏ yêu thích" : "Thêm yêu thích"}
                          </button>
                          {[".txt", ".md"].includes(_ext) && (
                            <button
                              className="libx-rowmenu-item"
                              role="menuitem"
                              onClick={(e) => { e.stopPropagation(); onEditTextBook?.(row); setOpenRowMenu(null); }}
                            >
                              <Edit3 size={14} /> Sửa nội dung
                            </button>
                          )}
                          <button
                            className="libx-rowmenu-item"
                            role="menuitem"
                            onClick={(e) => { e.stopPropagation(); onRenameBook(row); setOpenRowMenu(null); }}
                          >
                            <Pencil size={14} /> Sửa thông tin sách
                          </button>
                          <button
                            className="libx-rowmenu-item danger"
                            role="menuitem"
                            onClick={(e) => { e.stopPropagation(); onDeleteBook(row); setOpenRowMenu(null); }}
                          >
                            <Trash2 size={14} /> Xóa
                          </button>
                        </div>
                      )}
                    </span>
                    <button className="libx-open" style={{ flex: "0 0 auto" }} onClick={(e) => { e.stopPropagation(); onOpenBook(row); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}><BookOpen size={13} /> Mở</button>
                  </div>
                );
              })}
            </div>
          )}
          {totalLibPages > 1 && (
            <nav className="libx-pager" aria-label="Phân trang thư viện">
              <button
                className="libx-fbtn"
                disabled={libPage <= 1}
                onClick={() => { setLibPage(1); document.querySelector(".libx-grid, .libx-list")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                aria-label="Về trang đầu"
                title="Trang đầu"
              >
                <ChevronsLeft size={13} />
              </button>
              <button
                className="libx-fbtn"
                disabled={libPage <= 1}
                onClick={() => { setLibPage((p) => Math.max(1, p - 1)); document.querySelector(".libx-grid, .libx-list")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                aria-label="Trang trước"
              >
                <ChevronLeft size={13} /> Trước
              </button>
              <span className="libx-count" aria-live="polite">
                Trang <strong>{libPage}/{totalLibPages}</strong> • {libPageFrom}–{libPageTo}/{(books?.length || 0)} cuốn
              </span>
              <button
                className="libx-fbtn"
                disabled={libPage >= totalLibPages}
                onClick={() => { setLibPage((p) => Math.min(totalLibPages, p + 1)); document.querySelector(".libx-grid, .libx-list")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                aria-label="Trang sau"
              >
                Sau <ChevronRight size={13} />
              </button>
              <button
                className="libx-fbtn"
                disabled={libPage >= totalLibPages}
                onClick={() => { setLibPage(totalLibPages); document.querySelector(".libx-grid, .libx-list")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                aria-label="Tới trang cuối"
                title="Trang cuối"
              >
                <ChevronsRight size={13} />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}



// ------------------------------------------------------------------
// CONTINUE VIEW
