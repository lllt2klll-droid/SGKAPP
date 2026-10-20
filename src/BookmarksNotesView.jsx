// ── Đánh dấu & Ghi chú đã lưu — trung tâm tra cứu chuyên nghiệp ──────
// Tab 1 Tổng quan (thống kê) • Tab 2 Trang đánh dấu • Tab 3 Ghi chú đã lưu.
// Đồng bộ UX với Từ vựng / Bộ sưu tập: tìm kiếm, lọc theo sách, chọn nhiều
// dòng, xóa hàng loạt, xuất CSV/Word/TXT, sửa nhãn inline (không prompt).
import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookOpen,
  Search,
  X,
  Trash2,
  Pencil,
  Check,
  Square,
  ListChecks,
  BarChart3,
  Table2,
  StickyNote,
  FileSpreadsheet,
  FileText,
  Download,
  LayoutGrid,
  Image as ImageIcon,
  ChevronDown,
} from "lucide-react";
import {
  getBookmarkLabel,
  setBookmarkLabel,
  getAllPinNotes,
  deletePinNote,
} from "./userdata";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString } from "./safeStorage";
import { exportCsv, exportWord, exportTxt, escapeHtml, nl2br } from "./exportDoc";

// Khung nhóm sách: nhớ trạng thái thu gọn (mặc định mở)
const BM_COLLAPSE_KEY = "sgk_bm_group_collapsed";
// Nhớ cách sắp xếp các khung sách (mặc định A→Z)
const BM_BOOK_SORT_KEY = "sgk_bm_group_sort";

const BOOK_SORTS = [
  { id: "title", label: "Sách: Tên A→Z" },
  { id: "titleDesc", label: "Sách: Tên Z→A" },
  { id: "countDesc", label: "Sách: Nhiều mục nhất" },
  { id: "countAsc", label: "Sách: Ít mục nhất" },
  { id: "grade", label: "Sách: Theo lớp" },
];

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Sắp xếp danh sách khung sách theo lựa chọn (countOf = số mục trong khung)
function sortBookGroups(groups, key, countOf) {
  const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), "vi");
  const arr = [...groups];
  switch (key) {
    case "titleDesc": arr.sort((a, b) => byTitle(b, a)); break;
    case "countDesc": arr.sort((a, b) => countOf(b) - countOf(a) || byTitle(a, b)); break;
    case "countAsc": arr.sort((a, b) => countOf(a) - countOf(b) || byTitle(a, b)); break;
    case "grade": arr.sort((a, b) => (Number(a.grade) || 999) - (Number(b.grade) || 999)
      || String(a.subject || "").localeCompare(String(b.subject || ""), "vi") || byTitle(a, b)); break;
    default: arr.sort(byTitle);
  }
  return arr;
}

