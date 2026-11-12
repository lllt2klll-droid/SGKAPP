import React from "react";
import { AlertTriangle, CheckCircle2, Copy, FileText, Link2, Loader2, Trash2, X } from "lucide-react";
import { useFocusTrap } from "../ui/useFocusTrap.js";
import { countBatchStatuses } from "../views/batchUpload.js";

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function statusLabel(status, mode) {
  switch (status) {
    case "done":
      return mode === "link" ? "Đã liên kết" : "Đã thêm";
    case "error":
      return "Lỗi";
    case "invalid":
      return "Bỏ qua";
    case "uploading":
      return "Đang lưu";
    default:
      return "Chờ";
  }
}

/**
 * Hộp thoại thêm nhiều sách cùng lúc.
 * Chỉ hiển thị trạng thái; mọi thao tác nằm ở App.jsx để dùng chung logic
 * upload/link với luồng thêm một sách.
 */
export default function BatchUploadDialog({
  open,
  items = [],
  mode = "copy",
  phase = "idle",
  progress = { current: 0, total: 0, percent: 0 },
  summary = "",
  canLink = false,
  onClose,
  onStart,
  onAbort,
  onRetry,
  onRemove,
  onTitleChange,
  onModeChange,
}) {
  const busy = phase === "uploading";
  const trapRef = useFocusTrap(open, () => { if (!busy) onClose?.(); });

  if (!open) return null;

  const counts = countBatchStatuses(items);
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0)));
  const pendingCount = counts.pending;
  const titleVerb = mode === "link" ? "Liên kết" : "Thêm";

  return (
    <div
      className="modal-overlay batch-upload-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-upload-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
    >
      <div ref={trapRef} className="modal-content batch-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header batch-upload-header">
          <div className="batch-upload-heading">
            <h2 id="batch-upload-title">Thêm nhiều sách</h2>
            <p>
              Đã chọn <strong>{items.length}</strong> file • mỗi file thành một sách.
              {canLink ? " PDF trên máy có thể chọn liên kết để không sao chép." : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => { if (!busy) onClose?.(); }}
            aria-label="Đóng"
            disabled={busy}
          >
            <X size={16} />
          </button>
        </div>

        <div className="batch-upload-body">
          {canLink && (
            <div className="batch-mode" role="radiogroup" aria-label="Cách thêm sách">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "copy"}
                className={`batch-mode-option ${mode === "copy" ? "active" : ""}`}
                onClick={() => onModeChange?.("copy")}
                disabled={busy}
              >
                <Copy size={15} />
                <span>
                  <strong>Sao chép vào thư viện</strong>
                  <small>File được chép vào thư mục books, dùng được cả trên trình duyệt.</small>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "link"}
                className={`batch-mode-option ${mode === "link" ? "active" : ""}`}
                onClick={() => onModeChange?.("link")}
                disabled={busy}
              >
                <Link2 size={15} />
                <span>
                  <strong>Chỉ liên kết file gốc</strong>
                  <small>Không sao chép; đọc trực tiếp file PDF trên máy.</small>
                </span>
              </button>
            </div>
          )}

          {mode === "link" && !busy && phase !== "done" && (
            <p className="batch-upload-note">
              File gốc phải được giữ nguyên vị trí. Di chuyển, đổi tên hoặc xóa file sẽ làm sách không mở được.
            </p>
          )}

          <div className="batch-upload-list" role="list">
            {items.map((item) => {
              const editable = !busy && phase !== "done" && item.status === "pending";
              return (
                <div
                  key={item.id}
                  className={`batch-upload-row status-${item.status}`}
                  role="listitem"
                >
                  <span className="batch-upload-icon" aria-hidden="true">
                    <FileText size={18} />
                  </span>

                  <div className="batch-upload-info">
                    <div className="batch-upload-name" title={item.sourcePath || item.name}>
                      {item.name}
                      <span className="batch-upload-size">{formatSize(item.size)}</span>
                    </div>
                    {editable ? (
                      <input
                        className="form-control batch-upload-title-input"
                        value={item.title}
                        maxLength={160}
                        onChange={(e) => onTitleChange?.(item.id, e.target.value)}
                        aria-label={`Tiêu đề sách ${item.name}`}
                        placeholder="Tiêu đề hiển thị trong thư viện"
                      />
                    ) : (
                      <div className="batch-upload-subtitle">
                        {item.title}
                        {item.sourcePath ? ` • 📎 ${item.sourcePath}` : ""}
                      </div>
                    )}
                    {item.error && (
                      <div className="batch-upload-error" role="alert">
                        <AlertTriangle size={12} /> {item.error}
                      </div>
                    )}
                  </div>

                  <span className={`batch-upload-status status-${item.status}`}>
                    {item.status === "done" && <CheckCircle2 size={13} />}
                    {item.status === "uploading" && <Loader2 size={13} className="batch-spin" />}
                    {statusLabel(item.status, mode)}
                  </span>

                  {editable && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs batch-upload-remove"
                      onClick={() => onRemove?.(item.id)}
                      aria-label={`Bỏ file ${item.name}`}
                      title="Bỏ file này"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {busy && (
            <div className="batch-upload-progress-wrap">
              <div
                className="batch-upload-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Tiến trình thêm sách"
              >
                <div className="batch-upload-progress-bar" style={{ width: `${percent}%` }} />
              </div>
              <span className="batch-upload-progress-text">
                {progress?.current || 0}/{progress?.total || counts.total} file • {percent}%
              </span>
            </div>
          )}

          {summary && (
            <p className={`batch-upload-summary ${counts.error > 0 ? "has-error" : "ok"}`} role="status">
              {summary}
            </p>
          )}
        </div>

        <div className="batch-upload-footer">
          {busy ? (
            <button type="button" className="btn btn-ghost" onClick={onAbort}>
              Hủy tiến trình
            </button>
          ) : phase === "done" ? (
            <>
              {counts.error > 0 && (
                <button type="button" className="btn btn-secondary" onClick={onRetry}>
                  Thử lại {counts.error} file lỗi
                </button>
              )}
              <button type="button" className="btn btn-primary" data-initial-focus onClick={onClose}>
                Đóng
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                data-initial-focus
                onClick={onStart}
                disabled={pendingCount === 0}
              >
                {titleVerb} {pendingCount} sách
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
