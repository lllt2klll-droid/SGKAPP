import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  Trash2,
  BookOpen,
  BookOpenCheck,
  BookMarked,
  CheckCircle2,
  GraduationCap,
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
  Tags,
  Wand2,
} from "lucide-react";
import DataTable from "./DataTable.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import GlossaryPanel from "../reader/GlossaryPanel.jsx";
import aiService, { getFriendlyErrorMessage } from "../ai/aiService.js";
import { loadSettings } from "../services/settingsStore.js";
import { exportCsv, exportWord } from "../services/exportDoc.js";
import { addQuestion } from "../data/teachingDB.js";
import { moveToTrash, TRASH_TYPE } from "../data/trashStore.js";
import { restoreVocabEntries } from "../data/userdata.js";
import { fillSampleVocab } from "../data/sampleData.js";
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
} from "../services/vocabService.js";
import createVocabTableColumns from "./vocabTableColumns.jsx";
import VocabStatsPanel from "./VocabStatsPanel.jsx";
import VocabTableToolbar from "./VocabTableToolbar.jsx";
import VocabHeader from "./VocabHeader.jsx";

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
  // P1 • gộp view Từ điển vào đây: điều hướng "glossary" mở tab Tra cứu
  initialTab = "table",
  onTabConsumed,
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
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const byFilename = useMemo(() => new Map(books.map((b) => [b.filename, b])), [books]);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    setTab("table");
    if (typeof onQueryConsumed === "function") onQueryConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // P1 • mở thẳng tab Tra cứu khi điều hướng từ view Từ điển cũ
  useEffect(() => {
    if (initialTab !== "lookup") return;
    setTab("lookup");
    if (typeof onTabConsumed === "function") onTabConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

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
  const coverage = stats.total ? Math.round((stats.withMeaning / stats.total) * 100) : 0;

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
    setConfirmClearAll(true);
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
    if (word.length > 80) {
      setError(`Từ quá dài (${word.length}/80 ký tự). Hãy rút gọn.`);
      return;
    }
    const meaning = String(form.meaning || "").trim();
    if (meaning.length > 2000) {
      setError("Nghĩa quá dài (tối đa 2000 ký tự).");
      return;
    }
    // Lớp: để trống hoặc 1-5
    let grade = null;
    if (String(form.grade ?? "").trim() !== "") {
      const g = Number(form.grade);
      if (!Number.isInteger(g) || g < 1 || g > 5) {
        setError("Lớp phải từ 1 đến 5 (hoặc để trống).");
        return;
      }
      grade = g;
    } else {
      const book = form.file ? byFilename.get(form.file) : null;
      grade = book?.grade || null;
    }
    // Trang: để trống hoặc số nguyên >= 1
    let page = null;
    if (String(form.page ?? "").trim() !== "") {
      const p = Number(form.page);
      if (!Number.isInteger(p) || p < 1 || p > 5000) {
        setError("Trang phải là số nguyên từ 1 trở lên.");
        return;
      }
      page = p;
    }
    const tags = normalizeTags(form.tags);
    if (tags.length > 10) {
      setError("Tối đa 10 thẻ cho mỗi từ.");
      return;
    }
    if (tags.some((t) => t.length > 30)) {
      setError("Mỗi thẻ tối đa 30 ký tự.");
      return;
    }
    // Chống trùng: cùng từ (không phân biệt hoa/thường/dấu cách) + sách + trang
    const normWord = word.toLowerCase();
    const dup = vocab.find((e) =>
      String(e.word || "").trim().toLowerCase() === normWord &&
      String(e.file || "") === String(form.file || "") &&
      Number(e.page || 0) === Number(page || 0) &&
      (!form.id || e.id !== form.id),
    );
    if (dup && !form.id) {
      setError(`Từ "${word}" đã có trong sổ tay (cùng sách/trang). Mở sửa thay vì thêm mới.`);
      return;
    }
    const book = form.file ? byFilename.get(form.file) : null;
    const payload = {
      word,
      meaning,
      file: form.file || "",
      bookTitle: book?.title || "",
      grade,
      page,
      tags,
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
    if (!value) { setError("Nghĩa đang trống — chưa lưu gì."); return; }
    if (value.length > 2000) { setError("Nghĩa quá dài (tối đa 2000 ký tự)."); return; }
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
          parts: [
            {
              text: "Bạn là từ điển học thuật dành cho sinh viên đại học và cao học: giải nghĩa chuẩn xác, ngôn ngữ chuẩn mực, súc tích, không dùng emoji. Luôn trả về đúng định dạng JSON được yêu cầu.",
            },
          ],
        },
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
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
                {
                  text: "Bạn là từ điển học thuật dành cho sinh viên đại học và cao học: giải nghĩa chuẩn xác, ngôn ngữ chuẩn mực, súc tích, không dùng emoji. Luôn trả về đúng định dạng JSON được yêu cầu.",
                },
              ],
            },
            generationConfig: { temperature: 0.3, maxOutputTokens: 2600 },
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

  const columns = createVocabTableColumns({
    selectedIds,
    toggleSelect,
    editingMeaningId,
    meaningDraft,
    setMeaningDraft,
    saveMeaningInline,
    setEditingMeaningId,
    geminiKey,
    aiRunning,
    explainOne,
    tagFilter,
    setTagFilter,
    byFilename,
    onOpenBook,
    openEditForm,
    removeOne,
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((entry) => selectedIds.has(entry.id));

  const statsTab = (
    <VocabStatsPanel
      stats={stats}
      coverage={coverage}
      tags={tags}
      daySeries={daySeries}
      dayRange={dayRange}
      setDayRange={setDayRange}
      geminiKey={geminiKey}
      aiRunning={aiRunning}
      aiQuestionRunning={aiQuestionRunning}
      runBatchExplain={runBatchExplain}
      setMissingOnly={setMissingOnly}
      setTab={setTab}
      setFileFilter={setFileFilter}
      setTagFilter={setTagFilter}
      doExportCsv={doExportCsv}
      doExportWord={doExportWord}
    />
  );

  const tableTab = (
    <>
      <VocabTableToolbar
        query={query}
        setQuery={setQuery}
        missingOnly={missingOnly}
        setMissingOnly={setMissingOnly}
        stats={stats}
        fileFilter={fileFilter}
        setFileFilter={setFileFilter}
        byFilename={byFilename}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        filtered={filtered}
        vocab={vocab}
        openAddForm={openAddForm}
        selectAllFiltered={selectAllFiltered}
        allFilteredSelected={allFilteredSelected}
        runBatchExplain={runBatchExplain}
        geminiKey={geminiKey}
        selected={selected}
        aiRunning={aiRunning}
        aiQuestionRunning={aiQuestionRunning}
        createMcQuestions={createMcQuestions}
        createAiQuestions={createAiQuestions}
        doExportCsv={doExportCsv}
        doExportWord={doExportWord}
        removeSelected={removeSelected}
        clearAll={clearAll}
        setSelectedIds={setSelectedIds}
        aiProgress={aiProgress}
        cancelActiveAi={cancelActiveAi}
      />
      {error && (
        <div className="util-error vocab-error">
          {error}{" "}
          <button className="btn btn-ghost btn-xs" onClick={() => setError("")}>
            Đóng
          </button>
        </div>
      )}
      {vocab.length ? (
        <>
          <DataTable
            columns={columns}
            data={filtered}
            keyField="id"
            resizableId="vocab"
            emptyText={
              query || missingOnly || fileFilter || tagFilter
                ? `Không tìm thấy kết quả${query ? ` cho "${query}"` : ""}`
                : "Chưa có dữ liệu"
            }
            emptyHint="Thử đổi từ khóa hoặc bỏ bộ lọc."
          />
          <p className="vocab-hint">
            Bấm đúp ô “Nghĩa” để sửa nhanh • tích ☑ để AI giải nghĩa hàng loạt • nút ⭐ trong dòng để giải
            nghĩa từng từ • nút 📖 mở sách tại trang đã lưu.
          </p>
        </>
      ) : (
        <div className="vocab-empty">
          <span className="vocab-empty-ic"><NotebookPen size={24} /></span>
          <p className="vocab-empty-title">Sổ tay đang trống</p>
          <p className="vocab-empty-hint">
            Bôi đen từ trong sách và chọn “Lưu từ vựng”, hoặc thêm ngay tại đây. AI sẽ giải nghĩa chi tiết
            theo văn phong học thuật — từ loại, định nghĩa, ví dụ, thuật ngữ liên quan — phù hợp sinh viên đại học và cao học.
          </p>
          <div className="vocab-empty-actions">
            <button className="btn btn-primary btn-sm" onClick={openAddForm}>
              <Plus size={14} /> Thêm từ đầu tiên
            </button>
            <button className="btn btn-secondary btn-sm" onClick={autoFillVocab}>
              <BookOpen size={14} /> Thêm mẫu
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="vocab-view">
      <VocabHeader
        stats={stats}
        tags={tags}
        selectedCount={selected.length}
        vocabCount={vocab.length}
        tab={tab}
        setTab={setTab}
        setMissingOnly={setMissingOnly}
      />

      {tab === "table" ? tableTab : tab === "stats" ? statsTab : (
        <GlossaryPanel geminiKey={geminiKey} inline />
      )}

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
                placeholder="Để trống rồi dùng “AI giải nghĩa” — AI viết định nghĩa học thuật kèm ví dụ, thuật ngữ liên quan (chuẩn sinh viên đại học & cao học)"
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
      <ConfirmDialog
        open={confirmClearAll}
        title="Xóa toàn bộ sổ tay?"
        message={`Toàn bộ ${vocab.length} từ sẽ vào Thùng rác (giữ 30 ngày).`}
        confirmText="Xóa toàn bộ"
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => {
          setConfirmClearAll(false);
          trashEntries([...vocab], `Toàn bộ sổ tay (${vocab.length} từ)`);
        }}
      />
    </div>
  );
}
