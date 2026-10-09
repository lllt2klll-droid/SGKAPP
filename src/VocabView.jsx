import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  Trash2,
  BookOpen,
  Sparkles,
  NotebookPen,
  Plus,
  FileSpreadsheet,
  FileText,
  Check,
  Square,
  ListChecks,
  BarChart3,
  Table2,
  Loader2,
  Pencil,
  Tag,
  RotateCcw,
} from "lucide-react";
import DataTable from "./DataTable";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { loadSettings } from "./settingsStore";
import { exportCsv, exportWord } from "./exportDoc";
import { addQuestion } from "./teachingDB";
import { moveToTrash, TRASH_TYPE } from "./trashStore";
import { restoreVocabEntries, formatDateTime } from "./userdata";
import { fillSampleVocab } from "./sampleData";
import {
  filterVocabEntries,
  collectTags,
  computeVocabStats,
  computeDaySeries,
  entriesNeedingMeaning,
  buildCsvRows,
  buildVocabDocHtml,
  buildMcQuestions,
  buildExplainPrompt,
  buildQuestionPrompt,
  parseAiMeanings,
  parseAiQuestions,
  lookupMeaning,
  normalizeTags,
  tagsToString,
  chunked,
} from "./vocabService";

const AI_BATCH_SIZE = 10;
const AI_QUESTION_MAX = 20;

