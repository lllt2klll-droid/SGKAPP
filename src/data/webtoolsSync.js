// ─── Đồng bộ Kho Công cụ Web — chống vòng lặp echo ───
// saveTools() phát WEBTOOLS_UPDATED (đồng bộ) NGAY sau khi ghi → component
// nghe chính event đó và setTools(loadTools()) → mảng MỚI mọi lần → effect
// [tools] chạy lại → save → emit → … (vòng lặp vô hạn: 900+ ghi/2s, treo tab).
// Hợp đồng: nếu nội dung next TRÙNG prev thì phải trả về CHÍNH prev (reference)
// để React bailout — không render lại, không save lại.

export function pickExternalTools(prev, next) {
  if (!Array.isArray(next)) return prev;
  if (!Array.isArray(prev)) return next;
  if (next === prev) return prev;
  if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
  return next;
}
