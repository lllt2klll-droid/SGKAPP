import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, Image as ImageIcon, Loader2, RefreshCw, Sparkles, Upload, X } from "lucide-react";
import { generateTeachingImage } from "./scanAIService.js";

const TEMPLATES = [
  { id: "illustration", label: "Tranh minh họa bài học" },
  { id: "infographic", label: "Infographic kiến thức" },
  { id: "worksheet", label: "Phiếu học tập" },
  { id: "mindmap", label: "Sơ đồ tư duy" },
  { id: "flashcard", label: "Thẻ từ vựng / flashcard" },
  { id: "story", label: "Tranh kể chuyện" },
  { id: "experiment", label: "Thí nghiệm / mô phỏng" },
  { id: "poster", label: "Poster lớp học" },
];

const ASPECT_RATIOS = [
  { value: "1:1", label: "Vuông · 1:1" },
  { value: "4:3", label: "Ngang · 4:3" },
  { value: "16:9", label: "Ngang rộng · 16:9" },
  { value: "3:4", label: "Dọc · 3:4" },
  { value: "9:16", label: "Dọc · 9:16" },
  { value: "3:2", label: "Ngang · 3:2" },
  { value: "2:3", label: "Dọc · 2:3" },
  { value: "custom", label: "Tùy chỉnh chiều rộng × chiều cao" },
];

const TEMPLATE_INSTRUCTIONS = {
  illustration: "Tạo tranh minh họa trực quan, gần gũi với học sinh, làm rõ một kiến thức trọng tâm.",
  infographic: "Tạo infographic giáo dục phân cấp rõ ràng, ít chữ, có biểu tượng và sơ đồ dễ đọc.",
  worksheet: "Tạo hình ảnh phiếu học tập thân thiện, bố cục sạch, có khoảng trống để học sinh viết câu trả lời.",
  mindmap: "Tạo sơ đồ tư duy dễ nhìn, một ý trung tâm và các nhánh phân loại mạch lạc.",
  flashcard: "Tạo bộ thẻ học tập trực quan với hình ảnh nổi bật và từ khóa ngắn, dễ ghi nhớ.",
  story: "Tạo tranh kể chuyện sinh động theo nội dung bài học, nhân vật và bối cảnh nhất quán.",
  experiment: "Tạo hình mô phỏng/thí nghiệm khoa học an toàn, các bộ phận và trình tự rõ ràng.",
  poster: "Tạo poster lớp học tích cực, thông điệp ngắn gọn, hình minh họa phù hợp lứa tuổi.",
};

function imagePrompt(template, analysis, scan) {
  const topic = analysis?.topic ? `Chủ đề: ${analysis.topic}.` : "";
  const subject = analysis?.subject || scan?.book?.subject || "";
  const grade = analysis?.grade || scan?.book?.grade;
  const context = [subject && `Môn ${subject}`, grade && `lớp ${grade}`, topic].filter(Boolean).join(", ");
  return [
    TEMPLATE_INSTRUCTIONS[template],
    context && `Ngữ cảnh bài học: ${context}.`,
    "Dùng ảnh crop đính kèm đầu tiên làm nguồn nội dung chính; bám sát kiến thức, đối tượng và chi tiết quan trọng trong vùng crop. Các ảnh tiếp theo (nếu có) chỉ là ảnh tham khảo về phong cách/bố cục.",
    "Thiết kế phù hợp học sinh phổ thông, trực quan, chính xác về mặt sư phạm, màu sắc rõ và bố cục cân đối. Dùng tiếng Việt cho chữ trong ảnh; giữ chữ ngắn, đúng chính tả, không tự bịa kiến thức. Không chép nguyên trang sách.",
  ].filter(Boolean).join(" ");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Không đọc được ảnh "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function resizeImage(dataUrl, maxDimension = 1536) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Trình duyệt không thể xử lý ảnh tham khảo."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => reject(new Error("Không thể đọc nội dung ảnh."));
    image.src = dataUrl;
  });
}

function closestSupportedRatio(width, height) {
  const target = width / height;
  const options = ASPECT_RATIOS.filter((ratio) => ratio.value !== "custom");
  return options.reduce((best, ratio) => {
    const [w, h] = ratio.value.split(":").map(Number);
    return Math.abs(w / h - target) < Math.abs(Number(best.split(":")[0]) / Number(best.split(":")[1]) - target)
      ? ratio.value
      : best;
  }, options[0].value);
}

