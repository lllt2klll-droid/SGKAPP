// ── KHBD mới — data model bám mẫu KTSP TH TH ĐH Sài Gòn ──────────────
// Storage key mới hoàn toàn (khbd_v2_*), không đọc/ghi key cũ sgk_lessonplans_*.
// Mục III: hoạt động chia 4 phân khu A/B/C/D, mỗi hoạt động có các bước GV/HS.
import { STORAGE_KEYS } from "../core/storageKeys.js";
import { appEvents, AppEvents, DataDomains } from "../core/appEvents.js";
import { emitLessonPlanCreated, emitLessonPlanEdited } from "../missionEvents.js";
import { safeGetJSON, safeSetJSON, safeGetString, safeRemove, listKeys } from "../safeStorage.js";
import { moveToTrash, TRASH_TYPE } from "../trashStore.js";
// P0 • bắn event domain riêng (alias tự sinh DATA_UPDATED + qua cross-tab).
// Trước đây save/duplicate/delete plan hoàn toàn im lặng với bus.
function notifyPlanUpdated(op, id) {
  try { appEvents.emit(AppEvents.LESSON_PLAN_UPDATED, { source: "planModel", domain: DataDomains.LESSON_PLANS, op, id }); }
  catch (e) { console.warn("[planModel] notifyPlanUpdated failed", e); }
}

export const SECTIONS = ["A", "B", "C", "D"];
export const SECTION_LABEL = {
  A: "Hoạt động Khởi động",
  B: "Hoạt động Khám phá và Luyện tập",
  C: "Hoạt động Vận dụng",
  D: "Hoạt động Nối tiếp",
};

const PLANS_KEY = STORAGE_KEYS.KHBD_V2_PLANS;
export const OLD_KEYS = ["sgk_lessonplans", "sgk_lessonPlans", "sgk_lessonplans_fav", "khbd_autosave_enabled"];

