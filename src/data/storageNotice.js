// ── A1 • CẢNH BÁO BỘ NHỚ TRÌNH DUYỆT SẮP HẾT ─────────────────────────────
// Thuần logic (không đụng navigator) để test được ngưỡng: ≥90% → warn,
// ≥98% → danger. App.jsx chỉ lo việc đọc estimate() + hiển thị banner.

export const STORAGE_WARN_PCT = 90;
export const STORAGE_DANGER_PCT = 98;

/**
 * @param {number} usage bytes đã dùng
 * @param {number} quota bytes tổng dung lượng
 * @returns {{level:"ok"|"warn"|"danger", pct:number}|null} null nếu không đo được
 */
export function storageNoticeLevel(usage, quota) {
  const u = Number(usage);
  const q = Number(quota);
  if (!Number.isFinite(u) || !Number.isFinite(q) || u < 0 || q <= 0) return null;
  const pct = Math.min(100, Math.round((u / q) * 100));
  if (pct >= STORAGE_DANGER_PCT) return { level: "danger", pct };
  if (pct >= STORAGE_WARN_PCT) return { level: "warn", pct };
  return { level: "ok", pct };
}

/** Nội dung cảnh báo theo mức — giữ 1 chỗ để banner và test dùng chung. */
export function storageNoticeText(level, pct) {
  if (level === "danger") {
    return `Bộ nhớ trình duyệt sắp hết (${pct}%). Dữ liệu bạn giao có thể bị mất - hãy bấm "Sao lưu ngay" rồi vào Sao lưu & Khôi phục để dọn cache.`;
  }
  if (level === "warn") {
    return `Bộ nhớ trình duyệt đã dùng ${pct}%. Hãy sao lưu sớm để tránh mất ghi chú/giáo án.`;
  }
  return "";
}
