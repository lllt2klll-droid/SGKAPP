export const PLAN_LIMITS = { topic: 200, branches: 10, children: 8, label: 120 };

export function planLabelOf(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const direct = String(value.label ?? value.name ?? value.text ?? "").trim();
    if (direct) return direct;
    return Object.values(value)
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" — ");
  }
  return "";
}

export function flattenPlanChildren(children, max = PLAN_LIMITS.children) {
  const out = [];
  const push = (child) => {
    if (out.length >= max) return;
    if (typeof child === "string") {
      const label = child.trim();
      if (label) out.push(label.slice(0, PLAN_LIMITS.label));
      return;
    }
    if (child && typeof child === "object") {
      const label = planLabelOf(child);
      if (label) out.push(label.slice(0, PLAN_LIMITS.label));
      const descendants = Array.isArray(child.children) ? child.children : [];
      for (const descendant of descendants) {
        if (out.length >= max) break;
        const descendantLabel = typeof descendant === "string" ? descendant.trim() : planLabelOf(descendant);
        if (descendantLabel) out.push(descendantLabel.slice(0, PLAN_LIMITS.label));
      }
    }
  };
  (Array.isArray(children) ? children : []).slice(0, max * 3).forEach(push);
  return out.slice(0, max);
}

export function sanitizePlanForApply(plan) {
  const stats = { branches: 0, children: 0, droppedEmpty: 0, droppedDupe: 0, droppedOverflow: 0 };
  const warnings = [];
  if (!plan || typeof plan !== "object") {
    return { plan: null, warnings: ["Sơ đồ trống."], stats };
  }
  const topic = String(plan.topic || "").trim().slice(0, PLAN_LIMITS.topic);
  const rawList = Array.isArray(plan.branches) ? plan.branches : [];
  if (rawList.length > PLAN_LIMITS.branches) {
    stats.droppedOverflow += rawList.length - PLAN_LIMITS.branches;
  }
  const seen = new Set();
  const branches = [];
  for (const branch of rawList.slice(0, PLAN_LIMITS.branches)) {
    const label = (typeof branch === "string" ? branch.trim() : planLabelOf(branch)).slice(0, PLAN_LIMITS.label);
    if (!label) { stats.droppedEmpty++; continue; }
    const key = label.toLowerCase();
    if (seen.has(key)) { stats.droppedDupe++; continue; }
    seen.add(key);
    const childSeen = new Set([key]);
    const children = [];
    for (const child of flattenPlanChildren(typeof branch === "object" && branch ? branch.children : [])) {
      const childKey = child.toLowerCase();
      if (childSeen.has(childKey)) { stats.droppedDupe++; continue; }
      childSeen.add(childKey);
      children.push(child);
    }
    branches.push({ label, children });
  }
  stats.branches = branches.length;
  stats.children = branches.reduce((sum, branch) => sum + branch.children.length, 0);
  if (stats.droppedEmpty) warnings.push(`Đã bỏ ${stats.droppedEmpty} nhánh/con trống.`);
  if (stats.droppedDupe) warnings.push(`Đã bỏ ${stats.droppedDupe} nhãn trùng lặp.`);
  if (stats.droppedOverflow) warnings.push(`Sơ đồ vượt giới hạn — chỉ giữ ${PLAN_LIMITS.branches} nhánh đầu.`);
  if (!topic) warnings.push("Chủ đề đang trống.");
  if (!branches.length) {
    warnings.push("Sơ đồ không còn nhánh nào có chữ sau khi làm sạch.");
    return { plan: null, warnings, stats };
  }
  return { plan: { topic, branches }, warnings, stats };
}
