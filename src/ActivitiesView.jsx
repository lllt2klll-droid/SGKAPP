// ── Thư viện hoạt động dạy học mẫu (dùng lại cho nhiều giáo án) ───
// Redesign: header thống kê + chip giai đoạn + lưới cards (giữ nguyên 100%
// dữ liệu & chức năng: CRUD, sao chép, xuất Word, đánh giá sao, nhập từ ảnh).
import React, { useMemo, useState, useEffect } from "react";
import { uiMessage } from "./core/errors.js";

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
import {
  Puzzle,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Copy,
  Eye,
  Gamepad2,
  FileText,
  Download,
  Search,
  Sparkles,
  Star,
  MessageSquare,
  Layers,
  BookOpen,
} from "lucide-react";
import RichTextArea from "./RichText";
import SourceBadge from "./scan/SourceBadge";
import {
  PHASES,
  getActivities,
  addActivity,
  updateActivity,
  deleteActivity,
} from "./teachingDB";
import { safeGetJSON, safeSetJSON } from "./safeStorage.js";
import SampleButton from "./SampleButton";
import { fillSampleActivities } from "./sampleData";
import ImageUploadModal from "./ImageUploadModal";

const EMPTY = {
  phase: "khoiDong",
  name: "",
  content: "",
  grade: "",
  subject: "",
  tags: "",
};

const PHASE_COLORS = {
  khoiDong: "#f59e0b",
  khamPha: "#2d73ff",
  luyenTap: "#16a34a",
  vanDung: "#8b5cf6",
  danDo: "#64748b",
};

