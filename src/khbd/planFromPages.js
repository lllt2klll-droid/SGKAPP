// ── Tạo giáo án từ trang sách (không AI) ─────────────────────────────────
// Cầu nối BookReader → module Giáo án:
// - BookReader trích snapshot text từng trang (tối đa 7) + metadata sách,
//   lưu vào localStorage PENDING_KEY rồi mở module Giáo án.
// - LessonPlanView đọc pending, hiện Wizard (tên bài + từ trang tới trang +
//   thời lượng + cấu trúc khu B linh hoạt từng bài) và fill khung đầy đủ.
import { mkPlan, mkActivity, makeKhbdId } from "./planModel";
import { safeGetJSON, safeSetJSON, safeRemove } from "../safeStorage.js";

export const PENDING_KEY = "khbd_pending_from_reader";
export const MAX_RANGE_PAGES = 7;

function readLS(key) {
  try {
    const v = safeGetJSON(key, null);
    return v && typeof v === "object" ? v : null;
  } catch { return null; }
}
function writeLS(key, val) {
  try { safeSetJSON(key, val); } catch {}
}

export function savePendingPayload(payload) {
  writeLS(PENDING_KEY, { ...payload, createdAt: Date.now() });
}
export function loadPendingPayload() {
  const v = readLS(PENDING_KEY);
  return v && typeof v === "object" ? v : null;
}
export function clearPendingPayload() {
  try { safeRemove(PENDING_KEY); } catch {}
}

// Chia phút theo tổng thời lượng: A=5, C=5, D=3 cho 35'; tỉ lệ tương tự nếu khác.
export function splitMinutes(total) {
  const t = Number(total) > 0 ? Math.round(Number(total)) : 35;
  const a = Math.max(3, Math.round((t * 5) / 35));
  const c = Math.max(3, Math.round((t * 5) / 35));
  const d = Math.max(2, Math.round((t * 3) / 35));
  const rest = Math.max(3, t - a - c - d);
  const b1 = Math.round(rest / 3);
  const b2 = Math.round(rest / 3);
  const b3 = rest - b1 - b2;
  return { A: a, B1: b1, B2: b2, B3: b3, C: c, D: d, total: t };
}

// Chuẩn hóa phút các HĐ khu B về đúng tổng rest (giữ số đã nhập khi khớp,
// chia đều phần còn lại, co giãn tỉ lệ khi nhập lố). Dùng chung cho khung tay
// lẫn output AI (AI hay chia phút lệch tổng).
export function normalizeBMinutes(defs, total) {
  const list = Array.isArray(defs) ? defs : [];
  const n = list.length;
  if (!n) return [];
  const given = list.map((d) => (Number(d.phut) > 0 ? Math.round(Number(d.phut)) : 0));
  const sum = given.reduce((a, b) => a + b, 0);
  if (sum === total) return given;
  if (sum < total) {
    const out = [...given];
    const empty = out.map((v, i) => (v > 0 ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length) {
      out[n - 1] += total - sum;
      return out;
    }
    let left = total - sum;
    empty.forEach((idx, k) => {
      const share = k === empty.length - 1 ? left : Math.max(1, Math.floor(left / (empty.length - k)));
      out[idx] = share;
      left -= share;
    });
    return out;
  }
  const scaled = given.map((v) => Math.max(1, Math.round((v * total) / sum)));
  let diff = total - scaled.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0 && n > 0 && i < n * 4) {
    const idx = i % n;
    if (diff > 0) { scaled[idx]++; diff--; }
    else if (scaled[idx] > 1) { scaled[idx]--; diff++; }
    else break;
    i++;
  }
  return scaled;
}

