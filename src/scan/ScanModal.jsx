// ── Scan Modal — "kéo khoanh vùng → AI đọc → chọn loại → cấu hình → AI tạo → preview → lưu" ──
// Progressive disclosure, full a11y, stepper, loading/error/retry, editable preview.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Loader2, BookOpen, FileText, Puzzle, Database, ClipboardList, StickyNote, Zap, Check, ArrowLeft, ArrowRight, RefreshCw, Save, Trash2, ChevronUp, ChevronDown, Eye, AlertTriangle, Wand2, LayoutGrid, Library, Crop, Palette, Square } from "lucide-react";
import { analyzeScan, generateMaterial, regenerateQuestion } from "./scanAIService.js";
import aiService from "../aiService.js";
import { saveScanMaterial } from "./materialGenerator.js";
import CropPreview from "./CropPreview.jsx";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { emitOpenSource } from "./sourceBadgeUtils.js";

const STEPS = [
  { label: "Quét", desc: "Vùng SGK" },
  { label: "Phân tích", desc: "AI đọc" },
  { label: "Chọn loại", desc: "5 dạng" },
  { label: "Cấu hình", desc: "Tùy chỉnh" },
  { label: "Xem trước", desc: "Duyệt & lưu" },
];

const MATERIAL_CARDS = [
  { id: "original", icon: <BookOpen size={18} />, label: "Nguyên bản", desc: "Giữ câu hỏi/bài gốc", color: "#0f766e" },
  { id: "game", icon: <Puzzle size={18} />, label: "Trò chơi", desc: "Ghép đôi, Quiz, Kahoot", color: "#8b5cf6" },
  { id: "worksheet", icon: <FileText size={18} />, label: "Phiếu học tập", desc: "In & phát cho HS", color: "#2d73ff" },
  { id: "question", icon: <Database size={18} />, label: "Câu hỏi", desc: "Vào ngân hàng", color: "#16a34a" },
  { id: "activity", icon: <ClipboardList size={18} />, label: "Hoạt động", desc: "Dùng trong KHBD", color: "#f59e0b" },
  { id: "note", icon: <StickyNote size={18} />, label: "Ghi chú", desc: "Tóm tắt & lưu", color: "#64748b" },
];

