// ── FileDropzone — component kéo-thả file dùng chung toàn app ─────────────
// Mục tiêu: mọi chỗ tải file đều kéo-thả được + KHÔNG lỗi.
// Các lỗi thường gặp đã xử lý:
//  1. Trình duyệt tự mở file khi thả ngoài vùng (navigation) → dùng preventWindowDrop() ở App root.
//  2. dragOver nhấp nháy (flicker) do dragenter/leave lồng nhau → dùng dragCounter.
//  3. Kích hoạt khi đang kéo text/selection (không phải file) → kiểm tra dataTransfer.types.
//  4. Input không chọn lại được file cũ → luôn reset e.target.value = "".
//  5. Sai định dạng / quá dung lượng → validate accept + maxSize trước khi gọi onFiles.
//  6. Thả folder cho FileList rỗng → emit bỏ qua (không crash); file rỗng vẫn qua validate của caller.
//  7. Mobile không có drag → vẫn bấm để chọn file bình thường + hỗ trợ paste (optional).
// Helper/hook: xem fileDropzoneUtils.js (file này chỉ export component → fast refresh OK).
import React, { useRef, useCallback } from "react";
import { useFileDrag } from "./fileDropzoneUtils.js";

/**
 * <FileDropzone /> — hộp kéo-thả + bấm chọn hoàn chỉnh.
 * Props: accept, multiple, maxSize, disabled, title, hint, compact, error, onFiles(files|file), onError(msg)
 */
export default function FileDropzone({
  accept = "",
  multiple = true,
  maxSize = 0,
  disabled = false,
  title = "Kéo thả file vào đây hoặc bấm để chọn",
  hint = "",
  compact = false,
  error = "",
  children,
  onFiles,
  onError,
  className = "",
  style,
}) {
  const inputRef = useRef(null);
  const { dragActive, bind, emit } = useFileDrag({ accept, multiple, maxSize, disabled, onFiles, onError });

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  return (
    <div
      className={`file-dropzone${dragActive ? " is-active" : ""}${disabled ? " is-disabled" : ""}${compact ? " is-compact" : ""} ${className}`}
      style={style}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={title}
      {...bind}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept || undefined}
        multiple={!!multiple}
        hidden
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) emit(files);
          // Reset để chọn lại cùng file vẫn bắn onChange (lỗi hay gặp)
          e.target.value = "";
        }}
      />
      {children || (
        <>
          <span className="file-dropzone-icon" aria-hidden="true">{dragActive ? "📥" : "📁"}</span>
          <span className="file-dropzone-title">{dragActive ? "Thả file để tải lên" : title}</span>
          {!!hint && <span className="file-dropzone-hint">{hint}</span>}
          {!!error && <span className="file-dropzone-error" role="alert">{error}</span>}
        </>
      )}
    </div>
  );
}
