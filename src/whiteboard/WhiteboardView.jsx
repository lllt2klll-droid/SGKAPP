import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MousePointer2, Hand, Pencil, Eraser, Type, Shapes, ArrowUpRight, Image as ImageIcon,
  StickyNote, Network, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Grid3X3, Copy, CopyPlus, Trash2,
  Group, Ungroup, AlignLeft, AlignCenter, AlignRight, Save, Download, Upload, Plus, FilePlus,
  LayoutTemplate, Sparkles, X, Check, Search,
  PaintBucket, Square, Bold, Italic, AlignJustify, BookOpen,
  ChevronLeft, ChevronRight, SlidersHorizontal, Wand2, Magnet, History
} from "lucide-react";
import WhiteboardCanvas from "./WhiteboardCanvas.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import {
  uid, blankBoard, blankObject, listBoards, loadBoard, persistBoard, createBoard,
  listBoardsAsync, loadBoardAsync, persistBoardAsync, createBoardAsync,
  deleteBoardAsync, duplicateBoardAsync,
  deleteBoard as deleteBoardStore, renameBoard as renameBoardStore, duplicateBoard as dupBoardStore,
  parseBoardJSON, ensureFits, WB_PENDING_KEY,
  WB_FONTS, WB_FONT_KEY, resolveWbFont
} from "./whiteboardStore.js";
import { generateMindmap, buildTemplate, TEMPLATES, autoLayout, applyLayoutAnchors, aiPlanToGraph, distToConnector, sanitizePlanForApply, MINDMAP_THEMES, applyBranchTheme, textOnFill, numberBranchChildren, BULLET_STYLES, CONN_HEAD_OPTS, CONN_DASH_OPTS, CONN_COLORS, CONN_WIDTHS, connHeads, connDash, connTypeForHeads, flipConn } from "./mindmapEngine.js";
import { exportSVG, exportJSON, exportRaster, exportPDF, boardBounds, stripBoardForExport } from "./exportManager.js";
import { loadSettings } from "../settingsStore.js";
import { soundManager } from "../audio/soundManager.js";
import { getShortcut, matchesShortcut } from "../keyboardShortcuts.js";
import { trackWhiteboardAction, isRemoteWhiteboardEvent } from "./whiteboardIntegration.js";
import { __crossTabSenderId as WB_TAB_ID } from "../core/crossTab.js";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { safeGetString, safeSetString, safeRemove, safeGetJSON, safeSetJSON } from "../safeStorage.js";

import {
  cloneBoard,
  boardSnap,
  getDescendantIds,
  SHAPE_OPTS,
  CONN_OPTS,
  LAYOUT_OPTS,
  TOUR_STEPS,
  QUICK_EMOJIS,
  NOTE_COLORS,
  versionsKey,
  findBackgroundCandidate,
  alignObjects,
  distributePositions,
  reorderObjects,
  BOARD_SORTS,
  sortBoardEntries,
  formatBoardSizeKb,
  extractMultiBoardsPayload,
} from "./whiteboardHelpers.js";