export default function ScanModal({ scan, onClose, onSaved }) {
  const [step, setStep] = useState(1); // 1: phân tích (scan đã có) — 1-indexed for STEPS
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState("");
  const [materialType, setMaterialType] = useState(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [config, setConfig] = useState({
    numQuestions: 8,
    difficulty: "Trung bình",
    questionType: "Trắc nghiệm",
    level: "Hiểu",
    withAnswer: true,
    gameType: "Quiz",
    audience: "Cá nhân",
    timeLimit: "5 phút",
    randomizeAnswers: false,
    fidelity: "Giữ nguyên gốc",
    keepOriginal: true,
    phase: "luyenTap",
    duration: "15 phút",
    teacherInstruction: "",
  });
  const [generated, setGenerated] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [regenIdx, setRegenIdx] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchTypes, setBatchTypes] = useState([]);
  const [savedInfo, setSavedInfo] = useState(null);
  const [collPick, setCollPick] = useState("");
  const [newCollName, setNewCollName] = useState("");
  const [collOptions, setCollOptions] = useState([]);
  const [showCropPreview, setShowCropPreview] = useState(false);
  const [adjustedScan, setAdjustedScan] = useState(null);
  const [analysisEdit, setAnalysisEdit] = useState(""); // tinh tế: cho GV tinh chỉnh trích dẫn trước khi tạo
  const [analysisEditOpen, setAnalysisEditOpen] = useState(false);
  const overlayRef = useRef(null);
  const closeBtnRef = useRef(null);

  // Dừng AI của màn hình quét — scanAIService cấp requestId bắt đầu bằng "scan-"
  const stopScanAi = () => {
    try { aiService.cancelRequestsByPrefix("scan-"); } catch {}
  };

  // Đóng modal khi đang chạy → hủy hết request "scan-" (không chạy nền tốn token,
  // không còn setState sau unmount / trùng request khi mở lại)
  useEffect(() => {
    return () => { try { aiService.cancelRequestsByPrefix("scan-"); } catch {} };
  }, []);

  useEffect(() => {
    if (!savedInfo) return;
    try {
      import("../researchDB.js").then((m) => { try { setCollOptions(m.getCollections().slice(0, 12)); } catch {} });
    } catch {}
  }, [savedInfo]);

  // ESC + focus trap
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    // focus close button for a11y
    setTimeout(() => closeBtnRef.current?.focus(), 80);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Step 1: auto analyze
  useEffect(() => {
    if (step === 1 && scan && !analysis && !loading) {
      runAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scan]);

  const runAnalyze = useCallback(async () => {
    setLoading(true); setLoadingLabel("✨ AI đang đọc vùng SGK…"); setError("");
    try {
      const a = await analyzeScan(adjustedScan || scan);
      setAnalysis(a);
      setAnalysisEdit(a?.content || "");
      setAnalysisEditOpen(false);
      setStep(2);
    } catch (e) {
      setError(e?.code === "CANCELLED" ? "Đã dừng phân tích." : e.message || "AI phân tích lỗi");
    } finally { setLoading(false); setLoadingLabel(""); }
  }, [scan, adjustedScan]);

  const handleGenerate = async () => {
    if (!materialType) { setError("Hãy chọn loại học liệu trước."); return; }
    setLoading(true); setLoadingLabel(materialType === "original" ? "📖 AI đang giữ nguyên câu hỏi/bài tập gốc…" : materialType === "game" ? "🎮 AI đang thiết kế trò chơi…" : materialType === "worksheet" ? "📝 AI đang soạn phiếu…" : materialType === "question" ? "🧠 AI đang tạo câu hỏi…" : materialType === "activity" ? "📚 AI đang soạn hoạt động…" : "✨ AI đang tóm tắt ghi chú…");
    setError("");
    try {
      const scanToUse = adjustedScan || scan;
      // tinh tế: dùng bản analysis đã tinh chỉnh (nếu GV sửa) thay vì raw
      const effectiveAnalysis = analysis ? { ...analysis, content: (analysisEdit?.trim() || analysis.content) } : analysis;
      const gen = await generateMaterial({ scan: { ...scanToUse, analysis: effectiveAnalysis }, analysis: effectiveAnalysis, materialType, config });
      setGenerated(gen);
      const t = gen?.parsed?.title || gen?.parsed?.name || "";
      setEditTitle(t);
      setStep(4);
    } catch (e) { setError(e?.code === "CANCELLED" ? "Đã dừng tạo học liệu." : e.message || "AI tạo lỗi"); } finally { setLoading(false); setLoadingLabel(""); }
  };

  const handleRegenerateOne = async (idx) => {
    const qs = generated?.parsed?.questions;
    if (!Array.isArray(qs) || !qs[idx]) return;
    setRegenIdx(idx);
    try {
      const scanToUse = adjustedScan || scan;
      const fresh = await regenerateQuestion({ scan: { ...scanToUse, analysis }, analysis, materialType, config, existingQuestion: qs[idx], index: idx });
      const nextQs = [...qs];
      // merge fresh into shape
      const mapped = {
        q: fresh.q || fresh.question || nextQs[idx].q || nextQs[idx].question,
        question: fresh.question || fresh.q || nextQs[idx].question || nextQs[idx].q,
        type: fresh.type || nextQs[idx].type || "mc",
        options: Array.isArray(fresh.options) ? fresh.options : nextQs[idx].options,
        answer: typeof fresh.answer !== "undefined" ? fresh.answer : (typeof fresh.correctIndex !== "undefined" ? fresh.correctIndex : nextQs[idx].answer),
        correctIndex: typeof fresh.correctIndex !== "undefined" ? fresh.correctIndex : (typeof fresh.answer === "number" ? fresh.answer : nextQs[idx].correctIndex),
        explanation: fresh.explanation || nextQs[idx].explanation || "",
        mucdo: fresh.mucdo || nextQs[idx].mucdo || config.level,
      };
      nextQs[idx] = mapped;
      setGenerated({ ...generated, parsed: { ...generated.parsed, questions: nextQs } });
    } catch (e) { setError(e?.code === "CANCELLED" ? "Đã dừng." : e.message || "Tạo lại câu hỏi lỗi"); } finally { setRegenIdx(null); }
  };

  const moveQuestion = (idx, dir) => {
    const qs = [...(generated?.parsed?.questions || [])];
    const j = idx + dir;
    if (j < 0 || j >= qs.length) return;
    const tmp = qs[idx]; qs[idx] = qs[j]; qs[j] = tmp;
    setGenerated({ ...generated, parsed: { ...generated.parsed, questions: qs } });
  };
  const deleteQuestion = (idx) => {
    const qs = [...(generated?.parsed?.questions || [])];
    qs.splice(idx, 1);
    setGenerated({ ...generated, parsed: { ...generated.parsed, questions: qs } });
  };
  const addQuestionManual = () => {
    const qs = [...(generated?.parsed?.questions || [])];
    qs.push({ q: "Câu hỏi mới — hãy sửa nội dung", question: "Câu hỏi mới — hãy sửa nội dung", type: "mc", options: ["A", "B", "C", "D"], answer: 0, correctIndex: 0 });
    setGenerated({ ...generated, parsed: { ...generated.parsed, questions: qs } });
  };
  const updateQuestionText = (idx, field, val) => {
    const qs = [...(generated?.parsed?.questions || [])];
    qs[idx] = { ...qs[idx], [field]: val };
    // keep q/question in sync
    if (field === "q") qs[idx].question = val;
    if (field === "question") qs[idx].q = val;
    setGenerated({ ...generated, parsed: { ...generated.parsed, questions: qs } });
  };
  const updateOption = (qIdx, optIdx, val) => {
    const qs = [...(generated?.parsed?.questions || [])];
    const opts = [...(qs[qIdx].options || ["", "", "", ""])];
    opts[optIdx] = val;
    qs[qIdx] = { ...qs[qIdx], options: opts };
    setGenerated({ ...generated, parsed: { ...generated.parsed, questions: qs } });
  };

  const handleSave = async () => {
    if (!generated && materialType !== "note" && materialType !== "clip") {
      if (!analysis) { setError("Chưa có phân tích để lưu."); return; }
    }
    setLoading(true); setLoadingLabel("💾 Đang lưu vào kho…"); setError("");
    try {
      let genForSave = generated;
      if (generated?.parsed && editTitle.trim()) {
        genForSave = { ...generated, parsed: { ...generated.parsed, title: editTitle.trim(), name: editTitle.trim() } };
      }
      const scanToUse = adjustedScan || scan;
      const saved = await saveScanMaterial({ scan: { ...scanToUse, analysis }, analysis, generated: genForSave, materialType });
      try {
        const { saveScanWithAnalysis } = await import("./scanStore.js");
        await saveScanWithAnalysis({ ...scanToUse, analysis, id: scanToUse.id }, analysis, materialType, genForSave);
        try { appEvents.emit(AppEvents.SCAN_SAVED); } catch {}
      } catch {}
      const info = { type: materialType, saved, analysis, scan: scanToUse, generated: genForSave?.parsed || null };
      setSavedInfo(info);
      onSaved?.(info);
      // keep modal open to show success actions per §18 — do not auto-close
    } catch (e) { setError(e.message || "Lưu thất bại"); } finally { setLoading(false); setLoadingLabel(""); }
  };

  const handleSaveAllBatch = async () => {
    const types = batchTypes.length ? batchTypes : [materialType].filter(Boolean);
    if (!types.length) { setError("Chọn ít nhất 1 loại để tạo bộ."); return; }
    if (!analysis) { setError("Chưa có phân tích."); return; }
    setLoading(true); setLoadingLabel("✨ Đang tạo bộ học liệu…"); setError("");
    try {
      const scanToUse = adjustedScan || scan;
      const effectiveAnalysis = analysis ? { ...analysis, content: (analysisEdit?.trim() || analysis.content) } : analysis;
      const results = [];
      for (const t of types) {
        const gen = await generateMaterial({ scan: { ...scanToUse, analysis: effectiveAnalysis }, analysis: effectiveAnalysis, materialType: t, config });
        const withTitle = gen?.parsed?.title || gen?.parsed?.name ? gen : { ...gen, parsed: { ...gen.parsed, title: gen?.parsed?.title || `Bộ ${t} — ${scanToUse.book.title}` } };
        const saved = await saveScanMaterial({ scan: { ...scanToUse, analysis: effectiveAnalysis }, analysis: effectiveAnalysis, generated: withTitle, materialType: t });
        results.push({ type: t, saved, parsed: withTitle.parsed });
      }
      try {
        const { saveScanWithAnalysis } = await import("./scanStore.js");
        await saveScanWithAnalysis({ ...scanToUse, analysis, id: scanToUse.id }, analysis, types.join(","), { parsed: { title: `Bộ ${types.length} học liệu`, count: results.length } });
        try { appEvents.emit(AppEvents.SCAN_SAVED); } catch {}
      } catch {}
      onSaved?.({ type: "batch", batch: results, analysis, scan: scanToUse });
      setSavedInfo({ type: "batch", batch: results, analysis, scan: scanToUse });
    } catch (e) { setError(e?.code === "CANCELLED" ? "Đã dừng tạo bộ." : e.message || "Tạo bộ thất bại"); } finally { setLoading(false); setLoadingLabel(""); }
  };

  const handleAddToCollection = async () => {
    if (!savedInfo || !collPick) return;
    try {
      const { addClip, getCollections } = await import("../researchDB.js");
      const colls = getCollections();
      const coll = colls.find((c) => c.id === collPick);
      if (!coll) { setError("Không tìm thấy bộ sưu tập."); return; }
      const parsed = savedInfo.generated || {};
      const text = (parsed.content || parsed.summary || analysis?.content || scan.book.title || "").slice(0, 6000);
      await addClip({ collId: coll.id, file: scan.book.filename, bookTitle: scan.book.title, grade: scan.book.grade, subject: scan.book.subject, page: scan.page, text: `${parsed.title || parsed.name || "Học liệu từ scan"}\n\n${text}`, chapter: analysis?.topic || "" });
      try { appEvents.emit(AppEvents.SCAN_SAVED); } catch {}
      alert(`Đã thêm vào bộ sưu tập "${coll.name}"`);
    } catch (e) { setError(e.message || "Thêm vào bộ sưu tập thất bại"); }
  };

  const handleCreateCollection = async () => {
    const name = newCollName.trim();
    if (!name) return;
    try {
      const { addCollection, getCollections } = await import("../researchDB.js");
      const c = addCollection(name, "Tạo từ Scan SGK");
      const fresh = getCollections().slice(0, 12);
      setCollOptions(fresh);
      setCollPick(c.id);
      setNewCollName("");
      try { appEvents.emit(AppEvents.SCAN_SAVED); } catch {}
    } catch (e) { setError(e.message || "Tạo bộ sưu tập thất bại"); }
  };

  const handleSendToWhiteboard = async () => {
    const scanToUse = adjustedScan || scan;
    const text = (analysisEdit?.trim() || analysis?.content || generated?.parsed?.title || "").slice(0, 1200);
    const title = generated?.parsed?.title || generated?.parsed?.name || analysis?.topic || `Scan ${scan.book.title} — tr.${scan.page}`;
    try {
      const { sendScanToBoard } = await import("../whiteboard/whiteboardIntegration.js");
      sendScanToBoard({ scan: scanToUse, analysisText: text, title });
      // thông báo nhẹ
      setError("");
      // dùng alert nhẹ
      try { appEvents.emit(AppEvents.SCAN_SAVED); } catch {}
      alert("Đã đưa ảnh + trích dẫn vào Bảng trắng — mở Whiteboard để xem & bấm “Mở sách” để quay lại trang nguồn.");
    } catch (e) { setError(e.message || "Đưa vào Whiteboard thất bại"); }
  };

  const handleQuickGenerate = () => {
    const suggested = analysis?.suggestedMaterials?.[0] || "worksheet";
    setMaterialType(suggested);
    setTimeout(() => {
      setLoading(true); setLoadingLabel("⚡ AI đang tạo nhanh…");
      const scanToUse = adjustedScan || scan;
      const effectiveAnalysis = analysis ? { ...analysis, content: (analysisEdit?.trim() || analysis.content) } : analysis;
      generateMaterial({ scan: { ...scanToUse, analysis: effectiveAnalysis }, analysis: effectiveAnalysis, materialType: suggested, config })
        .then((gen) => { setGenerated(gen); setEditTitle(gen?.parsed?.title || gen?.parsed?.name || ""); setStep(4); setMaterialType(suggested); })
        .catch((e) => setError(e?.code === "CANCELLED" ? "Đã dừng." : e.message))
        .finally(() => setLoading(false));
    }, 80);
  };

  const canGoConfig = !!materialType;
  const questions = generated?.parsed?.questions || [];
  const isNoteOrActivity = materialType === "note" || materialType === "activity" || materialType === "game" || materialType === "original";
  const originalQuestions = analysis?.existingQuestions || [];

  return createPortal(
    <>
    <div
      className="modal-overlay scanm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Tạo học liệu từ vùng SGK"
      onClick={onClose}
      ref={overlayRef}
      style={{ zIndex: "var(--z-scan)", position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        className="modal-content scanm-shell"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(1180px, calc(100vw - 20px))",
          width: "min(1180px, calc(100vw - 20px))",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 16,
          containerType: "inline-size",
        }}
      >
        <style>{`
          /* Modal scan luôn rộng trên desktop, gọn trong viewport mobile */
          .modal-overlay .modal-content.scanm-shell {
            width: min(1180px, calc(100vw - 20px));
            max-width: min(1180px, calc(100vw - 20px));
            margin: 0 auto;
            padding: 0;
          }
          /* Mặc định (modal hẹp / mobile): 1 cột */
          .scanm-shell .scanm-body { display:flex; flex-direction:column; gap:12px; }
          .scanm-shell .scanm-left, .scanm-shell .scanm-right { min-width:0; max-width:100%; }
          .scanm-shell .scanm-right > * { min-width:0; }
          .scanm-shell .scanm-right pre, .scanm-shell .scanm-right textarea {
            white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere; max-width:100%;
          }
          .scanm-shell .scanm-stepper { display:flex; align-items:flex-start; padding:12px 18px 10px; border-bottom:1px solid var(--border-color); background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%); overflow-x:auto; scrollbar-width:thin; }
          .scanm-shell .scanm-step { flex:1 1 0; min-width:102px; position:relative; display:flex; flex-direction:column; align-items:center; gap:5px; background:none; border:none; padding:0; }
          .scanm-shell .scanm-step:not(:disabled) { cursor:pointer; }
          .scanm-shell .scanm-step:disabled { cursor:default; }
          .scanm-shell .scanm-step::before { content:""; position:absolute; top:12px; left:calc(-50% + 17px); right:calc(50% + 17px); height:2px; border-radius:999px; background:#e2e8f0; }
          .scanm-shell .scanm-step:first-child::before { display:none; }
          .scanm-shell .scanm-step.done::before { background:#16a34a; }
          .scanm-shell .scanm-step.on::before { background:linear-gradient(90deg,#16a34a,var(--color-action, #2d73ff)); }
          .scanm-shell .scanm-dot { width:25px; height:25px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; background:#cbd5e1; color:#fff; position:relative; z-index:1; border:2px solid #fff; box-shadow:0 1px 3px rgba(15,23,42,0.16); }
          .scanm-shell .scanm-step.done .scanm-dot { background:#16a34a; }
          .scanm-shell .scanm-step.on .scanm-dot { background:var(--color-action, #2d73ff); box-shadow:0 0 0 4px var(--color-action-soft, rgba(45,115,255,0.18)), 0 2px 8px color-mix(in srgb, var(--color-action, #2d73ff) 38%, transparent); }
          .scanm-shell .scanm-step:not(:disabled):hover .scanm-dot { filter:brightness(1.08); }
          .scanm-shell .scanm-step-tx { display:flex; flex-direction:column; align-items:center; line-height:1.25; }
          .scanm-shell .scanm-step-label { font-size:11.5px; font-weight:700; color:#94a3b8; white-space:nowrap; }
          .scanm-shell .scanm-step.done .scanm-step-label { color:#16a34a; }
          .scanm-shell .scanm-step.on .scanm-step-label { color:var(--color-action-strong, #1d4ed8); font-weight:800; }
          .scanm-shell .scanm-step-desc { font-size:9.5px; color:#94a3b8; font-weight:500; white-space:nowrap; }
          .scanm-shell .scanm-step.on .scanm-step-desc { color:#64748b; }
          /* Modal đủ rộng (container ≥ 860px): 2 cột desktop */
          @container (min-width: 860px) {
            .scanm-shell .scanm-body { display:grid !important; grid-template-columns: minmax(300px, 380px) minmax(0,1fr); gap:14px; align-items:start; }
            .scanm-shell .scanm-left { position:sticky; top:0; }
            .scanm-shell .scanm-img { max-height:46vh !important; }
            .scanm-shell .scanm-cards { grid-template-columns: repeat(3, minmax(0,1fr)) !important; }
          }
        `}</style>
        {/* Header — tinh tế: gradient nhẹ + subtitle rõ */}
        <div className="modal-header" style={{ flexShrink: 0, background:"linear-gradient(135deg, rgba(45,115,255,0.08) 0%, rgba(139,92,246,0.06) 100%)", borderBottom:"1px solid var(--border-color)", padding:"12px 14px" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 9, margin: 0, fontSize: "0.98rem", letterSpacing:-0.1 }}>
            <span style={{ width:28, height:28, borderRadius:9, background:"#2d73ff", color:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(45,115,255,0.25)" }}><BookOpen size={15} /></span>
            Tạo học liệu từ vùng SGK
            <span style={{ fontSize:11, fontWeight:700, color:"#64748b", background:"rgba(255,255,255,0.85)", border:"1px solid #e2e8f0", padding:"2px 7px", borderRadius:999, marginLeft:6 }}>kéo · AI đọc · tạo</span>
          </h3>
          <button ref={closeBtnRef} className="btn btn-icon" onClick={onClose} aria-label="Đóng (Esc)" style={{ width:32, height:32, borderRadius:999, background:"rgba(255,255,255,0.9)", border:"1px solid #e2e8f0" }}>
            <X size={15} />
          </button>
        </div>

        {/* Stepper — 5 bước: dot căn giữa + nối liền mạch */}
        <div className="scanm-stepper" role="list" aria-label="Tiến trình tạo học liệu">
          {STEPS.map((s, i) => {
            const idx = i + 1;
            const active = step === idx;
            const done = step > idx;
            const clickable = idx <= step && !(idx === 4 && !materialType);
            return (
              <button
                key={s.label}
                role="listitem"
                onClick={() => clickable && setStep(idx)}
                disabled={!clickable}
                aria-current={active ? "step" : undefined}
                title={s.desc}
                className={`scanm-step${active ? " on" : ""}${done ? " done" : ""}`}
              >
                <span className="scanm-dot">{done ? <Check size={13} strokeWidth={3} /> : idx}</span>
                <span className="scanm-step-tx">
                  <span className="scanm-step-label">{s.label}</span>
                  <span className="scanm-step-desc">{s.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Body — desktop 2 cột: trái ảnh + nguồn, phải thao tác */}
        <div className="modal-body scanm-body" style={{ flex: 1, overflow: "auto", gap: 12, padding: 14 }}>
          <div className="scanm-left" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          {/* Preview ảnh */}
          <div style={{
            textAlign: "center",
            background: "var(--surface-soft)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: imageExpanded ? 16 : 10,
            position: "relative"
          }}>
            <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
              <img
                src={adjustedScan?.dataUrl || scan.dataUrl}
                alt="Vùng SGK đã quét"
                className="scanm-img"
                style={{
                  maxWidth: imageExpanded ? "100%" : "100%",
                  maxHeight: imageExpanded ? "70vh" : 200,
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  objectFit: "contain",
                  cursor: imageExpanded ? "zoom-out" : "zoom-in",
                  transition: "max-height 0.3s ease"
                }}
                onClick={() => setImageExpanded(!imageExpanded)}
                title={imageExpanded ? "Thu nhỏ" : "Phóng to để xem rõ"}
              />
              <button
                onClick={() => setImageExpanded(!imageExpanded)}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  backdropFilter: "blur(4px)"
                }}
                title={imageExpanded ? "Thu nhỏ" : "Phóng to"}
              >
                {imageExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                {imageExpanded ? "Thu nhỏ" : "Phóng to"}
              </button>
              <button
                onClick={() => setShowCropPreview(true)}
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  background: "color-mix(in srgb, var(--color-action, #2d73ff) 82%, transparent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  backdropFilter: "blur(4px)"
                }}
                title="Điều chỉnh vùng crop"
              >
                <Crop size={14} />
                Crop
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><BookOpen size={11} /> {scan.book.title}</span>
              <span>• Trang {scan.page}</span>
              <span>• {Math.round(adjustedScan?.width || scan.width || 0)}×{Math.round(adjustedScan?.height || scan.height || 0)}px</span>
              {adjustedScan && <span style={{ color: "var(--success)", fontWeight: 700 }}>• Đã điều chỉnh</span>}
              {analysis?.topic && <span style={{ color: "var(--primary)", fontWeight: 700 }}>• {analysis.topic}</span>}
            </p>
          </div>

          {/* Cột trái — Câu hỏi / bài tập gốc giữ nguyên từ sách */}
          <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: "#0f766e", display: "flex", alignItems: "center", gap: 6 }}>
              <BookOpen size={13} /> Câu hỏi · bài tập gốc trong sách
              <span style={{ marginLeft: "auto", fontSize: 10, background: "#0f766e", color: "#fff", padding: "2px 7px", borderRadius: 999 }}>giữ nguyên</span>
            </div>
            {!analysis ? (
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>AI đang đọc vùng crop — câu gốc sẽ hiện nguyên văn tại đây, không diễn đạt lại.</div>
            ) : originalQuestions.length ? (
              <ol style={{ margin: "8px 0 0 16px", padding: 0, fontSize: 12, color: "#134e4a", display: "flex", flexDirection: "column", gap: 6 }}>
                {originalQuestions.slice(0, 8).map((q, i) => (
                  <li key={i} style={{ background: "#fff", border: "1px solid #ccfbf1", borderRadius: 8, padding: "6px 8px", lineHeight: 1.5 }}>{q}</li>
                ))}
              </ol>
            ) : (
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>Vùng này không chứa câu hỏi riêng — AI giữ nguyên đoạn trích/bảng/sơ đồ làm nguồn.</div>
            )}
            <div style={{ fontSize: 10.5, color: "#0f766e", marginTop: 8 }}>✓ Khi tạo phiếu/câu hỏi ở chế độ “Giữ nguyên gốc”, các câu trên được sao chép nguyên văn lên đầu, AI chỉ bổ sung thêm.</div>
          </div>
          </div>{/* /scanm-left */}

          <div className="scanm-right" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

          {(loading || regenIdx !== null) && (
            <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: 12, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: 10 }}>
              <Loader2 size={18} className="aia-spin-svg" style={{ animation: "spin 0.9s linear infinite" }} /> <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{regenIdx !== null ? "🧠 AI đang tạo lại câu hỏi…" : (loadingLabel || "Đang xử lý…")}</span>
              <button className="btn btn-danger btn-xs" style={{ marginLeft: "auto", flexShrink: 0 }} onClick={stopScanAi} title="Dừng AI" aria-label="Dừng AI"><Square size={11} fill="currentColor" /> Dừng</button>
            </div>
          )}
          {error && (
            <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: "var(--danger-light)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
              <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{error}</span>
              <button className="btn btn-ghost btn-xs" onClick={() => { setError(""); if (step === 1) runAnalyze(); }} style={{ flexShrink: 0 }}><RefreshCw size={12} /> Thử lại</button>
            </div>
          )}

          {/* Step 1: Phân tích (auto) */}
          {step === 1 && !loading && !error && (
            <div style={{ textAlign: "center", padding: "12px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              <Sparkles size={16} style={{ display: "inline-block" }} /> Đang phân tích vùng SGK…
            </div>
          )}

          {/* Step 2: Chọn loại — tinh tế */}
          {step === 2 && analysis && !loading && (
            <>
              <div style={{ background:"var(--surface)", border: "1px solid var(--border-color)", borderRadius: 12, padding: 12, boxShadow:"var(--shadow-xs)" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width:22, height:22, borderRadius:7, background:"var(--color-action, var(--primary))", color:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Eye size={13} /></span> AI phân tích <span style={{ marginLeft:"auto", fontSize:10, fontWeight:800, color: analysis.confidence < 0.6 ? "var(--warning-deep)" : "var(--success-deep)", background: analysis.confidence < 0.6 ? "var(--warning-soft)" : "var(--success-soft)", border:"1px solid var(--border-color)", padding:"2px 7px", borderRadius:999 }}>{(analysis.confidence * 100).toFixed(0)}% tin cậy</span></div>
                <div style={{ fontSize: 11.5, marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ background:"var(--color-action-soft, var(--primary-light))", color:"var(--color-action, var(--primary))", border:"1px solid var(--border-color)", padding:"2px 7px", borderRadius:999, fontWeight:700 }}>📚 {analysis.subject || scan.book.subject} • Lớp {analysis.grade || scan.book.grade}</span>
                  {analysis.topic && <span style={{ background:"var(--surface-soft)", color:"var(--text-mid)", border:"1px solid var(--border-color)", padding:"2px 7px", borderRadius:999, fontWeight:700 }}>🏷️ {analysis.topic}</span>}
                </div>
                {/* tinh chỉnh trích dẫn — editable */}
                {!analysisEditOpen ? (
                  <>
                    <div style={{ fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#334155", background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:8 }}>{analysisEdit?.slice(0, 520) || analysis.content?.slice(0,520)}{(analysisEdit || analysis.content || "").length > 520 ? "…" : ""}</div>
                    <button className="btn btn-ghost btn-xs" onClick={()=>setAnalysisEditOpen(true)} style={{ marginTop:6, fontSize:11, borderRadius:999, border:"1px dashed #cbd5e1" }}><Wand2 size={12} /> Tinh chỉnh trích dẫn</button>
                  </>
                ) : (
                  <div style={{ marginTop:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#475569", marginBottom:4 }}>Tinh chỉnh nội dung AI sẽ dùng để tạo (không đổi ảnh gốc)</div>
                    <textarea className="form-control" rows={4} value={analysisEdit} onChange={(e)=>setAnalysisEdit(e.target.value)} placeholder="Sửa/trích chính xác nội dung SGK để AI bám sát hơn…" style={{ fontSize:12, lineHeight:1.5 }} />
                    <div style={{ display:"flex", gap:6, marginTop:6 }}>
                      <button className="btn btn-primary btn-xs" onClick={()=>setAnalysisEditOpen(false)} style={{ borderRadius:999 }}>Xong</button>
                      <button className="btn btn-ghost btn-xs" onClick={()=>{ setAnalysisEdit(analysis.content||""); setAnalysisEditOpen(false); }} style={{ borderRadius:999 }}>Hoàn tác</button>
                      <span style={{ fontSize:10, color:"#64748b", marginLeft:"auto", alignSelf:"center" }}>{analysisEdit.length} ký tự → AI sẽ dùng {Math.min(700, analysisEdit.length)} đầu</span>
                    </div>
                  </div>
                )}
                {analysis.keyPoints?.length > 0 && (
                  <ul style={{ margin: "8px 0 0 16px", fontSize: 11, color: "#475569" }}>
                    {analysis.keyPoints.slice(0, 3).map((k, i) => <li key={i}>{k}</li>)}
                  </ul>
                )}
                {analysis.existingQuestions?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 8px" }}><strong>Câu có sẵn:</strong> {analysis.existingQuestions.slice(0, 2).join(" | ").slice(0, 180)}</div>
                )}
                {analysis.confidence < 0.6 && <div style={{ fontSize: 11, color: "#b45309", marginTop: 8, display: "flex", gap: 6, background:"#fffbeb", border:"1px solid #fde68a", padding:"6px 8px", borderRadius:8 }}><AlertTriangle size={12} /> AI chưa chắc chắn — vui lòng tinh chỉnh trích dẫn rồi mới tạo.</div>}
              </div>

              <div className="scanm-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 8 }}>
                {MATERIAL_CARDS.map((c) => {
                  const isSelected = materialType === c.id;
                  const isSuggested = analysis.suggestedMaterials?.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      className={`btn ${isSelected ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => { setMaterialType(c.id); if (c.id === "original") setConfig((p) => ({ ...p, fidelity: "Giữ nguyên gốc", keepOriginal: true })); }}
                      aria-pressed={isSelected}
                      style={{
                        flexDirection: "column", padding: 10, height: 92, position: "relative",
                        borderColor: isSelected ? c.color : isSuggested ? c.color : undefined,
                        background: isSelected ? c.color : undefined,
                        color: isSelected ? "#fff" : undefined,
                      }}
                      title={c.id === "original" ? "Sao chép nguyên văn câu hỏi/bài tập trong vùng crop, không diễn đạt lại" : c.desc}
                    >
                      {isSuggested && !isSelected && <span style={{ position: "absolute", top: 4, right: 6, fontSize: 9, background: c.color, color: "#fff", padding: "1px 5px", borderRadius: 99, fontWeight: 800 }}>★ Gợi ý</span>}
                      {c.id === "original" && !isSelected && <span style={{ position: "absolute", top: 4, right: 6, fontSize: 9, background: "#0f766e", color: "#fff", padding: "1px 5px", borderRadius: 99, fontWeight: 800 }}>giữ gốc</span>}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{c.icon} <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{c.label}</span></span>
                      <span style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>{c.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!materialType} aria-disabled={!materialType}>
                  Cấu hình <ArrowRight size={14} />
                </button>
                <button className="btn btn-ghost" onClick={handleQuickGenerate} disabled={loading}>
                  <Zap size={14} /> Tạo nhanh (AI tự chọn)
                </button>
              </div>
              {analysis.suggestedMaterials?.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>⭐ AI đề xuất: {analysis.suggestedMaterials.join(", ")}</div>
              )}

              {/* §26 Multi-generation — one scan → many materials */}
              <div style={{ border: "1px dashed var(--border-color)", borderRadius: 10, padding: 10, background: "var(--surface)" }}>
                <div style={{ fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><LayoutGrid size={14} /> ✨ Tạo bộ học liệu (1 scan → nhiều loại)</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 6px" }}>Chọn nhiều loại — AI tạo lần lượt, lưu tất cả (không nhân bản ảnh)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {MATERIAL_CARDS.map((c) => (
                    <label key={`batch-${c.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, border: "1px solid var(--border-color)", padding: "4px 8px", borderRadius: 99, background: batchTypes.includes(c.id) ? "var(--primary-light)" : "var(--surface-soft)", cursor: "pointer" }}>
                      <input type="checkbox" checked={batchTypes.includes(c.id)} onChange={(e) => setBatchTypes((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))} style={{ accentColor: "var(--primary)" }} /> {c.label}
                    </label>
                  ))}
                </div>
                <button className="btn btn-secondary btn-xs" style={{ marginTop: 8 }} onClick={handleSaveAllBatch} disabled={loading || (!batchTypes.length && !materialType)}><Sparkles size={12} /> Tạo & lưu bộ ({batchTypes.length || (materialType ? 1 : 0)})</button>
              </div>
            </>
          )}

          {/* Step 3: Cấu hình */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Wand2 size={14} /> Cấu hình — {MATERIAL_CARDS.find((c)=>c.id===materialType)?.label || materialType}</h4>
              {/* core */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Bám nguồn
                  <select className="form-control" value={config.fidelity} onChange={(e)=>setConfig({...config, fidelity: e.target.value, keepOriginal: e.target.value === "Giữ nguyên gốc" ? true : config.keepOriginal})} style={{ minWidth: 150 }}>
                    <option>Giữ nguyên gốc</option><option>Bám sát SGK</option><option>Biến đổi nhẹ</option><option>Sáng tạo mở rộng</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18, background: config.keepOriginal ? "#f0fdfa" : "#fff", border: config.keepOriginal ? "1px solid #99f6e4" : "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 999, cursor: "pointer", fontWeight: 700, color: config.keepOriginal ? "#0f766e" : "#475569" }} title="Giữ nguyên văn câu hỏi/bài tập trong sách, AI không diễn đạt lại">
                  <input type="checkbox" checked={!!config.keepOriginal} onChange={(e)=>setConfig({...config, keepOriginal: e.target.checked, fidelity: e.target.checked ? "Giữ nguyên gốc" : (config.fidelity === "Giữ nguyên gốc" ? "Bám sát SGK" : config.fidelity)})} style={{ accentColor: "#0f766e" }} /> Giữ nguyên câu hỏi/bài tập
                </label>
                {(materialType === "game" || materialType === "worksheet" || materialType === "question") && (
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Số câu
                    <select className="form-control" value={config.numQuestions} onChange={(e)=>setConfig({...config, numQuestions: Number(e.target.value)})} style={{ minWidth: 90 }}>
                      <option value={5}>5</option><option value={8}>8</option><option value={10}>10</option><option value={15}>15</option><option value={20}>20</option>
                    </select>
                  </label>
                )}
                {(materialType === "game" || materialType === "worksheet" || materialType === "question") && (
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Độ khó
                    <select className="form-control" value={config.difficulty} onChange={(e)=>setConfig({...config, difficulty: e.target.value})} style={{ minWidth: 120 }}>
                      <option>Dễ</option><option>Trung bình</option><option>Khó</option><option>Phân hóa</option>
                    </select>
                  </label>
                )}
              </div>

              {materialType === "game" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Loại game
                    <select className="form-control" value={config.gameType} onChange={(e)=>setConfig({...config, gameType: e.target.value})} style={{ minWidth: 140 }}>
                      <option>Quiz</option><option>Ghép đôi</option><option>Kahoot</option><option>Ô chữ</option><option>Drag & Drop</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Thời lượng
                    <select className="form-control" value={config.timeLimit} onChange={(e)=>setConfig({...config, timeLimit: e.target.value})} style={{ minWidth: 110 }}>
                      <option>3 phút</option><option>5 phút</option><option>10 phút</option><option>15 phút</option>
                    </select>
                  </label>
                </div>
              )}
              {materialType === "worksheet" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Loại câu
                    <select className="form-control" value={config.questionType} onChange={(e)=>setConfig({...config, questionType: e.target.value})} style={{ minWidth: 130 }}>
                      <option>Trắc nghiệm</option><option>Tự luận</option><option>Hỗn hợp</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Mức độ
                    <select className="form-control" value={config.level} onChange={(e)=>setConfig({...config, level: e.target.value})} style={{ minWidth: 120 }}>
                      <option>Biết</option><option>Hiểu</option><option>Vận dụng</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18 }}>
                    <input type="checkbox" checked={config.withAnswer} onChange={(e)=>setConfig({...config, withAnswer: e.target.checked})} /> Kèm đáp án
                  </label>
                </div>
              )}
              {materialType === "question" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Loại
                    <select className="form-control" value={config.questionType} onChange={(e)=>setConfig({...config, questionType: e.target.value})} style={{ minWidth: 130 }}>
                      <option>Trắc nghiệm</option><option>Tự luận</option><option>Đúng/Sai</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Mức độ
                    <select className="form-control" value={config.level} onChange={(e)=>setConfig({...config, level: e.target.value})} style={{ minWidth: 120 }}>
                      <option>Biết</option><option>Hiểu</option><option>Vận dụng</option>
                    </select>
                  </label>
                </div>
              )}
              {materialType === "activity" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Giai đoạn KHBD
                    <select className="form-control" value={config.phase} onChange={(e)=>setConfig({...config, phase: e.target.value})} style={{ minWidth: 150 }}>
                      <option value="khoiDong">Khởi động</option><option value="khamPha">Khám phá</option><option value="luyenTap">Luyện tập</option><option value="vanDung">Vận dụng</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Thời lượng
                    <input className="form-control" value={config.duration} onChange={(e)=>setConfig({...config, duration: e.target.value})} placeholder="15 phút" style={{ minWidth: 110 }} />
                  </label>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Chỉ dẫn thêm cho AI (tùy chọn)
                  <textarea className="form-control" rows={2} value={config.teacherInstruction} onChange={(e)=>setConfig({...config, teacherInstruction: e.target.value})} placeholder="VD: Ưu tiên câu hỏi vận dụng thực tế, có 1 câu mở rộng…" style={{ resize: "vertical" }} />
                </label>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
                  {["Ưu tiên vận dụng thực tế","Thêm 1 câu mở rộng","Ngôn ngữ đơn giản cho HS yếu","Tăng độ khó 1 mức","+ 1 hoạt động nhóm"].map((chip)=>(
                    <button key={chip} onClick={()=>{
                      const cur = config.teacherInstruction || "";
                      const next = cur ? (cur.includes(chip) ? cur : cur + (cur.endsWith(" ")||cur.endsWith("\n")?"":" · ") + chip) : chip;
                      setConfig({...config, teacherInstruction: next});
                    }} style={{ fontSize:11, padding:"3px 8px", borderRadius:999, border:"1px solid var(--border-color)", background: (config.teacherInstruction||"").includes(chip) ? "var(--color-action-soft, var(--primary-light))" : "var(--surface)", color:(config.teacherInstruction||"").includes(chip) ? "var(--color-action, var(--primary))" : "var(--text-mid)", fontWeight:600, cursor:"pointer" }}>{(config.teacherInstruction||"").includes(chip) ? "✓ " : "+ "}{chip}</button>
                  ))}
                  {config.teacherInstruction && <button onClick={()=>setConfig({...config, teacherInstruction:""})} style={{ fontSize:11, padding:"3px 8px", borderRadius:999, border:"1px solid var(--danger)", background:"var(--danger-soft)", color:"var(--danger-deep)", fontWeight:700, cursor:"pointer" }}>✕ Xóa</button>}
                </div>
              </div>

              {/* §28 Advanced collapsed */}
              <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, overflow: "hidden" }}>
                <button onClick={()=>setShowAdvanced((v)=>!v)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background: showAdvanced ? "var(--surface-soft)" : "transparent", border:"none", cursor:"pointer", fontSize:12, fontWeight:700 }}>
                  <span>⚙ Tùy chỉnh nâng cao</span><span style={{ transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", display:"inline-block" }}>▾</span>
                </button>
                {showAdvanced && (
                  <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, borderTop:"1px solid var(--border-color)", background:"var(--surface-soft)" }}>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <label style={{ fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>Đối tượng
                        <select className="form-control" value={config.audience} onChange={(e)=>setConfig({...config, audience:e.target.value})} style={{ minWidth:110 }}><option>Cá nhân</option><option>Cặp đôi</option><option>Nhóm</option><option>Cả lớp</option></select>
                      </label>
                      <label style={{ fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>Xáo trộn đáp án
                        <select className="form-control" value={config.randomizeAnswers ? "on" : "off"} onChange={(e)=>setConfig({...config, randomizeAnswers: e.target.value === "on"})} style={{ minWidth:130 }}><option value="off">Giữ thứ tự sách</option><option value="on">Xáo trộn vị trí đáp án</option></select>
                      </label>
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-muted)" }}>Mặc định đã tối ưu. Chỉ mở khi cần tinh chỉnh chuyên sâu.</div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-ghost" onClick={()=>setStep(2)}><ArrowLeft size={14} /> Quay lại</button>
                <button className="btn btn-primary" onClick={handleGenerate} disabled={loading} aria-busy={loading}><Sparkles size={14} /> AI tạo {MATERIAL_CARDS.find((c)=>c.id===materialType)?.label || ""}</button>
              </div>
            </div>
          )}

          {/* Step 4: Xem trước — editable */}
          {step === 4 && generated && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="gl-chip" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>📷 {scan.book.title} • Trang {scan.page} • {materialType} • {questions.length || generated.parsed?.questions?.length || 0} mục</span>
                {(config.keepOriginal || materialType === "original") && <span className="gl-chip" style={{ background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4" }}>📖 Giữ nguyên gốc</span>}
                {generated.parsed?.title || generated.parsed?.name ? null : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>(chưa có tiêu đề — hãy đặt bên dưới)</span>}
              </div>

              {/* Đối chiếu nguyên bản SGK — luôn hiện để GV kiểm tra */}
              {originalQuestions.length > 0 && (
                <details open={materialType === "original"} style={{ border: "1px solid #99f6e4", borderRadius: 8, background: "#f0fdfa", padding: "8px 10px" }}>
                  <summary style={{ fontSize: 12, fontWeight: 800, color: "#0f766e", cursor: "pointer" }}>📖 Nguyên bản trong sách ({originalQuestions.length} câu) — bấm để {materialType === "original" ? "thu gọn" : "đối chiếu"}</summary>
                  <ol style={{ margin: "8px 0 0 16px", fontSize: 12, color: "#134e4a", display: "flex", flexDirection: "column", gap: 4 }}>
                    {originalQuestions.slice(0, 10).map((q, i) => <li key={i} style={{ lineHeight: 1.5 }}>{q}</li>)}
                  </ol>
                </details>
              )}
              <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>Tiêu đề (có thể sửa)
                <input className="form-control" value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} placeholder="Tiêu đề học liệu" style={{ fontWeight: 700 }} aria-label="Tiêu đề học liệu" />
              </label>

              {/* Note / Activity preview */}
              {isNoteOrActivity && !questions.length && (
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: 10, background: "var(--surface-soft)", display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto" }}>
                  {generated.parsed?.summary && <div style={{ fontSize: 12 }}><strong>Tóm tắt:</strong> {generated.parsed.summary}</div>}
                  {generated.parsed?.content && <div style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "var(--surface)", border: "1px solid var(--border-color)", borderRadius: 6, padding: 8 }}>{generated.parsed.content}</div>}
                  {Array.isArray(generated.parsed?.keyPoints) && generated.parsed.keyPoints.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>{generated.parsed.keyPoints.map((k,i)=><li key={i}>{k}</li>)}</ul>
                  )}
                  {generated.parsed?.steps && <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(generated.parsed.steps, null, 2).slice(0, 800)}</div>}
                  {!generated.parsed?.content && !generated.parsed?.summary && !generated.parsed?.keyPoints && (
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: 0 }}>{JSON.stringify(generated.parsed || generated.raw, null, 2).slice(0, 1200)}</pre>
                  )}
                </div>
              )}

              {/* Questions list (game/worksheet/question) */}
              {questions.length > 0 && (
                <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: 8, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflow: "auto" }}>
                  {questions.slice(0, 30).map((q, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--surface-soft)", padding: 8, borderRadius: 8, border: "1px solid var(--border-color)" }}>
                      <span style={{ fontWeight: 800, fontSize: 12, minWidth: 26, textAlign: "center", paddingTop: 2, background: "var(--primary-light)", borderRadius: 6 }}>#{idx + 1}</span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        {(q.origin === "sgk_original" || q.keepOriginal) && <span style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 800, color: "#0f766e", background: "#f0fdfa", border: "1px solid #99f6e4", padding: "1px 7px", borderRadius: 999 }}>📖 Nguyên văn SGK</span>}
                        <input
                          className="form-control"
                          value={q.q || q.question || q.title || ""}
                          onChange={(e)=>updateQuestionText(idx, q.q !== undefined ? "q" : "question", e.target.value)}
                          placeholder="Nội dung câu hỏi"
                          style={{ fontSize: 12, fontWeight: 600 }}
                          aria-label={`Câu ${idx+1}`}
                        />
                        {Array.isArray(q.options) && q.options.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            {q.options.slice(0, 4).map((opt, oi) => (
                              <div key={oi} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontWeight: 800, fontSize: 11, width: 18, textAlign: "center", color: (q.answer === oi || q.correctIndex === oi) ? "var(--success)" : "var(--text-muted)" }}>{String.fromCharCode(65+oi)}</span>
                                <input className="form-control" value={opt} onChange={(e)=>updateOption(idx, oi, e.target.value)} style={{ fontSize: 11, padding: "4px 6px" }} aria-label={`Đáp án ${String.fromCharCode(65+oi)}`} />
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>Đáp án
                            <select value={typeof q.correctIndex === "number" ? q.correctIndex : (typeof q.answer === "number" ? q.answer : 0)} onChange={(e)=>updateQuestionText(idx, "correctIndex", Number(e.target.value))} className="form-control" style={{ fontSize: 11, padding: "2px 6px", height: 28, width: 60 }}>
                              <option value={0}>A</option><option value={1}>B</option><option value={2}>C</option><option value={3}>D</option>
                            </select>
                          </label>
                          {(q.explanation || q.answer) && typeof q.answer === "string" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Giải thích: {(q.explanation || q.answer).slice(0, 80)}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>moveQuestion(idx,-1)} disabled={idx===0} aria-label="Lên" title="Lên"><ChevronUp size={12} /></button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>moveQuestion(idx,1)} disabled={idx===questions.length-1} aria-label="Xuống" title="Xuống"><ChevronDown size={12} /></button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>handleRegenerateOne(idx)} disabled={regenIdx===idx} aria-label="Tạo lại câu này" title="AI tạo lại câu này" style={{ color: "var(--primary)" }}>
                          {regenIdx===idx ? <Loader2 size={12} className="aia-spin-svg" /> : <Wand2 size={12} />}
                        </button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>deleteQuestion(idx)} aria-label="Xóa câu này" title="Xóa" style={{ color: "var(--danger)" }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: "1px dashed var(--border-color)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{questions.length} câu • có thể sửa trực tiếp, kéo thứ tự, hoặc tạo lại từng câu</span>
                    <button className="btn btn-secondary btn-xs" onClick={addQuestionManual}>+ Thêm câu</button>
                  </div>
                </div>
              )}

              {!questions.length && !isNoteOrActivity && (
                <div role="alert" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> AI trả về thiếu danh sách câu hỏi</div>
                  <div style={{ fontSize: 11.5, color: "#78716c" }}>Nguyên bản 7 câu trong sách (cột trái) vẫn được giữ. Bấm <strong>Tạo lại toàn bộ</strong> để AI thử lại — thường lần 2 sẽ chuẩn.</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn btn-primary btn-xs" onClick={handleGenerate} disabled={loading}><RefreshCw size={12} /> Tạo lại ngay</button>
                    <button className="btn btn-ghost btn-xs" onClick={()=>setStep(3)}><ArrowLeft size={12} /> Sửa cấu hình</button>
                  </div>
                  <details style={{ fontSize: 11 }}>
                    <summary style={{ cursor: "pointer", color: "#78716c" }}>Xem phản hồi thô của AI</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 10.5, maxHeight: 160, overflow: "auto", background: "#fff", padding: 8, borderRadius: 6, border: "1px solid #fde68a", marginTop: 6 }}>{String(generated.raw || "").slice(0, 1500)}</pre>
                  </details>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-xs" onClick={()=>setStep(2)}><ArrowLeft size={12} /> Đổi loại</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>setStep(3)}><ArrowLeft size={12} /> Sửa cấu hình</button>
                <button className="btn btn-ghost btn-xs" onClick={handleGenerate} disabled={loading}><RefreshCw size={12} /> Tạo lại toàn bộ</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface-soft)", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-color)" }}>
                Sau khi lưu: học liệu sẽ có nhãn <strong>📚 Nguồn: SGK {scan.book.title} — tr.{scan.page}</strong> để bấm “Xem nguồn” mở lại đúng trang.
              </div>

              {/* §18 saved success actions — thêm Đưa vào Whiteboard */}
              {savedInfo && (
                <div style={{ border:"1px solid var(--success)", background:"var(--success-soft, #e6f4ea)", borderRadius:10, padding:10, display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ fontWeight:800, color:"var(--success)", display:"flex", alignItems:"center", gap:6 }}><Check size={14} /> ✓ Đã lưu vào kho</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button className="btn btn-secondary btn-xs" onClick={()=>{ try{ emitOpenSource({ bookId: scan.book.filename, page: scan.page }); }catch{} }}><BookOpen size={12} /> Mở nguồn SGK</button>
                    <button className="btn btn-primary btn-xs" onClick={handleSendToWhiteboard} title="Đưa ảnh scan + trích dẫn vào Whiteboard, giữ liên kết nguồn để quay lại sách"><Palette size={12} /> Đưa vào Bảng trắng</button>
                    <button className="btn btn-secondary btn-xs" onClick={()=>{ try{ window.location.hash=""; }catch{}; onClose(); }}><Eye size={12} /> Đóng</button>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Đưa vào KHBD: soạn trực tiếp trong module Giáo án mới.</span>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <select className="form-control" value={collPick} onChange={(e)=>setCollPick(e.target.value)} style={{ flex:1, minWidth:160, fontSize:11 }}>
                      <option value="">Thêm vào bộ sưu tập…</option>
                      {collOptions.map((c)=><option key={c.id} value={c.id}>{c.name.slice(0,30)}</option>)}
                    </select>
                    <button className="btn btn-secondary btn-xs" onClick={handleAddToCollection} disabled={!collPick}><Library size={12} /> Thêm vào BST</button>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                    <input className="form-control" value={newCollName} onChange={(e)=>setNewCollName(e.target.value)} placeholder="Tên BST mới…" style={{ flex:1, minWidth:160, fontSize:11 }} onKeyDown={(e)=>{ if(e.key==="Enter") handleCreateCollection(); }} />
                    <button className="btn btn-ghost btn-xs" onClick={handleCreateCollection} disabled={!newCollName.trim()}><Library size={12} /> Tạo BST mới</button>
                  </div>
                  {savedInfo.type==="batch" && <div style={{ fontSize:11 }}>{savedInfo.batch.length} mục đã lưu: {savedInfo.batch.map((b)=>b.type).join(", ")}</div>}
                </div>
              )}
            </div>
          )}
          </div>{/* /scanm-right */}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", padding: "10px 14px", borderTop: "1px solid var(--border-color)", flexShrink: 0, background: "var(--surface)" }}>
          <button className="btn btn-secondary" onClick={onClose}>{savedInfo ? "Đóng" : "Hủy"}</button>
          {step === 2 && !loading && <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!materialType}>Tiếp tục</button>}
          {step === 3 && <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !materialType}><Sparkles size={14} /> {loading ? "Đang tạo…" : "AI tạo"}</button>}
          {step >= 4 && !savedInfo && (
            <>
              <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center", marginRight: "auto" }}>📷 {scan.book.title} • tr.{scan.page}</span>
              <button className="btn btn-secondary" onClick={handleSendToWhiteboard} disabled={loading} title="Đưa ảnh + trích dẫn sang Bảng trắng (giữ liên kết nguồn)"><Palette size={14} /> Đưa vào Bảng trắng</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading || !generated} aria-busy={loading}><Save size={14} /> Lưu vào kho</button>
            </>
          )}
          {savedInfo && <span style={{ fontSize: 11, color: "var(--success)", alignSelf:"center" }}>✓ Đã lưu — dùng hành động ở trên</span>}
        </div>
        {step >= 4 && generated && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border-color)", display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, background: "var(--surface-soft)" }}>
            <span style={{ color: "var(--text-muted)" }}>Sau khi lưu:</span>
            <span style={{ background: "var(--surface)", border: "1px solid var(--border-color)", padding: "2px 6px", borderRadius: 6 }}>📷 AI từ SGK</span>
            <span style={{ background: "var(--surface)", border: "1px solid var(--border-color)", padding: "2px 6px", borderRadius: 6 }}>📚 {scan.book.subject} • Lớp {scan.book.grade}</span>
            <span style={{ background: "var(--surface)", border: "1px solid var(--border-color)", padding: "2px 6px", borderRadius: 6 }}>🔍 {analysis?.topic || "—"}</span>
          </div>
        )}
      </div>
    </div>

    {/* Crop Preview Modal */}
    {showCropPreview && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Điều chỉnh vùng crop"
          onClick={() => setShowCropPreview(false)}
          style={{ zIndex: "var(--z-scan-top)" }}
        >
          <div
            className="modal-content scanm-crop-shell"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(1120px, calc(100vw - 20px))",
              width: "min(1120px, calc(100vw - 20px))",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
              borderRadius: 16,
            }}
          >
            <CropPreview
              dataUrl={scan.dataUrl}
              initialCrop={scan.crop}
              onCancel={() => setShowCropPreview(false)}
              onConfirm={(result) => {
                setAdjustedScan({
                  ...scan,
                  dataUrl: result.dataUrl,
                  width: result.width,
                  height: result.height,
                  crop: result.crop
                });
                setShowCropPreview(false);
              }}
            />
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
