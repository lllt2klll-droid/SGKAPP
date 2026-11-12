import React from "react";
import { Check, ChevronDown, ChevronUp, Copy, Eraser, ListChecks, NotebookPen, Plus } from "lucide-react";

export default function CompareNotes({
  open,
  setOpen,
  note,
  noteSnippet,
  onChange,
  onSave,
  onInsertTemplate,
  onCopyReport,
  onClear,
  ready,
}) {
  return (
    <section className={`cmp-note-card ${open ? "open" : ""}`} aria-label="Ghi chú so sánh">
      <button
        className="cmp-note-head"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title="Mở/đóng ghi chú so sánh — tự lưu theo cặp sách"
      >
        <span className="cmp-note-ico"><NotebookPen size={15} /></span>
        <span className="cmp-note-title">
          <strong>Ghi chú so sánh</strong>
          <small>
            <span className="autosave-dot" aria-hidden="true" />
            Tự lưu theo cặp sách • {note.trim() ? `${note.trim().length} ký tự` : "chưa có nội dung"}
          </small>
        </span>
        <span className="cmp-note-snippet">{noteSnippet}</span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {open && (
        <div className="cmp-note-body-v2">
          <textarea
            value={note}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onSave}
            rows={6}
            placeholder={"Điểm GIỐNG nhau:\n- …\n\nĐiểm KHÁC nhau:\n- …\n\nNhận xét / đề xuất:\n- …\n\n(tự lưu theo cặp sách)"}
            aria-label="Nội dung ghi chú so sánh"
          />
          <div className="cmp-note-foot">
            <div className="cmp-note-btns">
              <button className="cmp-btn" onClick={onSave} title="Lưu ghi chú ngay">
                <Check size={13} /> <span>Lưu</span>
              </button>
              <button
                className="cmp-btn"
                onClick={onInsertTemplate}
                title="Chèn khung mẫu Giống nhau / Khác nhau / Đề xuất vào ghi chú"
              >
                <Plus size={13} /> <span>Chèn mẫu</span>
              </button>
              <button className="cmp-btn" onClick={onCopyReport} disabled={!ready} title="Chép biên bản so sánh">
                <Copy size={13} /> <span>Chép biên bản</span>
              </button>
              {note.trim() && (
                <button className="cmp-btn danger" onClick={onClear} title="Xóa ghi chú của cặp sách này">
                  <Eraser size={13} /> <span>Xóa</span>
                </button>
              )}
            </div>
            <span className="cmp-note-hint"><ListChecks size={12} /> Mẹo: ghi 3 ý Giống – Khác – Đề xuất rồi xuất Word/PDF.</span>
          </div>
        </div>
      )}
    </section>
  );
}
