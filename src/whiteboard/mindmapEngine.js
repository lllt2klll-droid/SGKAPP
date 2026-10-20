// ─── Mindmap engine: sinh node thật + auto-layout + templates ───
// Mọi hàm trả về {objects, connectors} với toạ độ x/y thật, parentId thật.

import { uid, blankObject } from "./whiteboardStore.js";

// ─── Kiểu gạch đầu dòng cho text trong node (bullets) ───
// bullets lưu trong object: false | true (cũ = "dot") | "dot" | "dash" | "num" | "square" | "arrow" | "check"
export const BULLET_STYLES = [
  { id: "", label: "— Tắt" },
  { id: "dot", label: "• Chấm" },
  { id: "dash", label: "– Gạch" },
  { id: "num", label: "1. Số thứ tự" },
  { id: "square", label: "▪ Vuông" },
  { id: "arrow", label: "➤ Mũi tên" },
  { id: "check", label: "✓ Tích" },
];
const BULLET_MARKS = { dot: "•", dash: "–", square: "▪", arrow: "➤", check: "✓" };
export function normalizeBulletStyle(v) {
  if (v === true) return "dot"; // tương thích board cũ
  return BULLET_STYLES.some((s) => s.id === v) ? v : "";
}
// Bỏ marker cũ (kể cả số "1. ") để khỏi chồng "• 1. " khi đổi kiểu
export function stripBulletMark(s) {
  return String(s || "").replace(/^(\d+[.)]\s*|[-*•▪◦➤✓✔»]\s*)+/, "");
}
export function bulletPrefix(style, n) {
  const s = normalizeBulletStyle(style);
  if (!s) return "";
  if (s === "num") return `${Math.max(1, n || 1)}. `;
  return `${BULLET_MARKS[s]} `;
}
// Chừa chỗ thụt lề khi xuống dòng (số "12. " rộng hơn chấm)
export function bulletIndentPx(fontSize, style) {
  const s = normalizeBulletStyle(style);
  if (!s) return 0;
  return (Number(fontSize) || 15) * (s === "num" ? 1.8 : 1.1);
}

// ─── Chữ mẫu của template/AI (Nhánh 1, Chủ đề...) — mở sửa là bôi đen sẵn để gõ đè ───
const PLACEHOLDER_RE = /^\s*(nhánh(\s+\d+)?|nhánh mới|nhánh con|chủ đề(\s+chính)?|khối|hình|văn bản mới|ghi chú…?|nhấn đúp để sửa|ý tưởng(\s+\d+)?|loại \d+|giai đoạn \d+|bước \d+|đối tượng [ab]|điểm chung|nhóm lớn|tên bài học|mục tiêu|hoạt động|luyện tập|đánh giá|gốc)\s*[.:…]?\s*$/i;
export function isPlaceholderText(t) {
  return PLACEHOLDER_RE.test(String(t || ""));
}

// ─── Markdown-lite trong node: **đậm**, *nghiêng* (không hỗ trợ khác) ───
// Tách đoạn thành runs [{t, bold, italic}]. Marker không đóng cặp giữ nguyên chữ.
// 2-pass: **đậm** trước, rồi *nghiêng* trong phần còn lại (tránh nuốt marker đóng).
export function parseRichSegments(s) {
  const out = [];
  const push = (t, bold, italic) => { if (t) out.push({ t, bold, italic }); };
  const parts = String(s || "").split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) { push(m[1], true, false); continue; }
    const subs = part.split(/(\*[^*\n]+\*)/g);
    for (const sub of subs) {
      if (!sub) continue;
      const m2 = sub.match(/^\*([^*]+)\*$/);
      if (m2) push(m2[1], false, true);
      else push(sub, false, false);
    }
  }
  return out.length ? out : [{ t: "", bold: false, italic: false }];
}

// Xuống dòng cho runs (giữ style từng từ), mỗi đoạn \n giữ nguyên. Trả mảng dòng, mỗi dòng là mảng runs.
export function wrapRichLines(text, maxChars) {
  const mc = Math.max(3, Math.floor(Number(maxChars) || 20));
  const out = [];
  for (const para of String(text || "").split("\n")) {
    if (!para) { out.push([]); continue; }
    const segs = parseRichSegments(para);
    let cur = [];
    let len = 0;
    const pushLine = () => { out.push(cur); cur = []; len = 0; };
    for (const s of segs) {
      for (const w of s.t.split(/\s+/)) {
        if (!w) continue;
        if (len > 0 && len + 1 + w.length > mc) pushLine();
        cur.push({ t: (cur.length ? " " : "") + w, bold: s.bold, italic: s.italic });
        len += (cur[cur.length - 1].t.length);
      }
    }
    pushLine();
    if (out.length >= 48) break;
  }
  return out.slice(0, 48);
}

// ─── Hình học connector dùng chung (canvas render + hit-test menu chuột phải) ───
export function centerOf(o) {
  return { x: o.x + o.width / 2, y: o.y + o.height / 2 };
}

// Điểm neo trên biên node — hỗ trợ anchor top/right/bottom/left/auto
export function edgePoint(node, tx, ty, anchor = "auto") {
  const c = centerOf(node);
  const hw = node.width / 2;
  const hh = node.height / 2;
  if (anchor === "top") return { x: c.x, y: c.y - hh };
  if (anchor === "bottom") return { x: c.x, y: c.y + hh };
  if (anchor === "left") return { x: c.x - hw, y: c.y };
  if (anchor === "right") return { x: c.x + hw, y: c.y };
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  if (Math.abs(dx) / (hw || 1) > Math.abs(dy) / (hh || 1)) {
    return { x: c.x + (dx > 0 ? hw : -hw), y: c.y };
  }
  return { x: c.x, y: c.y + (dy > 0 ? hh : -hh) };
}

export function connectorGeom(a, b, type, sourceAnchor = "auto", targetAnchor = "auto", bendOpt) {
  if (!a || !b) return null;
  const ca = centerOf(a);
  const cb = centerOf(b);
  const p1 = edgePoint(a, cb.x, cb.y, sourceAnchor);
  const p2 = edgePoint(b, ca.x, ca.y, targetAnchor);
  if (type === "elbow") {
    // Đi ngang trước khi 2 biên cách ngang ≥ cách dọc, ngược lại đi dọc trước — đỡ đè lên node
    if (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y)) {
      const midX = (p1.x + p2.x) / 2;
      const pts = [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
      return { d: `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`, pts, end: p2, endAngle: p2.x >= midX ? 0 : 180 };
    }
    const midY = (p1.y + p2.y) / 2;
    const pts = [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2];
    return { d: `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`, pts, end: p2, endAngle: p2.y >= midY ? 90 : -90 };
  }
  if (type === "curve") {
    // Cong bezier: điểm điều khiển lệch pháp tuyến. bend=% chỉnh tay (mặc định 100 = auto),
    // 0 = thẳng. Xác định (không ngẫu nhiên) để export/hit-test khớp canvas.
    const bend = Number.isFinite(Number(bendOpt)) ? Number(bendOpt) : 100;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(160, len * 0.25 * (bend / 100));
    const cx = (p1.x + p2.x) / 2 + (-dy / len) * k;
    const cy = (p1.y + p2.y) / 2 + (dx / len) * k;
    const at = (t) => ({
      x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cx + t * t * p2.x,
      y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cy + t * t * p2.y,
    });
    const pts = [0, 0.25, 0.5, 0.75, 1].map(at);
    const endAngle = (Math.atan2(p2.y - cy, p2.x - cx) * 180) / Math.PI;
    return { d: `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`, pts, end: p2, endAngle };
  }
  const ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, pts: [p1, p2], end: p2, endAngle: ang };
}

