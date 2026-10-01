// ─── Mindmap engine: sinh node thật + auto-layout + templates ───
// Mọi hàm trả về {objects, connectors} với toạ độ x/y thật, parentId thật.

import { uid, blankObject } from "./whiteboardStore.js";

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

function conn(fromId, toId, color = "#64748b") {
  return { id: uid("c"), fromId, toId, type: "arrow", color, width: 2 };
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
  const RX = opts.rx ?? 330;
  const RY = opts.ry ?? 230;
  branches.forEach((br, i) => {
    const label = typeof br === "string" ? br : br?.label || `Nhánh ${i + 1}`;
    const subs = typeof br === "object" && Array.isArray(br.children) ? br.children : [];
    const angle = n === 1 ? -Math.PI / 2 : (2 * Math.PI * i) / n - Math.PI / 2;
    const bx = cx + RX * Math.cos(angle) - 85;
    const by = cy + RY * Math.sin(angle) - 30;
    const color = PALETTES.mindmap[i % PALETTES.mindmap.length];
    const b = nodeAt({ x: bx, y: by, w: 170, h: 60, text: label, fill: color, parentId: root.id, fontSize: 15 });
    objects.push(b);
    connectors.push(conn(root.id, b.id, "#64748b"));
    subs.forEach((s, j) => {
      const sx = bx + (Math.cos(angle) >= 0 ? 230 : -230);
      const sy = by + (j - (subs.length - 1) / 2) * 90;
      const sub = nodeAt({ x: sx, y: sy, w: 160, h: 52, text: String(s), fill: "#f8fafc", color: "#1e293b", parentId: b.id, fontSize: 14, bold: false });
      sub.stroke = color;
      sub.strokeWidth = 2;
      objects.push(sub);
      connectors.push(conn(b.id, sub.id, color));
    });
  });
  return { objects, connectors, rootId: root.id };
}

// ─── Auto layout — chỉ chạy khi user chủ động bấm ───
export function autoLayout(objects, connectors, mode = "tree-tb") {
  const objs = objects.map((o) => ({ ...o }));
  const byId = new Map(objs.map((o) => [o.id, o]));
  const childrenOf = new Map();
  objs.forEach((o) => {
    if (o.parentId && byId.has(o.parentId)) {
      if (!childrenOf.has(o.parentId)) childrenOf.set(o.parentId, []);
      childrenOf.get(o.parentId).push(o.id);
    }
  });
  const roots = objs.filter((o) => !o.parentId || !byId.has(o.parentId));
  if (!roots.length) return objs;
  const H_GAP = 60;
  const V_GAP = 40;

  const subtreeH = (id) => {
    const kids = childrenOf.get(id) || [];
    if (!kids.length) return byId.get(id).height;
    return kids.reduce((a, k) => a + subtreeH(k), 0) + V_GAP * (kids.length - 1);
  };

  if (mode === "radial") {
    const placeRadial = (parent, baseAngle, dist) => {
      (childrenOf.get(parent.id) || []).forEach((kid, i, arr) => {
        const a = baseAngle + (i - (arr.length - 1) / 2) * 0.55;
        const k = byId.get(kid);
        k.x = parent.x + parent.width / 2 + dist * Math.cos(a) - k.width / 2;
        k.y = parent.y + parent.height / 2 + dist * Math.sin(a) - k.height / 2;
        placeRadial(k, a, dist * 0.92);
      });
    };
    roots.forEach((r, ri) => {
      r.x = 700 - r.width / 2 + ri * 80;
      r.y = 420 - r.height / 2;
      const kids = childrenOf.get(r.id) || [];
      kids.forEach((kid, i) => {
        const angle = kids.length === 1 ? -Math.PI / 2 : (2 * Math.PI * i) / kids.length - Math.PI / 2;
        const k = byId.get(kid);
        k.x = r.x + r.width / 2 + 320 * Math.cos(angle) - k.width / 2;
        k.y = r.y + r.height / 2 + 220 * Math.sin(angle) - k.height / 2;
        placeRadial(k, angle, 230);
      });
    });
    return objs;
  }

  // Tree các hướng — không hard-code 1400/900, tính động theo bounds thực tế
  const horizontal = mode === "tree-lr" || mode === "tree-rl";
  const reverse = mode === "tree-rl" || mode === "tree-bt";
  // tính bounds để reverse động
  const allX = objs.map((o) => o.x), allY = objs.map((o) => o.y);
  const minX = Math.min(...allX, 0), maxX = Math.max(...allX.map((_, i) => objs[i].x + objs[i].width), 1200);
  const minY = Math.min(...allY, 0), maxY = Math.max(...allY.map((_, i) => objs[i].y + objs[i].height), 800);
  const spanX = Math.max(800, maxX - minX + 200);
  const spanY = Math.max(600, maxY - minY + 200);
  let cursor = 120;
  const layoutSubtree = (id, depth) => {
    const node = byId.get(id);
    const kids = childrenOf.get(id) || [];
    if (!kids.length) {
      if (horizontal) {
        node.x = 140 + depth * (220 + H_GAP);
        node.y = cursor;
        if (reverse) node.x = spanX - node.x - node.width + minX;
        cursor += node.height + V_GAP;
      } else {
        node.y = 120 + depth * (110 + V_GAP);
        node.x = cursor;
        if (reverse) node.y = spanY - node.y - node.height + minY;
        cursor += node.width + H_GAP;
      }
      return;
    }
    kids.forEach((k) => layoutSubtree(k, depth + 1));
    const first = byId.get(kids[0]);
    const last = byId.get(kids[kids.length - 1]);
    if (horizontal) {
      node.x = 140 + depth * (220 + H_GAP);
      node.y = (first.y + last.y + last.height - node.height) / 2;
      if (reverse) node.x = spanX - node.x - node.width + minX;
    } else {
      node.y = 120 + depth * (110 + V_GAP);
      node.x = (first.x + last.x + last.width - node.width) / 2;
      if (reverse) node.y = spanY - node.y - node.height + minY;
    }
  };
  roots.forEach((r) => {
    cursor = 120;
    layoutSubtree(r.id, 0);
  });
  return objs;
}

