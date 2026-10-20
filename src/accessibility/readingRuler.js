/* Thanh đọc theo con trỏ (reading ruler) — Cài đặt → Trợ năng → "Thanh đọc theo con trỏ".
   Vệt sáng ngang chạy theo chuột giúp mắt dễ theo dõi dòng khi đọc lâu ( hỗ trợ dyslexia /
   mỏi mắt ). Chỉ gắn listener khi bật — không đụng window/document ở top-level nên import
   an toàn trong test Node. CSS định dạng nằm trong 01-typography-a11y.css (.rr-band). */

let band = null;
let enabled = false;
let listening = false;

function ensureBand() {
  if (band || typeof document === "undefined" || !document.body) return band;
  band = document.createElement("div");
  band.className = "rr-band";
  band.setAttribute("aria-hidden", "true");
  document.body.appendChild(band);
  return band;
}

function onMove(e) {
  if (!band || !enabled) return;
  if (e && e.pointerType === "touch") return; // chuột/bút mới — tránh giật khi cuộn tay
  band.style.setProperty("--rr-y", `${Math.round(e.clientY)}px`);
  band.classList.add("on");
}

function onLeave() {
  if (band) band.classList.remove("on");
}

function bind() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerleave", onLeave);
  listening = true;
}

function unbind() {
  if (!listening || typeof window === "undefined") return;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerleave", onLeave);
  listening = false;
}

export function setReadingRuler(on) {
  const want = !!on;
  if (want === enabled) return;
  enabled = want;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (want) {
    ensureBand();
    bind();
    band?.classList.add("on");
  } else {
    band?.classList.remove("on");
    unbind();
    try { band?.remove(); } catch {}
    band = null;
  }
}

export function isReadingRulerEnabled() {
  return enabled;
}
