export function headMarkerId(head, color, selected) {
  if (!head || head === "none") return undefined;
  if (selected) return `url(#wb-${head}-sel)`;
  return `url(#wb-${head}-${String(color || "#475569").replace(/[^0-9a-fA-F]/g, "")})`;
}

export function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
