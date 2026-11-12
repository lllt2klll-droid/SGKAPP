import React from "react";
import { BookOpen, Check, Pencil, Sparkles, Square, Trash2 } from "lucide-react";
import { formatDateTime } from "../data/userdata.js";
import { normalizeTags } from "../services/vocabService.js";

export default function createVocabTableColumns({
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
}) {
  return [
    {
      key: "_sel",
      label: "Chọn",
      width: "54px",
      align: "center",
      render: (_, row) => (
        <button
          className={`vocab-select-btn${selectedIds.has(row.id) ? " on" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
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
      render: (value) => <span className="vocab-word-cell">{value}</span>,
    },
    {
      key: "meaning",
      label: "Nghĩa / ghi chú",
      sortable: true,
      render: (value, row) =>
        editingMeaningId === row.id ? (
          <textarea
            className="form-control vocab-meaning-edit"
            value={meaningDraft}
            autoFocus
            rows={2}
            onChange={(event) => setMeaningDraft(event.target.value)}
            onBlur={() => saveMeaningInline(row.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                saveMeaningInline(row.id);
              } else if (event.key === "Escape") setEditingMeaningId(null);
            }}
            aria-label="Sửa nghĩa"
          />
        ) : value ? (
          <span
            className="cell-clamp vocab-meaning-cell"
            title="Double-click để sửa"
            onDoubleClick={() => {
              setEditingMeaningId(row.id);
              setMeaningDraft(value);
            }}
          >
            {value}
          </span>
        ) : (
          <button
            className="vocab-missing-cell"
            title={
              geminiKey
                ? "Chưa có nghĩa — bấm để AI giải nghĩa chi tiết (chuẩn sinh viên đại học & cao học)"
                : "Chưa có nghĩa (cần Gemini key)"
            }
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
            {list.map((tag) => (
              <button
                key={tag}
                className={`vocab-tag-chip${tagFilter?.toLowerCase() === tag.toLowerCase() ? " on" : ""}`}
                onClick={() => setTagFilter(tagFilter && tagFilter.toLowerCase() === tag.toLowerCase() ? null : tag)}
                title={`Lọc thẻ "${tag}"`}
              >
                {tag}
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
      render: (value) =>
        value ? (
          <span className="ui-s-ec599c" title={byFilename.get(value)?.title || value}>
            {(byFilename.get(value)?.title || value).slice(0, 24)}
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
      render: (value) => (value ? String(Math.max(1, value - 1)) : "—"),
    },
    {
      key: "at",
      label: "Ngày lưu",
      width: "120px",
      sortable: true,
      hideOnMobile: true,
      render: (value) => (value ? formatDateTime(value) : "—"),
    },
    {
      key: "_actions",
      label: "Thao tác",
      width: "224px",
      align: "right",
      render: (_, row) => (
        <span className="data-table-actions">
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => {
              const book = byFilename.get(row.file);
              if (book) onOpenBook(book, row.page || 1);
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
            title={geminiKey ? "AI giải nghĩa chuẩn học thuật (đại học & cao học)" : "Cần cấu hình Gemini"}
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
}
