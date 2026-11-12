import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  Check,
  DatabaseBackup,
  Download,
  FileText,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { safeGetJSON, safeGetString, safeSetString, safeRemove, listKeys } from "../safeStorage.js";
import { isCacheKey } from "../core/storageKeys.js";
import indexedDBService, { STORES } from "../data/indexedDB.js";
import {
  exportBackup,
  importBackup,
  parseBackupPreview,
  wipeAppData,
  isBackupSnapshotKey,
} from "../data/storage.js";
import { getMergedTocBooks, getCustomTocBooks, upsertTocBook, deleteCustomTocBook } from "../data/tocData.js";
import { parseTocExcel, generateTocTemplateExcel, exportTocToExcel } from "../data/tocExcel.js";
import { savePlan as saveKhbdPlan } from "../khbd/planModel.js";
import { restoreQuestion, restoreActivity, restoreWorksheet } from "../data/teachingDB.js";
import { restoreIdea } from "../data/personalDB.js";
import { restoreVocabEntries } from "../data/userdata.js";
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
} from "../data/trashStore.js";
import { purgeExpiredTrashNow, hardDeleteBook } from "../data/trashPurge.js";
import { getAutoBackupMeta, getAutoBackupPayload, deleteAutoBackup } from "../services/autoBackup.js";
import { checkOrphanData, getStorageStats } from "../services/dataIntegrity.js";
import { runStorageHealth } from "../core/storageHealth.js";
import FileDropzone from "../components/FileDropzone.jsx";
import { uiMessage } from "../core/errors.js";

