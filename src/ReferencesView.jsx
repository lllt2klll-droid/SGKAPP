// ── Thư mục tài liệu tham khảo (tự động từ thư viện + nhập tay) ────
import React, { useMemo, useState, useEffect } from "react";
import {
  Library,
  Plus,
  Trash2,
  FileText,
  Download,
  Pencil,
  Check,
  X,
  RefreshCw,
  Eye,
} from "lucide-react";
import DataTable from "./DataTable";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove } from "./safeStorage";
import {
  getRefs,
  upsertBookRef,
  addManualRef,
  updateRef,
  deleteRef,
  formatRef,
} from "./researchDB";
import { exportWord, exportTxt, escapeHtml, nl2br } from "./exportDoc";
import SampleButton from "./SampleButton";
import { fillSampleRefs } from "./sampleData";

export default function ReferencesView({ books, onNavigate }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => { try { setTick(t=>t+1); } catch (e) { console.warn("[ReferencesView] tick failed", e); } }; window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    authors: "",
    year: "",
    title: "",
    publisher: "",
    place: "",
    note: "",
  });

  const [refs, setRefs] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const loadRefs = async () => {
    setLoadingRefs(true);

    try {
      const result = await getRefs();
      return Array.isArray(result) ? result : [];
    } catch (err) {
      console.error('Failed to load references:', err);
      return [];
    } finally {
      setLoadingRefs(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const result = await getRefs();
        if (cancelled) return;
        setRefs(Array.isArray(result) ? result : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load references:', err);
        setRefs([]);
      } finally {
        if (!cancelled) {
          setLoadingRefs(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? refs.filter((r) => formatRef(r).toLowerCase().includes(q))
      : refs;
  }, [refs, query]);

  const missingBooks = books.filter(
    (b) => !refs.some((r) => r.file === b.filename),
  );

  const autoAdd = async () => {
    try {
      for (const book of missingBooks) {
        await upsertBookRef(book);
      }

      await loadRefs();
      refresh();
    } catch (err) {
      console.error('Auto add references failed:', err);
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({
      authors: r.authors || "",
      year: String(r.year || ""),
      title: r.title || "",
      publisher: r.publisher || "",
      place: r.place || "",
      note: r.note || "",
    });
  };

  const saveEdit = async () => {
    if (!form.title.trim()) return;

    const patch = {
      authors: form.authors.trim(),
      year: form.year.trim()
        ? parseInt(form.year, 10)
        : 0,
      title: form.title.trim(),
      publisher: form.publisher.trim(),
      place: form.place.trim(),
      note: form.note.trim(),
    };

    try {
      if (editingId === 'new') {
        await addManualRef({
          ...patch,
          file: '',
        });
      } else {
        await updateRef(editingId, patch);
      }

      await loadRefs();

      setEditingId(null);
    } catch (err) {
      console.error('Failed to save reference:', err);
      alert('Không thể lưu tài liệu tham khảo.');
    }
  };

  const addManual = () => {
    setEditingId("new");
    setForm({
      authors: "",
      year: "",
      title: "",
      publisher: "",
      place: "",
      note: "",
    });
  };

  const exportBibliography = () => {
    if (!refs.length) return;
    const html =
      `<h1>Danh mục tài liệu tham khảo</h1><div class="meta">${refs.length} tài liệu • Xuất ${new Date().toLocaleString("vi-VN")}</div>` +
      `<ol>${refs.map((r) => `<li>${escapeHtml(formatRef(r))}${r.note ? `<br><small>Ghi chú: ${nl2br(r.note)}</small>` : ""}</li>`).join("")}</ol>`;
    exportWord("Danh mục tài liệu tham khảo", html);
  };

  const exportTxtDoc = () => {
    if (!refs.length) return;
    const lines = [
      "DANH MỤC TÀI LIỆU THAM KHẢO",
      `Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
      "",
    ];
    refs.forEach((r, i) =>
      lines.push(
        `${i + 1}. ${formatRef(r)}${r.note ? ` (Ghi chú: ${r.note})` : ""}`,
      ),
    );
    exportTxt("Danh mục tài liệu tham khảo", lines.join("\n"));
  };

  return (
    <div>
      <div className="toolbar-row mb-md">
        <div className="search-input-wrapper min-w-220-max-w-340"
        >
          <SearchInput query={query} setQuery={setQuery} />
        </div>
        <div
          className="flex-row-ml-auto"
        >
          <SampleButton
            onRun={async () => {
              const result =
                await fillSampleRefs(books);

              await loadRefs();
              refresh();

              alert(
                `Đã thêm ${result.added} tài liệu tham khảo mẫu.`,
              );
            }}
          />
          <button
            className="btn btn-secondary btn-xs"
            onClick={autoAdd}
            disabled={!missingBooks.length}
            title={`Thêm ${missingBooks.length} sách chưa có trong danh mục`}
          >
            <RefreshCw size={13} /> Tự động thêm ({missingBooks.length})
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportTxtDoc}
            disabled={!refs.length}
          >
            <Download size={13} /> TXT
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportBibliography}
            disabled={!refs.length}
          >
            <FileText size={13} /> Xuất Word
          </button>
          <button className="btn btn-primary btn-xs" onClick={addManual}>
            <Plus size={13} /> Thêm tay
          </button>
        </div>
      </div>

      <div className="panel-box border-muted-mb-0-9"
      >
        <p className="panel-hint m-0">
          <Library size={13} className="align-neg-2" /> Danh mục tự
          động sinh từ sách trong thư viện (định dạng kiểu APA tiếng Việt). Bạn
          có thể sửa trường năm/NXB và thêm tài liệu ngoài sách giáo khoa (thông
          tư, bài báo…).
        </p>
      </div>

      {editingId && (
        <div className="panel-box border-primary"
        >
          <h4 className="mb-0-7 text-primary font-inherit">
            {editingId === "new"
              ? "➕ Thêm tài liệu tham khảo"
              : "✏️ Sửa tài liệu"}
          </h4>
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Tác giả / cơ quan</label>
              <input
                className="form-control"
                value={form.authors}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authors: e.target.value }))
                }
                placeholder="VD: Bộ Giáo dục và Đào tạo"
              />
            </div>
            <div>
              <label className="form-label">Năm</label>
              <input
                className="form-control"
                type="number"
                value={form.year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, year: e.target.value }))
                }
                placeholder="2023"
              />
            </div>
          </div>
          <label className="form-label">Tên tài liệu *</label>
          <input
            className="form-control"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Tên sách / thông tư / bài báo…"
          />
          <div className="tag-grid-2">
            <div>
              <label className="form-label">NXB</label>
              <input
                className="form-control"
                value={form.publisher}
                onChange={(e) =>
                  setForm((f) => ({ ...f, publisher: e.target.value }))
                }
                placeholder="NXB Giáo dục Việt Nam"
              />
            </div>
            <div>
              <label className="form-label">Nơi xuất bản</label>
              <input
                className="form-control"
                value={form.place}
                onChange={(e) =>
                  setForm((f) => ({ ...f, place: e.target.value }))
                }
                placeholder="Hà Nội"
              />
            </div>
          </div>
          <label className="form-label">Ghi chú</label>
          <input
            className="form-control"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="VD: Tham chiếu cho phần nghiên cứu về…"
          />
          <div className="flex-row-mt-0-7">
            <button
              className="btn btn-primary"
              onClick={saveEdit}
              disabled={!form.title.trim()}
            >
              <Check size={14} /> Lưu
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setEditingId(null)}
            >
              <X size={14} /> Hủy
            </button>
          </div>
        </div>
      )}

      {onNavigate && (
        <div className="panel-box mt-md" style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12, opacity:0.7 }}>Liên kết nhanh:</span>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("collections")}>Bộ sưu tập</button>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("concepts")}>Khái niệm</button>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("search")}>Tìm kiếm</button>
        </div>
      )}
      {!refs.length ? (
        <div className="dash-empty">
          <Library size={44} />
          <p>
            Chưa có tài liệu nào. Bấm “Tự động thêm” để tạo danh mục từ toàn bộ
            sách trong thư viện.
          </p>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "_idx", label: "#", width: "44px", align: "right", render: (_,row,idx)=> filtered.indexOf(row)+1 },
            { key: "title", label: "Tài liệu", sortable: true, render: (v,row)=> <div><div className="flex-1 cell-clamp" title={formatRef(row)}>{formatRef(row)}</div>{row.note && <div className="text-0-72 text-muted cell-clamp">🗒 {row.note}</div>}</div> },
            { key: "authors", label: "Tác giả", hideOnMobile: true, render: (v)=> v || "—" },
            { key: "year", label: "Năm", width: "80px", align: "center", sortable: true, hideOnMobile: true, render: (v)=> v ? String(v) : "—" },
            { key: "source", label: "Loại", width: "90px", align:"center", render: (v,row)=> v==="auto" ? <span className="tag-pill tag-pill-muted">Tự động</span> : <span className="tag-pill">Thủ công</span> },
            { key: "note", label: "Ghi chú", hideOnMobile: true, render: (v)=> v ? <span className="cell-clamp" title={v}>{v}</span> : <span className="text-muted">—</span> },
            { key: "_actions", label: "Thao tác", width:"110px", align:"right", render: (_,row)=>(
              <span className="data-table-actions">
                <button className="btn btn-secondary btn-xs" onClick={()=>startEdit(row)} title="Sửa" aria-label="Sửa"><Pencil size={12} /></button>
                <button className="btn btn-secondary btn-xs danger" onClick={async ()=>{ if(confirm("Xóa tài liệu này?")){ await deleteRef(row.id); await loadRefs(); refresh(); } }} title="Xóa" aria-label="Xóa"><Trash2 size={12} /></button>
              </span>
            )},
          ]}
          data={filtered}
          keyField="id"
          emptyText={`Không tìm thấy tài liệu khớp "${query}"`}
          emptyHint="Thử thay đổi từ khóa tìm kiếm."
        />
      )}
    </div>
  );
}

function SearchInput({ query, setQuery }) {
  return (
    <>
      <svg
        className="search-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        className="search-input"
        placeholder="Tìm trong danh mục…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          aria-label="Xóa tìm kiếm"
          style={{
            position: "absolute",
            right: "0.5rem",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      )}
    </>
  );
}