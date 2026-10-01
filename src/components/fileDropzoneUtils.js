// ── Helper thuần cho vùng kéo-thả file (KHÔNG chứa component) ──────────────
// Tách khỏi FileDropzone.jsx để file component chỉ export component
// (oxlint react/only-export-components → fast refresh hoạt động đúng).
import { useRef, useState, useCallback } from "react";

/** Kiểm tra DataTransfer có chứa file không (tránh bật overlay khi kéo text) */
export function hasFilesInDataTransfer(e) {
  try {
    const types = e?.dataTransfer?.types;
    if (!types) return false;
    if (Array.isArray(types)) return types.includes("Files");
    return [...types].includes("Files");
  } catch { return false; }
}

/** So khớp accept kiểu "image/*,.json,application/pdf" với File */
export function matchAccept(file, accept) {
  if (!accept || !String(accept).trim()) return true;
  const name = (file?.name || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();
  const parts = String(accept).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const p of parts) {
    if (p === "*/*" || p === "*") return true;
    if (p.startsWith(".")) {
      if (name.endsWith(p)) return true;
    } else if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1); // "image/"
      if (type.startsWith(prefix)) return true;
      // fallback theo đuôi file khi type rỗng (một số máy)
      if (!type && prefix === "image/" && /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return true;
    } else {
      if (type === p) return true;
      // chấp nhận theo đuôi suy từ mime phổ biến
      if (p === "application/json" && name.endsWith(".json")) return true;
      if (p.includes("spreadsheet") && /\.(xlsx|xls)$/.test(name)) return true;
      if (p.includes("wordprocessingml") && /\.docx$/.test(name)) return true;
    }
  }
  return false;
}

export function formatBytes(b) {
  if (!Number.isFinite(b)) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Chặn trình duyệt tự mở file khi user thả ngoài dropzone.
 * Gọi 1 lần ở App root: useEffect(() => preventWindowDrop(), []).
 * Đây là fix quan trọng nhất chống "kéo-thả là mất trang".
 */
export function preventWindowDrop() {
  const prevent = (e) => { e.preventDefault(); };
  window.addEventListener("dragover", prevent, { passive: false });
  window.addEventListener("drop", prevent, { passive: false });
  return () => {
    window.removeEventListener("dragover", prevent);
    window.removeEventListener("drop", prevent);
  };
}

/**
 * Hook dùng chung cho các vùng custom (không muốn render FileDropzone nguyên khối).
 * Trả về { dragActive, bind } — spread bind vào div vùng thả.
 */
export function useFileDrag({ accept, multiple = true, maxSize = 0, disabled = false, onFiles, onError } = {}) {
  const [dragActive, setDragActive] = useState(false);
  const counterRef = useRef(0);

  const emit = useCallback((files) => {
    let list = Array.from(files || []).filter(Boolean);
    if (!multiple) list = list.slice(0, 1);
    if (accept) {
      const bad = list.filter((f) => !matchAccept(f, accept));
      if (bad.length && list.length === bad.length) {
        onError?.(`Định dạng không hỗ trợ: ${bad[0].name}. Chấp nhận: ${accept}`);
        return;
      }
      if (bad.length) onError?.(`Bỏ qua ${bad.length} file sai định dạng.`);
      list = list.filter((f) => matchAccept(f, accept));
    }
    if (maxSize > 0) {
      const over = list.filter((f) => f.size > maxSize);
      if (over.length && list.length === over.length) {
        onError?.(`File quá lớn (${formatBytes(over[0].size)}). Tối đa ${formatBytes(maxSize)}/file.`);
        return;
      }
      if (over.length) onError?.(`Bỏ qua ${over.length} file quá lớn (tối đa ${formatBytes(maxSize)}).`);
      list = list.filter((f) => f.size <= maxSize);
    }
    if (!list.length) return;
    onFiles?.(multiple ? list : list[0]);
  }, [accept, multiple, maxSize, onFiles, onError]);

  const bind = {
    onDragEnter: (e) => {
      if (disabled) return;
      e.preventDefault(); e.stopPropagation();
      if (!hasFilesInDataTransfer(e)) return;
      counterRef.current += 1;
      setDragActive(true);
    },
    onDragOver: (e) => {
      if (disabled) return;
      e.preventDefault(); e.stopPropagation();
      // Bắt buộc preventDefault để drop hoạt động + set dropEffect
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {}
      if (!dragActive && hasFilesInDataTransfer(e)) setDragActive(true);
    },
    onDragLeave: (e) => {
      if (disabled) return;
      e.preventDefault(); e.stopPropagation();
      counterRef.current = Math.max(0, counterRef.current - 1);
      if (counterRef.current === 0) setDragActive(false);
    },
    onDrop: (e) => {
      if (disabled) return;
      e.preventDefault(); e.stopPropagation();
      counterRef.current = 0;
      setDragActive(false);
      const files = e.dataTransfer?.files;
      if (files?.length) emit(files);
    },
  };
  return { dragActive, bind, emit };
}
