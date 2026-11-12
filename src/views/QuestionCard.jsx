import { Check, Eye, Pencil, Trash2 } from "lucide-react";

export default function QuestionCard({
  question,
  index,
  selected,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
}) {
  const correctIndex = Number(question.correctIndex);
  const validCorrectIndex =
    question.type === "mc" &&
    Number.isInteger(correctIndex) &&
    correctIndex >= 0 &&
    correctIndex <= 3
      ? correctIndex
      : -1;

  return (
    <article className={`qbx-card${selected ? " sel" : ""}`}>
      <button
        className={`qbx-check${selected ? " on" : ""}`}
        onClick={onToggle}
        title={selected ? "Bỏ chọn" : "Chọn vào bộ đề"}
        aria-label={selected ? "Bỏ chọn câu này" : "Chọn câu này"}
        aria-pressed={selected}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </button>
      <span className="qbx-num">{index + 1}</span>
      <div className="qbx-body">
        <p
          className="qbx-q"
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter") onOpen();
          }}
          title="Bấm để xem chi tiết"
          style={{ cursor: "pointer" }}
        >
          {question.question}
        </p>
        {question.type === "mc" &&
          Array.isArray(question.options) &&
          question.options.length > 0 && (
            <div className="qbx-opts">
              {question.options.map((option, optionIndex) => (
                <span
                  key={optionIndex}
                  className={`qbx-opt${optionIndex === validCorrectIndex ? " ok" : ""}`}
                >
                  <b>{String.fromCharCode(65 + optionIndex)}</b>
                  <span className="qbx-opt-tx">{option}</span>
                  {optionIndex === validCorrectIndex && (
                    <Check size={13} className="qbx-opt-check" />
                  )}
                </span>
              ))}
            </div>
          )}
        {(question.type === "essay" || question.type === "fill") &&
          (question.answer || question.answerGuide) && (
            <div className="qbx-ans">
              Đáp án: {question.answer || question.answerGuide}
            </div>
          )}
        <div className="qbx-badges">
          {question.subject && (
            <span className="qbx-badge subj">{question.subject}</span>
          )}
          {question.grade && (
            <span className="qbx-badge">Lớp {question.grade}</span>
          )}
          <span className="qbx-badge">
            {question.type === "mc"
              ? "Trắc nghiệm"
              : question.type === "fill"
                ? "Điền khuyết"
                : "Tự luận"}
          </span>
          {question.mucdo && (
            <span className="qbx-badge lvl">{question.mucdo}</span>
          )}
          {(question.origin === "sgk_original" || question.keepOriginal) && (
            <span className="qbx-badge scan">📖 SGK</span>
          )}
          {question.source?.type === "sgk_scan" && (
            <span
              className="qbx-badge scan"
              title={`📚 ${question.source.bookName} tr.${question.source.page}`}
            >
              📚 tr.{question.source.page}
            </span>
          )}
          {question.chapter && (
            <span className="qbx-badge" title={question.chapter}>
              📖 {question.chapter.slice(0, 28)}
            </span>
          )}
        </div>
        {question.thumbnail && (
          <div className="qbx-thumb">
            <img src={question.thumbnail} alt="" loading="lazy" />
          </div>
        )}
      </div>
      <div className="qbx-card-actions">
        <button
          className="qbx-icobtn"
          onClick={onOpen}
          title="Xem chi tiết"
          aria-label="Xem chi tiết"
        >
          <Eye size={14} />
        </button>
        <button
          className="qbx-icobtn"
          onClick={onEdit}
          title="Sửa"
          aria-label="Sửa câu hỏi"
        >
          <Pencil size={14} />
        </button>
        <button
          className="qbx-icobtn danger"
          onClick={onDelete}
          title="Xóa"
          aria-label="Xóa câu hỏi"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}
