import React, { useEffect, useRef } from "react";

// Dialog xác nhận dùng chung — thay window.confirm/alert chặn UI.
// - Bẫy focus Tab trong dialog, Escape để hủy, Enter mặc định vào nút chính
// - Trả focus về nút đã mở sau khi đóng
// - role=alertdialog + aria-modal đúng chuẩn
export default function ConfirmDialog({
  open = false,
  title = "Xác nhận",
  message = "",
  confirmText = "Xóa",
  cancelText = "Hủy",
  danger = true,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    try { lastFocus.current = document.activeElement; } catch { lastFocus.current = null; }
    const t = setTimeout(() => {
      try { (cancelRef.current || confirmRef.current)?.focus(); } catch {}
    }, 30);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
      if (e.key === "Tab") {
        // focus trap đơn giản giữa 2 nút (+ nút đóng nếu có)
        const els = [cancelRef.current, confirmRef.current].filter(Boolean);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      try { lastFocus.current?.focus?.(); } catch {}
    };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="confirm-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" className="confirm-box">
        <h3 id="confirm-title" className="confirm-title">{title}</h3>
        {message && <p id="confirm-desc" className="confirm-desc">{message}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
