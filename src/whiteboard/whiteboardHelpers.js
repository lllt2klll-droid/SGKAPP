// ── Helper thuần + hằng số cho WhiteboardView (KHÔNG chứa component/state) ────
// Tách khỏi WhiteboardView.jsx để file View chỉ còn state/render/effect.
// Mọi hàm giữ nguyên tên + logic, chỉ di chuyển vị trí. Các hàm dính board/
// selection trong component được chuyển thành tham số truyền vào.

export function cloneBoard(b) {
  try { if (typeof structuredClone === "function") return structuredClone(b); } catch {}
  return JSON.parse(JSON.stringify(b));
}

export function boardSnap(b) { return { objects: cloneBoard(b).objects, connectors: cloneBoard(b).connectors, zoom: b.zoom, pan: { ...b.pan }, defaultFontFamily: b.defaultFontFamily || "" }; }

export function estimateAutoSize(text, fontSize) {
  const lines = String(text || " ").split("\n");
  const maxChars = Math.max(...lines.map((l) => l.length), 6);
  const w = Math.max(120, Math.min(420, Math.ceil(maxChars * fontSize * 0.62 + 24)));
  const h = Math.max(48, Math.ceil(lines.length * fontSize * 1.35 + 20));
  return { w, h };
}

export function getDescendantIds(objects, rootId) {
  const children = new Map();
  objects.forEach((o) => { if (o.parentId) { if (!children.has(o.parentId)) children.set(o.parentId, []); children.get(o.parentId).push(o.id); } });
  const out = new Set();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    const kids = children.get(cur) || [];
    kids.forEach((k) => { if (!out.has(k)) { out.add(k); stack.push(k); } });
  }
  out.delete(rootId);
  return [...out];
}

export function simplifyPoints(points, tol = 1.8) {
  if (!points || points.length <= 40) return points;
  // Ramer-Douglas-Peucker đơn giản
  const sqTol = tol * tol;
  const getSqSegDist = (p, a, b) => {
    let x = a.x, y = a.y;
    let dx = b.x - x, dy = b.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b.x; y = b.y; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p.x - x; dy = p.y - y;
    return dx * dx + dy * dy;
  };
  const markers = new Uint8Array(points.length);
  markers[0] = 1; markers[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0, idx = -1;
    for (let i = first + 1; i < last; i++) if (!markers[i]) {
      const sq = getSqSegDist(points[i], points[first], points[last]);
      if (sq > maxSq) { maxSq = sq; idx = i; }
    }
    if (maxSq > sqTol) { markers[idx] = 1; stack.push([first, idx]); stack.push([idx, last]); }
  }
  return points.filter((_, i) => markers[i]);
}

export const SHAPE_OPTS = [
  { id: "rounded", label: "Bo tròn" }, { id: "rect", label: "Chữ nhật" },
  { id: "circle", label: "Tròn" }, { id: "ellipse", label: "Elip" },
  { id: "diamond", label: "Thoi" }, { id: "triangle", label: "Tam giác" },
];

export const CONN_OPTS = [
  { id: "line", label: "Line" }, { id: "arrow", label: "Arrow" },
  { id: "double", label: "Double" }, { id: "elbow", label: "Elbow" },
  { id: "curve", label: "Curve" },
];

export const LAYOUT_OPTS = [
  { id: "tree-tb", label: "Top → Bottom" }, { id: "tree-lr", label: "Left → Right" },
  { id: "tree-rl", label: "Right → Left" }, { id: "tree-bt", label: "Bottom → Top" },
  { id: "radial", label: "Radial" },
];

