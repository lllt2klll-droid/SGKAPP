import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Clock, LayoutGrid, List, Search, Sparkles, Trash2, X } from "lucide-react";
import BookCover from "../reader/BookCover.jsx";
import DataTable from "./DataTable.jsx";
import { bookProgress, READ_STATUS } from "../reader/readingProgress.js";
import { safeGetString, safeSetString } from "../safeStorage.js";
import { formatDateTime } from "../data/userdata.js";

const CONTINUE_VIEW_KEY = "sgk_continue_view";

// Thời gian tương đối tiếng Việt cho "Tiếp tục đọc"
function relTime(ts) {
  const t = Number(ts) || 0;
  if (!t) return "";
  const diff = Date.now() - t;
  if (diff < 60000) return "Vừa xong";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Hôm qua";
  if (day < 8) return `${day} ngày trước`;
  return new Date(t).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function ContinueView({
  books,
  history,
  lastPageMap,
  lastTotalMap,
  onOpenBook,
  onClear,
  onRemoveEntry,
}) {
  // Fix 6 • tìm + lọc lịch sử đọc (trước đây toolbar chỉ đếm + Xóa)
  const [cq, setCq] = useState("");
  const [cGrade, setCGrade] = useState(null);
  const [cSubject, setCSubject] = useState(null);
  // Tinh tế (mới): chế độ xem Thẻ/Bảng, lọc trạng thái đọc, sắp xếp — ghi nhớ lựa chọn
  const [cView, setCView] = useState(() => {
    try { return safeGetString(CONTINUE_VIEW_KEY, null) === "table" ? "table" : "cards"; }
    catch { return "cards"; }
  });
  const [cStatus, setCStatus] = useState("all"); // all | reading | done | unread
  const [cSort, setCSort] = useState("recent"); // recent | progress | title

  useEffect(() => {
    try { safeSetString(CONTINUE_VIEW_KEY, cView); }
    catch (e) { console.warn("[ContinueView] lưu chế độ xem thất bại", e); }
  }, [cView]);

  const byFilename = useMemo(
    () => new Map(books.map((b) => [b.filename, b])),
    [books],
  );
  const entries = useMemo(
    () => history
      .map((h) => ({ at: h.at, book: byFilename.get(h.filename) }))
      .filter((e) => e.book)
      .sort((a, b) => b.at - a.at),
    [history, byFilename],
  );
  const cGrades = useMemo(
    () => [...new Set(entries.map((e) => e.book.grade))].sort((a, b) => a - b),
    [entries],
  );
  const cSubjects = useMemo(
    () => [...new Set(entries.map((e) => e.book.subject).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "vi")),
    [entries],
  );

  if (!entries.length) {
    return (
      <div className="dash-empty">
        <Clock size={46} />
        <p>
          Thầy/cô chưa mở cuốn sách nào. Hãy chọn một cuốn trong Thư viện để bắt
          đầu!
        </p>
      </div>
    );
  }

  // Tiến độ lấy từ helper chuẩn (readingProgress.js) → đồng bộ Thư viện/Bảng điều khiển
  const rows = entries.map(({ book, at }) => {
    const { last, total, page, pct, status } = bookProgress(book.filename, lastPageMap, lastTotalMap);
    return {
      filename: book.filename,
      book,
      at,
      title: book.title,
      grade: book.grade,
      subject: book.subject,
      term: book.term,
      last,
      page,
      total,
      pct,
      status,
    };
  });

  const cQuery = cq.trim().toLowerCase();
  const hasContinueFilter = cQuery !== "" || cGrade !== null || cSubject !== null || cStatus !== "all";
  const filteredTableData = rows.filter((r) => {
    if (cGrade !== null && r.grade !== cGrade) return false;
    if (cSubject !== null && r.subject !== cSubject) return false;
    if (cStatus !== "all" && r.status !== cStatus) return false;
    if (cQuery && !(String(r.title || "").toLowerCase().includes(cQuery) || String(r.subject || "").toLowerCase().includes(cQuery))) return false;
    return true;
  });

  const sorters = {
    recent: (a, b) => b.at - a.at,
    progress: (a, b) => b.pct - a.pct || b.at - a.at,
    title: (a, b) => String(a.title).localeCompare(String(b.title), "vi"),
  };
  const sorted = [...filteredTableData].sort(sorters[cSort] || sorters.recent);
  const hero = sorted[0] || null;
  const rest = sorted.slice(1);

  const clearContinueFilter = () => { setCq(""); setCGrade(null); setCSubject(null); setCStatus("all"); };

  // Mở đúng trang đang đọc (lastPage = trang PDF) để "đọc tiếp" liền mạch
  const resumeLabel = (r) => (r.page > 0 ? (r.status === READ_STATUS.DONE ? "Đọc lại" : "Đọc tiếp") : "Bắt đầu đọc");
  const openResume = (r) => onOpenBook(r.book, r.last > 0 ? r.last : null);
  const statusChips = [
    ["all", "Tất cả"],
    ["reading", "Đang đọc"],
    ["done", "Đã xong"],
    ["unread", "Chưa mở"],
  ];

  return (
    <div className="ctv-root">
      <style>{`
        .ctv-root { display:flex; flex-direction:column; gap:12px; }
        .ctv-hero { display:flex; gap:16px; align-items:center; flex-wrap:wrap; border-radius:16px; padding:16px 18px; color:#fff; position:relative; overflow:hidden;
          background:linear-gradient(120deg, var(--color-action-strong, #1e3a8a), var(--color-action, #2563eb) 58%, var(--color-action-active, #1e40af)); box-shadow:0 10px 26px rgba(15,23,42,0.16); }
        .ctv-hero::after { content:""; position:absolute; right:-40px; top:-70px; width:230px; height:230px; border-radius:50%; background:rgba(255,255,255,0.10); pointer-events:none; }
        .ctv-hero-cover { width:104px; flex-shrink:0; border-radius:10px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.28); border:1px solid rgba(255,255,255,0.4); z-index:1; }
        .ctv-hero-cover .book-cover { width:100% !important; padding:0 !important; border:none !important; }
        .ctv-hero-main { flex:1 1 240px; min-width:200px; z-index:1; }
        .ctv-hero-eyebrow { display:inline-flex; align-items:center; gap:5px; font-size: 0.6875rem; font-weight:800; letter-spacing:0.03em; text-transform:uppercase; opacity:0.94; }
        .ctv-hero-title { margin:5px 0 2px; font-size:1.15rem; font-weight:800; color:#fff; line-height:1.3; }
        .ctv-hero-meta { margin:0; font-size: 0.75rem; opacity:0.9; }
        .ctv-hero-bar { height:7px; border-radius:99px; background:rgba(255,255,255,0.28); overflow:hidden; margin:10px 0 5px; max-width:440px; }
        .ctv-hero-bar > i { display:block; height:100%; border-radius:99px; background:#fff; }
        .ctv-hero-progress { font-size: 0.7188rem; font-weight:700; opacity:0.95; }
        .ctv-hero-actions { display:flex; flex-direction:column; gap:7px; align-items:stretch; z-index:1; }
        .ctv-resume { display:inline-flex; align-items:center; justify-content:center; gap:7px; font-size: 0.8125rem; font-weight:800; padding:11px 16px; border-radius:11px; border:none; cursor:pointer; background:#fff; color:var(--color-action-strong, #1e3a8a); box-shadow:0 4px 12px rgba(0,0,0,0.18); transition:transform 0.12s ease; }
        .ctv-resume:hover { transform:translateY(-1px); }
        .ctv-hero-remove { display:inline-flex; align-items:center; justify-content:center; gap:5px; font-size: 0.7188rem; font-weight:700; padding:7px 10px; border-radius:9px; border:1px solid rgba(255,255,255,0.5); background:rgba(255,255,255,0.12); color:#fff; cursor:pointer; }
        .ctv-hero-remove:hover { background:rgba(255,255,255,0.22); }
        .ctv-search { position:relative; display:inline-flex; align-items:center; }
        .ctv-search input { padding:7px 26px 7px 30px; border-radius:9px; border:1px solid var(--border-color, #e2e8f0); font-size: 0.7813rem; background:var(--surface, #fff); color:var(--text-dark, #334155); outline:none; min-width:180px; }
        .ctv-search input:focus { border-color:var(--color-action, #2563eb); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-action, #2563eb) 16%, transparent); }
        .ctv-search-ic { position:absolute; left:9px; color:var(--text-muted, #94a3b8); pointer-events:none; }
        .ctv-search-x { position:absolute; right:5px; border:none; background:transparent; cursor:pointer; color:var(--text-muted, #94a3b8); display:inline-flex; padding:2px; }
        .ctv-sel { padding:7px 9px; border-radius:9px; border:1px solid var(--border-color, #e2e8f0); font-size: 0.7813rem; background:var(--surface, #fff); color:var(--text-dark, #334155); max-width:170px; }
        .ctv-chips { display:inline-flex; gap:5px; flex-wrap:wrap; }
        .ctv-chip { font-size: 0.7188rem; font-weight:700; padding:5px 10px; border-radius:999px; border:1px solid var(--border-color, #e2e8f0); background:var(--surface, #fff); color:var(--text-muted, #475569); cursor:pointer; }
        .ctv-chip:hover { border-color:var(--color-action, #2563eb); color:var(--color-action-strong, #2563eb); }
        .ctv-chip.on { background:var(--color-action, #2563eb); border-color:var(--color-action, #2563eb); color:#fff; }
        .ctv-seg { display:inline-flex; border:1px solid var(--border-color, #e2e8f0); border-radius:9px; overflow:hidden; }
        .ctv-seg button { border:none; background:var(--surface, #fff); padding:7px 10px; cursor:pointer; color:var(--text-muted, #64748b); display:inline-flex; align-items:center; }
        .ctv-seg button.on { background:var(--color-action, #2563eb); color:#fff; }
        .ctv-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:12px; }
        .ctv-card { background:var(--surface, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; transition:transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease; }
        .ctv-card:hover { transform:translateY(-3px); box-shadow:0 12px 26px rgba(15,23,42,0.12); border-color:var(--color-action, #2563eb); }
        .ctv-card-cover { position:relative; border:none; padding:0; cursor:pointer; background:linear-gradient(135deg, var(--color-action-soft, #dbeafe), #ede9fe); display:flex; align-items:center; justify-content:center; }
        .ctv-card-cover .book-cover { width:100% !important; height:100% !important; min-height:100%; padding:0 !important; border:none !important; }
        .ctv-card-body { padding:10px 12px 11px; display:flex; flex-direction:column; gap:6px; flex:1; }
        .ctv-card-title { margin:0; font-size:0.85rem; font-weight:800; color:var(--text-dark, #0f172a); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.35em; }
        .ctv-card-meta { font-size: 0.6875rem; color:var(--text-muted, #64748b); }
        .ctv-bar { height:6px; border-radius:99px; background:var(--surface-soft, #f1f5f9); border:1px solid var(--border-color, #e2e8f0); overflow:hidden; }
        .ctv-bar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, #2563eb); }
        .ctv-card-progress { display:flex; justify-content:space-between; gap:6px; font-size: 0.6563rem; color:var(--text-muted, #64748b); }
        .ctv-card-foot { display:flex; gap:6px; align-items:center; margin-top:auto; padding-top:7px; border-top:1px dashed var(--border-color, #e2e8f0); }
        .ctv-card-resume { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size: 0.7813rem; font-weight:800; padding:8px 10px; border-radius:10px; border:none; background:var(--color-action, #2563eb); color:#fff; cursor:pointer; }
        .ctv-card-resume:hover { filter:brightness(1.08); }
        .ctv-icobtn { width:32px; height:32px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid var(--border-color, #e2e8f0); background:var(--surface, #fff); color:var(--text-muted, #64748b); cursor:pointer; }
        .ctv-icobtn:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .ctv-single-hint { font-size: 0.7813rem; color:var(--text-muted, #64748b); text-align:center; padding:14px; }
        @media (max-width: 640px) {
          .ctv-hero { padding:13px; gap:12px; }
          .ctv-hero-cover { width:84px; }
          .ctv-hero-actions { flex-direction:row; width:100%; }
          .ctv-resume { flex:1; }
          .ctv-grid { grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); }
        }
      `}</style>

      {/* Hero — cuốn gần đây nhất, đọc tiếp ngay */}
      {hero && (
        <section className="ctv-hero" aria-label={`Đọc tiếp ${hero.title}`}>
          <span className="ctv-hero-cover">
            <BookCover book={hero.book} lastPage={hero.last} numPages={hero.total} height={150} />
          </span>
          <div className="ctv-hero-main">
            <span className="ctv-hero-eyebrow"><Sparkles size={12} /> {hero.at ? relTime(hero.at) : "Đọc tiếp"}</span>
            <h2 className="ctv-hero-title" title={hero.title}>{hero.title}</h2>
            <p className="ctv-hero-meta">Lớp {hero.grade} • {hero.subject} • Tập {hero.term}</p>
            <div className="ctv-hero-bar" role="progressbar" aria-valuenow={hero.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${hero.pct}%` }} /></div>
            <span className="ctv-hero-progress">
              {hero.page > 0 && hero.total > 0 ? `Trang ${hero.page}/${hero.total} • ${hero.pct}%` : "Chưa bắt đầu đọc"}
            </span>
          </div>
          <div className="ctv-hero-actions">
            <button className="ctv-resume" onClick={() => openResume(hero)}>
              <BookOpenCheck size={15} /> {resumeLabel(hero)}{hero.page > 0 ? ` · Tr.${hero.page}` : ""}
            </button>
            {onRemoveEntry && (
              <button className="ctv-hero-remove" onClick={() => onRemoveEntry(hero.filename)} title="Bỏ khỏi lịch sử đọc">
                <X size={13} /> Bỏ khỏi lịch sử
              </button>
            )}
          </div>
        </section>
      )}

      <div className="data-table-toolbar">
        <div className="data-table-toolbar-left">
          <span className="ctv-search">
            <Search size={14} aria-hidden="true" className="ctv-search-ic" />
            <input
              type="text"
              value={cq}
              onChange={(e) => setCq(e.target.value)}
              placeholder="Tìm trong lịch sử đọc..."
              aria-label="Tìm trong lịch sử đọc"
            />
            {cq && (
              <button onClick={() => setCq("")} aria-label="Xóa tìm kiếm" title="Xóa tìm kiếm" className="ctv-search-x">
                <X size={13} />
              </button>
            )}
          </span>
          <select
            value={cGrade === null ? "" : cGrade}
            onChange={(e) => setCGrade(e.target.value === "" ? null : Number(e.target.value))}
            aria-label="Lọc theo lớp"
            className="ctv-sel"
          >
            <option value="">Tất cả lớp</option>
            {cGrades.map((g) => (
              <option key={g} value={g}>Lớp {g}</option>
            ))}
          </select>
          <select
            value={cSubject === null ? "" : cSubject}
            onChange={(e) => setCSubject(e.target.value === "" ? null : e.target.value)}
            aria-label="Lọc theo môn"
            className="ctv-sel"
          >
            <option value="">Tất cả môn</option>
            {cSubjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="ctv-chips" role="group" aria-label="Lọc trạng thái đọc">
            {statusChips.map(([val, label]) => (
              <button key={val} type="button" className={`ctv-chip${cStatus === val ? " on" : ""}`} onClick={() => setCStatus(val)}>{label}</button>
            ))}
          </div>
          <span className="ui-s-a80a05" aria-live="polite">
            {hasContinueFilter ? `${filteredTableData.length}/${entries.length} cuốn` : `${entries.length} cuốn đã mở gần đây`}
          </span>
          {hasContinueFilter && (
            <button className="btn btn-ghost btn-xs" onClick={clearContinueFilter}>
              <X size={12} /> Xóa lọc
            </button>
          )}
        </div>
        <div className="data-table-toolbar-right">
          <select value={cSort} onChange={(e) => setCSort(e.target.value)} aria-label="Sắp xếp" className="ctv-sel">
            <option value="recent">Gần đây nhất</option>
            <option value="progress">Tiến độ</option>
            <option value="title">Tiêu đề</option>
          </select>
          <div className="ctv-seg" role="group" aria-label="Chế độ xem">
            <button type="button" className={cView === "cards" ? "on" : ""} onClick={() => setCView("cards")} title="Xem dạng thẻ" aria-label="Xem dạng thẻ"><LayoutGrid size={14} /></button>
            <button type="button" className={cView === "table" ? "on" : ""} onClick={() => setCView("table")} title="Xem dạng bảng" aria-label="Xem dạng bảng"><List size={14} /></button>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={onClear}>
            <Trash2 size={13} /> Xóa lịch sử
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="data-table-empty">
          <div className="data-table-empty-icon"><Search size={22} /></div>
          <p>Không tìm thấy sách phù hợp</p>
          <span className="ctv-single-hint">Thử nới lỏng từ khóa hoặc bộ lọc.</span>
        </div>
      ) : rest.length === 0 ? (
        <p className="ctv-single-hint">Đây là cuốn gần đây nhất. Mở thêm sách để thấy danh sách.</p>
      ) : cView === "cards" ? (
        <div className="ctv-grid">
          {rest.map((r) => (
            <article key={r.filename} className="ctv-card">
              <div
                className="ctv-card-cover"
                role="button"
                tabIndex={0}
                onClick={() => openResume(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openResume(r); } }}
                aria-label={`Đọc tiếp ${r.title}`}
              >
                <BookCover book={r.book} lastPage={r.last} numPages={r.total} height={150} />
              </div>
              <div className="ctv-card-body">
                <h3 className="ctv-card-title" title={r.title}>{r.title}</h3>
                <div className="ctv-card-meta">{r.subject} • Tập {r.term}</div>
                <div className="ctv-bar"><i style={{ width: `${r.pct}%` }} /></div>
                <div className="ctv-card-progress">
                  <span>{r.page > 0 && r.total > 0 ? `Tr.${r.page}/${r.total} • ${r.pct}%` : "Chưa đọc"}</span>
                  <span>{r.at ? relTime(r.at) : ""}</span>
                </div>
                <div className="ctv-card-foot">
                  <button className="ctv-card-resume" onClick={() => openResume(r)}><BookOpenCheck size={13} /> {resumeLabel(r)}</button>
                  {onRemoveEntry && (
                    <button className="ctv-icobtn" onClick={() => onRemoveEntry(r.filename)} title="Bỏ khỏi lịch sử đọc" aria-label={`Bỏ "${r.title}" khỏi lịch sử đọc`}><X size={13} /></button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: "title",
              label: "Sách",
              sortable: true,
              render: (v, row) => (
                <div className="ui-s-c932cc">
                  <div
                    style={{
                      width: 52,
                      flexShrink: 0,
                      borderRadius: 6,
                      overflow: "hidden",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <BookCover
                      book={row.book}
                      lastPage={row.last}
                      numPages={row.total}
                      height={56}
                    />
                  </div>
                  <div>
                    <div className="ui-s-0dbc82 cell-clamp" title={row.title}>
                      {row.title}
                    </div>
                    <div className="ui-s-300269">
                      Lớp {row.grade} • {row.subject} • Tập {row.term}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "page",
              label: "Trang hiện tải",
              width: "120px",
              align: "right",
              sortable: true,
              render: (v, row) => (row.page > 0 ? `${row.page}` : "—"),
            },
            {
              key: "total",
              label: "Tổng trang",
              width: "110px",
              align: "right",
              hideOnMobile: true,
              render: (v) => v || "?",
            },
            {
              key: "pct",
              label: "Tiến để",
              width: "140px",
              render: (_, row) =>
                row.page > 0 && row.total > 0 ? (
                  <div>
                    <div className="progress-mini">
                      <div
                        className="progress-mini-fill"
                        style={{ width: row.pct + "%" }}
                      ></div>
                    </div>
                    <div className="ui-s-eb441c">{row.pct}%</div>
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
            {
              key: "at",
              label: "Lần đọc gần nhất",
              width: "160px",
              sortable: true,
              hideOnMobile: true,
              render: (v) => formatDateTime(v),
            },
            {
              key: "_actions",
              label: "Thao tác",
              width: "175px",
              align: "right",
              render: (_, row) => (
                <span className="data-table-actions">
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() => openResume(row)}
                  >
                    <BookOpenCheck size={12} /> {resumeLabel(row)}
                  </button>
                  {onRemoveEntry && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => onRemoveEntry(row.filename)}
                      aria-label={`Bỏ "${row.title}" khỏi lịch sử đọc`}
                      title="Bỏ khỏi lịch sử đọc"
                    >
                      <X size={13} />
                    </button>
                  )}
                </span>
              ),
            },
          ]}
          data={rest}
          keyField="filename"
          emptyText={hasContinueFilter ? "Không tìm thấy sách phù hợp" : "Chưa có lịch sử"}
          emptyHint={hasContinueFilter ? "Thử nới lỏng từ khóa hoặc bộ lọc." : ""}
          onRowClick={(row) => openResume(row)}
        />
      )}
    </div>
  );
}
