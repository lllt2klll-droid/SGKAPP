// ── Ô nhập URL giáo án dùng chung (BookReader tab Giáo án + module Giáo án) ──
// - Dán URL (ưu tiên kenhgiaovien.com) → backend fetch HTML → parser bóc "y hệt" (chữ + marker [ảnh N] đúng vị trí)
// - Trích ảnh về 1 folder ngoài cùng (lesson-images/), plan chỉ giữ đường dẫn local
// - Lưu 2 bản: bản thô y hệt + bản AI chuẩn hóa KHBD (giữ bản gốc trong metadata.sourceText)
// - Fallback dán thủ công khi bị chặn/paywall/đăng nhập
import React, { useEffect, useState } from "react";
import { Link2, Download, Sparkles, Save, ClipboardPaste, Image as ImageIcon } from "lucide-react";
import { getApiBase } from "../apiConfig";
import aiService, { getFriendlyErrorMessage } from "../aiService";
import { getGeminiApiKey } from "../storage";
import { loadSettings } from "../settingsStore";
import { savePlan as saveKhbdV2, mkPlan } from "./planModel";
import { extractPlanJson, aiJsonToPlan, AI_SYSTEM } from "./planAi";
import {
  parseLessonHtml, parsePastedLesson,
  buildLessonPromptFromUrl, fetchLessonHtml, downloadLessonImages,
  splitSourceMarkers,
} from "./lessonUrlParser";

// Preview text có marker → badge [ảnh N] + ảnh đã tải (nếu có) đúng vị trí.
export function SourcePreview({ text, images }) {
  const byN = {};
  for (const im of images || []) {
    const local = im.local || im.url || "";
    if (im.n != null && local) byN[im.n] = local;
    else if (im.index != null && local) byN[im.index] = local;
  }
  const parts = splitSourceMarkers(text);
  return (
    <>
      {parts.map((p, i) => p.kind === "text"
        ? <span key={i}>{p.text}</span>
        : (byN[p.n]
          ? <img key={i} src={byN[p.n]} alt={`Ảnh ${p.n} từ web`} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0", margin: "0.3rem 0" }} loading="lazy" />
          : <span key={i} style={{ display: "inline-block", fontSize: "0.68rem", fontWeight: 700, background: "#eef2ff", color: "#4338ca", borderRadius: 6, padding: "1px 8px", margin: "0 2px" }}><ImageIcon size={11} style={{ verticalAlign: -1 }} /> ảnh {p.n}</span>))}
    </>
  );
}

