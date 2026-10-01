import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Search,
  Download,
  FileText,
  StickyNote,
  Copy,
  Check,
} from "lucide-react";
import { citationFor } from "./researchDB";
import { exportWord, nl2br, escapeHtml } from "./exportDoc";
import { safeGetJSON, safeSetJSON, safeGetString, safeRemove, listKeysByPrefix } from "./safeStorage";

const FIELDS = [
  {
    id: "mucTieu",
    label: "🎯 Mục tiêu bài học",
    placeholder:
      "Ví dụ: Đọc đúng, hiểu nội dung bài; phát triển năng lực ngôn ngữ…",
  },
  {
    id: "noiDung",
    label: "📚 Nội dung chính",
    placeholder: "Tóm tắt kiến thức trọng tâm của bài…",
  },
  {
    id: "ppdh",
    label: "🧩 Phương pháp dạy học",
    placeholder:
      "Ví dụ: trực quan, đàm thoại, thảo luận nhóm, trò chơi học tập…",
  },
  {
    id: "cauHoi",
    label: "💬 Câu hỏi thảo luận",
    placeholder: "Câu hỏi để hỏi học sinh, mỗi câu một dòng…",
  },
];

const STORAGE_KEY = "studynotes_";
const PIN_PREFIX = "notes_";

// Scan all pinned (sticky) notes of the book across page keys in localStorage
const scanPinNotes = (filename) => {
  const out = [];
  try {
    const prefix = `${PIN_PREFIX}${filename}_`;
    for (const key of listKeysByPrefix(prefix)) {
      const p = parseInt(key.slice(prefix.length), 10);
      if (isNaN(p)) continue;
      const arr = safeGetJSON(key, [], Array.isArray);
      (Array.isArray(arr) ? arr : []).forEach((n) => {
        out.push({ ...n, pdfPage: n.pdfPage ?? p + (n.wrapper || 0) });
      });
    }
  } catch (e) {
    console.warn("[storage] verify failed scanPinNotes", e);
  }
  return out.sort((a, b) => (a.pdfPage || 0) - (b.pdfPage || 0));
};

