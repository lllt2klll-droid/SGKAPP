// ── Scan Overlay — pointer events rectangle selection (mouse/touch/pen) ──
// Supports: drag-to-create, drag-to-move, 4-corner resize, keyboard, a11y
// Handles zoom/devicePixelRatio via CSS rects — no assumption of image vs canvas
import React, { useState, useRef, useCallback, useEffect } from "react";

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
    <div
      ref={overlayRef}
      className="scan-overlay scan-overlay--refined"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "absolute",
        inset: 0,
        cursor: mode === "move" ? "move" : mode && mode.startsWith("resize") ? (mode.includes("tl") || mode.includes("br") ? "nwse-resize" : "nesw-resize") : "crosshair",
        touchAction: "none",
        zIndex: 30,
        background: rect ? "rgba(15,23,42,0.06)" : "rgba(15,23,42,0.02)",
        userSelect: "none",
        WebkitUserSelect: "none",
        backdropFilter: rect ? "none" : "none",
      }}
      role="region"
      aria-label="Kéo để chọn vùng quét — kéo góc để chỉnh, kéo giữa để di chuyển, double-click chọn toàn trang, ESC để hủy"
      tabIndex={0}
    >
      {/* hint bar — tinh tế: icon + divider + tip phím tắt */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.96)",
          border: "1px solid rgba(226,232,240,1)",
          borderRadius: 999,
          padding: "6px 10px 6px 8px",
          fontSize: 11.5,
          fontWeight: 700,
          color: "#0f172a",
          boxShadow: "0 4px 16px rgba(15,23,42,0.10), 0 1px 2px rgba(15,23,42,0.06)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          backdropFilter: "blur(8px)",
          letterSpacing: 0.1,
        }}
      >
        <span style={{ width:7, height:7, borderRadius:99, background: rect ? "#2d73ff" : "#94a3b8", boxShadow: rect ? "0 0 0 4px rgba(45,115,255,0.15)" : "none", display:"inline-block" }} />
        <span>{rect ? "Kéo góc để chỉnh · kéo giữa để di chuyển" : "Kéo để chọn vùng · đúp để chọn cả trang"}</span>
        <span style={{ width:1, height:14, background:"rgba(226,232,240,1)", display:"inline-block" }} />
        <span style={{ fontWeight:600, color:"#64748b" }}>ESC để hủy</span>
      </div>

      {rect && (
        <div
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            border: `2px solid ${hasSelection ? "#2d73ff" : "#f59e0b"}`,
            background: hasSelection ? "rgba(45,115,255,0.09)" : "rgba(245,158,11,0.10)",
            boxShadow: hasSelection
              ? "0 0 0 1px rgba(45,115,255,0.15), 0 8px 24px rgba(45,115,255,0.18), 0 0 0 9999px rgba(15,23,42,0.32)"
              : "0 0 0 9999px rgba(15,23,42,0.30)",
            borderRadius: 10,
            pointerEvents: "none",
            transition: mode ? "none" : "box-shadow 0.18s ease, background 0.18s ease",
          }}
        >
          {/* subtle dashed inner */}
          {hasSelection && <span style={{ position:"absolute", inset:3, border:"1px dashed rgba(45,115,255,0.35)", borderRadius:8, pointerEvents:"none" }} />}
          {/* corner handles — tinh tế: lớn hơn 1px, bo tròn, đổ bóng */}
          {hasSelection && ["tl","tr","bl","br"].map((k) => (
            <span
              key={k}
              aria-hidden
              style={{
                position: "absolute",
                width: HANDLE + 2, height: HANDLE + 2,
                background: "#fff", border: "2px solid #2d73ff", borderRadius: 999,
                left: k.includes("l") ? -(HANDLE+2)/2 : undefined,
                right: k.includes("r") ? -(HANDLE+2)/2 : undefined,
                top: k.includes("t") ? -(HANDLE+2)/2 : undefined,
                bottom: k.includes("b") ? -(HANDLE+2)/2 : undefined,
                boxShadow: "0 2px 10px rgba(45,115,255,0.28), 0 1px 2px rgba(15,23,42,0.12)",
              }}
            />
          ))}
          {/* dimension badge */}
          {hasSelection && (
            <span style={{
              position:"absolute", left:"50%", top:-22, transform:"translateX(-50%)",
              background:"#0f172a", color:"#fff", fontSize:10, fontWeight:800, letterSpacing:0.3,
              padding:"3px 7px", borderRadius:999, whiteSpace:"nowrap",
              boxShadow:"0 4px 12px rgba(15,23,42,0.22)",
              border:"1px solid rgba(255,255,255,0.14)",
            }}>
              {Math.round(rect.w)}×{Math.round(rect.h)} · {pct}% trang
            </span>
          )}
          {tooSmall && (
            <span style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%,-50%)", background:"rgba(15,23,42,0.78)", color:"#fff", fontSize:11, fontWeight:800, padding:"4px 8px", borderRadius:999, whiteSpace:"nowrap", backdropFilter:"blur(6px)", border:"1px solid rgba(255,255,255,0.12)" }}>
              Vùng quá nhỏ — kéo rộng thêm
            </span>
          )}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, flexWrap:"wrap", justifyContent:"center", pointerEvents:"auto" }}>
        <button
          className="btn btn-ghost btn-xs"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { setRect(null); setMode(null); startRef.current=null; }}
          aria-label="Chọn lại vùng"
          title="Chọn lại (xóa vùng hiện tại)"
          style={{ background:"rgba(255,255,255,0.96)", border:"1px solid rgba(226,232,240,1)", boxShadow:"0 4px 12px rgba(15,23,42,0.08)", borderRadius:999, padding:"6px 10px", fontWeight:700, backdropFilter:"blur(8px)" }}
        >
          Chọn lại
        </button>
        <button
          className="btn btn-ghost btn-xs"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { setRect(null); setMode(null); onCancel?.(); }}
          aria-label="Hủy quét"
          title="Hủy (Esc)"
          style={{ background:"rgba(255,255,255,0.96)", border:"1px solid rgba(226,232,240,1)", boxShadow:"0 4px 12px rgba(15,23,42,0.08)", borderRadius:999, padding:"6px 10px", fontWeight:700, backdropFilter:"blur(8px)" }}
        >
          Hủy
        </button>
        {hasSelection && (
          <button
            className="btn btn-primary btn-xs"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSelect?.({ ...rect })}
            aria-label="Quét vùng này"
            title="Quét vùng này"
            style={{ borderRadius:999, padding:"7px 14px", fontWeight:800, boxShadow:"0 8px 20px rgba(45,115,255,0.28)", letterSpacing:0.2 }}
          >
            ✨ Quét vùng này
          </button>
        )}
      </div>
    </div>
  );
}
