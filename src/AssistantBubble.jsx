// ── AI Assistant Bubble ───────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  X,
  Bot,
  Trash2,
  Settings,
  Check,
  Copy,
  Download,
  RefreshCw,
  NotebookPen,
} from "lucide-react";
import { TEACHER_SYSTEM_PROMPT } from "./appPersona";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { loadSettings } from "./settingsStore";
import { soundManager } from "./audio/soundManager.js";
import { searchAll } from "./searchIndex";
import { safeGetJSON, safeSetJSON, safeGetString, safeSetString, safeRemove } from "./safeStorage";
import { addVocabEntry } from "./userdata";

const MAX_MSGS = 40;
const HISTORY_KEY = "assistant_history";
const DRAFT_KEY = "assistant_draft";

// Always use teacher mode - the app is designed for teachers
function getSystemPrompt() {
  return TEACHER_SYSTEM_PROMPT;
}

const SUGGESTIONS = [
  'Soạn mục tiêu bài học: "Phép cộng trong phạm vi 10" (Toán 1)',
  "Tạo 5 câu hỏi trắc nghiệm Toán lớp 2 có đáp án",
  "Soạn giáo án 45 phút: Luyện đọc - tiết Tập đọc lớp 3 (có hoạt động khởi động, phát triển, củng cố)",
  "Tạo ma trận đề 10 câu cho bài kiểm tra 15 phút Toán lớp 4",
  "Mẫu rubric chấm bài kiểm tra tự luận (tiểu học)",
  "Gợi ý phân hóa: 3 biến thể hoạt động cho học sinh nhanh/chuẩn/chậm",
];

const SCAN_SHORTCUT_TIP =
  "📷 Quét SGK: mở sách → bấm ✂ Quét vùng → kéo chọn nội dung → AI tạo học liệu.";

const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function loadHistory() {
  try {
    const value = safeGetJSON(HISTORY_KEY, [], Array.isArray);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (message) =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.text === "string",
      )
      .slice(-MAX_MSGS);
  } catch (e) {
    console.warn("[storage] verify failed assistant_history", e);
    return [];
  }
}

// ─── Simple Markdown Renderer (same as BookReader) ──────────────────────────
function MarkdownText({ text }) {
  if (!text) return null;

  const renderInline = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*"))
        return <em key={i}>{p.slice(1, -1)}</em>;
      if (p.startsWith("`") && p.endsWith("`"))
        return (
          <code key={i} className="ui-s-76054d">
            {p.slice(1, -1)}
          </code>
        );
      return p;
    });
  };

  const lines = text.split("\n");
  const elements = [];
  let ulItems = [];
  let olItems = [];

  const flushLists = () => {
    if (ulItems.length) {
      elements.push(
        <ul key={`ul${elements.length}`} className="ui-s-90075f">
          {ulItems}
        </ul>,
      );
      ulItems = [];
    }
    if (olItems.length) {
      elements.push(
        <ol key={`ol${elements.length}`} className="ui-s-90075f">
          {olItems}
        </ol>,
      );
      olItems = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushLists();
      elements.push(
        <h5 key={i} className="ui-s-27b976">
          {renderInline(line.slice(4))}
        </h5>,
      );
    } else if (line.startsWith("## ")) {
      flushLists();
      elements.push(
        <h4
          key={i}
          style={{
            color: "var(--primary)",
            margin: "0.8rem 0 0.2rem",
            fontSize: "0.95rem",
            fontWeight: 800,
            borderBottom: "1px solid var(--primary-light)",
            paddingBottom: "0.2rem",
          }}
        >
          {renderInline(line.slice(3))}
        </h4>,
      );
    } else if (line.startsWith("# ")) {
      flushLists();
      elements.push(
        <h3 key={i} className="ui-s-64c7f3">
          {renderInline(line.slice(2))}
        </h3>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (olItems.length) flushLists();
      ulItems.push(
        <li key={i} className="ui-s-bad61f">
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      if (ulItems.length) flushLists();
      olItems.push(
        <li key={i} className="ui-s-bad61f">
          {renderInline(line.replace(/^\d+\.\s+/, ""))}
        </li>,
      );
    } else if (line.trim() === "---" || line.trim() === "***") {
      flushLists();
      elements.push(<hr key={i} className="ui-s-5f2912" />);
    } else if (line.trim() === "") {
      flushLists();
    } else {
      flushLists();
      elements.push(
        <p key={i} className="ui-s-de962d">
          {renderInline(line)}
        </p>,
      );
    }
  });
  flushLists();

  return <div className="ui-s-85c55b">{elements}</div>;
}

