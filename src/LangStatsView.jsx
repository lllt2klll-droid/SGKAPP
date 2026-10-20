// ── Thống kê ngôn ngữ sách: tần suất từ vựng, độ khó văn bản, theo chương ──
import React, { useMemo, useState, useEffect } from "react";
import { BarChart3, FileText, FileSpreadsheet, Info } from "lucide-react";
import { getIndex, getIndexMeta } from "./searchIndex";
import { analyzeText, indexCoverage } from "./textutils";
import { chapterAt } from "./researchDB";
import { exportWord, exportCsv, escapeHtml } from "./exportDoc";
import DataTable from "./DataTable";

const DIFF_LABELS = {
  1: "Rất dễ",
  2: "Dễ",
  3: "Trung bình",
  4: "Khó",
  5: "Rất khó (cần rà soát)",
};

export default function LangStatsView({ books }) {
  const [file, setFile] = useState("");
  // Phase 8: removed fake storage loop
  const [minFreq, setMinFreq] = useState(3);
  const [withStop, setWithStop] = useState(false);
  const [tab, setTab] = useState("overview");

  const [idx, setIdx] = useState(null);
  const [indexLoading, setIndexLoading] = useState(false);

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
        console.error("Failed to load index:", err);
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

  const stats = useMemo(() => {
    if (!book || !idx || !idx.pages?.length) return null;
    const perPage = idx.pages.map((pg) => ({
      page: pg.page,
      kind: pg.kind,
      ...analyzeText(pg.text),
    }));
    const tot = {
      words: 0,
      sentences: 0,
      unique: new Set(),
      top: {},
      byChapter: {},
    };
    perPage.forEach((pp) => {
      if (!pp.words) return;
      tot.words += pp.words;
      tot.sentences += pp.sentences;
      pp.top.forEach(([w, c]) => {
        tot.top[w] = (tot.top[w] || 0) + c;
      });
      // per-chapter words
      const ch = chapterAt(book, Math.max(1, pp.page - 1)) || "Ngoài mục lục";
      const entry = (tot.byChapter[ch] = tot.byChapter[ch] || {
        words: 0,
        pages: 0,
      });
      entry.words += pp.words;
      entry.pages += 1;
    });
    // unique across full text (reanalyze once is enough for a single book)
    idx.pages.forEach((pg) => {
      if (!pg.text) return;
      const toks = pg.text
        .toLowerCase()
        .replace(/đ/g, "d")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      toks.forEach((t) => tot.unique.add(t));
    });
    const topList = Object.entries(tot.top)
      .filter(([w]) => withStop || w.length >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120);
    const wps = tot.sentences ? tot.words / tot.sentences : 0;
    const spw = tot.words
      ? perPage.reduce((a, pp) => a + pp.spw * pp.words, 0) / tot.words
      : 0;
    let difficulty = 1;
    const score = wps * 0.5 + spw * 4;
    if (score >= 30) difficulty = 5;
    else if (score >= 22) difficulty = 4;
    else if (score >= 15) difficulty = 3;
    else if (score >= 9) difficulty = 2;
    const chapters = Object.entries(tot.byChapter).sort(
      (a, b) => b[1].words - a[1].words,
    );
    return {
      perPage,
      total: {
        words: tot.words,
        sentences: tot.sentences,
        unique: tot.unique.size,
      },
      wps,
      spw,
      difficulty,
      topList,
      chapters,
    };
  }, [book, idx, withStop]);

  const exportReport = () => {
    if (!book || !stats) return;
    const html = `
      <h1>Báo cáo thống kê ngôn ngữ</h1>
      <div class="meta">${escapeHtml(book.title)} • Xuất ${new Date().toLocaleString("vi-VN")}</div>
      <table>
        <tr><th>Tiêu chí</th><th>Giá trị</th></tr>
        <tr><td>Tổng số từ (không kể trang ảnh)</td><td>${stats.total.words}</td></tr>
        <tr><td>Số từ khác nhau</td><td>${stats.total.unique}</td></tr>
        <tr><td>Số câu</td><td>${stats.total.sentences}</td></tr>
        <tr><td>Từ trung bình / câu</td><td>${stats.wps.toFixed(1)}</td></tr>
        <tr><td>Âm tiết trung bình / từ</td><td>${stats.spw.toFixed(2)}</td></tr>
        <tr><td>Ước tính độ khó (1–5)</td><td>${stats.difficulty} — ${DIFF_LABELS[stats.difficulty]}</td></tr>
      </table>
      <h2>Từ vựng tiêu biểu (tần suất ≥ ${minFreq})</h2><table><tr><th>#</th><th>Từ (không dấu)</th><th>Số lần</th></tr>
      ${stats.topList
        .filter(([, c]) => c >= minFreq)
        .slice(0, 80)
        .map(
          ([w, c], i) =>
            `<tr><td>${i + 1}</td><td>${escapeHtml(w)}</td><td>${c}</td></tr>`,
        )
        .join("")}
      </table>
      <h2>Theo chương / chủ đề</h2><table><tr><th>Chương</th><th>Số trang có chữ</th><th>Số từ</th></tr>
      ${stats.chapters.map(([ch, v]) => `<tr><td>${escapeHtml(ch)}</td><td>${v.pages}</td><td>${v.words}</td></tr>`).join("")}
      </table>`;
    exportWord(`Thống kê ngôn ngữ — ${book.title}`, html);
  };

  const exportCsvWords = () => {
    if (!book || !stats) return;
    const rows = [["Từ", "Số lần"]];
    stats.topList
      .filter(([, c]) => c >= minFreq)
      .slice(0, 200)
      .forEach(([w, c]) => rows.push([w, String(c)]));
    exportCsv(`Từ vựng - ${book.title}`, rows);
  };

  if (!book) {
    return (
      <div className="dash-empty">
        <BarChart3 size={44} />
        <p>
          Chọn một cuốn sách có chỉ mục toàn văn (xem tab “Tìm toàn văn”) để
          phân tích ngôn ngữ.
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
          onChange={(e) => setFile(e.target.value)}
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
            className={`seg-tab${tab === "overview" ? " active" : ""}`}
            onClick={() => setTab("overview")}
          >
            Tổng quan
          </button>
          <button
            className={`seg-tab${tab === "words" ? " active" : ""}`}
            onClick={() => setTab("words")}
          >
            Tần suất từ
          </button>
          <button
            className={`seg-tab${tab === "chapters" ? " active" : ""}`}
            onClick={() => setTab("chapters")}
          >
            Theo chương
          </button>
        </div>
        <div className="flex-row-ml-auto">
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportCsvWords}
            disabled={!stats}
            title={
              !stats ? "Chọn sách có chỉ mục rồi thử lại" : "Xuất CSV từ vựng"
            }
          >
            <FileSpreadsheet size={13} /> CSV từ
          </button>
          <button
            className="btn btn-secondary btn-xs"
            onClick={exportReport}
            disabled={!stats}
            title={!stats ? "Chọn sách có chỉ mục rồi thử lại" : "Xuất báo cáo"}
          >
            <FileText size={13} /> Xuất báo cáo
          </button>
        </div>
      </div>

      {indexLoading ? (
        <div className="panel-box border-accent">
          <p className="font-bold-flex">
            <span className="spinner spinner-sm" /> Đang nạp chỉ mục toàn văn…
          </p>
        </div>
      ) : !meta || !idx ? (
        <div className="panel-box border-accent">
          <p className="font-bold-flex">
            <Info size={16} color="var(--accent)" /> Sách này chưa có chỉ mục
            toàn văn.
          </p>
          <p className="panel-hint">
            Vào tab <strong>Tìm toàn văn</strong> → bấm “Dựng chỉ mục” cho cuốn
            sách rồi quay lại đây.
          </p>
        </div>
      ) : !stats ? (
        <div className="dash-empty">
          <BarChart3 size={40} />
          <p>
            Không đọc được chữ từ sách này (các trang đều dạng ảnh). Hãy OCR
            trong sách rồi dựng lại chỉ mục.
          </p>
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
              <div className="stat-label">Tổng số từ</div>
              <div className="stat-value">
                {stats.total.words.toLocaleString("vi-VN")}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Từ khác nhau</div>
              <div className="stat-value">
                {stats.total.unique.toLocaleString("vi-VN")}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Từ / câu (TB)</div>
              <div className="stat-value">{stats.wps.toFixed(1)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Âm tiết / từ (TB)</div>
              <div className="stat-value">{stats.spw.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Độ khó ước tính</div>
              <div
                className="stat-value"
                style={{
                  color:
                    stats.difficulty >= 4
                      ? "var(--secondary)"
                      : "var(--success)",
                  fontSize: "1.1rem",
                }}
              >
                {stats.difficulty}/5
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Chữ phủ trong sách</div>
              <div className="stat-value">{indexCoverage(meta)}%</div>
            </div>
          </div>
          <div className="panel-box border-muted">
            <p className="panel-hint">
              <Info size={13} className="align-neg-2" /> Độ khó chỉ là ước lượng
              thô (dựa số từ/câu và âm tiết/từ), dùng để so sánh tương đối giữa
              các bài/sách — <strong>{DIFF_LABELS[stats.difficulty]}</strong>.
            </p>
          </div>

          {tab === "overview" && (
            <>
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
                      render: (v) => (
                        <span className="tag-pill">{String(v)}</span>
                      ),
                    },
                  ]}
                  data={[
                    {
                      id: "words",
                      tieuChi: "Tổng số từ (không kể trang ảnh)",
                      giaTri: stats.total.words.toLocaleString("vi-VN"),
                    },
                    {
                      id: "unique",
                      tieuChi: "Số từ khác nhau",
                      giaTri: stats.total.unique.toLocaleString("vi-VN"),
                    },
                    {
                      id: "sent",
                      tieuChi: "Số câu",
                      giaTri: stats.total.sentences.toLocaleString("vi-VN"),
                    },
                    {
                      id: "wps",
                      tieuChi: "Từ trung bình / câu",
                      giaTri: stats.wps.toFixed(1),
                    },
                    {
                      id: "spw",
                      tieuChi: "Âm tiết trung bình / từ",
                      giaTri: stats.spw.toFixed(2),
                    },
                    {
                      id: "diff",
                      tieuChi: "Ước tính độ khó (1–5)",
                      giaTri: `${stats.difficulty} — ${DIFF_LABELS[stats.difficulty]}`,
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
              <div className="stat-section">
                <h3 className="m-0">Phân bố theo chương (số từ)</h3>
                {stats.chapters.length === 0 ? (
                  <div className="panel-box border-muted-mt-0-6">
                    <p className="m-0-text-0-85">
                      Sách chưa có trang nào nhận dạng được chữ để phân bố theo
                      chương.
                    </p>
                  </div>
                ) : (
                  <div className="bar-col">
                    {stats.chapters.slice(0, 15).map(([ch, v]) => {
                      const max = Math.max(
                        1,
                        ...stats.chapters
                          .slice(0, 15)
                          .map(([, x]) => x.words || 1),
                      );
                      return (
                        <div key={ch} className="bar-row">
                          <span className="bar-label">{ch}</span>
                          <div className="stats-book-bar">
                            <div
                              style={{
                                width: `${Math.round((v.words / max) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="bar-num">
                            {v.words.toLocaleString("vi-VN")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "words" && (
            <div className="stat-section">
              <div className="toolbar-row mb-0-8">
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                  }}
                >
                  Tần suất tối thiểu:
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={minFreq}
                    onChange={(e) =>
                      setMinFreq(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="form-control w-76"
                  />
                </label>
                <label className="label-flex">
                  <input
                    type="checkbox"
                    checked={withStop}
                    onChange={(e) => setWithStop(e.target.checked)}
                  />{" "}
                  Gồm cả từ nối
                </label>
              </div>
              {(() => {
                const filtered = stats.topList
                  .filter(([, c]) => c >= minFreq)
                  .slice(0, 100);
                const totalWords = stats.total.words || 1;
                const rows = filtered.map(([w, c], i) => ({
                  id: w,
                  stt: i + 1,
                  tu: w,
                  soLan: c,
                  tyLe: ((c / totalWords) * 100).toFixed(2) + "%",
                  _tyLeNum: (c / totalWords) * 100,
                }));
                return (
                  <DataTable
                    columns={[
                      {
                        key: "stt",
                        label: "#",
                        sortable: true,
                        width: "60px",
                        align: "right",
                      },
                      {
                        key: "tu",
                        label: "Từ",
                        sortable: true,
                        render: (v) => <span className="cell-clamp">{v}</span>,
                      },
                      {
                        key: "soLan",
                        label: "Số lần",
                        sortable: true,
                        width: "110px",
                        align: "right",
                      },
                      {
                        key: "tyLe",
                        label: "Tỷ lệ",
                        sortable: true,
                        width: "110px",
                        align: "right",
                        render: (v) => <span className="tag-pill">{v}</span>,
                      },
                    ]}
                    data={rows}
                    keyField="id"
                    emptyText={`Không có từ nào đạt tần suất ≥ ${minFreq}.`}
                    emptyHint="Thử giảm tần suất tối thiểu hoặc bật 'Gồm cả từ nối'."
                  />
                );
              })()}
            </div>
          )}

          {tab === "chapters" && (
            <div className="stat-section">
              {(() => {
                const rows = stats.chapters.map(([ch, v], i) => ({
                  id: ch,
                  stt: i + 1,
                  chuong: ch,
                  trangCoChu: v.pages,
                  soTu: v.words,
                  tuTrang: Math.round(v.words / Math.max(1, v.pages)),
                }));
                return (
                  <DataTable
                    columns={[
                      {
                        key: "stt",
                        label: "#",
                        sortable: true,
                        width: "60px",
                        align: "right",
                      },
                      {
                        key: "chuong",
                        label: "Chương / Chủ đề",
                        sortable: true,
                        render: (v) => <span className="cell-clamp">{v}</span>,
                      },
                      {
                        key: "trangCoChu",
                        label: "Trang có chữ",
                        sortable: true,
                        width: "120px",
                        align: "right",
                      },
                      {
                        key: "soTu",
                        label: "Số từ",
                        sortable: true,
                        width: "120px",
                        align: "right",
                        render: (v) => v.toLocaleString("vi-VN"),
                      },
                      {
                        key: "tuTrang",
                        label: "Từ / trang",
                        sortable: true,
                        width: "110px",
                        align: "right",
                        hideOnMobile: true,
                      },
                    ]}
                    data={rows}
                    keyField="id"
                    emptyText="Chưa có dữ liệu theo chương"
                  />
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