export default function StructuredNotes({
  book,
  tocTitles = [],
  pageNum = 1,
  onClose,
  onJumpToPin,
  onPinsChanged,
}) {
  const [notes, setNotes] = useState([]);
  const [pinNotes, setPinNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    chapter: "",
    pageNum: String(pageNum),
    mucTieu: "",
    noiDung: "",
    ppdh: "",
    cauHoi: "",
  });
  const [copied, setCopied] = useState(false);
  const [copiedCite, setCopiedCite] = useState(false);

  const storageKey = STORAGE_KEY + book.filename;

  // sanitize HTML for pin display (allow basic formatting)
  const sanitizePinHtml = (html) => {
    if (!html) return "";
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((el) => el.remove());
      const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR"]);
      const walk = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 1) {
            if (!allowed.has(child.tagName)) {
              while (child.firstChild) node.insertBefore(child.firstChild, child);
              child.remove();
            } else {
              [...child.attributes].forEach((a) => child.removeAttribute(a.name));
              walk(child);
            }
          } else if (child.nodeType === 8) child.remove();
        }
      };
      walk(tmp);
      let out = tmp.innerHTML.trim();
      if (/^(<br\s*\/?>)+$/i.test(out)) out = "";
      return out || "";
    } catch {
      return String(html || "").replace(/<[^>]*>/g, "").slice(0, 4000);
    }
  };
  const plainFromHtml = (html) => {
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = html || "";
      return (tmp.textContent || tmp.innerText || "").replace(/\u00A0/g, " ").trim();
    } catch {
      return String(html || "").replace(/<[^>]*>/g, " ").trim();
    }
  };

  useEffect(() => {
    try {
      const data = safeGetJSON(storageKey, [], Array.isArray);
      setNotes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[storage] verify failed " + storageKey, e);
      setNotes([]);
    }
  }, [storageKey]);

  useEffect(() => {
    setPinNotes(scanPinNotes(book.filename));
  }, [book.filename]);

  // Close with Escape
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const persist = (list) => {
    setNotes(list);
    try {
      const r = safeSetJSON(storageKey, list);
      if (!r.ok) console.warn("[StructuredNotes] persist failed", r);
    } catch {
      /* storage full */
    }
  };

  const formHasContent = FIELDS.some((f) => form[f.id].trim());

  const startNew = () => {
    setEditingId("new");
    setForm({
      chapter: "",
      pageNum: String(pageNum),
      mucTieu: "",
      noiDung: "",
      ppdh: "",
      cauHoi: "",
    });
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setForm({
      chapter: note.chapter || "",
      pageNum: String(note.pageNum || ""),
      mucTieu: note.mucTieu || "",
      noiDung: note.noiDung || "",
      ppdh: note.ppdh || "",
      cauHoi: note.cauHoi || "",
    });
  };

  const save = () => {
    if (!formHasContent) return;
    const p = parseInt(form.pageNum, 10);
    const isEdit = editingId != null && editingId !== "new";
    const note = {
      id: isEdit ? editingId : Date.now(),
      date: isEdit ? notes.find((n) => n.id === editingId)?.date || Date.now() : Date.now(),
      chapter: form.chapter.trim(),
      pageNum: isNaN(p) || p < 1 ? null : p,
      mucTieu: form.mucTieu.trim(),
      noiDung: form.noiDung.trim(),
      ppdh: form.ppdh.trim(),
      cauHoi: form.cauHoi.trim(),
    };
    if (isEdit) {
      persist(notes.map((n) => (n.id === editingId ? note : n)));
    } else {
      persist([...notes, note]);
    }
    setEditingId(null);
    setForm({
      chapter: "",
      pageNum: String(pageNum),
      mucTieu: "",
      noiDung: "",
      ppdh: "",
      cauHoi: "",
    });
  };

  const remove = (id) => {
    if (!confirm("Xóa ghi chú bài học này?")) return;
    persist(notes.filter((n) => n.id !== id));
  };

  const deletePin = (id) => {
    const target = pinNotes.find((n) => n.id === id);
    if (!target) return;
    if (
      !confirm(
        `Xóa ghi chú trên trang ${Math.max(1, target.pdfPage - 1)}?`,
      )
    )
      return;
    try {
      const key = `${PIN_PREFIX}${book.filename}_${target.pdfPage}`;
      const arr = safeGetJSON(key, [], Array.isArray);
      const rest = (Array.isArray(arr) ? arr : []).filter((n) => n.id !== id);
      const r = safeSetJSON(key, rest);
      if (!r.ok) console.warn("[StructuredNotes] deletePin save failed", r);
    } catch (e) {
      console.warn("[storage] verify failed deletePin", e);
    }
    setPinNotes(scanPinNotes(book.filename));
    onPinsChanged?.();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? notes.filter((n) => JSON.stringify(n).toLowerCase().includes(q))
      : notes;
    return [...list].sort((a, b) => {
      const ca = a.chapter || "zzz",
        cb = b.chapter || "zzz";
      if (ca !== cb) return ca.localeCompare(cb, "vi");
      return (a.pageNum || 0) - (b.pageNum || 0);
    });
  }, [notes, search]);

  const filteredPins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pinNotes;
    return pinNotes.filter((n) => {
      const txt = plainFromHtml(n.text || "").toLowerCase();
      return txt.includes(q);
    });
  }, [pinNotes, search]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((n) => {
      const ch = n.chapter || "Chưa xếp chương";
      (g[ch] = g[ch] || []).push(n);
    });
    return Object.entries(g);
  }, [filtered]);

  // Group ALL notes (ignoring the search box) for export/copy
  const allGrouped = useMemo(() => {
    const list = [...notes].sort((a, b) => {
      const ca = a.chapter || "zzz",
        cb = b.chapter || "zzz";
      if (ca !== cb) return ca.localeCompare(cb, "vi");
      return (a.pageNum || 0) - (b.pageNum || 0);
    });
    const g = {};
    list.forEach((n) => {
      const ch = n.chapter || "Chưa xếp chương";
      (g[ch] = g[ch] || []).push(n);
    });
    return Object.entries(g);
  }, [notes]);

  const exportTxt = () => {
    if (!notes.length && !pinNotes.length) return;
    const lines = [];
    lines.push(`=== GHI CHÚ BÀI HỌC ===`);
    lines.push(`Sách: ${book.title} (Lớp ${book.grade}, Môn ${book.subject})`);
    lines.push(`Xuất lúc: ${new Date().toLocaleString("vi-VN")}`);
    lines.push("");
    allGrouped.forEach(([ch, list]) => {
      lines.push(`◼ CHƯƠNG: ${ch}`);
      list.forEach((n) => {
        lines.push(`  Trang: ${n.pageNum ? n.pageNum : "—"}`);
        FIELDS.forEach((f) => {
          if (n[f.id])
            lines.push(
              `  ${f.label}:\n${n[f.id]
                .split("\n")
                .map((l) => "    " + l)
                .join("\n")}`,
            );
        });
        lines.push("");
      });
    });
    if (pinNotes.length) {
      lines.push("◼ GHI CHÚ TRÊN TRANG SÁCH");
      pinNotes.forEach((n) => {
        const txt = plainFromHtml(n.text || "") || "(trống)";
        lines.push(`  Trang ${Math.max(1, n.pdfPage - 1)}: ${txt.replace(/\n/g, " ")}${n.images && n.images.length ? ` [${n.images.length} ảnh]` : ""}`);
      });
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ghi chú - ${book.title}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportWordDoc = () => {
    if (!notes.length && !pinNotes.length) return;
    let html = `<h1>Ghi chú bài học — ${escapeHtml(book.title)}</h1>`;
    html += `<div class="meta">Lớp ${book.grade} • Môn ${book.subject} • Xuất lúc ${new Date().toLocaleString("vi-VN")}</div>`;
    if (pinNotes.length) {
      html += "<h2>📌 Ghi chú trên trang sách</h2>";
      pinNotes.forEach((n) => {
        html += `<div style="margin: 0 0 12px;"><p class="meta" style="color:var(--text-muted);font-size:0.85em;"><strong>Trang ${Math.max(1, n.pdfPage - 1)}</strong> — ${escapeHtml(citationFor(book, n.pdfPage))}</p>`;
        const safe = sanitizePinHtml(n.text) || "(trống)";
        html += `<div style="background:var(--surface-soft);border-left:3px solid var(--primary);padding:8px;">${safe}</div>`;
        if (n.images && n.images.length) {
          html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">${n.images.map((src) => `<img src="${src}" style="max-width:120px;max-height:120px;border-radius:6px;border:1px solid #e2e8f0;" />`).join("")}</div>`;
        }
        html += `</div>`;
      });
    }
    allGrouped.forEach(([ch, list]) => {
      html += `<h2>◼ ${escapeHtml(ch)}</h2>`;
      list.forEach((n) => {
        const cit = n.pageNum ? citationFor(book, n.pageNum + 1) : "";
        html += '<div style="margin: 0 0 12px;">';
        if (cit)
          html += `<p class="meta" style="color:var(--text-muted);font-size:0.85em;">${escapeHtml(cit)}</p>`;
        FIELDS.forEach((f) => {
          if (n[f.id])
            html += `<p><strong>${escapeHtml(f.label)}:</strong><br/>${nl2br(escapeHtml(n[f.id]))}</p>`;
        });
        html += "</div>";
      });
    });
    exportWord(`Ghi chú bài học - ${book.title}`, html);
  };

  const copyAll = async () => {
    if (!notes.length && !pinNotes.length) return;
    const parts = allGrouped.map(([ch, list]) => {
      const body = list
        .map((n) => {
          const seg = [`Trang: ${n.pageNum ? n.pageNum : "—"}`];
          FIELDS.forEach((f) => {
            if (n[f.id]) seg.push(`${f.label}:\n${n[f.id]}`);
          });
          return seg.join("\n");
        })
        .join("\n\n");
      return `◼ CHƯƠNG: ${ch}\n${body}`;
    });
    if (pinNotes.length) {
      parts.push(
        "◼ GHI CHÚ TRÊN TRANG SÁCH\n" +
          pinNotes
            .map((n) => `Trang ${Math.max(1, n.pdfPage - 1)}: ${plainFromHtml(n.text || "").replace(/\n/g, " ") || "(trống)"}`)
            .join("\n"),
      );
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const fieldVal = (n, id) => n?.[id] || "";

  // Chuẩn trích dẫn cho trang đang mở (pageNum ở đây là trang sách in)
  const citation = useMemo(
    () => citationFor(book, Number(pageNum) + 1),
    [book, pageNum],
  );

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopiedCite(true);
      setTimeout(() => setCopiedCite(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content sn-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="stack-row gap-sm">
            <StickyNote size={18} /> Ghi chú bài học — {book.title}
          </h3>
          <button
            className="util-bubble-close dark"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sn-toolbar">
          <div className="search-input-wrapper flex-1-min-w-160">
            <Search className="search-icon" size={16} />
            <input
              type="text"
              className="search-input"
              placeholder="Tìm kiếm ghi chú…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary btn-sm-pad"
            onClick={startNew}
            disabled={editingId !== null}
          >
            <Plus size={15} /> Thêm mới
          </button>
          <button
            className="btn btn-secondary btn-sm-pad"
            onClick={copyAll}
            disabled={!notes.length && !pinNotes.length}
            title={
              !notes.length && !pinNotes.length
                ? "Thêm ghi chú trước"
                : "Sao chép tất cả ghi chú"
            }
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
            {copied ? "Đã chép" : "Sao chép"}
          </button>
          <button
            className="btn btn-secondary btn-sm-pad"
            onClick={exportWordDoc}
            disabled={!notes.length && !pinNotes.length}
            title={
              !notes.length && !pinNotes.length
                ? "Thêm ghi chú trước"
                : "Xuất Word kèm trích dẫn chuẩn cho từng ghi chú"
            }
          >
            <FileText size={15} /> Xuất Word
          </button>
          <button
            className="btn btn-secondary btn-sm-pad"
            onClick={exportTxt}
            disabled={!notes.length && !pinNotes.length}
            title={
              !notes.length && !pinNotes.length
                ? "Thêm ghi chú trước"
                : "Xuất ra file TXT"
            }
          >
            <Download size={15} /> Xuất TXT
          </button>
        </div>

        {/* Citation bar — chuẩn trích dẫn cho trang đang đọc */}
        <div className="sn-citebar">
          <div className="min-w-0">
            <span className="panel-hint m-0-font-bold">
              Trích dẫn chuẩn cho tài liệu:
            </span>
            <p className="panel-hint mt-0-1">{citation}</p>
          </div>
          <button
            className="btn btn-secondary btn-xs flex-shrink-0"
            onClick={copyCitation}
            title="Sao chép trích dẫn vào khay nhớ tạm"
          >
            {copiedCite ? <Check size={12} /> : <Copy size={12} />}{" "}
            {copiedCite ? "Đã chép" : "Chép"}
          </button>
        </div>

        {/* Edit form */}
        {editingId !== null && (
          <div className="sn-form">
            <div className="sn-form-row">
              <div className="flex-1 min-w-0">
                <label className="form-label">Chương / Chủ đề</label>
                <input
                  className="form-control"
                  list={`toc-list-${book.filename.replace(/\W/g, "")}`}
                  placeholder="Chọn hoặc gõ tên chương"
                  value={form.chapter}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, chapter: e.target.value }))
                  }
                />
                {tocTitles.length > 0 && (
                  <datalist id={`toc-list-${book.filename.replace(/\W/g, "")}`}>
                    {tocTitles.map((t, i) => (
                      <option key={i} value={t} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="w-110">
                <label className="form-label">Trang</label>
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  value={form.pageNum}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pageNum: e.target.value }))
                  }
                />
              </div>
            </div>
            {FIELDS.map((f) =>
              f.id === "ppdh" ? (
                <div className="sn-form-row ppdh grid-col-full" key={f.id}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: "280px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <label className="form-label">Giáo viên</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder={f.placeholder}
                      value={form[f.id]}
                      onChange={(e) =>
                        setForm((x) => ({ ...x, [f.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: "280px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <label className="form-label">Học sinh</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder={f.placeholder}
                      value={form[f.id]}
                      onChange={(e) =>
                        setForm((x) => ({ ...x, [f.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : (
                <div key={f.id}>
                  <label className="form-label">{f.label}</label>
                  <textarea
                    className="form-control"
                    rows={f.id === "noiDung" ? 3 : 2}
                    placeholder={f.placeholder}
                    value={form[f.id]}
                    onChange={(e) =>
                      setForm((x) => ({ ...x, [f.id]: e.target.value }))
                    }
                  />
                </div>
              ),
            )}
            <div className="flex-row-end">
              <button
                className="btn btn-secondary btn-sm-pad-2"
                onClick={() => setEditingId(null)}
              >
                Hủy
              </button>
              <button
                className="btn btn-primary btn-sm-pad-2"
                onClick={save}
                disabled={!formHasContent}
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        )}

        {/* Notes list grouped by chapter */}
        <div className="sn-list">
          {notes.length === 0 && pinNotes.length === 0 && !search && (
            <div className="util-empty">
              <StickyNote size={28} style={{ opacity: 0.4 }} />
              <p>
                Chưa có ghi chú nào. Bấm <strong>Thêm mới</strong> để ghi theo
                cấu trúc giáo án, hoặc nhấp đúp lên trang sách để ghim ghi chú —
                chúng sẽ hiện ở đây.
              </p>
            </div>
          )}
          {notes.length === 0 && pinNotes.length === 0 && search && (
            <div className="util-empty">
              <p>Không tìm thấy ghi chú phù hợp.</p>
            </div>
          )}

          {/* Pinned notes on book pages */}
          {filteredPins.length > 0 && (
            <div className="sn-chapter">
              <h4 className="sn-chapter-title">
                📌 Ghi chú trên trang sách{" "}
                <span className="sn-count">{filteredPins.length}</span>
              </h4>
              {filteredPins.map((n) => {
                const plain = plainFromHtml(n.text || "");
                const preview = plain ? (plain.length > 56 ? plain.slice(0, 56).trimEnd() + "…" : plain) : "(trống)";
                const hasImg = n.images && n.images.length > 0;
                return (
                  <div
                    key={n.id}
                    className="sn-pin-row"
                    onClick={() => {
                      onJumpToPin?.(n);
                      onClose();
                    }}
                    title={`${plain || "(trống)"} — Nhảy tới trang ${Math.max(1, n.pdfPage - 1)}`}
                  >
                    <div className="sn-pin-page">
                      <span className="sn-pin-page-num">{Math.max(1, n.pdfPage - 1)}</span>
                      <span className="sn-pin-page-label">tr.</span>
                    </div>
                    <div className="sn-pin-preview">
                      <span className="sn-pin-preview-text">{preview}</span>
                      {hasImg && <span className="sn-pin-img-badge" title={`${n.images.length} ảnh`}>📷 {n.images.length}</span>}
                    </div>
                    <button
                      className="sn-pin-del"
                      aria-label="Xóa ghi chú"
                      title="Xóa ghi chú"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePin(n.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {grouped.map(([ch, list]) => (
            <div key={ch} className="sn-chapter">
              <h4 className="sn-chapter-title">
                ◼ {ch} <span className="sn-count">{list.length}</span>
              </h4>
              {list.map((n) => (
                <div
                  key={n.id}
                  className="sn-note"
                  onClick={() => startEdit(n)}
                >
                  <div className="sn-note-head">
                    <span className="sn-note-page">
                      Trang {n.pageNum || "—"}
                    </span>
                    <span className="sn-note-date">
                      {new Date(n.date).toLocaleDateString("vi-VN")}
                    </span>
                    <button
                      className="util-bubble-close dark"
                      aria-label="Xóa ghi chú"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="sn-note-body">
                    {FIELDS.map((f) =>
                      fieldVal(n, f.id) ? (
                        f.id === "ppdh" ? (
                          <div key={f.id} className="sn-note-field ppdh">
                            <div>
                              <strong>Giáo viên</strong>
                              <span className="whitespace-pre-wrap">
                                {fieldVal(n, f.id)}
                              </span>
                            </div>
                            <div>
                              <strong>Học sinh</strong>
                              <span className="whitespace-pre-wrap">
                                {fieldVal(n, f.id)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p key={f.id} className="sn-note-field">
                            <strong>
                              {f.label.split(" ").slice(1).join(" ")}:
                            </strong>{" "}
                            <span className="whitespace-pre-wrap">
                              {fieldVal(n, f.id)}
                            </span>
                          </p>
                        )
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}