export default function LessonUrlImport({ onImported, defaultDuration = "35", compact = false }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [parsed, setParsed] = useState(null);
  const [finalUrl, setFinalUrl] = useState("");
  const [withImages, setWithImages] = useState(true);
  const [imgMsg, setImgMsg] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Đóng ô nhập khi AI đang chạy → hủy request "lessonurl-" (không chạy nền tốn token)
  useEffect(() => {
    return () => { try { aiService.cancelRequestsByPrefix("lessonurl-"); } catch {} };
  }, []);

  const doFetch = async () => {
    const u = url.trim();
    if (!u) { setMsg("⚠️ Dán URL giáo án trước (VD: kenhgiaovien.com/tai-lieu/...)."); return; }
    if (!/^https?:\/\//i.test(u)) { setMsg("⚠️ URL phải bắt đầu http:// hoặc https://."); return; }
    setBusy(true); setMsg(""); setImgMsg(""); setParsed(null);
    try {
      const data = await fetchLessonHtml(u, getApiBase());
      const out = parseLessonHtml(data.html, data.finalUrl || u);
      setParsed(out);
      setFinalUrl(data.finalUrl || u);
      setMsg(out.isPaywalled
        ? `✅ Đã đọc ${out.chars} ký tự + ${out.images.length} ảnh (bản xem trước công khai — web ẩn phần trả phí ở “Còn tiếp”). Kiểm tra bên dưới rồi lưu.`
        : `✅ Đã đọc ${out.chars} ký tự + ${out.images.length} ảnh từ web — kiểm tra bên dưới rồi lưu.`);
    } catch (e) {
      setMsg(`⚠️ ${e.message || e} — hãy dùng ô dán thủ công bên dưới.`);
      setShowPaste(true);
    } finally { setBusy(false); }
  };

  const doParsePaste = () => {
    try {
      const out = parsePastedLesson(pasteText);
      setParsed(out);
      setFinalUrl(url.trim());
      setMsg(`✅ Đã nhận ${out.chars} ký tự${out.images.length ? ` + ${out.images.length} ảnh` : ""} dán thủ công — kiểm tra rồi lưu.`);
    } catch (e) { setMsg(`⚠️ ${e.message || e}`); }
  };

  // Trích ảnh web về folder lesson-images ngoài cùng (giữ nguyên thứ tự marker).
  const fetchImages = async (out, srcUrl) => {
    if (!withImages || !out.images?.length) return { images: [], skipped: 0 };
    setImgMsg(`Đang trích ${out.images.length} ảnh về folder lesson-images…`);
    try {
      const r = await downloadLessonImages(out.images, srcUrl, getApiBase());
      setImgMsg(r.images.length
        ? `✅ Đã lưu ${r.images.length} ảnh vào folder lesson-images${r.skipped ? ` (${r.skipped} ảnh lỗi bỏ qua)` : ""}.`
        : `⚠️ Không trích được ảnh nào${r.skipped ? ` (${r.skipped} ảnh lỗi)` : ""} — vẫn lưu bản chữ.`);
      return r;
    } catch (e) {
      setImgMsg(`⚠️ Trích ảnh thất bại (${e.message || e}) — vẫn lưu bản chữ.`);
      return { images: [], skipped: out.images.length };
    }
  };

  const sourceMeta = (out, srcUrl, imgs) => ({
    sourceUrl: srcUrl, sourceSite: out.sourceSite || "",
    sourceFetchedAt: Date.now(), sourceChars: out.chars,
    sourceIsPaywalled: !!out.isPaywalled,
    sourceText: out.text.slice(0, 60000),
    sourceImages: (imgs || []).map((im) => ({ n: im.index, src: im.src, local: im.url, bytes: im.bytes })),
  });

  // Lưu bản thô y hệt (không cần AI)
  const saveRaw = async () => {
    if (!parsed || busy) return;
    setBusy(true); setMsg("");
    try {
      const srcUrl = finalUrl || url.trim();
      const { images } = await fetchImages(parsed, srcUrl);
      const p = mkPlan();
      p.title = parsed.title || "Bài học từ web";
      p.phuLuc = [
        parsed.title || "",
        srcUrl ? `Nguồn: ${srcUrl}` : "",
        parsed.isPaywalled ? "(Bản xem trước công khai — web ẩn phần trả phí ở “Còn tiếp”.)" : "",
        "",
        "===== BẢN GỐC Y HỆT TỪ WEB =====",
        parsed.text,
      ].join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 60000);
      p.metadata = { ...(p.metadata || {}), ...sourceMeta(parsed, srcUrl, images) };
      const saved = saveKhbdV2(p);
      setMsg(`✅ Đã lưu bản gốc y hệt${images.length ? ` + ${images.length} ảnh` : ""} vào Giáo án.`);
      onImported?.(saved.id);
    } catch (e) { setMsg(`⚠️ Không lưu được: ${e.message || e}`); }
    finally { setBusy(false); }
  };

  // AI chuẩn hóa bản web → JSON KHBD, giữ cả bản gốc trong metadata + phụ lục
  const saveWithAI = async () => {
    if (!parsed || busy) return;
    const apiKey = getGeminiApiKey();
    if (!apiKey) { setMsg("⚠️ Chưa có Gemini API Key — vào Cài đặt → AI để nhập khóa (hoặc bấm “Lưu bản thô”)."); return; }
    setBusy(true); setMsg("");
    try {
      const srcUrl = finalUrl || url.trim();
      const { images } = await fetchImages(parsed, srcUrl);
      const model = (() => { try { return loadSettings().ai?.model || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; } })();
      const prompt = buildLessonPromptFromUrl({
        title: parsed.title, sourceText: parsed.text,
        duration: defaultDuration, method: "Hỏi đáp", includeDiff: true,
        sourceUrl: srcUrl,
      });
      const raw = await aiService.callAI({
        apiKey, model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: AI_SYSTEM,
        generationConfig: { temperature: 0.5, maxOutputTokens: 12000, responseMimeType: "application/json" },
        requestId: `lessonurl-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      });
      const obj = extractPlanJson(raw);
      const plan = aiJsonToPlan(obj, { title: parsed.title, duration: defaultDuration });
      plan.metadata = { ...(plan.metadata || {}), ...sourceMeta(parsed, srcUrl, images) };
      const srcNote = `\n\nNguồn web: ${srcUrl}${parsed.isPaywalled ? " (bản xem trước công khai)" : ""}`;
      plan.phuLuc = `${plan.phuLuc || ""}${srcNote}`.slice(0, 60000);
      const saved = saveKhbdV2(plan);
      setMsg(`✅ AI đã chuẩn hóa xong${images.length ? ` + ${images.length} ảnh` : ""} — mở trong Giáo án để xem cả 2 bản (chuẩn + gốc).`);
      onImported?.(saved.id);
    } catch (e) {
      setMsg(`⚠️ AI chuẩn hóa thất bại: ${getFriendlyErrorMessage(e?.status, e?.message) || e.message || e} — hãy bấm “Lưu bản thô”.`);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ border: "1px solid rgba(226,232,240,0.9)", borderRadius: 12, background: "var(--surface)", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
      <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--text-dark)", display: "flex", alignItems: "center", gap: 6 }}>
        <Link2 size={14} /> Nhập giáo án từ URL (ưu tiên kenhgiaovien.com)
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input className="form-control" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="Dán URL… VD: https://kenhgiaovien.com/tai-lieu/giao-toan-5-ket-noi-bai-7-hon-so"
          style={{ fontSize: "0.78rem", borderRadius: 10, flex: 1 }} disabled={busy} />
        <button className="btn btn-secondary btn-sm" onClick={doFetch} disabled={busy}
          title="Đọc trang web qua backend rồi bóc nội dung y hệt" style={{ whiteSpace: "nowrap" }}>
          {busy ? "Đang đọc…" : <><Download size={13} /> Đọc URL</>}
        </button>
      </div>
      <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} style={{ accentColor: "var(--pen-blue)" }} />
        Trích ảnh về folder lesson-images, giữ đúng vị trí như web ({parsed ? parsed.images.length : "tối đa 25"} ảnh)
      </label>
      {msg && <div style={{ fontSize: "0.75rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.4rem 0.55rem" }}>{msg}</div>}
      {imgMsg && <div style={{ fontSize: "0.75rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.4rem 0.55rem" }}>{imgMsg}</div>}
      {parsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700 }}>“{parsed.title}” · {parsed.chars} ký tự · {parsed.images.length} ảnh{parsed.isPaywalled ? " · bản preview (paywall)" : ""}</div>
          <div style={{ fontSize: "0.72rem", maxHeight: compact ? 140 : 220, overflowY: "auto", whiteSpace: "pre-wrap", background: "var(--surface-soft, #f8fafc)", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.45rem 0.55rem" }}>
            <SourcePreview text={parsed.text.slice(0, 4000)} images={[]} />
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={saveRaw} disabled={busy} title="Lưu nguyên văn bản web + ảnh vào Giáo án (không cần AI)">
              <Save size={13} /> Lưu bản thô y hệt
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveWithAI} disabled={busy} title="AI giữ ý bản gốc, chuẩn hóa vào form A/B/C/D">
              <Sparkles size={13} /> AI chuẩn hóa vào KHBD
            </button>
          </div>
        </div>
      )}
      <div>
        <button className="btn btn-ghost btn-xs" onClick={() => setShowPaste((v) => !v)} title="Dán HTML/text khi web chặn tải">
          <ClipboardPaste size={12} /> {showPaste ? "Ẩn ô dán thủ công" : "Dán thủ công khi bị chặn"}
        </button>
        {showPaste && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.4rem" }}>
            <textarea className="form-control" rows={5} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder="Mở trang web → Ctrl+A → Ctrl+C → dán vào đây (giữ nguyên chữ + bảng), rồi bấm “Nhận nội dung dán”."
              style={{ fontSize: "0.75rem", borderRadius: 10 }} />
            <button className="btn btn-secondary btn-sm" onClick={doParsePaste} disabled={busy}>Nhận nội dung dán</button>
          </div>
        )}
      </div>
    </div>
  );
}
