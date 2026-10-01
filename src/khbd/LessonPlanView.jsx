// -- KHBD mới — form full mẫu KTSP Từ Từ ĐH Sài Gòn -------------------
// Bìa + Tiêu đề + I.YCCD + II.Đồ dùng + III.Hoạt động (A/B/C/D, bước GV/HĐ)
// + IV.Điều chỉnh + V.Phụ lục.
// Nút "Thêm KHBD (.docx)": copy file mẫu public/templates/KHBD-mẫu.docx,
// thay {{placeholder}} bằng ô nhập → tải .docx giữ nguyên format mẫu.

import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Copy, Trash2, FileText, Download, Database, CheckCircle2, ChevronDown, ChevronUp, Sparkles,
  Clock, Wand2, Library, ArrowUp, ArrowDown, ListPlus, BookOpen, Wrench,
} from "lucide-react";
import {
  mkPlan, mkActivity, mkStep, makeKhbdId, SECTIONS, SECTION_LABEL,
  getPlans, getPlan, savePlan, deletePlan, duplicatePlan,
  clearLegacyData, hasLegacyData, reassignSectionsByName,
} from "./planModel";
import {
  PHASE_TO_SEC, numMin, planMinutes, questionToStep, bankActivityToNew,
} from "./khbdUtils";
import {
  loadPendingPayload, clearPendingPayload, buildPlanFromPages, MAX_RANGE_PAGES, splitMinutes,
} from "./planFromPages";
import { exportPlanDocx } from "./templateEngine";
import { fillSampleLessonPlan } from "../sampleData";
import aiService, { getFriendlyErrorMessage } from "../aiService";
import { getGeminiApiKey } from "../storage";
import { loadSettings } from "../settingsStore";
import { getQuestions, getActivities } from "../teachingDB";
import {
  compressImageFile, makeImgId, IMG_MAX_PER_SIDE, PLAN_MAX_BYTES, estimatePlanBytes,
} from "./khbdImages";
import LessonUrlImport, { SourcePreview } from "./LessonUrlImport";
import "./khbd.css";

function TextInput({ value, onChange, placeholder }) {
  return (
    <input className="form-control" value={value || ""} placeholder={placeholder || ""}
      onChange={(e) => onChange(e.target.value)} />
  );
}
function TextArea({ value, onChange, placeholder, rows = 2 }) {
  return (
    <textarea className="form-control" rows={rows} value={value || ""} placeholder={placeholder || ""}
      onChange={(e) => onChange(e.target.value)} />
  );
}
function ListEditor({ items, onChange, placeholder, addLabel }) {
  const set = (i, v) => onChange((items || []).map((x, j) => (j === i ? v : x)));
  const del = (i) => onChange((items || []).filter((_, j) => j !== i));
  const add = () => onChange([...(items || []), ""]);
  return (
    <div className="khbd-list">
      {(items || []).map((v, i) => (
        <div key={i} className="khbd-list-row">
          <span className="khbd-bullet">{typeof v === "string" && v.trim().startsWith("+") ? "" : "+"}</span>
          <input className="form-control" value={v} placeholder={placeholder}
            onChange={(e) => set(i, e.target.value)} />
          <button className="btn btn-danger btn-xs khbd-del" onClick={() => del(i)} title="Xóa dòng">?</button>
        </div>
      ))}
      <button className="khbd-add-btn" onClick={add}><Plus size={12} /> {addLabel || "Thêm dòng"}</button>
    </div>
  );
}

