// ── Ngân hàng câu hỏi kèm đáp án (gắn lớp, mạch, mức độ) ──────────
import React, { useMemo, useState, useEffect } from "react";
import {
  Database,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  FileSpreadsheet,
  Search,
  Printer,
  Copy,
  Dices,
  RefreshCw,
  Save,
  Eye,
  Sparkles,
  Tag,
  FileText,
} from "lucide-react";
import {
  getQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  clearQuestions,
  saveWorksheet,
  MUC_DO,
} from "./teachingDB";
import { makeId } from "./storage";
import { exportWord, exportCsv, printToPdf, escapeHtml } from "./exportDoc";
import { normalizeGeneratedQuestion } from "./questionSchema";
import SourceBadge from "./scan/SourceBadge";
import SampleButton from "./SampleButton";
import { fillSampleQuestions } from "./sampleData";
import ImageUploadModal from "./ImageUploadModal";

const EMPTY = {
  type: "mc",
  question: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  answer: "",
  subject: "",
  grade: "",
  chapter: "",
  yccd: "",
  mucdo: "",
};
// PHASE 5: correctIndex normalization per spec — always 0-3
function normalizeCorrectIndex(raw) {
  const index = Number(raw);
  return Number.isInteger(index) && index >=0 && index <=3 ? index : 0;
}

