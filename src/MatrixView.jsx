// ── Gắn thẻ chuẩn + Ma trận chuẩn bị dạy học theo CTGDPT 2018 ─────
import React, { useMemo, useState, useEffect } from "react";
import {
  Table2,
  Tag,
  FileText,
  FileSpreadsheet,
  Trash2,
  BookOpen,
  Plus,
} from "lucide-react";
import {
  listMarks,
  clearMarksForBook,
  getPageMark,
  savePageMark,
  chapterAt,
} from "./researchDB";
import { machsForSubject, machById, yccdById, MUC_DO } from "./ctgpt";
import { exportWord, exportCsv, escapeHtml } from "./exportDoc";
import SampleButton from "./SampleButton";
import { fillSampleMarks } from "./sampleData";
import DataTable from "./DataTable";
import { safeGetJSON, safeSetJSON } from "./safeStorage";

export default function MatrixView({ books, onOpenBook }) {
  const [file, setFile] = useState("");
  const [tab, setTab] = useState("list");
  const [editing, setEditing] = useState(null); // pdf page being edited inline
  const [form, setForm] = useState(null);

  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => { try { setTick(t=>t+1); } catch (e) { console.warn("[MatrixView] tick failed", e); } }; window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);

  const book = books.find((b) => b.filename === file) || null;
  const marks = book ? listMarks(book) : [];

  const machines = book ? machsForSubject(book.subject) : [];

  const startEdit = (m) => {
    setEditing(m.page);
    setForm({
      tieuDe: m.tieuDe || "",
      mach: m.mach || "",
      mucdo: m.mucdo || "",
      tiet: m.tiet || "",
      thietBi: m.thietBi || [],
      ghiChu: m.ghiChu || "",
    });
  };

  const saveEdit = (page) => {
    try {
      const cur = getPageMark(book, page) || {};
      savePageMark(book, page, {
        yccd: cur.yccd || [],
        ...form,
        thietBi: Array.isArray(form.thietBi) ? form.thietBi : [],
      });
      setEditing(null);
      setForm(null);
      refresh();
    } catch (err) {
      console.warn('[MatrixView] Failed to save page mark:', err);
      if (err && err.message && /quota/i.test(err.message)) console.warn("[safeStorage] QuotaExceededError: không thể lưu do bộ nhớ đầy");
      alert('Không thể lưu dữ liệu: bộ nhớ đầy. Hãy xóa bớt dữ liệu hoặc thử lại.');
    }
  };

  // ── Matrix aggregates ───────────────────────────────────────────
  const matrix = useMemo(() => {
    if (!book) return null;
    const marksRaw = listMarks(book);
    const rows = marksRaw.map((m) => ({
      page: m.page,
      mach: m.mach || "",
      machName: (machById(book.subject, m.mach) || {}).name || "Chưa xếp mạch",
      mucdo: m.mucdo || "Chưa xếp",
      tiet: m.tiet || "",
      thietBi: m.thietBi || [],
      tieuDe: m.tieuDe || "",
      yccd: (m.yccd || []).map((id) => (yccdById(id) || { text: id }).text),
      chapter: chapterAt(book, Math.max(1, m.page - 1)),
    }));
    const byMach = {};
    const byMucdo = {};
    const byChapter = {};
    rows.forEach((r) => {
      byMach[r.machName] = (byMach[r.machName] || 0) + 1;
      byMucdo[r.mucdo] = (byMucdo[r.mucdo] || 0) + 1;
      const ch = r.chapter || "Không xác định";
      (byChapter[ch] = byChapter[ch] || []).push(r);
    });
    return { rows, byMach, byMucdo, byChapter };
  }, [book]);

  const exportMatrixWord = () => {
    if (!book || !matrix) return;
    let html = "";
    Object.entries(matrix.byChapter).forEach(([ch, rowList]) => {
      html += `<h2>${escapeHtml(ch)} (${rowList.length} trang được gắn thẻ)</h2><table><tr><th>Trang</th><th>Bài/tiêu đề</th><th>Mạch</th><th>Yêu cầu cần đạt</th><th>Mức độ</th><th>Tiết</th><th>Thiết bị</th></tr>`;
      rowList.forEach((r) => {
        html += `<tr><td>${Math.max(1, r.page - 1)}</td><td>${escapeHtml(r.tieuDe)}</td><td>${escapeHtml(r.machName)}</td><td>${r.yccd.map(escapeHtml).join("<br>")}</td><td>${escapeHtml(r.mucdo)}</td><td>${escapeHtml(r.tiet)}</td><td>${r.thietBi.map(escapeHtml).join("<br>")}</td></tr>`;
      });
      html += "</table>";
    });
    html += `<h2>Tổng hợp mạch kiến thức</h2><table><tr><th>Mạch</th><th>Số trang liên quan</th></tr>${Object.entries(
      matrix.byMach,
    )
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`)
      .join("")}</table>`;
    exportWord(`Ma trận dạy học — ${book.title}`, html);
  };

  const exportMatrixCsv = () => {
    if (!book || !matrix) return;
    const rows = [
      [
        "Trang",
        "Bài/tiêu đề",
        "Chương",
        "Mạch",
        "Mức độ",
        "Tiết",
        "Yêu cầu cần đạt",
        "Thiết bị",
      ],
    ];
    matrix.rows.forEach((r) =>
      rows.push([
        String(Math.max(1, r.page - 1)),
        r.tieuDe,
        r.chapter,
        r.machName,
        r.mucdo,
        r.tiet,
        r.yccd.join("; "),
        r.thietBi.join("; "),
      ]),
    );
    exportCsv(`Ma tran - ${book.title}`, rows);
  };

  if (!book) {
    return (
      <div className="dash-empty">
        <Table2 size={44} />
        <p>Chọn một cuốn sách để xem và gắn thẻ theo chuẩn CTGDPT 2018.</p>
        <select
          className="sort-select mt-0-6-min-w-260"
          value={file}
          onChange={(e) => setFile(e.target.value)}
        >
          <option value="">— Chọn sách —</option>
          {books.map((b) => (
            <option key={b.filename} value={b.filename}>
              {b.title}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar-row mb-md">
        <select
          className="sort-select"
          value={file}
          onChange={(e) => {
            setFile(e.target.value);
            setEditing(null);
          }}
        >
          <option value="">— Chọn sách —</option>
          {books.map((b) => (
            <option key={b.filename} value={b.filename}>
              {b.title}
            </option>
          ))}
        </select>
        <div className="seg-tabs">
          <button
            className={`seg-tab${tab === "list" ? " active" : ""}`}
            onClick={() => setTab("list")}
          >
            <Tag size={14} /> Các trang đã gắn thẻ ({marks.length})
          </button>
          <button
            className={`seg-tab${tab === "matrix" ? " active" : ""}`}
            onClick={() => setTab("matrix")}
          >
            <Table2 size={14} /> Ma trận dạy học
          </button>
        </div>
        <div
          className="ml-auto flex-row gap-sm"
        >
          <SampleButton
            onRun={() => {
              const n = fillSampleMarks(book);
              refresh();
              alert(
                n
                  ? `Đã gắn thẻ mẫu cho ${n} trang của "${book.title}".`
                  : "Các trang mẫu của cuốn này đã được gắn thẻ rồi.",
              );
            }}
            disabled={!book}
          />
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportMatrixWord}
            disabled={!marks.length}
          >
            <FileText size={13} /> Xuất Word
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportMatrixCsv}
            disabled={!marks.length}
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
        </div>
      </div>

      {marks.length === 0 && (
        <div className="dash-empty">
          <Tag size={40} />
          <p>
            Chưa có trang nào được gắn thẻ. Mở sách, tới trang cần gắn và bấm{" "}
            <strong>Gắn thẻ CTGDPT</strong> trong thanh công cụ.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenBook(book)}>
            <BookOpen size={15} /> Mở sách để gắn thẻ
          </button>
        </div>
      )}

      {tab === "list" && marks.length > 0 && (
        <div>
          {(() => {
            const rows = marks.map((m) => {
              const machName = (machById(book.subject, m.mach) || {}).name || "—";
              const yccdTexts = (m.yccd || []).map((id) => (yccdById(id) || { text: id }).text).join("; ");
              return {
                id: m.page,
                trang: Math.max(1, m.page - 1),
                _page: m.page,
                bai: m.tieuDe || "—",
                mach: machName,
                yccd: yccdTexts || "—",
                mucdo: m.mucdo || "—",
                tiet: m.tiet || "—",
                thietBi: (m.thietBi || []).join(", ") || "—",
                _raw: m,
              };
            });
            const cols = [
              { key: "trang", label: "Trang", sortable: true, width: "80px", align: "right" },
              { key: "bai", label: "Bài / Tiêu đề", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
              { key: "mach", label: "Mạch", sortable: true, width: "140px", render: (v) => <span className="tag-pill">{v}</span>, hideOnMobile: false },
              { key: "yccd", label: "YCCĐ", sortable: false, width: "220px", hideOnMobile: true, render: (v) => <span className="cell-clamp">{v}</span> },
              { key: "mucdo", label: "Mức độ", sortable: true, width: "110px", align: "center", hideOnMobile: true, render: (v) => <span className="tag-pill">{v}</span> },
              { key: "tiet", label: "Tiết", sortable: true, width: "80px", align: "center", hideOnMobile: true },
              { key: "thietBi", label: "Thiết bị", sortable: false, width: "160px", hideOnMobile: true, render: (v) => <span className="cell-clamp">{v}</span> },
              { key: "thaoTac", label: "Thao tác", width: "160px", align: "center", render: (_, row) => (
                <span className="inline-flex-sm">
                  <button className="btn btn-secondary btn-xs" aria-label={`Đến trang ${row.trang}`} onClick={() => onOpenBook(book, row._page)}><BookOpen size={12} /></button>
                  {editing !== row._page ? (
                    <button className="btn btn-secondary btn-xs" aria-label={`Sửa trang ${row.trang}`} onClick={() => startEdit(row._raw)}>✏️</button>
                  ) : (
                    <button className="btn btn-primary btn-xs" aria-label={`Lưu trang ${row.trang}`} onClick={() => { saveEdit(row._page); refresh(); }}>💾</button>
                  )}
                </span>
              )},
            ];
            return (
              <>
                <DataTable columns={cols} data={rows} keyField="id" emptyText="Chưa có trang nào được gắn thẻ" />
                {editing !== null && form && (() => {
                  const m = marks.find(x => x.page === editing);
                  if (!m) return null;
                  return (
                    <div className="panel-box border-primary-mt-0-8">
                      <div className="panel-title">Chỉnh sửa — Trang {Math.max(1, editing - 1)} {m.tieuDe ? `• ${m.tieuDe}` : ""}</div>
                      <div className="mx-edit">
                        <div className="tag-grid-2">
                          <div>
                            <label className="form-label">Tiêu đề / bài:</label>
                            <input className="form-control" value={form.tieuDe} onChange={(e) => setForm((f) => ({ ...f, tieuDe: e.target.value }))} />
                          </div>
                          <div>
                            <label className="form-label">Mạch:</label>
                            <select className="form-control" value={form.mach} onChange={(e) => setForm((f) => ({ ...f, mach: e.target.value }))}>
                              <option value="">—</option>
                              {machines.map((mc) => (<option key={mc.id} value={mc.id}>{mc.name}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Mức độ:</label>
                            <select className="form-control" value={form.mucdo} onChange={(e) => setForm((f) => ({ ...f, mucdo: e.target.value }))}>
                              <option value="">—</option>
                              {MUC_DO.map((mc) => (<option key={mc} value={mc}>{mc}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Tiết:</label>
                            <input className="form-control" value={form.tiet} onChange={(e) => setForm((f) => ({ ...f, tiet: e.target.value }))} />
                          </div>
                        </div>
                        <label className="form-label">Thiết bị (phân cách bởi dấu phẩy):</label>
                        <input className="form-control" value={form.thietBi.join(", ")} onChange={(e) => setForm((f) => ({ ...f, thietBi: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} />
                        <label className="form-label">Ghi chú:</label>
                        <textarea className="form-control" rows={2} value={form.ghiChu} onChange={(e) => setForm((f) => ({ ...f, ghiChu: e.target.value }))} />
                        <div className="flex-row-sm-mt-0-6">
                          <button className="btn btn-primary btn-xs" onClick={() => { saveEdit(editing); refresh(); }}>💾 Lưu</button>
                          <button className="btn btn-secondary btn-xs" onClick={() => { setEditing(null); setForm(null); }}>Hủy</button>
                        </div>
                      </div>
                      {(m.yccd || []).length > 0 && (
                        <div className="tag-chips tag-chips-sm">
                          {(m.yccd || []).map((id) => {
                            const y = yccdById(id);
                            return (<span className="tag-chip on border-primary bg-primary-light text-primary" key={id}>{y ? y.text : id}</span>);
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            );
          })()}
          <div className="flex-row-sm-mb-0-8">
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (confirm(`Xóa toàn bộ thẻ của "${book.title}"?`)) {
                  clearMarksForBook(book);
                  refresh();
                }
              }}
            >
              <Trash2 size={14} /> Xóa hết thẻ của sách này
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onOpenBook(book)}
            >
              <Plus size={14} /> Gắn thẻ thêm trang
            </button>
          </div>
        </div>
      )}

      {tab === "matrix" && matrix && (
        <div>
          <div
            className="stat-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            }}
          >
            {machines.map((mc) => (
              <div key={mc.id} className="stat-card">
                <div className="stat-label" style={{ color: mc.color }}>
                  {mc.name}
                </div>
                <div className="stat-value">
                  {matrix.byMach[mc.name] || 0} trang
                </div>
              </div>
            ))}
            {MUC_DO.map((mc) => (
              <div key={mc} className="stat-card">
                <div className="stat-label">Mức {mc}</div>
                <div className="stat-value">
                  {matrix.byMucdo[mc] || 0} trang
                </div>
              </div>
            ))}
          </div>

          <div className="stat-section">
            <h3 className="m-0">Theo chương / chủ đề</h3>
            {Object.entries(matrix.byChapter).map(([ch, rowList]) => {
              const rows = rowList.map((r) => ({ id: r.page, trang: Math.max(1, r.page - 1), bai: r.tieuDe || "—", mach: r.machName, mucdo: r.mucdo || "—", tiet: r.tiet || "—", thietBi: r.thietBi.join(", ") || "—" }));
              return (
              <div key={ch} className="mx-chapter">
                <h4 className="sn-chapter-title">
                  ◼ {ch}{" "}
                  <span className="sn-count">{rowList.length} trang</span>
                </h4>
                <DataTable
                  columns={[
                    { key: "trang", label: "Trang", sortable: true, width: "80px", align: "right" },
                    { key: "bai", label: "Bài / tiêu đề", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
                    { key: "mach", label: "Mạch", sortable: true, width: "140px", render: (v) => <span className="tag-pill">{v}</span> },
                    { key: "mucdo", label: "Mức độ", sortable: true, width: "110px", align: "center", hideOnMobile: true, render: (v) => <span className="tag-pill">{v}</span> },
                    { key: "tiet", label: "Tiết", sortable: true, width: "80px", align: "center", hideOnMobile: true },
                    { key: "thietBi", label: "Thiết bị", sortable: false, width: "160px", hideOnMobile: true, render: (v) => <span className="cell-clamp">{v}</span> },
                  ]}
                  data={rows}
                  keyField="id"
                  emptyText="Chưa có dữ liệu"
                />
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}