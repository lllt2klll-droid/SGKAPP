import { useEffect, useRef, useState } from "react";
import { Bug, ChevronDown, Copy, Download, ExternalLink, Gauge, Info, Lightbulb, MessageSquareHeart, Palette, PenLine, RefreshCw, Send, Star, ThumbsUp } from "lucide-react";
import { APP_COPYRIGHT, APP_DEVELOPER } from "../ai/appPersona.js";
import { apiUrl } from "../services/apiConfig.js";
import { Card } from "./SettingsPrimitives.jsx";

/* Form (từ forms.gle/odfjvFnSwdQkqG4v5) chỉ có 1 câu "Góp ý của bạn" — entry.1862600968
   (đã verify: GET/POST formResponse đều trả 200 + "Câu trả lời của bạn đã được ghi lại.") */
const FEEDBACK_FORM_ENDPOINT = "https://docs.google.com/forms/d/e/1FAIpQLScN0QVURKYvvawAyOTHtDElyTzGV6MQ9DwjTjKe2A_bIT_txw/formResponse";
const FEEDBACK_FORM_VIEW = "https://docs.google.com/forms/d/e/1FAIpQLScN0QVURKYvvawAyOTHtDElyTzGV6MQ9DwjTjKe2A_bIT_txw/viewform";
const FEEDBACK_ENTRY = "entry.1862600968";
const FEEDBACK_DRAFT_KEY = "sgk_feedback_draft";

const FEEDBACK_TOPICS = [
  { id: "feature", label: "Đề xuất tính năng", icon: Lightbulb },
  { id: "bug", label: "Báo lỗi", icon: Bug },
  { id: "ui", label: "Giao diện", icon: Palette },
  { id: "perf", label: "Hiệu năng", icon: Gauge },
  { id: "content", label: "Nội dung sách", icon: PenLine },
  { id: "other", label: "Khác", icon: ThumbsUp },
];

const FEEDBACK_PHRASES = {
  feature: [
    "Em muốn có tính năng … trong app",
    "Nên thêm chế độ … cho lớp học của em",
    "Kính đề xuất mở rộng …",
  ],
  bug: [
    "Em gặp lỗi khi … (lặp lại ở bước …)",
    "App bị đứng/lỗi sau khi …",
    "Màn hình hiển thị sai khi em …",
  ],
  ui: [
    "Giao diện đẹp, dễ dùng — em muốn chỉnh …",
    "Nên thêm màu/chữ … cho dễ đọc hơn",
    "Nút … hơi nhỏ trên điện thoại",
  ],
  perf: [
    "App hơi chậm khi mở …",
    "Tốn nhiều dung lượng khi …",
    "Đề xuất tối ưu phần …",
  ],
  content: [
    "Nội dung SGK lớp … thiếu/bổ sung …",
    "Ôn tập phần … chưa khớp sách in",
    "Thêm tài liệu/ảnh cho bài …",
  ],
  other: [
    "Em rất thích app, cảm ơn Thầy/cô!",
    "Góp ý chung về trải nghiệm",
    "Cần hướng dẫn thêm về phần …",
  ],
};

const FEEDBACK_TOPIC_LABELS = Object.fromEntries(FEEDBACK_TOPICS.map((t) => [t.id, t.label]));
const FEEDBACK_STARS = [
  { v: 1, label: "Chưa hài lòng" },
  { v: 2, label: "Tạm ổn" },
  { v: 3, label: "Ổn" },
  { v: 4, label: "Tốt" },
  { v: 5, label: "Rất tốt" },
];