export default function BookmarksNotesView({
  books = [],
  bookmarksMap = {},
  onOpenBook,
  onRemove,
  onClearFile,
  notify,
  onChanged,
}) {
  const [tab, setTab] = useState("marks"); // marks | notes | overview
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState(null);
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [onlyWithImage, setOnlyWithImage] = useState(false);
  const [sortBy, setSortBy] = useState("book"); // book | page | label
  const [groupSort, setGroupSort] = useState(() => {
    try {
      const v = safeGetString(BM_BOOK_SORT_KEY, "title");
      return BOOK_SORTS.some((s) => s.id === v) ? v : "title";
    } catch { return "title"; }
  });
  const changeGroupSort = (v) => {
    setGroupSort(v);
    try { safeSetString(BM_BOOK_SORT_KEY, v); } catch {}
  };
  const [selMarks, setSelMarks] = useState(() => new Set());
  const [selNotes, setSelNotes] = useState(() => new Set());
  const [expanded, setExpanded] = useState({});
  const [labelEditor, setLabelEditor] = useState(null); // { filename, pdfPage, draft }
  const [tick, setTick] = useState(0);
  const [notesTick, setNotesTick] = useState(0);
  // Trạng thái thu gọn từng khung sách (key: "notes::<file>" / "marks::<file>")
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const v = safeGetJSON(BM_COLLAPSE_KEY, {}, (x) => x && typeof x === "object");
      return v && typeof v === "object" ? v : {};
    } catch { return {}; }
  });
  const isGroupCollapsed = (kind, file) => !!collapsedGroups[`${kind}::${file}`];
  const toggleGroup = (kind, file) => {
    setCollapsedGroups((prev) => {
      const k = `${kind}::${file}`;
      const next = { ...prev };
      if (next[k]) delete next[k]; else next[k] = true;
      try { safeSetJSON(BM_COLLAPSE_KEY, next); } catch {}
      return next;
    });
  };

  const say = (text, undo) => {
    if (typeof notify === "function") notify(text, undo);
  };
  const changed = () => {
    if (typeof onChanged === "function") onChanged();
  };

  // Refresh khi BookReader / tab khác đổi dữ liệu (giống CollectionsView)
  useEffect(() => {
    const h = () => {
      try {
        setTick((t) => t + 1);
        setNotesTick((t) => t + 1);
      } catch {}
    };
    window.addEventListener("sgk:data-updated", h);
    return () => window.removeEventListener("sgk:data-updated", h);
  }, []);

  const byFilename = useMemo(() => new Map(books.map((b) => [b.filename, b])), [books]);

  // ── Ghi chú ghim toàn cục (chỉ giữ sách còn trong thư viện) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allNotes = useMemo(() => getAllPinNotes(), [notesTick, tick, books]);
  const notesByPage = useMemo(() => {
    const m = new Map();
    for (const n of allNotes) {
      const k = `${n.file}#${n.pdfPage}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(n);
    }
    return m;
  }, [allNotes]);

  // ── Hàng bookmark: mỗi trang đánh dấu là 1 dòng ──
  const markRows = useMemo(() => {
    const rows = [];
    for (const filename of Object.keys(bookmarksMap || {})) {
      const book = byFilename.get(filename);
      if (!book) continue; // sách đã xóa khỏi thư viện → ẩn
      for (const pdfPage of bookmarksMap[filename] || []) {
        const bookPage = Math.max(1, pdfPage - 1);
        const label = getBookmarkLabel(filename, pdfPage);
        const pageNotes = notesByPage.get(`${filename}#${pdfPage}`) || [];
        rows.push({
          id: `${filename}#${pdfPage}`,
          filename,
          pdfPage,
          bookPage,
          bookTitle: book.title,
          grade: book.grade,
          subject: book.subject,
          label,
          noteCount: pageNotes.length,
          hasImage: pageNotes.some((n) => n.imageCount > 0),
          book,
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarksMap, byFilename, notesByPage, tick]);

  const qNorm = useMemo(() => norm(query.trim()), [query]);

  const filteredMarks = useMemo(() => {
    let list = [...markRows];
    if (fileFilter) list = list.filter((r) => r.filename === fileFilter);
    if (onlyWithNotes) list = list.filter((r) => r.noteCount > 0);
    if (qNorm) {
      list = list.filter((r) =>
        norm(`${r.bookTitle} ${r.label} ${r.subject} trang ${r.bookPage}`).includes(qNorm),
      );
    }
    const byBook = (a, b) =>
      String(a.bookTitle).localeCompare(String(b.bookTitle), "vi") || a.bookPage - b.bookPage;
    if (sortBy === "page") list.sort((a, b) => a.bookPage - b.bookPage || byBook(a, b));
    else if (sortBy === "label") list.sort((a, b) => norm(a.label || "zzz").localeCompare(norm(b.label || "zzz")) || byBook(a, b));
    else list.sort(byBook);
    return list;
  }, [markRows, fileFilter, onlyWithNotes, qNorm, sortBy]);

  const filteredNotes = useMemo(() => {
    let list = allNotes.filter((n) => byFilename.has(n.file));
    if (fileFilter) list = list.filter((n) => n.file === fileFilter);
    if (onlyWithImage) list = list.filter((n) => n.imageCount > 0);
    if (qNorm) {
      list = list.filter((n) => {
        const book = byFilename.get(n.file);
        return norm(`${n.plain} ${book?.title || ""} trang ${n.bookPage}`).includes(qNorm);
      });
    }
    return list;
  }, [allNotes, byFilename, fileFilter, onlyWithImage, qNorm]);

  // Khóa chuỗi duy nhất cho mỗi dòng (chọn nhiều / key React) → _rid (file#pdf#id)
  const noteRows = useMemo(
    () => filteredNotes.map((n) => ({ ...n, _rid: `${n.file}#${n.pdfPage}#${n.id}` })),
    [filteredNotes],
  );

  // ── Gom nhóm theo sách (khung) — Ghi chú đã lưu ──
  const noteGroups = useMemo(() => {
    const map = new Map();
    for (const n of filteredNotes) {
      if (!map.has(n.file)) map.set(n.file, []);
      map.get(n.file).push(n);
    }
    const groups = [...map.entries()].map(([file, notes]) => {
      const b = byFilename.get(file);
      notes.sort((a, c) => a.bookPage - c.bookPage || a.pdfPage - c.pdfPage);
      return {
        file,
        book: b,
        title: b?.title || file,
        grade: b?.grade,
        subject: b?.subject,
        notes,
        imageTotal: notes.reduce((s, x) => s + (x.imageCount || 0), 0),
      };
    });
    return sortBookGroups(groups, groupSort, (g) => g.notes.length);
  }, [filteredNotes, byFilename, groupSort]);

  // ── Gom nhóm theo sách (khung) — Trang đánh dấu ──
  const markGroups = useMemo(() => {
    const map = new Map();
    for (const r of filteredMarks) {
      if (!map.has(r.filename)) map.set(r.filename, []);
      map.get(r.filename).push(r);
    }
    const groups = [...map.entries()].map(([file, rows]) => {
      const b = byFilename.get(file);
      const sortedRows = [...rows].sort((a, c) => {
        if (sortBy === "label") return norm(a.label || "zzz").localeCompare(norm(c.label || "zzz")) || a.bookPage - c.bookPage;
        return a.bookPage - c.bookPage || a.pdfPage - c.pdfPage;
      });
      return {
        file,
        book: b,
        title: b?.title || file,
        grade: b?.grade,
        subject: b?.subject,
        rows: sortedRows,
        noteTotal: sortedRows.reduce((s, r) => s + (r.noteCount || 0), 0),
      };
    });
    return sortBookGroups(groups, groupSort, (g) => g.rows.length);
  }, [filteredMarks, byFilename, sortBy, groupSort]);

  // ── Thống kê tổng quan ──
  const stats = useMemo(() => {
    const files = new Set(markRows.map((r) => r.filename));
    const withNotes = markRows.filter((r) => r.noteCount > 0).length;
    const byFile = [...files].map((f) => {
      const book = byFilename.get(f);
      const marks = markRows.filter((r) => r.filename === f).length;
      const notes = allNotes.filter((n) => n.file === f).length;
      return { file: f, title: book?.title || f, marks, notes, total: marks + notes };
    }).sort((a, b) => b.total - a.total);
    return {
      totalMarks: markRows.length,
      totalFiles: files.size,
      totalNotes: allNotes.filter((n) => byFilename.has(n.file)).length,
      withImage: allNotes.filter((n) => byFilename.has(n.file) && n.imageCount > 0).length,
      withNotes,
      byFile,
    };
  }, [markRows, allNotes, byFilename]);

  // Dọn selection khi dữ liệu đổi
  useEffect(() => {
    setSelMarks((prev) => {
      if (!prev.size) return prev;
      const alive = new Set(markRows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [markRows]);
  useEffect(() => {
    setSelNotes((prev) => {
      if (!prev.size) return prev;
      const alive = new Set(noteRows.map((n) => n._rid));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [noteRows]);

  const toggleMark = (id) => {
    setSelMarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleNote = (id) => {
    setSelNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Thao tác ──
  const saveLabel = () => {
    if (!labelEditor) return;
    const v = String(labelEditor.draft || "").trim().slice(0, 60);
    setBookmarkLabel(labelEditor.filename, labelEditor.pdfPage, v);
    setLabelEditor(null);
    setTick((t) => t + 1);
    changed();
    say(v ? "Đã lưu nhãn gợi nhớ." : "Đã xóa nhãn gợi nhớ.");
  };

  const removeMarkRow = (row) => {
    if (typeof onRemove === "function") onRemove(row.filename, row.pdfPage);
    setTick((t) => t + 1);
    changed();
  };

  const removeSelectedMarks = () => {
    if (!selMarks.size) return;
    if (!confirm(`Bỏ ${selMarks.size} đánh dấu đã chọn?`)) return;
    for (const id of selMarks) {
      // id = `${filename}#${pdfPage}` — filename có thể chứa "#" nên tách từ cuối
      const sep = id.lastIndexOf("#");
      if (sep === -1) continue;
      const filename = id.slice(0, sep);
      const pdfPage = Number(id.slice(sep + 1));
      if (filename && Number.isFinite(pdfPage) && typeof onRemove === "function") {
        try { onRemove(filename, pdfPage); } catch {}
      }
    }
    setSelMarks(new Set());
    setTick((t) => t + 1);
    changed();
    say(`Đã bỏ ${selMarks.size} đánh dấu.`);
  };

  const removeNoteItem = (n) => {
    const ok = deletePinNote(n.file, n.pdfPage, n.id);
    setNotesTick((t) => t + 1);
    changed();
    say(ok ? "Đã xóa ghi chú." : "Không xóa được ghi chú.");
  };

  const removeSelectedNotes = () => {
    if (!selNotes.size) return;
    if (!confirm(`Xóa ${selNotes.size} ghi chú đã chọn?`)) return;
    let n = 0;
    for (const key of selNotes) {
      const parts = key.split("#");
      const id = parts.pop();
      const pdfPage = Number(parts.pop());
      const file = parts.join("#");
      if (deletePinNote(file, pdfPage, id)) n += 1;
    }
    setSelNotes(new Set());
    setNotesTick((t) => t + 1);
    changed();
    say(`Đã xóa ${n} ghi chú.`);
  };

  // ── Xóa cả sách (theo khung) ──
  const clearGroupMarks = (file) => {
    const list = markRows.filter((r) => r.filename === file);
    if (!list.length) return;
    const title = byFilename.get(file)?.title || file;
    if (!confirm(`Xóa hết ${list.length} đánh dấu của "${title}"?`)) return;
    if (typeof onClearFile === "function") onClearFile(file);
    setSelMarks((prev) => { const s = new Set(prev); for (const r of list) s.delete(r.id); return s; });
    setTick((t) => t + 1);
    changed();
    say(`Đã xóa ${list.length} đánh dấu của sách.`);
  };

  const clearGroupNotes = (file) => {
    const list = allNotes.filter((n) => n.file === file);
    if (!list.length) return;
    const title = byFilename.get(file)?.title || file;
    if (!confirm(`Xóa hết ${list.length} ghi chú của "${title}"?`)) return;
    let n = 0;
    for (const note of list) { if (deletePinNote(note.file, note.pdfPage, note.id)) n += 1; }
    setSelNotes((prev) => { const s = new Set(prev); for (const note of list) s.delete(`${note.file}#${note.pdfPage}#${note.id}`); return s; });
    setNotesTick((t) => t + 1);
    changed();
    say(`Đã xóa ${n} ghi chú của sách.`);
  };

  // ── Xuất dữ liệu ──
  const doExportCsv = () => {
    if (tab === "notes") {
      if (!filteredNotes.length) return say("Không có ghi chú để xuất.");
      exportCsv("Danh dau - Ghi chu da luu", [
        ["Sách", "Lớp", "Trang (sách)", "Trang (PDF)", "Nội dung", "Số ảnh"],
        ...filteredNotes.map((n) => {
          const b = byFilename.get(n.file);
          return [b?.title || n.file, b?.grade ?? "", n.bookPage, n.pdfPage, n.plain, n.imageCount];
        }),
      ]);
      say(`Đã xuất ${filteredNotes.length} ghi chú ra CSV.`);
    } else {
      if (!filteredMarks.length) return say("Không có đánh dấu để xuất.");
      exportCsv("Danh dau - Trang danh dau", [
        ["Sách", "Lớp", "Môn", "Trang (sách)", "Trang (PDF)", "Nhãn gợi nhớ", "Số ghi chú tại trang"],
        ...filteredMarks.map((r) => [r.bookTitle, r.grade ?? "", r.subject ?? "", r.bookPage, r.pdfPage, r.label, r.noteCount]),
      ]);
      say(`Đã xuất ${filteredMarks.length} đánh dấu ra CSV.`);
    }
  };

  const doExportWord = () => {
    if (tab === "notes") {
      if (!filteredNotes.length) return say("Không có ghi chú để xuất.");
      const blocks = filteredNotes.map((n) => {
        const b = byFilename.get(n.file);
        return `<h2>${escapeHtml((b?.title || n.file) + " — tr. " + n.bookPage)}</h2><p>${nl2br(escapeHtml(n.plain) || "(ghi chú trống)")}</p><small>${n.imageCount ? `${n.imageCount} ảnh đính kèm • ` : ""}PDF trang ${n.pdfPage}${b?.grade ? ` • Lớp ${b.grade}` : ""}</small>`;
      });
      exportWord("Ghi chú đã lưu", `<h1>Ghi chú đã lưu (${filteredNotes.length})</h1><div class="meta">Xuất ${new Date().toLocaleString("vi-VN")}</div>` + blocks.join("<hr>"));
      say(`Đã xuất ${filteredNotes.length} ghi chú ra Word.`);
    } else {
      if (!filteredMarks.length) return say("Không có đánh dấu để xuất.");
      const blocks = filteredMarks.map((r) =>
        `<h2>Trang ${r.bookPage} — ${escapeHtml(r.bookTitle)}</h2><p>${r.label ? nl2br(escapeHtml(r.label)) : "<i>(chưa đặt nhãn)</i>"}${r.noteCount ? `<br><small>Có ${r.noteCount} ghi chú ghim tại trang này</small>` : ""}</p><small>Lớp ${r.grade ?? "?"} • ${escapeHtml(r.subject || "")} • PDF ${r.pdfPage}</small>`,
      );
      exportWord("Trang đánh dấu", `<h1>Trang đánh dấu (${filteredMarks.length})</h1><div class="meta">Xuất ${new Date().toLocaleString("vi-VN")}</div>` + blocks.join("<hr>"));
      say(`Đã xuất ${filteredMarks.length} đánh dấu ra Word.`);
    }
  };

  const doExportTxt = () => {
    const lines = tab === "notes"
      ? [`GHI CHÚ ĐÃ LƯU (${filteredNotes.length})`, `Xuất lúc: ${new Date().toLocaleString("vi-VN")}`, ""]
      : [`TRANG ĐÁNH DẤU (${filteredMarks.length})`, `Xuất lúc: ${new Date().toLocaleString("vi-VN")}`, ""];
    if (tab === "notes") {
      filteredNotes.forEach((n) => {
        const b = byFilename.get(n.file);
        lines.push(`◾ ${(b?.title || n.file)} — tr. ${n.bookPage}`);
        lines.push(`  ${n.plain || "(ghi chú trống)"}${n.imageCount ? ` [${n.imageCount} ảnh]` : ""}`);
        lines.push("");
      });
    } else {
      filteredMarks.forEach((r) => {
        lines.push(`◾ ${r.bookTitle} — tr. ${r.bookPage}${r.label ? ` — ${r.label}` : ""}`);
        if (r.noteCount) lines.push(`  (${r.noteCount} ghi chú ghim tại trang)`);
      });
    }
    exportTxt(tab === "notes" ? "Ghi chu da luu" : "Trang danh dau", lines.join("\n"));
    say("Đã xuất file TXT.");
  };

  const isEmptyAll = !markRows.length && !allNotes.filter((n) => byFilename.has(n.file)).length;

  // ── Khung nhóm sách (dùng chung cho 2 tab) — phong cách thẻ "Tiếp tục đọc" ──
  const renderGroupHead = ({ kind, file, book, title, grade, subject, statsNodes, onClear, onOpen }) => {
    const collapsed = isGroupCollapsed(kind, file);
    const initial = (String(title || "?").trim().charAt(0) || "?").toUpperCase();
    return (
      <div className="bm-group-head">
        <button
          type="button"
          className="bm-group-toggle"
          onClick={() => toggleGroup(kind, file)}
          aria-expanded={!collapsed}
          title={collapsed ? "Mở khung" : "Thu gọn khung"}
        >
          <ChevronDown size={15} className="bm-caret" />
          <span className="bm-group-badge" aria-hidden="true">{initial}</span>
          <span className="bm-group-titles">
            <span className="bm-group-title" title={title}>{title}</span>
            <span className="bm-group-meta">Lớp {grade ?? "?"} · {subject || "—"}</span>
          </span>
        </button>
        <span className="bm-group-stats">{statsNodes}</span>
        <span className="bm-group-actions">
          {onOpen && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onOpen(book)} disabled={!book} title="Mở sách">
              <BookOpen size={12} /> Mở
            </button>
          )}
          {onClear && (
            <button type="button" className="btn btn-danger btn-xs" onClick={() => onClear(file)} title="Xóa hết của sách này">
              <Trash2 size={12} /> Xóa cả sách
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="bm-view">
      {/* Tabs đồng bộ app */}
      <div className="vocab-tabs" role="tablist" aria-label="Đánh dấu và ghi chú">
        <button role="tab" aria-selected={tab === "marks"} className={`vocab-tab${tab === "marks" ? " active" : ""}`} onClick={() => setTab("marks")}>
          <Bookmark size={14} /> Trang đánh dấu {markRows.length ? `(${markRows.length})` : ""}
        </button>
        <button role="tab" aria-selected={tab === "notes"} className={`vocab-tab${tab === "notes" ? " active" : ""}`} onClick={() => setTab("notes")}>
          <StickyNote size={14} /> Ghi chú đã lưu {stats.totalNotes ? `(${stats.totalNotes})` : ""}
        </button>
        <button role="tab" aria-selected={tab === "overview"} className={`vocab-tab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>
          <BarChart3 size={14} /> Tổng quan
        </button>
        <span className="vocab-tabs-spacer" />
        <span className="vocab-total"><LayoutGrid size={13} /> {stats.totalMarks} đánh dấu • {stats.totalNotes} ghi chú</span>
      </div>

      {tab === "overview" ? (
        <div className="vocab-stats">
          <div className="vocab-stat-cards">
            <div className="vocab-stat-card"><span className="vocab-stat-value">{stats.totalMarks}</span><span className="vocab-stat-label">Trang đánh dấu</span></div>
            <div className="vocab-stat-card"><span className="vocab-stat-value">{stats.totalFiles}</span><span className="vocab-stat-label">Sách có đánh dấu</span></div>
            <div className="vocab-stat-card"><span className="vocab-stat-value">{stats.totalNotes}</span><span className="vocab-stat-label">Ghi chú đã lưu</span></div>
            <button className="vocab-stat-card clickable" onClick={() => { setOnlyWithNotes(true); setTab("marks"); }} title="Xem trang vừa đánh dấu vừa có ghi chú">
              <span className="vocab-stat-value">{stats.withNotes}</span><span className="vocab-stat-label">Trang có cả 2 → xem</span>
            </button>
          </div>
          <section className="vocab-stat-section">
            <h4>Theo sách</h4>
            {stats.byFile.length ? (
              <div className="vocab-bars">
                {stats.byFile.map((b) => {
                  const max = stats.byFile[0].total || 1;
                  return (
                    <button key={b.file} className="vocab-bar-row" onClick={() => { setFileFilter(b.file); setTab("marks"); }} title={`Lọc theo "${b.title}"`}>
                      <span className="vocab-bar-label">{b.title.slice(0, 36)}</span>
                      <span className="vocab-bar-track"><span className="vocab-bar-fill" style={{ width: `${Math.round((b.total / max) * 100)}%` }} /></span>
                      <span className="vocab-bar-value">{b.marks}🔖 {b.notes}📝</span>
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-muted">Chưa có dữ liệu.</p>}
          </section>
          <div className="vocab-stat-actions">
            <button className="btn btn-secondary btn-xs" onClick={() => setTab("marks")}><Table2 size={12} /> Xem đánh dấu</button>
            <button className="btn btn-secondary btn-xs" onClick={() => setTab("notes")}><StickyNote size={12} /> Xem ghi chú</button>
            <button className="btn btn-secondary btn-xs" onClick={doExportWord}><FileText size={12} /> Xuất Word</button>
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="data-table-toolbar vocab-toolbar bm-toolbar">
            <div className="data-table-toolbar-left">
              <div className="search-input-wrapper bm-search">
                <Search className="search-icon" size={14} />
                <input type="text" className="search-input" placeholder={tab === "notes" ? "Tìm nội dung ghi chú / tên sách…" : "Tìm nhãn, tên sách…"} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm kiếm" />
                {query && <button className="search-clear" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={12} /></button>}
              </div>
              <select className="sort-select" value={fileFilter || ""} onChange={(e) => setFileFilter(e.target.value || null)} title="Lọc theo sách" aria-label="Lọc theo sách">
                <option value="">Tất cả sách</option>
                {books.map((b) => <option key={b.filename} value={b.filename}>{b.title.slice(0, 34)}</option>)}
              </select>
              {tab === "marks" ? (
                <button className={`vocab-filter-chip${onlyWithNotes ? " on" : ""}`} onClick={() => setOnlyWithNotes((v) => !v)} title="Chỉ hiện trang có ghi chú ghim">
                  <StickyNote size={12} /> Có ghi chú
                </button>
              ) : (
                <button className={`vocab-filter-chip${onlyWithImage ? " on" : ""}`} onClick={() => setOnlyWithImage((v) => !v)} title="Chỉ hiện ghi chú có ảnh">
                  <ImageIcon size={12} /> Có ảnh{stats.withImage ? ` (${stats.withImage})` : ""}
                </button>
              )}
              {tab === "marks" && (
                <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Sắp xếp" aria-label="Sắp xếp">
                  <option value="book">Sắp xếp: Theo sách</option>
                  <option value="page">Sắp xếp: Trang tăng dần</option>
                  <option value="label">Sắp xếp: Theo nhãn</option>
                </select>
              )}
              <select className="sort-select" value={groupSort} onChange={(e) => changeGroupSort(e.target.value)} title="Sắp xếp các khung sách" aria-label="Sắp xếp sách">
                {BOOK_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <span className="bm-count">{tab === "marks" ? `${filteredMarks.length}/${markRows.length} đánh dấu` : `${filteredNotes.length}/${stats.totalNotes} ghi chú`}</span>
            </div>
            <div className="data-table-toolbar-right">
              {tab === "marks" ? (
                <>
                  <button className="btn btn-secondary btn-xs" onClick={() => { const all = filteredMarks.length > 0 && filteredMarks.every((r) => selMarks.has(r.id)); setSelMarks(all ? new Set() : new Set(filteredMarks.map((r) => r.id))); }} disabled={!filteredMarks.length}>
                    <ListChecks size={12} /> {filteredMarks.length > 0 && filteredMarks.every((r) => selMarks.has(r.id)) ? "Bỏ chọn" : "Chọn tất cả"}
                  </button>
                  <button className="btn btn-danger btn-xs" onClick={removeSelectedMarks} disabled={!selMarks.size}><Trash2 size={12} /> Bỏ đã chọn{selMarks.size ? ` (${selMarks.size})` : ""}</button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary btn-xs" onClick={() => { const all = noteRows.length > 0 && noteRows.every((n) => selNotes.has(n._rid)); setSelNotes(all ? new Set() : new Set(noteRows.map((n) => n._rid))); }} disabled={!filteredNotes.length}>
                    <ListChecks size={12} /> {noteRows.length > 0 && noteRows.every((n) => selNotes.has(n._rid)) ? "Bỏ chọn" : "Chọn tất cả"}
                  </button>
                  <button className="btn btn-danger btn-xs" onClick={removeSelectedNotes} disabled={!selNotes.size}><Trash2 size={12} /> Xóa đã chọn{selNotes.size ? ` (${selNotes.size})` : ""}</button>
                </>
              )}
              <button className="btn btn-secondary btn-xs" onClick={doExportCsv} title="Xuất CSV/Excel"><FileSpreadsheet size={12} /> CSV</button>
              <button className="btn btn-secondary btn-xs" onClick={doExportWord} title="Xuất Word"><FileText size={12} /> Word</button>
              <button className="btn btn-secondary btn-xs" onClick={doExportTxt} title="Xuất TXT"><Download size={12} /> TXT</button>
            </div>
          </div>

          {isEmptyAll ? (
            <div className="dash-empty bm-empty">
              <span className="bm-empty-icons"><Bookmark size={44} /><StickyNote size={36} /></span>
              <p><strong>Chưa có trang nào được đánh dấu hay ghi chú nào được lưu.</strong></p>
              <p className="text-muted">Mở một cuốn sách → bấm <strong>★ đánh dấu</strong> để lưu trang quan trọng, <strong>double-click lên trang</strong> để ghim ghi chú. Cả hai đều hiện ở đây.</p>
            </div>
          ) : tab === "marks" ? (
            markGroups.length === 0 ? (
              <div className="data-table-empty">
                <div className="data-table-empty-icon"><Search size={22} /></div>
                <p>{markRows.length ? `Không tìm thấy${query ? ` cho "${query}"` : ""}` : "Chưa có trang nào được đánh dấu"}</p>
                <span className="text-muted">{markRows.length ? "Thử đổi từ khóa hoặc bỏ bộ lọc." : "Mở một cuốn sách và bấm nút ★ đánh dấu để lưu trang quan trọng!"}</span>
              </div>
            ) : (
              <div className="bm-groups">
                {markGroups.map((g) => {
                  const collapsed = isGroupCollapsed("marks", g.file);
                  return (
                    <section className={`bm-group${collapsed ? " collapsed" : ""}`} key={g.file}>
                      {renderGroupHead({
                        kind: "marks", file: g.file, book: g.book, title: g.title, grade: g.grade, subject: g.subject,
                        statsNodes: (
                          <>
                            <span className="tag-pill">{g.rows.length} đánh dấu</span>
                            {g.noteTotal > 0 && <span className="bm-note-badge has"><StickyNote size={11} /> {g.noteTotal} ghi chú</span>}
                          </>
                        ),
                        onClear: clearGroupMarks,
                        onOpen: (book) => book && onOpenBook && onOpenBook(book, g.rows[0]?.pdfPage || 1),
                      })}
                      {!collapsed && (
                        <div className="bm-group-body">
                          {g.rows.map((row) => (
                            <div className="bm-row" key={row.id} onClick={() => onOpenBook && onOpenBook(row.book, row.pdfPage)}>
                              <button className={`vocab-select-btn${selMarks.has(row.id) ? " on" : ""}`}
                                onClick={(e) => { e.stopPropagation(); toggleMark(row.id); }}
                                aria-label={selMarks.has(row.id) ? "Bỏ chọn" : "Chọn"} aria-pressed={selMarks.has(row.id)}>
                                {selMarks.has(row.id) ? <Check size={13} /> : <Square size={13} />}
                              </button>
                              <div className="bm-row-main">
                                <div className="bm-row-top">
                                  <span className="tag-pill">Trang {row.bookPage}</span>
                                  {row.noteCount > 0 && (
                                    <button className="bm-note-badge has" onClick={(e) => { e.stopPropagation(); setFileFilter(row.filename); setQuery(`trang ${row.bookPage}`); setTab("notes"); }} title={`${row.noteCount} ghi chú tại trang này — bấm để xem`}>
                                      <StickyNote size={11} /> {row.noteCount} ghi chú{row.hasImage ? " + ảnh" : ""}
                                    </button>
                                  )}
                                </div>
                                {row.label
                                  ? <span className="cell-clamp bm-label" title="Nhấp đúp để sửa nhãn" onDoubleClick={(e) => { e.stopPropagation(); setLabelEditor({ filename: row.filename, pdfPage: row.pdfPage, draft: row.label }); }}>{row.label}</span>
                                  : <button className="bm-add-label" onClick={(e) => { e.stopPropagation(); setLabelEditor({ filename: row.filename, pdfPage: row.pdfPage, draft: "" }); }} title="Thêm nhãn gợi nhớ"><Pencil size={11} /> Thêm nhãn</button>}
                              </div>
                              <span className="data-table-actions" onClick={(e) => e.stopPropagation()}>
                                <button className="btn btn-primary btn-xs" onClick={() => onOpenBook && onOpenBook(row.book, row.pdfPage)} title={`Mở trang ${row.bookPage}`}><BookOpen size={12} /> Mở</button>
                                <button className="btn btn-secondary btn-xs" onClick={() => setLabelEditor({ filename: row.filename, pdfPage: row.pdfPage, draft: row.label || "" })} title="Sửa nhãn" aria-label="Sửa nhãn"><Pencil size={12} /></button>
                                <button className="btn btn-danger btn-xs" onClick={() => removeMarkRow(row)} title="Bỏ đánh dấu" aria-label="Bỏ đánh dấu"><X size={12} /></button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )
          ) : noteGroups.length === 0 ? (
            <div className="data-table-empty">
              <div className="data-table-empty-icon"><Search size={22} /></div>
              <p>{stats.totalNotes ? `Không tìm thấy ghi chú${query ? ` cho "${query}"` : ""}` : "Chưa có ghi chú nào được lưu"}</p>
              <span className="text-muted">{stats.totalNotes ? "Thử đổi từ khóa hoặc bỏ bộ lọc." : "Double-click lên trang sách để ghim ghi chú — ghi chú sẽ hiện ở đây kèm nút mở đúng trang."}</span>
            </div>
          ) : (
            <div className="bm-groups">
              {noteGroups.map((g) => {
                const collapsed = isGroupCollapsed("notes", g.file);
                return (
                  <section className={`bm-group${collapsed ? " collapsed" : ""}`} key={g.file}>
                    {renderGroupHead({
                      kind: "notes", file: g.file, book: g.book, title: g.title, grade: g.grade, subject: g.subject,
                      statsNodes: (
                        <>
                          <span className="tag-pill">{g.notes.length} ghi chú</span>
                          {g.imageTotal > 0 && <span className="bm-img-chip"><ImageIcon size={11} /> {g.imageTotal} ảnh</span>}
                        </>
                      ),
                      onClear: clearGroupNotes,
                      onOpen: (book) => book && onOpenBook && onOpenBook(book, g.notes[0]?.pdfPage || 1),
                    })}
                    {!collapsed && (
                      <div className="bm-group-body bm-note-grid">
                        {g.notes.map((n) => {
                          const id = `${n.file}#${n.pdfPage}#${n.id}`;
                          const isLong = String(n.plain || "").length > 140;
                          const open = !!expanded[id];
                          const b = byFilename.get(n.file);
                          return (
                            <article
                              className={`bm-note-card${selNotes.has(id) ? " selected" : ""}`}
                              key={id}
                              onClick={() => b && onOpenBook && onOpenBook(b, n.pdfPage)}
                            >
                              <div className="bm-note-card-top">
                                <span className="tag-pill">Trang {n.bookPage}</span>
                                {n.imageCount > 0 && <span className="bm-img-chip"><ImageIcon size={11} /> {n.imageCount}</span>}
                                <button className={`vocab-select-btn bm-note-card-check${selNotes.has(id) ? " on" : ""}`}
                                  onClick={(e) => { e.stopPropagation(); toggleNote(id); }}
                                  aria-label={selNotes.has(id) ? "Bỏ chọn" : "Chọn"} aria-pressed={selNotes.has(id)}>
                                  {selNotes.has(id) ? <Check size={13} /> : <Square size={13} />}
                                </button>
                              </div>
                              <p className={open ? "bm-note-card-text full" : "bm-note-card-text"} title={n.plain || "(ghi chú trống)"}>
                                {n.plain || <i className="text-muted">(chỉ có ảnh đính kèm)</i>}
                              </p>
                              {isLong && <button className="btn-link-reset bm-more" onClick={(e) => { e.stopPropagation(); setExpanded((s) => ({ ...s, [id]: !s[id] })); }}>{open ? "Thu gọn" : "Xem thêm"}</button>}
                              <div className="bm-note-card-actions" onClick={(e) => e.stopPropagation()}>
                                <button className="btn btn-secondary btn-xs" disabled={!b} onClick={() => b && onOpenBook && onOpenBook(b, n.pdfPage)} title={b ? `Mở trang ${n.bookPage}` : "Sách đã bị xóa"}><BookOpen size={12} /> Mở</button>
                                <button className="btn btn-danger btn-xs" onClick={() => removeNoteItem(n)} title="Xóa ghi chú" aria-label="Xóa ghi chú"><Trash2 size={12} /></button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal sửa nhãn — thay window.prompt cũ */}
      {labelEditor && (
        <div className="modal-overlay" onClick={() => setLabelEditor(null)}>
          <div className="modal-content bm-label-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="m-0">Nhãn gợi nhớ</h3>
              <button className="util-bubble-close dark" onClick={() => setLabelEditor(null)} aria-label="Đóng"><X size={18} /></button>
            </div>
            <div className="bm-label-body">
              <input className="form-control" autoFocus maxLength={60} value={labelEditor.draft}
                onChange={(e) => setLabelEditor({ ...labelEditor, draft: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveLabel(); else if (e.key === "Escape") setLabelEditor(null); }}
                placeholder="VD: Ôn thi giữa kỳ, bài khó…" />
              <div className="vocab-form-actions">
                <button className="btn btn-secondary" onClick={() => setLabelEditor(null)}>Hủy</button>
                <button className="btn btn-primary" onClick={saveLabel}><Check size={14} /> Lưu nhãn</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
