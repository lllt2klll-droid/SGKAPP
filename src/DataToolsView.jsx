// ── Dữ liệu: sao lưu 1-file, khôi phục, xóa sạch, thống kê ───────────
// Khớp toàn app: header wt-like + card 14px + tokens + 3D buttons
import React, { useEffect, useState } from "react";
import { appEvents, AppEvents } from "./core/appEvents.js";
import { STORAGE_KEYS } from "./core/storageKeys.js";
import {
  DatabaseBackup,
  Upload,
  Trash2,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  Eye,
  AlertTriangle,
  X,
  Check,
  BookMarked,
  Download,
  Sparkles,
  Info,
  FileText,
  RotateCcw,
} from "lucide-react";
import {
  exportBackup,
  importBackup,
  parseBackupPreview,
  wipeAppData,
  isBackupKey,
  isCacheKey,
} from "./storage";
import { getMergedTocBooks, getCustomTocBooks, upsertTocBook, deleteCustomTocBook } from "./tocData";
import { getPlans as getKhbdPlans, savePlan as saveKhbdPlan, clearLegacyData, hasLegacyData } from "./khbd/planModel";
import { restoreQuestion, restoreActivity, restoreWorksheet } from "./teachingDB";
import { restoreIdea } from "./personalDB";
import { restoreVocabEntries } from "./userdata";
import {
  listTrash,
  takeFromTrash,
  removeFromTrash,
  emptyTrash,
  daysLeft,
  isExpired,
  TRASH_TTL_DAYS,
  TRASH_TYPE,
  TRASH_TYPE_LABEL,
} from "./trashStore";
import { purgeExpiredTrashNow, hardDeleteBook } from "./trashPurge";
import { getAutoBackupMeta, getAutoBackupPayload, deleteAutoBackup } from "./autoBackup";
import { parseTocExcel, generateTocTemplateExcel, exportTocToExcel } from "./tocExcel";
import DataTable from "./DataTable";
import FileDropzone from "./components/FileDropzone.jsx";
import aiDataStorage from "./aiDataStorage";
import { checkOrphanData, getStorageStats } from "./dataIntegrity.js";
import { runStorageHealth, repairStorageHealth } from "./core/storageHealth.js";
import { calcRenderScale, calcViewportSize } from "./reader/pdfRenderer.js";
import { APP_COPYRIGHT, teacherCopy } from "./appPersona.js";
import { YCCD, MACHS } from "./ctgpt.js";
import { safeGetJSON, safeGetString, safeRemove, safeSetString, listKeys } from "./safeStorage";
import { uiMessage } from "./core/errors.js";