function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ─── Style connector kiểu Canva: mũi 2 đầu (arrow/dot/diamond/none) + nét đứt ───
// Model tương thích cũ: board cũ chỉ có type (line/arrow/double/elbow) vẫn render đúng
// nhờ fallback — không cần migrate dữ liệu.
export const CONN_HEAD_OPTS = [
  { id: "none", label: "Không", glyph: "○" },
  { id: "arrow", label: "Mũi tên", glyph: "➤" },
  { id: "dot", label: "Chấm tròn", glyph: "●" },
  { id: "diamond", label: "Hình thoi", glyph: "◆" },
];
export const CONN_DASH_OPTS = [
  { id: "", label: "Liền" },
  { id: "6 4", label: "Đứt" },
  { id: "2 4", label: "Chấm" },
];
export const CONN_COLORS = ["#475569", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];
export const CONN_WIDTHS = [1, 2, 3, 4, 6, 8];
const VALID_HEAD = new Set(["none", "arrow", "dot", "diamond"]);

// Suy đầu/cuối: ưu tiên startHead/endHead tường minh, thiếu thì fallback type cũ.
export function connHeads(c = {}) {
  let start = VALID_HEAD.has(c.startHead) ? c.startHead : null;
  let end = VALID_HEAD.has(c.endHead) ? c.endHead : null;
  if (!start || !end) {
    const t = c.type;
    const legacy = t === "line" ? ["none", "none"] : t === "double" ? ["arrow", "arrow"] : ["none", "arrow"];
    if (!start) start = legacy[0];
    if (!end) end = legacy[1];
  }
  return { start, end };
}

export function connDash(c = {}) {
  const d = c.dash ?? "";
  return CONN_DASH_OPTS.some((o) => o.id === d) ? d : "";
}

// type tương thích khi user đổi đầu: giữ dáng elbow/curve, còn lại suy từ 2 đầu
export function connTypeForHeads(c = {}, start, end) {
  const t = c.type || "";
  if (t === "elbow" || t === "curve") return t;
  if (start !== "none" && end !== "none") return "double";
  if (start !== "none" || end !== "none") return "arrow";
  return "line";
}

// Chuyển 1 đầu nối sang node khác (giữ nguyên style) — pure, không mutate.
// Dùng khi cầm đầu mũi tên kéo-thả sang khối khác.
export function reconnectConn(connectors, id, end, newNodeId, anchor = "auto") {
  return (Array.isArray(connectors) ? connectors : []).map((c) =>
    c.id !== id ? c : (end === "to"
      ? { ...c, toId: newNodeId, targetAnchor: anchor }
      : { ...c, fromId: newNodeId, sourceAnchor: anchor }));
}

// Đảo chiều: đổi from/to + neo + đầu mũi (giữ nguyên dáng và style còn lại)
export function flipConn(c = {}) {
  const { start, end } = connHeads(c);
  return {
    ...c,
    fromId: c.toId,
    toId: c.fromId,
    sourceAnchor: c.targetAnchor ?? "auto",
    targetAnchor: c.sourceAnchor ?? "auto",
    startHead: end,
    endHead: start,
    type: connTypeForHeads(c, end, start),
  };
}

// Khoảng cách từ điểm tới connector (hỗ trợ elbow polyline) — dùng cho hit-test menu chuột phải
export function distToConnector(wx, wy, a, b, type, sourceAnchor, targetAnchor, bend) {
  const g = connectorGeom(a, b, type, sourceAnchor, targetAnchor, bend);
  if (!g || !g.pts) return Infinity;
  const p = { x: wx, y: wy };
  let best = Infinity;
  for (let i = 0; i + 1 < g.pts.length; i++) {
    best = Math.min(best, distToSeg(p, g.pts[i], g.pts[i + 1]));
  }
  return best;
}

const PALETTES = {
  mindmap: ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"],
  tree: ["#1d4ed8", "#0d9488", "#b45309", "#be123c", "#6d28d9"],
  process: ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
  pastel: ["#dbeafe", "#dcfce7", "#fef3c7", "#ffe4e6", "#ede9fe", "#cffafe"],
};

function nodeAt({ x, y, w = 170, h = 60, text, fill, color = "#ffffff", parentId = null, fontSize = 15, bold = true }) {
  return {
    ...blankObject("node"),
    id: uid("o"),
    x, y, width: w, height: h, text, fill, color, parentId, fontSize, bold,
    stroke: "transparent", strokeWidth: 0,
  };
}

function conn(fromId, toId, color = "#64748b", sourceAnchor = "auto", targetAnchor = "auto") {
  return { id: uid("c"), fromId, toId, type: "arrow", color, width: 2, sourceAnchor, targetAnchor };
}

// ─── Tạo mindmap từ chủ đề trung tâm + danh sách nhánh ───
export function generateMindmap(topic, branches = [], opts = {}) {
  const cx = opts.cx ?? 700;
  const cy = opts.cy ?? 420;
  const objects = [];
  const connectors = [];
  const root = nodeAt({ x: cx - 100, y: cy - 36, w: 200, h: 72, text: topic || "Chủ đề", fill: "#1d4ed8", fontSize: 17 });
  objects.push(root);
  const n = Math.max(branches.length, 1);
  // Theme chọn lúc tạo sơ đồ → dùng màu theme cho nhánh (mặc định vivid/palette cũ)
  const themeColors = (() => {
    if (Array.isArray(opts.colors) && opts.colors.length) return opts.colors;
    if (opts.themeId) {
      const t = MINDMAP_THEMES.find((x) => x.id === opts.themeId);
      if (t && Array.isArray(t.colors) && t.colors.length) return t.colors;
    }
    return PALETTES.mindmap;
  })();
  const normSubs = branches.map((br) =>
    typeof br === "object" && Array.isArray(br.children) ? br.children : []);
  const maxSubs = Math.max(0, ...normSubs.map((s) => s.length));
  // Cột con đo thật: cao = tổng chiều cao + gap, căn giữa nhánh (không step 90 cố định)
  const SUB_W = 160, SUB_H = 52, SUB_GAP = 12;
  const colH = (count) => count > 0 ? count * SUB_H + (count - 1) * SUB_GAP : 0;
  const maxColH = colH(maxSubs);
  // M12: ellipse gọn cho slide — co giãn theo số nhánh VÀ số con
  const RX = opts.rx ?? Math.max(280, 110 + n * 48);
  const RY = opts.ry ?? Math.max(200, 90 + n * 36 + maxColH / 2);
  branches.forEach((br, i) => {
    const label = typeof br === "string" ? br : br?.label || `Nhánh ${i + 1}`;
    const subs = normSubs[i];
    const angle = n === 1 ? -Math.PI / 2 : (2 * Math.PI * i) / n - Math.PI / 2;
    const bx = cx + RX * Math.cos(angle) - 85;
    const by = cy + RY * Math.sin(angle) - 30;
    const color = themeColors[i % themeColors.length];
    const b = nodeAt({ x: bx, y: by, w: 170, h: 60, text: label, fill: color, parentId: root.id, fontSize: 15 });
    objects.push(b);
    connectors.push(conn(root.id, b.id, "#64748b"));
    // Con xếp cột dọc đo thật, hướng ra ngoài (trái/phải), căn giữa nhánh.
    // Neo ngang (phải/trái) → đường nối đi ngang, không chéo xuyên hộp con khác.
    const dir = Math.cos(angle) >= 0 ? 1 : -1;
    const sx = dir > 0 ? bx + b.width + 56 : bx - 56 - SUB_W;
    const srcA = dir > 0 ? "right" : "left";
    const dstA = dir > 0 ? "left" : "right";
    let cursorY = by + b.height / 2 - colH(subs.length) / 2;
    subs.forEach((s) => {
      const sub = nodeAt({ x: sx, y: cursorY, w: SUB_W, h: SUB_H, text: String(s), fill: "#f8fafc", color: "#1e293b", parentId: b.id, fontSize: 14, bold: false });
      sub.stroke = color;
      sub.strokeWidth = 2;
      objects.push(sub);
      connectors.push(conn(b.id, sub.id, color, srcA, dstA));
      cursorY += SUB_H + SUB_GAP;
    });
  });
  // Fix #1: hộp con phình to đè lên nhánh khác → đẩy chỗ chồng xuống (giữ nguyên x và parentId)
  resolveOverlaps(objects);
  return { objects, connectors, rootId: root.id };
}

