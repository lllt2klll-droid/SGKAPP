import { Check, Eye, Pencil, X } from "lucide-react";
import SourceBadge from "../scan/SourceBadge.jsx";

export default function QuestionDetailModal({
  question,
  books,
  onClose,
  onEdit,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-640"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="m-0 flex-row gap-sm">
            <Eye size={16} /> Chi tiết câu hỏi
          </h3>
          <button
            className="util-bubble-close dark"
            onClick={onClose}
            aria-label="Đóng chi tiết"
          >
            <X size={18} />
          </button>
        </div>
        <div className="tag-body">
          <p
            style={{
              margin: "0 0 0.6rem",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              fontWeight: 600,
            }}
          >
            {question.question}
          </p>
          {question.type === "mc" && question.options?.length > 0 && (
            <div className="qbx-opts" style={{ marginBottom: 8 }}>
              {question.options.map((option, optionIndex) => (
                <div
                  key={optionIndex}
                  className={`qbx-opt${question.correctIndex === optionIndex ? " ok" : ""}`}
                >
                  <b>{String.fromCharCode(65 + optionIndex)}</b>
                  <span className="qbx-opt-tx">{option}</span>
                  {question.correctIndex === optionIndex && (
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <Check size={12} /> Đáp án
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {question.type === "essay" && question.answer && (
            <p className="panel-hint p-sm bg-muted radius-md">
              <strong>Đáp án gợi ý:</strong> {question.answer}
            </p>
          )}
          <div className="flex-row gap-sm flex-wrap mb-0-6">
            {question.subject && (
              <span className="gl-chip">{question.subject}</span>
            )}
            {question.grade && (
              <span className="gl-chip">Lớp {question.grade}</span>
            )}
            {question.type === "mc" ? (
              <span className="gl-chip">Trắc nghiệm</span>
            ) : (
              <span className="gl-chip">Tự luận</span>
            )}
            {question.mucdo && (
              <span className="gl-chip">{question.mucdo}</span>
            )}
            {question.chapter && (
              <span className="gl-chip">{question.chapter}</span>
            )}
            {question.yccd && (
              <span className="gl-chip" title={question.yccd}>
                YCCĐ: {question.yccd}
              </span>
            )}
          </div>
          {question.source?.type === "sgk_scan" && (
            <div style={{ marginBottom: 8 }}>
              <SourceBadge source={question.source} books={books} />
              {question.thumbnail && (
                <div style={{ marginTop: 6 }}>
                  <img
                    src={question.thumbnail}
                    alt="Thumbnail"
                    style={{
                      maxWidth: 180,
                      maxHeight: 100,
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <div className="flex-row-end">
            <button
              className="btn btn-secondary btn-xs"
              onClick={onEdit}
              aria-label="Sửa câu hỏi này"
            >
              <Pencil size={12} /> Sửa
            </button>
            <button
              className="btn btn-primary btn-xs"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X size={12} /> Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
