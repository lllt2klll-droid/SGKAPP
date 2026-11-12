import { BookOpen, Edit3, Pencil, Star, Trash2 } from "lucide-react";
import BookCover from "../reader/BookCover.jsx";
import { progressFromPages } from "../reader/readingProgress.js";

export default function BookCard({
  book,
  lastPage,
  numPages = 0,
  fav,
  onToggleFav,
  onOpen,
  onDelete,
  onRename,
  onEditText,
}) {
  const { page, pct } = progressFromPages(lastPage, numPages);
  return (
    <div
      className="libx-book"
      role="button"
      tabIndex={0}
      aria-label={`Mở sách ${book.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="libx-cover">
        <BookCover book={book} lastPage={lastPage} numPages={numPages} />
        <button
          className={`libx-fav ${fav ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          aria-label={fav ? "Bộ yêu thích" : "Thêm yêu thích"}
          title={fav ? "Bộ yêu thích" : "Thêm yêu thích"}
        >
          <Star size={14} fill={fav ? "currentColor" : "none"} />
        </button>
        <span className="libx-grade">Lớp {book.grade} • {book.subject}</span>
      </div>
      <div className="libx-body">
        <h4 className="libx-title" title={book.title}>
          {book.title}
        </h4>
        <div className="libx-meta">
          <span>Tập {book.term}</span>
          <span>—</span>
          <span>
            {book.missing
              ? "⚠ File gốc không còn"
              : book.isLinkedBook
                ? (book.sourceLabel || "Google Drive")
                : book.isExternalBook
                  ? (book.sourceLabel || "Máy tính")
                  : `${(book.size / (1024 * 1024)).toFixed(1)} MB`}
          </span>
        </div>
        {book.isLinkedBook && (
          <a
            className="libx-drive-link"
            href={book.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={book.sourceUrl}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            Mở link sách ↗
          </a>
        )}
        {page > 0 && numPages > 0 ? (
          <>
            <div className="libx-bar" aria-label={`Tiến để ${pct}%`}>
              <i style={{ width: pct + "%" }} />
            </div>
            <span className="libx-meta">Trang {page}/{numPages} • {pct}%</span>
          </>
        ) : (
          <span className="libx-meta">Chưa đọc</span>
        )}
        <div className="libx-foot">
          <button
            className="libx-open"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            aria-label={`Mở sách ${book.title}`}
          >
            <BookOpen size={13} /> {page > 0 ? "Tiếp tục" : "Mở sách"}
          </button>
          <button
            className="libx-icobtn"
            onClick={(e) => {
              e.stopPropagation();
              onRename?.();
            }}
            aria-label={`Sửa thông tin sách ${book.title}`}
            title="Sửa thông tin sách"
          >
            <Pencil size={14} />
          </button>
          {(() => {
            const _ext = String(book.filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
            if ([".txt", ".md"].includes(_ext)) {
              return (
                <button
                  className="libx-icobtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditText?.();
                  }}
                  aria-label={`Sửa nội dung ${book.title}`}
                  title="Sửa nội dung van bản"
                >
                  <Edit3 size={14} />
                </button>
              );
            }
            return null;
          })()}
          <button
            className="libx-icobtn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            aria-label={`Xóa sách ${book.title}`}
            title="Xóa sách"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
