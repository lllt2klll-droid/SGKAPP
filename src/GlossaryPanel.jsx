import React, { useState } from "react";
import {
  X,
  Search,
  GraduationCap,
  History,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { loadSettings } from "./settingsStore";
import MarkdownText from "./MarkdownText";
import { safeGetJSON, safeSetJSON } from "./safeStorage";
const HISTORY_KEY = "glossary_history";

const SUGGESTIONS = [
  "Đánh giá vì sự tiến bộ của học sinh",
  "Năng lực đặc thù",
  "Phẩm chất chủ yếu",
  "Dạy học tích hợp",
  "Giáo dục STEM",
  "Hoạt động trải nghiệm",
  "Dạy học phân hóa",
  "Trò chơi học tập",
];

export default function GlossaryPanel({ geminiKey, onClose, inline = false }) {
  const [term, setTerm] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return safeGetJSON(HISTORY_KEY, [], Array.isArray);
    } catch (e) {
      console.warn("[GlossaryPanel] safeGetJSON failed for glossary_history", e);
      return [];
    }
  });

  const lookup = async (t = term) => {
    const q = (t || "").trim();
    if (!q) return;
    if (!geminiKey) {
      setError("Chưa có API Key! Hãy mở Cài đặt AI để nhập khóa nhé.");
      return;
    }
    setTerm(q);
    setLoading(true);
    setError("");
    setResult("");
    try {
      const model = (()=>{ try{ return loadSettings().ai?.model || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; } })();
      const text = await aiService.callAI({
        apiKey: geminiKey,
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Giải thích thuật ngữ sư phạm tiểu học: "${q}". Trình bày ngắn gọn 3 phần: (1) Khái niệm, (2) Ý nghĩa trong dạy học tiểu học, (3) Ví dụ áp dụng cụ thể. Tối đa 180 từ, dùng từ chuyên môn chuẩn theo chương trình GDPT 2018.`,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: "Bạn là giảng viên ngành Giáo dục Tiểu học, thành thạo chương trình GDPT 2018 và nghiệp vụ sư phạm. Trả lời chính xác, súc tích, có ví dụ minh họa.",
            },
          ],
        },
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        timeout: 60000,
        maxRetries: 2,
        requestId: `glossary-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      });
      setResult(text);
      const next = [
        q,
        ...history.filter((h) => h.toLowerCase() !== q.toLowerCase()),
      ].slice(0, 10);
      setHistory(next);
      try {
        const res = safeSetJSON(HISTORY_KEY, next);
        if (!res.ok) {
          if (res.quota) console.warn("[safeStorage] Quota exceeded on glossary_history", res);
          else console.warn("[GlossaryPanel] safeSetJSON failed for glossary_history", res);
        }
      } catch (err) {
        console.warn("[GlossaryPanel] Failed to save glossary history:", err);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err.status, err.message));
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const body = (
    <>
      <p className="gl-intro">
        Tra cứu thuật ngữ chuyên ngành Giáo dục Tiểu học (PPDH, năng lực, phẩm
        chất, đánh giá…) theo chương trình GDPT 2018 — dành cho giáo viên.
      </p>

      <form
        className="gl-search"
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
      >
        <input className="form-control flex-1"
          placeholder="Nhập thuật ngữ, ví dụ: Dạy học tích hợp…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button className="btn btn-primary btn-pad-nowrap"
          type="submit"
          disabled={loading || !term.trim()}
        >
          {loading ? <Loader2 size={15} /> : <Search size={15} />} Tra cứu
        </button>
      </form>

      {history.length > 0 && (
        <div className="gl-history">
          <span className="gl-history-label">
            <History size={13} /> Gần đây:
          </span>
          <div className="gl-chips">
            {history.map((h, i) => (
              <button key={i} className="gl-chip" onClick={() => lookup(h)} disabled={loading} title={loading ? "Đang tra cứu..." : h}>
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="gl-suggestions">
        <span className="gl-history-label">Gợi ý:</span>
        <div className="gl-chips">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} className="gl-chip" onClick={() => lookup(s)} disabled={loading} title={loading ? "Đang tra cứu..." : s}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="util-error">{error}</div>}
      {loading && (
        <div className="util-loading">
          <div className="spinner w-14-h-14" /> Đang tra
          cứu…
        </div>
      )}

      {result && !loading && (
        <div className="gl-result">
          <div
            className="flex-row-between"
          >
            <h4 className="gl-result-title">{term}</h4>
            <button
              className="btn btn-secondary"
              style={{
                padding: "0.25rem 0.55rem",
                fontSize: "0.72rem",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={copyResult}
            >
              {copied ? (
                <>
                  <Check size={13} /> Đã chép
                </>
              ) : (
                <>
                  <Copy size={13} /> Sao chép
                </>
              )}
            </button>
          </div>
          <div style={{ fontSize: "0.86rem", lineHeight: 1.55 }}>
            <MarkdownText text={result} />
          </div>
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="gl-inline">
        <div className="modal-header">
          <h3
            className="flex-row gap-sm m-0"
          >
            <GraduationCap size={18} /> Bảng thuật ngữ sư phạm tiểu học
          </h3>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content gl-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="stack-row gap-sm">
            <GraduationCap size={18} /> Bảng thuật ngữ sư phạm tiểu học
          </h3>
          <button
            className="util-bubble-close dark"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
