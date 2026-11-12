import { Scissors, X } from "lucide-react";

export default function ReaderClipDialog({
  page,
  citation,
  collections,
  pageIsImage,
  hasSelection,
  collectionName,
  clipText,
  onCollectionNameChange,
  onClipTextChange,
  onClose,
  onSave,
}) {
  return (
    <div
      className="modal-overlay reader-tool-overlay"
      onClick={onClose}
    >
      <div
        className="modal-content reader-tool-modal reader-tool-modal--clip"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              margin: 0,
            }}
          >
            <Scissors size={17} /> Lưu trích đoạn — Trang {page}
          </h3>
          <button
            className="util-bubble-close dark"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        <div className="tag-body" style={{ display: "grid", gap: "0.6rem" }}>
          <p
            className="panel-hint"
            style={{
              margin: 0,
              background: "var(--surface-soft)",
              borderLeft: "3px solid var(--primary-light)",
              padding: "0.4rem 0.7rem",
              borderRadius: "0 6px 6px 0",
            }}
          >
            <strong>Trích dẫn gốc:</strong> {citation}
          </p>
          <div>
            <label className="form-label">
              Bộ sưu tập — gõ tên mới hoặc chọn bộ có sẵn *
            </label>
            <input
              className="form-control"
              list="clip-collection-names"
              value={collectionName}
              onChange={(event) => onCollectionNameChange(event.target.value)}
              placeholder="VD: Phép cộng – Phạm vi 10; Văn bản đọc lớp 2…"
            />
            <datalist id="clip-collection-names">
              {collections.map((collection) => (
                <option key={collection.id} value={collection.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="form-label">Nội dung trích đoạn *</label>
            <textarea
              className="form-control"
              rows={7}
              value={clipText}
              onChange={(event) => onClipTextChange(event.target.value)}
              placeholder="Chọn đoạn chữ trên trang rồi bấm nút Trích đoạn, hoặc tự dán nội dung…"
            />
            {pageIsImage && !hasSelection && (
              <p className="panel-hint">
                Trang này ở dạng ảnh — hãy bôi đen đoạn chữ trong bảng văn bản
                phía dưới để có trích đoạn chính xác, hoặc nhập tay.
              </p>
            )}
          </div>
          <div className="tag-foot">
            <button className="btn btn-secondary" onClick={onClose}>
              <X size={14} /> Hủy
            </button>
            <button
              className="btn btn-primary"
              disabled={!clipText.trim() || !collectionName.trim()}
              onClick={onSave}
            >
              <Scissors size={14} /> Lưu trích đoạn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
