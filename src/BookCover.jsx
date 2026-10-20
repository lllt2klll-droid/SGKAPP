import React, { useState, useEffect, useRef } from "react";
import { getApiBase } from "./apiConfig";
import { pdfjsLib } from "./pdfjs-config";
import { progressFromPages } from "./readingProgress.js";

const API_BASE = getApiBase();
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

// Cache RAM đơn giản: filename -> dataURL trang 1 (tránh render lại khi cuộn)
const coverCache = {};

function getExt(filename) {
  return String(filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/)?.[1] || "";
}

// Kiểm tra canvas trắng tinh (render lỗi) -> giữ bìa CSS thay vì lưu ảnh trắng
function isBlankCanvas(canvas) {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let white = 0;
    for (let i = 0; i < data.length; i += 28) {
      total += 1;
      if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) white += 1;
    }
    return total > 0 && white / total > 0.995;
  } catch {
    return false;
  }
}

// Bìa = ảnh trang đầu của file.
// - File ảnh: dùng chính file.
// - File PDF: render trang 1 bằng pdf.js (scale nhỏ, lazy khi cuộn tới).
// - Lúc chờ / lỗi: hiện bìa CSS sẵn (không spinner, không trắng).
export default function BookCover({ book, lastPage = 0, height = 0, numPages = 0 }) {
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [cover, setCover] = useState(null);

  const filename = book?.filename || "";
  const ext = getExt(filename);
  const isPdf = ext === ".pdf";
  const isImg = IMG_EXTS.has(ext);

  const { page: bookPg, pct: progressPct } = progressFromPages(lastPage, numPages);
  const showProgress = bookPg > 0;
  const style = height ? { height: `${height}px` } : undefined;

  const sub = book?.subject === "Toán" ? "math" : "viet";
  const g = [1, 2, 3, 4, 5].includes(book?.grade) ? book.grade : 1;

  // Lazy: chỉ render khi cuộn gần tới (100px thay vì 400px để tránh
  // fetch hàng chục PDF 10-28MB cùng lúc gây ERR_FAILED hàng loạt)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Lấy ảnh trang đầu
  useEffect(() => {
    if (!filename || !visible) return;
    if (isImg || !isPdf) return;

    // Có cache -> dùng ngay
    if (coverCache[filename]) {
      setCover(coverCache[filename]);
      return;
    }

    let cancelled = false;
    let loadingTask = null;
    let pdf = null;

    (async () => {
      try {
        if (!pdfjsLib) return;
        const url = book?.url || `${API_BASE}/api/books/${encodeURIComponent(filename)}`;
        // Bìa chỉ cần trang 1: dùng Range 64KB + tắt auto-fetch/stream để
        // không tải full file 10-28MB cho mỗi bìa (nguyên nhân ERR_FAILED).
        loadingTask = pdfjsLib.getDocument({
          url,
          rangeChunkSize: 65536,
          disableAutoFetch: true,
          disableStream: true,
          isEvalSupported: false,
        });
        pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const scale = 200 / viewport.width;
        const scaled = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: scaled }).promise;
        if (cancelled || isBlankCanvas(canvas)) return;

        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (dataUrl && dataUrl.length > 3000) {
          coverCache[filename] = dataUrl;
          if (!cancelled) setCover(dataUrl);
        }
      } catch {
        // Lỗi (abort khi cuộn nhanh, file hỏng...) -> im lặng giữ bìa CSS
      } finally {
        try {
          if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (loadingTask && !loadingTask.destroyed) loadingTask.destroy();
      } catch {}
    };
  }, [filename, visible, isPdf, isImg]);

  if (!filename) {
    return (
      <div ref={wrapRef} className="book-cover cover-error" style={style}>
        <span className="book-grade-badge">Lỗi</span>
        <div className="book-cover-subject">Sách không hợp lệ</div>
      </div>
    );
  }

  // Ảnh trang đầu đã có (PDF render xong hoặc file ảnh) -> hiện ảnh
  const imgSrc = isImg
    ? (book?.url || `${API_BASE}/api/books/${encodeURIComponent(filename)}`)
    : cover;
  if (imgSrc) {
    return (
      <div ref={wrapRef} className="book-cover" style={{ ...style, padding: 0, overflow: "hidden" }}>
        <img
          src={imgSrc}
          alt={book.title || filename}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => {
            // PDF render lỗi từ cache hoặc ảnh hỏng -> rớt về bìa CSS
            if (!isImg) {
              delete coverCache[filename];
              setCover(null);
            }
          }}
        />
        <span className="book-grade-badge">Lớp {book.grade}</span>
        {showProgress && (
          <div className="book-progress">
            <div className="book-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>
    );
  }

  // Chưa có ảnh (đang chờ / file text / lỗi) -> bìa CSS đơn giản
  return (
    <div ref={wrapRef} className={`book-cover cover-${sub}-${g}`} style={style}>
      <span className="book-grade-badge">Lớp {book.grade}</span>
      <div className="book-cover-subject">{book.subject}</div>
      <div className="book-cover-meta">
        <span>Tập {book.term}</span>
        <span>KNTT</span>
      </div>
      {showProgress && (
        <div className="book-progress">
          <div className="book-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  );
}
