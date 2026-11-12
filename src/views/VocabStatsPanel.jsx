import React from "react";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Sparkles,
  Table2,
  Tags,
} from "lucide-react";

export default function VocabStatsPanel({
  stats,
  coverage,
  tags,
  daySeries,
  dayRange,
  setDayRange,
  geminiKey,
  aiRunning,
  aiQuestionRunning,
  runBatchExplain,
  setMissingOnly,
  setTab,
  setFileFilter,
  setTagFilter,
  doExportCsv,
  doExportWord,
}) {
  return (
    <div className="vocab-stats">
      <div className="vocab-kpis">
        <div className="vocab-kpi">
          <span className="vocab-kpi-ic"><BookMarked size={16} /></span>
          <span className="vocab-kpi-value">{stats.total}</span>
          <span className="vocab-kpi-label">Tổng từ</span>
        </div>
        <div className="vocab-kpi ok">
          <span className="vocab-kpi-ic"><CheckCircle2 size={16} /></span>
          <span className="vocab-kpi-value">{stats.withMeaning}</span>
          <span className="vocab-kpi-label">Đã có nghĩa</span>
        </div>
        <button
          className="vocab-kpi warn clickable"
          onClick={() => {
            setMissingOnly(true);
            setTab("table");
          }}
          title="Lọc các từ chưa có nghĩa"
        >
          <span className="vocab-kpi-ic"><Sparkles size={16} /></span>
          <span className="vocab-kpi-value">{stats.missingMeaning}</span>
          <span className="vocab-kpi-label">Chưa có nghĩa</span>
        </button>
        <div className="vocab-kpi violet">
          <span className="vocab-kpi-ic"><Tags size={16} /></span>
          <span className="vocab-kpi-value">{tags.length}</span>
          <span className="vocab-kpi-label">Thẻ phân loại</span>
        </div>
        <div className="vocab-kpi">
          <span className="vocab-kpi-ic"><BookOpen size={16} /></span>
          <span className="vocab-kpi-value">{stats.byFile.filter((book) => book.file).length}</span>
          <span className="vocab-kpi-label">Sách nguồn</span>
        </div>
      </div>

      <section className="vocab-panel">
        <div className="vocab-panel-head">
          <h4><BookOpenCheck size={15} /> Độ phủ nghĩa</h4>
          <span className="vocab-coverage-pct">{coverage}%</span>
        </div>
        <div className="vocab-coverage" role="progressbar" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${coverage}%` }} />
        </div>
        <p className="vocab-panel-note">
          {stats.missingMeaning
            ? `Còn ${stats.missingMeaning} từ chưa có nghĩa — dùng AI giải nghĩa để hoàn thiện sổ tay (văn phong học thuật, đạt chuẩn sinh viên đại học & cao học).`
            : "Tuyệt vời — mọi từ trong sổ tay đều đã có nghĩa."}
        </p>
        {stats.missingMeaning > 0 && (
          <div className="vocab-panel-actions">
            <button
              className="vocab-ai-btn"
              onClick={runBatchExplain}
              disabled={!geminiKey || aiRunning || aiQuestionRunning}
              title={geminiKey ? "AI giải nghĩa các từ còn thiếu" : "Cần cấu hình Gemini ở Cài đặt AI"}
            >
              <Sparkles size={13} /> AI giải nghĩa {stats.missingMeaning} từ còn thiếu
            </button>
          </div>
        )}
      </section>

      <section className="vocab-panel">
        <h4 className="vocab-panel-title"><BookOpen size={15} /> Theo sách</h4>
        {stats.byFile.length ? (
          <div className="vocab-bars">
            {stats.byFile.map((book) => {
              const max = stats.byFile[0].count || 1;
              return (
                <button
                  key={book.file || "(none)"}
                  className="vocab-bar-row"
                  onClick={() => {
                    setFileFilter(book.file || null);
                    setTab("table");
                  }}
                  title={`Lọc bảng theo "${book.title}"`}
                >
                  <span className="vocab-bar-label">{book.title.slice(0, 34)}</span>
                  <span className="vocab-bar-track">
                    <span className="vocab-bar-fill" style={{ width: `${Math.round((book.count / max) * 100)}%` }} />
                  </span>
                  <span className="vocab-bar-value">{book.count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">Chưa có dữ liệu.</p>
        )}
      </section>

      <section className="vocab-panel">
        <h4 className="vocab-panel-title"><GraduationCap size={15} /> Theo lớp</h4>
        {stats.byGrade.length ? (
          <div className="vocab-bars">
            {stats.byGrade.map((grade) => {
              const max = Math.max(...stats.byGrade.map((item) => item.count)) || 1;
              return (
                <div className="vocab-bar-row" key={grade.grade}>
                  <span className="vocab-bar-label">{grade.grade ? `Lớp ${grade.grade}` : "Không rõ lớp"}</span>
                  <span className="vocab-bar-track">
                    <span className="vocab-bar-fill alt" style={{ width: `${Math.round((grade.count / max) * 100)}%` }} />
                  </span>
                  <span className="vocab-bar-value">{grade.count}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">Chưa có dữ liệu.</p>
        )}
      </section>

      <section className="vocab-panel">
        <div className="vocab-panel-head">
          <h4><BarChart3 size={15} /> Từ mới theo ngày</h4>
          <div className="vocab-range">
            {[7, 30].map((days) => (
              <button
                key={days}
                className={`vocab-filter-chip${dayRange === days ? " on" : ""}`}
                onClick={() => setDayRange(days)}
              >
                {days} ngày
              </button>
            ))}
          </div>
        </div>
        <div className="vocab-days">
          {daySeries.map((day) => {
            const max = Math.max(...daySeries.map((item) => item.count), 1);
            return (
              <div className="vocab-day-col" key={day.date} title={`${day.label}: ${day.count} từ`}>
                <div className="vocab-day-bar" style={{ height: `${Math.max(4, Math.round((day.count / max) * 100))}%` }}>
                  {day.count > 0 && <span>{day.count}</span>}
                </div>
                <span className="vocab-day-label">{day.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {tags.length > 0 && (
        <section className="vocab-panel">
          <h4 className="vocab-panel-title"><Tags size={15} /> Thẻ phổ biến</h4>
          <div className="vocab-tagcloud">
            {tags.map((tag) => (
              <button
                key={tag.tag}
                className="vocab-tag-chip"
                onClick={() => {
                  setTagFilter(tag.tag);
                  setTab("table");
                }}
                title={`Lọc bảng theo thẻ "${tag.tag}"`}
              >
                {tag.tag} <b>{tag.count}</b>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="vocab-stat-actions">
        <button className="btn btn-secondary btn-xs" onClick={() => setTab("table")}>
          <Table2 size={12} /> Xem bảng
        </button>
        <button className="btn btn-secondary btn-xs" onClick={doExportCsv}>
          <FileSpreadsheet size={12} /> Xuất CSV thống kê
        </button>
        <button className="btn btn-secondary btn-xs" onClick={doExportWord}>
          <FileText size={12} /> Xuất Word
        </button>
      </div>
    </div>
  );
}