let __uidSeq = 0;
function uid(prefix) {
  __uidSeq = (__uidSeq + 1) % 46656;
  const r = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${r}${__uidSeq.toString(36)}`;
}
export function makeKhbdId(prefix) { return uid(prefix || "id"); }
// ── Tách "cách tiến hành" thành từng dòng bullet "-" ───────────────────
// AI hay trả 1 khối văn bản dài; hàm này tách theo marker "Bước N:" rồi theo
// câu, gắn "- " đầu mỗi dòng để Word/form hiển thị từng dòng riêng.
// Lũy đẳng: text đã có bullet giữ nguyên (không gắn 2 lần); viết tắt
// ("VD.", "GV.", "tr."...) không bị tách nhầm thành dòng riêng.
const BULLET_LEAD = /^(?:[\-•*+–—]\s*|\d+[.)]\s*|Bước\s*\d+\s*[:.)\-–—]\s*)+/i;
const ABBR_END = /\b(?:VD|GV|HS|[Tt]r|TP|STT|GD|NX|KT|KN|TH)\.$/;
export function bulletizeLines(text) {
  const raw = String(text ?? "").replace(/\r\n?/g, "\n");
  // Tách theo marker "Bước N:" của AI trước (phần tử đầu rỗng thì bỏ)
  const chunks = raw.split(/(?=Bước\s*\d+\s*[:.)\-–—])/gi).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const chunk of chunks.length ? chunks : [""]) {
    // Tách câu trong chunk (câu mới bắt đầu bằng chữ hoa/số/dấu mở)
    const parts = chunk.split(/(?<=[.!?…:;])\s+(?=[A-ZÀ-Ỹ0-9"“(\-•+*])/);
    let buf = "";
    const flush = () => {
      const s = buf.trim();
      if (s) out.push(s);
      buf = "";
    };
    for (const part of parts) {
      const piece = String(part || "").trim();
      if (!piece) continue;
      if (!buf) buf = piece;
      else if (ABBR_END.test(buf)) buf += " " + piece;
      else { flush(); buf = piece; }
    }
    flush();
  }
  return out
    .map((s) => s.replace(BULLET_LEAD, "").trim())
    .filter(Boolean)
    .map((s) => "- " + s)
    .join("\n");
}

// ── Đoán khu A/B/C/D từ chữ AI viết bừa ─────────────────────────────
// AI hay trả section dạng "A. Khởi động", "khu B", "a"... thay vì đúng 1 ký tự.
// Chỉ nhận khi chắc chắn (1 ký tự đúng, hoặc mở đầu "X."/"X1."/"(X)", hoặc
// "khu/phần/mục/section X"); còn lại trả null để caller quyết định fallback.
export function guessSectionFromName(v) {
  const t = String(v ?? "").trim();
  if (/^[A-Da-d]$/.test(t)) return t.toUpperCase();
  let m = t.match(/^\s*\(?([A-Da-d])(?:\d+)?\s*[\.\):\-–—]/);
  if (m) return m[1].toUpperCase();
  m = t.match(/(?:khu|phần|phan|mục|muc|section)\s*([A-Da-d])\b/i);
  if (m) return m[1].toUpperCase();
  return null;
}

// ── Sửa khu hàng loạt từ tên HĐ (cứu các bài AI cũ dồn hết vào B) ────
// Chỉ đổi khi tên khớp chắc chắn ("A. Khởi động"→A, "C. Vận dụng"→C...);
// tên thường ("Củng cố kiến thức", "Luyện tập") không khớp → giữ nguyên.
export function reassignSectionsByName(acts) {
  let fixed = 0;
  const next = (Array.isArray(acts) ? acts : []).map((a) => {
    const g = guessSectionFromName(a?.ten);
    const cur = String(a?.section || "").toUpperCase();
    if (g && g !== cur) {
      fixed++;
      return { ...a, section: g };
    }
    return a;
  });
  return { acts: next, fixed };
}

export function mkStep() {
  return { id: uid("buoc"), gv: "", hs: "", gvImgs: [], hsImgs: [] };
}

export function mkActivity(section = "B") {
  return {
    id: uid("hd"),
    section: SECTIONS.includes(section) ? section : "B",
    ten: "",
    phut: "",
    mucTieu: "",
    ppdh: "",
    dddh: "",
    steps: [mkStep()],
    ketLuan: "",
  };
}

export function mkPlan() {
  return {
    id: uid("khbd"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Bìa
    sv: "", mssv: "", lopSV: "", gvhd: "", namHoc: "2024 - 2025",
    // Khối tiêu đề
    monHoc: "", lop: "", tuan: "", soTiet: "",
    title: "", hoVaTen: "", mssvTT: "", lopDay: "", thoiGian: "",
    // I. YCCD
    nlDacThu: ["", "", ""],
    lienHe: "",
    nlChung: ["", "", ""],
    phamChat: ["", "", ""],
    // II. Đồ dùng
    ddGV: [""], ddHS: [""],
    // III. Hoạt động
    hoatDong: [],
    // IV + V
    dieuChinh: "",
    phuLuc: "",
  };
}

// ── Store (localStorage) ─────────────────────────────────────────────
function readPlans() {
  try {
    const arr = safeGetJSON(PLANS_KEY, [], Array.isArray);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writePlans(arr) {
  try { const r = safeSetJSON(PLANS_KEY, arr); if (!r.ok) console.warn("[planModel] save plans failed", r.error); } catch {}
}

export function getPlans() { return readPlans(); }
export function getPlan(id) { return readPlans().find((p) => p.id === id) || null; }

export function savePlan(plan) {
  const all = readPlans();
  const fresh = { ...plan, updatedAt: Date.now() };
  const isNew = !all.some((p) => p.id === fresh.id);
  const i = all.findIndex((p) => p.id === fresh.id);
  if (i >= 0) all[i] = fresh; else all.unshift(fresh);
  writePlans(all);
  // Nhiệm vụ: tạo mới / chỉnh sửa KHBD (lỗi mission không được làm vỡ lưu)
  try {
    if (isNew) emitLessonPlanCreated(fresh.id);
    emitLessonPlanEdited(fresh.id);
  } catch {}
  notifyPlanUpdated(isNew ? "createPlan" : "savePlan", fresh.id);
  return fresh;
}

export function deletePlan(id) {
  // A2 • Xóa = chuyển vào Thùng rác (giữ 30 ngày) thay vì xóa thẳng
  try {
    const plan = readPlans().find((p) => p && p.id === id);
    if (plan) moveToTrash({ type: TRASH_TYPE.PLAN, label: plan.title || "Giáo án chưa tên", payload: plan });
  } catch {}
  writePlans(readPlans().filter((p) => p.id !== id));
  notifyPlanUpdated("deletePlan", id);
  try {
    listKeys()
      .filter((k) => k.startsWith("sgk_autosave_"))
      .forEach((k) => { try { safeRemove(k); } catch {} });
  } catch {}
}

export function duplicatePlan(id) {
  const src = getPlan(id);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid("khbd");
  copy.title = `${src.title || "Bài chưa tên"} (bản sao)`;
  copy.createdAt = Date.now();
  copy.hoatDong = (copy.hoatDong || []).map((a) => ({
    ...a, id: uid("hd"),
    steps: (a.steps || []).map((s) => ({ ...s, id: uid("buoc") })),
  }));
  const all = readPlans();
  all.unshift({ ...copy, updatedAt: Date.now() });
  writePlans(all);
  // Đồng bộ nhiệm vụ: nhân bản = 1 KHBD mới
  try { emitLessonPlanCreated(copy.id); } catch {}
  try { emitLessonPlanEdited(copy.id); } catch {}
  notifyPlanUpdated("duplicatePlan", copy.id);
  return copy;
}

// ── Xóa data KHBD cũ (key sgk_lessonplans_*, sgk_autosave_*) ─────────
export function clearLegacyData() {
  const removed = [];
  try {
    for (const k of OLD_KEYS) {
      if (safeGetString(k, null) !== null) { safeRemove(k); removed.push(k); }
    }
    listKeys()
      .filter((k) => k.startsWith("sgk_autosave_"))
      .forEach((k) => { safeRemove(k); removed.push(k); });
  } catch {}
  return removed;
}

export function hasLegacyData() {
  try {
    if (OLD_KEYS.some((k) => safeGetString(k, null) !== null)) return true;
    return listKeys().some((k) => k.startsWith("sgk_autosave_"));
  } catch { return false; }
}

// ── Chuyển plan shape cũ (kho sgk_lessonplans / AI BookReader) sang shape mới ──
// Chấp nhận: nlDacThu/nlChung/phamChat là string[] hoặc object[] {content};
// ddGV/ddHS là string[]; hoatDong section/sec, order/stt, steps hoặc
// buocTienHanh [{gv,hs}|{teacherAction,studentAction}], cachTienHanh/hs legacy.
export function importLegacyPlan(p) {
  const src = p && typeof p === "object" ? p : {};
  // Biên migration: field legacy có thể chứa HTML (kho cũ) → lột thẻ, giữ text.
  // Chỉ lột thẻ thật (chữ cái sau "<") để giữ nguyên "2 < 5" trong nội dung Toán.
  const detag = (v) => String(v ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  // AI hay viết sẵn "⇨ Giáo viên rút ra kết luận:" trong ketLuan trong khi
  // mẫu Word cũng in tiền tố này → lột ở đây để khỏi in đúp 2 lần.
  const cleanKetLuan = (v) => detag(v).replace(/^⇨\s*Giáo viên rút ra kết luận:\s*/i, "");
  const asTexts = (v, n) => {
    const arr = Array.isArray(v) ? v : [];
    const texts = arr.map((x) =>
      typeof x === "string" ? detag(x) : detag(x?.content ?? x?.description ?? ""));
    while (texts.length < n) texts.push("");
    return texts.slice(0, n);
  };
  const asList = (v) => {
    if (Array.isArray(v)) return v.map((x) =>
      typeof x === "string" ? detag(x) : detag(x?.content ?? x?.description ?? "")).filter((s) => s !== "");
    if (typeof v === "string" && v.trim()) return [detag(v)];
    return [""];
  };
  const next = mkPlan();
  if (typeof src.id === "string" && src.id) next.id = src.id;
  if (Number.isFinite(src.createdAt)) next.createdAt = src.createdAt;
  const strKeys = ["sv", "mssv", "lopSV", "gvhd", "namHoc", "monHoc", "lop", "tuan",
    "soTiet", "title", "hoVaTen", "mssvTT", "lopDay", "thoiGian", "lienHe",
    "lienHeTichHop", "dieuChinh", "phuLuc"];
  for (const k of strKeys) {
    if (src[k] !== undefined && src[k] !== null) {
      const v = typeof src[k] === "string" ? detag(src[k]) : String(src[k]);
      if (k === "lienHeTichHop") next.lienHe = v;
      else next[k] = v;
    }
  }
  next.nlDacThu = asTexts(src.nlDacThu, 3);
  next.nlChung = asTexts(src.nlChung, 3);
  next.phamChat = asTexts(src.phamChat, 3);
  next.ddGV = asList(src.ddGV);
  next.ddHS = asList(src.ddHS);
  next.hoatDong = (Array.isArray(src.hoatDong) ? src.hoatDong : []).map((a) => {
    const section = guessSectionFromName(a?.section) || guessSectionFromName(a?.sec) || "B";
    let steps = [];
    const rawSteps = Array.isArray(a.steps) ? a.steps
      : (Array.isArray(a.buocTienHanh) ? a.buocTienHanh : []);
    const cleanImgs = (v) => Array.isArray(v) ? v.filter((im) =>
      im && typeof im.dataUrl === "string" && im.dataUrl.startsWith("data:image")) : [];
    steps = rawSteps.map((s) => ({
      id: (s && typeof s.id === "string" && s.id) || uid("buoc"),
      gv: bulletizeLines(detag(s?.gv ?? s?.teacherAction ?? "")),
      hs: detag(s?.hs ?? s?.studentAction ?? ""),
      gvImgs: cleanImgs(s?.gvImgs),
      hsImgs: cleanImgs(s?.hsImgs),
    })).filter((s) => s.gv.trim() || s.hs.trim() || s.gvImgs.length || s.hsImgs.length);
    if (!steps.length) {
      const gv = bulletizeLines(detag(a.cachTienHanh ?? a.gv ?? ""));
      const hs = detag(a.hs ?? a.studentAction ?? "");
      steps = [{ id: uid("buoc"), gv, hs, gvImgs: [], hsImgs: [] }];
    }
    const act = mkActivity(section);
    act.id = (a && typeof a.id === "string" && a.id) || act.id;
    act.ten = detag(a.ten ?? a.name ?? "");
    act.phut = detag(a.phut ?? a.time ?? "");
    act.mucTieu = detag(a.mucTieu ?? "");
    act.ppdh = detag(a.ppdh ?? "");
    act.dddh = detag(a.dddh ?? "");
    act.steps = steps;
    act.ketLuan = cleanKetLuan(a.ketLuan ?? "");
    return act;
  });
  return next;
}