export default function DataToolsView() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => { setTick(t=>t+1); setTrash(listTrash()); const m = getAutoBackupMeta(); setAutoSnaps(m.snapshots); setAutoAt(m.lastSuccess); }; window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [msg, setMsg] = useState(null);
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingText, setPendingText] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [tocBooks, setTocBooks] = useState(() => getMergedTocBooks());
  const [tocMsg, setTocMsg] = useState(null);
  const [selectedBookKey, setSelectedBookKey] = useState("");
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [libStats, setLibStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/health");
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setLibStats(j);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      const v = safeGetString("sgk_last_backup", null);
      return v ? Number(v) : null;
    } catch (e) {
      console.warn("[DataToolsView] safeGetString failed for sgk_last_backup", e);
      return null;
    }
  });

  // A2 • Thùng rác 30 ngày
  const [trash, setTrash] = useState(() => listTrash());
  // A3 • Bản sao lưu tự động (IndexedDB riêng)
  const [autoSnaps, setAutoSnaps] = useState(() => getAutoBackupMeta().snapshots);
  const [autoAt, setAutoAt] = useState(() => getAutoBackupMeta().lastSuccess);

  const refreshTrash = () => {
    setTrash(listTrash());
    const m = getAutoBackupMeta();
    setAutoSnaps(m.snapshots);
    setAutoAt(m.lastSuccess);
  };

  const restoreTrashItem = (item) => {
    const taken = takeFromTrash(item.id);
    if (!taken) { setMsg({ kind: "err", text: "Không khôi phục được mục này." }); return; }
    try {
      if (taken.type === TRASH_TYPE.PLAN) saveKhbdPlan(taken.payload);
      else if (taken.type === TRASH_TYPE.QUESTION) restoreQuestion(taken.payload);
      else if (taken.type === TRASH_TYPE.VOCAB) {
        // payload: { entries: [...] } hoặc 1 entry đơn lẻ
        const entries = Array.isArray(taken.payload?.entries)
          ? taken.payload.entries
          : Array.isArray(taken.payload)
            ? taken.payload
            : taken.payload && taken.payload.id
              ? [taken.payload]
              : [];
        restoreVocabEntries(entries);
      }
      else if (taken.type === TRASH_TYPE.ACTIVITY) restoreActivity(taken.payload);
      else if (taken.type === TRASH_TYPE.WORKSHEET) restoreWorksheet(taken.payload);
      else if (taken.type === TRASH_TYPE.IDEA) restoreIdea(taken.payload);
      // Sách: file PDF chưa bị xóa — đưa ra khỏi thùng rác là App tự nạp lại thư viện
    } catch (e) {
      setMsg({ kind: "err", text: `Khôi phục lỗi: ${e.message}` });
      return;
    }
    refreshTrash();
    setMsg({ kind: "ok", text: `Đã khôi phục "${taken.label}".` });
  };

  const deleteTrashItemForever = async (item) => {
    if (!window.confirm(`Xóa vĩnh viễn "${item.label}"? Không thể hoàn tác.`)) return;
    removeFromTrash(item.id);
    if (item.type === TRASH_TYPE.BOOK && item.meta?.filename) {
      try { await hardDeleteBook(item.meta.filename); } catch {}
    }
    refreshTrash();
    setMsg({ kind: "ok", text: `Đã xóa vĩnh viễn "${item.label}".` });
  };

  const purgeExpired = async () => {
    try {
      const r = await purgeExpiredTrashNow();
      refreshTrash();
      try { appEvents.emit(AppEvents.DATA_UPDATED, { source: "trash-purge" }); } catch {}
      setMsg({
        kind: "ok",
        text: r.expired ? `Đã xóa vĩnh viễn ${r.expired} mục hết hạn (${r.purgedBooks} file sách).` : "Chưa có mục nào hết hạn 30 ngày.",
      });
    } catch (e) { setMsg({ kind: "err", text: `Không dọn được: ${e.message}` }); }
  };

  const emptyAllTrash = async () => {
    const items = listTrash();
    if (!items.length) return;
    if (!window.confirm(`Xóa vĩnh viễn TOÀN BỘ ${items.length} mục trong thùng rác? Không thể hoàn tác.`)) return;
    for (const it of items) {
      if (it.type === TRASH_TYPE.BOOK && it.meta?.filename) { try { await hardDeleteBook(it.meta.filename); } catch {} }
    }
    emptyTrash();
    refreshTrash();
    try { appEvents.emit(AppEvents.DATA_UPDATED, { source: "trash-purge" }); } catch {}
    setMsg({ kind: "ok", text: `Đã xóa vĩnh viễn ${items.length} mục.` });
  };

  const restoreAutoBackup = async (snap) => {
    try {
      const text = await getAutoBackupPayload(snap.id);
      if (!text) { setMsg({ kind: "err", text: "Không đọc được bản sao lưu tự động này." }); return; }
      const result = parseBackupPreview(text);
      if (!result.valid) { setMsg({ kind: "err", text: `Bản sao lưu hỏng: ${result.error}` }); return; }
      setPendingText(text);
      setPreview(result.preview);
      setConfirmChecked(false);
      setMsg({ kind: "ok", text: "Đã nạp bản sao lưu tự động — kéo lên đầu trang và bấm Khôi phục để áp dụng." });
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    } catch (e) { setMsg({ kind: "err", text: `Không đọc được bản sao lưu: ${e.message}` }); }
  };


  // statistics over localStorage that belongs to this app
  const stats = (() => {
    const groups = {};
    let totalBytes = 0,
      totalKeys = 0,
      cacheKeys = 0,
      cacheBytes = 0;
    for (const key of listKeys()) {
      if (!key) continue;
      const bytes = (safeGetString(key, "") || "").length;
      if (isCacheKey(key)) {
        cacheKeys++;
        cacheBytes += bytes;
        continue;
      }
      if (!isBackupKey(key)) continue;
      const prefix = key.split("_")[0];
      const group = key.startsWith("sgk_marks_")
        ? "sgk_marks_"
        : key.startsWith("notes_") ||
            key.startsWith("studynotes_") ||
            key.startsWith("glossary_history")
          ? "ghi chú/ghi sổ"
          : prefix;
      groups[group] = groups[group] || { keys: 0, bytes: 0 };
      groups[group].keys++;
      groups[group].bytes += bytes;
      totalBytes += bytes;
      totalKeys++;
    }
    return { groups, totalKeys, totalBytes, cacheKeys, cacheBytes };
  })();

  const doExport = async () => {
    try {
      const result = await exportBackup();
      const now = Date.now();
      try {
        const res = safeSetString("sgk_last_backup", String(now));
        if (!res.ok) {
          if (res.quota) console.warn("[safeStorage] Quota exceeded on sgk_last_backup", res);
          else console.warn("[DataToolsView] safeSetString failed for sgk_last_backup", res);
        }
        setLastBackup(now);
      } catch (e) { console.warn("[DataToolsView] save sgk_last_backup failed", e); }
      try { appEvents.emit(AppEvents.DATA_UPDATED, { source: "backup-export" }); } catch (e) { console.warn("[DataToolsView] emit data-updated failed", e); }
      setMsg({
        kind: "ok",
        text: `Đã tải xuống file sao lưu (${result.total} mục: ${result.localCount} localStorage + ${result.indexedCount} IndexedDB).`,
      });
    } catch (err) {
      setMsg({
        kind: "err",
        text: `Không xuất được file sao lưu: ${err.message}`,
      });
    }
  };

  const IMPORT_MAX_BYTES = 200 * 1024 * 1024;
  const doImport = (file) => {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setMsg({ kind: "err", text: `File quá lớn (${(file.size / 1048576).toFixed(0)}MB > 200MB). Hãy dùng file sao lưu nhỏ hơn.` });
      return;
    }
    if (!/\.json$/i.test(file.name || "") && file.type !== "application/json") {
      setMsg({ kind: "err", text: "File sao lưu phải là .json (xuất từ nút Sao lưu)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const result = parseBackupPreview(text);
      if (!result.valid) {
        setMsg({ kind: "err", text: `Không khôi phục được: ${result.error}` });
        return;
      }
      setPendingText(text);
      setPreview(result.preview);
      setConfirmChecked(false);
    };
    reader.onerror = () =>
      setMsg({ kind: "err", text: "Không đọc được file." });
    reader.readAsText(file);
  };

  const doConfirmImport = async () => {
    if (!pendingText) return;
    if (!confirmChecked) {
      setMsg({
        kind: "err",
        text: "Vui lòng xác nhận sẽ ghi đè dữ liệu hiện tại.",
      });
      return;
    }
    setImporting(true);
    setProgress(10);
    // Tiến trình thật theo giai đoạn (không còn 20→60→100 giả bằng timeout)
    const tick = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 5 : p));
    }, 400);
    try {
      const res = await importBackup(pendingText);
      clearInterval(tick);
      setProgress(95);
      const indexedMsg =
        res.indexedCount > 0 ? ` (${res.indexedCount} mục IndexedDB)` : "";
      setPreview(null);
      setPendingText(null);
      // Xác minh thật: đối chiếu key trong backup với localStorage sau khôi phục
      let verifyOk = false;
      let verifyDetail = "";
      try {
        const payload = JSON.parse(pendingText);
        const keys = Object.keys(payload?.data || {});
        const missing = keys.filter((k) => {
          try { return localStorage.getItem(k) == null; } catch { return true; }
        });
        verifyOk = missing.length === 0 && res.count === res.total;
        verifyDetail = missing.length
          ? `thiếu ${missing.length} key (${missing.slice(0, 3).join(", ")})`
          : res.count !== res.total
            ? `chỉ áp dụng ${res.count}/${res.total}`
            : "đủ key";
      } catch {
        verifyOk = res.count > 0;
        verifyDetail = "không đối chiếu được key";
      }
      setProgress(100);
      setMsg({
        kind: verifyOk ? "ok" : "err",
        text: verifyOk
          ? `Khôi phục xong: ${res.count}/${res.total} mục hợp lệ${indexedMsg}. Xác minh: đạt. Ứng dụng sẽ tự tải lại…`
          : `Khôi phục xong nhưng xác minh CẢNH BÁO (${verifyDetail}). Hãy kiểm tra dữ liệu trước khi tiếp tục.`,
      });
      if (!verifyOk) { setImporting(false); return; }
      setTimeout(() => {
        location.reload();
      }, 900);
    } catch (e) {
      clearInterval(tick);
      setImporting(false);
      setProgress(0);
      setMsg({ kind: "err", text: `Không khôi phục được: ${uiMessage(e, "không rõ nguyên nhân")}` });
      setPreview(null);
    }
  };

  const [wipeArmed, setWipeArmed] = useState(false);
  useEffect(() => {
    if (!wipeArmed) return;
    const t = setTimeout(() => setWipeArmed(false), 8000);
    return () => clearTimeout(t);
  }, [wipeArmed]);
  const doWipe = async () => {
    // Xóa toàn bộ: bấm 2 lần cách nhau <8s thay vì 1 confirm (tránh bấm nhầm),
    // và bắt buộc đã sao lưu trước đó.
    if (!wipeArmed) {
      setWipeArmed(true);
      setMsg({
        kind: "err",
        text: lastBackup
          ? "Bấm “Xóa toàn bộ dữ liệu” LẦN NỮA trong 8 giây để xác nhận (không thể phục hồi)."
          : "Chưa thấy bản sao lưu nào. Hãy bấm “Sao lưu” trước, rồi bấm “Xóa toàn bộ” 2 lần để xác nhận.",
      });
      return;
    }
    if (!lastBackup) {
      setMsg({ kind: "err", text: "Hãy sao lưu trước khi xóa toàn bộ dữ liệu." });
      setWipeArmed(false);
      return;
    }
    setWipeArmed(false);
    try {
      const result = await wipeAppData();
      setMsg({
        kind: "ok",
        text: `Đã xóa ${result.localStorageKeys} mục localStorage và toàn bộ dữ liệu IndexedDB.`,
      });
      setImporting(true);
      setProgress(50);
      setTimeout(() => {
        setProgress(100);
        location.reload();
      }, 600);
    } catch (err) {
      setMsg({ kind: "err", text: `Không xóa được dữ liệu: ${err.message}` });
    }
  };

  const refreshToc = () => setTocBooks(getMergedTocBooks());

  const handleDownloadTemplate = async () => {
    try {
      const data = await generateTocTemplateExcel(tocBooks);
      const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mau-muc-luc.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTocMsg({ kind: "ok", text: "Đã tải mẫu Excel mục lục." });
    } catch (e) { setTocMsg({ kind: "err", text: e.message }); }
  };
  const handleExportToc = async () => {
    try {
      const data = await exportTocToExcel(tocBooks);
      const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `muc-luc-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTocMsg({ kind: "ok", text: `Đã xuất ${tocBooks.length} sách / ${tocBooks.reduce((s,b)=>s+(b.items?.length||0),0)} mục.` });
    } catch (e) { setTocMsg({ kind: "err", text: e.message }); }
  };
  const handleImportTocExcel = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const selected = selectedBookKey ? tocBooks.find(b => b.key === selectedBookKey) || null : null;
      const parsed = await parseTocExcel(buf, selected);
      for (const b of parsed) upsertTocBook(b);
      refreshToc();
      setTocMsg({ kind: "ok", text: `Đã nhập ${parsed.length} sách, ${parsed.reduce((s,b)=>s+b.items.length,0)} mục từ Excel. Mục lục cũ được giữ nguyên, sách trùng key sẽ được ghi đè.` });
    } catch (e) { setTocMsg({ kind: "err", text: e.message }); }
  };

  useEffect(() => {
    if (msg && msg.kind === "ok") {
      const t = setTimeout(() => setMsg(null), 6000);
      return () => clearTimeout(t);
    }
  }, [msg]);

  const fmt = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="datatools-view">
      {/* Header — khớp WebToolbox / Dashboard: iconBox + primary CTA như toàn app */}
      <div className="dt-header">
        <div className="dt-header-left">
          <div className="dt-iconBox" aria-hidden="true"><DatabaseBackup size={22} /></div>
          <div>
            <h1 className="dt-title">Sao lưu & Khôi phục</h1>
            <p className="dt-subtitle">
              Toàn bộ dữ liệu nằm trong trình duyệt — xuất 1 file JSON (localStorage + IndexedDB), khôi phục ghi đè, xóa dọn an toàn. PDF sách không nằm trong file sao lưu.
              {lastBackup && <span style={{ color: 'var(--success-deep)', fontWeight: 800 }}> • Lần cuối: {new Date(lastBackup).toLocaleString('vi-VN')}</span>}
            </p>
          </div>
        </div>
        <div className="dt-header-actions">
          <span className="dt-info-badge" title="Tổng mục + dung lượng hiện tại">{stats.totalKeys} mục • {fmt(stats.totalBytes)}</span>
          <button className="btn btn-primary" onClick={doExport}><Download size={16} /> Xuất ngay</button>
          <button className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Làm mới số liệu"><RefreshCw size={14} /></button>
        </div>
      </div>

      <div className="dt-info">
        <span><Sparkles size={12} /> Mẹo: Trước khi đổi máy/nâng cấp — hãy Xuất file và lưu ra OneDrive/USB</span>
        <span className="dt-info-badge"><Info size={12} /> Dữ liệu chỉ ở trình duyệt này • {fmt(stats.cacheBytes)} cache có thể dựng lại</span>
      </div>

      {msg && (
        <div className={`dt-msg ${msg.kind === "err" ? "err" : "ok"}`} role="status">
          {msg.kind === "err" ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setMsg(null)} aria-label="Đóng" style={{ marginLeft: 'auto' }}><X size={12} /></button>
        </div>
      )}
      {importing && (
        <div className="dt-card" style={{ padding: '0.7rem 0.9rem' }}>
          <div className="dt-bar-track"><div className="dt-bar-fill" style={{ width: `${progress}%` }} /></div>
          <p className="dt-hint" style={{ marginTop: '0.4rem' }}>Đang tải lại ứng dụng…</p>
        </div>
      )}

      {/* Card — Tổng quan dung lượng — overview đầu tiên cho chuyên nghiệp */}
      {/* (Tổng quan đặt trước Sao lưu để người dùng nắm tình trạng trước khi thao tác) */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><ShieldCheck size={16} /></span>
          Sao lưu dữ liệu
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 800, color: 'var(--pen-blue-deep)', background: 'var(--pen-blue-soft)', border: '1px solid var(--border-color)', padding: '0.15rem 0.45rem', borderRadius: 99 }}>JSON 1-file • localStorage + IndexedDB</span>
        </div>
        <div className="dt-card-body">
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', background: 'var(--surface-soft)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.65rem 0.75rem' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border-color)', display: 'grid', placeItems: 'center', color: 'var(--pen-blue)', flexShrink: 0 }}><DatabaseBackup size={14} /></span>
            <p className="dt-hint" style={{ margin: 0, lineHeight: 1.5 }}>
              Toàn bộ dữ liệu của ứng dụng nằm trong trình duyệt (<code style={{ background: 'var(--surface)', border: '1px solid var(--border-color)', padding: '0.05rem 0.3rem', borderRadius: 6, fontSize: '0.78rem' }}>localStorage</code>), gồm:
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {[
              "đánh dấu sách","từ vựng","ghi chú","thẻ CTGDPT","bộ sưu tập","khái niệm","thư mục tham khảo","giáo án","hoạt động mẫu","phiếu học tập","ngân hàng câu hỏi"
            ].map(t=>(
              <span key={t} className="tag-pill" style={{ background: 'var(--surface)', border: '1px solid var(--border-color)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-mid)' }}>{t}</span>
            ))}
          </div>
          <div className="dt-warning" style={{ background: 'var(--pen-blue-soft)', borderColor: 'var(--border-color)', borderLeft: '3px solid var(--pen-blue)' }}>
            <HardDrive size={16} style={{ color: 'var(--pen-blue)', flexShrink: 0, marginTop: 1 }} />
            <span>Dữ liệu nghiên cứu và bộ nhớ <b>IndexedDB</b> được đưa vào file sao lưu. File lớn hơn có thể mất thêm thời gian để xuất/khôi phục.</span>
          </div>
          <div className="dt-warning" style={{ background: 'var(--warning-soft)', borderColor: 'rgba(245,158,11,0.22)', borderLeft: '3px solid var(--warning)' }}>
            <AlertTriangle size={16} style={{ color: 'var(--warning-deep)', flexShrink: 0, marginTop: 1 }} />
            <span><b>Lưu ý:</b> File PDF sách giáo khoa <b>không</b> được đưa vào file sao lưu (chỉ sao lưu dữ liệu người dùng).</span>
          </div>
          <div className="dt-actions">
            <button className="btn btn-primary" onClick={doExport}><Download size={15} /> Xuất file sao lưu (.json)</button>
            <button className="btn btn-ghost" onClick={doWipe} style={{ color: 'var(--danger)', borderColor: wipeArmed ? 'var(--danger)' : 'rgba(220,38,38,0.22)', background: wipeArmed ? 'rgba(220,38,38,0.08)' : undefined }}><Trash2 size={15} /> {wipeArmed ? "Bấm lần nữa để XÓA HẾT (8s)" : "Xóa toàn bộ dữ liệu"}</button>
          </div>
          <FileDropzone
            accept=".json,application/json"
            multiple={false}
            title="Kéo thả file sao lưu (.json) vào đây hoặc bấm để chọn"
            hint="Khôi phục sẽ ghi đè dữ liệu hiện tại — hãy xuất sao lưu trước"
            compact
            onFiles={(f) => doImport(Array.isArray(f) ? f[0] : f)}
            onError={(m) => setMsg({ kind: "err", text: m })}
          />
        </div>
      </div>

      {/* A3 • Sao lưu tự động — bản chụp nền, khôi phục 1 bấm */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><ShieldCheck size={16} /></span>
          Sao lưu tự động
          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.72rem",
              fontWeight: 800,
              color: autoAt ? "var(--success-deep, #16a34a)" : "var(--text-mid)",
              background: autoAt ? "var(--success-soft, #dcfce7)" : "var(--surface-soft)",
              border: "1px solid var(--border-color)",
              padding: "0.15rem 0.45rem",
              borderRadius: 99,
            }}
          >
            {autoAt ? `Lần cuối: ${new Date(autoAt).toLocaleString("vi-VN")}` : "Chưa chạy"}
          </span>
        </div>
        <div className="dt-card-body">
          <p className="dt-hint" style={{ margin: 0 }}>
            App tự chép 1 bản chụp dữ liệu (giáo án, câu hỏi, ghi chú, từ vựng…) ở nền theo chu kỳ đã chọn trong{" "}
            <b>Cài đặt → Sao lưu</b>. Không mở cửa sổ, không gửi đi đâu — chỉ nằm trên máy này. Ảnh nặng được bỏ qua để bản chụp nhẹ.
          </p>
          {!autoSnaps.length && (
            <p className="dt-hint" style={{ marginTop: "0.5rem" }}>
              Chưa có bản nào — mở lại app sau vài giây là app tự chạy.
            </p>
          )}
          {autoSnaps.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "0.5rem" }}>
              {autoSnaps.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    border: "1px solid var(--border-color)", borderRadius: 10,
                    padding: "0.45rem 0.6rem", background: "var(--surface-soft)",
                  }}
                >
                  <DatabaseBackup size={14} style={{ color: "var(--pen-blue)", flexShrink: 0 }} />
                  <span style={{ flex: "1 1 200px", fontSize: "0.78rem", fontWeight: 700 }}>
                    {new Date(s.createdAt).toLocaleString("vi-VN")}
                    <span style={{ fontWeight: 600, color: "var(--text-mid)" }}>
                      {" "}• {s.localCount || 0} mục • {((s.bytes || 0) / 1048576).toFixed(2)} MB
                    </span>
                  </span>
                  <button className="btn btn-ghost btn-xs" onClick={() => restoreAutoBackup(s)}>
                    <RotateCcw size={12} /> Khôi phục bản này
                  </button>
                  <button
                    className="btn btn-danger btn-xs"
                    aria-label="Xóa bản sao lưu tự động"
                    title="Xóa bản này"
                    onClick={async () => {
                      if (!window.confirm("Xóa bản sao lưu tự động này?")) return;
                      await deleteAutoBackup(s.id);
                      refreshTrash();
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* A2 • Thùng rác 30 ngày */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><Trash2 size={16} /></span>
          Thùng rác
          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.72rem", fontWeight: 800,
              color: trash.length ? "var(--danger)" : "var(--text-mid)",
              background: trash.length ? "var(--danger-soft, #fef2f2)" : "var(--surface-soft)",
              border: "1px solid var(--border-color)",
              padding: "0.15rem 0.45rem", borderRadius: 99,
            }}
          >
            {trash.length ? `${trash.length} mục` : "Trống"}
          </span>
        </div>
        <div className="dt-card-body">
          {trash.length === 0 ? (
            <p className="dt-hint" style={{ margin: 0 }}>
              Thùng rác trống. Sách / giáo án / câu hỏi bạn xóa sẽ nằm đây <b>{TRASH_TTL_DAYS} ngày</b> trước khi biến mất —
              bấm <b>Khôi phục</b> bất cứ lúc nào.
            </p>
          ) : (
            <>
              <p className="dt-hint" style={{ margin: 0 }}>
                Xóa không mất ngay: mỗi mục giữ <b>{TRASH_TTL_DAYS} ngày</b>. Hết hạn sẽ tự xóa vĩnh viễn vào lần mở app sau.
                Với sách, file PDF vẫn còn nguyên trên máy cho tới lúc đó.
              </p>
              <div className="dt-actions" style={{ marginTop: "0.5rem" }}>
                <button className="btn btn-primary btn-sm" onClick={purgeExpired}>
                  <Trash2 size={14} /> Dọn mục hết hạn
                </button>
                <button className="btn btn-danger btn-sm" onClick={emptyAllTrash}>
                  Xóa vĩnh viễn tất cả
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "0.55rem" }}>
                {trash.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      border: "1px solid var(--border-color)", borderRadius: 10,
                      padding: "0.45rem 0.6rem", background: "var(--surface-soft)",
                    }}
                  >
                    <span
                      className="tag-pill"
                      style={{ fontSize: "0.7rem", fontWeight: 800, background: "var(--surface)", border: "1px solid var(--border-color)" }}
                    >
                      {TRASH_TYPE_LABEL[it.type] || it.type}
                    </span>
                    <span
                      style={{ flex: "1 1 180px", fontSize: "0.8rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={it.label}
                    >
                      {it.label}
                    </span>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: isExpired(it) ? "var(--danger)" : "var(--text-mid)" }}>
                      {isExpired(it) ? "đã hết hạn" : `còn ${daysLeft(it)} ngày`}
                    </span>
                    <button className="btn btn-ghost btn-xs" onClick={() => restoreTrashItem(it)}>
                      <RotateCcw size={12} /> Khôi phục
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => deleteTrashItemForever(it)}
                      aria-label="Xóa ngay"
                      title="Xóa ngay, không chờ hết hạn"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card 2 — Tổng quan — thống nhất: thư viện ngoài + trong app + toàn bộ */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><HardDrive size={16} /></span>
          Tổng quan dung lượng — thống nhất
        </div>
        <div className="dt-card-body">
          <div className="quick-stats-grid">
            <div className="quick-stat-card" title={libStats?.booksDir || "thư viện ngoài"}>
              <div className="quick-stat-icon"><BookMarked size={16} /></div>
              <div>
                <div className="quick-stat-value">{libStats ? `${libStats.pdfCount} sách` : "—"}</div>
                <div className="quick-stat-label">thư viện ngoài (FS)</div>
                <div className="quick-stat-sub">{libStats ? fmt(libStats.totalBytes) : "đang tải..."} {libStats?.byGrade ? `• ${Object.keys(libStats.byGrade).length} khối` : ""}</div>
              </div>
            </div>
            <div className="quick-stat-card">
              <div className="quick-stat-icon"><HardDrive size={16} /></div>
              <div>
                <div className="quick-stat-value">{stats.totalKeys}</div>
                <div className="quick-stat-label">mục trong app (LS)</div>
                <div className="quick-stat-sub">{fmt(stats.totalBytes)} + {fmt(stats.cacheBytes)} cache</div>
              </div>
            </div>
            <div className="quick-stat-card">
              <div className="quick-stat-icon"><DatabaseBackup size={16} /></div>
              <div>
                <div className="quick-stat-value">{health?.idb ? `${Object.values(health.idb.stores||{}).reduce((a,c)=>a+(c.count||0),0)} IDB` : fmt(stats.totalBytes + (health?.quota?.estimate?.usage||0))}</div>
                <div className="quick-stat-label">trong app + IDB</div>
                <div className="quick-stat-sub">{health?.quota?.estimate ? fmt(health.quota.estimate.usage) + " ước tính" : fmt(stats.totalBytes + stats.cacheBytes) + " LS"}</div>
              </div>
            </div>
            <div className="quick-stat-card">
              <div className="quick-stat-icon"><ShieldCheck size={16} /></div>
              <div>
                <div className="quick-stat-value">{libStats ? fmt((libStats.totalBytes||0) + stats.totalBytes + stats.cacheBytes + (health?.quota?.estimate?.usageDetails?.indexedDB||0)) : fmt(stats.totalBytes + stats.cacheBytes)}</div>
                <div className="quick-stat-label">toàn bộ (ngoài + trong)</div>
                <div className="quick-stat-sub">{libStats ? `${libStats.pdfCount} PDF + ${stats.totalKeys} LS + IDB` : "ngoài + trong"}</div>
              </div>
            </div>
          </div>
          <p className="dt-hint">Thư viện ngoài: PDF gốc trên ổ đĩa (server /api/health totalBytes). Trong app: localStorage ({fmt(stats.totalBytes)} backup + {fmt(stats.cacheBytes)} cache) + IndexedDB ({health?.quota?.estimate ? fmt(health.quota.estimate.usageDetails?.indexedDB||0) : "—"}). Toàn bộ = ngoài + trong — phản ánh thực tế.</p>
          {libStats?.byGrade && <p className="dt-hint">Theo khối: {Object.entries(libStats.byGrade).sort().map(([k,v])=>`${k.replace("grade","Lớp ")}: ${fmt(v)}`).join(" • ")}</p>}
        </div>
      </div>

      {/* Card 3 — Nhóm dữ liệu */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><HardDrive size={16} /></span>
          Nhóm dữ liệu theo tính năng
        </div>
        <div className="dt-card-body">
          {(() => {
            const dtData = Object.entries(stats.groups).map(([g, v]) => ({
              id: g,
              nhom: g,
              soMuc: v.keys,
              dungLuong: fmt(v.bytes),
              _bytes: v.bytes,
            }));
            const dtColumns = [
              { key: "nhom", label: "Nhóm", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
              { key: "soMuc", label: "Số mục", sortable: true, width: "110px", align: "right" },
              { key: "dungLuong", label: "Dung lượng", sortable: true, width: "140px", align: "right", render: (v) => <span className="tag-pill">{v}</span> },
            ];
            return (
              <div className="dt-table-wrap">
                <DataTable columns={dtColumns} data={dtData} keyField="id" emptyText="Chưa có dữ liệu nào." emptyHint="Dữ liệu sẽ xuất hiện sau khi bạn sử dụng các tính năng ghi chú, đánh dấu, giáo án…" />
              </div>
            );
          })()}
          <p className="dt-hint">Mẹo: trước khi nâng cấp/chuyển máy hãy xuất file sao lưu; giữ file ở OneDrive/USB vì dữ liệu chỉ nằm trong trình duyệt này.</p>
        </div>
      </div>

      {/* Card 4 — Chẩn đoán & Dọn rác */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><AlertTriangle size={16} /></span>
          Chẩn đoán & Dọn rác
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 800, color: 'var(--warning-deep)', background: 'var(--warning-soft)', border: '1px solid rgba(245,158,11,0.22)', padding: '0.15rem 0.45rem', borderRadius: 99 }}>Nâng cao</span>
        </div>
        <div className="dt-card-body">
          <div style={{ background: 'linear-gradient(135deg, var(--color-action, #2563eb) 0%, var(--color-action-active, #1e40af) 100%)', borderRadius: 10, padding: '0.65rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', color: 'white' }}>
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Quét lưu trữ — kiểm tra lỗi ở đâu</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.92 }}>Toàn bộ localStorage + IndexedDB, chỉ ra key corrupted/orphan/vương vãi</div>
            </div>
            <button className="btn" disabled={healthLoading} onClick={async()=>{
              setHealthLoading(true);
              try{
                const books = (()=>{ try{ return safeGetJSON('sgk_books', [], Array.isArray); }catch{ return []; }})();
                const r = await runStorageHealth({ books });
                setHealth(r);
                if(r.summary.healthy) setMsg({kind:"ok", text:`✅ Khỏe: ${r.summary.totalKeys} khóa`});
                else setMsg({kind:"err", text:`⚠️ ${r.summary.totalErrors} lỗi — xem bên dưới`});
              }catch(e){ setMsg({kind:"err", text:"Quét lỗi: "+uiMessage(e, "không rõ nguyên nhân")}); }
              setHealthLoading(false);
            }} style={{ background: 'white', color: '#4f46e5', fontWeight: 800, border: 'none', padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
              {healthLoading ? <RefreshCw size={14} className="spin" /> : <ShieldCheck size={14} />} Quét ngay
            </button>
          </div>
          {health && (
            <div id="storage-health-result" style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--surface-soft)', padding: '0.6rem', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 800 }}>{health.summary.healthy ? '✅ Khỏe' : `⚠️ ${health.summary.totalErrors} lỗi`} • {health.summary.totalKeys} khóa • Hạn mức: {health.quota.available?'Còn chỗ':'Hết chỗ'} {health.summary.hasWarnings?`• Cảnh báo: ${health.summary.orphanAssets} mục thừa`:''}</div>
              <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.4rem', flexWrap:'wrap' }}>
                <button className="btn btn-primary btn-xs" onClick={async()=>{ if(!confirm(`Sửa ${health.summary.totalErrors} lỗi?`)) return; const r=await repairStorageHealth({dryRun:false}); setHealth(r.after); setMsg({kind:"ok", text:`Đã sửa: ${r.actions.join(" • ")||"xong"}`}); refresh(); }} style={{ background:'var(--success)', color:'white' }}>Sửa {health.summary.totalErrors} lỗi</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>{ navigator.clipboard?.writeText(JSON.stringify(health,null,2)); setMsg({kind:"ok", text:"Đã sao chép"}); }}>Sao chép báo cáo</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>setHealth(null)}>Ẩn</button>
              </div>
            </div>
          )}
          <p className="dt-hint">Quét mồ côi (scan/autosave/questionLink), bộ nhớ AI, và kiểm tra backup. Các thao tác nguy hiểm cần xác nhận.</p>
          <div className="dt-actions" style={{ gap: '0.4rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={()=>{
              try{
                const hist = aiDataStorage.getAnalysisHistory?.() || safeGetJSON(STORAGE_KEYS.AI_HISTORY, [], Array.isArray);
                // ai_image_cache lưu dạng object {imageId: ...} (xem aiDataStorage.getImageCache)
                const cacheRaw = safeGetJSON(STORAGE_KEYS.AI_IMAGE_CACHE, null, (v) => typeof v === "object" && v !== null);
                const cacheCount = Array.isArray(cacheRaw) ? cacheRaw.length : (cacheRaw ? Object.keys(cacheRaw).length : 0);
                const usage = (()=>{ try{ return aiDataStorage.getStorageUsage(); }catch (e) { console.warn("[DataToolsView] getStorageUsage failed", e); return null; }})();
                const orphanScans = safeGetJSON('sgk_scans_v1', [], Array.isArray).length;
                const orphanAutosaves = Object.keys(localStorage).filter(k=>k.startsWith('sgk_autosave_')).length;
                const orphanMarks = Object.keys(localStorage).filter(k=>k.startsWith('sgk_marks_')).length;
                const text = `AI history: ${hist.length} | AI cache: ${cacheCount||usage?.imageCache||0} | Scans: ${orphanScans} | Autosaves: ${orphanAutosaves} | Marks: ${orphanMarks}\nDung lượng AI: ${usage? JSON.stringify(usage): '—'}`;
                setMsg({kind:"ok", text});
              }catch(e){ console.warn("[DataToolsView] Quét AI failed", e); setMsg({kind:"err", text:uiMessage(e)}); }
            }}><Eye size={15} /> Quét & Thống kê AI</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{
              // Khóa thật từ storageKeys (khớp aiDataStorage) — bản cũ ghi sai 'ai_model_prefs'
              const aiKeys = Object.values(STORAGE_KEYS).filter((k) => typeof k === "string" && k.startsWith("ai_"));
              const found = aiKeys.filter(k=> { try { return safeGetString(k, null) !== null; } catch (e) { console.warn("[DataToolsView] safeGetString failed for "+k, e); return false; } });
              if(!found.length) { setMsg({kind:"ok", text:"Không có dữ liệu AI mồ côi."}); return; }
              if(!confirm(`Xóa ${found.length} mục AI: ${found.join(', ')}?`)) return;
              found.forEach(k=> { try { const res = safeRemove(k); if (!res.ok) console.warn("[DataToolsView] safeRemove failed for "+k, res); } catch (e) { console.warn("[DataToolsView] safeRemove failed for "+k, e); } });
              setMsg({kind:"ok", text:`Đã xóa ${found.length} mục AI.`});
              refresh();
            }}><Trash2 size={14} /> Xóa lịch sử AI</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>{
              try{
                const books = (()=>{ try{ return safeGetJSON('sgk_books', [], Array.isArray); }catch (e) { console.warn("[DataToolsView] safeGetJSON failed for sgk_books", e); return []; }})();
                const r = checkOrphanData(books);
                const s = getStorageStats();
                setMsg({kind:"ok", text:`Kiểm tra dữ liệu thừa: ${JSON.stringify(r).slice(0,400)} | Stats: ${JSON.stringify(s).slice(0,400)}`});
              }catch(e){ console.warn("[DataToolsView] Quét Orphan failed", e); setMsg({kind:"err", text:uiMessage(e)}); }
            }}><HardDrive size={14} /> Quét dữ liệu thừa</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{
              const sc = calcRenderScale(1.2, 2);
              const vp = calcViewportSize(600, sc);
              setMsg({kind:"ok", text:`pdfRenderer: scale=${sc.toFixed(2)} viewport=${JSON.stringify(vp)} | ${teacherCopy?.substring?.(0,80) || APP_COPYRIGHT} | YCCD:${YCCD.length} MACHS:${MACHS.length}`});
            }}><Eye size={14} /> Kiểm tra Engine</button>
          </div>
        </div>
      </div>

      {/* Card 4b — Giáo án KHBD (kho mới + tồn dư kho cũ) */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><FileText size={16} /></span>
          Giáo án KHBD
          <span className="dt-info-badge" style={{ marginLeft: 'auto' }}>
            {(() => { try { return `${getKhbdPlans().length} bài`; } catch { return "—"; } })()}
          </span>
        </div>
        <div className="dt-card-body">
          <p className="dt-hint">Kho mới <code>khbd_v2_plans</code> đã nằm trong sao lưu toàn app. Kiểm tra hợp lệ, dung lượng từng bài và dọn tồn dư kho cũ (<code>sgk_lessonplans_*</code>, <code>sgk_autosave_*</code>).</p>
          <div className="dt-actions" style={{ gap: '0.4rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={async()=>{
              try{
                const r = await runStorageHealth({ books: [], includeIDB: false });
                const k = r.khbd || { count: 0, bytes: 0, invalid: [], oversized: [], legacyKeys: [] };
                const kb = (k.bytes / 1024).toFixed(1);
                setMsg({kind: k.invalid.length ? "err" : "ok",
                  text: `KHBD: ${k.count} bài (${kb}KB)` +
                    (k.invalid.length ? ` | LỖI: ${k.invalid.map(x=>`${x.id} (${x.reason})`).join("; ")}` : " | hợp lệ") +
                    (k.oversized.length ? ` | Nặng: ${k.oversized.map(x=>`${x.title||x.id} ${(x.bytes/1024).toFixed(0)}KB`).join("; ")}` : "") +
                    (k.legacyKeys.length ? ` | Tồn dư kho cũ: ${k.legacyKeys.length} key` : " | sạch kho cũ")});
              }catch(e){ setMsg({kind:"err", text:"Kiểm tra KHBD lỗi: "+uiMessage(e, "không rõ nguyên nhân")}); }
            }}><ShieldCheck size={14} /> Kiểm tra KHBD</button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', borderColor: 'rgba(220,38,38,0.18)' }} onClick={()=>{
              if (!hasLegacyData()) { setMsg({kind:"ok", text:"Không còn dữ liệu KHBD cũ."}); return; }
              if(!confirm("Xóa toàn bộ data KHBD CŨ (sgk_lessonplans_*, sgk_autosave_*)? Kho mới khbd_v2_* giữ nguyên.")) return;
              try{ const removed = clearLegacyData(); setMsg({kind:"ok", text:`Đã dọn ${removed.length} key cũ.`}); refresh(); }catch(e){ setMsg({kind:"err", text:e.message}); }
            }}><Trash2 size={14} /> Dọn dữ liệu KHBD cũ</button>
          </div>
        </div>
      </div>

      {/* Card 5 — Mục lục Excel */}
      <div className="dt-card">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><BookMarked size={16} /></span>
          Mục lục — Nhập từ Excel
        </div>
        <div className="dt-card-body">
          <p className="dt-hint">
            Thêm mục lục cho sách mới hoặc cập nhật sách cũ bằng Excel. Gốc trong <code>tocData.js</code> được giữ — dữ liệu nhập lưu vào <code>sgk_toc_custom_v1</code> và ghi đè theo <code>key</code> nếu trùng.
          </p>
          <p className="dt-hint muted">Excel: <b>Mã sách | Tên sách | Lớp | Môn | Tập | Tiêu đề | Mô tả | Trang (PDF) | Độ sâu | Tuần</b>. Nếu nhập 1 sách, chọn sách dưới và Excel chỉ cần <b>Tiêu đề | Mô tả | Trang | Độ sâu | Tuần</b>.</p>
          <div className="dt-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><Download size={14} /> Tải mẫu Excel</button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportToc}><Upload size={14} /> Xuất mục lục hiện tại ra Excel</button>
            <span className="dt-info-badge" style={{ marginLeft: 'auto' }}>{tocBooks.length} sách / {tocBooks.reduce((s,b)=>s+(b.items?.length||0),0)} mục</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <select className="form-control" style={{ minWidth: 220, flex: 1 }} value={selectedBookKey} onChange={(e) => setSelectedBookKey(e.target.value)}>
              <option value="">— Nhập nhiều sách (Excel có cột Mã sách) —</option>
              {tocBooks.map(b => (
                <option key={b.key} value={b.key}>{b.title} — Lớp {b.grade} ({b.key})</option>
              ))}
            </select>
            <FileDropzone
              accept=".xlsx,.xls"
              multiple={false}
              title="Kéo thả Excel mục lục vào đây hoặc bấm để chọn"
              hint=".xlsx / .xls — đúng mẫu cột"
              compact
              onFiles={(f) => handleImportTocExcel(Array.isArray(f) ? f[0] : f)}
              onError={(m) => setTocMsg({ kind: "err", text: m })}
            />
          </div>
          {tocMsg && <div className={`dt-msg ${tocMsg.kind==="err"?"err":"ok"}`}><span>{tocMsg.text}</span><button className="btn btn-ghost btn-xs" onClick={()=>setTocMsg(null)} style={{ marginLeft: 'auto' }}><X size={12} /></button></div>}
          <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--border-color)", borderRadius: 10, padding: "0.45rem", background: 'var(--surface-soft)' }}>
            {getCustomTocBooks().length === 0 ? (
              <p className="dt-hint" style={{ margin: 0 }}>Chưa có mục lục tùy chỉnh. Mục lục gốc vẫn hiển thị.</p>
            ) : (
              getCustomTocBooks().map(b => (
                <div key={b.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.3rem 0", borderBottom: "1px dashed var(--border-color)" }}>
                  <span style={{ fontSize: "0.82rem" }}><b>{b.title}</b> <span style={{ color: 'var(--text-muted)' }}>({b.key})</span> — {b.items?.length||0} mục</span>
                  <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={()=>{ if(confirm(`Xóa mục lục tùy chỉnh "${b.title}"?`)){ deleteCustomTocBook(b.key); refreshToc(); setTocMsg({kind:"ok", text:"Đã xóa"});} }}><Trash2 size={12} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay dt-preview-backdrop" onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-labelledby="preview-title">
          <div className="modal-content dt-preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="preview-title" className="modal-title" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><Eye size={16} /> Xem trước sao lưu</h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setPreview(null)} aria-label="Đóng"><X size={16} /></button>
            </div>
            <div className="dt-preview-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", fontSize: "0.82rem", background: 'var(--surface-soft)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.6rem 0.7rem' }}>
                <span><b>Phiên bản:</b> {preview.schemaVersion} (app {preview.appVersion || "—"})</span>
                <span><b>Ngày tạo:</b> {preview.createdAt ? new Date(preview.createdAt).toLocaleString("vi-VN") : "—"}</span>
                <span><b>LocalStorage:</b> {preview.localCount} keys</span>
                <span><b>IndexedDB:</b> {preview.indexedTotal} records</span>
                {preview.label && <span style={{ gridColumn: "1 / -1" }}><b>Nhãn:</b> {preview.label}</span>}
              </div>
              <div style={{ maxHeight: "180px", overflow: "auto", border: "1px solid var(--border-color)", borderRadius: 10, padding: "0.5rem", background: 'var(--surface-soft)' }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, marginBottom: "0.3rem" }}>Keys trong file:</div>
                <div className="dt-badge-row">
                  {preview.localKeys.map((k) => (
                    <span key={k} className="tag-pill" style={{ fontSize: "0.7rem", background: 'var(--surface)', border: '1px solid var(--border-color)' }}>{k}</span>
                  ))}
                  {preview.hasMoreKeys && <span className="tag-pill">+{preview.localCount - preview.localKeys.length} khác</span>}
                </div>
                {Object.keys(preview.indexedCounts).length > 0 && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
                    <div style={{ fontWeight: 800, marginBottom: "0.2rem" }}>IndexedDB:</div>
                    {Object.entries(preview.indexedCounts).map(([store, c]) => (
                      <span key={store} className="tag-pill" style={{ marginRight: "0.3rem", fontSize: "0.7rem", background: 'var(--pen-blue-soft)', borderColor: 'var(--border-color)', color: 'var(--pen-blue-deep)' }}>{store}: {c}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="dt-warning">
                <AlertTriangle size={16} style={{ color: 'var(--warning-deep)', flexShrink: 0, marginTop: 1 }} />
                <span>Dữ liệu hiện tại sẽ bị <b>ghi đè</b> bởi file sao lưu. Hành động này không thể hoàn tác nếu chưa backup.</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", fontWeight: 700 }}>
                <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                Tôi hiểu và muốn tiếp tục khôi phục
              </label>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.8rem 1rem', borderTop: '1px solid var(--border-color)', background: 'var(--surface-soft)', borderRadius: '0 0 14px 14px' }}>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>Hủy</button>
              <button className="btn btn-primary" onClick={doConfirmImport} disabled={!confirmChecked} title={!confirmChecked ? "Tick vào checkbox để xác nhận" : "Khôi phục dữ liệu"}><Check size={14} /> Xác nhận khôi phục</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}