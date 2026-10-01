// ── Sync Panel — khớp với app design system (tokens + 3D buttons + card) ──────
import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Download,
  Upload,
  History,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  FileText,
  Database,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import syncService from './syncService';
import FileDropzone from './components/FileDropzone.jsx';

const SyncPanel = ({ isOpen, onClose }) => {
  const [syncStatuses, setSyncStatuses] = useState({});
  const [selectedType, setSelectedType] = useState(syncService.SYNC_TYPES.ALL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [expandedSection, setExpandedSection] = useState('statuses');

  useEffect(() => {
    if (isOpen) loadSyncStatuses();
  }, [isOpen]);

  useEffect(() => {
    const handleStatusUpdate = (e) => {
      const { syncType, status } = e.detail;
      setSyncStatuses((prev) => ({ ...prev, [syncType]: status }));
    };
    window.addEventListener('sync-status-updated', handleStatusUpdate);
    return () => window.removeEventListener('sync-status-updated', handleStatusUpdate);
  }, []);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  const loadSyncStatuses = () => {
    const statuses = syncService.getAllSyncStatuses();
    setSyncStatuses(statuses);
  };

  const handleSync = async (type) => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncService.performSync(type, { validate: true, backup: true });
      setSyncResult(result);
      loadSyncStatuses();
      syncService.addSyncHistoryEntry(type, {
        action: 'sync',
        success: result.success,
        itemCount: result.dataCount || 0,
      });
    } catch (error) {
      setSyncResult({ success: false, error: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExport = () => {
    try {
      const exportData = syncService.exportData(selectedType);
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sgk-backup-${selectedType}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSyncResult({ success: true, message: 'Xuất dữ liệu thành công' });
    } catch (error) {
      setSyncResult({ success: false, error: error.message });
    }
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      const result = await syncService.importData(importData, { merge: true, validate: true });
      setSyncResult(result);
      loadSyncStatuses();
    } catch (error) {
      setSyncResult({ success: false, error: error.message });
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      // reset để chọn lại cùng file vẫn hoạt động
      e.target.value = "";
      await handleImportFile(file);
    };
    input.click();
  };

  const handleShowHistory = (type) => {
    setSelectedType(type);
    setHistory(syncService.getSyncHistory(type));
    setShowHistory(true);
  };

  const handleResetStatus = (type) => {
    syncService.resetSyncStatus(type);
    loadSyncStatuses();
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case syncService.SYNC_STATUS.SUCCESS:
        return <CheckCircle size={16} style={{ color: 'var(--success)' }} />;
      case syncService.SYNC_STATUS.ERROR:
        return <AlertCircle size={16} style={{ color: 'var(--danger)' }} />;
      case syncService.SYNC_STATUS.SYNCING:
        return <RefreshCw size={16} className="spinner" style={{ color: 'var(--pen-blue)' }} />;
      default:
        return <Clock size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case syncService.SYNC_STATUS.SUCCESS: return 'Đã đồng bộ';
      case syncService.SYNC_STATUS.ERROR: return 'Lỗi';
      case syncService.SYNC_STATUS.SYNCING: return 'Đang đồng bộ...';
      default: return 'Chưa đồng bộ';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString('vi-VN');
  };

  const syncTypeLabels = {
    [syncService.SYNC_TYPES.QUESTIONS]: 'Ngân hàng câu hỏi',
    [syncService.SYNC_TYPES.LESSON_PLANS]: 'Kế hoạch bài dạy',
    [syncService.SYNC_TYPES.ACTIVITIES]: 'Hoạt động mẫu',
    [syncService.SYNC_TYPES.WORKSHEETS]: 'Phiếu học tập',
    [syncService.SYNC_TYPES.VOCABULARY]: 'Từ vựng',
    [syncService.SYNC_TYPES.BOOKMARKS]: 'Bookmarks',
    [syncService.SYNC_TYPES.CLIPS]: 'Clips nghiên cứu',
    [syncService.SYNC_TYPES.REFS]: 'Tài liệu tham khảo',
    [syncService.SYNC_TYPES.CONCEPTS]: 'Khái niệm',
    [syncService.SYNC_TYPES.ALL]: 'Tất cả dữ liệu',
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay sync-panel-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="sync-title">
      <div className="modal-content sync-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header — khớp app: iconBox + title + close ghost */}
        <div className="sync-panel-header">
          <h3 id="sync-title" className="sync-panel-title">
            <span className="sync-panel-title-icon" aria-hidden="true"><Database size={16} /></span>
            Đồng bộ dữ liệu
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Đóng"><X size={14} /></button>
        </div>

        <div className="sync-panel-body">
          {/* Result — dùng tokens success-soft/danger-soft, border 1.5px, radius 10 */}
          {syncResult && (
            <div className={`sync-result ${syncResult.success ? 'success' : 'error'}`} role="status">
              {syncResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span>{syncResult.message || syncResult.error}</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setSyncResult(null)} aria-label="Ẩn thông báo"><X size={12} /></button>
            </div>
          )}

          {/* Loại dữ liệu — form-label + form-control (18-forms.css) */}
          <div className="sync-field">
            <label className="form-label" htmlFor="sync-type">Chọn loại dữ liệu</label>
            <select id="sync-type" className="form-control" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
              {Object.entries(syncTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Actions — 3 nút khớp 03-buttons.css: primary 3D red, secondary blue outline */}
          <div className="sync-actions">
            <button className="btn btn-primary" onClick={() => handleSync(selectedType)} disabled={isSyncing}>
              {isSyncing ? <><RefreshCw size={16} className="spinner" /> Đang đồng bộ...</> : <><RefreshCw size={16} /> Đồng bộ ngay</>}
            </button>
            <button className="btn btn-secondary" onClick={handleExport} disabled={isSyncing}><Download size={16} /> Xuất bản sao</button>
            <button className="btn btn-secondary" onClick={handleImport} disabled={isSyncing}><Upload size={16} /> Nhập bản sao</button>
          </div>
          <FileDropzone
            accept=".json,application/json"
            multiple={false}
            title="Kéo thả file bản sao (.json) vào đây để nhập"
            hint="Hoặc bấm để chọn file"
            compact
            onFiles={(f) => handleImportFile(Array.isArray(f) ? f[0] : f)}
            onError={(m) => setSyncResult({ success: false, error: m })}
          />

          {/* Trạng thái — card khớp 13-override-sidebar / 06-views-core */}
          <div className="sync-card">
            <button className="sync-card-header" onClick={() => toggleSection('statuses')} aria-expanded={expandedSection === 'statuses'}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={16} /> Trạng thái đồng bộ</span>
              {expandedSection === 'statuses' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {expandedSection === 'statuses' && (
              <div className="sync-card-body">
                {Object.keys(syncStatuses).length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.84rem', fontWeight: 600 }}>Chưa có trạng thái — hãy Đồng bộ ngay.</p>
                ) : Object.entries(syncStatuses).map(([type, status]) => (
                  <div key={type} className="sync-status-row">
                    <div className="sync-status-left">
                      {getStatusIcon(status?.status)}
                      <span className="sync-status-label">{syncTypeLabels[type] || type}</span>
                    </div>
                    <div className="sync-status-right">
                      <span className="sync-status-text">{getStatusText(status?.status)}</span>
                      <span className="sync-status-time">{formatTimestamp(status?.lastSync)}</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleShowHistory(type)} title="Xem lịch sử" aria-label={`Lịch sử ${type}`}><History size={14} /></button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleResetStatus(type)} title="Reset trạng thái" aria-label={`Reset ${type}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lịch sử */}
          {showHistory && (
            <div className="sync-history">
              <div className="sync-history-head">
                <h4 className="sync-history-title"><History size={16} /> Lịch sử — {syncTypeLabels[selectedType]}</h4>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowHistory(false)} aria-label="Đóng lịch sử"><X size={14} /></button>
              </div>
              {history.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', margin: 0, padding: '0.85rem', fontSize: '0.84rem', fontWeight: 600 }}>Chưa có lịch sử đồng bộ</p>
              ) : (
                <div className="sync-history-list">
                  {history.map((entry, idx) => (
                    <div key={idx} className="sync-history-entry">
                      <div className="sync-history-top">
                        <span>{entry.action === 'sync' ? 'Đồng bộ' : 'Nhập dữ liệu'}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 600 }}>{formatTimestamp(entry.timestamp)}</span>
                      </div>
                      <div className="sync-history-meta">
                        {entry.success !== false ? <span style={{ color: 'var(--success)', fontWeight: 800 }}>Thành công</span> : <span style={{ color: 'var(--danger)', fontWeight: 800 }}>Thất bại</span>}
                        <span>• {entry.itemCount || 0} mục</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="sync-footer">
            <button className="btn btn-ghost" onClick={onClose} disabled={isSyncing}>Đóng</button>
            <button className="btn btn-secondary" onClick={() => handleSync(selectedType)} disabled={isSyncing}><RefreshCw size={14} className={isSyncing ? 'spinner' : ''} /> Đồng bộ</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncPanel;
