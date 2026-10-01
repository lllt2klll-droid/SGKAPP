// ── KHBD mới — helpers thuần (không JSX, không DOM) ────────────────────
// Dùng chung cho view + xuất Word + test. Không import từ file .jsx.
import { mkActivity, makeKhbdId } from "./planModel.js";

export const PHASE_TO_SEC = { khoiDong: "A", khamPha: "B", luyenTap: "B", vanDung: "C", danDo: "D" };

export function numMin(v) {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Tổng phút toàn plan + từng khu A/B/C/D (hiển thị ở thanh thời gian đầu module)
export function planMinutes(plan) {
  const bySec = { A: 0, B: 0, C: 0, D: 0 };
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const a of plan?.hoatDong || []) {
    const s = String(a.section || "B").toUpperCase();
    if (!(s in bySec)) continue;
    bySec[s] += numMin(a.phut);
    counts[s] += 1;
  }
  return { bySec, counts, total: bySec.A + bySec.B + bySec.C + bySec.D };
}

export function stripTags(s) {
  return String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
}

// Câu hỏi trong kho → khối bước GV|HS (đáp án về GV, đề về HS)
export function questionToStep(q) {
  const stem = stripTags(q.question || q.stem || q.content || q.title || "");
  const opts = Array.isArray(q.options) ? q.options.map(stripTags).filter(Boolean) : [];
  const letters = ["A", "B", "C", "D", "E", "F"];
  if (q.type === "mc" && opts.length) {
    const ci = Number(q.correctIndex);
    const hs = [`Câu hỏi củng cố: ${stem}`, ...opts.map((o, i) => `${letters[i] || ""}. ${o}`.trim())].join("\n");
    const gv = Number.isFinite(ci) && opts[ci] ? `Đáp án: ${letters[ci] || ""} — ${opts[ci]}` : "";
    return { gv, hs };
  }
  if (q.type === "fill") {
    return { gv: stripTags(q.answer || "") ? `Đáp án: ${stripTags(q.answer)}` : "", hs: `Điền khuyết: ${stem}` };
  }
  const guide = stripTags(q.answerGuide || q.answer || "");
  return { gv: guide ? `Hướng dẫn chấm: ${guide}` : "", hs: stem };
}

// Hoạt động mẫu trong kho → hoạt động mới cùng khu (nội dung vào cột GV)
export function bankActivityToNew(bankAct, section) {
  const a = mkActivity(section);
  a.ten = stripTags(bankAct.name || bankAct.title || "");
  const body = stripTags(bankAct.content || "");
  a.steps = [{ id: makeKhbdId("buoc"), gv: body, hs: "" }];
  return a;
}