// Tour 30 giây cho người mới (mở tự động 1 lần khi bảng trống)
export const TOUR_STEPS = [
  { icon: "▣", title: "1. Thêm khối", desc: "Bấm công cụ ở dock bên phải (Chữ / Hình / Ghi chú / Mindmap) rồi bấm lên bảng. Kéo-thả file ảnh vào cũng được." },
  { icon: "→", title: "2. Nối các khối", desc: "Bôi đen 1 khối → kéo từ chấm neo xanh ở 4 cạnh sang khối khác. Double-click lên đường nối để ghi nhãn." },
  { icon: "✦", title: "3. AI vẽ sơ đồ", desc: "Nút ＋ ở dock → AI tạo sơ đồ: dán văn bản, xem trước, sửa nhãn rồi mới đưa lên bảng." },
  { icon: "🗺", title: "4. Đi lại trên bảng", desc: "Kéo bản đồ thu nhỏ góc trái-dưới để di chuyển. Phím F = vừa màn hình, Shift+F = về khối đang chọn." },
  { icon: "⌨", title: "5. Phím tắt", desc: "Alt+↑↓←→ = tạo nhánh nhanh từ khối đang chọn. Tab = chuyển khối. Enter/F2 = sửa chữ. Ctrl+Z/Y = hoàn tác/làm lại. +/- = zoom." },
];

export const QUICK_EMOJIS = ["⭐", "🎯", "💡", "📌", "❤️", "⚠️", "✅", "❌", "❓", "🚀", "🌱", "📚"];

export const NOTE_COLORS = ["#fef9c3", "#dbeafe", "#dcfce7", "#ffe4e6", "#ede9fe", "#ffedd5"];

export const WHITE_FILLS = ["#ffffff", "#fff", "#fbfdff", "#f8fafc", "#fefefe"];

// Key snapshot phiên bản theo board (logic cũ của `versionsKey` trong View).
export function versionsKey(boardId) { return `sgk_wb_versions_${boardId}`; }

export function isWhiteishFill(o) {
  if (o.kind === "image") return !o.src; // ảnh hỏng hiện khung xám/trắng
  return WHITE_FILLS.includes(String(o.fill || "").toLowerCase());
}

export function areaOf(o) { return Math.max(0, o.width || 0) * Math.max(0, o.height || 0); }

// Phần thuần của handleCleanBackground: tìm khối nền trắng to gấp nhiều lần
// các khối khác. Trả về object nền hoặc null.
export function findBackgroundCandidate(objects) {
  const objs = (objects || []).filter((o) => o.kind !== "stroke" && Number.isFinite(o.width) && Number.isFinite(o.height));
  if (objs.length < 2) return null;
  const sorted = [...objs].sort((a, b) => areaOf(b) - areaOf(a));
  const biggest = sorted[0];
  const second = sorted[1];
  if (!isWhiteishFill(biggest) || areaOf(biggest) < Math.max(1, areaOf(second)) * 8) return null;
  return biggest;
}

// Phần thuần của handleAlign: trả về mảng objects mới đã căn chỉnh.
export function alignObjects(objects, selectionIds, kind) {
  const objs = (objects || []).filter((o) => selectionIds.includes(o.id));
  if (!objs.length) return objects;
  const minX = Math.min(...objs.map((o) => o.x));
  const maxR = Math.max(...objs.map((o) => o.x + o.width));
  const minY = Math.min(...objs.map((o) => o.y));
  const maxB = Math.max(...objs.map((o) => o.y + o.height));
  const cx = (minX + maxR) / 2;
  const cy = (minY + maxB) / 2;
  return (objects || []).map((o) => {
    if (!selectionIds.includes(o.id)) return o;
    if (kind === "left") return { ...o, x: minX };
    if (kind === "right") return { ...o, x: maxR - o.width };
    if (kind === "center") return { ...o, x: cx - o.width / 2 };
    if (kind === "top") return { ...o, y: minY };
    if (kind === "bottom") return { ...o, y: maxB - o.height };
    if (kind === "middle") return { ...o, y: cy - o.height / 2 };
    return o;
  });
}

