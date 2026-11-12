import React from "react";
import { X } from "lucide-react";

export default function QuestionStatsPanel({ questionsCount, visibleCount, statistics, onClose }) {
  return (
    <div className="panel-box mb-0-8">
      <div className="flex-row gap-sm mb-0-7">
        <h4 className="m-0 flex-1">📊 Thống kê chi tiết</h4>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="tag-grid-2 mb-0-7">
        <div className="p-sm bg-muted radius-md"><strong>Tổng số câu hỏi:</strong> {questionsCount}</div>
        <div className="p-sm bg-muted radius-md">
          <strong>Trắc nghiệm:</strong> {statistics.byType.mc} ({Math.round(statistics.byType.mc / questionsCount * 100)}%)
        </div>
        <div className="p-sm bg-muted radius-md">
          <strong>Tự luận:</strong> {statistics.byType.essay} ({Math.round(statistics.byType.essay / questionsCount * 100)}%)
        </div>
        <div className="p-sm bg-muted radius-md"><strong>Đang hiển thị:</strong> {visibleCount} câu</div>
      </div>
      <div className="tag-grid-2 mb-0-7">
        <div>
          <strong>Theo môn học:</strong>
          <div className="mt-0-3">
            {Object.entries(statistics.bySubject).map(([subject, count]) => (
              <div key={subject} className="flex-row gap-sm mb-0-2">
                <span className="gl-chip">{subject}</span><span>{count} câu</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <strong>Theo lớp:</strong>
          <div className="mt-0-3">
            {Object.entries(statistics.byGrade).sort(([a], [b]) => a - b).map(([grade, count]) => (
              <div key={grade} className="flex-row gap-sm mb-0-2">
                <span className="gl-chip">Lớp {grade}</span><span>{count} câu</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <strong>Theo mức độ:</strong>
        <div className="mt-0-3">
          {Object.entries(statistics.byMucdo).map(([level, count]) => (
            <div key={level} className="flex-row gap-sm mb-0-2">
              <span className="gl-chip">{level}</span><span>{count} câu</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