const IMPORT_MAX_BYTES = 200 * 1024 * 1024;

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DataToolsView() {
  const [message, setMessage] = useState(null);
  const [lastBackup, setLastBackup] = useState(() => Number(safeGetString("sgk_last_backup", "0")) || 0);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);
  const [pendingText, setPendingText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [tocBooks, setTocBooks] = useState(() => getMergedTocBooks());
  const [tocMessage, setTocMessage] = useState(null);
  const [selectedBookKey, setSelectedBookKey] = useState("");
  const [trash, setTrash] = useState(() => listTrash());
  const [legacyBackups, setLegacyBackups] = useState(() => getAutoBackupMeta().snapshots);
  const [wipeArmed, setWipeArmed] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setTrash(listTrash());
      setLegacyBackups(getAutoBackupMeta().snapshots);
    };
    const off = appEvents.on(AppEvents.DATA_UPDATED, refresh);
    return () => off();
  }, []);

  useEffect(() => {
    if (!wipeArmed) return undefined;
    const timeout = setTimeout(() => setWipeArmed(false), 8000);
    return () => clearTimeout(timeout);
  }, [wipeArmed]);

  const customTocBooks = useMemo(() => getCustomTocBooks(), [tocBooks]);
  const tocItemCount = useMemo(
    () => tocBooks.reduce((sum, book) => sum + (book.items?.length || 0), 0),
    [tocBooks],
  );
  const storageStats = useMemo(() => getStorageStats(), [lastBackup, health]);

  const notify = (kind, text) => setMessage({ kind, text });
  const refreshToc = () => setTocBooks(getMergedTocBooks());

  const doExport = async () => {
    setBusy("backup");
    try {
      const result = await exportBackup();
      const timestamp = Date.now();
      const saved = safeSetString("sgk_last_backup", String(timestamp));
      if (!saved.ok) {
        console.warn("[DataToolsView] Could not store the last-backup timestamp", saved);
      }
      setLastBackup(timestamp);
      appEvents.emit(AppEvents.DATA_UPDATED, { source: "backup-export" });
      const warning = !result.indexedDataAvailable
        ? " IndexedDB không khả dụng nên file có thể thiếu dữ liệu."
        : !result.indexedDataComplete
          ? " File chưa chứa đầy đủ dữ liệu IndexedDB."
          : "";
      notify("ok", `Đã tải file sao lưu gồm ${result.total} mục dữ liệu.${warning} Hãy lưu file ở nơi an toàn.`);
    } catch (error) {
      notify("err", `Không tạo được bản sao lưu: ${uiMessage(error, "không rõ nguyên nhân")}`);
    } finally {
      setBusy("");
    }
  };

  const readBackupFile = (file) => {
    if (!file) return;
    setPreview(null);
    setPendingText("");
    setConfirmed(false);
    setMessage(null);
    if (file.size > IMPORT_MAX_BYTES) {
      notify("err", `File vượt quá giới hạn ${formatBytes(IMPORT_MAX_BYTES)}.`);
      return;
    }
    if (!/\.json$/i.test(file.name || "") && file.type !== "application/json") {
      notify("err", "Hãy chọn file sao lưu định dạng .json.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const result = parseBackupPreview(text);
      if (!result.valid) {
        notify("err", `File sao lưu không hợp lệ: ${result.error}`);
        return;
      }
      setPendingText(text);
      setPreview(result.preview);
    };
    reader.onerror = () => notify("err", "Không đọc được file đã chọn.");
    reader.readAsText(file);
  };

  const confirmRestore = async () => {
    if (!pendingText || !confirmed) return;
    setBusy("restore");
    try {
      const result = await importBackup(pendingText);
      const payload = JSON.parse(pendingText);
      const missing = Object.keys(payload.data || {}).filter(
        (key) => isBackupSnapshotKey(key) && localStorage.getItem(key) == null,
      );
      if (missing.length || result.count !== result.total) {
        notify("err", `Đã khôi phục nhưng xác minh chưa hoàn tất (${missing.length} mục còn thiếu). Hãy kiểm tra dữ liệu trước khi tiếp tục.`);
        return;
      }
      setPreview(null);
      setPendingText("");
      setConfirmed(false);
      notify("ok", "Khôi phục và xác minh xong. Ứng dụng sẽ tải lại.");
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      notify("err", `Không khôi phục được: ${uiMessage(error, "không rõ nguyên nhân")}`);
    } finally {
      setBusy("");
    }
  };

  const runUnifiedCheck = async () => {
    setHealthBusy(true);
    setHealth(null);
    try {
      const books = safeGetJSON("sgk_books", [], Array.isArray);
      const [storage, orphans] = await Promise.all([
        runStorageHealth({ books }),
        checkOrphanData(books),
      ]);
      setHealth({ storage, orphans, stats: getStorageStats(), checkedAt: Date.now() });
    } catch (error) {
      notify("err", `Không kiểm tra được toàn bộ dữ liệu: ${uiMessage(error, "không rõ nguyên nhân")}`);
    } finally {
      setHealthBusy(false);
    }
  };

  const restoreLegacyBackup = async (snapshot) => {
    try {
      const text = await getAutoBackupPayload(snapshot.id);
      if (!text) throw new Error("Không đọc được bản sao lưu cũ này.");
      const result = parseBackupPreview(text);
      if (!result.valid) throw new Error(result.error);
      setPendingText(text);
      setPreview(result.preview);
      setConfirmed(false);
      document.getElementById("data-restore")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      notify("err", `Không mở được bản sao lưu cũ: ${uiMessage(error, "không rõ nguyên nhân")}`);
    }
  };

  const restoreTrashItem = (item) => {
    const taken = takeFromTrash(item.id);
    if (!taken) {
      notify("err", "Không khôi phục được mục này.");
      return;
    }
    try {
      if (taken.type === TRASH_TYPE.PLAN) saveKhbdPlan(taken.payload);
      else if (taken.type === TRASH_TYPE.QUESTION) restoreQuestion(taken.payload);
      else if (taken.type === TRASH_TYPE.VOCAB) {
        const entries = Array.isArray(taken.payload?.entries)
          ? taken.payload.entries
          : Array.isArray(taken.payload)
            ? taken.payload
            : taken.payload?.id
              ? [taken.payload]
              : [];
        restoreVocabEntries(entries);
      } else if (taken.type === TRASH_TYPE.ACTIVITY) restoreActivity(taken.payload);
      else if (taken.type === TRASH_TYPE.WORKSHEET) restoreWorksheet(taken.payload);
      else if (taken.type === TRASH_TYPE.IDEA) restoreIdea(taken.payload);
    } catch (error) {
      notify("err", `Khôi phục lỗi: ${uiMessage(error, "không rõ nguyên nhân")}`);
      return;
    }
    setTrash(listTrash());
    notify("ok", `Đã khôi phục “${taken.label}”.`);
  };

  const deleteTrashItem = async (item) => {
    if (!window.confirm(`Xóa vĩnh viễn “${item.label}”? Không thể hoàn tác.`)) return;
    if (item.type === TRASH_TYPE.BOOK && item.meta?.filename) {
      try {
        await hardDeleteBook(item.meta.filename);
      } catch (error) {
        notify("err", `Không xóa được file sách: ${uiMessage(error, "không rõ nguyên nhân")}`);
        return;
      }
    }
    removeFromTrash(item.id);
    setTrash(listTrash());
    notify("ok", `Đã xóa vĩnh viễn “${item.label}”.`);
  };

  const emptyAllTrash = async () => {
    if (!trash.length || !window.confirm(`Xóa vĩnh viễn ${trash.length} mục trong thùng rác?`)) return;
    try {
      for (const item of trash) {
        if (item.type === TRASH_TYPE.BOOK && item.meta?.filename) await hardDeleteBook(item.meta.filename);
      }
      emptyTrash();
      setTrash([]);
      notify("ok", "Đã dọn thùng rác.");
    } catch (error) {
      setTrash(listTrash());
      notify("err", `Không dọn hết được thùng rác: ${uiMessage(error, "không rõ nguyên nhân")}`);
    }
  };

  const purgeExpiredTrash = async () => {
    try {
      const result = await purgeExpiredTrashNow();
      setTrash(listTrash());
      notify("ok", result.expired
        ? `Đã dọn ${result.expired} mục hết hạn.`
        : "Không có mục nào hết hạn.");
    } catch (error) {
      notify("err", `Không dọn được mục hết hạn: ${uiMessage(error, "không rõ nguyên nhân")}`);
    }
  };

  const clearRebuildableCache = async () => {
    if (!window.confirm("Xóa cache có thể dựng lại được? Dữ liệu cá nhân và file sách sẽ được giữ nguyên.")) return;
    setBusy("cache");
    try {
      let removed = 0;
      const failures = [];
      for (const key of listKeys()) {
        if (!isCacheKey(key)) continue;
        const result = safeRemove(key);
        if (result.ok) removed += 1;
        else failures.push(key);
      }
      if (indexedDBService.constructor.isAvailable()) {
        for (const store of [STORES.OCR, STORES.SEARCH_INDEX]) {
          const cleared = await indexedDBService.clear(store);
          if (cleared) removed += 1;
          else failures.push(store);
        }
      }
      if (failures.length) {
        notify("err", `Đã dọn ${removed} mục cache; không dọn được ${failures.join(", ")}.`);
      } else {
        setHealth(null);
        notify("ok", `Đã dọn cache có thể dựng lại (${removed} mục/kho).`);
      }
    } catch (error) {
      notify("err", `Không dọn được cache: ${uiMessage(error, "không rõ nguyên nhân")}`);
    } finally {
      setBusy("");
    }
  };

  const doWipe = async () => {
    if (!lastBackup) {
      notify("err", "Hãy tải file sao lưu trước khi xóa dữ liệu.");
      setWipeArmed(false);
      return;
    }
    if (!wipeArmed) {
      setWipeArmed(true);
      notify("err", "Bấm nút xác nhận lần nữa trong 8 giây để xóa toàn bộ dữ liệu ứng dụng.");
      return;
    }
    setWipeArmed(false);
    setBusy("wipe");
    try {
      await wipeAppData();
      notify("ok", "Đã xóa dữ liệu ứng dụng. Ứng dụng sẽ tải lại.");
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      notify("err", `Không xóa được dữ liệu: ${uiMessage(error, "không rõ nguyên nhân")}`);
    } finally {
      setBusy("");
    }
  };

  const downloadExcel = async (data, filename, successText) => {
    try {
      const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTocMessage({ kind: "ok", text: successText });
    } catch (error) {
      setTocMessage({ kind: "err", text: uiMessage(error, "không rõ nguyên nhân") });
    }
  };

  const importTocExcel = async (file) => {
    if (!file) return;
    try {
      const selected = selectedBookKey ? tocBooks.find((book) => book.key === selectedBookKey) || null : null;
      const books = await parseTocExcel(await file.arrayBuffer(), selected);
      for (const book of books) upsertTocBook(book);
      refreshToc();
      setTocMessage({
        kind: "ok",
        text: `Đã nhập ${books.length} sách, ${books.reduce((sum, book) => sum + book.items.length, 0)} mục lục.`,
      });
    } catch (error) {
      setTocMessage({ kind: "err", text: uiMessage(error, "không rõ nguyên nhân") });
    }
  };

  const renderMessage = () => message && (
    <div className={`dt-msg ${message.kind === "err" ? "err" : "ok"}`} role={message.kind === "err" ? "alert" : "status"}>
      {message.kind === "err" ? <AlertTriangle size={16} /> : <Check size={16} />}
      <span>{message.text}</span>
      <button className="btn btn-ghost btn-xs" onClick={() => setMessage(null)} aria-label="Đóng thông báo"><X size={12} /></button>
    </div>
  );

  const healthSummary = health?.storage?.summary;

  return (
    <div className="datatools-view storage-center">
      <header className="dt-header storage-center-hero">
        <div className="dt-header-left">
          <div className="dt-iconBox" aria-hidden="true"><DatabaseBackup size={22} /></div>
          <div>
            <h1 className="dt-title">Dữ liệu & sao lưu</h1>
            <p className="dt-subtitle">Một nơi để sao lưu, khôi phục và kiểm tra dữ liệu ứng dụng.</p>
          </div>
        </div>
        <div className="storage-center-status">
          <span className="storage-status-dot" />
          {lastBackup ? `Sao lưu gần nhất · ${new Date(lastBackup).toLocaleString("vi-VN")}` : "Chưa có bản sao lưu"}
        </div>
      </header>

      {renderMessage()}

      <section className="storage-primary-card" aria-labelledby="storage-backup-title">
        <div className="storage-primary-copy">
          <span className="storage-eyebrow"><ShieldCheck size={14} /> AN TOÀN DỮ LIỆU</span>
          <h2 id="storage-backup-title">Sao lưu mọi dữ liệu ứng dụng</h2>
          <p>
            Bao gồm cài đặt, mục lục tùy chỉnh, giáo án, ghi chú và dữ liệu trong các kho ứng dụng.
            Không bao gồm file PDF sách giáo khoa.
          </p>
        </div>
        <button className="btn btn-primary storage-backup-button" onClick={doExport} disabled={!!busy}>
          <Download size={17} /> {busy === "backup" ? "Đang tạo bản sao…" : "Tạo file sao lưu"}
        </button>
        <div className="storage-primary-foot">
          <span><HardDrive size={14} /> {storageStats.backupKeys} mục dữ liệu · {formatBytes(storageStats.backupBytes)}</span>
          <span>File JSON · Lưu trên thiết bị của bạn</span>
        </div>
      </section>

      <section className="dt-card" id="data-restore" aria-labelledby="dt-restore-title">
        <div className="dt-card-header">
          <span className="dt-card-header-icon"><RotateCcw size={16} /></span>
          <span id="dt-restore-title">Khôi phục từ file</span>
        </div>
        <div className="dt-card-body">
          <p className="dt-hint">Chọn file sao lưu .json. Bạn sẽ xem lại nội dung và xác nhận trước khi thay dữ liệu hiện tại.</p>
          <FileDropzone
            accept=".json,application/json"
            multiple={false}
            title="Chọn hoặc thả file sao lưu vào đây"
            hint="Tối đa 200 MB"
            compact
            onFiles={(files) => readBackupFile(Array.isArray(files) ? files[0] : files)}
            onError={(text) => notify("err", text)}
          />
          {preview && (
            <div className="dt-import-review" role="region" aria-labelledby="preview-title">
              <div className="dt-import-review-heading">
                <div>
                  <h3 id="preview-title">Xem lại bản sao lưu</h3>
                  <p>{preview.createdAt ? new Date(preview.createdAt).toLocaleString("vi-VN") : "Ngày tạo không có"} · {preview.localCount} mục · {preview.indexedTotal} bản ghi</p>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => { setPreview(null); setPendingText(""); setConfirmed(false); }}>Hủy</button>
              </div>
              {!preview.indexedDataComplete && (
                <div className="dt-warning" role="alert">
                  <AlertTriangle size={16} />
                  <span>Bản sao lưu có thể thiếu dữ liệu IndexedDB{preview.indexedDataSkippedStores.length ? ` (${preview.indexedDataSkippedStores.join(", ")})` : ""}.</span>
                </div>
              )}
              <label className="dt-import-confirm">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                Tôi hiểu dữ liệu hiện tại sẽ được thay bằng bản sao lưu này.
              </label>
              <button className="btn btn-primary" onClick={confirmRestore} disabled={!confirmed || !!busy}>
                <Check size={14} /> {busy === "restore" ? "Đang khôi phục…" : "Xác nhận khôi phục"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="storage-check-card" aria-labelledby="storage-check-title">
        <div className="storage-check-copy">
          <span className="dt-card-header-icon"><ShieldCheck size={16} /></span>
          <div>
            <h2 id="storage-check-title">Kiểm tra dữ liệu</h2>
            <p>Kiểm tra lỗi lưu trữ, dữ liệu liên kết sách, mục lục giáo án và dung lượng.</p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={runUnifiedCheck} disabled={healthBusy}>
          <ShieldCheck size={15} /> {healthBusy ? "Đang kiểm tra…" : "Kiểm tra ngay"}
        </button>
        {health && (
          <div className="storage-check-report" role="status" aria-live="polite">
            <strong>
              {healthSummary.healthy && !healthSummary.hasWarnings && health.orphans.totalOrphans === 0
                ? "Dữ liệu hoạt động bình thường"
                : "Đã hoàn tất kiểm tra"}
            </strong>
            <div className="storage-report-grid">
              <span>{healthSummary.totalErrors} lỗi lưu trữ</span>
              <span>{health.orphans.totalOrphans} liên kết không còn sách</span>
              <span>{healthSummary.orphanAssets} tệp thừa</span>
              <span>{health.storage.khbd.invalid.length} giáo án lỗi</span>
              <span>{health.storage.khbd.legacyKeys.length} mục KHBD cũ</span>
              <span>{healthSummary.quotaAvailable ? "Bộ nhớ ghi được" : "Không ghi được vào bộ nhớ"}</span>
            </div>
            <details>
              <summary>Xem chi tiết kết quả</summary>
              <ul>
                <li>JSON lỗi: {health.storage.corrupted.length}; dữ liệu sai cấu trúc: {health.storage.schemaInvalid.length}.</li>
                <li>Liên kết sách thừa: ghi chú {health.orphans.orphanNotes.length}, đánh dấu {health.orphans.orphanMarks.length}, trích dẫn {health.orphans.orphanRefs.length}, đoạn trích {health.orphans.orphanClips.length}, khái niệm {health.orphans.orphanConcepts.length}.</li>
                <li>Giáo án: {health.storage.khbd.count} bài, {formatBytes(health.storage.khbd.bytes)}; quá lớn {health.storage.khbd.oversized.length}.</li>
                <li>Dữ liệu: {health.stats.totalKeys} mục, {formatBytes(health.stats.totalBytes)}.</li>
              </ul>
            </details>
            <small>Đã kiểm tra {new Date(health.checkedAt).toLocaleString("vi-VN")}. Không có dữ liệu nào bị tự ý sửa hoặc xóa.</small>
          </div>
        )}
      </section>

      {legacyBackups.length > 0 && (
        <details className="dt-card storage-legacy-card">
          <summary className="dt-card-header"><span className="dt-card-header-icon"><DatabaseBackup size={16} /></span> Bản sao lưu cũ trên thiết bị ({legacyBackups.length})</summary>
          <div className="dt-card-body">
            <p className="dt-hint">Các bản tự động tạo trước đây được giữ nguyên. Từ nay, bản sao lưu mới chỉ được tạo khi bạn bấm nút.</p>
            {legacyBackups.map((snapshot) => (
              <div className="storage-legacy-row" key={snapshot.id}>
                <span>{new Date(snapshot.createdAt).toLocaleString("vi-VN")} · {formatBytes(snapshot.bytes)}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => restoreLegacyBackup(snapshot)}>Xem / khôi phục</button>
                <button className="btn btn-ghost btn-xs" aria-label="Xóa bản sao lưu cũ" onClick={async () => {
                  if (!window.confirm("Xóa bản sao lưu cũ này?")) return;
                  try {
                    await deleteAutoBackup(snapshot.id);
                    setLegacyBackups(getAutoBackupMeta().snapshots);
                  } catch (error) {
                    notify("err", `Không xóa được bản sao lưu: ${uiMessage(error, "không rõ nguyên nhân")}`);
                  }
                }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="dt-card">
        <summary className="dt-card-header"><span className="dt-card-header-icon"><BookMarked size={16} /></span> Mục lục tùy chỉnh ({customTocBooks.length})</summary>
        <div className="dt-card-body">
          <p className="dt-hint">Mục lục nhập thêm được lưu cùng dữ liệu ứng dụng và có trong file sao lưu.</p>
          <div className="storage-inline-actions">
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              const data = await generateTocTemplateExcel(tocBooks);
              await downloadExcel(data, "mau-muc-luc.xlsx", "Đã tải mẫu Excel mục lục.");
            }}><Download size={14} /> Tải mẫu Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              const data = await exportTocToExcel(tocBooks);
              await downloadExcel(data, `muc-luc-${new Date().toISOString().slice(0, 10)}.xlsx`, `Đã xuất ${tocBooks.length} sách / ${tocItemCount} mục.`);
            }}><Upload size={14} /> Xuất Excel</button>
            <span className="dt-info-badge">{tocBooks.length} sách · {tocItemCount} mục</span>
          </div>
          <div className="storage-inline-actions">
            <select className="form-control" value={selectedBookKey} onChange={(event) => setSelectedBookKey(event.target.value)} aria-label="Chọn sách để nhập mục lục">
              <option value="">Nhập nhiều sách (Excel có mã sách)</option>
              {tocBooks.map((book) => <option key={book.key} value={book.key}>{book.title} — Lớp {book.grade}</option>)}
            </select>
            <FileDropzone
              accept=".xlsx,.xls"
              multiple={false}
              title="Chọn file Excel mục lục"
              hint=".xlsx hoặc .xls"
              compact
              onFiles={(files) => importTocExcel(Array.isArray(files) ? files[0] : files)}
              onError={(text) => setTocMessage({ kind: "err", text })}
            />
          </div>
          {tocMessage && <p className={`dt-msg ${tocMessage.kind === "err" ? "err" : "ok"}`} role="status">{tocMessage.text}</p>}
          {customTocBooks.map((book) => (
            <div className="storage-legacy-row" key={book.key}>
              <span><b>{book.title}</b> · {book.items?.length || 0} mục</span>
              <button className="btn btn-ghost btn-xs" aria-label={`Xóa mục lục ${book.title}`} onClick={() => {
                if (!window.confirm(`Xóa mục lục tùy chỉnh “${book.title}”?`)) return;
                deleteCustomTocBook(book.key);
                refreshToc();
              }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </details>

      <details className="dt-card dt-trash-card">
        <summary className="dt-card-header"><span className="dt-card-header-icon"><Trash2 size={16} /></span> Thùng rác ({trash.length})</summary>
        <div className="dt-card-body">
          <p className="dt-hint">Mục đã xóa được giữ tối đa {TRASH_TTL_DAYS} ngày để bạn có thể khôi phục.</p>
          {trash.length > 0 && (
            <>
              <div className="storage-inline-actions">
                <button className="btn btn-ghost btn-sm" onClick={purgeExpiredTrash}>Dọn mục hết hạn</button>
                <button className="btn btn-danger btn-sm" onClick={emptyAllTrash}>Xóa toàn bộ thùng rác</button>
              </div>
              {trash.map((item) => (
                <div className="storage-legacy-row" key={item.id}>
                  <span><b>{TRASH_TYPE_LABEL[item.type] || item.type}</b> · {item.label} · {isExpired(item) ? "hết hạn" : `còn ${daysLeft(item)} ngày`}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => restoreTrashItem(item)}>Khôi phục</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => deleteTrashItem(item)} aria-label={`Xóa vĩnh viễn ${item.label}`}><Trash2 size={13} /></button>
                </div>
              ))}
            </>
          )}
          {trash.length === 0 && <p className="dt-hint">Thùng rác đang trống.</p>}
        </div>
      </details>

      <details className="dt-card">
        <summary className="dt-card-header"><span className="dt-card-header-icon"><HardDrive size={16} /></span> Giải phóng dung lượng</summary>
        <div className="dt-card-body">
          <p className="dt-hint">Chỉ xóa cache tìm kiếm/OCR có thể tạo lại. Không xóa cài đặt, dữ liệu cá nhân hay file SGK.</p>
          <button className="btn btn-ghost btn-sm" onClick={clearRebuildableCache} disabled={!!busy}>
            {busy === "cache" ? "Đang dọn…" : "Dọn cache có thể dựng lại"}
          </button>
        </div>
      </details>

      <details className="dt-card storage-danger-card">
        <summary className="dt-card-header"><span className="dt-card-header-icon"><AlertTriangle size={16} /></span> Xóa dữ liệu ứng dụng</summary>
        <div className="dt-card-body">
          <p className="dt-hint">Xóa dữ liệu ứng dụng trên thiết bị này. File sách giáo khoa không bị xóa. Hãy tải file sao lưu trước.</p>
          <button className="btn btn-danger" onClick={doWipe} disabled={!!busy || !lastBackup}>
            <Trash2 size={14} /> {wipeArmed ? "Bấm lần nữa để xác nhận" : "Xóa toàn bộ dữ liệu"}
          </button>
        </div>
      </details>

      <footer className="storage-center-foot"><FileText size={14} /> Bản sao lưu gồm dữ liệu ứng dụng; file PDF sách giáo khoa được giữ riêng.</footer>
    </div>
  );
}
