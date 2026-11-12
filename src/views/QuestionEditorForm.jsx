import React from "react";
import { Check } from "lucide-react";
import { MUC_DO } from "../data/teachingDB.js";

export default function QuestionEditorForm({ editId, form, setForm, subjects, onSave, onCancel }) {
  return (
    <div className="panel-box border-primary mb-0-8">
      <h4 className="mb-0-7 text-primary font-inherit">
        {editId ? "✏️ Sửa câu hỏi" : "➕ Câu hỏi mới"}
      </h4>
      <div className="tag-grid-4">
        <div>
          <label className="form-label">Loại câu</label>
          <select className="form-control" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
            <option value="mc">Trắc nghiệm (4 đáp án)</option>
            <option value="fill">Điền khuyết</option>
            <option value="essay">Tự luận</option>
          </select>
        </div>
        <div>
          <label className="form-label">Môn</label>
          <select className="form-control" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}>
            <option value="">—</option>
            {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Lớp</label>
          <select className="form-control" value={form.grade} onChange={(event) => setForm((current) => ({ ...current, grade: event.target.value }))}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((grade) => <option key={grade} value={String(grade)}>Lớp {grade}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Mức độ</label>
          <select className="form-control" value={form.mucdo} onChange={(event) => setForm((current) => ({ ...current, mucdo: event.target.value }))}>
            <option value="">—</option>
            {MUC_DO.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </div>
      </div>
      <label className="form-label">Câu hỏi *</label>
      <textarea
        className="form-control"
        rows={2}
        value={form.question}
        onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
        placeholder="Nhập câu hỏi…"
      />
      {form.type === "mc" ? (
        <div className="qb-opts">
          {form.options.map((option, optionIndex) => (
            <div key={optionIndex} className="qb-opt">
              <button
                className={`btn btn-xs ${form.correctIndex === optionIndex ? "btn-primary" : "btn-secondary"}`}
                title="Đặt làm đáp án đúng"
                onClick={() => setForm((current) => ({ ...current, correctIndex: optionIndex }))}
              >
                {form.correctIndex === optionIndex ? <Check size={12} /> : String.fromCharCode(65 + optionIndex)}
              </button>
              <input
                className="form-control"
                value={option}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  options: current.options.map((item, index) => index === optionIndex ? event.target.value : item),
                }))}
                placeholder={`Đáp án ${String.fromCharCode(65 + optionIndex)}`}
              />
              {form.correctIndex === optionIndex && <span className="gl-chip text-success">đúng</span>}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <label className="form-label">Đáp án gợi ý</label>
          <textarea
            className="form-control"
            rows={2}
            value={form.answer}
            onChange={(event) => setForm((current) => ({ ...current, answer: event.target.value }))}
            placeholder="Nội dung trả lời mong đợi…"
          />
        </div>
      )}
      <div className="tag-grid-2">
        <div>
          <label className="form-label">Chương / Bài</label>
          <input
            className="form-control"
            value={form.chapter}
            onChange={(event) => setForm((current) => ({ ...current, chapter: event.target.value }))}
            placeholder="VD: Bài 12 – Phép cộng phạm vi 10"
          />
        </div>
        <div>
          <label className="form-label">Yêu cầu cần đạt (tham chiếu)</label>
          <input
            className="form-control"
            value={form.yccd}
            onChange={(event) => setForm((current) => ({ ...current, yccd: event.target.value }))}
            placeholder="Ghi tóm tắt YCCĐ liên quan…"
          />
        </div>
      </div>
      <div className="flex-row gap-sm mt-0-7">
        <button className="btn btn-primary" onClick={onSave} disabled={!form.question.trim()}>
          <Check size={14} /> Lưu câu hỏi
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}
