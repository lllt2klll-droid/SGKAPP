import * as pdfjsLib from 'pdfjs-dist';

// Use local worker bundled via npm (no CDN dependency)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).href;

// Silence harmless font fallback (CambriaMath TTC) — via console filter below (pdfjs verbosity is read-only in ESM)

// Suppress noisy expected font fallback warning (TrueType Collection -> CambriaMath) — harmless, clutters console
if (typeof window !== "undefined" && !window.__sgkFontWarnPatched) {
  window.__sgkFontWarnPatched = true;
  const origWarn = console.warn.bind(console);
  const origLog = console.log.bind(console);
  const shouldSuppress = (args) => {
    const first = String(args[0] || "");
    return (first.includes("TrueType Collection") && first.includes("CambriaMath")) ||
           (first.includes("does not contain") && first.includes("font") && first.includes("falling back"));
  };
  console.warn = (...args) => { if (!shouldSuppress(args)) origWarn(...args); };
  console.log = (...args) => { if (!shouldSuppress(args)) origLog(...args); };
}

// Global suppression for expected pdf.js abort rejections (fast scroll / unmount / StrictMode double-mount)
// pdf.js worker rejects with AbortError / Transport destroyed / Worker was terminated when getDocument is cancelled.
// Without this, Vite prod shows "Uncaught (in promise) AbortError: signal is aborted without reason".
if (typeof window !== "undefined" && !window.__sgkPdfAbortHandlerInstalled) {
  window.__sgkPdfAbortHandlerInstalled = true;
  const isExpectedPdfAbort = (reason) => {
    const name = String(reason?.name || "");
    const msg = String(reason?.message || reason || "");
    const text = `${name} ${msg}`.toLowerCase();
    return (
      text.includes("abort") ||
      text.includes("transport destroyed") ||
      text.includes("worker was terminated") ||
      text.includes("signal is aborted") ||
      text.includes("renderingcancelled") ||
      text.includes("cancel")
    );
  };
  window.addEventListener("unhandledrejection", (e) => {
    if (isExpectedPdfAbort(e.reason)) {
      e.preventDefault();
    }
  });
  window.addEventListener("error", (e) => {
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("aborterror") || msg.toLowerCase().includes("signal is aborted")) {
      e.preventDefault();
    }
  });
}

export { pdfjsLib };
