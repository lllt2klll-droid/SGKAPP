import { Image as ImageIcon, Lightbulb, Plus, Sparkles, Trash2, Type, X } from "lucide-react";

export default function WhiteboardAIModal({
  open,
  closeAIModal,
  aiStage,
  aiPlan,
  aiMeta,
  editAiPlan,
  aiError,
  setAiStage,
  setAiError,
  handleAIRegenerate,
  aiBusy,
  handleAIApply,
  aiTab,
  setAiTab,
  aiText,
  setAiText,
  aiImagePreview,
  aiImageFile,
  setAiImageFile,
  setAiImagePreview,
  aiSmallIdeas,
  setAiSmallIdeas,
  aiTopic,
  setAiTopic,
  aiProgress,
  handleAICancel,
  handleAIGenerate,
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay whiteboard-ai-overlay" onClick={closeAIModal}>
      <div className="modal-content whiteboard-ai-panel" role="dialog" aria-modal="true" aria-labelledby="whiteboard-ai-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header whiteboard-ai-header">
          <div className="whiteboard-ai-heading">
            <span className="whiteboard-ai-mark"><Sparkles size={17} /></span>
            <div>
              <h2 id="whiteboard-ai-title">{aiStage === "preview" ? "Xem trước sơ đồ" : "AI tạo sơ đồ"}</h2>
              {aiStage !== "preview" && <p>Dán nội dung hoặc chọn ảnh để bắt đầu</p>}
            </div>
          </div>
          <button className="btn btn-ghost btn-xs whiteboard-ai-close" onClick={closeAIModal} aria-label="Đóng cửa sổ"><X size={16} /></button>
        </div>

        {aiStage === "preview" && aiPlan ? (
          <div className="wb-ai-preview">
            <div className="wb-ai-preview-meta">
              <span className={`wb-ai-badge wb-ai-badge--${aiMeta?.mode === "local" ? "local" : "ai"}`}>
                {aiMeta?.mode === "local" ? "📄 Từ văn bản của bạn" : aiMeta?.checked ? "✓ AI — đã đối chiếu nguồn" : "✦ AI"}
              </span>
              {(aiMeta?.warnings || []).map((warning, index) => (
                <span key={`${index}-${warning}`} className="wb-ai-warn">{warning}</span>
              ))}
            </div>
            <div className="wb-ai-preview-topic">
              <span className="wb-ai-preview-topic-label">Chủ đề</span>
              <input className="form-control" value={aiPlan.topic} onChange={(e) => editAiPlan((plan) => ({ ...plan, topic: e.target.value }))} style={{ fontSize: "0.875rem", fontWeight: 700 }} />
            </div>
            <div className="wb-ai-preview-branches">
              {aiPlan.branches.map((branch, branchIndex) => (
                <div className="wb-ai-branch" key={branch._k || branchIndex}>
                  <div className="wb-ai-branch-row">
                    <span className="wb-ai-branch-dot" style={{ background: `hsl(${(branchIndex * 47) % 360} 65% 50%)` }} />
                    <input className="form-control wb-ai-branch-input" value={branch.label} onChange={(e) => editAiPlan((plan) => { plan.branches[branchIndex].label = e.target.value; return plan; })} />
                    <button className="btn btn-ghost btn-xs" title="Xóa nhánh" onClick={() => editAiPlan((plan) => ({ ...plan, branches: plan.branches.filter((_, index) => index !== branchIndex) }))}><Trash2 size={13} /></button>
                  </div>
                  <div className="wb-ai-branch-children">
                    {branch.children.map((child, childIndex) => (
                      <div className="wb-ai-child-row" key={childIndex}>
                        <span className="wb-ai-child-line" />
                        <input className="form-control wb-ai-child-input" value={child} onChange={(e) => editAiPlan((plan) => { plan.branches[branchIndex].children[childIndex] = e.target.value; return plan; })} />
                        <button className="btn btn-ghost btn-xs" onClick={() => editAiPlan((plan) => { plan.branches[branchIndex].children.splice(childIndex, 1); return plan; })}><X size={12} /></button>
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-xs wb-ai-add-child" onClick={() => editAiPlan((plan) => { plan.branches[branchIndex].children.push(""); return plan; })}>+ Ý con</button>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => editAiPlan((plan) => ({ ...plan, branches: [...plan.branches, { label: "Nhánh mới", children: [] }] }))}>+ Thêm nhánh</button>
            </div>
            {aiError && <div className="wb-ai-error">{aiError}</div>}
            <div className="wb-ai-preview-actions">
              <button className="btn btn-ghost" onClick={() => { setAiStage("form"); setAiError(""); }}>← Sửa nguồn</button>
              <button className="btn btn-ghost" onClick={handleAIRegenerate} disabled={aiBusy}>{aiBusy ? "Đang tạo…" : "↻ Tạo lại"}</button>
              <button className="btn btn-primary" onClick={handleAIApply} disabled={aiBusy} title={aiBusy ? "Đang tạo lại — chờ xong rồi đưa lên" : "Đưa sơ đồ lên bảng"} style={{ minWidth: 130 }}>✓ Đưa lên bảng</button>
            </div>
          </div>
        ) : (
          <>
            <div className="whiteboard-ai-tabs" role="tablist" aria-label="Cách nhập nội dung">
              <button type="button" role="tab" aria-selected={aiTab === "text"} className={`whiteboard-ai-tab ${aiTab === "text" ? "active" : ""}`} onClick={() => setAiTab("text")}><Type size={15} /> Văn bản</button>
              <button type="button" role="tab" aria-selected={aiTab === "image"} className={`whiteboard-ai-tab ${aiTab === "image" ? "active" : ""}`} onClick={() => setAiTab("image")}><ImageIcon size={15} /> Ảnh</button>
              <button type="button" role="tab" aria-selected={aiTab === "suggest"} className={`whiteboard-ai-tab ${aiTab === "suggest" ? "active" : ""}`} onClick={() => setAiTab("suggest")}><Lightbulb size={15} /> Gợi ý</button>
            </div>
            <div className="wb-ai-form">
              {aiTab === "text" && (
                <div className="wb-ai-source">
                  <div className="wb-ai-section-heading">
                    <label htmlFor="wb-ai-source-text">Văn bản nguồn</label>
                    <span>Mỗi dòng là một ý</span>
                  </div>
                  <textarea id="wb-ai-source-text" className="form-control wb-ai-source-text" rows={5} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder={"Dán nội dung từ SGK, ví dụ:\nQuang hợp là quá trình...\n- Điều kiện: ánh sáng, diệp lục\n- Sản phẩm: tinh bột, oxy"} />
                  <div className="wb-ai-source-caption">
                    <span className={aiText.length > 12000 ? "is-over-limit" : ""}>{aiText.length}/12000 ký tự{aiText.length > 12000 ? " — nội dung dài sẽ được rút gọn" : ""}</span>
                    <span>AI bám sát nguồn và giữ nguyên thuật ngữ; thụt lề hoặc gạch đầu dòng sẽ được dùng làm cấp ý.</span>
                  </div>
                </div>
              )}
              {aiTab === "image" && (
                <div className="wb-ai-source">
                  <div className="wb-ai-section-heading"><label>Ảnh nguồn</label><span>JPG, PNG hoặc WebP · tối đa 8 MB</span></div>
                  <div className="whiteboard-ai-drop" role="button" tabIndex={0} aria-label="Chọn ảnh nguồn" onClick={() => document.getElementById("wb-ai-image-input")?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.getElementById("wb-ai-image-input")?.click(); } }}>
                    {aiImagePreview ? <img src={aiImagePreview} alt="Xem trước ảnh nguồn" className="wb-ai-image-preview" /> : <span className="wb-ai-image-placeholder"><ImageIcon size={22} /></span>}
                    <div className="wb-ai-drop-copy">
                      <strong>{aiImageFile ? aiImageFile.name : "Chọn ảnh để AI đọc"}</strong>
                      <span>AI nhận diện nội dung trong ảnh (cần API Key).</span>
                    </div>
                    <span className="btn btn-secondary btn-xs">Chọn ảnh</span>
                  </div>
                  <input id="wb-ai-image-input" type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) setAiImageFile(file); e.target.value = ""; }} />
                  {aiImageFile && <button type="button" className="btn btn-ghost btn-xs wb-ai-remove-image" onClick={() => { setAiImageFile(null); setAiImagePreview(""); }}>Gỡ ảnh</button>}
                  <label className="wb-ai-notes-label" htmlFor="wb-ai-image-notes">Ghi chú thêm <span>(không bắt buộc)</span></label>
                  <textarea id="wb-ai-image-notes" className="form-control wb-ai-image-notes" rows={3} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Thêm bối cảnh hoặc nội dung cần chú ý trong ảnh…" />
                </div>
              )}
              {aiTab === "suggest" && (
                <div className="wb-ai-source wb-ai-suggestions">
                  <div className="wb-ai-section-heading"><label>Chọn một gợi ý</label><span>Gợi ý sẽ điền vào chủ đề</span></div>
                  <div className="wb-ai-suggestion-list">
                    {["Tóm tắt bài học", "So sánh 2 khái niệm", "Sơ đồ tư duy Quang hợp", "Phân loại thực vật", "Timeline lịch sử", "Sơ đồ lớp 4 — Vòng đời cây"].map((suggestion) => (
                      <button type="button" key={suggestion} className={`wb-ai-suggestion ${aiTopic === suggestion ? "is-selected" : ""}`} onClick={() => setAiTopic(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                  <p className="wb-ai-help">Sau khi chọn, bạn có thể chỉnh chủ đề và bổ sung các ý nhỏ bên dưới.</p>
                </div>
              )}
              <section className="wb-ai-ideas">
                <div className="wb-ai-section-heading wb-ai-ideas-heading">
                  <label>Ý cần có trong sơ đồ</label>
                  <span>Tùy chọn · AI chỉ dùng các ý có trong nguồn</span>
                </div>
                {aiSmallIdeas.map((value, index) => (
                  <div key={index} className="wb-ai-idea-row">
                    <input className="form-control" aria-label={`Ý bắt buộc ${index + 1}`} value={value} onChange={(e) => { const next = [...aiSmallIdeas]; next[index] = e.target.value; setAiSmallIdeas(next); }} placeholder={`Ý ${index + 1} — ví dụ: Diệp lục`} />
                    <button type="button" className="wb-ai-remove-idea" aria-label={`Xóa ý ${index + 1}`} onClick={() => setAiSmallIdeas((items) => items.filter((_, itemIndex) => itemIndex !== index))} disabled={aiSmallIdeas.length <= 1}><X size={15} /></button>
                  </div>
                ))}
                <button type="button" className="wb-ai-add-idea" onClick={() => setAiSmallIdeas((items) => (items.length >= 12 ? items : [...items, ""]))} disabled={aiSmallIdeas.length >= 12} title={aiSmallIdeas.length >= 12 ? "Tối đa 12 ý" : "Thêm ý"}><Plus size={14} /> Thêm ý{aiSmallIdeas.length >= 12 ? " (tối đa 12)" : ""}</button>
              </section>
              <div className="wb-ai-topic">
                <div className="wb-ai-section-heading">
                  <label htmlFor="wb-ai-topic">Chủ đề trung tâm</label>
                  <span>Không bắt buộc</span>
                </div>
                <input id="wb-ai-topic" className="form-control" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="VD: Quang hợp ở thực vật" />
                {!aiText.trim() && !aiImageFile && !aiSmallIdeas.some((idea) => idea.trim()) && (
                  <div className="wb-ai-source-warning"><Lightbulb size={15} /><span>Chỉ có chủ đề thì AI phải tự mở rộng, kết quả có thể kém chính xác. Nên thêm văn bản, ảnh hoặc ý nhỏ.</span></div>
                )}
                <p className="wb-ai-help">Bạn sẽ xem trước và chỉnh sơ đồ trước khi đưa lên bảng. Có thể tạo từ văn bản ngay cả khi chưa cấu hình API Key.</p>
              </div>
              {aiError && <div className="wb-ai-error">{aiError}</div>}
            </div>
            <div className="wb-ai-form-actions">
              <span className="wb-ai-action-hint" aria-live="polite">{aiBusy && aiProgress ? aiProgress : "Có thể xem lại và chỉnh sửa trước khi đưa lên bảng."}</span>
              <div className="wb-ai-action-buttons">
                <button type="button" className="btn btn-ghost" onClick={closeAIModal}>Đóng</button>
                {aiBusy && <button type="button" className="btn btn-ghost" onClick={handleAICancel}>Hủy tạo</button>}
                <button type="button" className="btn btn-primary wb-ai-generate" onClick={handleAIGenerate} disabled={aiBusy}><Sparkles size={15} /> {aiBusy ? "Đang tạo…" : "Tạo sơ đồ"}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
