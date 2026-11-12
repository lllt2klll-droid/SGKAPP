const VALID_HEADS = new Set(["none", "arrow", "dot", "diamond"]);

export const CONN_HEAD_OPTS = [
  { id: "none", label: "Không", glyph: "○" },
  { id: "arrow", label: "Mũi tên", glyph: "➤" },
  { id: "dot", label: "Chấm tròn", glyph: "●" },
  { id: "diamond", label: "Hình thoi", glyph: "◆" },
];

export const CONN_DASH_OPTS = [
  { id: "", label: "Liền" },
  { id: "6 4", label: "Đứt" },
  { id: "2 4", label: "Chấm" },
];

export const CONN_COLORS = ["#475569", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];
export const CONN_WIDTHS = [1, 2, 3, 4, 6, 8];

export function connHeads(connector = {}) {
  let start = VALID_HEADS.has(connector.startHead) ? connector.startHead : null;
  let end = VALID_HEADS.has(connector.endHead) ? connector.endHead : null;
  if (!start || !end) {
    const legacy = connector.type === "line" ? ["none", "none"] : connector.type === "double" ? ["arrow", "arrow"] : ["none", "arrow"];
    if (!start) start = legacy[0];
    if (!end) end = legacy[1];
  }
  return { start, end };
}

export function connDash(connector = {}) {
  const dash = connector.dash ?? "";
  return CONN_DASH_OPTS.some((option) => option.id === dash) ? dash : "";
}

export function connTypeForHeads(connector = {}, start, end) {
  const type = connector.type || "";
  if (type === "elbow" || type === "curve") return type;
  if (start !== "none" && end !== "none") return "double";
  if (start !== "none" || end !== "none") return "arrow";
  return "line";
}

export function reconnectConn(connectors, id, end, newNodeId, anchor = "auto") {
  return (Array.isArray(connectors) ? connectors : []).map((connector) =>
    connector.id !== id ? connector : (end === "to"
      ? { ...connector, toId: newNodeId, targetAnchor: anchor }
      : { ...connector, fromId: newNodeId, sourceAnchor: anchor }));
}

export function flipConn(connector = {}) {
  const { start, end } = connHeads(connector);
  return {
    ...connector,
    fromId: connector.toId,
    toId: connector.fromId,
    sourceAnchor: connector.targetAnchor ?? "auto",
    targetAnchor: connector.sourceAnchor ?? "auto",
    startHead: end,
    endHead: start,
    type: connTypeForHeads(connector, end, start),
  };
}
