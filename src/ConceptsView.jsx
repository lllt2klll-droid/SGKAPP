// ── Sổ khái niệm riêng (ghi tay, hoàn toàn offline, không dùng AI) ──
import React, { useMemo, useState, useEffect } from "react";
import {
  NotebookPen,
  Plus,
  Search,
  Trash2,
  FileText,
  FileSpreadsheet,
  Pencil,
  Check,
  X,
} from "lucide-react";
import DataTable from "./DataTable";
import {
  getConcepts,
  addConcept,
  updateConcept,
  deleteConcept,
  conceptCategories,
} from "./researchDB";
import { exportWord, exportCsv, escapeHtml, nl2br } from "./exportDoc";
import SampleButton from "./SampleButton";
import { fillSampleConcepts } from "./sampleData";

const EMPTY = { term: "", category: "", definition: "", file: "", page: "" };

export default function ConceptsView({ books, onNavigate }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => { try { setTick(t=>t+1); } catch (e) { console.warn("[ConceptsView] tick failed", e); } }; window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const [concepts, setConcepts] = useState([]);
  const [cats, setCats] = useState([]);
  const [loadingConcepts, setLoadingConcepts] = useState(true);
  const byFile = useMemo(
    () => new Map(books.map((b) => [b.filename, b])),
    [books],
  );

  const loadConcepts = async () => {
    setLoadingConcepts(true);

    try {
      const [conceptList, categoryList] = await Promise.all([
        getConcepts(),
        conceptCategories(),
      ]);

      return {
        concepts: Array.isArray(conceptList) ? conceptList : [],
        categories: Array.isArray(categoryList) ? categoryList : [],
      };
    } catch (err) {
      console.error('Failed to load concepts:', err);
      return {
        concepts: [],
        categories: [],
      };
    } finally {
      setLoadingConcepts(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [conceptList, categoryList] = await Promise.all([
          getConcepts(),
          conceptCategories(),
        ]);

        if (cancelled) return;

        setConcepts(Array.isArray(conceptList) ? conceptList : []);
        setCats(Array.isArray(categoryList) ? categoryList : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load concepts:', err);
        setConcepts([]);
        setCats([]);
      } finally {
        if (!cancelled) {
          setLoadingConcepts(false);
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
    return concepts.filter((c) => {
      const okQ =
        !q ||
        c.term.toLowerCase().includes(q) ||
        (c.definition || "").toLowerCase().includes(q);
      const okC = !catFilter || c.category === catFilter;
      return okQ && okC;
    });
  }, [concepts, query, catFilter]);

  const startNew = () => {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(true);
  };
  const startEdit = (c) => {
    setForm({
      term: c.term,
      category: c.category || "",
      definition: c.definition || "",
      file: c.file || "",
      page: String(c.page || ""),
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const save = async () => {
    const term = form.term.trim();
    if (!term) return;

    const payload = {
      term,
      category: form.category.trim(),
      definition: form.definition.trim(),
      file: form.file,
      page: form.page
        ? parseInt(form.page, 10)
        : null,
    };

    try {
      if (editingId) {
        await updateConcept(editingId, payload);
      } else {
        await addConcept(payload);
      }

      await loadConcepts();

      setShowForm(false);
      setForm(EMPTY);
      setEditingId(null);
    } catch (err) {
      console.error('Failed to save concept:', err);
      alert('Không thể lưu khái niệm.');
    }
  };

  const exportWordDoc = () => {
    if (!filtered.length) return;
    const groups = {};
    filtered.forEach((c) => {
      const g = c.category || "Khác";
      (groups[g] = groups[g] || []).push(c);
    });
    let html = `<h1>Sổ khái niệm nghiên cứu</h1><div class="meta">${filtered.length} khái niệm • Xuất ${new Date().toLocaleString("vi-VN")}</div>`;
    Object.entries(groups)
      .sort()
      .forEach(([g, list]) => {
        html += `<h2>${escapeHtml(g)}</h2>`;
        list
          .sort((a, b) => a.term.localeCompare(b.term, "vi"))
          .forEach((c) => {
            html += `<h3>${escapeHtml(c.term)}</h3><p>${nl2br(c.definition || "")}</p>`;
            if (c.file || c.page)
              html += `<small>Nguồn: ${escapeHtml(c.file)}${c.page ? `, tr. ${c.page}` : ""}</small>`;
          });
      });
    exportWord("So khai niem nghien cuu", html);
  };

  const exportCsvDoc = () => {
    if (!filtered.length) return;
    const rows = [["Thuật ngữ", "Phân loại", "Định nghĩa", "Nguồn", "Trang"]];
    filtered.forEach((c) =>
      rows.push([
        c.term,
        c.category || "",
        c.definition || "",
        c.file || "",
        String(c.page || ""),
      ]),
    );
    exportCsv("So khai niem", rows);
  };

  return (
    <div>
      <div className="toolbar-row mb-md">
        <div className="search-input-wrapper ui-s-488469"
        >
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="search-input"
            placeholder="Tìm khái niệm…"
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
        </div>
        <select
          className="sort-select"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="">Tất cả phân loại</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="ui-s-91d8ba">
          <SampleButton
            onRun={async () => {
              const added = await fillSampleConcepts();
              await loadConcepts();
              refresh();
              alert(
                added
                  ? `Đã thêm ${added} khái niệm mẫu.`
                  : "Các khái niệm mẫu đã có sẵn.",
              );
            }}
          />
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportCsvDoc}
            disabled={!filtered.length}
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportWordDoc}
            disabled={!filtered.length}
          >
            <FileText size={13} /> Xuất Word
          </button>
          <button className="btn btn-primary btn-xs" onClick={startNew}>
            <Plus size={13} /> Khái niệm mới
          </button>
        </div>
      </div>

      {showForm && (
        <div className="panel-box ui-s-4eb7db"
        >
          <h4 className="ui-s-955b68">
            {editingId ? "✏️ Sửa khái niệm" : "➕ Khái niệm mới"}
          </h4>
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Thuật ngữ *</label>
              <input
                className="form-control"
                value={form.term}
                onChange={(e) =>
                  setForm((f) => ({ ...f, term: e.target.value }))
                }
                placeholder="VD: Số có hai chữ số"
              />
            </div>
            <div>
              <label className="form-label">Phân loại</label>
              <input
                className="form-control"
                list="conc-cats"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder="VD: Kiến thức môn"
              />
              <datalist id="conc-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <label className="form-label">Định nghĩa / giải thích của bạn</label>
          <textarea
            className="form-control"
            rows={4}
            value={form.definition}
            onChange={(e) =>
              setForm((f) => ({ ...f, definition: e.target.value }))
            }
            placeholder="Ghi theo cách nghiên cứu của bạn; có thể thêm sơ đồ, ví dụ, liên hệ bài cụ thể trong sách…"
          />
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Nguồn (tên sách)</label>
              <select
                className="form-control"
                value={form.file}
                onChange={(e) =>
                  setForm((f) => ({ ...f, file: e.target.value }))
                }
              >
                <option value="">— Không gắn nguồn —</option>
                {books.map((b) => (
                  <option key={b.filename} value={b.filename}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Trang</label>
              <input
                className="form-control"
                type="number"
                min={1}
                value={form.page}
                onChange={(e) =>
                  setForm((f) => ({ ...f, page: e.target.value }))
                }
                placeholder="Trang sách (tùy chọn)"
              />
            </div>
          </div>
          <div className="ui-s-b790dd">
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={!form.term.trim()}
            >
              <Check size={14} /> Lưu khái niệm
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY);
                setEditingId(null);
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {loadingConcepts ? (
        <div className="dash-empty">
          <span className="spinner" />
          <p>Đang tải khái niệm…</p>
        </div>
      ) : !filtered.length ? (
        <div className="dash-empty">
          <NotebookPen size={44} />
          <p>
            Sổ khái niệm trống. Tạo khái niệm của riêng bạn để xây dựng hệ thống
            thuật ngữ nghiên cứu (không cần AI).
          </p>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "term", label: "Khái niệm", sortable: true, render: (v,row)=><div><div style={{fontWeight:750, lineHeight:1.3}}>{row.term}</div>{row.category && <span className="tag-pill ui-s-c53cad">{row.category}</span>}</div> },
            { key: "category", label: "Nhóm", width:"120px", hideOnMobile:true, sortable:true, render: (v)=> v ? <span className="tag-pill tag-pill-muted">{v}</span> : <span className="text-muted">—</span> },
            { key: "file", label: "Sách", width:"160px", hideOnMobile:true, render: (v)=> v ? <span className="ui-s-ec599c cell-clamp" title={byFile.get(v)?.title || v}>{(byFile.get(v)?.title || v).slice(0,28)}</span> : <span className="text-muted">—</span> },
            { key: "page", label: "Trang", width:"80px", align:"center", hideOnMobile:true, sortable:true, render: (v)=> v ? <span className="gl-chip">tr. {v}</span> : <span className="text-muted">—</span> },
            { key: "definition", label: "Mô tả", render: (v)=> v ? <span className="cell-clamp ui-s-f522e4" title={v}>{v}</span> : <span className="text-muted">—</span> },
            { key: "_tag", label: "Tag", width:"110px", hideOnMobile:true, render: (_,row)=> row.category ? <span className="tag-pill tag-pill-muted">{row.category}</span> : <span className="text-muted">—</span> },
            { key: "_actions", label: "Thao tác", width:"120px", align:"right", render: (_,row)=>(
              <span className="data-table-actions">
                <button className="btn btn-secondary btn-xs" onClick={()=>startEdit(row)} title="Sửa" aria-label="Sửa"><Pencil size={12} /></button>
                <button className="btn btn-secondary btn-xs danger" onClick={async ()=>{ if(confirm(`Xóa khái niệm "${row.term}"?`)){ await deleteConcept(row.id); await loadConcepts(); refresh(); } }} title="Xóa" aria-label="Xóa"><Trash2 size={12} /></button>
              </span>
            )},
          ]}
          data={filtered}
          keyField="id"
          emptyText={filtered.length===0 && concepts.length>0 ? "Không tìm thấy khái niệm" : "Chưa có dữ liệu"}
          emptyHint={filtered.length===0 && concepts.length>0 ? "Thử đổi bộ lọc hoặc từ khóa." : "Tạo khái niệm đầu tiên để bắt đầu."}
        />
      )}
      {onNavigate && (
        <div className="panel-box mt-md" style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12, opacity:0.7 }}>Liên kết nhanh:</span>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("collections")}>Bộ sưu tập</button>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("references")}>Tài liệu tham khảo</button>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("search")}>Tìm kiếm</button>
        </div>
      )}
    </div>
  );
}