export default function WhiteboardView() {
  const svgRef = useRef(null);
  const rootRef = useRef(null);
  const jsonInputRef = useRef(null);
  const importImageRef = useRef(null);
  const docxInputRef = useRef(null);
  const [branchDrag, setBranchDrag] = useState(true);
  // Mũi tên 4 hướng quanh khối chọn → bấm tạo nhánh nhanh, có thể tắt
  const [showBranchArrows, setShowBranchArrows] = useState(() => {
    try { return safeGetString("sgk:whiteboard-branch-arrows", "1") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { safeSetString("sgk:whiteboard-branch-arrows", showBranchArrows ? "1" : "0"); } catch {}
  }, [showBranchArrows]);
  const [contextMenu, setContextMenu] = useState(null); // {x,y, wx,wy, id, kind}
  const [connLabelEdit, setConnLabelEdit] = useState(null); // {id, x, y} — sửa nhãn đường nối
  const [connLabelDraft, setConnLabelDraft] = useState("");
  const [requestEditId, setRequestEditId] = useState(null);
  const [replaceImageId, setReplaceImageId] = useState(null);
  const replaceImageRef = useRef(null);
  const [pendingImagePos, setPendingImagePos] = useState(null);
  const imageUrlMapRef = useRef(new Map()); // imageId -> objectURL
  // Kéo-thả file vào bảng: ảnh → chèn, .json/.docx → nhập bảng
  const [wbDrag, setWbDrag] = useState(false);
  const wbDragRef = useRef(0);

  const [boards, setBoards] = useState([]);
  const [activeId, setActiveId] = useState(null);
  // P0: board luôn non-null để mọi hook/useMemo an toàn trong lúc load async IDB
  const [board, setBoard] = useState(() => blankBoard("Bảng của tôi"));
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [boardsError, setBoardsError] = useState("");

  // P0: load async từ IDB canonical — tránh listBoards() sync trả [] khi cache chưa warm (board ma)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let idx = await listBoardsAsync();
        if (!Array.isArray(idx) || !idx.length) {
          try {
            const seed = await createBoardAsync("Bảng của tôi");
            idx = [{ id: seed.id, name: seed.name, createdAt: seed.createdAt, updatedAt: seed.updatedAt }];
          } catch {
            idx = listBoards();
            if (!idx.length) {
              const fb = blankBoard("Bảng của tôi");
              idx = [{ id: fb.id, name: fb.name, createdAt: fb.createdAt, updatedAt: fb.updatedAt }];
              if (cancelled) return;
              setBoards(idx);
              setActiveId(fb.id);
              setBoard(fb);
              setBoardsLoading(false);
              return;
            }
          }
        }
        if (cancelled) return;
        setBoards(idx);
        const firstId = idx[0]?.id || null;
        setActiveId(firstId);
        if (firstId) {
          try {
            const b = await loadBoardAsync(firstId);
            if (cancelled) return;
            setBoard(b || blankBoard("Bảng của tôi"));
          } catch {
            const b = loadBoard(firstId) || blankBoard("Bảng của tôi");
            if (!cancelled) setBoard(b);
          }
        } else {
          setBoard(blankBoard("Bảng của tôi"));
        }
      } catch (e) {
        if (!cancelled) {
          setBoardsError(e?.message || "Không tải được bảng");
          try {
            const fbIdx = listBoards();
            setBoards(fbIdx);
            const fid = fbIdx[0]?.id;
            setActiveId(fid || null);
            setBoard(fid ? loadBoard(fid) || blankBoard("Bảng của tôi") : blankBoard("Bảng của tôi"));
          } catch {
            setBoard(blankBoard("Bảng của tôi"));
          }
        }
      } finally {
        if (!cancelled) setBoardsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tool, setTool] = useState("select");
  const [shapeType, setShapeType] = useState("rounded");
  const [connectorType, setConnectorType] = useState("arrow");
  const [penColor, setPenColor] = useState("#1d4ed8");
  const [penWidth, setPenWidth] = useState(3);
  // Font mặc định cho khối chữ mới — lưu theo máy, đồng thời lưu vào board.defaultFontFamily
  // để file tải về (PNG/SVG/PDF/Word) dùng đúng font đang hiển thị.
  const [defaultFontFamily, setDefaultFontFamily] = useState(() => {
    try { return safeGetString(WB_FONT_KEY, "") || ""; } catch { return ""; }
  });
  useEffect(() => {
    try { safeSetString(WB_FONT_KEY, defaultFontFamily || ""); } catch {}
  }, [defaultFontFamily]);
  const [selection, setSelection] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [showBoardList, setShowBoardList] = useState(false);
  const [showMindModal, setShowMindModal] = useState(false);
  const [mindTopic, setMindTopic] = useState("");
  const [mindBranches, setMindBranches] = useState("4");
  const [mindTheme, setMindTheme] = useState("vivid");
  const [showTemplate, setShowTemplate] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const closeTour = useCallback(() => {
    setShowTour(false);
    try { safeSetString("sgk:whiteboard-tour-seen", "1"); } catch {}
  }, []);
  const [aiTopic, setAiTopic] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiImageFile, setAiImageFile] = useState(null);
  const [aiImagePreview, setAiImagePreview] = useState("");
  const [aiSmallIdeas, setAiSmallIdeas] = useState(["", ""]);
  const [aiTab, setAiTab] = useState("text");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState(""); // H6: nhãn tiến trình gen/validate/retry
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
  const createMenuBtnRef = useRef(null);
  const [createMenuPos, setCreateMenuPos] = useState(null);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => safeGetString("sgk:whiteboard-toolbar-collapsed", "0") === "1");
  const [topbarCollapsed, setTopbarCollapsed] = useState(() => safeGetString("sgk:whiteboard-topbar-collapsed", "0") === "1");
  const [showCanvasOpts, setShowCanvasOpts] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  // Chọn khối → hiện đủ thông tin ngay, không cần bấm mở rộng lần nữa (mặc định mở)
  const [ctxStyleOpen, setCtxStyleOpen] = useState(true);
  // Kẹp 1 khung nổi (menu/popover fixed) vào trong viewport — màn hẹp cũng không tràn
  const clampToViewport = (x, y, w, h, margin = 8) => {
    try {
      const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
      const cw = Math.min(w, vw - margin * 2), ch = Math.min(h, vh - margin * 2);
      return { left: Math.max(margin, Math.min(x, vw - cw - margin)), top: Math.max(margin, Math.min(y, vh - ch - margin)) };
    } catch {
      return { left: x, top: y };
    }
  };
  // H8: popover Tạo nhanh render fixed theo nút (thoát khỏi dock overflow:auto bị cắt)
  // (effect đặt SAU khai báo showCreateMenu để tránh TDZ)
  useEffect(() => {
    if (!showCreateMenu) { setCreateMenuPos(null); return; }
    try {
      const r = createMenuBtnRef.current?.getBoundingClientRect();
      if (r) {
        const w = Math.min(230, (window.innerWidth || 1200) - 16);
        const h = Math.min(220, (window.innerHeight || 800) * 0.6);
        const p = clampToViewport(r.left - w - 10, r.top - 20, w, h);
        setCreateMenuPos({ left: p.left, top: p.top });
      }
    } catch {}
  }, [showCreateMenu]);
  // Chế độ chạm: nút to, dễ bấm bằng ngón tay — tự nhận theo thiết bị
  // (màn hình cảm ứng / pointer thô → BẬT).
  const [touchMode] = useState(() => {
    try {
      const saved = safeGetString("sgk:whiteboard-touch", null);
      if (saved === "1") return true;
      if (saved === "0") return false;
      if (typeof window !== "undefined") {
        if (window.matchMedia?.("(pointer: coarse)").matches) return true;
        if ("ontouchstart" in window || navigator?.maxTouchPoints > 0) return true;
      }
    } catch {}
    return false;
  });

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
  const notifyBoardsUpdate = useCallback((extra) => {
    // emit WHITEBOARD_UPDATED → bus tự alias sang DATA_UPDATED (không cần dispatch 2 lần).
    // Gắn origin (TAB_ID) + boardId/action/at để tab KHÁC phân biệt tin remote (đồng bộ đa tab).
    try { appEvents.emit(AppEvents.WHITEBOARD_UPDATED, { source: "whiteboard", origin: WB_TAB_ID, at: Date.now(), ...(extra || {}) }); } catch {}
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
  // skipSaveRef: applyHistory (undo/redo) không trigger autosave đè bản vừa undo.
  // (Trước đây dùng chung skipHistRef cho cả pushHistory → nuốt mất 1 bước history sau mỗi undo.)
  const skipSaveRef = useRef(false);
  // histTick: ép re-render khi history đổi để nút Undo/Redo + Ctrl+Z không dùng closure cũ.
  // (Trước đây canUndo/canRedo đọc ref mà không re-render → luôn stale.)
  const [histTick, setHistTick] = useState(0);

  const initHistory = useCallback((b) => {
    const snap = boardSnap(b);
    historyRef.current = [snap];
    histIdxRef.current = 0;
    setHistTick((t) => t + 1);
  }, []);

  useEffect(() => { if (board) initHistory(board); }, [board?.id]); // init theo board, hỗ trợ load async

  // Tour tự mở 1 lần duy nhất khi vào bảng trắng lần đầu và bảng đang trống
  useEffect(() => {
    if (boardsLoading || !board) return;
    try {
      if (safeGetString("sgk:whiteboard-tour-seen", "0") === "1") return;
      if ((board.objects || []).length > 0) return;
      setTourStep(0);
      setShowTour(true);
    } catch {}
  }, [boardsLoading, board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // So sánh nhanh 2 snapshot để bỏ push trùng (tránh spam history).
  // Phải bao đủ trường hay đổi (vị trí, kích thước, chữ, màu, viền, font, parent/group/lock...)
  // — trước đây chỉ so x/y/text của 5 object đầu nên đổi màu/format bị nuốt, Ctrl+Z mất tác dụng.
  const isSameSnap = useCallback((prev, snap) => {
    if (!prev || !snap) return false;
    if (prev.zoom !== snap.zoom || prev.pan.x !== snap.pan.x || prev.pan.y !== snap.pan.y) return false;
    if (prev.objects.length !== snap.objects.length || prev.connectors.length !== snap.connectors.length) return false;
    if ((prev.defaultFontFamily || "") !== (snap.defaultFontFamily || "")) return false;
    const keyOf = (o) => [
      o.id, o.kind, Math.round(o.x || 0), Math.round(o.y || 0), Math.round(o.width || 0), Math.round(o.height || 0),
      o.text ?? "", o.fill ?? "", o.stroke ?? "", o.strokeWidth ?? "", o.strokeDash ?? "",
      o.color ?? "", o.fontSize ?? "", o.fontFamily ?? "", o.bold ? 1 : 0, o.italic ? 1 : 0, o.align ?? "",
      typeof o.bullets === "string" ? o.bullets : o.bullets ? "1" : "",
      o.parentId ?? "", o.groupId ?? "", o.locked ? 1 : 0, o.collapsed ? 1 : 0,
      o.shape ?? "", o.imageId ?? "", Array.isArray(o.points) ? o.points.length : 0,
    ].join("|");
    for (let i = 0; i < snap.objects.length; i++) {
      if (keyOf(prev.objects[i]) !== keyOf(snap.objects[i])) return false;
    }
    const cKey = (c) => [c.id, c.fromId, c.toId, c.type ?? "", c.color ?? "", c.width ?? "", c.dash ?? "", c.label ?? "", c.sourceAnchor ?? "", c.targetAnchor ?? ""].join("|");
    for (let i = 0; i < snap.connectors.length; i++) {
      if (cKey(prev.connectors[i]) !== cKey(snap.connectors[i])) return false;
    }
    return true;
  }, []);

  const pushHistory = useCallback((b) => {
    const snap = boardSnap(b);
    const cur = histIdxRef.current;
    const prev = historyRef.current[cur];
    if (prev && isSameSnap(prev, snap)) return;
    historyRef.current = historyRef.current.slice(0, cur + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > 80) { historyRef.current.shift(); }
    else histIdxRef.current++;
    if (historyRef.current.length > 80) histIdxRef.current = historyRef.current.length - 1;
    setHistTick((t) => t + 1);
  }, [isSameSnap]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const canUndo = histIdxRef.current > 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  const applyHistory = useCallback((idx) => {
    const snap = historyRef.current[idx];
    if (!snap) return;
    skipSaveRef.current = true;
    histIdxRef.current = idx;
    setBoard((prev) => ({ ...prev, objects: cloneBoard({ objects: snap.objects }).objects, connectors: cloneBoard({ connectors: snap.connectors }).connectors, zoom: snap.zoom, pan: { ...snap.pan }, defaultFontFamily: snap.defaultFontFamily || "" }));
    setHistTick((t) => t + 1);
  }, []);

  const checkpoint = useCallback(() => { if (board) pushHistory(board); }, [board, pushHistory]);

  // Autosave — liên kết với Settings (behavior.autoSave + whiteboard.autoSave)
  // P0: dùng persistBoardAsync, báo lỗi thật thay vì "Đã lưu" giả
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveSeqRef = useRef(0);
  useEffect(() => {
    // undo/redo vừa apply → bỏ qua 1 lượt autosave để không lưu đè ngay, rồi consume cờ
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    if (!board || boardsLoading) return;
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
    const seq = ++saveSeqRef.current;
    const snapshot = board;
    saveTimerRef.current = setTimeout(() => {
      (async () => {
        try {
          await persistBoardAsync(snapshot);
          if (saveSeqRef.current !== seq) return; // đã có bản mới hơn, bỏ cập nhật
          pendingSaveRef.current = null;
          notifyBoardsUpdate({ boardId: snapshot?.id, action: "save" });
          try {
            const idx = await listBoardsAsync();
            setBoards(idx);
          } catch {}
          setSaveState("saved");
          setSavedAt(new Date());
          playWb("save");
        } catch (e) {
          console.error("[WhiteboardView] autosave failed", e);
          if (saveSeqRef.current !== seq) return;
          setSaveState("error");
          try { pendingSaveRef.current = snapshot; } catch {}
        }
      })();
    }, delay);
    return () => clearTimeout(saveTimerRef.current);
  }, [board, boardsLoading, playWb]);

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
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => setToast(""), 2500);
  }, []);

  // Lưu ngay (Ctrl+S) — async thật, báo đúng trạng thái (trước đây sync + báo "Đã lưu" giả)
  const handleSaveNow = useCallback(async () => {
    if (!board) return;
    setSaveState("saving");
    try {
      clearTimeout(saveTimerRef.current);
      await persistBoardAsync(board);
      pendingSaveRef.current = null;
      notifyBoardsUpdate({ boardId: board?.id, action: "save" });
      try { setBoards(await listBoardsAsync()); } catch { try { setBoards(listBoards()); } catch {} }
      setSaveState("saved");
      setSavedAt(new Date());
      notify("Đã lưu");
    } catch (e) {
      console.error("[WhiteboardView] save now failed", e);
      setSaveState("error");
      notify("Lưu thất bại — kiểm tra dung lượng rồi thử lại");
    }
  }, [board, notify, notifyBoardsUpdate]);

  // Board switching — P0: flush bản hiện tại qua persistBoardAsync trước khi đổi (tránh mất nét cuối)
  const switchingRef = useRef(false);
  const switchBoard = useCallback(async (id) => {
    if (!id || switchingRef.current || id === activeId) { setShowBoardList(false); return; }
    switchingRef.current = true;
    try {
      if (board) {
        clearTimeout(saveTimerRef.current);
        try {
          await persistBoardAsync(board);
          pendingSaveRef.current = null;
          setSaveState("saved");
          setSavedAt(new Date());
        } catch (e) {
          console.error("[WhiteboardView] switchBoard flush failed", e);
          setSaveState("error");
          notify("Lưu bảng hiện tại thất bại — vẫn chuyển bảng, bản chưa lưu còn trong bộ nhớ");
        }
        notifyBoardsUpdate({ boardId: board?.id, action: "save" });
      }
      const b = await loadBoardAsync(id).catch(() => loadBoard(id));
      if (!b) { notify("Không mở được bảng"); return; }
      setBoard(b);
      setActiveId(id);
      setSelection([]); setSelectedConn(null);
      initHistory(b);
      setShowBoardList(false);
      notify(`Đã mở “${b.name}”`); playWb("open");
    } finally {
      switchingRef.current = false;
    }
  }, [board, activeId, initHistory, notify, notifyBoardsUpdate, playWb]);

  const handleNewBoard = useCallback(async () => {
    try {
      const ws = getWbSettings();
      const b = await createBoardAsync();
      b.grid = ws.grid ?? b.grid;
      b.snap = ws.snap ?? b.snap;
      b.smartAlign = ws.smartAlign ?? b.smartAlign;
      b.smartSpacing = ws.smartSpacing ?? b.smartSpacing;
      try { await persistBoardAsync(b); } catch {}
      notifyBoardsUpdate({ boardId: b.id, action: "create" });
      try { setBoards(await listBoardsAsync()); } catch { setBoards(listBoards()); }
      setBoard(b); setActiveId(b.id); setSelection([]); initHistory(b);
      notify("Đã tạo bảng mới");
      playWb("open");
      trackWhiteboardAction("create_board", { boardId: b.id });
    } catch (e) {
      console.error("[WhiteboardView] create board failed", e);
      notify("Tạo bảng thất bại: " + (e?.message || ""));
    }
  }, [initHistory, notify, getWbSettings, playWb]);

  const handleRename = useCallback(async () => {
    if (!board) return;
    const raw = renameDraft.trim();
    if (!raw) { notify("Tên bảng không được để trống."); return; }
    if (raw.length > 120) { notify(`Tên bảng tối đa 120 ký tự (đang ${raw.length}).`); return; }
    const name = raw;
    // Trùng tên được phép (như Google Docs) — không chặn, chỉ lưu
    try {
      const nb = renameBoardStore(board.id, name);
      if (nb) {
        try { await persistBoardAsync(nb); } catch (e) { setSaveState("error"); }
        try { setBoards(await listBoardsAsync()); } catch { setBoards(listBoards()); }
        setBoard(nb);
        notifyBoardsUpdate({ boardId: board.id, action: "rename" });
        notify("Đã đổi tên");
      }
    } catch (e) {
      notify("Đổi tên thất bại: " + (e?.message || ""));
    }
  }, [board, renameDraft, notify, notifyBoardsUpdate]);

  const handleDuplicateBoard = useCallback(async () => {
    if (!board) return;
    try {
      // flush bản gốc trước để bản sao gồm nét mới nhất
      try { await persistBoardAsync(board); } catch {}
      const dup = await duplicateBoardAsync(board.id);
      notifyBoardsUpdate({ boardId: dup?.id, action: "duplicate" });
      try { setBoards(await listBoardsAsync()); } catch { setBoards(listBoards()); }
      setBoard(dup); setActiveId(dup.id); setSelection([]); initHistory(dup);
      notify("Đã nhân bản bảng"); playWb("open");
    } catch (e) {
      console.error("[WhiteboardView] duplicate failed", e);
      notify("Nhân bản thất bại: " + (e?.message || ""));
    }
  }, [board, initHistory, notify, notifyBoardsUpdate, playWb]);

  const handleDeleteBoard = useCallback(async () => {
    if (!board || boards.length <= 1) { notify("Cần giữ ít nhất 1 bảng"); return; }
    setPendingDeleteId(board.id);
  }, [board, boards.length, notify]);

  // ── Quản lý "Bảng của bạn": chọn nhiều + chi tiết + sắp xếp + thao tác lô ──
  const [boardSel, setBoardSel] = useState([]); // ids đang chọn (checkbox)
  const [boardSort, setBoardSort] = useState(() => {
    try { return safeGetString("sgk:whiteboard-board-sort", "updated") || "updated"; } catch { return "updated"; }
  });
  const [boardDetails, setBoardDetails] = useState({}); // id -> {objects, connectors, sizeKb}
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  useEffect(() => {
    try { safeSetString("sgk:whiteboard-board-sort", boardSort || "updated"); } catch {}
  }, [boardSort]);
  // Mở popover → nạp chi tiết từng bảng (số khối/nối/dung lượng) để hiển thị + sắp xếp
  useEffect(() => {
    if (!showBoardList) return;
    let cancelled = false;
    (async () => {
      const out = {};
      for (const b of boards || []) {
        if (cancelled) break;
        try {
          const full = await loadBoardAsync(b.id).catch(() => loadBoard(b.id));
          if (!full) continue;
          const objs = Array.isArray(full.objects) ? full.objects : [];
          const conns = Array.isArray(full.connectors) ? full.connectors : [];
          let chars = 0;
          try { chars = JSON.stringify(full).length; } catch {}
          out[b.id] = { objects: objs.length, connectors: conns.length, sizeKb: formatBoardSizeKb(chars), updatedAt: full.updatedAt || b.updatedAt };
        } catch {}
      }
      if (!cancelled) setBoardDetails(out);
    })();
    return () => { cancelled = true; };
  }, [showBoardList, boards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshBoardList = useCallback(async () => {
    try { setBoards(await listBoardsAsync()); } catch { try { setBoards(listBoards()); } catch {} }
  }, []);

  const toggleBoardSel = useCallback((id) => {
    setBoardSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleRenameBoardId = useCallback(async (id, name) => {
    const raw = String(name || "").trim();
    if (!raw) { notify("Tên bảng không được để trống."); setRenamingId(null); return; }
    if (raw.length > 120) { notify(`Tên bảng tối đa 120 ký tự (đang ${raw.length}).`); setRenamingId(null); return; }
    const clean = raw.slice(0, 120);
    try {
      const nb = renameBoardStore(id, clean);
      if (nb) {
        try { await persistBoardAsync(nb); } catch (e) { setSaveState("error"); }
        await refreshBoardList();
        notifyBoardsUpdate({ boardId: id, action: "rename" });
        if (id === board?.id) { setBoard(nb); setRenameDraft(clean); }
        notify("Đã đổi tên bảng");
      }
    } catch (e) {
      notify("Đổi tên thất bại: " + (e?.message || ""));
    } finally {
      setRenamingId(null);
    }
  }, [board?.id, refreshBoardList, notify, notifyBoardsUpdate]);

  const openFirstRemaining = useCallback(async (remaining, deletedIds) => {
    const next = (remaining || []).find((b) => !(deletedIds || []).includes(b.id)) || remaining?.[0];
    if (next) {
      const nb = await loadBoardAsync(next.id).catch(() => loadBoard(next.id));
      if (nb) { setBoard(nb); setActiveId(next.id); setSelection([]); setSelectedConn(null); initHistory(nb); }
    }
  }, [initHistory]);

  const [pendingDeleteId, setPendingDeleteId] = useState(null); // id bảng chờ xác nhận xóa
  const [pendingBatchDelete, setPendingBatchDelete] = useState(false);
  const doConfirmDelete = useCallback(async () => {
    const ids = pendingDeleteId ? [pendingDeleteId] : [...new Set(boardSel)];
    if (!ids.length) { setPendingDeleteId(null); setPendingBatchDelete(false); return; }
    if (boards.length - ids.length < 1) {
      notify("Cần giữ ít nhất 1 bảng — bỏ chọn bớt rồi xóa");
      setPendingDeleteId(null); setPendingBatchDelete(false); return;
    }
    let okCount = 0;
    for (const id of ids) {
      try { await deleteBoardAsync(id); okCount++; } catch (e) {
        console.error("[WhiteboardView] delete failed", id, e);
      }
    }
    setPendingDeleteId(null); setPendingBatchDelete(false);
    if (!okCount) { notify("Xóa thất bại"); return; }
    notifyBoardsUpdate({ action: ids.length > 1 ? "delete-many" : "delete", boardId: ids[0], count: okCount });
    setBoardSel((prev) => prev.filter((x) => !ids.includes(x)));
    let remaining = [];
    try { remaining = await listBoardsAsync(); } catch { try { remaining = listBoards(); } catch {} }
    setBoards(remaining);
    if (ids.includes(activeId)) await openFirstRemaining(remaining, ids);
    notify(ids.length > 1 ? `Đã xóa ${okCount} bảng` : "Đã xóa bảng"); playWb("close");
  }, [pendingDeleteId, boardSel, boards.length, activeId, notify, notifyBoardsUpdate, openFirstRemaining, playWb]);

  const handleDeleteBoardById = useCallback(async (id) => {
    if (boards.length <= 1) { notify("Cần giữ ít nhất 1 bảng"); return; }
    setPendingDeleteId(id);
  }, [boards.length, notify]);

  const handleDuplicateBoardById = useCallback(async (id, stay = false) => {
    try {
      // flush bảng đang mở để bản sao của nó gồm nét mới nhất
      if (id === board?.id) { try { await persistBoardAsync(board); } catch {} }
      const dup = await duplicateBoardAsync(id);
      notifyBoardsUpdate({ boardId: dup?.id, action: "duplicate" });
      await refreshBoardList();
      if (!stay && dup) {
        setBoard(dup); setActiveId(dup.id); setSelection([]); setSelectedConn(null); initHistory(dup);
      }
      notify(`Đã nhân bản thành “${String(dup?.name || "").slice(0, 40)}”`); playWb("open");
    } catch (e) {
      notify("Nhân bản thất bại: " + (e?.message || ""));
    }
  }, [board, refreshBoardList, initHistory, notify, notifyBoardsUpdate, playWb]);

  // Xóa hàng loạt — luôn giữ ít nhất 1 bảng (xác nhận qua dialog chung)
  const handleBatchDelete = useCallback(async () => {
    const ids = [...new Set(boardSel)];
    if (!ids.length) return;
    if (boards.length - ids.length < 1) { notify("Cần giữ ít nhất 1 bảng — bỏ chọn bớt rồi xóa"); return; }
    setPendingDeleteId(null);
    setPendingBatchDelete(true);
  }, [boardSel, boards.length, notify]);

  // Nhân bản hàng loạt — ở yên bảng đang mở
  const handleBatchDuplicate = useCallback(async () => {
    const ids = [...new Set(boardSel)];
    if (!ids.length) return;
    if (board && ids.includes(board.id)) { try { await persistBoardAsync(board); } catch {} }
    let okCount = 0;
    for (const id of ids) {
      try { await duplicateBoardAsync(id); okCount++; } catch {}
    }
    if (!okCount) { notify("Nhân bản thất bại"); return; }
    notifyBoardsUpdate({ action: "duplicate-many", count: okCount });
    await refreshBoardList();
    notify(`Đã nhân bản ${okCount} bảng`); playWb("open");
  }, [boardSel, board, refreshBoardList, notify, notifyBoardsUpdate, playWb]);

  // Xuất các bảng đã chọn thành 1 file JSON gộp (nhập lại bằng Import JSON)
  const handleBatchExportJSON = useCallback(async () => {
    const ids = [...new Set(boardSel)];
    if (!ids.length) return;
    try {
      const fulls = [];
      for (const id of ids) {
        const b = await loadBoardAsync(id).catch(() => loadBoard(id));
        if (b) fulls.push(stripBoardForExport(b));
      }
      if (!fulls.length) { notify("Không đọc được bảng đã chọn"); return; }
      const blob = new Blob([JSON.stringify({ app: "sgk-whiteboard", version: 1, kind: "boards", exportedAt: new Date().toISOString(), boards: fulls }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `whiteboard-${fulls.length}-bang-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      notify(`Đã xuất ${fulls.length} bảng ra JSON`); playWb("success");
    } catch (e) {
      notify("Xuất thất bại: " + (e?.message || ""));
    }
  }, [boardSel, notify, playWb]);
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

  // Mở ô sửa nhãn đường nối tại vị trí chuột
  const openConnLabelEdit = useCallback((id, x, y) => {
    const c = board.connectors.find((cc) => cc.id === id);
    if (!c) return;
    setConnLabelDraft(c.label || "");
    setConnLabelEdit({ id, x, y });
  }, [board.connectors]);

  // Chốt nhãn đường nối (Enter/blur lưu, Esc hủy)
  const commitConnLabel = useCallback((save) => {
    if (!connLabelEdit) return;
    const { id } = connLabelEdit;
    setConnLabelEdit(null);
    if (!save) return;
    const label = connLabelDraft.trim().slice(0, 120);
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, connectors: prev.connectors.map((c) => c.id === id ? { ...c, label } : c) };
      pushHistory(nb); return nb;
    });
    playWb("click");
  }, [connLabelEdit, connLabelDraft, checkpoint, pushHistory, playWb]);

  // Vá style connector kiểu Canva (mũi/nét/màu/dày/dáng) — 1 hàm chung, giữ history
  const patchConn = useCallback((id, patch) => {
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, connectors: prev.connectors.map((c) => c.id === id ? { ...c, ...patch } : c) };
      pushHistory(nb); return nb;
    });
    playWb("click");
  }, [checkpoint, pushHistory, playWb]);

  // Đổi 1 đầu mũi: suy lại type tương thích (giữ dáng elbow)
  const setConnHead = useCallback((conn, side, head) => {
    const { start, end } = connHeads(conn);
    const s = side === "start" ? head : start;
    const e = side === "start" ? end : head;
    patchConn(conn.id, { startHead: s, endHead: e, type: connTypeForHeads(conn, s, e) });
  }, [patchConn]);

  // Vá live cho thanh trượt (độ cong): setBoard từng tick, history chỉ 2 entry
  // (trước + sau cả lần kéo) thay vì spam N entry — menu không đóng giữa chừng
  const bendSessionRef = useRef(false);
  const bendLatestRef = useRef(null);
  const patchConnLive = useCallback((id, patch) => {
    if (!bendSessionRef.current) { checkpoint(); bendSessionRef.current = true; }
    setBoard((prev) => {
      const nb = { ...prev, connectors: prev.connectors.map((c) => c.id === id ? { ...c, ...patch } : c) };
      bendLatestRef.current = nb;
      return nb;
    });
  }, [checkpoint]);
  const commitConnLive = useCallback(() => {
    if (!bendSessionRef.current) return;
    bendSessionRef.current = false;
    if (bendLatestRef.current) { pushHistory(bendLatestRef.current); bendLatestRef.current = null; }
    playWb("click");
  }, [pushHistory, playWb]);
  // Đóng menu giữa chừng khi đang trượt → vẫn chốt history 1 lần
  useEffect(() => { if (!contextMenu) commitConnLive(); }, [contextMenu, commitConnLive]);

  const handleViewport = useCallback((nz, pan) => {
    setBoard((prev) => ({ ...prev, zoom: nz, pan }));
  }, []);

  // ── Canvas click tạo object (box mới để TRỐNG, không chữ sẵn) ──
  // Font khối mới = font mặc định của bảng (nếu có) → fallback font mặc định của máy,
  // để chữ gõ ra đã đúng font và file tải về giống hệt màn hình.
  const effectiveNewFont = useCallback(() => {
    try {
      const bf = String(board?.defaultFontFamily || "").trim();
      if (bf) return bf;
    } catch {}
    return defaultFontFamily || "";
  }, [board?.defaultFontFamily, defaultFontFamily]);
  const setBoardDefaultFont = useCallback((val) => {
    const v = String(val || "");
    setDefaultFontFamily(v);
    checkpoint();
    setBoard((prev) => {
      if (!prev) return prev;
      const nb = { ...prev, defaultFontFamily: v };
      pushHistory(nb);
      return nb;
    });
    notify(v ? "Đã đổi font mặc định của bảng" : "Đã về font mặc định hệ thống");
  }, [checkpoint, pushHistory, notify]);
  // Thống nhất 1 font cho toàn bảng: đặt font mặc định + gán cho mọi khối chữ
  // (file PNG/JPG/SVG/PDF/Word xuất ra sẽ giữ đúng font này).
  const applyFontToAll = useCallback(() => {
    const v = resolveWbFont("", board?.defaultFontFamily || defaultFontFamily);
    const label = (WB_FONTS.find((f) => f.value === v)?.label) || "đã chọn";
    checkpoint();
    setBoard((prev) => {
      if (!prev) return prev;
      const nb = {
        ...prev,
        defaultFontFamily: v,
        objects: (prev.objects || []).map((o) => (
          o.kind === "stroke" || o.kind === "image" ? o : ensureFits({ ...o, fontFamily: v })
        )),
      };
      pushHistory(nb);
      return nb;
    });
    setDefaultFontFamily(v);
    notify(`Đã thống nhất font “${label}” cho cả bảng`);
  }, [board?.defaultFontFamily, defaultFontFamily, checkpoint, pushHistory, notify]);
  const handleCanvasClick = useCallback((w, curTool) => {
    const mk = (kind, patch) => ({ ...blankObject(kind, patch), x: w.x - (patch.width || 80) / 2, y: w.y - (patch.height || 32) / 2 });
    const ff = effectiveNewFont();
    let obj = null;
    if (curTool === "text") {
      obj = mk("text", { width: 200, height: 48, text: "", fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1.2, fontSize: 16, fontFamily: ff });
    } else if (curTool === "shape") {
      obj = mk("shape", { width: 160, height: 80, text: "", shape: shapeType, fill: "#e0f2fe", stroke: "#0ea5e9", strokeWidth: 2, fontSize: 15, fontFamily: ff });
    } else if (curTool === "note") {
      obj = mk("note", { width: 180, height: 140, text: "", fill: "#fef9c3", stroke: "#facc15", strokeWidth: 1, fontSize: 14, fontFamily: ff });
    } else if (curTool === "mind") {
      obj = mk("node", { width: 170, height: 60, text: "", fill: "#2563eb", color: "#fff", stroke: "transparent", fontSize: 15, bold: true, fontFamily: ff });
    }
    if (obj) {
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: [...prev.objects, obj] };
        pushHistory(nb);
        return nb;
      });
      setSelection([obj.id]);
      // Ô chữ/ghi chú mở sửa ngay để gõ liền; hình/nhánh thì đúp-click để sửa sau
      if (curTool === "text" || curTool === "note") setRequestEditId(obj.id);
      setTool("select");
      notify("Đã thêm khối");
    }
  }, [shapeType, checkpoint, pushHistory, notify, effectiveNewFont]);



  const handleMindAdd = useCallback((parentObj) => {
    checkpoint();
    const child = {
      ...blankObject("node"),
      x: parentObj.x + parentObj.width + 40,
      y: parentObj.y + parentObj.height / 2 - 30,
      width: 160, height: 52, text: "", fill: "#f8fafc", color: "#1e293b", stroke: "#2563eb", strokeWidth: 2, fontSize: 14, bold: false,
      fontFamily: effectiveNewFont(),
      parentId: parentObj.id,
    };
    const conn = { id: uid("c"), fromId: parentObj.id, toId: child.id, type: "arrow", color: "#64748b", width: 2 };
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, child], connectors: [...prev.connectors, conn] };
      pushHistory(nb); return nb;
    });
    setSelection([child.id]);
    setRequestEditId(child.id);
    notify("Đã thêm nhánh con"); playWb("open");
    trackWhiteboardAction("add_branch");
  }, [checkpoint, pushHistory, notify, effectiveNewFont]);

  // Mũi tên 4 hướng: tạo nhánh nhanh theo hướng bấm (lên/xuống/trái/phải)
  const handleQuickBranch = useCallback((dir) => {
    const parentObj = (board?.objects || []).find((o) => o.id === selection?.[0]);
    if (!parentObj || parentObj.kind === "stroke") return;
    if (parentObj.locked) { notify("Khối đang bị khóa — mở khóa trước"); return; }
    checkpoint();
    const GAP = 40, CW = 160, CH = 52;
    let x = parentObj.x + parentObj.width + GAP;
    let y = parentObj.y + parentObj.height / 2 - CH / 2;
    if (dir === "left") { x = parentObj.x - GAP - CW; y = parentObj.y + parentObj.height / 2 - CH / 2; }
    else if (dir === "up") { x = parentObj.x + parentObj.width / 2 - CW / 2; y = parentObj.y - GAP - CH; }
    else if (dir === "down") { x = parentObj.x + parentObj.width / 2 - CW / 2; y = parentObj.y + parentObj.height + GAP; }
    const child = {
      ...blankObject("node"),
      x, y, width: CW, height: CH, text: "",
      fill: "#f8fafc", color: "#1e293b", stroke: "#2563eb", strokeWidth: 2, fontSize: 14, bold: false,
      fontFamily: effectiveNewFont(),
      parentId: parentObj.kind === "node" ? parentObj.id : null,
    };
    const conn = { id: uid("c"), fromId: parentObj.id, toId: child.id, type: "arrow", color: "#64748b", width: 2 };
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, child], connectors: [...prev.connectors, conn] };
      pushHistory(nb); return nb;
    });
    setSelection([child.id]);
    setRequestEditId(child.id);
    notify("Đã thêm nhánh nhanh"); playWb("open");
    trackWhiteboardAction("add_branch_quick", { dir });
  }, [board?.objects, selection, checkpoint, pushHistory, notify, playWb, effectiveNewFont]);

  // Tạo object nhanh tại vị trí chuột phải (không qua toolbar)
  const createAt = useCallback((wx, wy, kind, extra = {}) => {
    checkpoint();
    const ff = effectiveNewFont();
    const base = { x: wx - 100, y: wy - 24, width: 200, height: 48 };
    let patch = {};
    if (kind === "text") patch = { width: 200, height: 48, text: "", fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1.2, fontSize: 16, fontFamily: ff, ...extra };
    else if (kind === "note") patch = { width: 180, height: 140, text: "", fill: "#fef9c3", stroke: "#facc15", strokeWidth: 1, fontSize: 14, fontFamily: ff, ...extra };
    else if (kind === "shape") patch = { width: 160, height: 80, text: "", shape: shapeType, fill: "#e0f2fe", stroke: "#0ea5e9", strokeWidth: 2, fontSize: 15, fontFamily: ff, ...extra };
    else if (kind === "node") patch = { width: 170, height: 60, text: "", fill: "#2563eb", color: "#fff", stroke: "transparent", fontSize: 15, bold: true, fontFamily: ff, ...extra };
    const obj = { ...blankObject(kind === "shape" ? "shape" : kind === "note" ? "note" : kind === "node" ? "node" : "text"), ...base, ...patch };
    setBoard((prev) => { const nb = { ...prev, objects: [...prev.objects, obj] }; pushHistory(nb); return nb; });
    setSelection([obj.id]);
    if (kind === "text" || kind === "note" || kind === "node") setRequestEditId(obj.id);
    notify("Đã thêm"); playWb("open");
    trackWhiteboardAction("create_object", { kind });
    return obj;
  }, [shapeType, checkpoint, pushHistory, notify, effectiveNewFont]);

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
    const { objects, connectors } = generateMindmap(topic, Array.from({ length: n }, (_, i) => `Nhánh ${i + 1}`), { cx, cy, themeId: mindTheme });
    setBoard((prev) => {
      const nb = { ...prev, objects: [...prev.objects, ...objects], connectors: [...prev.connectors, ...connectors] };
      pushHistory(nb); return nb;
    });
    setShowMindModal(false);
    setTool("select");
    notify("Đã tạo mindmap"); playWb("success");
    trackWhiteboardAction("create_mindmap", { branches: n });
  }, [mindTopic, mindBranches, mindTheme, checkpoint, pushHistory, notify, findFreeSpot]);

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

  // ── Auto layout: xếp node + neo đường nối đúng phía (hết chéo) ──
  // Radial lấy tâm = giữa khung nhìn hiện tại (xếp ở chỗ đang nhìn, không nhảy mất dấu)
  const doAutoLayout = useCallback((mode) => {
    checkpoint();
    let viewCenter = null;
    try {
      const svg = svgRef.current;
      const vw = svg?.clientWidth || 900, vh = svg?.clientHeight || 600;
      viewCenter = { cx: (-board.pan.x + vw / 2) / board.zoom, cy: (-board.pan.y + vh / 2) / board.zoom };
    } catch {}
    const laid = autoLayout(board.objects, board.connectors, mode, viewCenter || {});
    const anchored = applyLayoutAnchors(board.connectors, mode);
    setBoard((prev) => { const nb = { ...prev, objects: laid, connectors: anchored }; pushHistory(nb); return nb; });
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
    // Pass 1: cấp id mới cho TOÀN BỘ object trước (hết order bug), đồng thời map groupId cũ → mới
    const idMap = new Map();
    const groupMap = new Map();
    for (const o of clip.objects) {
      idMap.set(o.id, uid("o"));
      if (o.groupId && !groupMap.has(o.groupId)) groupMap.set(o.groupId, uid("g"));
    }
    // Chỉ giữ group khi ≥2 object cùng group được copy (tránh nhóm ma 1 thành viên)
    const groupCount = new Map();
    for (const o of clip.objects) {
      if (o.groupId) groupCount.set(o.groupId, (groupCount.get(o.groupId) || 0) + 1);
    }
    const fixedObjs = clip.objects.map((o) => ({
      ...o,
      id: idMap.get(o.id),
      x: o.x + offsetX,
      y: o.y + offsetY,
      parentId: o.parentId ? idMap.get(o.parentId) || null : null,
      groupId: o.groupId && (groupCount.get(o.groupId) || 0) >= 2 ? groupMap.get(o.groupId) : null,
    }));
    const newIds = new Set(fixedObjs.map((o) => o.id));
    // parentId trỏ ra ngoài clipboard → null (không giữ id cũ)
    for (const o of fixedObjs) {
      if (o.parentId && !newIds.has(o.parentId)) o.parentId = null;
    }
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
    const colors = NOTE_COLORS;
    const idx = colors.indexOf(note.fill);
    const next = colors[(idx + 1) % colors.length];
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: prev.objects.map((o) => o.id === id ? { ...o, fill: next } : o) };
      pushHistory(nb); return nb;
    });
    notify("Đã đổi màu");
  }, [board.objects, checkpoint, pushHistory, notify]);

  // ── Dọn hình nền lớn: tìm khối trắng to gấp nhiều lần các khối khác (nằm sau cùng) để xóa
  const handleCleanBackground = useCallback(() => {
    const biggest = findBackgroundCandidate(board.objects || []);
    if (!biggest) { notify("Không thấy hình nền lớn"); return; }
    if (biggest.locked) { notify("Hình nền đang bị khóa — mở khóa trước khi xóa"); return; }
    const ok = window.confirm(`Xóa hình nền lớn (“${String(biggest.text || biggest.kind).slice(0, 40)}”)? Vẫn hoàn tác được bằng Ctrl+Z.`);
    if (!ok) return;
    checkpoint();
    const gid = biggest.id;
    setBoard((prev) => {
      const remaining = prev.objects.filter((o) => o.id !== gid);
      const remIds = new Set(remaining.map((o) => o.id));
      const conns = prev.connectors.filter((c) => remIds.has(c.fromId) && remIds.has(c.toId));
      const nb = { ...prev, objects: remaining, connectors: conns };
      pushHistory(nb); return nb;
    });
    setSelection((prev) => prev.filter((id) => id !== gid));
    notify("Đã xóa hình nền");
    playWb("close");
  }, [board.objects, checkpoint, pushHistory, notify, playWb]);

  // ── Align / Distribute ──
  const handleAlign = useCallback((kind) => {
    if (selection.length < 2) { notify("Chọn ít nhất 2 khối"); return; }
    checkpoint();
    const objs = board.objects.filter((o) => selection.includes(o.id));
    if (!objs.length) return;
    const next = alignObjects(board.objects, selection, kind);
    setBoard((prev) => { const nb = { ...prev, objects: next }; pushHistory(nb); return nb; });
    notify("Đã căn chỉnh"); playWb("click");
  }, [selection, board.objects, checkpoint, pushHistory, notify]);

  const handleDistribute = useCallback((axis) => {
    if (selection.length < 3) { notify("Chọn ít nhất 3 khối"); return; }
    checkpoint();
    const next = distributePositions(board.objects, selection, axis);
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
      const next = reorderObjects(prev.objects, ids, mode);
      const nb = { ...prev, objects: next };
      pushHistory(nb); return nb;
    });
  }, [checkpoint, pushHistory]);

  // ── Style for selection ──
  const single = selection.length === 1 ? (board?.objects || []).find((o) => o.id === selection[0]) : null;
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

  // ── Style chung cho nhiều khối (kéo thả chọn nhiều → chỉnh format chung như 1 khối) ──
  const multiObjs = selection.length > 1 ? (board?.objects || []).filter((o) => selection.includes(o.id)) : [];
  const updateMulti = useCallback((patch, textOnly = false) => {
    const ids = new Set(selection);
    if (!ids.size) return;
    const targets = (board?.objects || []).filter((o) => ids.has(o.id) && !o.locked && (!textOnly || (o.kind !== "stroke" && o.kind !== "image")));
    if (!targets.length) { notify("Các khối đang bị khóa — mở khóa trước"); return; }
    const targetIds = new Set(targets.map((o) => o.id));
    checkpoint();
    setBoard((prev) => {
      const nb = {
        ...prev,
        objects: prev.objects.map((o) => {
          if (!targetIds.has(o.id)) return o;
          return ensureFits({ ...o, ...patch });
        }),
      };
      pushHistory(nb);
      return nb;
    });
    playWb("click");
  }, [selection, board?.objects, checkpoint, pushHistory, notify, playWb]);
  // Giá trị chung để hiển thị control: giống nhau → hiện, khác nhau → "__mixed__"
  const multiVal = (key) => {
    if (!multiObjs.length) return undefined;
    const v0 = multiObjs[0]?.[key];
    return multiObjs.every((o) => o[key] === v0) ? v0 : "__mixed__";
  };

  // ── Trang trí nhanh sơ đồ: bullets / emoji / cỡ chữ / đánh số nhánh / theme nhánh ──
  const [showEmoji, setShowEmoji] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const handleBumpFont = useCallback((delta) => {
    if (!single) return;
    updateSingle({ fontSize: Math.max(10, Math.min(48, (Number(single.fontSize) || 15) + delta)) });
  }, [single, updateSingle]);
  const handlePrependEmoji = useCallback((emoji) => {
    if (!single) return;
    updateSingle({ text: `${emoji} ${single.text || ""}`.slice(0, 5000) });
    setShowEmoji(false);
    notify(`Đã thêm ${emoji}`);
  }, [single, updateSingle, notify]);
  const handleNumberChildren = useCallback((id = null) => {
    const targetId = id || single?.id;
    const target = (board.objects || []).find((o) => o.id === targetId);
    if (!target || target.kind === "stroke") return;
    const kids = board.objects.filter((o) => o.parentId === targetId);
    if (!kids.length) { notify("Nhánh chưa có node con"); return; }
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: numberBranchChildren(prev.objects, targetId) };
      pushHistory(nb); return nb;
    });
    notify(`Đã đánh số ${kids.length} nhánh con`);
    playWb("success");
  }, [single, board.objects, checkpoint, pushHistory, notify, playWb]);
  const handleBranchTheme = useCallback((themeId) => {
    if (!single) return;
    const theme = MINDMAP_THEMES.find((t) => t.id === themeId);
    if (!theme) return;
    const hasKids = board.objects.some((o) => o.parentId === single.id);
    checkpoint();
    if (!hasKids) {
      // Node chưa có con: tô luôn màu đầu theme lên chính khối (panel theme không bao giờ vô dụng)
      const col = theme.colors[0];
      setBoard((prev) => {
        const nb = { ...prev, objects: prev.objects.map((o) => o.id === single.id ? ensureFits({ ...o, fill: col, color: textOnFill(col), stroke: "transparent", strokeWidth: 0 }) : o) };
        pushHistory(nb); return nb;
      });
      notify(`Đã tô màu theme “${theme.label}” cho khối`);
      playWb("success");
      return;
    }
    setBoard((prev) => {
      const nb = { ...prev, objects: applyBranchTheme(prev.objects, single.id, themeId) };
      pushHistory(nb); return nb;
    });
    notify(`Đã tô theme “${theme.label}” cho nhánh`);
    playWb("success");
  }, [single, board.objects, checkpoint, pushHistory, notify, playWb]);

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
    const targetId = replaceImageId;
    try {
      const { saveImageBlob, blobToObjectURL, deleteImageBlobIfOrphan } = await import("./imageStore.js");
      const { listBoardsAsync, loadBoardAsync } = await import("./whiteboardStore.js");
      const old = (board?.objects || []).find((o) => o.id === targetId);
      const oldImageId = old?.imageId || null;
      const blob = file.slice(0, file.size, file.type || "image/png");
      const imageId = await saveImageBlob(blob);
      const url = blobToObjectURL(blob);
      imageUrlMapRef.current.set(imageId, url);
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: prev.objects.map((o) => o.id === targetId ? { ...o, imageId, src: url } : o) };
        pushHistory(nb); return nb;
      });
      // P0: chỉ xóa blob cũ khi không còn board/object nào khác dùng (board nhân bản share imageId)
      if (oldImageId && oldImageId !== imageId) {
        try {
          let allBoards = [];
          try {
            const idx = await listBoardsAsync();
            allBoards = await Promise.all((idx || []).map((e) => loadBoardAsync(e.id).catch(() => null)));
          } catch {}
          // cập nhật board hiện tại trong danh sách quét với imageId MỚI để orphan-check chính xác
          allBoards = (allBoards || []).map((b) => {
            if (b && b.id === board?.id) {
              return { ...b, objects: (b.objects || []).map((o) => o.id === targetId ? { ...o, imageId } : o) };
            }
            return b;
          });
          const deleted = await deleteImageBlobIfOrphan(oldImageId, allBoards, board?.id, targetId);
          if (!deleted) {
            // còn board khác dùng → giữ blob, revoke URL cũ của object này nếu khác URL dùng chung
            try {
              const oldUrl = imageUrlMapRef.current.get(oldImageId);
              if (oldUrl && oldUrl !== url) { /* giữ trong map vì board khác còn dùng */ }
            } catch {}
          } else {
            try {
              const oldUrl = imageUrlMapRef.current.get(oldImageId);
              if (oldUrl) { try { URL.revokeObjectURL(oldUrl); } catch {} imageUrlMapRef.current.delete(oldImageId); }
            } catch {}
          }
        } catch {}
      }
      notify("Đã thay ảnh");
    } catch (e) { notify("Thay ảnh thất bại: " + e.message); }
    setReplaceImageId(null);
  }, [replaceImageId, board?.objects, board?.id, checkpoint, pushHistory, notify]);

  // Resolve imageId -> objectURL khi load board (và revoke khi unmount)
  // FIX: blob: URL is ephemeral — persisted board now has src=null, must re-hydrate every time imageId exists.
  // Previously only !o.src was handled, so revoked blob: URL (persisted before fix) was never re-resolved → image lost on re-enter.
  useEffect(() => {
    if (!board) return;
    let cancelled = false;
    (async () => {
      const need = (board.objects || []).filter((o) => {
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
  }, [board?.id, (board?.objects || []).filter((o) => o.imageId && !o.src).map((o) => o.imageId).join(",")]);

  useEffect(() => () => {
    // revoke tất cả objectURL khi rời Whiteboard
    imageUrlMapRef.current.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} });
    imageUrlMapRef.current.clear();
  }, []);

  // Đóng context menu khi click ngoài hoặc Esc
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => setContextMenu(null);
    const onKey = (e) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("click", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", onDown); window.removeEventListener("keydown", onKey); };
  }, [contextMenu]);

  // ── Snapshot phiên bản theo board: lưu bản tay, khôi phục khi xóa nhầm ──
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const refreshVersions = useCallback(() => {
    try {
      const arr = safeGetJSON(versionsKey(board?.id), []);
      setVersions(Array.isArray(arr) ? arr : []);
    } catch { setVersions([]); }
  }, [board?.id]);
  useEffect(() => { if (showVersions) refreshVersions(); }, [showVersions, refreshVersions]);
  const handleSaveVersion = useCallback(() => {
    if (!board) return;
    try {
      const snap = stripBoardForExport(board);
      if (JSON.stringify(snap).length > 500 * 1024) { notify("Bảng quá nặng (>500KB) — không lưu bản được"); return; }
      const key = versionsKey(board.id);
      const arr = safeGetJSON(key, []);
      const list = Array.isArray(arr) ? arr : [];
      list.unshift({ vid: uid("v"), name: new Date().toLocaleString("vi-VN"), at: Date.now(), board: snap });
      const trimmed = list.slice(0, 5);
      const res = safeSetJSON(key, trimmed);
      if (!res.ok) { notify("Lưu bản thất bại (bộ nhớ đầy?)"); return; }
      setVersions(trimmed);
      notify(`Đã lưu bản lúc ${trimmed[0].name} (giữ tối đa 5 bản)`);
      playWb("save");
    } catch (e) { notify("Lưu bản thất bại: " + (e?.message || "")); }
  }, [board, notify, playWb]);
  const handleRestoreVersion = useCallback((vid) => {
    const v = versions.find((x) => x.vid === vid);
    if (!v?.board) return;
    const ok = window.confirm(`Khôi phục bản lúc ${v.name}? Bản hiện tại vẫn hoàn tác được bằng Ctrl+Z.`);
    if (!ok) return;
    checkpoint();
    setBoard((prev) => {
      const nb = { ...prev, objects: v.board.objects || [], connectors: v.board.connectors || [], zoom: v.board.zoom ?? prev.zoom, pan: v.board.pan ?? prev.pan };
      pushHistory(nb); return nb;
    });
    setSelection([]); setSelectedConn(null);
    setShowVersions(false);
    notify(`Đã khôi phục bản lúc ${v.name}`);
    playWb("success");
  }, [versions, checkpoint, pushHistory, notify, playWb]);
  const handleDeleteVersion = useCallback((vid) => {
    try {
      const key = versionsKey(board?.id);
      const arr = safeGetJSON(key, []);
      const next = (Array.isArray(arr) ? arr : []).filter((x) => x.vid !== vid);
      safeSetJSON(key, next);
      setVersions(next);
    } catch {}
  }, [board?.id]);

  // ── Export handling ──
  const getViewForExport = useCallback(() => {
    const svg = svgRef.current;
    return { zoom: board.zoom, pan: { ...board.pan }, w: svg?.clientWidth || 1200, h: svg?.clientHeight || 800 };
  }, [board.zoom, board.pan]);

  const doExport = useCallback(async (kind) => {
    const svg = svgRef.current;
    if (!svg || doExport.busy) return;
    doExport.busy = true;
    const view = getViewForExport();
    try {
      let ok = false;
      if (kind === "svg") ok = await exportSVG(board, svg, exportScope, view);
      else if (kind === "json") ok = exportJSON(board);
      else if (kind === "png") ok = await exportRaster(board, svg, "png", exportScope, view);
      else if (kind === "jpg") ok = await exportRaster(board, svg, "jpg", exportScope, view);
      else if (kind === "pdf") ok = await exportPDF(board, svg, exportScope, view);
      if (ok) { notify("Đã xuất file"); playWb("success"); }
      else { notify(kind === "pdf" ? "Xuất PDF thất bại — cho phép popup rồi thử lại, hoặc dùng PNG" : "Xuất thất bại — thử lại với phạm vi 'Nội dung' hoặc bảng nhỏ hơn"); }
    } catch (e) { notify("Xuất thất bại: " + e.message); }
    finally { doExport.busy = false; }
    setShowExport(false);
  }, [board, exportScope, getViewForExport, notify]);

  // ── Import JSON ──
  const handleImportJSON = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      // File gộp nhiều bảng (xuất từ "Xuất JSON đã chọn") → nhập mỗi bảng thành bảng mới
      let multi = null;
      try { multi = extractMultiBoardsPayload(JSON.parse(text)); } catch {}
      if (multi && multi.length) {
        let okCount = 0;
        for (const entry of multi.slice(0, 50)) {
          try {
            const res = parseBoardJSON(JSON.stringify(entry));
            if (!res.ok) continue;
            await persistBoardAsync(res.board);
            okCount++;
          } catch {}
        }
        if (!okCount) { notify("File không có bảng hợp lệ"); return; }
        notifyBoardsUpdate({ action: "import-many", count: okCount });
        try { setBoards(await listBoardsAsync()); } catch { try { setBoards(listBoards()); } catch {} }
        notify(`Đã nhập ${okCount} bảng mới`); playWb("success");
        return;
      }
      const res = parseBoardJSON(text);
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
  }, [checkpoint, pushHistory, notify, notifyBoardsUpdate, playWb]);

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
  // P1: chống double-click tạo request song song + hỗ trợ Hủy (cancelRequestsByPrefix)
  const aiBusyRef = useRef(false);
  const aiEditedRef = useRef(false); // preview đã bị user sửa → apply phải hạ checked
  const aiApplyingRef = useRef(false); // guard double-click "Đưa lên bảng"
  const handleAICancel = useCallback(async () => {
    try {
      const mod = await import("./aiMindmapService.js");
      mod.cancelMindmapRequests?.();
    } catch {}
    aiBusyRef.current = false;
    setAiBusy(false);
    setAiError("Đã hủy tạo sơ đồ.");
  }, []);
  // Rời Whiteboard khi AI còn chạy → hủy để khỏi tốn quota + setState sau unmount
  useEffect(() => () => {
    try { import("./aiMindmapService.js").then((m) => { try { m.cancelMindmapRequests?.(); } catch {} }).catch(() => {}); } catch {}
  }, []);
  const handleAIGenerate = useCallback(async () => {
    if (aiBusyRef.current) return;
    const topic = aiTopic.trim();
    const textBody = aiText.trim();
    const ideas = aiSmallIdeas.map((s) => s.trim()).filter(Boolean);
    if (!topic && !textBody && !aiImageFile && !ideas.length) {
      setAiError("Nhập chủ đề, dán văn bản hoặc chọn ảnh để tạo sơ đồ.");
      return;
    }
    aiBusyRef.current = true;
    setAiBusy(true);
    setAiError("");
    setAiProgress("");
    const STAGE_LABEL = {
      gen: "Đang sinh sơ đồ…",
      validate: "Đang đối chiếu nguồn…",
      "retry-gen": "Đang sinh lại (lần 2)…",
      "retry-validate": "Đang đối chiếu lại…",
    };
    try {
      const { generateMindmapPlan } = await import("./aiMindmapService.js");
      const res = await generateMindmapPlan({
        topic,
        text: textBody,
        imageFile: aiImageFile,
        smallIdeas: ideas,
        onStage: (s) => { if (aiBusyRef.current && STAGE_LABEL[s]) setAiProgress(STAGE_LABEL[s]); },
      });
      if (!aiBusyRef.current) return; // đã hủy giữa chừng → bỏ kết quả
      if (!res?.plan?.branches?.length) {
        setAiError("Không tạo được sơ đồ từ nội dung này. Hãy bổ sung nguồn chi tiết hơn (nhiều dòng văn bản hoặc ý nhỏ).");
        return;
      }
      // M8: gắn key ổn định cho nhánh để xóa/sửa giữa danh sách không nhảy input
      setAiPlan(withPlanKeys(res.plan));
      setAiMeta({ mode: res.mode, warnings: res.warnings || [], checked: !!res.checked });
      aiEditedRef.current = false; // plan mới nguyên bản — chưa bị sửa
      setAiStage("preview");
    } catch (e) {
      if (!aiBusyRef.current) return;
      const msg = String(e?.message || "");
      if (e?.code === "CANCELLED" || msg.includes("Đã dừng") || msg.includes("abort")) {
        setAiError("Đã hủy tạo sơ đồ.");
      } else {
        setAiError(e?.message || "AI tạo sơ đồ thất bại. Thử lại nhé!");
      }
    } finally {
      aiBusyRef.current = false;
      setAiBusy(false);
      setAiProgress("");
    }
  }, [aiTopic, aiText, aiImageFile, aiSmallIdeas]);

  // M8: key ổn định cho nhánh preview (key={index} làm input nhảy focus khi xóa giữa danh sách)
  const withPlanKeys = (plan) => {
    if (!plan || typeof plan !== "object") return plan;
    return {
      ...plan,
      branches: (plan.branches || []).map((b) =>
        typeof b === "string" ? { label: b, children: [], _k: uid("k") } : { ...b, _k: b._k || uid("k") },
      ),
    };
  };

  // M6: "Tạo lại" trong preview vứt bỏ sửa chữa — hỏi trước khi mất
  const handleAIRegenerate = useCallback(() => {
    if (aiBusyRef.current) return;
    if (aiEditedRef.current && aiPlan) {
      const ok = window.confirm("Tạo lại sẽ mất các sửa chữa trong preview. Tiếp tục?");
      if (!ok) return;
    }
    handleAIGenerate();
  }, [handleAIGenerate, aiPlan]);

  // ── Đưa plan từ preview xuống canvas ──
  // C5: đóng modal (kể cả bấm ra ngoài) phải hủy request đang chạy — không để chạy nền rồi đổ preview cũ
  const closeAIModal = useCallback(() => {
    try { import("./aiMindmapService.js").then((m) => { try { m.cancelMindmapRequests?.(); } catch {} }).catch(() => {}); } catch {}
    aiBusyRef.current = false;
    setAiBusy(false);
    setAiProgress("");
    aiApplyingRef.current = false;
    aiEditedRef.current = false;
    setShowAI(false);
    setAiStage("form");
    setAiPlan(null);
    setAiMeta(null);
    setAiError("");
  }, []);

  const handleAIApply = useCallback(() => {
    // C5: guard double-click — 2 lần bấm không được append 2 graph chồng nhau
    const src = aiPlan;
    if (!src || aiApplyingRef.current) return;
    aiApplyingRef.current = true;
    try {
      // C3: làm sạch plan sau khi user sửa — bỏ rỗng/trùng, enforce giới hạn, không bịa nhãn
      const { plan: clean, warnings } = sanitizePlanForApply(src);
      if (!clean || !clean.topic) {
        setAiError("Chủ đề đang trống — hãy nhập chủ đề trước khi đưa lên bảng.");
        aiApplyingRef.current = false;
        return;
      }
      if (!clean.branches.length) {
        setAiError("Sơ đồ trống sau khi làm sạch (nhãn rỗng đã bị bỏ) — hãy thêm ít nhất 1 nhánh có chữ.");
        aiApplyingRef.current = false;
        return;
      }
      // Dựng ở gốc tọa độ để đo kích thước thật, rồi đặt vào vùng trống theo đúng bounds (H8)
      const graph = aiPlanToGraph(clean, 0, 0);
      if (!graph || !graph.objects.length) {
        setAiError("Không tạo được sơ đồ từ kết quả preview.");
        aiApplyingRef.current = false;
        return;
      }
      const nNodes = graph.objects.length;
      if (nNodes > 40) {
        const ok = window.confirm(`Sơ đồ lớn (${nNodes} khối). Vẫn đưa lên bảng?`);
        if (!ok) { aiApplyingRef.current = false; return; }
      }
      const minX = Math.min(...graph.objects.map((o) => o.x));
      const minY = Math.min(...graph.objects.map((o) => o.y));
      const maxX = Math.max(...graph.objects.map((o) => o.x + (o.width || 0)));
      const maxY = Math.max(...graph.objects.map((o) => o.y + (o.height || 0)));
      const gw = Math.max(200, maxX - minX);
      const gh = Math.max(150, maxY - minY);
      const { cx, cy } = findFreeSpot(Math.min(1600, gw + 240), Math.min(1200, gh + 240));
      const dx = cx - (minX + maxX) / 2;
      const dy = cy - (minY + maxY) / 2;
      for (const o of graph.objects) { o.x += dx; o.y += dy; }
      // H7: gắn nguồn gốc để truy vết (chip nguồn hiện citation; không có nút Mở sách vì không phải nguồn sách)
      const citation = `AI mindmap — ${clean.topic}`.slice(0, 120);
      const srcRef = { origin: "ai-mindmap", title: citation, citation, topic: clean.topic, mode: aiMeta?.mode || "ai", at: Date.now() };
      for (const o of graph.objects) {
        if (!o.citation) o.citation = citation;
        if (!o.sourceRef) o.sourceRef = { ...srcRef };
      }
      // Nhãn đã bị sửa tay thì kết quả đối chiếu nguồn không còn giá trị
      const edited = aiEditedRef.current;
      const editWarn = edited ? "Bạn đã sửa nhãn sau khi tạo — sơ đồ chưa được đối chiếu lại với nguồn, hãy tự kiểm tra." : "";
      checkpoint();
      setBoard((prev) => {
        const nb = { ...prev, objects: [...prev.objects, ...graph.objects], connectors: [...prev.connectors, ...graph.connectors] };
        pushHistory(nb); return nb;
      });
      trackWhiteboardAction("ai_mindmap_create", {
        mode: aiMeta?.mode || "ai",
        branches: clean.branches.length,
        checked: edited ? false : !!aiMeta?.checked,
        edited,
      });
      closeAIModal();
      notify([aiMeta?.mode === "local" ? "Đã tạo sơ đồ từ văn bản của bạn" : "AI đã tạo sơ đồ", ...warnings, editWarn].filter(Boolean).join(" — "));
      playWb("success");
    } catch (e) {
      aiApplyingRef.current = false;
      setAiError(e?.message || "Đưa lên bảng thất bại. Thử lại nhé!");
    }
  }, [aiPlan, aiMeta, findFreeSpot, checkpoint, pushHistory, notify, playWb, closeAIModal]);

  // ── Sửa plan trong preview (nhãn, con, nhánh) ──
  // Updater pure: deep-copy trước khi sửa + đánh dấu đã sửa để apply hạ checked
  const editAiPlan = useCallback((updater) => {
    aiEditedRef.current = true;
    setAiPlan((p) => {
      if (!p) return p;
      const copy = { ...p, branches: p.branches.map((b) => (typeof b === "string" ? b : { ...b, children: [...(b.children || [])] })) };
      const next = typeof updater === "function" ? updater(copy) : updater;
      return next;
    });
  }, []);

  // Ghi nhớ trạng thái thu gọn thanh công cụ / topbar
  useEffect(() => {
    safeSetString("sgk:whiteboard-toolbar-collapsed", toolbarCollapsed ? "1" : "0");
  }, [toolbarCollapsed]);
  useEffect(() => {
    safeSetString("sgk:whiteboard-topbar-collapsed", topbarCollapsed ? "1" : "0");
  }, [topbarCollapsed]);
  useEffect(() => {
    if (!showBoardList) return;
    const onKey = (e) => { if (e.key === "Escape") setShowBoardList(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBoardList]);

  // ── Fit to screen ──
  const fitToScreen = useCallback(() => {
    if (!board.objects.length) { setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } })); return; }
    const bb = boardBounds(board.objects, board.connectors, 80);
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
        (async () => {
          try {
            setSaveState("saving");
            await persistBoardAsync(board);
            try { setBoards(await listBoardsAsync()); } catch { setBoards(listBoards()); }
            notifyBoardsUpdate({ boardId: board?.id, action: "save" });
            setSaveState("saved"); setSavedAt(new Date()); notify("Đã lưu"); playWb("save");
          } catch (err) {
            console.error("[WhiteboardView] manual save failed", err);
            setSaveState("error"); notify("Lưu thất bại — kiểm tra dung lượng/IndexedDB rồi thử lại");
          }
        })();
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
        // Alt + Mũi tên: tạo nhánh nhanh theo hướng từ khối đang chọn (1 khối, không khóa)
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
          if (selection.length === 1 && single && single.kind !== "stroke" && !single.locked) {
            e.preventDefault();
            const dir = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : e.key === "ArrowUp" ? "up" : "down";
            handleQuickBranch(dir);
          }
          return;
        }
        // Tab / Shift+Tab: chuyển chọn khối kế tiếp / trước đó
        if (e.key === "Tab") {
          const objs = (board.objects || []).filter((o) => o && o.kind !== "stroke");
          if (objs.length) {
            e.preventDefault();
            const curIdx = selection.length === 1 ? objs.findIndex((o) => o.id === selection[0]) : -1;
            const next = e.shiftKey
              ? objs[(curIdx <= 0 ? objs.length : curIdx) - 1]
              : objs[(curIdx + 1) % objs.length];
            if (next) { setSelection([next.id]); setSelectedConn(null); playWb("click"); }
          }
          return;
        }
        // Enter / F2: sửa chữ khối đang chọn — Enter nhường khi focus đang ở nút/link
        if ((e.key === "Enter" || e.key === "F2") && single && !single.locked) {
          const ae = document.activeElement;
          const btnFocused = ae && (ae.tagName === "BUTTON" || ae.tagName === "A");
          if (e.key === "F2" || !btnFocused) {
            e.preventDefault(); setRequestEditId(single.id); return;
          }
        }
        // + / - : zoom nhanh quanh giữa màn hình; 0: về 100%
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setBoard((p) => ({ ...p, zoom: Math.min(3, (p.zoom || 1) * 1.15) })); playWb("click"); return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          setBoard((p) => ({ ...p, zoom: Math.max(0.2, (p.zoom || 1) / 1.15) })); playWb("click"); return;
        }
        if (e.key === "0" && selection.length === 0) {
          e.preventDefault();
          setBoard((p) => ({ ...p, zoom: 1 })); playWb("click"); return;
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
  // histTick: ép re-subscribe sau mỗi push/undo để Ctrl+Z không kẹt closure cũ
  }, [board, canUndo, canRedo, histTick, deleteSelection, applyHistory, handleCopy, handlePaste, handleDuplicateSel, handleGroup, handleUngroup, handleQuickBranch, checkpoint, selection, single, notify, playWb]);

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

  // ── Đồng bộ đa tab (đặt SAU mọi state/callback để tránh TDZ lúc render) ──
  // Gương ref cho subscriber (tránh stale closure, đăng ký 1 lần)
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);
  const showBoardListRef = useRef(false);
  useEffect(() => { showBoardListRef.current = showBoardList; }, [showBoardList]);
  // Tab khác vừa lưu bảng → báo 1 lần (không spam), không tự ghi đè
  const [remoteNotice, setRemoteNotice] = useState(null); // {boardId, at}
  useEffect(() => {
    const off = appEvents.on(AppEvents.WHITEBOARD_UPDATED, (detail) => {
      try {
        if (!isRemoteWhiteboardEvent(detail, WB_TAB_ID)) return;
        const remoteBoardId = detail?.boardId || null;
        const structural = detail?.action === "create" || detail?.action === "delete" || detail?.action === "rename" || detail?.action === "duplicate";
        if (structural || showBoardListRef.current) {
          listBoardsAsync().then((idx) => setBoards(idx)).catch(() => {});
        }
        if (!remoteBoardId || remoteBoardId !== activeIdRef.current) return;
        setRemoteNotice((prev) => prev || { boardId: remoteBoardId, at: detail?.at || Date.now() });
      } catch {}
    });
    return () => { try { off(); } catch {} };
  }, []);
  // Tải bản mới từ tab khác (bỏ thay đổi chưa lưu của tab này — đã hỏi rõ)
  const reloadRemoteBoard = useCallback(async () => {
    const id = remoteNotice?.boardId || activeIdRef.current;
    setRemoteNotice(null);
    if (!id) return;
    try {
      clearTimeout(saveTimerRef.current);
      pendingSaveRef.current = null;
      const b = await loadBoardAsync(id).catch(() => loadBoard(id));
      if (!b) { notify("Không tải được bản mới"); return; }
      setBoard(b); setActiveId(id);
      setSelection([]); setSelectedConn(null);
      initHistory(b);
      setSaveState("saved"); setSavedAt(new Date());
      notify("Đã tải bản mới từ tab khác"); playWb("open");
    } catch { notify("Không tải được bản mới"); }
  }, [remoteNotice, initHistory, notify, playWb]);
  // Giữ bản của tab này (lưu đè có chủ đích, tab kia sẽ nhận banner ngược lại)
  const keepMyBoard = useCallback(async () => {
    setRemoteNotice(null);
    const b = boardRef.current;
    if (!b) return;
    try {
      await persistBoardAsync(b);
      try { setBoards(await listBoardsAsync()); } catch { setBoards(listBoards()); }
      setSaveState("saved"); setSavedAt(new Date());
      notifyBoardsUpdate({ boardId: b.id, action: "save" });
      notify("Đã giữ bản của tab này");
    } catch { setSaveState("error"); notify("Lưu thất bại — thử lại"); }
  }, [notify, notifyBoardsUpdate]);

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
    const q = (searchBoard || "").trim().toLowerCase();
    const list = !q ? [...(boards || [])] : (boards || []).filter((b) => String(b?.name || "").toLowerCase().includes(q));
    return sortBoardEntries(list, boardSort, boardDetails);
  }, [boards, searchBoard, boardSort, boardDetails]);

  // Visible objects: ẩn con của node collapsed nhưng không xóa dữ liệu
  const { visibleObjects, visibleConnectors, collapsedCount, collapsedMap } = useMemo(() => {
    const objs = board?.objects || [];
    const conns = board?.connectors || [];
    const collapsedIds = new Set(objs.filter((o) => o.collapsed).map((o) => o.id));
    if (!collapsedIds.size) return { visibleObjects: objs, visibleConnectors: conns, collapsedCount: 0, collapsedMap: new Map() };
    const hidden = new Set();
    const childrenMap = new Map();
    objs.forEach((o) => { if (o.parentId) { if (!childrenMap.has(o.parentId)) childrenMap.set(o.parentId, []); childrenMap.get(o.parentId).push(o.id); } });
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
      const desc = getDescendantIds(objs, id);
      cnt = desc.filter((did) => hidden.has(did)).length;
      map.set(id, cnt);
    });
    return {
      visibleObjects: objs.filter((o) => !hidden.has(o.id)),
      visibleConnectors: conns.filter((c) => !hidden.has(c.fromId) && !hidden.has(c.toId)),
      collapsedCount: hidden.size,
      collapsedMap: map,
    };
  }, [board?.objects, board?.connectors]);

  const zoomPct = board ? Math.round(board.zoom * 100) : 100;

  // M5: tick viewport (scroll/resize cửa sổ) để quickbar không stale vị trí
  const [wbViewportTick, setWbViewportTick] = useState(0);
  useEffect(() => {
    const bump = () => setWbViewportTick((t) => t + 1);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
    };
  }, []);
  // ── Minimap: mặc định HIỆN khi bảng có nội dung (dễ thấy, dễ dùng),
  // user thu/phóng được và lựa chọn được nhớ theo máy ──
  const [showMinimap, setShowMinimap] = useState(() => safeGetString("sgk:whiteboard-minimap", "1") !== "0");
  useEffect(() => {
    safeSetString("sgk:whiteboard-minimap", showMinimap ? "1" : "0");
  }, [showMinimap]);
  const minimapDragRef = useRef(false);
  const minimap = useMemo(() => {
    const objs = board?.objects || [];
    if (!objs.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const boxes = [];
    for (const o of objs) {
      if (!o) continue;
      let bx = o.x, by = o.y, bw = o.width || 0, bh = o.height || 0;
      if (o.kind === "stroke" && Array.isArray(o.points) && o.points.length) {
        let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
        for (const p of o.points) {
          sx0 = Math.min(sx0, o.x + p.x); sy0 = Math.min(sy0, o.y + p.y);
          sx1 = Math.max(sx1, o.x + p.x); sy1 = Math.max(sy1, o.y + p.y);
        }
        if (!Number.isFinite(sx0)) continue;
        bx = sx0; by = sy0; bw = Math.max(4, sx1 - sx0); bh = Math.max(4, sy1 - sy0);
      }
      boxes.push({ x: bx, y: by, w: bw, h: bh, sel: selection.includes(o.id) });
      minX = Math.min(minX, bx); minY = Math.min(minY, by);
      maxX = Math.max(maxX, bx + bw); maxY = Math.max(maxY, by + bh);
    }
    if (!boxes.length || !Number.isFinite(minX)) return null;
    const pad = 80;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bw = Math.max(50, maxX - minX), bh = Math.max(50, maxY - minY);
    // Map lớn: 232×160 + hiện cả đường nối (tâm→tâm, tối đa 300)
    const MW = 232, MH = 160;
    const s = Math.min(MW / bw, MH / bh);
    const mmById = new Map((board?.objects || []).map((o) => [o?.id, o]));
    const lines = [];
    for (const c of (board?.connectors || []).slice(0, 300)) {
      const a = mmById.get(c?.fromId), b = mmById.get(c?.toId);
      if (!a || !b) continue;
      lines.push({
        x1: a.x + (a.width || 0) / 2, y1: a.y + (a.height || 0) / 2,
        x2: b.x + (b.width || 0) / 2, y2: b.y + (b.height || 0) / 2,
      });
    }
    const svg = svgRef.current;
    const vw = svg?.clientWidth || 900, vh = svg?.clientHeight || 600;
    const zm = board.zoom || 1;
    return {
      minX, minY, s,
      rects: boxes.slice(0, 500),
      lines,
      view: { x: -board.pan.x / zm, y: -board.pan.y / zm, w: vw / zm, h: vh / zm },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.objects, board?.connectors, board?.zoom, board?.pan, selection, wbViewportTick]);

  // Bấm/kéo trên minimap → đặt khung nhìn vào điểm đó (không ghi history)
  const minimapNav = useCallback((e) => {
    if (!minimap) return;
    const el = e.currentTarget.getBoundingClientRect();
    const wx = minimap.minX + (e.clientX - el.left) / minimap.s;
    const wy = minimap.minY + (e.clientY - el.top) / minimap.s;
    const svg = svgRef.current;
    const vw = svg?.clientWidth || 900, vh = svg?.clientHeight || 600;
    setBoard((p) => ({ ...p, pan: { x: vw / 2 - wx * p.zoom, y: vh / 2 - wy * p.zoom } }));
  }, [minimap]);

  // Đưa khung nhìn về giữa selection (nút ◎ + Shift+F)
  const centerOnSelection = useCallback(() => {
    const objs = (board?.objects || []).filter((o) => o && selection.includes(o.id));
    if (!objs.length) { notify("Chưa chọn khối nào"); return; }
    const xs = [], ys = [];
    for (const o of objs) {
      if (o.kind === "stroke" && Array.isArray(o.points) && o.points.length) {
        for (const p of o.points) { xs.push(o.x + p.x); ys.push(o.y + p.y); }
      } else {
        xs.push(o.x, o.x + (o.width || 8)); ys.push(o.y, o.y + (o.height || 8));
      }
    }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const svg = svgRef.current;
    const vw = svg?.clientWidth || 900, vh = svg?.clientHeight || 600;
    setBoard((p) => ({ ...p, pan: { x: vw / 2 - cx * p.zoom, y: vh / 2 - cy * p.zoom } }));
    playWb("click");
  }, [board, selection, notify, playWb]);

  // Thanh format nổi theo khối: tọa độ tương đối theo canvas (khớp position:absolute
  // trong .whiteboard-canvas-area) — trước đây cộng nhầm gốc viewport nên menu lệch
  // đúng bằng vị trí canvas, khối ở góc dưới/phải là menu văng ra ngoài.
  // Neo mép dưới lên trên khối (transform theo chiều cao thật), thiếu chỗ mới lật xuống.
  const quickBarPos = useMemo(() => {
    if (!board || contextMenu) return null;
    const svg = svgRef.current;
    if (!svg) return null;
    // Quyết định vị trí theo VIEWPORT (phần canvas thấy được) rồi đổi sang tọa độ
    // tương đối canvas cho style absolute — canvas thường dài hơn viewport nên kẹp
    // theo canvas sẽ để menu lòi ra ngoài màn hình (menu multi cao ~220px).
    const r = svg.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const panelW = Math.min(560, vw - 16);
    const place = (bx, by, bw, bh, estH) => {
      const sxVp = bx + r.left, syVp = by + r.top;
      const est = Math.min(estH, vh * 0.7);
      let leftVp = sxVp + bw / 2 - panelW / 2;
      leftVp = Math.max(8, Math.min(leftVp, vw - panelW - 8));
      const left = leftVp - r.left;
      // đủ chỗ phía trên viewport → neo mép dưới cách khối 10px
      if (syVp - est - 10 >= 8) return { left, top: by - 10, placement: "above", maxWidth: panelW };
      // đủ chỗ phía dưới viewport → thả dưới khối
      if (syVp + bh + 10 + est <= vh - 8) return { left, top: by + bh + 10, placement: "below", maxWidth: panelW };
      // chật cả 2 phía → ghim đáy viewport, thanh tự cuộn (CSS max-height 70vh)
      return { left, top: vh - est - 8 - r.top, placement: "below", maxWidth: panelW };
    };
    if (selection.length === 1 && single) {
      const obj = single;
      const bx = obj.x * board.zoom + board.pan.x;
      const by = obj.y * board.zoom + board.pan.y;
      // toolbar gọn chảy 1-3 dòng + dải emoji/theme khi mở
      const estH = 230 + (showEmoji ? 60 : 0) + (showThemes ? 200 : 0);
      return place(bx, by, obj.width * board.zoom, obj.height * board.zoom, estH);
    }
    if (selection.length > 1) {
      const objs = visibleObjects.filter((o) => selection.includes(o.id));
      if (!objs.length) return null;
      const minX = Math.min(...objs.map((o) => o.x));
      const minY = Math.min(...objs.map((o) => o.y));
      const maxX = Math.max(...objs.map((o) => o.x + o.width));
      const maxY = Math.max(...objs.map((o) => o.y + o.height));
      const bx = minX * board.zoom + board.pan.x;
      const by = minY * board.zoom + board.pan.y;
      return place(bx, by, (maxX - minX) * board.zoom, (maxY - minY) * board.zoom, 230);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, single, selection, visibleObjects, contextMenu, wbViewportTick, showEmoji, showThemes]);

  // Chọn khối → giữ nguyên trạng thái mở rộng (mặc định mở đủ thông tin, không tự thu gọn)
  // user vẫn bấm 🎚 để thu gọn thủ công nếu muốn gọn

  // Tọa độ khối chọn theo canvas (để đặt mũi tên 4 hướng quanh khối)
  const branchArrowPos = useMemo(() => {
    if (!board || !single || selection.length !== 1) return null;
    if (single.kind === "stroke") return null;
    try {
      const bx = single.x * board.zoom + board.pan.x;
      const by = single.y * board.zoom + board.pan.y;
      const bw = (single.width || 80) * board.zoom;
      const bh = (single.height || 32) * board.zoom;
      return { bx, by, bw, bh };
    } catch { return null; }
  }, [board, single, selection]);

  // Phím tắt khung nhìn (effect riêng đặt sau centerOnSelection để tránh TDZ):
  // F = vừa màn hình, Shift+F = về giữa selection
  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");
      if (typing) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (e.shiftKey) centerOnSelection();
        else { fitToScreen(); playWb("click"); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitToScreen, centerOnSelection, playWb]);

  if (!board) return <div className="whiteboard-root" style={{ padding: 24 }}>Đang tải bảng…</div>;
  const saveDotClass = saveState === "saving" ? "is-saving" : saveState === "error" ? "is-error" : "is-saved";
  const saveDotTitle = saveState === "saving" ? "Đang lưu…" : saveState === "error" ? "Lưu thất bại — bấm Ctrl+S để thử lại" : savedAt ? `Đã lưu lúc ${savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Đã lưu";

  return (
    <div className={`whiteboard-root ${touchMode ? "is-touch" : ""}`} ref={rootRef}>
      {boardsLoading && (
        <div className="whiteboard-loading-bar" role="status">Đang tải bảng từ IndexedDB…</div>
      )}
      {boardsError && (
        <div className="whiteboard-error-bar" role="alert">{boardsError} — đang dùng dữ liệu tạm, hãy tải lại trang.</div>
      )}
      {remoteNotice && (
        <div className="whiteboard-remote-bar" role="alert">
          <span>Tab khác vừa lưu bảng này — tải bản mới hay giữ bản của bạn?</span>
          <button className="btn btn-primary btn-xs" onClick={reloadRemoteBoard}>Tải bản mới</button>
          <button className="btn btn-ghost btn-xs" onClick={keepMyBoard}>Giữ bản của tôi</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setRemoteNotice(null)} title="Để sau">Để sau</button>
        </div>
      )}
      {/* Unibar — gộp header + topbar thành 1 hàng duy nhất để tối đa canvas */}
      <div className="whiteboard-unibar">
        <div className="wb-uni-left">
          <input className="whiteboard-title-input wb-uni-title" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={handleRename} onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }} placeholder="Tên bảng" />
          <span className={`whiteboard-save-dot ${saveDotClass}`} title={saveDotTitle}>●</span>
          <div className="wb-sep-v" />
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => { if (canUndo) applyHistory(histIdxRef.current - 1); }} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)"><Undo2 size={14} /></button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => { if (canRedo) applyHistory(histIdxRef.current + 1); }} disabled={!canRedo} title="Làm lại (Ctrl+Y)"><Redo2 size={14} /></button>
          <div className="wb-sep-v" />
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => setBoard((p) => ({ ...p, zoom: Math.max(0.2, p.zoom / 1.15) }))} title="Thu nhỏ"><ZoomOut size={14} /></button>
          <button className="whiteboard-zoom-label wb-zoom-btn" onClick={() => setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } }))} title="Về 100%">{zoomPct}%</button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={() => setBoard((p) => ({ ...p, zoom: Math.min(3, p.zoom * 1.15) }))} title="Phóng to"><ZoomIn size={14} /></button>
          <button className="btn btn-ghost btn-xs wb-tbtn" onClick={fitToScreen} title="Vừa màn hình (F)"><Maximize2 size={14} /></button>
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
                  <label className={`wb-opt-row ${showBranchArrows ? "is-on" : ""}`} title="Hiện mũi tên 4 hướng quanh khối chọn để tạo nhánh nhanh">
                    <input type="checkbox" className="wb-opt-check" checked={showBranchArrows} onChange={(e) => setShowBranchArrows(e.target.checked)} />
                    <span className="wb-opt-icon">✛</span>
                    <span className="wb-opt-text">Mũi tên 4 hướng</span>
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
          <button className={`btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon ${showMinimap ? "is-on" : ""}`} onClick={() => setShowMinimap((v) => !v)} title={showMinimap ? "Ẩn bản đồ thu nhỏ" : "Hiện bản đồ thu nhỏ"}>🗺</button>
          <div className="whiteboard-board-wrap">
            <button className="btn btn-secondary btn-sm wb-hbtn" onClick={() => setShowBoardList((v) => !v)} title="Danh sách bảng — chuyển bảng, đổi tên, nhân bản"><LayoutTemplate size={14} /></button>
            {showBoardList && (
              <>
                <div className="whiteboard-board-backdrop" onClick={() => setShowBoardList(false)} />
                <div className="whiteboard-board-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="whiteboard-drawer-head">
                    <strong>Bảng của bạn ({(boards || []).length})</strong>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowBoardList(false)}><X size={14} /></button>
                  </div>
                  <div className="whiteboard-drawer-search">
                    <Search size={14} /><input value={searchBoard} onChange={(e) => setSearchBoard(e.target.value)} placeholder="Tìm bảng…" />
                  </div>
                  <div className="wb-board-tools">
                    <select
                      className="wb-style-select wb-board-sort"
                      value={BOARD_SORTS.some((s) => s.id === boardSort) ? boardSort : "updated"}
                      onChange={(e) => setBoardSort(e.target.value)}
                      title="Sắp xếp danh sách bảng"
                    >
                      {BOARD_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <label className="wb-board-checkall" title="Chọn/bỏ chọn tất cả bảng đang hiện">
                      <input
                        type="checkbox"
                        checked={filteredBoards.length > 0 && filteredBoards.every((b) => boardSel.includes(b.id))}
                        onChange={() => {
                          const ids = filteredBoards.map((b) => b.id);
                          const all = ids.length > 0 && ids.every((id) => boardSel.includes(id));
                          setBoardSel((prev) => (all ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
                        }}
                      />
                      <span>{boardSel.length ? `Đã chọn ${boardSel.length}` : "Chọn nhiều"}</span>
                    </label>
                  </div>
                  {boardSel.length > 0 && (
                    <div className="wb-board-batch">
                      <button className="btn btn-secondary btn-xs" onClick={handleBatchExportJSON} title="Xuất các bảng đã chọn thành 1 file JSON (nhập lại bằng Import JSON)"><Download size={12} /> Xuất JSON</button>
                      <button className="btn btn-secondary btn-xs" onClick={handleBatchDuplicate} title="Nhân bản tất cả bảng đã chọn"><Copy size={12} /> Nhân bản</button>
                      <button className="btn btn-danger btn-xs" onClick={handleBatchDelete} title="Xóa tất cả bảng đã chọn (luôn giữ ít nhất 1 bảng)"><Trash2 size={12} /> Xóa</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setBoardSel([])} title="Bỏ chọn hết">Bỏ chọn</button>
                    </div>
                  )}
                  <div className="whiteboard-drawer-list">
                    {filteredBoards.map((b) => {
                      const d = boardDetails[b.id];
                      const checked = boardSel.includes(b.id);
                      const isActive = b.id === activeId;
                      return (
                        <div key={b.id} className={`whiteboard-drawer-item wb-board-row ${isActive ? "active" : ""} ${checked ? "is-checked" : ""}`}>
                          <input
                            type="checkbox"
                            className="wb-board-check"
                            checked={checked}
                            onChange={() => toggleBoardSel(b.id)}
                            onClick={(e) => e.stopPropagation()}
                            title="Chọn bảng này để xóa/nhân bản/xuất hàng loạt"
                          />
                          <div className="wb-board-main" onClick={() => switchBoard(b.id)} title="Mở bảng này">
                            {renamingId === b.id ? (
                              <input
                                className="form-control wb-board-rename"
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => handleRenameBoardId(b.id, renameValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameBoardId(b.id, renameValue);
                                  else if (e.key === "Escape") setRenamingId(null);
                                  e.stopPropagation();
                                }}
                                maxLength={120}
                              />
                            ) : (
                              <span className="whiteboard-drawer-name">
                                {b.name}
                                {isActive && <em className="wb-board-open"> • Đang mở</em>}
                              </span>
                            )}
                            <span className="whiteboard-drawer-date">
                              {d ? `${d.objects} khối • ${d.connectors} nối • ${d.sizeKb}` : "…"}
                              {" • "}{new Date(d?.updatedAt || b.updatedAt).toLocaleString("vi-VN")}
                            </span>
                          </div>
                          <div className="wb-board-rowbtns">
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => { setRenamingId(b.id); setRenameValue(b.name || ""); }}
                              title="Đổi tên bảng"
                            ><Pencil size={12} /></button>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleDuplicateBoardById(b.id)}
                              title="Nhân bản bảng này"
                            ><CopyPlus size={12} /></button>
                            <button
                              className="btn btn-ghost btn-xs wb-board-del"
                              onClick={() => handleDeleteBoardById(b.id)}
                              title="Xóa bảng này"
                            ><Trash2 size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                    {!filteredBoards.length && (
                      <div style={{ fontSize: 12, opacity: 0.65, padding: "8px 4px" }}>
                        {searchBoard ? `Không tìm thấy bảng nào khớp “${searchBoard}”.` : "Chưa có bảng nào."}
                      </div>
                    )}
                  </div>
                  <div className="whiteboard-drawer-actions wb-board-footer">
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleNewBoard} title="Tạo bảng trắng mới"><Plus size={12} /> Bảng mới</button>
                    <button className="btn btn-secondary btn-sm" onClick={handleDuplicateBoard} title="Nhân bản bảng đang mở"><Copy size={12} /> Nhân bản</button>
                    <button className="btn btn-danger btn-sm" onClick={handleDeleteBoard} title="Xóa bảng đang mở"><Trash2 size={12} /> Xóa bảng</button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon" onClick={handleNewBoard} title="Tạo bảng mới"><FilePlus size={15} /></button>
          <button className="btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon" onClick={handleSaveNow} title="Lưu ngay (Ctrl+S)"><Save size={15} /></button>
          <div className="whiteboard-export-wrap">
            <button className="btn btn-ghost btn-sm wb-hbtn wb-hbtn--icon" onClick={() => setShowVersions((v) => !v)} title="Lịch sử bản đã lưu — snapshot để khôi phục khi xóa nhầm"><History size={15} /></button>
            {showVersions && (
              <div className="whiteboard-export-menu" style={{ minWidth: 250 }}>
                <div className="wb-popover-title">Lịch sử bản — {board?.name || "Bảng"}</div>
                <button onClick={handleSaveVersion}>＋ Lưu bản hiện tại</button>
                <div className="whiteboard-export-divider" />
                {!versions.length && <div style={{ fontSize: 12, opacity: 0.65, padding: "4px 10px" }}>Chưa có bản nào. Lưu bản trước khi thử nghiệm lớn.</div>}
                {versions.map((v) => (
                  <div key={v.vid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px" }}>
                    <button style={{ flex: 1 }} onClick={() => handleRestoreVersion(v.vid)} title="Khôi phục bản này">↩ {v.name}</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => handleDeleteVersion(v.vid)} title="Xóa bản này"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                <div className="wb-popover-title">Phông chữ — màn hình = file tải về</div>
                <select
                  className="wb-style-select wb-popover-select"
                  style={{ maxWidth: "100%" }}
                  value={board?.defaultFontFamily || ""}
                  onChange={(e) => setBoardDefaultFont(e.target.value)}
                  title="Font mặc định của bảng: khối mới và khối đang 'Theo bảng' dùng font này, file tải về giữ nguyên"
                >
                  {WB_FONTS.map((f) => <option key={f.id} value={f.value}>{f.id === "default" ? "Mặc định hệ thống" : f.label}</option>)}
                </select>
                <button onClick={applyFontToAll} title="Gán font trên cho mọi khối chữ trong bảng để file tải về đồng nhất">🎨 Áp dụng font cho tất cả khối</button>
                <div className="whiteboard-export-divider" />
                <button onClick={() => jsonInputRef.current?.click()}><Upload size={12} /> Import JSON</button>
                <button onClick={() => docxInputRef.current?.click()} disabled={docxBusy} title="Nhập file Word (.docx): headings thành nhánh, lists thành nodes con, ảnh chèn vào bảng"><Upload size={12} /> {docxBusy ? "Đang nhập Word…" : "Nhập Word (.docx)"}</button>
              </div>
            )}
          </div>
          <input ref={replaceImageRef} type="file" accept="image/*" hidden onChange={(e) => { handleReplaceImage(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {single?.sourceRef && (
        <div className="whiteboard-source-chip" title={single.sourceRef.citation || single.sourceRef.title}>
          {single.sourceRef.origin === "ai-mindmap" ? (
            <span className="wb-source-text">✦ <strong>{single.sourceRef.citation || single.sourceRef.title || "Sơ đồ AI"}</strong></span>
          ) : (
          <><span className="wb-source-text">📖 <strong>{single.sourceRef.citation || `${single.sourceRef.title} — tr.${single.sourceRef.bookPage || single.sourceRef.page}`}</strong>{single.sourceRef.chapter ? ` · ${single.sourceRef.chapter}` : ""}</span>
          <button className="btn btn-primary btn-xs" onClick={() => openSourceFromRef(single.sourceRef)} title="Mở sách tại trang nguồn"><BookOpen size={12} /></button></>
          )}
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
            // hit connector (khoảng cách < 10px) — dùng hình học edge/elbow thật như canvas
            // (trước đây center-center nên khó bấm elbow/double ở node to)
            const hitConn = (() => {
              const tol = 10 / board.zoom;
              let best = null;
              let bestD = Infinity;
              for (const c of visibleConnectors) {
                const a = visibleObjects.find((o) => o.id === c.fromId);
                const b = visibleObjects.find((o) => o.id === c.toId);
                if (!a || !b) continue;
                let d = Infinity;
                try {
                  d = distToConnector(wx, wy, a, b, c.type, c.sourceAnchor, c.targetAnchor, c.bend);
                } catch {
                  continue;
                }
                if (d < tol && d < bestD) { bestD = d; best = c; }
              }
              return best;
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
            onConnLabelEdit={openConnLabelEdit}
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
            onMindAdd={handleMindAdd}
            touchMode={touchMode}
            boardFont={board?.defaultFontFamily || defaultFontFamily || ""}
          />
          {/* Thanh ngữ cảnh gọn: cụm chảy liền mạch — thao tác | khung | chữ | tệp */}
          {single && (
            <div
              className="whiteboard-stylebar whiteboard-stylebar--single whiteboard-ctxbar wb-ctx-grid"
              style={quickBarPos ? { left: quickBarPos.left, top: quickBarPos.top, maxWidth: quickBarPos.maxWidth, ...(quickBarPos.placement === "above" ? { transform: "translateY(-100%)" } : null) } : undefined}
            >
              <div className="wb-style-group wb-ctx-actions" title="Thao tác nhanh">
                <button className="wb-style-btn-icon" onClick={() => setRequestEditId(single.id)} title="Sửa chữ (F2)"><Type size={15} /></button>
                {single.kind === "node" && (
                  <>
                    <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleMindAdd(single)} title="Thêm nhánh con">＋</button>
                    <button className="wb-style-btn-icon" onClick={() => setTool("connector")} title="Nối từ khối này"><ArrowUpRight size={15} /></button>
                  </>
                )}
                {single.kind === "note" && (
                  <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleChangeNoteColor(single.id)} title="Đổi màu ghi chú">🎨</button>
                )}
                {single.kind === "image" && (
                  <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => { setReplaceImageId(single.id); replaceImageRef.current?.click(); }} title="Thay ảnh">🖼</button>
                )}
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={centerOnSelection} title="Về giữa khối này (Shift+F)">◎</button>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => toggleLock(single.id)} title={single.locked ? "Mở khóa khối" : "Khóa khối"}>{single.locked ? "🔓" : "🔒"}</button>
                <button
                  className={`wb-style-btn-icon ${ctxStyleOpen ? "active" : ""}`}
                  onClick={() => setCtxStyleOpen((v) => !v)}
                  title={ctxStyleOpen ? "Thu gọn style" : "Mở đầy đủ style (viền, căn lề, bullets…)"}
                >🎚</button>
                <button
                  className={`wb-style-btn-icon wb-style-btn-icon--text ${showBranchArrows ? "active" : ""}`}
                  onClick={() => setShowBranchArrows((v) => !v)}
                  title={showBranchArrows ? "Tắt mũi tên 4 hướng" : "Bật mũi tên 4 hướng tạo nhánh nhanh"}
                >✛</button>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setContextMenu({ x: r.left, y: r.bottom + 6, wx: single.x + single.width / 2, wy: single.y + single.height / 2, id: single.id, kind: single.kind }); }} title="Thêm tác vụ (chuột phải)">⋮</button>
              </div>
              <div className="wb-style-group" title="Khung: nền, viền, tự nở">
                <label className="wb-color-btn" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(single.fill) ? single.fill : "#ffffff" }} title={`Nền: ${single.fill}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(single.fill) ? single.fill : "#ffffff"} onChange={(e) => updateSingle({ fill: e.target.value })} />
                </label>
                {ctxStyleOpen && (
                <>
                <label className="wb-color-btn wb-color-btn--stroke" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(single.stroke) ? single.stroke : "#334155" }} title={`Viền: ${single.stroke}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(single.stroke) ? single.stroke : "#334155"} onChange={(e) => updateSingle({ stroke: e.target.value })} />
                </label>
                <select className="wb-style-select wb-style-select--sm" value={single.strokeWidth || 2} onChange={(e) => updateSingle({ strokeWidth: parseInt(e.target.value, 10) })} title="Độ dày viền">
                  {[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w}px</option>)}
                  {![1, 2, 3, 4, 6, 8].includes(Number(single.strokeWidth)) && <option value={single.strokeWidth}>{single.strokeWidth}px</option>}
                </select>
                <select className="wb-style-select wb-style-select--sm" value={single.strokeDash || ""} onChange={(e) => updateSingle({ strokeDash: e.target.value })} title="Kiểu viền">
                  <option value="">Liền</option>
                  <option value="6 4">Đứt</option>
                  <option value="2 4">Chấm</option>
                </select>
                <label className="wb-style-check" title="Tự co giãn theo nội dung"><input type="checkbox" checked={!!single.autoSize} onChange={(e) => updateSingle({ autoSize: e.target.checked })} /> Tự nở</label>
                </>
                )}
              </div>
              <div className="wb-style-group" title="Chữ">
                <label className="wb-color-btn" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(single.color) ? single.color : "#1e293b" }} title={`Chữ: ${single.color}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(single.color) ? single.color : "#1e293b"} onChange={(e) => updateSingle({ color: e.target.value })} />
                </label>
                <select className="wb-style-select wb-style-select--sm" value={single.fontFamily || ""} onChange={(e) => updateSingle({ fontFamily: e.target.value })} title="Phông chữ — chọn 'Theo bảng' để ăn theo font mặc định của bảng (file tải về giữ đúng font này)">
                  {WB_FONTS.map((f) => <option key={f.id} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>{f.id === "default" ? "Theo bảng" : f.label}</option>)}
                  {single.fontFamily && !WB_FONTS.some((f) => f.value === single.fontFamily) && <option value={single.fontFamily}>{single.fontFamily.slice(0, 24)}</option>}
                </select>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleBumpFont(-2)} title="Thu nhỏ chữ">A−</button>
                <select className="wb-style-select wb-style-select--sz" value={single.fontSize || 15} onChange={(e) => updateSingle({ fontSize: parseInt(e.target.value, 10) })} title="Cỡ chữ">
                  {[10, 12, 14, 15, 16, 18, 20, 24, 28, 32].map((s) => <option key={s} value={s}>{s}</option>)}
                  {![10, 12, 14, 15, 16, 18, 20, 24, 28, 32].includes(Number(single.fontSize)) && <option value={single.fontSize}>{single.fontSize}</option>}
                </select>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleBumpFont(2)} title="Phóng to chữ">A+</button>
                <button className={`wb-style-btn-icon ${single.bold ? "active" : ""}`} onClick={() => updateSingle({ bold: !single.bold })} title="Chữ đậm"><Bold size={15} /></button>
                <button className={`wb-style-btn-icon ${single.italic ? "active" : ""}`} onClick={() => updateSingle({ italic: !single.italic })} title="Chữ nghiêng"><Italic size={15} /></button>
                {ctxStyleOpen && (
                <>
                <select className="wb-style-select wb-style-select--sm" value={single.align || "center"} onChange={(e) => updateSingle({ align: e.target.value })} title="Căn lề">
                  <option value="left">Trái</option>
                  <option value="center">Giữa</option>
                  <option value="right">Phải</option>
                </select>
                <button className={`wb-style-btn-icon wb-style-btn-icon--text ${showEmoji ? "active" : ""}`} onClick={() => setShowEmoji((v) => !v)} title="Chèn emoji nhanh">😊</button>
                <select className="wb-style-select wb-style-select--sm" value={typeof single.bullets === "string" ? single.bullets : single.bullets ? "dot" : ""} onChange={(e) => updateSingle({ bullets: e.target.value || false })} title="Gạch đầu dòng (nhiều kiểu)">
                  {BULLET_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                </>
                )}
              </div>
              {ctxStyleOpen && single.kind === "node" && (
                <div className="wb-style-group" title="Trang trí nhánh: tô theme + đánh số con">
                  <button className={`wb-style-btn-icon wb-style-btn-icon--text ${showThemes ? "active" : ""}`} onClick={() => setShowThemes((v) => !v)} title="Tô theme màu cho cả nhánh (1-click)">🎨</button>
                  <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleNumberChildren()} title="Đánh số nhánh con (1. 2. 3.)">🔢</button>
                </div>
              )}
              {ctxStyleOpen && showEmoji && (
                <div className="wb-style-group" title="Emoji nhanh — bấm để chèn vào đầu khối">
                  {QUICK_EMOJIS.map((em) => (
                    <button key={em} className="wb-style-btn-icon wb-style-btn-icon--emoji" onClick={() => handlePrependEmoji(em)} title={`Chèn ${em}`}>{em}</button>
                  ))}
                </div>
              )}
              {ctxStyleOpen && showThemes && single?.kind === "node" && (
                <div className="wb-style-group wb-theme-grid" title="Chọn theme — bấm để tô cả nhánh">
                  {MINDMAP_THEMES.map((t) => (
                    <button
                      key={t.id}
                      className="wb-style-btn-icon wb-theme-btn"
                      onClick={() => { handleBranchTheme(t.id); setShowThemes(false); }}
                      title={`Tô theme “${t.label}” cho nhánh`}
                    >
                        <span style={{ display: "inline-flex", gap: 2 }}>
                          {t.colors.slice(0, 4).map((c) => (
                            <i key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c, border: "1px solid rgba(15,23,42,0.2)" }} />
                          ))}
                        </span>
                        <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="wb-style-group">
                <button className="wb-style-btn-icon" onClick={handleCopy} title="Sao chép" aria-label="Sao chép"><Copy size={15} /></button>
                <button className="wb-style-btn-icon" onClick={handleDuplicateSel} title="Nhân bản" aria-label="Nhân bản"><CopyPlus size={15} /></button>
                <button className="wb-style-btn-icon wb-style-btn--danger" onClick={deleteSelection} title="Xóa" aria-label="Xóa"><Trash2 size={15} /></button>
              </div>
            </div>
          )}
          {selection.length > 1 && (
            <div
              className="whiteboard-stylebar whiteboard-stylebar--single whiteboard-ctxbar wb-ctx-grid"
              style={quickBarPos ? { left: quickBarPos.left, top: quickBarPos.top, maxWidth: quickBarPos.maxWidth, ...(quickBarPos.placement === "above" ? { transform: "translateY(-100%)" } : null) } : undefined}
            >
              {/* Thao tác chung — nhóm / căn / phân bố */}
              <div className="wb-style-group wb-ctx-actions" title={`Thao tác ${selection.length} khối đã chọn`}>
                <span className="wb-multi-count">{selection.length}</span>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={centerOnSelection} title="Về giữa các khối đã chọn (Shift+F)">◎</button>
                <button className="wb-style-btn-icon" onClick={handleGroup} title="Nhóm các khối đã chọn (Ctrl+G)"><Group size={15} /></button>
                <button className="wb-style-btn-icon" onClick={handleUngroup} title="Tách nhóm"><Ungroup size={15} /></button>
                <button className="wb-style-btn-icon" onClick={() => handleAlign("left")} title="Căn trái"><AlignLeft size={15} /></button>
                <button className="wb-style-btn-icon" onClick={() => handleAlign("center")} title="Căn giữa"><AlignCenter size={15} /></button>
                <button className="wb-style-btn-icon" onClick={() => handleAlign("right")} title="Căn phải"><AlignRight size={15} /></button>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleDistribute("h")} title="Phân bố ngang đều">⇔</button>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => handleDistribute("v")} title="Phân bố dọc đều">⇕</button>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const first = selection[0]; setContextMenu({ x: r.left, y: r.bottom + 6, wx: 0, wy: 0, id: first, kind: "multi" }); }} title="Thêm tác vụ">⋮</button>
              </div>
              {/* Khung chung — nền + viền */}
              <div className="wb-style-group" title="Khung chung: nền, viền">
                <label className="wb-color-btn" style={{ background: multiVal("fill") && multiVal("fill") !== "__mixed__" ? multiVal("fill") : "#ffffff" }} title={multiVal("fill") === "__mixed__" ? "Nền: nhiều giá trị — chọn để đồng nhất" : `Nền: ${multiVal("fill")}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(multiVal("fill") || "") ? multiVal("fill") : "#ffffff"} onChange={(e) => updateMulti({ fill: e.target.value })} />
                </label>
                <label className="wb-color-btn wb-color-btn--stroke" style={{ background: multiVal("stroke") && multiVal("stroke") !== "__mixed__" ? multiVal("stroke") : "#334155" }} title={multiVal("stroke") === "__mixed__" ? "Viền: nhiều giá trị — chọn để đồng nhất" : `Viền: ${multiVal("stroke")}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(multiVal("stroke") || "") ? multiVal("stroke") : "#334155"} onChange={(e) => updateMulti({ stroke: e.target.value })} />
                </label>
                <select className="wb-style-select wb-style-select--sm" value={multiVal("strokeWidth") ?? 2} onChange={(e) => updateMulti({ strokeWidth: parseInt(e.target.value, 10) })} title="Độ dày viền chung">
                  {multiVal("strokeWidth") === "__mixed__" && <option value="__mixed__">— Trộn —</option>}
                  {[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w}px</option>)}
                </select>
                <select className="wb-style-select wb-style-select--sm" value={multiVal("strokeDash") ?? ""} onChange={(e) => updateMulti({ strokeDash: e.target.value })} title="Kiểu viền chung">
                  {multiVal("strokeDash") === "__mixed__" && <option value="__mixed__">— Trộn —</option>}
                  <option value="">Liền</option>
                  <option value="6 4">Đứt</option>
                  <option value="2 4">Chấm</option>
                </select>
              </div>
              {/* Chữ chung — màu, cỡ, đậm/nghiêng, căn, bullets */}
              <div className="wb-style-group" title="Chữ chung">
                <label className="wb-color-btn" style={{ background: multiVal("color") && multiVal("color") !== "__mixed__" ? multiVal("color") : "#1e293b" }} title={multiVal("color") === "__mixed__" ? "Chữ: nhiều giá trị — chọn để đồng nhất" : `Chữ: ${multiVal("color")}`}>
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(multiVal("color") || "") ? multiVal("color") : "#1e293b"} onChange={(e) => updateMulti({ color: e.target.value }, true)} />
                </label>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => { const v = Number(multiVal("fontSize")) || 15; updateMulti({ fontSize: Math.max(10, Math.min(48, v - 2)) }, true); }} title="Thu nhỏ chữ chung">A−</button>
                <select className="wb-style-select wb-style-select--sm" value={multiVal("fontFamily") ?? ""} onChange={(e) => updateMulti({ fontFamily: e.target.value }, true)} title="Phông chữ chung — 'Theo bảng' để ăn theo font mặc định của bảng">
                  {multiVal("fontFamily") === "__mixed__" && <option value="__mixed__">— Trộn —</option>}
                  {WB_FONTS.map((f) => <option key={f.id} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>{f.id === "default" ? "Theo bảng" : f.label}</option>)}
                </select>
                <select className="wb-style-select wb-style-select--sz" value={multiVal("fontSize") ?? 15} onChange={(e) => updateMulti({ fontSize: parseInt(e.target.value, 10) }, true)} title="Cỡ chữ chung">
                  {multiVal("fontSize") === "__mixed__" && <option value="__mixed__">— Trộn —</option>}
                  {[10, 12, 14, 15, 16, 18, 20, 24, 28, 32].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="wb-style-btn-icon wb-style-btn-icon--text" onClick={() => { const v = Number(multiVal("fontSize")) || 15; updateMulti({ fontSize: Math.max(10, Math.min(48, v + 2)) }, true); }} title="Phóng to chữ chung">A+</button>
                <button className={`wb-style-btn-icon ${multiVal("bold") === true ? "active" : ""}`} onClick={() => updateMulti({ bold: !(multiVal("bold") === true) }, true)} title="Chữ đậm chung"><Bold size={15} /></button>
                <button className={`wb-style-btn-icon ${multiVal("italic") === true ? "active" : ""}`} onClick={() => updateMulti({ italic: !(multiVal("italic") === true) }, true)} title="Chữ nghiêng chung"><Italic size={15} /></button>
                <select className="wb-style-select wb-style-select--sm" value={multiVal("align") ?? "center"} onChange={(e) => updateMulti({ align: e.target.value }, true)} title="Căn lề chung">
                  {multiVal("align") === "__mixed__" && <option value="__mixed__">— Trộn —</option>}
                  <option value="left">Trái</option>
                  <option value="center">Giữa</option>
                  <option value="right">Phải</option>
                </select>
                <select className="wb-style-select wb-style-select--sm" value={typeof multiVal("bullets") === "string" ? multiVal("bullets") : multiVal("bullets") === "__mixed__" ? "__mixed__" : (multiVal("bullets") ? "dot" : "")} onChange={(e) => updateMulti({ bullets: e.target.value || false }, true)} title="Gạch đầu dòng chung">
                  {multiVal("bullets") === "__mixed__" && <option value="__mixed__">— Trộn —</option>}
                  {BULLET_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              {/* Tệp chung */}
              <div className="wb-style-group">
                <button className="wb-style-btn-icon" onClick={handleCopy} title="Sao chép các khối"><Copy size={15} /></button>
                <button className="wb-style-btn-icon" onClick={handleDuplicateSel} title="Nhân bản các khối"><CopyPlus size={15} /></button>
                <button className="wb-style-btn-icon wb-style-btn--danger" onClick={deleteSelection} title="Xóa các khối"><Trash2 size={15} /></button>
              </div>
            </div>
          )}
          {/* quickbar multi cũ đã gộp vào toolbar trên (◎ + ⋮ nằm ở hàng Thao tác) */}
          {/* ── Mũi tên 4 hướng quanh khối chọn → bấm tạo nhánh nhanh ── */}
          {showBranchArrows && branchArrowPos && !contextMenu && selection.length === 1 && single && single.kind !== "stroke" && !single.locked && (
            <div className="wb-branch-arrows" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
              <button className="wb-branch-arrow wb-branch-arrow--up" style={{ left: branchArrowPos.bx + branchArrowPos.bw / 2, top: branchArrowPos.by }} onClick={(e) => { e.stopPropagation(); handleQuickBranch("up"); }} title="Thêm nhánh phía trên (Alt+↑)">▲</button>
              <button className="wb-branch-arrow wb-branch-arrow--down" style={{ left: branchArrowPos.bx + branchArrowPos.bw / 2, top: branchArrowPos.by + branchArrowPos.bh }} onClick={(e) => { e.stopPropagation(); handleQuickBranch("down"); }} title="Thêm nhánh phía dưới (Alt+↓)">▼</button>
              <button className="wb-branch-arrow wb-branch-arrow--left" style={{ left: branchArrowPos.bx, top: branchArrowPos.by + branchArrowPos.bh / 2 }} onClick={(e) => { e.stopPropagation(); handleQuickBranch("left"); }} title="Thêm nhánh bên trái (Alt+←)">◀</button>
              <button className="wb-branch-arrow wb-branch-arrow--right" style={{ left: branchArrowPos.bx + branchArrowPos.bw, top: branchArrowPos.by + branchArrowPos.bh / 2 }} onClick={(e) => { e.stopPropagation(); handleQuickBranch("right"); }} title="Thêm nhánh bên phải (Alt+→)">▶</button>
            </div>
          )}
          {/* ── Bảng trống: gợi ý bắt đầu nhanh (tự ẩn khi có khối) ── */}
          {!boardsLoading && (board?.objects || []).length === 0 && !showAI && !showMindModal && !showTemplate && !showTour && (
            <div className="wb-empty-state wb-empty-state--compact" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
              <div className="wb-empty-title">Bảng trống — chọn 1 cách để bắt đầu</div>
              <div className="wb-empty-row">
                <button className="btn btn-primary btn-sm" onClick={() => setShowAI(true)}>✦ AI vẽ sơ đồ</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowMindModal(true)}>🧠 Sơ đồ nhanh</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setTool("shape")}>▣ Hình khối</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setTourStep(0); setShowTour(true); }} title="Xem hướng dẫn 30 giây">?</button>
              </div>
            </div>
          )}
          {/* ── Minimap: bản đồ thu nhỏ — bấm/kéo để di chuyển khung nhìn ── */}
          {minimap && (
            <div className="wb-minimap-wrap">
              {showMinimap ? (
                <div className="wb-minimap" title="Bản đồ thu nhỏ — bấm/kéo để di chuyển khung nhìn">
                  <svg
                    width={232} height={160}
                    onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); minimapDragRef.current = true; minimapNav(e); }}
                    onPointerMove={(e) => { if (minimapDragRef.current) minimapNav(e); }}
                    onPointerUp={(e) => { minimapDragRef.current = false; }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                  >
                    {(minimap.lines || []).map((l, i) => (
                      <line key={`l${i}`} x1={(l.x1 - minimap.minX) * minimap.s} y1={(l.y1 - minimap.minY) * minimap.s} x2={(l.x2 - minimap.minX) * minimap.s} y2={(l.y2 - minimap.minY) * minimap.s} stroke="#94a3b8" strokeWidth={1} opacity={0.8} />
                    ))}
                    {minimap.rects.map((r, i) => (
                      <rect key={i} x={(r.x - minimap.minX) * minimap.s} y={(r.y - minimap.minY) * minimap.s} width={Math.max(2, r.w * minimap.s)} height={Math.max(2, r.h * minimap.s)} fill={r.sel ? "#2563eb" : "#64748b"} opacity={r.sel ? 0.95 : 0.55} />
                    ))}
                    <rect x={(minimap.view.x - minimap.minX) * minimap.s} y={(minimap.view.y - minimap.minY) * minimap.s} width={Math.max(6, minimap.view.w * minimap.s)} height={Math.max(6, minimap.view.h * minimap.s)} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1.5} rx={2} />
                  </svg>
                  <div className="wb-minimap-nav" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
                    <button onClick={() => setBoard((p) => ({ ...p, zoom: Math.max(0.2, p.zoom / 1.15) }))} title="Thu nhỏ">−</button>
                    <button onClick={() => setBoard((p) => ({ ...p, zoom: 1, pan: { x: 40, y: 40 } }))} title="Về 100%">{zoomPct}%</button>
                    <button onClick={() => setBoard((p) => ({ ...p, zoom: Math.min(3, p.zoom * 1.15) }))} title="Phóng to">+</button>
                    <button onClick={() => { fitToScreen(); }} title="Vừa màn hình (F)">⛶</button>
                  </div>
                  <button className="wb-minimap-toggle" onClick={() => setShowMinimap(false)} title="Ẩn bản đồ">–</button>
                </div>
              ) : (
                <button className="wb-minimap-toggle is-collapsed" onClick={() => setShowMinimap(true)} title="Hiện bản đồ thu nhỏ">🗺</button>
              )}
            </div>
          )}
          {/* ── Ô sửa nhãn đường nối (double-click lên đường nối) ── */}
          {connLabelEdit && (() => {
            const p = clampToViewport(connLabelEdit.x, connLabelEdit.y, 240, 140);
            return (
            <div
              className="whiteboard-context-menu"
              style={{ left: p.left, top: p.top, minWidth: 200, maxWidth: "min(260px, calc(100vw - 16px))" }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="whiteboard-context-title">Nhãn đường nối</div>
              <input
                className="form-control"
                autoFocus
                value={connLabelDraft}
                onChange={(e) => setConnLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitConnLabel(true);
                  else if (e.key === "Escape") commitConnLabel(false);
                  e.stopPropagation();
                }}
                onBlur={() => commitConnLabel(true)}
                placeholder="VD: dẫn đến…"
                maxLength={120}
              />
            </div>
            );
          })()}
          {contextMenu && (() => {
            const contextObject = contextMenu.id ? board.objects.find((o) => o.id === contextMenu.id) : null;
            const contextConn = contextMenu.kind === "connector" ? (visibleConnectors.find((c) => c.id === contextMenu.id) || board.connectors.find((c) => c.id === contextMenu.id)) : null;
            const isMulti = selection.length > 1 && contextMenu.id && selection.includes(contextMenu.id);
            const hasClipboard = !!(clipboardRef.current && clipboardRef.current.objects && clipboardRef.current.objects.length);
            const isBg = contextMenu.kind === "canvas";
            // Kẹp menu vào viewport: menu không bao giờ cao hơn 70vh (CSS đã overflow:auto)
            const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
            const vh = typeof window !== "undefined" ? window.innerHeight : 800;
            const menuW = Math.min(isBg ? 400 : 240, vw - 16);
            const menuH = Math.min(isBg ? 380 : 420, vh * 0.7);
            const mp = clampToViewport(contextMenu.x, contextMenu.y, menuW, menuH);
            const left = mp.left, top = mp.top;
            const wx = contextMenu.wx ?? 0, wy = contextMenu.wy ?? 0;
            const close = () => setContextMenu(null);
            const act = (fn) => { close(); fn(); };
            // Menu nền 1 nấc: thêm thẳng tại điểm bấm, không popup tầng 2
            const toggleView = (key) => setBoard((p) => ({ ...p, [key]: !p[key] }));
            return (
              <>
              <div className="whiteboard-context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
                {contextMenu.kind === "canvas" ? (
                  <>
                    <div className="whiteboard-context-title">Thêm tại đây</div>
                    <button onClick={() => act(() => createAt(wx, wy, "text"))}><Type size={14} /> Văn bản</button>
                    <button onClick={() => act(() => createAt(wx, wy, "note"))}>📝 Ghi chú</button>
                    <button onClick={() => act(() => createAt(wx, wy, "shape"))}>▣ Hình khối</button>
                    <button onClick={() => act(() => { const g = generateMindmap("Chủ đề", ["Nhánh 1","Nhánh 2","Nhánh 3"], { cx: wx, cy: wy }); checkpoint(); setBoard((p) => { const nb = { ...p, objects: [...p.objects, ...g.objects], connectors: [...p.connectors, ...g.connectors]}; pushHistory(nb); return nb; }); setSelection([g.objects[0].id]); playWb("success"); })}>🧠 Sơ đồ nhanh</button>
                    <button onClick={() => act(() => { setPendingImagePos({ wx, wy }); importImageRef.current?.click(); })}>🖼 Ảnh</button>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => handlePaste(wx, wy))} disabled={!hasClipboard}>Dán tại đây <span className="whiteboard-context-shortcut">Ctrl+V</span></button>
                    <button onClick={() => act(() => setSelection(board.objects.map((o) => o.id)))}>Chọn tất cả <span className="whiteboard-context-shortcut">Ctrl+A</span></button>
                    <div className="whiteboard-context-sep" />
                    <div className="whiteboard-context-subtitle">Hiển thị</div>
                    <div className="whiteboard-context-row whiteboard-context-row--wrap">
                      <button className={board.grid ? "active" : ""} onClick={() => toggleView("grid")} title="Hiện lưới">Lưới</button>
                      <button className={board.snap ? "active" : ""} onClick={() => toggleView("snap")} title="Bắt điểm lưới">Bắt</button>
                      <button className={board.smartAlign ? "active" : ""} onClick={() => toggleView("smartAlign")} title="Tự căn chỉnh các khối">Căn</button>
                      <button className={board.smartSpacing ? "active" : ""} onClick={() => toggleView("smartSpacing")} title="Tự giãn cách đều">Giãn</button>
                      <button className={branchDrag ? "active" : ""} onClick={() => setBranchDrag((v) => !v)} title="Kéo node cha kéo cả nhánh">Nhánh</button>
                    </div>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => fitToScreen())}>⛶ Vừa màn hình <span className="whiteboard-context-shortcut">F</span></button>
                    <button onClick={() => act(() => handleCleanBackground())}>🧹 Xóa hình nền lớn</button>
                  </>
                ) : isMulti ? (
                  <>
                    <div className="whiteboard-context-title">{selection.length} đối tượng đã chọn</div>
                    <button onClick={() => act(() => handleDuplicateSel())}>Nhân bản <span className="whiteboard-context-shortcut">Ctrl+D</span></button>
                    <button onClick={() => act(() => handleGroup())}>Nhóm <span className="whiteboard-context-shortcut">Ctrl+G</span></button>
                    <div className="whiteboard-context-sep" />
                    <div className="whiteboard-context-subtitle">Căn chỉnh</div>
                    <div className="whiteboard-context-row">
                      <button onClick={() => act(() => handleAlign("left"))}>Trái</button>
                      <button onClick={() => act(() => handleAlign("center"))}>Giữa</button>
                      <button onClick={() => act(() => handleAlign("right"))}>Phải</button>
                      <button onClick={() => act(() => { checkpoint(); setBoard((p) => ({ ...p, objects: p.objects.map((o) => selection.includes(o.id) ? { ...o, locked: true } : o) })); pushHistory({ ...board, objects: board.objects.map((o) => selection.includes(o.id) ? { ...o, locked: true } : o) }); })} title="Khóa các khối đã chọn">🔒</button>
                    </div>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => handleDeleteIds(selection))} style={{ color: "#dc2626" }}>Xóa <span className="whiteboard-context-shortcut">Delete</span></button>
                  </>
                ) : contextMenu.kind === "connector" && contextConn ? (
                  <>
                    <div className="whiteboard-context-title">Mũi tên — đầu ←</div>
                    <div className="whiteboard-context-row whiteboard-context-row--fit">
                      {CONN_HEAD_OPTS.map((h) => (
                        <button key={`s-${h.id}`} className={connHeads(contextConn).start === h.id ? "active" : ""} title={h.label} onClick={() => setConnHead(contextConn, "start", h.id)}>{h.glyph}</button>
                      ))}
                    </div>
                    <div className="whiteboard-context-subtitle">Đuôi →</div>
                    <div className="whiteboard-context-row whiteboard-context-row--fit">
                      {CONN_HEAD_OPTS.map((h) => (
                        <button key={`e-${h.id}`} className={connHeads(contextConn).end === h.id ? "active" : ""} title={h.label} onClick={() => setConnHead(contextConn, "end", h.id)}>{h.glyph}</button>
                      ))}
                    </div>
                    <div className="whiteboard-context-subtitle">Dáng đường</div>
                    <div className="whiteboard-context-row">
                      <button className={contextConn.type !== "elbow" && contextConn.type !== "curve" ? "active" : ""} onClick={() => act(() => patchConn(contextConn.id, { type: connTypeForHeads({ type: "line" }, connHeads(contextConn).start, connHeads(contextConn).end) }))}>Thẳng</button>
                      <button className={contextConn.type === "curve" ? "active" : ""} onClick={() => act(() => patchConn(contextConn.id, { type: "curve" }))}>Cong</button>
                      <button className={contextConn.type === "elbow" ? "active" : ""} onClick={() => act(() => patchConn(contextConn.id, { type: "elbow" }))}>Vuông</button>
                    </div>
                    {contextConn.type === "curve" && (
                      <>
                        <div className="whiteboard-context-subtitle">Độ cong</div>
                        <div className="whiteboard-context-row">
                          <input
                            type="range" min={0} max={150} step={5} style={{ flex: 1 }}
                            title={`Độ cong ${Number.isFinite(Number(contextConn.bend)) ? Math.round(Number(contextConn.bend)) : 100} — 0 là thẳng`}
                            value={Number.isFinite(Number(contextConn.bend)) ? Math.max(0, Math.min(150, Number(contextConn.bend))) : 100}
                            onChange={(e) => patchConnLive(contextConn.id, { bend: Number(e.target.value) })}
                            onPointerUp={() => commitConnLive()}
                            onBlur={() => commitConnLive()}
                          />
                          <button title="Cong tự động" onClick={() => { patchConn(contextConn.id, { bend: undefined }); commitConnLive(); }}>Auto</button>
                        </div>
                      </>
                    )}
                    <div className="whiteboard-context-subtitle">Màu</div>
                    <div className="whiteboard-context-row whiteboard-context-row--fit">
                      {CONN_COLORS.map((col) => (
                        <button key={col} className={(contextConn.color || "#475569").toLowerCase() === col ? "active" : ""} title={col} onClick={() => patchConn(contextConn.id, { color: col })}><i style={{ width: 14, height: 14, borderRadius: 4, background: col, display: "inline-block" }} /></button>
                      ))}
                      <label className="wb-conn-color-custom" title="Màu tùy chọn">
                        <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(contextConn.color || "") ? contextConn.color : "#475569"} onChange={(e) => patchConn(contextConn.id, { color: e.target.value })} />
                        <span>🎨</span>
                      </label>
                    </div>
                    <div className="whiteboard-context-subtitle">Độ dày</div>
                    <div className="whiteboard-context-row whiteboard-context-row--fit">
                      {CONN_WIDTHS.map((w) => (
                        <button key={w} className={Number(contextConn.width) === w ? "active" : ""} onClick={() => patchConn(contextConn.id, { width: w })}>{w}</button>
                      ))}
                    </div>
                    <div className="whiteboard-context-subtitle">Nét</div>
                    <div className="whiteboard-context-row">
                      {CONN_DASH_OPTS.map((d) => (
                        <button key={d.id || "solid"} className={connDash(contextConn) === d.id ? "active" : ""} onClick={() => patchConn(contextConn.id, { dash: d.id })}>{d.label}</button>
                      ))}
                    </div>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => { const cc = contextConn; setConnLabelDraft(cc.label || ""); setConnLabelEdit({ id: cc.id, x: contextMenu.x, y: contextMenu.y }); })}>✏️ Nhãn{contextConn.label ? ` — “${String(contextConn.label).slice(0, 20)}”` : ""}</button>
                    <div className="whiteboard-context-row">
                      <button onClick={() => act(() => { checkpoint(); const flipped = flipConn(contextConn); setBoard((prev) => { const nb = { ...prev, connectors: prev.connectors.map((c) => c.id === contextConn.id ? flipped : c) }; pushHistory(nb); return nb; }); playWb("click"); })} title="Đảo chiều mũi tên">⇄ Đảo chiều</button>
                      <button onClick={() => act(() => { checkpoint(); setBoard((prev) => { const nb = { ...prev, connectors: prev.connectors.filter((c) => c.id !== contextConn.id) }; pushHistory(nb); return nb; }); setSelectedConn(null); })} style={{ color: "#dc2626" }}>Xóa</button>
                    </div>
                    <div className="whiteboard-context-hint">💡 Bấm chọn đường nối → cầm chấm trắng ở 2 đầu kéo sang khối khác</div>
                  </>
                ) : contextObject ? (
                  <>
                    <div className="whiteboard-context-title">{contextObject.kind === "node" ? "Node" : contextObject.kind === "image" ? "Ảnh" : contextObject.kind === "note" ? "Ghi chú" : "Đối tượng"}</div>
                    {contextObject.kind === "node" && (
                      <div className="whiteboard-context-row">
                        <button onClick={() => act(() => handleMindAdd(contextObject))}>＋ Nhánh con</button>
                        <button onClick={() => act(() => handleNumberChildren(contextObject.id))} title="Đánh số nhánh con">🔢 Số</button>
                      </div>
                    )}
                    <button onClick={() => act(() => { setSelection([contextObject.id]); setRequestEditId(contextObject.id); })}>Sửa chữ <span className="whiteboard-context-shortcut">F2</span></button>
                    {contextObject.sourceRef && (
                      <button onClick={() => act(() => openSourceFromRef(contextObject.sourceRef))} style={{ color: "var(--color-action, var(--primary))", fontWeight: 700 }}>📖 Mở sách nguồn — tr.{contextObject.sourceRef.bookPage || contextObject.sourceRef.page}</button>
                    )}
                    {contextObject.kind === "note" && (
                      <button onClick={() => act(() => handleChangeNoteColor(contextObject.id))}>Đổi màu</button>
                    )}
                    {contextObject.kind === "image" && (
                      <button onClick={() => act(() => { setReplaceImageId(contextObject.id); replaceImageRef.current?.click(); })}>Thay ảnh</button>
                    )}
                    <button onClick={() => act(() => handleDuplicateIds([contextObject.id]))}>Nhân bản <span className="whiteboard-context-shortcut">Ctrl+D</span></button>
                    {contextObject.kind === "node" && (() => {
                      const hasChildren = board.objects.some((o) => o.parentId === contextObject.id);
                      return hasChildren ? <button onClick={() => act(() => toggleCollapse(contextObject.id))}>{contextObject.collapsed ? "Mở nhánh" : "Thu gọn nhánh"}</button> : null;
                    })()}
                    <div className="whiteboard-context-sep" />
                    <div className="whiteboard-context-row">
                      <button onClick={() => act(() => toggleLock(contextObject.id))} title={contextObject.locked ? "Mở khóa khối" : "Khóa khối (không kéo/sửa được)"}>{contextObject.locked ? "🔓" : "🔒"}</button>
                      <button onClick={() => act(() => reorderZ([contextObject.id], "front"))} title="Đưa lên trên cùng">⬆</button>
                      <button onClick={() => act(() => reorderZ([contextObject.id], "back"))} title="Đưa xuống dưới cùng">⬇</button>
                    </div>
                    <div className="whiteboard-context-sep" />
                    <button onClick={() => act(() => handleDeleteIds([contextObject.id]))} style={{ color: "#dc2626" }}>Xóa <span className="whiteboard-context-shortcut">Delete</span></button>
                  </>
                ) : null}
              </div>
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
          <button className={`wb-tool ${tool === "select" ? "active" : ""}`} onClick={() => setTool("select")} title="Chọn (V/1)"><MousePointer2 size={17} /></button>
          <button className={`wb-tool ${tool === "pan" ? "active" : ""}`} onClick={() => setTool("pan")} title="Di chuyển (H/Space)"><Hand size={17} /></button>
          <div className="wb-sep" />
          <button className={`wb-tool ${tool === "pen" ? "active" : ""}`} onClick={() => setTool("pen")} title="Bút (P/2)"><Pencil size={17} /></button>
          {tool === "pen" && (
            <div className="wb-tool-pop">
              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} title="Màu bút" />
              <select value={penWidth} onChange={(e) => setPenWidth(parseInt(e.target.value, 10))} title="Độ dày bút">
                <option value={2}>2</option><option value={3}>3</option><option value={5}>5</option><option value={8}>8</option>
              </select>
            </div>
          )}
          <button className={`wb-tool ${tool === "eraser" ? "active" : ""}`} onClick={() => setTool("eraser")} title="Tẩy (chỉ xóa nét vẽ tay)"><Eraser size={17} /></button>
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
          <button className="wb-tool" onClick={() => importImageRef.current?.click()} title="Chèn ảnh"><ImageIcon size={17} /></button>
          <input ref={importImageRef} type="file" accept="image/*" hidden onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ""; }} />
          <button className={`wb-tool ${tool === "note" ? "active" : ""}`} onClick={() => setTool("note")} title="Ghi chú"><StickyNote size={17} /></button>
          <button className={`wb-tool ${tool === "mind" ? "active" : ""}`} onClick={() => setTool("mind")} title="Mindmap: bấm vào khối để thêm nhánh con" aria-label="Sơ đồ tư duy"><Network size={17} /></button>
          <div className="wb-sep" />
          <div className="wb-create-wrap">
            <button ref={createMenuBtnRef} className="wb-tool wb-tool--create" onClick={() => setShowCreateMenu((v) => !v)} title="Tạo nhanh: sơ đồ / mẫu / AI"><Plus size={17} /></button>
          </div>
          </>
          )}
        </div>
        {/* H8: popover Tạo nhanh đặt NGOÀI dock (fixed theo nút) để thoát overflow:auto + backdrop-filter */}
        {showCreateMenu && (
          <>
            <div className="wb-popover-backdrop" style={{ zIndex: 78 }} onClick={() => setShowCreateMenu(false)} />
            <div className="wb-popover wb-popover--rail wb-popover--fixed" style={createMenuPos || undefined}>
              <button className="wb-create-item" onClick={() => { setShowCreateMenu(false); setShowMindModal(true); }} title="Tạo sơ đồ tư duy nhanh"><Network size={15} /> Sơ đồ tư duy</button>
              <button className="wb-create-item" onClick={() => { setShowCreateMenu(false); setShowTemplate(true); }} title="Thư viện mẫu"><LayoutTemplate size={15} /> Thư viện mẫu</button>
              <button className="wb-create-item wb-create-item--ai" onClick={() => { setShowCreateMenu(false); setShowAI(true); }} title="AI tạo sơ đồ (cần API Key)"><Sparkles size={15} /> AI tạo sơ đồ</button>
            </div>
          </>
        )}
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
              <label className="form-label">Theme màu ({MINDMAP_THEMES.length} mẫu)</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(128px,1fr))", gap: 6, maxHeight: 190, overflow: "auto", padding: 2 }}>
                {MINDMAP_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMindTheme(t.id)}
                    title={t.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 9,
                      border: mindTheme === t.id ? "2px solid var(--primary,#2563eb)" : "1px solid var(--border-color,#e2e8f0)",
                      background: mindTheme === t.id ? "var(--primary-light,#eff6ff)" : "var(--surface,#fff)",
                      cursor: "pointer", fontSize: 12, fontWeight: mindTheme === t.id ? 700 : 400,
                    }}
                  >
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      {t.colors.slice(0, 4).map((c) => (
                        <i key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, border: "1px solid rgba(15,23,42,0.2)" }} />
                      ))}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  </button>
                ))}
              </div>
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
                    <div className="wb-ai-branch" key={b._k || i}>
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
                  <button className="btn btn-ghost" onClick={handleAIRegenerate} disabled={aiBusy}>{aiBusy ? "Đang tạo…" : "↻ Tạo lại"}</button>
                  <button className="btn btn-primary" onClick={handleAIApply} disabled={aiBusy} title={aiBusy ? "Đang tạo lại — chờ xong rồi đưa lên" : "Đưa sơ đồ lên bảng"} style={{ minWidth: 130 }}>✓ Đưa lên bảng</button>
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
                      <span style={{ fontSize: 11, color: aiText.length > 12000 ? "#b45309" : "var(--text-muted)" }}>
                        {aiText.length}/12000 ký tự{aiText.length > 12000 ? " — vượt sẽ chỉ đọc phần đầu + cuối, giữa bị cắt" : ""}. AI chỉ dùng đúng nội dung bạn dán — không bịa thêm. Thuật ngữ gốc được giữ nguyên. Nhận diện thụt lề/gạch đầu dòng làm phân cấp.
                      </span>
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
                    <button className="btn btn-secondary btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setAiSmallIdeas((a) => (a.length >= 12 ? a : [...a, ""]))} disabled={aiSmallIdeas.length >= 12} title={aiSmallIdeas.length >= 12 ? "Tối đa 12 ý" : "Thêm ý"}>+ Thêm ý{aiSmallIdeas.length >= 12 ? " (tối đa 12)" : ""}</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Chủ đề trung tâm <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>(tùy chọn — để trống AI tự rút từ nguồn)</span></label>
                    <input className="form-control" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="VD: Quang hợp ở thực vật" style={{ fontSize: 14, fontWeight: 600 }} />
                    {!aiText.trim() && !aiImageFile && !aiSmallIdeas.some((s) => s.trim()) && (
                      <span style={{ fontSize: 11, color: "#b45309", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 8, padding: "6px 8px" }}>
                        Chỉ có chủ đề, không có nguồn — AI tự mở rộng, dễ thiếu chính xác. Nên dán văn bản/ảnh hoặc thêm ý nhỏ bên trên.
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sau khi tạo bạn sẽ <b>xem trước, sửa nhãn rồi mới đưa lên bảng</b>. AI kiểm tra chống bịa với nguồn; không có API Key vẫn tạo được từ văn bản.</span>
                  </div>
                  {aiError && <div className="wb-ai-error">{aiError}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, paddingTop: 4 }}>
                    {aiBusy && aiProgress && <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: "auto" }}>{aiProgress}</span>}
                    <button className="btn btn-ghost" onClick={closeAIModal}>Đóng</button>
                    {aiBusy && <button className="btn btn-ghost" onClick={handleAICancel}>Hủy</button>}
                    <button className="btn btn-primary" onClick={handleAIGenerate} disabled={aiBusy} style={{ minWidth: 130 }}>{aiBusy ? "Đang tạo… (có thể Hủy)" : "✦ Tạo sơ đồ"}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tour 30 giây ── */}
      {showTour && (
        <div className="modal-overlay" onClick={closeTour}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header"><h2>Bảng trắng trong 30 giây</h2><button className="btn btn-ghost btn-xs" onClick={closeTour} aria-label="Đóng"><X size={16} /></button></div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <div style={{ fontSize: 40, lineHeight: 1 }}>{TOUR_STEPS[tourStep].icon}</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{TOUR_STEPS[tourStep].title}</div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{TOUR_STEPS[tourStep].desc}</p>
              <div style={{ display: "flex", gap: 6 }}>
                {TOUR_STEPS.map((_, i) => (
                  <span key={i} onClick={() => setTourStep(i)} style={{ width: 22, height: 6, borderRadius: 3, background: i === tourStep ? "var(--primary,#2563eb)" : "var(--border-color,#e2e8f0)", cursor: "pointer" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", paddingTop: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setTourStep((s) => Math.max(0, s - 1))} disabled={tourStep === 0}>← Quay lại</button>
                {tourStep < TOUR_STEPS.length - 1
                  ? <button className="btn btn-primary btn-sm" onClick={() => setTourStep((s) => s + 1)}>Tiếp tục →</button>
                  : <button className="btn btn-primary btn-sm" onClick={closeTour}>Bắt đầu vẽ ✓</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="whiteboard-toast">{toast}</div>}
      <ConfirmDialog
        open={pendingDeleteId != null || pendingBatchDelete}
        title={pendingBatchDelete ? `Xóa ${[...new Set(boardSel)].length} bảng đã chọn?` : "Xóa bảng này?"}
        message="Bảng đã xóa không hoàn tác được."
        confirmText="Xóa"
        onCancel={() => { setPendingDeleteId(null); setPendingBatchDelete(false); }}
        onConfirm={doConfirmDelete}
      />
    </div>
  );
}
