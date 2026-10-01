import React, { useState, useEffect, useRef } from "react";
import { Search, X, BookOpen, Lightbulb, FileText, Puzzle, Database, ListChecks, Library, NotebookPen, Scissors, ClipboardCheck, School, Palette, Layers, Bookmark, StickyNote, Tag, Clock, Trash2 } from "lucide-react";
import { findTocBook } from "./tocData.js";
import { getShortcut, matchesShortcut } from "./keyboardShortcuts.js";
import { safeGetJSON, safeGetString } from "./safeStorage";
import { searchNotes, getNoteKindLabel } from "./noteSearch.js";
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from "./searchRecent.js";

// Chuẩn hoá không dấu để tìm kiếm tiếng Việt linh hoạt: "bai 1" khớp "Bài 1", "tieng viet" khớp "Tiếng Việt"
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

export default function GlobalSearch({ books, onNavigate, onOpenBook }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches());
  const inputRef = useRef(null);

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
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === "Escape") {
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

  // Search across all data types — hỗ trợ không dấu + mục lục
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchQuery = query.toLowerCase();
    const searchQueryNorm = normalizeSearch(query);
    const searchResults = [];

    // Search books (không dấu)
    if (books) {
      books.forEach((book) => {
        if (normIncludes(book.title, searchQueryNorm) || normIncludes(book.subject, searchQueryNorm) || normIncludes(book.publisher, searchQueryNorm)) {
          searchResults.push({
            type: "book",
            id: book.id || book.filename,
            title: book.title,
            subtitle: book.subject || book.publisher || "",
            icon: <BookOpen size={16} />,
            action: () => onOpenBook(book),
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
            if (!normIncludes(haystack, searchQueryNorm)) return;
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
              action: () => onOpenBook(book, pdfPage),
            });
            tocHits++;
          });
        });
      } catch (e) {
        console.warn("[GlobalSearch] TOC search failed:", e);
      }
    }

    // Search ideas (không dấu)
    try {
      const ideas = safeGetJSON("sgk_ideas", [], Array.isArray);
      ideas.forEach((idea) => {
        if (normIncludes(idea.title, searchQueryNorm) || normIncludes(idea.description, searchQueryNorm)) {
          searchResults.push({
            type: "idea",
            id: idea.id,
            title: idea.title,
            subtitle: idea.subject || idea.grade || "",
            icon: <Lightbulb size={16} />,
            action: () => onNavigate("ideas"),
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
        if (normIncludes(task.title, searchQueryNorm) || normIncludes(task.description, searchQueryNorm)) {
          searchResults.push({
            type: "task",
            id: task.id,
            title: task.title,
            subtitle: task.category || task.priority || "",
            icon: <ClipboardCheck size={16} />,
            action: () => onNavigate("tasks", { tab: "tasks" }),
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
        if (normIncludes(plan.title, searchQueryNorm) || normIncludes(plan.monHoc, searchQueryNorm)) {
          searchResults.push({
            type: "lessonplan",
            id: plan.id,
            title: plan.title,
            subtitle: plan.monHoc ? `${plan.monHoc}${plan.lop ? ` · Lớp ${plan.lop}` : ""}` : "",
            icon: <FileText size={16} />,
            action: () => onNavigate("lessonplans", { planId: plan.id }),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load lesson plans for search:", e);
    }

    // Search activities (không dấu)
    try {
      const activities = safeGetJSON("sgk_activities", [], Array.isArray);
      activities.forEach((activity) => {
        if (normIncludes(activity.title, searchQueryNorm) || normIncludes(activity.description, searchQueryNorm)) {
          searchResults.push({
            type: "activity",
            id: activity.id,
            title: activity.title,
            subtitle: activity.subject || "",
            icon: <Puzzle size={16} />,
            action: () => onNavigate("activities"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load activities for search:", e);
    }

    // Search questions (không dấu)
    try {
      const questions = safeGetJSON("sgk_questions", [], Array.isArray);
      questions.forEach((question) => {
        if (normIncludes(question.question, searchQueryNorm) || normIncludes(question.subject, searchQueryNorm)) {
          searchResults.push({
            type: "question",
            id: question.id,
            title: question.question,
            subtitle: question.subject || question.level || "",
            icon: <Database size={16} />,
            action: () => onNavigate("questionbank"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load questions for search:", e);
    }

    // Search worksheets (không dấu)
    try {
      const worksheets = safeGetJSON("sgk_worksheets", [], Array.isArray);
      worksheets.forEach((worksheet) => {
        if (normIncludes(worksheet.title, searchQueryNorm) || normIncludes(worksheet.subject, searchQueryNorm)) {
          searchResults.push({
            type: "worksheet",
            id: worksheet.id,
            title: worksheet.title,
            subtitle: worksheet.subject || "",
            icon: <ListChecks size={16} />,
            action: () => onNavigate("worksheets"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load worksheets for search:", e);
    }

    // Search references — canonical sgk_refs, fallback legacy sgk_references (migration, không xóa legacy nếu có dữ liệu cũ §17)
    try {
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
        if (normIncludes(ref.title, searchQueryNorm) || normIncludes(ref.author, searchQueryNorm)) {
          searchResults.push({
            type: "reference",
            id: ref.id,
            title: ref.title,
            subtitle: ref.author || ref.year || "",
            icon: <Library size={16} />,
            action: () => onNavigate("references"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load references for search:", e);
    }

    // Search concepts (không dấu)
    try {
      const concepts = safeGetJSON("sgk_concepts", [], Array.isArray);
      concepts.forEach((concept) => {
        if (normIncludes(concept.term, searchQueryNorm) || normIncludes(concept.definition, searchQueryNorm)) {
          searchResults.push({
            type: "concept",
            id: concept.id,
            title: concept.term,
            subtitle: concept.category || "",
            icon: <NotebookPen size={16} />,
            action: () => onNavigate("concepts"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load concepts for search:", e);
    }

    // Search collections (không dấu)
    try {
      const collections = safeGetJSON("sgk_collections", [], Array.isArray);
      collections.forEach((collection) => {
        if (normIncludes(collection.title, searchQueryNorm) || normIncludes(collection.description, searchQueryNorm)) {
          searchResults.push({
            type: "collection",
            id: collection.id,
            title: collection.title,
            subtitle: collection.description || "",
            icon: <Scissors size={16} />,
            action: () => onNavigate("collections"),
          });
        }
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load collections for search:", e);
    }

    // Search whiteboards — liên kết chung (không dấu)
    try {
      const wbIndex = safeGetJSON("sgk_wb_index", [], Array.isArray);
      wbIndex.forEach((board) => {
        if (normIncludes(board.name, searchQueryNorm)) {
          searchResults.push({
            type: "whiteboard",
            id: board.id,
            title: board.name,
            subtitle: `Bảng trắng • ${new Date(board.updatedAt).toLocaleDateString("vi-VN")}`,
            icon: <Palette size={16} />,
            action: () => onNavigate("whiteboard"),
          });
        }
      });
      // deep search trong objects
      wbIndex.forEach((board) => {
        try {
          const b = safeGetJSON(`sgk_wb_board_${board.id}`, null, (v) => v && typeof v === "object" && !Array.isArray(v));
          if (b && Array.isArray(b.objects)) {
            b.objects.forEach((o) => {
              if (o.text && normIncludes(o.text, searchQueryNorm)) {
                searchResults.push({
                  type: "whiteboard",
                  id: `${board.id}:${o.id}`,
                  title: o.text.slice(0, 40),
                  subtitle: `Trong "${board.name}"`,
                  icon: <Palette size={16} />,
                  action: () => onNavigate("whiteboard"),
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

    // Search notes — ghim trên trang, ghi chú bài học, ghi chú dạy học, đánh dấu CTGDPT, ghi chú so sánh (không dấu)
    try {
      const noteHits = searchNotes(query, books);
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
          action: () => onOpenBook(hit.book, hit.pdfPage),
        });
      });
    } catch (e) {
      console.warn("[GlobalSearch] Failed to load notes for search:", e);
    }

    setResults(searchResults);
    setSelectedIndex(0);
  }, [query, books, onNavigate, onOpenBook]);

  // Handle keyboard navigation (results hoặc recent)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      const isEmpty = !query.trim();
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
        setSelectedIndex((prev) => results.length ? (prev + 1) % results.length : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => results.length ? (prev - 1 + results.length) % results.length : 0);
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        const r = results[selectedIndex];
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
  }, [isOpen, results, selectedIndex, query, recentSearches]);

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

  const getTypeLabel = (type) => {
    const labels = {
      toc: "Mục lục",
      book: "Sách",
      note: "Ghi chú",
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

  return (
    <div className="global-search-overlay" onClick={() => setIsOpen(false)}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="global-search-header">
          <div className="global-search-input-wrapper">
            <Search size={18} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm mục lục, sách, ghi chú, bảng trắng, ý tưởng, giáo án... (gõ không dấu vẫn ra)"
              className="global-search-input"
            />
            <kbd className="kbd">ESC</kbd>
          </div>
          <button className="btn btn-icon" onClick={() => setIsOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="global-search-body">
          {query.trim() === "" ? (
            recentSearches.length > 0 ? (
              <div className="global-search-recent">
                <div className="global-search-recent-header">
                  <span className="global-search-recent-title"><Clock size={14} /> Tìm kiếm gần đây</span>
                  <button className="global-search-recent-clear" onClick={handleClearRecent} title="Xóa tất cả lịch sử tìm kiếm">
                    <Trash2 size={12} /> Xóa tất cả
                  </button>
                </div>
                <div className="global-search-recent-list">
                  {recentSearches.map((term, idx) => (
                    <div key={term} className={`global-search-recent-item ${idx === selectedIndex ? "selected" : ""}`}>
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
                    <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd> để mở tìm kiếm · <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> <kbd className="kbd">Enter</kbd> để chọn
                  </p>
                </div>
              </div>
            ) : (
              <div className="global-search-empty">
                <Search size={32} />
                <p>Nhập từ khóa để tìm kiếm</p>
                <p className="global-search-hint">
                  <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd> để mở tìm kiếm
                </p>
                <p className="global-search-hint" style={{ fontSize: 11, marginTop: 4 }}>Lịch sử tìm kiếm sẽ hiện ở đây sau khi bạn tìm kiếm</p>
              </div>
            )
          ) : results.length === 0 ? (
            <div className="global-search-empty">
              <Search size={32} />
              <p>Không tìm thấy kết quả</p>
            </div>
          ) : (
            <div className="global-search-results">
              {(() => {
                const grouped = results.reduce((acc, r) => {
                  (acc[r.type] = acc[r.type] || []).push(r);
                  return acc;
                }, {});
                const order = ["toc", "book", "note", "whiteboard", "lessonplan", "reference", "idea", "task", "activity", "question", "worksheet", "concept", "collection"];
                const sortedTypes = Object.keys(grouped).sort((a, b) => order.indexOf(a) - order.indexOf(b));
                let flatIdx = 0;
                return sortedTypes.map((type) => (
                  <div key={type} className="global-search-group">
                    <div className="global-search-group-header">
                      <span className="global-search-group-label">{getTypeLabel(type)}</span>
                      <span className="global-search-group-count">{grouped[type].length} kết quả</span>
                    </div>
                    {grouped[type].map((result) => {
                      const currentFlat = flatIdx++;
                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          className={`global-search-result ${currentFlat === selectedIndex ? "selected" : ""}`}
                          onClick={() => handleResultClick(result)}
                        >
                          <span className="global-search-result-icon">{result.icon}</span>
                          <div className="global-search-result-content">
                            <div className="global-search-result-title">{result.title}</div>
                            <div className="global-search-result-subtitle">{result.subtitle}</div>
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

        {results.length > 0 && (
          <div className="global-search-footer">
            <span>{results.length} kết quả</span>
            <span className="global-search-hint">
              <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> để điều hướng, <kbd className="kbd">Enter</kbd> để chọn
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