// Đẩy các hộp AABB chồng nhau ra — chỉ đẩy xuống dưới để giữ quan hệ ngang và connector.
// Connector tính lại động từ vị trí node nên kéo giãn theo, không hỏng dữ liệu.
export function resolveOverlaps(objects, gap = 24, maxPasses = 30) {
  const boxes = (Array.isArray(objects) ? objects : []).filter(
    (o) => o && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.width) && Number.isFinite(o.height),
  );
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    const order = [...boxes].sort((a, b) => a.y - b.y);
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j];
        if (b.y >= a.y + a.height + gap) break; // đã sort theo y → các hộp sau còn thấp hơn
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX > 0 && overlapY > 0) {
          b.y = a.y + a.height + gap;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return objects;
}

// Đo chồng lấn AABB (dương = đang chèn nhau)
export function overlapOf(a, b) {
  if (!a || !b) return null;
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (ox > 0 && oy > 0) return { ox, oy };
  return null;
}

// Dựng quan hệ cha-con (chống self-parent + cycle), thứ tự con ổn định theo vị trí đọc
function buildHierarchy(objs) {
  const byId = new Map(objs.map((o) => [o.id, o]));
  const childrenOf = new Map();
  objs.forEach((o) => {
    if (o && o.parentId && o.parentId !== o.id && byId.has(o.parentId)) {
      if (!childrenOf.has(o.parentId)) childrenOf.set(o.parentId, []);
      childrenOf.get(o.parentId).push(o.id);
    }
  });
  childrenOf.forEach((kids) => kids.sort((a, b) => {
    const A = byId.get(a), B = byId.get(b);
    return (A.y - B.y) || (A.x - B.x);
  }));
  const roots = objs
    .filter((o) => o && (!o.parentId || o.parentId === o.id || !byId.has(o.parentId)))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  // reachable: node tới được từ roots (guard cycle). Còn lại là mồ côi (cycle/self-loop)
  // → layout sẽ xếp hàng dự phòng riêng, không để tọa độ cũ đè lên cây mới.
  const reachable = new Set();
  {
    const queue = [];
    roots.forEach((r) => { reachable.add(r.id); queue.push(r.id); });
    while (queue.length) {
      const cur = queue.shift();
      for (const k of childrenOf.get(cur) || []) {
        if (reachable.has(k)) continue;
        reachable.add(k);
        queue.push(k);
      }
    }
  }
  return { byId, childrenOf, roots, reachable };
}

const laneW = (o) => Math.max(24, Number(o.width) || 120);
const laneH = (o) => Math.max(24, Number(o.height) || 48);

// Dịch cả subtree theo dx/dy (giữ nguyên quan hệ cha-con → không sinh chéo mới)
function shiftSubtree(rootId, dx, dy, byId, childrenOf) {
  const seen = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    const o = byId.get(cur);
    if (o) { o.x += dx; o.y += dy; }
    for (const k of childrenOf.get(cur) || []) {
      if (!seen.has(k)) { seen.add(k); stack.push(k); }
    }
  }
}

// Đặt cha về giữa các con (post-order từ sâu lên nông) — đường nối thẳng, không chéo.
// Bỏ qua node không có trong depth (mồ côi — xếp hàng dự phòng riêng sau cùng).
function recenterParents(objs, byId, childrenOf, depth, horizontal) {
  const order = [...objs]
    .filter((o) => depth.has(o.id))
    .sort((a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0));
  for (const o of order) {
    const kids = (childrenOf.get(o.id) || []).map((k) => byId.get(k)).filter(Boolean);
    if (!kids.length) continue;
    kids.sort((a, b) => horizontal ? (a.y - b.y) : (a.x - b.x));
    const first = kids[0], last = kids[kids.length - 1];
    if (horizontal) o.y = (first.y + last.y + laneH(last) - laneH(o)) / 2;
    else o.x = (first.x + last.x + laneW(last) - laneW(o)) / 2;
  }
}

// Neo đầu/cuối connector theo hướng layout — đường ra đúng phía,
// không vòng từ cạnh bên/từ dưới lên gây chéo nhau.
// Radial và đồ tự do giữ "auto".
export const LAYOUT_ANCHORS = {
  "tree-tb": { source: "bottom", target: "top" },
  "tree-bt": { source: "top", target: "bottom" },
  "tree-lr": { source: "right", target: "left" },
  "tree-rl": { source: "left", target: "right" },
  radial: { source: "auto", target: "auto" },
};

// Trả mảng connectors MỚI với anchor theo mode (không mutate input).
// Connector nối 2 node không còn tồn tại thì giữ nguyên.
export function applyLayoutAnchors(connectors, mode) {
  const a = LAYOUT_ANCHORS[mode];
  if (!a) return Array.isArray(connectors) ? connectors.map((c) => ({ ...c })) : [];
  return (Array.isArray(connectors) ? connectors : []).map((c) => ({
    ...c,
    sourceAnchor: a.source,
    targetAnchor: a.target,
  }));
}

