import React from "react";
import { Scale } from "lucide-react";

export default function CompareSummary({
  linked,
  pageDiff,
  totalDiff,
  ready,
  bookA,
  bookB,
  displayA,
  displayB,
  totalA,
  totalB,
  citationFor,
}) {
  return (
    <section className="cmp-summary" aria-label="Tóm tắt so sánh">
      <div className="cmp-summary-head">
        <h3><Scale size={15} /> Tóm tắt so sánh</h3>
        <div className="cmp-summary-pills">
          <span className={`cmp-pill ${linked ? "green" : "gray"}`}>{linked ? "Song song" : "Độc lập"}</span>
          {pageDiff != null && (
            <span className={`cmp-pill ${pageDiff === 0 ? "green" : "amber"}`}>
              {pageDiff === 0 ? "Đang cùng trang" : `Lệch ${pageDiff} trang`}
            </span>
          )}
          {totalDiff != null && totalDiff !== 0 && (
            <span className="cmp-pill blue">Chênh {totalDiff} trang tổng</span>
          )}
          <span className="cmp-pill gray">{ready ? "2 / 2 sách" : "1 / 2 sách"}</span>
        </div>
      </div>
      <div className="cmp-summary-table" role="table" aria-label="Bảng tóm tắt so sánh">
        <div className="cmp-summary-row cmp-summary-headrow" role="row">
          <span role="columnheader">Tiêu chí</span>
          <span role="columnheader"><i className="mini-badge a">A</i> Sách A</span>
          <span role="columnheader"><i className="mini-badge b">B</i> Sách B</span>
        </div>
        <div className="cmp-summary-row" role="row">
          <span className="crit" role="cell">Tên sách</span>
          <span role="cell" className="val" title={bookA?.title || ""}>{bookA ? bookA.title : "—"}</span>
          <span role="cell" className="val" title={bookB?.title || ""}>{bookB ? bookB.title : "—"}</span>
        </div>
        <div className="cmp-summary-row" role="row">
          <span className="crit" role="cell">Trang đang xem</span>
          <span role="cell">
            <strong className="page-big a-t">{bookA ? displayA : "—"}</strong>
            {totalA > 0 && <small className="muted"> / {totalA} ({Math.round((displayA / totalA) * 100)}%)</small>}
          </span>
          <span role="cell">
            <strong className="page-big b-t">{bookB ? displayB : "—"}</strong>
            {totalB > 0 && <small className="muted"> / {totalB} ({Math.round((displayB / totalB) * 100)}%)</small>}
          </span>
        </div>
        <div className="cmp-summary-row" role="row">
          <span className="crit" role="cell">Tổng số trang</span>
          <span role="cell">{totalA || "—"}</span>
          <span role="cell">
            {totalB || "—"}
            {totalDiff != null && totalDiff !== 0 && <em className="diff-tag">±{totalDiff}</em>}
          </span>
        </div>
        <div className="cmp-summary-row" role="row">
          <span className="crit" role="cell">Trích dẫn</span>
          <span role="cell" className="cite">{bookA ? citationFor(bookA, displayA) : "—"}</span>
          <span role="cell" className="cite">{bookB ? citationFor(bookB, displayB) : "—"}</span>
        </div>
      </div>
    </section>
  );
}