function safeFilename(value) {
  return String(value || "hoc-lieu")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "hoc-lieu";
}

export default function ImageDesignPanel({ scan, analysis, onBack }) {
  const [template, setTemplate] = useState("illustration");
  const [prompt, setPrompt] = useState(() => imagePrompt("illustration", analysis, scan));
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [customWidth, setCustomWidth] = useState(1200);
  const [customHeight, setCustomHeight] = useState(1200);
  const [imageSize, setImageSize] = useState("1K");
  const [references, setReferences] = useState([]);
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(null);
  const mountedRef = useRef(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  const handleReferenceUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const available = 4 - references.length;
    if (files.length > available) {
      setError("Có thể thêm tối đa 4 ảnh tham khảo.");
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Ảnh tham khảo cần ở định dạng JPG, PNG hoặc WebP.");
      return;
    }
    if (files.some((file) => file.size > 8 * 1024 * 1024)) {
      setError("Mỗi ảnh tham khảo cần nhỏ hơn 8 MB.");
      return;
    }

    setError("");
    try {
      const loaded = await Promise.all(files.map(async (file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        dataUrl: await resizeImage(await readFileAsDataUrl(file)),
      })));
      setReferences((current) => [...current, ...loaded].slice(0, 4));
    } catch (uploadError) {
      setError(uploadError.message || "Không thể thêm ảnh tham khảo.");
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Hãy nhập mô tả ảnh muốn tạo.");
      return;
    }
    if (aspectRatio === "custom") {
      const width = Number(customWidth);
      const height = Number(customHeight);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 256 || height < 256 || width > 4096 || height > 4096) {
        setError("Kích thước tùy chỉnh cần là số nguyên từ 256 đến 4096 px.");
        return;
      }
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const sourceImage = await resizeImage(scan.dataUrl);
      const result = await generateTeachingImage({
        sourceImage,
        prompt: prompt.trim(),
        aspectRatio: aspectRatio === "custom"
          ? closestSupportedRatio(Number(customWidth), Number(customHeight))
          : aspectRatio,
        imageSize,
        referenceImages: references.map((reference) => reference.dataUrl),
        signal: controller.signal,
      });
      if (mountedRef.current) setGenerated(result);
    } catch (generationError) {
      if (!mountedRef.current) return;
      setError(generationError.name === "AbortError"
        ? "Đã dừng tạo ảnh."
        : generationError.message || "Không thể tạo ảnh. Vui lòng thử lại.");
    } finally {
      if (mountedRef.current) setLoading(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  const downloadName = `${safeFilename(analysis?.topic || scan?.book?.title)}.${generated?.mimeType === "image/jpeg" ? "jpg" : generated?.mimeType === "image/webp" ? "webp" : "png"}`;

  return (
    <section aria-label="Thiết kế ảnh học liệu" style={{ display: "flex", flexDirection: "column", gap: 16, border: "1px solid var(--border-color)", borderRadius: 14, padding: "clamp(14px, 2vw, 22px)", background: "var(--surface)", color: "var(--text-dark)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-xs" onClick={onBack} disabled={loading}><ArrowLeft size={13} /> Chọn học liệu</button>
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-action-strong, var(--primary))" }}><ImageIcon size={16} /> Thiết kế ảnh từ vùng crop</strong>
        <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--text-muted)" }}>Ảnh crop là nguồn nội dung chính</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 240px) minmax(0,1fr)", gap: 16, alignItems: "center", padding: 12, borderRadius: 11, background: "var(--surface-soft)", border: "1px solid var(--border-color)" }}>
        <img src={scan.dataUrl} alt="Ảnh crop dùng làm nguồn thiết kế" style={{ width: "100%", height: 150, objectFit: "contain", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border-color)" }} />
        <div style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "var(--text-dark)" }}>
          <strong>{scan.book?.title || "Ảnh đã crop"}</strong>
          <div style={{ color: "var(--text-muted)" }}>{scan.book?.subject ? `${scan.book.subject} · ` : ""}{analysis?.grade || scan.book?.grade ? `Lớp ${analysis?.grade || scan.book.grade} · ` : ""}Trang {scan.page || "—"}</div>
          <div style={{ marginTop: 6 }}>Gemini sẽ nhận ảnh crop này trước, sau đó mới đến các ảnh mẫu bạn tải lên.</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: "0.88rem", fontWeight: 800, marginBottom: 8 }}>Mẫu prompt gợi ý</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {TEMPLATES.map((item) => (
            <button key={item.id} type="button" className={`btn btn-xs ${template === item.id ? "btn-primary" : "btn-secondary"}`} onClick={() => {
              setTemplate(item.id);
              setPrompt(imagePrompt(item.id, analysis, scan));
            }} aria-pressed={template === item.id}>{item.label}</button>
          ))}
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.74rem", fontWeight: 700 }}>
        Mô tả ảnh muốn tạo
        <textarea className="form-control" rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Mô tả hình ảnh, nội dung, phong cách và chữ cần xuất hiện…" disabled={loading} style={{ minHeight: 150, resize: "vertical", fontSize: "0.9rem", lineHeight: 1.55 }} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.78rem", fontWeight: 700 }}>
          Tỉ lệ ảnh
          <select className="form-control" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} disabled={loading}>
            {ASPECT_RATIOS.map((ratio) => <option key={ratio.value} value={ratio.value}>{ratio.label}</option>)}
          </select>
        </label>
        {aspectRatio === "custom" && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.78rem", fontWeight: 700 }}>
              Rộng (px)
              <input className="form-control" type="number" min="256" max="4096" value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} disabled={loading} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.78rem", fontWeight: 700 }}>
              Cao (px)
              <input className="form-control" type="number" min="256" max="4096" value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} disabled={loading} />
            </label>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", maxWidth: 360 }}>Gemini chọn độ phân giải đầu ra; kích thước tùy chỉnh được quy đổi sang tỉ lệ gần nhất dịch vụ hỗ trợ.</span>
          </>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.78rem", fontWeight: 700 }}>
          Độ phân giải
          <select className="form-control" value={imageSize} onChange={(event) => setImageSize(event.target.value)} disabled={loading}>
            <option value="1K">1K · tiêu chuẩn</option>
            <option value="2K">2K · độ nét cao</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.88rem" }}>Ảnh mẫu tham khảo</strong>
          <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>Tùy chọn · tối đa 4 ảnh (JPG, PNG, WebP; mỗi ảnh dưới 8 MB)</span>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => fileInputRef.current?.click()} disabled={loading || references.length >= 4}><Upload size={12} /> Tải ảnh mẫu</button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleReferenceUpload} />
        </div>
        {references.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {references.map((reference) => (
              <div key={reference.id} style={{ position: "relative", width: 112, border: "1px solid var(--border-color)", borderRadius: 9, padding: 5, background: "var(--surface)" }}>
                <img src={reference.dataUrl} alt={`Ảnh mẫu ${reference.name}`} title={reference.name} style={{ width: 100, height: 76, objectFit: "cover", display: "block", borderRadius: 6 }} />
                <button type="button" className="btn btn-icon btn-xs" onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))} aria-label={`Xóa ảnh mẫu ${reference.name}`} title="Xóa ảnh mẫu" style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, minHeight: 22, borderRadius: "50%", background: "#fff" }}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 9, color: "var(--color-danger-text, var(--danger))", background: "var(--color-danger-soft, var(--danger-light))", border: "1px solid var(--danger)", fontSize: "0.84rem", lineHeight: 1.5 }}><AlertTriangle size={16} style={{ flexShrink: 0 }} />{error}</div>}

      {generated && (
        <div style={{ border: "1px solid var(--border-color)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
          <img src={generated.dataUrl} alt="Ảnh học liệu do Gemini tạo" style={{ display: "block", width: "100%", maxHeight: "min(68vh, 900px)", objectFit: "contain", background: "var(--surface-soft)", borderRadius: 9 }} />
          {generated.text && <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{generated.text}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <a className="btn btn-primary btn-xs" href={generated.dataUrl} download={downloadName}><Download size={13} /> Tải ảnh xuống</a>
            <button className="btn btn-secondary btn-xs" onClick={handleGenerate} disabled={loading}><RefreshCw size={13} /> Tạo lại</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={loading} aria-busy={loading}>
          {loading ? <Loader2 size={14} className="aia-spin-svg" /> : <Sparkles size={14} />}
          {loading ? "Đang thiết kế ảnh…" : generated ? "Tạo ảnh mới" : "Tạo ảnh học liệu"}
        </button>
        {loading && <button className="btn btn-ghost btn-xs" onClick={() => requestRef.current?.abort()}>Dừng</button>}
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.5 }}>Tối đa 32.768 token; quota miễn phí theo Gemini. Ảnh được gửi Gemini để xử lý (không lưu Interaction); ứng dụng không lưu kết quả.</span>
      </div>
    </section>
  );
}
