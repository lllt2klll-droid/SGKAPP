import { useMemo, useState } from "react";
import { BookOpen, Check, RotateCcw, Search, Star, Trash2, X } from "lucide-react";
import BookCover from "../reader/BookCover.jsx";
import SampleButton from "./SampleButton.jsx";
import { bookProgress, READ_STATUS } from "../reader/readingProgress.js";
import { safeSetJSON } from "../safeStorage.js";

export default function StatsView({
  books,
  counts,
  lastPageMap,
  lastTotalMap,
  favs,
  quizHistory,
  onReset,
  onOpenBook,
  onSampleQuiz,
  vocabCount = 0,
  onNavigate,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterFav, setFilterFav] = useState(false);
  const [filterProgress, setFilterProgress] = useState("all");
  const [rowSort, setRowSort] = useState("count"); // count | pct | title | quizAvg

  const totalBooks = books.length;
  const totalOpened = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
  const totalPagesRead = books.reduce(
    (a, b) => a + bookProgress(b.filename, lastPageMap, lastTotalMap).page,
    0,
  );
  const totalFavs = favs.length;

  // Tính toán thống kê luyện tập theo từng cuốn sách
  const quizStatsByBook = quizHistory.reduce((acc, r) => {
    if (!acc[r.file]) {
      acc[r.file] = { count: 0, totalScore: 0, totalQuestions: 0 };
    }
    acc[r.file].count += 1;
    acc[r.file].totalScore += r.score || 0;
    acc[r.file].totalQuestions += r.total || 0;
    return acc;
  }, {});

  // Dữ liệu bảng thống kê tổng hợp (sách + luyện tập) • theo chuẩn readingProgress.js
  const allRows = books
    .map((b) => {
      const { page: lp, total, pct } = bookProgress(b.filename, lastPageMap, lastTotalMap);
      const c = counts[b.filename] || 0;
      const isFav = favs.includes(b.filename);

      // Thống kê luyện tập cho cuốn sách này
      const quizStats = quizStatsByBook[b.filename] || {
        count: 0,
        totalScore: 0,
        totalQuestions: 0,
      };
      const quizAvg =
        quizStats.totalQuestions > 0
          ? Math.round((quizStats.totalScore / quizStats.totalQuestions) * 100)
          : 0;

      return {
        book: b,
        count: c,
        lastPage: lp,
        totalPages: total,
        pct,
        status: pct >= 100 ? READ_STATUS.DONE : pct > 0 ? READ_STATUS.READING : READ_STATUS.UNREAD,
        isFav,
        quizCount: quizStats.count,
        quizAvg: quizAvg,
        totalCorrect: quizStats.totalScore,
      };
    })
    .sort((a, b) => b.count - a.count || b.lastPage - a.lastPage);

  // Lọc dữ liệu theo các tiêu chí
  const filteredRows = allRows.filter((row) => {
    // Tìm kiếm theo tên sách, môn học
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      row.book.subject.toLowerCase().includes(searchLower) ||
      row.book.title.toLowerCase().includes(searchLower) ||
      `${row.book.grade}. ${row.book.subject}`
        .toLowerCase()
        .includes(searchLower);

    // Lọc theo môn học
    const matchesSubject =
      filterSubject === "all" || row.book.subject === filterSubject;

    // Lọc theo lớp
    const matchesGrade =
      filterGrade === "all" || row.book.grade === filterGrade;

    // Lọc theo yêu thích
    const matchesFav = !filterFav || row.isFav;

    // Lọc theo tiến để (chuẩn readingProgress.js)
    let matchesProgress = true;
    if (filterProgress === "notStarted") matchesProgress = row.status === READ_STATUS.UNREAD;
    else if (filterProgress === "inProgress") matchesProgress = row.status === READ_STATUS.READING;
    else if (filterProgress === "completed") matchesProgress = row.status === READ_STATUS.DONE;

    return (
      matchesSearch &&
      matchesSubject &&
      matchesGrade &&
      matchesFav &&
      matchesProgress
    );
  });

  // Lấy danh sách môn học và lớp để lọc
  const subjects = [...new Set(books.map((b) => b.subject))].sort();
  const grades = [...new Set(books.map((b) => b.grade))].sort((a, b) => a - b);

  // tổng hợp luyện tập toàn kho + Sắp xếp hàng theo chặn lựa
  const quizTotals = useMemo(() => quizHistory.reduce(
    (s, r) => ({ n: s.n + 1, score: s.score + (r.score || 0), total: s.total + (r.total || 0) }),
    { n: 0, score: 0, total: 0 },
  ), [quizHistory]);
  const quizAvgAll = quizTotals.total > 0 ? Math.round((quizTotals.score / quizTotals.total) * 100) : 0;
  const statusCounts = useMemo(() => {
    const c = { notStarted: 0, reading: 0, completed: 0 };
    allRows.forEach((r) => {
      if (r.status === READ_STATUS.DONE) c.completed += 1;
      else if (r.status === READ_STATUS.READING) c.reading += 1;
      else c.notStarted += 1;
    });
    return c;
  }, [allRows]);
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    if (rowSort === "pct") arr.sort((a, b) => b.pct - a.pct);
    else if (rowSort === "title") arr.sort((a, b) => String(a.book.title || "").localeCompare(String(b.book.title || ""), "vi"));
    else if (rowSort === "quizAvg") arr.sort((a, b) => b.quizAvg - a.quizAvg);
    else arr.sort((a, b) => b.count - a.count || b.lastPage - a.lastPage);
    return arr;
  }, [filteredRows, rowSort]);
  return (
    <div className="stx-root">
      <style>{`
        .stx-root { display:flex; flex-direction:column; gap:13px; }
        .stx-head { background:linear-gradient(135deg, rgba(45,115,255,0.09), rgba(139,92,246,0.07)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:11px; }
        .stx-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .stx-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .stx-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #2d73ff)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #2d73ff) 35%, transparent); }
        .stx-actions { display:flex; gap:8px; margin-left:auto; flex-wrap:wrap; align-items:center; }
        .stx-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(128px, 1fr)); gap:9px; }
        .stx-kpi { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); }
        .stx-kpi-ic { width:37px; height:37px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; font-size: 1.0625rem; flex-shrink:0; background:var(--color-action-soft, var(--primary-light)); }
        .stx-kpi-val { font-size:1.12rem; font-weight:800; color:var(--text-dark); line-height:1.1; }
        .stx-kpi-label { font-size: 0.6563rem; color:var(--text-muted); font-weight:600; }
        .stx-toolbar { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 13px; display:flex; flex-direction:column; gap:9px; }
        .stx-trow { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .stx-search { flex:1 1 200px; min-width:170px; position:relative; }
        .stx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size: 0.8125rem; background:#fff; }
        .stx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .stx-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; display:inline-flex; }
        .stx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size: 0.7813rem; background:#fff; color:#334155; }
        .stx-check { display:inline-flex; align-items:center; gap:6px; font-size: 0.7813rem; font-weight:700; color:#475569; cursor:pointer; border:1px solid #e2e8f0; border-radius:999px; padding:6px 12px; background:#fff; }
        .stx-check.on { background:var(--color-action-soft, #eff6ff); border-color:var(--color-action, #2d73ff); color:var(--color-action-strong, #1d4ed8); }
        .stx-count { font-size: 0.75rem; color:var(--text-muted); }
        .stx-count strong { color:var(--text-dark); }
        .stx-charts { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; }
        .stx-card { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:13px 14px; }
        .stx-card h4 { margin:0 0 10px; font-size:0.9rem; color:var(--text-dark); display:flex; align-items:center; gap:7px; }
        .stx-bar-row { display:grid; grid-template-columns:110px 1fr 34px; gap:9px; align-items:center; font-size: 0.75rem; margin-bottom:7px; }
        .stx-track { height:9px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; }
        .stx-fill { height:100%; border-radius:99px; min-width:3px; }
        .stx-bar-val { font-weight:800; color:var(--text-dark); text-align:right; }
        .stx-segbar { display:flex; height:12px; border-radius:99px; overflow:hidden; border:1px solid var(--border-color); margin:10px 0 4px; }
        .stx-segbar i { display:block; height:100%; }
        .stx-legend { display:flex; gap:12px; flex-wrap:wrap; font-size: 0.7188rem; color:var(--text-muted); }
        .stx-legend b { color:var(--text-dark); }
        .stx-dot { display:inline-block; width:9px; height:9px; border-radius:99px; margin-right:5px; }
        .stx-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:10px; }
        .stx-book { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 12px; cursor:pointer; transition:border-color 0.14s ease, box-shadow 0.14s ease; }
        .stx-book:hover { border-color:var(--color-action, var(--primary)); box-shadow:0 8px 20px rgba(15,23,42,0.09); }
        .stx-book-top { display:flex; gap:9px; align-items:flex-start; }
        .stx-book-cover { width:44px; flex-shrink:0; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); }
        .stx-book-cover .book-cover { overflow:hidden; }
        .stx-book-cover .book-cover div { font-size:0; }
        .stx-book-t { margin:0; font-size:0.85rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .stx-book-m { font-size: 0.6875rem; color:var(--text-muted); }
        .stx-pbar { height:8px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; margin-top:8px; }
        .stx-pbar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, var(--primary)); }
        .stx-book-stats { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .stx-chip { font-size: 0.6563rem; font-weight:800; padding:2px 8px; border-radius:999px; background:#f8fafc; border:1px solid #e2e8f0; color:#475569; display:inline-flex; align-items:center; gap:4px; }
        .stx-chip.good { background:#f0fdf4; border-color:#bbf7d0; color:#15803d; }
        .stx-chip.warn { background:#fffbeb; border-color:#fde68a; color:#b45309; }
        .stx-chip.act { background:var(--color-action-soft, #eff6ff); border-color:var(--color-action-soft, #dbeafe); color:var(--color-action-strong, #1d4ed8); }
        .stx-book-foot { display:flex; gap:6px; margin-top:9px; align-items:center; }
        .stx-open { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size: 0.75rem; font-weight:800; padding:7px 10px; border-radius:9px; border:none; background:var(--color-action, var(--primary)); color:#fff; cursor:pointer; }
        .stx-icobtn { width:31px; height:31px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; }
        .stx-icobtn:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .stx-empty { text-align:center; padding:34px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
      `}</style>

      {/* Header + KPI */}
      <div className="stx-head">
        <div className="stx-title-row">
          <h3 className="stx-title"><span className="stx-title-ic">📊</span> Thống kê tổng quan</h3>
          <div className="stx-actions">
            <SampleButton label="Tự động làm" size="xs" onRun={onSampleQuiz}
              hint="Thêm 2 kết quả luyện tập trắc nghiệm mẫu để xem thống kê hoạt động." />
            <button className="btn btn-secondary btn-xs" onClick={onReset}><Trash2 size={13} /> Đặt lại</button>
          </div>
        </div>
        <div className="stx-kpis">
          <div className="stx-kpi"><span className="stx-kpi-ic">📚</span><span><span className="stx-kpi-val">{totalBooks}</span><br /><span className="stx-kpi-label">Sách</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">📖</span><span><span className="stx-kpi-val">{totalOpened}</span><br /><span className="stx-kpi-label">Lượt mở</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">📄</span><span><span className="stx-kpi-val">{totalPagesRead}</span><br /><span className="stx-kpi-label">Trang đã đọc</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">❤️</span><span><span className="stx-kpi-val">{totalFavs}</span><br /><span className="stx-kpi-label">Yêu thích</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">📝</span><span><span className="stx-kpi-val">{quizTotals.n}</span><br /><span className="stx-kpi-label">Bài luyện tập</span></span></div>
          <div className="stx-kpi"><span className="stx-kpi-ic">⭐</span><span><span className="stx-kpi-val">{quizAvgAll}%</span><br /><span className="stx-kpi-label">Điểm TB</span></span></div>
          <button
            type="button"
            className="stx-kpi"
            onClick={() => onNavigate && onNavigate("vocab")}
            title="Mở Sổ tay từ vựng"
            style={{ cursor: onNavigate ? "pointer" : "default", textAlign: "left" }}
          >
            <span className="stx-kpi-ic">📓</span><span><span className="stx-kpi-val">{vocabCount}</span><br /><span className="stx-kpi-label">Từ vựng →</span></span>
          </button>
        </div>
      </div>

          {/* Bộ lọc và tìm kiếm */}
      <div className="stx-toolbar">
        <div className="stx-trow">
          <div className="stx-search">
            <Search size={15} />
            <input type="text" placeholder="Tìm tên sách, môn…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Tìm sách" />
            {searchQuery && <button className="stx-search-clear" onClick={() => setSearchQuery("")} aria-label="Xóa tìm kiếm"><X size={13} /></button>}
          </div>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} aria-label="Lọc môn">
            <option value="all">Mọi môn</option>
            {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
          <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} aria-label="Lọc lớp">
            <option value="all">Mọi lớp</option>
            {grades.map((grade) => <option key={grade} value={grade}>Lớp {grade}</option>)}
          </select>
          <select value={filterProgress} onChange={(e) => setFilterProgress(e.target.value)} aria-label="Lọc tiến để">
            <option value="all">Mọi tiến độ</option>
            <option value="notStarted">Chưa bắt đầu</option>
            <option value="inProgress">Đang đọc</option>
            <option value="completed">Đã hoàn thành</option>
          </select>
          <select value={rowSort} onChange={(e) => setRowSort(e.target.value)} aria-label="Sắp xếp" title="Sắp xếp">
            <option value="count">Lượt mở ?</option>
            <option value="pct">Tiến để ?</option>
            <option value="quizAvg">Điểm TB ?</option>
            <option value="title">Tên A→Z</option>
          </select>
          <button className={`stx-check${filterFav ? " on" : ""}`} onClick={() => setFilterFav((v) => !v)} aria-pressed={filterFav}>
            {filterFav ? <Check size={13} /> : <Star size={13} />} Yêu thích
          </button>
        </div>
        <div className="stx-count">Hiển thị <strong>{filteredRows.length}/{allRows.length}</strong> sách</div>
      </div>

          {/* Biểu đồ thống kê */}
      <div className="stx-charts">
        <div className="stx-card">
          <h4>📊 Lượt mở theo môn học</h4>
          {subjects.slice(0, 6).map((subject) => {
            const totalReads = allRows
              .filter((row) => row.book.subject === subject)
              .reduce((sum, row) => sum + row.count, 0);
            const maxReads = Math.max(
              1,
              ...subjects.map((s) =>
                allRows
                  .filter((row) => row.book.subject === s)
                  .reduce((sum, row) => sum + row.count, 0),
              ),
            );
            return (
              <div key={subject} className="stx-bar-row">
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{subject}</span>
                <span className="stx-track"><span className="stx-fill" style={{ width: `${(totalReads / maxReads) * 100}%`, background: "var(--color-action, var(--primary))" }} /></span>
                <span className="stx-bar-val">{totalReads}</span>
              </div>
            );
          })}
        </div>

        <div className="stx-card">
          <h4>📈 Tiến độ đọc (đồng bộ toàn app)</h4>
          <div className="stx-legend">
            <span><i className="stx-dot" style={{ background: "#cbd5e1" }} />Chưa bắt đầu <b>{statusCounts.notStarted}</b></span>
            <span><i className="stx-dot" style={{ background: "var(--color-action, var(--primary))" }} />Đang đọc <b>{statusCounts.reading}</b></span>
            <span><i className="stx-dot" style={{ background: "#16a34a" }} />hoàn thành <b>{statusCounts.completed}</b></span>
          </div>
          {allRows.length > 0 && (
            <div className="stx-segbar" role="img" aria-label={`Chưa bắt đầu ${statusCounts.notStarted}, đang đọc ${statusCounts.reading}, hoàn thành ${statusCounts.completed}`}>
              <i style={{ width: `${(statusCounts.notStarted / allRows.length) * 100}%`, background: "#cbd5e1" }} />
              <i style={{ width: `${(statusCounts.reading / allRows.length) * 100}%`, background: "var(--color-action, var(--primary))" }} />
              <i style={{ width: `${(statusCounts.completed / allRows.length) * 100}%`, background: "#16a34a" }} />
            </div>
          )}
          <div style={{ fontSize: "0.7188rem", color: "var(--text-muted)" }}>
            {totalPagesRead} trang đã đọc • {totalOpened} Lượt mở sách
          </div>
        </div>
      </div>

      {/* Thứ tự từng sách */}
      {sortedRows.length === 0 ? (
        <div className="stx-empty">
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>Không tìm thấy sách phù hợp</p>
          <p style={{ margin: 0, fontSize: "0.75rem" }}>Hãy thay đổi bộ lọc hoặc tìm kiếm.</p>
        </div>
      ) : (
        <div className="stx-grid">
          {sortedRows.map((row) => (
            <article key={row.book.filename} className="stx-book" role="button" tabIndex={0}
              onClick={() => onOpenBook(row.book)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenBook(row.book); } }}
              title={`Mở sách ${row.book.title}`} aria-label={`Mở sách ${row.book.title}`}>
              <div className="stx-book-top">
                <span className="stx-book-cover">
                  <BookCover book={row.book} lastPage={lastPageMap[row.book.filename] || 0} numPages={lastTotalMap[row.book.filename] || 0} height={62} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="stx-book-t" title={row.book.title}>
                    {row.isFav && <Star size={12} style={{ color: "#f59e0b", verticalAlign: -1 }} fill="#f59e0b" />} {row.book.title}
                  </span><br />
                  <span className="stx-book-m">Lớp {row.book.grade} • {row.book.subject} • Tập {row.book.term}</span>
                </span>
              </div>
              <div className="stx-pbar" aria-label={`Tiến độ ${row.pct}%`}>
                <i style={{ width: `${row.pct}%`, background: row.pct >= 100 ? "#16a34a" : "var(--color-action, var(--primary))" }} />
              </div>
              <div className="stx-book-stats">
                <span className="stx-chip act">📖 {row.pct}% • Tr.{row.lastPage}/{row.totalPages}</span>
                <span className="stx-chip">📚 {row.count} Lượt mở</span>
                {row.quizCount > 0
                  ? <span className={`stx-chip ${row.quizAvg >= 60 ? "good" : "warn"}`}>📝 {row.quizCount} bài • TB {row.quizAvg}%</span>
                  : <span className="stx-chip">Chưa luyện tập</span>}
              </div>
              <div className="stx-book-foot">
                <button className="stx-open" onClick={(e) => { e.stopPropagation(); onOpenBook(row.book); }}><BookOpen size={13} /> Mở sách</button>
                <button className="stx-icobtn" onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Đặt lại thống kê cho "${row.book.title}"?`)) {
                      const newCounts = { ...counts };
                      newCounts[row.book.filename] = 0;
                      try {
                        const res = safeSetJSON("sgk_counts", newCounts);
                        if (!res.ok && res.quota) { alert("Không thể lưu dữ liệu vì bộ nhớ trình duyệt đã đầy"); console.warn("Quota sgk_counts"); }
                        else if (!res.ok) { console.warn("[App] safeSetJSON failed sgk_counts:", res.error); }
                      } catch (e) { console.warn("[App] safeSetJSON exception sgk_counts:", e); }
                      window.location.reload();
                    }
                  }} title="Đặt lại thống kê cuốn này" aria-label="Đặt lại thống kê"><RotateCcw size={13} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// HelpView moved to src/HelpView.jsx • interactive, module-by-module guide
