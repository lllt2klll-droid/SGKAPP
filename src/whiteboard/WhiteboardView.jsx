import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MousePointer2, Hand, Pencil, Eraser, Type, Shapes, ArrowUpRight, Image as ImageIcon,
  StickyNote, Network, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Grid3X3, Copy, Trash2,
  Group, Ungroup, AlignLeft, AlignCenter, AlignRight, Save, Download, Upload, Plus, FilePlus,
  LayoutTemplate, Sparkles, X, Check, Search, Expand, Shrink,
  PaintBucket, Square, Bold, Italic, AlignJustify, BookOpen,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, SlidersHorizontal, Wand2, Eye, EyeOff, Magnet
} from "lucide-react";
import WhiteboardCanvas from "./WhiteboardCanvas.jsx";
import {
  uid, blankBoard, blankObject, listBoards, loadBoard, persistBoard, createBoard,
  deleteBoard as deleteBoardStore, renameBoard as renameBoardStore, duplicateBoard as dupBoardStore,
  parseBoardJSON, ensureFits, WB_PENDING_KEY
} from "./whiteboardStore.js";
import { generateMindmap, buildTemplate, TEMPLATES, autoLayout, aiPlanToGraph } from "./mindmapEngine.js";
import { exportSVG, exportJSON, exportRaster, exportPDF, boardBounds } from "./exportManager.js";
import { loadSettings } from "../settingsStore.js";
import { soundManager } from "../audio/soundManager.js";
import { getShortcut, matchesShortcut } from "../keyboardShortcuts.js";
import { trackWhiteboardAction } from "./whiteboardIntegration.js";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { safeGetString, safeSetString, safeRemove, safeGetJSON } from "../safeStorage.js";

// ─── Helpers ───
function cloneBoard(b) {
  try { if (typeof structuredClone === "function") return structuredClone(b); } catch {}
  return JSON.parse(JSON.stringify(b));
}
function boardSnap(b) { return { objects: cloneBoard(b).objects, connectors: cloneBoard(b).connectors, zoom: b.zoom, pan: { ...b.pan } }; }
function estimateAutoSize(text, fontSize) {
  const lines = String(text || " ").split("\n");
  const maxChars = Math.max(...lines.map((l) => l.length), 6);
  const w = Math.max(120, Math.min(420, Math.ceil(maxChars * fontSize * 0.62 + 24)));
  const h = Math.max(48, Math.ceil(lines.length * fontSize * 1.35 + 20));
  return { w, h };
}

const SHAPE_OPTS = [
  { id: "rounded", label: "Bo tròn" }, { id: "rect", label: "Chữ nhật" },
  { id: "circle", label: "Tròn" }, { id: "ellipse", label: "Elip" },
  { id: "diamond", label: "Thoi" }, { id: "triangle", label: "Tam giác" },
];
const CONN_OPTS = [
  { id: "line", label: "Line" }, { id: "arrow", label: "Arrow" },
  { id: "double", label: "Double" }, { id: "elbow", label: "Elbow" },
];
const LAYOUT_OPTS = [
  { id: "tree-tb", label: "Top → Bottom" }, { id: "tree-lr", label: "Left → Right" },
  { id: "tree-rl", label: "Right → Left" }, { id: "tree-bt", label: "Bottom → Top" },
  { id: "radial", label: "Radial" },
];