// Fill khung plan đầy đủ từ payload tối giản (không gọi AI).
export function buildPlanFromPages(payload = {}) {
  const p = mkPlan();
  const pageStart = Number(payload.pageStart) || null;
  const pageEnd = Number(payload.pageEnd) || pageStart;
  const rangeLabel = pageStart
    ? pageEnd && pageEnd !== pageStart ? `tr. ${pageStart}–${pageEnd}` : `tr. ${pageStart}`
    : "";
  const lesson = String(payload.lesson || payload.title || "").trim();
  const bookTitle = String(payload.bookTitle || "").trim();

  p.title = String(payload.title || lesson || (bookTitle && rangeLabel ? `${bookTitle} (${rangeLabel})` : bookTitle || "Bài học mới")).trim();
  p.monHoc = String(payload.subject || "");
  p.lop = String(payload.grade || "");
  p.thoiGian = payload.duration ? `${payload.duration} phút` : p.thoiGian || "35 phút";
  // Gợi ý YCCD để trống có hướng dẫn — giáo viên điền tiếp trong form
  p.nlDacThu = ["", "", ""];
  p.nlChung = ["", "", ""];
  p.phamChat = ["", "", ""];
  p.lienHe = "";
  p.ddGV = [""];
  p.ddHS = [""];
  p.bookReferences = [
    {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bookId: payload.bookId || "",
      bookTitle,
      bookSeries: payload.bookSeries || "",
      subject: payload.subject || "",
      grade: String(payload.grade || ""),
      lesson: lesson || p.title,
      chapter: "",
      pageStart,
      pageEnd,
      activityId: null,
      purpose: "content",
    },
  ];
  // Snapshot nội dung trích — module Giáo án hiển thị trong Wizard để đối chiếu
  p.sourceSnapshot = Array.isArray(payload.excerpts) ? payload.excerpts : [];

  const mins = splitMinutes(payload.duration || 35);
  const step = (gv, hs) => ({ id: makeKhbdId("buoc"), gv, hs, gvImgs: [], hsImgs: [] });
  const mk = (section, ten, phut, mucTieu, steps) => {
    const a = mkActivity(section);
    a.ten = ten;
    a.phut = String(phut);
    a.mucTieu = mucTieu;
    a.ppdh = "";
    a.dddh = "";
    a.steps = Array.isArray(steps) && steps.length ? steps : [step("", "")];
    a.ketLuan = "";
    return a;
  };
  const src = [lesson, rangeLabel].filter(Boolean).join(" — ");
  const lessonQ = lesson ? ` bài "${lesson}"` : "";
  const excerpts = Array.isArray(payload.excerpts) ? payload.excerpts : [];

  // ── Linh hoạt từng bài ────────────────────────────────────────────
  // Wizard có thể gửi payload.structure = { b: [{ ten, phut, steps }] } để đặt
  // tên / phút / số bước riêng cho khu B. Không có → mặc định 3 HĐ.
  // Nội dung từng bước trích từ chính snapshot trang sách của bài đó
  // (chia câu, mỗi bước trích 1 đoạn khác nhau) nên mỗi bài mỗi khác.
  const splitSentences = (text) =>
    String(text || "").split(/(?<=[.!?…:;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const excerptOf = (i) => (excerpts.length ? excerpts[i % excerpts.length] : null);
  // Dựng các bước cho 1 HĐ khu B từ nội dung thật của bài.
  // Các bước mang nội dung chia nhau các câu của trang sách (bước cuối cùng
  // gom hết phần còn lại để không rớt câu); bước chốt cuối không trích dẫn.
  const buildBSteps = (actIdx, nSteps) => {
    const n = Math.min(5, Math.max(1, Number(nSteps) || 3));
    const ex = excerptOf(actIdx);
    const ref = ex && ex.page != null ? ` (SGK tr. ${ex.page})`
      : (rangeLabel ? ` (${rangeLabel})` : "");
    const sents = splitSentences(ex?.text);
    const m = n > 1 ? n - 1 : 1; // số bước mang nội dung (trừ bước chốt)
    const per = Math.max(1, Math.ceil(sents.length / m));
    const chunkAt = (j) => {
      if (!sents.length) return "";
      const start = j * per;
      const end = j === m - 1 ? undefined : start + per;
      return sents.slice(start, end).join(" ").slice(0, 220);
    };
    const out = [];
    for (let j = 0; j < n; j++) {
      const chunk = j < m ? chunkAt(j) : "";
      const quote = chunk ? `: "${chunk}"` : "";
      if (j === 0) {
        out.push(step(
          `Nêu nhiệm vụ${ref}${quote} — yêu cầu HS quan sát, dự đoán.`,
          "HS quan sát SGK, nêu nhận xét và dự đoán ban đầu."));
      } else if (j === n - 1 && n > 1) {
        out.push(step(
          `Nhận xét, chốt nội dung${lessonQ}, tuyên dương.`,
          "HS nhắc lại nội dung, ghi vở, sửa sai nếu có."));
      } else {
        out.push(step(
          `Hướng dẫn HS thực hiện${quote ? `${quote} —` : "."} Gợi ý cách làm, hỗ trợ nhóm còn chậm.`,
          "HS thảo luận nhóm đôi, làm bài, nêu cách làm và kết quả."));
      }
    }
    return out;
  };
  const structB = Array.isArray(payload.structure?.b) ? payload.structure.b.slice(0, 6) : null;
  const bDefs = (structB && structB.length ? structB : [
    { ten: "Khám phá 1" }, { ten: "Luyện tập 2" }, { ten: "Luyện tập 3" },
  ]).map((d, i) => ({
    ten: String(d?.ten || "").trim() || `Hoạt động B${i + 1}`,
    phut: Number(d?.phut) > 0 ? Math.round(Number(d.phut)) : 0,
    steps: Math.min(5, Math.max(1, Number(d?.steps) || 3)),
  }));
  const rest = mins.total - mins.A - mins.C - mins.D;
  const bMinutes = normalizeBMinutes(bDefs, Math.max(bDefs.length, rest));
  p.hoatDong = [
    mk("A", "Khởi động", mins.A,
      lesson ? `Tạo hứng thú, dẫn vào bài "${lesson}".` : "Ổn định lớp, dẫn vào bài mới.",
      [step(
        `Ổn định tổ chức, cho HS hát tập thể rồi đố vui để dẫn vào${lessonQ}.`,
        "HS hát, trả lời câu đố, nêu tên bài học.")]),
    ...bDefs.map((d, i) => mk("B", d.ten, bMinutes[i],
      src ? `Học sinh thực hiện "${d.ten}" — nội dung ${src}.` : `Học sinh thực hiện "${d.ten}".`,
      buildBSteps(i, d.steps))),
    mk("C", "Vận dụng", mins.C, "Học sinh vận dụng vào thực tế.",
      [step(
        `Tổ chức trò chơi vận dụng${rangeLabel ? ` (${rangeLabel})` : ""}: giơ thẻ nội dung, HS nêu/giơ đáp án.`,
        "HS tham gia trò chơi, vận dụng kiến thức.")]),
    mk("D", "Nối tiếp", mins.D, "Dặn dò, chuẩn bị bài sau.",
      [step(
        "Nhận xét tiết học, dặn HS về nhà ôn bài và chuẩn bị bài sau.",
        "HS lắng nghe, ghi nhớ nhiệm vụ.")]),
  ];
  p.dieuChinh = "";
  p.phuLuc = bookTitle && rangeLabel ? `Nguồn: ${bookTitle} ${rangeLabel}.` : "";
  return p;
}
