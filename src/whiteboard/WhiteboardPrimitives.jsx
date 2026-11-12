import React from "react";
import { resolveWbFont } from "./whiteboardStore.js";
import { normalizeBulletStyle, stripBulletMark, bulletPrefix, bulletIndentPx, wrapRichLines } from "./mindmapEngine.js";

export function HeadShape({ head, color }) {
  if (head === "dot") return <circle cx="5" cy="5" r="3.2" fill={color} />;
  if (head === "diamond") return <path d="M 5 0 L 10 5 L 5 10 L 0 5 z" fill={color} />;
  return <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />;
}

function wrapLines(text, width, fontSize) {
  const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.62)));
  const out = [];
  String(text || "").split("\n").forEach((para) => {
    if (!para) { out.push(""); return; }
    const words = para.split(/\s+/);
    let line = "";
    words.forEach((word) => {
      const candidate = line ? line + " " + word : word;
      if (candidate.length > maxChars && line) { out.push(line); line = word; }
      else line = candidate;
    });
    out.push(line);
  });
  return out.slice(0, 24);
}

export const ShapeBody = React.memo(function ShapeBody({ o }) {
  const { width: w, height: h } = o;
  const common = { fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, ...(o.strokeDash ? { strokeDasharray: o.strokeDash } : {}) };
  switch (o.shape) {
    case "rect":
      return <rect x={0} y={0} width={w} height={h} {...common} />;
    case "circle": {
      const r = Math.min(w, h) / 2;
      return <circle cx={w / 2} cy={h / 2} r={r} {...common} />;
    }
    case "ellipse":
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case "diamond":
      return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...common} />;
    case "triangle":
      return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...common} />;
    case "rounded":
    default:
      return <rect x={0} y={0} width={w} height={h} rx={12} {...common} />;
  }
});

export const NodeText = React.memo(function NodeText({ o, boardFont = "" }) {
  if (!o.text) return null;
  const fontFamily = resolveWbFont(o, boardFont);
  const hasRich = /(\*\*[^*]*\*\*|\*[^*\n]+\*)/.test(o.text || "");
  const bulletStyle = normalizeBulletStyle(o.bullets);
  const maxChars = Math.max(3, Math.floor((o.width - 16 - bulletIndentPx(o.fontSize, bulletStyle)) / (o.fontSize * 0.62)));
  const lineHeight = o.fontSize * 1.3;
  const anchor = o.align === "left" ? "start" : o.align === "right" ? "end" : "middle";
  const x = o.align === "left" ? 8 : o.align === "right" ? o.width - 8 : o.width / 2;
  if (!hasRich && !bulletStyle) {
    const lines = wrapLines(o.text, o.width - 16, o.fontSize);
    const startY = o.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    return (
      <text x={x} y={startY} textAnchor={anchor} fontSize={o.fontSize} fontFamily={fontFamily}
        fontWeight={o.bold ? 700 : 400} fontStyle={o.italic ? "italic" : "normal"} fill={o.color}
        style={{ userSelect: "none", pointerEvents: "none", fontFamily }}>
        {lines.map((line, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : lineHeight} dominantBaseline="middle">{line || " "}</tspan>
        ))}
      </text>
    );
  }
  const richLines = wrapRichLines(o.text, maxChars);
  let bulletNumber = 0;
  const displayLines = richLines.map((runs) => {
    const nonEmpty = runs.some((run) => run.t.trim());
    if (!bulletStyle || !nonEmpty) return runs;
    bulletNumber++;
    const prefix = bulletPrefix(bulletStyle, bulletNumber);
    const [first, ...rest] = runs;
    return [{ ...first, t: prefix + stripBulletMark(first.t) }, ...rest];
  });
  const startY = o.height / 2 - ((displayLines.length - 1) * lineHeight) / 2;
  return (
    <text x={x} y={startY} textAnchor={anchor} fontSize={o.fontSize} fontFamily={fontFamily}
      fontWeight={o.bold ? 700 : 400} fontStyle={o.italic ? "italic" : "normal"} fill={o.color}
      style={{ userSelect: "none", pointerEvents: "none", fontFamily }}>
      {displayLines.map((runs, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : lineHeight} dominantBaseline="middle">
          {runs.length ? runs.map((run, runIndex) => (
            <tspan key={runIndex} fontWeight={run.bold ? 700 : undefined} fontStyle={run.italic ? "italic" : undefined}>{run.t}</tspan>
          )) : " "}
        </tspan>
      ))}
    </text>
  );
});