export default function VocabView({
  vocab,
  books,
  geminiKey,
  onOpenBook,
  onRemove,
  onUpdateMeaning,
  onUpdate,
  onSave,
  onChanged,
  notify,
  initialQuery = "",
  onQueryConsumed,
}) {
  const [tab, setTab] = useState("table");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [fileFilter, setFileFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [dayRange, setDayRange] = useState(7);

  const [aiProgress, setAiProgress] = useState(null); // { done, total }
  const [aiRunning, setAiRunning] = useState(false);
  const [aiQuestionRunning, setAiQuestionRunning] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);
  // requestId của callAI đang chạy → nút Dừng hủy được request đang gửi (không phải đợi hết timeout)
  const activeRequestRef = useRef(null);
  const cancelActiveAi = () => {
    cancelRef.current = true;
    if (activeRequestRef.current) aiService.cancelRequest(activeRequestRef.current);
  };

  const [form, setForm] = useState(null); // { id?, word, meaning, file, page, grade, tags }
  const [editingMeaningId, setEditingMeaningId] = useState(null);
  const [meaningDraft, setMeaningDraft] = useState("");

  const byFilename = useMemo(() => new Map(books.map((b) => [b.filename, b])), [books]);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    setTab("table");
    if (typeof onQueryConsumed === "function") onQueryConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev;
      const alive = new Set(vocab.map((v) => v.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [vocab]);

  const filtered = useMemo(
    () => filterVocabEntries(vocab, { query, file: fileFilter, missingMeaning: missingOnly, tag: tagFilter }),
    [vocab, query, fileFilter, missingOnly, tagFilter],
  );

  const selected = useMemo(() => vocab.filter((e) => selectedIds.has(e.id)), [vocab, selectedIds]);
  const stats = useMemo(() => computeVocabStats(vocab), [vocab]);
  const daySeries = useMemo(() => computeDaySeries(vocab, dayRange), [vocab, dayRange]);
  const tags = useMemo(() => collectTags(vocab), [vocab]);

  const say = (text, undo) => {
    if (typeof notify === "function") notify(text, undo);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((e) => prev.has(e.id));
      if (allSelected) return new Set();
      return new Set(filtered.map((e) => e.id));
    });
  };

  const autoFillVocab = () => {
    const n = fillSampleVocab(books);
    onChanged();
    say(
      n ? `Đã thêm ${n} từ vựng mẫu vào sổ tay.` : "Không thêm mới: các từ mẫu đã có sẵn trong sổ tay rồi.",
    );
  };

  // ── Xóa / khôi phục ────────────────────────────────────────────
  const trashEntries = (entries, label) => {
    if (!entries.length) return;
    const trashed = moveToTrash({
      type: TRASH_TYPE.VOCAB,
      label,
      meta: { count: entries.length },
      payload: { entries },
    });
    const ids = new Set(entries.map((e) => e.id));
    entries.forEach((e) => onRemove(e.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    onChanged();
    say(
      trashed
        ? `Đã đưa ${entries.length} từ vào Thùng rác (giữ 30 ngày).`
        : `Đã xóa ${entries.length} từ (thùng rác đầy — không khôi phục được).`,
      trashed
        ? () => {
            const back = restoreVocabEntries(entries);
            onChanged();
            say(`Đã hoàn tác — ${entries.length} từ đã trở lại sổ tay (${back.length} mục).`);
          }
        : null,
    );
  };

  const removeOne = (entry) => trashEntries([entry], `"${entry.word}"`);

  const clearAll = () => {
    if (!vocab.length) return;
    if (!confirm("Xóa toàn bộ sổ tay từ vựng? (vào Thùng rác, giữ 30 ngày)")) return;
    trashEntries([...vocab], `Toàn bộ sổ tay (${vocab.length} từ)`);
  };

  const removeSelected = () => {
    if (!selected.length) return;
    trashEntries(selected, `${selected.length} từ vựng`);
  };

  // ── Thêm / sửa ────────────────────────────────────────────────
  const openAddForm = () => {
    setForm({ word: "", meaning: "", file: "", page: "", grade: "", tags: "" });
  };

  const openEditForm = (entry) => {
    setForm({
      id: entry.id,
      word: entry.word || "",
      meaning: entry.meaning || "",
      file: entry.file || "",
      page: entry.page || "",
      grade: entry.grade || "",
      tags: tagsToString(entry.tags),
    });
  };

  const submitForm = () => {
    const word = String(form.word || "").trim();
    if (!word) {
      setError("Thiếu từ cần lưu.");
      return;
    }
    const book = form.file ? byFilename.get(form.file) : null;
    const payload = {
      word: word.slice(0, 80),
      meaning: String(form.meaning || "").trim(),
      file: form.file || "",
      bookTitle: book?.title || "",
      grade: Number(form.grade) || book?.grade || null,
      page: Number(form.page) || null,
      tags: normalizeTags(form.tags),
    };
    if (form.id) {
      onUpdate(form.id, payload);
      say(`Đã cập nhật "${payload.word}".`);
    } else {
      onSave(payload);
      say(`Đã thêm "${payload.word}" vào sổ tay từ vựng. 📓`);
    }
    setForm(null);
    setError("");
    onChanged();
  };

  const saveMeaningInline = (id) => {
    const value = meaningDraft.trim();
    setEditingMeaningId(null);
    if (!value) return;
    onUpdateMeaning(id, value);
    onChanged();
  };

  // ── AI ─────────────────────────────────────────────────────────
  const currentModel = () => {
    try {
      return loadSettings().ai?.model || "gemini-2.5-flash";
    } catch {
      return "gemini-2.5-flash";
    }
  };

  const explainOne = async (entry) => {
    if (!geminiKey || aiRunning || aiQuestionRunning) return;
    setAiRunning(true);
    setError("");
    const requestId = `vocab_one_${entry.id}_${Date.now()}`;
    activeRequestRef.current = requestId;
    try {
      const text = await aiService.callAI({
        apiKey: geminiKey,
        model: currentModel(),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildExplainPrompt([entry], entry.grade),
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: "Bạn là trợ lý từ điển sư phạm tiểu học, trả về đúng định dạng JSON được yêu cầu." }],
        },
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
        timeout: 60000,
        maxRetries: 2,
        requestId,
      });
      const map = parseAiMeanings(text);
          const meaning = lookupMeaning(map, entry.word);
      if (meaning) {
        onUpdateMeaning(entry.id, meaning);
        onChanged();
        say(`Đã giải nghĩa "${entry.word}".`);
      } else {
        setError("AI không trả về nghĩa hợp lệ cho từ này.");
      }
    } catch (e) {
      if (e?.code === "CANCELLED") say("Đã dừng giải nghĩa từ này.");
      else setError(getFriendlyErrorMessage(e.status, e.message) || "Không thể giải nghĩa.");
    } finally {
      activeRequestRef.current = null;
      setAiRunning(false);
    }
  };

  const runBatchExplain = async () => {
    if (!geminiKey) {
      setError("Cần cấu hình Gemini ở Cài đặt AI để giải nghĩa.");
      return;
    }
    const scope = selected.length ? selected : filtered;
    const targets = entriesNeedingMeaning(scope, selected.length ? [...selectedIds] : null);
    if (!targets.length) {
      say("Không có từ nào thiếu nghĩa trong phạm vi chọn/lọc.");
      return;
    }
    cancelRef.current = false;
    setAiRunning(true);
    setError("");
    const chunks = chunked(targets, AI_BATCH_SIZE);
    let done = 0;
    setAiProgress({ done: 0, total: targets.length });
    const failed = [];
    try {
      for (const chunk of chunks) {
        if (cancelRef.current) break;
        const grade = chunk.find((c) => c.grade)?.grade || null;
        const requestId = `vocab_batch_${Date.now()}_${done}`;
        activeRequestRef.current = requestId;
        // Catch từng lô: một lô lỗi không được làm hỏng cả loạt
        try {
          const text = await aiService.callAI({
            apiKey: geminiKey,
            model: currentModel(),
            contents: [{ role: "user", parts: [{ text: buildExplainPrompt(chunk, grade) }] }],
            systemInstruction: {
              parts: [
                { text: "Bạn là trợ lý từ điển sư phạm tiểu học, trả về đúng định dạng JSON được yêu cầu." },
              ],
            },
            generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
            timeout: 90000,
            maxRetries: 2,
            requestId,
          });
          const map = parseAiMeanings(text);
          for (const entry of chunk) {
      const meaning = lookupMeaning(map, entry.word);
            if (meaning) {
              onUpdateMeaning(entry.id, meaning);
              done += 1;
            }
          }
          onChanged();
          setAiProgress({ done, total: targets.length });
        } catch (e) {
          failed.push(e);
          const code = e?.code;
          // Dừng chủ động hoặc lỗi không thể khắc phục (thiếu key/sai nội dung) → thoát vòng lặp
          if (code === "CANCELLED" || code === "NO_API_KEY" || code === "INVALID_CONTENTS") break;
        } finally {
          activeRequestRef.current = null;
        }
      }
      // Người dừng không phải lỗi → không được hiện báo đỏ
      const realErrors = failed.filter((e) => e?.code !== "CANCELLED");
      if (realErrors.length) {
        const first = realErrors[0];
        const partial = done > 0 ? ` (đã giải nghĩa ${done}/${targets.length} từ trước đó)` : "";
        const more = realErrors.length > 1 ? `; ${realErrors.length} lô thất bại` : "";
        setError(`${getFriendlyErrorMessage(first.status, first.message)}${partial}${more}`);
      } else {
        say(
          cancelRef.current
            ? `Đã dừng — giải nghĩa được ${done}/${targets.length} từ.`
            : `Đã giải nghĩa ${done}/${targets.length} từ.`,
        );
      }
    } catch (e) {
      setError(getFriendlyErrorMessage(e.status, e.message) || "Lỗi khi giải nghĩa hàng loạt.");
    } finally {
      setAiRunning(false);
      setAiProgress(null);
      cancelRef.current = false;
      activeRequestRef.current = null;
    }
  };

  const createMcQuestions = () => {
    const scope = selected.length ? selected : [];
    if (!scope.length) {
      say("Hãy chọn các dòng cần tạo câu hỏi trước.");
      return;
    }
    const { questions, skipped } = buildMcQuestions(scope, AI_QUESTION_MAX);
    let added = 0;
    for (const q of questions) {
      try {
        addQuestion({
          type: q.type,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          answer: "",
          answerGuide: "",
          subject: "",
          grade: q.grade,
          chapter: "",
          yccd: "",
          mucdo: "",
        });
        added += 1;
      } catch (e) {
        console.warn("[VocabView] addQuestion failed", e);
      }
    }
    say(
      `Đã tạo ${added} câu trắc nghiệm vào Ngân hàng câu hỏi` +
        (skipped.length ? ` (bỏ qua ${skipped.length} từ chưa đủ phương án).` : "."),
    );
  };

  const createAiQuestions = async () => {
    const scope = selected.slice(0, AI_QUESTION_MAX);
    if (!scope.length) {
      say("Hãy chọn các dòng cần tạo câu hỏi trước.");
      return;
    }
    if (!geminiKey) {
      setError("Cần cấu hình Gemini ở Cài đặt AI để AI soạn câu hỏi.");
      return;
    }
    const firstBook = byFilename.get(scope[0].file);
    setAiQuestionRunning(true);
    setError("");
    try {
      const text = await aiService.callAI({
        apiKey: geminiKey,
        model: currentModel(),
        contents: [
          {
            role: "user",
            parts: [{ text: buildQuestionPrompt(scope, firstBook?.title || scope[0].bookTitle, scope[0].grade) }],
          },
        ],
        systemInstruction: {
          parts: [
            { text: "Bạn là giáo viên tiểu học soạn câu trắc nghiệm. Luôn trả về mảng JSON hợp lệ." },
          ],
        },
        generationConfig: { temperature: 0.4, maxOutputTokens: 2500 },
        timeout: 90000,
        maxRetries: 2,
        requestId: `vocab_aiq_${Date.now()}`,
      });
      const { questions, failed } = parseAiQuestions(text);
      let added = 0;
      for (const q of questions) {
        try {
          addQuestion({
            ...q,
            answer: "",
            answerGuide: "",
            subject: "",
            grade: Number(scope[0].grade) || null,
            chapter: "",
            yccd: "",
            mucdo: "",
          });
          added += 1;
        } catch (e) {
          console.warn("[VocabView] addQuestion (AI) failed", e);
        }
      }
      if (!added) {
        setError("AI chưa trả về câu hỏi hợp lệ. Thử lại nhé.");
      } else {
        say(
          `AI đã soạn ${added} câu trắc nghiệm vào Ngân hàng câu hỏi` +
            (failed > 0 ? ` (${failed} câu lỗi bị bỏ qua).` : "."),
        );
      }
    } catch (e) {
      setError(getFriendlyErrorMessage(e.status, e.message) || "AI soạn câu hỏi thất bại.");
    } finally {
      setAiQuestionRunning(false);
    }
  };

  // ── Xuất dữ liệu ──────────────────────────────────────────────
  const exportTitle = () => {
    if (fileFilter) {
      const b = byFilename.get(fileFilter);
      if (b) return `Từ vựng ${b.title}`;
    }
    return "Sổ tay từ vựng";
  };

  const doExportCsv = () => {
    if (!filtered.length) {
      say("Không có dữ liệu để xuất.");
      return;
    }
    exportCsv(exportTitle(), buildCsvRows(filtered, byFilename));
    say(`Đã xuất ${filtered.length} từ ra CSV.`);
  };

  const doExportWord = () => {
    if (!filtered.length) {
      say("Không có dữ liệu để xuất.");
      return;
    }
    exportWord(exportTitle(), buildVocabDocHtml(filtered, byFilename, { title: exportTitle() }));
    say(`Đã xuất ${filtered.length} từ ra Word.`);
  };

  // ── Cột bảng ──────────────────────────────────────────────────
  const columns = [
    {
      key: "_sel",
      label: "Chọn",
      width: "54px",
      align: "center",
      render: (_, row) => (
        <button
          className={`vocab-select-btn${selectedIds.has(row.id) ? " on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(row.id);
          }}
          aria-label={selectedIds.has(row.id) ? "Bỏ chọn" : "Chọn"}
          aria-pressed={selectedIds.has(row.id)}
        >
          {selectedIds.has(row.id) ? <Check size={13} /> : <Square size={13} />}
        </button>
      ),
    },
    {
      key: "word",
      label: "Từ",
      sortable: true,
      render: (v) => <span className="vocab-word-cell">{v}</span>,
    },
    {
      key: "meaning",
      label: "Nghĩa / ghi chú",
      sortable: true,
      render: (v, row) =>
        editingMeaningId === row.id ? (
          <textarea
            className="form-control vocab-meaning-edit"
            value={meaningDraft}
            autoFocus
            rows={2}
            onChange={(e) => setMeaningDraft(e.target.value)}
            onBlur={() => saveMeaningInline(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveMeaningInline(row.id);
              } else if (e.key === "Escape") setEditingMeaningId(null);
            }}
            aria-label="Sửa nghĩa"
          />
        ) : v ? (
          <span
            className="cell-clamp vocab-meaning-cell"
            title="Double-click để sửa"
            onDoubleClick={() => {
              setEditingMeaningId(row.id);
              setMeaningDraft(v);
            }}
          >
            {v}
          </span>
        ) : (
          <button
            className="vocab-missing-cell"
            title={geminiKey ? "Chưa có nghĩa — bấm để AI giải nghĩa" : "Chưa có nghĩa (cần Gemini key)"}
            onClick={() => explainOne(row)}
            disabled={!geminiKey || aiRunning}
          >
            <Sparkles size={12} /> Chưa có nghĩa
          </button>
        ),
    },
    {
      key: "tags",
      label: "Thẻ",
      width: "150px",
      hideOnMobile: true,
      render: (_, row) => {
        const list = normalizeTags(row.tags);
        if (!list.length) return <span className="text-muted">—</span>;
        return (
          <span className="vocab-tag-row">
            {list.map((t) => (
              <button
                key={t}
                className={`vocab-tag-chip${tagFilter?.toLowerCase() === t.toLowerCase() ? " on" : ""}`}
                onClick={() => setTagFilter(tagFilter && tagFilter.toLowerCase() === t.toLowerCase() ? null : t)}
                title={`Lọc thẻ "${t}"`}
              >
                {t}
              </button>
            ))}
          </span>
        );
      },
    },
    {
      key: "file",
      label: "Sách",
      hideOnMobile: true,
      render: (v) =>
        v ? (
          <span className="ui-s-ec599c" title={byFilename.get(v)?.title || v}>
            {(byFilename.get(v)?.title || v).slice(0, 24)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "page",
      label: "Trang",
      width: "76px",
      align: "right",
      sortable: true,
      hideOnMobile: true,
      render: (v) => (v ? String(Math.max(1, v - 1)) : "—"),
    },
    {
      key: "at",
      label: "Ngày lưu",
      width: "120px",
      sortable: true,
      hideOnMobile: true,
      render: (v) => (v ? formatDateTime(v) : "—"),
    },
    {
      key: "_actions",
      label: "Thao tác",
      width: "172px",
      align: "right",
      render: (_, row) => (
        <span className="data-table-actions">
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => {
              const b = byFilename.get(row.file);
              if (b) onOpenBook(b, row.page || 1);
            }}
            title={row.file ? "Mở sách tại trang này" : "Từ vựng thủ công • chưa gắn sách"}
            disabled={!row.file}
          >
            <BookOpen size={12} />
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => explainOne(row)}
            disabled={!geminiKey || aiRunning}
            title={geminiKey ? "Giải nghĩa bằng AI" : "Cần cấu hình Gemini"}
          >
            {aiRunning ? "…" : <Sparkles size={12} />}
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => openEditForm(row)}
            title="Sửa từ này"
            aria-label="Sửa"
          >
            <Pencil size={12} />
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={() => removeOne(row)}
            title="Xóa (có thể hoàn tác)"
            aria-label="Xóa"
          >
            <Trash2 size={12} />
          </button>
        </span>
      ),
    },
  ];

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toolbar = (
    <div className="data-table-toolbar vocab-toolbar">
      <div className="data-table-toolbar-left">
        <div className="search-input-wrapper ui-s-903b9c">
          <Search className="search-icon" size={14} />
          <input
            type="text"
            className="search-input"
            placeholder="Tìm từ / nghĩa / thẻ…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm từ vựng"
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm">
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className={`vocab-filter-chip${missingOnly ? " on" : ""}`}
          onClick={() => setMissingOnly((v) => !v)}
          title="Chỉ hiện các từ chưa có nghĩa"
        >
          <Sparkles size={12} /> Chưa có nghĩa {stats.missingMeaning ? `(${stats.missingMeaning})` : ""}
        </button>
        {fileFilter && (
          <button className="vocab-filter-chip on" onClick={() => setFileFilter(null)} title="Bỏ lọc sách">
            {(byFilename.get(fileFilter)?.title || fileFilter).slice(0, 22)} <X size={11} />
          </button>
        )}
        {tagFilter && (
          <button className="vocab-filter-chip on" onClick={() => setTagFilter(null)} title="Bỏ lọc thẻ">
            <Tag size={11} /> {tagFilter} <X size={11} />
          </button>
        )}
        <span className="ui-s-1f9717">
          {filtered.length}/{vocab.length} từ
        </span>
      </div>
      <div className="data-table-toolbar-right">
        <button className="btn btn-secondary btn-xs" onClick={openAddForm}>
          <Plus size={12} /> Thêm từ
        </button>
        <button
          className="btn btn-secondary btn-xs"
          onClick={selectAllFiltered}
          disabled={!filtered.length}
          title="Chọn/bỏ chọn tất cả dòng đang hiển thị"
        >
          <ListChecks size={12} /> {allFilteredSelected ? "Bỏ chọn" : `Chọn tất cả`}
        </button>
        <button
          className="btn btn-secondary btn-xs"
          onClick={runBatchExplain}
          disabled={!geminiKey || aiRunning || aiQuestionRunning}
          title={
            geminiKey
              ? `Giải nghĩa hàng loạt (10 từ/lần)${selected.length ? ` cho ${selected.length} từ đã chọn` : " cho các từ đang lọc"}`
              : "Cần cấu hình Gemini"
          }
        >
          <Sparkles size={12} /> AI giải nghĩa
        </button>
        <button
          className="btn btn-secondary btn-xs"
          onClick={createMcQuestions}
          title="Tạo câu trắc nghiệm nhanh từ các dòng đã chọn (không cần AI)"
        >
          <ListChecks size={12} /> Tạo câu hỏi
        </button>
        <button
          className="btn btn-secondary btn-xs"
          onClick={createAiQuestions}
          disabled={!geminiKey || aiQuestionRunning || aiRunning}
          title={geminiKey ? "AI soạn câu hỏi theo ngữ cảnh sách (tối đa 20 từ đã chọn)" : "Cần cấu hình Gemini"}
        >
          {aiQuestionRunning ? <Loader2 size={12} className="vocab-spin" /> : <Sparkles size={12} />} AI soạn câu
        </button>
        <button className="btn btn-secondary btn-xs" onClick={doExportCsv} title="Xuất danh sách đang lọc ra CSV/Excel">
          <FileSpreadsheet size={12} /> CSV
        </button>
        <button className="btn btn-secondary btn-xs" onClick={doExportWord} title="Xuất phiếu ôn tập Word">
          <FileText size={12} /> Word
        </button>
        <button
          className="btn btn-danger btn-xs"
          onClick={removeSelected}
          disabled={!selected.length}
          title={selected.length ? `Xóa ${selected.length} từ đã chọn` : "Chưa chọn dòng nào"}
        >
          <Trash2 size={12} /> Xóa đã chọn{selected.length ? ` (${selected.length})` : ""}
        </button>
        <button
          className="btn btn-danger btn-xs"
          onClick={clearAll}
          disabled={!vocab.length}
          title="Xóa toàn bộ sổ tay (vào Thùng rác)"
        >
          <Trash2 size={12} /> Xóa hết
        </button>
      </div>
    </div>
  );

  const progress =
    aiRunning || aiProgress ? (
      <div className="vocab-progress" role="status" aria-live="polite">
        <Loader2 size={13} className="vocab-spin" />
        <span>
          {aiProgress ? `Đang giải nghĩa ${aiProgress.done}/${aiProgress.total} từ…` : "Đang xử lý bằng AI…"}
        </span>
        {aiRunning && (
          <button
            className="btn btn-secondary btn-xs"
            onClick={cancelActiveAi}
          >
            Dừng
          </button>
        )}
      </div>
    ) : null;

  const statsTab = (
    <div className="vocab-stats">
      <div className="vocab-stat-cards">
        <div className="vocab-stat-card">
          <span className="vocab-stat-value">{stats.total}</span>
          <span className="vocab-stat-label">Tổng từ</span>
        </div>
        <button
          className="vocab-stat-card clickable"
          onClick={() => {
            setMissingOnly(true);
            setTab("table");
          }}
          title="Lọc các từ chưa có nghĩa"
        >
          <span className="vocab-stat-value">{stats.missingMeaning}</span>
          <span className="vocab-stat-label">Chưa có nghĩa</span>
        </button>
        <div className="vocab-stat-card">
          <span className="vocab-stat-value">{stats.byFile.filter((b) => b.file).length}</span>
          <span className="vocab-stat-label">Sách khác nhau</span>
        </div>
        <div className="vocab-stat-card">
          <span className="vocab-stat-value">{stats.tagged}</span>
          <span className="vocab-stat-label">Có gắn thẻ</span>
        </div>
      </div>

      <section className="vocab-stat-section">
        <h4>Theo sách</h4>
        {stats.byFile.length ? (
          <div className="vocab-bars">
            {stats.byFile.map((b) => {
              const max = stats.byFile[0].count || 1;
              return (
                <button
                  key={b.file || "(none)"}
                  className="vocab-bar-row"
                  onClick={() => {
                    setFileFilter(b.file || null);
                    setTab("table");
                  }}
                  title={`Lọc bảng theo "${b.title}"`}
                >
                  <span className="vocab-bar-label">{b.title.slice(0, 34)}</span>
                  <span className="vocab-bar-track">
                    <span className="vocab-bar-fill" style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
                  </span>
                  <span className="vocab-bar-value">{b.count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">Chưa có dữ liệu.</p>
        )}
      </section>

      <section className="vocab-stat-section">
        <h4>Theo lớp</h4>
        {stats.byGrade.length ? (
          <div className="vocab-bars">
            {stats.byGrade.map((g) => {
              const max = Math.max(...stats.byGrade.map((x) => x.count)) || 1;
              return (
                <div className="vocab-bar-row" key={g.grade}>
                  <span className="vocab-bar-label">{g.grade ? `Lớp ${g.grade}` : "Không rõ lớp"}</span>
                  <span className="vocab-bar-track">
                    <span className="vocab-bar-fill alt" style={{ width: `${Math.round((g.count / max) * 100)}%` }} />
                  </span>
                  <span className="vocab-bar-value">{g.count}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">Chưa có dữ liệu.</p>
        )}
      </section>

      <section className="vocab-stat-section">
        <div className="vocab-stat-head">
          <h4>Theo ngày</h4>
          <div className="vocab-range">
            {[7, 30].map((d) => (
              <button
                key={d}
                className={`vocab-filter-chip${dayRange === d ? " on" : ""}`}
                onClick={() => setDayRange(d)}
              >
                {d} ngày
              </button>
            ))}
          </div>
        </div>
        <div className="vocab-days">
          {daySeries.map((d) => {
            const max = Math.max(...daySeries.map((x) => x.count), 1);
            return (
              <div className="vocab-day-col" key={d.date} title={`${d.label}: ${d.count} từ`}>
                <div className="vocab-day-bar" style={{ height: `${Math.max(4, Math.round((d.count / max) * 100))}%` }}>
                  {d.count > 0 && <span>{d.count}</span>}
                </div>
                <span className="vocab-day-label">{d.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="vocab-stat-actions">
        <button className="btn btn-secondary btn-xs" onClick={() => setTab("table")}>
          <Table2 size={12} /> Xem bảng
        </button>
        <button className="btn btn-secondary btn-xs" onClick={doExportCsv}>
          <FileSpreadsheet size={12} /> Xuất CSV thống kê
        </button>
      </div>
    </div>
  );

  const tableTab = (
    <>
      {toolbar}
      {progress}
      {error && (
        <div className="util-error vocab-error">
          {error}{" "}
          <button className="btn btn-ghost btn-xs" onClick={() => setError("")}>
            Đóng
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={filtered}
        keyField="id"
        resizableId="vocab"
        emptyText={
          vocab.length
            ? query || missingOnly || fileFilter || tagFilter
              ? `Không tìm thấy kết quả${query ? ` cho "${query}"` : ""}`
              : "Chưa có dữ liệu"
            : "Chưa có từ vựng nào"
        }
        emptyHint={
          vocab.length
            ? "Thử đổi từ khóa hoặc bỏ bộ lọc."
            : "Hãy bôi đen từ trong sách và chọn “Lưu từ vựng”, hoặc bấm “Thêm mẫu”."
        }
      />
      {!vocab.length && (
        <div className="vocab-empty-actions">
          <button className="btn btn-primary" onClick={autoFillVocab}>
            Thêm mẫu
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="vocab-view">
      <div className="vocab-tabs" role="tablist" aria-label="Sổ tay từ vựng">
        <button
          role="tab"
          aria-selected={tab === "table"}
          className={`vocab-tab${tab === "table" ? " active" : ""}`}
          onClick={() => setTab("table")}
        >
          <Table2 size={14} /> Bảng
        </button>
        <button
          role="tab"
          aria-selected={tab === "stats"}
          className={`vocab-tab${tab === "stats" ? " active" : ""}`}
          onClick={() => setTab("stats")}
        >
          <BarChart3 size={14} /> Thống kê
        </button>
        <span className="vocab-tabs-spacer" />
        <span className="vocab-total">
          <NotebookPen size={13} /> {vocab.length} từ trong sổ tay
        </span>
      </div>

      {tab === "table" ? tableTab : statsTab}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal-content vocab-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="flex-row gap-sm m-0">
                <NotebookPen size={18} /> {form.id ? "Sửa từ vựng" : "Thêm từ vựng"}
              </h3>
              <button className="util-bubble-close dark" onClick={() => setForm(null)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="vocab-form-body">
              <label className="form-label">Từ / cụm từ *</label>
              <input
                className="form-control"
                value={form.word}
                autoFocus
                onChange={(e) => setForm({ ...form, word: e.target.value })}
                placeholder="Ví dụ: phép cộng"
              />

              <label className="form-label">Nghĩa / ghi chú</label>
              <textarea
                className="form-control"
                rows={3}
                value={form.meaning}
                onChange={(e) => setForm({ ...form, meaning: e.target.value })}
                placeholder="Để trống rồi dùng nút AI giải nghĩa sau cũng được"
              />

              <div className="vocab-form-row">
                <div className="vocab-form-field">
                  <label className="form-label">Sách</label>
                  <select
                    className="form-control"
                    value={form.file}
                    onChange={(e) => {
                      const b = byFilename.get(e.target.value);
                      setForm({ ...form, file: e.target.value, grade: b?.grade ?? form.grade });
                    }}
                  >
                    <option value="">— Không gắn sách —</option>
                    {books.map((b) => (
                      <option key={b.filename} value={b.filename}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="vocab-form-field">
                  <label className="form-label">Trang</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={form.page}
                    onChange={(e) => setForm({ ...form, page: e.target.value })}
                  />
                </div>
                <div className="vocab-form-field">
                  <label className="form-label">Lớp</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    max="5"
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  />
                </div>
              </div>

              <label className="form-label">Thẻ (phân cách bằng dấu phẩy)</label>
              <input
                className="form-control"
                list="vocab-tag-suggestions"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="unit3, từ khó, kiểm tra 1 tiết"
              />
              <datalist id="vocab-tag-suggestions">
                {tags.map((t) => (
                  <option key={t.tag} value={t.tag} />
                ))}
              </datalist>

              {error && <div className="util-error">{error}</div>}

              <div className="vocab-form-actions">
                <button className="btn btn-secondary" onClick={() => setForm(null)}>
                  Hủy
                </button>
                <button className="btn btn-primary" onClick={submitForm}>
                  <Check size={14} /> {form.id ? "Lưu thay đổi" : "Thêm vào sổ tay"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
