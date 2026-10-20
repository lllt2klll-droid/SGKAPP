// ── Phiếu học tập: kho dạng thẻ lưới + soạn/xem trước bản in ─────────
// Redesign UI (giữ nguyên 100% dữ liệu & chức năng: tạo/sửa/xóa, ghép câu
// từ ngân hàng, xuất Word/TXT/in). Thêm: tìm kiếm, lọc, sắp xếp, preview A4.
import React, { useMemo, useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Printer,
  X,
  Search,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ListChecks,
  Pencil,
  Database,
  BookOpen,
  Eye,
  Layers,
} from "lucide-react";
import {
  getWorksheets,
  saveWorksheet,
  deleteWorksheet,
  getQuestions,
} from "./teachingDB";
import { printToPdf, escapeHtml, exportTxt } from "./exportDoc";
import { exportWorksheetDocx, cleanOptions, stripHtml } from "./worksheetDocx.js";
import { shouldConfirmDelete } from "./settingsStore.js";
import SampleButton from "./SampleButton";
import { fillSampleQuestions } from "./sampleData";
import DataTable from "./DataTable";
import ConfirmDialog from "./ui/ConfirmDialog.jsx";
import { makeId } from "./storage";
import SourceBadge from "./scan/SourceBadge";

function makeWs(id = undefined) {
  return {
    id: id || makeId('ws'),
    title: "Phiếu học tập chưa đặt tên",
    subject: "",
    grade: "",
    intro: "",
    school: "",
    timeMinutes: "",
    showAnswers: false,
    questions: [], // question ids from the bank
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch { return "—"; }
}

export default function WorksheetsView({ books, onNavigate }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => setTick(t=>t+1); window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [selId, setSelId] = useState(null);
  const [picker, setPicker] = useState(false);
  const [pkQuery, setPkQuery] = useState("");
  const [pkSubject, setPkSubject] = useState("");

  // ── Kho: tìm / lọc / sắp xếp ──
  const [query, setQuery] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fSource, setFSource] = useState("all"); // all | scan | manual
  const [sortBy, setSortBy] = useState("updated"); // updated | title | count

  // ── Editor: tab soạn / xem trước + tiêu đề nháp ──
  const [tab, setTab] = useState("edit"); // edit | preview
  const [titleDraft, setTitleDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const flash = (msg) => {
    setNotice(msg);
    try { clearTimeout(flash.t); } catch {}
    flash.t = setTimeout(() => setNotice(""), 3500);
  };
  // ── Tùy chọn xuất DOCX (chọn mỗi lần xuất, không đụng dữ liệu phiếu) ──
  const [expTemplate, setExpTemplate] = useState("full"); // full | compact
  const [shuffleQ, setShuffleQ] = useState(false);
  const [shuffleO, setShuffleO] = useState(false);
  const [exporting, setExporting] = useState(false);

  const wsList = getWorksheets();
  const ws = wsList.find((w) => w.id === selId) || null;
  const bank = getQuestions();
  const subjects = useMemo(
    () => [...new Set(books.map((b) => b.subject))],
    [books],
  );

  const qById = useMemo(() => {
    const m = {};
    bank.forEach((q) => {
      m[q.id] = q;
    });
    return m;
  }, [bank]);

  // Đồng bộ nháp tiêu đề khi đổi phiếu
  useEffect(() => { setTitleDraft(ws?.title || ""); setTab("edit"); }, [ws?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mk = (patch) => {
    if (ws) {
      try {
        saveWorksheet({ ...ws, ...patch, updatedAt: Date.now() });
        refresh();
      } catch (e) {
        // saveWorksheet throw khi đầy bộ nhớ — báo 1 lần, không spam mỗi phím gõ
        if (!mk.warned) {
          mk.warned = true;
          flash(e.message || "Không lưu được thay đổi (bộ nhớ đầy).");
          setTimeout(() => { mk.warned = false; }, 10000);
        }
      }
    }
  };
  const commitTitle = () => {
    const t = (titleDraft || "").trim();
    if (!t) { setTitleDraft(ws?.title || ""); flash("Tên phiếu không được để trống."); return; }
    if (t.length > 120) { flash(`Tên phiếu tối đa 120 ký tự (đang ${t.length}).`); return; }
    if (ws && t !== ws.title) mk({ title: t });
    else setTitleDraft(ws?.title || "");
  };

  // ── Thống kê kho ──
  const stats = useMemo(() => {
    const totalQ = wsList.reduce((s, w) => s + (w.questions?.length || 0), 0);
    const fromScan = wsList.filter((w) => w.source?.type === "sgk_scan").length;
    return { sheets: wsList.length, questions: totalQ, fromScan };
  }, [wsList]);

  // ── Danh sách lọc ──
  const visibleSheets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = wsList.filter((w) => {
      if (q && !(`${w.title || ""} ${(w.intro || "")}`.toLowerCase().includes(q))) return false;
      if (fSubject && w.subject !== fSubject) return false;
      if (fGrade && String(w.grade) !== String(fGrade)) return false;
      if (fSource === "scan" && w.source?.type !== "sgk_scan") return false;
      if (fSource === "manual" && w.source?.type === "sgk_scan") return false;
      return true;
    });
    const by = {
      updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
      title: (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "vi"),
      count: (a, b) => (b.questions?.length || 0) - (a.questions?.length || 0),
    }[sortBy] || ((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return [...list].sort(by);
  }, [wsList, query, fSubject, fGrade, fSource, sortBy]);

  const createSheet = () => {
    const n = makeWs();
    try {
      saveWorksheet(n);
    } catch (e) {
      flash(e.message || "Không tạo được phiếu (bộ nhớ đầy).");
      return;
    }
    setSelId(n.id);
    refresh();
  };

  const removeSheet = (id) => {
    // Đồng bộ Cài đặt → Hành vi → "Hỏi trước khi xóa": tắt là xóa ngay
    let needConfirm = true;
    try { needConfirm = shouldConfirmDelete(); } catch {}
    if (needConfirm) { setPendingDeleteId(id); return; }
    deleteWorksheet(id);
    if (selId === id) setSelId(null);
    refresh();
  };

  // Worksheet questions stored as array of questionIds — direct link without engine wrapper
  const addSel = (qid) => {
    if (ws && !ws.questions.includes(qid)) {
      mk({ questions: [...ws.questions, qid] });
    }
  };

  const addAllFiltered = () => {
    if (!ws) return;
    const existing = new Set(ws.questions);
    const newIds = pkList.map((q) => q.id).filter((id) => !existing.has(id));
    if (newIds.length === 0) {
      flash("Tất cả câu trong kết quả này đã có trong phiếu.");
      return;
    }
    mk({ questions: [...ws.questions, ...newIds] });
    flash(`Đã thêm ${newIds.length} câu vào phiếu.`);
  };
  const autoSample = () => {
    let bank = getQuestions();
    const filled = !bank.length;
    if (filled) {
      fillSampleQuestions();
      bank = getQuestions();
    }
    if (!bank.length) {
      flash("Không tạo được câu hỏi mẫu.");
      return;
    }
    const ws = makeWs();
    ws.title = "Phiếu học tập mẫu — luyện tập";
    const first = bank[0];
    ws.subject = first.subject || "";
    ws.grade = String(first.grade || "");
    ws.intro =
      "Học sinh hãy hoàn thành các bài tập dưới đây.";
    ws.questions = bank.slice(0, 5).map((q) => q.id);
    ws.showAnswers = false;
    try {
      saveWorksheet(ws);
    } catch (e) {
      flash(e.message || "Không tạo được phiếu mẫu (bộ nhớ đầy).");
      return;
    }
    setSelId(ws.id);
    refresh();
    flash(
      `Đã tạo phiếu học tập mẫu với 5 câu hỏi${filled ? " (tự thêm câu hỏi mẫu vào ngân hàng trước)." : "."}`,
    );
  };

  const removeQ = (idx) => {
    if (ws) mk({ questions: ws.questions.filter((_, i) => i !== idx) });
  };
  const moveQ = (idx, dir) => {
    if (!ws) return;
    const qs = [...ws.questions];
    const j = idx + dir;
    if (j < 0 || j >= qs.length) return;
    [qs[idx], qs[j]] = [qs[j], qs[idx]];
    mk({ questions: qs });
  };

  const pkList = useMemo(() => {
    const q = pkQuery.trim().toLowerCase();
    return bank.filter((b) => {
      const okQ =
        !q ||
        String(b.question || "").toLowerCase().includes(q) ||
        String(b.chapter || "").toLowerCase().includes(q);
      const okS = !pkSubject || b.subject === pkSubject;
      return okQ && okS;
    });
  }, [bank, pkQuery, pkSubject]);

  // ── Bản in/preview: ĐỒNG BỘ với DOCX (trường, giờ, ô điểm, đáp án qua helper chung) ──
  // Màu explicit (không dùng var CSS) để Word/cửa sổ in hiển thị đúng
  // template: 'full' (mẫu chuẩn) | 'compact' (mẫu gọn) — preview và In dùng đúng mẫu đã chọn
  const renderPaper = (w, answers, withHeader, template = "full") => {
    let html = "";
    if (withHeader) {
      if (template === "compact") {
        html += `<h2 style="text-align:center">${escapeHtml(w.title)}</h2>`;
        const meta = [w.subject, w.grade ? `Lớp ${w.grade}` : "", w.timeMinutes ? `Thời gian: ${w.timeMinutes} phút` : ""]
          .filter(Boolean)
          .join(" • ");
        if (meta)
          html += `<div style="text-align:center;color:#555">${escapeHtml(meta)}</div>`;
        html += `<table width="100%" style="margin:10px 0"><tr>
          <td style="width:60%">Họ và tên: ................................................</td>
          <td>Ngày: ....................</td></tr></table>`;
      } else {
        if (w.school) html += `<div style="text-align:center;font-weight:bold">TRƯỜNG ${escapeHtml(String(w.school).toUpperCase())}</div>`;
        html += `<h2 style="text-align:center">${escapeHtml(w.title)}</h2>`;
        const meta = [w.subject, w.grade ? `Lớp ${w.grade}` : "", w.timeMinutes ? `Thời gian: ${w.timeMinutes} phút` : ""]
          .filter(Boolean)
          .join(" • ");
        if (meta)
          html += `<div style="text-align:center;color:#555">${escapeHtml(meta)}</div>`;
        html += `<table width="100%" style="margin:10px 0"><tr>
          <td style="width:60%">Họ và tên: ................................................</td>
          <td>Ngày: ....................</td></tr></table>`;
        html += `<table width="100%" border="1" cellspacing="0" cellpadding="8" style="margin:10px 0;border-collapse:collapse"><tr>
          <td width="30%" align="center"><b>Điểm</b><br/><br/></td>
          <td><b>Lời phê của giáo viên</b></td></tr></table>`;
      }
    } else {
      html += `<h2>${escapeHtml(w.title)}</h2>`;
    }
    if (w.intro) html += `<p><em>${escapeHtml(w.intro)}</em></p>`;
    w.questions.forEach((qid, i) => {
      const q = qById[qid];
      if (!q) return;
      html += `<p><strong>Câu ${i + 1}.</strong> ${escapeHtml(q.question)}</p>`;
      if (q.type === "mc") {
        const { list } = cleanOptions(q);
        html += '<ol type="A" style="list-style-type:upper-alpha">';
        list.forEach((o) => { html += `<li>${escapeHtml(o)}</li>`; });
        html += "</ol>";
      } else if (q.type === "fill") {
        if (answers && w.showAnswers && q.answer) {
          html += `<p>Đáp án: <strong>${escapeHtml(q.answer)}</strong></p>`;
        } else {
          html += `<div style="margin: 8px 0; border-bottom: 1px solid #999; height: 18px; width: 60%;"><span style="font-size:10px;color:#999">Điền đáp án</span></div>`;
        }
      } else {
        // essay — answer area
        if (answers && w.showAnswers && (q.answer || q.answerGuide)) {
          html += `<p>Hướng dẫn: ${escapeHtml(q.answer || q.answerGuide)}</p>`;
        } else {
          html += `<div style="height:150px; border: 1px solid #999; margin: 8px 0;"><span style="font-size:10px;color:#999">Khu vực trả lời tự luận</span></div>`;
        }
      }
    });
    if (w.note)
      html += `<p style="text-align:center;color:#555"><em>${escapeHtml(w.note)}</em></p>`;
    if (answers && w.showAnswers) {
      html += '<div class="pagebreak"></div><h3>ĐÁP ÁN</h3><ol>';
      w.questions.forEach((qid, i) => {
        const q = qById[qid];
        if (!q) return;
        if (q.type === "mc") {
          const { correct } = cleanOptions(q);
          html += `<li>Câu ${i + 1}: <b>${correct >= 0 ? String.fromCharCode(65 + correct) : "—"}</b></li>`;
        } else if (q.type === "fill") html += `<li>Câu ${i + 1} (điền khuyết): ${escapeHtml(q.answer || "—")}</li>`;
        else html += `<li>Câu ${i + 1} (tự luận): ${escapeHtml(q.answer || q.answerGuide || "—")}</li>`;
      });
      html += "</ol>";
    }
    return html;
  };

  const doExportDocx = async (answers) => {
    if (!ws || exporting) return;
    setExporting(true);
    try {
      const qs = ws.questions.map((qid) => qById[qid]).filter(Boolean);
      const ok = await exportWorksheetDocx(ws, qs, {
        template: expTemplate,
        school: ws.school || "",
        timeMinutes: ws.timeMinutes || 0,
        withAnswers: answers,
        shuffleQuestions: shuffleQ,
        shuffleOptions: shuffleO,
      });
      if (!ok) flash("Không xuất được file DOCX. Hãy thử lại.");
    } finally {
      setExporting(false);
    }
  };
  // In = đúng bản đang xem ở tab preview (WYSIWYG: cùng mẫu + cùng cờ đáp án)
  const doPrint = () => {
    if (!ws) return;
    const ok = printToPdf(ws.title || "Phiếu học tập", renderPaper(ws, ws.showAnswers, true, expTemplate));
    if (!ok) flash("Trình duyệt chặn cửa sổ in. Hãy cho phép popup rồi thử lại.");
  };
  // Zoom bản xem trước (chỉ đổi hiển thị, không đụng nội dung xuất)
  const [previewZoom, setPreviewZoom] = useState(100);

  const doExportTxt = () => {
    if (!ws) return;
    const lines = [];
    if (ws.school) lines.push(`TRƯỜNG ${String(ws.school).toUpperCase()}`);
    lines.push(ws.title);
    const meta = [ws.subject, ws.grade ? `Lớp ${ws.grade}` : "", ws.timeMinutes ? `Thời gian: ${ws.timeMinutes} phút` : ""].filter(Boolean).join(" • ");
    if (meta) lines.push(meta);
    if (ws.intro) lines.push(stripHtml(ws.intro));
    lines.push("");
    ws.questions.forEach((qid, i) => {
      const q = qById[qid];
      if (!q) return;
      lines.push(`Câu ${i + 1}. ${stripHtml(q.question)}`);
      if (q.type === "mc") {
        const { list, correct } = cleanOptions(q);
        list.forEach((o, oi) => lines.push(`  ${String.fromCharCode(65 + oi)}. ${o}`));
        if (ws.showAnswers) lines.push(`  (Đáp án: ${correct >= 0 ? String.fromCharCode(65 + correct) : "—"})`);
      } else if (q.type === "fill") {
        if (ws.showAnswers) lines.push(`  (Đáp án: ${stripHtml(q.answer) || "—"})`);
      } else {
        if (ws.showAnswers && (q.answer || q.answerGuide)) lines.push(`  (Hướng dẫn: ${stripHtml(q.answer || q.answerGuide)})`);
      }
    });
    if (ws.note) { lines.push(""); lines.push(stripHtml(ws.note)); }
    exportTxt(`Phiếu học tập - ${ws.title}`, lines.join("\n"));
  };

  return (
    <div className="wsx-root">
      <style>{`
        .wsx-root { display:flex; flex-direction:column; gap:14px; }
        .wsx-head { background:linear-gradient(135deg, rgba(45,115,255,0.08), rgba(139,92,246,0.07)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:12px; }
        .wsx-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .wsx-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .wsx-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #2d73ff)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #2d73ff) 35%, transparent); }
        .wsx-stats { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
        .wsx-stat { font-size:11.5px; font-weight:700; color:#334155; background:rgba(255,255,255,0.85); border:1px solid #e2e8f0; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
        .wsx-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .wsx-search { flex:1 1 220px; min-width:180px; position:relative; }
        .wsx-search input { width:100%; padding:8px 12px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .wsx-search svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .wsx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .wsx-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:12px; }
        .wsx-card { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; cursor:pointer; transition:transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
        .wsx-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,0.10); border-color:var(--color-action, var(--primary, #2d73ff)); }
        .wsx-cover { height:96px; background:linear-gradient(135deg,#dbeafe,#ede9fe); display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .wsx-cover img { width:100%; height:100%; object-fit:cover; }
        .wsx-card-body { padding:12px 13px; display:flex; flex-direction:column; gap:8px; flex:1; }
        .wsx-badges { display:flex; gap:5px; flex-wrap:wrap; }
        .wsx-badge { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; border:1px solid #e2e8f0; background:#f8fafc; color:#475569; display:inline-flex; align-items:center; gap:4px; }
        .wsx-badge.subj { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #dbeafe); }
        .wsx-badge.scan { background:#f0fdfa; color:#0f766e; border-color:#99f6e4; }
        .wsx-badge.ans { background:#f0fdf4; color:#15803d; border-color:#bbf7d0; }
        .wsx-card-title { margin:0; font-size:0.92rem; font-weight:800; color:var(--text-dark); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .wsx-card-meta { font-size:11.5px; color:var(--text-muted); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .wsx-card-foot { display:flex; gap:6px; margin-top:auto; padding-top:4px; }
        .wsx-empty { text-align:center; padding:36px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
        /* editor */
        .wsx-ed-head { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
        .wsx-ed-title-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .wsx-ed-title { flex:1 1 240px; min-width:200px; font-size:1rem; font-weight:800; padding:8px 12px; border-radius:10px; border:1px solid #e2e8f0; }
        .wsx-tabs { display:flex; gap:6px; }
        .wsx-tab { font-size:12.5px; font-weight:800; padding:7px 14px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        .wsx-tab.on { background:var(--color-action, var(--primary, #2d73ff)); border-color:var(--color-action, var(--primary, #2d73ff)); color:#fff; }
        .wsx-sheet-wrap { display:flex; justify-content:center; }
        .wsx-sheet { background:#fff; color:#111; width:100%; max-width:800px; border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,0.12); border:1px solid #e2e8f0; padding:44px 48px; }
        .wsx-sheet h2 { color:#111; }
        .wsx-sheet ol[type="A"] { padding-left:22px; }
        .wsx-sheet .pagebreak { border-top:2px dashed #94a3b8; margin:26px -48px 26px; position:relative; page-break-after:always; }
        .wsx-sheet .pagebreak::after { content:"sang trang đáp án"; position:absolute; top:-11px; right:12px; background:#fff; padding:0 8px; font-size:11px; font-weight:700; color:#94a3b8; }
        @media print { .wsx-sheet .pagebreak { border-top:none; margin:0; } .wsx-sheet .pagebreak::after { display:none; } }
        @media (max-width: 640px) { .wsx-sheet { padding:24px 18px; } }
        .wsx-q { background:var(--surface); border:1px solid var(--border-color); border-radius:12px; padding:12px 13px; display:flex; gap:11px; align-items:flex-start; }
        .wsx-qnum { font-weight:800; font-size:13px; min-width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--color-action, #2d73ff), var(--color-action-hover, #1d4ed8)); color:#fff; border-radius:9px; flex-shrink:0; box-shadow:0 2px 8px color-mix(in srgb, var(--color-action, #2d73ff) 30%, transparent); }
        .wsx-q-head { display:flex; flex-direction:column; gap:6px; }
        .wsx-q-text { margin:0; font-size:0.9rem; line-height:1.55; color:var(--text-dark); }
        .wsx-q-tags { display:flex; gap:5px; flex-wrap:wrap; }
        .wsx-opts { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:7px; margin-top:9px; }
        @media (max-width: 640px) { .wsx-opts { grid-template-columns:1fr; } }
        .wsx-opt { display:flex; align-items:center; gap:9px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px 11px; font-size:0.85rem; line-height:1.45; color:#334155; min-width:0; }
        .wsx-opt b { width:23px; height:23px; border-radius:7px; background:#e2e8f0; color:#475569; display:inline-flex; align-items:center; justify-content:center; font-size:11.5px; font-weight:800; flex-shrink:0; }
        .wsx-opt-tx { flex:1; min-width:0; overflow-wrap:anywhere; }
        .wsx-opt.ok { background:#f0fdf4; border-color:#86efac; color:#14532d; font-weight:600; }
        .wsx-opt.ok b { background:#16a34a; color:#fff; }
        .wsx-opt-check { color:#16a34a; flex-shrink:0; }
        .wsx-ans { margin-top:8px; font-size:12px; color:#15803d; background:#f0fdf4; border:1px dashed #86efac; border-radius:8px; padding:6px 10px; }
        /* cụm nút công cụ: nhóm theo chức năng, phân cấp chính/phụ */
        .wsx-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; background:var(--surface-soft, #f8fafc); border:1px solid var(--border-color, #e5e7eb); border-radius:12px; padding:8px 10px; }
        .wsx-actions-label { font-size:11px; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-muted, #64748b); margin-right:2px; }
        .wsx-sep { width:1px; align-self:stretch; background:var(--border-color, #e2e8f0); margin:2px 2px; }
        .wsx-actions .btn:disabled { opacity:0.45; cursor:not-allowed; }
        .wsx-expopts { background:var(--surface, #fff); border:1px dashed var(--border-color, #e2e8f0); border-radius:12px; padding:0; }
        .wsx-expopts summary { cursor:pointer; list-style:none; display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:8px 12px; font-size:12.5px; color:var(--text-muted, #64748b); }
        .wsx-expopts summary::-webkit-details-marker { display:none; }
        .wsx-expopts summary::before { content:"⚙"; font-size:13px; }
        .wsx-expopts[open] summary { border-bottom:1px dashed var(--border-color, #e2e8f0); }
        .wsx-expopts summary strong { color:var(--color-action, #2d73ff); }
        .wsx-expopts-body { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 12px; }
        @media (max-width: 640px) { .wsx-actions-label { width:100%; } }
      `}</style>

      {!ws ? (
        <>
          {/* ── Kho: header + toolbar ── */}
          <div className="wsx-head">
            <div className="wsx-title-row">
              <h2 className="wsx-title"><span className="wsx-title-ic"><FileText size={17} /></span> Kho Phiếu học tập</h2>
              <div className="wsx-stats">
                <span className="wsx-stat"><Layers size={12} /> {stats.sheets} phiếu</span>
                <span className="wsx-stat"><ListChecks size={12} /> {stats.questions} câu</span>
                {stats.fromScan > 0 && <span className="wsx-stat">📚 {stats.fromScan} từ SGK</span>}
              </div>
            </div>
            <div className="wsx-toolbar">
              <div className="wsx-search">
                <Search size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên phiếu, lời dẫn…" aria-label="Tìm phiếu" />
              </div>
              <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label="Lọc môn">
                <option value="">Mọi môn</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={fGrade} onChange={(e) => setFGrade(e.target.value)} aria-label="Lọc lớp">
                <option value="">Mọi lớp</option>
                {[1, 2, 3, 4, 5].map((g) => <option key={g} value={String(g)}>Lớp {g}</option>)}
              </select>
              <select value={fSource} onChange={(e) => setFSource(e.target.value)} aria-label="Lọc nguồn">
                <option value="all">Mọi nguồn</option>
                <option value="scan">📚 Từ SGK scan</option>
                <option value="manual">Tự tạo</option>
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sắp xếp">
                <option value="updated">Mới nhất</option>
                <option value="title">Tên A–Z</option>
                <option value="count">Nhiều câu nhất</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={createSheet}><Plus size={14} /> Phiếu mới</button>
              <SampleButton
                label="Phiếu mẫu"
                onRun={autoSample}
                hint="Tạo phiếu học tập mẫu từ 5 câu hỏi đầu tiên của ngân hàng; nếu ngân hàng trống sẽ tự thêm 8 câu hỏi mẫu trước."
              />
            </div>
          </div>

          {/* ── Lưới thẻ ── */}
          {visibleSheets.length === 0 ? (
            <div className="wsx-empty">
              <FileText size={40} />
              <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>{wsList.length === 0 ? "Chưa có phiếu nào." : "Không khớp bộ lọc."}</p>
              <p style={{ margin: 0, fontSize: 12 }}>{wsList.length === 0 ? "Bấm “Phiếu mới” hoặc “Phiếu mẫu” để tạo." : "Thử nới lỏng từ khóa hoặc bộ lọc."}</p>
            </div>
          ) : (
            <div className="wsx-grid">
              {visibleSheets.map((w) => (
                <article key={w.id} className="wsx-card" role="button" tabIndex={0}
                  onClick={() => setSelId(w.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(w.id); } }}
                  title={`Mở phiếu: ${w.title}`} aria-label={`Mở phiếu ${w.title}`}>
                  {(w.thumbnail || w.source?.type === "sgk_scan") && (
                    <div className="wsx-cover">
                      {w.thumbnail
                        ? <img src={w.thumbnail} alt="" loading="lazy" />
                        : <BookOpen size={30} color="#2d73ff" />}
                    </div>
                  )}
                  <div className="wsx-card-body">
                    <div className="wsx-badges">
                      {w.subject && <span className="wsx-badge subj">{w.subject}</span>}
                      {w.grade && <span className="wsx-badge">Lớp {w.grade}</span>}
                      {w.source?.type === "sgk_scan"
                        ? <span className="wsx-badge scan">📚 SGK tr.{w.source.page}</span>
                        : <span className="wsx-badge">Tự tạo</span>}
                      {w.showAnswers
                        ? <span className="wsx-badge ans"><Check size={11} /> Có đáp án</span>
                        : <span className="wsx-badge">Chỉ đề</span>}
                    </div>
                    <h3 className="wsx-card-title">{w.title}</h3>
                    <div className="wsx-card-meta">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ListChecks size={12} /> {w.questions?.length || 0} câu</span>
                      <span>• Cập nhật {fmtDate(w.updatedAt)}</span>
                    </div>
                    <div className="wsx-card-foot">
                      <button className="btn btn-primary btn-xs" onClick={(e) => { e.stopPropagation(); setSelId(w.id); }}><Pencil size={12} /> Mở soạn</button>
                      <button className="btn btn-secondary btn-xs danger" onClick={(e) => { e.stopPropagation(); removeSheet(w.id); }} title="Xóa phiếu"><Trash2 size={12} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* ── Editor ── */}
          <div className="wsx-ed-head">
            <div className="wsx-ed-title-row">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelId(null)} title="Về kho phiếu"><ArrowLeft size={14} /> Kho phiếu</button>
              <input className="wsx-ed-title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                placeholder="Tên phiếu…" aria-label="Tên phiếu" />
              <div className="wsx-tabs" role="tablist" aria-label="Chế độ xem">
                <button role="tab" aria-selected={tab === "edit"} className={`wsx-tab ${tab === "edit" ? "on" : ""}`} onClick={() => setTab("edit")}><Pencil size={13} /> Soạn câu hỏi</button>
                <button role="tab" aria-selected={tab === "preview"} className={`wsx-tab ${tab === "preview" ? "on" : ""}`} onClick={() => setTab("preview")}><Eye size={13} /> Xem bản in</button>
              </div>
            </div>
            {/* ── Cụm 1: Xuất bản (hành động chính) ── */}
            <div className="wsx-actions" role="toolbar" aria-label="Xuất bản phiếu">
              <span className="wsx-actions-label">Xuất bản</span>
              <button className="btn btn-primary btn-xs" disabled={exporting} onClick={() => doExportDocx(false)} title="Xuất file Word .docx thật — đề không đáp án"><FileText size={12} /> {exporting ? "Đang xuất…" : "Xuất DOCX"}</button>
              <button className="btn btn-primary btn-xs" disabled={exporting || !ws.showAnswers} onClick={() => doExportDocx(true)} title={ws.showAnswers ? "Xuất file Word .docx thật — đề kèm trang đáp án" : "Bật “Kèm đáp án” ở Tùy chọn để mở nút này"}><FileText size={12} /> + Đáp án</button>
              <span className="wsx-sep" aria-hidden="true" />
              <button className="btn btn-secondary btn-xs" onClick={doPrint} title="In đúng như bản đang xem ở tab Xem bản in"><Printer size={12} /> In</button>
              <button className="btn btn-secondary btn-xs" onClick={doExportTxt} title="Xuất văn bản thuần">TXT</button>
            </div>
            {/* ── Cụm 2: Tùy chọn xuất (gọn trong 1 hàng, mở rộng khi cần) ── */}
            <details className="wsx-expopts">
              <summary>
                Tùy chọn xuất: <strong>{expTemplate === "full" ? "Mẫu chuẩn" : "Mẫu gọn"}</strong>
                <span> · {ws.showAnswers ? "Kèm đáp án" : "Không đáp án"}</span>
                {shuffleQ && <span> · Trộn câu</span>}
                {shuffleO && <span> · Trộn ĐA</span>}
              </summary>
              <div className="wsx-expopts-body">
                <div className="wsx-tabs" role="tablist" aria-label="Mẫu đầu phiếu">
                  <button role="tab" aria-selected={expTemplate === "full"} className={`wsx-tab ${expTemplate === "full" ? "on" : ""}`} onClick={() => setExpTemplate("full")} title="Quốc hiệu + trường/lớp + ô điểm/lời phê">Mẫu chuẩn</button>
                  <button role="tab" aria-selected={expTemplate === "compact"} className={`wsx-tab ${expTemplate === "compact" ? "on" : ""}`} onClick={() => setExpTemplate("compact")} title="Tiêu đề + tên/ngày, gọn 1 trang">Mẫu gọn</button>
                </div>
                <label className="btn btn-secondary btn-xs inline-flex" title="Bật thì đề, đáp án và bản in đều kèm đáp án">
                  <input type="checkbox" checked={ws.showAnswers} onChange={(e) => mk({ showAnswers: e.target.checked })} className="mr-0-4-accent" /> Kèm đáp án
                </label>
                <label className="btn btn-secondary btn-xs inline-flex" title="Chỉ áp dụng cho lần xuất DOCX này, không đổi phiếu gốc">
                  <input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} className="mr-0-4-accent" /> Trộn câu hỏi
                </label>
                <label className="btn btn-secondary btn-xs inline-flex" title="Xáo A-B-C-D và tự cập nhật đáp án đúng">
                  <input type="checkbox" checked={shuffleO} onChange={(e) => setShuffleO(e.target.checked)} className="mr-0-4-accent" /> Trộn đáp án TN
                </label>
              </div>
            </details>
            {ws.source?.type === "sgk_scan" && (
              <div>
                <SourceBadge source={ws.source} books={books} compact={false} />
                {ws.thumbnail && <div style={{ marginTop: 6 }}><img src={ws.thumbnail} alt="Thumbnail scan" style={{ maxWidth: 220, maxHeight: 120, borderRadius: 8, border: "1px solid var(--border-color)", objectFit: "cover" }} loading="lazy" /></div>}
              </div>
            )}
            <div className="tag-grid-4 my-0-6">
              <div>
                <label className="form-label">Môn</label>
                <select className="form-control" value={ws.subject} onChange={(e) => mk({ subject: e.target.value })}>
                  <option value="">—</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Khối lớp</label>
                <select className="form-control" value={String(ws.grade || "")} onChange={(e) => mk({ grade: e.target.value ? Number(e.target.value) : "" })}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((g) => <option key={g} value={String(g)}>Lớp {g}</option>)}
                </select>
              </div>
              <div className="grid-col-span-2">
                <label className="form-label">Đầu phiếu / ghi chú cho học sinh</label>
                <input className="form-control" value={ws.intro} onChange={(e) => mk({ intro: e.target.value })} placeholder="VD: Học sinh hãy hoàn thành các bài tập dưới đây…" />
              </div>
            </div>
            <div className="tag-grid-4 my-0-6">
              <div className="grid-col-span-2">
                <label className="form-label">Trường (in ở mẫu chuẩn)</label>
                <input className="form-control" value={ws.school || ""} onChange={(e) => mk({ school: e.target.value })} placeholder="VD: Tiểu học Nguyễn Huệ" />
              </div>
              <div>
                <label className="form-label">Thời gian (phút)</label>
                <input className="form-control" type="number" min="0" max="180" value={ws.timeMinutes || ""} onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (e.target.value !== "" && (!Number.isFinite(raw) || raw < 0 || raw > 180)) {
                    flash("Thời gian chỉ từ 0 đến 180 phút.");
                    return;
                  }
                  mk({ timeMinutes: e.target.value === "" ? "" : Math.max(0, Math.min(180, raw || 0)) || "" });
                }} placeholder="VD: 35" />
              </div>
              <div>
                <label className="form-label">Số câu</label>
                <input className="form-control" value={ws.questions.length} disabled readOnly />
              </div>
            </div>
          </div>

          {tab === "preview" ? (
            <>
              <div className="wsx-actions" role="toolbar" aria-label="Tùy chỉnh bản xem">
                <span className="wsx-actions-label">Xem bản in</span>
                <span className="wsx-stat">{expTemplate === "full" ? "Mẫu chuẩn" : "Mẫu gọn"}{ws.showAnswers ? " · kèm đáp án" : ""}</span>
                {(shuffleQ || shuffleO) && <span className="wsx-stat" title="Trộn chỉ áp dụng khi xuất DOCX, bản xem giữ thứ tự gốc">Thứ tự gốc (trộn chỉ khi xuất)</span>}
                <span className="wsx-sep" aria-hidden="true" style={{ marginLeft: "auto" }} />
                <button className="btn btn-secondary btn-xs" disabled={previewZoom <= 70} onClick={() => setPreviewZoom((z) => Math.max(70, z - 10))} title="Thu nhỏ bản xem">A−</button>
                <span className="wsx-stat">{previewZoom}%</span>
                <button className="btn btn-secondary btn-xs" disabled={previewZoom >= 150} onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))} title="Phóng to bản xem">A+</button>
                <button className="btn btn-secondary btn-xs" onClick={() => setPreviewZoom(100)} title="Về 100%">100%</button>
              </div>
              <div className="wsx-sheet-wrap">
                <div className="wsx-sheet" style={{ fontSize: `${(previewZoom / 100) * 15}px` }} dangerouslySetInnerHTML={{ __html: renderPaper(ws, ws.showAnswers, true, expTemplate) }} />
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ws.questions.length === 0 && (
                <div className="wsx-empty"><p style={{ margin: 0 }}>Chưa có câu hỏi. Bấm “Thêm từ ngân hàng”.</p></div>
              )}
              {ws.questions.map((qid, i) => {
                const q = qById[qid];
                if (!q) return null;
                // Đáp án qua helper chung (đồng bộ preview/in/TXT/DOCX)
                const mc = q.type === "mc" ? cleanOptions(q) : { list: [], correct: -1 };
                return (
                  <div key={qid} className="wsx-q">
                    <span className="wsx-qnum">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="wsx-q-head">
                        <p className="wsx-q-text">
                          <strong>Câu {i + 1}.</strong> {q.question}
                        </p>
                        <div className="wsx-q-tags">
                          {(q.origin === "sgk_original" || q.keepOriginal) && <span className="wsx-badge scan">📖 SGK</span>}
                          <span className="wsx-badge">{q.type === "mc" ? "Trắc nghiệm" : q.type === "fill" ? "Điền khuyết" : "Tự luận"}</span>
                          {q.mucdo && <span className="wsx-badge">{q.mucdo}</span>}
                        </div>
                      </div>
                      {q.type === "mc" && mc.list.length > 0 && (
                        <div className="wsx-opts">
                          {mc.list.map((o, oi) => (
                            <span key={oi} className={`wsx-opt${oi === mc.correct ? " ok" : ""}`}>
                              <b>{String.fromCharCode(65 + oi)}</b>
                              <span className="wsx-opt-tx">{o}</span>
                              {oi === mc.correct && <Check size={13} className="wsx-opt-check" />}
                            </span>
                          ))}
                        </div>
                      )}
                      {q.type === "fill" && (ws.showAnswers && q.answer ? (
                        <div className="wsx-ans">Đáp án: <strong>{q.answer}</strong></div>
                      ) : (
                        <div className="wsx-ans" style={{ background: "#f8fafc", borderColor: "#e2e8f0", color: "#94a3b8" }}>✎ ........................................................................................</div>
                      ))}
                      {q.type === "essay" && (
                        ws.showAnswers && (q.answer || q.answerGuide)
                          ? <div className="wsx-ans">Hướng dẫn: {q.answer || q.answerGuide}</div>
                          : <div className="h-70 doc-q-space" />
                      )}
                    </div>
                    <div className="flex-row-gap-xs">
                      <button className="btn btn-secondary btn-xs" disabled={i === 0} onClick={() => moveQ(i, -1)} title="Lên trên"><ArrowUp size={12} /></button>
                      <button className="btn btn-secondary btn-xs" disabled={i === ws.questions.length - 1} onClick={() => moveQ(i, 1)} title="Xuống dưới"><ArrowDown size={12} /></button>
                      <button className="btn btn-secondary btn-xs danger" onClick={() => removeQ(i)} title="Bỏ khỏi phiếu"><Trash2 size={12} /></button>
                    </div>
                  </div>
                );
              })}
              <div className="wsx-actions" role="toolbar" aria-label="Soạn câu hỏi">
                <span className="wsx-actions-label">Câu hỏi ({ws.questions.length})</span>
                <button className="btn btn-primary" onClick={() => setPicker(true)}><Plus size={14} /> Thêm từ ngân hàng</button>
                {onNavigate && (
                  <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("questionbank")}><Database size={12} /> Sang Ngân hàng →</button>
                )}
                <span className="wsx-sep" aria-hidden="true" style={{ marginLeft: "auto" }} />
                <button className="btn btn-secondary btn-sm danger" onClick={() => removeSheet(ws.id)} title="Xóa phiếu này khỏi kho"><Trash2 size={14} /> Xóa phiếu</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── picker modal (giữ nguyên) ── */}
      {picker && (
        <div className="modal-overlay" onClick={() => setPicker(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="panel-title">Thêm câu hỏi vào phiếu</div>
              <button
                className="util-bubble-close"
                onClick={() => setPicker(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="toolbar-row mb-0-7">
              <div className="search-input-wrapper">
                <Search className="search-icon" size={15} />
                <input
                  className="search-input"
                  placeholder="Tìm câu hỏi…"
                  value={pkQuery}
                  onChange={(e) => setPkQuery(e.target.value)}
                />
              </div>
              <select
                className="sort-select"
                value={pkSubject}
                onChange={(e) => setPkSubject(e.target.value)}
              >
                <option value="">Mọi môn</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="sn-count">{pkList.length} câu</span>
              <button
                className="btn btn-secondary btn-xs"
                onClick={addAllFiltered}
                disabled={!pkList.length}
                title="Thêm tất cả câu đang khớp bộ lọc (không trùng)"
              >
                <Plus size={12} /> Thêm tất cả
              </button>
            </div>
            {(() => {
              const poolColumns = [
                { key: "cauHoi", label: "Câu hỏi", sortable: true, render: (v) => <span className="cell-clamp">{v}</span> },
                { key: "mucDo", label: "Mức độ", sortable: true, width: "110px", align: "center", hideOnMobile: true, render: (v) => <span className="tag-pill">{v || "—"}</span> },
                { key: "mon", label: "Môn", sortable: true, width: "90px", hideOnMobile: true },
                { key: "lop", label: "Lớp", sortable: true, width: "70px", align: "center" },
                { key: "daChon", label: "Đã chọn", width: "90px", align: "center", render: (v) => v ? <span className="tag-pill bg-success"><Check size={11} /> đã có</span> : <span className="tag-pill">—</span> },
                { key: "thaoTac", label: "Thao tác", width: "100px", align: "center", render: (_, row) => row.daChon ? <span className="tag-pill bg-success"><Check size={11} /> đã có</span> : <button className="btn btn-secondary btn-xs" aria-label={`Thêm câu hỏi ${row.cauHoi.slice(0, 20)}`} onClick={() => addSel(row.id)}><Plus size={12} /> Thêm</button> },
              ];
              const poolData = pkList.map((q) => ({
                id: q.id,
                cauHoi: q.question,
                mucDo: q.mucdo || (q.type === "mc" ? "Trắc nghiệm" : "Tự luận"),
                mon: q.subject || "—",
                lop: q.grade ? String(q.grade) : "—",
                daChon: !!(ws && ws.questions.includes(q.id)),
              }));
              return (
                <DataTable
                  columns={poolColumns}
                  data={poolData}
                  keyField="id"
                  emptyText="Không có câu hỏi khớp."
                  emptyHint="Hãy vào “Ngân hàng câu hỏi” để thêm câu mới."
                  onRowClick={(row) => { if (!row.daChon) addSel(row.id); }}
                />
              );
            })()}
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => setPicker(false)}
              >
                <X size={14} /> Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast-container" aria-live="polite">
          <div className="toast success">{notice}</div>
        </div>
      )}
      <ConfirmDialog
        open={pendingDeleteId != null}
        title="Xóa phiếu này?"
        message="Phiếu đã xóa sẽ vào Thùng rác (giữ 30 ngày)."
        confirmText="Xóa"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          deleteWorksheet(pendingDeleteId);
          if (selId === pendingDeleteId) setSelId(null);
          setPendingDeleteId(null);
          refresh();
        }}
      />
    </div>
  );
}