import { useEffect, useRef } from "react";

// Bẫy focus trong modal: Tab xoay vòng, Escape đóng, trả focus về nút đã mở.
// Dùng cho các modal inline chưa có trap (App delete/rename/url, ...).
// ConfirmDialog đã tự có trap riêng nên không cần hook này.
export function useFocusTrap(open, onEscape) {
  const boxRef = useRef(null);
  const lastFocus = useRef(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    try { lastFocus.current = document.activeElement; } catch { lastFocus.current = null; }
    const box = boxRef.current;
    // Focus ưu tiên [data-initial-focus] (nút an toàn như "Hủy" — React không
    // render attr autofocus ra DOM nên không query [autofocus] được),
    // rồi mới input/button đầu tiên
    const t = setTimeout(() => {
      try {
        const el = box?.querySelector?.("[data-initial-focus]")
          || box?.querySelector?.("[autofocus]")
          || box?.querySelector?.("input:not([disabled]), button:not([disabled])")
          || box;
        el?.focus?.();
      } catch {}
    }, 30);
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    // Khóa scroll nền khi modal mở
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      try { lastFocus.current?.focus?.(); } catch {}
    };
  }, [open ]);

  return boxRef;
}
