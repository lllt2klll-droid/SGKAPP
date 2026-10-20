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
  X,
  Save,
  ArrowUpDown,
  Sparkles,
  AppWindow,
  Pin,
  Keyboard,
} from "lucide-react";

import { safeGetJSON, safeSetJSON } from "./safeStorage";
import { checkLinkStatus, countFailedLink } from "./webtoolsCheck";
import { CATEGORIES, CATEGORY_LABEL, inferCategory, normalizeCategory } from "./webtoolsCategory";
import { pickExternalTools } from "./webtoolsSync";

const LS_KEY = "sgk_web_tools";
const LS_ORDER = "sgk_web_tools_order_v1";

// Chuẩn hoá 1 tool: bổ sung category/pinned/favicon nếu thiếu (migrate dữ liệu cũ).
function normalizeTool(t) {
  if (!t || typeof t !== "object") return null;
  const category = normalizeCategory(t.category, t.url);
  return { ...t, category, pinned: !!t.pinned, favicon: t.favicon || getFavicon(t.url) };
}

function loadTools() {
  const arr = safeGetJSON(LS_KEY, [], Array.isArray);
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeTool).filter(Boolean);
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
  { id: "gh", url: "https://github.com", title: "GitHub", category: "dev" },
  { id: "mdn", url: "https://developer.mozilla.org", title: "MDN Web Docs", category: "dev" },
  { id: "figma", url: "https://www.figma.com", title: "Figma", category: "design" },
  { id: "canva", url: "https://www.canva.com", title: "Canva", category: "design" },
  { id: "chatgpt", url: "https://chat.openai.com", title: "ChatGPT", category: "ai" },
  { id: "gemini", url: "https://gemini.google.com", title: "Gemini", category: "ai" },
];

