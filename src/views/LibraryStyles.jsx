import React from "react";

export default function LibraryStyles() {
  return (
    <style>{`
      .libx-root { display:flex; flex-direction:column; gap:13px; }
      .libx-stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:9px; }
      .libx-stat { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:13px; border:1px solid var(--border-color); background:var(--surface); }
      .libx-stat-ic { width:37px; height:37px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; font-size: 1.0625rem; flex-shrink:0; background:var(--color-action-soft, var(--primary-light)); }
      .libx-stat-val { font-size:1.15rem; font-weight:800; color:var(--text-dark); line-height:1.1; }
      .libx-stat-label { font-size: 0.6563rem; color:var(--text-muted); font-weight:600; }
      .libx-sec-head { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
      .libx-sec-title { margin:0; font-size:0.93rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:7px; }
      .libx-sec-title svg { color:var(--color-action, var(--primary)); }
      .libx-sec-hint { font-size: 0.6875rem; color:var(--text-muted); }
      .libx-strip { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:9px; }
      .libx-cont { display:flex; gap:10px; align-items:center; padding:9px 10px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface); cursor:pointer; }
      .libx-cont:hover { border-color:var(--color-action, var(--primary)); box-shadow:0 6px 16px rgba(15,23,42,0.08); }
      .libx-cont-cover { width:52px; flex-shrink:0; border-radius:7px; overflow:hidden; border:1px solid var(--border-color); }
      .libx-cont-t { font-size:0.83rem; font-weight:700; color:var(--text-dark); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
      .libx-cont-m { font-size: 0.6563rem; color:var(--text-muted); }
      .libx-bar { height:6px; border-radius:99px; background:var(--surface-soft); border:1px solid var(--border-color); overflow:hidden; margin-top:5px; }
      .libx-bar > i { display:block; height:100%; border-radius:99px; background:var(--color-action, var(--primary)); }
      .libx-cta { margin-left:auto; flex-shrink:0; font-size: 0.6875rem; font-weight:800; color:#fff; background:var(--color-action, var(--primary)); padding:6px 11px; border-radius:999px; }
      .libx-hero { display:flex; align-items:center; gap:12px; flex-wrap:wrap; border-radius:13px; padding:12px 15px; color:#fff;
        background:linear-gradient(120deg, var(--color-action-strong, #1e3a8a), var(--color-action, #2563eb) 60%, var(--color-action-active, #1e40af)); }
      .libx-hero h2 { margin:0; font-size:0.92rem; display:flex; align-items:center; gap:7px; }
      .libx-hero p { margin:3px 0 0; font-size: 0.7188rem; opacity:0.92; }
      .libx-toolbar { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 13px; display:flex; flex-direction:column; gap:9px; }
      .libx-trow { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .libx-search { flex:1 1 210px; min-width:170px; position:relative; }
      .libx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid var(--border-color); font-size: 0.8125rem; background:var(--surface); color:var(--text-dark); }
      .libx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-muted); }
      .libx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid var(--border-color); font-size: 0.7813rem; background:var(--surface); color:var(--text-dark); }
      .libx-seg { display:inline-flex; border:1px solid var(--border-color); border-radius:10px; overflow:hidden; }
      .libx-seg button { border:none; background:var(--surface); padding:8px 11px; cursor:pointer; color:var(--text-muted); display:inline-flex; }
      .libx-seg button.active { background:var(--color-action, var(--primary)); color:#fff; }
      .libx-fbtn { font-size: 0.75rem; font-weight:700; padding:6px 11px; border-radius:999px; border:1px solid var(--border-color); background:var(--surface); color:var(--text-dark); cursor:pointer; }
      .libx-fbtn.active { background:var(--color-action, var(--primary)); border-color:var(--color-action, var(--primary)); color:#fff; }
      .libx-count { font-size: 0.75rem; color:var(--text-muted); }
      .libx-count strong { color:var(--text-dark); font-size: 0.8125rem; }
      .libx-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(215px, 1fr)); gap:12px; }
      .libx-book { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; overflow:hidden; cursor:pointer; transition:transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease; display:flex; flex-direction:column; }
      .libx-book:hover { transform:translateY(-3px); box-shadow:0 12px 26px rgba(15,23,42,0.12); border-color:var(--color-action, var(--primary)); }
      .libx-cover { position:relative; background:linear-gradient(135deg, var(--color-action-soft, #dbeafe), #ede9fe); aspect-ratio:1/1; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .libx-cover .book-cover { width:100% !important; height:100% !important; min-height:100%; padding:0 !important; border:none !important; font-size:2rem; }
      .libx-fav { position:absolute; top:8px; right:8px; width:30px; height:30px; border-radius:999px; border:1px solid rgba(255,255,255,0.6); background:rgba(15,23,42,0.35); color:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(4px); }
      .libx-fav.on { background:#f59e0b; border-color:#f59e0b; }
      .libx-grade { position:absolute; left:8px; bottom:8px; font-size: 0.625rem; font-weight:800; color:#fff; background:rgba(15,23,42,0.55); padding:3px 8px; border-radius:999px; backdrop-filter:blur(4px); }
      .libx-body { padding:10px 12px 11px; display:flex; flex-direction:column; gap:6px; flex:1; }
      .libx-title { margin:0; font-size:0.85rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.35em; }
      .libx-meta { font-size: 0.6875rem; color:var(--text-muted); display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .libx-foot { display:flex; gap:6px; align-items:center; margin-top:auto; padding-top:7px; border-top:1px dashed var(--border-color); }
      .libx-open { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size: 0.7813rem; font-weight:800; padding:8px 10px; border-radius:10px; border:none; background:var(--color-action, var(--primary)); color:#fff; cursor:pointer; }
      .libx-open:hover { filter:brightness(1.08); }
      .libx-icobtn { width:32px; height:32px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid var(--border-color); background:var(--surface); color:var(--text-muted); cursor:pointer; }
      .libx-icobtn:hover { border-color:var(--color-action, var(--primary)); color:var(--color-action-strong, var(--primary)); }
      .libx-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
      .libx-row { display:flex; gap:11px; align-items:center; background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:9px 12px; cursor:pointer; }
      .libx-row:hover { border-color:var(--color-action, var(--primary)); }
      .libx-row-cover { width:46px; flex-shrink:0; border-radius:6px; overflow:hidden; border:1px solid var(--border-color); }
      .libx-list { display:flex; flex-direction:column; gap:8px; }
      .libx-pager { display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap:wrap; padding:10px; background:var(--surface); border:1px solid var(--border-color); border-radius:12px; }
      .libx-pager .libx-fbtn { display:inline-flex; align-items:center; gap:4px; }
      .libx-pager .libx-fbtn:disabled { opacity:0.45; cursor:not-allowed; }
      .libx-row { position:relative; }
      .libx-rowmenu-anchor { position:relative; flex-shrink:0; }
      .libx-rowmenu-btn { display:none; }
      .libx-rowmenu {
        position:absolute; right:0; top:calc(100% + 6px); z-index:30; min-width:190px;
        background:var(--surface); border:1px solid var(--border-color); border-radius:12px;
        box-shadow:0 12px 28px rgba(15,23,42,0.16); padding:5px;
      }
      .libx-rowmenu-item {
        display:flex; align-items:center; gap:9px; width:100%; text-align:left;
        border:none; background:transparent; cursor:pointer; font-size: 0.7813rem; font-weight:600;
        color:var(--text-dark); padding:8px 10px; border-radius:8px;
      }
      .libx-rowmenu-item:hover { background:var(--surface-soft); }
      .libx-rowmenu-item.danger { color:#dc2626; }
      .libx-rowmenu-item.danger:hover { background:#fef2f2; }
      .libx-rowmenu-item svg { color:var(--text-muted); flex-shrink:0; }
      .libx-rowmenu-item.danger svg { color:#dc2626; }
      @media (max-width: 640px) {
        .libx-row .libx-hide-mobile { display:none; }
        .libx-rowmenu-btn { display:inline-flex; }
        .libx-row { gap:8px; padding:8px 10px; }
      }
    `}</style>
  );
}
