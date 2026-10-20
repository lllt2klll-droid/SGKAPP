import React, { useRef, useState, useEffect, useCallback } from "react";
import { safeGetJSON, safeSetJSON } from "./safeStorage.js";
import {
  MousePointer2, Pen, Highlighter, Eraser, Minus, Square, Circle,
  ArrowRight, Type, Hand, Undo2, Redo2, Trash2, Copy, Download,
  ClipboardCopy, CheckCircle, Plus, X, ZoomIn, ZoomOut, Maximize2,
  Expand, Shrink,
} from "lucide-react";

// ─── DrawBoard v2 — bảng vẽ vector đầy đủ cho BookReader ───
// Model: boards[] -> objects[] (stroke/line/rect/ellipse/arrow/text)
// - Undo/redo theo object (nhẹ, chính xác), tẩy theo nét (hit-test)
// - Pen / highlighter / shapes / text / select-move / hand-pan
// - Zoom + pan, nền ô ly/kẻ ngang/caro/chấm/trắng, nhiều bảng, lưu localStorage
// - Xuất PNG, copy clipboard, gửi AI chấm (giữ nguyên prop onCheckDrawing)

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const PALETTE = ["#1e293b", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#795548", "#000000", "#ffffff"];
const BG_KINDS = [
  { id: "oly", label: "Ô ly" },
  { id: "ngang", label: "Kẻ ngang" },
  { id: "caro", label: "Caro" },
  { id: "cham", label: "Chấm" },
  { id: "trang", label: "Trắng" },
];
const BOARD_HEIGHTS = [320, 440, 600];

const clone = (o) => JSON.parse(JSON.stringify(o));
const distToSeg = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const strokeHit = (obj, p, pad = 6) => {
  const pts = obj.pts || [];
  const tol = Math.max(pad, (obj.size || 4) / 2 + 4);
  for (let i = 1; i < pts.length; i++) if (distToSeg(p, pts[i - 1], pts[i]) <= tol) return true;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= tol;
  return shapeHit(obj, p, pad);
};
function shapeBBox(o) {
  if (o.kind === "text") return { x: o.x, y: o.y - (o.fontSize || 18), w: o.w || 120, h: (o.fontSize || 18) + 8 };
  const xs = (o.pts || []).map((p) => p.x), ys = (o.pts || []).map((p) => p.y);
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (o.size || 3) / 2 + 4;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
function shapeHit(o, p, pad = 6) {
  if (o.kind === "text") {
    const b = shapeBBox(o);
    return p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4;
  }
  const pts = o.pts || [];
  if (pts.length < 2) return false;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const tol = Math.max(pad, (o.size || 3) / 2 + 5);
  if (o.kind === "line" || o.kind === "arrow") return distToSeg(p, a, b) <= tol;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (o.fill) return p.x >= x0 - 2 && p.x <= x1 + 2 && p.y >= y0 - 2 && p.y <= y1 + 2;
  if (o.kind === "rect") {
    const onEdge = (p.x >= x0 - tol && p.x <= x1 + tol && (Math.abs(p.y - y0) <= tol || Math.abs(p.y - y1) <= tol))
      || (p.y >= y0 - tol && p.y <= y1 + tol && (Math.abs(p.x - x0) <= tol || Math.abs(p.x - x1) <= tol));
    return onEdge;
  }
  // ellipse: chuẩn hoá khoảng cách tới biên — ellipse nhỏ dùng thêm vùng đệm tuyệt đối để dễ chọn
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1, (x1 - x0) / 2), ry = Math.max(1, (y1 - y0) / 2);
  const v = ((p.x - cx) ** 2) / (rx * rx) + ((p.y - cy) ** 2) / (ry * ry);
  if (o.fill) return v <= 1.05;
  if (Math.abs(v - 1) <= Math.max(0.08, tol / Math.max(rx, ry))) return true;
  // fallback: ellipse nhỏ (<24px) — cho phép bấm trong vùng biên mở rộng tol
  if (Math.max(rx, ry) < 24) {
    return p.x >= x0 - tol && p.x <= x1 + tol && p.y >= y0 - tol && p.y <= y1 + tol;
  }
  return false;
}
const objectHit = (o, p) => (o.kind === "stroke" ? strokeHit(o, p) : o.kind === "text" ? shapeHit(o, p) : strokeHit(o, p) || shapeHit(o, p));

export default function CanvasWhiteboard({ onCheckDrawing, isAnalyzing, bookKey = "global" }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [boards, setBoards] = useState(() => [{ id: uid(), name: "Bảng 1", bg: "oly", objects: [] }]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#1e293b");
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(0.35);
  const [fill, setFill] = useState(false);
  const [bg, setBg] = useState("oly");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [boardH, setBoardH] = useState(440);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [textDraft, setTextDraft] = useState(null); // {x,y,value}
  const [eraserPos, setEraserPos] = useState(null);

  const active = boards[activeIdx] || boards[0];
  const objects = active?.objects || [];
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const drawingRef = useRef(null); // {mode, start, preview, id, orig, movedGhost, bIdx}
  const panRef = useRef(null);
  const eraserRingRef = useRef(null); // vòng tẩy live (không qua setState từng move)
  const isDownRef = useRef(false);
  const activePointerRef = useRef(null); // L1: khóa 1 pointer khi đang vẽ (chống đa chạm phá nét)
  const eraseBaseRef = useRef(null); // L6: snapshot trước khi tẩy để gộp 1 lần tẩy = 1 undo
  const boardsRef = useRef(null);
  boardsRef.current = boards;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const boardKeyRef = useRef("");
  const saveTimer = useRef(null);

  // L7: flush save cũ đồng bộ trước khi đổi sách (tránh timer chung clearTimeout làm mất save sách cũ)
  const pendingSaveRef = useRef(null); // {key, snapshot}
  // ── Load / persist theo sách ──
  const storageKey = `sgk_draw2_${bookKey || "global"}`;
  useEffect(() => {
    if (pendingSaveRef.current) {
      try { safeSetJSON(pendingSaveRef.current.key, pendingSaveRef.current.snapshot); } catch {}
      pendingSaveRef.current = null;
    }
    clearTimeout(saveTimer.current);
    boardKeyRef.current = storageKey;
    try {
      const parsed = safeGetJSON(storageKey, null);
      if (parsed) {
        if (Array.isArray(parsed.boards) && parsed.boards.length) {
          const clean = parsed.boards.slice(0, 10).map((b, i) => ({
            id: b.id || uid(), name: b.name || `Bảng ${i + 1}`,
            bg: b.bg || "oly", objects: Array.isArray(b.objects) ? b.objects.slice(0, 800) : [],
          }));
          setBoards(clean);
          setActiveIdx(Math.min(parsed.activeIdx || 0, clean.length - 1));
          setBg(clean[Math.min(parsed.activeIdx || 0, clean.length - 1)]?.bg || "oly");
          undoRef.current = []; redoRef.current = [];
          setCanUndo(false); setCanRedo(false);
          return;
        }
      }
    } catch { /* ignore */ }
    // key mới → reset 1 bảng trắng
    setBoards([{ id: uid(), name: "Bảng 1", bg: "oly", objects: [] }]);
    setActiveIdx(0); setBg("oly");
    undoRef.current = []; redoRef.current = [];
    setCanUndo(false); setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // L7: chốt key tại lúc hẹn giờ (tránh timer cũ ghi đè sang key sách mới) + dọn khi unmount
  // + flush đồng bộ khi unmount để không mất nét cuối
  const persist = useCallback((nextBoards, nextIdx) => {
    const key = boardKeyRef.current;
    const snapshot = { v: 2, boards: nextBoards, activeIdx: nextIdx };
    pendingSaveRef.current = { key, snapshot };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        safeSetJSON(key, snapshot);
      } catch { /* quota: bỏ qua, giữ trong memory */ }
      if (pendingSaveRef.current && pendingSaveRef.current.key === key) pendingSaveRef.current = null;
    }, 400);
  }, []);
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    if (pendingSaveRef.current) {
      try { safeSetJSON(pendingSaveRef.current.key, pendingSaveRef.current.snapshot); } catch {}
      pendingSaveRef.current = null;
    }
  }, []);

  const commit = useCallback((nextObjects, nextBoards = null, nextIdx = null) => {
    const bIdx = nextIdx ?? activeIdx;
    const base = nextBoards ?? boards;
    // P1: cap undo 30 entries + snapshot gọn (chỉ objects board đang sửa) để tránh phình RAM
    undoRef.current.push(JSON.stringify({ bIdx, objects: base[bIdx]?.objects || [] }));
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
    setCanUndo(true); setCanRedo(false);
    const nb = base.map((b, i) => (i === bIdx ? { ...b, objects: nextObjects } : b));
    setBoards(nb);
    persist(nb, bIdx);
  }, [activeIdx, boards, persist]);

  const undo = useCallback(() => {
    const top = undoRef.current.pop();
    if (!top) return;
    try {
      const { bIdx, objects: prev } = JSON.parse(top);
      // P1: tính redo snapshot NGOÀI updater (updater phải pure — StrictMode gọi 2 lần sẽ nhân đôi redo)
      const curBoards = boardsRef.current || [];
      redoRef.current.push(JSON.stringify({ bIdx, objects: curBoards[bIdx]?.objects || [] }));
      if (redoRef.current.length > 30) redoRef.current.shift();
      const nb = curBoards.map((b, i) => (i === bIdx ? { ...b, objects: prev } : b));
      setBoards(nb);
      persist(nb, bIdx); // L4: persist đúng board được undo, không phải board đang xem
      setSelectedId(null);
      setCanUndo(undoRef.current.length > 0);
      setCanRedo(true);
    } catch { /* ignore */ }
  }, [persist]);

  const redo = useCallback(() => {
    const top = redoRef.current.pop();
    if (!top) return;
    try {
      const { bIdx, objects: next } = JSON.parse(top);
      const curBoards = boardsRef.current || [];
      undoRef.current.push(JSON.stringify({ bIdx, objects: curBoards[bIdx]?.objects || [] }));
      if (undoRef.current.length > 30) undoRef.current.shift();
      const nb = curBoards.map((b, i) => (i === bIdx ? { ...b, objects: next } : b));
      setBoards(nb);
      persist(nb, bIdx); // L4: persist đúng board được redo
      setSelectedId(null);
      setCanUndo(true);
      setCanRedo(redoRef.current.length > 0);
    } catch { /* ignore */ }
  }, [persist]);

  // ── Canvas sizing + render ──
  const viewRef = useRef({ w: 600, h: 440, dpr: 1 });
  const stateRef = useRef({});
  stateRef.current = { objects, bg, zoom, pan, selectedId, eraserPos, tool }; // L13: render cần biết tool để ẩn vòng tẩy
  // Ghi chú lỗi cũ: stateRef.draft giữ drawingRef của lần render React trước,
  // nên preview khi đang kéo không bao giờ hiện (nhả chuột → setBoards → re-render mới thấy).
  // Fix: render() đọc TRỰC TIẾP drawingRef.current + eraserRingRef.current (live, không qua state).

  const drawBackground = (ctx, W, H, kind) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (kind === "trang") return;
    ctx.save();
    if (kind === "oly" || kind === "caro") {
      ctx.strokeStyle = kind === "oly" ? "rgba(59,130,246,0.10)" : "rgba(100,116,139,0.14)";
      ctx.lineWidth = 1;
      const step = 20;
      ctx.beginPath();
      for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      if (kind === "oly") {
        ctx.strokeStyle = "rgba(239,68,68,0.28)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(32, H); ctx.stroke();
      }
    } else if (kind === "ngang") {
      ctx.strokeStyle = "rgba(59,130,246,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 28; y < H; y += 28) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      ctx.strokeStyle = "rgba(239,68,68,0.28)";
      ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(32, H); ctx.stroke();
    } else if (kind === "cham") {
      ctx.fillStyle = "rgba(100,116,139,0.30)";
      for (let x = 14; x < W; x += 22) for (let y = 14; y < H; y += 22) {
        ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };

  const paintObject = (ctx, o) => {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (o.kind === "stroke") {
      ctx.globalAlpha = o.opacity ?? 1;
      ctx.strokeStyle = o.color; ctx.lineWidth = o.size;
      const pts = o.pts;
      if (!pts || !pts.length) { ctx.restore(); return; }
      if (pts.length === 1) {
        ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, o.size / 2, 0, Math.PI * 2); ctx.fill();
      } else if (pts.length === 2) {
        // 2 điểm: vẽ đoạn thẳng + bo tròn 2 đầu (không bị cụt)
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
        ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, o.size / 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(pts[1].x, pts[1].y, o.size / 2, 0, Math.PI * 2); ctx.fill();
      } else if (pts.length > 2) {
        // Mượt bằng midpoint-quadratic qua toàn bộ điểm
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
    } else if (o.kind === "text") {
      ctx.globalAlpha = 1;
      ctx.fillStyle = o.color;
      ctx.font = `600 ${o.fontSize || 18}px "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      (String(o.text || "").split("\n")).forEach((line, i) => ctx.fillText(line, o.x, o.y + i * ((o.fontSize || 18) + 4)));
    } else {
      const [a, b] = [o.pts[0], o.pts[o.pts.length - 1]];
      ctx.globalAlpha = o.opacity ?? 1;
      ctx.strokeStyle = o.color; ctx.lineWidth = o.size;
      if (o.fill) { ctx.fillStyle = o.color; ctx.globalAlpha = Math.min(0.18, (o.opacity ?? 1)); }
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
      ctx.globalAlpha = o.opacity ?? 1;
      ctx.beginPath();
      if (o.kind === "line") { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      else if (o.kind === "rect") ctx.rect(x0, y0, Math.max(1, w), Math.max(1, h));
      else if (o.kind === "ellipse") ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      else if (o.kind === "arrow") { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      if (o.fill && (o.kind === "rect" || o.kind === "ellipse")) {
        ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = o.color; ctx.fill(); ctx.restore();
        ctx.globalAlpha = o.opacity ?? 1;
      }
      ctx.stroke();
      if (o.kind === "arrow") {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const s = Math.max(10, (o.size || 3) * 3.2);
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - s * Math.cos(ang - 0.42), b.y - s * Math.sin(ang - 0.42));
        ctx.lineTo(b.x - s * Math.cos(ang + 0.42), b.y - s * Math.sin(ang + 0.42));
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth || 600, H = boardH;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    viewRef.current = { w: W, h: H, dpr };
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // L9: guard canvas chưa sẵn sàng
    const s = stateRef.current;
    if (!s.pan || typeof s.zoom !== "number") return;
    // Đọc live ref để nét hiện NGAY khi kéo (không đợi re-render React)
    const livePreview = drawingRef.current?.preview || null;
    // L13: vòng tẩy chỉ hiện khi đang cầm tẩy (đổi tool giữa chừng không còn sót vòng tròn)
    const liveRing = s.tool === "eraser" ? (eraserRingRef.current || s.eraserPos) : null;
    const hideId = drawingRef.current?.mode === "move" ? drawingRef.current.id : null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // nền không zoom (giữ ô ly ổn định), nét vẽ có zoom/pan
    drawBackground(ctx, W, H, s.bg);
    ctx.save();
    ctx.translate(s.pan.x, s.pan.y); ctx.scale(s.zoom, s.zoom);
    // clip vùng logic để pan không lem ra ngoài quá xa
    s.objects.forEach((o) => { if (o.id !== hideId) paintObject(ctx, o); });
    // Preview đang vẽ: nét bút vẽ LIỀN (không đứt nét), shape vẽ đứt nét để phân biệt
    if (livePreview) {
      if (livePreview.kind === "stroke") paintObject(ctx, livePreview);
      else { ctx.save(); ctx.setLineDash([6, 4]); paintObject(ctx, livePreview); ctx.restore(); }
    }
    // Ghost của object đang kéo-di chuyển
    if (drawingRef.current?.mode === "move" && drawingRef.current?.movedGhost) {
      paintObject(ctx, drawingRef.current.movedGhost);
    }
    // khung chọn
    if (s.selectedId) {
      const o = s.objects.find((x) => x.id === s.selectedId);
      if (o) {
        const bb = shapeBBox(o);
        ctx.save();
        ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 1.2 / s.zoom; ctx.setLineDash([5 / s.zoom, 4 / s.zoom]);
        ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
        ctx.restore();
      }
    }
    ctx.restore();
    // vòng tẩy (screen space)
    if (liveRing) {
      ctx.save();
      ctx.strokeStyle = "rgba(15,23,42,0.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(liveRing.sx, liveRing.sy, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }, [boardH]);

  useEffect(() => { render(); });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => render());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [render, expanded]);

  // ── Toạ độ (đọc zoom/pan live từ stateRef để không lệch khi đang pan) ──
  const toWorld = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0, x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const s = stateRef.current;
    const z = s.zoom ?? zoom, px = s.pan?.x ?? pan.x, py = s.pan?.y ?? pan.y;
    return { sx, sy, x: (sx - px) / z, y: (sy - py) / z };
  };

  // Lấy danh sách điểm mượt: ưu tiên coalesced events của browser (chuột tần số cao)
  const coalescedWorld = (e) => {
    const raw = typeof e.nativeEvent?.getCoalescedEvents === "function"
      ? e.nativeEvent.getCoalescedEvents()
      : null;
    if (raw && raw.length > 1) return raw.map((ev) => toWorld(ev.clientX, ev.clientY));
    return [toWorld(e.clientX, e.clientY)];
  };

  // L10: lọc nhiễu theo world px đã chia zoom (zoom to không bị rỗ nét, zoom nhỏ không bị rối)
  const appendSmooth = (pts, p, minDist = 1.6) => {
    const last = pts[pts.length - 1];
    if (!last) { pts.push({ x: p.x, y: p.y }); return true; }
    if (Math.hypot(p.x - last.x, p.y - last.y) < minDist) return false;
    pts.push({ x: p.x, y: p.y });
    return true;
  };

  // ── Pointer handlers ──
  const objectsLiveRef = useRef(objects);
  objectsLiveRef.current = objects;
  // L6: tẩy trong lúc kéo KHÔNG push history từng nét — hit-test trên state mới nhất,
  // 1 lần kéo = 1 undo duy nhất (chốt ở pointerup)
  const eraseSilent = (p) => {
    const bIdx = activeIdxRef.current;
    let removed = false;
    setBoards((cur) => {
      const list = cur[bIdx]?.objects || [];
      const hit = [...list].reverse().find((o) => objectHit(o, p));
      if (!hit) return cur;
      removed = true;
      return cur.map((b, i) => (i === bIdx ? { ...b, objects: list.filter((o) => o.id !== hit.id) } : b));
    });
    return removed;
  };

  const onPointerDown = (e) => {
    if (textDraft) return;
    // Chỉ nhận chuột trái / touch / pen — bỏ qua chuột phải & giữa (trừ hand-pan)
    if (e.pointerType === "mouse" && e.button === 2) return;
    // L1: pointer thứ 2 (ngón tay thứ 2, tì tay) trong lúc đang vẽ → bỏ qua
    if (isDownRef.current && activePointerRef.current !== null && activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    isDownRef.current = true;
    activePointerRef.current = e.pointerId;
    if (e.button === 1 || tool === "hand") {
      panRef.current = { sx: e.clientX, sy: e.clientY, ox: stateRef.current.pan?.x ?? pan.x, oy: stateRef.current.pan?.y ?? pan.y };
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) { isDownRef.current = false; activePointerRef.current = null; return; }
    const p = toWorld(e.clientX, e.clientY);
    if (tool === "select") {
      const hit = [...objectsLiveRef.current].reverse().find((o) => objectHit(o, p));
      setSelectedId(hit?.id || null);
      if (hit) drawingRef.current = { mode: "move", id: hit.id, start: p, orig: clone(hit), movedGhost: clone(hit), bIdx: activeIdxRef.current };
      else drawingRef.current = null;
      render();
      return;
    }
    if (tool === "text") {
      setTextDraft({ x: Math.round(p.x), y: Math.round(p.y), value: "" });
      isDownRef.current = false;
      activePointerRef.current = null;
      return;
    }
    if (tool === "eraser") {
      eraserRingRef.current = { sx: p.sx, sy: p.sy };
      eraseBaseRef.current = clone(objectsLiveRef.current); // L6: snapshot 1 lần đầu kéo
      eraseSilent(p);
      drawingRef.current = { mode: "erase", bIdx: activeIdxRef.current };
      render();
      return;
    }
    if (tool === "pen" || tool === "highlighter") {
      const pressure = e.pressure && e.pressure > 0 && e.pressure <= 1 ? e.pressure : 0.7;
      const w = tool === "highlighter"
        ? Math.max(8, size * 2.4)
        : Math.max(1.2, size * (0.55 + pressure * 0.65));
      drawingRef.current = {
        mode: "stroke", preview: {
          id: "draft", kind: "stroke",
          pts: [{ x: p.x, y: p.y }],
          color, size: w,
          opacity: tool === "highlighter" ? opacity : 1,
        },
      };
      render(); // vẽ chấm đầu ngay lập tức — không đợi move
      return;
    }
    // shapes
    drawingRef.current = {
      mode: "shape", start: p,
      preview: { id: "draft", kind: tool, pts: [{ x: p.x, y: p.y }, { x: p.x, y: p.y }], color, size, opacity: 1, fill },
    };
    render();
  };

  const onPointerMove = (e) => {
    // L1: chỉ pointer đang vẽ mới được cập nhật nét
    if (isDownRef.current && activePointerRef.current !== null && e.pointerId !== activePointerRef.current) return;
    // Vòng tẩy luôn cập nhật live (kể cả chưa nhấn)
    if (tool === "eraser") {
      const pr = toWorld(e.clientX, e.clientY);
      eraserRingRef.current = { sx: pr.sx, sy: pr.sy };
      if (!isDownRef.current || drawingRef.current?.mode !== "erase") { render(); return; }
    }
    if (panRef.current) {
      const dx = e.clientX - panRef.current.sx, dy = e.clientY - panRef.current.sy;
      const nx = panRef.current.ox + dx, ny = panRef.current.oy + dy;
      stateRef.current = { ...stateRef.current, pan: { x: nx, y: ny } };
      setPan({ x: nx, y: ny });
      render();
      return;
    }
    const d = drawingRef.current;
    if (!d || !isDownRef.current) return;
    // Chỉ vẽ khi đang nhấn (chuột trái) — tránh vệt lạ khi hover
    if (e.pointerType === "mouse" && typeof e.buttons === "number" && e.buttons !== 0 && (e.buttons & 1) === 0) return;
    if (d.mode === "erase") {
      for (const p of coalescedWorld(e)) eraseSilent(p); // L6: silent, gộp undo ở pointerup
      render();
      return;
    }
    if (d.mode === "move") {
      const p = toWorld(e.clientX, e.clientY);
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      const c = clone(d.orig);
      if (c.kind === "text") { c.x += dx; c.y += dy; }
      else c.pts = c.pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      d.movedGhost = c; // live ghost — chốt 1 lần duy nhất ở pointerup (mượt, không re-render liên tục)
      render();
      return;
    }
    if (d.mode === "stroke") {
      const minD = 1.6 / (stateRef.current.zoom || 1); // L10
      let added = false;
      for (const p of coalescedWorld(e)) added = appendSmooth(d.preview.pts, p, minD) || added;
      if (added) render(); // render ngay từng move → nét hiện trực tiếp khi kéo
      return;
    }
    if (d.mode === "shape") {
      const p = toWorld(e.clientX, e.clientY);
      let end = { x: p.x, y: p.y };
      if (e.shiftKey) { // khóa tỷ lệ / đường thẳng
        const s0 = d.start;
        if (tool === "line" || tool === "arrow") {
          const dx = end.x - s0.x, dy = end.y - s0.y;
          if (Math.abs(dx) > Math.abs(dy) * 2) end = { x: end.x, y: s0.y };
          else if (Math.abs(dy) > Math.abs(dx) * 2) end = { x: s0.x, y: end.y };
          else { const m = (Math.abs(dx) + Math.abs(dy)) / 2 * Math.sign(dx || 1); const n = m * Math.sign(dy || 1); end = { x: s0.x + m, y: s0.y + n }; }
        } else {
          const w = end.x - s0.x, h = end.y - s0.y, m = Math.max(Math.abs(w), Math.abs(h));
          end = { x: s0.x + m * Math.sign(w || 1), y: s0.y + m * Math.sign(h || 1) };
        }
      }
      d.preview = { ...d.preview, pts: [d.start, end] };
      render();
    }
  };

  const endStroke = (e) => {
    // L1: pointerup của ngón tay thứ 2 → bỏ qua, không cắt nét đang vẽ
    if (e && activePointerRef.current !== null && e.pointerId !== activePointerRef.current) return;
    if (e) {
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const wasDown = isDownRef.current;
    isDownRef.current = false;
    activePointerRef.current = null;
    const d = drawingRef.current;
    drawingRef.current = null;
    eraserRingRef.current = null;
    setEraserPos(null);
    if (panRef.current) { panRef.current = null; render(); return; }
    if (!d || !wasDown) { render(); return; }
    if (d.mode === "erase") {
      // L6: 1 lần kéo tẩy = 1 undo duy nhất
      const bIdx = d.bIdx ?? activeIdxRef.current;
      const base = eraseBaseRef.current;
      eraseBaseRef.current = null;
      const curList = boardsRef.current?.[bIdx]?.objects || [];
      if (base && curList.length !== base.length) {
        undoRef.current.push(JSON.stringify({ bIdx, objects: base }));
        if (undoRef.current.length > 60) undoRef.current.shift();
        redoRef.current = []; setCanUndo(true); setCanRedo(false);
        persist(boardsRef.current, bIdx);
      }
      render(); return;
    }
    if (d.mode === "move") {
      // L5: commit bằng functional update (chống mất nét nếu boards đổi giữa lúc kéo)
      if (d.movedGhost) {
        const bIdx = d.bIdx ?? activeIdxRef.current;
        const before = objectsBeforeMove.current || [];
        const ghost = { ...d.movedGhost, id: d.id };
        undoRef.current.push(JSON.stringify({ bIdx, objects: before }));
        if (undoRef.current.length > 60) undoRef.current.shift();
        redoRef.current = []; setCanUndo(true); setCanRedo(false);
        setBoards((cur) => {
          const list = cur[bIdx]?.objects || before;
          const next = list.some((o) => o.id === d.id)
            ? list.map((o) => (o.id === d.id ? ghost : o))
            : [...list, ghost]; // object bị xóa giữa lúc kéo → giữ lại vị trí mới
          const nb = cur.map((b, i) => (i === bIdx ? { ...b, objects: next } : b));
          persist(nb, bIdx);
          return nb;
        });
      }
      render(); return;
    }
    if (d.mode === "stroke") {
      const pts = d.preview.pts;
      if (!pts.length) { render(); return; }
      const finalPts = pts.length === 1
        ? [pts[0], { x: pts[0].x + 0.6, y: pts[0].y + 0.6 }]
        : pts;
      commit([...objectsLiveRef.current, { ...d.preview, id: uid(), pts: finalPts }]);
    } else if (d.mode === "shape") {
      const [a, b2] = d.preview.pts;
      if (Math.hypot(a.x - b2.x, a.y - b2.y) > 4) commit([...objectsLiveRef.current, { ...d.preview, id: uid() }]);
      else render();
    }
  };
  const objectsBeforeMove = useRef(null);

  // ── Text commit ──
  const commitText = () => {
    if (!textDraft) return;
    const v = textDraft.value.trim();
    if (v) {
      const fontSize = Math.max(14, size * 4.5);
      // đo rộng để select/hit-test
      const ctx = canvasRef.current?.getContext("2d");
      let w = 120;
      if (ctx) {
        ctx.font = `600 ${fontSize}px "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif`;
        w = Math.max(...v.split("\n").map((l) => ctx.measureText(l).width), 20) + 12;
      }
      commit([...objects, { id: uid(), kind: "text", x: textDraft.x, y: textDraft.y, w, text: v, color, fontSize }]);
      setTool("select"); setSelectedId(null);
    }
    setTextDraft(null);
  };

  // ── Boards ──
  const switchBoard = (i) => {
    // L3: đọc bg từ boardsRef (mới nhất), fallback bg hiện tại — bảng mới không bị reset về "oly"
    setActiveIdx(i); setBg(boardsRef.current?.[i]?.bg || bg);
    setSelectedId(null); setTextDraft(null);
    undoRef.current = []; redoRef.current = []; setCanUndo(false); setCanRedo(false);
  };
  const addBoard = () => {
    if (boards.length >= 10) return;
    const nb = [...boards, { id: uid(), name: `Bảng ${boards.length + 1}`, bg, objects: [] }];
    setBoards(nb); persist(nb, nb.length - 1); switchBoard(nb.length - 1);
  };
  const removeBoard = (i) => {
    if (boards.length <= 1) { commit([]); return; }
    const nb = boards.filter((_, k) => k !== i);
    setBoards(nb); persist(nb, Math.min(activeIdx, nb.length - 1));
    setActiveIdx(Math.min(activeIdx, nb.length - 1));
  };
  const changeBg = (v) => {
    setBg(v);
    setBoards((cur) => {
      const nb = cur.map((b, i) => (i === activeIdx ? { ...b, bg: v } : b));
      persist(nb, activeIdx); return nb;
    });
  };

  // ── Clear / select ops ──
  const clearBoard = () => {
    if (!clearArmed) { setClearArmed(true); setTimeout(() => setClearArmed(false), 2600); return; }
    setClearArmed(false); setSelectedId(null); commit([]);
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    commit(objects.filter((o) => o.id !== selectedId)); setSelectedId(null);
  };
  const duplicateSelected = () => {
    const o = objects.find((x) => x.id === selectedId);
    if (!o) return;
    const c = clone(o); c.id = uid();
    if (c.kind === "text") { c.x += 16; c.y += 16; }
    else c.pts = c.pts.map((p) => ({ x: p.x + 16, y: p.y + 16 }));
    commit([...objects, c]); setSelectedId(c.id);
  };

  // ── Export / AI ──
  const compositeDataURL = (scale = 2) => {
    // L11: tab đang ẩn → viewRef cũ (600px) — ưu tiên đo trực tiếp wrap
    const w = wrapRef.current?.clientWidth || viewRef.current.w || 600;
    const off = document.createElement("canvas");
    off.width = Math.round(w * scale); off.height = Math.round(boardH * scale);
    const ctx = off.getContext("2d");
    if (!ctx) return "";
    ctx.scale(scale, scale);
    drawBackground(ctx, w, boardH, bg);
    ctx.save(); ctx.translate(pan.x, pan.y); ctx.scale(zoom, zoom);
    objects.forEach((o) => paintObject(ctx, o));
    ctx.restore();
    return off.toDataURL("image/png");
  };
  const exportPNG = () => {
    const a = document.createElement("a");
    a.href = compositeDataURL(2);
    a.download = `bang-nhap-${active?.name || "bang"}.png`;
    a.click();
  };
  const copyPNG = async () => {
    try {
      const url = compositeDataURL(2);
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch { exportPNG(); }
  };
  const handleAICheck = () => { if (objects.length && onCheckDrawing) onCheckDrawing(compositeDataURL(1.6)); };

  // L2: zoom Ctrl+cuộn bằng native listener non-passive (React onWheel passive → preventDefault vô hiệu + warn console)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((z) => Math.max(0.5, Math.min(3, z * dir)));
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [expanded, boardH]);

  // K: đổi tool → xóa vòng tẩy sót lại
  useEffect(() => {
    eraserRingRef.current = null;
    setEraserPos(null);
  }, [tool]);

  // ── Phím tắt ──
  useEffect(() => {
    const onKey = (e) => {
      // L8: Escape luôn đóng overlay mở rộng (kể cả focus ngoài input)
      if (e.key === "Escape" && expanded) { setExpanded(false); return; }
      const tag = (e.target?.tagName || "").toLowerCase();
      // L12: không cướp phím khi đang focus select/input/textarea
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { if (selectedId) { e.preventDefault(); deleteSelected(); } return; }
      const map = { v: "select", b: "pen", h: "highlighter", e: "eraser", l: "line", r: "rect", o: "ellipse", a: "arrow", t: "text", p: "hand" };
      const t = map[e.key.toLowerCase()];
      if (t) setTool(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const TOOLS = [
    { id: "select", icon: <MousePointer2 size={16} />, label: "Chọn/di chuyển (V)" },
    { id: "pen", icon: <Pen size={16} />, label: "Bút (B)" },
    { id: "highlighter", icon: <Highlighter size={16} />, label: "Đánh dấu (H)" },
    { id: "eraser", icon: <Eraser size={16} />, label: "Tẩy theo nét (E)" },
    { id: "line", icon: <Minus size={16} />, label: "Đường thẳng (L · giữ Shift: ngang/dọc/chéo)" },
    { id: "rect", icon: <Square size={16} />, label: "Hình chữ nhật (R · Shift: vuông)" },
    { id: "ellipse", icon: <Circle size={16} />, label: "Hình tròn/elip (O · Shift: tròn)" },
    { id: "arrow", icon: <ArrowRight size={16} />, label: "Mũi tên (A)" },
    { id: "text", icon: <Type size={16} />, label: "Chữ (T)" },
    { id: "hand", icon: <Hand size={16} />, label: "Bàn tay kéo khung (P)" },
  ];

  const barBtn = (activeBtn) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 30, height: 30, borderRadius: 8, cursor: "pointer",
    border: `1px solid ${activeBtn ? "var(--primary, #2563eb)" : "var(--border-color, #e2e8f0)"}`,
    background: activeBtn ? "var(--primary-light, #dbeafe)" : "var(--surface, #fff)",
    color: activeBtn ? "var(--primary, #2563eb)" : "var(--text-muted, #64748b)",
  });

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Tabs bảng */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {boards.map((b, i) => (
          <div key={b.id} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 10px",
            borderRadius: 999, fontSize: "0.75rem", fontWeight: 700,
            border: `1px solid ${i === activeIdx ? "var(--primary, #2563eb)" : "var(--border-color, #e2e8f0)"}`,
            background: i === activeIdx ? "var(--primary-light, #dbeafe)" : "var(--surface, #fff)",
            color: i === activeIdx ? "var(--primary, #2563eb)" : "var(--text-muted, #64748b)",
          }}>
            <button onClick={() => switchBoard(i)} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit" }}>
              {b.name} · {b.objects.length}
            </button>
            {boards.length > 1 && (
              <button onClick={() => removeBoard(i)} title="Xóa bảng này" style={{ ...barBtn(false), width: 20, height: 20, borderRadius: 999 }}>
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        {boards.length < 10 && (
          <button onClick={addBoard} title="Thêm bảng mới" style={{ ...barBtn(false), width: 26, height: 26, borderRadius: 999 }}>
            <Plus size={14} />
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-mid, #94a3b8)", fontWeight: 600 }}>
          {objects.length} nét · lưu tự động
        </span>
      </div>

      {/* Toolbar công cụ */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", padding: 8, border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 10, background: "var(--surface, #fff)" }}>
        {TOOLS.map((t) => (
          <button key={t.id} title={t.label} onClick={() => { setTool(t.id); setTextDraft(null); }} style={barBtn(tool === t.id)}>{t.icon}</button>
        ))}
        <div style={{ width: 1, height: 22, background: "var(--border-color, #e2e8f0)", margin: "0 4px" }} />
        <button title="Hoàn tác (Ctrl+Z)" onClick={undo} disabled={!canUndo} style={{ ...barBtn(false), opacity: canUndo ? 1 : 0.4 }}><Undo2 size={15} /></button>
        <button title="Làm lại (Ctrl+Y)" onClick={redo} disabled={!canRedo} style={{ ...barBtn(false), opacity: canRedo ? 1 : 0.4 }}><Redo2 size={15} /></button>
        <button title="Nhân đôi nét đang chọn" onClick={duplicateSelected} disabled={!selectedId} style={{ ...barBtn(false), opacity: selectedId ? 1 : 0.4 }}><Copy size={15} /></button>
        <button title="Xóa nét đang chọn (Del)" onClick={deleteSelected} disabled={!selectedId} style={{ ...barBtn(false), opacity: selectedId ? 1 : 0.4 }}><X size={15} /></button>
      </div>

      {/* Hàng style */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 10, background: "var(--surface, #fff)" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          {PALETTE.map((c) => (
            <button key={c} title={c} onClick={() => setColor(c)} style={{
              width: 22, height: 22, borderRadius: c === "#ffffff" ? 6 : 999, cursor: "pointer",
              background: c, border: color === c ? "2px solid var(--primary, #2563eb)" : "1px solid rgba(15,23,42,0.2)",
              boxShadow: color === c ? "0 0 0 2px rgba(37,99,235,0.25)" : "none",
            }} />
          ))}
          <label title="Màu tùy chỉnh" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted, #64748b)", cursor: "pointer" }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 26, height: 22, border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 6, padding: 0, background: "none", cursor: "pointer" }} />
          </label>
        </div>
        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dark, #0f172a)", display: "flex", alignItems: "center", gap: 6 }}>
          Nét {size}
          <input type="range" min={1} max={24} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 90, accentColor: "var(--primary, #2563eb)" }} />
        </label>
        {tool === "highlighter" && (
          <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dark, #0f172a)", display: "flex", alignItems: "center", gap: 6 }}>
            Đậm {Math.round(opacity * 100)}%
            <input type="range" min={0.1} max={0.8} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: 70, accentColor: "var(--primary, #2563eb)" }} />
          </label>
        )}
        {(tool === "rect" || tool === "ellipse") && (
          <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dark, #0f172a)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} style={{ accentColor: "var(--primary, #2563eb)" }} /> Tô nền
          </label>
        )}
        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dark, #0f172a)", display: "flex", alignItems: "center", gap: 4 }}>
          Nền
          <select value={bg} onChange={(e) => changeBg(e.target.value)} style={{ fontSize: "0.72rem", borderRadius: 8, padding: "2px 6px", border: "1px solid var(--border-color, #e2e8f0)" }}>
            {BG_KINDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dark, #0f172a)", display: "flex", alignItems: "center", gap: 4 }}>
          Cao
          <select value={boardH} onChange={(e) => setBoardH(Number(e.target.value))} style={{ fontSize: "0.72rem", borderRadius: 8, padding: "2px 6px", border: "1px solid var(--border-color, #e2e8f0)" }}>
            {BOARD_HEIGHTS.map((h) => <option key={h} value={h}>{h}px</option>)}
          </select>
        </label>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} style={{ position: "relative", width: "100%", height: boardH, borderRadius: 10, overflow: "hidden", border: "1px solid var(--primary-light, #bfdbfe)", background: "#fff", touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", cursor: tool === "hand" ? "grab" : tool === "select" ? "default" : tool === "eraser" ? "none" : tool === "text" ? "text" : "crosshair", touchAction: "none" }}
          onPointerDown={(e) => { objectsBeforeMove.current = clone(objectsLiveRef.current); onPointerDown(e); }}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onContextMenu={(e) => e.preventDefault()}
          // L2: zoom Ctrl+cuộn xử lý ở native listener non-passive bên trên (không dùng onWheel prop)
          onPointerLeave={() => {
            // Đang giữ pointer-capture thì leave là bình thường (kéo ra ngoài) — không xóa ring/drawing
            if (drawingRef.current || panRef.current || isDownRef.current) return;
            eraserRingRef.current = null;
            setEraserPos(null);
            render();
          }}
          onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        />
        {textDraft && (
          <textarea
            autoFocus
            value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitText(); if (e.key === "Escape") setTextDraft(null); e.stopPropagation(); }}
            placeholder="Gõ chữ… (Ctrl+Enter để xong)"
            style={{
              position: "absolute", left: textDraft.x * zoom + pan.x, top: textDraft.y * zoom + pan.y,
              minWidth: 140, minHeight: 40, fontSize: Math.max(14, size * 4.5) * zoom,
              fontWeight: 600, color, border: "1.5px dashed var(--primary, #2563eb)",
              borderRadius: 6, padding: 4, background: "rgba(255,255,255,0.92)", outline: "none", zIndex: 5,
            }}
          />
        )}
        {!objects.length && !textDraft && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: "0.78rem", color: "#94a3b8", background: "rgba(255,255,255,0.8)", padding: "4px 12px", borderRadius: 999, border: "1px dashed #cbd5e1" }}>
              Vẽ / viết trực tiếp lên bảng — cuộn chuột + Ctrl để zoom, double-click để reset khung nhìn
            </span>
          </div>
        )}
      </div>

      {/* Hàng zoom + hành động */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button title="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} style={barBtn(false)}><ZoomOut size={14} style={{ transform: "scaleX(-1)" }} /></button>
          <span style={{ fontSize: "0.72rem", fontWeight: 800, minWidth: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button title="Phóng to" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} style={barBtn(false)}><ZoomIn size={14} style={{ transform: "scaleX(-1)" }} /></button>
          <button title="Reset khung nhìn (100%)" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={barBtn(false)}><Maximize2 size={14} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          <button onClick={() => setExpanded((v) => !v)} title={expanded ? "Thu gọn" : "Mở rộng toàn màn hình"} className="btn btn-secondary" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
            {expanded ? <Shrink size={14} /> : <Expand size={14} />} {expanded ? "Thu gọn" : "Mở rộng"}
          </button>
          <button onClick={copyPNG} disabled={!objects.length} title="Copy ảnh bảng vào clipboard" className="btn btn-secondary" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", opacity: objects.length ? 1 : 0.5 }}>
            <ClipboardCopy size={14} /> Copy
          </button>
          <button onClick={exportPNG} disabled={!objects.length} title="Tải ảnh PNG" className="btn btn-secondary" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", opacity: objects.length ? 1 : 0.5 }}>
            <Download size={14} /> PNG
          </button>
          <button onClick={clearBoard} className="btn btn-secondary" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", background: clearArmed ? "var(--accent, #ef4444)" : undefined, color: clearArmed ? "#fff" : undefined }}>
            <Trash2 size={14} /> {clearArmed ? "Chắc chắn xóa?" : "Xóa bảng"}
          </button>
          <button onClick={handleAICheck} disabled={isAnalyzing || !objects.length} title={objects.length ? "Gửi ảnh bảng cho AI nhận xét" : "Vẽ trước rồi bấm AI Kiểm tra"} className="btn btn-accent" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
            {isAnalyzing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <CheckCircle size={14} />}
            AI Kiểm tra
          </button>
        </div>
      </div>
      <div className="alert-info" style={{ margin: 0, padding: "0.4rem 0.7rem", fontSize: "0.75rem" }}>
        ✏️ <strong>Mẹo:</strong> B bút · H đánh dấu · E tẩy (bấm vào nét để xóa) · R/C/O/A vẽ hình (giữ Shift khóa tỷ lệ) · T chèn chữ · V chọn & kéo để di chuyển · Ctrl+Z/Y hoàn tác · Del xóa nét chọn.
      </div>
    </div>
  );

  if (expanded) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: "var(--z-bubble)", background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setExpanded(false)}>
        <div style={{ width: "min(1100px, 100%)", maxHeight: "94vh", overflow: "auto", background: "var(--surface, #fff)", borderRadius: 14, padding: 14 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <strong style={{ fontSize: "0.9rem" }}>✏️ {active?.name || "Bảng vẽ"} — chế độ mở rộng</strong>
            <button onClick={() => setExpanded(false)} style={{ ...barBtn(false), marginLeft: "auto" }} title="Đóng"><X size={15} /></button>
          </div>
          {/* render lại cùng state nhờ ref dùng chung? Dùng bản sao độc lập trong overlay:
              để đơn giản, overlay dùng chung component body nhưng canvas ref thứ 2.
              Ta mount body 1 lần duy nhất — vì expanded tách nhánh nên canvas sẽ remount và render() lại tự chạy. */}
          <ExpandedMirror
            body={body} wrapRef={wrapRef} canvasRef={canvasRef} render={render}
          />
        </div>
      </div>
    );
  }
  return <div className="canvas-container">{body}</div>;
}

// Overlay giữ nguyên ref: chỉ bọc lại body để canvas remount đúng trong dialog
function ExpandedMirror({ body, wrapRef, canvasRef, render }) {
  useEffect(() => {
    // sau khi remount vào dialog, đo lại + vẽ lại
    const t = setTimeout(render, 30);
    return () => clearTimeout(t);
  }, [render]);
  // refs được truyền xuống qua body đã bind sẵn (wrapRef/canvasRef là stable) nên chỉ cần render body
  void wrapRef; void canvasRef;
  return body;
}
