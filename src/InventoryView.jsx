// ── Kiểm kê sách tự động: câu hỏi, bài tập, tranh ảnh theo chương ──
import React, { useMemo, useState, useEffect } from "react";
import {
  ListChecks,
  FileText,
  FileSpreadsheet,
  Info,
  BookOpen,
} from "lucide-react";
import { getIndex, getIndexMeta } from "./searchIndex";
import { inventoryPage, indexCoverage } from "./textutils";
import { chapterAt } from "./researchDB";
import { exportWord, exportCsv, escapeHtml } from "./exportDoc";
import DataTable from "./DataTable";
import { safeGetJSON, safeSetJSON } from "./safeStorage";

export default function InventoryView({ books, onOpenBook }) {
  const [file, setFile] = useState("");
  // Phase 8: removed fake storage loop
  const [_openPage, setOpenPage] = useState(null);
  const [minQ, setMinQ] = useState(1);

  const [idx, setIdx] = useState(null);
  const [_indexLoading, setIndexLoading] = useState(false);

  const book = books.find((b) => b.filename === file) || null;
  const meta = book ? getIndexMeta(book.filename) : null;

  useEffect(() => {
    let cancelled = false;

    if (!book) {
      setIdx(null);
      return undefined;
    }

    setIndexLoading(true);

    getIndex(book.filename)
      .then((result) => {
        if (cancelled) return;
        setIdx(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load search index:", err);
        setIdx(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIndexLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [book]);

  const inventory = useMemo(() => {
    if (!book || !idx?.pages?.length) return null;
    const perPage = idx.pages
      .filter((pg) => pg.text)
      .map((pg) => ({
        page: pg.page,
        bp: Math.max(1, pg.page - 1),
        kind: pg.kind,
        raw: pg.text,
        ...inventoryPage(pg.text),
      }));
    const byChapter = {};
    let qTotal = 0,
      tTotal = 0,
      imgPages = 0;
    perPage.forEach((pp) => {
      qTotal += pp.questions.length;
      tTotal += pp.tasks.length;
      if (pp.hasImage) imgPages += 1;
      const ch = chapterAt(book, pp.bp) || "Ngoài mục lục";
      const e = (byChapter[ch] = byChapter[ch] || {
        pages: 0,
        questions: 0,
        tasks: 0,
        img: 0,
      });
      e.pages += 1;
      e.questions += pp.questions.length;
      e.tasks += pp.tasks.length;
      if (pp.hasImage) e.img += 1;
    });
    return {
      perPage,
      byChapter,
      qTotal,
      tTotal,
      imgPages,
      textPages: perPage.length,
    };
  }, [book, idx]);

  const exportReport = () => {
    if (!book || !inventory) return;
    const rows = inventory.perPage.filter((pp) => pp.questions.length >= minQ);
    let html = `
      <h1>Kiểm kê sách</h1><div class="meta">${escapeHtml(book.title)} • Xuất ${new Date().toLocaleString("vi-VN")}</div>
      <table><tr><th>Tiêu chí</th><th>Giá trị</th></tr>
      <tr><td>Trang có chữ (đã đọc được)</td><td>${inventory.textPages}</td></tr>
      <tr><td>Câu hỏi phát hiện (có dấu ?)</td><td>${inventory.qTotal}</td></tr>
      <tr><td>Nhiệm vụ / bài tập phát hiện</td><td>${inventory.tTotal}</td></tr>
      <tr><td>Trang có nhắc đến hình/tranh/bảng</td><td>${inventory.imgPages}</td></tr>
      <tr><td>Phủ chữ của chỉ mục</td><td>${indexCoverage(meta)}%</td></tr></table>
      <h2>Theo chương / chủ đề</h2><table><tr><th>Chương</th><th>Trang</th><th>Câu hỏi</th><th>Bài tập</th><th>Trang có hình</th></tr>
      ${Object.entries(inventory.byChapter)
        .map(
          ([ch, v]) =>
            `<tr><td>${escapeHtml(ch)}</td><td>${v.pages}</td><td>${v.questions}</td><td>${v.tasks}</td><td>${v.img}</td></tr>`,
        )
        .join("")}
      </table>
      <h2>Trang có câu hỏi / bài tập (≥ ${minQ} câu)</h2>`;
    rows.slice(0, 150).forEach((pp) => {
      html += `<h3>Trang ${pp.bp}</h3><ul>`;
      pp.questions.slice(0, 10).forEach((q) => {
        html += `<li>❓ ${escapeHtml(q)}</li>`;
      });
      pp.tasks.slice(0, 8).forEach((t) => {
        html += `<li>✍️ ${escapeHtml(t)}</li>`;
      });
      html += "</ul>";
    });
    exportWord(`Kiểm kê — ${book.title}`, html);
  };

  const exportCsvRows = () => {
    if (!book || !inventory) return;
    const rows = [["Trang", "Chương", "Loại", "Phát hiện"]];
    inventory.perPage.forEach((pp) => {
      pp.questions.forEach((q) =>
        rows.push([String(pp.bp), chapterAt(book, pp.bp), "Câu hỏi", q]),
      );
      pp.tasks.forEach((t) =>
        rows.push([String(pp.bp), chapterAt(book, pp.bp), "Bài tập", t]),
      );
    });
    exportCsv(`Kiểm kê - ${book.title}`, rows);
  };

  if (!book) {
    return (
      <div className="dash-empty">
        <ListChecks size={44} />
        <p>
          Chọn sách đã có chỉ mục toàn văn để kiểm kê câu hỏi / bài tập / hình
          ảnh.
        </p>
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
            setOpenPage(null);
          }}
        >
          <option value="">— Chọn sách —</option>
          {books.map((b) => (
            <option key={b.filename} value={b.filename}>
              {b.title}
            </option>
          ))}
        </select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.82rem",
            fontWeight: 700,
            marginLeft: "0.5rem",
          }}
        >
          Nhiều câu hỏi ≥
          <input
            type="number"
            min={0}
            max={50}
            value={minQ}
            onChange={(e) =>
              setMinQ(Math.max(0, parseInt(e.target.value) || 0))
            }
            className="form-control w-64"
          />
        </label>
        <div className="flex-row-ml-auto">
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportCsvRows}
            disabled={!inventory}
            title={!inventory ? "Chọn sách có chỉ mục rồi thử lại" : "Xuất CSV"}
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportReport}
            disabled={!inventory}
            title={
              !inventory ? "Chọn sách có chỉ mục rồi thử lại" : "Xuất báo cáo"
            }
          >
            <FileText size={13} /> Xuất Word
          </button>
        </div>
      </div>

      {!meta || !idx ? (
        <div className="panel-box border-accent">
          <p className="font-bold-flex">
            <Info size={16} color="var(--accent)" /> Sách chưa có chỉ mục toàn
            văn.
          </p>
          <p className="panel-hint">
            Vào tab <strong>Tìm toàn văn</strong> → “Dựng chỉ mục” cho sách này
            trước. Trang ảnh chưa OCR sẽ không kiểm kê được.
          </p>
        </div>
      ) : !inventory ? (
        <div className="dash-empty">
          <ListChecks size={40} />
          <p>Không có chữ để kiểm kê.</p>
        </div>
      ) : (
        <>
          <div
            className="stat-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            }}
          >
            <div className="stat-card">
              <div className="stat-label">Trang có chữ</div>
              <div className="stat-value">{inventory.textPages}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Câu hỏi (?)</div>
              <div className="stat-value text-primary">{inventory.qTotal}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Bài tập phát hiện</div>
              <div className="stat-value text-secondary">
                {inventory.tTotal}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Trang có tranh/bảng</div>
              <div className="stat-value">{inventory.imgPages}</div>
            </div>
          </div>
          <p className="panel-hint">
            <Info size={13} className="align-neg-2" /> Phát hiện bằng quy tắc
            máy (câu có dấu ?, mẫu "1.", "a)", từ khoá "Em hãy…", "Luyện tập"…)
            — cần rà soát lại khi dùng chính thức.
          </p>

          {/* Overview table: Tiêu chí | Giá trị — spec §17 */}
          <div className="stat-section">
            <h3 className="m-0">Tổng quan</h3>
            <DataTable
              columns={[
                {
                  key: "tieuChi",
                  label: "Tiêu chí",
                  sortable: true,
                  render: (v) => <span className="cell-clamp">{v}</span>,
                },
                {
                  key: "giaTri",
                  label: "Giá trị",
                  sortable: true,
                  width: "160px",
                  align: "right",
                  render: (v) => <span className="tag-pill">{String(v)}</span>,
                },
              ]}
              data={[
                {
                  id: "textPages",
                  tieuChi: "Trang có chữ (đã đọc được)",
                  giaTri: inventory.textPages,
                },
                {
                  id: "q",
                  tieuChi: "Câu hỏi phát hiện (có dấu ?)",
                  giaTri: inventory.qTotal,
                },
                {
                  id: "t",
                  tieuChi: "Nhiệm vụ / bài tập phát hiện",
                  giaTri: inventory.tTotal,
                },
                {
                  id: "img",
                  tieuChi: "Trang có nhắc đến hình/tranh/bảng",
                  giaTri: inventory.imgPages,
                },
                {
                  id: "cov",
                  tieuChi: "Phủ chữ của chỉ mục",
                  giaTri: `${indexCoverage(meta)}%`,
                },
              ]}
              keyField="id"
              emptyText="Chưa có dữ liệu tổng quan"
            />
          </div>

          {/* Chapter table: Chương | Trang | Câu hỏi | Bài tập | Trang có hình */}
          <div className="stat-section">
            <h3 className="m-0">Theo chương / chủ đề</h3>
            <DataTable
              columns={[
                {
                  key: "chuong",
                  label: "Chương",
                  sortable: true,
                  render: (v) => <span className="cell-clamp">{v}</span>,
                },
                {
                  key: "trang",
                  label: "Trang",
                  sortable: true,
                  width: "80px",
                  align: "right",
                },
                {
                  key: "cauHoi",
                  label: "Câu hỏi",
                  sortable: true,
                  width: "90px",
                  align: "right",
                },
                {
                  key: "baiTap",
                  label: "Bài tập",
                  sortable: true,
                  width: "90px",
                  align: "right",
                },
                {
                  key: "hinh",
                  label: "Trang có hình",
                  sortable: true,
                  width: "120px",
                  align: "right",
                  hideOnMobile: true,
                },
              ]}
              data={Object.entries(inventory.byChapter).map(([ch, v]) => ({
                id: ch,
                chuong: ch,
                trang: v.pages,
                cauHoi: v.questions,
                baiTap: v.tasks,
                hinh: v.img,
              }))}
              keyField="id"
              emptyText="Chưa có dữ liệu theo chương"
              emptyHint="Chỉ mục chưa nhận diện được phân bố chương."
            />
          </div>

          <div className="stat-section">
            <h3 className="m-0">
              Trang có câu hỏi / bài tập (≥ {minQ} câu hỏi)
            </h3>
            {(() => {
              const filtered = inventory.perPage.filter(
                (pp) => pp.questions.length >= minQ,
              );
              // Flatten to detected questions table: Trang | Loại | Nội dung | Thao tác
              const rows = [];
              filtered.forEach((pp) => {
                pp.questions.forEach((q, qi) =>
                  rows.push({
                    id: `${pp.page}_q_${qi}`,
                    trang: pp.bp,
                    loai: "Câu hỏi",
                    noiDung: q,
                    _page: pp.page,
                  }),
                );
                pp.tasks.forEach((t, ti) =>
                  rows.push({
                    id: `${pp.page}_t_${ti}`,
                    trang: pp.bp,
                    loai: "Bài tập",
                    noiDung: t,
                    _page: pp.page,
                  }),
                );
              });
              if (!filtered.length)
                return (
                  <p className="panel-hint">
                    Không có trang nào đạt số câu hỏi tối thiểu này.
                  </p>
                );
              return (
                <DataTable
                  columns={[
                    {
                      key: "trang",
                      label: "Trang",
                      sortable: true,
                      width: "80px",
                      align: "right",
                    },
                    {
                      key: "loai",
                      label: "Loại",
                      sortable: true,
                      width: "110px",
                      render: (v) => (
                        <span
                          className="tag-pill"
                          style={{
                            background:
                              v === "Câu hỏi"
                                ? "var(--primary-light)"
                                : "var(--surface-soft)",
                            color:
                              v === "Câu hỏi"
                                ? "var(--primary)"
                                : "var(--text-muted)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          {v}
                        </span>
                      ),
                    },
                    {
                      key: "noiDung",
                      label: "Nội dung",
                      sortable: false,
                      render: (v) => <span className="cell-clamp">{v}</span>,
                    },
                    {
                      key: "thaoTac",
                      label: "Thao tác",
                      width: "110px",
                      align: "center",
                      render: (_, row) => (
                        <button
                          className="btn btn-secondary btn-xs"
                          aria-label={`Mở trang ${row.trang}`}
                          onClick={() => onOpenBook(book, row._page)}
                        >
                          <BookOpen size={12} /> Mở trang
                        </button>
                      ),
                    },
                  ]}
                  data={rows}
                  keyField="id"
                  emptyText="Không có phát hiện nào"
                  emptyHint={`Không có trang nào đạt ≥ ${minQ} câu hỏi.`}
                />
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