function loadFeedbackDraft() {
  try {
    const raw = localStorage.getItem(FEEDBACK_DRAFT_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw);
    return d && typeof d === "object" ? d : {};
  } catch { return {}; }
}
function saveFeedbackDraft(draft) {
  try { localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

function UpdateCard() {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [error, setError] = useState(null);

  const checkUpdate = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/update/check"));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Không thể kiểm tra bản cập nhật.");
      setUpdateInfo(data);
    } catch (e) {
      setError(e.message || "Lỗi kết nối kiểm tra cập nhật.");
    } finally {
      setChecking(false);
    }
  };

  const openDownload = (url) => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card id="sec-update" title="Cập nhật ứng dụng" desc="Kiểm tra và nâng cấp phiên bản mới nhất." icon={<RefreshCw size={15} className={checking ? "st-spin" : ""} />}>
      <div className="st-kv">
        <span>Phiên bản hiện tại</span>
        <b>v{updateInfo?.currentVersion || "1.0.0"}</b>
      </div>

      {updateInfo?.hasUpdate ? (
        <div style={{ marginTop: 12, padding: 12, background: "rgba(37, 99, 235, 0.08)", borderRadius: 8, border: "1px solid rgba(37, 99, 235, 0.2)" }}>
          <div style={{ fontWeight: 600, color: "var(--primary-color, #2563EB)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span>🎉 Đã có bản cập nhật mới: v{updateInfo.latestVersion}</span>
            {updateInfo.releaseDate && <span style={{ fontSize: "0.85em", opacity: 0.8 }}>({updateInfo.releaseDate})</span>}
          </div>
          {Array.isArray(updateInfo.changelog) && updateInfo.changelog.length > 0 && (
            <ul style={{ margin: "6px 0 12px 18px", padding: 0, fontSize: "0.9em", lineHeight: 1.5 }}>
              {updateInfo.changelog.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {updateInfo.downloadUrl ? (
            <button
              className="st-btn st-btn-primary"
              style={{ width: "100%", justifyContent: "center", gap: 6 }}
              onClick={() => openDownload(updateInfo.downloadUrl)}
            >
              <Download size={14} /> Tải bản cập nhật mới (v{updateInfo.latestVersion})
            </button>
          ) : (
            <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
              Hãy liên hệ tác giả để nhận file cập nhật.
            </div>
          )}
        </div>
      ) : updateInfo && !updateInfo.hasUpdate ? (
        <div style={{ marginTop: 8, color: "#16a34a", fontSize: "0.9em", display: "flex", alignItems: "center", gap: 6 }}>
          <span>✓ Bạn đang sử dụng phiên bản mới nhất (v{updateInfo.currentVersion}).</span>
        </div>
      ) : null}

      {error && (
        <div style={{ marginTop: 8, color: "#dc2626", fontSize: "0.85em" }}>
          ⚠️ {error}
        </div>
      )}

      <div className="st-btn-row" style={{ marginTop: 12 }}>
        <button
          className="st-btn st-btn-ghost st-btn-sm"
          disabled={checking}
          onClick={checkUpdate}
        >
          {checking ? "Đang kiểm tra..." : "Kiểm tra bản cập nhật"}
        </button>
      </div>
    </Card>
  );
}

export function AboutSection({ settings }) {
  const a = settings.appearance || {};
  const themeLabel = { light: "Sáng", dark: "Tối", system: "Theo máy" }[a.theme] || "Theo máy";
  const moduleOff = (Array.isArray(settings.features?.disabled) ? settings.features.disabled : []).length;
  const dashboardOff = Object.entries(settings.dashboard || {}).filter(([, v]) => v === false).length;
  return (
    <>
      <UpdateCard />
      <Card id="sec-about" title="Hành trang Tiểu học — SGK App 3.0" desc="Local-first · Không cloud · Dữ liệu nằm trên máy thầy/cô." icon={<Info size={15} />}>
        <div className="st-kv"><span>Phát triển</span><b>{APP_DEVELOPER}</b></div>
        <div className="st-kv"><span>Bản quyền</span><b>{APP_COPYRIGHT}</b></div>
        <div className="st-kv"><span>Kiến trúc</span><b>React + Express · IndexedDB + localStorage</b></div>
        <div className="st-kv">
          <span>Giao diện hiện tại</span>
          <b style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <i style={{ width: 12, height: 12, borderRadius: 99, background: a.accentColor || "#2563EB", border: "1px solid var(--border-color)", display: "inline-block" }} />
            {themeLabel} · {a.density === "compact" ? "Gọn" : a.density === "spacious" ? "Rộng" : "Thoải mái"}
          </b>
        </div>
        <div className="st-kv"><span>Cấu hình đang chạy</span><b>{moduleOff ? `${moduleOff} module tắt` : "Đủ module"}{dashboardOff ? ` · ${dashboardOff} khối Dashboard ẩn` : ""}</b></div>
      </Card>
      <FeedbackPanel settings={settings} />
    </>
  );
}

function FeedbackPanel({ settings }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => {
    const d = loadFeedbackDraft();
    return {
      topic: FEEDBACK_TOPICS.some((t) => t.id === d.topic) ? d.topic : "",
      text: typeof d.text === "string" ? d.text.slice(0, 1200) : "",
      name: typeof d.name === "string" ? d.name.slice(0, 60) : "",
      contact: typeof d.contact === "string" ? d.contact.slice(0, 80) : "",
      rating: [1, 2, 3, 4, 5].includes(d.rating) ? d.rating : 0,
    };
  });
  const [status, setStatus] = useState(null); // { type: "ok" | "err", msg }
  const textRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => { saveFeedbackDraft(draft); }, [draft]);
  useEffect(() => {
    if (open && !draft.text) textRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (part) => setDraft((d) => ({ ...d, ...part }));
  const canSend = !!draft.topic && draft.text.trim().length >= 10;
  const ratingLabel = draft.rating ? FEEDBACK_STARS.find((s) => s.v === draft.rating)?.label : "";

  const appendPhrase = (phrase) => {
    setDraft((d) => {
      const cur = d.text.trimEnd();
      if (cur.split("\n").some((l) => l.trim() === phrase)) return d;
      return { ...d, text: cur ? `${cur}\n${phrase}` : phrase };
    });
    setStatus(null);
  };

  const composeMessage = () => {
    const lines = [
      `Chủ đề: ${FEEDBACK_TOPIC_LABELS[draft.topic] || "Khác"}`,
      draft.rating ? `Mức độ hài lòng: ${draft.rating}/5 (${ratingLabel})` : "",
      `Nội dung: ${draft.text.trim()}`,
      `Tên: ${draft.name.trim() || "(ẩn danh)"}`,
      draft.contact.trim() ? `Liên hệ: ${draft.contact.trim()}` : "",
      `Ứng dụng: SGK App 3.0 · ${typeof navigator !== "undefined" ? navigator.platform || "Web" : "Web"}`,
    ];
    return lines.filter(Boolean).join("\n");
  };

  const copyText = async (msg) => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(msg); return true; }
    } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = msg; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      return true;
    } catch { return false; }
  };

  /* Gửi thẳng vào Google Form: POST chéo origin qua <form> nhúng iframe ẩn
     (navigation không bị CORS chặn — đã verify server trả 200 "đã ghi lại"). */
  const sendToForm = (msg) => {
    const frameName = `fb_send_${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.title = "Gửi góp ý";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    const form = document.createElement("form");
    form.action = FEEDBACK_FORM_ENDPOINT;
    form.method = "POST";
    form.target = frameName;
    form.acceptCharset = "UTF-8";
    const addHidden = (name, value) => {
      const el = document.createElement("input");
      el.type = "hidden"; el.name = name; el.value = value;
      form.appendChild(el);
    };
    addHidden(FEEDBACK_ENTRY, msg);
    addHidden("submit", "Submit");
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => { try { form.remove(); iframe.remove(); } catch {} }, 15000);
  };

  const prefilledViewUrl = () => {
    const msg = composeMessage();
    if (!canSend) return FEEDBACK_FORM_VIEW;
    return `${FEEDBACK_FORM_VIEW}?${FEEDBACK_ENTRY}=${encodeURIComponent(msg)}`;
  };

  const submit = async () => {
    if (!canSend) {
      setStatus({ type: "err", msg: "Thầy/cô hãy chọn chủ đề và viết tối thiểu 10 ký tự trước khi gửi ạ." });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const copied = await copyText(composeMessage());
      setStatus(copied
        ? { type: "err", msg: "Đang ngoại tuyến — đã sao chép nội dung. Thầy/cô mở lại khi có mạng rồi bấm Gửi, hoặc dán vào form trực tiếp ạ." }
        : { type: "err", msg: "Đang ngoại tuyến và không sao chép được — hãy thử lại khi có mạng ạ." });
      return;
    }
    try {
      sendToForm(composeMessage());
      setStatus({ type: "ok", msg: "Đã gửi góp ý tới nhà phát triển — cảm ơn Thầy/cô ạ! (Muốn kiểm tra lại thì bấm \"Mở form trên web\".)" });
    } catch {
      const copied = await copyText(composeMessage());
      try { window.open(prefilledViewUrl(), "_blank", "noopener,noreferrer"); } catch {}
      setStatus(copied
        ? { type: "ok", msg: "Gửi trực tiếp bị chặn — đã mở form kèm sẵn nội dung, Thầy/cô bấm Gửi là xong ạ." }
        : { type: "err", msg: "Không gửi được — hãy bấm \"Mở form trên web\" rồi nhập tay ạ." });
    }
  };

  const copyOnly = async () => {
    if (!canSend) { setStatus({ type: "err", msg: "Hãy chọn chủ đề và viết tối thiểu 10 ký tự trước khi sao chép ạ." }); return; }
    const ok = await copyText(composeMessage());
    setStatus(ok
      ? { type: "ok", msg: "Đã sao chép nội dung góp ý vào bộ nhớ tạm." }
      : { type: "err", msg: "Không sao chép được — Thầy/cô copy tay trong ô nội dung nhé." });
  };

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (!next) setTimeout(() => toggleRef.current?.focus(), 0);
      return next;
    });
  };

  return (
    <Card id="sec-feedback" title="Góp ý cho nhà phát triển" desc="Mỗi ý kiến của Thầy/cô giúp app hoàn thiện hơn từng ngày." icon={<MessageSquareHeart size={15} />}>
      <button ref={toggleRef} type="button" className={`fb-toggle ${open ? "open" : ""}`} aria-expanded={open}
              aria-controls="fb-panel" onClick={toggle}>
        <span className="fb-toggle-ic"><Lightbulb size={16} /></span>
        <span className="fb-toggle-tx">
          <b>Gửi góp ý ngay tại đây</b>
          <small>Đề xuất · Báo lỗi · Giao diện · Nội dung — chỉ vài giây</small>
        </span>
        <ChevronDown size={16} className="fb-chevron" />
      </button>

      <div id="fb-panel" className={`fb-panel ${open ? "open" : ""}`} hidden={!open}>
        <div className="fb-step">
          <label className="fb-label"><i>1</i> Chọn chủ đề</label>
          <div className="fb-chips">
            {FEEDBACK_TOPICS.map((t) => (
              <button key={t.id} type="button"
                      className={`fb-chip ${draft.topic === t.id ? "active" : ""}`}
                      aria-pressed={draft.topic === t.id}
                      onClick={() => { patch({ topic: t.id }); setStatus(null); }}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {draft.topic && (
          <div className="fb-step">
            <label className="fb-label"><i>2</i> Chọn câu có sẵn hoặc tự viết</label>
            <div className="fb-phrases">
              {(FEEDBACK_PHRASES[draft.topic] || FEEDBACK_PHRASES.other).map((p) => (
                <button key={p} type="button" className="fb-phrase" onClick={() => appendPhrase(p)}>
                  <span>{p}</span><em>+</em>
                </button>
              ))}
            </div>
            <textarea ref={textRef} className="fb-textarea" value={draft.text} maxLength={1200}
                      placeholder="Viết thêm cảm nhận, mô tả lỗi hoặc ý tưởng của Thầy/cô ở đây…"
                      onChange={(e) => { patch({ text: e.target.value }); setStatus(null); }} />
            <div className="fb-meta"><span>{draft.text.trim().length}/10 ký tự tối thiểu · {draft.text.length}/1200</span></div>
          </div>
        )}

        {draft.topic && (
          <div className="fb-step">
            <label className="fb-label"><i>3</i> Mức độ hài lòng {ratingLabel && <em className="fb-rate-ok">· {ratingLabel}</em>}</label>
            <div className="fb-stars" role="radiogroup" aria-label="Mức độ hài lòng">
              {FEEDBACK_STARS.map((s) => (
                <button key={s.v} type="button" role="radio" aria-checked={draft.rating === s.v}
                        title={s.label}
                        className={`fb-star ${draft.rating >= s.v ? "on" : ""}`}
                        onClick={() => patch({ rating: draft.rating === s.v ? 0 : s.v })}>
                  <Star size={16} />
                </button>
              ))}
              <span className="fb-stars-hint">{ratingLabel || "Bấm sao để đánh giá (không bắt buộc)"}</span>
            </div>
          </div>
        )}

        {draft.topic && (
          <div className="fb-step">
            <label className="fb-label"><i>4</i> Thông tin hồi âm <em>(không bắt buộc)</em></label>
            <div className="fb-row">
              <input className="st-input fb-input" maxLength={60} placeholder={settings.general?.displayName ? settings.general.displayName : "Tên Thầy/cô"}
                     value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              <input className="st-input fb-input" maxLength={80} placeholder="Email / Zalo để được hồi âm"
                     value={draft.contact} onChange={(e) => patch({ contact: e.target.value })} />
            </div>
          </div>
        )}

        {draft.topic && (
          <>
            <div className="st-btn-row">
              <button className="st-btn st-btn-primary" disabled={!canSend} onClick={submit}
                      title={canSend ? "Gửi thẳng góp ý vào form Google" : "Cần chọn chủ đề và viết ≥ 10 ký tự"}>
                <Send size={13} /> Gửi góp ý
              </button>
              <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => { try { window.open(prefilledViewUrl(), "_blank", "noopener,noreferrer"); } catch {} }}>
                <ExternalLink size={13} /> Mở form trên web
              </button>
              <button className="st-btn st-btn-ghost st-btn-sm" disabled={!canSend} onClick={copyOnly}>
                <Copy size={13} /> Chỉ sao chép
              </button>
            </div>
            {status && <p className={`st-note ${status.type === "ok" ? "ok" : "err"}`}>{status.msg}</p>}
            <p className="fb-note">
              Góp ý được gửi thẳng tới form Google của nhà phát triển — không cần dán tay. Nếu trình duyệt chặn gửi trực tiếp, hãy bấm "Mở form trên web" (nội dung đã được điền sẵn).
              Không có dữ liệu riêng tư nào trong app được gửi đi.
              <a href={prefilledViewUrl()} target="_blank" rel="noopener noreferrer"> Mở form trực tiếp <ExternalLink size={10} /></a>
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
