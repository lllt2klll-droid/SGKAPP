import React from "react";
import { Check, Dices, FileText, RefreshCw, Save, X } from "lucide-react";
import { MUC_DO } from "../data/teachingDB.js";

export default function QuestionDrawDialog({
  drawScope,
  setDrawScope,
  filtered,
  doDrawWith,
  drawCount,
  setDrawCount,
  drawBal,
  setDrawBal,
  questions,
  drawn,
  doDraw,
  exportDrawn,
  saveDrawnWorksheet,
  onNavigate,
  onClose,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-640" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="flex-row gap-sm m-0"><Dices size={17} /> Tạo đề ngẫu nhiên</h3>
          <button className="util-bubble-close dark" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="tag-body">
          <div className="seg-tabs mb-0-7">
            <button
              className={`seg-tab${drawScope === "filtered" ? " on" : ""}`}
              onClick={() => {
                setDrawScope("filtered");
                doDrawWith(filtered, drawCount, drawBal);
              }}
            >
              Kết quả bộ lọc ({filtered.length})
            </button>
            <button
              className={`seg-tab${drawScope === "all" ? " on" : ""}`}
              onClick={() => {
                setDrawScope("all");
                doDrawWith(questions, drawCount, drawBal);
              }}
            >
              Toàn bộ ngân hàng ({questions.length})
            </button>
          </div>
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Số câu</label>
              <input
                type="number"
                min={1}
                max={50}
                className="form-control"
                value={drawCount}
                onChange={(event) => setDrawCount(parseInt(event.target.value, 10) || 1)}
              />
            </div>
            <div>
              <label className="form-label">Phân bố mức độ</label>
              <button
                className={`btn btn-xs ${drawBal ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  const balanced = !drawBal;
                  setDrawBal(balanced);
                  doDrawWith(drawScope === "all" ? questions : filtered, drawCount, balanced);
                }}
              >
                <Check size={12} />{" "}
                {drawBal ? "Cân bằng Nhận biết / Thông hiểu / Vận dụng" : "Ngẫu nhiên thuần túy"}
              </button>
            </div>
          </div>

          {drawn.length > 0 ? (
            <>
              <p className="panel-hint mt-0-7">
                {drawn.length} câu đã chọn:{" "}
                {MUC_DO.map((level) => {
                  const count = drawn.filter((question) => question.mucdo === level).length;
                  return <span key={level} className="mr-md">{level}: <strong>{count}</strong></span>;
                })}
                {drawn.filter((question) => !question.mucdo).length > 0 && (
                  <span>
                    Không rõ mức độ: <strong>{drawn.filter((question) => !question.mucdo).length}</strong>
                  </span>
                )}
              </p>
              <div className="qb-list stack-v-sm-mt">
                {drawn.map((question, index) => (
                  <div className="qb-row p-0-45-0-6" key={question.id}>
                    <span className="font-bold text-primary min-w-1-6">{String.fromCharCode(105 + index)}.</span>
                    <div className="flex-1 min-w-0">
                      <p style={{ margin: 0, fontSize: "0.84rem", lineHeight: 1.45 }}>{question.question}</p>
                      <div className="flex-row gap-sm flex-wrap mt-0-2">
                        <span className="gl-chip">{question.type === "mc" ? "Trắc nghiệm" : "Tự luận"}</span>
                        {question.mucdo && <span className="gl-chip">{question.mucdo}</span>}
                        {question.subject && <span className="gl-chip">{question.subject}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="panel-hint mt-0-7">Không có câu hỏi nào trong phạm vi đã chọn.</p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "0.8rem" }}>
            <button className="btn btn-secondary btn-xs" onClick={doDraw} disabled={!filtered.length && !questions.length}>
              <RefreshCw size={12} /> Tạo lại
            </button>
            <button className="btn btn-secondary btn-xs" onClick={() => exportDrawn(false)} disabled={!drawn.length}>
              Xuất đề
            </button>
            <button className="btn btn-secondary btn-xs" onClick={() => exportDrawn(true)} disabled={!drawn.length}>
              Đề + đáp án
            </button>
            <button className="btn btn-primary btn-xs" onClick={saveDrawnWorksheet} disabled={!drawn.length}>
              <Save size={12} /> Lưu thành phiếu học tập
            </button>
            {onNavigate && (
              <button className="btn btn-secondary btn-xs" onClick={() => onNavigate("worksheets")} title="Xem phiếu vừa tạo">
                <FileText size={12} /> Xem Phieu
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