// ─── Auto layout — chỉ chạy khi user chủ động bấm ───
// Chuẩn tidy-tree: đo kích thước THẬT từng node, làn theo tầng rộng nhất,
// các cây nối tiếp nhau (không reset cursor → không đè), mirror sau cùng.
export function autoLayout(objects, connectors, mode = "tree-tb", opts = {}) {
  const objs = (Array.isArray(objects) ? objects : []).map((o) => ({ ...o }));
  if (!objs.length) return objs;
  const { byId, childrenOf, roots, reachable } = buildHierarchy(objs);
  if (!roots.length) return objs;
  // Gap gọn để chụp slide đọc rõ chữ, vẫn đủ khe cho đường nối đi lọt
  const H_GAP = 48;
  const V_GAP = 36;

  if (mode === "radial") return layoutRadial(objs, byId, childrenOf, roots, reachable, opts);

  const horizontal = mode === "tree-lr" || mode === "tree-rl";
  const reverse = mode === "tree-rl" || mode === "tree-bt";

  // Depth từ roots (guard cycle: node đã thăm thì bỏ qua)
  const depth = new Map();
  {
    const queue = [];
    roots.forEach((r) => { depth.set(r.id, 0); queue.push(r.id); });
    const seen = new Set(queue);
    while (queue.length) {
      const cur = queue.shift();
      for (const k of childrenOf.get(cur) || []) {
        if (seen.has(k)) continue;
        seen.add(k);
        depth.set(k, depth.get(cur) + 1);
        queue.push(k);
      }
    }
    // Node mồ côi KHÔNG vào depth (xếp hàng dự phòng sau cùng, không đè cây mới)
  }
  const maxDepth = Math.max(0, ...depth.values());
  // Làn mỗi tầng = kích thước lớn nhất tầng đó + gap (đo thật, không fix 220/110)
  const laneSize = [];
  for (let d = 0; d <= maxDepth; d++) {
    let m = 0;
    objs.forEach((o) => {
      if (depth.get(o.id) === d) m = Math.max(m, horizontal ? laneW(o) : laneH(o));
    });
    laneSize[d] = Math.max(m, 48);
  }
  const laneStart = [140];
  for (let d = 1; d <= maxDepth; d++) {
    laneStart[d] = laneStart[d - 1] + laneSize[d - 1] + (horizontal ? H_GAP : V_GAP);
  }

  // C12: guard cycle — đệ quy có seen set, gặp cycle coi như lá
  const layoutSubtree = (id, d, cursor, seen = new Set()) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return cursor;
    seen.add(id);
    const kids = (childrenOf.get(id) || []).filter((k) => !seen.has(k));
    if (!kids.length) {
      if (horizontal) { node.x = laneStart[d]; node.y = cursor; }
      else { node.y = laneStart[d]; node.x = cursor; }
      return cursor + (horizontal ? laneH(node) : laneW(node)) + (horizontal ? V_GAP : H_GAP);
    }
    kids.forEach((k) => { cursor = layoutSubtree(k, d + 1, cursor, new Set(seen)); });
    const nodes = kids.map((k) => byId.get(k)).filter(Boolean);
    if (nodes.length) {
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (horizontal) {
        node.x = laneStart[d];
        node.y = (first.y + last.y + laneH(last) - laneH(node)) / 2;
      } else {
        node.y = laneStart[d];
        node.x = (first.x + last.x + laneW(last) - laneW(node)) / 2;
      }
    }
    return cursor;
  };
  // Cursor CHUNG cho mọi root (cây sau nối tiếp cây trước + khe thoáng) → rừng không đè nhau
  let cursor = 120;
  roots.forEach((r, ri) => {
    if (ri > 0) cursor += (horizontal ? V_GAP : H_GAP);
    cursor = layoutSubtree(r.id, 0, cursor);
  });

  // Tách chồng còn sót trong cùng tầng: đẩy cả subtree (giữ quan hệ),
  // rồi đặt cha về giữa các con → vừa hết chèn vừa hết chéo
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let d = 0; d <= maxDepth; d++) {
      const layer = objs
        .filter((o) => depth.get(o.id) === d)
        .sort((a, b) => horizontal ? (a.y - b.y) : (a.x - b.x));
      for (let i = 1; i < layer.length; i++) {
        const prev = layer[i - 1], cur = layer[i];
        const ov = overlapOf(prev, cur);
        if (!ov) continue;
        const gap = horizontal ? V_GAP : H_GAP;
        const push = (horizontal ? (prev.y + laneH(prev) + gap - cur.y) : (prev.x + laneW(prev) + gap - cur.x));
        if (push > 0) {
          if (horizontal) shiftSubtree(cur.id, 0, push, byId, childrenOf);
          else shiftSubtree(cur.id, push, 0, byId, childrenOf);
          moved = true;
        }
      }
    }
    if (!moved) break;
    recenterParents(objs, byId, childrenOf, depth, horizontal);
  }

  // Mirror quanh bounds MỚI của cây đã xếp (loại mồ côi) → rl/bt chuẩn, không lệch
  if (reverse) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    objs.forEach((o) => {
      if (!reachable.has(o.id)) return;
      minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x + laneW(o));
      minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y + laneH(o));
    });
    objs.forEach((o) => {
      if (!reachable.has(o.id)) return;
      if (horizontal) o.x = minX + maxX - o.x - laneW(o);
      else o.y = minY + maxY - o.y - laneH(o);
    });
  }
  // Hàng dự phòng cho node mồ côi: xếp ngang dưới cùng, khe thoáng, không đè cây mới
  stageOrphans(objs, reachable);
  return objs;
}

// Xếp node mồ côi (cycle/self-loop, không tới được từ roots) thành hàng ngang
// dưới bounds hiện tại — gọn, không đè, không văng khỏi màn hình.
function stageOrphans(objs, reachable) {
  const orphans = objs
    .filter((o) => o && !reachable.has(o.id))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  if (!orphans.length) return;
  let minX = Infinity, maxY = -Infinity;
  objs.forEach((o) => {
    if (!o || !reachable.has(o.id)) return;
    minX = Math.min(minX, o.x);
    maxY = Math.max(maxY, o.y + laneH(o));
  });
  if (!Number.isFinite(minX)) { minX = 140; maxY = 120; }
  let cx = minX;
  const cy = maxY + 64;
  orphans.forEach((o) => {
    o.x = cx; o.y = cy;
    cx += laneW(o) + 48;
  });
}