// ─── Templates — tạo object thật, không phải ảnh nền ───
export function buildTemplate(kind, cx = 700, cy = 400) {
  switch (kind) {
    case "mindmap":
      return generateMindmap("Chủ đề chính", ["Nhánh 1", "Nhánh 2", "Nhánh 3", "Nhánh 4"], { cx, cy });
    case "tree": {
      const r = nodeAt({ x: cx - 90, y: cy - 160, w: 180, h: 60, text: "Gốc", fill: "#1d4ed8" });
      const kids = ["Nhánh A", "Nhánh B", "Nhánh C"].map((t, i) =>
        nodeAt({ x: cx - 300 + i * 220, y: cy, w: 170, h: 60, text: t, fill: PALETTES.tree[i % 5], parentId: r.id }),
      );
      const leaves = [];
      const conns = [];
      kids.forEach((k) => conns.push(conn(r.id, k.id)));
      kids.forEach((k, i) => {
        ["1", "2"].forEach((s, j) => {
          const leaf = nodeAt({ x: k.x + j * 90 - 40, y: cy + 140, w: 120, h: 48, text: `${k.text}.${s}`, fill: "#f8fafc", color: "#1e293b", parentId: k.id, bold: false, fontSize: 13 });
          leaf.stroke = PALETTES.tree[i % 5];
          leaf.strokeWidth = 2;
          leaves.push(leaf);
          conns.push(conn(k.id, leaf.id, PALETTES.tree[i % 5]));
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
      const connectors = objects.slice(1).map((o, i) => conn(objects[i].id, o.id, "#0ea5e9"));
      return { objects, connectors, rootId: objects[0].id };
    }
    case "timeline": {
      const steps = ["Giai đoạn 1", "Giai đoạn 2", "Giai đoạn 3", "Giai đoạn 4"];
      const objects = steps.map((t, i) =>
        nodeAt({ x: cx - 360 + i * 200, y: cy + (i % 2 ? 60 : -110), w: 160, h: 60, text: t, fill: "#f8fafc", color: "#1e293b", bold: false }),
      );
      objects.forEach((o) => { o.stroke = "#0ea5e9"; o.strokeWidth = 2; });
      const connectors = objects.slice(1).map((o, i) => conn(objects[i].id, o.id, "#0ea5e9"));
      return { objects, connectors, rootId: objects[0].id };
    }
    case "compare": {
      const a = nodeAt({ x: cx - 260, y: cy - 40, w: 200, h: 80, text: "Đối tượng A", fill: "#2563eb" });
      const b = nodeAt({ x: cx + 60, y: cy - 40, w: 200, h: 80, text: "Đối tượng B", fill: "#059669" });
      const mid = nodeAt({ x: cx - 100, y: cy + 120, w: 200, h: 64, text: "Điểm chung", fill: "#f59e0b", bold: false });
      return { objects: [a, b, mid], connectors: [conn(a.id, mid.id), conn(b.id, mid.id)], rootId: a.id };
    }
    case "classify": {
      const r = nodeAt({ x: cx - 90, y: cy - 150, w: 180, h: 60, text: "Nhóm lớn", fill: "#7c3aed" });
      const kids = ["Loại 1", "Loại 2", "Loại 3"].map((t, i) =>
        nodeAt({ x: cx - 300 + i * 220, y: cy + 20, w: 170, h: 60, text: t, fill: PALETTES.pastel[i % 6], color: "#1e293b", parentId: r.id, bold: false }),
      );
      return { objects: [r, ...kids], connectors: kids.map((k) => conn(r.id, k.id, "#7c3aed")), rootId: r.id };
    }
    case "brainstorm": {
      const r = nodeAt({ x: cx - 90, y: cy - 36, w: 180, h: 72, text: "Ý tưởng trung tâm", fill: "#db2777" });
      const ideas = ["Ý tưởng 1", "Ý tưởng 2", "Ý tưởng 3", "Ý tưởng 4", "Ý tưởng 5", "Ý tưởng 6"].map((t, i) => {
        const a = (2 * Math.PI * i) / 6;
        return nodeAt({ x: cx + 300 * Math.cos(a) - 80, y: cy + 200 * Math.sin(a) - 26, w: 160, h: 52, text: t, fill: "#fdf2f8", color: "#831843", parentId: r.id, bold: false, fontSize: 14 });
      });
      return { objects: [r, ...ideas], connectors: ideas.map((k) => conn(r.id, k.id, "#db2777")), rootId: r.id };
    }
    case "lesson": {
      const r = nodeAt({ x: cx - 110, y: cy - 170, w: 220, h: 64, text: "Tên bài học", fill: "#1d4ed8" });
      const parts = ["Mục tiêu", "Hoạt động", "Luyện tập", "Đánh giá"].map((t, i) =>
        nodeAt({ x: cx - 370 + (i % 2) * 400, y: cy - 20 + Math.floor(i / 2) * 130, w: 180, h: 64, text: t, fill: PALETTES.pastel[(i + 1) % 6], color: "#1e293b", parentId: r.id, bold: false }),
      );
      return { objects: [r, ...parts], connectors: parts.map((k) => conn(r.id, k.id)), rootId: r.id };
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

// ─── Chuẩn bị cho AI: ép output AI (tự do) thành nodes/connectors thật ───
export function aiPlanToGraph(plan, cx = 700, cy = 420) {
  // plan: {topic, branches:[{label, children:[...]}]}
  if (!plan || typeof plan !== "object") return null;
  const topic = String(plan.topic || "Chủ đề").slice(0, 200);
  const branches = (Array.isArray(plan.branches) ? plan.branches : []).slice(0, 10).map((b) =>
    typeof b === "string"
      ? b.slice(0, 120)
      : { label: String(b.label || "Nhánh").slice(0, 120), children: (Array.isArray(b.children) ? b.children : []).slice(0, 8).map((c) => String(c).slice(0, 120)) },
  );
  return generateMindmap(topic, branches, { cx, cy });
}
