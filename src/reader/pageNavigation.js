// reader/pageNavigation.js — extracted from BookReader.jsx
export function clampPage(target, numPages) {
  const t = Number.isFinite(Number(target)) ? Math.floor(Number(target)) : 1;
  if (numPages > 0) return Math.max(1, Math.min(numPages, t));
  return Math.max(1, t);
}

export function nextPage(current, twoPageMode, numPages, dir = 1) {
  const step = twoPageMode ? 2 : 1;
  return clampPage(current + dir * step, numPages);
}
