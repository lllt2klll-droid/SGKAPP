// ── Thêm nhiều sách cùng lúc ──────────────────────────────────────────
// Hàm thuần (không phụ thuộc DOM) để App.jsx và test dùng chung.

export const BATCH_MAX_FILES = 60;
export const BATCH_CHUNK_SIZE = 20;
export const BATCH_COPY_MAX_BYTES = 80 * 1024 * 1024;

export const BATCH_SUPPORTED_EXTS = [
  ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
  ".txt", ".md", ".html", ".htm", ".epub",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
];

export function batchFileExt(name) {
  const match = String(name || "").toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

export function isSupportedBatchFile(name) {
  const ext = batchFileExt(name);
  return Boolean(ext) && BATCH_SUPPORTED_EXTS.includes(ext);
}

export function sanitizeBatchTitle(raw, fallback) {
  const title = String(raw || "").trim();
  if (title.length >= 3) return title.slice(0, 160);
  const fb = String(fallback || "").trim();
  return fb || "Sách mới";
}

export function isLinkablePdfItem(item) {
  return batchFileExt(item?.name) === ".pdf" && Boolean(item?.sourcePath);
}

/**
 * Chuẩn hóa danh sách File người dùng chọn thành hàng đợi.
 * File không hợp lệ vẫn được giữ lại (status "invalid") để người dùng thấy
 * lý do, thay vì biến mất im lặng.
 */
export function buildBatchItems(files, options = {}) {
  const {
    getSourcePath = () => "",
    getTitle = (name) => name,
    maxFiles = BATCH_MAX_FILES,
  } = options;

  const all = Array.from(files || []);
  const accepted = all.slice(0, maxFiles);
  const skipped = Math.max(0, all.length - accepted.length);
  const seen = new Set();

  const items = accepted.map((file, index) => {
    const name = String(file?.name || `file-${index + 1}`);
    const size = Number(file?.size) || 0;
    let sourcePath = "";
    try {
      sourcePath = String(getSourcePath(file) || "");
    } catch {
      sourcePath = "";
    }
    const fallbackTitle = String(getTitle(name) || name);
    const item = {
      id: `batch-${index}`,
      file,
      name,
      size,
      sourcePath,
      title: sanitizeBatchTitle("", fallbackTitle),
      status: "pending",
      error: "",
    };

    const key = `${name.toLowerCase()}|${size}`;
    if (seen.has(key)) {
      item.status = "invalid";
      item.error = "Trùng với file khác trong lần chọn này.";
      return item;
    }
    seen.add(key);

    if (!isSupportedBatchFile(name)) {
      item.status = "invalid";
      item.error = "Định dạng chưa hỗ trợ.";
      return item;
    }

    if (size <= 0) {
      item.status = "invalid";
      item.error = "File rỗng (0 byte).";
      return item;
    }

    const linkablePdf = isLinkablePdfItem(item);
    if (size > BATCH_COPY_MAX_BYTES && !linkablePdf) {
      item.status = "invalid";
      item.error = `File quá lớn (${(size / 1024 / 1024).toFixed(1)} MB). Giới hạn 80 MB khi sao chép.`;
      return item;
    }

    return item;
  });

  return { items, skipped };
}

export function canLinkAll(items) {
  return Array.isArray(items) && items.length > 0 && items.every(isLinkablePdfItem);
}

export function chunkItems(items, size = BATCH_CHUNK_SIZE) {
  const list = Array.from(items || []);
  const chunkSize = Math.max(1, Number(size) || BATCH_CHUNK_SIZE);
  const chunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

export function countBatchStatuses(items) {
  const counts = { pending: 0, uploading: 0, done: 0, error: 0, invalid: 0, total: 0 };
  for (const item of items || []) {
    counts.total += 1;
    if (counts[item?.status] !== undefined) counts[item.status] += 1;
  }
  return counts;
}

export function batchResultSummary({ done = 0, failed = 0, mode = "copy", aborted = false } = {}) {
  if (aborted) {
    return "Đã hủy. Các sách đã thêm trước đó vẫn được giữ trong thư viện.";
  }
  const verb = mode === "link" ? "liên kết" : "thêm";
  if (done > 0 && failed > 0) {
    return `Đã ${verb} ${done} sách, ${failed} file lỗi — bấm "Thử lại file lỗi".`;
  }
  if (done > 0) {
    return mode === "link"
      ? `Đã liên kết ${done} sách (không sao chép file).`
      : `Đã thêm ${done} sách vào thư viện.`;
  }
  if (failed > 0) {
    return `Không ${verb} được sách nào. ${failed} file lỗi — xem chi tiết bên dưới.`;
  }
  return "Chưa có sách nào được thêm.";
}
