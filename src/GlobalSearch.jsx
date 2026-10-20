import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, BookOpen, Lightbulb, FileText, Puzzle, Database, ListChecks, Library, NotebookPen, Scissors, ClipboardCheck, Palette, Layers, StickyNote, Tag, Clock, Trash2 } from "lucide-react";
import { findTocBook } from "./tocData.js";
import { getShortcut, matchesShortcut, splitCombo } from "./keyboardShortcuts.js";
import { safeGetJSON } from "./safeStorage";
import { searchNotes, getNoteKindLabel } from "./noteSearch.js";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from "./searchRecent.js";
import { groupResultsForDisplay, FILTER_DEFS, parseFilterPrefix, filterResultsByType, countByType } from "./searchDisplayOrder.js";
import { resolveVocabBookTitle } from "./vocabSearch.js";
import { applySearchConfig, getSearchConfig, getDisabledViews } from "./settingsStore.js";

// Chuẩn hoá không dấu để highlight khớp cả khi gõ không dấu
function normVi(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Highlight các token của query trong text — khớp trực tiếp (hoa/thường) trước,
// fallback khớp không dấu thì highlight toàn bộ cụm (tránh sai index do mất dấu).
function HighlightedText({ text, query }) {
  const t = String(text ?? "");
  const q = String(query ?? "").trim();
  if (!t || !q) return <>{t}</>;
  const tokens = q.split(/\s+/).filter((w) => w.length >= 2);
  if (!tokens.length) return <>{t}</>;
  const lower = t.toLowerCase();
  // Tìm tất cả vị trí khớp trực tiếp của mọi token
  const ranges = [];
  for (const tok of tokens) {
    const tl = tok.toLowerCase();
    let from = 0;
    while (from <= lower.length - tl.length) {
      const i = lower.indexOf(tl, from);
      if (i === -1) break;
      ranges.push([i, i + tl.length]);
      from = i + Math.max(1, tl.length);
    }
  }
  if (ranges.length) {
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    const parts = [];
    let cur = 0;
    merged.forEach(([a, b], idx) => {
      if (cur < a) parts.push(<span key={`p${idx}-0`}>{t.slice(cur, a)}</span>);
      parts.push(<mark key={`p${idx}-1`} className="gs-mark">{t.slice(a, b)}</mark>);
      cur = b;
    });
    if (cur < t.length) parts.push(<span key="p-end">{t.slice(cur)}</span>);
    return <>{parts}</>;
  }
  // Không khớp trực tiếp nhưng khớp không dấu → bôi nhẹ toàn bộ (gợi ý liên quan)
  const nt = normVi(t);
  const hit = tokens.some((tok) => nt.includes(normVi(tok)));
  if (hit) return <span className="gs-fuzzy-hit">{t}</span>;
  return <>{t}</>;
}

// Ánh xạ nhóm mặc định trong Cài đặt → filter chip Ctrl+K
function mapDefaultTypeToFilter(t) {
  if (t === "toc") return "toc";
  if (t === "notes") return "note";
  return "all";
}

// Lệnh nhanh kiểu VSCode — gõ ">" + tên lệnh để nhảy thẳng / tạo mới
// disabledViews (Cài đặt → Tính năng): lệnh nhảy tới module đang tắt bị ẩn.
function buildQuickCommands(onNavigateRef, disabledViews) {
  const go = (view, opts) => () => onNavigateRef.current(view, opts);
  const cmds = [
    { id: "cmd-dashboard", view: "dashboard", title: "Đi tới: Tổng quan", subtitle: "Mở trang tổng quan", keywords: "tong quan dashboard home", action: go("dashboard") },
    { id: "cmd-library", view: "library", title: "Đi tới: Thư viện sách", subtitle: "Mở thư viện", keywords: "thu vien library sach", action: go("library") },
    { id: "cmd-search", view: "search", title: "Đi tới: Tìm kiếm nâng cao", subtitle: "Mở trang Tìm kiếm", keywords: "tim kiem search nang cao", action: go("search") },
    { id: "cmd-lessonplans", view: "lessonplans", title: "Đi tới: Giáo án", subtitle: "Mở danh sách giáo án", keywords: "giao an khbd lessonplan", action: go("lessonplans") },
    { id: "cmd-activities", view: "activities", title: "Đi tới: Hoạt động", subtitle: "Mở hoạt động học tập", keywords: "hoat dong activity", action: go("activities") },
    { id: "cmd-worksheets", view: "worksheets", title: "Đi tới: Phiếu học tập", subtitle: "Mở phiếu", keywords: "phieu worksheet", action: go("worksheets") },
    { id: "cmd-questionbank", view: "questionbank", title: "Đi tới: Ngân hàng câu hỏi", subtitle: "Mở ngân hàng câu hỏi", keywords: "cau hoi question ngan hang", action: go("questionbank") },
    { id: "cmd-vocab", view: "vocab", title: "Đi tới: Từ vựng", subtitle: "Mở sổ tay từ vựng", keywords: "tu vung vocab", action: go("vocab") },
    { id: "cmd-tasks", view: "tasks", title: "Đi tới: Nhiệm vụ", subtitle: "Mở hub nhiệm vụ", keywords: "nhiem vu task mission", action: go("tasks") },
    { id: "cmd-ideas", view: "ideas", title: "Đi tới: Ý tưởng", subtitle: "Mở ý tưởng dạy học", keywords: "y tuong idea", action: go("ideas") },
    { id: "cmd-references", view: "references", title: "Đi tới: Tài liệu tham khảo", subtitle: "Mở tham khảo", keywords: "tham khao reference tai lieu", action: go("references") },
    { id: "cmd-collections", view: "collections", title: "Đi tới: Bộ sưu tập", subtitle: "Mở bộ sưu tập", keywords: "bo suu tap collection", action: go("collections") },
    { id: "cmd-whiteboard", view: "whiteboard", title: "Đi tới: Bảng trắng", subtitle: "Mở bảng trắng", keywords: "bang trang whiteboard", action: go("whiteboard") },
    { id: "cmd-new-idea", view: "ideas", title: "Tạo mới: Ý tưởng", subtitle: "Mở Ý tưởng để thêm", keywords: "tao moi new idea", action: go("ideas") },
    { id: "cmd-new-task", view: "tasks", title: "Tạo mới: Nhiệm vụ", subtitle: "Mở Nhiệm vụ để thêm việc", keywords: "tao moi new task viec", action: go("tasks", { tab: "tasks" }) },
    { id: "cmd-new-plan", view: "lessonplans", title: "Tạo mới: Giáo án", subtitle: "Mở Giáo án để soạn", keywords: "tao moi new giao an khbd", action: go("lessonplans") },
  ];
  return disabledViews && disabledViews.size ? cmds.filter((c) => !disabledViews.has(c.view)) : cmds;
}

// Hiển thị combo phím từ cài đặt (không hardcode "Ctrl+K"/"Escape" trong hint —
// user đổi shortcut trong Settings thì hint phải tự cập nhật, lỗi #13).
function KbdCombo({ combo, k = "c" }) {
  const parts = splitCombo(combo);
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {i > 0 ? " + " : ""}
          <kbd className="kbd">{p}</kbd>
        </React.Fragment>
      ))}
    </>
  );
}