function BankInsert({ onInsertQuestion, onInsertActivity }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("q");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!open) return;
    try {
      const raw = tab === "q" ? getQuestions() : getActivities();
      const q = query.trim().toLowerCase();
      const list = (Array.isArray(raw) ? raw : []).filter((it) => {
        if (!q) return true;
        const hay = `${it.question || it.stem || it.name || it.title || ""} ${it.content || ""} ${it.subject || ""}`.toLowerCase();
        return hay.includes(q);
      }).slice(0, 30);
      setItems(list);
    } catch { setItems([]); }
  }, [open, tab, query]);
  if (!open) {
    return <button className="khbd-add-btn" onClick={() => setOpen(true)}><ListPlus size={12} /> Chèn từ kho trong app</button>;
  }
  const label = (it) => tab === "q"
    ? `${it.question || it.stem || "(không đề)"}`.slice(0, 60)
    : `${it.name || it.title || "(không tên)"}`.slice(0, 60);
  return (
    <div className="khbd-bank">
      <div className="khbd-bank-bar">
        <button className={`btn btn-tool btn-xs ${tab === "q" ? "active" : ""}`} onClick={() => setTab("q")}><Library size={12} /> Câu hỏi</button>
        <button className={`btn btn-tool btn-xs ${tab === "a" ? "active" : ""}`} onClick={() => setTab("a")}><Library size={12} /> Hoạt động mẫu</button>
        <button className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>Đóng</button>
      </div>
      <input className="form-control" value={query} placeholder="Tìm trong kho..." onChange={(e) => setQuery(e.target.value)} />
      <div className="khbd-bank-list">
        {items.length === 0 && <div className="khbd-hint">Kho trống hoặc không khớp.</div>}
        {items.map((it) => (
          <div key={it.id} className="khbd-bank-item">
            <span className="khbd-bank-title" title={label(it)}>{label(it)}</span>
            {tab === "q"
              ? <button className="btn btn-secondary btn-xs" onClick={() => onInsertQuestion(it)}>Chèn vào bước HĐ</button>
              : <button className="btn btn-secondary btn-xs" onClick={() => onInsertActivity(it)}>Chèn thành HĐ mới</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 1 bản (GV/HĐ) của 1 bước: textarea + dán (Ctrl+V) / kéo-thả / chọn ảnh
function StepSide({ label, text, placeholder, imgs, onText, onFiles, onRemoveImg }) {
  const [dragOver, setDragOver] = useState(false);
  const dragRef = React.useRef(0);
  const fileRef = React.useRef(null);
  const images = Array.isArray(imgs) ? imgs : [];
  const handlePaste = (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return; // text thường → để textarea xử lý mặc định
    e.preventDefault();
    onFiles(files);
  };
  return (
    <div>
      <span className="khbd-mini">{label}</span>
      <div
        className={`khbd-drop${dragOver ? " over" : ""}`}
        onPaste={handlePaste}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); try { const t = e.dataTransfer?.types; const has = t ? (Array.isArray(t) ? t.includes("Files") : [...t].includes("Files")) : false; if (!has) return; } catch {} dragRef.current += 1; setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch {} }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = Math.max(0, dragRef.current - 1); if (dragRef.current === 0) setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = 0; setDragOver(false); const files = [...(e.dataTransfer?.files || [])].filter((f) => (f.type || "").startsWith("image/")); if (files.length) onFiles(files); }}
        title="Dán ảnh (Ctrl+V), kéo-thả ảnh vào đây, hoặc bấm nút Thêm ảnh"
      >
        <textarea className="form-control" rows={3} value={text || ""} placeholder={placeholder || ""}
          onChange={(e) => onText(e.target.value)} />
        {images.length > 0 && (
          <div className="khbd-thumbs">
            {images.map((im) => (
              <span key={im.id} className="khbd-thumb">
                <img src={im.dataUrl} alt={im.name || "ảnh minh họa"} />
                <button className="khbd-thumb-x" title="Xóa ảnh" onClick={() => onRemoveImg(im.id)}>?</button>
              </span>
            ))}
          </div>
        )}
        <div className="khbd-drop-hint">
          <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()}>+ Thêm ảnh</button>
          <span>{images.length}/{IMG_MAX_PER_SIDE} ảnh · dán / kéo-thả</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={(e) => { onFiles([...(e.target.files || [])]); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function ActivityCard({ act, index, onPatch, onDelete, onMove, onDuplicate, onReorder, onInsertQuestion, onInsertActivity, onAddImages, onRemoveImage }) {
  const [open, setOpen] = useState(true);
  const setStep = (sid, patch) =>
    onPatch({ steps: (act.steps || []).map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const addStep = () => onPatch({ steps: [...(act.steps || []), mkStep()] });
  const delStep = (sid) => {
    if ((act.steps || []).length <= 1) {
      // Luôn giữ =1 bước để 2 cột GV|HĐ trong Word không bao giờ mất
      setStep(sid, { gv: "", hs: "" });
      return;
    }
    if (!confirm("Xóa bước này?")) return;
    onPatch({ steps: (act.steps || []).filter((s) => s.id !== sid) });
  };
  return (
    <div className="khbd-act">
      <div className="khbd-act-head">
        <button className="btn btn-secondary btn-xs" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="khbd-act-no">{act.section}.{index + 1}</span>
        <input className="form-control khbd-act-title" value={act.ten || ""}
          placeholder="Tên hoạt động (VD: Hoạt động 1 – Làm quen...)"
          onChange={(e) => onPatch({ ten: e.target.value })} />
        <input className="form-control khbd-act-min" value={act.phut || ""} placeholder="… phút"
          onChange={(e) => onPatch({ phut: e.target.value })} style={{ maxWidth: 80 }} />
        <select className="form-control" value={act.section} style={{ maxWidth: 90 }}
          onChange={(e) => onMove(e.target.value)}>
          {SECTIONS.map((s) => <option key={s} value={s}>Khu {s}</option>)}
        </select>
        <button className="btn btn-secondary btn-xs" onClick={() => onReorder(-1)} title="Dời lên"><ArrowUp size={13} /></button>
        <button className="btn btn-secondary btn-xs" onClick={() => onReorder(1)} title="Dời xuống"><ArrowDown size={13} /></button>
        <button className="btn btn-secondary btn-xs" onClick={onDuplicate} title="Nhân bản hoạt động"><Copy size={13} /></button>
        <button className="btn btn-danger btn-xs khbd-del" onClick={onDelete} title="Xóa hoạt động"><Trash2 size={13} /></button>
      </div>
      {open && (
        <div className="khbd-act-body">
          <label className="khbd-label">a. Mục tiêu</label>
          <TextArea value={act.mucTieu} onChange={(v) => onPatch({ mucTieu: v })} placeholder="Học sinh..." />
          <label className="khbd-label">b. Phương pháp, hình thức tổ chức</label>
          <div className="khbd-grid2">
            <div><label className="khbd-label">PPDH</label>
              <TextInput value={act.ppdh} onChange={(v) => onPatch({ ppdh: v })} placeholder="Phương pháp dạy học" /></div>
            <div><label className="khbd-label">ĐDDH</label>
              <TextInput value={act.dddh} onChange={(v) => onPatch({ dddh: v })} placeholder="Đồ dùng dạy học" /></div>
          </div>
          <label className="khbd-label">Cách tiến hành (từng bước GV / HĐ)</label>
          {(act.steps || []).map((s, i) => (
            <div key={s.id} className="khbd-step">
              <div className="khbd-step-head">
                <span>Bước {i + 1}</span>
                <button className="btn btn-danger btn-xs khbd-del" onClick={() => delStep(s.id)}>?</button>
              </div>
              <div className="khbd-grid2">
                <StepSide label="Hoạt động của GV" text={s.gv} placeholder="Giáo viên..."
                  imgs={s.gvImgs} side="gvImgs"
                  onText={(v) => setStep(s.id, { gv: v })}
                  onFiles={(f) => onAddImages(s.id, "gvImgs", f)}
                  onRemoveImg={(imgId) => onRemoveImage(s.id, "gvImgs", imgId)} />
                <StepSide label="Hoạt động của HĐ" text={s.hs} placeholder="Học sinh..."
                  imgs={s.hsImgs} side="hsImgs"
                  onText={(v) => setStep(s.id, { hs: v })}
                  onFiles={(f) => onAddImages(s.id, "hsImgs", f)}
                  onRemoveImg={(imgId) => onRemoveImage(s.id, "hsImgs", imgId)} />
              </div>
            </div>
          ))}
          <button className="khbd-add-btn" onClick={addStep}><Plus size={12} /> Thêm bước</button>
          <BankInsert onInsertQuestion={onInsertQuestion} onInsertActivity={onInsertActivity} />
          <label className="khbd-label">Giáo viên rút ra kết luận</label>
          <TextArea value={act.ketLuan} onChange={(v) => onPatch({ ketLuan: v })} placeholder="? ..." />
        </div>
      )}
    </div>
  );
}

// Chia đều phút khu B (giữ tên/số bước đã nhập) — dùng khi đổi thời lượng / thêm / bớt HĐ
function redistributeB(list, duration) {
  const base = Array.isArray(list) && list.length ? list : [{ ten: "", steps: 3 }];
  const m = splitMinutes(duration || 35);
  const rest = Math.max(base.length, m.total - m.A - m.C - m.D);
  const each = Math.floor(rest / base.length);
  return base.map((r, i) => ({ ...r, phut: String(each + (i < rest % base.length ? 1 : 0)) }));
}
function makeDefaultB(duration) {
  return redistributeB(
    [{ ten: "Khám phá", steps: 3 }, { ten: "Luyện tập 1", steps: 3 }, { ten: "Luyện tập 2", steps: 3 }],
    duration);
}

// ? Wizard: tên bài + từ trang tới trang + thời lượng + cấu trúc khu B linh hoạt từng bài (không AI)
function FromPagesWizard({
  pending, books,
  wzBookId, setWzBookId, wzTitle, setWzTitle, wzFrom, setWzFrom, wzTo, setWzTo,
  wzDuration, onDuration, wzB, setWzB, wzMsg, onCreate, onSkip,
}) {
  const excerptCount = Array.isArray(pending?.excerpts) ? pending.excerpts.length : 0;
  const excerptChars = Array.isArray(pending?.excerpts)
    ? pending.excerpts.reduce((n, e) => n + String(e.text || "").length, 0) : 0;
  return (
    <section className="khbd-card" style={{ borderLeft: "4px solid var(--pen-blue)" }}>
      <h4>📝 Tạo giáo án từ sách</h4>
      {pending ? (
        <p className="khbd-hint" style={{ marginTop: 0 }}>
          Nguồn từ BookReader: <b>{pending.bookTitle || "—"}</b>
          {pending.pageStart != null && <> · tr. {pending.pageStart}{pending.pageEnd !== pending.pageStart && <>–{pending.pageEnd}</>}</>}
          {pending.lesson && <> · bài “{pending.lesson}”</>}
          {excerptCount > 0 && <> · đã trích {excerptCount} trang (~{excerptChars} ký tự) để đối chiếu</>}
          .
        </p>
      ) : (
        <p className="khbd-hint" style={{ marginTop: 0 }}>
          Không dùng AI. Điền tên bài + trang + thời lượng, tùy chỉnh cấu trúc khu B rồi bấm Tạo —
          sẽ có ngay khung A / B / C / D (tên + phút + mục tiêu gợi ý) gắn tham chiếu sách–trang.
          Muốn AI đọc trang và điền sẵn toàn bộ: mở sách trong BookReader → tab Giáo án → “Tạo giáo án bằng AI”.
        </p>
      )}
      {!pending && Array.isArray(books) && books.length > 0 && (
        <div><label className="khbd-label">Sách</label>
          <select className="form-control" value={wzBookId} onChange={(e) => setWzBookId(e.target.value)}>
            <option value="">— Chọn sách —</option>
            {books.map((b) => {
              const id = b.filename || b.id || "";
              return <option key={id || b.title} value={id}>{b.title || id} {b.grade ? `· Lớp ${b.grade}` : ""}</option>;
            })}
          </select>
        </div>
      )}
      {excerptCount > 0 && (
        <div>
          <label className="khbd-label">Nội dung đã trích — đặt tên HĐ B theo từng trang</label>
          {(pending.excerpts || []).map((e, i) => (
            <div key={i} className="khbd-hint" style={{ margin: "2px 0" }}>
              <b>tr. {e.page}:</b> {String(e.text || "").slice(0, 120)}{String(e.text || "").length > 120 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
      <div><label className="khbd-label">Tên bài</label>
        <TextInput value={wzTitle} onChange={setWzTitle} placeholder="VD: Bài 12 – Phép cộng trong phạm vi 10" /></div>
      <div className="khbd-grid2">
        <div><label className="khbd-label">Từ trang</label>
          <input className="form-control" type="number" min={1} value={wzFrom}
            placeholder="VD: 12" onChange={(e) => setWzFrom(e.target.value)} /></div>
        <div><label className="khbd-label">Tới trang</label>
          <input className="form-control" type="number" min={1} value={wzTo}
            placeholder="VD: 14" onChange={(e) => setWzTo(e.target.value)} /></div>
      </div>
      <div><label className="khbd-label">Thời lượng (1 tiết)</label>
        <select className="form-control" value={wzDuration} onChange={(e) => onDuration(e.target.value)}>
          <option value="15">15 phút</option>
          <option value="30">30 phút</option>
          <option value="35">35 phút</option>
          <option value="45">45 phút</option>
        </select></div>
      <div>
        <label className="khbd-label">Cấu trúc khu B — đặt tên / thêm / bớt theo từng bài (phút tự chia, sửa được)</label>
        {(wzB || []).map((r, i) => (
          <div key={i} className="khbd-list-row" style={{ gap: 6 }}>
            <span className="khbd-bullet">B{i + 1}</span>
            <input className="form-control" value={r.ten} style={{ flex: 1 }}
              placeholder={`Hoạt động B${i + 1} (VD: Khám phá, Luyện tập…)`}
              onChange={(e) => setWzB((prev) => prev.map((x, j) => (j === i ? { ...x, ten: e.target.value } : x)))} />
            <input className="form-control" type="number" min={1} value={r.phut} title="Số phút" style={{ maxWidth: 62 }}
              onChange={(e) => setWzB((prev) => prev.map((x, j) => (j === i ? { ...x, phut: e.target.value } : x)))} />
            <input className="form-control" type="number" min={1} max={5} value={r.steps} title="Số bước (1–5)" style={{ maxWidth: 54 }}
              onChange={(e) => setWzB((prev) => prev.map((x, j) => (j === i ? { ...x, steps: e.target.value } : x)))} />
            {(wzB || []).length > 1 && (
              <button className="btn btn-danger btn-xs khbd-del" title="Bỏ hoạt động này"
                onClick={() => setWzB((prev) => redistributeB(prev.filter((_, j) => j !== i), wzDuration))}>?</button>
            )}
          </div>
        ))}
        {(wzB || []).length < 6 && (
          <button className="khbd-add-btn"
            onClick={() => setWzB((prev) => redistributeB([...(prev || []), { ten: "", phut: "", steps: 3 }], wzDuration))}>
            <Plus size={12} /> Thêm hoạt động B</button>
        )}
        <div className="khbd-hint">Mỗi dòng: tên HĐ · phút · số bước. Nội dung từng bước tự trích từ trang sách của bài — mỗi bài mỗi khác.</div>
      </div>
      {wzMsg && <div className="khbd-hint" style={{ color: "#b91c1c", fontWeight: 700 }}>{wzMsg}</div>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={onCreate}><BookOpen size={13} /> Tạo khung giáo án</button>
        <button className="btn btn-ghost btn-sm" onClick={onSkip}>Bỏ qua</button>
      </div>
    </section>
  );
}

export default function LessonPlanView({ initialPlanId, books }) {
  const [plans, setPlans] = useState(() => getPlans());
  const [currentId, setCurrentId] = useState(() => initialPlanId || getPlans()[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(() => hasLegacyData());
  // ? Wizard tạo giáo án từ trang sách (không AI: tên bài + trang + thời lượng + cấu trúc khu B) --
  const [pending, setPending] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wzBookId, setWzBookId] = useState("");
  const [wzTitle, setWzTitle] = useState("");
  const [wzFrom, setWzFrom] = useState("");
  const [wzTo, setWzTo] = useState("");
  const [wzDuration, setWzDuration] = useState("35");
  const [wzB, setWzB] = useState(() => makeDefaultB("35"));
  const [wzMsg, setWzMsg] = useState("");
  useEffect(() => {
    try {
      const pd = loadPendingPayload();
      if (pd) {
        setPending(pd);
        setWzBookId(pd.bookId || "");
        setWzTitle(pd.title || pd.lesson || "");
        setWzFrom(pd.pageStart != null ? String(pd.pageStart) : "");
        setWzTo(pd.pageEnd != null ? String(pd.pageEnd) : "");
        const dur = pd.duration ? String(pd.duration) : "35";
        setWzDuration(dur);
        setWzB(makeDefaultB(dur));
        setShowWizard(true);
      }
    } catch {}
  }, []);
  const plan = useMemo(() => plans.find((p) => p.id === currentId) || null, [plans, currentId]);

  useEffect(() => { setPlans(getPlans()); }, []);
  // Mã plan chỉ định từ nơi khác (VD: BookReader chuyển trang sách sang → Wizard tạo khung)
  useEffect(() => {
    if (initialPlanId && getPlan(initialPlanId)) {
      setPlans(getPlans());
      setCurrentId(initialPlanId);
    }
  }, [initialPlanId]);

  const refresh = () => {
    setPlans(getPlans());
    setLegacy(hasLegacyData());
  };
  const update = (patch) => {
    if (!plan) return;
    const next = savePlan({ ...plan, ...patch });
    setPlans(getPlans());
    return next;
  };
  const updateActivity = (actId, patch) => {
    if (!plan) return;
    update({ hoatDong: (plan.hoatDong || []).map((a) => (a.id === actId ? { ...a, ...patch } : a)) });
  };

  const createNew = () => {
    const p = savePlan(mkPlan());
    refresh();
    setCurrentId(p.id);
  };
  const handleDuplicate = () => {
    if (!plan) return;
    const c = duplicatePlan(plan.id);
    refresh();
    if (c) setCurrentId(c.id);
  };
  const handleDelete = () => {
    if (!plan) return;
    if (!confirm(`Xóa "${plan.title || "kế hoạch này"}"?`)) return;
    deletePlan(plan.id);
    const rest = getPlans();
    setPlans(rest);
    setCurrentId(rest[0]?.id || null);
  };
  // ? Sửa khu A/B/C/D từ tên HĐ (cấu bài AI cũ dồn hết vào khu B)
  const handleFixSections = () => {
    if (!plan) return;
    const { acts, fixed } = reassignSectionsByName(plan.hoatDong);
    if (!fixed) { alert("Các hoạt động đã đúng khu A/B/C/D."); return; }
    update({ hoatDong: acts });
    alert(`Đã chuyển ${fixed} hoạt động vào đúng khu — kiểm tra lại mục III rồi xuất Word.`);
  };
  // ? Nút chỉnh: copy mẫu .docx → fill → tải ngay
  const handleAddKhbd = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      update({}); // chốt nháp trước khi xuất
      await exportPlanDocx(plan);
    } catch (e) {
      alert(`Xuất .docx thất bại: ${e?.message || "không rõ nguyên nhân"}`);
    } finally {
      setBusy(false);
    }
  };
  const handleClearLegacy = () => {
    if (!confirm("Xóa toàn bộ dữ liệu KHBD cũ (sgk_lessonplans_*, sgk_autosave_*)? Dữ liệu mới khbd_v2_* được giữ nguyên.")) return;
    const removed = clearLegacyData();
    setLegacy(hasLegacyData());
    alert(removed.length ? `Đã xóa ${removed.length} key cũ:\n${removed.slice(0, 10).join("\n")}` : "Không còn data cũ.");
  };

  // ? Wizard: mở form (tên bài + trang + thời lượng + cấu trúc khu B linh hoạt)
  const handleWzDuration = (v) => {
    setWzDuration(v);
    setWzB((prev) => redistributeB(prev && prev.length ? prev : makeDefaultB(v), v));
  };
  const openWizard = () => {
    setWzMsg("");
    if (!pending) {
      const first = Array.isArray(books) && books.length ? books[0] : null;
      setWzBookId(first ? (first.filename || first.id || "") : "");
      if (!wzTitle) setWzTitle("");
      if (!wzFrom) setWzFrom("");
      if (!wzTo) setWzTo("");
      if (!wzDuration) setWzDuration("35");
      setWzB((prev) => (prev && prev.length ? prev : makeDefaultB(wzDuration || "35")));
    }
    setShowWizard(true);
  };
  const closeWizard = (dropPending) => {
    setShowWizard(false);
    setWzMsg("");
    if (dropPending) {
      clearPendingPayload();
      setPending(null);
    }
  };
  // ? Wizard: fill khung A / B (linh hoạt) / C / D đầy đủ cấu trúc (không AI)
  const handleWizardCreate = () => {
    setWzMsg("");
    const f = parseInt(wzFrom, 10);
    const t = parseInt(wzTo, 10);
    if (!Number.isFinite(f) || f < 1) { setWzMsg("Nhập “Từ trang” (số >= 1)."); return; }
    const tt = Number.isFinite(t) ? t : f;
    if (tt < f) { setWzMsg("“Tới trang” phải >= “Từ trang”."); return; }
    if (tt - f + 1 > MAX_RANGE_PAGES) { setWzMsg(`Tối đa ${MAX_RANGE_PAGES} trang/lần — hãy thu hẹp khoảng trang.`); return; }
    const dur = parseInt(wzDuration, 10) || 35;
    let meta = { bookId: wzBookId, bookTitle: "", bookSeries: "", subject: "", grade: "" };
    if (pending && (pending.bookId || "") === (wzBookId || "")) {
      meta = {
        bookId: pending.bookId || wzBookId,
        bookTitle: pending.bookTitle || "",
        bookSeries: pending.bookSeries || "",
        subject: pending.subject || "",
        grade: pending.grade || "",
      };
    } else if (Array.isArray(books)) {
      const b = books.find((x) => (x.filename || x.id || "") === wzBookId);
      if (b) meta = {
        bookId: b.filename || b.id || "",
        bookTitle: b.title || b.filename || "",
        bookSeries: b.series || b.bookSeries || "",
        subject: b.subject || "",
        grade: b.grade != null ? String(b.grade) : "",
      };
    }
    const sameRange = pending &&
      Number(pending.pageStart) === f && Number(pending.pageEnd) === tt &&
      (pending.bookId || "") === (meta.bookId || "");
    const bClean = (wzB || [])
      .map((r) => ({
        ten: String(r.ten || "").trim(),
        phut: parseInt(r.phut, 10) || 0,
        steps: Math.min(5, Math.max(1, parseInt(r.steps, 10) || 3)),
      }))
      .filter((r) => r.ten || r.phut > 0)
      .slice(0, 6);
    const payload = {
      ...meta,
      lesson: pending?.lesson || "",
      title: wzTitle.trim() || pending?.lesson || pending?.title || "",
      pageStart: f,
      pageEnd: tt,
      duration: String(dur),
      excerpts: sameRange && Array.isArray(pending.excerpts) ? pending.excerpts : [],
      structure: { b: bClean.length ? bClean : [{ ten: "", phut: 0, steps: 3 }] },
    };
    try {
      const p = buildPlanFromPages(payload);
      const saved = savePlan(p);
      refresh();
      setCurrentId(saved.id);
      clearPendingPayload();
      setPending(null);
      setShowWizard(false);
    } catch (e) {
      setWzMsg(`Không tạo được khung: ${e.message || e}`);
    }
  };

  const bySec = useMemo(() => {
    const g = { A: [], B: [], C: [], D: [] };
    for (const a of plan?.hoatDong || []) {
      const s = (a.section || "B").toUpperCase();
      if (g[s]) g[s].push(a);
    }
    return g;
  }, [plan]);
  const minutes = useMemo(() => planMinutes(plan), [plan]);
  const [aiBusy, setAiBusy] = useState(false);

  // ? AI chia giờ: gợi ý phút cho từng hoạt động theo từng 1 tiết, confirm rồi mới áp
  const handleAiTime = async () => {
    if (!plan || !(plan.hoatDong || []).length) { alert("Chưa có hoạt động nào để chia giờ."); return; }
    const apiKey = getGeminiApiKey();
    if (!apiKey) { alert("Chưa có Gemini API Key — vào Cài đặt → AI để nhập khóa."); return; }
    setAiBusy(true);
    try {
      const model = (() => { try { return loadSettings().ai?.model || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; } })();
      const target = numMin((plan.thoiGian || "").replace(/[^\d.,]/g, "")) || 35;
      const list = (plan.hoatDong || []).map((a, i) =>
        `${i + 1}. [${a.section}] ${a.ten || "(chưa tên)"} (hiện tại: ${a.phut || "…"} phút)`).join("\n");
      const prompt = `Bạn là chuyên gia phân phối thời gian tiết dạy tiểu học Việt Nam.\nKế hoạch: môn "${plan.monHoc || ""}", lớp "${plan.lop || ""}", bài "${plan.title || ""}".\nTổng thời gian mục tiêu: ${target} phút.\nCác hoạt động:\n${list}\nHãy phân phối phút cho từng hoạt động (số nguyên, tổng đúng ${target}). Chỉ trả JSON thuần, không markdown:\n{"allocations":[{"stt":1,"phut":5,"lydo":"..."}]}`;
      const text = await aiService.callAI({
        apiKey, model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: "Bạn là chuyên gia soạn giáo án tiểu học. Chỉ trả JSON hợp lệ.",
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: "application/json" },
      });
      const m = String(text || "").match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI không trả về JSON.");
      const parsed = JSON.parse(m[0]);
      const allocs = Array.isArray(parsed.allocations) ? parsed.allocations : [];
      if (!allocs.length) throw new Error("AI không gợi ý được phút nào.");
      const preview = allocs.map((al) => {
        const act = (plan.hoatDong || [])[Number(al.stt) - 1];
        return `• ${act ? act.ten || `HĐ ${al.stt}` : `HĐ ${al.stt}`}: ${al.phut} phút${al.lydo ? ` (${al.lydo})` : ""}`;
      }).join("\n");
      if (!confirm(`AI gợi ý chia ${target} phút:\n${preview}\n\nÁp dụng?`)) return;
      const next = (plan.hoatDong || []).map((a, i) => {
        const al = allocs.find((x) => Number(x.stt) - 1 === i);
        return al && Number(al.phut) > 0 ? { ...a, phut: String(Math.round(Number(al.phut))) } : a;
      });
      update({ hoatDong: next });
    } catch (e) {
      alert(`AI chia giờ thất bại: ${getFriendlyErrorMessage(e?.status, e?.message) || e.message || e}`);
    } finally {
      setAiBusy(false);
    }
  };

  // ? Nâng cao (chỉ thao tác mảng plan, không đổi shape form)
  const duplicateActivity = (actId) => {
    const src = (plan.hoatDong || []).find((a) => a.id === actId);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = makeKhbdId("hd");
    copy.ten = `${src.ten || "Hoạt động"} (bản sao)`;
    copy.steps = (copy.steps || []).map((s) => ({ ...s, id: makeKhbdId("buoc") }));
    const arr = [...(plan.hoatDong || [])];
    arr.splice(arr.findIndex((a) => a.id === actId) + 1, 0, copy);
    update({ hoatDong: arr });
  };
  const reorderActivity = (actId, dir) => {
    const arr = [...(plan.hoatDong || [])];
    const idx = arr.findIndex((a) => a.id === actId);
    const sec = arr[idx]?.section;
    // Dời chỉ với HĐ cùng khu gần nhất theo hướng dir
    let j = idx + dir;
    while (j >= 0 && j < arr.length && arr[j].section !== sec) j += dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    update({ hoatDong: arr });
  };
  const insertQuestionStep = (actId, q) => {
    const st = questionToStep(q);
    if (!st.gv.trim() && !st.hs.trim()) { alert("Câu hỏi trống."); return; }
    const act = (plan.hoatDong || []).find((a) => a.id === actId);
    if (!act) return;
    updateActivity(actId, { steps: [...(act.steps || []), { id: makeKhbdId("buoc"), gv: st.gv, hs: st.hs }] });
  };
  const insertBankActivity = (bankAct) => {
    const sec = PHASE_TO_SEC[bankAct.phase] || "B";
    update({ hoatDong: [...(plan.hoatDong || []), bankActivityToNew(bankAct, sec)] });
  };
  // ? ảnh từng bước: nén → gắn vào bản GV/HĐ, chặn vượt quota
  const addStepImages = async (actId, stepId, side, files) => {
    const list = [...(files || [])].filter((f) => f && f.type && f.type.startsWith("image/"));
    if (!list.length || !plan) return;
    const act = (plan.hoatDong || []).find((a) => a.id === actId);
    const step = act?.steps?.find((s) => s.id === stepId);
    if (!act || !step) return;
    const cur = Array.isArray(step[side]) ? step[side] : [];
    const room = IMG_MAX_PER_SIDE - cur.length;
    if (room <= 0) { alert(`Mỗi bên tối đa ${IMG_MAX_PER_SIDE} ảnh.`); return; }
    const fresh = [];
    for (const f of list.slice(0, room)) {
      try {
        const c = await compressImageFile(f);
        fresh.push({ id: makeImgId(), dataUrl: c.dataUrl, width: c.width, height: c.height, name: c.name });
      } catch (e) { alert(`Bỏ qua 1 ảnh lỗi: ${e.message || e}`); }
    }
    if (!fresh.length) return;
    const tentative = {
      ...plan,
      hoatDong: (plan.hoatDong || []).map((a) => a.id === actId
        ? { ...a, steps: (a.steps || []).map((s) => (s.id === stepId ? { ...s, [side]: [...cur, ...fresh] } : s)) }
        : a),
    };
    if (estimatePlanBytes(tentative) > PLAN_MAX_BYTES) { alert("Kế hoạch quá nặng (>4.5MB) — hãy xóa bớt ảnh cũ rồi thêm."); return; }
    savePlan(tentative);
    setPlans(getPlans());
  };
  const removeStepImage = (actId, stepId, side, imgId) => {
    const act = (plan?.hoatDong || []).find((a) => a.id === actId);
    if (!act) return;
    updateActivity(actId, {
      steps: (act.steps || []).map((s) => (s.id === stepId
        ? { ...s, [side]: (s[side] || []).filter((im) => im.id !== imgId) }
        : s)),
    });
  };

  if (!plan) {
    return (
      <div className="khbd-root">
        <div className="khbd-empty">
          <FileText size={28} />
          <h3>Chưa có kế hoạch bài dạy</h3>
          <p>Tạo mới để soạn theo mẫu KTSP.</p>
          <button className="btn btn-primary btn-sm" onClick={createNew}><Plus size={14} /> Kế hoạch bài dạy mới</button>
          <button className="btn btn-secondary btn-sm" onClick={openWizard} title="Tạo khung giáo án từ trang sách">
            <BookOpen size={13} /> Tạo từ trang sách{pending ? " (có nội dung chờ)" : ""}
          </button>
          {legacy && (
            <button className="btn btn-secondary btn-sm" onClick={handleClearLegacy}><Database size={13} /> Dọn data KHBD cũ</button>
          )}
        </div>
        {showWizard && (
          <main className="khbd-main" style={{ maxWidth: 640 }}>
            <FromPagesWizard
              pending={pending} books={books}
              wzBookId={wzBookId} setWzBookId={setWzBookId}
              wzTitle={wzTitle} setWzTitle={setWzTitle}
              wzFrom={wzFrom} setWzFrom={setWzFrom}
              wzTo={wzTo} setWzTo={setWzTo}
              wzDuration={wzDuration} onDuration={handleWzDuration} wzB={wzB} setWzB={setWzB}
              wzMsg={wzMsg} onCreate={handleWizardCreate}
              onSkip={() => closeWizard(true)}
            />
          </main>
        )}
        {!showWizard && (
          <main className="khbd-main" style={{ maxWidth: 640 }}>
            <LessonUrlImport
              defaultDuration="35"
              onImported={(id) => { refresh(); setCurrentId(id); }}
            />
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="khbd-root">
      {/* Sidebar */}
      <aside className="khbd-side">
        <button className="btn btn-primary btn-sm" onClick={createNew}><Plus size={14} /> Kế hoạch mới</button>
        <button className="btn btn-secondary btn-sm" onClick={() => {
          try {
            const p = fillSampleLessonPlan();
            refresh();
            setCurrentId(p.id);
          } catch (e) { alert(`Tạo bài mẫu thất bại: ${e.message || e}`); }
        }} title="Tạo bài mẫu Toán lớp 1 (Phép cộng trong phạm vi 10)"><Sparkles size={13} /> Bài mẫu</button>
        <button className="btn btn-secondary btn-sm" onClick={openWizard} title="Tạo khung giáo án từ trang sách (tên bài + từ trang tới trang + thời lượng)">
          <BookOpen size={13} /> Tạo từ trang sách{pending ? " •" : ""}
        </button>
        {legacy && (
          <button className="btn btn-danger btn-sm khbd-del" onClick={handleClearLegacy} title="Xóa sgk_lessonplans_*, sgk_autosave_*">
            <Database size={13} /> Dọn data cũ
          </button>
        )}
        <div className="khbd-side-list">
          {plans.map((p) => (
            <button key={p.id} className={`khbd-side-item ${p.id === currentId ? "on" : ""}`}
              onClick={() => setCurrentId(p.id)}>
              <span className="khbd-side-title">{p.title || "(Chưa đặt tên)"}</span>
              <span className="khbd-side-sub">{p.monHoc || "—"} · Lớp {p.lop || "…"}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <main className="khbd-main">
        <div className="khbd-toolbar">
          <input className="form-control khbd-title" value={plan.title || ""}
            placeholder="Tên bài học (VD: Bài 12 – Phép cộng trong phạm vi 10)"
            onChange={(e) => update({ title: e.target.value })} />
          <div className="khbd-tools">
            <button className="btn btn-secondary btn-sm" onClick={handleDuplicate} title="Nhân bản"><Copy size={13} /> Nhân bản</button>
            <button className="btn btn-primary btn-sm" onClick={handleAddKhbd} disabled={busy} title="Copy file mẫu → thay chỗ trống → tải .docx">
              <Download size={13} /> {busy ? "Đang tạo..." : "Thêm KHBD (.docx)"}
            </button>
            <button className="btn btn-icon khbd-del" onClick={handleDelete} title="Xóa kế hoạch"><Trash2 size={15} /></button>
          </div>
        </div>
        <div className="khbd-saved"><CheckCircle2 size={12} /> Tự động lưu nháp</div>

        {/* ── Nhập giáo án từ URL (ưu tiên kenhgiaovien): bản thô y hệt + AI chuẩn hóa ── */}
        <details className="khbd-card" style={{ borderLeft: "4px solid var(--success, #16a34a)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "0.85rem" }}>
            🔗 Nhập giáo án từ URL (kenhgiaovien.com…) — lấy y hệt + AI chuẩn hóa
          </summary>
          <div style={{ marginTop: "0.5rem" }}>
            <LessonUrlImport
              defaultDuration={String(numMin((plan.thoiGian || "").replace(/[^\d.,]/g, "")) || 35)}
              onImported={(id) => { refresh(); setCurrentId(id); }}
            />
            {plan?.metadata?.sourceUrl && (
              <div className="khbd-hint" style={{ marginTop: "0.4rem" }}>
                Nguồn web của bài này: <b>{plan.metadata.sourceSite || plan.metadata.sourceUrl}</b>
                {plan.metadata.sourceIsPaywalled ? " (bản preview công khai)" : ""} ·
                {" "}<a href={plan.metadata.sourceUrl} target="_blank" rel="noreferrer">mở nguồn</a>
                {plan.metadata.sourceText && <> · đã lưu bản gốc y hệt ({(plan.metadata.sourceText || "").length} ký tự) trong dữ liệu bài</>}
                {(plan.metadata.sourceImages || []).length > 0 && <> · {(plan.metadata.sourceImages || []).length} ảnh trong folder lesson-images</>}
              </div>
            )}
          </div>
        </details>

        {/* ── Bản gốc y hệt từ web: chữ + ảnh đúng vị trí ── */}
        {plan?.metadata?.sourceText && (
          <details className="khbd-card" style={{ borderLeft: "4px solid var(--pen-blue, #2563eb)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "0.85rem" }}>
              📄 Bản gốc y hệt từ web ({(plan.metadata.sourceText || "").length} ký tự{(plan.metadata.sourceImages || []).length ? ` · ${(plan.metadata.sourceImages || []).length} ảnh` : ""})
            </summary>
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", whiteSpace: "pre-wrap", maxHeight: 480, overflowY: "auto", background: "var(--surface-soft, #f8fafc)", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.55rem 0.65rem" }}>
              <SourcePreview text={plan.metadata.sourceText} images={plan.metadata.sourceImages} />
            </div>
          </details>
        )}

        {/* ? WIZARD tạo giáo án từ trang sách (không AI) */}
        {showWizard && (
          <FromPagesWizard
            pending={pending} books={books}
            wzBookId={wzBookId} setWzBookId={setWzBookId}
            wzTitle={wzTitle} setWzTitle={setWzTitle}
            wzFrom={wzFrom} setWzFrom={setWzFrom}
            wzTo={wzTo} setWzTo={setWzTo}
            wzDuration={wzDuration} onDuration={handleWzDuration} wzB={wzB} setWzB={setWzB}
            wzMsg={wzMsg} onCreate={handleWizardCreate}
            onSkip={() => closeWizard(true)}
          />
        )}

        {/* ? THANH THỜI GIAN CHUNG — tổng + từng khu, AI chia giờ */}
        <div className="khbd-timebar">
          <span className="khbd-time-total"><Clock size={13} /> Tổng: <b>{minutes.total} phút</b></span>
          {SECTIONS.map((s) => (
            <span key={s} className="khbd-chip">{s} · {minutes.counts[s]} HĐ · {minutes.bySec[s]}&prime;</span>
          ))}
          <button className="btn btn-secondary btn-sm khbd-time-ai" onClick={handleAiTime} disabled={aiBusy} title="AI phân phối phút cho từng hoạt động theo từng 1 tiết">
            <Wand2 size={13} /> {aiBusy ? "AI đang tính..." : "AI chia giờ"}
          </button>
        </div>

        {/* BÌA */}
        <section className="khbd-card">
          <h4>Trang bìa</h4>
          <div className="khbd-grid2">
            <div><label className="khbd-label">Sinh viên kiến tập</label>
              <TextInput value={plan.sv} onChange={(v) => update({ sv: v })} /></div>
            <div><label className="khbd-label">MSSV</label>
              <TextInput value={plan.mssv} onChange={(v) => update({ mssv: v })} /></div>
            <div><label className="khbd-label">Lớp (Số)</label>
              <TextInput value={plan.lopSV} onChange={(v) => update({ lopSV: v })} /></div>
            <div><label className="khbd-label">GV hướng dẫn kiến tập</label>
              <TextInput value={plan.gvhd} onChange={(v) => update({ gvhd: v })} /></div>
            <div><label className="khbd-label">Năm học</label>
              <TextInput value={plan.namHoc} onChange={(v) => update({ namHoc: v })} /></div>
          </div>
        </section>

        {/* TIÊU ĐỀ */}
        <section className="khbd-card">
          <h4>Kế hoạch bài dạy — thông tin chung</h4>
          <div className="khbd-grid2">
            <div><label className="khbd-label">Môn học</label>
              <TextInput value={plan.monHoc} onChange={(v) => update({ monHoc: v })} placeholder="VD: Toán" /></div>
            <div><label className="khbd-label">Lớp</label>
              <TextInput value={plan.lop} onChange={(v) => update({ lop: v })} placeholder="VD: 2" /></div>
            <div><label className="khbd-label">Tuần</label>
              <TextInput value={plan.tuan} onChange={(v) => update({ tuan: v })} /></div>
            <div><label className="khbd-label">Số tiết</label>
              <TextInput value={plan.soTiet} onChange={(v) => update({ soTiet: v })} /></div>
            <div><label className="khbd-label">Họ và tên</label>
              <TextInput value={plan.hoVaTen} onChange={(v) => update({ hoVaTen: v })} /></div>
            <div><label className="khbd-label">MSSV (thực tập)</label>
              <TextInput value={plan.mssvTT} onChange={(v) => update({ mssvTT: v })} /></div>
            <div><label className="khbd-label">Lớp dạy</label>
              <TextInput value={plan.lopDay} onChange={(v) => update({ lopDay: v })} /></div>
            <div><label className="khbd-label">Thời gian thực hiện</label>
              <TextInput value={plan.thoiGian} onChange={(v) => update({ thoiGian: v })} placeholder="VD: 35 phút" /></div>
          </div>
        </section>

        {/* I. YCCD */}
        <section className="khbd-card">
          <h4>I. Yêu cầu cần đạt</h4>
          <label className="khbd-label">1. Năng lực đặc thù</label>
          {(plan.nlDacThu || []).map((v, i) => (
            <div key={i} className="khbd-list-row">
              <span className="khbd-bullet">-</span>
              <input className="form-control" value={v} placeholder={`Năng lực đặc thù ${i + 1}`}
                onChange={(e) => update({ nlDacThu: (plan.nlDacThu || []).map((x, j) => (j === i ? e.target.value : x)) })} />
            </div>
          ))}
          <label className="khbd-label">* Liên hệ / Tích hợp (nếu có)</label>
          <TextArea value={plan.lienHe} onChange={(v) => update({ lienHe: v })} />
          <label className="khbd-label">2. Năng lực chung</label>
          {(plan.nlChung || []).map((v, i) => (
            <div key={i} className="khbd-list-row">
              <span className="khbd-bullet">-</span>
              <input className="form-control" value={v} placeholder={`Năng lực chung ${i + 1}`}
                onChange={(e) => update({ nlChung: (plan.nlChung || []).map((x, j) => (j === i ? e.target.value : x)) })} />
            </div>
          ))}
          <label className="khbd-label">3. Phẩm chất</label>
          {(plan.phamChat || []).map((v, i) => (
            <div key={i} className="khbd-list-row">
              <span className="khbd-bullet">-</span>
              <input className="form-control" value={v} placeholder={`Phẩm chất ${i + 1}`}
                onChange={(e) => update({ phamChat: (plan.phamChat || []).map((x, j) => (j === i ? e.target.value : x)) })} />
            </div>
          ))}
        </section>

        {/* II. ĐỒ DÙNG */}
        <section className="khbd-card">
          <h4>II. Đồ dùng dạy học</h4>
          <div className="khbd-grid2">
            <div><label className="khbd-label">GV</label>
              <ListEditor items={plan.ddGV} onChange={(v) => update({ ddGV: v })} placeholder="Đồ dùng GV..." addLabel="Thêm đồ dùng GV" /></div>
            <div><label className="khbd-label">HĐ</label>
              <ListEditor items={plan.ddHS} onChange={(v) => update({ ddHS: v })} placeholder="Đồ dùng HĐ..." addLabel="Thêm đồ dùng HĐ" /></div>
          </div>
        </section>

        {/* III. HOẠT ĐỘNG */}
        <section className="khbd-card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>III. Hoạt động dạy học</h4>
            <button className="btn btn-secondary btn-xs" onClick={handleFixSections}
              title="Tự chuyển các hoạt động vào đúng khu A/B/C/D theo tên (cấu bài AI cũ dồn hết vào khu B)">
              <Wrench size={12} /> Sửa khu
            </button>
          </div>
          {SECTIONS.map((sec) => (
            <div key={sec} className="khbd-sec">
              <div className="khbd-sec-head">
                <span>{sec}. {SECTION_LABEL[sec]} ({bySec[sec].length} HĐ · {minutes.bySec[sec]}&prime;)</span>
                <button className="khbd-add-btn" onClick={() => {
                  const a = mkActivity(sec);
                  update({ hoatDong: [...(plan.hoatDong || []), a] });
                }}><Plus size={12} /> Thêm hoạt động {sec}</button>
              </div>
              {bySec[sec].map((a, i) => (
                <ActivityCard key={a.id} act={a} index={i}
                  onPatch={(patch) => updateActivity(a.id, patch)}
                  onMove={(to) => updateActivity(a.id, { section: to })}
                  onDuplicate={() => duplicateActivity(a.id)}
                  onReorder={(dir) => reorderActivity(a.id, dir)}
                  onInsertQuestion={(q) => insertQuestionStep(a.id, q)}
                  onInsertActivity={(b) => insertBankActivity(b)}
                  onAddImages={(sid, side, files) => addStepImages(a.id, sid, side, files)}
                  onRemoveImage={(sid, side, imgId) => removeStepImage(a.id, sid, side, imgId)}
                  onDelete={() => {
                    if (!confirm("Xóa hoạt động này?")) return;
                    update({ hoatDong: (plan.hoatDong || []).filter((x) => x.id !== a.id) });
                  }} />
              ))}
              {bySec[sec].length === 0 && <div className="khbd-hint">Chưa có hoạt động {sec}.</div>}
            </div>
          ))}
        </section>

        {/* IV + V */}
        <section className="khbd-card">
          <h4>IV. Điều chỉnh sau bài dạy</h4>
          <TextArea value={plan.dieuChinh} onChange={(v) => update({ dieuChinh: v })} rows={4}
            placeholder="Ghi điều chỉnh sau khi dạy..." />
        </section>
        <section className="khbd-card">
          <h4>V. Phụ lục tiết dạy</h4>
          <TextArea value={plan.phuLuc} onChange={(v) => update({ phuLuc: v })} rows={4}
            placeholder="Phụ lục, phiếu, hình ảnh mở rộng..." />
        </section>
      </main>
    </div>
  );
}