// ─── AI Assistant Bubble ────────────────────────────────────────────────────
export default function AssistantBubble({
  geminiKey,
  onOpenSettings,
  teacherMode = true,
  appContext = {},
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadHistory());
  const [input, setInput] = useState(() => {
    try {
      return safeGetString(DRAFT_KEY, "") || "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
const [savedVocabId, setSavedVocabId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const wrapRef = useRef(null);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const activeRequestIdRef = useRef(null);
  const requestVersionRef = useRef(0);
  const [copyError, setCopyError] = useState("");

  const persist = (msgs) => {
    try {
      const r = safeSetJSON(HISTORY_KEY, msgs.slice(-MAX_MSGS));
      if (!r.ok) console.warn("[AssistantBubble] persist failed", r);
    } catch (err) {
      console.error("Failed to save AI chat history:", err);
    }
  };

  // Outside click + Escape to close
  useEffect(() => {
    return () => {
      if (activeRequestIdRef.current)
        aiService.cancelRequest(activeRequestIdRef.current);
      requestVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset unread badge & focus input when opening
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  // Clear-confirm timeout
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  // Drag & Drop state & handlers
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const handleHeaderMouseDown = (e) => {
    if (e.target.closest("button, input, textarea, a, [role='button']")) return;
    if (e.target.closest(".aia-header")) {
      e.preventDefault();
      setIsDragging(true);
      const rect = panelRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      if (panelRef.current) {
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        const maxX = window.innerWidth - panelRef.current.offsetWidth;
        const maxY = window.innerHeight - panelRef.current.offsetHeight;
        panelRef.current.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        panelRef.current.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        panelRef.current.style.right = "auto";
        panelRef.current.style.bottom = "auto";
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const callAI = async (body, requestId) => {
    const model = (() => {
      try {
        return loadSettings().ai?.model || "gemini-2.5-flash";
      } catch {
        return "gemini-2.5-flash";
      }
    })();
    try {
      return await aiService.callAI({
        apiKey: geminiKey,
        model,
        contents: body.contents,
        systemInstruction: body.systemInstruction,
        generationConfig: body.generationConfig,
        requestId,
      });
    } catch (err) {
      // Preserve AIError status/code for caller
      if (err && err.status) throw err;
      const friendlyMsg = getFriendlyErrorMessage(err.status, err.message);
      const e = new Error(friendlyMsg);
      e.status = err.status;
      e.code = err.code;
      throw e;
    }
  };

  const appendBot = (msgs, extra) => {
    const next = [
      ...msgs,
      { id: genId(), role: "assistant", at: Date.now(), ...extra },
    ];
    setMessages(next);
    persist(next);
    if (!open) setUnread((u) => u + 1);
  };

  const buildAppContext = async (query) => {
    const books = Array.isArray(appContext.books) ? appContext.books : [];
    const currentBook = appContext.currentBook;
    const settings = appContext.settings || {};
    const catalog = books.slice(0, 80).map((book) => ({
      title: book.title || book.filename,
      filename: book.filename,
      subject: book.subject || book.monHoc || "",
      grade: book.grade || book.lop || "",
      pages: book.numPages || book.pages || undefined,
    }));
    let relevantText = [];
    try {
      const results = await searchAll(query, books);
      relevantText = results
        .flatMap((result) =>
          result.hits.slice(0, 4).map((hit) => ({
            book: result.book.title || result.book.filename,
            page: hit.page,
            kind: hit.kind,
            snippet: hit.snippet,
          })),
        )
        .slice(0, 8);
    } catch (error) {
      console.warn("Không thể lấy ngữ cảnh sách từ chỉ mục:", error);
    }
    return {
      app: "Hành trang Tiểu học / SGK App",
      availableAreas: [
        "Thư viện SGK và trình đọc PDF",
        "Tìm kiếm toàn văn sách và OCR",
        "Nghiên cứu: trích đoạn, tài liệu tham khảo, khái niệm, bộ sưu tập",
        "Soạn dạy: kế hoạch bài dạy, hoạt động, phiếu học tập, ngân hàng câu hỏi",
        "Nhật ký thực tập và phản ánh sau giờ dạy",
        "Nhiệm vụ, thống kê, từ vựng và đánh dấu",
        "Cài đặt, sao lưu/khôi phục và dữ liệu local",
      ],
      currentView: appContext.view || "dashboard",
      currentBook: currentBook
        ? {
            title: currentBook.title || currentBook.filename,
            filename: currentBook.filename,
            subject: currentBook.subject || currentBook.monHoc || "",
            grade: currentBook.grade || currentBook.lop || "",
          }
        : null,
      bookCount: books.length,
      books: catalog,
      favoritesCount: appContext.favoritesCount || 0,
      historyCount: appContext.historyCount || 0,
      settings: {
        // App 1 ngôn ngữ (Tiếng Việt) — không còn key general.language trong Settings
        language: "vi",
        theme: settings.appearance?.theme,
        readingLayout: settings.reading?.layout,
        aiModel: settings.ai?.model,
        responseLength: settings.ai?.responseLength,
      },
      relevantBookExtracts: relevantText,
      contextLimit:
        books.length > catalog.length
          ? "Danh mục đã rút gọn 80 sách."
          : undefined,
    };
  };

  useEffect(() => {
    try {
      if (input.trim()) safeSetString(DRAFT_KEY, input);
      else safeRemove(DRAFT_KEY);
    } catch {}
  }, [input]);

  const send = async (raw) => {
    const q = (raw ?? input).trim();
    if (!q || loading) return;
    setInput("");
    const msgs = [
      ...messages,
      { id: genId(), role: "user", text: q, at: Date.now() },
    ];
    setMessages(msgs);
    persist(msgs);

    if (!geminiKey) {
      appendBot(msgs, {
        text: "Chưa có API Key! Trợ lý cần Gemini AI mới trả lời được. Nhấn nút bên dưới để mở Cài đặt và dán khóa API nhé.",
        openSettings: true,
      });
      return;
    }

    setLoading(true);
    const requestId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    activeRequestIdRef.current = requestId;
    const requestVersion = ++requestVersionRef.current;
    try {
      // Fix duplicate: msgs đã chứa q, không thêm lại
      const history = messages.slice(-11).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));
      const appContextData = await buildAppContext(q);
      const contextInstruction = `\n\nNGỮ CẢNH APP VÀ SÁCH HIỆN TẠI (dữ liệu local, không tiết lộ API key):\n${JSON.stringify(appContextData, null, 2)}\n\nHãy ưu tiên dùng các trích đoạn sách liên quan ở trên. Nếu không có trích đoạn hoặc sách chưa được lập chỉ mục, hãy nói rõ và hướng dẫn người dùng lập chỉ mục/mở đúng sách, không tự bịa nội dung.`;
      const body = {
        contents: [...history, { role: "user", parts: [{ text: q }] }],
        systemInstruction: {
          parts: [
            { text: `${getSystemPrompt(teacherMode)}${contextInstruction}` },
          ],
        },
        generationConfig: (() => {
          const s = loadSettings();
          const lengths = { concise: 900, balanced: 2000, detailed: 3500 };
          return {
            temperature: Number.isFinite(s.ai?.temperature)
              ? s.ai.temperature
              : 0.5,
            maxOutputTokens: lengths[s.ai?.responseLength] || 2000,
          };
        })(),
      };
      const text = await callAI(body, requestId);
      if (requestVersion !== requestVersionRef.current) return;
      appendBot(msgs, { text, retryText: q });
      try { soundManager.play("aiComplete"); } catch {}
    } catch (err) {
      if (
        err?.code !== "CANCELLED" &&
        requestVersion === requestVersionRef.current
      ) {
        appendBot(msgs, {
          text: `⚠️ ${err.message}`,
          error: true,
          retryText: q,
        });
      }
    } finally {
      if (activeRequestIdRef.current === requestId)
        activeRequestIdRef.current = null;
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (activeRequestIdRef.current)
      aiService.cancelRequest(activeRequestIdRef.current);
    requestVersionRef.current += 1;
    setLoading(false);
    setMessages([]);
    persist([]);
    setConfirmClear(false);
  };

  const downloadChat = () => {
    if (!messages.length) return;
    const content = messages
      .map(
        (message) =>
          `${message.role === "user" ? "Bạn" : "Trợ lý AI"}:\n${message.text}`,
      )
      .join("\n\n---\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tro-ly-ai-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyMsg = async (id, text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopyError("Không thể sao chép. Hãy chọn và sao chép thủ công.");
      setTimeout(() => setCopyError(""), 3000);
    }
  };

  // Lưu câu trả lời của AI vào Sổ tay từ vựng (word = câu hỏi tương ứng)
  const saveMsgToNotebook = (id, text) => {
    try {
      const idx = messages.findIndex((m) => m.id === id);
      let question = "";
      for (let i = idx > 0 ? idx - 1 : messages.length - 1; i >= 0; i--) {
        if (messages[i] && messages[i].role === "user") {
          question = messages[i].text;
          break;
        }
      }
      const word =
        String(question || "").trim().slice(0, 80) || "Ghi chú từ Trợ lý AI";
      addVocabEntry({
        word,
        meaning: String(text || "").slice(0, 1500),
        file: "",
        bookTitle: "",
        grade: null,
        page: null,
        tags: ["trợ lý ai"],
      });
      setSavedVocabId(id);
      setTimeout(() => setSavedVocabId((v) => (v === id ? null : v)), 2500);
    } catch (e) {
      console.warn("[AssistantBubble] saveMsgToNotebook failed:", e);
      setCopyError("Không lưu được vào sổ tay từ vựng (bộ nhớ đầy?).");
      setTimeout(() => setCopyError(""), 3000);
    }
  };

  const fmtTime = (at) => {
    try {
      return new Date(at).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="aia-wrap" ref={wrapRef}>
      {open && (
        <div
          className="aia-panel ui-s-c40f8e"
          id="aia-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Trợ lý sư phạm AI"
          ref={panelRef}
        >
          <div className="aia-header" onMouseDown={handleHeaderMouseDown}>
            <span className="aia-header-title">
              <Bot size={18} /> Trợ lý sư phạm AI
              <span className="aia-online" title="AI Gemini" />
            </span>
            <div className="aia-header-actions">
              <button
                className={`aia-hbtn${confirmClear ? " confirm" : ""}`}
                onClick={clearChat}
                title="Xóa hội thoại"
                aria-label="Xóa hội thoại"
              >
                {confirmClear ? "Chắc chắn?" : <Trash2 size={15} />}
              </button>
              <button
                className="aia-hbtn"
                onClick={() => setOpen(false)}
                title="Đóng"
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
              <button
                className="aia-hbtn"
                onClick={downloadChat}
                title="Tải hội thoại"
                aria-label="Tải hội thoại"
                disabled={!messages.length}
              >
                <Download size={15} />
              </button>
            </div>
          </div>

          <div className="aia-body" ref={bodyRef} role="log" aria-live="polite">
            {messages.length === 0 && !loading && (
              <div className="aia-empty">
                <div className="aia-empty-icon">
                  <Bot size={30} />
                </div>
                <p>
                  Xin chào! Tôi là trợ lý sư phạm — giúp bạn soạn giáo án, giải
                  thích thuật ngữ, gợi ý hoạt động dạy học, tạo câu hỏi kiểm tra
                  theo GDPT 2018.
                </p>
                <div className="aia-chips">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="aia-chip"
                      onClick={() => send(s)}
                      disabled={loading}
                      title={loading ? "Đang trả lời..." : s}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    className="aia-chip"
                    onClick={() => send(SCAN_SHORTCUT_TIP)}
                    disabled={loading}
                    title="Hướng dẫn quét SGK"
                    style={{
                      borderColor: "var(--primary)",
                      color: "var(--primary)",
                      fontWeight: 700,
                    }}
                  >
                    📷 Quét SGK
                  </button>
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`aia-msg ${m.role === "user" ? "user" : m.error ? "error" : "bot"}`}
              >
                {m.role === "user" ? (
                  <span className="ui-s-2658b2">{m.text}</span>
                ) : (
                  <>
                    <MarkdownText text={m.text} />
                    {m.openSettings && (
                      <button
                        className="btn btn-primary ui-s-10a0f1"
                        onClick={onOpenSettings}
                      >
                        <Settings size={13} /> Mở Cài đặt AI
                      </button>
                    )}
                    {m.retryText && !loading && (
                      <button
                        className="aia-copy"
                        onClick={() => send(m.retryText)}
                        title="Gửi lại câu hỏi này"
                      >
                        <RefreshCw size={12} />{" "}
                        {m.error ? "Thử lại" : "Làm mới"}
                      </button>
                    )}
                    {!m.openSettings && (
                      <button
                        className="aia-copy"
                        onClick={() => copyMsg(m.id, m.text)}
                        title="Sao chép câu trả lời"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check size={12} /> Đã chép
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Sao chép
                          </>
                        )}
                      </button>
                    )}
                    {!m.openSettings && !m.error && (
                      <button
                        className="aia-copy"
                        onClick={() => saveMsgToNotebook(m.id, m.text)}
                        title="Lưu câu trả lời này vào Sổ tay từ vựng"
                      >
                        {savedVocabId === m.id ? (
                          <>
                            <Check size={12} /> Đã lưu
                          </>
                        ) : (
                          <>
                            <NotebookPen size={12} /> Lưu sổ tay
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                <span className="aia-msg-time">{fmtTime(m.at)}</span>
              </div>
            ))}

            {loading && (
              <div className="aia-typing" aria-label="AI đang trả lời">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
          {copyError && (
            <div className="aia-error" role="status">
              {copyError}
            </div>
          )}

          <form
            className="aia-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              className="aia-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Hỏi: soạn giáo án, tạo câu hỏi, gợi ý hoạt động, ma trận đề…"
              disabled={loading}
              aria-label="Nội dung câu hỏi cho trợ lý AI"
              rows={1}
            />
            <button
              className="aia-send"
              type="submit"
              disabled={!loading && !input.trim()}
              onClick={(e) => {
                if (loading) {
                  e.preventDefault();
                  if (activeRequestIdRef.current) {
                    aiService.cancelRequest(activeRequestIdRef.current);
                  }
                }
              }}
              aria-label={loading ? "Dừng yêu cầu" : "Gửi"}
              title={loading ? "Dừng yêu cầu" : "Gửi"}
            >
              {loading ? <X size={19} /> : <Send size={18} />}
            </button>
          </form>
        </div>
      )}

      <button
        className="aia-fab"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Đóng trợ lý" : "Trợ lý sư phạm AI"}
        aria-label={open ? "Đóng trợ lý" : "Trợ lý sư phạm AI"}
        aria-expanded={open}
        aria-controls="aia-panel"
      >
        {open ? (
          <X size={24} />
        ) : (
          <>
            <Bot size={26} />
            {unread > 0 && <span className="aia-badge">{unread}</span>}
          </>
        )}
      </button>
    </div>
  );
}
