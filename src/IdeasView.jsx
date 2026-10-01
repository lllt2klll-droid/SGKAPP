import React, { useState, useEffect } from "react";
import {
  Lightbulb,
  Plus,
  Edit,
  Trash2,
  Search,
  X,
} from "lucide-react";
import DataTable from "./DataTable";
import { getIdeas, createIdea, updateIdea, deleteIdea } from "./personalDB";
import { appEvents, AppEvents } from "./core/appEvents.js";

function normalizeTags(tags){
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

export default function IdeasView() {
  const [ideas, setIdeas] = useState([]);
  // Phase 8: removed fake storage loop — use appEvents DATA_UPDATED instead (App.jsx dataVersion handles refresh)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    subject: "",
    grade: "",
    relatedBookId: "",
    relatedLessonPlanId: "",
    tags: "",
  });

  // Load ideas — single source personalDB (emit IDEA_CREATED + DATA_UPDATED duy nhất)
  useEffect(() => {
    const load = () => {
      try {
        setIdeas(getIdeas());
      } catch (e) {
        console.warn("[IdeasView] Failed to load ideas:", e);
        setIdeas([]);
      }
    };
    load();
    const off = appEvents.on(AppEvents.DATA_UPDATED, (detail) => {
      const src = detail?.source || detail?.domain || "";
      if (!detail || src === "" || /personalDB|idea|mission|storage|cross-tab/i.test(String(src))) load();
    });
    return () => { try { off(); } catch {} };
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      title: "",
      description: "",
      subject: "",
      grade: "",
      relatedBookId: "",
      relatedLessonPlanId: "",
      tags: "",
    });
    setShowForm(true);
  };

  const handleEdit = (idea) => {
    setEditingId(idea.id);
    setFormData({
      title: idea.title || "",
      description: idea.description || "",
      subject: idea.subject || "",
      grade: idea.grade || "",
      relatedBookId: idea.relatedBookId || "",
      relatedLessonPlanId: idea.relatedLessonPlanId || "",
      tags: normalizeTags(idea.tags).join(", "),
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("Thầy/cô có chắc muốn xóa ý tưởng này?")) {
      try { deleteIdea(id); } catch (e) { console.warn("[IdeasView] deleteIdea failed", e); }
      setIdeas(getIdeas());
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const ideaData = {
      ...formData,
      tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
      updatedAt: now,
    };

    if (editingId) {
      try { updateIdea(editingId, ideaData); } catch (err) { console.warn("[IdeasView] updateIdea failed", err); }
      setIdeas(getIdeas());
    } else {
      // personalDB.createIdea đã emit IDEA_CREATED + DATA_UPDATED duy nhất
      try { createIdea({ ...ideaData, createdAt: now }); } catch (err) { console.warn("[IdeasView] createIdea failed", err); }
      setIdeas(getIdeas());
    }

    setShowForm(false);
    setEditingId(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
  };

  // Filter ideas
  const filteredIdeas = ideas.filter((idea) => {
    const tagList = normalizeTags(idea.tags);
    const matchesSearch =
      searchTerm === "" ||
      idea.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      idea.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tagList.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesSubject =
      filterSubject === "all" || idea.subject === filterSubject;

    return matchesSearch && matchesSubject;
  });

  // Get unique subjects for filter
  const subjects = [...new Set(ideas.map((i) => i.subject).filter(Boolean))];

  const columns = [
    { key: "title", label: "Tiêu đề", width: "30%" },
    { key: "subject", label: "Môn", width: "15%" },
    { key: "grade", label: "Lớp", width: "10%" },
    { key: "tags", label: "Thẻ", width: "20%" },
    { key: "date", label: "Ngày tạo", width: "15%" },
    { key: "actions", label: "", width: "10%" },
  ];

  const tableData = filteredIdeas.map((idea) => {
    return {
      id: idea.id,
      title: idea.title,
      subject: idea.subject || "-",
      grade: idea.grade || "-",
      tags: normalizeTags(idea.tags).join(", ") || "-",
      date: idea.createdAt
        ? new Date(idea.createdAt).toLocaleDateString("vi-VN")
        : "-",
      actions: (
        <div className="table-actions">
          <button
            className="btn btn-icon btn-sm"
            onClick={() => handleEdit(idea)}
            title="Chỉnh sửa"
          >
            <Edit size={14} />
          </button>
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => handleDelete(idea.id)}
            title="Xóa"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    };
  });

  return (
    <div className="ideas-view">
      <div className="page-header">
        <div className="page-title">
          <Lightbulb size={24} />
          <h1>Ý tưởng dạy học</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleCreate}>
            <Plus size={16} />
            <span>Thêm ý tưởng</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="form-panel">
          <div className="form-panel-header">
            <h2>{editingId ? "Chỉnh sửa ý tưởng" : "Thêm ý tưởng mới"}</h2>
            <button className="btn btn-icon" onClick={handleCancel}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="form-panel-body">
            <div className="form-group">
              <label htmlFor="idea-title">Tiêu đề *</label>
              <input
                id="idea-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Nhập tiêu đề ý tưởng"
              />
            </div>
            <div className="form-group">
              <label htmlFor="idea-description">Mô tả</label>
              <textarea
                id="idea-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={4}
                placeholder="Mô tả chi tiết ý tưởng dạy học"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="idea-subject">Môn học</label>
                <input
                  id="idea-subject"
                  type="text"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  placeholder="Ví dụ: Toán, Tiếng Việt"
                />
              </div>
              <div className="form-group">
                <label htmlFor="idea-grade">Lớp</label>
                <input
                  id="idea-grade"
                  type="text"
                  value={formData.grade}
                  onChange={(e) =>
                    setFormData({ ...formData, grade: e.target.value })
                  }
                  placeholder="Ví dụ: 1, 2, 3"
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="idea-tags">Thẻ (ngăn cách bằng dấu phẩy)</label>
              <input
                id="idea-tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="Ví dụ: hoạt động nhóm, trò chơi, thảo luận"
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                {editingId ? "Cập nhật" : "Lưu ý tưởng"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Tìm kiếm ý tưởng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="toolbar-filters">
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="filter-select"
          >
            <option value="all">Tất cả môn</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="data-table-wrap">
        {tableData.length > 0 ? (
          <DataTable columns={columns} data={tableData} />
        ) : (
          <div className="dash-empty">
            {searchTerm || filterSubject !== "all"
              ? "Không tìm thấy ý tưởng nào phù hợp."
              : "Chưa có ý tưởng nào. Hãy thêm ý tưởng dạy học đầu tiên."}
          </div>
        )}
      </div>
    </div>
  );
}