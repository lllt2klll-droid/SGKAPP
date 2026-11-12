export function htmlToPlainText(html) {
  try {
    const element = document.createElement("div");
    element.innerHTML = html || "";
    return (element.textContent || element.innerText || "").trim();
  } catch {
    return (html || "").replace(/<[^>]*>/g, " ").trim();
  }
}

export function countWordsFromHtml(html) {
  const text = htmlToPlainText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimatePages(html) {
  const text = htmlToPlainText(html);
  const chars = text.length;
  if (!chars) return 1;
  return Math.max(1, Math.ceil(chars / 1800));
}

export function plainToHtml(text) {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const inner = paragraph.split("\n").join("<br>");
      if (/^\s*#{1,6}\s/.test(paragraph)) return paragraph;
      return `<p>${inner}</p>`;
    })
    .join("");
  return paragraphs;
}

export function mdLikeToHtmlIfNeeded(content, ext) {
  if (ext === "html") return content;
  if (ext === "md" && content.includes("#")) {
    let html = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    html = html
      .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
    html = html
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#f1f5f9;padding:1px 6px;border-radius:6px;">$1</code>',
      );
    html = html
      .replace(/^\s*[-*]\s+(.*)$/gm, "<li>$1</li>")
      .replace(/^\s*\d+\.\s+(.*)$/gm, "<li>$1</li>");
    html = html
      .split("\n")
      .map((line) => (line.trim().startsWith("<li>") ? line : `<p>${line}</p>`))
      .join("\n");
    return html;
  }
  return plainToHtml(content);
}
