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
} from "../data/teachingDB.js";
import { makeId } from "../data/storage.js";
import { exportWord, exportCsv, printToPdf, escapeHtml } from "../services/exportDoc.js";
import { normalizeGeneratedQuestion, normalizeMucdo } from "../data/questionSchema.js";
import SampleButton from "./SampleButton.jsx";
import { fillSampleQuestions } from "../data/sampleData.js";
import ImageUploadModal from "./ImageUploadModal.jsx";
import QuestionCard from "./QuestionCard.jsx";
import QuestionDetailModal from "./QuestionDetailModal.jsx";
import QuestionEditorForm from "./QuestionEditorForm.jsx";
import QuestionDrawDialog from "./QuestionDrawDialog.jsx";
import QuestionBankStyles from "./QuestionBankStyles.jsx";
import QuestionStatsPanel from "./QuestionStatsPanel.jsx";
import QuestionSelectionBar from "./QuestionSelectionBar.jsx";

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
  const [tick, setTick] = useState(0);
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

  // Chuẩn hóa mức độ khi đọc (dữ liệu cũ có thể còn 4 cấp: "Thông hiểu", "Nhận biết"…)
  const questions = useMemo(
    () => getQuestions().map((x) => (x && x.mucdo ? { ...x, mucdo: normalizeMucdo(x.mucdo) } : x)),
    [tick],
  );

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
          comparison = (a.subject || '').localeCompare(b.subject || '', 'vi');
          break;
        case 'grade':
          comparison = (a.grade || 0) - (b.grade || 0);
          break;
        case 'mucdo':
          comparison = (a.mucdo || '').localeCompare(b.mucdo || '', 'vi');
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
        html += `<div style="margin: 8px 0; border-bottom: 1px solid #999; height: 18px; width: 60%;"><span style="font-size: 0.625rem;color:#999">Điền đáp án</span></div>`;
      } else {
        html += '<div style="height: 90px; border: 1px solid #999; margin: 8px 0;"><span style="font-size: 0.625rem;color:#999">Khu vực trả lời tự luận</span></div>';
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
    try {
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
    } catch (e) {
      alert(e.message || "Không lưu được phiếu (bộ nhớ đầy).");
      return;
    }
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
          mucdo: normalizeMucdo(q.mucdo),
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
    let failed = 0;
    selectedIds.forEach(id => {
      const question = questions.find(q => q.id === id);
      if (question) {
        const updates = {};
        if (bulkEditForm.subject) updates.subject = bulkEditForm.subject;
        if (bulkEditForm.grade) updates.grade = parseInt(bulkEditForm.grade, 10);
        if (bulkEditForm.mucdo) updates.mucdo = bulkEditForm.mucdo;

        if (Object.keys(updates).length > 0) {
          try {
            updateQuestion(id, { ...question, ...updates });
            updatedCount++;
          } catch { failed++; }
        }
      }
    });

    refresh();
    alert(failed ? `Đã cập nhật ${updatedCount} câu hỏi (${failed} lỗi — có thể đầy bộ nhớ).` : `Đã cập nhật ${updatedCount} câu hỏi`);
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
    let failed = 0;

    selectedIds.forEach(id => {
      const question = questions.find(q => q.id === id);
      if (question) {
        const existingTags = question.tags || [];
        const mergedTags = [...new Set([...existingTags, ...tags])];
        try {
          updateQuestion(id, { ...question, tags: mergedTags });
          updatedCount++;
        } catch { failed++; }
      }
    });

    refresh();
    alert(failed ? `Đã thêm thẻ vào ${updatedCount} câu hỏi (${failed} lỗi — có thể đầy bộ nhớ).` : `Đã thêm thẻ vào ${updatedCount} câu hỏi`);
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
      <QuestionBankStyles />
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
        <QuestionSelectionBar
          count={pickedList.length}
          onExport={() => exportPicked(false)}
          onExportWithAnswers={() => exportPicked(true)}
          onPrint={printPicked}
          onCopy={copyPicked}
          onClear={() => setPicked({})}
        />
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
        <QuestionStatsPanel
          questionsCount={questions.length}
          visibleCount={filtered.length}
          statistics={getStatistics()}
          onClose={() => setShowStats(false)}
        />
      )}

      {showForm && (
        <QuestionEditorForm
          editId={editId}
          form={form}
          setForm={setForm}
          subjects={subjects}
          onSave={save}
          onCancel={() => {
            setShowForm(false);
            setEditId(null);
            setForm(EMPTY);
          }}
        />
      )}

      {showDraw && (
        <QuestionDrawDialog
          drawScope={drawScope}
          setDrawScope={setDrawScope}
          filtered={filtered}
          doDrawWith={doDrawWith}
          drawCount={drawCount}
          setDrawCount={setDrawCount}
          drawBal={drawBal}
          setDrawBal={setDrawBal}
          questions={questions}
          drawn={drawn}
          doDraw={doDraw}
          exportDrawn={exportDrawn}
          saveDrawnWorksheet={saveDrawnWorksheet}
          onNavigate={onNavigate}
          onClose={() => setShowDraw(false)}
        />
      )}

      {/* ── Danh sách câu hỏi dạng cards ── */}
      {filtered.length === 0 ? (
        <div className="qbx-empty">
          <Database size={38} />
          <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>{qbEmptyText}</p>
          <p style={{ margin: 0, fontSize: "0.75rem" }}>{qbEmptyHint}</p>
        </div>
      ) : (
        <div className="qbx-list">
          {filtered.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              selected={!!picked[question.id]}
              onToggle={() =>
                setPicked((current) => ({
                  ...current,
                  [question.id]: !current[question.id],
                }))
              }
              onOpen={() => setDetail(question)}
              onEdit={() => startEdit(question)}
              onDelete={() => {
                if (confirm("Xóa câu hỏi này?")) {
                  deleteQuestion(question.id);
                  refresh();
                }
              }}
            />
          ))}
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
        <QuestionDetailModal
          question={detail}
          books={books}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            startEdit(detail);
          }}
        />
      )}
    </div>
  );
}