// Phần thuần của handleDistribute: trả về mảng objects mới đã phân bố đều.
export function distributePositions(objects, selectionIds, axis) {
  const objs = (objects || []).filter((o) => selectionIds.includes(o.id));
  const getCenter = (o) => axis === "h" ? o.x + o.width / 2 : o.y + o.height / 2;
  const sorted = [...objs].sort((a, b) => getCenter(a) - getCenter(b));
  const firstC = getCenter(sorted[0]);
  const lastC = getCenter(sorted[sorted.length - 1]);
  const span = lastC - firstC;
  const step = span / (sorted.length - 1);
  const posMap = new Map();
  sorted.forEach((o, i) => {
    if (i === 0 || i === sorted.length - 1) return;
    const targetCenter = firstC + step * i;
    posMap.set(o.id, axis === "h" ? targetCenter - o.width / 2 : targetCenter - o.height / 2);
  });
  return (objects || []).map((o) => {
    if (!posMap.has(o.id)) return o;
    const p = posMap.get(o.id);
    return axis === "h" ? { ...o, x: p } : { ...o, y: p };
  });
}

// Phần thuần của reorderZ: trả về mảng objects mới đã sắp xếp + chuẩn hoá z.
export function reorderObjects(objects, ids, mode) {
  const sorted = [...(objects || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
  const maxZ = Math.max(...sorted.map((o) => o.z || 0), 0);
  const minZ = Math.min(...sorted.map((o) => o.z || 0), 0);
  let next = [...(objects || [])];
  if (mode === "front") {
    let z = maxZ + 1;
    next = next.map((o) => ids.includes(o.id) ? { ...o, z: z++ } : o);
  } else if (mode === "back") {
    let z = minZ - ids.length;
    next = next.map((o) => ids.includes(o.id) ? { ...o, z: z++ } : o);
  } else if (mode === "forward") {
    next = next.map((o) => ids.includes(o.id) ? { ...o, z: (o.z || 0) + 10 } : o);
  } else if (mode === "backward") {
    next = next.map((o) => ids.includes(o.id) ? { ...o, z: (o.z || 0) - 10 } : o);
  }
  next.sort((a, b) => (a.z || 0) - (b.z || 0));
  next = next.map((o, i) => ({ ...o, z: i }));
  return next;
}

// ── Trình quản lý bảng ("Bảng của bạn"): hàm thuần cho sắp xếp / chi tiết ──
export const BOARD_SORTS = [
  { id: "updated", label: "Mới nhất" },
  { id: "name", label: "Tên A–Z" },
  { id: "objects", label: "Nhiều khối nhất" },
  { id: "created", label: "Tạo gần đây" },
];

/** Sắp xếp mục index bảng (id/name/createdAt/updatedAt). details: {id:{objects}} — thiếu thì coi như -1. */
export function sortBoardEntries(entries, sortId = "updated", details = null) {
  const arr = [...(Array.isArray(entries) ? entries : [])];
  const countOf = (b) => {
    try {
      const d = details && details[b?.id];
      return d && Number.isFinite(d.objects) ? d.objects : -1;
    } catch { return -1; }
  };
  switch (sortId) {
    case "name":
      arr.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "vi"));
      break;
    case "objects":
      arr.sort((a, b) => countOf(b) - countOf(a) || (b?.updatedAt || 0) - (a?.updatedAt || 0));
      break;
    case "created":
      arr.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
      break;
    case "updated":
    default:
      arr.sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0));
      break;
  }
  return arr;
}

/** "45KB" / "1,2MB" cho dòng chi tiết bảng. */
export function formatBoardSizeKb(chars) {
  const n = Math.max(0, Number(chars) || 0);
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? Math.round(kb * 10) / 10 : Math.round(kb)}KB`;
  return `${Math.round((kb / 1024) * 10) / 10}MB`;
}

/** Nhận diện payload JSON nhiều bảng: {boards:[...]} hoặc mảng board thô. */
export function extractMultiBoardsPayload(data) {
  try {
    if (data && Array.isArray(data.boards) && data.boards.length) return data.boards;
    if (Array.isArray(data) && data.length && data.every((v) => v && typeof v === "object" && Array.isArray(v.objects))) {
      return data;
    }
  } catch {}
  return null;
}
