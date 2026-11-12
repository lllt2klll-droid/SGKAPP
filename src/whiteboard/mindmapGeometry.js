export function centerOf(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function edgePoint(node, targetX, targetY, anchor = "auto") {
  const center = centerOf(node);
  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;
  if (anchor === "top") return { x: center.x, y: center.y - halfHeight };
  if (anchor === "bottom") return { x: center.x, y: center.y + halfHeight };
  if (anchor === "left") return { x: center.x - halfWidth, y: center.y };
  if (anchor === "right") return { x: center.x + halfWidth, y: center.y };
  const dx = targetX - center.x;
  const dy = targetY - center.y;
  if (dx === 0 && dy === 0) return center;
  if (Math.abs(dx) / (halfWidth || 1) > Math.abs(dy) / (halfHeight || 1)) {
    return { x: center.x + (dx > 0 ? halfWidth : -halfWidth), y: center.y };
  }
  return { x: center.x, y: center.y + (dy > 0 ? halfHeight : -halfHeight) };
}

export function connectorGeom(a, b, type, sourceAnchor = "auto", targetAnchor = "auto", bendOpt, routeOffsetOpt, bendAlongOpt) {
  if (!a || !b) return null;
  const centerA = centerOf(a);
  const centerB = centerOf(b);
  const start = edgePoint(a, centerB.x, centerB.y, sourceAnchor);
  const end = edgePoint(b, centerA.x, centerA.y, targetAnchor);
  if (type === "elbow") {
    const routeOffset = Number.isFinite(Number(routeOffsetOpt)) ? Number(routeOffsetOpt) : 0;
    if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
      const midX = (start.x + end.x) / 2 + routeOffset;
      const points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
      return { d: `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`, pts: points, control: { x: midX, y: (start.y + end.y) / 2 }, controlAxis: "x", end, endAngle: end.x >= midX ? 0 : 180 };
    }
    const midY = (start.y + end.y) / 2 + routeOffset;
    const points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    return { d: `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`, pts: points, control: { x: (start.x + end.x) / 2, y: midY }, controlAxis: "y", end, endAngle: end.y >= midY ? 90 : -90 };
  }
  if (type === "curve") {
    const bend = Number.isFinite(Number(bendOpt)) ? Math.max(-150, Math.min(150, Number(bendOpt))) : 100;
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const curve = Math.max(-160, Math.min(160, length * 0.25 * (bend / 100)));
    const along = Number.isFinite(Number(bendAlongOpt)) ? Math.max(-150, Math.min(150, Number(bendAlongOpt))) : 0;
    const alongOffset = Math.max(-160, Math.min(160, length * 0.25 * (along / 100)));
    const controlX = (start.x + end.x) / 2 + (-dy / length) * curve + (dx / length) * alongOffset;
    const controlY = (start.y + end.y) / 2 + (dx / length) * curve + (dy / length) * alongOffset;
    const at = (t) => ({
      x: (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * controlX + t * t * end.x,
      y: (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * controlY + t * t * end.y,
    });
    const points = [0, 0.25, 0.5, 0.75, 1].map(at);
    const endAngle = (Math.atan2(end.y - controlY, end.x - controlX) * 180) / Math.PI;
    return { d: `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`, pts: points, control: { x: controlX, y: controlY }, controlAxis: "both", end, endAngle };
  }
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  return { d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, pts: [start, end], control: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, controlAxis: "both", end, endAngle: angle };
}

function distToSeg(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function distToConnector(wx, wy, a, b, type, sourceAnchor, targetAnchor, bend, routeOffset, bendAlong) {
  const geometry = connectorGeom(a, b, type, sourceAnchor, targetAnchor, bend, routeOffset, bendAlong);
  if (!geometry || !geometry.pts) return Infinity;
  const point = { x: wx, y: wy };
  let best = Infinity;
  for (let i = 0; i + 1 < geometry.pts.length; i++) {
    best = Math.min(best, distToSeg(point, geometry.pts[i], geometry.pts[i + 1]));
  }
  return best;
}
