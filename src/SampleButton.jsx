// ── Nút "Tự động làm": tạo dữ liệu mẫu có hộp thoại xác nhận ──────
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, X } from 'lucide-react';

export default function SampleButton({ label = 'Tự động làm', hint, onRun, disabled = false, size = 'xs', style }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(()=>{
    if(!confirming) return;
    const prevOverflow = document.body.style.overflow;
    document.body.classList.add('has-khbd-veil');
    document.body.style.overflow = 'hidden';
    return ()=>{
      document.body.classList.remove('has-khbd-veil');
      document.body.style.overflow = prevOverflow;
    };
  },[confirming]);
  const veil = confirming ? (
    <div className="modal-overlay modal-overlay--refined" onClick={() => setConfirming(false)} role="dialog" aria-modal="true">
      <div className="modal-content modal-content--refined max-w-440" onClick={e => e.stopPropagation()}>
        <div className="modal-header modal-header--refined">
          <h3 className="m-0 flex-row gap-sm" style={{fontWeight:700, fontSize:'0.98rem', letterSpacing:'-0.015em'}}><span style={{display:'grid',placeItems:'center',width:28,height:28,borderRadius:8,background:'var(--surface-soft)',border:'1px solid var(--border-color)',color:'var(--text-mid)'}}><Wand2 size={14} /></span> Tự động làm với dữ liệu mẫu</h3>
          <button className="util-bubble-close dark" onClick={() => setConfirming(false)} aria-label="Đóng" style={{width:32,height:32,borderRadius:9,background:'var(--surface-soft)',border:'1px solid var(--border-color)'}}><X size={14} /></button>
        </div>
        <p className="panel-hint" style={{ margin: '0.9rem 1.15rem 0', lineHeight: 1.6, fontSize:'0.86rem', color:'var(--text-mid)', fontWeight:500 }}>
          {hint || 'App sẽ tạo thêm dữ liệu mẫu (tiếng Việt) vào chế độ này để xem hệ thống chạy thế nào. Dữ liệu thật của bạn được giữ nguyên; mục nào đã có mẫu sẽ bỏ qua, không ghi đè.'}
        </p>
        <div className="flex-row-end" style={{padding:'1rem 1.15rem 1.15rem', gap:'0.6rem'}}>
          <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)} style={{borderRadius:10, fontWeight:600}}>Hủy</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setConfirming(false); onRun(); }} style={{borderRadius:10, fontWeight:700, boxShadow:'var(--shadow-sm)'}}><Wand2 size={14} /> Làm ngay</button>
        </div>
      </div>
    </div>
  ) : null;
  return (
    <>
      <button
        type="button"
        className={`btn btn-secondary btn-${size}`}
        style={style}
        onClick={() => setConfirming(true)}
        disabled={disabled}
        title={hint || 'Thêm dữ liệu mẫu để kiểm thử hệ thống (app sẽ hỏi xác nhận trước khi thực hiện)'}
      >
        <Wand2 size={13} /> {label}
      </button>
      {typeof document !== 'undefined' && document.body && veil ? createPortal(veil, document.body) : veil}
    </>
  );
}