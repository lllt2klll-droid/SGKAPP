// ─── WhiteboardCanvas — SVG engine: drag / resize / multi-select / connector / pen / zoom ───
// Node là object thật {x,y,width,height,parentId}, connector tính lại từ vị trí node mỗi render.

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { ensureFits } from "./whiteboardStore.js";

const GRID = 20;
const SNAP_DIST = 7;

function centerOf(o) {
  return { x: o.x + o.width / 2, y: o.y + o.height / 2 };
}

// Điểm neo trên biên node — hỗ trợ anchor top/right/bottom/left/auto
function edgePoint(node, tx, ty, anchor = "auto") {
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

function connectorGeom(a, b, type, sourceAnchor = "auto", targetAnchor = "auto") {
  if (!a || !b) return null;
  const ca = centerOf(a);
  const cb = centerOf(b);
  const p1 = edgePoint(a, cb.x, cb.y, sourceAnchor);
  const p2 = edgePoint(b, ca.x, ca.y, targetAnchor);
  if (type === "elbow") {
    const midX = (p1.x + p2.x) / 2;
    return { d: `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`, end: p2, endAngle: p2.x >= midX ? 0 : 180 };
  }
  const ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, end: p2, endAngle: ang };
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

// Tách text thành dòng vừa chiều rộng node (giữ SVG thuần để export PNG/SVG/PDF đúng)
function wrapLines(text, width, fontSize) {
  const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.62)));
  const out = [];
  String(text || "").split("\n").forEach((para) => {
    if (!para) { out.push(""); return; }
    const words = para.split(/\s+/);
    let line = "";
    words.forEach((w) => {
      const cand = line ? line + " " + w : w;
      if (cand.length > maxChars && line) { out.push(line); line = w; }
      else line = cand;
    });
    out.push(line);
  });
  return out.slice(0, 24);
}

function ShapeBody({ o }) {
  const { width: w, height: h } = o;
  const common = { fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, ...(o.strokeDash ? { strokeDasharray: o.strokeDash } : {}) };
  switch (o.shape) {
    case "rect":
      return <rect x={0} y={0} width={w} height={h} {...common} />;
    case "circle": {
      const r = Math.min(w, h) / 2;
      return <circle cx={w / 2} cy={h / 2} r={r} {...common} />;
    }
    case "ellipse":
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case "diamond":
      return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...common} />;
    case "triangle":
      return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...common} />;
    case "rounded":
    default:
      return <rect x={0} y={0} width={w} height={h} rx={12} {...common} />;
  }
}

function NodeText({ o }) {
  if (!o.text) return null;
  const lines = wrapLines(o.text, o.width - 16, o.fontSize);
  const lh = o.fontSize * 1.3;
  const startY = o.height / 2 - ((lines.length - 1) * lh) / 2;
  const anchor = o.align === "left" ? "start" : o.align === "right" ? "end" : "middle";
  const tx = o.align === "left" ? 8 : o.align === "right" ? o.width - 8 : o.width / 2;
  return (
    <text
      x={tx}
      y={startY}
      textAnchor={anchor}
      fontSize={o.fontSize}
      fontWeight={o.bold ? 700 : 400}
      fontStyle={o.italic ? "italic" : "normal"}
      fill={o.color}
      style={{ userSelect: "none", pointerEvents: "none" }}
    >
      {lines.map((ln, i) => (
        <tspan key={i} x={tx} dy={i === 0 ? 0 : lh} dominantBaseline="middle">
          {ln || " "}
        </tspan>
      ))}
    </text>
  );
}

const HANDLE_CURSORS = { nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize" };

export default function WhiteboardCanvas(props) {
  const {
    objects, connectors, tool, shapeType, connectorType, penColor, penWidth,
    selection, onSelectionChange, onObjects, onConnectors, onCheckpoint,
    zoom, pan, onViewport, grid, snap, smartAlign, smartSpacing, branchDrag, collapsedMap, requestEditId, onEditHandled, svgRef, onNotify,
  } = props;
  const effectiveSmart = smartAlign || smartSpacing;

  const wrapRef = useRef(null);
  const pointersRef = useRef(new Map());
  const dragRef = useRef(null);
  const [marquee, setMarquee] = useState(null);
  const [tempConn, setTempConn] = useState(null);
  const [guides, setGuides] = useState([]);
  const [dropTarget, setDropTarget] = useState(null);
  const [editing, setEditing] = useState(null); // {id, text}
  const [spaceDown, setSpaceDown] = useState(false);
  const [penDraft, setPenDraft] = useState(null);
  const pinchRef = useRef(null);
  const lastClickRef = useRef({ id: null, time: 0 });
  const nodesRef = useRef(new Map());
  const connsRef = useRef(new Map());
  const rafRef = useRef(null);
  const pendingDomRef = useRef(null);

  // Kích hoạt edit từ context menu (Sửa thực sự mở editor, không fake double-click)
  useEffect(() => {
    if (!requestEditId) return;
    const target = objects.find((o) => o.id === requestEditId);
    if (target && target.kind !== "stroke" && target.kind !== "image" && !target.locked) {
      setEditing({ id: target.id, text: target.text || "" });
    }
    onEditHandled?.();
  }, [requestEditId]);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const toWorld = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  }, [pan, zoom, svgRef]);

  const toScreen = useCallback((wx, wy) => ({ x: wx * zoom + pan.x, y: wy * zoom + pan.y }), [zoom, pan]);

  // ── Space để pan tạm ──
  useEffect(() => {
    const dn = (e) => {
      const t = document.activeElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.code === "Space" && !typing) { setSpaceDown(true); }
    };
    const up = (e) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // ── Wheel: Ctrl/Cmd + wheel = zoom (pinch), còn lại = pan (2 ngón kéo) ──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isZoomGesture = e.ctrlKey || e.metaKey;
      if (!isZoomGesture) {
        // Pan bằng trackpad 2 ngón
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
        else if (e.deltaMode === 2) { dx *= 100; dy *= 100; }
        onViewport(zoom, { x: pan.x - dx, y: pan.y - dy });
        return;
      }
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nz = Math.min(3, Math.max(0.2, zoom * factor));
      const wx = (mx - pan.x) / zoom;
      const wy = (my - pan.y) / zoom;
      onViewport(nz, { x: mx - wx * nz, y: my - wy * nz });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoom, pan, onViewport, svgRef]);

  const applySnap = useCallback((v) => (snap ? Math.round(v / GRID) * GRID : v), [snap]);

  // ── Smart alignment: so tâm/cạnh với node khác ──
  const computeGuides = useCallback((moving, others) => {
    if (!effectiveSmart) return { dx: 0, dy: 0, guides: [] };
    const mc = centerOf(moving);
    const candX = [mc.x, moving.x, moving.x + moving.width];
    const candY = [mc.y, moving.y, moving.y + moving.height];
    let bestDX = 0; let bestDY = 0; let bx = Infinity; let by = Infinity;
    const guides = [];
    others.forEach((o) => {
      const oc = centerOf(o);
      const oxs = [oc.x, o.x, o.x + o.width];
      const oys = [oc.y, o.y, o.y + o.height];
      candX.forEach((cx, ci) => {
        oxs.forEach((ox, oi) => {
          const d = ox - cx;
          if (Math.abs(d) < Math.abs(bx) && Math.abs(d) < SNAP_DIST / zoom + 4) { bx = d; guides._x = { v: ox, ci, oi }; }
        });
      });
      candY.forEach((cy, ci) => {
        oys.forEach((oy, oi) => {
          const d = oy - cy;
          if (Math.abs(d) < Math.abs(by) && Math.abs(d) < SNAP_DIST / zoom + 4) { by = d; guides._y = { v: oy, ci, oi }; }
        });
      });
    });
    const lines = [];
    if (Number.isFinite(bx)) { bestDX = bx; lines.push({ axis: "v", v: guides._x.v }); }
    if (Number.isFinite(by)) { bestDY = by; lines.push({ axis: "h", v: guides._y.v }); }
    return { dx: bestDX, dy: bestDY, guides: lines };
  }, [effectiveSmart, zoom]);

  // ── Di chuyển 1 cụm (node kéo + selection/group/branch) ──
  const collectDescendants = useCallback((rootId) => {
    const out = new Set([rootId]);
    const stack = [rootId];
    const childrenMap = new Map();
    objects.forEach((o) => {
      if (o.parentId) {
        if (!childrenMap.has(o.parentId)) childrenMap.set(o.parentId, []);
        childrenMap.get(o.parentId).push(o.id);
      }
    });
    while (stack.length) {
      const cur = stack.pop();
      const kids = childrenMap.get(cur) || [];
      kids.forEach((k) => {
        if (!out.has(k)) { out.add(k); stack.push(k); }
      });
    }
    return [...out];
  }, [objects]);

  const moveSetFor = useCallback((targetId) => {
    const t = byId.get(targetId);
    if (!t) return [targetId];
    if (t.locked) return []; // không drag object bị khóa
    // branch-drag: nếu bật và target là node có con, kéo cả nhánh
    if (branchDrag && t.kind === "node") {
      const branch = collectDescendants(targetId);
      // nếu selection chứa target, hợp nhất cả selection + branch
      if (selSet.has(targetId) && selection.length > 1) {
        const set = new Set(branch);
        selection.forEach((id) => {
          if (byId.get(id)?.kind === "node" && branchDrag) collectDescendants(id).forEach((d) => set.add(d));
          else set.add(id);
        });
        return [...set];
      }
      return branch;
    }
    if (selSet.has(targetId)) {
      const ids = new Set(selection);
      objects.forEach((o) => {
        if (o.groupId && selection.some((s) => byId.get(s)?.groupId === o.groupId)) ids.add(o.id);
      });
      return [...ids].filter((id) => !byId.get(id)?.locked);
    }
    if (t.groupId) return objects.filter((o) => o.groupId === t.groupId && !o.locked).map((o) => o.id);
    return [targetId];
  }, [byId, selSet, selection, objects, branchDrag, collectDescendants]);

  const flushDomMove = useCallback((idSet, nextMap) => {
    // cập nhật DOM trực tiếp cho khối và mũi tên — không chờ React, không trễ
    idSet.forEach((id) => {
      const el = nodesRef.current.get(id);
      const pos = nextMap.get(id);
      if (el && pos) el.setAttribute("transform", `translate(${pos.x},${pos.y})`);
    });
    // cập nhật connector path trực tiếp
    connectors.forEach((c) => {
      if (!idSet.has(c.fromId) && !idSet.has(c.toId)) return;
      const a = nextMap.get(c.fromId) ? { ...byId.get(c.fromId), ...nextMap.get(c.fromId) } : byId.get(c.fromId);
      const b = nextMap.get(c.toId) ? { ...byId.get(c.toId), ...nextMap.get(c.toId) } : byId.get(c.toId);
      if (!a || !b) return;
      const g = connectorGeom(a, b, c.type, c.sourceAnchor, c.targetAnchor);
      const el = connsRef.current.get(c.id);
      if (el && g) el.setAttribute("d", g.d);
    });
  }, [byId, connectors]);

  const endDragCommon = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    pendingDomRef.current = null;
    setGuides([]);
    setDropTarget(null);
    setMarquee(null);
    setTempConn(null);
    setPenDraft(null);
    dragRef.current = null;
  }, []);

  // ── Pointer down trên node ──
  const onNodePointerDown = (e, o) => {
    if (e.button === 2) return; // right click → context menu, không kéo
    // bấm đúp chuột trái 2 lần vào ô để sửa — xử lý ngay trong pointerDown để tránh drag đè lên dblclick
    if (e.button === 0 && o.kind !== "stroke" && o.kind !== "image" && !o.locked) {
      const now = Date.now();
      if (lastClickRef.current.id === o.id && now - lastClickRef.current.time < 320) {
        e.stopPropagation();
        lastClickRef.current = { id: null, time: 0 };
        setEditing({ id: o.id, text: o.text || "" });
        try { svgRef.current?.releasePointerCapture?.(e.pointerId); } catch {}
        pointersRef.current.clear();
        dragRef.current = null;
        return;
      }
      lastClickRef.current = { id: o.id, time: now };
    }
    if (o.locked) { e.stopPropagation(); onNotify?.("Đã khóa — mở khóa để chỉnh"); return; }
    if (e.button === 1) return; // middle -> pan (xử lý ở svg)
    const svg = svgRef.current;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const r = svg.getBoundingClientRect();
      const wx = (mx - r.left - pan.x) / zoom;
      const wy = (my - r.top - pan.y) / zoom;
      pinchRef.current = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom, pan: { ...pan }, mx, my, wx, wy, rectLeft: r.left, rectTop: r.top, mode: null, startMx: mx, startMy: my, startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
      dragRef.current = { mode: "pinch" };
      return;
    }
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);

    if (tool === "connector") {
      dragRef.current = { mode: "draw-conn", fromId: o.id, cur: w };
      setTempConn({ fromId: o.id, cur: w });
      return;
    }
    if (tool === "mind") {
      // click node trong chế độ Mind: thêm node con + nối
      props.onMindAdd?.(o);
      return;
    }
    if (tool !== "select") return;

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let sel = selection;
    if (additive) {
      sel = selSet.has(o.id) ? selection.filter((s) => s !== o.id) : [...selection, o.id];
      onSelectionChange(sel);
    } else if (!selSet.has(o.id)) {
      sel = [o.id];
      onSelectionChange(sel);
    }
    let moveIds = (() => {
      if (additive) return moveSetFor(o.id);
      if (!selSet.has(o.id) && !additive) return moveSetFor(o.id);
      return moveSetFor(o.id);
    })();
    void sel;
    const isDuplicate = (e.altKey || e.ctrlKey || e.metaKey) && moveIds.length && !o.locked;
    if (moveIds.length && !isDuplicate) onCheckpoint();
    dragRef.current = {
      mode: "move", ids: moveIds, startW: w, checkpointed: !isDuplicate,
      orig: new Map(moveIds.map((id) => [id, { x: byId.get(id)?.x || 0, y: byId.get(id)?.y || 0 }])),
      pendingNext: null,
      isDuplicate,
      hasDuplicated: false,
      origMoveIds: [...moveIds],
    };
  };

  // ── Pointer down trên nền SVG ──
  const onSvgPointerDown = (e) => {
    if (e.button === 2) return; // right click → context menu
    const svg = svgRef.current;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const r = svg.getBoundingClientRect();
      const wx = (mx - r.left - pan.x) / zoom;
      const wy = (my - r.top - pan.y) / zoom;
      pinchRef.current = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom, pan: { ...pan }, mx, my, wx, wy, rectLeft: r.left, rectTop: r.top, mode: null, startMx: mx, startMy: my, startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
      dragRef.current = { mode: "pinch" };
      return;
    }
    if (e.button === 1 || tool === "pan" || spaceDown) {
      dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, pan: { ...pan } };
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (tool === "select") {
      dragRef.current = { mode: "marquee", start: w, additive: e.shiftKey || e.ctrlKey || e.metaKey };
      setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
    } else if (tool === "pen") {
      onCheckpoint();
      const stroke = {
        id: `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "stroke", parentId: null, groupId: null,
        x: w.x, y: w.y, width: 1, height: 1,
        points: [{ x: 0, y: 0 }], penColor, penWidth,
        text: "", shape: "rounded", fill: "transparent", stroke: penColor, strokeWidth: penWidth,
        color: penColor, fontSize: 14, bold: false, italic: false, align: "center", src: null,
      };
      dragRef.current = { mode: "pen", id: stroke.id, checkpointed: true };
      onObjects([...objects, stroke], false);
      setPenDraft(stroke.id);
    } else if (tool === "eraser") {
      // Xóa nét vẽ dưới con trỏ (không xóa node)
      const hit = [...objects].reverse().find((o) => o.kind === "stroke" && strokeHit(o, w, 10 / zoom));
      if (hit) {
        onCheckpoint();
        onObjects(objects.filter((o) => o.id !== hit.id), true);
        onNotify?.("Đã xóa nét vẽ");
      }
    } else if (tool === "text" || tool === "shape" || tool === "note" || tool === "mind") {
      props.onCanvasClick?.(w, tool);
    } else if (tool === "image") {
      onNotify?.("Bấm nút 🖼 Ảnh trên thanh công cụ để tải ảnh lên");
    }
  };

  function strokeHit(o, w, tol) {
    const pts = o.points || [];
    const p = { x: w.x - o.x, y: w.y - o.y };
    for (let i = 0; i + 1 < pts.length; i++) {
      if (distToSeg(p, pts[i], pts[i + 1]) < tol) return true;
    }
    if (pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < tol) return true;
    return false;
  }

  const onSvgPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "pinch") {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2 || !pinchRef.current) return;
      const nd = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const curMx = (pts[0].x + pts[1].x) / 2;
      const curMy = (pts[0].y + pts[1].y) / 2;
      const startDist = pinchRef.current.startDist || pinchRef.current.d;
      const startMx = pinchRef.current.startMx ?? pinchRef.current.mx;
      const startMy = pinchRef.current.startMy ?? pinchRef.current.my;
      const distDelta = Math.abs(nd - startDist);
      const ratio = nd / (startDist || 1);
      // Phân biệt pan vs zoom: 2 ngón kéo song song => pan, chụm/mở ngược chiều => zoom
      if (!pinchRef.current.mode) {
        if (distDelta > 12 || Math.abs(ratio - 1) > 0.08) pinchRef.current.mode = "zoom";
        else if (Math.hypot(curMx - startMx, curMy - startMy) > 4) pinchRef.current.mode = "pan";
        else return;
      }
      if (pinchRef.current.mode === "pan") {
        const dx = curMx - startMx;
        const dy = curMy - startMy;
        onViewport(zoom, { x: pinchRef.current.pan.x + dx, y: pinchRef.current.pan.y + dy });
        return;
      }
      const nz = Math.min(3, Math.max(0.2, pinchRef.current.zoom * (nd / (pinchRef.current.d || 1))));
      const { wx, wy } = pinchRef.current;
      const svg = svgRef.current;
      const r = svg ? svg.getBoundingClientRect() : { left: pinchRef.current.rectLeft, top: pinchRef.current.rectTop };
      const newPan = { x: curMx - r.left - wx * nz, y: curMy - r.top - wy * nz };
      onViewport(nz, newPan);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.mode === "pan") {
      onViewport(zoom, { x: d.pan.x + (e.clientX - d.sx), y: d.pan.y + (e.clientY - d.sy) });
      return;
    }
    if (d.mode === "marquee") {
      setMarquee({ x0: d.start.x, y0: d.start.y, x1: w.x, y1: w.y });
      return;
    }
    if (d.mode === "move") {
      // Shift + kéo → khóa trục (như PPT), Ctrl/Alt + kéo → nhân bản
      const isShift = e.shiftKey;
      const dx = w.x - d.startW.x;
      const dy = w.y - d.startW.y;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      pendingDomRef.current = { dx, dy, w, shiftKey: isShift };
      rafRef.current = requestAnimationFrame(() => {
        const cur = pendingDomRef.current;
        if (!cur || dragRef.current?.mode !== "move") return;
        // Ctrl/Alt + kéo lần đầu → nhân bản
        if (d.isDuplicate && !d.hasDuplicated) {
          const dupMap = new Map();
          const toDup = d.origMoveIds.map((id) => byId.get(id)).filter(Boolean);
          const newObjs = toDup.map((orig) => {
            const nid = `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}_${orig.id.slice(-4)}`;
            dupMap.set(orig.id, nid);
            return { ...orig, id: nid, groupId: null };
          });
          const finalNewObjs = newObjs.map((no) => {
            const origId = [...dupMap.entries()].find(([,v]) => v===no.id)?.[0];
            const orig = byId.get(origId);
            const np = orig?.parentId ? dupMap.get(orig.parentId) || null : null;
            return { ...no, parentId: np };
          });
          const newConns = connectors.filter((c) => dupMap.has(c.fromId) && dupMap.has(c.toId)).map((c) => ({ ...c, id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,4)}`, fromId: dupMap.get(c.fromId), toId: dupMap.get(c.toId) }));
          onCheckpoint();
          onObjects([...objects, ...finalNewObjs], false);
          if (newConns.length) onConnectors([...connectors, ...newConns], false);
          onSelectionChange(finalNewObjs.map((o) => o.id));
          // cập nhật dragRef để kéo bản sao
          d.ids = finalNewObjs.map((o) => o.id);
          d.orig = new Map(finalNewObjs.map((o) => [o.id, { x: o.x, y: o.y }]));
          d.hasDuplicated = true;
          d.checkpointed = true;
          // reset dx/dy cho bản sao (bắt đầu từ vị trí gốc)
          pendingDomRef.current = { dx: cur.dx, dy: cur.dy, w: cur.w, shiftKey: cur.shiftKey };
          // tiếp tục với id mới ở frame tiếp theo
          return;
        }
        let curDx = cur.dx, curDy = cur.dy;
        // Shift khóa trục
        if (cur.shiftKey) {
          if (Math.abs(curDx) > Math.abs(curDy)) curDy = 0;
          else curDx = 0;
        }
        const idSet = new Set(d.ids);
        const others = objects.filter((o) => !idSet.has(o.id) && o.kind !== "stroke");
        let fdx = curDx, fdy = curDy, gl = [];
        if (d.ids.length === 1) {
          const m0 = d.orig.get(d.ids[0]);
          const trial = { ...byId.get(d.ids[0]), x: m0.x + curDx, y: m0.y + curDy };
          const r = computeGuides(trial, others);
          fdx = curDx + r.dx; fdy = curDy + r.dy; gl = r.guides;
          if (cur.shiftKey) {
            if (Math.abs(fdx) > Math.abs(fdy)) fdy = 0;
            else fdx = 0;
            gl = [];
          }
        } else if (cur.shiftKey) {
          if (Math.abs(curDx) > Math.abs(curDy)) fdy = 0;
          else fdx = 0;
        }
        setGuides(gl);
        const doSnap = snap && gl.length === 0 && !cur.shiftKey;
        const nextMap = new Map();
        d.ids.forEach((id) => {
          const o0 = d.orig.get(id);
          nextMap.set(id, { x: doSnap ? applySnap(o0.x + fdx) : o0.x + fdx, y: doSnap ? applySnap(o0.y + fdy) : o0.y + fdy });
        });
        flushDomMove(idSet, nextMap);
        d.pendingNext = nextMap;
        if (d.ids.length === 1) {
          const pos = nextMap.get(d.ids[0]);
          const orig = byId.get(d.ids[0]);
          if (!pos || !orig || orig.kind !== "node" || orig.locked) { setDropTarget(null); return; }
          const c = { x: pos.x + orig.width / 2, y: pos.y + orig.height / 2 };
          const tgt = others.find((o) => o.kind === "node" && !o.locked && !o.collapsed && c.x > o.x - 10 && c.x < o.x + o.width + 10 && c.y > o.y - 10 && c.y < o.y + o.height + 10);
          setDropTarget(tgt ? tgt.id : null);
        }
      });
      return;
    }
    if (d.mode === "resize") {
      if (!d.checkpointed) { onCheckpoint(); d.checkpointed = true; }
      const dx = w.x - d.startW.x;
      const dy = w.y - d.startW.y;
      const o0 = d.orig;
      let nx = o0.x; let ny = o0.y; let nw = o0.w; let nh = o0.h;
      if (d.handle.includes("e")) nw = Math.max(24, o0.w + dx);
      if (d.handle.includes("s")) nh = Math.max(24, o0.h + dy);
      if (d.handle.includes("w")) { nw = Math.max(24, o0.w - dx); nx = o0.x + (o0.w - nw); }
      if (d.handle.includes("n")) { nh = Math.max(24, o0.h - dy); ny = o0.y + (o0.h - nh); }
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isShift && d.handle.length === 2) {
        const aspect = o0.w / Math.max(1, o0.h);
        if (Math.abs(nw - o0.w) > Math.abs(nh - o0.h)) {
          nh = nw / aspect;
          if (d.handle.includes("n")) ny = o0.y + o0.h - nh;
        } else {
          nw = nh * aspect;
          if (d.handle.includes("w")) nx = o0.x + o0.w - nw;
        }
      }
      if (isCtrl) {
        const cx = o0.x + o0.w / 2;
        const cy = o0.y + o0.h / 2;
        nx = cx - nw / 2;
        ny = cy - nh / 2;
      }
      const target = byId.get(d.id);
      if (target && target.text) {
        const fitted = ensureFits({ ...target, width: nw, height: nh });
        if (fitted.width !== nw) {
          if (d.handle.includes("w") && !isCtrl) nx = nx + nw - fitted.width;
          nw = fitted.width;
        }
        if (fitted.height !== nh) {
          if (d.handle.includes("n") && !isCtrl) ny = ny + nh - fitted.height;
          nh = fitted.height;
        }
      }
      // nếu đang autoSize thì tắt autoSize khi kéo resize
      onObjects(objects.map((o) => (o.id === d.id ? { ...o, x: nx, y: ny, width: nw, height: nh, autoSize: false } : o)), false);
      return;
    }
    if (d.mode === "draw-conn") {
      dragRef.current.cur = w;
      setTempConn({ fromId: d.fromId, cur: w });
      // highlight node đích
      const tgt = objects.find((o) => o.id !== d.fromId && o.kind !== "stroke" && w.x > o.x && w.x < o.x + o.width && w.y > o.y && w.y < o.y + o.height);
      setDropTarget(tgt ? tgt.id : null);
      return;
    }
    if (d.mode === "pen") {
      if (!d.checkpointed) { onCheckpoint(); d.checkpointed = true; }
      const rel = { x: w.x - (byId.get(d.id)?.x || w.x), y: w.y - (byId.get(d.id)?.y || w.y) };
      const next = objects.map((o) => (o.id === d.id ? { ...o, points: [...(o.points || []), rel] } : o));
      onObjects(next, false);
    }
  };

  const onSvgPointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size > 0) {
      if (pointersRef.current.size === 1 && dragRef.current?.mode === "pinch") dragRef.current = null;
      return;
    }
    const d = dragRef.current;
    if (!d) { endDragCommon(); return; }
    const w = toWorld(e.clientX, e.clientY);
    if (d.mode === "marquee") {
      const m = marquee;
      if (m) {
        const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1);
        const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1);
        const tiny = Math.abs(m.x1 - m.x0) < 4 && Math.abs(m.y1 - m.y0) < 4;
        if (tiny) {
          if (!d.additive) onSelectionChange([]);
        } else {
          const hit = objects.filter((o) => {
            const pts = o.kind === "stroke" ? strokeBox(o) : { x: o.x, y: o.y, w: o.width, h: o.height };
            return pts.x < x1 && pts.x + pts.w > x0 && pts.y < y1 && pts.y + pts.h > y0;
          }).map((o) => o.id);
          onSelectionChange(d.additive ? [...new Set([...selection, ...hit])] : hit);
        }
      }
    } else if (d.mode === "move") {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      // commit vị trí cuối từ DOM trực tiếp vào React state — không trễ
      let finalObjects = objects;
      if (d.pendingNext && d.pendingNext.size) {
        finalObjects = objects.map((o) => {
          const p = d.pendingNext.get(o.id);
          return p ? { ...o, x: p.x, y: p.y } : o;
        });
        onObjects(finalObjects, false);
        d.pendingNext = null;
        pendingDomRef.current = null;
      }
      // đổi parent nếu thả vào node khác (chỉ node->node, chống cycle)
      if (d.ids.length === 1 && d.checkpointed) {
        const cur = finalObjects.find((o) => o.id === d.ids[0]);
        if (cur && cur.kind === "node" && !cur.locked) {
          const c = centerOf(cur);
          const tgt = finalObjects.find((o) =>
            o.id !== cur.id && o.kind === "node" && !o.locked &&
            c.x > o.x - 10 && c.x < o.x + o.width + 10 && c.y > o.y - 10 && c.y < o.y + o.height + 10 &&
            !isDescendant(cur.id, o.id, finalObjects),
          );
          if (tgt && cur.parentId !== tgt.id) {
            const next = finalObjects.map((o) => (o.id === cur.id ? { ...o, parentId: tgt.id } : o));
            const has = connectors.some((cc) => cc.fromId === tgt.id && cc.toId === cur.id);
            onObjects(next, false);
            if (!has) {
              onConnectors([...connectors, { id: `c_${Date.now().toString(36)}`, fromId: tgt.id, toId: cur.id, type: "arrow", color: "#64748b", width: 2 }], false);
            }
            onNotify?.(`Đã chuyển “${(cur.text || "node").slice(0, 24)}” vào “${(tgt.text || "node").slice(0, 24)}”`);
          }
        }
      }
    } else if (d.mode === "resize") {
      // checkpoint đã chụp ở resize đầu tiên
    } else if (d.mode === "draw-conn") {
      const tgt = objects.find((o) => o.id !== d.fromId && o.kind !== "stroke" && w.x > o.x && w.x < o.x + o.width && w.y > o.y && w.y < o.y + o.height);
      if (tgt) {
        const exists = connectors.some((c) => c.fromId === d.fromId && c.toId === tgt.id);
        if (!exists) {
          onCheckpoint();
          onConnectors([...connectors, { id: `c_${Date.now().toString(36)}`, fromId: d.fromId, toId: tgt.id, type: connectorType, color: "#475569", width: 2 }], false);
          onNotify?.("Đã tạo đường nối");
        } else onNotify?.("Hai khối này đã được nối");
      }
    } else if (d.mode === "pen") {
      const st = objects.find((o) => o.id === d.id);
      if (!st) { /* noop */ }
      else if ((st.points || []).length <= 1) onObjects(objects.filter((o) => o.id !== d.id), false);
      else if ((st.points || []).length > 60) {
        // point simplification — giữ nét mượt nhưng giảm dữ liệu
        const tol = 1.6;
        const pts = st.points;
        const keep = new Array(pts.length).fill(false);
        keep[0] = true; keep[pts.length - 1] = true;
        const stack = [[0, pts.length - 1]];
        const sq = (p, a, b) => {
          let x = a.x, y = a.y, dx = b.x - x, dy = b.y - y;
          if (dx !== 0 || dy !== 0) {
            const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) { x = b.x; y = b.y; } else if (t > 0) { x += dx * t; y += dy * t; }
          }
          const ddx = p.x - x, ddy = p.y - y;
          return ddx * ddx + ddy * ddy;
        };
        while (stack.length) {
          const [a, b] = stack.pop();
          let max = 0, idx = -1;
          for (let i = a + 1; i < b; i++) if (!keep[i]) {
            const d = sq(pts[i], pts[a], pts[b]);
            if (d > max) { max = d; idx = i; }
          }
          if (max > tol * tol && idx !== -1) { keep[idx] = true; stack.push([a, idx]); stack.push([idx, b]); }
        }
        const simplified = pts.filter((_, i) => keep[i]);
        onObjects(objects.map((o) => o.id === d.id ? { ...o, points: simplified } : o), false);
      }
    }
    endDragCommon();
  };

  function strokeBox(o) {
    const xs = (o.points || []).map((p) => o.x + p.x);
    const ys = (o.points || []).map((p) => o.y + p.y);
    if (!xs.length) return { x: o.x, y: o.y, w: 0, h: 0 };
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function isDescendant(ancestorId, maybeChildId, list) {
    // true nếu maybeChild là con/cháu của ancestor -> cấm đặt ancestor vào cháu
    const map = new Map(list.map((o) => [o.id, o.parentId]));
    let cur = map.get(maybeChildId);
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      if (cur === ancestorId) return true;
      seen.add(cur);
      cur = map.get(cur);
    }
    return false;
  }

  const startResize = (e, o, handle) => {
    e.stopPropagation();
    if (o.locked) return;
    onCheckpoint();
    const svg = svgRef.current;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragRef.current = { mode: "resize", id: o.id, handle, checkpointed: true, startW: toWorld(e.clientX, e.clientY), orig: { x: o.x, y: o.y, w: o.width, h: o.height } };
  };

  // ── Double-click: sửa text ──
  const onNodeDoubleClick = (e, o) => {
    if (o.kind === "stroke" || o.kind === "image") return;
    e.stopPropagation();
    setEditing({ id: o.id, text: o.text || "" });
  };

  const commitEditing = (save) => {
    if (!editing) return;
    if (save && editing.text !== (byId.get(editing.id)?.text || "")) {
      onCheckpoint();
      onObjects(objects.map((o) => o.id === editing.id ? ensureFits({ ...o, text: editing.text }) : o), false);
    }
    setEditing(null);
  };

  const editingObj = editing ? byId.get(editing.id) : null;
  const editingScreen = editingObj ? toScreen(editingObj.x, editingObj.y) : null;

  // ── Vùng nhìn: viewBox phủ viewport ──
  const vb = useMemo(() => {
    const svg = svgRef.current;
    const w = svg?.clientWidth || 900;
    const h = svg?.clientHeight || 600;
    return { x: -pan.x / zoom, y: -pan.y / zoom, w: w / zoom, h: h / zoom };
  }, [pan, zoom, svgRef, objects]);

  const cursorForTool = tool === "pan" || spaceDown ? "grab" : tool === "select" ? "default" : tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "copy";

  const singleSel = selection.length === 1 ? byId.get(selection[0]) : null;

  return (
    <div className="wb-canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="wb-svg"
        style={{ cursor: cursorForTool }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={onSvgPointerUp}
        onDoubleClick={(e) => { if (e.target === svgRef.current) { const w = toWorld(e.clientX, e.clientY); if (props.onDoubleClickBackground) props.onDoubleClickBackground(w); else props.onCanvasClick?.(w, tool); } }}
        touchAction="none"
      >
        <defs>
          <pattern id="wb-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(100,116,139,0.18)" strokeWidth={1 / zoom} />
          </pattern>
          <marker id="wb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#475569" />
          </marker>
        </defs>

        {/* nền phủ viewport (cố định màn hình) */}
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#fbfdff" />

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* lưới world-locked — di chuyển cùng node, không ngược chiều khi kéo */}
          {grid && <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#wb-grid)" />}
          {/* connectors — tự tính lại từ vị trí node hiện tại (anchor point) */}
          {connectors.map((c) => {
            const a = byId.get(c.fromId);
            const b = byId.get(c.toId);
            if (!a || !b) return null;
            const g = connectorGeom(a, b, c.type, c.sourceAnchor, c.targetAnchor);
            if (!g) return null;
            const connSel = props.selectedConnId === c.id;
            return (
              <g key={c.id}>
                <path ref={(el) => { if (el) connsRef.current.set(c.id, el); else connsRef.current.delete(c.id); }} d={g.d} fill="none" stroke={connSel ? "#2563eb" : c.color} strokeWidth={connSel ? c.width + 1.5 : c.width} markerEnd={c.type === "line" ? undefined : "url(#wb-arrow)"} markerStart={c.type === "double" ? "url(#wb-arrow)" : undefined} />
                {/* hit area rộng để dễ chọn/xóa */}
                <path d={g.d} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    if (tool !== "select") return;
                    e.stopPropagation();
                    props.onConnSelection?.(c.id, e.shiftKey);
                  }}
                />
              </g>
            );
          })}

          {/* temp connector preview */}
          {tempConn && byId.get(tempConn.fromId) && (
            <line
              x1={centerOf(byId.get(tempConn.fromId)).x} y1={centerOf(byId.get(tempConn.fromId)).y}
              x2={tempConn.cur.x} y2={tempConn.cur.y}
              stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4"
            />
          )}

          {/* objects */}
          {objects.map((o) => {
            const selected = selSet.has(o.id);
            if (o.kind === "stroke") {
              const d = (o.points || []).map((p, i) => `${i === 0 ? "M" : "L"} ${o.x + p.x} ${o.y + p.y}`).join(" ");
              return <path key={o.id} d={d} fill="none" stroke={o.penColor} strokeWidth={o.penWidth} strokeLinecap="round" strokeLinejoin="round" />;
            }
            if (o.kind === "image") {
              return (
                <g key={o.id} ref={(el) => { if (el) nodesRef.current.set(o.id, el); else nodesRef.current.delete(o.id); }} transform={`translate(${o.x},${o.y})`}
                  onPointerDown={(e) => onNodePointerDown(e, o)}
                  onDoubleClick={(e) => e.stopPropagation()}>
                  {o.src && <image href={o.src} x={0} y={0} width={o.width} height={o.height} preserveAspectRatio="xMidYMid meet" />}
                  {!o.src && <rect width={o.width} height={o.height} fill="#e2e8f0" />}
                  {selected && <rect width={o.width} height={o.height} fill="none" stroke="#2563eb" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />}
                  {renderHandles(o, selected)}
                </g>
              );
            }
            const isDrop = dropTarget === o.id;
            const noteStyle = o.kind === "note";
            const isCollapsed = !!o.collapsed;
            const collapsedN = collapsedMap?.get(o.id) || 0;
            return (
              <g key={o.id} ref={(el) => { if (el) nodesRef.current.set(o.id, el); else nodesRef.current.delete(o.id); }} transform={`translate(${o.x},${o.y})`}
                onPointerDown={(e) => onNodePointerDown(e, o)}
                onDoubleClick={(e) => onNodeDoubleClick(e, o)}>
                {noteStyle && <rect x={5 / zoom} y={5 / zoom} width={o.width} height={o.height} fill="rgba(15,23,42,0.12)" rx={4} />}
                <ShapeBody o={o} />
                {isDrop && <rect width={o.width} height={o.height} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={3 / zoom} strokeDasharray={`${8 / zoom} ${5 / zoom}`} rx={10} />}
                <NodeText o={o} />
                {o.locked && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={o.width - 18} y={2} width={14} height={14} rx={3} fill="#fff" stroke="#64748b" strokeWidth={1 / zoom} />
                    <text x={o.width - 11} y={12} textAnchor="middle" fontSize={10} fill="#64748b">🔒</text>
                  </g>
                )}
                {o.groupId && !selected && !o.locked && (
                  <circle cx={o.width - 8} cy={8} r={5 / zoom + 3} fill="#7c3aed" opacity={0.85} style={{ pointerEvents: "none" }} />
                )}
                {isCollapsed && collapsedN > 0 && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={o.width / 2 - 18} y={o.height - 12} width={36} height={14} rx={7} fill="#d97706" stroke="#fff" strokeWidth={1 / zoom} />
                    <text x={o.width / 2} y={o.height - 2} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700}>+{collapsedN}</text>
                  </g>
                )}
                {selected && (
                  <rect width={o.width} height={o.height} fill="none" stroke={o.locked ? "#94a3b8" : "#2563eb"} strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} rx={8} style={{ pointerEvents: "none" }} />
                )}
                {renderHandles(o, selected)}
              </g>
            );
          })}

          {/* marquee */}
          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`}
            />
          )}

          {/* smart guides */}
          {guides.map((g, i) => (
            g.axis === "v"
              ? <line key={i} x1={g.v} y1={vb.y} x2={g.v} y2={vb.y + vb.h} stroke="#f43f5e" strokeWidth={1.2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
              : <line key={i} x1={vb.x} y1={g.v} x2={vb.x + vb.w} y2={g.v} stroke="#f43f5e" strokeWidth={1.2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
          ))}
        </g>
      </svg>

      {/* overlay sửa text */}
      {editing && editingObj && editingScreen && (
        <textarea
          className="wb-edit-overlay"
          autoFocus
          value={editing.text}
          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
          onBlur={() => commitEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") commitEditing(false);
            e.stopPropagation();
          }}
          style={{
            left: editingScreen.x,
            top: editingScreen.y,
            width: Math.max(80, editingObj.width * zoom),
            minHeight: Math.max(40, editingObj.height * zoom),
            fontSize: Math.max(12, editingObj.fontSize * zoom),
          }}
        />
      )}
    </div>
  );

  function renderHandles(o, selected) {
    if (!selected || selection.length !== 1 || o.kind === "stroke" || o.autoSize) return null;
    const s = 10 / zoom;
    const pts = [
      { h: "nw", x: 0, y: 0 },
      { h: "ne", x: o.width, y: 0 },
      { h: "sw", x: 0, y: o.height },
      { h: "se", x: o.width, y: o.height },
    ];
    return (
      <g>
        {pts.map((p) => (
          <rect
            key={p.h}
            x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
            fill="#fff" stroke="#2563eb" strokeWidth={1.5 / zoom} rx={2 / zoom}
            style={{ cursor: HANDLE_CURSORS[p.h] }}
            onPointerDown={(e) => startResize(e, o, p.h)}
          />
        ))}
      </g>
    );
  }
}
