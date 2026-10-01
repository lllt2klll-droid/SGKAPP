import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { appEvents, AppEvents } from "./core/appEvents.js";
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ExternalLink,
  Github,
  Link2,
  Search,
  LayoutGrid,
  X,
  Save,
  ArrowUpDown,
  Sparkles,
  AppWindow,
} from "lucide-react";

import { safeGetJSON, safeSetJSON, safeGetString } from "./safeStorage";

const LS_KEY = "sgk_web_tools";
const LS_ORDER = "sgk_web_tools_order_v1";

function loadTools() {
  const arr = safeGetJSON(LS_KEY, [], Array.isArray);
  return Array.isArray(arr) ? arr : [];
}
function saveTools(arr) {
  const res = safeSetJSON(LS_KEY, arr);
  if (!res.ok) {
    if (res.quota) console.warn("[safeStorage] QuotaExceededError on", LS_KEY, "-", res.message);
    else console.warn("[safeStorage] saveTools failed:", res.error, res.message);
    return false;
  }
  try {
    appEvents.emit(AppEvents.WEBTOOLS_UPDATED, arr);
  } catch (e) {
    console.warn("[WebToolboxView] emit failed", e);
  }
  return true;
}

function getFavicon(url) {
  try {
    const u = new URL(url);
    if (!u.hostname) return "";
    return `https://www.google.com/s2/favicons?domain=${u.hostname.toLowerCase()}&sz=64`;
  } catch {
    return "";
  }
}
function hostnameOf(url) {
  try {
    const u = new URL(url);
    if (!u.hostname) return url;
    return u.hostname.replace(/^www\./i, "");
  } catch { return String(url || "").trim(); }
}
function isGithubUrl(url) { return /github\.com/i.test(url); }

function normalizeUrl(v) {
  let s = String(v || "").trim();
  if (!s) return "";
  // remove zero-width & control chars, collapse inner whitespace
  // oxlint-disable-next-line no-control-regex
  s = s.replace(/[\u200B-\u200D\uFEFF\u0000-\u001F\u007F]/g, "").trim();
  // block dangerous schemes explicitly
  if (/^(javascript|data|blob|file|ftp|mailto|tel):/i.test(s)) return "";
  // protocol-relative //example.com -> https://example.com
  if (s.startsWith("//")) s = "https:" + s;
  else if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  // collapse https:///// -> https://
  s = s.replace(/^(https?:)\/{3,}/i, "$1//");
  // remove spaces inside url (user pasted with spaces)
  s = s.replace(/\s+/g, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname) return "";
    const host = u.hostname.toLowerCase();
    // require dot or localhost or IP for a real web host; avoid single-word "example"
    const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[.*\]$/.test(host) || host.includes(":");
    if (host !== "localhost" && !host.includes(".") && !isIP) return "";
    if (host.length < 1 || host.length > 253) return "";
    // hostname labels must be valid
    if (/^\./.test(host) || /\.$/.test(host) || host.includes("..")) return "";
    // use href normalized; keep search/hash/path as-is
    return u.href;
  } catch { return ""; }
}

function normalizeForCompare(url) {
  try {
    const u = new URL(normalizeUrl(url) || url);
    // origin + pathname without trailing slash, lowercased host, search sorted? keep simple
    let p = u.pathname;
    if (p === "/") p = "";
    // remove trailing slash for comparison
    if (p.endsWith("/") && p.length > 1) p = p.replace(/\/+$/, "");
    return (u.protocol + "//" + u.hostname.toLowerCase() + p + u.search + u.hash).toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase().replace(/\/+$/, "");
  }
}

// default seed tools — only injected once if storage empty
const DEFAULT_TOOLS = [
  { id: "gh", url: "https://github.com", title: "GitHub", color: "#24292f" },
  { id: "mdn", url: "https://developer.mozilla.org", title: "MDN Web Docs", color: "#0168b8" },
  { id: "figma", url: "https://www.figma.com", title: "Figma", color: "#a259ff" },
  { id: "canva", url: "https://www.canva.com", title: "Canva", color: "#00c4cc" },
  { id: "chatgpt", url: "https://chat.openai.com", title: "ChatGPT", color: "#10a37f" },
  { id: "gemini", url: "https://gemini.google.com", title: "Gemini", color: "#8e75ff" },
];

