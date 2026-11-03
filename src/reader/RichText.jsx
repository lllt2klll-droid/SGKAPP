import React, { useEffect, useRef } from "react";

// Lightweight rich-text: contentEditable, Ctrl+B/I/U works natively, no toolbar icons
export default function RichTextArea({ value, onChange, placeholder = "", minHeight = 90, compact = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cur = el.innerHTML;
    const next = value || "";
    if (cur !== next) el.innerHTML = next;
  }, [value]);

  return (
    <div className={`rich-editor${compact ? " compact" : ""}`}>
      <div
        ref={ref}
        className="rich-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}