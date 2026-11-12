import React from "react";
import { Camera } from "lucide-react";
import { plainTextFromHtml, sanitizeNoteHtml } from "./textClean.js";

export default function ReaderNotesOverlay({
  wrapper,
  activeNoteId,
  deleteNote,
  handleImageUpload,
  isSavingNote,
  noteComposingRef,
  noteDisplaySrc,
  noteEditableRef,
  noteImages,
  noteInput,
  notes,
  notify,
  openImageViewer,
  pageNum,
  removeImage,
  saveNote,
  setActiveNoteId,
  setNoteImages,
  setNoteInput,
  setNoteText,
  startEditNote,
}) {
  const targetPdf = pageNum + wrapper;
  const popupPos = (p) => ({
    left: `${Math.min(Math.max(p.percentX, 1), 99)}%`,
    top: `calc(${Math.min(Math.max(p.percentY, 1), 99)}% + 14px)`,
    transform: "translateX(-50%)",
  });
  return (
    <>
      {notes
        .filter((n) => n.pdfPage === targetPdf)
        .map((note) => (
          <React.Fragment key={note.id}>
            <div
              style={{
                position: "absolute",
                left: `${Math.min(Math.max(note.percentX, 1), 99)}%`,
                top: `${Math.min(Math.max(note.percentY, 1), 99)}%`,
                transform: "translate(-50%,-50%)",
                zIndex: 20,
                cursor: "pointer",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveNoteId(activeNoteId === note.id ? null : note.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="note-pin" title={plainTextFromHtml(note.text)}>
                📌
              </div>
            </div>
            {activeNoteId === note.id && (
              <div
                className="note-popup"
                style={popupPos(note)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <div className="note-popup-head">
                  <span>📌 Nội dung ghi chú</span>
                  <button
                    className="note-popup-close"
                    onClick={() => setActiveNoteId(null)}
                    aria-label="Đóng ghi chú"
                  >
                    ✕
                  </button>
                </div>
                <div
                  className="note-popup-body"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeNoteHtml(note.text),
                  }}
                />
                {note.images && note.images.length > 0 && (
                  <div className="note-popup-images">
                    {note.images.map((img, index) => {
                      const src = noteDisplaySrc(img);
                      if (!src) return null;
                      return (
                        <img
                          key={index}
                          src={src}
                          alt={`Note image ${index + 1}`}
                          className="note-popup-image"
                          onClick={() => openImageViewer(note.images, index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openImageViewer(note.images, index);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="note-popup-foot">
                  <button
                    className="btn btn-secondary"
                    onClick={() => startEditNote(note)}
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    className="btn btn-secondary note-btn-danger"
                    onClick={() => deleteNote(note.id)}
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      {noteInput && (noteInput.wrapper || 0) === wrapper && (
        <div
          className="note-input-popup"
          style={popupPos(noteInput)}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="note-input-head">
            📌 {noteInput.editId ? "Sửa ghi chú" : "Thêm ghi chú"}
          </div>

          {/* Rich text toolbar */}
          <div className="note-toolbar">
            <button
              className="note-toolbar-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = noteEditableRef.current;
                if (!el) return;
                el.focus();
                try {
                  document.execCommand("bold", false, null);
                } catch {}
                setNoteText(el.innerHTML);
              }}
              title="In đậm"
            >
              <b>B</b>
            </button>
            <button
              className="note-toolbar-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = noteEditableRef.current;
                if (!el) return;
                el.focus();
                try {
                  document.execCommand("italic", false, null);
                } catch {}
                setNoteText(el.innerHTML);
              }}
              title="In nghiêng"
            >
              <i>I</i>
            </button>
            <button
              className="note-toolbar-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = noteEditableRef.current;
                if (!el) return;
                el.focus();
                try {
                  document.execCommand("underline", false, null);
                } catch {}
                setNoteText(el.innerHTML);
              }}
              title="Gạch chân"
            >
              <u>U</u>
            </button>
            <button
              className="note-toolbar-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = noteEditableRef.current;
                if (!el) return;
                el.focus();
                try {
                  document.execCommand("strikeThrough", false, null);
                } catch {}
                setNoteText(el.innerHTML);
              }}
              title="Gạch ngang"
            >
              <s>S</s>
            </button>
            <button
              className="note-toolbar-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = noteEditableRef.current;
                if (!el) return;
                el.focus();
                document.execCommand("insertUnorderedList", false, null);
                setNoteText(el.innerHTML);
              }}
              title="Danh sách dấu đầu dòng"
              aria-label="Danh sách dấu đầu dòng"
            >
              •
            </button>
            <button
              className="note-toolbar-btn"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = noteEditableRef.current;
                if (!el) return;
                el.focus();
                document.execCommand("insertOrderedList", false, null);
                setNoteText(el.innerHTML);
              }}
              title="Danh sách đánh số"
              aria-label="Danh sách đánh số"
            >
              1.
            </button>
            <div className="note-toolbar-divider"></div>
            <label
              className="note-toolbar-btn note-image-btn"
              title="Thêm ảnh"
              aria-label="Thêm ảnh"
            >
              <Camera size={17} aria-hidden="true" />
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {/* Content editable div for rich text - uncontrolled to keep cursor/IME stable */}
          <div
            ref={noteEditableRef}
            className="note-content-editable"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Nhập ghi chú… (Ctrl+Enter để lưu, Esc để hủy)"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation();
              const files = [...(e.dataTransfer?.files || [])].filter((f) => (f.type || "").startsWith("image/"));
              if (files.length) {
                const available = Math.max(0, 4 - noteImages.length);
                files.slice(0, available).forEach((file) => handleImageUpload(file));
                if (files.length > available) {
                  notify("Mỗi ghi chú tối đa 4 ảnh — hãy xóa bớt ảnh trước", "warning");
                }
              }
            }}
            onInput={(e) => {
              if (noteComposingRef.current) return;
              setNoteText(e.currentTarget.innerHTML);
            }}
            onCompositionStart={() => {
              noteComposingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              noteComposingRef.current = false;
              setNoteText(e.currentTarget.innerHTML);
            }}
            onPaste={(e) => {
              const clipboard = e.clipboardData || window.clipboardData;
              const imageFiles = [...(clipboard?.items || [])]
                .filter((item) => item.type?.startsWith("image/"))
                .map((item) => item.getAsFile())
                .filter(Boolean);
              if (imageFiles.length) {
                e.preventDefault();
                const available = Math.max(0, 4 - noteImages.length);
                imageFiles.slice(0, available).forEach((file) => handleImageUpload(file));
                if (imageFiles.length > available) {
                  notify("Mỗi ghi chú tối đa 4 ảnh — hãy xóa bớt ảnh trước", "warning");
                }
                return;
              }
              const html = sanitizeNoteHtml(clipboard?.getData("text/html") || "");
              const text = clipboard?.getData("text/plain") || "";
              e.preventDefault();
              try {
                const inserted = html
                  ? document.execCommand("insertHTML", false, html)
                  : document.execCommand("insertText", false, text);
                if (!inserted && text) document.execCommand("insertText", false, text);
              } catch {
                const selection = window.getSelection();
                if (selection?.rangeCount && text) {
                  selection.getRangeAt(0).deleteContents();
                  selection.getRangeAt(0).insertNode(document.createTextNode(text));
                }
              }
              const el = noteEditableRef.current;
              if (el) setNoteText(el.innerHTML);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setNoteInput(null);
                setNoteText("");
                setNoteImages([]);
                if (noteEditableRef.current)
                  noteEditableRef.current.innerHTML = "";
                return;
              }
              if (e.isComposing || noteComposingRef.current) return;
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void saveNote();
                return;
              }
              if ((e.ctrlKey || e.metaKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
                e.preventDefault();
                const command = { b: "bold", i: "italic", u: "underline" }[e.key.toLowerCase()];
                document.execCommand(command, false, null);
                const el = noteEditableRef.current;
                if (el) setNoteText(el.innerHTML);
              }
            }}
          />

          {/* Image preview */}
          {noteImages.length > 0 && (
            <div className="note-images-preview">
              {noteImages.map((img, index) => {
                const src = noteDisplaySrc(img);
                if (!src) return null;
                return (
                  <div key={index} className="note-image-item">
                    <img
                      src={src}
                      alt={`Note image ${index + 1}`}
                      onClick={() => openImageViewer(noteImages, index)}
                      role="button"
                      tabIndex={0}
                    />
                    <button
                      className="note-image-remove"
                      onClick={() => removeImage(index)}
                      title="Xóa ảnh"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="note-input-foot">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setNoteInput(null);
                setNoteText("");
                setNoteImages([]);
                if (noteEditableRef.current)
                  noteEditableRef.current.innerHTML = "";
              }}
            >
              Hủy
            </button>
            <button className="btn btn-primary" onClick={saveNote} disabled={isSavingNote}>
              {isSavingNote ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
