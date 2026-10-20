import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { safeGetJSON, safeSetJSON } from "./safeStorage";

// Unified DataTable — used for structured record lists
// API: <DataTable columns={[{key,label,width,align,sortable,sortValue,render,hideOnMobile}]} data={[]} keyField="id" emptyText="" resizableId="" resizable={true} pageSize={50} />
export default function DataTable({
  columns = [],
  data = [],
  keyField = "id",
  emptyText = "Chưa có dữ liệu",
  emptyHint = "",
  emptyAction = null,
  onRowClick,
  loading = false,
  skeletonRows = 4,
  sortBy: controlledSortBy,
  sortDir: controlledSortDir,
  onSort,
  compact = false,
  resizable = true,
  resizableId = "",
  pageSize = 50,
  showPagination = true,
}) {
  const [innerSort, setInnerSort] = useState({ key: null, dir: "asc" });
  const isControlled = controlledSortBy !== undefined;
  const sortBy = isControlled ? controlledSortBy : innerSort.key;
  const sortDir = isControlled ? controlledSortDir : innerSort.dir;

  const sortableColumns = useMemo(() => new Set(columns.filter(c=>c.sortable).map(c=>c.key)), [columns]);

  // ── Resizable columns ────────────────────────────────────────
  const storageKey = useMemo(() => {
    if (!resizable) return null;
    if (resizableId) return `sgk_colw_${resizableId}`;
    // fallback: hash columns keys so same table reuses widths across mounts
    const h = columns.map(c=>c.key).join("|");
    let hash = 0; for(let i=0;i<h.length;i++) hash = ((hash<<5)-hash)+h.charCodeAt(i)|0;
    return `sgk_colw_auto_${Math.abs(hash)}`;
  }, [resizable, resizableId, columns]);

  const [colWidths, setColWidths] = useState(() => {
    if (!resizable || !storageKey) return {};
    try {
      const parsed = safeGetJSON(storageKey, null, (v) => v && typeof v === "object" && !Array.isArray(v));
      if (parsed && typeof parsed === "object") return parsed;
    } catch (e) { console.warn("[DataTable] safeGetJSON failed", storageKey, e); }
    const init = {};
    columns.forEach(c=>{
      if(c.width){
        const n = parseInt(String(c.width),10);
        if(Number.isFinite(n) && n>0) init[c.key]=n;
      }
    });
    return init;
  });

  useEffect(()=>{
    if(!resizable || !storageKey) return;
    // keep widths in sync if columns change (add new col defaults)
    setColWidths(prev=>{
      const next={...prev};
      columns.forEach(c=>{
        if(!(c.key in next) && c.width){
          const n=parseInt(String(c.width),10);
          if(Number.isFinite(n) && n>0) next[c.key]=n;
        }
      });
      return next;
    });
  }, [columns, resizable, storageKey]);

  useEffect(()=>{
    if(!resizable || !storageKey) return;
    try {
      const res = safeSetJSON(storageKey, colWidths);
      if (!res.ok && res.quota) console.warn("[safeStorage] QuotaExceededError on", storageKey, res.message);
      else if (!res.ok) console.warn("[DataTable] safeSetJSON failed", storageKey, res.message);
    } catch (e) { console.warn("[DataTable] safeSetJSON exception", storageKey, e); }
  }, [colWidths, storageKey, resizable]);

  const dragRef = useRef(null);
  const draggingKeyRef = useRef(null);
  const [, forceTick] = useState(0);

  const onColResizeStart = useCallback((e, key)=>{
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.parentElement;
    if(!th) return;
    const startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const startW = colWidths[key] != null ? colWidths[key] : th.offsetWidth;
    dragRef.current = { key, startX, startW };
    draggingKeyRef.current = key;
    forceTick(v=>v+1);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev)=>{
      if(!dragRef.current) return;
      const curX = ev.clientX ?? (ev.touches && ev.touches[0]?.clientX) ?? 0;
      const delta = curX - dragRef.current.startX;
      const nw = Math.max(64, Math.min(900, dragRef.current.startW + delta));
      setColWidths(prev=> ({...prev, [dragRef.current.key]: Math.round(nw)}));
    };
    const onUp = ()=>{
      dragRef.current = null;
      draggingKeyRef.current = null;
      forceTick(v=>v+1);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive:false });
    window.addEventListener("touchend", onUp);
  }, [colWidths]);

  const onColResizeDblClick = useCallback((key)=>{
    setColWidths(prev=>{
      const n={...prev}; delete n[key]; return n;
    });
  }, []);

  const getColWidth = useCallback((col)=>{
    const w = colWidths[col.key];
    if(w != null) return `${w}px`;
    if(col.width) return col.width;
    return undefined;
  }, [colWidths]);

  const handleSort = (key) => {
    if (!sortableColumns.has(key)) return;
    if (onSort) {
      const nextDir = sortBy === key && sortDir === "asc" ? "desc" : "asc";
      onSort(key, nextDir);
      return;
    }
    setInnerSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  };

  const sortedData = useMemo(() => {
    if (onSort) return data; // controlled — parent sorts
    if (!sortBy || !sortableColumns.has(sortBy)) return data;
    const col = columns.find(c=>c.key===sortBy);
    const arr = [...data];
    // Trích text từ React node để sort không thành "[object Object]"
    const textOf = (v) => {
      if (v == null || typeof v === "boolean") return "";
      if (typeof v === "string" || typeof v === "number") return v;
      if (Array.isArray(v)) return v.map(textOf).join(" ");
      if (typeof v === "object" && "props" in v) {
        return textOf(v.props?.children);
      }
      try { return String(v); } catch { return ""; }
    };
    const valOf = (row) => {
      if (col && typeof col.sortValue === "function") {
        try { return col.sortValue(row); } catch { return ""; }
      }
      if (col && typeof col.sortKey === "string") return row[col.sortKey];
      return row[sortBy];
    };
    arr.sort((a,b)=>{
      const va = valOf(a);
      const vb = valOf(b);
      if (va==null && vb==null) return 0;
      if (va==null) return 1;
      if (vb==null) return -1;
      // numeric
      if (typeof va==="number" && typeof vb==="number") return sortDir==="asc" ? va - vb : vb - va;
      // date-ish
      const da = va instanceof Date ? va.getTime() : Date.parse(va);
      const db = vb instanceof Date ? vb.getTime() : Date.parse(vb);
      if (Number.isFinite(da) && Number.isFinite(db) && typeof va === "string" && typeof vb === "string" && /^\d{4}-\d{2}-\d{2}/.test(va) && /^\d{4}-\d{2}-\d{2}/.test(vb)) {
        return sortDir==="asc" ? da - db : db - da;
      }
      const cmp = String(textOf(va)).localeCompare(String(textOf(vb)), "vi", { sensitivity: "base", numeric: true });
      return sortDir==="asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortBy, sortDir, columns, sortableColumns, onSort]);

  // ── Pagination (trước đây render hết 2000 rows là sập) ─────────────
  const effectivePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 50;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((sortedData?.length || 0) / effectivePageSize));
  useEffect(() => {
    // Reset về trang 1 khi data/sort đổi; kẹp trang hiện tại
    setPage((p) => (p > totalPages ? totalPages : 1));
  }, [sortedData?.length, sortBy, sortDir, totalPages]);
  const pagedData = useMemo(() => {
    if (!showPagination || !sortedData) return sortedData;
    if (sortedData.length <= effectivePageSize) return sortedData;
    const start = (page - 1) * effectivePageSize;
    return sortedData.slice(start, start + effectivePageSize);
  }, [sortedData, page, effectivePageSize, showPagination]);

  if (loading) {
    return (
      <div className="data-table-wrap">
        <div className="data-table-scroller">
          <table className={"data-table" + (compact ? " compact" : "") + (resizable ? " resizable" : "")} role="table" aria-busy="true" style={resizable && Object.keys(colWidths).length ? { tableLayout:"fixed", width:"100%"} : undefined}>
            {resizable && <colgroup>{columns.map(c=> (<col key={c.key} style={getColWidth(c) ? {width:getColWidth(c)} : undefined} />))}</colgroup>}
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={(c.hideOnMobile?"hide-mobile ":"")+("align-"+(c.align||"left"))} style={getColWidth(c)?{width:getColWidth(c)}:undefined}>{c.label}{resizable && <span className={`col-resizer ${draggingKeyRef.current===c.key?"dragging":""}`} onMouseDown={(e)=>onColResizeStart(e,c.key)} onTouchStart={(e)=>onColResizeStart(e,c.key)} onDoubleClick={()=>onColResizeDblClick(c.key)} title="Kéo để đổi độ rộng, double-click để reset" />}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({length:skeletonRows}).map((_,i)=>(
                <tr key={i} className="skeleton-row">
                  {columns.map(c=>(
                    <td key={c.key} className={c.hideOnMobile?"hide-mobile":""}><span className="data-table-skeleton"></span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!sortedData || sortedData.length === 0) {
    return (
      <div className="data-table-empty" role="status">
        <div className="data-table-empty-icon" aria-hidden="true">∅</div>
        <div className="data-table-empty-text">{emptyText}</div>
        {emptyHint && <div className="data-table-empty-hint">{emptyHint}</div>}
        {emptyAction && <div className="data-table-empty-action">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="data-table-wrap">
      <div className="data-table-scroller" role="region" aria-label="Bảng dữ liệu" tabIndex={0}>
        <table className={"data-table" + (compact ? " compact" : "") + (resizable ? " resizable" : "")} style={resizable && Object.keys(colWidths).length ? { tableLayout:"fixed", width:"100%"} : undefined}>
          {resizable && <colgroup>{columns.map(col=> (<col key={col.key} style={getColWidth(col) ? {width:getColWidth(col)} : undefined} />))}</colgroup>}
          <thead>
            <tr>
              {columns.map((col) => {
                const sortable = !!col.sortable;
                const active = sortBy === col.key;
                const isDragging = draggingKeyRef.current===col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={(col.hideOnMobile?"hide-mobile ":"")+("align-"+(col.align||"left"))+(sortable?" sortable":"")+(active?" sorted":"")+(isDragging?" dragging":"")}
                    style={getColWidth(col)?{width:getColWidth(col)}:undefined}
                    aria-sort={sortable ? (active ? (sortDir==="asc" ? "ascending" : "descending") : "none") : undefined}
                    onClick={sortable ? (e)=>{ if(dragRef.current) return; handleSort(col.key); } : undefined}
                    role={sortable ? "button" : undefined}
                    tabIndex={sortable ? 0 : undefined}
                    onKeyDown={sortable ? (e)=>{ if(e.key==="Enter"||e.key===" ") {e.preventDefault(); handleSort(col.key);} } : undefined}
                  >
                    <span className="th-inner">{col.label}{sortable && <span className="sort-icon" aria-hidden="true">{active ? (sortDir==="asc" ? " ↑" : " ↓") : " ↕"}</span>}</span>
                    {resizable && <span className={`col-resizer ${isDragging?"dragging":""}`} onMouseDown={(e)=>onColResizeStart(e,col.key)} onTouchStart={(e)=>onColResizeStart(e,col.key)} onDoubleClick={()=>onColResizeDblClick(col.key)} title="Kéo để đổi độ rộng, double-click để reset" aria-hidden="true" />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(pagedData || []).map((row, idx) => {
              const key = row[keyField] != null ? row[keyField] : idx;
              const clickable = !!onRowClick;
              return (
                <tr key={key} className={clickable?"clickable":""} onClick={clickable ? ()=>onRowClick(row) : undefined} tabIndex={clickable ? 0 : undefined} onKeyDown={clickable ? (e)=>{ if(e.key==="Enter"||e.key===" ") {e.preventDefault(); onRowClick(row);} } : undefined}>
                  {columns.map((col) => {
                    const val = row[col.key];
                    const content = col.render ? col.render(val, row, idx) : (val ?? "");
                    return (
                      <td key={col.key} className={(col.hideOnMobile?"hide-mobile ":"")+("align-"+(col.align||"left"))} data-label={col.label} style={getColWidth(col)?{width:getColWidth(col)}:undefined}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="data-table-footer">
        <div className="data-table-count" aria-live="polite">
          {showPagination && sortedData.length > effectivePageSize
            ? `Hiển thị ${pagedData.length}/${sortedData.length} mục · Trang ${page}/${totalPages}`
            : `${sortedData.length} mục`}
        </div>
        {showPagination && totalPages > 1 && (
          <div className="data-table-pager" role="navigation" aria-label="Phân trang bảng">
            <button type="button" className="btn btn-xs" disabled={page <= 1} onClick={() => setPage(1)} aria-label="Về trang đầu">«</button>
            <button type="button" className="btn btn-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Trang trước">‹</button>
            <span className="data-table-pageinfo" aria-live="polite">{page}/{totalPages}</span>
            <button type="button" className="btn btn-xs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Trang sau">›</button>
            <button type="button" className="btn btn-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Tới trang cuối">»</button>
          </div>
        )}
      </div>
    </div>
  );
}
