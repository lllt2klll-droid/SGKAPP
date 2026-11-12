// ── Scan Overlay — pointer events rectangle selection (mouse/touch/pen) ──
// Supports: drag-to-create, drag-to-move, 4-corner resize, keyboard, a11y
// Handles zoom/devicePixelRatio via CSS rects — no assumption of image vs canvas
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Crop, Check, X, RotateCcw } from "lucide-react";

const MIN_W = 40;
const MIN_H = 40;
const HANDLE = 10;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export default function ScanOverlay({ containerRef, onSelect, onCancel, active }) {
  const [rect, setRect] = useState(null); // {x,y,w,h} in container coords
  const [mode, setMode] = useState(null); // null | "create" | "move" | "resize:tl|tr|bl|br"
  const startRef = useRef(null); // {x,y, rect}
  const overlayRef = useRef(null);

  const getPos = useCallback((e) => {
    const cont = containerRef.current;
    if (!cont) return { x: 0, y: 0, r: null };
    const r = cont.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    // Return position relative to container (screen space)
    const x = clientX - r.left;
    const y = clientY - r.top;
    return { x, y, r };
  }, [containerRef]);

  const hitHandle = useCallback((pos, rc) => {
    if (!rc) return null;
    const handles = {
      tl: { x: rc.x, y: rc.y },
      tr: { x: rc.x + rc.w, y: rc.y },
      bl: { x: rc.x, y: rc.y + rc.h },
      br: { x: rc.x + rc.w, y: rc.y + rc.h },
    };
    for (const [k, pt] of Object.entries(handles)) {
      if (Math.abs(pos.x - pt.x) <= HANDLE && Math.abs(pos.y - pt.y) <= HANDLE) return k;
    }
    return null;
  }, []);

  const insideRect = useCallback((pos, rc) => {
    if (!rc) return false;
    return pos.x >= rc.x && pos.x <= rc.x + rc.w && pos.y >= rc.y && pos.y <= rc.y + rc.h;
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (!active) return;
    const pos = getPos(e);
    if (!pos.r) return;
    // if we have a rect, check handle/move hit first
    if (rect) {
      const h = hitHandle(pos, rect);
      if (h) {
        e.preventDefault();
        setMode(`resize:${h}`);
        startRef.current = { x: pos.x, y: pos.y, rect: { ...rect } };
        if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch {} }
        return;
      }
      if (insideRect(pos, rect)) {
        e.preventDefault();
        setMode("move");
        startRef.current = { x: pos.x, y: pos.y, rect: { ...rect } };
        if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch {} }
        return;
      }
    }
    // otherwise start create
    e.preventDefault();
    setMode("create");
    startRef.current = { x: pos.x, y: pos.y, rect: null };
    setRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch {} }
  }, [active, getPos, rect, hitHandle, insideRect]);

  const rafRef = useRef(0);
  const pendingPosRef = useRef(null);

  const applyMove = useCallback((pos) => {
    const { r } = pos;
    if (!r) return;
    const curMode = pendingPosRef.current?.mode ?? mode;
    if (curMode === "create") {
      const sx = startRef.current.x;
      const sy = startRef.current.y;
      const nx = Math.min(pos.x, sx);
      const ny = Math.min(pos.y, sy);
      const nw = Math.abs(pos.x - sx);
      const nh = Math.abs(pos.y - sy);
      const maxW = r.width - nx;
      const maxH = r.height - ny;
      setRect({ x: clamp(nx, 0, r.width), y: clamp(ny, 0, r.height), w: clamp(nw, 0, maxW), h: clamp(nh, 0, maxH) });
    } else if (curMode === "move") {
      const dx = pos.x - startRef.current.x;
      const dy = pos.y - startRef.current.y;
      const base = startRef.current.rect;
      const nx = clamp(base.x + dx, 0, r.width - base.w);
      const ny = clamp(base.y + dy, 0, r.height - base.h);
      setRect({ ...base, x: nx, y: ny });
    } else if (curMode.startsWith("resize:")) {
      const handle = curMode.split(":")[1];
      const base = startRef.current.rect;
      let nx = base.x, ny = base.y, nw = base.w, nh = base.h;
      if (handle === "tl") {
        const right = base.x + base.w; const bottom = base.y + base.h;
        nx = clamp(pos.x, 0, right - MIN_W); ny = clamp(pos.y, 0, bottom - MIN_H);
        nw = right - nx; nh = bottom - ny;
      } else if (handle === "tr") {
        const bottom = base.y + base.h;
        nw = clamp(pos.x - base.x, MIN_W, r.width - base.x); ny = clamp(pos.y, 0, bottom - MIN_H); nh = bottom - ny;
      } else if (handle === "bl") {
        const right = base.x + base.w;
        nx = clamp(pos.x, 0, right - MIN_W); nw = right - nx; nh = clamp(pos.y - base.y, MIN_H, r.height - base.y);
      } else if (handle === "br") {
        nw = clamp(pos.x - base.x, MIN_W, r.width - base.x); nh = clamp(pos.y - base.y, MIN_H, r.height - base.y);
      } else {
        if (handle.includes("l")) { const right = base.x + base.w; nx = clamp(pos.x, 0, right - MIN_W); nw = right - nx; }
        else if (handle.includes("r")) { nw = clamp(pos.x - base.x, MIN_W, r.width - base.x); }
        if (handle.includes("t")) { const bottom = base.y + base.h; ny = clamp(pos.y, 0, bottom - MIN_H); nh = bottom - ny; }
        else if (handle.includes("b")) { nh = clamp(pos.y - base.y, MIN_H, r.height - base.y); }
      }
      setRect({ x: nx, y: ny, w: nw, h: nh });
    }
  }, [mode]);

  const handlePointerMove = useCallback((e) => {
    if (!mode || !startRef.current) return;
    const pos = getPos(e);
    pendingPosRef.current = { ...pos, mode };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const p = pendingPosRef.current;
      if (!p) return;
      applyMove(p);
    });
  }, [mode, getPos, applyMove]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handlePointerUp = useCallback(() => {
    if (!mode) return;
    const wasCreate = mode === "create";
    setMode(null);
    startRef.current = null;
    if (wasCreate && rect && (rect.w < MIN_W || rect.h < MIN_H)) {
      setRect(null);
    }
  }, [mode, rect]);

  const handleKey = useCallback((e) => {
    if (e.key === "Escape") {
      setRect(null);
      setMode(null);
      startRef.current = null;
      onCancel?.();
    }
  }, [onCancel]);

  useEffect(() => {
    if (!active) { setRect(null); setMode(null); startRef.current = null; return; }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, handleKey]);

  // tinh tế: double-click chọn toàn trang
  const handleDoubleClick = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const r = cont.getBoundingClientRect();
    // inset nhỏ 6px để không sát viền
    setRect({ x: 6, y: 6, w: r.width - 12, h: r.height - 12 });
  }, []);

  if (!active) return null;

  const hasSelection = rect && rect.w >= MIN_W && rect.h >= MIN_H;
  const tooSmall = rect && (rect.w < MIN_W || rect.h < MIN_H) && (rect.w > 0 || rect.h > 0);
  const pct = (() => {
    const cont = containerRef.current;
    if (!cont || !rect) return 0;
    const r = cont.getBoundingClientRect();
    return Math.round((rect.w * rect.h) / (r.width * r.height) * 100);
  })();

  return (
    <>
      <style>{`
        .scan-overlay--refined { position:absolute; inset:0; z-index:30; touch-action:none; user-select:none; -webkit-user-select:none; }
        .scan-overlay__hint { position:absolute; top:14px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:10px; max-width:calc(100% - 28px); padding:9px 13px; color:var(--text-dark); background:color-mix(in srgb, var(--surface) 94%, transparent); border:1px solid var(--border-color); border-radius:12px; box-shadow:0 8px 24px rgba(15,23,42,.16); backdrop-filter:blur(12px); pointer-events:none; }
        .scan-overlay__icon { display:grid; place-items:center; width:30px; height:30px; flex:none; color:var(--color-action, #2d73ff); background:color-mix(in srgb, var(--color-action, #2d73ff) 12%, var(--surface)); border-radius:9px; }
        .scan-overlay__copy { display:grid; gap:2px; min-width:0; }
        .scan-overlay__title { font-size:.75rem; line-height:1.2; font-weight:750; }
        .scan-overlay__description { color:var(--text-muted, var(--text-mid)); font-size:.66rem; line-height:1.3; }
        .scan-overlay__key { flex:none; color:var(--text-muted, var(--text-mid)); border:1px solid var(--border-color); border-radius:6px; padding:3px 6px; font-size:.62rem; font-weight:650; }
        .scan-overlay__selection { position:absolute; border:2px solid var(--color-action, #2d73ff); background:rgba(45,115,255,.09); box-shadow:0 0 0 1px rgba(45,115,255,.16), 0 8px 24px rgba(45,115,255,.18), 0 0 0 9999px rgba(15,23,42,.38); border-radius:8px; pointer-events:none; transition:box-shadow .16s ease, background .16s ease; }
        .scan-overlay__selection--small { border-color:#f59e0b; background:rgba(245,158,11,.12); box-shadow:0 0 0 9999px rgba(15,23,42,.34); }
        .scan-overlay__inner { position:absolute; inset:3px; border:1px dashed rgba(45,115,255,.4); border-radius:5px; pointer-events:none; }
        .scan-overlay__handle { position:absolute; width:${HANDLE + 2}px; height:${HANDLE + 2}px; background:#fff; border:2px solid var(--color-action, #2d73ff); border-radius:4px; box-shadow:0 2px 8px rgba(15,23,42,.22); }
        .scan-overlay__handle--tl { left:-${(HANDLE + 2) / 2}px; top:-${(HANDLE + 2) / 2}px; cursor:nwse-resize; }
        .scan-overlay__handle--tr { right:-${(HANDLE + 2) / 2}px; top:-${(HANDLE + 2) / 2}px; cursor:nesw-resize; }
        .scan-overlay__handle--bl { left:-${(HANDLE + 2) / 2}px; bottom:-${(HANDLE + 2) / 2}px; cursor:nesw-resize; }
        .scan-overlay__handle--br { right:-${(HANDLE + 2) / 2}px; bottom:-${(HANDLE + 2) / 2}px; cursor:nwse-resize; }
        .scan-overlay__measure { position:absolute; left:50%; top:-26px; transform:translateX(-50%); padding:4px 8px; color:#fff; background:#101827; border:1px solid rgba(255,255,255,.16); border-radius:7px; box-shadow:0 4px 12px rgba(15,23,42,.2); font-size:.64rem; font-weight:750; white-space:nowrap; }
        .scan-overlay__small-note { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); padding:5px 9px; color:#fff; background:rgba(15,23,42,.86); border:1px solid rgba(255,255,255,.18); border-radius:7px; font-size:.68rem; font-weight:700; white-space:nowrap; }
        .scan-overlay__actions { position:absolute; bottom:max(14px, env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); display:flex; align-items:center; justify-content:center; gap:7px; max-width:calc(100% - 24px); padding:6px; background:color-mix(in srgb, var(--surface) 94%, transparent); border:1px solid var(--border-color); border-radius:12px; box-shadow:0 8px 24px rgba(15,23,42,.18); backdrop-filter:blur(12px); pointer-events:auto; }
        .scan-overlay__button { min-height:36px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:7px 11px; color:var(--text-mid); background:var(--surface); border:1px solid var(--border-color); border-radius:8px; font:inherit; font-size:.72rem; font-weight:700; white-space:nowrap; cursor:pointer; transition:all .15s ease; }
        .scan-overlay__button:hover { color:var(--text-dark); border-color:var(--text-muted, var(--text-mid)); }
        .scan-overlay__button--primary { color:#fff; background:var(--color-action, #2d73ff); border-color:var(--color-action, #2d73ff); box-shadow:0 3px 10px rgba(45,115,255,.2); }
        .scan-overlay__button--primary:hover { color:#fff; filter:brightness(1.06); }
        .scan-overlay__button:focus-visible { outline:2px solid var(--color-action, #2d73ff); outline-offset:2px; }
        @media (max-width:560px) {
          .scan-overlay__hint { top:8px; max-width:calc(100% - 16px); padding:7px 9px; gap:7px; border-radius:10px; }
          .scan-overlay__icon { width:27px; height:27px; }
          .scan-overlay__description { max-width:52vw; }
          .scan-overlay__key { display:none; }
          .scan-overlay__actions { bottom:max(8px, env(safe-area-inset-bottom)); width:max-content; max-width:calc(100% - 16px); gap:5px; padding:5px; }
          .scan-overlay__button { min-height:34px; padding:6px 9px; font-size:.68rem; }
        }
      `}</style>
      <div
        ref={overlayRef}
        className="scan-overlay scan-overlay--refined"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{
          cursor: mode === "move" ? "move" : mode && mode.startsWith("resize") ? (mode.includes("tl") || mode.includes("br") ? "nwse-resize" : "nesw-resize") : "crosshair",
          background: rect ? "rgba(15,23,42,.05)" : "rgba(15,23,42,.02)",
        }}
        role="region"
        aria-label="Kéo để chọn vùng quét — kéo góc để chỉnh, kéo giữa để di chuyển, nhấp đúp chọn cả trang, Esc để hủy"
        tabIndex={0}
      >
        <div className="scan-overlay__hint">
          <span className="scan-overlay__icon"><Crop size={16} /></span>
          <span className="scan-overlay__copy">
            <span className="scan-overlay__title">{rect ? "Tinh chỉnh vùng chọn" : "Khoanh vùng nội dung"}</span>
            <span className="scan-overlay__description">
              {rect ? "Kéo góc để đổi kích thước · kéo giữa để di chuyển" : "Kéo quanh bài học hoặc câu hỏi cần AI đọc"}
            </span>
          </span>
          <span className="scan-overlay__key">ESC để hủy</span>
        </div>

        {rect && (
          <div
            className={`scan-overlay__selection ${!hasSelection ? "scan-overlay__selection--small" : ""}`}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          >
            {hasSelection && <span className="scan-overlay__inner" />}
            {hasSelection && ["tl", "tr", "bl", "br"].map((key) => (
              <span key={key} aria-hidden="true" className={`scan-overlay__handle scan-overlay__handle--${key}`} />
            ))}
            {hasSelection && <span className="scan-overlay__measure">{Math.round(rect.w)} × {Math.round(rect.h)} · {pct}% trang</span>}
            {tooSmall && <span className="scan-overlay__small-note">Kéo rộng thêm để chọn vùng</span>}
          </div>
        )}

        <div className="scan-overlay__actions">
          {rect && (
            <button
              className="scan-overlay__button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setRect(null); setMode(null); startRef.current = null; }}
              aria-label="Chọn lại vùng"
              title="Xóa vùng hiện tại"
            >
              <RotateCcw size={14} /> Chọn lại
            </button>
          )}
          <button
            className="scan-overlay__button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { setRect(null); setMode(null); onCancel?.(); }}
            aria-label="Hủy quét"
            title="Hủy chọn vùng"
          >
            <X size={14} /> Hủy
          </button>
          {hasSelection && (
            <button
              className="scan-overlay__button scan-overlay__button--primary"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelect?.({ ...rect })}
              aria-label="Quét vùng này"
              title="Gửi vùng đã chọn cho AI"
            >
              <Check size={15} /> Quét vùng này
            </button>
          )}
        </div>
      </div>
    </>
  );
}