export default function WebToolboxView() {
  const [tools, setTools] = useState(() => {
    const loaded = loadTools();
    if (loaded.length === 0) {
      const seeded = DEFAULT_TOOLS.map((t) => normalizeTool({
        ...t,
        favicon: getFavicon(t.url),
        createdAt: Date.now(),
      })).filter(Boolean);
      // defer save to effect
      return seeded;
    }
    // ensure favicon/category fields exist (normalizeTool đã lo)
    return loaded;
  });
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("all"); // "all" | "pinned" | categoryId
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // tool or null
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("other");
  const [formErr, setFormErr] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const catTouchedRef = useRef(false);
  const searchRef = useRef(null);
  const gridRef = useRef(null);

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

  // P2 • nghe bus thay cho window listener trực tiếp (đúng kiến trúc appEvents;
  // WEBTOOLS_UPDATED đã trong whitelist cross-tab nên tab khác đổi là tab này biết).
  // CHỐNG VÒNG LẶP: saveTools() phát event ĐỒNG BỘ ngay trong effect [tools] →
  // nếu loadTools() trả nội dung trùng (chính mình vừa ghi) thì giữ nguyên prev
  // (reference) để React bailout — không render → không save → không emit tiếp.
  // Trước đây: echo luôn là mảng MỚI → effect chạy lại → 900+ ghi/2s, treo tab.
  useEffect(() => {
    const h = () => setTools((prev) => {
      let next;
      try { next = loadTools(); } catch { return prev; }
      return pickExternalTools(prev, next);
    });
    let off1 = null, off2 = null;
    try { off1 = appEvents.on(AppEvents.WEBTOOLS_UPDATED, h); } catch {}
    // DATA_UPDATED domain webtools (P0) + backup-import không kèm domain (storage.js)
    try { off2 = appEvents.on(AppEvents.DATA_UPDATED, (d) => { if (!d || d.domain === "webtools" || d.source === "backup-import") h(); }); } catch {}
    return () => { try { if (off1) off1(); } catch {} try { if (off2) off2(); } catch {} };
  }, []);

  // P2 • kiểm tra link chết (session-only, không ghi storage — mạng đổi là check lại)
  const [linkStatus, setLinkStatus] = useState({}); // { [id]: "checking" | "ok" | "fail" }
  const [checkingAll, setCheckingAll] = useState(false);
  const checkCancelRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; checkCancelRef.current = true; }, []);
  const failCount = useMemo(() => countFailedLink(linkStatus), [linkStatus]);

  const checkOne = useCallback(async (tool) => {
    if (mountedRef.current) setLinkStatus((prev) => ({ ...prev, [tool.id]: "checking" }));
    let r;
    try { r = await checkLinkStatus(tool.url); } catch { r = { ok: false }; }
    if (!mountedRef.current || checkCancelRef.current) return !!(r && r.ok);
    setLinkStatus((prev) => ({ ...prev, [tool.id]: r && r.ok ? "ok" : "fail" }));
    return !!(r && r.ok);
  }, []);

  const checkAllLinks = useCallback(async () => {
    if (checkingAll) return;
    checkCancelRef.current = false;
    setCheckingAll(true);
    for (const t of tools) {
      if (checkCancelRef.current || !mountedRef.current) break;
      await checkOne(t);
    }
    if (mountedRef.current) setCheckingAll(false);
  }, [checkingAll, checkOne, tools]);

  const stopChecking = useCallback(() => { checkCancelRef.current = true; }, []);

  // ── Đếm theo nhóm (chip lọc) ──────────────────────────────────────
  const catCounts = useMemo(() => {
    const m = {};
    for (const t of tools) {
      const c = CATEGORY_LABEL[t.category] ? t.category : "other";
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }, [tools]);
  const pinnedCount = useMemo(() => tools.filter((t) => t.pinned).length, [tools]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tools;
    if (activeCat === "pinned") list = list.filter((t) => t.pinned);
    else if (activeCat !== "all") list = list.filter((t) => (CATEGORY_LABEL[t.category] ? t.category : "other") === activeCat);
    if (q) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q) || hostnameOf(t.url).toLowerCase().includes(q)
      );
    }
    // Ghim lên đầu, phần còn lại giữ nguyên thứ tự kéo thả (sort ổn định)
    return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [tools, query, activeCat]);

  const openTool = useCallback((tool) => {
    const url = normalizeUrl(tool.url);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const togglePin = useCallback((id) => {
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  }, []);

  // ── Bàn phím: '/' focus tìm kiếm (chỉ khi đang ở view này) ─────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      // Modal Thêm/Sửa đang mở → "/" phải giữ nguyên (không đánh cắp focus ra ô tìm kiếm phía sau)
      if (document.querySelector(".wt-modal-overlay")) return;
      const t = document.activeElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Bàn phím: mũi tên điều hướng ô vuông như desktop ──────────────
  const handleGridKeyDown = useCallback((e) => {
    const navKeys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!navKeys.includes(e.key)) return;
    const nodes = gridRef.current ? Array.from(gridRef.current.querySelectorAll('[data-wt-cell="1"]')) : [];
    if (!nodes.length) return;
    const active = document.activeElement;
    const i = nodes.findIndex((n) => n === active || n.contains(active));
    if (i === -1) return;
    e.preventDefault();
    // số cột = số ô nằm cùng hàng đầu
    const firstTop = nodes[0].offsetTop;
    const cols = Math.max(1, nodes.filter((n) => Math.abs(n.offsetTop - firstTop) < 2).length || 1);
    let ni = i;
    if (e.key === "ArrowRight") ni = i + 1;
    else if (e.key === "ArrowLeft") ni = i - 1;
    else if (e.key === "ArrowDown") ni = i + cols;
    else if (e.key === "ArrowUp") ni = i - cols;
    else if (e.key === "Home") ni = 0;
    else if (e.key === "End") ni = nodes.length - 1;
    ni = Math.max(0, Math.min(nodes.length - 1, ni));
    nodes[ni].focus();
  }, []);

  const onAddClick = () => {
    setEditing(null);
    setFormUrl("");
    setFormTitle("");
    setFormCategory("other");
    catTouchedRef.current = false;
    setFormErr("");
    setShowModal(true);
  };
  const onEditClick = (tool) => {
    setEditing(tool);
    setFormUrl(tool.url);
    setFormTitle(tool.title);
    setFormCategory(CATEGORY_LABEL[tool.category] ? tool.category : "other");
    catTouchedRef.current = true;
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
    const category = CATEGORY_LABEL[formCategory] ? formCategory : "other";
    if (editing) {
      setTools((prev) => prev.map((t) => t.id === editing.id ? { ...t, url, title, category, favicon: getFavicon(url) } : t));
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setTools((prev) => [...prev, { id, url, title, category, pinned: false, favicon: getFavicon(url), createdAt: Date.now() }]);
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

  // ── Escape đóng modal Thêm/Sửa hoặc dialog Xóa dù focus ở đâu ──────
  // (input có handler riêng nhưng chỉ khi focus nằm trong modal; Tab có thể
  //  thoát ra sau sau vì view này không có focus trap → nghe ở window cho chắc).
  // Bỏ qua khi overlay của Cài đặt / Ctrl+K đang mở phía trên.
  useEffect(() => {
    if (!showModal && !deleteConfirm) return;
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".st-modal, .global-search-overlay")) return;
      e.preventDefault();
      e.stopPropagation();
      if (deleteConfirm) setDeleteConfirm(null);
      else setShowModal(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showModal, deleteConfirm]);

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

  const visibleCats = useMemo(
    () => CATEGORIES.filter((c) => catCounts[c.id] > 0),
    [catCounts]
  );

  return (
    <div className="webtoolbox-view">
      {/* Header */}
      <div className="wt-header">
        <div className="wt-header-left">
          <div className="wt-iconBox" aria-hidden="true"><AppWindow size={22} /></div>
          <div>
            <h1 className="wt-title">Kho Công cụ Web</h1>
            <p className="wt-subtitle">Kho link của bạn — mở nhanh như desktop • phân nhóm &amp; ghim ô hay dùng • kéo thả để sắp xếp</p>
          </div>
        </div>
        <div className="wt-header-actions">
          <div className="wt-search">
            <Search size={14} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==="Escape" && query){ e.stopPropagation(); setQuery(""); } }}
              placeholder="Tìm tên, link..."
              aria-label="Tìm công cụ"
            />
            {query
              ? <button className="wt-search-clear" onClick={()=>setQuery("")} aria-label="Xóa tìm kiếm"><X size={12}/></button>
              : <kbd className="wt-search-kbd" title="Nhấn / để tìm nhanh">/</kbd>}
          </div>
          <span className="wt-count">{filtered.length} công cụ</span>
          {failCount > 0 && <span className="wt-count" title="Số link kiểm tra lỗi — nên sửa hoặc xóa">⚠️ {failCount} lỗi</span>}
          {checkingAll
            ? <button className="btn btn-secondary btn-sm" onClick={stopChecking} title="Dừng kiểm tra"><X size={14}/> Dừng</button>
            : <button className="btn btn-secondary btn-sm" onClick={checkAllLinks} title="Mở thử từng link, gắn cờ link chết — chỉ kiểm tra, không sửa gì"><Link2 size={14}/> Kiểm tra link</button>}
          <button className="btn btn-secondary btn-sm" onClick={handleResetOrder} title="Sắp lại theo thời gian thêm"><ArrowUpDown size={14}/> Sắp xếp</button>
          <button className="btn btn-primary" onClick={onAddClick}><Plus size={16}/> Thêm Link</button>
        </div>
      </div>

      {/* Category filter bar */}
      <div className="wt-catbar" role="toolbar" aria-label="Lọc theo nhóm">
        <button
          className={"filter-btn" + (activeCat === "all" ? " active" : "")}
          onClick={() => setActiveCat("all")}
          aria-pressed={activeCat === "all"}
        >
          Tất cả <span className="wt-cat-n">{tools.length}</span>
        </button>
        {pinnedCount > 0 && (
          <button
            className={"filter-btn" + (activeCat === "pinned" ? " active" : "")}
            onClick={() => setActiveCat("pinned")}
            aria-pressed={activeCat === "pinned"}
            title="Chỉ hiện công cụ đã ghim"
          >
            <Pin size={12} /> Ghim <span className="wt-cat-n">{pinnedCount}</span>
          </button>
        )}
        {visibleCats.map((c) => (
          <button
            key={c.id}
            className={"filter-btn" + (activeCat === c.id ? " active" : "")}
            onClick={() => setActiveCat(c.id)}
            aria-pressed={activeCat === c.id}
          >
            {c.label} <span className="wt-cat-n">{catCounts[c.id]}</span>
          </button>
        ))}
      </div>

      {/* Info bar */}
      <div className="wt-info">
        <span><Sparkles size={12}/> Kéo thả ô để đổi chỗ • Click ô để mở tab mới • <Pin size={11}/> ghim ô hay dùng lên đầu</span>
        <span className="wt-info-size"><Keyboard size={11}/> Mũi tên di chuyển • / để tìm</span>
      </div>

      {/* Grid — desktop-like */}
      <div
        className="wt-grid"
        role="grid"
        aria-label="Kho công cụ"
        ref={gridRef}
        onKeyDown={handleGridKeyDown}
        onDragOver={(e)=>e.preventDefault()}
        onDrop={onGridDrop}
      >
        {filtered.map((tool) => {
          const isDragged = dragId === tool.id;
          const isOver = dragOverId === tool.id;
          return (
            <div
              key={tool.id}
              className={`wt-tile ${tool.pinned ? "is-pinned" : ""} ${isDragged ? "dragging" : ""} ${isOver ? "drag-over" : ""}`}
              draggable
              onDragStart={(e)=>onDragStart(e, tool.id)}
              onDragEnd={onDragEnd}
              onDragOver={(e)=>onDragOver(e, tool.id)}
              onDragLeave={onDragLeave}
              onDrop={(e)=>onDrop(e, tool.id)}
              role="gridcell"
              title={`${tool.title}\n${tool.url}\nNhóm: ${CATEGORY_LABEL[tool.category] || "Khác"}${tool.pinned ? " • Đã ghim" : ""}`}
            >
              {/* drag handle */}
              <div className="wt-tile-handle" aria-hidden="true"><GripVertical size={12}/></div>
              {/* ghim: huy hiệu cố định khi ô được ghim */}
              {tool.pinned && (
                <span className="wt-tile-pinmark" aria-hidden="true"><Pin size={10}/></span>
              )}
              {/* P2 • cờ kiểm tra link: xanh = tới được, đỏ = chết, xám xoay = đang check */}
              {linkStatus[tool.id] && linkStatus[tool.id] !== "checking" && (
                <span
                  className="wt-tile-linkflag"
                  title={linkStatus[tool.id] === "ok" ? "Link mở được (kiểm tra lúc này)" : "Link lỗi/không mở được — nên sửa hoặc xóa"}
                  style={{
                    position: "absolute", left: 6, bottom: 6, width: 10, height: 10,
                    borderRadius: 999, background: linkStatus[tool.id] === "ok" ? "#16a34a" : "#dc2626",
                    border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", zIndex: 2,
                  }}
                />
              )}

              {/* actions on hover */}
              <div className="wt-tile-actions">
                <button
                  className={"wt-tile-btn" + (tool.pinned ? " active" : "")}
                  onClick={(e)=>{e.stopPropagation(); togglePin(tool.id);}}
                  title={tool.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
                  aria-label={tool.pinned ? `Bỏ ghim ${tool.title}` : `Ghim ${tool.title}`}
                  aria-pressed={!!tool.pinned}
                ><Pin size={12}/></button>
                <button className="wt-tile-btn" onClick={(e)=>{e.stopPropagation(); onEditClick(tool);}} title="Sửa" aria-label={`Sửa ${tool.title}`}><Pencil size={12}/></button>
                <button className="wt-tile-btn danger" onClick={(e)=>{e.stopPropagation(); handleDelete(tool);}} title="Xóa" aria-label={`Xóa ${tool.title}`}><Trash2 size={12}/></button>
              </div>

              {/* main clickable area */}
              <button
                className="wt-tile-main"
                data-wt-cell="1"
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
        <button className="wt-tile wt-tile-add" data-wt-cell="1" onClick={onAddClick} aria-label="Thêm Link mới">
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

        {filtered.length === 0 && !query && activeCat !== "all" && (
          <div className="wt-empty-search" role="status">
            <Pin size={18}/>
            <p>Không có công cụ trong nhóm “{activeCat === "pinned" ? "Đã ghim" : (CATEGORY_LABEL[activeCat] || "Khác")}”</p>
            <button className="btn btn-ghost btn-sm" onClick={()=>setActiveCat("all")}>Xem tất cả</button>
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
          <div className="modal-content wt-modal" onClick={(e)=>e.stopPropagation()}
             onKeyDown={(e)=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); setShowModal(false); } }}>
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
                onChange={(e)=>{
                  const v = e.target.value;
                  setFormUrl(v);
                  if (formErr) setFormErr("");
                  if (!editing && !catTouchedRef.current) setFormCategory(inferCategory(normalizeUrl(v) || v));
                }}
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

              <label className="form-label" style={{marginTop: '0.7rem'}}>Nhóm công cụ</label>
              <div className="wt-cat-picker" role="radiogroup" aria-label="Chọn nhóm công cụ">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={"filter-btn" + (formCategory === c.id ? " active" : "")}
                    onClick={()=>{ catTouchedRef.current = true; setFormCategory(c.id); }}
                    role="radio"
                    aria-checked={formCategory === c.id}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

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
                <strong>Gợi ý nhanh:</strong> Dán link GitHub, Figma, Canva, Vercel... rồi đặt tên ngắn gọn và chọn nhóm để ô vuông gọn đẹp, lọc nhanh về sau.
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
