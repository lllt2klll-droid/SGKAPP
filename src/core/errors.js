// ── Unified Error Strategy ───────────────────────────────────────────
// Replaces scattered ad-hoc error handling with typed errors + UI contract.
// UI receives: { type, message, recoverable, action }
// Teachers see friendly Vietnamese messages, not technical stacks.

export class AppError extends Error {
  constructor(message, { type="AppError", recoverable=true, action=null, cause=null }={}) {
    super(message);
    this.name = type;
    this.type = type;
    this.recoverable = recoverable;
    this.action = action; // e.g. "retry" | "clearCache" | "contactSupport"
    if (cause) this.cause = cause;
  }
  toUI() {
    return { type: this.type, message: this.message, recoverable: this.recoverable, action: this.action };
  }
}
export class StorageError extends AppError {
  constructor(message, opts={}) { super(message, { type:"StorageError", ...opts }); }
}
export class ValidationError extends AppError {
  constructor(message, opts={}) { super(message, { type:"ValidationError", recoverable:true, ...opts }); }
}
export class IntegrationError extends AppError {
  constructor(message, opts={}) { super(message, { type:"IntegrationError", ...opts }); }
}
export class NotFoundError extends AppError {
  constructor(message, opts={}) { super(message, { type:"NotFoundError", recoverable:false, ...opts }); }
}
export class MigrationError extends AppError {
  constructor(message, opts={}) { super(message, { type:"MigrationError", recoverable:false, ...opts }); }
}

export function toFriendlyError(err) {
  if (!err) return { type:"Unknown", message:"Đã có lỗi xảy ra.", recoverable:true };
  if (err.toUI) return err.toUI();
  const msg = String(err.message || err || "Đã có lỗi xảy ra.");
  // Map technical patterns to friendly Vietnamese
  if (msg.includes("QuotaExceeded") || msg.includes("quota")) return { type:"StorageError", message:"Bộ nhớ trình duyệt đã đầy. Vào Sao lưu & Khôi phục → Xóa cache để giải phóng.", recoverable:true, action:"clearCache" };
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return { type:"AppError", message:"Không kết nối được máy chủ. Kiểm tra backend http://localhost:5000.", recoverable:true, action:"retry" };
  if (msg.includes("not found") || msg.includes("404")) return { type:"NotFoundError", message:"Không tìm thấy dữ liệu yêu cầu.", recoverable:false };
  return { type: err.name || "AppError", message: msg.slice(0, 400), recoverable:true };
}

// Heuristic: message đã là tiếng Việt (có dấu) thì hiển thị trực tiếp,
// ngược lại (tiếng Anh kỹ thuật / mã lỗi) thì dùng thông báo chung.
// Không bao giờ để "Failed to fetch", "Unexpected token", "[object Object]"... lọt ra UI.
const VI_DIACRITICS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
export function uiMessage(err, fallback = "Đã có lỗi xảy ra. Vui lòng thử lại.") {
  try {
    const raw = typeof err === "string" ? err : String(err?.message ?? err ?? "");
    if (!raw || raw === "[object Object]" || raw === "undefined" || raw === "null") return fallback;
    if (VI_DIACRITICS.test(raw)) return raw.slice(0, 220);
    // Đã là tiếng Việt không dấu nhưng rõ nghĩa (do app tự tạo) thì giữ
    if (/^(Không|Đã|Vui lòng|File|Trang|Sách|Bạn|Hệ thống|Ứng dụng)/.test(raw.trim())) return raw.slice(0, 220);
    const mapped = toFriendlyError(err);
    if (mapped && mapped.message && (VI_DIACRITICS.test(mapped.message) || mapped.message === fallback)) return mapped.message;
    return fallback;
  } catch {
    return fallback;
  }
}

export function handleError(err, { toast=null, fallbackMessage="Đã có lỗi xảy ra." }={}) {
  const ui = toFriendlyError(err);
  if (!ui.message) ui.message = fallbackMessage;
  console.error(`[${ui.type}]`, err);
  if (typeof toast === "function") toast(ui.message);
  return ui;
}