function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function ActivitiesView({ books, onNavigate }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => setTick(t=>t+1); window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [sortBy, setSortBy] = useState("new"); // new | title | rating
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [previewAct, setPreviewAct] = useState(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(null); // activity id being reviewed
  const [formError, setFormError] = useState("");
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: '' });
  const [ratings, setRatings] = useState(() => {
    return safeGetJSON('sgk_activity_ratings', {}, (v) => v !== null && typeof v === 'object' && !Array.isArray(v));
  });

  const activities = getActivities();

  const subjects = useMemo(
    () => [...new Set(activities.map((a) => a.subject).filter(Boolean))],
    [activities],
  );

  const phaseCounts = useMemo(() => {
    const m = {};
    activities.forEach((a) => { m[a.phase] = (m[a.phase] || 0) + 1; });
    return m;
  }, [activities]);

  const stats = useMemo(() => {
    const games = activities.filter((a) => a?.meta?.type === "game").length;
    const fromScan = activities.filter((a) => a?.source?.type === "sgk_scan").length;
    return { total: activities.length, games, fromScan };
  }, [activities]);

  // Rating functions (giữ nguyên)
  const getActivityRating = (activityId) => {
    const activityRatings = ratings[activityId] || [];
    if (activityRatings.length === 0) return null;
    const avg = activityRatings.reduce((sum, r) => sum + r.rating, 0) / activityRatings.length;
    return { average: avg, count: activityRatings.length };
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = activities.filter((a) => {
      const okQ =
        !q ||
        (a.name || "").toLowerCase().includes(q) ||
        stripHtml(a.content).toLowerCase().includes(q) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(q));
      const okP = !phaseFilter || a.phase === phaseFilter;
      const okS = !fSubject || a.subject === fSubject;
      return okQ && okP && okS;
    });
    const by = {
      new: (x, y) => (y.at || 0) - (x.at || 0),
      title: (x, y) => String(x.name || "").localeCompare(String(y.name || ""), "vi"),
      rating: (x, y) => {
        const rx = getActivityRating(x.id);
        const ry = getActivityRating(y.id);
        return (ry?.average || 0) - (rx?.average || 0);
      },
    }[sortBy] || ((x, y) => (y.at || 0) - (x.at || 0));
    return [...list].sort(by);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, query, phaseFilter, fSubject, sortBy, ratings]);

  const startNew = (phase = "khoiDong") => {
    setForm({ ...EMPTY, phase });
    setEditingId(null);
    setShowForm(true);
  };
  const startEdit = (a) => {
    setForm({
      phase: a.phase,
      name: a.name,
      content: a.content,
      grade: a.grade || "",
      subject: a.subject || "",
      tags: (a.tags || []).join(", "),
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    const payload = {
      phase: form.phase,
      name: form.name.trim(),
      content: form.content.trim(),
      grade: form.grade.trim(),
      subject: form.subject.trim(),
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (editingId) updateActivity(editingId, payload);
      else addActivity(payload);
    } catch (e) {
      setFormError(e.message || "Không lưu được hoạt động.");
      return;
    }
    setFormError("");
    setShowForm(false);
    setEditingId(null);
    refresh();
  };

  const copyContent = async (a) => {
    try {
      await navigator.clipboard.writeText(
        a.content
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<[^>]+>/g, ""),
      );
      alert("Đã sao chép nội dung (dạng văn bản thuần).");
    } catch (e) {
      console.warn("[ActivitiesView] copyContent failed", e);
      alert("Không sao chép được.");
    }
  };

  const exportGame = (a) => {
    try {
      const meta = a.meta || {};
      const isGame = meta.type === "game";
      const qs = Array.isArray(meta.questions) ? meta.questions : [];
      let html = `<h1>${escapeHtml(a.name)}</h1><p><em>${escapeHtml(a.content || "")}</em></p>`;
      if (isGame && qs.length) {
        html += `<p><strong>Loại:</strong> ${escapeHtml(meta.gameType || "Quiz")} • <strong>Thời gian:</strong> ${escapeHtml(meta.timeLimit || "—")} • <strong>Số câu:</strong> ${qs.length}</p>`;
        if (meta.instructions) html += `<p><strong>Hướng dẫn:</strong> ${escapeHtml(meta.instructions)}</p>`;
        qs.forEach((q, i) => {
          const txt = q.q || q.question || "";
          html += `<p><strong>Câu ${i + 1}.</strong> ${escapeHtml(txt)}</p>`;
          if (Array.isArray(q.options)) {
            html += `<ol type="A">` + q.options.map((o) => `<li>${escapeHtml(String(o))}</li>`).join("") + `</ol>`;
            if (typeof q.answer === "number" || typeof q.correctIndex === "number") {
              const ans = q.answer ?? q.correctIndex;
              html += `<p style="color:green"><em>Đáp án: ${String.fromCharCode(65 + Number(ans))}</em></p>`;
            }
            if (q.explanation) html += `<p><em>Giải thích: ${escapeHtml(q.explanation)}</em></p>`;
          }
          if (Array.isArray(q.pairs) || meta.pairs) {
            const pairs = q.pairs || meta.pairs || [];
            pairs.forEach((pr) => { html += `<p>${escapeHtml(pr.a || pr.left || "")} ↔ ${escapeHtml(pr.b || pr.right || "")}</p>`; });
          }
        });
      } else if (qs.length) {
        html += `<p><strong>Số câu:</strong> ${qs.length}</p>` + qs.map((q, i) => `<p><strong>${i+1}.</strong> ${escapeHtml(q.q||q.question||"")}</p>`).join("");
      }
      if (a.source?.type === "sgk_scan") html += `<p><em>Nguồn: ${escapeHtml(a.source.bookName)} — tr.${a.source.page}</em></p>`;
      // reuse exportDoc exportWord
      import("./exportDoc.js").then(({ exportWord }) => exportWord(a.name || "Trò chơi", html));
    } catch (e) { alert("Xuất thất bại: " + uiMessage(e, "không rõ nguyên nhân")); }
  };

  // Handle image analysis completion for activities — hỗ trợ đa ảnh (batch)
  const handleImageAnalysisComplete = (result) => {
    if (!result.success || !result.data) {
      alert('Phân tích ảnh không thành công');
      return;
    }

    // Chuẩn hóa dữ liệu: hỗ trợ cả đơn ảnh (object) và đa ảnh (array)
    const dataList = Array.isArray(result.data) ? result.data : [result.data];
    // Lọc các phần tử hợp lệ (có thể là activity object hoặc batch wrapper)
    const validActivities = dataList.filter(d => d && (d.name || d.content || d.phase));

    if (validActivities.length === 0) {
      alert('Không tìm thấy hoạt động hợp lệ trong ảnh');
      return;
    }

    try {
      let addedCount = 0;
      validActivities.forEach(activityData => {
        const newActivity = {
          phase: activityData.phase || 'khoiDong',
          name: activityData.name || `Hoạt động mới ${addedCount+1}`,
          content: activityData.content || '',
          grade: activityData.grade || '',
          subject: activityData.subject || '',
          tags: Array.isArray(activityData.tags) ? activityData.tags : [],
          meta: {
            time: activityData.time,
            materials: activityData.materials
          }
        };
        addActivity(newActivity);
        addedCount++;
      });
      refresh();
      if (validActivities.length === 1) {
        alert('Đã thêm hoạt động mới từ ảnh!');
      } else {
        alert(`Đã thêm ${addedCount} hoạt động từ ${validActivities.length} ảnh!`);
      }
      setShowImageUpload(false);
    } catch (err) {
      console.error('Error creating activity from image:', err);
      alert('Có lỗi xảy ra khi tạo hoạt động từ ảnh');
    }
  };

  const handleOpenReview = (activityId) => {
    setShowReviewModal(activityId);
    setReviewForm({ rating: 0, comment: '' });
  };

  const handleSubmitReview = () => {
    if (!showReviewModal || reviewForm.rating === 0) {
      alert('Vui lòng chọn đánh giá sao');
      return;
    }

    const newReview = {
      rating: reviewForm.rating,
      comment: reviewForm.comment,
      timestamp: Date.now()
    };

    const updatedRatings = {
      ...ratings,
      [showReviewModal]: [...(ratings[showReviewModal] || []), newReview]
    };

    setRatings(updatedRatings);
    const res = safeSetJSON('sgk_activity_ratings', updatedRatings);
    if (!res.ok) {
      if (res.quota) console.warn("[safeStorage] Quota exceeded saving sgk_activity_ratings:", res.message);
      else console.warn("[safeStorage] Failed to save sgk_activity_ratings:", res.message);
      // giữ dữ liệu cũ, không xóa, không báo saved giả
    }

    refresh();
    alert('Đã gửi đánh giá!');
    setShowReviewModal(null);
    setReviewForm({ rating: 0, comment: '' });
  };

  const renderStars = (rating, interactive = false, onRatingChange = null) => {
    return (
      <div className="flex-row gap-xs">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            className={interactive ? "btn btn-ghost btn-xs" : ""}
            onClick={interactive ? () => onRatingChange?.(star) : undefined}
            disabled={!interactive}
            style={{
              cursor: interactive ? 'pointer' : 'default',
              color: star <= rating ? '#f59e0b' : '#d1d5db',
              fontSize: '1.2rem'
            }}
          >
            ★
          </button>
        ))}
      </div>
    );
  };

  const phaseName = (id) => PHASES.find((p) => p.id === id)?.label || id;
  const phaseColor = (id) => PHASE_COLORS[id] || "#64748b";
  const isGameActivity = (a) => a?.meta?.type === "game";

  return (
    <div className="actx-root">
      <style>{`
        .actx-root { display:flex; flex-direction:column; gap:14px; }
        .actx-head { background:linear-gradient(135deg, rgba(139,92,246,0.09), rgba(45,115,255,0.07)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
        .actx-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .actx-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .actx-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #8b5cf6)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #8b5cf6) 35%, transparent); }
        .actx-stats { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
        .actx-stat { font-size:11.5px; font-weight:700; color:#334155; background:rgba(255,255,255,0.85); border:1px solid #e2e8f0; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
        .actx-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .actx-search { flex:1 1 200px; min-width:170px; position:relative; }
        .actx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .actx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .actx-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; display:inline-flex; }
        .actx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .actx-chips { display:flex; gap:6px; flex-wrap:wrap; }
        .actx-chip { font-size:12px; font-weight:800; padding:6px 12px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        .actx-chip.on { color:#fff; border-color:transparent; }
        .actx-chip .n { font-size:10.5px; background:rgba(0,0,0,0.08); padding:1px 6px; border-radius:999px; }
        .actx-chip.on .n { background:rgba(255,255,255,0.25); }
        .actx-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:12px; }
        .actx-card { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; border-top:3px solid #64748b; transition:transform 0.15s ease, box-shadow 0.15s ease; }
        .actx-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,0.10); }
        .actx-card-body { padding:12px 13px; display:flex; flex-direction:column; gap:8px; flex:1; }
        .actx-badges { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
        .actx-badge { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px; }
        .actx-badge.phase { color:#fff; }
        .actx-badge.game { background:#8b5cf6; color:#fff; }
        .actx-badge.scan { background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; }
        .actx-badge.rate { background:#fffbeb; color:#b45309; border:1px solid #fde68a; }
        .actx-badge.tag { background:#f8fafc; color:#475569; border:1px solid #e2e8f0; }
        .actx-card-title { margin:0; font-size:0.93rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .actx-card-snippet { margin:0; font-size:12px; color:var(--text-muted); line-height:1.55; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .actx-card-meta { font-size:11px; color:var(--text-muted); display:flex; gap:8px; flex-wrap:wrap; }
        .actx-thumb { margin:0; border-radius:9px; overflow:hidden; border:1px solid var(--border-color); max-height:120px; }
        .actx-thumb img { width:100%; height:110px; object-fit:cover; display:block; }
        .actx-card-foot { display:flex; gap:6px; align-items:center; margin-top:auto; padding-top:9px; border-top:1px dashed var(--border-color); }
        .actx-view-btn { flex:1; min-width:0; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12.5px; font-weight:800; padding:8px 10px; border-radius:10px; border:none; background:var(--color-action, var(--primary, #8b5cf6)); color:#fff; cursor:pointer; box-shadow:0 3px 10px color-mix(in srgb, var(--color-action, #8b5cf6) 32%, transparent); }
        .actx-view-btn:hover { filter:brightness(1.08); }
        .actx-icobtn { width:33px; height:33px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; transition:border-color 0.15s ease, color 0.15s ease, background 0.15s ease; }
        .actx-icobtn:hover { border-color:var(--color-action, #8b5cf6); color:var(--color-action-strong, #7c3aed); background:var(--color-action-soft, #f5f3ff); }
        .actx-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .actx-empty { text-align:center; padding:36px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
        .actx-form { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
        .actx-form h4 { margin:0; font-size:0.95rem; }
        .actx-opt { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:7px; margin-top:8px; }
        @media (max-width: 640px) { .actx-opt { grid-template-columns:1fr; } }
        .actx-opt span { display:flex; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:7px 10px; font-size:12px; color:#334155; }
        .actx-opt b { width:22px; height:22px; border-radius:7px; background:#e2e8f0; color:#475569; display:inline-flex; align-items:center; justify-content:center; font-size:11px; flex-shrink:0; }
        .actx-opt span.ok { background:#f0fdf4; border-color:#86efac; color:#14532d; font-weight:600; }
        .actx-opt span.ok b { background:#16a34a; color:#fff; }
      `}</style>

      {/* ── Header + toolbar ── */}
      <div className="actx-head">
        <div className="actx-title-row">
          <h2 className="actx-title"><span className="actx-title-ic"><Puzzle size={17} /></span> Kho Hoạt động</h2>
          <div className="actx-stats">
            <span className="actx-stat"><Layers size={12} /> {stats.total} hoạt động</span>
            <span className="actx-stat"><Gamepad2 size={12} /> {stats.games} trò chơi</span>
            {stats.fromScan > 0 && <span className="actx-stat">📚 {stats.fromScan} từ SGK</span>}
          </div>
        </div>
        <div className="actx-toolbar">
          <div className="actx-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, nội dung, thẻ…" aria-label="Tìm hoạt động" />
            {query && <button className="actx-search-clear" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>}
          </div>
          {subjects.length > 0 && (
            <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label="Lọc môn">
              <option value="">Mọi môn</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sắp xếp">
            <option value="new">Mới nhất</option>
            <option value="title">Tên A–Z</option>
            <option value="rating">Đánh giá cao</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => startNew(phaseFilter || "khoiDong")}><Plus size={14} /> Hoạt động mới</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowImageUpload(true)} title="Tạo hoạt động từ ảnh với AI"><Sparkles size={13} /> Nhập từ ảnh</button>
          <SampleButton
            label="Tự động làm"
            onRun={() => {
              const n = fillSampleActivities();
              refresh();
              alert(`Đã thêm ${n} hoạt động dạy học mẫu (đủ 4 giai đoạn, kèm nội dung triển khai).`);
            }}
          />
        </div>
        <div className="actx-chips" role="tablist" aria-label="Lọc giai đoạn">
          <button role="tab" aria-selected={!phaseFilter} className={`actx-chip ${!phaseFilter ? "on" : ""}`}
            style={!phaseFilter ? { background: "#0f172a" } : undefined} onClick={() => setPhaseFilter("")}>
            Tất cả <span className="n">{activities.length}</span>
          </button>
          {PHASES.map((p) => (
            <button key={p.id} role="tab" aria-selected={phaseFilter === p.id}
              className={`actx-chip ${phaseFilter === p.id ? "on" : ""}`}
              style={phaseFilter === p.id ? { background: phaseColor(p.id) } : undefined}
              onClick={() => setPhaseFilter(phaseFilter === p.id ? "" : p.id)}>
              <span>{p.icon} {p.label.split(" ")[0]}{p.id === "khamPha" ? " phá" : ""}</span>
              <span className="n">{phaseCounts[p.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Form thêm/sửa ── */}
      {showForm && (
        <div className="actx-form">
          <h4>{editingId ? "✏️ Sửa hoạt động" : "➕ Hoạt động mới"}</h4>
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Tên hoạt động *</label>
              <input className="form-control" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Trò chơi “Ai nhanh hơn”" />
            </div>
            <div>
              <label className="form-label">Giai đoạn</label>
              <select className="form-control" value={form.phase}
                onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}>
                {PHASES.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Nội dung triển khai</label>
            <RichTextArea value={form.content}
              onChange={(html) => setForm((f) => ({ ...f, content: html }))}
              placeholder="Cách tổ chức lớp, lệnh giao nhiệm vụ, thời gian…" minHeight={110} />
          </div>
          <div className="tag-grid-3">
            <div>
              <label className="form-label">Khối lớp (tùy chọn)</label>
              <input className="form-control" value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} placeholder="VD: Lớp 1–2" />
            </div>
            <div>
              <label className="form-label">Môn (tùy chọn)</label>
              <input className="form-control" value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Toán / Tiếng Việt" />
            </div>
            <div>
              <label className="form-label">Thẻ (phân cách dấu phẩy)</label>
              <input className="form-control" value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="trò chơi, nhóm đôi…" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={save} disabled={!form.name.trim()}><Check size={14} /> Lưu hoạt động</button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); setFormError(""); }}><X size={14} /> Hủy</button>
          </div>
          {formError && <div className="util-error" role="alert" style={{ marginTop: 8 }}>{formError}</div>}
        </div>
      )}

      {/* ── Lưới cards ── */}
      {activities.length === 0 ? (
        <div className="actx-empty">
          <Puzzle size={40} />
          <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>Thư viện hoạt động trống.</p>
          <p style={{ margin: 0, fontSize: 12 }}>Lưu các hoạt động hay (khởi động, trò chơi, luyện tập…) để chèn nhanh vào giáo án sau này.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="actx-empty">
          <p style={{ margin: 0, fontWeight: 700 }}>Không khớp bộ lọc.</p>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>Thử đổi từ khóa hoặc giai đoạn.</p>
        </div>
      ) : (
        <div className="actx-grid">
          {filtered.map((a) => {
            const rating = getActivityRating(a.id);
            const color = phaseColor(a.phase);
            const qs = Array.isArray(a.meta?.questions) ? a.meta.questions : [];
            return (
              <article key={a.id} className="actx-card" style={{ borderTopColor: color }}>
                <div className="actx-card-body">
                  <div className="actx-badges">
                    <span className="actx-badge phase" style={{ background: color }}>{phaseName(a.phase).split(" ")[0]}{a.phase === "khamPha" ? " phá" : ""}</span>
                    {isGameActivity(a) && <span className="actx-badge game"><Gamepad2 size={10} /> {a.meta?.gameType || "Game"}{qs.length ? ` • ${qs.length} câu` : ""}</span>}
                    {a.source?.type === "sgk_scan" && <span className="actx-badge scan">📷 AI từ SGK</span>}
                    {rating && <span className="actx-badge rate">★ {rating.average.toFixed(1)} ({rating.count})</span>}
                  </div>
                  <h3 className="actx-card-title">{a.name}</h3>
                  {a.content && <p className="actx-card-snippet">{stripHtml(a.content).slice(0, 160)}</p>}
                  <div className="actx-card-meta">
                    {a.subject && <span>{a.subject}</span>}
                    {a.grade && <span>• {a.grade}</span>}
                    {Array.isArray(a.tags) && a.tags.slice(0, 3).map((t) => <span key={t} className="actx-badge tag">#{t}</span>)}
                  </div>
                  {a.thumbnail && a.source?.type === "sgk_scan" && (
                    <div className="actx-thumb"><img src={a.thumbnail} alt="" loading="lazy" /></div>
                  )}
                  <div className="actx-card-foot">
                    <button className="actx-view-btn" onClick={() => setPreviewAct(a)} title="Xem chi tiết / Chơi thử"><Eye size={13} /> Xem</button>
                    <button className="actx-icobtn" onClick={() => startEdit(a)} title="Sửa" aria-label="Sửa"><Pencil size={14} /></button>
                    <button className="actx-icobtn" onClick={() => copyContent(a)} title="Sao chép nội dung" aria-label="Sao chép"><Copy size={14} /></button>
                    {isGameActivity(a) && <button className="actx-icobtn" onClick={() => exportGame(a)} title="Xuất Word (đề + đáp án)" aria-label="Xuất Word"><Download size={14} /></button>}
                    <button className="actx-icobtn" onClick={() => handleOpenReview(a.id)} title="Đánh giá sao" aria-label="Đánh giá hoạt động"><Star size={14} /></button>
                    <button className="actx-icobtn danger" onClick={() => { if (confirm(`Xóa hoạt động "${a.name}"?`)) { deleteActivity(a.id); refresh(); } }} title="Xóa" aria-label="Xóa"><Trash2 size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Image Upload Modal (giữ nguyên) */}
      <ImageUploadModal
        isOpen={showImageUpload}
        onClose={() => setShowImageUpload(false)}
        analysisType="activity"
        onAnalysisComplete={handleImageAnalysisComplete}
        title="Tạo hoạt động từ ảnh với AI"
      />

      {/* Review Modal (giữ nguyên chức năng, tân trang nhẹ) */}
      {showReviewModal && (
        <div className="modal-overlay" onClick={() => setShowReviewModal(null)} style={{ zIndex: "var(--z-modal-above)" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(480px, calc(100vw - 20px))", width: "min(480px, calc(100vw - 20px))" }}>
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Star size={16} /> Đánh giá hoạt động
              </h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowReviewModal(null)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "1rem" }}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                  Bạn đánh giá hoạt động này như thế nào?
                </label>
                {renderStars(reviewForm.rating, true, (rating) => setReviewForm(f => ({ ...f, rating })))}
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                  Nhận xét (tùy chọn)
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm(f => ({ ...f, comment: e.target.value }))}
                  placeholder="Chia sẻ trải nghiệm của bạn với hoạt động này..."
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowReviewModal(null)}
                >
                  Hủy
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmitReview}
                  disabled={reviewForm.rating === 0}
                >
                  <MessageSquare size={14} /> Gửi đánh giá
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview / Chơi thử (tân trang + lưới đáp án như phiếu) */}
      {previewAct && (
        <div className="modal-overlay" onClick={() => setPreviewAct(null)} style={{ zIndex: "var(--z-modal-top)" }}>
          <div className="modal-content" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: "min(780px, calc(100vw - 20px))", width:"min(780px, calc(100vw - 20px))", maxHeight:"90vh", overflow:"auto" }}>
            <div className="modal-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
              <h3 style={{ margin:0, display:"flex", alignItems:"center", gap:8, fontSize:"1rem", minWidth:0, flexWrap:"wrap" }}>
                {isGameActivity(previewAct)
                  ? <><Gamepad2 size={16} /> <span>{previewAct.name}</span> <span style={{ fontSize:11, background:"#8b5cf6", color:"#fff", padding:"2px 8px", borderRadius:99 }}>{previewAct.meta?.gameType} {previewAct.meta?.timeLimit ? `• ${previewAct.meta.timeLimit}`:""}</span></>
                  : <><FileText size={16}/> <span>{previewAct.name}</span></>}
              </h3>
              <button className="btn btn-ghost btn-xs" onClick={()=>setPreviewAct(null)} aria-label="Đóng"><X size={16}/></button>
            </div>
            <div style={{ padding:14, display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <span className="actx-badge phase" style={{ background: phaseColor(previewAct.phase) }}>{phaseName(previewAct.phase)}</span>
                {previewAct.source?.type==="sgk_scan" && <span className="actx-badge scan">📷 AI từ SGK tr.{previewAct.source.page}</span>}
              </div>
              {previewAct.source?.type==="sgk_scan" && <SourceBadge source={previewAct.source} />}
              {previewAct.thumbnail && <img src={previewAct.thumbnail} alt="Scan" style={{ maxWidth:260, maxHeight:160, borderRadius:8, border:"1px solid var(--border-color)", objectFit:"cover" }} />}
              <div style={{ whiteSpace:"pre-wrap", fontSize:12.5, lineHeight:1.65, background:"var(--surface-soft)", padding:10, borderRadius:8, border:"1px solid var(--border-color)" }}>
                {previewAct.content || <span style={{ color:"var(--text-muted)" }}>(Chưa có nội dung)</span>}
              </div>
              {previewAct.meta?.instructions && <div style={{ fontSize:12, background:"var(--primary-light)", padding:8, borderRadius:6 }}><strong>Hướng dẫn:</strong> {previewAct.meta.instructions}</div>}
              {Array.isArray(previewAct.meta?.questions) && previewAct.meta.questions.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <strong style={{ fontSize:12 }}>Câu hỏi ({previewAct.meta.questions.length}):</strong>
                  {previewAct.meta.questions.slice(0,20).map((q, i)=>(
                    <div key={i} style={{ border:"1px solid var(--border-color)", borderRadius:10, padding:9, background:"var(--surface)" }}>
                      <div style={{ fontSize:12.5, fontWeight:700 }}>Câu {i+1}. {q.q || q.question}</div>
                      {Array.isArray(q.options) && (
                        <div className="actx-opt">
                          {q.options.map((o,oi)=>(
                            <span key={oi} className={(q.answer===oi||q.correctIndex===oi)?"ok":""}>
                              <b>{String.fromCharCode(65+oi)}</b> {o} {(q.answer===oi||q.correctIndex===oi)?"✓":""}
                            </span>
                          ))}
                        </div>
                      )}
                      {q.explanation && <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:5 }}><em>Giải thích:</em> {q.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(previewAct.meta?.pairs) && previewAct.meta.pairs.length>0 && (
                <div style={{ fontSize:12, display:"flex", flexDirection:"column", gap:5 }}>
                  <strong>Ghép đôi:</strong>
                  {previewAct.meta.pairs.map((p,i)=><div key={i} style={{ background:"var(--surface-soft)", border:"1px solid var(--border-color)", borderRadius:8, padding:"6px 10px" }}>{p.a||p.left} ↔ {p.b||p.right}</div>)}
                </div>
              )}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end", borderTop:"1px solid var(--border-color)", paddingTop:10 }}>
                {isGameActivity(previewAct) && <button className="btn btn-secondary btn-xs" onClick={()=>exportGame(previewAct)}><Download size={12}/> Xuất Word</button>}
                <button className="btn btn-secondary btn-xs" onClick={()=>{ copyContent(previewAct); }}><Copy size={12}/> Sao chép</button>
                <button className="btn btn-primary btn-xs" onClick={()=>setPreviewAct(null)}><X size={12}/> Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {onNavigate && (
        <div className="panel-box mt-md" style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:12, opacity:0.7 }}>Liên kết nhanh:</span>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("lessonplans")}><BookOpen size={12}/> Giáo án</button>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("questionbank")}>Ngân hàng câu hỏi</button>
          <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("worksheets")}>Phiếu học tập</button>
        </div>
      )}
    </div>
  );
}