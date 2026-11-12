import React from "react";
import {
  Check,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

export default function VocabTableToolbar({
  query,
  setQuery,
  missingOnly,
  setMissingOnly,
  stats,
  fileFilter,
  setFileFilter,
  byFilename,
  tagFilter,
  setTagFilter,
  filtered,
  vocab,
  openAddForm,
  selectAllFiltered,
  allFilteredSelected,
  runBatchExplain,
  geminiKey,
  selected,
  aiRunning,
  aiQuestionRunning,
  createMcQuestions,
  createAiQuestions,
  doExportCsv,
  doExportWord,
  removeSelected,
  clearAll,
  setSelectedIds,
  aiProgress,
  cancelActiveAi,
}) {
  return (
    <>
      <div className="data-table-toolbar vocab-toolbar">
        <div className="data-table-toolbar-left">
          <div className="search-input-wrapper vocab-search">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              className="search-input"
              placeholder="Tìm từ / nghĩa / thẻ…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Tìm từ vựng"
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            className={`vocab-filter-chip${missingOnly ? " on" : ""}${stats.missingMeaning && !missingOnly ? " warn" : ""}`}
            onClick={() => setMissingOnly((current) => !current)}
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
          <span className="vocab-count">{filtered.length}/{vocab.length} từ</span>
        </div>
        <div className="data-table-toolbar-right">
          <button className="btn btn-secondary btn-xs" onClick={openAddForm} title="Thêm từ mới vào sổ tay">
            <Plus size={12} /> Thêm từ
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={selectAllFiltered}
            disabled={!filtered.length}
            title="Chọn/bỏ chọn tất cả dòng đang hiển thị"
          >
            <ListChecks size={12} /> {allFilteredSelected ? "Bỏ chọn" : "Chọn tất cả"}
          </button>
          <button
            className="vocab-ai-btn"
            onClick={runBatchExplain}
            disabled={!geminiKey || aiRunning || aiQuestionRunning}
            title={
              geminiKey
                ? `AI giải nghĩa học thuật (10 từ/lần)${selected.length ? ` cho ${selected.length} từ đã chọn` : " cho các từ đang lọc"}`
                : "Cần cấu hình Gemini ở Cài đặt AI"
            }
          >
            <Sparkles size={13} /> AI giải nghĩa
          </button>
          <button className="btn btn-secondary btn-xs" onClick={createMcQuestions} title="Tạo câu trắc nghiệm nhanh từ các dòng đã chọn (không cần AI)">
            <ListChecks size={12} /> Tạo câu hỏi
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={createAiQuestions}
            disabled={!geminiKey || aiQuestionRunning || aiRunning}
            title={geminiKey ? "AI soạn câu hỏi theo ngữ cảnh sách (tối đa 20 từ đã chọn)" : "Cần cấu hình Gemini"}
          >
            {aiQuestionRunning ? <Loader2 size={12} className="vocab-spin" /> : <Wand2 size={12} />} AI soạn câu
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
          <button className="btn btn-danger btn-xs" onClick={clearAll} disabled={!vocab.length} title="Xóa toàn bộ sổ tay (vào Thùng rác)">
            <Trash2 size={12} /> Xóa hết
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="vocab-selbar">
          <Check size={14} /> Đã chọn <b>{selected.length}</b> từ
          <button className="vocab-ai-btn" onClick={runBatchExplain} disabled={!geminiKey || aiRunning || aiQuestionRunning} title={geminiKey ? "AI giải nghĩa các từ đã chọn" : "Cần cấu hình Gemini ở Cài đặt AI"}>
            <Sparkles size={13} /> AI giải nghĩa
          </button>
          <button className="btn btn-secondary btn-xs" onClick={createMcQuestions}>
            <ListChecks size={12} /> Tạo câu hỏi
          </button>
          <button className="btn btn-secondary btn-xs" onClick={createAiQuestions} disabled={!geminiKey || aiQuestionRunning || aiRunning}>
            <Wand2 size={12} /> AI soạn câu
          </button>
          <button className="btn btn-secondary btn-xs" onClick={doExportWord}>
            <FileText size={12} /> Xuất Word
          </button>
          <button className="btn btn-danger btn-xs" onClick={removeSelected}>
            <Trash2 size={12} /> Xóa
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelectedIds(new Set())}>
            Bỏ chọn hết
          </button>
        </div>
      )}

      {(aiRunning || aiProgress) && (
        <div className="vocab-progress" role="status" aria-live="polite">
          <Loader2 size={13} className="vocab-spin" />
          <span className="vocab-progress-text">
            {aiProgress
              ? `Đang giải nghĩa ${aiProgress.done}/${aiProgress.total} từ (văn phong học thuật, chuẩn đại học & cao học)…`
              : "Đang xử lý bằng AI…"}
          </span>
          {aiProgress && (
            <span className="vocab-progress-track" aria-hidden="true">
              <i style={{ width: `${aiProgress.total ? Math.round((aiProgress.done / aiProgress.total) * 100) : 0}%` }} />
            </span>
          )}
          {aiRunning && (
            <button className="btn btn-secondary btn-xs" onClick={cancelActiveAi}>Dừng</button>
          )}
        </div>
      )}
    </>
  );
}
