import React from "react";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  GraduationCap,
  NotebookPen,
  Sparkles,
  Table2,
  Tags,
} from "lucide-react";

export default function VocabHeader({ stats, tags, selectedCount, vocabCount, tab, setTab, setMissingOnly }) {
  return (
    <div className="vocab-head">
      <div className="vocab-title-row">
        <h2 className="vocab-title">
          <span className="vocab-title-ic"><NotebookPen size={17} /></span>
          Sổ tay từ vựng
        </h2>
        <span
          className="vocab-level-badge"
          title="AI giải nghĩa chi tiết: từ loại, định nghĩa, ví dụ, thuật ngữ liên quan — văn phong học thuật, chuẩn đại học & cao học"
        >
          <GraduationCap size={12} /> AI giải nghĩa chuẩn đại học & cao học
        </span>
        <div className="vocab-pills">
          <span className="vocab-pill"><BookMarked size={12} /> {stats.total} từ</span>
          <span className="vocab-pill ok"><CheckCircle2 size={12} /> {stats.withMeaning} có nghĩa</span>
          <button
            className={`vocab-pill warn${stats.missingMeaning ? "" : " calm"}`}
            onClick={() => {
              setMissingOnly(true);
              setTab("table");
            }}
            title="Lọc các từ chưa có nghĩa"
          >
            <Sparkles size={12} /> {stats.missingMeaning} chưa nghĩa
          </button>
          <span className="vocab-pill"><Tags size={12} /> {tags.length} thẻ</span>
          {selectedCount > 0 && (
            <span className="vocab-pill hot"><Check size={12} /> {selectedCount} đã chọn</span>
          )}
        </div>
      </div>
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
        <button
          role="tab"
          aria-selected={tab === "lookup"}
          className={`vocab-tab${tab === "lookup" ? " active" : ""}`}
          onClick={() => setTab("lookup")}
        >
          <BookOpen size={14} /> Tra cứu
        </button>
        <span className="vocab-tabs-spacer" />
        <span className="vocab-total"><NotebookPen size={13} /> {vocabCount} từ trong sổ tay</span>
      </div>
    </div>
  );
}
