// Pre-paint theme: đọc localStorage TRƯỚC khi paint lần đầu (chống nháy tông màu
// khi app còn đang tải JS). Main.jsx sẽ apply lại đầy đủ khi mount.
// Tách từ index.html để CSP dùng script-src 'self' (không cần 'unsafe-inline').
try {
  var _s = JSON.parse(localStorage.getItem("sgk_settings") || "null") || {};
  var _t = (_s.appearance && _s.appearance.theme) || localStorage.getItem("sgk_theme") || "system";
  var _dark = _t === "dark" || (_t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", _dark ? "dark" : "light");
  if (_s.accessibility && _s.accessibility.highContrast) {
    document.documentElement.setAttribute("data-high-contrast", "true");
  }
} catch (e) {}
