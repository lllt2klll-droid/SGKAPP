// ── Scan History — "Scan gần đây" trong BookReader ───────────────────────
import React, { useEffect, useState } from "react";
import { Clock, Trash2, Eye, BookOpen } from "lucide-react";
import { getScans, deleteScan, getScanFull } from "./scanStore.js";

export default function ScanHistory({ bookFilename, onSelectScan }) {
  const [scans, setScans] = useState(() => getScans());
  const [busy, setBusy] = useState(false);

  const refresh = () => setScans(getScans());

  useEffect(() => {
    const onSaved = () => refresh();
    window.addEventListener("sgk:scan-saved", onSaved);
    window.addEventListener("storage", refresh);
    const t = setInterval(refresh, 2000); // poll for external saves
    return () => { window.removeEventListener("sgk:scan-saved", onSaved); window.removeEventListener("storage", refresh); clearInterval(t); };
  }, []);

  const filtered = bookFilename ? scans.filter(s => (s.bookId || s.book?.filename) === bookFilename) : scans;
  // prefer current book first, else show all with current book on top (already newest first)
  const recent = (filtered.length ? filtered : scans).slice(0, 8);

  if (!recent.length) {
    return (
      <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: 8 }}>
        Chưa có scan nào. Bấm <strong>Quét vùng</strong> <span aria-hidden>✂️</span> rồi kéo trên trang SGK.
      </div>
    );
  }

  const handleView = async (meta) => {
    if (!onSelectScan) return;
    setBusy(true);
    try {
      const full = await getScanFull(meta.id);
      if (full?.dataUrl) onSelectScan(full);
      else onSelectScan(meta);
    } finally { setBusy(false); }
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (!confirm("Xóa scan này khỏi lịch sử?")) return;
    deleteScan(id);
    refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "var(--text-muted)" }}>
        <Clock size={12} /> Scan gần đây
        <span style={{ fontWeight: 400, marginLeft: "auto" }}>{recent.length} mục</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {recent.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => handleView(s)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleView(s); } }}
            title={`Xem lại scan tr.${s.page} — ${s.bookTitle || s.bookId}`}
            style={{
              border: "1px solid var(--border-color)", borderRadius: 10, overflow: "hidden",
              background: "var(--surface)", cursor: "pointer", display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ aspectRatio: "4 / 3", background: "var(--surface-soft)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {s.dataUrl ? (
                <img src={s.dataUrl} alt={`Scan tr.${s.page}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
              ) : (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.hasFullImage ? "Ảnh đầy đủ trong IndexedDB" : "Không có ảnh"}</span>
              )}
            </div>
            <div style={{ padding: "6px 7px", display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dark)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                <BookOpen size={11} /> tr.{s.page} {s.analysis?.topic ? `• ${s.analysis.topic.slice(0, 18)}` : ""}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, justifyContent: "space-between" }}>
                <span>{new Date(s.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} {new Date(s.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-xs" onClick={(e) => handleView(s)} aria-label="Xem lại" title="Xem lại" style={{ padding: "2px 4px", minHeight: 22 }} disabled={busy}><Eye size={11} /></button>
                  <button className="btn btn-ghost btn-xs" onClick={(e) => handleDelete(s.id, e)} aria-label="Xóa" title="Xóa" style={{ padding: "2px 4px", minHeight: 22 }}><Trash2 size={11} /></button>
                </span>
              </div>
              {s.materialType && <span className="gl-chip" style={{ alignSelf: "flex-start", fontSize: 9 }}>{s.materialType}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}