// ─── Simple Markdown Renderer ─────────────────────────────────────────────────
// Renders markdown-style text with formatting (bold, italic, code, headers, lists)
import React from "react";

export default function MarkdownText({ text }) {
  if (!text) return null;

  const renderInline = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*"))
        return <em key={i}>{p.slice(1, -1)}</em>;
      if (p.startsWith("`") && p.endsWith("`"))
        return (
          <code className="markdown-code ui-s-76054d"
            key={i}
          >
            {p.slice(1, -1)}
          </code>
        );
      return p;
    });
  };

  const lines = text.split("\n");
  const elements = [];
  let ulItems = [];
  let olItems = [];

  const flushLists = () => {
    if (ulItems.length) {
      elements.push(
        <ul
          key={`ul${elements.length}`}
          className="ui-s-90075f"
        >
          {ulItems}
        </ul>,
      );
      ulItems = [];
    }
    if (olItems.length) {
      elements.push(
        <ol
          key={`ol${elements.length}`}
          className="ui-s-90075f"
        >
          {olItems}
        </ol>,
      );
      olItems = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushLists();
      elements.push(
        <h5
          key={i}
          className="ui-s-27b976"
        >
          {renderInline(line.slice(4))}
        </h5>,
      );
    } else if (line.startsWith("## ")) {
      flushLists();
      elements.push(
        <h4
          key={i}
          style={{
            color: "var(--primary)",
            margin: "0.8rem 0 0.2rem",
            fontSize: "0.95rem",
            fontWeight: 800,
            borderBottom: "1px solid var(--primary-light)",
            paddingBottom: "0.2rem",
          }}
        >
          {renderInline(line.slice(3))}
        </h4>,
      );
    } else if (line.startsWith("# ")) {
      flushLists();
      elements.push(
        <h3
          key={i}
          className="ui-s-64c7f3"
        >
          {renderInline(line.slice(2))}
        </h3>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (olItems.length) flushLists();
      ulItems.push(
        <li key={i} className="ui-s-bad61f">
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      if (ulItems.length) flushLists();
      olItems.push(
        <li key={i} className="ui-s-bad61f">
          {renderInline(line.replace(/^\d+\.\s+/, ""))}
        </li>,
      );
    } else if (line.trim() === "---" || line.trim() === "***") {
      flushLists();
      elements.push(
        <hr
          key={i}
          className="ui-s-5f2912"
        />,
      );
    } else if (line.trim() === "") {
      flushLists();
    } else {
      flushLists();
      elements.push(
        <p key={i} className="ui-s-de962d">
          {renderInline(line)}
        </p>,
      );
    }
  });
  flushLists();

  return <div className="ui-s-64031b">{elements}</div>;
}
