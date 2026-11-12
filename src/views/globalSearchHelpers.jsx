import React from "react";
import { splitCombo } from "../services/keyboardShortcuts.js";
import { normVi } from "./globalSearchData.js";

export function HighlightedText({ text, query }) {
  const content = String(text ?? "");
  const search = String(query ?? "").trim();
  if (!content || !search) return <>{content}</>;
  const tokens = search.split(/\s+/).filter((word) => word.length >= 2);
  if (!tokens.length) return <>{content}</>;
  const lower = content.toLowerCase();
  const ranges = [];
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    let from = 0;
    while (from <= lower.length - lowerToken.length) {
      const index = lower.indexOf(lowerToken, from);
      if (index === -1) break;
      ranges.push([index, index + lowerToken.length]);
      from = index + Math.max(1, lowerToken.length);
    }
  }
  if (ranges.length) {
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) {
        last[1] = Math.max(last[1], range[1]);
      } else {
        merged.push([...range]);
      }
    }
    const parts = [];
    let cursor = 0;
    merged.forEach(([start, end], index) => {
      if (cursor < start) {
        parts.push(
          <span key={`p${index}-0`}>{content.slice(cursor, start)}</span>,
        );
      }
      parts.push(
        <mark key={`p${index}-1`} className="gs-mark">
          {content.slice(start, end)}
        </mark>,
      );
      cursor = end;
    });
    if (cursor < content.length) {
      parts.push(<span key="p-end">{content.slice(cursor)}</span>);
    }
    return <>{parts}</>;
  }
  const normalizedText = normVi(content);
  const hasFuzzyMatch = tokens.some((token) =>
    normalizedText.includes(normVi(token)),
  );
  if (hasFuzzyMatch) return <span className="gs-fuzzy-hit">{content}</span>;
  return <>{content}</>;
}

export function KbdCombo({ combo, k = "c" }) {
  const parts = splitCombo(combo);
  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={`${k}-${index}`}>
          {index > 0 ? " + " : ""}
          <kbd className="kbd">{part}</kbd>
        </React.Fragment>
      ))}
    </>
  );
}
