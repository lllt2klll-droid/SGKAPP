import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getApiBase } from "./apiConfig";
import { PRIMARY_SUBJECTS } from "./subjectCatalog";
import { loadSettings, updateSettings } from "./settingsStore";
import { readJSON, saveJSON, removeKey } from "./storage";
import { useFileDrag } from "./components/fileDropzoneUtils.js";
import {
  X, Save, Eye, Trash2, Copy, Check, FileText, AlertCircle,
  Bold, Italic, Underline, Strikethrough, Palette, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Indent, Outdent, Link2, Image as ImageIcon,
  Table2, Minus, Quote, Code,
  Undo2, Redo2, Eraser, Type, Subscript, Superscript,
  ZoomIn, ZoomOut, Ruler, Printer, Search,
  Layers, BookOpen, Maximize2, Minimize2,
  Download, FileUp,
} from "lucide-react";

const API_BASE = getApiBase();
const DRAFT_KEY = "sgk_textbook_draft_word_v2";
const VALID_SUBJECTS = [...PRIMARY_SUBJECTS, "Khác"];

const FONT_FAMILIES = [
  { label: "Mặc định", value: "inherit" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Arial", value: "Arial, Helvetica, 'Segoe UI', sans-serif" },
  { label: "Calibri", value: "Calibri, 'Segoe UI', Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, 'Segoe UI', sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Be Vietnam Pro", value: "'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif" },
  { label: "Noto Serif", value: "'Noto Serif', Georgia, 'Times New Roman', serif" },
];
const FONT_SIZES = ["12px","13px","14px","15px","16px","18px","20px","22px","24px","26px","28px","32px"];
const LINE_HEIGHTS = ["1.0","1.15","1.35","1.5","1.7","2.0"];
const PAGE_ZOOMS = [70,80,90,100,110,125,150];

const COLOR_PALETTE = ["#1a1a1a","#c0392b","#e74c3c","#d35400","#e67e22","#f39c12","#f1c40f","#27ae60","#2ecc71","#16a085","#2980b9","#3498db","#8e44ad","#9b59b6","#34495e","#7f8c8d"];
const HIGHLIGHTS = ["transparent","#fff59d","#ffecb3","#c8e6c9","#bbdefb","#e1bee7","#ffcdd2","#ffe0b2","#d7ccc8"];

const WORD_TEMPLATES = [
  { id: "blank", label: "— Trống —", html: "" },
  {
    id: "bai-hoc", label: "Bài học mẫu",
    html: `<h1 style="text-align:center; color:#1e40af;">Bài 1: Giới thiệu</h1><p style="text-align:center; color:#64748b;"><em>Môn: ... — Lớp: ... — Tiết: ...</em></p><h2>Mục tiêu</h2><ul><li>Học sinh hiểu được ...</li><li>Rèn kỹ năng ...</li></ul><h2>Nội dung chính</h2><h3>1. Khởi động (5 phút)</h3><p>Câu hỏi gợi mở: ...</p><h3>2. Hình thành kiến thức</h3><p><strong>Khái niệm:</strong> ...</p><blockquote>Ví dụ minh họa: ...</blockquote><h3>3. Luyện tập</h3><ol><li>Bài tập 1: ...</li><li>Bài tập 2: ...</li></ol><h3>4. Vận dụng</h3><p>Liên hệ thực tế: ...</p><hr><p><em>Ghi chú giáo viên:</em> ...</p>`,
  },
  {
    id: "ke-hoach", label: "Kế hoạch bài dạy",
    html: `<h1 style="text-align:center;">KẾ HOẠCH BÀI DẠY</h1><table style="width:100%; border-collapse:collapse;"><tbody><tr><td style="border:1px solid #cbd5e1; padding:8px; width:50%;"><strong>Môn:</strong> ...</td><td style="border:1px solid #cbd5e1; padding:8px;"><strong>Lớp:</strong> ...</td></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;"><strong>Tiết:</strong> ...</td><td style="border:1px solid #cbd5e1; padding:8px;"><strong>GV:</strong> ...</td></tr></tbody></table><h2>I. YÊU CẦU CẦN ĐẠT</h2><p><strong>1. Năng lực đặc thù:</strong> ...<br><strong>2. Năng lực chung:</strong> ...<br><strong>3. Phẩm chất:</strong> ...</p><h2>II. ĐỒ DÙNG DẠY HỌC</h2><ul><li>GV: ...</li><li>HS: ...</li></ul><h2>III. TIẾN TRÌNH</h2><table style="width:100%; border-collapse:collapse;"><tbody><tr style="background:#f1f5f9;"><th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Hoạt động</th><th style="border:1px solid #cbd5e1; padding:8px;">Thời gian</th><th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Nội dung</th></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;">Khởi động</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">5p</td><td style="border:1px solid #cbd5e1; padding:8px;">...</td></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;">Khám phá</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">15p</td><td style="border:1px solid #cbd5e1; padding:8px;">...</td></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;">Luyện tập</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">15p</td><td style="border:1px solid #cbd5e1; padding:8px;">...</td></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;">Vận dụng</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">5p</td><td style="border:1px solid #cbd5e1; padding:8px;">...</td></tr></tbody></table><h2>IV. ĐIỀU CHỈNH SAU BÀI DẠY</h2><p>...</p>`,
  },
  {
    id: "truyen", label: "Truyện / Văn bản đọc",
    html: `<h1 style="text-align:center;">Tên truyện: ...</h1><p style="text-align:center; color:#64748b;"><strong>Tác giả:</strong> ...</p><hr><p>Ngày xửa ngày xưa, ...</p><blockquote>Đoạn trích nổi bật...</blockquote><p>...</p><h2>Câu hỏi sau khi đọc</h2><ol><li>Nhân vật chính là ai?</li><li>Câu chuyện muốn nhắn gửi điều gì?</li><li>Em học được gì từ câu chuyện?</li></ol>`,
  },
  {
    id: "ghi-chu", label: "Ghi chú / Tài liệu",
    html: `<h1>Ghi chú: ...</h1><ul><li><strong>Ý chính 1:</strong> ...</li><li><strong>Ý chính 2:</strong> ...</li><li><strong>Ý chính 3:</strong> ...</li></ul><h2>Từ khóa</h2><p><code style="background:#f1f5f9; padding:2px 6px; border-radius:6px;">...</code> <code style="background:#f1f5f9; padding:2px 6px; border-radius:6px;">...</code></p><h2>Câu hỏi ôn tập</h2><ol><li>...</li><li>...</li><li>...</li></ol>`,
  },
];

// helpers
function htmlToPlainText(html) {
  try { const d=document.createElement("div"); d.innerHTML=html||""; return (d.textContent||d.innerText||"").trim(); } catch { return (html||"").replace(/<[^>]*>/g," ").trim(); }
}
function countWordsFromHtml(html){
  const t=htmlToPlainText(html); if(!t) return 0; return t.split(/\s+/).filter(Boolean).length;
}
function estimatePages(html){
  const text=htmlToPlainText(html); const chars=text.length; if(!chars) return 1; return Math.max(1, Math.ceil(chars/1800));
}
function plainToHtml(text){
  if(!text) return "";
  // escape
  const esc=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const paragraphs=esc.split(/\n\s*\n/).map(p=>{
    const inner=p.split("\n").join("<br>");
    if(/^\s*#{1,6}\s/.test(p)) return p; // keep markdown headings as is will be converted below
    return `<p>${inner}</p>`;
  }).join("");
  return paragraphs;
}
function mdLikeToHtmlIfNeeded(content, ext){
  if(ext==="html") return content;
  if(ext==="md" && content.includes("#")){
    // quick md heading/bold -> html
    let h=content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    h=h.replace(/^###\s+(.*)$/gm,'<h3>$1</h3>').replace(/^##\s+(.*)$/gm,'<h2>$1</h2>').replace(/^#\s+(.*)$/gm,'<h1>$1</h1>');
    h=h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code style="background:#f1f5f9;padding:1px 6px;border-radius:6px;">$1</code>');
    h=h.replace(/^\s*[-*]\s+(.*)$/gm,'<li>$1</li>').replace(/^\s*\d+\.\s+(.*)$/gm,'<li>$1</li>');
    // wrap stray li in ul (simple)
    h=h.split("\n").map(line=> line.trim().startsWith("<li>")?line:`<p>${line}</p>`).join("\n");
    return h;
  }
  return plainToHtml(content);
}

export default function TextBookModal({ open, onClose, onSuccess, editingBook }) {
  const isEdit = !!editingBook;
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState(1);
  const [subject, setSubject] = useState("Tiếng Việt");
  const [term, setTerm] = useState(1);
  const [format, setFormat] = useState("html"); // html default, keep txt/md compat
  const [html, setHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [draftRestored, setDraftRestored] = useState(false);
  const titleRef = useRef(null);
  const editorRef = useRef(null);
  // word-like controls — đồng bộ với Setting (editor)
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoom, setZoom] = useState(()=> { try{ return loadSettings().editor?.defaultZoom || 100; }catch{ return 100; }});
  const [showRuler, setShowRuler] = useState(()=> { try{ return loadSettings().editor?.showRuler !== false; }catch{ return true; }});
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [fontFamily, setFontFamily] = useState(()=> { try{ return loadSettings().editor?.defaultFontFamily || "inherit"; }catch{ return "inherit"; }});
  const [fontSize, setFontSize] = useState(()=> { try{ return loadSettings().editor?.defaultFontSize || "15px"; }catch{ return "15px"; }});
  const [lineHeight, setLineHeight] = useState(()=> { try{ return loadSettings().editor?.defaultLineHeight || "1.7"; }catch{ return "1.7"; }});
  const [textColor, setTextColor] = useState("#1e293b");
  const [hiliteColor, setHiliteColor] = useState("transparent");
  const [docxNotice, setDocxNotice] = useState("");
  const [docxBusy, setDocxBusy] = useState(false);
  const docxFileRef = useRef(null);
  const [showColorPick, setShowColorPick] = useState(null); // 'text' | 'hilite' | null
  const [showTablePick, setShowTablePick] = useState(false);
  const [tableHover, setTableHover] = useState({r:0,c:0});
  const [activeFmt, setActiveFmt] = useState({ bold:false, italic:false, underline:false, strike:false, ul:false, ol:false, justify:"left" });
  const fileImgRef = useRef(null);
  const lastRangeRef = useRef(null);

  // Đồng bộ Setting — persist editor prefs toàn app
  const persistEditor = useCallback((patch)=>{
    try{ updateSettings({ editor: patch }); }catch{}
  },[]);
  useEffect(()=>{
    const onSettings=(e)=>{
      const ed=e.detail?.editor; if(!ed) return;
      if(ed.defaultZoom && ed.defaultZoom!==zoom) setZoom(ed.defaultZoom);
      if(typeof ed.showRuler==="boolean" && ed.showRuler!==showRuler) setShowRuler(ed.showRuler);
      if(ed.defaultFontFamily && ed.defaultFontFamily!==fontFamily) setFontFamily(ed.defaultFontFamily);
      if(ed.defaultFontSize && ed.defaultFontSize!==fontSize) setFontSize(ed.defaultFontSize);
      if(ed.defaultLineHeight && ed.defaultLineHeight!==lineHeight) setLineHeight(ed.defaultLineHeight);
      if(ed.spellCheck !== undefined && editorRef.current){
        editorRef.current.spellcheck = !!ed.spellCheck;
      }
    };
    window.addEventListener("sgk:settings-updated", onSettings);
    return ()=> window.removeEventListener("sgk:settings-updated", onSettings);
  },[zoom, showRuler, fontFamily, fontSize, lineHeight]);

  // sync editor innerHTML -> state
  const syncHtml = useCallback(()=>{
    if(!editorRef.current) return;
    setHtml(editorRef.current.innerHTML);
  },[]);

  // exec
  const saveSelection = useCallback(()=>{
    const sel=window.getSelection();
    if(sel && sel.rangeCount>0) {
      const r=sel.getRangeAt(0);
      if(editorRef.current && editorRef.current.contains(r.commonAncestorContainer)) lastRangeRef.current=r.cloneRange();
    }
  },[]);
  const restoreSelection = useCallback(()=>{
    if(lastRangeRef.current){
      const sel=window.getSelection();
      sel.removeAllRanges();
      try{ sel.addRange(lastRangeRef.current);}catch{}
    }
  },[]);
  const exec = useCallback((cmd, val=null)=>{
    editorRef.current?.focus();
    if(lastRangeRef.current) restoreSelection();
    try{ document.execCommand(cmd,false,val); }catch{}
    // apply manual for some
    syncHtml();
    updateActiveStates();
    saveSelection();
  },[restoreSelection,syncHtml,saveSelection]);

  const updateActiveStates = useCallback(()=>{
    try{
      const bold=document.queryCommandState("bold");
      const italic=document.queryCommandState("italic");
      const underline=document.queryCommandState("underline");
      const strike=document.queryCommandState("strikeThrough");
      const ul=document.queryCommandState("insertUnorderedList");
      const ol=document.queryCommandState("insertOrderedList");
      let justify="left";
      if(document.queryCommandState("justifyCenter")) justify="center";
      else if(document.queryCommandState("justifyRight")) justify="right";
      else if(document.queryCommandState("justifyFull")) justify="justify";
      setActiveFmt({ bold, italic, underline, strike, ul, ol, justify });
    }catch{}
  },[]);

  // font family apply via selection — đồng bộ Setting
  const applyFontFamily = (val)=>{
    setFontFamily(val);
    persistEditor({ defaultFontFamily: val });
    editorRef.current?.focus();
    if(val==="inherit") exec("fontName","Arial");
    // manual wrap because fontName limited
    const sel=window.getSelection();
    if(!sel || sel.isCollapsed){
      if(editorRef.current) editorRef.current.style.fontFamily=val==="inherit"?"":val;
      syncHtml();
      return;
    }
    // wrap selection in span
    try{
      const range=sel.getRangeAt(0);
      const span=document.createElement("span");
      span.style.fontFamily=val;
      try{ range.surroundContents(span); }catch{
        const frag=range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
      sel.removeAllRanges();
    }catch{}
    syncHtml();
  };
  const applyFontSize = (val)=>{
    setFontSize(val);
    persistEditor({ defaultFontSize: val });
    editorRef.current?.focus();
    const sel=window.getSelection();
    if(!sel || sel.isCollapsed){
      if(editorRef.current) editorRef.current.style.fontSize=val;
      syncHtml();
      return;
    }
    try{
      const range=sel.getRangeAt(0);
      const span=document.createElement("span");
      span.style.fontSize=val;
      try{ range.surroundContents(span); }catch{
        const frag=range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
      sel.removeAllRanges();
    }catch{}
    syncHtml();
  };
  const applyLineHeight = (val)=>{
    setLineHeight(val);
    persistEditor({ defaultLineHeight: val });
    if(editorRef.current) editorRef.current.style.lineHeight=val;
    syncHtml();
  };
  const handleZoomSet = (v)=>{ const nv=Math.max(70, Math.min(150, Number(v)||100)); setZoom(nv); persistEditor({ defaultZoom: nv }); };
  const handleRulerToggle = ()=>{ const nv=!showRuler; setShowRuler(nv); persistEditor({ showRuler: nv }); };
  const applyTextColor = (color)=>{
    setTextColor(color);
    setShowColorPick(null);
    exec("foreColor", color);
  };
  const applyHilite = (color)=>{
    setHiliteColor(color);
    setShowColorPick(null);
    exec("hiliteColor", color);
    if(color==="transparent") exec("hiliteColor","transparent");
  };

  const applyHeading = (tag)=>{
    editorRef.current?.focus();
    if(tag==="p") exec("formatBlock","<p>");
    else if(tag==="h1") exec("formatBlock","<h1>");
    else if(tag==="h2") exec("formatBlock","<h2>");
    else if(tag==="h3") exec("formatBlock","<h3>");
    else if(tag==="blockquote") exec("formatBlock","<blockquote>");
    else if(tag==="pre") exec("formatBlock","<pre>");
    syncHtml();
  };

  const insertLink = ()=>{
    const url=prompt("Nhập URL (https://...):","");
    if(!url) return;
    exec("createLink", url);
  };
  const insertImageFromFile = (file)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const src=reader.result;
      editorRef.current?.focus();
      if(lastRangeRef.current) restoreSelection();
      exec("insertImage", src);
    };
    reader.readAsDataURL(file);
  };
  const insertTable = (rows, cols)=>{
    setShowTablePick(false);
    let h='<table style="width:100%; border-collapse:collapse; margin:12px 0;"><tbody>';
    for(let r=0;r<rows;r++){
      h+='<tr>';
      for(let c=0;c<cols;c++) h+=`<td style="border:1px solid #cbd5e1; padding:8px; min-width:60px;">${r===0?`<strong>O ${c+1}</strong>`:""}</td>`;
      h+='</tr>';
    }
    h+='</tbody></table><p><br></p>';
    editorRef.current?.focus();
    if(lastRangeRef.current) restoreSelection();
    exec("insertHTML", h);
  };
  const insertHR = ()=>{ exec("insertHorizontalRule",""); exec("insertHTML","<p><br></p>"); };

  const handleUndo=()=> exec("undo");
  const handleRedo=()=> exec("redo");
  const handleClearFormat=()=>{ exec("removeFormat"); exec("unlink"); };

  const doFind = ()=>{
    if(!findText) return;
    const sel=window.getSelection();
    const content=editorRef.current?.innerText||"";
    // simple: highlight via search inside editor using window.find if available
    try{
      const found=window.find(findText,false,false,true,false,false,false);
      if(!found) alert("Không tìm thấy: "+findText);
    }catch{
      // fallback
      const idx=content.indexOf(findText);
      if(idx<0) alert("Không tìm thấy: "+findText);
    }
  };
  const doReplace = ()=>{
    if(!html || !findText) return;
    const next=html.split(findText).join(replaceText);
    if(next!==html){
      if(editorRef.current) editorRef.current.innerHTML=next;
      setHtml(next);
    }
  };
  const doReplaceAll = ()=>{
    if(!html || !findText) return;
    const next=html.split(findText).join(replaceText);
    if(editorRef.current) editorRef.current.innerHTML=next;
    setHtml(next);
  };

  // keep editor content in sync when html state changes externally
  useEffect(()=>{
    if(!editorRef.current) return;
    if(showPreview) return;
    const cur=editorRef.current.innerHTML;
    // avoid loop: only update if external differs and not focused diff tiny
    if(cur!==html && document.activeElement!==editorRef.current){
      editorRef.current.innerHTML=html;
    }
  },[html, showPreview]);

  // selection listeners
  useEffect(()=>{
    const onSel=()=>{
      saveSelection();
      updateActiveStates();
    };
    document.addEventListener("selectionchange", onSel);
    return ()=> document.removeEventListener("selectionchange", onSel);
  },[saveSelection, updateActiveStates]);

  // close color/table popovers on outside click
  useEffect(()=>{
    if(!showColorPick && !showTablePick) return;
    const onDown=(e)=>{
      if(e.target.closest?.(".word-color-wrap") || e.target.closest?.(".word-color-pop") || e.target.closest?.(".word-table-pop")) return;
      setShowColorPick(null);
      setShowTablePick(false);
    };
    document.addEventListener("mousedown", onDown);
    return ()=> document.removeEventListener("mousedown", onDown);
  },[showColorPick, showTablePick]);

  // Load editing data
  useEffect(() => {
    if (!open) return;
    setError("");
    setDocxNotice("");
    setFieldErrors({});
    if (isEdit && editingBook?.filename) {
      setFetching(true);
      fetch(`${API_BASE}/api/books/${encodeURIComponent(editingBook.filename)}/content`)
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data?.error || "Không thể tải nội dung.");
          setTitle(data.title || editingBook.title || "");
          const rawContent=data.content || "";
          const ext=(data.ext||".html").toLowerCase();
          const converted=mdLikeToHtmlIfNeeded(rawContent, ext.replace(".",""));
          setHtml(converted || "<p><br></p>");
          // sync editor
          setTimeout(()=>{ if(editorRef.current) editorRef.current.innerHTML=converted||"<p><br></p>"; },50);
          setGrade(data.grade || editingBook.grade || 1);
          setSubject(data.subject || editingBook.subject || "Khác");
          setTerm(data.term || editingBook.term || 1);
          const fmt=(data.ext||".html").replace(".","")||"html";
          setFormat(fmt==="html"?"html":fmt==="md"?"md":"txt");
        })
        .catch((e) => setError(e.message || "Không thể tải nội dung để sửa."))
        .finally(() => setFetching(false));
    } else {
      try {
        // Thống nhất lưu trữ qua storage.js — đọc nháp Word
        const d = readJSON(DRAFT_KEY, null) || readJSON("sgk_textbook_draft_v1", null);
          if (d && typeof d === "object" && (d.title || d.html || d.content)) {
            setTitle(d.title || "");
            const h=d.html || d.content || "";
            const conv=h.startsWith("<")?h: plainToHtml(h);
            setHtml(conv || "<p><br></p>");
            setTimeout(()=>{ if(editorRef.current) editorRef.current.innerHTML=conv||"<p><br></p>"; },50);
            setGrade(d.grade || 1);
            setSubject(d.subject || "Tiếng Việt");
            setTerm(d.term || 1);
            setFormat(d.format || "html");
            setDraftRestored(true);
          } else {
            setTitle(""); setHtml("<p><br></p>");
            setGrade(1); setSubject("Tiếng Việt"); setTerm(1); setFormat("html");
          }
      } catch {
        setTitle(""); setHtml("<p><br></p>");
      }
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open, isEdit, editingBook]);

  // Auto-save draft (only for create) — tôn trọng Setting editor.autoSaveWordDraft
  // Giới hạn: bỏ qua nháp >300KB (thường do ảnh base64 khi nhập Word) vì
  // localStorage chỉ ~5MB — cố lưu sẽ quota-exceeded + xóa oan cache index của các sách khác
  const DRAFT_MAX_HTML = 300000;
  const draftTooLarge = (html || "").length > DRAFT_MAX_HTML;
  useEffect(() => {
    if (!open || isEdit) return;
    try{ if(loadSettings().editor?.autoSaveWordDraft===false) return; }catch{}
    if ((html || "").length > DRAFT_MAX_HTML) return;
    const t = setTimeout(() => {
      try {
        saveJSON(DRAFT_KEY, { title, html, grade, subject, term, format, at: Date.now() });
      } catch {}
    }, 650);
    return () => clearTimeout(t);
  }, [title, html, grade, subject, term, format, open, isEdit]);

  // Word-like shortcuts — tinh tế, đầy đủ
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      const isMod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      // Esc: close popups first, then modal
      if (e.key === "Escape"){
        if(showTablePick || showColorPick){ setShowTablePick(false); setShowColorPick(null); e.preventDefault(); return; }
        if(showFind){ setShowFind(false); e.preventDefault(); return; }
        // Lỗi #5: modal đang mở là lớp trên cùng — Escape phải dừng ở đây,
        // không nổi lên reader (tắt note/panel ẩn) hay các layer khác.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose(); return;
      }
      if (isMod && k==="s"){ e.preventDefault(); handleSubmit(); return; }
      if (isMod && e.key==="Enter"){ e.preventDefault(); handleSubmit(); return; }
      if (isMod && k==="p"){ e.preventDefault(); handlePrint(); return; }
      if (isMod && k==="f" && !e.shiftKey){ e.preventDefault(); setShowFind(v=>!v); return; }
      if (isMod && k==="h"){ e.preventDefault(); setShowFind(true); return; }
      if (isMod && k==="k"){
        // Phân quyền Ctrl+K: search overlay đang giữ focus → phím thuộc search,
        // modal không được nuốt (chèn link) — tránh chạy chung với overlay.
        const a = document.activeElement;
        if (a && a.closest && a.closest(".global-search-overlay")) return;
        e.preventDefault(); insertLink(); return;
      }
      if (isMod && k==="b"){ e.preventDefault(); exec("bold"); return; }
      if (isMod && k==="i"){ e.preventDefault(); exec("italic"); return; }
      if (isMod && k==="u"){ e.preventDefault(); exec("underline"); return; }
      if (isMod && e.shiftKey && k==="s"){ e.preventDefault(); exec("strikeThrough"); return; }
      if (isMod && k==="z" && !e.shiftKey){ e.preventDefault(); exec("undo"); return; }
      if ((isMod && k==="y") || (isMod && e.shiftKey && k==="z")){ e.preventDefault(); exec("redo"); return; }
      if (isMod && k==="l" && !e.shiftKey){ e.preventDefault(); exec("justifyLeft"); return; }
      if (isMod && k==="e"){ e.preventDefault(); exec("justifyCenter"); return; }
      if (isMod && k==="r"){ e.preventDefault(); exec("justifyRight"); return; }
      if (isMod && k==="j"){ e.preventDefault(); exec("justifyFull"); return; }
      if (isMod && e.shiftKey && k==="l"){ e.preventDefault(); exec("insertUnorderedList"); return; }
      if (isMod && e.shiftKey && k==="n"){ e.preventDefault(); exec("insertOrderedList"); return; }
      if (isMod && k==="]"){ e.preventDefault(); applyFontSize(`${Math.min(32, parseInt(fontSize)+1)}px`); return; }
      if (isMod && k==="["){ e.preventDefault(); applyFontSize(`${Math.max(12, parseInt(fontSize)-1)}px`); return; }
      if (isMod && k==="1"){ e.preventDefault(); applyHeading("h1"); return; }
      if (isMod && k==="2"){ e.preventDefault(); applyHeading("h2"); return; }
      if (isMod && k==="3"){ e.preventDefault(); applyHeading("h3"); return; }
      if (isMod && k==="0"){ e.preventDefault(); applyHeading("p"); return; }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, title, html, grade, subject, term, format, showTablePick, showColorPick, showFind, fontSize]);

  const stats = useMemo(() => {
    const text=htmlToPlainText(html);
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const lines = text ? text.split("\n").length : 0;
    const sizeKB = new Blob([html]).size / 1024;
    const readMin = Math.max(1, Math.ceil(words / 200));
    const pages = estimatePages(html);
    return { chars, charsNoSpace, words, lines, sizeKB, readMin, pages };
  }, [html]);

  const validate = () => {
    const errs = {};
    if (!title.trim() || title.trim().length < 3) errs.title = "Tiêu đề cần ít nhất 3 ký tự.";
    if (title.trim().length > 160) errs.title = "Tiêu đề tối đa 160 ký tự.";
    const plain=htmlToPlainText(html);
    if (!plain) errs.content = "Nội dung không được để trống.";
    if (html.length > 5000000) errs.content = "Noi dung vuot qua 5.000.000 ky tu (HTML, kể cả ảnh nhúng).";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    // pull latest from editor
    const liveHtml=editorRef.current ? editorRef.current.innerHTML : html;
    if(liveHtml!==html) setHtml(liveHtml);
    const rawToSend=editorRef.current ? editorRef.current.innerHTML : html;
    // Sanitize trước khi lưu: chặn script/event-handler (paste từ ngoài có thể mang theo),
    // giữ nguyên toàn bộ định dạng hiển thị — BookReader render bằng innerHTML
    let contentToSend = rawToSend;
    try {
      const { sanitizeRichHtml } = await import("./wordDocx.js");
      contentToSend = sanitizeRichHtml(rawToSend);
    } catch { contentToSend = rawToSend; }
    const plain=htmlToPlainText(contentToSend);
    if (!title.trim() || title.trim().length < 3){ setFieldErrors({title:"Tiêu đề cần ít nhất 3 ký tự."}); return; }
    if (!plain){ setFieldErrors({content:"Nội dung không được để trống."}); return; }
    if (contentToSend.length > 5000000){ setFieldErrors({content:"Noi dung vuot qua 5.000.000 ky tu (HTML, kể cả ảnh nhúng)."}); return; }
    if(!validate()) return;
    setLoading(true);
    setError("");
    try {
      // always save as html for rich features; keep format html regardless of UI toggle but respect user choice
      const payload = { title: title.trim(), content: contentToSend, grade: Number(grade), subject, term: Number(term), format: "html" };
      let res, data;
      if (isEdit) {
        res = await fetch(`${API_BASE}/api/books/${encodeURIComponent(editingBook.filename)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Không thể cập nhật sách.");
        try { removeKey(DRAFT_KEY); removeKey("sgk_textbook_draft_v1"); } catch {}
        onSuccess?.(data.book, data.oldFilename);
        onClose();
      } else {
        res = await fetch(`${API_BASE}/api/books/create-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Không thể tạo sách.");
        try { removeKey(DRAFT_KEY); removeKey("sgk_textbook_draft_v1"); } catch {}
        onSuccess?.(data.book);
        onClose();
      }
    } catch (e) {
      setError(e.message || "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearDraft = () => {
    try { removeKey(DRAFT_KEY); removeKey("sgk_textbook_draft_v1"); } catch {}
    setTitle("");
    setHtml("<p><br></p>");
    if(editorRef.current) editorRef.current.innerHTML="<p><br></p>";
    setGrade(1);
    setSubject("Tiếng Việt");
    setTerm(1);
    setFormat("html");
    setDraftRestored(false);
  };

  const handlePasteClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        // if clipboard has html flavor? simple text
        const htmlChunk=plainToHtml(t);
        exec("insertHTML", htmlChunk);
      }
    } catch {
      setError("Không thể đọc clipboard — hãy dán thủ công (Ctrl+V).");
    }
  };

  const handleTemplate = (id) => {
    const tpl = WORD_TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    if (tpl.html === "") {
      if(editorRef.current) editorRef.current.innerHTML="<p><br></p>";
      setHtml("<p><br></p>");
      return;
    }
    const curPlain=htmlToPlainText(editorRef.current?.innerHTML||html);
    if (curPlain.trim()) {
      if (!confirm("Thay thế nội dung hiện tại bằng mẫu?")) return;
    }
    if(editorRef.current) editorRef.current.innerHTML=tpl.html;
    setHtml(tpl.html);
  };

  const handleCopyHtml = async ()=>{
    const cur=editorRef.current? editorRef.current.innerHTML: html;
    try{ await navigator.clipboard.writeText(cur); setError(""); }catch{}
  };
  // ── Nhập file Word (.docx) vào trình soạn — giữ nguyên định dạng ──
  const handleImportDocxFile = async (file)=>{
    if(!file) return;
    setDocxBusy(true);
    setError("");
    setDocxNotice("");
    try{
      const { importDocxToHtml } = await import("./wordDocx.js");
      const { html: imported, warnings } = await importDocxToHtml(file);
      const curPlain=htmlToPlainText(editorRef.current?.innerHTML||html);
      if (curPlain.trim()) {
        if (!confirm("Chép nội dung Word vào sẽ THAY THẾ nội dung hiện tại. Tiếp tục?")) return;
      }
      if(editorRef.current) editorRef.current.innerHTML=imported;
      setHtml(imported);
      if(!title.trim() || title.trim().length < 3){
        const base=String(file.name||"").replace(/\.[a-z0-9]+$/i,"").replace(/[-_]+/g," ").trim();
        if(base.length>=3) setTitle(base.slice(0,160));
      }
      setDocxNotice(
        `Đã nhập "${file.name}" — giữ nguyên định dạng.` +
        (warnings?.length ? ` (Lưu ý: ${warnings[0]})` : "")
      );
    }catch(e){
      setError(e.message || "Không nhập được file Word.");
    }finally{
      setDocxBusy(false);
    }
  };
  // ── Xuất nội dung đang soạn ra file .docx thật (mở/sửa bằng Word) ──
  const handleExportDocx = async ()=>{
    const cur=editorRef.current ? editorRef.current.innerHTML : html;
    if(!htmlToPlainText(cur).trim()){ setError("Nội dung trống — chưa xuất được file Word."); return; }
    setDocxBusy(true);
    setError("");
    try{
      const { exportHtmlToDocx } = await import("./wordDocx.js");
      await exportHtmlToDocx(cur, title.trim() || "sach-word");
      setDocxNotice(`Đã xuất "${(title.trim() || "sach-word").slice(0,60)}.docx" — mở bằng Word để xem/sửa tiếp.`);
    }catch(e){
      setError(e.message || "Không xuất được file Word.");
    }finally{
      setDocxBusy(false);
    }
  };
  const handlePrint = ()=>{
    const cur=editorRef.current? editorRef.current.innerHTML: html;
    const w=window.open("","_blank");
    if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Times New Roman',serif; max-width:720px; margin:40px auto; line-height:1.7; color:#1e293b;} h1,h2,h3{color:#1e293b;} blockquote{border-left:3px solid #3b82f6; margin:12px 0; padding:8px 14px; background:#f1f5f9;} table{border-collapse:collapse; width:100%;} td,th{border:1px solid #cbd5e1; padding:8px;}</style></head><body>${cur}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(()=> w.print(), 400);
  };

  const pageCount=stats.pages;
  // Paginated preview — split HTML into A4 pages (~3200 chars ~ 550 words)
  // Fix tràn trang: block đơn dài sẽ được chunk nhỏ để đẩy sang trang 2
  const previewPages = useMemo(()=>{
    const raw = html || "";
    if(!raw || raw==="<p><br></p>") return [raw];
    try{
      const tmp=document.createElement("div");
      tmp.innerHTML=raw;
      const nodes=Array.from(tmp.childNodes);
      if(!nodes.length) return [raw];
      const pages=[]; let cur=""; let curLen=0;
      const limit=3200;
      const plainLen = (h)=>{ const d=document.createElement("div"); d.innerHTML=h; return (d.textContent||"").length; };
      const chunkLongBlock = (out, len)=>{
        // nếu 1 block vượt limit, tách text bên trong thành nhiều <p>
        if(len <= limit) return [out];
        try{
          const t=document.createElement("div"); t.innerHTML=out;
          const el=t.firstElementChild;
          if(!el) return [out];
          const tag=el.tagName?.toLowerCase();
          // chỉ tách các block text thường (p, div, li, h*), không tách table/pre/code
          if(["table","pre","ul","ol"].includes(tag)) return [out];
          const text=(el.textContent||"").trim();
          if(!text || text.length <= limit) return [out];
          const chunks=[];
          let pos=0;
          while(pos < text.length){
            let end=Math.min(pos+limit, text.length);
            // ưu tiên cắt ở khoảng trắng gần end
            if(end < text.length){
              const sp=text.lastIndexOf(" ", end);
              if(sp > pos+800) end=sp;
            }
            const piece=text.slice(pos, end).trim();
            if(piece) chunks.push(`<${tag}>${piece.replace(/</g,"&lt;")}</${tag}>`);
            pos=end;
          }
          return chunks.length? chunks : [out];
        }catch{ return [out]; }
      };
      for(const n of nodes){
        const out = n.outerHTML ?? `<p>${(n.textContent||"").replace(/</g,"&lt;")}</p>`;
        const len = plainLen(out) || Math.ceil(out.length/3);
        const pieces = chunkLongBlock(out, len);
        for(const piece of pieces){
          const pLen = plainLen(piece) || Math.ceil(piece.length/3);
          if(curLen + pLen > limit && cur){
            pages.push(cur);
            cur=piece; curLen=pLen;
          } else { cur+=piece; curLen+=pLen; }
        }
      }
      if(cur) pages.push(cur);
      return pages.length? pages : [raw];
    }catch{ return [raw]; }
  },[html]);

  if (!open) return null;

  return (
    <WordModalDropLayer
      onDocx={(f) => handleImportDocxFile(f)}
      onImage={(f) => insertImageFromFile(f)}
      onError={(m) => setError(m)}
    >
    <div className={`word-modal-overlay ${isMaximized ? "is-maximized" : ""}`} onClick={onClose} role="dialog" aria-modal="true" aria-label={isEdit ? "Sửa sách Word" : "Tạo sách Word"}>
      <div className={`word-modal ${isMaximized ? "is-maximized" : ""}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="word-modal-header">
          <div className="word-header-left">
            <span className="word-header-icon"><FileText size={18} /></span>
            <div className="word-header-titles">
              <h2>{isEdit ? "Sửa sách — Word" : "Tạo sách — Word"}</h2>
              <span className="word-header-sub">Trang sách · Word-like · {pageCount} trang ước tính · {stats.words.toLocaleString("vi-VN")} từ</span>
            </div>
            {isEdit && editingBook?.filename ? <span className="word-filename" title={editingBook.filename}>{editingBook.filename}</span> : null}
          </div>
          <div className="word-header-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=> docxFileRef.current?.click()} disabled={docxBusy} title="Nhập file Word (.docx) — giữ nguyên định dạng (tiêu đề, in đậm/nghiêng, bảng, ảnh...)"><FileUp size={14} /> {docxBusy ? "..." : "Nhập Word"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleExportDocx} disabled={docxBusy} title="Xuất nội dung này ra file .docx thật (mở/sửa bằng Word)"><Download size={14} /> Xuất Word</button>
            <input ref={docxFileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImportDocxFile(f); e.target.value=""; }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=> setShowPreview(v=>!v)} title="Xem trước dạng sách"><Eye size={14} /> {showPreview? "Sửa":"Xem"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handlePrint} title="In"><Printer size={14} /></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=> setIsMaximized(v=>!v)} title={isMaximized ? "Thu nhỏ" : "Phóng to toàn màn hình"} aria-label={isMaximized ? "Thu nhỏ" : "Phóng to"}>{isMaximized ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
          </div>
        </div>

        {fetching ? (
          <div className="word-loading">
            <div className="spinner" style={{ width: 28, height: 28 }} />
            <p>Đang tải nội dung...</p>
          </div>
        ) : (
          <>
            {draftRestored && !isEdit && (
              <div className="word-draft-banner">
                <span>Đã khôi phục bản nháp từ lưu.</span>
                <button type="button" className="btn btn-ghost btn-xs" onClick={handleClearDraft}>Xóa nháp</button>
              </div>
            )}

            {docxNotice && (
              <div className="word-draft-banner" role="status">
                <span>{docxNotice}</span>
                <button type="button" className="btn btn-ghost btn-xs" onClick={()=> setDocxNotice("")}>Ẩn</button>
              </div>
            )}

            {/* Meta bar */}
            <div className="word-meta-bar">
              <div className="word-meta-field word-meta-field--title">
                <label className="word-meta-label">Tiêu đề <span className="req">*</span></label>
                <input
                  ref={titleRef}
                  className={`form-control word-title-input ${fieldErrors.title ? "input-error" : ""}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Tiếng Việt Lớp 3 - Bài 1: Ngày gặp lại"
                  maxLength={160}
                  aria-invalid={!!fieldErrors.title}
                />
                <span className={fieldErrors.title ? "field-error" : "word-meta-hint"}>{fieldErrors.title || `${title.length}/160`}</span>
              </div>
              <div className="word-meta-field">
                <label className="word-meta-label">Lớp</label>
                <select className="sort-select" value={String(grade)} onChange={(e) => setGrade(Number(e.target.value))}>
                  {[1,2,3,4,5].map((g) => <option key={g} value={String(g)}>Lớp {g}</option>)}
                </select>
              </div>
              <div className="word-meta-field">
                <label className="word-meta-label">Môn học</label>
                <select className="sort-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {VALID_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="word-meta-field">
                <label className="word-meta-label">Tập</label>
                <div className="seg-tabs">
                  <button type="button" className={`seg-tab ${term === 1 ? "active" : ""}`} onClick={() => setTerm(1)}>Tập 1</button>
                  <button type="button" className={`seg-tab ${term === 2 ? "active" : ""}`} onClick={() => setTerm(2)}>Tập 2</button>
                </div>
              </div>
              <div className="word-meta-field" style={{ minWidth:140 }}>
                <label className="word-meta-label">Mẫu nhanh</label>
                <select className="sort-select" defaultValue="" onChange={(e)=>{ const v=e.target.value; if(v) handleTemplate(v); e.target.selectedIndex=0; }}>
                  <option value="" disabled>Chọn mẫu...</option>
                  {WORD_TEMPLATES.map(t=> <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Word Toolbar */}
            <div className="word-toolbar">
              {/* Row 1 */}
              <div className="word-toolbar-row">
                <div className="word-toolbar-group">
                  <button type="button" className="word-tbtn" onClick={handleUndo} title="Hoàn tác (Ctrl+Z)"><Undo2 size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={handleRedo} title="Làm lại (Ctrl+Y)"><Redo2 size={15} /></button>
                  <span className="word-tsep" />
                  <button type="button" className="word-tbtn" onClick={handlePasteClipboard} title="Dán từ clipboard"><Copy size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={handleCopyHtml} title="Copy HTML"><Check size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={handleClearFormat} title="Xóa định dạng"><Eraser size={15} /></button>
                </div>
                <div className="word-toolbar-group">
                  <select className="word-select" value={fontFamily} onChange={e=> applyFontFamily(e.target.value)} title="Font">
                    {FONT_FAMILIES.map(f=> <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select className="word-select word-select-sm" value={fontSize} onChange={e=> applyFontSize(e.target.value)} title="Cỡ chữ">
                    {FONT_SIZES.map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select className="word-select word-select-xs" value={lineHeight} onChange={e=> applyLineHeight(e.target.value)} title="Giãn dòng">
                    {LINE_HEIGHTS.map(h=> <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="word-toolbar-group">
                  <div className="word-color-wrap">
                    <button type="button" className={`word-tbtn ${showColorPick==='text'?'on':''}`} onClick={()=> setShowColorPick(v=> v==='text'?null:'text')} title="Màu chữ (Palette)"><Palette size={15} /></button>
                    {showColorPick==='text' && (
                      <div className="word-color-pop word-color-pop--text">
                        <div className="word-color-pop-head">Màu chữ</div>
                        <div className="word-color-grid">
                          {COLOR_PALETTE.map(c=> (
                            <button type="button" key={c} className={`word-color-dot ${textColor===c?'is-selected':''}`} style={{background:c}} onClick={()=> applyTextColor(c)} title={c} aria-label={c}>
                              {textColor===c && <Check size={10} color="#fff" style={{filter:'drop-shadow(0 1px 1px rgba(0,0,0,0.5))'}}/>}
                            </button>
                          ))}
                        </div>
                        <div className="word-color-pop-foot">Chọn màu cho văn bản</div>
                      </div>
                    )}
                  </div>
                  <div className="word-color-wrap">
                    <button type="button" className={`word-tbtn ${showColorPick==='hilite'?'on':''}`} onClick={()=> setShowColorPick(v=> v==='hilite'?null:'hilite')} title="Highlight (Đánh dấu)"><Highlighter size={15} /></button>
                    {showColorPick==='hilite' && (
                      <div className="word-color-pop word-color-pop--hilite">
                        <div className="word-color-pop-head">Đánh dấu</div>
                        <div className="word-color-grid word-color-grid--hilite">
                          {HIGHLIGHTS.map(c=> (
                            <button type="button" key={c||'transparent'} className={`word-color-dot word-color-dot--hilite ${hiliteColor===c?'is-selected':''}`} style={{background:c==='transparent' ? '#fff' : c, border:c==='transparent'?'1.5px dashed #94a3b8':'1px solid #e2e8f0'}} onClick={()=> applyHilite(c)} title={c==='transparent'?'Không':c}>
                              {c==='transparent' ? <Eraser size={10} color="#64748b"/> : hiliteColor===c && <Check size={10} color="#1e293b"/>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="word-toolbar-group" style={{marginLeft:'auto'}}>
                  <button type="button" className={`word-tbtn ${showRuler?'on':''}`} onClick={handleRulerToggle} title="Thước kẻ — đồng bộ Setting"><Ruler size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> handleZoomSet(Math.max(70, zoom-10))} title="Thu nhỏ — Ctrl+[" ><ZoomOut size={15} /></button>
                  <span className="word-zoom-label">{zoom}%</span>
                  <button type="button" className="word-tbtn" onClick={()=> handleZoomSet(Math.min(150, zoom+10))} title="Phóng to — Ctrl+]"><ZoomIn size={15} /></button>
                  <select className="word-select word-select-xs" value={String(zoom)} onChange={e=> handleZoomSet(Number(e.target.value))}>
                    {PAGE_ZOOMS.map(z=> <option key={z} value={z}>{z}%</option>)}
                  </select>
                </div>
              </div>
              {/* Row 2 */}
              <div className="word-toolbar-row">
                <div className="word-toolbar-group">
                  <select className="word-select" defaultValue="p" onChange={e=> applyHeading(e.target.value)} title="Kiểu đoạn">
                    <option value="p">Thường</option>
                    <option value="h1">Tiêu đề 1 (H1)</option>
                    <option value="h2">Tiêu đề 2 (H2)</option>
                    <option value="h3">Tiêu đề 3 (H3)</option>
                    <option value="blockquote">Trích dẫn</option>
                    <option value="pre">Code</option>
                  </select>
                </div>
                <div className="word-toolbar-group">
                  <button type="button" className={`word-tbtn ${activeFmt.bold?'on':''}`} onClick={()=> exec("bold")} title="Đậm — Ctrl+B"><Bold size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.italic?'on':''}`} onClick={()=> exec("italic")} title="Nghiêng — Ctrl+I"><Italic size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.underline?'on':''}`} onClick={()=> exec("underline")} title="Gạch chân — Ctrl+U"><Underline size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.strike?'on':''}`} onClick={()=> exec("strikeThrough")} title="Gạch ngang — Ctrl+Shift+S"><Strikethrough size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> exec("subscript")} title="Chỉ số dưới — Ctrl+="><Subscript size={14} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> exec("superscript")} title="Chỉ số trên — Ctrl+Shift++"><Superscript size={14} /></button>
                </div>
                <div className="word-toolbar-group">
                  <button type="button" className={`word-tbtn ${activeFmt.justify==='left'?'on':''}`} onClick={()=> exec("justifyLeft")} title="Căn trái — Ctrl+L"><AlignLeft size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.justify==='center'?'on':''}`} onClick={()=> exec("justifyCenter")} title="Căn giữa — Ctrl+E"><AlignCenter size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.justify==='right'?'on':''}`} onClick={()=> exec("justifyRight")} title="Căn phải — Ctrl+R"><AlignRight size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.justify==='justify'?'on':''}`} onClick={()=> exec("justifyFull")} title="Căn đều — Ctrl+J"><AlignJustify size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> exec("outdent")} title="Giảm thụt lề"><Outdent size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> exec("indent")} title="Tăng thụt lề"><Indent size={15} /></button>
                </div>
                <div className="word-toolbar-group">
                  <button type="button" className={`word-tbtn ${activeFmt.ul?'on':''}`} onClick={()=> exec("insertUnorderedList")} title="Bullet — Ctrl+Shift+L"><List size={15} /></button>
                  <button type="button" className={`word-tbtn ${activeFmt.ol?'on':''}`} onClick={()=> exec("insertOrderedList")} title="Đánh số — Ctrl+Shift+N"><ListOrdered size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={insertHR} title="Đường kẻ ngang"><Minus size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> exec("formatBlock","<blockquote>")} title="Trích dẫn"><Quote size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> exec("formatBlock","<pre>")} title="Code block"><Code size={15} /></button>
                </div>
                <div className="word-toolbar-group">
                  <button type="button" className="word-tbtn" onClick={insertLink} title="Chèn link — Ctrl+K"><Link2 size={15} /></button>
                  <button type="button" className="word-tbtn" onClick={()=> fileImgRef.current?.click()} title="Chèn ảnh"><ImageIcon size={15} /></button>
                  <input ref={fileImgRef} type="file" accept="image/*" hidden onChange={e=> { const f=e.target.files?.[0]; if(f) insertImageFromFile(f); e.target.value=""; }} />
                  <div className="word-color-wrap">
                    <button type="button" className={`word-tbtn ${showTablePick?'on':''}`} onClick={()=> setShowTablePick(v=>!v)} title="Chèn bảng (Table)"><Table2 size={15} /></button>
                    {showTablePick && (
                      <div className="word-table-pop" onMouseLeave={()=> setTableHover({r:0,c:0})}>
                        <div className="word-table-pop-title">Chèn bảng</div>
                        <div className="word-table-grid" style={{gridTemplateColumns:'repeat(5, 1fr)'}}>
                          {Array.from({length:25},(_,i)=>{
                            const r=Math.floor(i/5)+1, c=i%5+1;
                            const active = r<=tableHover.r && c<=tableHover.c;
                            return (
                              <button type="button"
                                key={`${r}-${c}`}
                                className={`word-table-cell ${active?'is-hover':''}`}
                                onMouseEnter={()=> setTableHover({r,c})}
                                onClick={()=> insertTable(r,c)}
                                title={`${r} × ${c}`}
                                aria-label={`${r} x ${c}`}
                              />
                            );
                          })}
                        </div>
                        <div className="word-table-pop-label">{tableHover.r>0 ? `${tableHover.r} × ${tableHover.c} bảng` : 'Di chuột chọn kích thước'}</div>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:6, justifyContent:'center'}}>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={()=> insertTable(3,3)}>3×3</button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={()=> insertTable(4,5)}>4×5</button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={()=> insertTable(5,5)}>5×5</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button type="button" className="word-tbtn" onClick={()=> setShowFind(v=>!v)} title="Tìm & thay thế (Ctrl+H / Ctrl+F)"><Search size={15} /></button>
                </div>
              </div>
              {showFind && (
                <div className="word-find-bar">
                  <span className="word-find-label"><Search size={12}/> Tìm</span>
                  <input className="word-find-input" value={findText} onChange={e=> setFindText(e.target.value)} placeholder="Từ khóa..." onKeyDown={e=> e.key==='Enter' && doFind()} />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={doFind}>Tìm</button>
                  <span className="word-find-label">Thay</span>
                  <input className="word-find-input" value={replaceText} onChange={e=> setReplaceText(e.target.value)} placeholder="Thay bằng..." />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={doReplace}>Thay</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={doReplaceAll}>Thay tất cả</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={()=> setShowFind(false)}><X size={12}/></button>
                </div>
              )}
            </div>

            {/* Editor / Preview area */}
            <div className="word-editor-wrap">
              {showRuler && !showPreview && (
                <div className="word-ruler">
                  <div className="word-ruler-inner">
                    <span>0</span><span>5</span><span>10</span><span>15</span><span>cm</span>
                    <div className="word-ruler-marks">
                      {Array.from({length:30}).map((_,i)=><i key={i} className={i%5===0?'major':''} />)}
                    </div>
                  </div>
                </div>
              )}
              <div className="word-pages-area" style={{ background: showPreview ? "#f1f5f9" : "#eef2f7" }}>
                {showPreview ? (
                  <div className={`word-pages ${zoom!==100?'is-zoomed':''}`} style={{"--word-zoom": `${zoom}%`}}>
                    {previewPages.map((pHtml, idx)=> (
                      <div key={idx} className="word-page word-page-preview word-preview-page">
                        <div className="word-page-header">
                          <span>{subject} — Lớp {grade} — Tập {term}</span>
                          <span>{title ? (title.slice(0,32) + (title.length>32?"…":"")) : "Chưa có tiêu đề"} — {idx+1}/{previewPages.length}</span>
                        </div>
                        <div className="word-preview-content" dangerouslySetInnerHTML={{ __html: pHtml || "<p style='color:#94a3b8; text-align:center; padding:40px 0;'>Chưa có nội dung</p>" }} />
                        <div className="word-page-footer">
                          <span>SGK — {subject}</span>
                          <span>Trang {idx+1} / {previewPages.length}</span>
                          <span>{new Date().toLocaleDateString("vi-VN")}</span>
                        </div>
                        <div className="word-page-number">{idx+1}</div>
                      </div>
                    ))}
                    {previewPages.length>1 && (
                      <div className="word-page-count-badge">
                        <Layers size={12}/> {previewPages.length} trang A4 — hien thi phan trang that (khi in)
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`word-pages ${zoom!==100?'is-zoomed':''}`} style={{"--word-zoom": `${zoom}%`}}>
                    <div className="word-page word-page-edit" style={{ fontFamily: fontFamily==="inherit"?undefined:fontFamily, fontSize, lineHeight }}>
                      {/* page header inside paper */}
                      <div className="word-page-header word-page-header-edit">
                        <span>{subject} · Lớp {grade} · Tập {term}</span>
                        <span style={{opacity:0.55}}>{pageCount} trang</span>
                      </div>
                      <div
                        ref={editorRef}
                        className="word-editable"
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={(()=>{ try{ return loadSettings().editor?.spellCheck !== false; }catch{ return true; }})()}
                        onInput={syncHtml}
                        onBlur={syncHtml}
                        onKeyUp={updateActiveStates}
                        onMouseUp={()=>{ saveSelection(); updateActiveStates(); }}
                        onPaste={(e)=>{
                          // allow paste but clean a bit after
                          setTimeout(syncHtml, 10);
                        }}
                        data-placeholder="Bắt đầu soạn nội dung ở đây... (Ctrl+B đậm, Ctrl+I nghiêng, bullet/numbered ở thanh công cụ)"
                        style={{ minHeight: 520, outline:"none" }}
                      />
                      {/* page footer */}
                      <div className="word-page-footer word-page-footer-edit">
                        <span>{title ? title.slice(0,48) : "Tiêu đề sách"}</span>
                        <span>— {pageCount} trang —</span>
                      </div>
                      {/* page edge decor */}
                      <div className="word-page-number">1</div>
                    </div>
                    <div className="word-pages-hint">
                      <BookOpen size={12}/> Cạnh trang sách: lẻ là {((pageCount*1800)/5000).toFixed(1)}k ký tự — Phóng to/thu nhỏ ở thanh công cụ · <span style={{color:'var(--color-action, var(--primary))'}}>Ctrl+S lưu nhanh</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {fieldErrors.content && <div className="word-field-error"><AlertCircle size={14}/> {fieldErrors.content}</div>}
            {error && (
              <div className="word-error">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="word-stats">
              <span>{stats.chars.toLocaleString("vi-VN")} ký tự</span>
              <span>·</span>
              <span>{stats.words.toLocaleString("vi-VN")} từ</span>
              <span>·</span>
              <span>{stats.charsNoSpace.toLocaleString("vi-VN")} ký tự (không cách)</span>
              <span>·</span>
              <span>{stats.sizeKB.toFixed(1)} KB HTML</span>
              <span>·</span>
              <span style={{color:'var(--color-action, var(--primary))',fontWeight:800}}>{stats.pages} trang A4</span>
              <span>·</span>
              <span>~{stats.readMin} phút đọc</span>
              {draftTooLarge && !isEdit && (
                <span style={{color:'#b45309',fontWeight:700}} title="Nội dung có ảnh nhúng nên quá lớn cho bộ nhớ tạm trình duyệt — bấm Tạo sách để lưu lên máy chủ">· Nháp lớn: không tự lưu tạm</span>
              )}
              <span style={{marginLeft:'auto', display:'inline-flex', gap:6, alignItems:'center'}}>
                <span className="word-stat-dot" style={{background:'#22c55e'}} /> Word mode
              </span>
            </div>

            <div className="word-modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Hủy (Esc)</button>
              {!isEdit && <button type="button" className="btn btn-secondary" onClick={handleClearDraft} disabled={loading || (!title && !htmlToPlainText(html))}><Trash2 size={14} /> Xóa nháp</button>}
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading || fetching}>
                {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Đang lưu...</> : isEdit ? <><Save size={14} /> Lưu thay đổi (Ctrl+S)</> : <><Save size={14} /> Tạo sách</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </WordModalDropLayer>
  );
}

// ── Lớp bọc kéo-thả cho modal Word: .docx → nhập Word, ảnh → chèn vào bài ──
function WordModalDropLayer({ children, onDocx, onImage, onError }) {
  const { dragActive, bind } = useFileDrag({
    accept: ".docx,image/*,.png,.jpg,.jpeg,.gif,.webp",
    multiple: false,
    onFiles: (f) => {
      const file = Array.isArray(f) ? f[0] : f;
      if (!file) return;
      const n = (file.name || "").toLowerCase();
      if (n.endsWith(".docx")) onDocx?.(file);
      else if ((file.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) onImage?.(file);
      else onError?.(`Kéo thả hỗ trợ .docx và ảnh. File "${file.name}" chưa hỗ trợ ở đây.`);
    },
    onError,
  });
  return (
    <div {...bind} style={{ position: "relative" }} title="Mẹo: kéo thả file .docx hoặc ảnh vào đây để nhập nhanh">
      {dragActive && (
        <div className="global-drag-overlay" aria-hidden="true"><span>Thả .docx để nhập Word • Thả ảnh để chèn</span></div>
      )}
      {children}
    </div>
  );
}