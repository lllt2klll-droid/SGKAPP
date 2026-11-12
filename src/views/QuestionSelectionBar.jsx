import React from "react";
import { Check } from "lucide-react";

export default function QuestionSelectionBar({ count, onExport, onExportWithAnswers, onPrint, onCopy, onClear }) {
  return (
    <div className="qbx-selbar">
      <Check size={14} /> Đã chọn {count} câu
      <button className="btn btn-primary btn-xs" onClick={onExport}>Xuất đề</button>
      <button className="btn btn-secondary btn-xs" onClick={onExportWithAnswers}>Đề + đáp án</button>
      <button className="btn btn-secondary btn-xs" onClick={onPrint}>In</button>
      <button className="btn btn-secondary btn-xs" onClick={onCopy}>Chép</button>
      <button className="btn btn-ghost btn-xs" onClick={onClear}>Bỏ chọn hết</button>
    </div>
  );
}