export default function QuestionBankView({ books, onNavigate }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => { const h = () => setTick(t=>t+1); window.addEventListener("sgk:data-updated", h); return () => window.removeEventListener("sgk:data-updated", h); }, []);
  const [query, setQuery] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fMucdo, setFMucdo] = useState("");
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [picked, setPicked] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [showDraw, setShowDraw] = useState(false);
  const [drawScope, setDrawScope] = useState("all");
  const [drawCount, setDrawCount] = useState(5);
  const [drawBal, setDrawBal] = useState(true);
  const [drawn, setDrawn] = useState([]);
  const [detail, setDetail] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState(null); // 'delete' | 'edit' | 'tag'
  const [bulkEditForm, setBulkEditForm] = useState({ subject: '', grade: '', mucdo: '' });
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt'); // 'updatedAt' | 'createdAt' | 'subject' | 'grade' | 'mucdo'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'
  const [showStats, setShowStats] = useState(false);

  const questions = getQuestions();

  const subjects = useMemo(
    () => [...new Set(books.map((b) => b.subject))],
    [books],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = questions.filter((x) => {
      const okQ =
        !q ||
        x.question.toLowerCase().includes(q) ||
        (x.yccd || "").toLowerCase().includes(q) ||
        (x.chapter || "").toLowerCase().includes(q);
      const okS = !fSubject || x.subject === fSubject;
      const okG = !fGrade || String(x.grade) === fGrade;
      const okM = !fMucdo || x.mucdo === fMucdo;
      return okQ && okS && okG && okM;
    });

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'updatedAt':
          comparison = (b.updatedAt || 0) - (a.updatedAt || 0);
          break;
        case 'createdAt':
          comparison = (b.createdAt || 0) - (a.createdAt || 0);
          break;
        case 'subject':
          comparison = (a.subject || '').localeCompare(b.subject || '');
          break;
        case 'grade':
          comparison = (a.grade || 0) - (b.grade || 0);
          break;
        case 'mucdo':
          comparison = (a.mucdo || '').localeCompare(b.mucdo || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [questions, query, fSubject, fGrade, fMucdo, sortBy, sortOrder]);

  const startNew = () => {
    setForm(EMPTY);
    setEditId(null);
    setShowForm(true);
  };

  const startEdit = (q) => {
    setForm({
      type: q.type,
      question: q.question,
      options: q.options || ["", "", "", ""],
      correctIndex: q.correctIndex ?? 0,
      answer: q.answer || "",
      subject: q.subject || "",
      grade: String(q.grade || ""),
      chapter: q.chapter || "",
      yccd: q.yccd || "",
      mucdo: q.mucdo || "",
    });
    setEditId(q.id);
    setShowForm(true);
  };

  const save = () => {
    if (!form.question.trim()) return;
    // PHASE 5: canonical schemas — mc 4 options, fill dedicated, essay answerGuide
    let payload;
    if (form.type === 'mc') {
      const opts = form.options.map(o=> String(o||'').trim());
      if (opts.length !== 4 || opts.some(o=>!o)) { alert('Trắc nghiệm cần đúng 4 đáp án không rỗng'); return; }
      payload = {
        type: 'mc',
        question: form.question.trim(),
        options: opts,
        correctIndex: normalizeCorrectIndex(form.correctIndex),
        subject: form.subject.trim(),
        grade: form.grade ? parseInt(form.grade, 10) : null,
        chapter: form.chapter.trim(),
        yccd: form.yccd.trim(),
        mucdo: form.mucdo,
      };
    } else if (form.type === 'fill') {
      if (!form.answer.trim()) { alert('Điền khuyết cần đáp án'); return; }
      payload = {
        type: 'fill',
        question: form.question.trim(),
        answer: form.answer.trim(),
        subject: form.subject.trim(),
        grade: form.grade ? parseInt(form.grade, 10) : null,
        chapter: form.chapter.trim(),
        yccd: form.yccd.trim(),
        mucdo: form.mucdo,
      };
    } else {
      payload = {
        type: 'essay',
        question: form.question.trim(),
        answer: form.answer.trim(),
        answerGuide: form.answer.trim(),
        subject: form.subject.trim(),
        grade: form.grade ? parseInt(form.grade, 10) : null,
        chapter: form.chapter.trim(),
        yccd: form.yccd.trim(),
        mucdo: form.mucdo,
      };
    }
    try {
      if (editId) updateQuestion(editId, payload);
      else addQuestion(payload);
    } catch(e){ alert(e.message); return; }
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY);
    refresh();
  };

  // ── Render question set as a Word/PDF document ───────────────────
  const renderPaper = (qs, withAnswers, title) => {
    let html = `<h1>${escapeHtml(title)}</h1>`;
    html += `<div class="meta">${qs.length} câu • Ngày ${new Date().toLocaleDateString("vi-VN")} • Họ và tên: ................. Lớp: ..............</div>`;
    qs.forEach((q, i) => {
      html += `<p><strong>${withAnswers ? `Câu ${i + 1} (${escapeHtml(q.mucdo || "—")})` : `Câu ${i + 1}`}.</strong> ${escapeHtml(q.question)}</p>`;
      if (q.type === "mc") {
        html += '<ol type="A" style="list-style-type: upper-alpha">';
        (q.options || []).forEach((o) => {
          html += `<li>${escapeHtml(o)}</li>`;
        });
        html += "</ol>";
      } else if (q.type === "fill") {
        html += `<div style="margin: 8px 0; border-bottom: 1px solid #999; height: 18px; width: 60%;"><span style="font-size:10px;color:#999">Điền đáp án</span></div>`;
      } else {
        html += '<div style="height: 90px; border: 1px solid #999; margin: 8px 0;"><span style="font-size:10px;color:#999">Khu vực trả lời tự luận</span></div>';
      }
    });
    if (withAnswers) {
      html += '<div class="pagebreak"></div><h2>ĐÁP ÁN</h2><ol>';
      qs.forEach((q, i) => {
        if (q.type === "mc")
          html += `<li>Câu ${i + 1}: <span class="answer">${String.fromCharCode(65 + normalizeCorrectIndex(q.correctIndex))}</span>${q.mucdo ? ` <small>(${escapeHtml(q.mucdo)})</small>` : ""}</li>`;
        else if (q.type === "fill")
          html += `<li>Câu ${i + 1} (điền khuyết): ${escapeHtml(q.answer || "—")}</li>`;
        else
          html += `<li>Câu ${i + 1} (tự luận): ${escapeHtml(q.answer || q.answerGuide || "—")}</li>`;
      });
      html += "</ol>";
    }
    return html;
  };

  const pickedList = useMemo(
    () => filtered.filter((q) => picked[q.id]),
    [filtered, picked],
  );

  // ── Tạo đề ngẫu nhiên (cân bằng mức độ theo MUC_DO) ──────────────
  const shuffleArr = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const doDrawWith = (pool, n, bal) => {
    const num = Math.min(Math.max(1, n), pool.length);
    let pickedQs = [];
    if (bal) {
      const base = Math.floor(num / MUC_DO.length);
      const rem = num % MUC_DO.length;
      const targets = MUC_DO.map((_, i) => base + (i < rem ? 1 : 0));
      const buckets = MUC_DO.map((md) =>
        shuffleArr(pool.filter((q) => q.mucdo === md)),
      );
      MUC_DO.forEach((_, i) => {
        while (pickedQs.length < num && targets[i] > 0 && buckets[i].length) {
          pickedQs.push(buckets[i].shift());
          targets[i]--;
        }
      });
      const rest = shuffleArr(pool.filter((q) => !pickedQs.includes(q)));
      while (pickedQs.length < num && rest.length) pickedQs.push(rest.shift());
    } else {
      pickedQs = shuffleArr(pool).slice(0, num);
    }
    setDrawn(pickedQs);
  };

  const openDraw = (scope) => {
    setDrawScope(scope);
    setDrawCount(5);
    setDrawBal(true);
    doDrawWith(scope === "filtered" ? filtered : questions, 5, true);
    setShowDraw(true);
  };

  const doDraw = () =>
    doDrawWith(drawScope === "all" ? questions : filtered, drawCount, drawBal);

  const exportDrawn = (withAnswers) => {
    if (!drawn.length) return;
    exportWord(
      `Đề ngẫu nhiên - ${withAnswers ? "kèm đáp án" : "đề kiểm tra"}`,
      renderPaper(drawn, Boolean(withAnswers), "Đề kiểm tra (tạo ngẫu nhiên)"),
    );
  };

  const saveDrawnWorksheet = () => {
    if (!drawn.length) return;
    const nowD = new Date();
    const title = `Đề luyện tập ngẫu nhiên — ${nowD.toLocaleDateString("vi-VN")}`;
    saveWorksheet({
      id: makeId("ws"),
      title,
      subject: drawn[0].subject || "",
      grade: drawn[0].grade ?? null,
      intro: "",
      questions: drawn.map((q) => q.id),
      showAnswers: false,
      at: Date.now(),
    });
    alert('Đã lưu thành phiếu học tập trong tab "Phiếu học tập".');
  };

  const exportPicked = (withAnswers) => {
    if (!pickedList.length) return;
    exportWord(
      `Bộ đề - ${withAnswers ? "kèm đáp án" : "đề kiểm tra"}`,
      renderPaper(pickedList, Boolean(withAnswers), "Bộ đề luyện tập"),
    );
  };

  const printPicked = () => {
    if (!pickedList.length) return;
    printToPdf(
      "Bộ đề luyện tập",
      renderPaper(pickedList, false, "Bộ đề luyện tập"),
    );
  };

  const copyPicked = async () => {
    if (!pickedList.length) return;
    const lines = pickedList.map((q, i) => {
      if (q.type === "mc") {
        const opts = (q.options || [])
          .map((o, oi) => `${String.fromCharCode(65 + oi)}. ${o}`)
          .join("\n");
        return `Câu ${i + 1}. ${q.question}\n${opts}\nĐáp án: ${String.fromCharCode(65 + (q.correctIndex ?? 0))}`;
      }
      return `Câu ${i + 1}. ${q.question}\nĐáp án: ${q.answer || "—"}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));
      alert("Đã chép đề (kèm đáp án) vào clipboard.");
    } catch {
      alert("Không chép được.");
    }
  };

  // Handle image analysis completion — hỗ trợ đa ảnh (batch)
  const handleImageAnalysisComplete = (result) => {
    if (!result.success || !result.data) {
      const detail = result?.error || '';
      alert(detail ? `Phân tích ảnh không thành công: ${detail}` : 'Phân tích ảnh không thành công');
      return;
    }

    // Chuẩn hóa: batch service đã gộp, nhưng vẫn hỗ trợ cả đơn và đa
    const questions = Array.isArray(result.data) ? result.data : [];
    if (questions.length === 0) {
      alert('Không tìm thấy câu hỏi trong ảnh');
      return;
    }

    // Add each question to the question bank
    let addedCount = 0;
    let rejectedCount = 0;
    questions.forEach((q) => {
      try {
        const norm = normalizeGeneratedQuestion(q) || normalizeGeneratedQuestion({
          type: q.type, question: q.question, options: q.options, correctIndex: q.correctIndex, answer: q.answer
        });
        if (!norm) { console.warn('Rejected invalid AI question', q); rejectedCount++; return; }
        addQuestion({
          ...norm,
          subject: q.subject || '',
          grade: q.grade ? parseInt(q.grade, 10) : null,
          chapter: q.chapter || '',
          yccd: q.yccd || '',
          mucdo: q.mucdo || '',
        });
        addedCount++;
      } catch (err) {
        console.error('Error adding question from image:', err);
        rejectedCount++;
      }
    });

    refresh();
    if (result.isBatch && result.results) {
      const ok = result.results.filter(r=>r.success).length;
      const total = result.results.length;
      alert(`Đã thêm ${addedCount} câu hỏi từ ${ok}/${total} ảnh thành công!${rejectedCount ? ` (${rejectedCount} câu lỗi đã bỏ qua)` : ''}`);
    } else {
      alert(`Đã thêm ${addedCount} câu hỏi từ ảnh vào ngân hàng câu hỏi!${rejectedCount ? ` (${rejectedCount} câu lỗi)` : ''}`);
    }
    setShowImageUpload(false);
  };

  // Bulk action handlers
  const handleBulkDelete = () => {
    const selectedIds = Object.keys(picked).filter(id => picked[id]);
    if (selectedIds.length === 0) {
      alert('Chưa chọn câu hỏi nào');
      return;
    }
    
    if (confirm(`Xóa ${selectedIds.length} câu hỏi đã chọn? (không phục hồi được)`)) {
      selectedIds.forEach(id => deleteQuestion(id));
      setPicked({});
      refresh();
      alert(`Đã xóa ${selectedIds.length} câu hỏi`);
      setShowBulkActions(false);
    }
  };

  const handleBulkEdit = () => {
    const selectedIds = Object.keys(picked).filter(id => picked[id]);
    if (selectedIds.length === 0) {
      alert('Chưa chọn câu hỏi nào');
      return;
    }
    
    setBulkEditMode('edit');
    setBulkEditForm({ subject: '', grade: '', mucdo: '' });
  };

  const handleBulkEditSave = () => {
    const selectedIds = Object.keys(picked).filter(id => picked[id]);
    if (selectedIds.length === 0) return;

    let updatedCount = 0;
    selectedIds.forEach(id => {
      const question = questions.find(q => q.id === id);
      if (question) {
        const updates = {};
        if (bulkEditForm.subject) updates.subject = bulkEditForm.subject;
        if (bulkEditForm.grade) updates.grade = parseInt(bulkEditForm.grade, 10);
        if (bulkEditForm.mucdo) updates.mucdo = bulkEditForm.mucdo;
        
        if (Object.keys(updates).length > 0) {
          updateQuestion(id, { ...question, ...updates });
          updatedCount++;
        }
      }
    });

    refresh();
    alert(`Đã cập nhật ${updatedCount} câu hỏi`);
    setBulkEditMode(null);
    setBulkEditForm({ subject: '', grade: '', mucdo: '' });
  };

  const handleBulkTag = () => {
    const selectedIds = Object.keys(picked).filter(id => picked[id]);
    if (selectedIds.length === 0) {
      alert('Chưa chọn câu hỏi nào');
      return;
    }
    
    setBulkEditMode('tag');
    setBulkTagInput('');
  };

  const handleBulkTagSave = () => {
    const selectedIds = Object.keys(picked).filter(id => picked[id]);
    if (selectedIds.length === 0 || !bulkTagInput.trim()) return;

    const tags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
    let updatedCount = 0;
    
    selectedIds.forEach(id => {
      const question = questions.find(q => q.id === id);
      if (question) {
        const existingTags = question.tags || [];
        const mergedTags = [...new Set([...existingTags, ...tags])];
        updateQuestion(id, { ...question, tags: mergedTags });
        updatedCount++;
      }
    });

    refresh();
    alert(`Đã thêm thẻ vào ${updatedCount} câu hỏi`);
    setBulkEditMode(null);
    setBulkTagInput('');
  };

  const handleSelectAll = () => {
    const allIds = filtered.map(q => q.id);
    const allSelected = allIds.every(id => picked[id]);
    
    if (allSelected) {
      setPicked({});
    } else {
      const newPicked = {};
      allIds.forEach(id => newPicked[id] = true);
      setPicked(newPicked);
    }
  };

  const getStatistics = () => {
    const stats = {
      total: questions.length,
      byType: { mc: 0, essay: 0 },
      bySubject: {},
      byGrade: {},
      byMucdo: {}
    };

    questions.forEach(q => {
      if (q.type === 'mc') stats.byType.mc++;
      else if (q.type === 'essay') stats.byType.essay++;
      
      if (q.subject) {
        stats.bySubject[q.subject] = (stats.bySubject[q.subject] || 0) + 1;
      }
      
      if (q.grade) {
        stats.byGrade[q.grade] = (stats.byGrade[q.grade] || 0) + 1;
      }
      
      if (q.mucdo) {
        stats.byMucdo[q.mucdo] = (stats.byMucdo[q.mucdo] || 0) + 1;
      }
    });

    return stats;
  };

  const exportAllCsv = () => {
    if (!questions.length) return;
    const rows = [
      [
        "Câu hỏi",
        "Loại",
        "Đáp án MC",
        "Đáp án tự luận",
        "Môn",
        "Lớp",
        "Chương",
        "YCCĐ",
        "Mức độ",
      ],
    ];
    questions.forEach((q) => {
      const mcAns =
        q.type === "mc" ? String.fromCharCode(65 + (q.correctIndex ?? 0)) : "";
      rows.push([
        q.question,
        q.type === "mc" ? "Trắc nghiệm" : "Tự luận",
        mcAns,
        q.answer || "",
        q.subject || "",
        String(q.grade || ""),
        q.chapter || "",
        q.yccd || "",
        q.mucdo || "",
      ]);
    });
    exportCsv("Ngân hàng câu hỏi", rows);
  };

  const qbEmptyText = useMemo(() => {
    if (!questions.length) return "Chưa có dữ liệu";
    if (!filtered.length) {
      const q = query.trim();
      if (q) return `Không tìm thấy kết quả cho "${q}"`;
      return "Không khớp bộ lọc nào.";
    }
    return "Chưa có dữ liệu";
  }, [questions.length, filtered.length, query]);

  const qbEmptyHint = useMemo(() => {
    if (!questions.length)
      return "Thêm câu hỏi trắc nghiệm/tự luận kèm đáp án, gắn mức độ — rồi chọn và xuất bộ đề.";
    if (!filtered.length) return "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.";
    return "";
  }, [questions.length, filtered.length]);

  return (
    <div className="qbx-root">
      <style>{`
        .qbx-root { display:flex; flex-direction:column; gap:12px; }
        .qbx-head { background:linear-gradient(135deg, rgba(22,163,74,0.10), rgba(45,115,255,0.06)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:11px; }
        .qbx-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .qbx-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .qbx-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #16a34a)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #16a34a) 35%, transparent); }
        .qbx-stats { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
        .qbx-stat { font-size:11.5px; font-weight:700; color:#334155; background:rgba(255,255,255,0.85); border:1px solid #e2e8f0; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
        .qbx-stat.hot { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #bfdbfe); }
        .qbx-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .qbx-search { flex:1 1 200px; min-width:170px; position:relative; }
        .qbx-search input { width:100%; padding:8px 30px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .qbx-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .qbx-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; display:inline-flex; }
        .qbx-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .qbx-actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .qbx-hint { margin:0; font-size:11.5px; color:var(--text-muted); }
        .qbx-selbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; background:var(--color-action-soft, #eff6ff); border:1px solid var(--color-action-soft, #bfdbfe); border-radius:12px; padding:8px 12px; font-size:12.5px; font-weight:700; color:var(--color-action-strong, #1d4ed8); }
        .qbx-list { display:flex; flex-direction:column; gap:9px; }
        .qbx-card { background:var(--surface); border:1px solid var(--border-color); border-radius:13px; padding:11px 12px; display:flex; gap:10px; align-items:flex-start; transition:border-color 0.15s ease, box-shadow 0.15s ease; }
        .qbx-card:hover { border-color:#86efac; box-shadow:0 4px 14px rgba(22,163,74,0.08); }
        .qbx-card.sel { border-color:var(--color-action, #2d73ff); background:linear-gradient(180deg, var(--color-action-soft, rgba(45,115,255,0.05)), rgba(255,255,255,0)); box-shadow:0 4px 14px color-mix(in srgb, var(--color-action, #2d73ff) 14%, transparent); }
        .qbx-check { width:23px; height:23px; border-radius:8px; border:2px solid #cbd5e1; background:#fff; display:inline-flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; flex-shrink:0; margin-top:1px; }
        .qbx-check.on { background:var(--color-action, #16a34a); border-color:var(--color-action, #16a34a); }
        .qbx-num { font-size:11px; font-weight:800; color:#94a3b8; min-width:26px; text-align:right; margin-top:4px; }
        .qbx-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:7px; }
        .qbx-q { margin:0; font-size:0.88rem; line-height:1.55; color:var(--text-dark); }
        .qbx-badges { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
        .qbx-badge { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px; background:#f8fafc; color:#475569; border:1px solid #e2e8f0; }
        .qbx-badge.subj { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #dbeafe); }
        .qbx-badge.lvl { background:#f0fdf4; color:#15803d; border-color:#bbf7d0; }
        .qbx-badge.scan { background:#f0fdfa; color:#0f766e; border-color:#99f6e4; }
        .qbx-opts { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:6px; }
        @media (max-width: 640px) { .qbx-opts { grid-template-columns:1fr; } }
        .qbx-opt { display:flex; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:7px 10px; font-size:0.83rem; line-height:1.45; color:#334155; min-width:0; }
        .qbx-opt b { width:22px; height:22px; border-radius:7px; background:#e2e8f0; color:#475569; display:inline-flex; align-items:center; justify-content:center; font-size:11px; flex-shrink:0; }
        .qbx-opt-tx { flex:1; min-width:0; overflow-wrap:anywhere; }
        .qbx-opt.ok { background:#f0fdf4; border-color:#86efac; color:#14532d; font-weight:600; }
        .qbx-opt.ok b { background:#16a34a; color:#fff; }
        .qbx-opt-check { color:#16a34a; flex-shrink:0; }
        .qbx-ans { font-size:12px; color:#15803d; background:#f0fdf4; border:1px dashed #86efac; border-radius:8px; padding:6px 10px; }
        .qbx-thumb { border-radius:8px; overflow:hidden; border:1px solid var(--border-color); max-width:200px; }
        .qbx-thumb img { width:100%; max-height:100px; object-fit:cover; display:block; }
        .qbx-card-actions { display:flex; flex-direction:column; gap:5px; flex-shrink:0; }
        .qbx-icobtn { width:31px; height:31px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; }
        .qbx-icobtn:hover { border-color:var(--color-action, #16a34a); color:var(--color-action-strong, #15803d); background:var(--color-action-soft, #f0fdf4); }
        .qbx-icobtn.pick.on { background:#16a34a; border-color:#16a34a; color:#fff; }
        .qbx-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .qbx-empty { text-align:center; padding:36px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); }
        .qbx-more { position:relative; }
        .qbx-menu { position:absolute; right:0; top:calc(100% + 6px); background:var(--surface); border:1px solid var(--border-color); border-radius:10px; box-shadow:var(--shadow-md); padding:6px; display:flex; flex-direction:column; gap:5px; min-width:190px; z-index:20; }
      `}</style>
      {/* ── Header + toolbar ── */}
      <div className="qbx-head">
        <div className="qbx-title-row">
          <h2 className="qbx-title"><span className="qbx-title-ic"><Database size={17} /></span> Ngân hàng câu hỏi</h2>
          <div className="qbx-stats">
            <span className="qbx-stat">{questions.length} câu</span>
            <span className="qbx-stat">{getStatistics().byType.mc} trắc nghiệm</span>
            <span className="qbx-stat">{getStatistics().byType.essay} tự luận</span>
            {pickedList.length > 0 && <span className="qbx-stat hot"><Check size={12} /> {pickedList.length} đã chọn</span>}
          </div>
        </div>
        <div className="qbx-toolbar">
          <div className="qbx-search">
            <Search size={15} />
            <input type="text" placeholder="Tìm câu hỏi, YCCĐ, chương…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm câu hỏi" />
            {query && <button className="qbx-search-clear" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>}
          </div>
          <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label="Lọc môn">
            <option value="">Mọi môn</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fGrade} onChange={(e) => setFGrade(e.target.value)} aria-label="Lọc lớp">
            <option value="">Mọi lớp</option>
            {[1, 2, 3, 4, 5].map((g) => <option key={g} value={String(g)}>Lớp {g}</option>)}
          </select>
          <select value={fMucdo} onChange={(e) => setFMucdo(e.target.value)} aria-label="Lọc mức độ">
            <option value="">Mọi mức độ</option>
            {MUC_DO.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Sắp xếp theo" aria-label="Sắp xếp theo">
            <option value="updatedAt">Mới nhất</option>
            <option value="createdAt">Ngày tạo</option>
            <option value="subject">Môn học</option>
            <option value="grade">Lớp</option>
            <option value="mucdo">Mức độ</option>
          </select>
          <button className="btn btn-secondary btn-xs" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} title={sortOrder === 'asc' ? 'Tăng dần' : 'Giảm dần'}>{sortOrder === 'asc' ? '↑' : '↓'}</button>
          <button className="btn btn-secondary btn-xs" onClick={() => setShowStats(!showStats)} title="Thống kê">📊</button>
        </div>
        <div className="qbx-actions">
          <button className="btn btn-primary btn-sm" onClick={startNew}><Plus size={14} /> Câu hỏi mới</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowImageUpload(true)} title="Nhập câu hỏi từ ảnh"><Sparkles size={13} /> Nhập từ ảnh</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openDraw("filtered")} disabled={!filtered.length} title="Tạo đề ngẫu nhiên từ kết quả lọc"><Dices size={13} /> Đề ngẫu nhiên</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportPicked(false)} disabled={!pickedList.length} title="Xuất Word các câu đã chọn"><FileText size={13} /> Xuất đề{pickedList.length ? ` (${pickedList.length})` : ""}</button>
          {pickedList.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkActions(!showBulkActions)} title="Thao tác hàng loạt">📋 Bulk</button>
          )}
          <div className="qbx-more">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowMore((v) => !v)} aria-haspopup="menu" aria-expanded={showMore} title="Công cụ nâng cao">⋯ Thêm</button>
            {showMore && (
              <div className="qbx-menu" role="menu" onMouseLeave={() => setShowMore(false)}>
                <button className="btn btn-secondary btn-xs" onClick={() => { copyPicked(); setShowMore(false); }} disabled={!pickedList.length}><Copy size={12} /> Chép đề</button>
                <button className="btn btn-secondary btn-xs" onClick={() => { printPicked(); setShowMore(false); }} disabled={!pickedList.length}><Printer size={12} /> In đề</button>
                <button className="btn btn-secondary btn-xs" onClick={() => { exportPicked(true); setShowMore(false); }} disabled={!pickedList.length}>Đề + đáp án</button>
                <button className="btn btn-secondary btn-xs" onClick={() => { exportAllCsv(); setShowMore(false); }} disabled={!questions.length}><FileSpreadsheet size={12} /> Xuất CSV</button>
                <SampleButton onRun={() => { const n = fillSampleQuestions(); refresh(); setShowMore(false); alert(`Đã thêm ${n} câu hỏi mẫu (Toán, Tiếng Việt, Tự nhiên và Xã hội — lớp 1 đến 3).`); }} />
              </div>
            )}
          </div>
        </div>
        <p className="qbx-hint">Tích ☑ để gom câu làm bộ đề • bấm vào câu để xem chi tiết • đáp án đúng nền xanh.</p>
      </div>

      {/* Thanh đã chọn */}
      {pickedList.length > 0 && (
        <div className="qbx-selbar">
          <Check size={14} /> Đã chọn {pickedList.length} câu
          <button className="btn btn-primary btn-xs" onClick={() => exportPicked(false)}>Xuất đề</button>
          <button className="btn btn-secondary btn-xs" onClick={() => exportPicked(true)}>Đề + đáp án</button>
          <button className="btn btn-secondary btn-xs" onClick={printPicked}>In</button>
          <button className="btn btn-secondary btn-xs" onClick={copyPicked}>Chép</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setPicked({})}>Bỏ chọn hết</button>
        </div>
      )}

      {/* Bulk Actions Panel */}
      {showBulkActions && (
        <div className="panel-box border-primary mb-0-8">
          <div className="flex-row gap-sm mb-0-7">
            <h4 className="m-0 flex-1">Thao tác hàng loạt ({pickedList.length} câu)</h4>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowBulkActions(false)}>
              <X size={14} />
            </button>
          </div>
          
          <div className="flex-row gap-sm mb-0-7">
            <button className="btn btn-secondary btn-xs" onClick={handleSelectAll}>
              {filtered.every(q => picked[q.id]) ? 'Bỏ chọn hết' : 'Chọn tất cả'}
            </button>
            <button className="btn btn-secondary btn-xs danger" onClick={handleBulkDelete}>
              <Trash2 size={12} /> Xóa ({pickedList.length})
            </button>
            <button className="btn btn-secondary btn-xs" onClick={handleBulkEdit}>
              <Pencil size={12} /> Sửa hàng loạt
            </button>
            <button className="btn btn-secondary btn-xs" onClick={handleBulkTag}>
              <Tag size={12} /> Thêm thẻ
            </button>
          </div>

          {/* Bulk Edit Form */}
          {bulkEditMode === 'edit' && (
            <div className="tag-grid-3 mb-0-7 p-sm bg-muted radius-md">
              <div>
                <label className="form-label">Đổi môn</label>
                <select
                  className="form-control"
                  value={bulkEditForm.subject}
                  onChange={(e) => setBulkEditForm(f => ({ ...f, subject: e.target.value }))}
                >
                  <option value="">Giữ nguyên</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Đổi lớp</label>
                <select
                  className="form-control"
                  value={bulkEditForm.grade}
                  onChange={(e) => setBulkEditForm(f => ({ ...f, grade: e.target.value }))}
                >
                  <option value="">Giữ nguyên</option>
                  {[1,2,3,4,5].map(g => <option key={g} value={String(g)}>Lớp {g}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Đổi mức độ</label>
                <select
                  className="form-control"
                  value={bulkEditForm.mucdo}
                  onChange={(e) => setBulkEditForm(f => ({ ...f, mucdo: e.target.value }))}
                >
                  <option value="">Giữ nguyên</option>
                  {MUC_DO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex-row gap-sm">
                <button className="btn btn-primary btn-xs" onClick={handleBulkEditSave}>
                  <Check size={12} /> Áp dụng
                </button>
                <button className="btn btn-secondary btn-xs" onClick={() => setBulkEditMode(null)}>
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* Bulk Tag Form */}
          {bulkEditMode === 'tag' && (
            <div className="mb-0-7 p-sm bg-muted radius-md">
              <label className="form-label">Thêm thẻ (phân cách dấu phẩy)</label>
              <div className="flex-row gap-sm">
                <input
                  className="form-control flex-1"
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  placeholder="VD: khó, quan trọng, ôn tập"
                />
                <button className="btn btn-primary btn-xs" onClick={handleBulkTagSave}>
                  <Check size={12} /> Thêm
                </button>
                <button className="btn btn-secondary btn-xs" onClick={() => setBulkEditMode(null)}>
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="panel-hint p-sm bg-muted radius-md">
            <strong>Thống kê:</strong> {questions.length} câu hỏi tổng • 
            {getStatistics().byType.mc} trắc nghiệm • {getStatistics().byType.essay} tự luận
          </div>
        </div>
      )}

      {/* Statistics Panel */}
      {showStats && (
        <div className="panel-box mb-0-8">
          <div className="flex-row gap-sm mb-0-7">
            <h4 className="m-0 flex-1">📊 Thống kê chi tiết</h4>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowStats(false)}>
              <X size={14} />
            </button>
          </div>
          
          <div className="tag-grid-2 mb-0-7">
            <div className="p-sm bg-muted radius-md">
              <strong>Tổng số câu hỏi:</strong> {questions.length}
            </div>
            <div className="p-sm bg-muted radius-md">
              <strong>Trắc nghiệm:</strong> {getStatistics().byType.mc} ({Math.round(getStatistics().byType.mc / questions.length * 100)}%)
            </div>
            <div className="p-sm bg-muted radius-md">
              <strong>Tự luận:</strong> {getStatistics().byType.essay} ({Math.round(getStatistics().byType.essay / questions.length * 100)}%)
            </div>
            <div className="p-sm bg-muted radius-md">
              <strong>Đang hiển thị:</strong> {filtered.length} câu
            </div>
          </div>

          <div className="tag-grid-2 mb-0-7">
            <div>
              <strong>Theo môn học:</strong>
              <div className="mt-0-3">
                {Object.entries(getStatistics().bySubject).map(([subject, count]) => (
                  <div key={subject} className="flex-row gap-sm mb-0-2">
                    <span className="gl-chip">{subject}</span>
                    <span>{count} câu</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <strong>Theo lớp:</strong>
              <div className="mt-0-3">
                {Object.entries(getStatistics().byGrade).sort(([a], [b]) => a - b).map(([grade, count]) => (
                  <div key={grade} className="flex-row gap-sm mb-0-2">
                    <span className="gl-chip">Lớp {grade}</span>
                    <span>{count} câu</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <strong>Theo mức độ:</strong>
            <div className="mt-0-3">
              {Object.entries(getStatistics().byMucdo).map(([mucdo, count]) => (
                <div key={mucdo} className="flex-row gap-sm mb-0-2">
                  <span className="gl-chip">{mucdo}</span>
                  <span>{count} câu</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="panel-box border-primary mb-0-8">
          <h4 className="mb-0-7 text-primary font-inherit">
            {editId ? "✏️ Sửa câu hỏi" : "➕ Câu hỏi mới"}
          </h4>
          <div className="tag-grid-4">
            <div>
              <label className="form-label">Loại câu</label>
              <select
                className="form-control"
                value={form.type}
                onChange={(e) => {
                  setForm((f) => ({ ...f, type: e.target.value }));
                }}
              >
                <option value="mc">Trắc nghiệm (4 đáp án)</option>
                <option value="fill">Điền khuyết</option>
                <option value="essay">Tự luận</option>
              </select>
            </div>
            <div>
              <label className="form-label">Môn</label>
              <select
                className="form-control"
                value={form.subject}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subject: e.target.value }))
                }
              >
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Lớp</label>
              <select
                className="form-control"
                value={form.grade}
                onChange={(e) =>
                  setForm((f) => ({ ...f, grade: e.target.value }))
                }
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((g) => (
                  <option key={g} value={String(g)}>
                    Lớp {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Mức độ</label>
              <select
                className="form-control"
                value={form.mucdo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mucdo: e.target.value }))
                }
              >
                <option value="">—</option>
                {MUC_DO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="form-label">Câu hỏi *</label>
          <textarea
            className="form-control"
            rows={2}
            value={form.question}
            onChange={(e) =>
              setForm((f) => ({ ...f, question: e.target.value }))
            }
            placeholder="Nhập câu hỏi…"
          />
          {form.type === "mc" ? (
            <div className="qb-opts">
              {form.options.map((opt, oi) => (
                <div key={oi} className="qb-opt">
                  <button
                    className={`btn btn-xs ${form.correctIndex === oi ? "btn-primary" : "btn-secondary"}`}
                    title="Đặt làm đáp án đúng"
                    onClick={() => setForm((f) => ({ ...f, correctIndex: oi }))}
                  >
                    {form.correctIndex === oi ? (
                      <Check size={12} />
                    ) : (
                      String.fromCharCode(65 + oi)
                    )}
                  </button>
                  <input
                    className="form-control"
                    value={opt}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        options: f.options.map((o, i) =>
                          i === oi ? e.target.value : o,
                        ),
                      }))
                    }
                    placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`}
                  />
                  {form.correctIndex === oi && (
                    <span className="gl-chip text-success">đúng</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <label className="form-label">Đáp án gợi ý</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.answer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, answer: e.target.value }))
                }
                placeholder="Nội dung trả lời mong đợi…"
              />
            </div>
          )}
          <div className="tag-grid-2">
            <div>
              <label className="form-label">Chương / Bài</label>
              <input
                className="form-control"
                value={form.chapter}
                onChange={(e) =>
                  setForm((f) => ({ ...f, chapter: e.target.value }))
                }
                placeholder="VD: Bài 12 – Phép cộng phạm vi 10"
              />
            </div>
            <div>
              <label className="form-label">Yêu cầu cần đạt (tham chiếu)</label>
              <input
                className="form-control"
                value={form.yccd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, yccd: e.target.value }))
                }
                placeholder="Ghi tóm tắt YCCĐ liên quan…"
              />
            </div>
          </div>
          <div className="flex-row gap-sm mt-0-7">
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={!form.question.trim()}
            >
              <Check size={14} /> Lưu câu hỏi
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowForm(false);
                setEditId(null);
                setForm(EMPTY);
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {showDraw && (
        <div className="modal-overlay" onClick={() => setShowDraw(false)}>
          <div
            className="modal-content max-w-640"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="flex-row gap-sm m-0">
                <Dices size={17} /> Tạo đề ngẫu nhiên
              </h3>
              <button
                className="util-bubble-close dark"
                onClick={() => setShowDraw(false)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            <div className="tag-body">
              <div className="seg-tabs mb-0-7">
                <button
                  className={`seg-tab${drawScope === "filtered" ? " on" : ""}`}
                  onClick={() => {
                    setDrawScope("filtered");
                    doDrawWith(filtered, drawCount, drawBal);
                  }}
                >
                  Kết quả bộ lọc ({filtered.length})
                </button>
                <button
                  className={`seg-tab${drawScope === "all" ? " on" : ""}`}
                  onClick={() => {
                    setDrawScope("all");
                    doDrawWith(questions, drawCount, drawBal);
                  }}
                >
                  Toàn bộ ngân hàng ({questions.length})
                </button>
              </div>
              <div className="tag-grid-2">
                <div>
                  <label className="form-label">Số câu</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="form-control"
                    value={drawCount}
                    onChange={(e) =>
                      setDrawCount(parseInt(e.target.value, 10) || 1)
                    }
                  />
                </div>
                <div>
                  <label className="form-label">Phân bố mức độ</label>
                  <button
                    className={`btn btn-xs ${drawBal ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      const v = !drawBal;
                      setDrawBal(v);
                      doDrawWith(
                        drawScope === "all" ? questions : filtered,
                        drawCount,
                        v,
                      );
                    }}
                  >
                    <Check size={12} />{" "}
                    {drawBal
                      ? "Cân bằng Nhận biết / Thông hiểu / Vận dụng"
                      : "Ngẫu nhiên thuần túy"}
                  </button>
                </div>
              </div>

              {drawn.length > 0 ? (
                <>
                  <p className="panel-hint mt-0-7">
                    {drawn.length} câu đã chọn:{" "}
                    {MUC_DO.map((m) => {
                      const c = drawn.filter((q) => q.mucdo === m).length;
                      return (
                        <span key={m} className="mr-md">
                          {m}: <strong>{c}</strong>
                        </span>
                      );
                    })}
                    {drawn.filter((q) => !q.mucdo).length > 0 && (
                      <span>
                        Không rõ mức độ:{" "}
                        <strong>{drawn.filter((q) => !q.mucdo).length}</strong>
                      </span>
                    )}
                  </p>
                  <div className="qb-list stack-v-sm-mt">
                    {drawn.map((q, i) => (
                      <div className="qb-row p-0-45-0-6" key={q.id}>
                        <span className="font-bold text-primary min-w-1-6">
                          {String.fromCharCode(105 + i)}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.84rem",
                              lineHeight: 1.45,
                            }}
                          >
                            {q.question}
                          </p>
                          <div className="flex-row gap-sm flex-wrap mt-0-2">
                            {q.type === "mc" ? (
                              <span className="gl-chip">Trắc nghiệm</span>
                            ) : (
                              <span className="gl-chip">Tự luận</span>
                            )}
                            {q.mucdo && (
                              <span className="gl-chip">{q.mucdo}</span>
                            )}
                            {q.subject && (
                              <span className="gl-chip">{q.subject}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="panel-hint mt-0-7">
                  Không có câu hỏi nào trong phạm vi đã chọn.
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  marginTop: "0.8rem",
                }}
              >
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={doDraw}
                  disabled={!filtered.length && !questions.length}
                >
                  <RefreshCw size={12} /> Tạo lại
                </button>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => exportDrawn(false)}
                  disabled={!drawn.length}
                >
                  Xuất đề
                </button>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => exportDrawn(true)}
                  disabled={!drawn.length}
                >
                  Đề + đáp án
                </button>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={saveDrawnWorksheet}
                  disabled={!drawn.length}
                >
                  <Save size={12} /> Lưu thành phiếu học tập
                </button>
                {onNavigate && (
                  <button className="btn btn-secondary btn-xs" onClick={()=>onNavigate("worksheets")} title="Xem phiếu vừa tạo">
                    <FileText size={12} /> Xem Phieu
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

      {/* ── Danh sách câu hỏi dạng cards ── */}
      {filtered.length === 0 ? (
        <div className="qbx-empty">
          <Database size={38} />
          <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>{qbEmptyText}</p>
          <p style={{ margin: 0, fontSize: 12 }}>{qbEmptyHint}</p>
        </div>
      ) : (
        <div className="qbx-list">
          {filtered.map((q, idx) => {
            const sel = !!picked[q.id];
            const ci = Number(q.correctIndex);
            const cidx = q.type === "mc" && Number.isInteger(ci) && ci >= 0 && ci <= 3 ? ci : -1;
            return (
              <article key={q.id} className={`qbx-card${sel ? " sel" : ""}`}>
                <button className={`qbx-check${sel ? " on" : ""}`} onClick={() => setPicked((p) => ({ ...p, [q.id]: !p[q.id] }))}
                  title={sel ? "Bỏ chọn" : "Chọn vào bộ đề"} aria-label={sel ? "Bỏ chọn câu này" : "Chọn câu này"} aria-pressed={sel}>
                  {sel && <Check size={14} strokeWidth={3} />}
                </button>
                <span className="qbx-num">{idx + 1}</span>
                <div className="qbx-body">
                  <p className="qbx-q" role="button" tabIndex={0} onClick={() => setDetail(q)}
                    onKeyDown={(e) => { if (e.key === "Enter") setDetail(q); }}
                    title="Bấm để xem chi tiết" style={{ cursor: "pointer" }}>{q.question}</p>
                  {q.type === "mc" && Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="qbx-opts">
                      {q.options.map((o, oi) => (
                        <span key={oi} className={`qbx-opt${oi === cidx ? " ok" : ""}`}>
                          <b>{String.fromCharCode(65 + oi)}</b>
                          <span className="qbx-opt-tx">{o}</span>
                          {oi === cidx && <Check size={13} className="qbx-opt-check" />}
                        </span>
                      ))}
                    </div>
                  )}
                  {(q.type === "essay" || q.type === "fill") && (q.answer || q.answerGuide) && (
                    <div className="qbx-ans">Đáp án: {q.answer || q.answerGuide}</div>
                  )}
                  <div className="qbx-badges">
                    {q.subject && <span className="qbx-badge subj">{q.subject}</span>}
                    {q.grade && <span className="qbx-badge">Lớp {q.grade}</span>}
                    <span className="qbx-badge">{q.type === "mc" ? "Trắc nghiệm" : q.type === "fill" ? "Điền khuyết" : "Tự luận"}</span>
                    {q.mucdo && <span className="qbx-badge lvl">{q.mucdo}</span>}
                    {(q.origin === "sgk_original" || q.keepOriginal) && <span className="qbx-badge scan">📖 SGK</span>}
                    {q.source?.type === "sgk_scan" && <span className="qbx-badge scan" title={`📚 ${q.source.bookName} tr.${q.source.page}`}>📚 tr.{q.source.page}</span>}
                    {q.chapter && <span className="qbx-badge" title={q.chapter}>📖 {q.chapter.slice(0, 28)}</span>}
                  </div>
                  {q.thumbnail && (
                    <div className="qbx-thumb"><img src={q.thumbnail} alt="" loading="lazy" /></div>
                  )}
                </div>
                <div className="qbx-card-actions">
                  <button className="qbx-icobtn" onClick={() => setDetail(q)} title="Xem chi tiết" aria-label="Xem chi tiết"><Eye size={14} /></button>
                  <button className="qbx-icobtn" onClick={() => startEdit(q)} title="Sửa" aria-label="Sửa câu hỏi"><Pencil size={14} /></button>
                  <button className="qbx-icobtn danger" onClick={() => { if (confirm("Xóa câu hỏi này?")) { deleteQuestion(q.id); refresh(); } }} title="Xóa" aria-label="Xóa câu hỏi"><Trash2 size={14} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={showImageUpload}
        onClose={() => setShowImageUpload(false)}
        analysisType="questions"
        onAnalysisComplete={handleImageAnalysisComplete}
        title="Nhập câu hỏi từ ảnh với AI"
      />

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.6rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span className="sn-count">{pickedList.length} câu đã chọn</span>
        {pickedList.length > 0 && (
          <button className="btn-link-reset" onClick={() => setPicked({})}>
            Bỏ chọn hết
          </button>
        )}
        <button
          className="btn-link-reset"
          onClick={() => {
            if (
              confirm("Xóa TOÀN BỘ ngân hàng câu hỏi? (không phục hồi được)")
            ) {
              clearQuestions();
              refresh();
            }
          }}
        >
          <Trash2 size={13} /> Xóa hết ngân hàng
        </button>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="modal-content max-w-640"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="m-0 flex-row gap-sm">
                <Eye size={16} /> Chi tiết câu hỏi
              </h3>
              <button
                className="util-bubble-close dark"
                onClick={() => setDetail(null)}
                aria-label="Đóng chi tiết"
              >
                <X size={18} />
              </button>
            </div>
            <div className="tag-body">
              <p
                style={{
                  margin: "0 0 0.6rem",
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                  fontWeight: 600,
                }}
              >
                {detail.question}
              </p>
              {detail.type === "mc" && detail.options?.length > 0 && (
                <div className="qbx-opts" style={{ marginBottom: 8 }}>
                  {detail.options.map((o, oi) => (
                    <div key={oi} className={`qbx-opt${detail.correctIndex === oi ? " ok" : ""}`}>
                      <b>{String.fromCharCode(65 + oi)}</b>
                      <span className="qbx-opt-tx">{o}</span>
                      {detail.correctIndex === oi && <span style={{ fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} /> Đáp án</span>}
                    </div>
                  ))}
                </div>
              )}
              {detail.type === "essay" && detail.answer && (
                <p className="panel-hint p-sm bg-muted radius-md">
                  <strong>Đáp án gợi ý:</strong> {detail.answer}
                </p>
              )}
              <div className="flex-row gap-sm flex-wrap mb-0-6">
                {detail.subject && (
                  <span className="gl-chip">{detail.subject}</span>
                )}
                {detail.grade && (
                  <span className="gl-chip">Lớp {detail.grade}</span>
                )}
                {detail.type === "mc" ? (
                  <span className="gl-chip">Trắc nghiệm</span>
                ) : (
                  <span className="gl-chip">Tự luận</span>
                )}
                {detail.mucdo && (
                  <span className="gl-chip">{detail.mucdo}</span>
                )}
                {detail.chapter && (
                  <span className="gl-chip">{detail.chapter}</span>
                )}
                {detail.yccd && (
                  <span className="gl-chip" title={detail.yccd}>
                    YCCĐ: {detail.yccd}
                  </span>
                )}
              </div>
              {detail.source?.type === "sgk_scan" && (
                <div style={{ marginBottom: 8 }}>
                  <SourceBadge source={detail.source} books={books} />
                  {detail.thumbnail && <div style={{ marginTop: 6 }}><img src={detail.thumbnail} alt="Thumbnail" style={{ maxWidth: 180, maxHeight: 100, borderRadius: 6, border: "1px solid var(--border-color)" }} /></div>}
                </div>
              )}
              <div className="flex-row-end">
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    setDetail(null);
                    startEdit(detail);
                  }}
                  aria-label="Sửa câu hỏi này"
                >
                  <Pencil size={12} /> Sửa
                </button>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => setDetail(null)}
                  aria-label="Đóng"
                >
                  <X size={12} /> Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}