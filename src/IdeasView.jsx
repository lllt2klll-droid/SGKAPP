// ── Ý tưởng dạy học — kho ý tưởng chi tiết (schema v2) ────────────────
// Gồm: thống kê, lọc/tìm nâng cao, lưới thẻ + bảng, form đầy đủ (mục tiêu,
// bước tiến hành, biến thể, đánh giá, ghi chú lớp), nhật ký dạy thử, đánh
// giá sao, yêu thích, nhân bản, xuất Word/JSON, chuyển thành Hoạt động.
import React, { useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Check,
  Copy,
  Eye,
  Sparkles,
  Download,
  Upload,
  FileText,
  LayoutGrid,
  List,
  Clock,
  Target,
  Boxes,
  ClipboardList,
  FlaskConical,
  Users,
  BookOpen,
  Heart,
  Repeat,
  Wand2,
  Layers,
} from "lucide-react";
import DOMPurify from "dompurify";
import ConfirmDialog from "./ui/ConfirmDialog.jsx";
import RichTextArea from "./RichText";
import SampleButton from "./SampleButton";
import { exportWord, escapeHtml } from "./exportDoc";
import {
  getIdeas,
  createIdea,
  updateIdea,
  deleteIdea,
  duplicateIdea,
  toggleFavoriteIdea,
  rateIdea,
  logTrial,
  removeTrial,
  importIdeasJSON,
  exportIdeasJSON,
  IDEA_TYPES,
  IDEA_PHASES,
  IDEA_FORMATS,
  IDEA_DIFFICULTIES,
  IDEA_STATUSES,
  ideaTypeLabel,
  ideaPhaseLabel,
  ideaFormatLabel,
  ideaStatusLabel,
} from "./personalDB";
import { addActivity } from "./teachingDB";
import { fillSampleIdeas } from "./sampleData";
import { appEvents, AppEvents } from "./core/appEvents.js";

const TYPE_ICON = Object.fromEntries(IDEA_TYPES.map((t) => [t.id, t.icon]));
const PHASE_COLORS = {
  chung: "#8b5cf6",
  khoiDong: "#f59e0b",
  khamPha: "#2d73ff",
  luyenTap: "#16a34a",
  vanDung: "#db2777",
  danDo: "#64748b",
};

const EMPTY_FORM = {
  id: null,
  title: "",
  summary: "",
  description: "",
  subject: "",
  grade: "",
  type: "khac",
  phase: "chung",
  format: "",
  difficulty: "",
  status: "nhap",
  duration: "",
  prepTime: "",
  objectives: "",
  materials: "",
  steps: [],
  variations: "",
  assessment: "",
  classroomTips: "",
  competencies: "",
  tags: "",
  favorite: false,
  rating: 0,
};

