import React from "react";
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Check,
  Columns2,
  Copy,
  Equal,
  FileText,
  Link2,
  Printer,
  Rows2,
  Unlink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import SampleButton from "./SampleButton.jsx";

export default function CompareToolbar({
  ready,
  shortA,
  shortB,
  linked,
  toggleLinked,
  bookA,
  bookB,
  swapSides,
  docA,
  docB,
  syncPages,
  stacked,
  setStacked,
  zoom,
  setZoom,
  zoomBy,
  runSample,
  canRunSample,
  copyReport,
  copied,
  copyFailed,
  exportReport,
  doPrint,
}) {
  return (
    <div className="cmp-toolbar-v2">
      <div className="cmp-title-block">
        <span className="cmp-title-icon"><ArrowLeftRight size={16} /></span>
        <div className="cmp-title-text">
          <strong>So sánh sách</strong>
          <small>{ready ? `${shortA}  ⇄  ${shortB}` : "Chọn 2 sách để bắt đầu đối chiếu"}</small>
        </div>
        <span className={`cmp-ready-pill ${ready ? "on" : ""}`}>{ready ? "Đã sẵn sàng" : "Chưa đủ 2 sách"}</span>
      </div>
      <div className="cmp-controls">
        <div className="cmp-seg" role="tablist" aria-label="Chế độ chuyển trang">
          <button
            role="tab"
            aria-selected={linked}
            className={`cmp-seg-btn ${linked ? "active" : ""}`}
            onClick={() => { if (!linked) toggleLinked(); }}
            title="Bật: hai bên luôn cùng số trang (Ctrl+L)"
          >
            <Link2 size={13} /> Song song
          </button>
          <button
            role="tab"
            aria-selected={!linked}
            className={`cmp-seg-btn ${!linked ? "active" : ""}`}
            onClick={() => { if (linked) toggleLinked(); }}
            title="Tắt: lật trang độc lập từng bên (Ctrl+L)"
          >
            <Unlink size={13} /> Độc lập
          </button>
        </div>
        <div className="cmp-group">
          <button
            className="cmp-btn"
            onClick={swapSides}
            disabled={!bookA && !bookB}
            title={!bookA && !bookB ? "Chọn 2 sách rồi thử lại" : "Đổi vị trí hai bên (Ctrl+S)"}
          >
            <ArrowRightLeft size={13} /> <span>Đổi bên</span>
          </button>
          <button
            className="cmp-btn"
            onClick={syncPages}
            disabled={!docA || !docB}
            title={!docA || !docB ? "Mở 2 sách rồi thử lại" : "Cho bên phải về cùng số trang với bên trái"}
          >
            <Equal size={13} /> <span>Về cùng trang</span>
          </button>
          <button
            className="cmp-btn"
            onClick={() => setStacked((current) => !current)}
            title={stacked ? "Chuyển sang xem 2 sách cạnh nhau (trái–phải)" : "Chuyển sang xem chồng lên nhau (trên–dưới), dễ dùng trên điện thoại"}
          >
            {stacked ? <Columns2 size={13} /> : <Rows2 size={13} />}{" "}
            <span>{stacked ? "Xem ngang" : "Xem dọc"}</span>
          </button>
        </div>
        <span className="cmp-vdiv" aria-hidden="true" />
        <div className="cmp-group cmp-zoom-group">
          <button className="cmp-icon-btn" onClick={() => zoomBy(-0.1)} disabled={zoom <= 0.5} title="Thu nhỏ (↓)" aria-label="Thu nhỏ">
            <ZoomOut size={15} />
          </button>
          <button className="cmp-zoom-pill" onClick={() => setZoom(1)} disabled={zoom === 1} title="Bấm để về cỡ vừa khung (100%)">
            {Math.round(zoom * 100)}%
          </button>
          <button className="cmp-icon-btn" onClick={() => zoomBy(0.1)} disabled={zoom >= 2} title="Phóng to (↑)" aria-label="Phóng to">
            <ZoomIn size={15} />
          </button>
        </div>
        <span className="cmp-vdiv" aria-hidden="true" />
        <div className="cmp-group">
          <SampleButton onRun={runSample} disabled={!canRunSample} />
          <button
            className="cmp-btn"
            onClick={copyReport}
            disabled={!ready}
            title={!ready ? "Chọn 2 sách rồi thử lại" : copyFailed ? "Không chép được — trình duyệt chặn khay nhớ tạm" : "Sao chép biên bản so sánh vào khay nhớ tạm"}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
            <span>{copied ? "Đã chép" : copyFailed ? "Chép thất bại" : "Biên bản"}</span>
          </button>
          <button className="cmp-btn" onClick={exportReport} disabled={!ready} title={!ready ? "Chọn 2 sách rồi thử lại" : "Tải biên bản so sánh (kèm ghi chú) về file Word"}>
            <FileText size={13} /> <span>Tải Word</span>
          </button>
          <button className="cmp-btn cmp-btn-primary" onClick={doPrint} disabled={!ready} title={!ready ? "Chọn 2 sách rồi thử lại" : "Mở bản in để in ra giấy hoặc lưu thành PDF"}>
            <Printer size={13} /> <span>In / PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