export default function WebToolboxView() {
  const [tools, setTools] = useState(() => {
    const loaded = loadTools();
    if (loaded.length === 0) {
      const seeded = DEFAULT_TOOLS.map((t) => ({
        ...t,
        favicon: getFavicon(t.url),
        createdAt: Date.now(),
      }));
      // defer save to effect
      return seeded;
    }
    // ensure favicon field exists
    return loaded.map((t) => ({ ...t, favicon: t.favicon || getFavicon(t.url) }));
  });
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // tool or null
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formErr, setFormErr] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // persist on change, but avoid double seed write loop
  const firstPersist = useRef(true);
  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      const existing = safeGetJSON(LS_KEY, null, Array.isArray);
      if (existing === null) saveTools(tools);
      return;
    }
    saveTools(tools);
  }, [tools]);

  // listen external updates (if other tab)
  useEffect(() => {
    const h = () => setTools(loadTools());
    window.addEventListener("sgk:webtools-updated", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("sgk:webtools-updated", h); window.removeEventListener("storage", h); };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) =>
      t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q) || hostnameOf(t.url).toLowerCase().includes(q)
    );
  }, [tools, query]);

  const openTool = useCallback((tool) => {
    const url = normalizeUrl(tool.url);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const onAddClick = () => {
    setEditing(null);
    setFormUrl("");
    setFormTitle("");
    setFormErr("");
    setShowModal(true);
  };
  const onEditClick = (tool) => {
    setEditing(tool);
    setFormUrl(tool.url);
    setFormTitle(tool.title);
    setFormErr("");
    setShowModal(true);
  };

  const handleSave = () => {
    const raw = String(formUrl || "").trim();
    if (!raw) { setFormErr("Vui lòng dán URL. Ví dụ: https://github.com/username/repo"); return; }
    const url = normalizeUrl(raw);
    if (!url) { setFormErr("URL không hợp lệ. Chỉ chấp nhận http(s):// — ví dụ: https://github.com/username/repo"); return; }
    try { new URL(url); } catch { setFormErr("URL không hợp lệ."); return; }
    // duplicate check (compare normalized)
    const cmp = normalizeForCompare(url);
    const dup = tools.some((t) => normalizeForCompare(t.url) === cmp && (!editing || t.id !== editing.id));
    if (dup) { setFormErr("Link này đã có trong kho rồi."); return; }
    const titleRaw = formTitle.trim();
    const title = (titleRaw || hostnameOf(url) || "Công cụ").slice(0, 30);
    if (editing) {
      setTools((prev) => prev.map((t) => t.id === editing.id ? { ...t, url, title, favicon: getFavicon(url) } : t));
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setTools((prev) => [...prev, { id, url, title, favicon: getFavicon(url), createdAt: Date.now(), color: "#2563eb" }]);
    }
    setShowModal(false);
    setEditing(null);
    setFormErr("");
  };

  const handleDelete = (tool) => setDeleteConfirm(tool);
  const confirmDelete = () => {
    if (!deleteConfirm) return;
    setTools((prev) => prev.filter((t) => t.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  // Drag & drop reorder (desktop-like grid)
  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    // ghost image tweak — use currentTarget to avoid child target
    const el = e.currentTarget;
    setTimeout(() => { if (el) el.style.opacity = "0.4"; }, 0);
  };
  const onDragEnd = (e) => {
    const el = e.currentTarget || e.target;
    if (el && el.style) el.style.opacity = "";
    setDragId(null);
    setDragOverId(null);
  };
  const onDragOver = (e, overId) => {
    e.preventDefault();
    if (dragId && dragId !== overId) setDragOverId(overId);
  };
  const onDragLeave = () => setDragOverId(null);
  const onDrop = (e, overId) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain") || dragId;
    if (!fromId || fromId === overId) { setDragOverId(null); return; }
    setTools((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === fromId);
      const toIdx = prev.findIndex((t) => t.id === overId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const arr = [...prev];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
    setDragOverId(null);
    setDragId(null);
  };
  // also support dropping on empty grid area -> move to end
  const onGridDrop = (e) => {
    if (e.target !== e.currentTarget) return;
    const fromId = e.dataTransfer.getData("text/plain") || dragId;
    if (!fromId) return;
    e.preventDefault();
    setTools((prev) => {
      const idx = prev.findIndex((t) => t.id === fromId);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const arr = [...prev];
      const [m] = arr.splice(idx, 1);
      arr.push(m);
      return arr;
    });
  };

  const handleResetOrder = () => {
    setTools((prev) => [...prev].sort((a,b) => (a.createdAt||0) - (b.createdAt||0)));
  };

  return (
    <div className="webtoolbox-view">
      {/* Header */}
      <div className="wt-header">
        <div className="wt-header-left">
          <div className="wt-iconBox" aria-hidden="true"><AppWindow size={22} /></div>
          <div>
            <h1 className="wt-title">Kho Công cụ Web</h1>
            <p className="wt-subtitle">Kho link của bạn — mở nhanh như desktop • kéo thả để sắp xếp • ô vuông ~2cm</p>
          </div>
        </div>
        <div className="wt-header-actions">
          <div className="wt-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
              placeholder="Tìm tên, link..."
              aria-label="Tìm công cụ"
            />
            {query && <button className="wt-search-clear" onClick={()=>setQuery("")} aria-label="Xóa tìm kiếm"><X size={12}/></button>}
          </div>
          <span className="wt-count">{filtered.length} công cụ</span>
          <button className="btn btn-secondary btn-sm" onClick={handleResetOrder} title="Sắp lại theo thời gian thêm"><ArrowUpDown size={14}/> Sắp xếp</button>
          <button className="btn btn-primary" onClick={onAddClick}><Plus size={16}/> Thêm Link</button>
        </div>
      </div>

      {/* Info bar */}
      <div className="wt-info">
        <span><Sparkles size={12}/> Mẹo: Kéo thả ô vuông để đổi chỗ • Click để mở link trong tab mới • Di chuột để sửa/xóa</span>
        <span className="wt-info-size">◫ 76–88px / ô (~2cm)</span>
      </div>

      {/* Grid — desktop-like */}
      <div
        className="wt-grid"
        role="grid"
        aria-label="Kho công cụ"
        onDragOver={(e)=>e.preventDefault()}
        onDrop={onGridDrop}
      >
        {filtered.map((tool) => {
          const isDragged = dragId === tool.id;
          const isOver = dragOverId === tool.id;
          return (
            <div
              key={tool.id}
              className={`wt-tile ${isDragged ? "dragging" : ""} ${isOver ? "drag-over" : ""}`}
              draggable
              onDragStart={(e)=>onDragStart(e, tool.id)}
              onDragEnd={onDragEnd}
              onDragOver={(e)=>onDragOver(e, tool.id)}
              onDragLeave={onDragLeave}
              onDrop={(e)=>onDrop(e, tool.id)}
              role="gridcell"
              title={`${tool.title}\n${tool.url}`}
            >
              {/* drag handle */}
              <div className="wt-tile-handle" aria-hidden="true"><GripVertical size={12}/></div>

              {/* actions on hover */}
              <div className="wt-tile-actions">
                <button className="wt-tile-btn" onClick={(e)=>{e.stopPropagation(); onEditClick(tool);}} title="Sửa" aria-label={`Sửa ${tool.title}`}><Pencil size={12}/></button>
                <button className="wt-tile-btn danger" onClick={(e)=>{e.stopPropagation(); handleDelete(tool);}} title="Xóa" aria-label={`Xóa ${tool.title}`}><Trash2 size={12}/></button>
              </div>

              {/* main clickable area */}
              <button
                className="wt-tile-main"
                onClick={()=>openTool(tool)}
                aria-label={`Mở ${tool.title}`}
              >
                <div className="wt-tile-icon">
                  {isGithubUrl(tool.url) ? (
                    <Github size={26} />
                  ) : tool.favicon ? (
                    <img src={tool.favicon} alt="" width={28} height={28} loading="lazy" onError={(e)=>{ e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }} />
                  ) : null}
                  <span className="wt-tile-fallback" style={{ display: isGithubUrl(tool.url) ? 'none' : (tool.favicon ? 'none' : 'flex') }}><Globe size={22}/></span>
                </div>
                <div className="wt-tile-label" title={tool.title}>{tool.title}</div>
                <div className="wt-tile-host">{hostnameOf(tool.url)}</div>
                <span className="wt-tile-open"><ExternalLink size={10}/> Mở</span>
              </button>
            </div>
          );
        })}

        {/* Add tile — always last, not draggable */}
        <button className="wt-tile wt-tile-add" onClick={onAddClick} aria-label="Thêm Link mới">
          <div className="wt-tile-add-inner">
            <div className="wt-tile-add-icon"><Plus size={24}/></div>
            <div className="wt-tile-label">Thêm Link</div>
            <div className="wt-tile-host">Dán URL GitHub / web</div>
          </div>
        </button>

        {filtered.length === 0 && query && (
          <div className="wt-empty-search" role="status">
            <Search size={18}/>
            <p>Không tìm thấy “{query}”</p>
            <button className="btn btn-ghost btn-sm" onClick={()=>setQuery("")}>Xóa lọc</button>
          </div>
        )}
      </div>

      {tools.length === 0 && !query && (
        <div className="wt-empty">
          <AppWindow size={32}/>
          <h3>Kho trống</h3>
          <p>Thêm link GitHub hoặc bất kỳ trang web nào — chúng sẽ hiện như ô vuông trên desktop.</p>
          <button className="btn btn-primary" onClick={onAddClick}><Plus size={16}/> Thêm Link đầu tiên</button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay wt-modal-overlay" onClick={()=>setShowModal(false)} role="dialog" aria-modal="true" aria-labelledby="wt-modal-title">
          <div className="modal-content wt-modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="wt-modal-title">{editing ? "Sửa Link" : "Thêm Link mới"}</h2>
              <button className="btn btn-ghost btn-xs" onClick={()=>setShowModal(false)} aria-label="Đóng"><X size={16}/></button>
            </div>
            <div className="wt-modal-body">
              <div className="wt-preview-hint">
                <Link2 size={14}/> Link sẽ mở ở tab mới (như click vào GitHub) • Icon tự lấy favicon
              </div>
              <label className="form-label" htmlFor="wt-url">Link URL <span style={{color:'var(--danger)'}}>*</span></label>
              <input
                id="wt-url"
                className="form-control"
                value={formUrl}
                onChange={(e)=>{ setFormUrl(e.target.value); if (formErr) setFormErr(""); }}
                placeholder="https://github.com/username/repo hoặc https://..."
                autoFocus
                onKeyDown={(e)=>{ if(e.key==="Enter") handleSave(); if(e.key==="Escape") setShowModal(false); }}
              />
              <label className="form-label" htmlFor="wt-title" style={{marginTop: '0.7rem'}}>Tên hiển thị (ô vuông)</label>
              <input
                id="wt-title"
                className="form-control"
                value={formTitle}
                onChange={(e)=>setFormTitle(e.target.value)}
                placeholder="VD: GitHub Của Tôi, Công cụ AI..."
                maxLength={30}
                onKeyDown={(e)=>{ if(e.key==="Enter") handleSave(); if(e.key==="Escape") setShowModal(false); }}
              />
              {formTitle.length > 0 && <div style={{fontSize:'0.7rem', color:'var(--text-muted)', marginTop:2}}>{formTitle.length}/30</div>}

              {formUrl && (
                <div className="wt-url-preview">
                  <img src={getFavicon(normalizeUrl(formUrl) || formUrl)} alt="" width={18} height={18} onError={(e)=>e.currentTarget.style.display='none'} />
                  <span className="wt-url-preview-host">{hostnameOf(normalizeUrl(formUrl) || formUrl)}</span>
                  <span className="wt-url-preview-url">{normalizeUrl(formUrl) || formUrl}</span>
                </div>
              )}

              {formErr && <div className="wt-form-err" role="alert">{formErr}</div>}

              <div className="wt-modal-actions">
                <button className="btn btn-ghost" onClick={()=>setShowModal(false)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleSave}><Save size={14}/> {editing ? "Lưu" : "Thêm"}</button>
              </div>

              <div className="wt-modal-tips">
                <strong>Gợi ý nhanh:</strong> Dán link GitHub, Figma, Canva, Vercel... rồi đặt tên ngắn gọn để ô vuông gọn đẹp (2 dòng).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={()=>setDeleteConfirm(null)} role="alertdialog" aria-modal="true" aria-labelledby="wt-del-title">
          <div className="modal-content" onClick={(e)=>e.stopPropagation()} onKeyDown={(e)=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); setDeleteConfirm(null); } }} style={{maxWidth:420}}>
            <div className="modal-header"><h2 id="wt-del-title">Xóa công cụ?</h2><button className="btn btn-ghost btn-xs" onClick={()=>setDeleteConfirm(null)} aria-label="Đóng"><X size={16}/></button></div>
            <div style={{padding:'1rem 1.1rem'}}>
              <p className="text-body-sm">Xóa <strong>“{deleteConfirm.title}”</strong> khỏi kho? Không thể hoàn tác.</p>
              <div style={{display:'flex',gap:'0.5rem',justifyContent:'flex-end',marginTop:'1rem'}}>
                <button className="btn btn-ghost" onClick={()=>setDeleteConfirm(null)} autoFocus>Hủy</button>
                <button className="btn btn-danger" onClick={confirmDelete}><Trash2 size={14}/> Xóa</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

