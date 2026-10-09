import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, LayoutGrid, Dices, BookOpen } from "lucide-react";
import aiService from "./aiService";
import FileDropzone from "./components/FileDropzone.jsx";

// ─── Floating utility bubble (collapsible panel like a chat bubble) ──────────
export default function UtilityBubble({
  icon,
  title,
  badge = 0,
  children,
  defaultOpen = false,
  align = "left",
  className = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const bubbleRef = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Drag & Drop handlers
  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('.util-bubble-header')) {
      e.preventDefault();
      setIsDragging(true);
      const rect = bubbleRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      if (bubbleRef.current) {
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        // Keep within viewport
        const maxX = window.innerWidth - bubbleRef.current.offsetWidth;
        const maxY = window.innerHeight - bubbleRef.current.offsetHeight;
        bubbleRef.current.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        bubbleRef.current.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        bubbleRef.current.style.right = 'auto';
        bubbleRef.current.style.bottom = 'auto';
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const isToc = className.includes("util-bubble--toc");
  const bubblePos = isToc
    ? { right: "5.8rem", left: "auto" }
    : align === "right"
      ? { right: "1.25rem", left: "auto" }
      : { left: "1.25rem", right: "auto" };
  const z = isToc ? 4999 : 5000;
  return (
    <div
      className={`util-bubble ${align === "right" ? "util-bubble--right" : ""} ${className}`.trim()}
      ref={bubbleRef}
      style={{ position: "fixed", bottom: "1.25rem", zIndex: z, ...bubblePos }}
    >
      {open && (
        <div className="util-bubble-panel">
          <div className="util-bubble-header" onMouseDown={handleHeaderMouseDown}>
            <span
              className="flex-row gap-sm"
            >
              {icon} {title}
            </span>
            <button
              className="util-bubble-close"
              onClick={() => setOpen(false)}
              aria-label="Đóng bong bóng tiện ích"
            >
              <X size={16} />
            </button>
          </div>
          <div className="util-bubble-body">{children}</div>
        </div>
      )}
      <button
        className="util-bubble-fab"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Đóng" : title}
        aria-label={title}
      >
        {icon}
        {badge > 0 && <span className="util-bubble-badge">{badge}</span>}
      </button>
    </div>
  );
}

// ─── Lobby variant: library stats + shortcuts ────────────────────────────────
export function LobbyBubble({ books, geminiKey, onOpenBook, onOpenGlossary }) {
  const stats = useMemo(() => {
    const byGrade = {};
    const bySubject = {};
    books.forEach((b) => {
      byGrade[b.grade] = (byGrade[b.grade] || 0) + 1;
      bySubject[b.subject] = (bySubject[b.subject] || 0) + 1;
    });
    return { total: books.length, byGrade, bySubject };
  }, [books]);

  const openRandom = () => {
    if (!books.length) return;
    onOpenBook(books[Math.floor(Math.random() * books.length)]);
  };

  return (
    <UtilityBubble
      icon={<LayoutGrid size={18} />}
      title="Tiện ích thư viện"
      badge={stats.total}
    >
      <div className="util-stat-grid">
        <div className="util-stat">
          <strong>{stats.total}</strong>
          <span>Cuốn sách</span>
        </div>
        {[1, 2, 3, 4, 5].map((g) =>
          stats.byGrade[g] ? (
            <div className="util-stat" key={g}>
              <strong>{stats.byGrade[g]}</strong>
              <span>Lớp {g}</span>
            </div>
          ) : null,
        )}
        {Object.entries(stats.bySubject).map(([s, n]) => (
          <div className="util-stat" key={s}>
            <strong>{n}</strong>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <button
        className="btn btn-primary util-btn"
        onClick={openRandom}
        disabled={!books.length}
      >
        <Dices size={15} /> Mở sách ngẫu nhiên
      </button>
      <button className="btn btn-secondary util-btn" onClick={onOpenGlossary}>
        <BookOpen size={15} /> Bảng thuật ngữ sư phạm
      </button>
      <div className={`util-key ${geminiKey ? "ok" : "no"}`}>
        {geminiKey
          ? "✅ AI đã sẵn sàng"
          : "⚠️ Chưa có API Key — mở Cài đặt AI nhé!"}
      </div>
    </UtilityBubble>
  );
}