// Radial chuẩn thuyết trình: các mũi tên từ 1 cha CHIA GÓC ĐỀU NHAU,
// vòng tính theo cả SỐ CON (quạt đông vẫn tròn), tâm = giữa khung nhìn,
// tách chèn bằng đẩy kính + nới ring (giữ hình sao, không đẩy xuống).
function layoutRadial(objs, byId, childrenOf, roots, reachable, opts = {}) {
  // (3) Tâm = giữa viewport hiện tại (board đang nhìn đâu xếp ở đó), fallback tâm bảng
  const CX = Number(opts.cx) || 700;
  const CY = Number(opts.cy) || 420;
  // GAP khít để các khối gần nhau, chụp slide rõ — vẫn đủ khe tách hộp
  const GAP = 32;
  // (2) Bán kính tối thiểu theo hình học quạt: dây cung kề nhau đủ chỗ cho hộp rộng nhất
  // R ≥ (wMax + gap) / (2·sin(π/n)) → quạt đông tròn đều ngay từ đầu, khỏi chữa cháy
  const ringFor = (kids, base) => {
    if (!kids.length) return base;
    const maxKidW = Math.max(48, ...kids.map((k) => laneW(byId.get(k))));
    const n = kids.length;
    const geom = n > 1 ? (maxKidW + GAP) / (2 * Math.sin(Math.PI / n)) : 0;
    return Math.max(base, geom);
  };
  // Vòng 1 quanh tâm; vòng 2+ ôm quanh NODE CHA (cung hướng ra ngoài) → con cháu
  // gần cha thay vì trôi xa theo vòng đồng tâm. Góc chia đều trong cung.
  const maxHalf = (kids) => Math.max(0, ...kids.map((c) => {
    const cc = byId.get(c);
    return cc ? Math.max(laneW(cc), laneH(cc)) / 2 : 0;
  }));
  const maxWOf = (kids) => Math.max(48, ...kids.map((k) => laneW(byId.get(k))));
  const placeChildren = (cx, cy, kids, a0, a1, dist) => {
    if (!kids.length) return;
    dist = Math.max(dist, ringFor(kids, 0));
    const span = (a1 - a0) / kids.length;
    let a = a0;
    kids.forEach((kid) => {
      const mid = a + span / 2;
      const k = byId.get(kid);
      if (k) {
        k.x = cx + dist * Math.cos(mid) - laneW(k) / 2;
        k.y = cy + dist * Math.sin(mid) - laneH(k) / 2;
        const kk = childrenOf.get(kid) || [];
        if (kk.length) {
          // Cung quanh cha: tiếp nối tia tâm→cha (hướng ra ngoài), rộng vừa đủ dây cung
          const kc = { x: k.x + laneW(k) / 2, y: k.y + laneH(k) / 2 };
          const base = Math.atan2(kc.y - cy, kc.x - cx);
          const r2 = Math.max(laneW(k), laneH(k)) / 2 + GAP + maxHalf(kk);
          let s0 = base, s1 = base;
          if (kk.length > 1) {
            const step = 2 * Math.asin(Math.min(1, (maxWOf(kk) + GAP) / (2 * r2)));
            const spread = Math.min(Math.PI * 1.6, step * (kk.length - 1));
            s0 = base - spread / 2; s1 = base + spread / 2;
          }
          placeChildren(kc.x, kc.y, kk, s0, s1, r2);
        }
      }
      a += span;
    });
  };
  if (roots.length === 1) {
    const r = roots[0];
    r.x = CX - laneW(r) / 2;
    r.y = CY - laneH(r) / 2;
    const kids = childrenOf.get(r.id) || [];
    if (kids.length) {
      const firstRing = Math.max(laneW(r), laneH(r)) / 2 + GAP +
        Math.max(0, ...kids.map((c) => Math.max(laneW(byId.get(c)), laneH(byId.get(c))) / 2));
      placeChildren(CX, CY, kids, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, firstRing);
    }
  } else {
    // (4) Nhiều root: xếp hàng ngang ở giữa, fan mỗi root confined trong sector
    // riêng (chia nửa dưới theo tỉ lệ số con) → fan kề nhau không giao nhau
    let cursorX = CX - roots.reduce((s, r) => s + laneW(r) + GAP, -GAP) / 2;
    const topY = CY - 160;
    roots.forEach((r) => {
      r.x = cursorX; r.y = topY;
      cursorX += laneW(r) + GAP;
    });
    const fanRoots = roots.filter((r) => (childrenOf.get(r.id) || []).length);
    const totalW = fanRoots.reduce((s, r) => s + (childrenOf.get(r.id) || []).length, 0) || 1;
    let a = Math.PI * 0.15;
    const range = Math.PI * 0.7;
    fanRoots.forEach((r) => {
      const kids = childrenOf.get(r.id) || [];
      const span = (range * kids.length) / totalW;
      const ccx = r.x + laneW(r) / 2, ccy = r.y + laneH(r) / 2;
      const ring = Math.max(laneW(r), laneH(r)) / 2 + GAP +
        Math.max(0, ...kids.map((c) => Math.max(laneW(byId.get(c)), laneH(byId.get(c))) / 2));
      placeChildren(ccx, ccy, kids, a, a + span, ring);
      a += span;
    });
  }
  // Hàng dự phòng mồ côi đặt TRƯỚC vòng đẩy (làm vật cản, không bao giờ bị đẩy đi)
  stageRadialOrphans(objs, reachable, roots, CX, CY);
  // Đẩy kính tách chèn: node sâu/xa tâm hơn lùi ra ngoài theo hướng tâm → giữ hình sao.
  // Node mồ côi chỉ làm vật cản — node thường lùi ra, mồ côi không bao giờ văng.
  const depthOf = new Map();
  {
    const queue = [];
    roots.forEach((r) => { depthOf.set(r.id, 0); queue.push(r.id); });
    const seen = new Set(queue);
    while (queue.length) {
      const cur = queue.shift();
      for (const k of childrenOf.get(cur) || []) {
        if (seen.has(k)) continue;
        seen.add(k);
        depthOf.set(k, depthOf.get(cur) + 1);
        queue.push(k);
      }
    }
  }
  const anchorOf = (o) => {
    // tâm để đẩy kính: root đơn → tâm radial; nhiều root → tâm root gần nhất
    if (roots.length === 1) return { x: CX, y: CY };
    let best = null, bd = Infinity;
    for (const r of roots) {
      const d = Math.hypot(o.x - r.x, o.y - r.y);
      if (d < bd) { bd = d; best = r; }
    }
    const b = best || roots[0];
    return { x: b.x + laneW(b) / 2, y: b.y + laneH(b) / 2 };
  };
  const pushPasses = (count) => {
    let dirty = false;
    for (let pass = 0; pass < count; pass++) {
      dirty = false;
      for (let i = 0; i < objs.length; i++) {
        for (let j = i + 1; j < objs.length; j++) {
          const A = objs[i], B = objs[j];
          const aOrph = !reachable.has(A.id), bOrph = !reachable.has(B.id);
          if (aOrph && bOrph) continue; // hàng dự phòng đã xếp khít — bỏ qua
          const ov = overlapOf(A, B);
          if (!ov) continue;
          dirty = true;
          // Mồ côi không bao giờ là mover; còn lại đẩy node sâu/xa tâm hơn
          let mover;
          if (aOrph) mover = B;
          else if (bOrph) mover = A;
          else {
            const da = depthOf.get(A.id) ?? 0, db = depthOf.get(B.id) ?? 0;
            mover = B;
            if (da > db) mover = A;
            else if (da === db) {
              const anchor = anchorOf(B);
              const ma = Math.hypot(A.x - anchor.x, A.y - anchor.y);
              const mb = Math.hypot(B.x - anchor.x, B.y - anchor.y);
              if (ma > mb) mover = A;
            }
          }
          const anchor = anchorOf(mover);
          let vx = mover.x + laneW(mover) / 2 - anchor.x;
          let vy = mover.y + laneH(mover) / 2 - anchor.y;
          let len = Math.hypot(vx, vy);
          if (len < 1) { vx = 0; vy = 1; len = 1; }
          // Đẩy vừa đủ hết chèn + khe nhỏ (không hất văng xa như trước)
          const push = Math.max(ov.ox, ov.oy) + 10;
          shiftSubtree(mover.id, (vx / len) * push, (vy / len) * push, byId, childrenOf);
        }
      }
      if (!dirty) break;
    }
    return dirty;
  };
  let stillOverlap = pushPasses(40);
  // (5) Fallback giữ hình sao: nới ring (mọi node giãn khỏi tâm 25%, góc giữ nguyên)
  // rồi đẩy tiếp — tối đa 3 vòng, tuyệt đối không đẩy xuống.
  for (let round = 0; round < 3 && stillOverlap; round++) {
    for (const o of objs) {
      if (!reachable.has(o.id) || depthOf.get(o.id) === 0) continue;
      const anchor = anchorOf(o);
      const vx = o.x + laneW(o) / 2 - anchor.x;
      const vy = o.y + laneH(o) / 2 - anchor.y;
      const len = Math.hypot(vx, vy) || 1;
      // Nới nhẹ từng vòng (không phình 1 phát như trước)
      const grow = Math.max(24, len * 0.15);
      o.x += (vx / len) * grow;
      o.y += (vy / len) * grow;
    }
    stillOverlap = pushPasses(40);
  }
  return objs;
}

