// ── Crop Preview — Adjustable crop preview with drag-to-resize ──
// Cơ chế crop GIỮ NGUYÊN: kéo góc để resize, kéo giữa để move, ESC hủy.
// Nâng cấp bên trong: layout desktop 2 pane, zoom hiển thị, xoay ảnh xuất,
// khóa tỉ lệ, phím mũi tên, reset, xem trước ảnh xuất, thông tin chất lượng.
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCw, Check, X, Maximize2, Lock, Unlock, RefreshCcw, Eye } from "lucide-react";

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

      // Calculate initial crop if not provided
      if (!initialCrop) {
        const padding = Math.min(img.width, img.height) * 0.1;
        const c = {
          x: padding,
          y: padding,
          w: img.width - padding * 2,
          h: img.height - padding * 2
        };
        setCrop(c);
        initialCropRef.current = { ...c };
      } else {
        // Convert container coordinates to image coordinates if needed
        // If the crop is already in image coordinates (has srcRect property), use it directly
        // Otherwise, assume it's in container coordinates and needs conversion
        let c;
        if (initialCrop.srcRect) {
          c = {
            x: initialCrop.srcRect.sx,
            y: initialCrop.srcRect.sy,
            w: initialCrop.srcRect.sw,
            h: initialCrop.srcRect.sh
          };
        } else {
          c = { ...initialCrop };
        }
        setCrop(c);
        initialCropRef.current = { ...c };
      }
    };
    img.src = dataUrl;
  }, [dataUrl, initialCrop]);

  // Calculate FIT size based on container (giữ nguyên logic fit, thêm zoom ở tầng hiển thị)
  useEffect(() => {
    const updateDisplaySize = () => {
      if (!containerRef.current || imageSize.width === 0) return;

      const containerWidth = Math.max(280, containerRef.current.clientWidth - 32);
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
        .cropd-root { display:flex; flex-direction:column; gap:12px; padding:16px; max-height:88vh; }
        .cropd-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
        .cropd-title { margin:0; font-size:1rem; font-weight:700; color:var(--text-dark); display:flex; align-items:center; gap:8px; }
        .cropd-badge { font-size:10.5px; font-weight:700; color:var(--color-action-strong, var(--color-action)); background:var(--color-action-soft, var(--primary-light)); border:1px solid var(--border-color); padding:2px 8px; border-radius:999px; }
        .cropd-toolbar { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .cropd-tbtn { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; padding:6px 10px; border-radius:8px; border:1px solid var(--border-color); background:var(--surface); color:var(--text-mid); cursor:pointer; }
        .cropd-tbtn:hover { border-color:var(--color-action, var(--primary)); color:var(--color-action, var(--primary)); }
        .cropd-tbtn.on { background:var(--color-action-soft, #eff6ff); border-color:var(--color-action, #2d73ff); color:var(--color-action-strong, #1d4ed8); }
        .cropd-tbtn.primary { background:var(--color-action, var(--primary)); border-color:var(--color-action, var(--primary)); color:#fff; }
        .cropd-main { display:flex; flex-direction:column; gap:12px; min-height:0; }
        @media (min-width: 900px) {
          .cropd-main { flex-direction:row; align-items:stretch; }
          .cropd-canvas-wrap { flex:1; min-width:0; }
          .cropd-side { width:300px; flex-shrink:0; max-height:64vh; overflow:auto; }
        }
        .cropd-canvas-wrap { background:#0f172a; border-radius:12px; padding:12px; overflow:auto; min-height:320px; max-height:64vh; position:relative; }
        .cropd-side { display:flex; flex-direction:column; gap:10px; }
        .cropd-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
        .cropd-card h5 { margin:0 0 6px; font-size:12px; color:#0f172a; }
        .cropd-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .cropd-chip { font-size:11px; padding:4px 9px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; font-weight:700; color:#475569; }
        .cropd-chip.on { background:var(--color-action, #2d73ff); border-color:var(--color-action, #2d73ff); color:#fff; }
        .cropd-meta { font-size:11.5px; color:#475569; line-height:1.6; }
        .cropd-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; color:#64748b; }
        .cropd-actions { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
        .cropd-btn { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:800; padding:9px 16px; border-radius:10px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; }
        .cropd-btn.primary { background:var(--color-action, #2d73ff); border-color:var(--color-action, #2d73ff); color:#fff; }
      `}</style>

      <div className="cropd-head">
        <h4 className="cropd-title">
          Điều chỉnh vùng crop
          <span className="cropd-badge">Desktop · {Math.round(displaySize.width)}×{Math.round(displaySize.height)} hiển thị</span>
        </h4>
        <div className="cropd-toolbar" role="toolbar" aria-label="Công cụ crop">
          <button className="cropd-tbtn" onClick={() => setZoom((z) => clamp(Math.round((z - 0.25) * 100) / 100, 0.5, 3))} title="Thu nhỏ hiển thị"><ZoomOut size={14} /> {Math.round(zoom * 100)}%</button>
          <button className="cropd-tbtn" onClick={() => setZoom((z) => clamp(Math.round((z + 0.25) * 100) / 100, 0.5, 3))} title="Phóng to hiển thị"><ZoomIn size={14} /></button>
          <button className="cropd-tbtn" onClick={() => setZoom(1)} title="Vừa khung"><Maximize2 size={14} /> Vừa khung</button>
          <button className="cropd-tbtn" onClick={() => setRotation((r) => (r + 90) % 360)} title="Xoay ảnh xuất 90° (áp lúc xác nhận)"><RotateCw size={14} /> Xoay {rotation}°</button>
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
            style={{
              position: "relative",
              width: displaySize.width,
              height: displaySize.height,
              margin: "0 auto",
              cursor: mode === "move" ? "move" : mode && mode.startsWith("resize") ?
                (mode.includes("tl") || mode.includes("br") ? "nwse-resize" : "nesw-resize") : "default",
              userSelect: "none",
              outline: "none",
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
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                borderRadius: 6,
              }}
              draggable={false}
            />

            {/* Crop overlay — giữ nguyên cơ chế */}
            <div
              style={{
                position: "absolute",
                ...cropStyle,
                border: "2px solid #2d73ff",
                background: "rgba(45,115,255,0.1)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                pointerEvents: "none",
                borderRadius: 4,
              }}
            >
              {/* Corner handles */}
              {["tl","tr","bl","br"].map((k) => (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    background: "#fff",
                    border: "2px solid #2d73ff",
                    borderRadius: 3,
                    left: k.includes("l") ? -HANDLE_SIZE/2 : undefined,
                    right: k.includes("r") ? -HANDLE_SIZE/2 : undefined,
                    top: k.includes("t") ? -HANDLE_SIZE/2 : undefined,
                    bottom: k.includes("b") ? -HANDLE_SIZE/2 : undefined,
                    cursor: k === "tl" || k === "br" ? "nwse-resize" : "nesw-resize",
                    pointerEvents: "auto"
                  }}
                />
              ))}
              <span style={{ position:"absolute", left:"50%", top:-24, transform:"translateX(-50%)", background:"#0f172a", color:"#fff", fontSize:10.5, fontWeight:800, padding:"3px 8px", borderRadius:999, whiteSpace:"nowrap" }}>
                {quality.w}×{quality.h} · {pct}% ảnh
              </span>
            </div>
          </div>
        </div>

        <aside className="cropd-side" aria-label="Tùy chọn crop">
          <div className="cropd-card">
            <h5><Lock size={12} style={{ display:"inline", verticalAlign:-1 }} /> Khóa tỉ lệ</h5>
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
            <div className="cropd-meta" style={{ marginTop: 6 }}>
              {activeRatio ? "Đang khóa tỉ lệ — kéo góc để giữ đúng khung." : "Tự do — kéo 4 góc thoải mái."} Phím ←↑↓→ tinh chỉnh 1px (Shift = 10px).
            </div>
          </div>

          <div className="cropd-card">
            <h5>Chất lượng vùng chọn</h5>
            <div className="cropd-meta">
              Kích thước xuất: <strong>{quality.w} × {quality.h} px</strong> (~{quality.mp} MP)<br />
              Độ phủ: <strong>{pct}%</strong> ảnh gốc ({imageSize.width}×{imageSize.height})<br />
              Xoay lúc xuất: <strong>{rotation}°</strong><br />
              <span style={{ color: quality.color, fontWeight: 800 }}>● {quality.label}</span>
            </div>
            <div className="cropd-row" style={{ marginTop: 8 }}>
              <button className="cropd-tbtn" onClick={handleFitWidth} title="Mở rộng full chiều ngang"><Maximize2 size={13} /> Full ngang</button>
              <button className={`cropd-tbtn ${showExportPreview ? "on" : ""}`} onClick={handlePreviewExport} disabled={exporting} title="Xem trước ảnh sẽ xuất">
                <Eye size={13} /> {exporting ? "Đang dựng…" : "Xem ảnh xuất"}
              </button>
            </div>
            {showExportPreview && exportUrl && (
              <div style={{ marginTop: 8, border:"1px solid #e2e8f0", borderRadius: 8, overflow:"hidden", background:"#fff" }}>
                <img src={exportUrl} alt="Ảnh xuất xem trước" style={{ width:"100%", display:"block", maxHeight:220, objectFit:"contain", background:"#0f172a" }} />
                <div className="cropd-meta" style={{ padding:"6px 8px" }}>Xem trước đúng ảnh AI sẽ đọc{rotation ? ` (đã xoay ${rotation}°)` : ""} — giữ nguyên câu hỏi/bài tập trong vùng.</div>
              </div>
            )}
          </div>

          <div className="cropd-card">
            <h5><Unlock size={12} style={{ display:"inline", verticalAlign:-1 }} /> Cách dùng</h5>
            <div className="cropd-meta">
              • Kéo góc để chỉnh · kéo giữa để di chuyển<br />
              • Double-check: vùng phải ôm trọn câu hỏi/bài tập cần giữ nguyên<br />
              • ESC để hủy · Enter để xác nhận
            </div>
          </div>
        </aside>
      </div>

      <div className="cropd-foot">
        <span>Kích thước: {Math.round(crop.w)} × {Math.round(crop.h)} px · Zoom hiển thị {Math.round(zoom * 100)}% · Kéo góc để chỉnh · Kéo giữa để di chuyển · ESC để hủy</span>
        <div className="cropd-actions">
          <button className="cropd-btn" onClick={onCancel}><X size={16} /> Hủy</button>
          <button className="cropd-btn primary" onClick={handleConfirm}><Check size={16} /> Xác nhận vùng này</button>
        </div>
      </div>
    </div>
  );
}