export default function GlobalSearch({ books, onNavigate, onOpenBook }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches());
  const [activeFilter, setActiveFilter] = useState(() => {
    try { return mapDefaultTypeToFilter(getSearchConfig().defaultType); } catch { return "all"; }
  });
  const inputRef = useRef(null);

  // Tách prefix lọc "sach: ..." và mode lệnh ">..." khỏi query thô
  const parsed = useMemo(() => parseFilterPrefix(query), [query]);
  const isCommandMode = !!parsed.commandMode;
  // Prefix trong query thắng chip đang chọn; không prefix thì dùng chip
  const effectiveFilter = parsed.filter || activeFilter;
  // Từ khoá thật dùng để quét (đã trừ prefix "sach:" / ">")
  const effectiveQuery = isCommandMode || parsed.filter ? parsed.cleanQuery : query;

  // Listener phím của search phải đăng ký MỘT LẦN (trước các layer mount sau như
  // BookReader) để stopImmediatePropagation có hiệu lực. Đọc state qua ref.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Props callback đọc qua ref: effect tìm kiếm không được re-run chỉ vì App
  // re-render và truyền arrow function mới (lỗi #10 — mỗi lần quét lại toàn bộ localStorage).
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const onOpenBookRef = useRef(onOpenBook);
  onOpenBookRef.current = onOpenBook;
  // So sánh stale cho async IDB merge (tránh setResults của query cũ)
  const effectiveQueryRef = useRef(effectiveQuery);
  effectiveQueryRef.current = effectiveQuery;

  // Debounce quét: gõ nhanh N ký tự chỉ quét 1 lần ở lần gõ cuối.
  const SEARCH_DEBOUNCE_MS = 200;

  // Lọc theo chip/prefix TRƯỚC khi gom nhóm — flatResults luôn đồng bộ render
  const filteredResults = useMemo(
    () => filterResultsByType(results, effectiveFilter),
    [results, effectiveFilter],
  );
  const typeCounts = useMemo(() => countByType(results), [results]);

  // Danh sách phẳng ĐÚNG theo thứ tự hiển thị (nhóm đã sắp) — keyboard nav index vào đây.
  const { displayGroups, flatResults } = useMemo(() => groupResultsForDisplay(filteredResults), [filteredResults]);

  // Lệnh nhanh ">" — lọc theo từ khoá sau dấu >
  const visibleCommands = useMemo(() => {
    if (!isCommandMode) return [];
    const cmds = buildQuickCommands(onNavigateRef, new Set(getDisabledViews()));
    const needle = String(effectiveQuery || "").trim().toLowerCase();
    if (!needle) return cmds;
    const normNeedle = normVi(needle);
    return cmds.filter((c) =>
      String(c.title || "").toLowerCase().includes(needle) ||
      normVi(c.title).includes(normNeedle) ||
      String(c.keywords || "").toLowerCase().includes(needle) ||
      normVi(c.keywords).includes(normNeedle),
    );
  }, [isCommandMode, effectiveQuery]);

  const refreshRecent = () => setRecentSearches(getRecentSearches());
  const saveRecent = (q) => {
    const t = String(q || "").trim();
    if (t.length < 2) return;
    addRecentSearch(t);
    refreshRecent();
  };

  // Đồng bộ với Setting — Ctrl+K (global.commandPalette) + nút header cùng cơ chế
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (matchesShortcut(e, getShortcut("global.commandPalette"))) {
        // Phân quyền Ctrl+K: TextBookModal đang mở và focus nằm NGOÀI overlay
        // search → phím thuộc modal (chèn link). Chỉ mở khi focus thuộc search
        // (đã mở) hoặc khi không có modal nào che.
        const active = document.activeElement;
        const focusInSearch = !!(active && active.closest && active.closest(".global-search-overlay"));
        if (!focusInSearch && document.querySelector(".word-modal-overlay")) return;
        e.preventDefault();
        setIsOpen(true);
      } else if (matchesShortcut(e, getShortcut("global.close"))) {
        // Lỗi #5: Escape CHỈ thuộc overlay đang mở. Chặn nổi event lên layer
        // dưới (reader tắt note/drawer/bảng lệnh, modal đóng…) — nếu search đang
        // đóng thì nhường toàn bộ cho các layer khác.
        if (!isOpenRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    };
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("sgk:open-global-search", handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("sgk:open-global-search", handleOpenEvent);
    };
  }, []);

  // Focus input when opened + refresh recent
  useEffect(() => {
    if (isOpen) {
      refreshRecent();
      setSelectedIndex(0);
      if (inputRef.current) inputRef.current.focus();
    } else {
      // reset query khi đóng? giữ lại để lần sau mở vẫn thấy — nhưng clear để hiện recent
      // không clear query để user quay lại vẫn giữ
    }
  }, [isOpen]);

  // Focus trap (a11y #11): Tab/Shift+Tab chỉ luân chuyển TRONG modal tìm kiếm —
  // không cho focus rơi ra nền (dialog aria-modal).
  useEffect(() => {
    if (!isOpen) return;
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const modal = document.querySelector(".global-search-modal");
      if (!modal) return;
      const focusables = [...modal.querySelectorAll("button, input, [href], [tabindex]:not([tabindex='-1'])")].filter(
        (el) => !el.disabled && (el.offsetWidth > 0 || el.offsetHeight > 0),
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = modal.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [isOpen]);

  // Lỗi #16: khoá scroll nền — overlay mở thì body không được cuộn (chặn
  // wheel/touch phía sau modal); khôi phục giá trị cũ khi đóng.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Lỗi #12: cuộn item đang highlight vào viewport khi ↑↓/query đổi — danh sách
  // dài hơn khung nhìn nếu không scrollIntoView thì user mất dấu selection.
  useEffect(() => {
    if (!isOpen) return;
    const el = document.querySelector(".global-search-result.selected, .global-search-recent-item.selected");
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, selectedIndex, query, effectiveQuery, effectiveFilter, flatResults.length, visibleCommands.length]);

  // Search across all data types — hỗ trợ không dấu + mục lục.
  // effectiveQuery = query đã trừ prefix "sach:" / ">"; command mode không quét dữ liệu.
  useEffect(() => {
    if (parsed.commandMode) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }
    const q = effectiveQuery;
    if (!String(q || "").trim()) {
      setResults([]);
      // Lỗi #6: PHẢI reset cả selectedIndex khi xoá query — nếu giữ index cũ,
      // nhánh recent sẽ Enter vào recentSearches[SAI] (khác item đang highlight).
      setSelectedIndex(0);
      return;
    }

    // Debounce (lỗi #10): gõ nhanh nhiều ký tự chỉ quét localStorage 1 lần ở cuối.
    const runSearch = () => {
    // Nguồn DUY NHẤT cho phép matching — đọc config 1 lần/effect, áp caseSensitive /
    // wholeWord / fuzzyMatch từ Cài đặt (trước đây Ctrl+K luôn fuzzy, bỏ qua config).
    const searchCfg = getSearchConfig();
    const matchesCfg = (text) => applySearchConfig(q, text, searchCfg);
    // Cài đặt → Tính năng: module đang tắt không quét dữ liệu & không hiện kết quả nhảy view đó
    const disabledViews = new Set(getDisabledViews());
    const canNav = (view) => !disabledViews.has(view);

    const searchResults = [];

    // Search books (không dấu)
    if (books) {
      books.forEach((book) => {
        if (matchesCfg(book.title) || matchesCfg(book.subject) || matchesCfg(book.publisher)) {
          searchResults.push({
            type: "book",
            id: book.id || book.filename,
            title: book.title,
            subtitle: book.subject || book.publisher || "",
            icon: <BookOpen size={16} />,
            action: () => onOpenBookRef.current(book),
          });
        }
      });
    }

    // Search TOC — bổ sung các trang nội dung trong mục lục, chuyển thẳng tới trang PDF
    if (books) {
      try {
        const MAX_TOC_HITS = 24;
        let tocHits = 0;
        books.forEach((book) => {
          if (tocHits >= MAX_TOC_HITS) return;
          let tocBook = null;
          try { tocBook = findTocBook(book); } catch { tocBook = null; }
          // Fallback: PDF outline cache localStorage toc_<filename> (khi không có toc tĩnh)
          let items = tocBook?.items || null;
          if ((!items || !items.length) && book.filename) {
            try {
              const cached = safeGetJSON(`toc_${book.filename}`, null, (v) => v && typeof v === "object" && !Array.isArray(v));
              if (cached?.items?.length) items = cached.items;
            } catch (e) {
              console.warn("[GlobalSearch] safeGetJSON failed for toc_" + book.filename, e);
            }
          }
          if (!items || !items.length) return;
          items.forEach((it, idx) => {
            if (tocHits >= MAX_TOC_HITS) return;
            const haystack = `${it.title || ""} ${it.sub || ""} ${it.tuann ? `tuan ${it.tuann}` : ""}`;
            if (!matchesCfg(haystack)) return;
            const pdfPage = Number(it.pdfPage ?? it.page ?? 1) || 1;
            const bookPage = Math.max(1, pdfPage - 1);
            const subLabel = it.sub ? ` — ${it.sub}` : "";
            const titleLabel = `${it.title || "Mục"}${subLabel}`;
            const pageLabel = `Trang ${bookPage}${it.tuann ? ` · Tuần ${it.tuann}` : ""}`;
            searchResults.push({
              type: "toc",
              id: `toc-${book.filename}-${pdfPage}-${idx}`,
              title: titleLabel,
              subtitle: `${book.title} · ${pageLabel}`,
              icon: <Layers size={16} />,
              action: () => onOpenBookRef.current(book, pdfPage),
            });
            tocHits++;
          });
        });
      } catch (e) {
        console.warn("[GlobalSearch] TOC search failed:", e);
      }
    }

    // Search ideas (không dấu)
    if (canNav("ideas")) try {
      const ideas = safeGetJSON("sgk_ideas", [], Array.isArray);
      ideas.forEach((idea) => {
        if (matchesCfg(idea.title) || matchesCfg(idea.description)) {
          searchResults.push({
            type: "idea",
            id: idea.id,
            title: idea.title,
            subtitle: idea.subject || idea.grade || "",
            icon: <Lightbulb size={16} />,
            action: () => onNavigateRef.current("ideas"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load ideas for search:", e);
    }

    // Search tasks (không dấu)
    try {
      const tasks = safeGetJSON("sgk_tasks", [], Array.isArray);
      tasks.forEach((task) => {
        if (matchesCfg(task.title) || matchesCfg(task.description)) {
          searchResults.push({
            type: "task",
            id: task.id,
            title: task.title,
            subtitle: task.category || task.priority || "",
            icon: <ClipboardCheck size={16} />,
            action: () => onNavigateRef.current("tasks", { tab: "tasks" }),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load tasks for search:", e);
    }

    // Search lesson plans (kho mới khbd_v2_*, không dấu)
    try {
      const plans = safeGetJSON("khbd_v2_plans", [], Array.isArray);
      plans.forEach((plan) => {
        if (matchesCfg(plan.title) || matchesCfg(plan.monHoc)) {
          searchResults.push({
            type: "lessonplan",
            id: plan.id,
            title: plan.title,
            subtitle: plan.monHoc ? `${plan.monHoc}${plan.lop ? ` · Lớp ${plan.lop}` : ""}` : "",
            icon: <FileText size={16} />,
            action: () => onNavigateRef.current("lessonplans", { planId: plan.id }),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load lesson plans for search:", e);
    }

    // Search activities (không dấu)
    if (canNav("activities")) try {
      const activities = safeGetJSON("sgk_activities", [], Array.isArray);
      activities.forEach((activity) => {
        if (matchesCfg(activity.title) || matchesCfg(activity.description)) {
          searchResults.push({
            type: "activity",
            id: activity.id,
            title: activity.title,
            subtitle: activity.subject || "",
            icon: <Puzzle size={16} />,
            action: () => onNavigateRef.current("activities"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load activities for search:", e);
    }

    // Search questions (không dấu)
    if (canNav("questionbank")) try {
      const questions = safeGetJSON("sgk_questions", [], Array.isArray);
      questions.forEach((question) => {
        if (matchesCfg(question.question) || matchesCfg(question.subject)) {
          searchResults.push({
            type: "question",
            id: question.id,
            title: question.question,
            subtitle: question.subject || question.level || "",
            icon: <Database size={16} />,
            action: () => onNavigateRef.current("questionbank"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load questions for search:", e);
    }

    // Search worksheets (không dấu)
    if (canNav("worksheets")) try {
      const worksheets = safeGetJSON("sgk_worksheets", [], Array.isArray);
      worksheets.forEach((worksheet) => {
        if (matchesCfg(worksheet.title) || matchesCfg(worksheet.subject)) {
          searchResults.push({
            type: "worksheet",
            id: worksheet.id,
            title: worksheet.title,
            subtitle: worksheet.subject || "",
            icon: <ListChecks size={16} />,
            action: () => onNavigateRef.current("worksheets"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load worksheets for search:", e);
    }

    // Search references — canonical sgk_refs, fallback legacy sgk_references (migration, không xóa legacy nếu có dữ liệu cũ §17)
    if (canNav("references")) try {
      let references = safeGetJSON("sgk_refs", [], Array.isArray);
      // Fallback / merge legacy — keep per-book isolation, không xóa legacy
      const legacy = safeGetJSON("sgk_references", [], Array.isArray);
      if (Array.isArray(legacy) && legacy.length) {
        try {
          if (!Array.isArray(references) || references.length === 0) {
            references = legacy;
          } else {
            const ids = new Set(references.map((r) => r?.id).filter(Boolean));
            legacy.forEach((r) => {
              if (r?.id && !ids.has(r.id)) references.push(r);
            });
          }
        } catch (e) {
          console.warn("[GlobalSearch] merge legacy sgk_references failed", e);
        }
      }
      if (!Array.isArray(references)) references = [];
      references.forEach((ref) => {
        if (matchesCfg(ref.title) || matchesCfg(ref.author)) {
          searchResults.push({
            type: "reference",
            id: ref.id,
            title: ref.title,
            subtitle: ref.author || ref.year || "",
            icon: <Library size={16} />,
            action: () => onNavigateRef.current("references"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load references for search:", e);
    }

    // Search collections (không dấu)
    if (canNav("collections")) try {
      const collections = safeGetJSON("sgk_collections", [], Array.isArray);
      collections.forEach((collection) => {
        if (matchesCfg(collection.title) || matchesCfg(collection.description)) {
          searchResults.push({
            type: "collection",
            id: collection.id,
            title: collection.title,
            subtitle: collection.description || "",
            icon: <Scissors size={16} />,
            action: () => onNavigateRef.current("collections"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load collections for search:", e);
    }

    // Search whiteboards — P0: LS legacy (pre-migrate) + IDB canonical (post-migrate, async bổ sung)
    if (canNav("whiteboard")) try {
      const wbIndex = safeGetJSON("sgk_wb_index", [], Array.isArray);
      const pushWbBoard = (board) => {
        if (matchesCfg(board.name)) {
          searchResults.push({
            type: "whiteboard",
            id: board.id,
            title: board.name,
            subtitle: `Bảng trắng • ${(() => { try { return new Date(board.updatedAt).toLocaleDateString("vi-VN"); } catch { return ""; } })()}`,
            icon: <Palette size={16} />,
            action: () => onNavigateRef.current("whiteboard"),
          });
        }
      };
      wbIndex.forEach(pushWbBoard);
      // deep search trong objects
      wbIndex.forEach((board) => {
        try {
          const b = safeGetJSON(`sgk_wb_board_${board.id}`, null, (v) => v && typeof v === "object" && !Array.isArray(v));
          if (b && Array.isArray(b.objects)) {
            b.objects.forEach((o) => {
              if (o.text && matchesCfg(o.text)) {
                searchResults.push({
                  type: "whiteboard",
                  id: `${board.id}:${o.id}`,
                  title: o.text.slice(0, 40),
                  subtitle: `Trong "${board.name}"`,
                  icon: <Palette size={16} />,
                  action: () => onNavigateRef.current("whiteboard"),
                });
              }
            });
          }
        } catch (e) {
          console.warn("[GlobalSearch] safeGetJSON failed for sgk_wb_board_" + board.id, e);
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load whiteboards for search:", e);
    }

    // Search vocabulary notebook — sổ tay từ vựng (không dấu)
    if (canNav("vocab")) try {
      const vocab = safeGetJSON("sgk_vocab", [], Array.isArray);
      const MAX_VOCAB_HITS = 12;
      (Array.isArray(vocab) ? vocab : [])
        .filter(
          (v) =>
            v &&
            (matchesCfg(v.word) || matchesCfg(v.meaning) || matchesCfg(v.bookTitle)),
        )
        .slice(0, MAX_VOCAB_HITS)
        .forEach((v) => {
          // Lỗi #15: guard trong resolveVocabBookTitle — books undefined không được
          // ném TypeError làm mất toàn bộ nhóm vocab (bị catch nuốt im lặng).
          const bookTitle = resolveVocabBookTitle(v, books);
          const parts = ["Từ vựng"];
          if (v.meaning) parts.push(String(v.meaning).replace(/\s+/g, " ").slice(0, 60));
          if (bookTitle) parts.push(bookTitle);
          if (v.page) parts.push(`trang ${v.page}`);
          searchResults.push({
            type: "vocab",
            id: v.id,
            title: v.word,
            subtitle: parts.join(" • "),
            icon: <NotebookPen size={16} />,
            action: () => onNavigateRef.current("vocab", { query: v.word }),
          });
        });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load vocabulary for search:", e);
    }

    // Search notes — ghim trên trang, ghi chú bài học, ghi chú dạy học, đánh dấu CTGDPT, ghi chú so sánh (không dấu)
    try {
      const noteHits = searchNotes(q, books);
      const noteIconMap = {
        pin: <StickyNote size={16} />,
        structured: <NotebookPen size={16} />,
        teacher: <FileText size={16} />,
        mark: <Tag size={16} />,
        compare: <Layers size={16} />,
      };
      const MAX_NOTE_HITS = 24;
      noteHits.slice(0, MAX_NOTE_HITS).forEach((hit) => {
        const kindLabel = getNoteKindLabel(hit.kind);
        searchResults.push({
          type: "note",
          id: hit.id,
          title: hit.title || hit.snippet || "(ghi chú)",
          subtitle: `${hit.book.title} · Trang ${hit.displayPage} · ${kindLabel}${hit.snippet ? ` — ${hit.snippet.slice(0, 60)}` : ""}`,
          icon: noteIconMap[hit.kind] || <StickyNote size={16} />,
          action: () => onOpenBookRef.current(hit.book, hit.pdfPage),
        });
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load notes for search:", e);
    }

    // Giới hạn theo Cài đặt → Tìm kiếm → Số kết quả tối đa
    const limited = searchResults.slice(0, Math.max(10, Math.min(1000, Number(searchCfg.maxResults) || 100)));
    setResults(limited);
    setSelectedIndex(0);
    // Bổ sung async từ IDB (sau migrate LS trống): merge thêm kết quả board mà không trùng id
    if (canNav("whiteboard")) {
    try {
      const qSnapshot = q;
      import("./whiteboard/whiteboardIntegration.js").then(async (mod) => {
        try {
          if (qSnapshot !== effectiveQueryRef.current) return;
          const asyncIdx = mod.getWhiteboardIndexAsync ? await mod.getWhiteboardIndexAsync() : [];
          if (!Array.isArray(asyncIdx) || !asyncIdx.length) return;
          const cfg = getSearchConfig();
          const matchNow = (text) => applySearchConfig(qSnapshot, text, cfg);
          const seen = new Set(searchResults.map((r) => String(r.id)));
          const extra = [];
          for (const b of asyncIdx) {
            const bid = String(b.boardId || b.id || "").replace(/^wb:/, "");
            if (!bid || seen.has(bid) || seen.has(`wb:${bid}`)) continue;
            if (matchNow(b.title)) {
              seen.add(bid);
              extra.push({
                type: "whiteboard",
                id: bid,
                title: b.title,
                subtitle: `Bảng trắng • ${b.subtitle || ""}`,
                icon: <Palette size={16} />,
                action: () => onNavigateRef.current("whiteboard"),
              });
            }
          }
          if (extra.length) {
            setResults((prev) => {
              const prevIds = new Set(prev.map((r) => String(r.id)));
              const add = extra.filter((e) => !prevIds.has(String(e.id)));
              return add.length ? [...prev, ...add] : prev;
            });
          }
        } catch {}
      }).catch(() => {});
    } catch {}
    }
    };

    const timer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // KHÔNG để onNavigate/onOpenBook trong deps: đọc qua ref — App re-render với
    // callback mới không được kích hoạt quét lại (lỗi #10).
    // effectiveQuery đã trừ prefix lọc; commandMode ("...") không quét mà hiện lệnh.
  }, [effectiveQuery, parsed.commandMode, books]);

  // Handle keyboard navigation (results / recent / commands) + Ctrl+0..9 đổi filter
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      // Chỉ điều hướng khi overlay đang giữ focus — nếu focus nằm ngoài
      // (vd bảng lệnh reader mở đè lên), ↑↓/Enter phải thuộc về lớp đang gõ.
      const active = document.activeElement;
      if (!active || !active.closest || !active.closest(".global-search-overlay")) return;
      // Ctrl+0..9: đổi bộ lọc ngay khi đang gõ (không đụng Alt+1..8 điều hướng app)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[0-9]$/.test(e.key || "")) {
        const order = ["all", "toc", "book", "note", "vocab", "whiteboard", "lessonplan", "reference", "idea", "task"];
        const idx = Number(e.key);
        const target = order[idx];
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          // Bỏ prefix trong query để chip là nguồn duy nhất (tránh prefix thắng chip)
          setQuery((prev) => {
            const p = parseFilterPrefix(prev);
            return p.filter ? p.cleanQuery : prev;
          });
          setActiveFilter(target);
          setSelectedIndex(0);
        }
        return;
      }
      // Mode lệnh ">" — điều hướng trên visibleCommands
      if (isCommandMode) {
        const len = visibleCommands.length;
        if (!len) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % len);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + len) % len);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const c = visibleCommands[selectedIndex];
          if (c) {
            c.action();
            setIsOpen(false);
          }
        }
        return;
      }
      const isEmpty = !String(effectiveQuery || "").trim();
      if (isEmpty) {
        const len = recentSearches.length;
        if (!len) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % len);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + len) % len);
        } else if (e.key === "Enter" && len > 0) {
          e.preventDefault();
          const term = recentSearches[selectedIndex];
          if (term) setQuery(term);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => flatResults.length ? (prev + 1) % flatResults.length : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => flatResults.length ? (prev - 1 + flatResults.length) % flatResults.length : 0);
      } else if (e.key === "Enter" && flatResults.length > 0) {
        e.preventDefault();
        const r = flatResults[selectedIndex];
        if (r) {
          saveRecent(query);
          r.action();
          setIsOpen(false);
        }
      } else if (e.key === "Enter" && query.trim().length >= 2) {
        // lưu ngay cả khi không có kết quả để lần sau hiện recent
        e.preventDefault();
        saveRecent(query);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, flatResults, selectedIndex, query, effectiveQuery, isCommandMode, visibleCommands, recentSearches, activeFilter]);

  // Đổi filter (chip/prefix) → reset selection để Enter không rơi vào index cũ
  useEffect(() => {
    setSelectedIndex(0);
  }, [effectiveFilter, isCommandMode]);

  const handleResultClick = (result) => {
    saveRecent(query);
    result.action();
    setIsOpen(false);
  };

  const handleSelectRecent = (term) => {
    setQuery(term);
    // focus lại input để user có thể sửa tiếp hoặc enter
    setTimeout(() => inputRef.current?.focus(), 0);
    setSelectedIndex(0);
  };

  const handleRemoveRecent = (term) => {
    const updated = removeRecentSearch(term);
    setRecentSearches(updated);
    setSelectedIndex(0);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
    setSelectedIndex(0);
  };

  const handleFilterPick = (id) => {
    setActiveFilter(id);
    setSelectedIndex(0);
    // Nếu query đang giữ prefix ("sach: ...") thì bóc prefix để chip là nguồn duy nhất
    setQuery((prev) => {
      const p = parseFilterPrefix(prev);
      if (p.filter) return p.cleanQuery;
      return prev;
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const getTypeLabel = (type) => {
    const labels = {
      toc: "Mục lục",
      book: "Sách",
      note: "Ghi chú",
      vocab: "Từ vựng",
      idea: "Ý tưởng",
      task: "Nhiệm vụ",
      lessonplan: "Giáo án",
      activity: "Hoạt động",
      question: "Câu hỏi",
      worksheet: "Phiếu học tập",
      reference: "Tham khảo",
      concept: "Khái niệm",
      collection: "Bộ sưu tập",
      whiteboard: "Bảng trắng",
    };
    return labels[type] || type;
  };

  if (!isOpen) return null;

  // Combo phím theo Settings — dùng cho toàn bộ hint trong overlay
  const shortcutPalette = getShortcut("global.commandPalette");
  const shortcutClose = getShortcut("global.close");

  // a11y (#11): id option đang highlight để input (combobox) trỏ aria-activedescendant
  const isEmptyQuery = String(effectiveQuery || "").trim() === "";
  const activeId = isEmptyQuery && !isCommandMode
    ? recentSearches[selectedIndex] != null
      ? `gs-recent-${selectedIndex}`
      : undefined
    : (isCommandMode ? visibleCommands[selectedIndex] : flatResults[selectedIndex])
      ? `gs-opt-${selectedIndex}`
      : undefined;

  // Chips lọc — compact: 10 nhóm đầu + "…" gom 4 nhóm còn lại vào Tất cả theo counts
  const CHIP_ORDER = ["all", "toc", "book", "note", "vocab", "whiteboard", "lessonplan", "reference", "idea", "task"];
  const filterBar = (
    <div className="gs-filterbar" role="tablist" aria-label="Lọc kết quả theo loại">
      {CHIP_ORDER.map((id, i) => {
        const def = FILTER_DEFS.find((f) => f.id === id);
        if (!def) return null;
        const count = id === "all" ? results.length : (typeCounts[id] || 0);
        const isActive = effectiveFilter === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            title={id === "all" ? "Hiện tất cả (Ctrl+0)" : `${def.label} — gõ "${(def.aliases[0] || id)}:" hoặc Ctrl+${i}`}
            className={`gs-chip ${isActive ? "active" : ""} ${count === 0 && results.length > 0 && id !== "all" ? "empty" : ""}`}
            onClick={() => handleFilterPick(id)}
          >
            {def.label}
            <span className="gs-chip-count">{count}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="global-search-overlay" role="none" onClick={() => setIsOpen(false)}>
      <div
        className="global-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tìm kiếm toàn cục"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="global-search-header">
          <div className="global-search-input-wrapper">
            <Search size={18} aria-hidden="true" />
            <input
              ref={inputRef}
              id="global-search-input"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="global-search-listbox"
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              aria-label="Ô tìm kiếm toàn cục"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
              placeholder="Tìm kiếm... (sach: / vocab: / ghi chu: để lọc · > để chạy lệnh)"
              className="global-search-input"
            />
            <KbdCombo combo={shortcutClose} k="close" />
          </div>
          <button className="btn btn-icon" aria-label="Đóng tìm kiếm" onClick={() => setIsOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {filterBar}

        <div className="global-search-body">
          {isCommandMode ? (
            visibleCommands.length === 0 ? (
              <div className="global-search-empty" role="status">
                <Search size={32} />
                <p>Không có lệnh nào khớp “{effectiveQuery}”</p>
                <p className="global-search-hint">Gõ “&gt;” để xem tất cả lệnh · ví dụ “&gt;giao an”</p>
              </div>
            ) : (
              <div className="global-search-results" id="global-search-listbox" role="listbox" aria-label="Lệnh nhanh">
                <div className="global-search-group">
                  <div className="global-search-group-header">
                    <span className="global-search-group-label">Lệnh nhanh</span>
                    <span className="global-search-group-count">{visibleCommands.length} lệnh</span>
                  </div>
                  {visibleCommands.map((cmd, idx) => (
                    <button
                      key={cmd.id}
                      role="option"
                      id={`gs-opt-${idx}`}
                      aria-selected={idx === selectedIndex}
                      className={`global-search-result ${idx === selectedIndex ? "selected" : ""}`}
                      onClick={() => { cmd.action(); setIsOpen(false); }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="global-search-result-icon">⚡</span>
                      <div className="global-search-result-content">
                        <div className="global-search-result-title">
                          <HighlightedText text={cmd.title} query={effectiveQuery} />
                        </div>
                        <div className="global-search-result-subtitle">{cmd.subtitle}</div>
                      </div>
                      <span className="global-search-result-type">Lệnh</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : isEmptyQuery ? (
            recentSearches.length > 0 ? (
              <div className="global-search-recent">
                <div className="global-search-recent-header">
                  <span className="global-search-recent-title"><Clock size={14} /> Tìm kiếm gần đây</span>
                  <button className="global-search-recent-clear" onClick={handleClearRecent} title="Xóa tất cả lịch sử tìm kiếm">
                    <Trash2 size={12} /> Xóa tất cả
                  </button>
                </div>
                <div className="global-search-recent-list" id="global-search-listbox" role="listbox" aria-label="Tìm kiếm gần đây">
                  {recentSearches.map((term, idx) => (
                    <div
                      key={term}
                      role="option"
                      id={`gs-recent-${idx}`}
                      aria-selected={idx === selectedIndex}
                      className={`global-search-recent-item ${idx === selectedIndex ? "selected" : ""}`}
                    >
                      <button className="global-search-recent-btn" onClick={() => handleSelectRecent(term)} title={`Tìm lại: ${term}`}>
                        <Clock size={14} className="recent-icon" />
                        <span className="recent-term">{term}</span>
                      </button>
                      <button className="global-search-recent-remove" aria-label={`Xóa ${term}`} onClick={(e) => { e.stopPropagation(); handleRemoveRecent(term); }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="global-search-empty" style={{ paddingTop: 12, paddingBottom: 4 }}>
                  <p className="global-search-hint">
                    <KbdCombo combo={shortcutPalette} k="open" /> để mở tìm kiếm · <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> <kbd className="kbd">Enter</kbd> để chọn
                  </p>
                </div>
              </div>
            ) : (
              <div className="global-search-empty">
                <Search size={32} />
                <p>Nhập từ khóa để tìm kiếm</p>
                <p className="global-search-hint">
                  <KbdCombo combo={shortcutPalette} k="open2" /> để mở tìm kiếm
                </p>
                <p className="global-search-hint" style={{ fontSize: 11, marginTop: 4 }}>Lịch sử tìm kiếm sẽ hiện ở đây sau khi bạn tìm kiếm</p>
                <p className="global-search-hint" style={{ fontSize: 11, marginTop: 4 }}>
                  Mẹo: gõ <code>sach: toán</code> để chỉ tìm sách · <code>vocab: dog</code> chỉ tìm từ vựng · <code>&gt;giao an</code> chạy lệnh nhanh · <code>Ctrl+1…9</code> đổi bộ lọc
                </p>
              </div>
            )
          ) : flatResults.length === 0 ? (
            <div className="global-search-empty" role="status">
              <Search size={32} />
              <p>{effectiveFilter !== "all" && results.length > 0
                ? `Không có kết quả trong nhóm “${getTypeLabel(effectiveFilter)}” — có ${results.length} kết quả ở nhóm khác`
                : "Không tìm thấy kết quả"}</p>
              {effectiveFilter !== "all" && results.length > 0 && (
                <button className="btn btn-secondary btn-xs" onClick={() => handleFilterPick("all")}>
                  Xem tất cả {results.length} kết quả
                </button>
              )}
              <p className="global-search-hint" style={{ marginTop: 8 }}>Thử gõ không dấu hoặc bỏ bộ lọc <code>sach:</code></p>
            </div>
          ) : (
            <div className="global-search-results" id="global-search-listbox" role="listbox" aria-label="Kết quả tìm kiếm">
              {(() => {
                // Cùng một thứ tự với flatResults (useMemo) — index === item được Enter chọn
                let flatIdx = 0;
                return displayGroups.map((group) => (
                  <div key={group.type} className="global-search-group">
                    <div className="global-search-group-header">
                      <span className="global-search-group-label">{getTypeLabel(group.type)}</span>
                      <span className="global-search-group-count">{group.items.length} kết quả</span>
                    </div>
                    {group.items.map((result) => {
                      const currentFlat = flatIdx++;
                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          role="option"
                          id={`gs-opt-${currentFlat}`}
                          aria-selected={currentFlat === selectedIndex}
                          className={`global-search-result ${currentFlat === selectedIndex ? "selected" : ""}`}
                          onClick={() => handleResultClick(result)}
                          onMouseEnter={() => setSelectedIndex(currentFlat)}
                        >
                          <span className="global-search-result-icon">{result.icon}</span>
                          <div className="global-search-result-content">
                            <div className="global-search-result-title"><HighlightedText text={result.title} query={effectiveQuery} /></div>
                            <div className="global-search-result-subtitle"><HighlightedText text={result.subtitle} query={effectiveQuery} /></div>
                          </div>
                          <span className="global-search-result-type">{getTypeLabel(result.type)}</span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {(flatResults.length > 0 || isCommandMode) && (
          <div className="global-search-footer">
            <span>
              {isCommandMode
                ? `${visibleCommands.length} lệnh`
                : effectiveFilter === "all"
                  ? `${flatResults.length} kết quả`
                  : `${flatResults.length}/${results.length} · ${getTypeLabel(effectiveFilter)}`}
            </span>
            <span className="global-search-hint">
              <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> <kbd className="kbd">Enter</kbd> chọn · <kbd className="kbd">Ctrl+1–9</kbd> lọc · <kbd className="kbd">&gt;</kbd> lệnh
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