// Hàng dự phòng radial: mồ côi xếp ngang dưới hình sao (dưới bounds đã xếp),
// làm vật cản cho vòng đẩy — không văng, không đè.
function stageRadialOrphans(objs, reachable, roots, CX, CY) {
  const orphans = objs
    .filter((o) => o && !reachable.has(o.id))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  if (!orphans.length) return;
  let minX = Infinity, maxY = -Infinity;
  objs.forEach((o) => {
    if (!o || !reachable.has(o.id)) return;
    minX = Math.min(minX, o.x);
    maxY = Math.max(maxY, o.y + laneH(o));
  });
  if (!Number.isFinite(minX)) { minX = CX - 200; maxY = CY; }
  let cx = minX;
  const cy = maxY + 40;
  orphans.forEach((o) => {
    o.x = cx; o.y = cy;
    cx += laneW(o) + 32;
  });
}

// ─── Templates — tạo object thật, không phải ảnh nền ───
export function buildTemplate(kind, cx = 700, cy = 400) {
  switch (kind) {
    case "mindmap":
      return generateMindmap("Chủ đề chính", ["Nhánh 1", "Nhánh 2", "Nhánh 3", "Nhánh 4"], { cx, cy });
    case "tree": {
      // Nhánh cách 260, lá rộng 110 step 134 căn giữa nhánh → lá kề nhau và lá-nhánh kề không chèn
      const r = nodeAt({ x: cx - 90, y: cy - 160, w: 180, h: 60, text: "Gốc", fill: "#1d4ed8" });
      const kids = ["Nhánh A", "Nhánh B", "Nhánh C"].map((t, i) =>
        nodeAt({ x: cx - 345 + i * 260, y: cy, w: 170, h: 60, text: t, fill: PALETTES.tree[i % 5], parentId: r.id }),
      );
      const leaves = [];
      const conns = [];
      kids.forEach((k) => conns.push(conn(r.id, k.id, "#64748b", "bottom", "top")));
      kids.forEach((k, i) => {
        const centerX = k.x + k.width / 2;
        ["1", "2"].forEach((s, j) => {
          const leaf = nodeAt({ x: centerX - 122 + j * 134, y: cy + 140, w: 110, h: 48, text: `${k.text}.${s}`, fill: "#f8fafc", color: "#1e293b", parentId: k.id, bold: false, fontSize: 13 });
          leaf.stroke = PALETTES.tree[i % 5];
          leaf.strokeWidth = 2;
          leaves.push(leaf);
          conns.push(conn(k.id, leaf.id, PALETTES.tree[i % 5], "bottom", "top"));
        });
      });
      return { objects: [r, ...kids, ...leaves], connectors: conns, rootId: r.id };
    }
    case "process": {
      const steps = ["Bắt đầu", "Bước 1", "Bước 2", "Kết thúc"];
      const objects = steps.map((t, i) =>
        nodeAt({ x: cx - 360 + i * 200, y: cy - 30, w: 160, h: 60, text: t, fill: PALETTES.process[i % 5], parentId: i ? undefined : null }),
      );
      objects.forEach((o, i) => { if (i) o.parentId = objects[i - 1].id; });
      const connectors = objects.slice(1).map((o, i) => conn(objects[i].id, o.id, "#0ea5e9", "right", "left"));
      return { objects, connectors, rootId: objects[0].id };
    }
    case "timeline": {
      const steps = ["Giai đoạn 1", "Giai đoạn 2", "Giai đoạn 3", "Giai đoạn 4"];
      const objects = steps.map((t, i) =>
        nodeAt({ x: cx - 360 + i * 200, y: cy + (i % 2 ? 60 : -110), w: 160, h: 60, text: t, fill: "#f8fafc", color: "#1e293b", bold: false }),
      );
      objects.forEach((o) => { o.stroke = "#0ea5e9"; o.strokeWidth = 2; });
      const connectors = objects.slice(1).map((o, i) => conn(objects[i].id, o.id, "#0ea5e9", "right", "left"));
      return { objects, connectors, rootId: objects[0].id };
    }
    case "compare": {
      const a = nodeAt({ x: cx - 260, y: cy - 40, w: 200, h: 80, text: "Đối tượng A", fill: "#2563eb" });
      const b = nodeAt({ x: cx + 60, y: cy - 40, w: 200, h: 80, text: "Đối tượng B", fill: "#059669" });
      const mid = nodeAt({ x: cx - 100, y: cy + 120, w: 200, h: 64, text: "Điểm chung", fill: "#f59e0b", bold: false });
      return { objects: [a, b, mid], connectors: [conn(a.id, mid.id, "#64748b", "bottom", "top"), conn(b.id, mid.id, "#64748b", "bottom", "top")], rootId: a.id };
    }
    case "classify": {
      const r = nodeAt({ x: cx - 90, y: cy - 150, w: 180, h: 60, text: "Nhóm lớn", fill: "#7c3aed" });
      const kids = ["Loại 1", "Loại 2", "Loại 3"].map((t, i) =>
        nodeAt({ x: cx - 300 + i * 220, y: cy + 20, w: 170, h: 60, text: t, fill: PALETTES.pastel[i % 6], color: "#1e293b", parentId: r.id, bold: false }),
      );
      return { objects: [r, ...kids], connectors: kids.map((k) => conn(r.id, k.id, "#7c3aed", "bottom", "top")), rootId: r.id };
    }
    case "brainstorm": {
      const r = nodeAt({ x: cx - 90, y: cy - 36, w: 180, h: 72, text: "Ý tưởng trung tâm", fill: "#db2777" });
      const ideas = ["Ý tưởng 1", "Ý tưởng 2", "Ý tưởng 3", "Ý tưởng 4", "Ý tưởng 5", "Ý tưởng 6"].map((t, i) => {
        const a = (2 * Math.PI * i) / 6;
        return nodeAt({ x: cx + 310 * Math.cos(a) - 80, y: cy + 225 * Math.sin(a) - 26, w: 160, h: 52, text: t, fill: "#fdf2f8", color: "#831843", parentId: r.id, bold: false, fontSize: 14 });
      });
      return { objects: [r, ...ideas], connectors: ideas.map((k) => conn(r.id, k.id, "#db2777")), rootId: r.id };
    }
    case "lesson": {
      const r = nodeAt({ x: cx - 110, y: cy - 170, w: 220, h: 64, text: "Tên bài học", fill: "#1d4ed8" });
      const parts = ["Mục tiêu", "Hoạt động", "Luyện tập", "Đánh giá"].map((t, i) =>
        nodeAt({ x: cx - 370 + (i % 2) * 400, y: cy - 20 + Math.floor(i / 2) * 130, w: 180, h: 64, text: t, fill: PALETTES.pastel[(i + 1) % 6], color: "#1e293b", parentId: r.id, bold: false }),
      );
      return { objects: [r, ...parts], connectors: parts.map((k) => conn(r.id, k.id, "#64748b", "bottom", "top")), rootId: r.id };
    }
    default:
      return generateMindmap("Chủ đề", ["A", "B"], { cx, cy });
  }
}

