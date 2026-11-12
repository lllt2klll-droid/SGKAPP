// ── Crop Preview — Adjustable crop preview with drag-to-resize ──
// Cơ chế crop GIỮ NGUYÊN: kéo góc để resize, kéo giữa để move, ESC hủy.
// Nâng cấp bên trong: layout desktop 2 pane, zoom hiển thị, xoay ảnh xuất,
// khóa tỉ lệ, phím mũi tên, reset, xem trước ảnh xuất, thông tin chất lượng.
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCw, Check, X, Maximize2, Lock, Unlock, RefreshCcw, Eye, Crop } from "lucide-react";
import { getInitialCropRect } from "./scanCoordinates.js";

const MIN_CROP_SIZE = 40;
const HANDLE_SIZE = 12;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

const RATIOS = [
  { id: "free", label: "Tự do", ratio: 0 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "A4", label: "A4 dọc", ratio: 210 / 297 },
];

export default function CropPreview({
  dataUrl,
  initialCrop,
  onCancel,
  onConfirm,
  imageRef
}) {
  // ── Cơ chế crop gốc (giữ nguyên): crop theo tọa độ ảnh ──
  const [crop, setCrop] = useState(initialCrop || { x: 0, y: 0, w: 100, h: 100 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [fitSize, setFitSize] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState(null); // null | "move" | "resize:tl|tr|bl|br"
  const startRef = useRef(null);
  const containerRef = useRef(null);
  const imageContainerRef = useRef(null);

  // ── Tính năng bên trong (mới, không chạm cơ chế drag) ──
  const [zoom, setZoom] = useState(1); // zoom hiển thị 0.5–3
  const [rotation, setRotation] = useState(0); // 0|90|180|270 — áp lúc xuất
  const [ratioId, setRatioId] = useState("free");
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportUrl, setExportUrl] = useState("");
  const [exporting, setExporting] = useState(false);
  const initialCropRef = useRef(null);

  const activeRatio = useMemo(() => RATIOS.find((r) => r.id === ratioId)?.ratio || 0, [ratioId]);

  // Load image and calculate initial dimensions (giữ nguyên)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });

      const c = getInitialCropRect(img.width, img.height, initialCrop);
      setCrop(c);
      initialCropRef.current = { ...c };
    };
    img.src = dataUrl;
  }, [dataUrl, initialCrop]);

  // Calculate FIT size based on container (giữ nguyên logic fit, thêm zoom ở tầng hiển thị)
  useEffect(() => {
    const updateDisplaySize = () => {
      if (!containerRef.current || imageSize.width === 0) return;

      const containerWidth = Math.max(1, containerRef.current.clientWidth - 24);
      // Desktop: tận dụng chiều cao lớn; mobile: gọn
      const isDesktop = window.innerWidth >= 900;
      const containerHeight = Math.min(isDesktop ? 620 : 420, window.innerHeight * (isDesktop ? 0.62 : 0.5));

      const imgAspect = imageSize.width / imageSize.height;
      const containerAspect = containerWidth / containerHeight;

      let width, height;
      if (imgAspect > containerAspect) {
        width = containerWidth;
        height = width / imgAspect;
      } else {
        height = containerHeight;
        width = height * imgAspect;
      }

      setFitSize({ width, height });
    };

    updateDisplaySize();
    window.addEventListener('resize', updateDisplaySize);
    return () => window.removeEventListener('resize', updateDisplaySize);
  }, [imageSize]);

  // Kích thước hiển thị thực = fit * zoom; scale dùng cho hit-test
  const displaySize = useMemo(() => ({
    width: Math.round(fitSize.width * zoom),
    height: Math.round(fitSize.height * zoom),
  }), [fitSize, zoom]);
  const scale = fitSize.width > 0 && imageSize.width > 0
    ? displaySize.width / imageSize.width
    : 1;

  // Khóa tỉ lệ: ép w/h theo ratio sau mỗi lần resize
  const enforceRatio = useCallback((rc, anchor = "br") => {
    if (!activeRatio || !rc) return rc;
    let { x, y, w, h } = rc;
    w = Math.max(w, MIN_CROP_SIZE);
    h = Math.max(h, MIN_CROP_SIZE);
    // Ưu tiên giữ chiều rộng, tính lại chiều cao (trừ anchor top giữ đáy)
    if (anchor === "tl" || anchor === "tr") {
      // giữ đáy: dịch y để h khớp w
      const nh = w / activeRatio;
      if (y + h - nh >= 0) { y = y + h - nh; h = nh; }
      else { h = nh; }
    } else {
      h = w / activeRatio;
    }
    // Clamp vào ảnh
    if (x + w > imageSize.width) { w = imageSize.width - x; h = w / activeRatio; }
    if (y + h > imageSize.height) { h = imageSize.height - y; w = h * activeRatio; }
    w = Math.max(w, MIN_CROP_SIZE);
    h = Math.max(h, MIN_CROP_SIZE);
    return { x, y, w, h };
  }, [activeRatio, imageSize]);

  const getRelativePos = useCallback((e) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };

    const rect = imageContainerRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;

    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  }, [scale]);

  const hitHandle = useCallback((pos, rc) => {
    if (!rc) return null;
    const handles = {
      tl: { x: rc.x, y: rc.y },
      tr: { x: rc.x + rc.w, y: rc.y },
      bl: { x: rc.x, y: rc.y + rc.h },
      br: { x: rc.x + rc.w, y: rc.y + rc.h },
    };

    for (const [k, pt] of Object.entries(handles)) {
      const dist = Math.sqrt(Math.pow(pos.x - pt.x, 2) + Math.pow(pos.y - pt.y, 2));
      if (dist <= HANDLE_SIZE / scale) return k;
    }
    return null;
  }, [scale]);

  const insideRect = useCallback((pos, rc) => {
    if (!rc) return false;
    return pos.x >= rc.x && pos.x <= rc.x + rc.w && pos.y >= rc.y && pos.y <= rc.y + rc.h;
  }, []);

  // ── Pointer handlers: GIỮ NGUYÊN cơ chế ──
  const handlePointerDown = useCallback((e) => {
    const pos = getRelativePos(e);

    if (crop) {
      const h = hitHandle(pos, crop);
      if (h) {
        e.preventDefault();
        setMode(`resize:${h}`);
        startRef.current = { x: pos.x, y: pos.y, crop: { ...crop } };
        if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch {} }
        return;
      }

      if (insideRect(pos, crop)) {
        e.preventDefault();
        setMode("move");
        startRef.current = { x: pos.x, y: pos.y, crop: { ...crop } };
        if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch {} }
        return;
      }
    }
  }, [crop, getRelativePos, hitHandle, insideRect]);

  const handlePointerMove = useCallback((e) => {
    if (!mode || !startRef.current) return;

    const pos = getRelativePos(e);
    const base = startRef.current.crop;

    let newCrop = { ...base };

    if (mode === "move") {
      const dx = pos.x - startRef.current.x;
      const dy = pos.y - startRef.current.y;
      newCrop.x = clamp(base.x + dx, 0, imageSize.width - base.w);
      newCrop.y = clamp(base.y + dy, 0, imageSize.height - base.h);
    } else if (mode.startsWith("resize:")) {
      const handle = mode.split(":")[1];

      if (handle === "tl") {
        const right = base.x + base.w;
        const bottom = base.y + base.h;
        newCrop.x = clamp(pos.x, 0, right - MIN_CROP_SIZE);
        newCrop.y = clamp(pos.y, 0, bottom - MIN_CROP_SIZE);
        newCrop.w = right - newCrop.x;
        newCrop.h = bottom - newCrop.y;
      } else if (handle === "tr") {
        const bottom = base.y + base.h;
        newCrop.w = clamp(pos.x - base.x, MIN_CROP_SIZE, imageSize.width - base.x);
        newCrop.y = clamp(pos.y, 0, bottom - MIN_CROP_SIZE);
        newCrop.h = bottom - newCrop.y;
      } else if (handle === "bl") {
        const right = base.x + base.w;
        newCrop.x = clamp(pos.x, 0, right - MIN_CROP_SIZE);
        newCrop.w = right - newCrop.x;
        newCrop.h = clamp(pos.y - base.y, MIN_CROP_SIZE, imageSize.height - base.y);
      } else if (handle === "br") {
        newCrop.w = clamp(pos.x - base.x, MIN_CROP_SIZE, imageSize.width - base.x);
        newCrop.h = clamp(pos.y - base.y, MIN_CROP_SIZE, imageSize.height - base.y);
      }
      // Khóa tỉ lệ (chỉ tác động sau tính toán gốc → không đổi cơ chế)
      if (activeRatio) newCrop = enforceRatio(newCrop, handle);
    }

    setCrop(newCrop);
  }, [mode, imageSize, getRelativePos, activeRatio, enforceRatio]);

  const handlePointerUp = useCallback(() => {
    setMode(null);
    startRef.current = null;
  }, []);

  // Phím tắt: ESC hủy (giữ nguyên) + mũi tên tinh chỉnh (mới)
  const handleKey = useCallback((e) => {
    if (e.key === "Escape") {
      onCancel?.();
      return;
    }
    // Tinh chỉnh bằng bàn phím khi không focus input
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    setCrop((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      switch (e.key) {
        case "ArrowLeft": next.x = clamp(prev.x - step, 0, imageSize.width - prev.w); break;
        case "ArrowRight": next.x = clamp(prev.x + step, 0, imageSize.width - prev.w); break;
        case "ArrowUp": next.y = clamp(prev.y - step, 0, imageSize.height - prev.h); break;
        case "ArrowDown": next.y = clamp(prev.y + step, 0, imageSize.height - prev.h); break;
        default: return prev;
      }
      return next;
    });
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    else handled = false;
    void handled;
  }, [onCancel, imageSize]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Generate cropped image data URL (mở rộng: xoay ảnh xuất)
  const generateCroppedImage = useCallback((rot = rotation) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Cắt gốc trước
        const cut = document.createElement("canvas");
        cut.width = Math.round(crop.w);
        cut.height = Math.round(crop.h);
        const cctx = cut.getContext("2d");
        cctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, cut.width, cut.height);

        // Xoay nếu cần
        const r = ((rot % 360) + 360) % 360;
        if (r === 0) { resolve(cut.toDataURL("image/png")); return; }
        const out = document.createElement("canvas");
        if (r === 90 || r === 270) { out.width = cut.height; out.height = cut.width; }
        else { out.width = cut.width; out.height = cut.height; }
        const ctx = out.getContext("2d");
        ctx.translate(out.width / 2, out.height / 2);
        ctx.rotate((r * Math.PI) / 180);
        ctx.drawImage(cut, -cut.width / 2, -cut.height / 2);
        resolve(out.toDataURL("image/png"));
      };
      img.src = dataUrl;
    });
  }, [dataUrl, crop, rotation]);

  const handlePreviewExport = useCallback(async () => {
    setExporting(true);
    try {
      const url = await generateCroppedImage();
      setExportUrl(url);
      setShowExportPreview(true);
    } finally { setExporting(false); }
  }, [generateCroppedImage]);

  const handleConfirm = async () => {
    const croppedDataUrl = await generateCroppedImage();
    const r = ((rotation % 360) + 360) % 360;
    const swapped = r === 90 || r === 270;
    onConfirm?.({
      dataUrl: croppedDataUrl,
      crop: { ...crop },
      width: Math.round(swapped ? crop.h : crop.w),
      height: Math.round(swapped ? crop.w : crop.h),
      rotation: r,
    });
  };

  const handleReset = useCallback(() => {
    if (initialCropRef.current) setCrop({ ...initialCropRef.current });
    setRotation(0);
    setZoom(1);
    setRatioId("free");
    setShowExportPreview(false);
  }, []);

  const handleFitWidth = useCallback(() => {
    if (!fitSize.width || !imageSize.width) return;
    setCrop({ x: 0, y: crop.y, w: imageSize.width, h: crop.h });
  }, [crop, fitSize, imageSize]);

  const cropStyle = {
    left: crop.x * scale,
    top: crop.y * scale,
    width: crop.w * scale,
    height: crop.h * scale
  };

  const quality = useMemo(() => {
    const w = Math.round(crop.w), h = Math.round(crop.h);
    const mp = ((w * h) / 1e6).toFixed(2);
    let label = "Tốt cho AI đọc";
    let color = "#16a34a";
    if (w < 300 || h < 300) { label = "Hơi nhỏ — nên mở rộng"; color = "#b45309"; }
    if (w < 150 || h < 150) { label = "Quá nhỏ — AI khó đọc"; color = "#dc2626"; }
    return { w, h, mp, label, color };
  }, [crop]);

  const pct = imageSize.width > 0
    ? Math.round((crop.w * crop.h) / (imageSize.width * imageSize.height) * 100)
    : 0;

  return (
    <div className="cropd-root">
      <style>{`
        .cropd-root { display:flex; flex-direction:column; gap:14px; padding:20px; max-height:92dvh; color:var(--text-dark); }
        .cropd-head { display:flex; justify-content:space-between; align-items:center; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--border-color); }
        .cropd-title { min-width:0; margin:0; font-size:1rem; font-weight:750; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .cropd-title-icon { display:grid; place-items:center; width:32px; height:32px; flex:none; color:var(--color-action, var(--primary)); background:color-mix(in srgb, var(--color-action, var(--primary)) 12%, var(--surface)); border-radius:10px; }
        .cropd-title-copy { display:grid; gap:2px; }
        .cropd-subtitle { color:var(--text-muted, var(--text-mid)); font-size:.72rem; font-weight:500; }
        .cropd-badge { flex:none; font-size:.68rem; font-weight:650; color:var(--text-mid); background:var(--surface-soft); border:1px solid var(--border-color); padding:5px 9px; border-radius:8px; }
        .cropd-toolbar { display:flex; gap:5px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }
        .cropd-tbtn { min-height:34px; display:inline-flex; align-items:center; justify-content:center; gap:6px; font:inherit; font-size:.72rem; font-weight:650; padding:6px 9px; border-radius:8px; border:1px solid var(--border-color); background:var(--surface); color:var(--text-mid); cursor:pointer; transition:background .15s ease, border-color .15s ease, color .15s ease; }
        .cropd-tbtn:hover:not(:disabled) { border-color:var(--color-action, var(--primary)); color:var(--color-action, var(--primary)); }
        .cropd-tbtn:disabled { opacity:.55; cursor:wait; }
        .cropd-tbtn.on { background:color-mix(in srgb, var(--color-action, var(--primary)) 12%, var(--surface)); border-color:var(--color-action, var(--primary)); color:var(--color-action, var(--primary)); }
        .cropd-main { display:flex; flex-direction:column; gap:12px; min-height:0; }
        .cropd-canvas-wrap { display:flex; align-items:center; justify-content:center; background-color:#101827; background-image:radial-gradient(rgba(255,255,255,.075) .7px, transparent .7px); background-size:16px 16px; border:1px solid rgba(148,163,184,.18); border-radius:12px; padding:12px; overflow:auto; min-height:260px; max-height:58dvh; position:relative; }
        .cropd-stage { position:relative; flex:none; margin:auto; user-select:none; outline:none; }
        .cropd-stage:focus-visible { box-shadow:0 0 0 3px color-mix(in srgb, var(--color-action, var(--primary)) 55%, transparent); }
        .cropd-image { width:100%; height:100%; object-fit:contain; display:block; border-radius:4px; }
        .cropd-selection { position:absolute; border:2px solid var(--color-action, #2d73ff); background:rgba(45,115,255,.1); box-shadow:0 0 0 9999px rgba(0,0,0,.52); pointer-events:none; border-radius:4px; }
        .cropd-handle { position:absolute; width:${HANDLE_SIZE}px; height:${HANDLE_SIZE}px; background:#fff; border:2px solid var(--color-action, #2d73ff); border-radius:4px; pointer-events:auto; }
        .cropd-handle--tl { left:-${HANDLE_SIZE / 2}px; top:-${HANDLE_SIZE / 2}px; cursor:nwse-resize; }
        .cropd-handle--tr { right:-${HANDLE_SIZE / 2}px; top:-${HANDLE_SIZE / 2}px; cursor:nesw-resize; }
        .cropd-handle--bl { left:-${HANDLE_SIZE / 2}px; bottom:-${HANDLE_SIZE / 2}px; cursor:nesw-resize; }
        .cropd-handle--br { right:-${HANDLE_SIZE / 2}px; bottom:-${HANDLE_SIZE / 2}px; cursor:nwse-resize; }
        .cropd-selection-label { position:absolute; left:50%; top:-25px; transform:translateX(-50%); background:#101827; color:#fff; font-size:.65rem; font-weight:700; padding:4px 8px; border:1px solid rgba(255,255,255,.16); border-radius:7px; white-space:nowrap; }
        .cropd-side { display:flex; flex-direction:column; gap:10px; min-width:0; }
        .cropd-card { background:var(--surface-soft); border:1px solid var(--border-color); border-radius:10px; padding:12px; }
        .cropd-card h5 { margin:0 0 8px; font-size:.75rem; font-weight:700; color:var(--text-dark); display:flex; align-items:center; gap:6px; }
        .cropd-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .cropd-chip { min-height:30px; font:inherit; font-size:.68rem; padding:4px 9px; border-radius:7px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; font-weight:650; color:var(--text-mid); transition:all .15s ease; }
        .cropd-chip:hover { border-color:var(--color-action, var(--primary)); }
        .cropd-chip.on { background:var(--color-action, #2d73ff); border-color:var(--color-action, #2d73ff); color:#fff; }
        .cropd-meta { font-size:.7rem; color:var(--text-muted, var(--text-mid)); line-height:1.55; }
        .cropd-quality { display:flex; align-items:center; gap:7px; margin-top:8px; padding:7px 9px; color:var(--quality-color); background:color-mix(in srgb, var(--quality-color) 9%, var(--surface)); border-radius:7px; font-size:.68rem; font-weight:700; }
        .cropd-quality-dot { width:7px; height:7px; flex:none; border-radius:50%; background:currentColor; }
        .cropd-export-preview { margin-top:9px; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:#101827; }
        .cropd-export-preview img { width:100%; display:block; max-height:180px; object-fit:contain; }
        .cropd-export-preview p { margin:0; padding:7px 9px; }
        .cropd-foot { display:flex; justify-content:space-between; align-items:center; gap:12px; padding-top:12px; border-top:1px solid var(--border-color); }
        .cropd-foot-note { display:grid; gap:3px; font-size:.72rem; color:var(--text-mid); }
        .cropd-foot-note small { color:var(--text-muted, var(--text-mid)); font-size:.67rem; }
        .cropd-actions { display:flex; gap:8px; justify-content:flex-end; flex:none; }
        .cropd-btn { min-height:38px; display:inline-flex; align-items:center; justify-content:center; gap:7px; font:inherit; font-size:.75rem; font-weight:700; padding:8px 13px; border-radius:9px; border:1px solid var(--border-color); background:var(--surface); color:var(--text-mid); cursor:pointer; transition:all .15s ease; }
        .cropd-btn:hover { border-color:var(--text-muted, var(--text-mid)); color:var(--text-dark); }
        .cropd-btn.primary { background:var(--color-action, #2d73ff); border-color:var(--color-action, #2d73ff); color:#fff; box-shadow:0 3px 10px color-mix(in srgb, var(--color-action, #2d73ff) 22%, transparent); }
        .cropd-btn.primary:hover { filter:brightness(1.06); }
        @media (min-width: 900px) {
          .cropd-main { flex:1; flex-direction:row; align-items:stretch; overflow:hidden; }
          .cropd-canvas-wrap { flex:1; min-width:0; min-height:320px; max-height:62dvh; }
          .cropd-side { width:260px; flex:none; max-height:62dvh; overflow:auto; }
        }
        @media (max-width: 899px) {
          .cropd-root { overflow:auto; }
          .cropd-head { align-items:flex-start; flex-direction:column; }
          .cropd-toolbar { justify-content:flex-start; }
          .cropd-canvas-wrap { min-height:240px; max-height:46dvh; }
          .cropd-side { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
        }
        @media (max-width: 520px) {
          .cropd-root { gap:10px; padding:14px; }
          .cropd-badge { display:none; }
          .cropd-tbtn { min-height:32px; padding:5px 7px; }
          .cropd-foot { align-items:stretch; flex-direction:column; }
          .cropd-actions { display:grid; grid-template-columns:1fr 1.35fr; }
          .cropd-btn { padding-inline:8px; }
        }
        @media (max-height: 700px) and (min-width: 900px) {
          .cropd-canvas-wrap, .cropd-side { max-height:52dvh; }
          .cropd-canvas-wrap { min-height:220px; }
        }
      `}</style>

      <div className="cropd-head">
        <h4 className="cropd-title">
          <span className="cropd-title-icon"><Crop size={17} /></span>
          <span className="cropd-title-copy">
            Chỉnh vùng ảnh
            <span className="cropd-subtitle">Kéo khung chọn để lấy đúng nội dung cần dùng</span>
          </span>
          <span className="cropd-badge">Ảnh gốc · {imageSize.width} × {imageSize.height}px</span>
        </h4>
        <div className="cropd-toolbar" role="toolbar" aria-label="Công cụ crop">
          <button className="cropd-tbtn" onClick={() => setZoom((z) => clamp(Math.round((z - 0.25) * 100) / 100, 0.5, 3))} title="Thu nhỏ hiển thị" aria-label="Thu nhỏ"><ZoomOut size={14} /></button>
          <span className="cropd-badge">{Math.round(zoom * 100)}%</span>
          <button className="cropd-tbtn" onClick={() => setZoom((z) => clamp(Math.round((z + 0.25) * 100) / 100, 0.5, 3))} title="Phóng to hiển thị" aria-label="Phóng to"><ZoomIn size={14} /></button>
          <button className="cropd-tbtn" onClick={() => setZoom(1)} title="Vừa khung"><Maximize2 size={14} /> Vừa khung</button>
          <button className={`cropd-tbtn ${rotation ? "on" : ""}`} onClick={() => setRotation((r) => (r + 90) % 360)} title="Xoay ảnh xuất 90° (áp lúc xác nhận)"><RotateCw size={14} /> {rotation}°</button>
          <button className="cropd-tbtn" onClick={handleReset} title="Hoàn tác về vùng ban đầu"><RefreshCcw size={14} /> Đặt lại</button>
        </div>
      </div>

      <div className="cropd-main">
        <div
          ref={containerRef}
          className="cropd-canvas-wrap"
        >
          <div
            ref={imageContainerRef}
            className="cropd-stage"
            style={{
              width: displaySize.width,
              height: displaySize.height,
              cursor: mode === "move" ? "move" : mode && mode.startsWith("resize") ?
                (mode.includes("tl") || mode.includes("br") ? "nwse-resize" : "nesw-resize") : "default",
            }}
            tabIndex={0}
            role="application"
            aria-label="Vùng crop: kéo góc để chỉnh, kéo giữa để di chuyển, phím mũi tên để tinh chỉnh"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={dataUrl}
              alt="Preview"
              className="cropd-image"
              draggable={false}
            />

            {/* Crop overlay — giữ nguyên cơ chế */}
            <div
              className="cropd-selection"
              style={{ ...cropStyle }}
            >
              {/* Corner handles */}
              {["tl","tr","bl","br"].map((k) => (
                <div
                  key={k}
                  className={`cropd-handle cropd-handle--${k}`}
                />
              ))}
              <span className="cropd-selection-label">
                {quality.w}×{quality.h} · {pct}% ảnh
              </span>
            </div>
          </div>
        </div>

        <aside className="cropd-side" aria-label="Tùy chọn crop">
          <div className="cropd-card">
            <h5><Lock size={13} /> Tỉ lệ khung</h5>
            <div className="cropd-row" role="radiogroup" aria-label="Tỉ lệ khung">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  className={`cropd-chip ${ratioId === r.id ? "on" : ""}`}
                  onClick={() => {
                    setRatioId(r.id);
                    if (r.ratio) setCrop((prev) => enforceRatio(prev, "br"));
                  }}
                  aria-pressed={ratioId === r.id}
                >{r.label}</button>
              ))}
            </div>
            <div className="cropd-meta" style={{ marginTop: 7 }}>
              {activeRatio ? "Đã khóa tỉ lệ khung hình." : "Tự do điều chỉnh theo nội dung."} Dùng phím mũi tên để tinh chỉnh.
            </div>
          </div>

          <div className="cropd-card">
            <h5>Chất lượng vùng chọn</h5>
            <div className="cropd-meta">
              Kích thước xuất: <strong>{quality.w} × {quality.h} px</strong> (~{quality.mp} MP)<br />
              Độ phủ: <strong>{pct}%</strong> ảnh gốc ({imageSize.width}×{imageSize.height})<br />
              Xoay lúc xuất: <strong>{rotation}°</strong><br />
              <div className="cropd-quality" style={{ "--quality-color": quality.color }}>
                <span className="cropd-quality-dot" />
                {quality.label}
              </div>
            </div>
            <div className="cropd-row" style={{ marginTop: 9 }}>
              <button className="cropd-tbtn" onClick={handleFitWidth} title="Mở rộng full chiều ngang"><Maximize2 size={13} /> Full ngang</button>
              <button className={`cropd-tbtn ${showExportPreview ? "on" : ""}`} onClick={handlePreviewExport} disabled={exporting} title="Xem trước ảnh sẽ xuất">
                <Eye size={13} /> {exporting ? "Đang dựng…" : "Xem ảnh xuất"}
              </button>
            </div>
            {showExportPreview && exportUrl && (
              <div className="cropd-export-preview">
                <img src={exportUrl} alt="Ảnh xuất xem trước" />
                <p className="cropd-meta">Ảnh AI sẽ đọc{rotation ? ` · đã xoay ${rotation}°` : ""}.</p>
              </div>
            )}
          </div>

          <div className="cropd-card">
            <h5><Unlock size={13} /> Thao tác nhanh</h5>
            <div className="cropd-meta">
              Kéo góc để đổi kích thước · kéo giữa để di chuyển<br />
              Phím mũi tên tinh chỉnh vị trí · Shift để di chuyển nhanh hơn
            </div>
          </div>
        </aside>
      </div>

      <div className="cropd-foot">
        <div className="cropd-foot-note">
          <span><strong>{quality.w} × {quality.h}px</strong> · {quality.mp} MP · {pct}% ảnh gốc</span>
          <small>Kéo khung để di chuyển, kéo góc để thay đổi kích thước · Esc để hủy</small>
        </div>
        <div className="cropd-actions">
          <button className="cropd-btn" onClick={onCancel}><X size={16} /> Hủy</button>
          <button className="cropd-btn primary" onClick={handleConfirm}><Check size={16} /> Dùng vùng này</button>
        </div>
      </div>
    </div>
  );
}
