import React from "react";

export default function QuestionBankStyles() {
  return (
    <style>{`
      .qbx-root { display:flex; flex-direction:column; gap:12px; }
      .qbx-head { background:linear-gradient(135deg, rgba(22,163,74,0.10), rgba(45,115,255,0.06)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:11px; }
      .qbx-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .qbx-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
      .qbx-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #16a34a)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #16a34a) 35%, transparent); }
      .qbx-stats { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
      .qbx-stat { font-size: 0.7188rem; font-weight:700; color:#334155; background:rgba(255,255,255,0.85); border:1px solid #e2e8f0; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
      .qbx-stat.hot { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #bfdbfe); }
      .qbx-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .qbx-search { flex:1 1 200px; min-width:170px; position:relative; }
      .qbx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size: 0.8125rem; background:#fff; }
      .qbx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
      .qbx-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; display:inline-flex; }
      .qbx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size: 0.7813rem; background:#fff; color:#334155; }
      .qbx-actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .qbx-hint { margin:0; font-size: 0.7188rem; color:var(--text-muted); }
      .qbx-selbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; background:var(--color-action-soft, #eff6ff); border:1px solid var(--color-action-soft, #bfdbfe); border-radius:12px; padding:8px 12px; font-size: 0.7813rem; font-weight:700; color:var(--color-action-strong, #1d4ed8); }
      .qbx-list { display:flex; flex-direction:column; gap:9px; }
      .qbx-card { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 12px; display:flex; gap:10px; align-items:flex-start; transition:border-color 0.15s ease, box-shadow 0.15s ease; }
      .qbx-card:hover { border-color:#86efac; box-shadow:0 4px 14px rgba(22,163,74,0.08); }
      .qbx-card.sel { border-color:var(--color-action, #2d73ff); background:linear-gradient(180deg, var(--color-action-soft, rgba(45,115,255,0.05)), rgba(255,255,255,0)); box-shadow:0 4px 14px color-mix(in srgb, var(--color-action, #2d73ff) 14%, transparent); }
      .qbx-check { width:23px; height:23px; border-radius:8px; border:2px solid #cbd5e1; background:#fff; display:inline-flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; flex-shrink:0; margin-top:1px; }
      .qbx-check.on { background:var(--color-action, #16a34a); border-color:var(--color-action, #16a34a); }
      .qbx-num { font-size: 0.6875rem; font-weight:800; color:#94a3b8; min-width:26px; text-align:right; margin-top:4px; }
      .qbx-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:7px; }
      .qbx-q { margin:0; font-size:0.88rem; line-height:1.55; color:var(--text-dark); }
      .qbx-badges { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
      .qbx-badge { font-size: 0.6563rem; font-weight:800; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px; background:#f8fafc; color:#475569; border:1px solid #e2e8f0; }
      .qbx-badge.subj { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #dbeafe); }
      .qbx-badge.lvl { background:#f0fdf4; color:#15803d; border-color:#bbf7d0; }
      .qbx-badge.scan { background:#f0fdfa; color:#0f766e; border-color:#99f6e4; }
      .qbx-opts { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:6px; }
      @media (max-width: 640px) { .qbx-opts { grid-template-columns:1fr; } }
      .qbx-opt { display:flex; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:7px 10px; font-size:0.83rem; line-height:1.45; color:#334155; min-width:0; }
      .qbx-opt b { width:22px; height:22px; border-radius:7px; background:#e2e8f0; color:#475569; display:inline-flex; align-items:center; justify-content:center; font-size: 0.6875rem; flex-shrink:0; }
      .qbx-opt-tx { flex:1; min-width:0; overflow-wrap:anywhere; }
      .qbx-opt.ok { background:#f0fdf4; border-color:#86efac; color:#14532d; font-weight:600; }
      .qbx-opt.ok b { background:#16a34a; color:#fff; }
      .qbx-opt-check { color:#16a34a; flex-shrink:0; }
      .qbx-ans { font-size: 0.75rem; color:#15803d; background:#f0fdf4; border:1px dashed #86efac; border-radius:8px; padding:6px 10px; }
      .qbx-thumb { border-radius:8px; overflow:hidden; border:1px solid var(--border-color); max-width:200px; }
      .qbx-thumb img { width:100%; max-height:100px; object-fit:cover; display:block; }
      .qbx-card-actions { display:flex; flex-direction:column; gap:5px; flex-shrink:0; }
      .qbx-icobtn { width:31px; height:31px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; }
      .qbx-icobtn:hover { border-color:var(--color-action, #16a34a); color:var(--color-action-strong, #15803d); background:var(--color-action-soft, #f0fdf4); }
      .qbx-icobtn.pick.on { background:#16a34a; border-color:#16a34a; color:#fff; }
      .qbx-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
      .qbx-empty { text-align:center; padding:36px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
      .qbx-more { position:relative; }
      .qbx-menu { position:absolute; right:0; top:calc(100% + 6px); background:var(--surface); border:1px solid var(--border-color); border-radius:10px; box-shadow:var(--shadow-md); padding:6px; display:flex; flex-direction:column; gap:5px; min-width:190px; z-index:20; }
    `}</style>
  );
}
