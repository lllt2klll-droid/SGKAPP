function accessibleName(element) {
  const aria = (element.getAttribute("aria-label") || "").trim();
  if (aria) return aria;
  const labelledBy = (element.getAttribute("aria-labelledby") || "").trim();
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => (document.getElementById(id)?.textContent || "").trim())
      .join(" ")
      .trim();
    if (text) return text;
  }
  if (element.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label && (label.textContent || "").trim()) return label.textContent.trim();
    } catch {}
  }
  const wrappingLabel = element.closest?.("label");
  if (wrappingLabel && (wrappingLabel.textContent || "").trim()) return wrappingLabel.textContent.trim();
  if ((element.textContent || "").trim()) return element.textContent.trim();
  const image = element.querySelector?.("img[alt]");
  if (image && (image.alt || "").trim()) return image.alt.trim();
  if ((element.getAttribute("title") || "").trim()) return element.getAttribute("title").trim();
  if ((element.getAttribute("placeholder") || "").trim()) return element.getAttribute("placeholder").trim();
  return "";
}

export function runA11yAudit() {
  const shown = (element) => {
    if (!element || !element.isConnected) return false;
    if (element.closest("[aria-hidden='true'], [hidden]")) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const images = [...document.querySelectorAll("img")]
    .filter((image) => !image.hasAttribute("alt") && !image.closest("[aria-hidden='true']"));
  const nameless = [...document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"]')]
    .filter((element) => shown(element) && !accessibleName(element));
  const unlabeled = [...document.querySelectorAll("input, select, textarea")]
    .filter((element) => element.type !== "hidden" && shown(element) && !accessibleName(element));
  const positiveTabIndex = [...document.querySelectorAll("[tabindex]")]
    .filter((element) => parseInt(element.getAttribute("tabindex"), 10) > 0);
  const seenIds = new Map();
  [...document.querySelectorAll("[id]")].forEach((element) => {
    if (element.id) seenIds.set(element.id, (seenIds.get(element.id) || 0) + 1);
  });
  const duplicateIds = [...seenIds.entries()].filter(([, count]) => count > 1);
  const language = (document.documentElement.getAttribute("lang") || "").trim();
  return [
    { key: "img", label: "Ảnh thiếu mô tả (alt)", count: images.length, sample: images[0], fix: 'alt mô tả nội dung; ảnh trang trí dùng alt=""' },
    { key: "name", label: "Nút / liên kết không có tên đọc được", count: nameless.length, sample: nameless[0], fix: "Thêm aria-label hoặc chữ hiển thị" },
    { key: "field", label: "Ô nhập không có nhãn", count: unlabeled.length, sample: unlabeled[0], fix: 'Thêm aria-label="…" hoặc nối với <label>' },
    { key: "tabindex", label: "tabindex dương (phím Tab khó đoán)", count: positiveTabIndex.length, sample: positiveTabIndex[0], fix: 'Dùng tabindex="0" hoặc "-1"' },
    {
      key: "dup",
      label: duplicateIds.length ? `id trùng lặp (${duplicateIds.map(([id]) => id).slice(0, 3).join(", ")}${duplicateIds.length > 3 ? "…" : ""})` : "id trùng lặp",
      count: duplicateIds.length,
      sample: duplicateIds.length ? document.getElementById(duplicateIds[0][0]) : null,
      fix: "Đổi id cho duy nhất",
    },
    { key: "lang", label: "Thiếu lang trên thẻ <html>", count: language ? 0 : 1, sample: null, fix: 'lang="vi" để trình đọc màn hình phát âm đúng' },
  ];
}
