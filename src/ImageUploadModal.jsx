// ── Image Upload Modal Component ───────────────────────────────────────────
// Modal component for uploading images and analyzing them with AI
// Supports multi-image drag-and-drop, file selection, and batch preview
// All analysis modes now support multiple images (batch)

import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  X, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Sparkles,
  Eye,
  Download,
  Trash2,
  Plus,
  Layers
} from 'lucide-react';
import imageAnalysisService from './imageAnalysisService';
import { getGeminiApiKey } from './storage';
import { safeGetJSON, safeSetJSON, safeRemove } from './safeStorage';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

const ImageUploadModal = ({ 
  isOpen, 
  onClose, 
  analysisType = 'general',
  onAnalysisComplete,
  title = 'Phân tích ảnh với AI'
}) => {
  const [imageItems, setImageItems] = useState([]); // { id, file, preview, status: 'pending'|'analyzing'|'done'|'error', result, error }
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [combinedResult, setCombinedResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [uploadHistory, setUploadHistory] = useState(() => {
    try {
      return safeGetJSON('image_upload_history', [], Array.isArray);
    } catch (e) {
      console.warn("[ImageUploadModal] safeGetJSON failed for image_upload_history", e);
      return [];
    }
  });
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Reset state when modal opens/closes
  const resetState = useCallback(() => {
    // Revoke previews to avoid memory leak
    setImageItems(prev => {
      prev.forEach(it => { if(it.preview) try{ URL.revokeObjectURL(it.preview); }catch{} });
      return [];
    });
    setImageItems([]);
    setIsAnalyzing(false);
    setCombinedResult(null);
    setError(null);
    setDragActive(false);
  }, []);

  // Handle modal close
  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // Create preview for a file
  const createPreview = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  // Handle files selection (multi)
  const handleFilesSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Check total count
    if (imageItems.length + fileArray.length > MAX_FILES) {
      setError(`Tối đa ${MAX_FILES} ảnh mỗi lần. Bạn đã chọn ${imageItems.length} ảnh, đang thêm ${fileArray.length} ảnh.`);
      return;
    }

    let hasError = false;
    const newItems = [];

    for (const file of fileArray) {
      if (!VALID_TYPES.includes(file.type)) {
        setError(`File "${file.name}" không hợp lệ. Chỉ chấp nhận: JPG, PNG, GIF, WebP`);
        hasError = true;
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" quá lớn (${(file.size/1024/1024).toFixed(1)}MB). Tối đa 10MB.`);
        hasError = true;
        continue;
      }
      const preview = await createPreview(file);
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        file,
        preview,
        status: 'pending',
        result: null,
        error: null
      });
    }

    if (newItems.length > 0) {
      setError(hasError ? `Đã thêm ${newItems.length}/${fileArray.length} ảnh hợp lệ.` : null);
      setImageItems(prev => [...prev, ...newItems]);
      setCombinedResult(null);
    } else if (!hasError) {
      setError('Không có file hợp lệ nào được thêm.');
    }
  }, [imageItems.length]);

  // Handle drag events — dùng counter chống nhấp nháy + chỉ bật khi kéo file thật
  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    try { const t = e.dataTransfer?.types; const has = t ? (Array.isArray(t) ? t.includes("Files") : [...t].includes("Files")) : false; if (!has) return; } catch {}
    dragCounterRef.current += 1;
    setDragActive(true);
  }, []);
  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {}
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
    }
  }, [handleFilesSelect]);

  // Handle input change (multi)
  const handleInputChange = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelect(e.target.files);
      // Reset input so same file can be selected again if removed
      e.target.value = '';
    }
  }, [handleFilesSelect]);

  // Remove single image
  const handleRemoveImage = useCallback((id) => {
    setImageItems(prev => {
      const target = prev.find(it => it.id === id);
      if (target?.preview) try{ /* data URL no need revoke */ }catch{}
      const next = prev.filter(it => it.id !== id);
      if (next.length === 0) setCombinedResult(null);
      return next;
    });
    setError(null);
  }, []);

  // Clear all
  const handleClearAll = useCallback(() => {
    setImageItems(prev => {
      prev.forEach(it => { if(it.preview) try{}catch{} });
      return [];
    });
    setCombinedResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Save to upload history
  const saveToHistory = useCallback((result, fileCount, totalSize) => {
    if (!result) return;
    const historyEntry = {
      id: Date.now(),
      timestamp: Date.now(),
      analysisType,
      fileCount,
      totalSize,
      success: result.success,
      resultCount: Array.isArray(result.data) ? result.data.length : (result.data?.questions?.length || result.data?.activities?.length || 1),
      summary: result.notes || result.detectedType || `Phân tích ${fileCount} ảnh hoàn tất`
    };
    setUploadHistory(prevHistory => {
      const updatedHistory = [historyEntry, ...prevHistory].slice(0, 20);
      try {
        const res = safeSetJSON('image_upload_history', updatedHistory);
        if (!res.ok) {
          if (res.quota) console.warn("[safeStorage] Quota exceeded on image_upload_history", res);
          else console.warn("[ImageUploadModal] safeSetJSON failed for image_upload_history", res);
        }
      } catch (err) {
        console.warn("[ImageUploadModal] Failed to save upload history:", err);
      }
      return updatedHistory;
    });
  }, [analysisType]);

  const hasApiKey = !!getGeminiApiKey();

  // Analyze all images (batch)
  const handleAnalyze = useCallback(async () => {
    if (imageItems.length === 0) return;
    if (!getGeminiApiKey()) {
      setError('Chưa có Gemini API Key — hãy mở Cài đặt AI để nhập khóa trước khi phân tích ảnh.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setCombinedResult(null);

    // Mark all as analyzing
    setImageItems(prev => prev.map(it => ({ ...it, status: 'analyzing', error: null })));

    try {
      // Use batch service if available, otherwise sequential
      let batchResult;
      if (imageAnalysisService.analyzeImages) {
        batchResult = await imageAnalysisService.analyzeImages(
          imageItems.map(it => it.file),
          analysisType,
          { onProgress: (idx, res) => {
            setImageItems(prev => prev.map((it, i) => i===idx ? { ...it, status: res.success ? 'done' : 'error', result: res, error: res.error || null } : it));
          }}
        );
      } else {
        // Fallback sequential
        const results = [];
        for (let i = 0; i < imageItems.length; i++) {
          try {
            const res = await imageAnalysisService.analyzeImage(imageItems[i].file, analysisType);
            results.push(res);
            setImageItems(prev => prev.map((it, idx) => idx===i ? { ...it, status: 'done', result: res } : it));
          } catch (err) {
            const fail = { success: false, error: err.message };
            results.push(fail);
            setImageItems(prev => prev.map((it, idx) => idx===i ? { ...it, status: 'error', error: err.message, result: fail } : it));
          }
        }
        // Merge via service helper if exists
        if (imageAnalysisService.mergeBatchResults) {
          batchResult = imageAnalysisService.mergeBatchResults(results, analysisType, imageItems.map(it=>it.file));
        } else {
          // Simple merge fallback
          if (analysisType === 'questions') {
            const allQuestions = results.filter(r=>r.success).flatMap(r=> Array.isArray(r.data) ? r.data : []);
            batchResult = { success: allQuestions.length>0, data: allQuestions, confidence: Math.max(...results.map(r=>r.confidence||0)), notes: `${allQuestions.length} câu hỏi từ ${imageItems.length} ảnh`, results };
          } else if (analysisType === 'lessonPlan') {
            // Merge lesson plans: take first as base, append activities
            const successes = results.filter(r=>r.success && r.data);
            if (successes.length===0) throw new Error('Tất cả ảnh phân tích thất bại');
            const base = successes[0].data;
            for(let i=1;i<successes.length;i++){
              const cur = successes[i].data;
              if (Array.isArray(cur.activities)) base.activities = [...(base.activities||[]), ...cur.activities];
              if (Array.isArray(cur.objectives)) base.objectives = [...(base.objectives||[]), ...cur.objectives];
            }
            batchResult = { success: true, data: base, confidence: successes[0].confidence, notes: `Đã gộp ${successes.length}/${imageItems.length} ảnh thành 1 giáo án`, results };
          } else if (analysisType === 'activity') {
            const allActivities = results.filter(r=>r.success).map(r=>r.data);
            batchResult = { success: allActivities.length>0, data: allActivities, confidence: Math.max(...results.map(r=>r.confidence||0)), notes: `${allActivities.length} hoạt động từ ${imageItems.length} ảnh`, results, isBatch: true };
          } else {
            batchResult = { success: results.some(r=>r.success), data: results.filter(r=>r.success).map(r=>r.data), confidence: Math.max(...results.map(r=>r.confidence||0)), notes: `Hoàn tất ${results.filter(r=>r.success).length}/${imageItems.length} ảnh`, results };
          }
        }
      }

      setCombinedResult(batchResult);
      const totalSize = imageItems.reduce((s,it)=>s+it.file.size,0);
      saveToHistory(batchResult, imageItems.length, totalSize);
      
      if (batchResult.success && onAnalysisComplete) {
        onAnalysisComplete(batchResult);
      } else if (!batchResult.success) {
        setError(batchResult.error || 'Một số ảnh phân tích thất bại. Kiểm tra chi tiết từng ảnh.');
      }
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra khi phân tích ảnh');
      console.error('Analysis error:', err);
      // Mark all remaining analyzing as error
      setImageItems(prev => prev.map(it => it.status==='analyzing' ? { ...it, status:'error', error: err.message } : it));
    } finally {
      setIsAnalyzing(false);
    }
  }, [imageItems, analysisType, onAnalysisComplete, saveToHistory]);

  // Clear history
  const clearHistory = useCallback(() => {
    if (confirm('Xóa toàn bộ lịch sử upload?')) {
      setUploadHistory([]);
      try {
        const res = safeRemove('image_upload_history');
        if (!res.ok) console.warn("[ImageUploadModal] safeRemove failed for image_upload_history", res);
      } catch (err) {
        console.warn("[ImageUploadModal] Failed to clear upload history:", err);
      }
    }
  }, []);

  // Load from history
  const loadFromHistory = useCallback((entry) => {
    alert('Đã lưu lịch sử (xem chi tiết trong modal). Chọn ảnh mới để phân tích tiếp.');
  }, []);

  // Download combined result
  const handleDownloadResult = useCallback(() => {
    const target = combinedResult;
    if (!target) return;
    const dataStr = JSON.stringify(target, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analysis-result-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [combinedResult]);

  if (!isOpen) return null;

  const pendingCount = imageItems.filter(it=>it.status==='pending').length;
  const doneCount = imageItems.filter(it=>it.status==='done').length;
  const errorCount = imageItems.filter(it=>it.status==='error').length;
  const analyzingCount = imageItems.filter(it=>it.status==='analyzing').length;

  return (
    <div className="modal-overlay" onClick={handleClose} style={{ zIndex: "var(--z-modal-above)" }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(860px, calc(100vw - 20px))',
          width: 'min(860px, calc(100vw - 20px))',
          maxHeight: '92vh',
          overflow: 'auto'
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem',
          position: 'sticky',
          top: 0,
          background: 'var(--surface)',
          zIndex: 1,
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} />
            {title}
            {imageItems.length > 0 && (
              <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: 12, display:'inline-flex', alignItems:'center', gap:4 }}>
                <Layers size={12} /> {imageItems.length}/{MAX_FILES} ảnh
              </span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {uploadHistory.length > 0 && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => setShowHistory(!showHistory)}
                title="Lịch sử upload"
              >
                📜 {uploadHistory.length}
              </button>
            )}
            <button 
              className="btn btn-ghost btn-xs" 
              onClick={handleClose}
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{ 
            padding: '12px', 
            background: 'var(--color-danger-soft)', 
            border: '1px solid var(--color-danger)', 
            borderRadius: 8,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--color-danger-text)'
          }}>
            <AlertCircle size={16} />
            <span style={{ fontSize:'0.9rem' }}>{error}</span>
          </div>
        )}

        {/* Upload History Panel */}
        {showHistory && (
          <div style={{ 
            marginBottom: '1rem',
            padding: '1rem',
            background: 'var(--surface-soft)',
            border: '1px solid var(--border-color)',
            borderRadius: 8
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '0.5rem'
            }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>📜 Lịch sử upload</h4>
              <button
                className="btn btn-secondary btn-xs"
                onClick={clearHistory}
                title="Xóa lịch sử"
              >
                <Trash2 size={12} />
              </button>
            </div>
            
            {uploadHistory.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Chưa có lịch sử upload
              </p>
            ) : (
              <div style={{ 
                maxHeight: '200px', 
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {uploadHistory.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      padding: '0.5rem',
                      background: 'var(--surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {entry.success ? '✅' : '❌'} {entry.summary}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(entry.timestamp).toLocaleString('vi-VN')} • {entry.fileCount || 1} ảnh • {entry.resultCount} mục
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => loadFromHistory(entry)}
                      title="Xem"
                    >
                      <Eye size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upload area — always visible to allow adding more */}
        <div
          style={{
            border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border-color)'}`,
            borderRadius: 12,
            padding: imageItems.length===0 ? '2rem' : '1rem',
            textAlign: 'center',
            background: dragActive ? 'var(--primary-light)' : 'var(--surface)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: imageItems.length>0 ? '1rem' : 0
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <Upload size={imageItems.length===0 ? 36 : 20} style={{ color: 'var(--text-muted)', marginBottom: imageItems.length===0 ? '0.5rem' : '0.25rem' }} />
          <p style={{ margin: '0.25rem 0', color: 'var(--text-muted)', fontSize: imageItems.length===0 ? '0.95rem' : '0.85rem', fontWeight: 500 }}>
            {imageItems.length===0 ? 'Kéo thả nhiều ảnh vào đây hoặc click để chọn' : 'Click hoặc kéo thêm ảnh (giữ Ctrl để chọn nhiều)'}
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            JPG, PNG, GIF, WebP — tối đa 10MB/ảnh, {MAX_FILES} ảnh/lần
            {imageItems.length>0 && ` • Đã chọn ${imageItems.length} ảnh`}
          </p>
        </div>

        {/* Image grid preview */}
        {imageItems.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
              <h4 style={{ margin:0, fontSize:'0.9rem', display:'flex', alignItems:'center', gap:6 }}>
                <ImageIcon size={14} /> {imageItems.length} ảnh đã chọn
                {doneCount>0 && <span style={{ color:'var(--success)', fontWeight:600 }}>✓ {doneCount} xong</span>}
                {analyzingCount>0 && <span style={{ color:'var(--primary)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><Loader2 size={12} className="spinner" /> {analyzingCount} đang xử lý</span>}
                {errorCount>0 && <span style={{ color:'var(--color-danger)', fontWeight:600 }}>⚠ {errorCount} lỗi</span>}
              </h4>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <button className="btn btn-secondary btn-xs" onClick={()=>fileInputRef.current?.click()} disabled={isAnalyzing || imageItems.length>=MAX_FILES}>
                  <Plus size={12} /> Thêm ảnh
                </button>
                <button className="btn btn-ghost btn-xs" onClick={handleClearAll} disabled={isAnalyzing}>
                  <Trash2 size={12} /> Xóa hết
                </button>
              </div>
            </div>

            <div style={{ 
              display:'grid', 
              gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', 
              gap:'0.75rem',
              maxHeight: '320px',
              overflow: 'auto',
              padding: '0.25rem'
            }}>
              {imageItems.map((item) => (
                <div key={item.id} style={{ 
                  position:'relative',
                  borderRadius:8,
                  overflow:'hidden',
                  border: `1.5px solid ${item.status==='done' ? 'var(--success)' : item.status==='error' ? 'var(--color-danger)' : item.status==='analyzing' ? 'var(--primary)' : 'var(--border-color)'}`,
                  background:'var(--surface-soft)'
                }}>
                  <img 
                    src={item.preview} 
                    alt={item.file.name} 
                    style={{ width:'100%', height:120, objectFit:'cover', display:'block' }} 
                  />
                  {/* Status overlay */}
                  <div style={{ position:'absolute', top:4, left:4, background: item.status==='done' ? 'var(--success)' : item.status==='error' ? 'var(--color-danger)' : item.status==='analyzing' ? 'var(--primary)' : 'rgba(0,0,0,0.55)', color:'white', fontSize:'0.7rem', padding:'2px 6px', borderRadius:99, display:'flex', alignItems:'center', gap:3 }}>
                    {item.status==='pending' && <>⏳ Chờ</>}
                    {item.status==='analyzing' && <><Loader2 size={10} className="spinner" /> Đang xử lý</>}
                    {item.status==='done' && <>✓ Xong</>}
                    {item.status==='error' && <>⚠ Lỗi</>}
                  </div>
                  <button
                    onClick={(e)=>{ e.stopPropagation(); handleRemoveImage(item.id); }}
                    disabled={isAnalyzing}
                    style={{
                      position:'absolute', top:4, right:4,
                      background:'rgba(0,0,0,0.7)', color:'white',
                      border:'none', borderRadius:'50%', width:22, height:22,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      cursor:'pointer'
                    }}
                    title="Xóa ảnh này"
                  >
                    <X size={12} />
                  </button>
                  <div style={{ padding:'0.4rem 0.5rem', background:'var(--surface)' }}>
                    <div style={{ fontSize:'0.7rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={item.file.name}>{item.file.name}</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>{(item.file.size/1024).toFixed(0)}KB • {item.file.type.split('/')[1]?.toUpperCase()}</div>
                    {item.error && <div style={{ fontSize:'0.65rem', color:'var(--color-danger)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={item.error}>⚠ {item.error}</div>}
                  </div>
                </div>
              ))}
            </div>

            {!hasApiKey && (
              <div style={{ padding:'8px 10px', background:'var(--color-warning-soft, #fff3cd)', border:'1px solid #ffc107', borderRadius:8, marginTop:'0.75rem', fontSize:'0.85rem' }}>
                ⚠️ Chưa có Gemini API Key — AI không thể phân tích ảnh. Hãy vào <b>Cài đặt → Cấu hình API Gemini</b> để nhập key.
              </div>
            )}

            {/* Batch action */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop:'0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={isAnalyzing || imageItems.length===0 || !hasApiKey}
                title={!hasApiKey ? 'Cần cấu hình Gemini API Key trước' : `Phân tích ${imageItems.length} ảnh với AI`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Đang phân tích {analyzingCount ? `(${doneCount+1}/${imageItems.length})` : `(${imageItems.length} ảnh)`}...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Phân tích {imageItems.length} ảnh với AI
                  </>
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleClearAll}
                disabled={isAnalyzing}
              >
                <Trash2 size={14} /> Xóa hết
              </button>
              {pendingCount>0 && !isAnalyzing && (
                <span style={{ fontSize:'0.8rem', color:'var(--text-muted)', alignSelf:'center' }}>
                  {pendingCount} ảnh chờ phân tích
                </span>
              )}
            </div>
          </div>
        )}

        {/* Combined analysis result */}
        {combinedResult && (
          <div style={{ 
            marginTop: '1rem',
            padding: '1rem',
            background: 'var(--surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 8
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={18} style={{ color: combinedResult.success ? 'var(--success)' : 'var(--color-danger)' }} />
                Kết quả phân tích {combinedResult.results ? `(${combinedResult.results.filter(r=>r.success).length}/${imageItems.length} ảnh)` : `(${imageItems.length} ảnh)`}
              </h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={handleDownloadResult}
                  title="Tải xuống kết quả"
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            {/* Confidence indicator */}
            {combinedResult.confidence !== undefined && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Độ tin cậy trung bình:
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {Math.round((combinedResult.confidence||0) * 100)}%
                  </span>
                </div>
                <div style={{ 
                  height: 8, 
                  background: 'var(--border-color)', 
                  borderRadius: 4,
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${(combinedResult.confidence||0) * 100}%`,
                    background: combinedResult.confidence > 0.7 ? 'var(--success)' : 
                              combinedResult.confidence > 0.4 ? '#f59e0b' : '#ef4444',
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>
            )}

            {/* Notes */}
            {combinedResult.notes && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-warning-soft)', color: 'var(--color-warning-text)', borderRadius: 6, fontSize:'0.875rem' }}>
                <strong>Ghi chú:</strong> {combinedResult.notes}
              </div>
            )}

            {/* Per-image breakdown when batch */}
            {combinedResult.results && (
              <div style={{ marginBottom:'1rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {combinedResult.results.map((r, idx) => (
                  <div key={idx} style={{ padding:'0.5rem 0.75rem', background: r.success ? 'var(--color-success-soft)' : 'var(--color-danger-soft)', borderRadius:6, fontSize:'0.8rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:600 }}>Ảnh {idx+1}: {imageItems[idx]?.file.name || `---`}</span>
                    <span style={{ color: r.success ? 'var(--success)' : 'var(--color-danger)', fontWeight:600 }}>
                      {r.success ? `✓ ${Array.isArray(r.data) ? r.data.length + ' mục' : r.data?.questions ? r.data.questions.length+' câu' : r.data?.activities ? r.data.activities.length+' HĐ' : 'OK'}` : `✗ ${r.error || 'Lỗi'}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Data preview */}
            {combinedResult.data && (
              <div style={{ 
                maxHeight: '300px', 
                overflow: 'auto',
                background: 'var(--color-surface-soft)',
                color: 'var(--color-text-primary)',
                padding: '1rem',
                borderRadius: 6,
                fontSize: '0.875rem',
                fontFamily: "'Consolas', 'Courier New', monospace",
                border: '1px solid var(--color-border)'
              }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(combinedResult.data, null, 2).slice(0, 4000)}{JSON.stringify(combinedResult.data, null, 2).length>4000 ? '\n... (đã cắt bớt, tải file để xem đủ)' : ''}
                </pre>
              </div>
            )}

            {/* Success message */}
            {combinedResult.success && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.75rem', 
                background: 'var(--color-success-soft)', 
                borderRadius: 6,
                color: 'var(--color-success-text)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize:'0.875rem'
              }}>
                <CheckCircle size={16} />
                <span>Phân tích hoàn tất! {Array.isArray(combinedResult.data) ? `${combinedResult.data.length} mục` : combinedResult.data?.length ? `${combinedResult.data.length} mục` : ''} đã sẵn sàng để sử dụng.</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ 
          marginTop: '1.5rem', 
          display: 'flex', 
          justifyContent: 'flex-end',
          gap: '0.5rem'
        }}>
          <button
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={isAnalyzing}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageUploadModal;