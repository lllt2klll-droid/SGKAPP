import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Sparkles,
} from "lucide-react";

// Thanh điều khiển đọc sách cho điện thoại — tầm với ngón cái.
// Desktop/tablet: luôn ẩn qua CSS (.reader-mobile-bar { display:none }).
export default function ReaderMobileBar({
  tocOpen,
  aiOpen,
  toolsOpen,
  isWordFile,
  wordInfo,
  pageDisplay,
  canPrev,
  canNext,
  onToc,
  onAi,
  onTools,
  onPrev,
  onNext,
  onPageTap,
}) {
  return (
    <nav className="reader-mobile-bar" aria-label="Điều khiển đọc sách">
      <button
        type="button"
        className={`rmb-item${tocOpen ? " active" : ""}`}
        onClick={onToc}
        aria-label={tocOpen ? "Đóng mục lục" : "Mở mục lục"}
        aria-pressed={!!tocOpen}
      >
        <BookOpen size={21} />
        <span className="rmb-label">Mục lục</span>
      </button>

      <div className="rmb-stepper" role="group" aria-label="Chuyển trang">
        {isWordFile ? (
          <span className="rmb-page-static">{wordInfo}</span>
        ) : (
          <>
            <button
              type="button"
              className="rmb-step"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Trang trước"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="rmb-page"
              onClick={onPageTap}
              title="Chạm để nhập số trang"
              aria-label={`Trang hiện tại ${pageDisplay}. Chạm để nhập số trang.`}
            >
              {pageDisplay}
            </button>
            <button
              type="button"
              className="rmb-step"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Trang sau"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        className={`rmb-item${aiOpen ? " active" : ""}`}
        onClick={onAi}
        aria-label={aiOpen ? "Đóng bảng AI" : "Mở bảng AI"}
        aria-pressed={!!aiOpen}
      >
        <Sparkles size={21} />
        <span className="rmb-label">AI</span>
      </button>

      <button
        type="button"
        className={`rmb-item${toolsOpen ? " active" : ""}`}
        onClick={onTools}
        aria-label={toolsOpen ? "Đóng công cụ" : "Mở công cụ nâng cao"}
        aria-pressed={!!toolsOpen}
      >
        <MoreVertical size={21} />
        <span className="rmb-label">Công cụ</span>
      </button>
    </nav>
  );
}
