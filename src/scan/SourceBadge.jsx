// ── Source Badge — "📚 Nguồn: SGK …" + Xem nguồn → mở đúng trang ─────
import React from "react";
import { BookOpen, Eye } from "lucide-react";
import { emitOpenSource } from "./sourceBadgeUtils";

/**
 * Renders a provenance badge for any record that has `source.type === 'sgk_scan'`.
 * Clicking dispatches `sgk:open-source` which App.jsx listens to and opens the book.
 */
export default function SourceBadge({ source, books, onOpen, compact = false }) {
  if (!source || source.type !== "sgk_scan") return null;
  const label = source.bookName || source.bookId || "SGK";
  const detail = `Lớp ${source.grade || "?"} • Môn ${source.subject || "?"} • tr.${source.page || "?"}`;
  const handleClick = () => {
    if (onOpen) { onOpen(source); return; }
    // fallback: emit qua unified bus (App.jsx lắng nghe sgk:open-source)
    emitOpenSource(source);
  };
  if (compact) {
    return (
      <button
        className="gl-chip"
        onClick={handleClick}
        title={`Xem nguồn: ${label} — tr.${source.page} (bấm để mở sách)`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", border: "1px solid var(--border-color)" }}
        aria-label={`Xem nguồn ${label} trang ${source.page}`}
      >
        <BookOpen size={11} /> tr.{source.page}
      </button>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        background: "var(--surface-soft)", border: "1px solid var(--border-color)", borderRadius: 8,
        padding: "4px 8px", fontSize: 11, color: "var(--text-mid)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800 }}>📚 Nguồn: {label}</span>
      <span style={{ color: "var(--text-muted)" }}>{detail}</span>
      <button
        className="btn btn-ghost btn-xs"
        onClick={handleClick}
        title="Mở sách đúng trang nguồn"
        aria-label="Xem nguồn"
        style={{ padding: "2px 6px", minHeight: 22, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <Eye size={11} /> Xem nguồn
      </button>
    </span>
  );
}