export const TEMPLATES = [
  { id: "mindmap", label: "Mindmap" },
  { id: "tree", label: "Sơ đồ cây" },
  { id: "process", label: "Quy trình" },
  { id: "timeline", label: "Timeline" },
  { id: "compare", label: "So sánh" },
  { id: "classify", label: "Phân loại" },
  { id: "brainstorm", label: "Brainstorm" },
  { id: "lesson", label: "Sơ đồ bài học" },
];

// ─── Trang trí nhanh sơ đồ: theme màu 1-click + đánh số nhánh con ───
export const MINDMAP_THEMES = [
  { id: "vivid", label: "Rực rỡ", colors: ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"] },
  { id: "pastel", label: "Pastel", colors: ["#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd", "#67e8f9", "#f9a8d4", "#bef264"] },
  { id: "ocean", label: "Đại dương", colors: ["#1d4ed8", "#0ea5e9", "#0891b2", "#0d9488", "#6366f1", "#3b82f6", "#14b8a6", "#0284c7"] },
  { id: "earth", label: "Ấm áp", colors: ["#b45309", "#dc2626", "#d97706", "#059669", "#7c2d12", "#a16207", "#be123c", "#65a30d"] },
  { id: "sunset", label: "Hoàng hôn", colors: ["#ea580c", "#dc2626", "#db2777", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#b45309"] },
  { id: "forest", label: "Rừng xanh", colors: ["#166534", "#15803d", "#65a30d", "#0d9488", "#047857", "#4d7c0f", "#0f766e", "#16a34a"] },
  { id: "candy", label: "Kẹo ngọt", colors: ["#ec4899", "#f472b6", "#a78bfa", "#60a5fa", "#f59e0b", "#fb7185", "#c084fc", "#38bdf8"] },
  { id: "royal", label: "Hoàng gia", colors: ["#6d28d9", "#7c3aed", "#a855f7", "#4f46e5", "#9333ea", "#8b5cf6", "#6366f1", "#c084fc"] },
  { id: "neon", label: "Neon", colors: ["#16a34a", "#0284c7", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#65a30d", "#dc2626"] },
  { id: "mono", label: "Đơn sắc", colors: ["#1e3a8a", "#1e40af", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#0f766e", "#334155"] },
  { id: "autumn", label: "Mùa thu", colors: ["#9a3412", "#b45309", "#a16207", "#dc2626", "#ea580c", "#be123c", "#92400e", "#65a30d"] },
  { id: "spring", label: "Mùa xuân", colors: ["#15803d", "#65a30d", "#a16207", "#ec4899", "#14b8a6", "#4d7c0f", "#d97706", "#f472b6"] },
  { id: "berry", label: "Dâu chín", colors: ["#831843", "#9d174d", "#be185d", "#db2777", "#7c2d12", "#9a3412", "#a21caf", "#c026d3"] },
  { id: "slate", label: "Đá xám", colors: ["#0f172a", "#334155", "#475569", "#1e40af", "#0f766e", "#7c3aed", "#be123c", "#64748b"] },
  { id: "lagoon", label: "Đầm phá", colors: ["#0e7490", "#0891b2", "#06b6d4", "#14b8a6", "#10b981", "#0d9488", "#0284c7", "#0369a1"] },
  { id: "blossom", label: "Anh đào", colors: ["#db2777", "#ec4899", "#c026d3", "#f472b6", "#fb7185", "#a855f7", "#e11d48", "#f59e0b"] },
];

// Độ sáng tương đối (WCAG) để chọn chữ trắng hay chữ đậm trên nền màu — hết chữ trắng trên nền vàng đọc không nổi
function lumOf(hex) {
  const m = String(hex || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return 0;
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(m[1].substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function textOnFill(fill) {
  const L = lumOf(fill);
  const vsWhite = 1.05 / (L + 0.05);
  const vsDark = (L + 0.05) / (lumOf("#1e293b") + 0.05);
  return vsWhite >= vsDark ? "#ffffff" : "#1e293b";
}

// Tô màu cả nhánh (kể cả rootId): con trực tiếp nền đậm chữ trắng,
// sâu hơn nền nhạt viền màu, từ đời cháu thứ 2 trở đi nhỏ + nhạt hơn nữa.
// Trả mảng objects MỚI (không mutate). Theme lạ → trả nguyên bản.
export function applyBranchTheme(objects, rootId, themeId) {
  const theme = MINDMAP_THEMES.find((t) => t.id === themeId);
  if (!theme || !rootId) return objects;
  const list = Array.isArray(objects) ? objects : [];
  if (!list.some((o) => o && o.id === rootId)) return objects;
  const byId = new Map(list.map((o) => [o && o.id, o]));
  const childrenOf = new Map();
  for (const o of list) {
    if (o && o.parentId && byId.has(o.parentId)) {
      if (!childrenOf.has(o.parentId)) childrenOf.set(o.parentId, []);
      childrenOf.get(o.parentId).push(o.id);
    }
  }
  // depth từ root (guard cycle)
  const depth = new Map([[rootId, 0]]);
  const queue = [rootId];
  const seen = new Set([rootId]);
  while (queue.length) {
    const cur = queue.shift();
    for (const kid of childrenOf.get(cur) || []) {
      if (seen.has(kid)) continue;
      seen.add(kid);
      depth.set(kid, depth.get(cur) + 1);
      queue.push(kid);
    }
  }
  if (depth.size <= 1) return objects; // nhánh không có con — không làm gì
  const order = [];
  const walk = (id) => { order.push(id); for (const k of childrenOf.get(id) || []) if (depth.get(k) === depth.get(id) + 1) walk(k); };
  walk(rootId);
  const colorOf = (i) => theme.colors[i % theme.colors.length];
  let bi = 0;
  const branchColor = new Map(); // nhánh cấp 1 → màu
  for (const id of order) {
    if (depth.get(id) === 1 && !branchColor.has(id)) branchColor.set(id, colorOf(bi++));
  }
  const topColor = (id) => {
    let cur = id;
    const guard = new Set();
    while (cur && depth.get(cur) > 1 && !guard.has(cur)) { guard.add(cur); const o = byId.get(cur); cur = o && o.parentId; }
    return branchColor.get(cur) || theme.colors[0];
  };
  return list.map((o) => {
    if (!o || !depth.has(o.id)) return o;
    const d = depth.get(o.id);
    if (d === 0) return o; // giữ nguyên root
    const col = d === 1 ? branchColor.get(o.id) : topColor(o.id);
    if (d === 1) {
      return { ...o, fill: col, color: textOnFill(col), stroke: "transparent", strokeWidth: 0 };
    }
    if (d === 2) {
      return { ...o, fill: `${col}26`, color: "#1e293b", stroke: col, strokeWidth: 2 };
    }
    // d >= 3: nhánh nhỏ hơn nữa — nền nhạt hơn, viền mảnh, chữ nhỏ lại (tối thiểu 11px)
    return {
      ...o,
      fill: `${col}14`, color: "#475569", stroke: col, strokeWidth: 1,
      fontSize: Math.max(11, (Number(o.fontSize) || 14) - 2),
    };
  });
}

// Đánh số con trực tiếp của parentId ("1. ", "2. ") theo thứ tự y,x. Pure, không mutate.
export function numberBranchChildren(objects, parentId) {
  const list = Array.isArray(objects) ? objects : [];
  const kids = list
    .filter((o) => o && o.parentId === parentId)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  if (!kids.length) return objects;
  const numOf = new Map(kids.map((o, idx) => [o.id, idx + 1]));
  return list.map((o) => {
    if (!o || !numOf.has(o.id)) return o;
    const clean = String(o.text || "").replace(/^\s*\d+[.)]\s*/, "");
    return { ...o, text: `${numOf.get(o.id)}. ${clean}` };
  });
}

// ─── Chuẩn bị cho AI: ép output AI (tự do) thành nodes/connectors thật ───
// Giới hạn dùng chung cho cả service (normalize/local) lẫn engine (graph/apply)
export const PLAN_LIMITS = { topic: 200, branches: 10, children: 8, label: 120 };

// Trích nhãn từ giá trị AI trả (string | {label/name/text} | object lạ cấp 3).
// Không bao giờ trả "[object Object]" — object không nhãn thì ghép giá trị string con.
export function planLabelOf(v) {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const direct = String(v.label ?? v.name ?? v.text ?? "").trim();
    if (direct) return direct;
    const inner = Object.values(v)
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
    return inner.slice(0, 3).join(" — ");
  }
  return "";
}

// Phẳng hóa children (kể cả object cấp 3) thành mảng string sạch, giữ thứ tự.
export function flattenPlanChildren(children, max = PLAN_LIMITS.children) {
  const out = [];
  const push = (c) => {
    if (out.length >= max) return;
    if (typeof c === "string") {
      const s = c.trim();
      if (s) out.push(s.slice(0, PLAN_LIMITS.label));
      return;
    }
    if (c && typeof c === "object") {
      const s = planLabelOf(c);
      if (s) out.push(s.slice(0, PLAN_LIMITS.label));
      // cấp 3+: con của con thành nhãn riêng (giữ dữ liệu, không mất như trước)
      const subs = Array.isArray(c.children) ? c.children : [];
      for (const g of subs) {
        if (out.length >= max) break;
        const gs = typeof g === "string" ? g.trim() : planLabelOf(g);
        if (gs) out.push(gs.slice(0, PLAN_LIMITS.label));
      }
    }
  };
  (Array.isArray(children) ? children : []).slice(0, max * 3).forEach(push);
  return out.slice(0, max);
}

// Làm sạch plan sau khi user sửa trong preview: trim, bỏ rỗng, dedup, enforce giới hạn.
// Trả { plan: {topic, branches} | null, warnings: [], stats } — không tự bịa nhãn.
export function sanitizePlanForApply(plan) {
  const stats = { branches: 0, children: 0, droppedEmpty: 0, droppedDupe: 0, droppedOverflow: 0 };
  const warnings = [];
  if (!plan || typeof plan !== "object") {
    return { plan: null, warnings: ["Sơ đồ trống."], stats };
  }
  const topic = String(plan.topic || "").trim().slice(0, PLAN_LIMITS.topic);
  const rawList = Array.isArray(plan.branches) ? plan.branches : [];
  if (rawList.length > PLAN_LIMITS.branches) {
    stats.droppedOverflow += rawList.length - PLAN_LIMITS.branches;
  }
  const seen = new Set();
  const branches = [];
  for (const b of rawList.slice(0, PLAN_LIMITS.branches)) {
    const label = (typeof b === "string" ? b.trim() : planLabelOf(b)).slice(0, PLAN_LIMITS.label);
    if (!label) { stats.droppedEmpty++; continue; }
    const key = label.toLowerCase();
    if (seen.has(key)) { stats.droppedDupe++; continue; }
    seen.add(key);
    const cseen = new Set([key]);
    const children = [];
    for (const c of flattenPlanChildren(typeof b === "object" && b ? b.children : [])) {
      const ck = c.toLowerCase();
      if (cseen.has(ck)) { stats.droppedDupe++; continue; }
      cseen.add(ck);
      children.push(c);
    }
    branches.push({ label, children });
  }
  stats.branches = branches.length;
  stats.children = branches.reduce((s, b) => s + b.children.length, 0);
  if (stats.droppedEmpty) warnings.push(`Đã bỏ ${stats.droppedEmpty} nhánh/con trống.`);
  if (stats.droppedDupe) warnings.push(`Đã bỏ ${stats.droppedDupe} nhãn trùng lặp.`);
  if (stats.droppedOverflow) warnings.push(`Sơ đồ vượt giới hạn — chỉ giữ ${PLAN_LIMITS.branches} nhánh đầu.`);
  if (!topic) warnings.push("Chủ đề đang trống.");
  if (!branches.length) {
    warnings.push("Sơ đồ không còn nhánh nào có chữ sau khi làm sạch.");
    return { plan: null, warnings, stats };
  }
  return { plan: { topic, branches }, warnings, stats };
}

export function aiPlanToGraph(plan, cx = 700, cy = 420) {
  // plan: {topic, branches:[{label, children:[...]}]}
  if (!plan || typeof plan !== "object") return null;
  const topic = String(plan.topic || "").trim().slice(0, PLAN_LIMITS.topic);
  if (!topic) return null;
  const branches = [];
  for (const b of (Array.isArray(plan.branches) ? plan.branches : []).slice(0, PLAN_LIMITS.branches)) {
    const label = (typeof b === "string" ? b.trim() : planLabelOf(b)).slice(0, PLAN_LIMITS.label);
    if (!label) continue; // bỏ nhánh trống — không tự đặt "Nhánh" giả
    branches.push({ label, children: flattenPlanChildren(typeof b === "object" && b ? b.children : []) });
  }
  if (!branches.length) return null;
  return generateMindmap(topic, branches, { cx, cy });
}
