import React from "react";
import { X } from "lucide-react";

export default function CompareHint({ onDismiss }) {
  return (
    <div className="cmp-hint-v2" role="note">
      <span className="cmp-hint-ico">💡</span>
      <span className="cmp-hint-txt">
        Bật <b>Song song</b> để lật 2 bên cùng lúc • gõ <b>số trang rồi Enter</b> để nhảy tới trang • <b>ghi chú tự lưu</b> theo từng cặp sách • phím tắt <kbd>←</kbd><kbd>→</kbd> lật trang, <kbd>Ctrl</kbd>+<kbd>L</kbd> đổi chế độ, <kbd>Ctrl</kbd>+<kbd>S</kbd> đổi bên
      </span>
      <button className="cmp-icon-btn sm" onClick={onDismiss} title="Ẩn mẹo này" aria-label="Ẩn mẹo này">
        <X size={13} />
      </button>
    </div>
  );
}