function safeHtml(s) {
  try { return DOMPurify.sanitize(String(s || "")); } catch { return escapeHtml(stripHtml(s)); }
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ideaToForm(idea) {
  return {
    id: idea.id,
    title: idea.title || "",
    summary: idea.summary || "",
    description: idea.description || "",
    subject: idea.subject || "",
    grade: idea.grade || "",
    type: idea.type || "khac",
    phase: idea.phase || "chung",
    format: idea.format || "",
    difficulty: idea.difficulty || "",
    status: idea.status || "nhap",
    duration: idea.duration === "" ? "" : String(idea.duration ?? ""),
    prepTime: idea.prepTime || "",
    objectives: idea.objectives || "",
    materials: idea.materials || "",
    steps: (idea.steps || []).map((s) => ({ id: s.id, title: s.title, content: s.content, minutes: s.minutes })),
    variations: idea.variations || "",
    assessment: idea.assessment || "",
    classroomTips: idea.classroomTips || "",
    competencies: idea.competencies || "",
    tags: (idea.tags || []).join(", "),
    favorite: !!idea.favorite,
    rating: idea.rating || 0,
  };
}

export default function IdeasView({ onNavigate }) {
  const [ideas, setIdeas] = useState([]);
  const [view, setView] = useState("grid");
  const [query, setQuery] = useState("");
  const [fType, setFType] = useState("");
  const [fPhase, setFPhase] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [sortBy, setSortBy] = useState("new");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [detail, setDetail] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [trialFor, setTrialFor] = useState(null);
  const [trialForm, setTrialForm] = useState({ date: "", className: "", students: "", result: "", note: "" });

  const load = () => {
    try { setIdeas(getIdeas()); } catch (e) { console.warn("[IdeasView] load failed", e); setIdeas([]); }
  };

  useEffect(() => {
    load();
    const off = appEvents.on(AppEvents.DATA_UPDATED, (detail) => {
      const src = detail?.source || detail?.domain || "";
      if (!detail || src === "" || /personalDB|idea|mission|storage|cross-tab|trash/i.test(String(src))) load();
    });
    return () => { try { off(); } catch {} };
  }, []);

  const subjects = useMemo(
    () => [...new Set(ideas.map((i) => i.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [ideas],
  );

  const stats = useMemo(() => {
    const total = ideas.length;
    const fav = ideas.filter((i) => i.favorite).length;
    const tried = ideas.filter((i) => (i.triedCount || 0) > 0).length;
    const withSteps = ideas.filter((i) => (i.steps || []).length > 0).length;
    return { total, fav, tried, withSteps };
  }, [ideas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ideas.filter((i) => {
      const okQ = !q || [i.title, i.summary, i.description, i.objectives, i.materials, i.competencies, i.classroomTips, (i.tags || []).join(" ")]
        .some((s) => stripHtml(s).toLowerCase().includes(q));
      const okT = !fType || i.type === fType;
      const okP = !fPhase || i.phase === fPhase;
      const okS = !fSubject || i.subject === fSubject;
      const okSt = !fStatus || i.status === fStatus;
      const okF = !onlyFav || i.favorite;
      return okQ && okT && okP && okS && okSt && okF;
    });
    const by = {
      new: (x, y) => (y.updatedAt || 0) < (x.updatedAt || 0) ? -1 : 1,
      title: (x, y) => String(x.title || "").localeCompare(String(y.title || ""), "vi"),
      rating: (x, y) => (y.rating || 0) - (x.rating || 0),
      tried: (x, y) => (y.triedCount || 0) - (x.triedCount || 0),
    }[sortBy] || ((x, y) => (y.updatedAt || 0) < (x.updatedAt || 0) ? -1 : 1);
    return [...list].sort(by);
  }, [ideas, query, fType, fPhase, fSubject, fStatus, onlyFav, sortBy]);

  const startNew = () => { setForm(EMPTY_FORM); setFormError(""); setShowForm(true); };
  const startEdit = (idea) => { setForm(ideaToForm(idea)); setFormError(""); setShowForm(true); };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, { title: "", content: "", minutes: "" }] }));
  const updateStep = (idx, k, v) => setForm((f) => ({ ...f, steps: f.steps.map((s, i) => (i === idx ? { ...s, [k]: v } : s)) }));
  const removeStep = (idx) => setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));
  const moveStep = (idx, dir) => setForm((f) => {
    const steps = [...f.steps];
    const j = idx + dir;
    if (j < 0 || j >= steps.length) return f;
    [steps[idx], steps[j]] = [steps[j], steps[idx]];
    return { ...f, steps };
  });

  const save = () => {
    if (!form.title.trim()) { setFormError("Vui lòng nhập tiêu đề ý tưởng."); return; }
    const payload = {
      ...form,
      title: form.title.trim(),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      steps: form.steps.filter((s) => s.title.trim() || s.content.trim()),
      duration: form.duration === "" ? "" : Number(form.duration),
    };
    delete payload.id;
    try {
      if (form.id) updateIdea(form.id, payload);
      else createIdea(payload);
    } catch (e) {
      setFormError(e.message || "Không lưu được ý tưởng.");
      return;
    }
    setShowForm(false);
    setFormError("");
    load();
  };

  const doDelete = (idea) => setPendingDelete(idea);
  const confirmDelete = () => {
    if (pendingDelete) { try { deleteIdea(pendingDelete.id); } catch (e) { console.warn("[IdeasView] delete failed", e); } }
    setPendingDelete(null);
    load();
  };

  const doDuplicate = (idea) => { try { duplicateIdea(idea.id); } catch (e) { console.warn(e); } load(); };
  const doFavorite = (idea) => { try { toggleFavoriteIdea(idea.id); } catch (e) { console.warn(e); } load(); };

  const copyContent = async (idea) => {
    const text = [
      idea.title,
      idea.summary && `\nTóm tắt: ${idea.summary}`,
      idea.objectives && `\nMục tiêu: ${stripHtml(idea.objectives)}`,
      idea.materials && `\nChuẩn bị: ${stripHtml(idea.materials)}`,
      (idea.steps || []).length ? `\nTiến hành:\n${idea.steps.map((s, i) => `${i + 1}. ${s.title}${s.minutes ? ` (${s.minutes}')` : ""}\n   ${stripHtml(s.content)}`).join("\n")}` : "",
      idea.variations && `\nBiến thể: ${stripHtml(idea.variations)}`,
      idea.assessment && `\nĐánh giá: ${stripHtml(idea.assessment)}`,
      idea.classroomTips && `\nLưu ý lớp học: ${stripHtml(idea.classroomTips)}`,
    ].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(text); alert("Đã sao chép ý tưởng (dạng văn bản thuần)."); }
    catch { alert("Không sao chép được."); }
  };

  const buildIdeaHtml = (idea) => {
    const e = escapeHtml;
    let h = `<h1>${e(idea.title)}</h1>`;
    h += `<p><em>${e(ideaTypeLabel(idea.type))} • ${e(ideaPhaseLabel(idea.phase))}${idea.subject ? ` • ${e(idea.subject)}` : ""}${idea.grade ? ` • Lớp ${e(idea.grade)}` : ""}${idea.duration ? ` • ${e(String(idea.duration))} phút` : ""}</em></p>`;
    if (idea.summary) h += `<p><strong>Tóm tắt:</strong> ${e(idea.summary)}</p>`;
    if (idea.objectives) h += `<p><strong>Mục tiêu:</strong> ${e(stripHtml(idea.objectives))}</p>`;
    if (idea.competencies) h += `<p><strong>Năng lực – phẩm chất:</strong> ${e(idea.competencies)}</p>`;
    if (idea.materials) h += `<p><strong>Chuẩn bị:</strong> ${e(stripHtml(idea.materials))}</p>`;
    if ((idea.steps || []).length) {
      h += `<p><strong>Các bước tiến hành:</strong></p><ol>`;
      idea.steps.forEach((s) => { h += `<li><strong>${e(s.title)}</strong>${s.minutes ? ` (${e(String(s.minutes))} phút)` : ""}<br>${e(stripHtml(s.content))}</li>`; });
      h += `</ol>`;
    }
    if (idea.variations) h += `<p><strong>Biến thể / Mở rộng:</strong> ${e(stripHtml(idea.variations))}</p>`;
    if (idea.assessment) h += `<p><strong>Đánh giá:</strong> ${e(stripHtml(idea.assessment))}</p>`;
    if (idea.classroomTips) h += `<p><strong>Lưu ý tổ chức lớp:</strong> ${e(stripHtml(idea.classroomTips))}</p>`;
    if ((idea.tags || []).length) h += `<p><em>Thẻ: ${idea.tags.map((t) => "#" + e(t)).join(", ")}</em></p>`;
    return h;
  };

  const exportOne = (idea) => exportWord(idea.title || "Y tuong day hoc", buildIdeaHtml(idea));

  const exportAll = () => {
    if (!filtered.length) { alert("Không có ý tưởng nào để xuất."); return; }
    let h = `<h1>Kho ý tưởng dạy học (${filtered.length})</h1><div class="meta">Xuất ${new Date().toLocaleString("vi-VN")}</div>`;
    h += filtered.map(buildIdeaHtml).join("<hr>");
    exportWord("Kho y tuong day hoc", h);
  };

  const exportJson = () => {
    const data = exportIdeasJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `y-tuong-day-hoc_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch {} }, 1200);
  };

  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ""));
          const n = importIdeasJSON(parsed, "merge");
          load();
          alert(`Đã nhập ${n} ý tưởng (bỏ qua mục trùng tiêu đề/môn/lớp).`);
        } catch (e) { alert("File không hợp lệ: " + (e.message || "lỗi đọc JSON")); }
      };
      reader.readAsText(f);
    };
    input.click();
  };

  const ideaToPlainText = (idea) => {
    const lines = [];
    if (idea.summary) lines.push(`Tóm tắt: ${idea.summary}`);
    if (idea.objectives) lines.push(`Mục tiêu: ${stripHtml(idea.objectives)}`);
    if (idea.competencies) lines.push(`Năng lực – phẩm chất: ${idea.competencies}`);
    if (idea.materials) lines.push(`Chuẩn bị: ${stripHtml(idea.materials)}`);
    if (idea.description) lines.push(`Cách tổ chức: ${stripHtml(idea.description)}`);
    if ((idea.steps || []).length) {
      lines.push("Các bước tiến hành:");
      idea.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}${s.minutes ? ` (${s.minutes} phút)` : ""}${s.content ? `: ${stripHtml(s.content)}` : ""}`));
    }
    if (idea.variations) lines.push(`Biến thể: ${stripHtml(idea.variations)}`);
    if (idea.assessment) lines.push(`Đánh giá: ${stripHtml(idea.assessment)}`);
    if (idea.classroomTips) lines.push(`Lưu ý: ${stripHtml(idea.classroomTips)}`);
    return lines.join("\n");
  };

  const convertToActivity = (idea) => {
    try {
      addActivity({
        phase: idea.phase === "chung" ? "khoiDong" : idea.phase,
        name: idea.title,
        content: ideaToPlainText(idea),
        grade: idea.grade,
        subject: idea.subject,
        tags: idea.tags || [],
      });
      alert("Đã chuyển thành Hoạt động trong Kho hoạt động.");
    } catch (e) { alert("Không chuyển được: " + (e.message || "")); }
  };

  const openTrial = (idea) => {
    setTrialFor(idea);
    setTrialForm({ date: new Date().toISOString().slice(0, 10), className: "", students: "", result: "", note: "" });
  };
  const submitTrial = () => {
    if (!trialFor) return;
    try { logTrial(trialFor.id, trialForm); } catch (e) { console.warn(e); }
    const updated = getIdeas().find((i) => i.id === trialFor.id) || trialFor;
    setTrialFor(null);
    load();
    if (detail && detail.id === updated.id) setDetail(updated);
  };
  const doRemoveTrial = (ideaId, trialId) => { try { removeTrial(ideaId, trialId); } catch (e) { console.warn(e); } load(); if (detail?.id === ideaId) setDetail(getIdeas().find((i) => i.id === ideaId) || null); };

  const renderStars = (rating) => (
    <span className="ideax-stars" aria-label={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((s) => <span key={s} style={{ color: s <= rating ? "#f59e0b" : "#d1d5db" }}>★</span>)}
    </span>
  );

  const refreshSamples = () => {
    const n = fillSampleIdeas();
    load();
    alert(n ? `Đã thêm ${n} ý tưởng dạy học mẫu chi tiết.` : "Các ý tưởng mẫu đã có sẵn.");
  };

  return (
    <div className="ideas-view ideax-root">
      <style>{`
        .ideas-view { display:flex; flex-direction:column; gap:14px; }
        .ideax-root { display:flex; flex-direction:column; gap:14px; }
        .ideax-head { background:linear-gradient(135deg, rgba(245,158,11,0.10), rgba(45,115,255,0.06)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
        .ideax-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .ideax-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .ideax-title-ic { width:32px; height:32px; border-radius:10px; background:#f59e0b; color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(245,158,11,0.35); }
        .ideax-stats { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
        .ideax-stat { font-size:11.5px; font-weight:700; color:#334155; background:rgba(255,255,255,0.85); border:1px solid #e2e8f0; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
        .ideax-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .ideax-search { flex:1 1 220px; min-width:180px; position:relative; }
        .ideax-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .ideax-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .ideax-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; display:inline-flex; }
        .ideax-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .ideax-viewtoggle { display:inline-flex; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
        .ideax-viewtoggle button { border:none; background:#fff; padding:7px 10px; cursor:pointer; color:#64748b; display:inline-flex; align-items:center; }
        .ideax-viewtoggle button.on { background:#0f172a; color:#fff; }
        .ideax-chips { display:flex; gap:6px; flex-wrap:wrap; }
        .ideax-chip { font-size:12px; font-weight:800; padding:6px 12px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        .ideax-chip.on { color:#fff; border-color:transparent; }
        .ideax-chip .n { font-size:10.5px; background:rgba(0,0,0,0.08); padding:1px 6px; border-radius:999px; }
        .ideax-chip.on .n { background:rgba(255,255,255,0.25); }
        .ideax-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px; }
        .ideax-card { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; border-top:3px solid #64748b; transition:transform 0.15s ease, box-shadow 0.15s ease; }
        .ideax-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,0.10); }
        .ideax-card-body { padding:12px 13px; display:flex; flex-direction:column; gap:8px; flex:1; }
        .ideax-badges { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
        .ideax-badge { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px; }
        .ideax-badge.phase { color:#fff; }
        .ideax-badge.soft { background:#f8fafc; color:#475569; border:1px solid #e2e8f0; }
        .ideax-badge.status { background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; }
        .ideax-badge.fav { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
        .ideax-card-title { margin:0; font-size:0.94rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .ideax-card-summary { margin:0; font-size:12px; color:var(--text-muted); line-height:1.55; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .ideax-card-meta { font-size:11px; color:var(--text-muted); display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
        .ideax-card-foot { display:flex; gap:6px; align-items:center; margin-top:auto; padding-top:9px; border-top:1px dashed var(--border-color); }
        .ideax-view-btn { flex:1; min-width:0; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12.5px; font-weight:800; padding:8px 10px; border-radius:10px; border:none; background:#f59e0b; color:#fff; cursor:pointer; box-shadow:0 3px 10px rgba(245,158,11,0.32); }
        .ideax-view-btn:hover { filter:brightness(1.06); }
        .ideax-icobtn { width:33px; height:33px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; transition:border-color 0.15s ease, color 0.15s ease, background 0.15s ease; }
        .ideax-icobtn:hover { border-color:#f59e0b; color:#b45309; background:#fffbeb; }
        .ideax-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .ideax-empty { text-align:center; padding:36px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
        .ideax-form { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
        .ideax-form h4 { margin:0; font-size:0.95rem; }
        .ideax-fieldset { border:1px solid var(--border-color); border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:9px; }
        .ideax-fieldset > legend { font-size:12px; font-weight:800; color:#475569; padding:0 6px; }
        .ideax-step { border:1px solid var(--border-color); border-radius:10px; padding:9px; background:var(--surface-soft); display:flex; flex-direction:column; gap:7px; }
        .ideax-step-head { display:flex; align-items:center; gap:6px; }
        .ideax-step-num { width:22px; height:22px; border-radius:7px; background:#f59e0b; color:#fff; font-size:11px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ideax-stars { letter-spacing:1px; font-size:14px; }
        .ideax-detail-sec { border-top:1px dashed var(--border-color); padding-top:9px; }
        .ideax-detail-sec h5 { margin:0 0 4px; font-size:12px; color:#475569; text-transform:uppercase; letter-spacing:.03em; }
        .ideax-step-line { display:flex; gap:9px; margin-bottom:8px; }
        .ideax-step-dot { width:24px; height:24px; border-radius:50%; background:#f59e0b; color:#fff; font-size:11px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ideax-trial { border:1px solid var(--border-color); border-radius:10px; padding:8px 10px; background:var(--surface-soft); }
      `}</style>

      <div className="ideax-head">
        <div className="ideax-title-row">
          <h2 className="ideax-title"><span className="ideax-title-ic"><Lightbulb size={17} /></span> Ý tưởng dạy học</h2>
          <div className="ideax-stats">
            <span className="ideax-stat"><Layers size={12} /> {stats.total} ý tưởng</span>
            <span className="ideax-stat"><Heart size={12} /> {stats.fav} yêu thích</span>
            <span className="ideax-stat"><Repeat size={12} /> {stats.tried} đã dạy thử</span>
            <span className="ideax-stat"><ClipboardList size={12} /> {stats.withSteps} có bước tiến hành</span>
          </div>
        </div>
        <div className="ideax-toolbar">
          <div className="ideax-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tiêu đề, mục tiêu, chuẩn bị, thẻ…" aria-label="Tìm ý tưởng" />
            {query && <button className="ideax-search-clear" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>}
          </div>
          <select value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Lọc loại hình">
            <option value="">Mọi loại hình</option>
            {IDEA_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
          <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label="Lọc môn">
            <option value="">Mọi môn</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Lọc trạng thái">
            <option value="">Mọi trạng thái</option>
            {IDEA_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sắp xếp">
            <option value="new">Mới cập nhật</option>
            <option value="title">Tên A–Z</option>
            <option value="rating">Đánh giá cao</option>
            <option value="tried">Dạy nhiều</option>
          </select>
          <div className="ideax-viewtoggle" role="group" aria-label="Kiểu hiển thị">
            <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} title="Lưới thẻ" aria-label="Lưới thẻ"><LayoutGrid size={15} /></button>
            <button className={view === "table" ? "on" : ""} onClick={() => setView("table")} title="Bảng" aria-label="Bảng"><List size={15} /></button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={startNew}><Plus size={14} /> Ý tưởng mới</button>
          <button className="btn btn-secondary btn-sm" onClick={exportAll} title="Xuất Word toàn bộ"><Download size={13} /> Xuất Word</button>
          <button className="btn btn-secondary btn-sm" onClick={exportJson} title="Xuất JSON toàn bộ"><FileText size={13} /> JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={importJson} title="Nhập JSON"><Upload size={13} /> Nhập</button>
          <SampleButton label="Tự động làm" onRun={refreshSamples} />
        </div>
        <div className="ideax-chips" role="tablist" aria-label="Lọc giai đoạn">
          <button role="tab" aria-selected={!fPhase} className={`ideax-chip ${!fPhase ? "on" : ""}`}
            style={!fPhase ? { background: "#0f172a" } : undefined} onClick={() => setFPhase("")}>
            Mọi giai đoạn <span className="n">{ideas.length}</span>
          </button>
          <button role="tab" aria-selected={onlyFav} className={`ideax-chip ${onlyFav ? "on" : ""}`}
            style={onlyFav ? { background: "#dc2626" } : undefined} onClick={() => setOnlyFav((v) => !v)}>
            <Heart size={11} /> Yêu thích <span className="n">{stats.fav}</span>
          </button>
          {IDEA_PHASES.map((p) => (
            <button key={p.id} role="tab" aria-selected={fPhase === p.id}
              className={`ideax-chip ${fPhase === p.id ? "on" : ""}`}
              style={fPhase === p.id ? { background: PHASE_COLORS[p.id] } : undefined}
              onClick={() => setFPhase(fPhase === p.id ? "" : p.id)}>
              <span>{p.icon} {p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="ideax-form">
          <h4>{form.id ? "✏️ Sửa ý tưởng" : "➕ Ý tưởng mới"}</h4>
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Tiêu đề *</label>
              <input className="form-control" value={form.title} maxLength={150}
                onChange={(e) => setField("title", e.target.value)} placeholder='VD: Trò chơi "Ai nhanh hơn" luyện phép cộng' />
            </div>
            <div>
              <label className="form-label">Loại hình</label>
              <select className="form-control" value={form.type} onChange={(e) => setField("type", e.target.value)}>
                {IDEA_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Tóm tắt ngắn</label>
            <textarea className="form-control" rows={2} maxLength={500} value={form.summary}
              onChange={(e) => setField("summary", e.target.value)} placeholder="Mô tả 1–2 câu để nhìn nhanh ý tưởng" />
          </div>
          <div className="tag-grid-3">
            <div>
              <label className="form-label">Giai đoạn</label>
              <select className="form-control" value={form.phase} onChange={(e) => setField("phase", e.target.value)}>
                {IDEA_PHASES.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Hình thức</label>
              <select className="form-control" value={form.format} onChange={(e) => setField("format", e.target.value)}>
                <option value="">— Chọn —</option>
                {IDEA_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Độ khó / công phu</label>
              <select className="form-control" value={form.difficulty} onChange={(e) => setField("difficulty", e.target.value)}>
                <option value="">— Chọn —</option>
                {IDEA_DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Môn</label>
              <input className="form-control" value={form.subject} onChange={(e) => setField("subject", e.target.value)} placeholder="Toán / Tiếng Việt…" />
            </div>
            <div>
              <label className="form-label">Khối lớp</label>
              <input className="form-control" value={form.grade} onChange={(e) => setField("grade", e.target.value)} placeholder="VD: 1 hoặc 1–2" />
            </div>
            <div>
              <label className="form-label">Thời lượng (phút)</label>
              <input className="form-control" type="number" min={1} max={120} value={form.duration} onChange={(e) => setField("duration", e.target.value)} placeholder="VD: 15" />
            </div>
            <div>
              <label className="form-label">Thời gian chuẩn bị</label>
              <input className="form-control" value={form.prepTime} onChange={(e) => setField("prepTime", e.target.value)} placeholder="VD: 10 phút / sau giờ học" />
            </div>
          </div>

          <fieldset className="ideax-fieldset">
            <legend>Nội dung sư phạm</legend>
            <div>
              <label className="form-label">Mục tiêu</label>
              <RichTextArea value={form.objectives} onChange={(v) => setField("objectives", v)} placeholder="Kiến thức, kỹ năng, năng lực – phẩm chất cần đạt" minHeight={70} />
            </div>
            <div>
              <label className="form-label">Chuẩn bị (đồ dùng, học liệu)</label>
              <RichTextArea value={form.materials} onChange={(v) => setField("materials", v)} placeholder="Thẻ số, tranh, phiếu bài tập…" minHeight={60} />
            </div>
            <div>
              <label className="form-label">Mô tả chi tiết / cách tổ chức</label>
              <RichTextArea value={form.description} onChange={(v) => setField("description", v)} placeholder="Mô tả tổng thể, luật chơi, cách chia nhóm…" minHeight={90} />
            </div>
          </fieldset>

          <fieldset className="ideax-fieldset">
            <legend>Các bước tiến hành ({form.steps.length})</legend>
            {form.steps.map((s, i) => (
              <div className="ideax-step" key={i}>
                <div className="ideax-step-head">
                  <span className="ideax-step-num">{i + 1}</span>
                  <input className="form-control" value={s.title} onChange={(e) => updateStep(i, "title", e.target.value)} placeholder={`Tên bước ${i + 1}`} style={{ flex: 1 }} />
                  <input className="form-control" type="number" min={1} max={120} value={s.minutes} onChange={(e) => updateStep(i, "minutes", e.target.value)} placeholder="phút" style={{ width: 74 }} />
                  <button className="btn btn-ghost btn-xs" onClick={() => moveStep(i, -1)} disabled={i === 0} title="Lên">↑</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => moveStep(i, 1)} disabled={i === form.steps.length - 1} title="Xuống">↓</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => removeStep(i)} title="Xóa bước" aria-label="Xóa bước"><Trash2 size={13} /></button>
                </div>
                <RichTextArea value={s.content} onChange={(v) => updateStep(i, "content", v)} placeholder="Giáo viên làm gì, học sinh làm gì…" minHeight={56} />
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={addStep} style={{ alignSelf: "flex-start" }}><Plus size={13} /> Thêm bước</button>
          </fieldset>

          <fieldset className="ideax-fieldset">
            <legend>Mở rộng & đánh giá</legend>
            <div>
              <label className="form-label">Biến thể / Mở rộng</label>
              <RichTextArea value={form.variations} onChange={(v) => setField("variations", v)} placeholder="Cách điều chỉnh cho lớp yếu/khá, đổi luật, liên hệ thực tế…" minHeight={60} />
            </div>
            <div>
              <label className="form-label">Đánh giá học sinh</label>
              <RichTextArea value={form.assessment} onChange={(v) => setField("assessment", v)} placeholder="Quan sát gì, hỏi gì, ghi nhận gì…" minHeight={60} />
            </div>
            <div>
              <label className="form-label">Lưu ý tổ chức lớp</label>
              <RichTextArea value={form.classroomTips} onChange={(v) => setField("classroomTips", v)} placeholder="An toàn, trật tự, quản lý thời gian, chuẩn bị trước…" minHeight={56} />
            </div>
            <div>
              <label className="form-label">Năng lực – phẩm chất hướng tới</label>
              <input className="form-control" value={form.competencies} onChange={(e) => setField("competencies", e.target.value)} placeholder="VD: Giao tiếp – hợp tác; giải quyết vấn đề…" />
            </div>
          </fieldset>

          <div className="tag-grid-2">
            <div>
              <label className="form-label">Thẻ (phân cách dấu phẩy)</label>
              <input className="form-control" value={form.tags} onChange={(e) => setField("tags", e.target.value)} placeholder="trò chơi, nhóm đôi, thực tế…" />
            </div>
            <div>
              <label className="form-label">Trạng thái</label>
              <select className="form-control" value={form.status} onChange={(e) => setField("status", e.target.value)}>
                {IDEA_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={form.favorite} onChange={(e) => setField("favorite", e.target.checked)} /> Đánh dấu yêu thích
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Tự đánh giá:</span>
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} className="btn btn-ghost btn-xs" style={{ color: s <= form.rating ? "#f59e0b" : "#d1d5db", fontSize: "1.05rem" }}
                  onClick={() => setField("rating", s === form.rating ? 0 : s)} title={`${s} sao`}>{s <= form.rating ? "★" : "☆"}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={save} disabled={!form.title.trim()}><Check size={14} /> Lưu ý tưởng</button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setFormError(""); }}><X size={14} /> Hủy</button>
          </div>
          {formError && <div className="util-error" role="alert">{formError}</div>}
        </div>
      )}

      {ideas.length === 0 ? (
        <div className="ideax-empty">
          <Lightbulb size={40} />
          <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>Kho ý tưởng đang trống.</p>
          <p style={{ margin: 0, fontSize: 12 }}>Ghi lại các trò chơi, hoạt động, dự án hay để tái sử dụng cho nhiều lớp. Hoặc bấm “Tự động làm” để xem ví dụ.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ideax-empty">
          <p style={{ margin: 0, fontWeight: 700 }}>Không khớp bộ lọc.</p>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>Thử đổi từ khóa, loại hình hoặc giai đoạn.</p>
        </div>
      ) : view === "grid" ? (
        <div className="ideax-grid">
          {filtered.map((idea) => {
            const color = PHASE_COLORS[idea.phase] || "#64748b";
            return (
              <article key={idea.id} className="ideax-card" style={{ borderTopColor: color }}>
                <div className="ideax-card-body">
                  <div className="ideax-badges">
                    <span className="ideax-badge phase" style={{ background: color }}>{ideaPhaseLabel(idea.phase)}</span>
                    <span className="ideax-badge soft">{TYPE_ICON[idea.type] || "💡"} {ideaTypeLabel(idea.type)}</span>
                    <span className="ideax-badge status" style={{ background: `${IDEA_STATUSES.find((s) => s.id === idea.status)?.color || "#64748b"}18`, color: IDEA_STATUSES.find((s) => s.id === idea.status)?.color || "#64748b" }}>{ideaStatusLabel(idea.status)}</span>
                    {idea.favorite && <span className="ideax-badge fav"><Heart size={10} /> Yêu thích</span>}
                  </div>
                  <h3 className="ideax-card-title">{idea.title}</h3>
                  {idea.summary && <p className="ideax-card-summary">{idea.summary}</p>}
                  <div className="ideax-card-meta">
                    {idea.subject && <span>{idea.subject}</span>}
                    {idea.grade && <span>Lớp {idea.grade}</span>}
                    {idea.duration ? <span><Clock size={11} /> {idea.duration}′</span> : null}
                    {(idea.steps || []).length > 0 && <span><ClipboardList size={11} /> {idea.steps.length} bước</span>}
                    {(idea.triedCount || 0) > 0 && <span><Repeat size={11} /> đã thử {idea.triedCount}</span>}
                    {renderStars(idea.rating || 0)}
                  </div>
                  <div className="ideax-card-foot">
                    <button className="ideax-view-btn" onClick={() => setDetail(idea)} title="Xem chi tiết"><Eye size={13} /> Xem</button>
                    <button className="ideax-icobtn" onClick={() => doFavorite(idea)} title="Yêu thích" aria-label="Yêu thích"><Heart size={14} style={idea.favorite ? { color: "#dc2626", fill: "#dc2626" } : undefined} /></button>
                    <button className="ideax-icobtn" onClick={() => startEdit(idea)} title="Sửa" aria-label="Sửa"><Pencil size={14} /></button>
                    <button className="ideax-icobtn" onClick={() => doDuplicate(idea)} title="Nhân bản" aria-label="Nhân bản"><Copy size={14} /></button>
                    <button className="ideax-icobtn" onClick={() => exportOne(idea)} title="Xuất Word" aria-label="Xuất Word"><Download size={14} /></button>
                    <button className="ideax-icobtn danger" onClick={() => doDelete(idea)} title="Xóa" aria-label="Xóa"><Trash2 size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="data-table-wrap">
          <div className="data-table-scroller">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tiêu đề</th><th>Loại</th><th>Giai đoạn</th><th>Môn</th><th>Lớp</th>
                <th>Thời lượng</th><th>Số bước</th><th>Đã thử</th><th>★</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((idea) => (
                <tr key={idea.id}>
                  <td style={{ fontWeight: 600 }}>{idea.favorite ? "❤️ " : ""}{idea.title}</td>
                  <td>{TYPE_ICON[idea.type]} {ideaTypeLabel(idea.type)}</td>
                  <td>{ideaPhaseLabel(idea.phase)}</td>
                  <td>{idea.subject || "—"}</td>
                  <td>{idea.grade || "—"}</td>
                  <td>{idea.duration ? `${idea.duration}′` : "—"}</td>
                  <td>{(idea.steps || []).length || "—"}</td>
                  <td>{idea.triedCount || 0}</td>
                  <td>{idea.rating ? `★ ${idea.rating}` : "—"}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-icon btn-sm" onClick={() => setDetail(idea)} title="Xem"><Eye size={14} /></button>
                      <button className="btn btn-icon btn-sm" onClick={() => startEdit(idea)} title="Sửa"><Pencil size={14} /></button>
                      <button className="btn btn-icon btn-sm" onClick={() => doDuplicate(idea)} title="Nhân bản"><Copy size={14} /></button>
                      <button className="btn btn-icon btn-sm btn-danger" onClick={() => doDelete(idea)} title="Xóa"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)} style={{ zIndex: "var(--z-modal-top)" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(820px, calc(100vw - 20px))", width: "min(820px, calc(100vw - 20px))", maxHeight: "90vh", overflow: "auto" }}>
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", minWidth: 0, flexWrap: "wrap" }}>
                <Lightbulb size={16} /> <span>{detail.title}</span>
              </h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setDetail(null)} aria-label="Đóng"><X size={16} /></button>
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="ideax-badge phase" style={{ background: PHASE_COLORS[detail.phase] }}>{ideaPhaseLabel(detail.phase)}</span>
                <span className="ideax-badge soft">{TYPE_ICON[detail.type]} {ideaTypeLabel(detail.type)}</span>
                {detail.format && <span className="ideax-badge soft"><Users size={10} /> {ideaFormatLabel(detail.format)}</span>}
                {detail.difficulty && <span className="ideax-badge soft">{IDEA_DIFFICULTIES.find((d) => d.id === detail.difficulty)?.label}</span>}
                {detail.subject && <span className="ideax-badge soft">{detail.subject}{detail.grade ? ` • Lớp ${detail.grade}` : ""}</span>}
                {detail.duration ? <span className="ideax-badge soft"><Clock size={10} /> {detail.duration} phút</span> : null}
                {detail.prepTime && <span className="ideax-badge soft">Chuẩn bị: {detail.prepTime}</span>}
                <span className="ideax-badge status" style={{ background: `${IDEA_STATUSES.find((s) => s.id === detail.status)?.color}18`, color: IDEA_STATUSES.find((s) => s.id === detail.status)?.color }}>{ideaStatusLabel(detail.status)}</span>
                {renderStars(detail.rating || 0)}
              </div>

              {detail.summary && <div style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 13 }}>{detail.summary}</div>}

              {detail.objectives && <div className="ideax-detail-sec"><h5><Target size={12} /> Mục tiêu</h5><div style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: safeHtml(detail.objectives) }} /></div>}
              {detail.competencies && <div className="ideax-detail-sec"><h5>Năng lực – phẩm chất</h5><div style={{ fontSize: 13 }}>{detail.competencies}</div></div>}
              {detail.materials && <div className="ideax-detail-sec"><h5><Boxes size={12} /> Chuẩn bị</h5><div style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: safeHtml(detail.materials) }} /></div>}
              {detail.description && <div className="ideax-detail-sec"><h5>Mô tả / Cách tổ chức</h5><div style={{ fontSize: 13, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: safeHtml(detail.description) }} /></div>}

              {(detail.steps || []).length > 0 && (
                <div className="ideax-detail-sec">
                  <h5><ClipboardList size={12} /> Các bước tiến hành</h5>
                  {detail.steps.map((s, i) => (
                    <div className="ideax-step-line" key={s.id || i}>
                      <span className="ideax-step-dot">{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}{s.minutes ? <span style={{ fontWeight: 500, color: "var(--text-muted)" }}> · {s.minutes} phút</span> : null}</div>
                        {s.content && <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-muted)" }} dangerouslySetInnerHTML={{ __html: safeHtml(s.content) }} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {detail.variations && <div className="ideax-detail-sec"><h5>Biến thể / Mở rộng</h5><div style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: safeHtml(detail.variations) }} /></div>}
              {detail.assessment && <div className="ideax-detail-sec"><h5>Đánh giá học sinh</h5><div style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: safeHtml(detail.assessment) }} /></div>}
              {detail.classroomTips && <div className="ideax-detail-sec"><h5>Lưu ý tổ chức lớp</h5><div style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: safeHtml(detail.classroomTips) }} /></div>}
              {(detail.tags || []).length > 0 && <div className="ideax-detail-sec"><h5>Thẻ</h5><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{detail.tags.map((t) => <span key={t} className="ideax-badge soft">#{t}</span>)}</div></div>}

              <div className="ideax-detail-sec">
                <h5><FlaskConical size={12} /> Nhật ký dạy thử ({detail.trials?.length || 0})</h5>
                {(detail.trials || []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Chưa có lần dạy thử nào. Bấm “Ghi dạy thử” để lưu kết quả thực tế.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {detail.trials.map((t) => (
                      <div className="ideax-trial" key={t.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: 12.5 }}>{new Date(t.date).toLocaleDateString("vi-VN")}{t.className ? ` — ${t.className}` : ""}{t.students ? ` (${t.students} HS)` : ""}</strong>
                          <button className="btn btn-ghost btn-xs" onClick={() => doRemoveTrial(detail.id, t.id)} title="Xóa lần dạy thử"><Trash2 size={12} /></button>
                        </div>
                        {t.result && <div style={{ fontSize: 12.5, color: "#16a34a" }}>Kết quả: {t.result}</div>}
                        {t.note && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.note}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", borderTop: "1px solid var(--border-color)", paddingTop: 10 }}>
                <button className="btn btn-secondary btn-xs" onClick={() => openTrial(detail)}><FlaskConical size={12} /> Ghi dạy thử</button>
                <button className="btn btn-secondary btn-xs" onClick={() => convertToActivity(detail)}><Wand2 size={12} /> Chuyển thành Hoạt động</button>
                <button className="btn btn-secondary btn-xs" onClick={() => exportOne(detail)}><Download size={12} /> Xuất Word</button>
                <button className="btn btn-secondary btn-xs" onClick={() => copyContent(detail)}><Copy size={12} /> Sao chép</button>
                <button className="btn btn-secondary btn-xs" onClick={() => { startEdit(detail); setDetail(null); }}><Pencil size={12} /> Sửa</button>
                <button className="btn btn-primary btn-xs" onClick={() => setDetail(null)}><X size={12} /> Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {trialFor && (
        <div className="modal-overlay" onClick={() => setTrialFor(null)} style={{ zIndex: "var(--z-modal-above)" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(520px, calc(100vw - 20px))", width: "min(520px, calc(100vw - 20px))" }}>
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><FlaskConical size={16} /> Ghi nhật ký dạy thử</h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setTrialFor(null)} aria-label="Đóng"><X size={16} /></button>
            </div>
            <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{trialFor.title}</div>
              <div className="tag-grid-2">
                <div>
                  <label className="form-label">Ngày dạy</label>
                  <input className="form-control" type="date" value={trialForm.date} onChange={(e) => setTrialForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Lớp</label>
                  <input className="form-control" value={trialForm.className} onChange={(e) => setTrialForm((f) => ({ ...f, className: e.target.value }))} placeholder="VD: 1A2" />
                </div>
              </div>
              <div>
                <label className="form-label">Sĩ số tham gia</label>
                <input className="form-control" type="number" min={0} value={trialForm.students} onChange={(e) => setTrialForm((f) => ({ ...f, students: e.target.value }))} placeholder="VD: 32" />
              </div>
              <div>
                <label className="form-label">Kết quả</label>
                <input className="form-control" value={trialForm.result} onChange={(e) => setTrialForm((f) => ({ ...f, result: e.target.value }))} placeholder="VD: Học sinh hứng thú, 80% làm đúng" />
              </div>
              <div>
                <label className="form-label">Ghi chú / điều chỉnh lần sau</label>
                <textarea className="form-control" rows={3} value={trialForm.note} onChange={(e) => setTrialForm((f) => ({ ...f, note: e.target.value }))} placeholder="Điều gì hiệu quả, cần sửa gì…" />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={() => setTrialFor(null)}>Hủy</button>
                <button className="btn btn-primary" onClick={submitTrial}><Check size={14} /> Lưu nhật ký</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Xóa ý tưởng này?"
        message="Ý tưởng sẽ được chuyển vào Thùng rác (giữ 30 ngày) và có thể khôi phục."
        confirmText="Xóa"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      {onNavigate && (
        <div className="panel-box mt-md" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Liên kết nhanh:</span>
          <button className="btn btn-secondary btn-xs" onClick={() => onNavigate("activities")}><Sparkles size={12} /> Kho hoạt động</button>
          <button className="btn btn-secondary btn-xs" onClick={() => onNavigate("lessonplans")}><BookOpen size={12} /> Giáo án</button>
          <button className="btn btn-secondary btn-xs" onClick={() => onNavigate("worksheets")}>Phiếu học tập</button>
          <button className="btn btn-secondary btn-xs" onClick={() => onNavigate("questionbank")}>Ngân hàng câu hỏi</button>
        </div>
      )}
    </div>
  );
}
