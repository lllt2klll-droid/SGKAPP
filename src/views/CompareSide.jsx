import React, { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LibraryBig,
  X,
} from "lucide-react";
import { clampPage } from "../reader/pageNavigation.js";

function PageInput({ page, disabled, onJump }) {
  const [draft, setDraft] = useState(String(page));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(String(page)); }, [page, focused]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onJump(n);
    else setDraft(String(page));
  };
  return (
    <input
      className="cmp-page-input"
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      aria-label="Gõ số trang rồi Enter để nhảy tới trang đó"
      title="Gõ số trang rồi Enter để nhảy tới trang đó"
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setDraft(String(page)); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
        else if (e.key === "Escape") { setDraft(String(page)); e.currentTarget.blur(); }
      }}
    />
  );
}

export default function CompareSide({
  label,
  sideName,
  book,
  bookGroups,
  hasBooks,
  onPickBook,
  onClearBook,
  doc,
  page,
  onPrev,
  onNext,
  onFirst,
  onLast,
  onJump,
  linked,
  numPages,
  canvasRef,
  error,
  empty,
  wrapRef,
  loading,
}) {
  const displayPage = doc ? clampPage(page, numPages) : page;
  const pct = doc && numPages > 0 ? Math.round((displayPage / numPages) * 100) : 0;
  const isA = label === "A";
  return (
    <div className={`cmp-side cmp-side-v2 ${isA ? "cmp-side-a" : "cmp-side-b"}`}>
      <div className="cmp-head-v2">
        <div className="cmp-bookline">
          <span
            className={`cmp-badge ${isA ? "cmp-badge-a" : "cmp-badge-b"}`}
            title={isA ? "Sách bên trái (A)" : "Sách bên phải (B)"}
          >
            {label}
          </span>
          <div className="cmp-bookmeta">
            <select
              className="cmp-book-select-v2"
              value={book ? book.filename : ""}
              onChange={(e) => onPickBook(e.target.value)}
              aria-label={`Chọn sách cho bên ${sideName}`}
              title={book ? book.title : `Chọn sách cho bên ${sideName}`}
            >
              <option value="">— Chọn sách bên {sideName} —</option>
              {bookGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((b) => (
                    <option key={b.filename} value={b.filename}>
                      {b.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="cmp-book-sub">
              {doc ? (
                <>{numPages} trang • {pct}% đã xem</>
              ) : book ? (
                <>Đang mở sách…</>
              ) : (
                <>Chưa chọn sách</>
              )}
            </span>
          </div>
          {book ? (
            <button
              className="cmp-clear-btn"
              onClick={onClearBook}
              title={`Bỏ chọn sách bên ${sideName}`}
              aria-label={`Bỏ chọn sách bên ${sideName}`}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="cmp-navline">
          <div className="cmp-nav-v2" role="group" aria-label={`Điều hướng trang bên ${sideName}`}>
            <button
              className="cmp-nav-btn"
              onClick={onFirst}
              disabled={!doc || displayPage <= 1}
              title="Về trang đầu"
              aria-label="Về trang đầu"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              className="cmp-nav-btn"
              onClick={onPrev}
              disabled={!doc || displayPage <= 1}
              title={linked ? "Trang trước (← khi bật Song song)" : "Trang trước"}
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="cmp-pagenum-v2" title={doc ? `Đang xem trang ${displayPage} / ${numPages}` : "Chưa chọn sách"}>
              <span className="cmp-tr">tr.</span>
              <PageInput page={displayPage} disabled={!doc} onJump={onJump} />
              <span className="cmp-total">/ {doc ? numPages : "—"}</span>
            </span>
            <button
              className="cmp-nav-btn"
              onClick={onNext}
              disabled={!doc || displayPage >= numPages}
              title={linked ? "Trang sau (→ khi bật Song song)" : "Trang sau"}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="cmp-nav-btn"
              onClick={onLast}
              disabled={!doc || displayPage >= numPages}
              title="Tới trang cuối"
              aria-label="Tới trang cuối"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
          <div className="cmp-progress" aria-hidden="true">
            <div className={`cmp-progress-fill ${isA ? "fill-a" : "fill-b"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {error && <div className="cmp-error-v2">{error}</div>}
      <div className="cmp-canvas-wrap cmp-canvas-relative cmp-canvas-v2" ref={wrapRef}>
        {empty ? (
          <div className="cmp-empty-v2">
            {!hasBooks ? (
              <>
                <span className="cmp-empty-icon"><LibraryBig size={28} /></span>
                <p className="cmp-empty-title">Thư viện chưa có sách nào</p>
                <p className="cmp-empty-desc">Hãy thêm sách PDF ở trang Thư viện trước, rồi quay lại so sánh.</p>
              </>
            ) : (
              <>
                <span className="cmp-empty-icon"><BookOpen size={28} /></span>
                <p className="cmp-empty-title">Bên {label} đang trống</p>
                <ol className="cmp-empty-steps">
                  <li><b>1.</b> Chọn <b>sách bên {sideName}</b> ở menu phía trên</li>
                  <li><b>2.</b> Lật trang để đối chiếu nội dung</li>
                  <li><b>3.</b> Ghi nhận xét rồi xuất biên bản</li>
                </ol>
              </>
            )}
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} style={loading ? { opacity: 0.35, pointerEvents: "none" } : undefined} />
            {loading && (
              <div className="cmp-loading cmp-loading-overlay" aria-live="polite">
                <div className="spinner spinner-sm" />
                <p>Đang tải trang {displayPage}…</p>
              </div>
            )}
            {doc && !loading && (
              <span className="cmp-page-float">tr. {displayPage} / {numPages}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