function getDescendantIds(objects, rootId) {
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
function simplifyPoints(points, tol = 1.8) {
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

export default function WhiteboardView() {
  const svgRef = useRef(null);
  const rootRef = useRef(null);
  const jsonInputRef = useRef(null);
  const importImageRef = useRef(null);
  const docxInputRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [branchDrag, setBranchDrag] = useState(true);
  const [contextMenu, setContextMenu] = useState(null); // {x,y, wx,wy, id, kind}
  // Popup nổi tách khỏi menu cha (tránh bị overflow:auto cắt + không cần hover)
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [requestEditId, setRequestEditId] = useState(null);
  const [replaceImageId, setReplaceImageId] = useState(null);
  const replaceImageRef = useRef(null);
  const [pendingImagePos, setPendingImagePos] = useState(null);
  const imageUrlMapRef = useRef(new Map()); // imageId -> objectURL
  // Kéo-thả file vào bảng: ảnh → chèn, .json/.docx → nhập bảng
  const [wbDrag, setWbDrag] = useState(false);
  const wbDragRef = useRef(0);

  const [boards, setBoards] = useState(() => listBoards());
  const [activeId, setActiveId] = useState(() => listBoards()[0]?.id || null);
  const [board, setBoard] = useState(() => {
    const id = listBoards()[0]?.id;
    return id ? loadBoard(id) : blankBoard("Bảng của tôi");
  });

  const [tool, setTool] = useState("select");
  const [shapeType, setShapeType] = useState("rounded");
  const [connectorType, setConnectorType] = useState("arrow");
  const [penColor, setPenColor] = useState("#1d4ed8");
  const [penWidth, setPenWidth] = useState(3);
  const [selection, setSelection] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [showBoardList, setShowBoardList] = useState(false);
  const [showMindModal, setShowMindModal] = useState(false);
  const [mindTopic, setMindTopic] = useState("");
  const [mindBranches, setMindBranches] = useState("4");
  const [showTemplate, setShowTemplate] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiImageFile, setAiImageFile] = useState(null);
  const [aiImagePreview, setAiImagePreview] = useState("");
  const [aiSmallIdeas, setAiSmallIdeas] = useState(["", ""]);
  const [aiTab, setAiTab] = useState("text");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStage, setAiStage] = useState("form"); // "form" | "preview"
  const [aiPlan, setAiPlan] = useState(null); // {topic, branches:[{label,children[]}]}
  const [aiMeta, setAiMeta] = useState(null); // {mode, warnings[], checked}
  const [aiError, setAiError] = useState("");
  const [exportScope, setExportScope] = useState("content");
  const [showExport, setShowExport] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [savedAt, setSavedAt] = useState(null);
  const [toast, setToast] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [searchBoard, setSearchBoard] = useState("");
  // ── UI gọn / thu gọn (chỉ ảnh hưởng hiển thị, giữ nguyên tính năng) ──
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => safeGetString("sgk:whiteboard-toolbar-collapsed", "0") === "1");
  const [topbarCollapsed, setTopbarCollapsed] = useState(() => safeGetString("sgk:whiteboard-topbar-collapsed", "0") === "1");
  const [showCanvasOpts, setShowCanvasOpts] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  // Chế độ tập trung: ẩn thanh trên, chỉ giữ dock nổi + pill mini → tối đa canvas
  const [focusMode, setFocusMode] = useState(() => safeGetString("sgk:whiteboard-focus", "0") === "1");

  // ── Liên kết với Settings / Sound / Phím tắt ──
  const getWbSettings = useCallback(() => {
    try { return loadSettings().whiteboard || {}; } catch { return {}; }
  }, []);
  const playWb = useCallback((ev) => {
    try {
      const s = loadSettings();
      if (!s.behavior?.soundEnabled) return;
      if (s.whiteboard && s.whiteboard.soundEffects === false) return;
      soundManager.play(ev);
    } catch {}
  }, []);
  const notifyBoardsUpdate = useCallback(() => {
    // emit WHITEBOARD_UPDATED → bus tự alias sang DATA_UPDATED (không cần dispatch 2 lần)
    try { appEvents.emit(AppEvents.WHITEBOARD_UPDATED, { source: "whiteboard" }); } catch {}
  }, []);

  useEffect(() => {
    try {
      const ws = getWbSettings();
      if (ws.defaultPenColor) setPenColor(ws.defaultPenColor);
      if (ws.defaultPenWidth) setPenWidth(ws.defaultPenWidth);
      if (typeof ws.branchDrag === "boolean") setBranchDrag(ws.branchDrag);
    } catch {}
    const onSettings = () => {
      try {
        const ws = loadSettings().whiteboard || {};
        if (typeof ws.branchDrag === "boolean") setBranchDrag(ws.branchDrag);
      } catch {}
    };
    window.addEventListener("sgk:settings-updated", onSettings);
    return () => window.removeEventListener("sgk:settings-updated", onSettings);
  }, [getWbSettings]);

  useEffect(() => {
    if (!aiImageFile) { setAiImagePreview(""); return; }
    const url = URL.createObjectURL(aiImageFile);
    setAiImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [aiImageFile]);

  // History
  const historyRef = useRef([]);
  const histIdxRef = useRef(-1);
  const skipHistRef = useRef(false);

  const initHistory = useCallback((b) => {
    const snap = boardSnap(b);
    historyRef.current = [snap];
    histIdxRef.current = 0;
  }, []);

  useEffect(() => { if (board) initHistory(board); }, []); // once

  const pushHistory = useCallback((b) => {
    if (skipHistRef.current) { skipHistRef.current = false; return; }
    const snap = boardSnap(b);
    const cur = histIdxRef.current;
    const prev = historyRef.current[cur];
    if (prev && prev.objects.length === snap.objects.length && prev.connectors.length === snap.connectors.length && prev.zoom === snap.zoom && prev.pan.x === snap.pan.x && prev.pan.y === snap.pan.y) {
      // kiểm tra nhanh trùng, tránh JSON.stringify nặng
      let same = true;
      for (let i = 0; i < Math.min(prev.objects.length, 5); i++) {
        const a = prev.objects[i], bb = snap.objects[i];
        if (a.x !== bb.x || a.y !== bb.y || a.text !== bb.text) { same = false; break; }
      }
      if (same) return;
    }
    historyRef.current = historyRef.current.slice(0, cur + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > 80) { historyRef.current.shift(); }
    else histIdxRef.current++;
    if (historyRef.current.length > 80) histIdxRef.current = historyRef.current.length - 1;
  }, []);

  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  const applyHistory = useCallback((idx) => {
    const snap = historyRef.current[idx];
    if (!snap) return;
    skipHistRef.current = true;
    histIdxRef.current = idx;
    setBoard((prev) => ({ ...prev, objects: cloneBoard({ objects: snap.objects }).objects, connectors: cloneBoard({ connectors: snap.connectors }).connectors, zoom: snap.zoom, pan: { ...snap.pan } }));
  }, []);

  const checkpoint = useCallback(() => { if (board) pushHistory(board); }, [board, pushHistory]);

  // Autosave — liên kết với Settings (behavior.autoSave + whiteboard.autoSave)
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);
  useEffect(() => {
    if (!board || skipHistRef.current) return;
    let autoSave = true;
    let delay = 900;
    try {
      const s = loadSettings();
      autoSave = s?.behavior?.autoSave !== false && s?.whiteboard?.autoSave !== false;
      delay = s?.whiteboard?.autoSaveDelay ?? s?.behavior?.autoSaveDelay ?? 900;
    } catch {}
    if (!autoSave) { setSaveState("saved"); return; }
    pendingSaveRef.current = board;
    setSaveState("saving");
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        persistBoard(pendingSaveRef.current);
        pendingSaveRef.current = null;
        notifyBoardsUpdate();
        setBoards(listBoards());
        setSaveState("saved");
        setSavedAt(new Date());
        playWb("save");
      } catch { setSaveState("saved"); }
    }, delay);
    return () => clearTimeout(saveTimerRef.current);
  }, [board, playWb]);

  // Flush pending autosave on unmount / before navigating away — prevents loss if user exits before debounce fires
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        try {
          // persistBoard strips ephemeral blob: src, so saved data is stable
          persistBoard(pendingSaveRef.current);
        } catch {}
        pendingSaveRef.current = null;
      }
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Board switching
  const switchBoard = useCallback((id) => {
    const b = loadBoard(id);
    if (!b) return;
    // persist current before switch
    try { if (board) { persistBoard(board); notifyBoardsUpdate(); } } catch {}
    setBoard(b);
    setActiveId(id);
    setSelection([]); setSelectedConn(null);
    initHistory(b);
    setShowBoardList(false);
    notify(`Đã mở “${b.name}”`); playWb("open");
  }, [board, initHistory, notify]);

  const handleNewBoard = useCallback(() => {
    const ws = getWbSettings();
    const b = createBoard();
    b.grid = ws.grid ?? b.grid;
    b.snap = ws.snap ?? b.snap;
    b.smartAlign = ws.smartAlign ?? b.smartAlign;
    b.smartSpacing = ws.smartSpacing ?? b.smartSpacing;
    persistBoard(b);
    notifyBoardsUpdate();
    setBoards(listBoards());
    setBoard(b); setActiveId(b.id); setSelection([]); initHistory(b);
    notify("Đã tạo bảng mới");
    playWb("open");
    trackWhiteboardAction("create_board", { boardId: b.id });
  }, [initHistory, notify, getWbSettings, playWb]);

  const handleRename = useCallback(() => {
    if (!board) return;
    const name = renameDraft.trim();
    if (!name) return;
    const nb = renameBoardStore(board.id, name);
    if (nb) { setBoard(nb); setBoards(listBoards()); notifyBoardsUpdate(); notify("Đã đổi tên"); }
  }, [board, renameDraft, notify]);

  const handleDuplicateBoard = useCallback(() => {
    if (!board) return;
    const dup = dupBoardStore(board.id);
    if (dup) { notifyBoardsUpdate(); setBoards(listBoards()); setBoard(dup); setActiveId(dup.id); setSelection([]); initHistory(dup); notify("Đã nhân bản bảng"); playWb("open"); }
  }, [board, initHistory, notify]);

  const handleDeleteBoard = useCallback(() => {
    if (!board || boards.length <= 1) { notify("Cần giữ ít nhất 1 bảng"); return; }
    const id = board.id;
    deleteBoardStore(id);
    notifyBoardsUpdate();
    const remaining = listBoards();
    setBoards(remaining);
    const next = remaining[0];
    if (next) { const nb = loadBoard(next.id); setBoard(nb); setActiveId(next.id); setSelection([]); initHistory(nb); }
    notify("Đã xóa bảng"); playWb("close");
  }, [board, boards.length, initHistory, notify]);

  // Objects / connectors mutations (live during drag: no history, commit on release)
  const handleObjects = useCallback((nextObjs, record) => {
    setBoard((prev) => {
      const nb = { ...prev, objects: nextObjs };
      if (record) pushHistory(nb);
      return nb;
    });
  }, [pushHistory]);

  const handleConnectors = useCallback((nextConns, record) => {
    setBoard((prev) => {
      const nb = { ...prev, connectors: nextConns };
      if (record) pushHistory(nb);
      return nb;
    });
  }, [pushHistory]);

  const handleViewport = useCallback((nz, pan) => {
    setBoard((prev) => ({ ...prev, zoom: nz, pan }));
  }, []);

  // ── Canvas click tạo object ──
  const handleCanvasClick = useCallback((w, curTool) => {
    const mk = (kind, patch) => ({ ...blankObject(kind, patch), x: w.x - (patch.width || 80) / 2, y: w.y - (patch.height || 32) / 2 });
    let obj = null;
    if (curTool === "text") {
      obj = mk("text", { width: 200, height: 48, text: "Nhấn đúp để sửa", fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1.2, fontSize: 16 });
    } else if (curTool === "shape") {
      obj = mk("shape", { width: 160, height: 80, text: "Khối", shape: shapeType, fill: "#e0f2fe", stroke: "#0ea5e9", strokeWidth: 2, fontSize: 15 });
    } else if (curTool === "note") {
      obj = mk("note", { width: 180, height: 140, text: "Ghi chú…", fill: "#fef9c3", stroke: "#facc15", strokeWidth: 1, fontSize: 14 });
    } else if (curTool === "mind") {
      obj = mk("node", { width: 170, height: 60, text: "Nhánh mới", fill: "#2563eb", color: "#fff", stroke: "transparent", fontSize: 15, bold: true });
    }
    if (obj) {
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: [...prev.objects, obj] };
        pushHistory(nb);
        return nb;
      });
      setSelection([obj.id]);
      setTool("select");
      notify("Đã thêm khối");
    }
  }, [shapeType, checkpoint, pushHistory, notify]);



  const handleMindAdd = useCallback((parentObj) => {
    checkpoint();
    const child = {
      ...blankObject("node"),
      x: parentObj.x + parentObj.width + 40,
      y: parentObj.y + parentObj.height / 2 - 30,
      width: 160, height: 52, text: "Nhánh con", fill: "#f8fafc", color: "#1e293b", stroke: "#2563eb", strokeWidth: 2, fontSize: 14, bold: false,
      parentId: parentObj.id,
    };
    const conn = { id: uid("c"), fromId: parentObj.id, toId: child.id, type: "arrow", color: "#64748b", width: 2 };
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, child], connectors: [...prev.connectors, conn] };
      pushHistory(nb); return nb;
    });
    setSelection([child.id]);
    notify("Đã thêm nhánh con"); playWb("open");
    trackWhiteboardAction("add_branch");
  }, [checkpoint, pushHistory, notify]);

  // Tạo object nhanh tại vị trí chuột phải (không qua toolbar)
  const createAt = useCallback((wx, wy, kind, extra = {}) => {
    checkpoint();
    const base = { x: wx - 100, y: wy - 24, width: 200, height: 48 };
    let patch = {};
    if (kind === "text") patch = { width: 200, height: 48, text: "Văn bản mới", fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1.2, fontSize: 16, ...extra };
    else if (kind === "note") patch = { width: 180, height: 140, text: "Ghi chú…", fill: "#fef9c3", stroke: "#facc15", strokeWidth: 1, fontSize: 14, ...extra };
    else if (kind === "shape") patch = { width: 160, height: 80, text: "Hình", shape: shapeType, fill: "#e0f2fe", stroke: "#0ea5e9", strokeWidth: 2, fontSize: 15, ...extra };
    else if (kind === "node") patch = { width: 170, height: 60, text: "Nhánh mới", fill: "#2563eb", color: "#fff", stroke: "transparent", fontSize: 15, bold: true, ...extra };
    const obj = { ...blankObject(kind === "shape" ? "shape" : kind === "note" ? "note" : kind === "node" ? "node" : "text"), ...base, ...patch };
    setBoard((prev) => { const nb = { ...prev, objects: [...prev.objects, obj] }; pushHistory(nb); return nb; });
    setSelection([obj.id]);
    if (kind === "text" || kind === "note" || kind === "node") setRequestEditId(obj.id);
    notify("Đã thêm"); playWb("open");
    trackWhiteboardAction("create_object", { kind });
    return obj;
  }, [shapeType, checkpoint, pushHistory, notify]);

  const handleDoubleClickBackground = useCallback((w) => {
    createAt(w.x, w.y, "text");
  }, [createAt]);

  // tìm vùng trống gần viewport center, tránh chồng lên object hiện có
  const findFreeSpot = useCallback((w = 600, h = 400) => {
    const svg = svgRef.current;
    const vw = svg?.clientWidth || 900, vh = svg?.clientHeight || 600;
    const cx = (-board.pan.x + vw / 2) / board.zoom;
    const cy = (-board.pan.y + vh / 2) / board.zoom;
    const occupied = board.objects;
    const isFree = (x, y) => !occupied.some((o) => !(x + w < o.x || x > o.x + o.width || y + h < o.y || y > o.y + o.height));
    if (isFree(cx - w / 2, cy - h / 2)) return { cx, cy };
    const steps = [200, 350, 500];
    for (const r of steps) for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI * 2) / 8;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      if (isFree(x - w / 2, y - h / 2)) return { cx: x, cy: y };
    }
    return { cx, cy };
  }, [board.pan, board.zoom, board.objects]);

  // ── Mindmap modal ──
  const createMindmap = useCallback(() => {
    const topic = mindTopic.trim() || "Chủ đề";
    const n = Math.max(1, Math.min(8, parseInt(mindBranches, 10) || 4));
    checkpoint();
    const { cx, cy } = findFreeSpot(700, 500);
    const { objects, connectors } = generateMindmap(topic, Array.from({ length: n }, (_, i) => `Nhánh ${i + 1}`), { cx, cy });
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, ...objects], connectors: [...prev.connectors, ...connectors] };
      pushHistory(nb); return nb;
    });
    setShowMindModal(false);
    setTool("select");
    notify("Đã tạo mindmap"); playWb("success");
    trackWhiteboardAction("create_mindmap", { branches: n });
  }, [mindTopic, mindBranches, checkpoint, pushHistory, notify, findFreeSpot]);

  const applyTemplate = useCallback((kind) => {
    checkpoint();
    const { cx, cy } = findFreeSpot(600, 400);
    const { objects, connectors } = buildTemplate(kind, cx, cy);
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, ...objects], connectors: [...prev.connectors, ...connectors] };
      pushHistory(nb); return nb;
    });
    setShowTemplate(false);
    notify("Đã thêm mẫu"); playWb("open");
    trackWhiteboardAction("add_template", { kind });
  }, [board.pan, board.zoom, checkpoint, pushHistory, notify]);

  // ── Auto layout ──
  const doAutoLayout = useCallback((mode) => {
    checkpoint();
    const laid = autoLayout(board.objects, board.connectors, mode);
    setBoard((prev) => { const nb = { ...prev, objects: laid }; pushHistory(nb); return nb; });
    notify(`Đã sắp xếp: ${mode}`);
  }, [board.objects, board.connectors, checkpoint, pushHistory, notify]);

  // ── Group / Ungroup ──
  const handleGroup = useCallback(() => {
    if (selection.length < 2) { notify("Chọn ít nhất 2 khối để gộp nhóm"); return; }
    checkpoint();
    const gid = uid("g");
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.map((o) => selection.includes(o.id) ? { ...o, groupId: gid } : o) };
      pushHistory(nb); return nb;
    });
    notify("Đã gộp nhóm"); playWb("success");
  }, [selection, checkpoint, pushHistory, notify]);

  const handleUngroup = useCallback(() => {
    if (!selection.length) return;
    checkpoint();
    const gids = new Set(selection.map((id) => board.objects.find((o) => o.id === id)?.groupId).filter(Boolean));
    if (!gids.size) { notify("Không có nhóm để tách"); return; }
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.map((o) => gids.has(o.groupId) ? { ...o, groupId: null } : o) };
      pushHistory(nb); return nb;
    });
    notify("Đã tách nhóm"); playWb("success");
  }, [selection, board.objects, checkpoint, pushHistory, notify]);

  // ── Delete selection ──
  const deleteSelection = useCallback(() => {
    if (!selection.length && !selectedConn) return;
    const lockedInSel = selection.some((id) => board.objects.find((o) => o.id === id)?.locked);
    if (lockedInSel) { notify("Có khối bị khóa — mở khóa trước khi xóa"); return; }
    checkpoint();
    if (selectedConn) {
      setBoard((prev) => {
        const nb = { ...prev, connectors: prev.connectors.filter((c) => c.id !== selectedConn) };
        pushHistory(nb); return nb;
      });
      setSelectedConn(null);
      notify("Đã xóa đường nối"); playWb("close");
      return;
    }
    const sel = new Set(selection);
    setBoard((prev) => {
      const remaining = prev.objects.filter((o) => !sel.has(o.id));
      const remIds = new Set(remaining.map((o) => o.id));
      const conns = prev.connectors.filter((c) => remIds.has(c.fromId) && remIds.has(c.toId));
      const nb = { ...prev, objects: remaining, connectors: conns };
      pushHistory(nb); return nb;
    });
    setSelection([]);
    notify("Đã xóa khối"); playWb("close");
  }, [selection, selectedConn, checkpoint, pushHistory, notify]);

  // ── Copy / Paste / Duplicate ──
  const clipboardRef = useRef(null);
  const handleCopy = useCallback(() => {
    if (!selection.length) return;
    const objs = board.objects.filter((o) => selection.includes(o.id));
    const cons = board.connectors.filter((c) => selection.includes(c.fromId) && selection.includes(c.toId));
    clipboardRef.current = { objects: JSON.parse(JSON.stringify(objs)), connectors: JSON.parse(JSON.stringify(cons)) };
    notify("Đã sao chép"); playWb("click");
  }, [selection, board.objects, board.connectors, notify]);

  const handlePaste = useCallback((atX = null, atY = null) => {
    const clip = clipboardRef.current;
    if (!clip || !clip.objects?.length) { notify("Chưa có gì để dán"); return; }
    checkpoint();
    const minX = Math.min(...clip.objects.map((o) => o.x));
    const minY = Math.min(...clip.objects.map((o) => o.y));
    const offsetX = atX != null ? atX - minX : 24;
    const offsetY = atY != null ? atY - minY : 24;
    const idMap = new Map();
    const newObjsRaw = clip.objects.map((o) => {
      const nid = uid("o");
      idMap.set(o.id, nid);
      return { ...o, id: nid, x: o.x + offsetX, y: o.y + offsetY, parentId: o.parentId && idMap.get(o.parentId) ? idMap.get(o.parentId) : null, groupId: null };
    });
    // sửa parentId sau khi đã có đủ map (tránh order bug)
    const newIds = new Set(newObjsRaw.map((o) => o.id));
    const fixedObjs = newObjsRaw.map((o) => {
      const origParent = clip.objects.find((co) => idMap.get(co.id) === o.id)?.parentId || null;
      const newParent = origParent ? idMap.get(origParent) || null : null;
      return { ...o, parentId: newParent && newIds.has(newParent) ? newParent : null };
    });
    const newConns = (clip.connectors || []).map((c) => ({ ...c, id: uid("c"), fromId: idMap.get(c.fromId), toId: idMap.get(c.toId) })).filter((c) => newIds.has(c.fromId) && newIds.has(c.toId));
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, ...fixedObjs], connectors: [...prev.connectors, ...newConns] };
      pushHistory(nb); return nb;
    });
    setSelection(fixedObjs.map((o) => o.id));
    notify("Đã dán"); playWb("open");
  }, [checkpoint, pushHistory, notify]);

  const handleDuplicateSel = useCallback(() => {
    if (!selection.length) { notify("Chọn khối để nhân bản"); return; }
    handleCopy();
    setTimeout(handlePaste, 0);
  }, [selection, handleCopy, handlePaste, notify]);

  const handleCopyIds = useCallback((ids) => {
    const objs = board.objects.filter((o) => ids.includes(o.id));
    const cons = board.connectors.filter((c) => ids.includes(c.fromId) && ids.includes(c.toId));
    clipboardRef.current = { objects: JSON.parse(JSON.stringify(objs)), connectors: JSON.parse(JSON.stringify(cons)) };
    notify("Đã sao chép"); playWb("click");
  }, [board.objects, board.connectors, notify]);

  const handleDuplicateIds = useCallback((ids) => {
    handleCopyIds(ids);
    setTimeout(() => handlePaste(), 0);
  }, [handleCopyIds, handlePaste]);

  const handleDeleteIds = useCallback((ids) => {
    const locked = ids.some((id) => board.objects.find((o) => o.id === id)?.locked);
    if (locked) { notify("Có khối bị khóa"); return; }
    checkpoint();
    const setIds = new Set(ids);
    setBoard((prev) => {
      const remaining = prev.objects.filter((o) => !setIds.has(o.id));
      const remIds = new Set(remaining.map((o) => o.id));
      const conns = prev.connectors.filter((c) => remIds.has(c.fromId) && remIds.has(c.toId));
      const nb = { ...prev, objects: remaining, connectors: conns };
      pushHistory(nb); return nb;
    });
    setSelection((prev) => prev.filter((id) => !setIds.has(id)));
    notify("Đã xóa");
  }, [board.objects, checkpoint, pushHistory, notify]);

  const handleChangeNoteColor = useCallback((id) => {
    const note = board.objects.find((o) => o.id === id);
    if (!note || note.kind !== "note") return;
    const colors = ["#fef9c3", "#dbeafe", "#dcfce7", "#ffe4e6", "#ede9fe", "#ffedd5"];
    const idx = colors.indexOf(note.fill);
    const next = colors[(idx + 1) % colors.length];
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.map((o) => o.id === id ? { ...o, fill: next } : o) };
      pushHistory(nb); return nb;
    });
    notify("Đã đổi màu");
  }, [board.objects, checkpoint, pushHistory, notify]);

  // ── Align / Distribute ──
  const handleAlign = useCallback((kind) => {
    if (selection.length < 2) { notify("Chọn ít nhất 2 khối"); return; }
    checkpoint();
    const objs = board.objects.filter((o) => selection.includes(o.id));
    if (!objs.length) return;
    const minX = Math.min(...objs.map((o) => o.x));
    const maxR = Math.max(...objs.map((o) => o.x + o.width));
    const minY = Math.min(...objs.map((o) => o.y));
    const maxB = Math.max(...objs.map((o) => o.y + o.height));
    const cx = (minX + maxR) / 2;
    const cy = (minY + maxB) / 2;
    const next = board.objects.map((o) => {
      if (!selection.includes(o.id)) return o;
      if (kind === "left") return { ...o, x: minX };
      if (kind === "right") return { ...o, x: maxR - o.width };
      if (kind === "center") return { ...o, x: cx - o.width / 2 };
      if (kind === "top") return { ...o, y: minY };
      if (kind === "bottom") return { ...o, y: maxB - o.height };
      if (kind === "middle") return { ...o, y: cy - o.height / 2 };
      return o;
    });
    setBoard((prev) => { const nb = { ...prev, objects: next }; pushHistory(nb); return nb; });
    notify("Đã căn chỉnh"); playWb("click");
  }, [selection, board.objects, checkpoint, pushHistory, notify]);

  const handleDistribute = useCallback((axis) => {
    if (selection.length < 3) { notify("Chọn ít nhất 3 khối"); return; }
    checkpoint();
    const objs = board.objects.filter((o) => selection.includes(o.id));
    // tính theo center point, có tính width/height để không chồng với node khác size
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
    const next = board.objects.map((o) => {
      if (!posMap.has(o.id)) return o;
      const p = posMap.get(o.id);
      return axis === "h" ? { ...o, x: p } : { ...o, y: p };
    });
    setBoard((prev) => { const nb = { ...prev, objects: next }; pushHistory(nb); return nb; });
    notify("Đã phân bố đều"); playWb("click");
  }, [selection, board.objects, checkpoint, pushHistory, notify]);

  // ── Collapse / Expand nhánh (giữ dữ liệu, chỉ ẩn khỏi canvas) ──
  const toggleCollapse = useCallback((id) => {
    const target = board.objects.find((o) => o.id === id);
    if (!target || target.kind !== "node") { notify("Chỉ node mới thu gọn được"); return; }
    const hasChildren = board.objects.some((o) => o.parentId === id);
    if (!hasChildren) { notify("Nhánh không có con"); return; }
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.map((o) => o.id === id ? { ...o, collapsed: !o.collapsed } : o) };
      pushHistory(nb); return nb;
    });
    notify(target.collapsed ? "Đã mở nhánh" : "Đã thu gọn nhánh");
  }, [board.objects, checkpoint, pushHistory, notify]);

  // ── Lock / Unlock ──
  const toggleLock = useCallback((id) => {
    const target = board.objects.find((o) => o.id === id);
    if (!target) return;
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.map((o) => o.id === id ? { ...o, locked: !o.locked } : o) };
      pushHistory(nb); return nb;
    });
    notify(target.locked ? "Đã mở khóa" : "Đã khóa");
  }, [board.objects, checkpoint, pushHistory, notify]);

  // ── Z-index ──
  const reorderZ = useCallback((ids, mode) => {
    checkpoint();
    setBoard((prev) => {
      const sorted = [...prev.objects].sort((a, b) => (a.z || 0) - (b.z || 0));
      const maxZ = Math.max(...sorted.map((o) => o.z || 0), 0);
      const minZ = Math.min(...sorted.map((o) => o.z || 0), 0);
      let next = [...prev.objects];
      if (mode === "front") {
        let z = maxZ + 1;
        next = next.map((o) => ids.includes(o.id) ? { ...o, z: z++ } : o);
      } else if (mode === "back") {
        let z = minZ - ids.length;
        next = next.map((o) => ids.includes(o.id) ? { ...o, z: z++ } : o);
      } else if (mode === "forward") {
        // tăng z thêm 1 so với max xung quanh
        next = next.map((o) => ids.includes(o.id) ? { ...o, z: (o.z || 0) + 10 } : o);
      } else if (mode === "backward") {
        next = next.map((o) => ids.includes(o.id) ? { ...o, z: (o.z || 0) - 10 } : o);
      }
      next.sort((a, b) => (a.z || 0) - (b.z || 0));
      // chuẩn hoá lại z liên tục
      next = next.map((o, i) => ({ ...o, z: i }));
      const nb = { ...prev, objects: next };
      pushHistory(nb); return nb;
    });
  }, [checkpoint, pushHistory]);

  // ── Style for selection ──
  const single = selection.length === 1 ? board.objects.find((o) => o.id === selection[0]) : null;
  const updateSingle = useCallback((patch) => {
    if (!single) return;
    checkpoint();
    setBoard((prev) => {
      const nb = {
        ...prev,
        objects: prev.objects.map((o) => {
          if (o.id !== single.id) return o;
          const merged = { ...o, ...patch };
          // box luôn chứa chữ: tự tăng kích thước hợp lý (giữ nguyên nếu đã đủ lớn)
          return ensureFits(merged);
        }),
      };
      pushHistory(nb);
      return nb;
    });
  }, [single, checkpoint, pushHistory]);

  // ── Image upload — Blob vào IndexedDB, board chỉ lưu imageId ──
  const handleImageFiles = useCallback(async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { notify("Ảnh quá lớn (>8MB)"); return; }
    try {
      const { saveImageBlob, blobToObjectURL } = await import("./imageStore.js");
      const blob = file.slice(0, file.size, file.type || "image/png");
      const imageId = await saveImageBlob(blob);
      const url = blobToObjectURL(blob);
      imageUrlMapRef.current.set(imageId, url);
      const img = new window.Image();
      img.onload = () => {
        const maxW = 320, maxH = 240;
        let w = img.width, h = img.height;
        const sc = Math.min(1, maxW / w, maxH / h);
        w = Math.round(w * sc); h = Math.round(h * sc);
        let cx, cy;
        if (pendingImagePos) {
          cx = pendingImagePos.wx; cy = pendingImagePos.wy;
          setPendingImagePos(null);
        } else {
          const svg = svgRef.current;
          const vbW = svg?.clientWidth || 900;
          const vbH = svg?.clientHeight || 600;
          cx = (-board.pan.x + vbW / 2) / board.zoom;
          cy = (-board.pan.y + vbH / 2) / board.zoom;
        }
        const obj = { ...blankObject("image"), x: cx - w / 2, y: cy - h / 2, width: w, height: h, src: url, imageId, text: "", fill: "#fff", stroke: "#e2e8f0", strokeWidth: 1 };
        checkpoint();
        setBoard((prev) => { const nb = { ...prev, objects: [...prev.objects, obj] }; pushHistory(nb); return nb; });
        setSelection([obj.id]);
        notify("Đã thêm ảnh"); playWb("success");
    trackWhiteboardAction("add_image");
      };
      img.onerror = () => notify("Không đọc được ảnh");
      img.src = url;
    } catch (e) {
      notify("Lưu ảnh thất bại: " + e.message);
    }
  }, [board.pan, board.zoom, checkpoint, pushHistory, notify, pendingImagePos]);

  const handleReplaceImage = useCallback(async (files) => {
    const file = files?.[0];
    if (!file || !replaceImageId) return;
    try {
      const { saveImageBlob, blobToObjectURL, deleteImageBlob } = await import("./imageStore.js");
      const old = board.objects.find((o) => o.id === replaceImageId);
      if (old?.imageId) { try { await deleteImageBlob(old.imageId); } catch {} }
      const blob = file.slice(0, file.size, file.type || "image/png");
      const imageId = await saveImageBlob(blob);
      const url = blobToObjectURL(blob);
      imageUrlMapRef.current.set(imageId, url);
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: prev.objects.map((o) => o.id === replaceImageId ? { ...o, imageId, src: url } : o) };
        pushHistory(nb); return nb;
      });
      notify("Đã thay ảnh");
    } catch (e) { notify("Thay ảnh thất bại: " + e.message); }
    setReplaceImageId(null);
  }, [replaceImageId, board.objects, checkpoint, pushHistory, notify]);

  // Resolve imageId -> objectURL khi load board (và revoke khi unmount)
  // FIX: blob: URL is ephemeral — persisted board now has src=null, must re-hydrate every time imageId exists.
  // Previously only !o.src was handled, so revoked blob: URL (persisted before fix) was never re-resolved → image lost on re-enter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const need = board.objects.filter((o) => {
        if (!o.imageId) return false;
        if (!o.src) return true;
        // If it's a blob: URL but doesn't match our active session map, it's stale/ephemeral from persistence
        if (o.src.startsWith("blob:") && o.src !== imageUrlMapRef.current.get(o.imageId)) return true;
        return false;
      });
      const ids = [...new Set(need.map((o) => o.imageId))];
      if (!ids.length) return;
      try {
        const { getImageBlob, blobToObjectURL } = await import("./imageStore.js");
        for (const id of ids) {
          // Nếu đã có URL trong map nhưng object src bị mất/null/stale thì gắn lại
          const existingUrl = imageUrlMapRef.current.get(id);
          if (existingUrl) {
            if (cancelled) continue;
            setBoard((prev) => {
              const needsPatch = prev.objects.some((o) => o.imageId === id && o.src !== existingUrl);
              if (!needsPatch) return prev;
              return { ...prev, objects: prev.objects.map((o) => o.imageId === id && o.src !== existingUrl ? { ...o, src: existingUrl } : o) };
            });
            continue;
          }
          const blob = await getImageBlob(id);
          if (!blob || cancelled) continue;
          const url = blobToObjectURL(blob);
          imageUrlMapRef.current.set(id, url);
          setBoard((prev) => ({ ...prev, objects: prev.objects.map((o) => o.imageId === id ? { ...o, src: url } : o) }));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [board.objects]);

  useEffect(() => () => {
    // revoke tất cả objectURL khi rời Whiteboard
    imageUrlMapRef.current.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} });
    imageUrlMapRef.current.clear();
  }, []);

  // Đóng context menu khi click ngoài hoặc Esc
  useEffect(() => {
    if (contextMenu?.kind === "canvas") { setAddMenuOpen(true); setViewMenuOpen(false); }
    else { setAddMenuOpen(false); setViewMenuOpen(false); }
  }, [contextMenu]);
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => setContextMenu(null);
    const onKey = (e) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("click", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", onDown); window.removeEventListener("keydown", onKey); };
  }, [contextMenu]);

  // ── Export handling ──
  const getViewForExport = useCallback(() => {
    const svg = svgRef.current;
    return { zoom: board.zoom, pan: { ...board.pan }, w: svg?.clientWidth || 1200, h: svg?.clientHeight || 800 };
  }, [board.zoom, board.pan]);

  const doExport = useCallback(async (kind) => {
    const svg = svgRef.current;
    if (!svg) return;
    const view = getViewForExport();
    try {
      if (kind === "svg") exportSVG(board, svg, exportScope, view);
      else if (kind === "json") exportJSON(board);
      else if (kind === "png") await exportRaster(board, svg, "png", exportScope, view);
      else if (kind === "jpg") await exportRaster(board, svg, "jpg", exportScope, view);
      else if (kind === "pdf") await exportPDF(board, svg, exportScope, view);
      notify("Đã xuất file"); playWb("success");
    } catch (e) { notify("Xuất thất bại: " + e.message); }
    setShowExport(false);
  }, [board, exportScope, getViewForExport, notify]);

  // ── Import JSON ──
  const handleImportJSON = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseBoardJSON(String(reader.result || ""));
      if (!res.ok) { notify(res.error); return; }
      const incoming = res.board;
      // merge or replace? We replace current board content but keep current board id/name
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: [...prev.objects, ...incoming.objects], connectors: [...prev.connectors, ...incoming.connectors] };
        // remap imported ids to avoid collision already handled in parse
        pushHistory(nb); return nb;
      });
      notify(`Đã nhập ${incoming.objects.length} khối`);
    };
    reader.readAsText(file);
  }, [checkpoint, pushHistory, notify]);

  // ── Import Word (.docx) -> thêm khối vào board ──
  const [docxBusy, setDocxBusy] = useState(false);
  const handleImportDocx = useCallback(async (file) => {
    if (!file || docxBusy) return;
    setDocxBusy(true);
    try {
      const { importDocxToBoard } = await import("./wordBoard.js");
      const { cx, cy } = findFreeSpot(520, 600);
      const { objects, connectors, title, blockCount } = await importDocxToBoard(file, { cx, cy });
      if (!objects.length) { notify("File Word không có nội dung để nhập"); return; }
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: [...prev.objects, ...objects], connectors: [...prev.connectors, ...connectors] };
        pushHistory(nb); return nb;
      });
      if (objects[0]) setSelection([objects[0].id]);
      setTool("select");
      notify(`Đã nhập Word “${String(title).slice(0, 28)}” — ${objects.length} khối (${blockCount} đoạn)`);
      playWb("success");
      trackWhiteboardAction("import_docx", { blocks: blockCount, objects: objects.length });
    } catch (e) {
      notify(e?.message || "Nhập Word thất bại");
    } finally {
      setDocxBusy(false);
      setShowExport(false);
    }
  }, [checkpoint, pushHistory, notify, findFreeSpot, playWb, docxBusy]);

  // ── Export board -> Word (.docx) ──
  const handleExportDocx = useCallback(async () => {
    try {
      const { exportBoardToDocx } = await import("./wordBoard.js");
      const res = await exportBoardToDocx(board);
      notify(`Đã xuất Word: ${res.file}`);
      playWb("success");
      trackWhiteboardAction("export_docx", { blocks: res.blocks });
    } catch (e) {
      notify(e?.message || "Xuất Word thất bại");
    } finally {
      setShowExport(false);
    }
  }, [board, notify, playWb]);

  // ── AI mindmap: sinh plan (bám nguồn, không bịa) → preview trên modal ──
  const handleAIGenerate = useCallback(async () => {
    const topic = aiTopic.trim();
    const textBody = aiText.trim();
    const ideas = aiSmallIdeas.map((s) => s.trim()).filter(Boolean);
    if (!topic && !textBody && !aiImageFile && !ideas.length) {
      setAiError("Nhập chủ đề, dán văn bản hoặc chọn ảnh để tạo sơ đồ.");
      return;
    }
    setAiBusy(true);
    setAiError("");
    try {
      const { generateMindmapPlan } = await import("./aiMindmapService.js");
      const res = await generateMindmapPlan({
        topic,
        text: textBody,
        imageFile: aiImageFile,
        smallIdeas: ideas,
      });
      if (!res?.plan?.branches?.length) {
        setAiError("Không tạo được sơ đồ từ nội dung này. Hãy bổ sung nguồn chi tiết hơn.");
        return;
      }
      setAiPlan(res.plan);
      setAiMeta({ mode: res.mode, warnings: res.warnings || [], checked: !!res.checked });
      setAiStage("preview");
    } catch (e) {
      setAiError(e?.message || "AI tạo sơ đồ thất bại. Thử lại nhé!");
    } finally {
      setAiBusy(false);
    }
  }, [aiTopic, aiText, aiImageFile, aiSmallIdeas]);

  // ── Đưa plan từ preview xuống canvas ──
  const closeAIModal = useCallback(() => {
    setShowAI(false);
    setAiStage("form");
    setAiPlan(null);
    setAiMeta(null);
    setAiError("");
  }, []);

  const handleAIApply = useCallback(() => {
    if (!aiPlan) return;
    if (!aiPlan.branches.length) { setAiError("Sơ đồ còn trống — hãy thêm ít nhất 1 nhánh."); return; }
    const { cx, cy } = findFreeSpot(700, 500);
    const graph = aiPlanToGraph(aiPlan, cx, cy);
    if (!graph) { setAiError("Không tạo được sơ đồ từ kết quả preview."); return; }
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, ...graph.objects], connectors: [...prev.connectors, ...graph.connectors] };
      pushHistory(nb); return nb;
    });
    trackWhiteboardAction("ai_mindmap_create", {
      mode: aiMeta?.mode || "ai",
      branches: aiPlan.branches.length,
      checked: !!aiMeta?.checked,
    });
    closeAIModal();
    notify(aiMeta?.mode === "local" ? "Đã tạo sơ đồ từ văn bản của bạn" : "AI đã tạo sơ đồ");
    playWb("success");
  }, [aiPlan, aiMeta, findFreeSpot, checkpoint, pushHistory, notify, playWb, closeAIModal]);

  // ── Sửa plan trong preview (nhãn, con, nhánh) ──
  const editAiPlan = useCallback((updater) => {
    setAiPlan((p) => {
      if (!p) return p;
      const next = typeof updater === "function" ? updater({ ...p, branches: p.branches.map((b) => ({ ...b, children: [...b.children] })) }) : updater;
      return next;
    });
  }, []);

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch { notify("Trình duyệt chặn fullscreen"); }
  }, [notify]);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Ghi nhớ trạng thái thu gọn thanh công cụ / topbar
  useEffect(() => {
    safeSetString("sgk:whiteboard-toolbar-collapsed", toolbarCollapsed ? "1" : "0");
  }, [toolbarCollapsed]);
  useEffect(() => {
    safeSetString("sgk:whiteboard-topbar-collapsed", topbarCollapsed ? "1" : "0");
  }, [topbarCollapsed]);
  useEffect(() => {
    safeSetString("sgk:whiteboard-focus", focusMode ? "1" : "0");
  }, [focusMode]);
  useEffect(() => {
    if (!showBoardList) return;
    const onKey = (e) => { if (e.key === "Escape") setShowBoardList(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBoardList]);

  // ── Fit to screen ──
  const fitToScreen = useCallback(() => {
    if (!board.objects.length) { setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } })); return; }
    const bb = boardBounds(board.objects, 80);
    const svg = svgRef.current;
    const vw = svg?.clientWidth || 900;
    const vh = svg?.clientHeight || 600;
    const zx = vw / bb.w;
    const zy = vh / bb.h;
    const nz = Math.min(1.4, Math.max(0.3, Math.min(zx, zy) * 0.92));
    const nx = vw / 2 - (bb.x + bb.w / 2) * nz;
    const ny = vh / 2 - (bb.y + bb.h / 2) * nz;
    setBoard((p) => ({ ...p, zoom: nz, pan: { x: nx, y: ny } }));
    notify("Đã vừa màn hình"); playWb("click");
  }, [board.objects, notify]);

  // ── Keyboard shortcuts (không override khi đang gõ) ──
  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");
      // Global WB shortcuts scope: chỉ khi whiteboard đang hiển thị — liên kết với Settings
      if (matchesShortcut(e, getShortcut("whiteboard.delete")) || e.key === "Delete" || e.key === "Backspace") {
        if (!typing) { e.preventDefault(); deleteSelection(); playWb("close"); }
        return;
      }
      if (matchesShortcut(e, getShortcut("whiteboard.undo")) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey)) {
        if (!typing) { e.preventDefault(); if (canUndo) { applyHistory(histIdxRef.current - 1); playWb("click"); } }
        return;
      }
      if (matchesShortcut(e, getShortcut("whiteboard.redo")) || ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)))) {
        if (!typing) { e.preventDefault(); if (canRedo) { applyHistory(histIdxRef.current + 1); playWb("click"); } }
        return;
      }
      if (matchesShortcut(e, getShortcut("whiteboard.copy")) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !typing)) { e.preventDefault(); handleCopy(); playWb("click"); return; }
      if (matchesShortcut(e, getShortcut("whiteboard.paste")) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !typing)) { e.preventDefault(); handlePaste(); playWb("open"); return; }
      if (matchesShortcut(e, getShortcut("whiteboard.duplicate")) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && !typing)) { e.preventDefault(); handleDuplicateSel(); playWb("open"); return; }
      if (matchesShortcut(e, getShortcut("whiteboard.save")) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !typing)) {
        e.preventDefault();
        try { persistBoard(board); setBoards(listBoards()); setSaveState("saved"); setSavedAt(new Date()); notify("Đã lưu"); playWb("save"); } catch {}
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !typing) {
        e.preventDefault(); setSelection(board.objects.map((o) => o.id)); return;
      }
      if (!typing) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
          e.preventDefault();
          if (e.shiftKey) handleUngroup(); else handleGroup();
          playWb(e.shiftKey ? "close" : "success");
          return;
        }
        if (selection.length && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          checkpoint();
          setBoard((prev) => {
            const nextObjs = prev.objects.map((o) => selection.includes(o.id) ? { ...o, x: o.x + dx, y: o.y + dy } : o);
            const nb = { ...prev, objects: nextObjs };
            pushHistory(nb);
            return nb;
          });
          return;
        }
        if (e.key === "F2" && single && !single.locked) { e.preventDefault(); setRequestEditId(single.id); return; }
        if (matchesShortcut(e, getShortcut("whiteboard.select")) || e.key === "1") setTool("select");
        else if (matchesShortcut(e, getShortcut("whiteboard.pan")) || e.code === "Space") setTool("pan");
        else if (matchesShortcut(e, getShortcut("whiteboard.pen")) || e.key === "2") setTool("pen");
        else if (matchesShortcut(e, getShortcut("whiteboard.text")) || e.key === "3") setTool("text");
        else if (matchesShortcut(e, getShortcut("whiteboard.shape")) || e.key === "4") setTool("shape");
        else if (matchesShortcut(e, getShortcut("whiteboard.connector")) || e.key === "5") setTool("connector");
        else if (e.key === "Escape") { setSelection([]); setSelectedConn(null); setContextMenu(null); setShowCanvasOpts(false); setShowCreateMenu(false); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, canUndo, canRedo, deleteSelection, applyHistory, handleCopy, handlePaste, handleDuplicateSel, handleGroup, handleUngroup, checkpoint, selection, notify, playWb]);

  // ── Hook nhận nội dung từ module khác — giàu ngữ cảnh book ↔ board ──
  const openSourceFromRef = useCallback((ref) => {
    if (!ref?.filename) { notify("Khối này không gắn nguồn sách"); return; }
    try {
      // Chỉ dispatch open-source — App.jsx (useEffect "sgk:open-source") sẽ mở sách.
      // KHÔNG dispatch kèm "sgk:navigate": 2 event đồng bộ bị React batch,
      // closeBook() set currentBook=null ghi đè handleOpenBook() -> sách "mở rồi đóng ngay".
      appEvents.emit(AppEvents.OPEN_SOURCE, { filename: ref.filename, page: ref.page || 1 });
      playWb("open");
    } catch {}
  }, [notify, playWb]);

  // Dedup guard: BookReader trước emit 3 lần (direct + integration + queue) → lặp ảnh cực nặng. Giữ Map các payload đã xử lý 5s theo content hash.
  const recentPayloadRef = useRef(new Map());
  const isDuplicatePayload = useCallback((detail) => {
    if (!detail) return true;
    const contentKey = `${detail.title || ""}|${(detail.text || "").slice(0, 60)}|${detail.imageDataUrl ? "img:" + detail.imageDataUrl.slice(0, 40) : ""}|${detail.sourceRef?.filename || ""}|${detail.sourceRef?.page || ""}|${detail.mindmapBranches ? "mm:" + detail.mindmapBranches.length : ""}`;
    const now = Date.now();
    // dọn quá hạn 5s
    for (const [k, t] of recentPayloadRef.current) if (now - t > 5000) recentPayloadRef.current.delete(k);
    if (recentPayloadRef.current.has(contentKey)) return true;
    recentPayloadRef.current.set(contentKey, now);
    setTimeout(() => recentPayloadRef.current.delete(contentKey), 5000);
    // cũng track at để pending dedup
    if (detail.at) recentPayloadRef.current.set(String(detail.at), now);
    return false;
  }, []);

  useEffect(() => {
    const onSend = async (e) => {
      const detail = e.detail ?? e; // hỗ trợ cả appEvents (detail trực tiếp) và window (e.detail)
      if (!detail || (!detail.text && !detail.imageDataUrl && !detail.title)) return;
      if (isDuplicatePayload(detail)) return;
      // Live event đã xử lý → xóa pending trùng để thoát/ra vào lại không replay → tránh lặp + nặng
      try {
        const p = safeGetJSON(WB_PENDING_KEY, null);
        if (p) {
          const sameContent = p && p.title === detail.title && (p.text || "").slice(0,60) === (detail.text || "").slice(0,60) && !!p.imageDataUrl === !!detail.imageDataUrl;
          if (sameContent || (p.at && detail.at && String(p.at) === String(detail.at))) safeRemove(WB_PENDING_KEY);
        }
      } catch {}
      const title = String(detail.title || detail.text || "Nội dung").slice(0, 80);
      const sourceRef = detail.sourceRef || null;
      const citation = sourceRef?.citation || detail.citation || "";
      const hasImage = !!detail.imageDataUrl;
      const hasMindmap = Array.isArray(detail.mindmapBranches) && detail.mindmapBranches.length >= 2;
      checkpoint();
      const { cx, cy } = findFreeSpot(520, 340);

      // 1) Ảnh scan → tạo node ảnh + note chữ (nếu có)
      if (hasImage) {
        try {
          const res = await fetch(detail.imageDataUrl);
          const blob = await res.blob();
          const { saveImageBlob, blobToObjectURL } = await import("./imageStore.js");
          const imageId = await saveImageBlob(blob);
          const url = blobToObjectURL(blob);
          imageUrlMapRef.current.set(imageId, url);
          const img = new window.Image();
          await new Promise((res2, rej) => { img.onload = res2; img.onerror = rej; img.src = url; });
          let w = img.width, h = img.height;
          const sc = Math.min(1, 320 / w, 240 / h);
          w = Math.round(w * sc); h = Math.round(h * sc);
          const imgObj = { ...blankObject("image"), x: cx - w/2, y: cy - h/2 - 90, width: w, height: h, src: url, imageId, sourceRef, citation, text: "" };
          const noteText = String(detail.text || "").slice(0, 800);
          const noteObj = noteText ? { ...blankObject("note"), x: cx - 150, y: cy + h/2 + 20, width: 300, height: 140, text: noteText, fill: "#fef9c3", stroke: "#facc15", sourceRef, citation } : null;
          setBoard((prev) => {
            const objs = noteObj ? [imgObj, ensureFits(noteObj)] : [imgObj];
            const nb = { ...prev, objects: [...prev.objects, ...objs] };
            pushHistory(nb); return nb;
          });
          setSelection([imgObj.id]);
          notify(`Đã đưa ảnh scan “${title.slice(0, 24)}” vào Whiteboard`); playWb("success"); trackWhiteboardAction("add_image_from_book", { filename: sourceRef?.filename });
          return;
        } catch (err) {
          console.error("send image to board failed", err);
          // fallback to text
        }
      }

      // 2) Mindmap từ trích đoạn dài (3+ dòng)
      if (hasMindmap) {
        const branches = detail.mindmapBranches.map((l) => ({ label: String(l).slice(0, 30), children: [] }));
        const { objects, connectors } = generateMindmap(title, branches, { cx, cy });
        if (objects.length && sourceRef) { objects[0].sourceRef = sourceRef; objects[0].citation = citation; }
        // gắn citation vào tất cả nhánh con
        objects.forEach((o) => { if (!o.sourceRef && sourceRef) o.sourceRef = sourceRef; });
        setBoard((prev) => {
          const nb = { ...prev, objects: [...prev.objects, ...objects], connectors: [...prev.connectors, ...connectors] };
          pushHistory(nb); return nb;
        });
        if (objects[0]) setSelection([objects[0].id]);
        notify(`Đã tạo mindmap “${title.slice(0, 24)}” từ SGK`); playWb("success"); trackWhiteboardAction("create_mindmap_from_book", { filename: sourceRef?.filename });
        return;
      }

      // 3) Mặc định: node tiêu đề + note chi tiết, giữ sourceRef để quay lại sách
      const obj = { ...blankObject("node"), x: cx - 130, y: cy - 36, width: 260, height: 72, text: title, fill: "#eef2ff", color: "#1e293b", stroke: "#6366f1", strokeWidth: 1.5, fontSize: 14, sourceRef, citation };
      const note = detail.text && String(detail.text).slice(0, 800) !== title ? { ...blankObject("note"), x: cx - 150, y: cy + 60, width: 300, height: 140, text: String(detail.text).slice(0, 800), fill: "#fef9c3", stroke: "#facc15", sourceRef, citation } : null;
      setBoard((prev) => {
        const objs = note ? [ensureFits(obj), ensureFits(note)] : [ensureFits(obj)];
        const nb = { ...prev, objects: [...prev.objects, ...objs] };
        pushHistory(nb); return nb;
      });
      setSelection([obj.id]);
      notify(`Đã đưa “${title.slice(0, 24)}” vào Whiteboard${citation ? ` · ${citation.slice(0, 40)}` : ""}`);
      if (sourceRef?.filename) trackWhiteboardAction("add_from_book", { filename: sourceRef.filename, page: sourceRef.page });
    };
    // Lắng nghe qua unified bus (MODEL A) — tự nhận cả legacy window dispatch qua bridge, dedup bằng isDuplicatePayload
    const offBus = appEvents.on(AppEvents.SEND_TO_WHITEBOARD, (detail) => onSend({ detail }));
    // Fallback legacy window listener (giữ để nhận event từ code chưa migrate) — cũng dedup
    const onWindowSend = (e) => onSend(e);
    window.addEventListener("sgk:send-to-whiteboard", onWindowSend);
    // pending payload từ localStorage — chỉ xử lý nếu chưa từng xử lý live event (dedup bằng at)
    try {
      const p = safeGetJSON(WB_PENDING_KEY, null);
      if (p && (p.text || p.imageDataUrl || p.title)) {
          // Nếu live event vừa xử lý (cùng content) thì bỏ pending để tránh lặp — dùng contentKey giống isDuplicatePayload
          const contentKey = `${p.title || ""}|${(p.text || "").slice(0, 60)}|${p.imageDataUrl ? "img:" + p.imageDataUrl.slice(0, 40) : ""}|${p.sourceRef?.filename || ""}|${p.sourceRef?.page || ""}`;
          const isDup = recentPayloadRef.current.has(contentKey) || (p.at && recentPayloadRef.current.has(String(p.at)));
          safeRemove(WB_PENDING_KEY);
          if (!isDup) setTimeout(() => onSend({ detail: p }), 300);
      }
    } catch {}
    return () => { try { offBus(); } catch {} window.removeEventListener("sgk:send-to-whiteboard", onWindowSend); };
  }, [checkpoint, pushHistory, notify, findFreeSpot, playWb, isDuplicatePayload]);

  // Sync rename draft when board changes
  useEffect(() => { setRenameDraft(board?.name || ""); }, [board?.id, board?.name]);

  // Tự dọn các note placeholder “Trang này dạng ảnh …” còn sót từ bản cũ
  useEffect(() => {
    if (!board) return;
    const PH = "Trang này dạng ảnh";
    const hasPh = board.objects.some((o) => o.text && String(o.text).includes(PH));
    if (!hasPh) return;
    const cleaned = board.objects.filter((o) => !(o.text && String(o.text).includes(PH)));
    if (cleaned.length === board.objects.length) return;
    // Thay thế placeholder bằng ghi chú rỗng sẽ bị ẩn, nên xóa luôn object note đó
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.filter((o) => !(o.text && String(o.text).includes(PH))) };
      // giữ history để có thể undo
      pushHistory(nb);
      return nb;
    });
    setTimeout(() => notify("Đã dọn ghi chú placeholder trang ảnh — lần sau trang ảnh sẽ gửi ảnh thay vì chữ"), 400);
  }, [board?.id]);

  const filteredBoards = useMemo(() => {
    const q = searchBoard.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => b.name.toLowerCase().includes(q));
  }, [boards, searchBoard]);

  // Visible objects: ẩn con của node collapsed nhưng không xóa dữ liệu
  const { visibleObjects, visibleConnectors, collapsedCount, collapsedMap } = useMemo(() => {
    const collapsedIds = new Set(board.objects.filter((o) => o.collapsed).map((o) => o.id));
    if (!collapsedIds.size) return { visibleObjects: board.objects, visibleConnectors: board.connectors, collapsedCount: 0, collapsedMap: new Map() };
    const hidden = new Set();
    const childrenMap = new Map();
    board.objects.forEach((o) => { if (o.parentId) { if (!childrenMap.has(o.parentId)) childrenMap.set(o.parentId, []); childrenMap.get(o.parentId).push(o.id); } });
    const queue = [...collapsedIds];
    while (queue.length) {
      const cur = queue.shift();
      const kids = childrenMap.get(cur) || [];
      kids.forEach((k) => { if (!hidden.has(k)) { hidden.add(k); queue.push(k); } });
    }
    const map = new Map();
    collapsedIds.forEach((id) => {
      let cnt = 0;
      const stack = [id];
      const seen = new Set([id]);
      while (stack.length) {
        const cur = stack.pop();
        const kids = childrenMap.get(cur) || [];
        kids.forEach((k) => { if (!hidden.has(k) && !seen.has(k)) {} // placeholder
        });
        kids.forEach((k) => { if (hidden.has(k) && !seen.has(k)) { cnt++; seen.add(k); stack.push(k); } else if (hidden.has(k)) { /* already counted */ } });
      }
      // simpler: count hidden descendants
      const desc = getDescendantIds(board.objects, id);
      cnt = desc.filter((did) => hidden.has(did)).length;
      map.set(id, cnt);
    });
    return {
      visibleObjects: board.objects.filter((o) => !hidden.has(o.id)),
      visibleConnectors: board.connectors.filter((c) => !hidden.has(c.fromId) && !hidden.has(c.toId)),
      collapsedCount: hidden.size,
      collapsedMap: map,
    };
  }, [board.objects, board.connectors]);

  const zoomPct = board ? Math.round(board.zoom * 100) : 100;

  const quickBarPos = useMemo(() => {
    if (!board || contextMenu) return null;
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (selection.length === 1 && single) {
      const obj = single;
      const sx = obj.x * board.zoom + board.pan.x + r.left;
      const sy = obj.y * board.zoom + board.pan.y + r.top;
      const barW = 260, barH = 36;
      let left = sx + (obj.width * board.zoom) / 2 - barW / 2;
      let top = sy - barH - 10;
      left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));
      if (top < r.top + 4) top = sy + obj.height * board.zoom + 10;
      top = Math.max(8, Math.min(top, window.innerHeight - barH - 8));
      return { left, top };
    }
    if (selection.length > 1) {
      const objs = visibleObjects.filter((o) => selection.includes(o.id));
      if (!objs.length) return null;
      const minX = Math.min(...objs.map((o) => o.x));
      const minY = Math.min(...objs.map((o) => o.y));
      const maxX = Math.max(...objs.map((o) => o.x + o.width));
      const sx = minX * board.zoom + board.pan.x + r.left;
      const sy = minY * board.zoom + board.pan.y + r.top;
      const w = (maxX - minX) * board.zoom;
      const barW = 280, barH = 36;
      let left = sx + w / 2 - barW / 2;
      let top = sy - barH - 10;
      left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));
      if (top < r.top + 4) top = sy + Math.max(...objs.map((o) => o.height)) * board.zoom + 10;
      return { left, top };
    }
    return null;
  }, [board, single, selection, visibleObjects, contextMenu]);

  if (!board) return <div className="whiteboard-root" style={{ padding: 24 }}>Đang tải bảng…</div>;

  return (
    <div className={`whiteboard-root ${focusMode ? "is-focus" : ""}`} ref={rootRef}>
      {/* Unibar — gộp header + topbar thành 1 hàng duy nhất để tối đa canvas */}
      {!focusMode && (
      <div className="whiteboard-unibar">
        <div className="wb-uni-left">
          <input className="whiteboard-title-input wb-uni-title" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={handleRename} onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }} placeholder="Tên bảng" />
          <span className={`whiteboard-save-dot ${saveState === "saving" ? "is-saving" : "is-saved"}`} title={saveState === "saving" ? "Đang lưu…" : savedAt ? `Đã lưu lúc ${savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Đã lưu"}>●</span>
          <div className="wb-sep-v" />
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => { if (canUndo) applyHistory(histIdxRef.current - 1); }} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)"><Undo2 size={14} /></button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => { if (canRedo) applyHistory(histIdxRef.current + 1); }} disabled={!canRedo} title="Làm lại (Ctrl+Y)"><Redo2 size={14} /></button>
          <div className="wb-sep-v" />
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => setBoard((p) => ({ ...p, zoom: Math.max(0.2, p.zoom / 1.15) }))} title="Thu nhỏ"><ZoomOut size={14} /></button>
          <button className="whiteboard-zoom-label wb-zoom-btn" onClick={() => setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } }))} title="Về 100%">{zoomPct}%</button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => setBoard((p) => ({ ...p, zoom: Math.min(3, p.zoom * 1.15) }))} title="Phóng to"><ZoomIn size={14} /></button>
          {!topbarCollapsed && (
            <>
              <button className="btn btn-ghost btn-xs wb-tbtn" onClick={fitToScreen} title="Vừa màn hình"><Maximize2 size={14} /></button>
              <button className="btn btn-ghost btn-xs wb-tbtn" onClick={toggleFullscreen} title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}>{isFullscreen ? <Shrink size={14} /> : <Expand size={14} />}</button>
            </>
          )}
          <button className="wb-collapse-btn" onClick={() => setTopbarCollapsed((v) => !v)} title={topbarCollapsed ? "Hiện thêm nút" : "Bớt nút"} aria-label="Bớt nút">{topbarCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}</button>
        </div>
        <div className="wb-uni-right">
          {collapsedCount > 0 && <span className="whiteboard-check wb-hidden-badge" title="Số node đang ẩn">{collapsedCount}</span>}
          <div className="whiteboard-canvasopts-wrap">
            <button className={`btn btn-ghost btn-sm wb-hbtn ${board.grid || board.snap || board.smartAlign || board.smartSpacing ? "is-on" : ""}`} onClick={() => setShowCanvasOpts((v) => !v)} title="Tùy chọn canvas: lưới, bắt lưới, căn thông minh…"><SlidersHorizontal size={15} /></button>
            {showCanvasOpts && (
              <>
                <div className="wb-popover-backdrop" onClick={() => setShowCanvasOpts(false)} />
                <div className="wb-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="wb-popover-title">Hiển thị & Canvas</div>
                  <label className={`wb-opt-row ${branchDrag ? "is-on" : ""}`} title="Kéo node cha sẽ kéo cả nhánh con">
                    <input type="checkbox" className="wb-opt-check" checked={branchDrag} onChange={(e) => setBranchDrag(e.target.checked)} />
                    <span className="wb-opt-icon"><Network size={14} /></span>
                    <span className="wb-opt-text">Cả nhánh</span>
                  </label>
                  <label className={`wb-opt-row ${board.grid ? "is-on" : ""}`} title="Hiện lưới">
                    <input type="checkbox" className="wb-opt-check" checked={!!board.grid} onChange={(e) => setBoard((p) => ({ ...p, grid: e.target.checked }))} />
                    <span className="wb-opt-icon"><Grid3X3 size={14} /></span>
                    <span className="wb-opt-text">Lưới</span>
                  </label>
                  <label className={`wb-opt-row ${board.snap ? "is-on" : ""}`} title="Bắt điểm lưới">
                    <input type="checkbox" className="wb-opt-check" checked={!!board.snap} onChange={(e) => setBoard((p) => ({ ...p, snap: e.target.checked }))} />
                    <span className="wb-opt-icon"><Magnet size={14} /></span>
                    <span className="wb-opt-text">Bắt lưới</span>
                  </label>
                  <label className={`wb-opt-row ${board.smartAlign ? "is-on" : ""}`} title="Tự căn chỉnh các khối">
                    <input type="checkbox" className="wb-opt-check" checked={!!board.smartAlign} onChange={(e) => setBoard((p) => ({ ...p, smartAlign: e.target.checked }))} />
                    <span className="wb-opt-icon"><AlignCenter size={14} /></span>
                    <span className="wb-opt-text">Căn thông minh</span>
                  </label>
                  <label className={`wb-opt-row ${board.smartSpacing ? "is-on" : ""}`} title="Tự giãn cách đều các khối">
                    <input type="checkbox" className="wb-opt-check" checked={!!board.smartSpacing} onChange={(e) => setBoard((p) => ({ ...p, smartSpacing: e.target.checked }))} />
                    <span className="wb-opt-icon"><AlignJustify size={14} /></span>
                    <span className="wb-opt-text">Giãn cách đều</span>
                  </label>
                  <div className="wb-opts-divider" />
                  <div className="wb-opts-footer">
                    <span className="wb-popover-label">Sắp xếp tự động</span>
                    <select className="form-control wb-popover-select" value="none" onChange={(e) => { if (e.target.value !== "none") { doAutoLayout(e.target.value); e.target.value = "none"; setShowCanvasOpts(false); } }}>
                      <option value="none">Chọn kiểu sắp xếp…</option>
                      {LAYOUT_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="whiteboard-board-wrap">
            <button className="btn btn-secondary btn-sm wb-hbtn" onClick={() => setShowBoardList((v) => !v)} title="Danh sách bảng — chuyển bảng, đổi tên, nhân bản"><LayoutTemplate size={14} /></button>
            {showBoardList && (
              <>
                <div className="whiteboard-board-backdrop" onClick={() => setShowBoardList(false)} />
                <div className="whiteboard-board-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="whiteboard-drawer-head">
                    <strong>Bảng của bạn</strong>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowBoardList(false)}><X size={14} /></button>
                  </div>
                  <div className="whiteboard-drawer-search">
                    <Search size={14} /><input value={searchBoard} onChange={(e) => setSearchBoard(e.target.value)} placeholder="Tìm bảng…" />
                  </div>
                  <div className="whiteboard-drawer-list">
                    {filteredBoards.map((b) => (
                      <div key={b.id} className={`whiteboard-drawer-item ${b.id === activeId ? "active" : ""}`} onClick={() => switchBoard(b.id)}>
                        <span className="whiteboard-drawer-name">{b.name}</span>
                        <span className="whiteboard-drawer-date">{new Date(b.updatedAt).toLocaleString("vi-VN")}</span>
                      </div>
                    ))}
                  </div>
                  <div className="whiteboard-drawer-actions">
                    <button className="btn btn-secondary btn-sm" onClick={handleDuplicateBoard}><Copy size={12} /> Nhân bản</button>
                    <button className="btn btn-danger btn-sm" onClick={handleDeleteBoard}><Trash2 size={12} /> Xóa bảng</button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon" onClick={handleNewBoard} title="Tạo bảng mới"><FilePlus size={15} /></button>
          <button className="btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon" onClick={() => { try { persistBoard(board); notifyBoardsUpdate(); setBoards(listBoards()); setSaveState("saved"); setSavedAt(new Date()); notify("Đã lưu"); } catch {} }} title="Lưu ngay (Ctrl+S)"><Save size={15} /></button>
          <div className="whiteboard-export-wrap">
            <button className="btn btn-primary btn-sm wb-hbtn wb-hbtn--primary" onClick={() => setShowExport((v) => !v)} title="Xuất / nhập file"><Download size={14} /></button>
            {showExport && (
              <div className="whiteboard-export-menu">
                <div className="whiteboard-export-scope">
                  <label><input type="radio" checked={exportScope === "content"} onChange={() => setExportScope("content")} /> Chỉ vùng nội dung</label>
                  <label><input type="radio" checked={exportScope === "all"} onChange={() => setExportScope("all")} /> Toàn bộ canvas</label>
                </div>
                <button onClick={() => doExport("png")}>PNG</button>
                <button onClick={() => doExport("jpg")}>JPG</button>
                <button onClick={() => doExport("svg")}>SVG</button>
                <button onClick={() => doExport("pdf")}>PDF</button>
                <button onClick={() => doExport("json")}>JSON</button>
                <button onClick={handleExportDocx} title="Xuất ra Word (.docx): mỗi khối thành một ô bảng giữ màu nền/viền, bấm vào ô để sửa chữ">📝 Word (.docx) — giữ khối</button>
                <div className="whiteboard-export-divider" />
                <button onClick={() => jsonInputRef.current?.click()}><Upload size={12} /> Import JSON</button>
                <button onClick={() => docxInputRef.current?.click()} disabled={docxBusy} title="Nhập file Word (.docx): headings thành nhánh, lists thành nodes con, ảnh chèn vào bảng"><Upload size={12} /> {docxBusy ? "Đang nhập Word…" : "Nhập Word (.docx)"}</button>
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon" onClick={() => setFocusMode(true)} title="Chế độ tập trung — ẩn thanh trên, tối đa canvas"><Eye size={15} /></button>
          <input ref={jsonInputRef} type="file" accept=".json,application/json" hidden onChange={(e) => { handleImportJSON(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={docxInputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => { handleImportDocx(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={replaceImageRef} type="file" accept="image/*" hidden onChange={(e) => { handleReplaceImage(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
      )}
      {focusMode && (
        <div className="wb-focus-pill" title={board?.name || "Bảng trắng"}>
          <span className="wb-focus-name">{board?.name || "Bảng"}</span>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => { if (canUndo) applyHistory(histIdxRef.current - 1); }} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)"><Undo2 size={13} /></button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => { if (canRedo) applyHistory(histIdxRef.current + 1); }} disabled={!canRedo} title="Làm lại (Ctrl+Y)"><Redo2 size={13} /></button>
          <button className="whiteboard-zoom-label wb-zoom-btn" onClick={() => setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } }))} title="Về 100%">{zoomPct}%</button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => setFocusMode(false)} title="Hiện lại thanh công cụ"><EyeOff size={13} /></button>
        </div>
      )}

      {single?.sourceRef && (
        <div className="whiteboard-source-chip" title={single.sourceRef.citation || single.sourceRef.title}>
          <span className="wb-source-text">📖 <strong>{single.sourceRef.citation || `${single.sourceRef.title} — tr.${single.sourceRef.bookPage || single.sourceRef.page}`}</strong>{single.sourceRef.chapter ? ` · ${single.sourceRef.chapter}` : ""}</span>
          <button className="btn btn-primary btn-xs" onClick={() => openSourceFromRef(single.sourceRef)} title="Mở sách tại trang nguồn"><BookOpen size={12} /></button>
          <button className="btn btn-ghost btn-xs" onClick={() => {
            const id = single.id;
            checkpoint();
            setBoard((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === id ? { ...o, sourceRef: null, citation: "" } : o) }));
            notify("Đã gỡ liên kết nguồn");
          }} title="Gỡ liên kết nguồn"><X size={12} /></button>
        </div>
      )}
      <div className="whiteboard-body" style={{ position: "relative" }}>
        {wbDrag && (
          <div className="global-drag-overlay" aria-hidden="true"><span>Thả ảnh để chèn • .json / .docx để nhập bảng</span></div>
        )}
        {/* Canvas — trung tâm, chiếm phần lớn. Hỗ trợ kéo-thả: ảnh → chèn, .json/.docx → nhập */}
        <div className="whiteboard-canvas-area" style={{ position: "relative" }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); try { const t = e.dataTransfer?.types; const has = t ? (Array.isArray(t) ? t.includes("Files") : [...t].includes("Files")) : false; if (!has) return; } catch {} wbDragRef.current += 1; setWbDrag(true); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); wbDragRef.current = Math.max(0, wbDragRef.current - 1); if (wbDragRef.current === 0) setWbDrag(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            wbDragRef.current = 0; setWbDrag(false);
            const files = [...(e.dataTransfer?.files || [])];
            if (!files.length) return;
            const first = files[0];
            const n = (first.name || "").toLowerCase();
            if (n.endsWith(".json")) handleImportJSON(first);
            else if (n.endsWith(".docx")) handleImportDocx(first);
            else handleImageFiles(files);
          }}
          onContextMenu={(e) => {
          e.preventDefault();
          const svg = svgRef.current;
          const r = svg ? svg.getBoundingClientRect() : null;
          const wx = r ? (e.clientX - r.left - board.pan.x) / board.zoom : 0;
          const wy = r ? (e.clientY - r.top - board.pan.y) / board.zoom : 0;
          // hit object trước
          if (r) {
            const hit = [...visibleObjects].reverse().find((o) => wx >= o.x && wx <= o.x + o.width && wy >= o.y && wy <= o.y + o.height);
            if (hit) {
              // nếu multi-select và hit thuộc selection → giữ nguyên multi
              const isMulti = selection.length > 1 && selection.includes(hit.id);
              if (!isMulti && !selection.includes(hit.id)) setSelection([hit.id]);
              if (hit.locked) {
                // vẫn cho mở menu nhưng chỉ hiện Mở khóa
              }
              setContextMenu({ x: e.clientX, y: e.clientY, wx, wy, id: hit.id, kind: hit.kind });
              return;
            }
            // hit connector (khoảng cách < 10px)
            const hitConn = (() => {
              const tol = 10 / board.zoom;
              for (const c of visibleConnectors) {
                const a = visibleObjects.find((o) => o.id === c.fromId);
                const b = visibleObjects.find((o) => o.id === c.toId);
                if (!a || !b) continue;
                // tạo 2 điểm edge
                const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
                const bx = b.x + b.width / 2, by = b.y + b.height / 2;
                // đơn giản: khoảng cách tới đoạn thẳng center-center
                const dx = bx - ax, dy = by - ay;
                const len2 = dx * dx + dy * dy || 1;
                let t = ((wx - ax) * dx + (wy - ay) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const px = ax + t * dx, py = ay + t * dy;
                if (Math.hypot(wx - px, wy - py) < tol) return c;
              }
              return null;
            })();
            if (hitConn) {
              setSelectedConn(hitConn.id);
              setSelection([]);
              setContextMenu({ x: e.clientX, y: e.clientY, wx, wy, id: hitConn.id, kind: "connector" });
              return;
            }
          }
          // nền canvas — lưu wx,wy để tạo object tại đó
          setContextMenu({ x: e.clientX, y: e.clientY, wx, wy, id: null, kind: "canvas" });
        }} onClick={() => setContextMenu(null)}>
          <WhiteboardCanvas
            objects={visibleObjects}
            connectors={visibleConnectors}
            tool={tool}
            shapeType={shapeType}
            connectorType={connectorType}
            penColor={penColor}
            penWidth={penWidth}
            selection={selection}
            onSelectionChange={(ids) => { setSelection(ids); if (ids.length) setSelectedConn(null); }}
            selectedConnId={selectedConn}
            onConnSelection={(id, additive) => {
              if (additive) setSelectedConn((prev) => prev === id ? null : id);
              else { setSelectedConn(id); setSelection([]); }
            }}
            onObjects={handleObjects}
            onConnectors={handleConnectors}
            onCheckpoint={checkpoint}
            zoom={board.zoom}
            pan={board.pan}
            onViewport={handleViewport}
            grid={board.grid}
            snap={board.snap}
            smartAlign={board.smartAlign}
            smartSpacing={board.smartSpacing}
            branchDrag={branchDrag}
            collapsedMap={collapsedMap}
            requestEditId={requestEditId}
            onEditHandled={() => setRequestEditId(null)}
            svgRef={svgRef}
            onNotify={notify}
            onCanvasClick={handleCanvasClick}
            onDoubleClickBackground={handleDoubleClickBackground}
            onMindAdd={handleMindAdd}
          />
          {/* Context style for selection */}
          {single && (
            <div className="whiteboard-stylebar whiteboard-stylebar--single">
              {/* Fill */}
              <div className="wb-style-group" title="Màu nền">
                <span className="wb-style-icon"><PaintBucket size={14} /></span>
                <label className="wb-color-btn" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(single.fill) ? single.fill : "#ffffff" }} title={`Nền: ${single.fill}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(single.fill) ? single.fill : "#ffffff"} onChange={(e) => updateSingle({ fill: e.target.value })} />
                </label>
                <span className="wb-style-label">Nền</span>
              </div>
              <div className="wb-style-sep" />
              {/* Border */}
              <div className="wb-style-group" title="Viền">
                <span className="wb-style-icon"><Square size={14} /></span>
                <label className="wb-color-btn wb-color-btn--stroke" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(single.stroke) ? single.stroke : "#334155" }} title={`Viền: ${single.stroke}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(single.stroke) ? single.stroke : "#334155"} onChange={(e) => updateSingle({ stroke: e.target.value })} />
                </label>
                <select className="wb-style-select wb-style-select--sm" value={single.strokeWidth || 2} onChange={(e) => updateSingle({ strokeWidth: parseInt(e.target.value, 10) })} title="Độ dày viền">
                  <option value={1}>━ 1px</option>
                  <option value={2}>━ 2px</option>
                  <option value={4}>━ 4px</option>
                  <option value={6}>━ 6px</option>
                </select>
                <select className="wb-style-select wb-style-select--sm" value={single.strokeDash || ""} onChange={(e) => updateSingle({ strokeDash: e.target.value })} title="Kiểu viền">
                  <option value="">━━ Liền</option>
                  <option value="6 4">┈┈ Đứt</option>
                  <option value="2 4">···· Chấm</option>
                </select>
              </div>
              <div className="wb-style-sep" />
              {/* Text */}
              <div className="wb-style-group" title="Chữ">
                <span className="wb-style-icon"><Type size={14} /></span>
                <label className="wb-color-btn" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(single.color) ? single.color : "#1e293b" }} title={`Chữ: ${single.color}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(single.color) ? single.color : "#1e293b"} onChange={(e) => updateSingle({ color: e.target.value })} />
                </label>
                <select className="wb-style-select" value={single.fontSize || 15} onChange={(e) => updateSingle({ fontSize: parseInt(e.target.value, 10) })} title="Cỡ chữ">
                  <option value={12}>12</option>
                  <option value={14}>14</option>
                  <option value={15}>15</option>
                  <option value={18}>18</option>
                  <option value={22}>22</option>
                </select>
                <button className={`wb-style-btn-icon ${single.bold ? "active" : ""}`} onClick={() => updateSingle({ bold: !single.bold })} title="Chữ đậm"><Bold size={14} /></button>
                <button className={`wb-style-btn-icon ${single.italic ? "active" : ""}`} onClick={() => updateSingle({ italic: !single.italic })} title="Chữ nghiêng"><Italic size={14} /></button>
                <select className="wb-style-select wb-style-select--sm" value={single.align || "center"} onChange={(e) => updateSingle({ align: e.target.value })} title="Căn lề">
                  <option value="left">⎡ Trái</option>
                  <option value="center">≡ Giữa</option>
                  <option value="right">⎦ Phải</option>
                </select>
              </div>
              <div className="wb-style-sep" />
              <label className="wb-style-check" title="Tự co giãn theo nội dung"><input type="checkbox" checked={!!single.autoSize} onChange={(e) => updateSingle({ autoSize: e.target.checked })} /> Tự nở</label>
              <div className="wb-style-sep" />
              <button className="wb-style-btn-icon" onClick={handleCopy} title="Sao chép" aria-label="Sao chép"><Copy size={14} /></button>
              <button className="wb-style-btn-icon" onClick={handleDuplicateSel} title="Nhân bản" aria-label="Nhân bản"><Copy size={14} /><span style={{ fontSize: 9, marginLeft: -2 }}>+</span></button>
              <button className="wb-style-btn-icon wb-style-btn--danger" onClick={deleteSelection} title="Xóa" aria-label="Xóa"><Trash2 size={14} /></button>
            </div>
          )}
          {selection.length > 1 && (
            <div className="whiteboard-stylebar">
              <span style={{ fontSize: 12, opacity: 0.7 }}>{selection.length} khối</span>
              <button onClick={handleGroup} title="Nhóm các khối đã chọn"><Group size={14} /> Nhóm</button>
              <button onClick={handleUngroup} title="Tách nhóm"><Ungroup size={14} /> Tách nhóm</button>
              <button onClick={() => handleAlign("left")}><AlignLeft size={14} /></button>
              <button onClick={() => handleAlign("center")}><AlignCenter size={14} /></button>
              <button onClick={() => handleAlign("right")}><AlignRight size={14} /></button>
              <button onClick={() => handleDistribute("h")} title="Phân bố ngang">⇔</button>
              <button onClick={() => handleDistribute("v")} title="Phân bố dọc">⇕</button>
              <button onClick={deleteSelection}><Trash2 size={14} /></button>
            </div>
          )}
          {quickBarPos && single && (
            <div className="whiteboard-quickbar" style={{ left: quickBarPos.left, top: quickBarPos.top }}>
              {single.kind === "node" ? (
                <>
                  <button onClick={() => setRequestEditId(single.id)} title="Sửa"><Type size={14} /> Sửa</button>
                  <button onClick={() => handleMindAdd(single)} title="Thêm nhánh con">＋ Nhánh</button>
                  <button onClick={() => setTool("connector")} title="Nối"><ArrowUpRight size={14} /> Nối</button>
                  <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ x: r.left, y: r.bottom + 6, wx: single.x + single.width/2, wy: single.y + single.height/2, id: single.id, kind: single.kind }); }} title="Thêm">⋮</button>
                </>
              ) : single.kind === "image" ? (
                <>
                  <button onClick={() => { setReplaceImageId(single.id); replaceImageRef.current?.click(); }}>Thay ảnh</button>
                  <button onClick={() => handleDuplicateIds([single.id])}>⧉ Nhân bản</button>
                  <button onClick={() => toggleLock(single.id)}>{single.locked ? "🔓 Mở" : "🔒 Khóa"}</button>
                  <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ x: r.left, y: r.bottom + 6, wx: single.x, wy: single.y, id: single.id, kind: single.kind }); }}>⋮</button>
                </>
              ) : single.kind === "note" ? (
                <>
                  <button onClick={() => setRequestEditId(single.id)}><Type size={14} /> Sửa</button>
                  <button onClick={() => handleChangeNoteColor(single.id)}>🎨 Màu</button>
                  <button onClick={() => handleDuplicateIds([single.id])}>⧉ Nhân bản</button>
                  <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ x: r.left, y: r.bottom + 6, wx: single.x, wy: single.y, id: single.id, kind: single.kind }); }}>⋮</button>
                </>
              ) : (
                <>
                  <button onClick={() => setRequestEditId(single.id)}><Type size={14} /> Sửa</button>
                  <button onClick={() => handleDuplicateIds([single.id])}>⧉ Nhân bản</button>
                  <button onClick={() => { const input = document.createElement("input"); input.type = "color"; input.value = single.fill || "#ffffff"; input.onchange = (ev) => updateSingle({ fill: ev.target.value }); input.click(); }}>🎨 Màu</button>
                  <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ x: r.left, y: r.bottom + 6, wx: single.x, wy: single.y, id: single.id, kind: single.kind }); }}>⋮</button>
                </>
              )}
            </div>
          )}
          {quickBarPos && selection.length > 1 && (
            <div className="whiteboard-quickbar" style={{ left: quickBarPos.left, top: quickBarPos.top }}>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{selection.length} đối tượng</span>
              <button onClick={handleGroup} title="Nhóm các đối tượng đã chọn">Nhóm</button>
              <button onClick={() => handleAlign("center")}>Căn chỉnh</button>
              <button onClick={() => handleDistribute("h")}>Phân bố</button>
              <button onClick={handleDuplicateSel}>⧉ Nhân bản</button>
              <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const first = selection[0]; setContextMenu({ x: r.left, y: r.bottom + 6, wx: 0, wy: 0, id: first, kind: "multi" }); }}>⋮</button>
            </div>
          )}
          {contextMenu && (() => {
            const contextObject = contextMenu.id ? board.objects.find((o) => o.id === contextMenu.id) : null;
            const contextConn = contextMenu.kind === "connector" ? (visibleConnectors.find((c) => c.id === contextMenu.id) || board.connectors.find((c) => c.id === contextMenu.id)) : null;
            const isMulti = selection.length > 1 && contextMenu.id && selection.includes(contextMenu.id);
            const hasClipboard = !!(clipboardRef.current && clipboardRef.current.objects && clipboardRef.current.objects.length);
            const isBg = contextMenu.kind === "canvas";
            const menuW = isBg ? 400 : 240, menuH = isBg ? 380 : 420;
            const left = Math.max(8, Math.min(contextMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - menuW - 8));
            const top = Math.max(8, Math.min(contextMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - menuH - 8));
            const wx = contextMenu.wx ?? 0, wy = contextMenu.wy ?? 0;
            const close = () => setContextMenu(null);
            const act = (fn) => { close(); fn(); };
            // Popup nổi tách khỏi menu cha (tránh bị overflow:auto cắt): mở cạnh menu, tự lật trái khi sát mép phải
            const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
            const vh = typeof window !== "undefined" ? window.innerHeight : 800;
            const addW = 228, addH = 300;
            const menuRealW = isBg ? 268 : 248;
            let addLeft = left + menuRealW + 8;
            if (addLeft + addW > vw - 8) addLeft = left - addW - 8;
            addLeft = Math.max(8, addLeft);
            const addTop = Math.max(8, Math.min(top, vh - addH - 8));
            const addButtons = (
              <>
                <button onClick={() => act(() => createAt(wx, wy, "text"))}><Type size={14} /> Văn bản</button>
                <button onClick={() => act(() => createAt(wx, wy, "note"))}>📝 Ghi chú dán</button>
                <button onClick={() => act(() => createAt(wx, wy, "shape"))}>▣ Hình khối</button>
                <button onClick={() => act(() => { const g = generateMindmap("Chủ đề", ["Nhánh 1","Nhánh 2","Nhánh 3"], { cx: wx, cy: wy }); checkpoint(); setBoard((p) => { const nb = { ...p, objects: [...p.objects, ...g.objects], connectors: [...p.connectors, ...g.connectors]}; pushHistory(nb); return nb; }); setSelection([g.objects[0].id]); playWb("success"); })}>🧠 Sơ đồ tư duy</button>
                <button onClick={() => act(() => { setPendingImagePos({ wx, wy }); importImageRef.current?.click(); })}>🖼 Ảnh</button>
              </>
            );
            const viewButtons = (
              <>
                <button onClick={() => act(() => setBoard((p) => ({ ...p, grid: !p.grid })))}>{board.grid ? "✓" : "○"} Lưới</button>
                <button onClick={() => act(() => setBoard((p) => ({ ...p, snap: !p.snap })))}>{board.snap ? "✓" : "○"} Bắt lưới</button>
                <button onClick={() => act(() => setBoard((p) => ({ ...p, smartAlign: !p.smartAlign })))}>{board.smartAlign ? "✓" : "○"} Căn thông minh</button>
              </>
            );
            return (
              <>
              <div className="whiteboard-context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
                {contextMenu.kind === "canvas" ? (
                  <>
                    <div className="whiteboard-context-item wb-sub-toggle" onClick={() => { setAddMenuOpen((v) => !v); setViewMenuOpen(false); }} title="Mở bảng thêm nhanh">
                      <span>＋ Thêm tại đây</span><span className={`whiteboard-context-arrow ${addMenuOpen ? "open" : ""}`}>›</span>
                    </div>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => handlePaste(wx, wy))} disabled={!hasClipboard}>Dán tại đây</button>
                    <button onClick={() => act(() => handlePaste())} disabled={!hasClipboard}>Dán <span className="whiteboard-context-shortcut">Ctrl+V</span></button>
                    <button onClick={() => act(() => setSelection(board.objects.map((o) => o.id)))}>Chọn tất cả <span className="whiteboard-context-shortcut">Ctrl+A</span></button>
                    <div className="whiteboard-context-sep" />
                    <div className="whiteboard-context-item wb-sub-toggle" onClick={() => { setViewMenuOpen((v) => !v); setAddMenuOpen(false); }} title="Mở tùy chọn hiển thị">
                      <span>Hiển thị</span><span className={`whiteboard-context-arrow ${viewMenuOpen ? "open" : ""}`}>›</span>
                    </div>
                    <button onClick={() => act(() => setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } })))}>Thu phóng 100%</button>
                  </>
                ) : isMulti ? (
                  <>
                    <div className="whiteboard-context-title">{selection.length} đối tượng đã chọn</div>
                    <button onClick={() => act(() => handleCopy())}>Sao chép <span className="whiteboard-context-shortcut">Ctrl+C</span></button>
                    <button onClick={() => act(() => handleDuplicateSel())}>Nhân bản <span className="whiteboard-context-shortcut">Ctrl+D</span></button>
                    <button onClick={() => act(() => handleGroup())}>Group</button>
                    <div className="whiteboard-context-sep" />
                    <div className="whiteboard-context-subtitle">Sắp xếp</div>
                    <div className="whiteboard-context-row">
                      <button onClick={() => act(() => reorderZ(selection, "front"))}>Trên</button>
                      <button onClick={() => act(() => reorderZ(selection, "back"))}>Dưới</button>
                    </div>
                    <div className="whiteboard-context-subtitle">Căn chỉnh</div>
                    <div className="whiteboard-context-row">
                      <button onClick={() => act(() => handleAlign("left"))}>Trái</button>
                      <button onClick={() => act(() => handleAlign("center"))}>Giữa</button>
                      <button onClick={() => act(() => handleAlign("right"))}>Phải</button>
                    </div>
                    <button onClick={() => act(() => { checkpoint(); setBoard((p) => ({ ...p, objects: p.objects.map((o) => selection.includes(o.id) ? { ...o, locked: true } : o) })); pushHistory({ ...board, objects: board.objects.map((o) => selection.includes(o.id) ? { ...o, locked: true } : o) }); })}>Khóa</button>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => handleDeleteIds(selection))} style={{ color: "#dc2626" }}>Xóa <span className="whiteboard-context-shortcut">Delete</span></button>
                  </>
                ) : contextMenu.kind === "connector" && contextConn ? (
                  <>
                    <div className="whiteboard-context-title">Kết nối</div>
                    <div className="whiteboard-context-subtitle">Kiểu đường</div>
                    <div className="whiteboard-context-row">
                      {["line","arrow","double","elbow"].map((tp) => (
                        <button key={tp} className={contextConn.type === tp ? "active" : ""} onClick={() => act(() => { checkpoint(); setBoard((p) => ({ ...p, connectors: p.connectors.map((c) => c.id === contextConn.id ? { ...c, type: tp } : c) })); pushHistory({ ...board, connectors: board.connectors.map((c) => c.id === contextConn.id ? { ...c, type: tp } : c) }); })}>{tp}</button>
                      ))}
                    </div>
                    <button onClick={() => act(() => handleCopyIds([contextConn.fromId, contextConn.toId]))}>Sao chép</button>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => { checkpoint(); setBoard((p) => ({ ...p, connectors: p.connectors.filter((c) => c.id !== contextConn.id) })); pushHistory({ ...board, connectors: board.connectors.filter((c) => c.id !== contextConn.id) }); setSelectedConn(null); })} style={{ color: "#dc2626" }}>Xóa</button>
                  </>
                ) : contextObject ? (
                  <>
                    <div className="whiteboard-context-title">{contextObject.kind === "node" ? "Node" : contextObject.kind === "image" ? "Ảnh" : contextObject.kind === "note" ? "Ghi chú" : "Đối tượng"}</div>
                    {contextObject.kind === "node" && (
                      <button onClick={() => act(() => handleMindAdd(contextObject))}>＋ Thêm nhánh con</button>
                    )}
                    <button onClick={() => act(() => { setSelection([contextObject.id]); setRequestEditId(contextObject.id); })}>Sửa</button>
                    {contextObject.sourceRef && (
                      <button onClick={() => act(() => openSourceFromRef(contextObject.sourceRef))} style={{ color: "var(--color-action, var(--primary))", fontWeight: 700 }}>📖 Mở sách nguồn — tr.{contextObject.sourceRef.bookPage || contextObject.sourceRef.page}</button>
                    )}
                    {contextObject.kind === "note" && (
                      <button onClick={() => act(() => handleChangeNoteColor(contextObject.id))}>Đổi màu</button>
                    )}
                    {contextObject.kind === "image" && (
                      <button onClick={() => act(() => { setReplaceImageId(contextObject.id); replaceImageRef.current?.click(); })}>Thay ảnh</button>
                    )}
                    <button onClick={() => act(() => handleCopyIds([contextObject.id]))}>Sao chép <span className="whiteboard-context-shortcut">Ctrl+C</span></button>
                    <button onClick={() => act(() => handleDuplicateIds([contextObject.id]))}>Nhân bản <span className="whiteboard-context-shortcut">Ctrl+D</span></button>
                    {contextObject.kind === "node" && (() => {
                      const hasChildren = board.objects.some((o) => o.parentId === contextObject.id);
                      return hasChildren ? <button onClick={() => act(() => toggleCollapse(contextObject.id))}>{contextObject.collapsed ? "Mở nhánh" : "Thu gọn nhánh"}</button> : null;
                    })()}
                    <div className="whiteboard-context-sep" />
                    <div className="whiteboard-context-subtitle">Sắp xếp</div>
                    <div className="whiteboard-context-row">
                      <button onClick={() => act(() => reorderZ([contextObject.id], "front"))}>Trên</button>
                      <button onClick={() => act(() => reorderZ([contextObject.id], "forward"))}>Trước</button>
                      <button onClick={() => act(() => reorderZ([contextObject.id], "backward"))}>Sau</button>
                      <button onClick={() => act(() => reorderZ([contextObject.id], "back"))}>Dưới</button>
                    </div>
                    <button onClick={() => act(() => toggleLock(contextObject.id))}>{contextObject.locked ? "Mở khóa" : "Khóa"}</button>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => handleDeleteIds([contextObject.id]))} style={{ color: "#dc2626" }}>Xóa <span className="whiteboard-context-shortcut">Delete</span></button>
                  </>
                ) : null}
              </div>
              {contextMenu.kind === "canvas" && addMenuOpen && (
                <div className="whiteboard-add-popup" style={{ left: addLeft, top: addTop }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
                  <div className="wb-add-popup-title">Thêm tại đây</div>
                  {addButtons}
                </div>
              )}
              {contextMenu.kind === "canvas" && viewMenuOpen && (
                <div className="whiteboard-add-popup" style={{ left: addLeft, top: addTop }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
                  <div className="wb-add-popup-title">Hiển thị</div>
                  {viewButtons}
                </div>
              )}
              </>
            );
          })()}
        </div>

        {/* Dock nổi — overlay trên canvas, không chiếm chỗ layout */}
        <div className={`whiteboard-dock ${toolbarCollapsed ? "is-collapsed" : ""}`}>
          <button className="wb-collapse-btn wb-collapse-btn--rail" onClick={() => setToolbarCollapsed((v) => !v)} title={toolbarCollapsed ? "Mở thanh công cụ" : "Thu gọn thanh công cụ"} aria-label="Thu gọn thanh công cụ">
            {toolbarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
          {toolbarCollapsed ? (
            <>
              <button className={`wb-tool ${tool ? "active" : ""}`} onClick={() => setToolbarCollapsed(false)} title="Mở thanh công cụ">
                {tool === "select" ? <MousePointer2 size={18} /> : tool === "pan" ? <Hand size={18} /> : tool === "pen" ? <Pencil size={18} /> : tool === "eraser" ? <Eraser size={18} /> : tool === "text" ? <Type size={18} /> : tool === "shape" ? <Shapes size={18} /> : tool === "connector" ? <ArrowUpRight size={18} /> : tool === "note" ? <StickyNote size={18} /> : <Network size={18} />}
              </button>
              <button className="wb-tool" onClick={() => { setToolbarCollapsed(false); setShowCreateMenu(true); }} title="Tạo nhanh: sơ đồ / mẫu / AI"><Wand2 size={18} /></button>
            </>
          ) : (
          <>
          <div className="wb-group-label">Chọn</div>
          <button className={`wb-tool ${tool === "select" ? "active" : ""}`} onClick={() => setTool("select")} title="Chọn (V/1)"><MousePointer2 size={17} /></button>
          <button className={`wb-tool ${tool === "pan" ? "active" : ""}`} onClick={() => setTool("pan")} title="Di chuyển (H/Space)"><Hand size={17} /></button>
          <div className="wb-sep" />
          <div className="wb-group-label">Vẽ</div>
          <button className={`wb-tool ${tool === "pen" ? "active" : ""}`} onClick={() => setTool("pen")} title="Bút (P/2)"><Pencil size={17} /></button>
          {tool === "pen" && (
            <div className="wb-tool-pop">
              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} title="Màu bút" />
              <select value={penWidth} onChange={(e) => setPenWidth(parseInt(e.target.value, 10))} title="Độ dày bút">
                <option value={2}>2</option><option value={3}>3</option><option value={5}>5</option><option value={8}>8</option>
              </select>
            </div>
          )}
          <button className={`wb-tool ${tool === "eraser" ? "active" : ""}`} onClick={() => setTool("eraser")} title="Tẩy"><Eraser size={17} /></button>
          <button className={`wb-tool ${tool === "text" ? "active" : ""}`} onClick={() => setTool("text")} title="Văn bản (T/3)"><Type size={17} /></button>
          <button className={`wb-tool ${tool === "shape" ? "active" : ""}`} onClick={() => setTool("shape")} title="Hình khối (S/4)"><Shapes size={17} /></button>
          {tool === "shape" && (
            <select className="wb-shape-select" value={shapeType} onChange={(e) => setShapeType(e.target.value)} title="Kiểu hình">
              {SHAPE_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <button className={`wb-tool ${tool === "connector" ? "active" : ""}`} onClick={() => setTool("connector")} title="Kết nối (L/5)"><ArrowUpRight size={17} /></button>
          {tool === "connector" && (
            <select className="wb-shape-select" value={connectorType} onChange={(e) => setConnectorType(e.target.value)} title="Kiểu nối">
              {CONN_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <div className="wb-sep" />
          <div className="wb-group-label">Thêm</div>
          <button className="wb-tool" onClick={() => importImageRef.current?.click()} title="Chèn ảnh"><ImageIcon size={17} /></button>
          <input ref={importImageRef} type="file" accept="image/*" hidden onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ""; }} />
          <button className={`wb-tool ${tool === "note" ? "active" : ""}`} onClick={() => setTool("note")} title="Ghi chú"><StickyNote size={17} /></button>
          <button className={`wb-tool ${tool === "mind" ? "active" : ""}`} onClick={() => setTool("mind")} title="Mindmap: bấm vào khối để thêm nhánh con" aria-label="Sơ đồ tư duy"><Network size={17} /></button>
          <div className="wb-sep" />
          <div className="wb-group-label">Tạo</div>
          <div className="wb-create-wrap">
            <button className="wb-tool wb-tool--create" onClick={() => setShowCreateMenu((v) => !v)} title="Tạo nhanh: sơ đồ / mẫu / AI"><Plus size={17} /></button>
            {showCreateMenu && (
              <>
                <div className="wb-popover-backdrop" onClick={() => setShowCreateMenu(false)} />
                <div className="wb-popover wb-popover--rail">
                  <button className="wb-create-item" onClick={() => { setShowCreateMenu(false); setShowMindModal(true); }} title="Tạo sơ đồ tư duy nhanh"><Network size={15} /> Sơ đồ tư duy</button>
                  <button className="wb-create-item" onClick={() => { setShowCreateMenu(false); setShowTemplate(true); }} title="Thư viện mẫu"><LayoutTemplate size={15} /> Thư viện mẫu</button>
                  <button className="wb-create-item wb-create-item--ai" onClick={() => { setShowCreateMenu(false); setShowAI(true); }} title="AI tạo sơ đồ (cần API Key)"><Sparkles size={15} /> AI tạo sơ đồ</button>
                </div>
              </>
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {/* Mindmap modal */}
      {showMindModal && (
        <div className="modal-overlay" onClick={() => setShowMindModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(440px, calc(100vw - 20px))" }}>
            <div className="modal-header"><h2>Tạo sơ đồ tư duy</h2><button className="btn btn-ghost btn-xs" onClick={() => setShowMindModal(false)} aria-label="Đóng"><X size={16} /></button></div>
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="form-label">Chủ đề trung tâm</label>
              <input className="form-control" value={mindTopic} onChange={(e) => setMindTopic(e.target.value)} placeholder="VD: Hệ mặt trời" autoFocus />
              <label className="form-label">Số nhánh</label>
              <input className="form-control" type="number" min={1} max={8} value={mindBranches} onChange={(e) => setMindBranches(e.target.value)} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setShowMindModal(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={createMindmap}><Check size={14} /> Tạo sơ đồ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTemplate && (
        <div className="modal-overlay" onClick={() => setShowTemplate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header"><h2>Thư viện mẫu</h2><button className="btn btn-ghost btn-xs" onClick={() => setShowTemplate(false)}><X size={16} /></button></div>
            <div style={{ padding: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
              {TEMPLATES.map((t) => (
                <button key={t.id} className="btn btn-secondary" onClick={() => applyTemplate(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAI && (
        <div className="modal-overlay whiteboard-ai-overlay" onClick={closeAIModal}>
          <div className="modal-content whiteboard-ai-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, overflow: "hidden" }}>
            <div className="modal-header whiteboard-ai-header">
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "grid", placeItems: "center", color: "#fff", fontSize: 14 }}>✦</span> {aiStage === "preview" ? "Xem trước sơ đồ" : "AI tạo sơ đồ thông minh"}</h2>
              <button className="btn btn-ghost btn-xs" onClick={closeAIModal}><X size={16} /></button>
            </div>

            {aiStage === "preview" && aiPlan ? (
              <div className="wb-ai-preview">
                <div className="wb-ai-preview-meta">
                  <span className={`wb-ai-badge wb-ai-badge--${aiMeta?.mode === "local" ? "local" : "ai"}`}>
                    {aiMeta?.mode === "local" ? "📄 Từ văn bản của bạn" : aiMeta?.checked ? "✓ AI — đã đối chiếu nguồn" : "✦ AI"}
                  </span>
                  {(aiMeta?.warnings || []).map((w, wi) => (
                    <span key={`${wi}-${w}`} className="wb-ai-warn">{w}</span>
                  ))}
                </div>
                <div className="wb-ai-preview-topic">
                  <span className="wb-ai-preview-topic-label">Chủ đề</span>
                  <input className="form-control" value={aiPlan.topic} onChange={(e) => editAiPlan((p) => ({ ...p, topic: e.target.value }))} style={{ fontSize: 14, fontWeight: 700 }} />
                </div>
                <div className="wb-ai-preview-branches">
                  {aiPlan.branches.map((b, i) => (
                    <div className="wb-ai-branch" key={i}>
                      <div className="wb-ai-branch-row">
                        <span className="wb-ai-branch-dot" style={{ background: `hsl(${(i * 47) % 360} 65% 50%)` }} />
                        <input className="form-control wb-ai-branch-input" value={b.label} onChange={(e) => editAiPlan((p) => { p.branches[i].label = e.target.value; return p; })} />
                        <button className="btn btn-ghost btn-xs" title="Xóa nhánh" onClick={() => editAiPlan((p) => ({ ...p, branches: p.branches.filter((_, j) => j !== i) }))}><Trash2 size={13} /></button>
                      </div>
                      <div className="wb-ai-branch-children">
                        {b.children.map((c, j) => (
                          <div className="wb-ai-child-row" key={j}>
                            <span className="wb-ai-child-line" />
                            <input className="form-control wb-ai-child-input" value={c} onChange={(e) => editAiPlan((p) => { p.branches[i].children[j] = e.target.value; return p; })} />
                            <button className="btn btn-ghost btn-xs" onClick={() => editAiPlan((p) => { p.branches[i].children.splice(j, 1); return p; })}><X size={12} /></button>
                          </div>
                        ))}
                        <button className="btn btn-ghost btn-xs wb-ai-add-child" onClick={() => editAiPlan((p) => { p.branches[i].children.push(""); return p; })}>+ Ý con</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => editAiPlan((p) => ({ ...p, branches: [...p.branches, { label: "Nhánh mới", children: [] }] }))}>+ Thêm nhánh</button>
                </div>
                {aiError && <div className="wb-ai-error">{aiError}</div>}
                <div className="wb-ai-preview-actions">
                  <button className="btn btn-ghost" onClick={() => { setAiStage("form"); setAiError(""); }}>← Sửa nguồn</button>
                  <button className="btn btn-ghost" onClick={handleAIGenerate} disabled={aiBusy}>{aiBusy ? "Đang tạo…" : "↻ Tạo lại"}</button>
                  <button className="btn btn-primary" onClick={handleAIApply} style={{ minWidth: 130 }}>✓ Đưa lên bảng</button>
                </div>
              </div>
            ) : (
              <>
                <div className="whiteboard-ai-tabs">
                  <button className={`whiteboard-ai-tab ${aiTab === "text" ? "active" : ""}`} onClick={() => setAiTab("text")}>📝 Văn bản</button>
                  <button className={`whiteboard-ai-tab ${aiTab === "image" ? "active" : ""}`} onClick={() => setAiTab("image")}>🖼 Ảnh</button>
                  <button className={`whiteboard-ai-tab ${aiTab === "suggest" ? "active" : ""}`} onClick={() => setAiTab("suggest")}>💡 Gợi ý</button>
                </div>
                <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 12, maxHeight: "62vh", overflow: "auto" }}>
                  {aiTab === "text" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Văn bản nguồn (mỗi dòng = một ý)</label>
                      <textarea className="form-control" rows={5} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder={"Dán nội dung từ SGK, ví dụ:\nQuang hợp là quá trình...\n- Điều kiện: ánh sáng, diệp lục\n- Sản phẩm: tinh bột, oxy"} style={{ resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>AI chỉ dùng đúng nội dung bạn dán — không bịa thêm. Thuật ngữ gốc được giữ nguyên. Nhận diện thụt lề/gạch đầu dòng làm phân cấp.</span>
                    </div>
                  )}
                  {aiTab === "image" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Ảnh minh họa</label>
                      <div className="whiteboard-ai-drop" onClick={() => document.getElementById("wb-ai-image-input")?.click()} style={{ border: "1.5px dashed var(--border-color)", borderRadius: 10, padding: 12, display: "flex", gap: 10, alignItems: "center", cursor: "pointer", background: "rgba(99,102,241,0.04)" }}>
                        {aiImagePreview ? <img src={aiImagePreview} alt="preview" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-color)" }} /> : <div style={{ width: 64, height: 64, borderRadius: 8, background: "#f1f5f9", display: "grid", placeItems: "center", fontSize: 18 }}>🖼</div>}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{aiImageFile ? aiImageFile.name : "Chọn ảnh để AI đọc"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>JPG/PNG/WebP, tối đa 8MB. AI đọc trực tiếp nội dung trong ảnh (cần API Key).</div>
                        </div>
                        <span className="btn btn-secondary btn-xs">Chọn</span>
                      </div>
                      <input id="wb-ai-image-input" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setAiImageFile(f); e.target.value = ""; }} />
                      {aiImageFile && <button className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => { setAiImageFile(null); setAiImagePreview(""); }}>✕ Gỡ ảnh</button>}
                      <textarea className="form-control" rows={2} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Ghi chú thêm cho ảnh (tùy chọn)" style={{ fontSize: 12 }} />
                    </div>
                  )}
                  {aiTab === "suggest" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Gợi ý nhanh — chạm để điền</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {["Tóm tắt bài học", "So sánh 2 khái niệm", "Sơ đồ tư duy Quang hợp", "Phân loại thực vật", "Timeline lịch sử", "Sơ đồ lớp 4 — Vòng đời cây"].map((g) => (
                          <button key={g} className="btn btn-secondary btn-xs" style={{ borderRadius: 20, fontSize: 11 }} onClick={() => setAiTopic(g)}>{g}</button>
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Chọn một gợi ý để điền vào Chủ đề, sau đó thêm ý nhỏ bên dưới.</p>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px", background: "rgba(241,245,249,0.6)", borderRadius: 10, border: "1px solid rgba(226,232,240,0.8)" }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Ý nhỏ cho AI <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>(tùy chọn, mỗi ô một ý — bắt buộc có trong sơ đồ)</span></label>
                    {aiSmallIdeas.map((v, i) => (
                      <div key={i} style={{ display: "flex", gap: 6 }}>
                        <input className="form-control" value={v} onChange={(e) => { const a = [...aiSmallIdeas]; a[i] = e.target.value; setAiSmallIdeas(a); }} placeholder={`Ý ${i + 1} — ví dụ: Diệp lục`} style={{ fontSize: 13 }} />
                        <button className="btn btn-ghost btn-xs" onClick={() => setAiSmallIdeas((a) => a.filter((_, j) => j !== i))} disabled={aiSmallIdeas.length <= 1}><X size={14} /></button>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setAiSmallIdeas((a) => [...a, ""])}>+ Thêm ý</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Chủ đề trung tâm <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>(tùy chọn — để trống AI tự rút từ nguồn)</span></label>
                    <input className="form-control" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="VD: Quang hợp ở thực vật" style={{ fontSize: 14, fontWeight: 600 }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sau khi tạo bạn sẽ <b>xem trước, sửa nhãn rồi mới đưa lên bảng</b>. AI kiểm tra chống bịa với nguồn; không có API Key vẫn tạo được từ văn bản.</span>
                  </div>
                  {aiError && <div className="wb-ai-error">{aiError}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                    <button className="btn btn-ghost" onClick={closeAIModal}>Đóng</button>
                    <button className="btn btn-primary" onClick={handleAIGenerate} disabled={aiBusy} style={{ minWidth: 130 }}>{aiBusy ? "Đang tạo…" : "✦ Tạo sơ đồ"}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="whiteboard-toast">{toast}</div>}
    </div>
  );
}
