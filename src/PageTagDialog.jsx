// ── Hộp thoại gắn thẻ trang theo chuẩn CTGDPT 2018 (mở trong sách) ─
import React, { useEffect, useState } from "react";
import { X, Tag, Save, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { yccdFor, machsForSubject, MUC_DO, machById } from "./ctgpt";
import { getPageMark, savePageMark } from "./researchDB";

export default function PageTagDialog({ book, pdfPage, numPages, onClose, onJump }) {
  // Internal page state so the dialog can move between pages (gắn thẻ liên tục)
  const [page, setPage] = useState(pdfPage);
  const [yccd, setYccd] = useState([]);
  const [mach, setMach] = useState("");
  const [mucdo, setMucdo] = useState("");
  const [tieuDe, setTieuDe] = useState("");
  const [tiet, setTiet] = useState("");
  const [thietBi, setThietBi] = useState([]);
  const [tbInput, setTbInput] = useState("");
  const [ghiChu, setGhiChu] = useState("");

  // Sync when the reader itself jumps to another page
  useEffect(() => {
    setPage(pdfPage);
  }, [pdfPage]);

  // Load existing mark when the page changes
  useEffect(() => {
    const m = getPageMark(book, page) || {};
    setYccd(m.yccd || []);
    setMach(m.mach || "");
    setMucdo(m.mucdo || "");
    setTieuDe(m.tieuDe || "");
    setTiet(m.tiet || "");
    setThietBi(m.thietBi || []);
    setGhiChu(m.ghiChu || "");
    setTbInput("");
  }, [page, book]);

  const jump = (p) => {
    // Use actual PDF numPages if available, otherwise fall back to reasonable max
    const maxPage = numPages || 3000;
    const v = Math.max(2, Math.min(p, maxPage)); // PDF pages; page 1 is the cover
    onJump?.(v);
    setPage(v);
  };

  const bp = Math.max(1, page - 1);
  const machs = machsForSubject(book.subject);
  const yccdList = yccdFor(book.subject, book.grade);

  const toggleYccd = (id) => {
    setYccd((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addTb = () => {
    const v = tbInput.trim();
    if (!v) return;
    setThietBi((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setTbInput("");
  };

  const hasContent =
    yccd.length ||
    mach ||
    mucdo ||
    tieuDe.trim() ||
    tiet.trim() ||
    thietBi.length ||
    ghiChu.trim();

  const save = (goNext) => {
    savePageMark(book, page, {
      yccd,
      mach,
      mucdo,
      tieuDe: tieuDe.trim(),
      tiet: tiet.trim(),
      thietBi,
      ghiChu: ghiChu.trim(),
    });
    if (goNext) jump(page + 1);
    else onClose();
  };

  const clear = () => {
    savePageMark(book, page, null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content tag-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="flex-row gap-sm m-0">
            <Tag size={17} /> Gắn thẻ CTGDPT 2018
          </h3>
          <div className="tag-nav">
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => jump(page - 1)}
              disabled={page <= 2}
            >
              <ChevronLeft size={13} /> Trước
            </button>
            <strong>Trang {bp}</strong>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => jump(page + 1)}
            >
              <ChevronRight size={13} /> Sau
            </button>
          </div>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => {
              if (yccd.length) setYccd([]);
              if (mach) setMach("");
              if (mucdo) setMucdo("");
              if (tieuDe) setTieuDe("");
              if (tiet) setTiet("");
              if (thietBi.length) setThietBi([]);
              if (ghiChu) setGhiChu("");
            }}
          >
            Xóa trống
          </button>
          <button
            className="util-bubble-close dark"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="tag-body">
          <label className="form-label">
            Tên bài / tiêu đề trang (gõ tay):
          </label>
          <input
            className="form-control"
            value={tieuDe}
            onChange={(e) => setTieuDe(e.target.value)}
            placeholder={`VD: Bài 12: Phép cộng trong phạm vi 10`}
          />

          <label className="form-label">
            Mạch kiến thức / kỹ năng (môn {book.subject}):
          </label>
          <div className="tag-chips">
            {machs.map((m) => (
              <button
                key={m.id}
                className={`tag-chip${mach === m.id ? " on" : ""}`}
                style={{
                  borderColor: m.color,
                  color: mach === m.id ? "var(--text-dark)" : m.color,
                  background: mach === m.id ? m.color : "transparent",
                }}
                onClick={() => setMach(mach === m.id ? "" : m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>

          <label className="form-label">
            Yêu cầu cần đạt (tham khảo lớp {book.grade}) — chọn nhiều:
          </label>
          <div className="tag-yccd-list">
            {yccdList.map((y) => {
              const m = machById(book.subject, y.machId);
              const on = yccd.includes(y.id);
              return (
                <button
                  key={y.id}
                  className={`tag-yccd${on ? " on" : ""}`}
                  onClick={() => toggleYccd(y.id)}
                  title={m?.name || ""}
                >
                  <span className="tag-yccd-flag">{on ? "✓" : "+"}</span>
                  <span>{y.text}</span>
                </button>
              );
            })}
            {!yccdList.length && (
              <p className="panel-hint">
                Không có mẫu cho môn này — gõ tiêu đề/mức độ để tự đánh dấu.
              </p>
            )}
          </div>

          <div className="tag-grid-2">
            <div>
              <label className="form-label">Mức độ (TT 27/2020):</label>
              <select
                className="form-control"
                value={mucdo}
                onChange={(e) => setMucdo(e.target.value)}
              >
                <option value="">— Chọn mức độ —</option>
                {MUC_DO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">
                Số tiết dự kiến dạy nội dung này:
              </label>
              <input
                className="form-control"
                value={tiet}
                onChange={(e) => setTiet(e.target.value)}
                placeholder="VD: 2 tiết"
              />
            </div>
          </div>

          <label className="form-label">Thiết bị / đồ dùng dạy học:</label>
          <div className="tag-tb-row">
            <input
              className="form-control"
              value={tbInput}
              onChange={(e) => setTbInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTb();
                }
              }}
              placeholder="VD: bộ đồ dùng học Toán, tranh ảnh…"
            />
            <button className="btn btn-secondary btn-xs" onClick={addTb}>
              Thêm
            </button>
          </div>
          {thietBi.length > 0 && (
            <div className="tag-chips">
              {thietBi.map((t) => (
                <span className="tag-chip on border-primary bg-primary-light text-primary"
                  key={t}
                >
                  {t}{" "}
                  <button
                    className="tag-chip-x"
                    onClick={() =>
                      setThietBi((prev) => prev.filter((x) => x !== t))
                    }
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <label className="form-label">Ghi chú của bạn:</label>
          <textarea
            className="form-control"
            rows={3}
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder="Nhận xét nghiên cứu, ý tưởng dạy học…"
          />

          <div className="tag-foot">
            <button
              className="btn btn-secondary"
              onClick={clear}
              disabled={!hasContent}
            >
              <Trash2 size={14} /> Bỏ thẻ trang này
            </button>
            <button
              className="btn btn-primary"
              onClick={() => save(true)}
              disabled={!hasContent}
            >
              <Save size={14} /> Lưu & đi trang sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
