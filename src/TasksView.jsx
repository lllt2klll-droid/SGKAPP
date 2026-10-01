import React, { useState, useEffect } from "react";
import {
  ClipboardCheck,
  Plus,
  Edit,
  Trash2,
  Search,
  Check,
  X,
} from "lucide-react";
import DataTable from "./DataTable";
import { getTasks, createTask, updateTask, deleteTask, toggleTaskComplete } from "./personalDB";
import { appEvents, AppEvents } from "./core/appEvents.js";

// Single source: personalDB (sgk_tasks) — phát mission TASK_COMPLETED + DATA_UPDATED duy nhất.
// Prop `embedded` dùng khi nhúng trong hub Nhiệm vụ (MissionsView): gọn header để khỏi trùng tiêu đề.
export default function TasksView({ embedded = false }) {
  const [tasks, setTasks] = useState([]);
  // Phase 8: removed fake storage loop — AppEvents is single bus
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    dueDate: "",
    category: "",
  });

  // Load tasks — single source personalDB + đồng bộ cross-tab/realtime qua appEvents
  useEffect(() => {
    const load = () => {
      try {
        setTasks(getTasks());
      } catch (e) {
        console.warn("[TasksView] Failed to load tasks:", e);
        setTasks([]);
      }
    };
    load();
    const off = appEvents.on(AppEvents.DATA_UPDATED, (detail) => {
      // Reload khi personalDB/tasks hoặc missions thay đổi; bỏ qua domain không liên quan để đỡ render thừa
      const src = detail?.source || detail?.domain || "";
      if (!detail || src === "" || /personalDB|task|mission|storage|cross-tab/i.test(String(src))) load();
    });
    return () => { try { off(); } catch {} };
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      dueDate: "",
      category: "",
    });
    setShowForm(true);
  };

  const handleEdit = (task) => {
    setEditingId(task.id);
    setFormData({
      title: task.title || "",
      description: task.description || "",
      priority: task.priority || "medium",
      dueDate: task.dueDate || "",
      category: task.category || "",
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("Thầy/cô có chắc muốn xóa việc này?")) {
      try { deleteTask(id); } catch (e) { console.warn("[TasksView] deleteTask failed", e); }
      setTasks(getTasks());
    }
  };

  const handleToggleComplete = (id) => {
    // personalDB.toggleTaskComplete đã emit TASK_COMPLETED + DATA_UPDATED duy nhất
    try { toggleTaskComplete(id); } catch (e) { console.warn("[TasksView] toggleTaskComplete failed", e); }
    setTasks(getTasks());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const taskData = {
      ...formData,
      updatedAt: now,
    };

    if (editingId) {
      try { updateTask(editingId, taskData); } catch (e) { console.warn("[TasksView] updateTask failed", e); }
      setTasks(getTasks());
    } else {
      // personalDB.createTask — việc mới chưa hoàn thành nên chưa emit mission (emit khi tick xong)
      try { createTask(taskData); } catch (e) { console.warn("[TasksView] createTask failed", e); }
      setTasks(getTasks());
    }

    setShowForm(false);
    setEditingId(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
  };

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      searchTerm === "" ||
      task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.category?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "completed" && task.completed) ||
      (filterStatus === "pending" && !task.completed);

    const matchesPriority =
      filterPriority === "all" || task.priority === filterPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Sort tasks: incomplete first, then by due date
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const columns = [
    { key: "title", label: "Việc", width: "40%" },
    { key: "priority", label: "Ưu tiên", width: "15%" },
    { key: "category", label: "Danh mục", width: "15%" },
    { key: "dueDate", label: "Hạn", width: "15%" },
    { key: "status", label: "Trạng thái", width: "10%" },
    { key: "actions", label: "", width: "5%" },
  ];

  const tableData = sortedTasks.map((task) => {
    const priorityLabel =
      task.priority === "high" ? "Cao" : task.priority === "medium" ? "Trung bình" : "Thấp";
    const priorityClass =
      task.priority === "high"
        ? "priority-high"
        : task.priority === "medium"
        ? "priority-medium"
        : "priority-low";

    return {
      id: task.id,
      title: (
        <div className="task-title">
          <button
            className={`task-checkbox ${task.completed ? "completed" : ""}`}
            onClick={() => handleToggleComplete(task.id)}
          >
            {task.completed && <Check size={14} />}
          </button>
          <span className={task.completed ? "completed-text" : ""}>{task.title}</span>
        </div>
      ),
      priority: <span className={`priority-badge ${priorityClass}`}>{priorityLabel}</span>,
      category: task.category || "-",
      dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString("vi-VN") : "-",
      status: task.completed ? "Hoàn thành" : "Đang làm",
      actions: (
        <div className="table-actions">
          <button
            className="btn btn-icon btn-sm"
            onClick={() => handleEdit(task)}
            title="Chỉnh sửa"
          >
            <Edit size={14} />
          </button>
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => handleDelete(task.id)}
            title="Xóa"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    };
  });

  return (
    <div className="tasks-view">
      {!embedded && (
      <div className="page-header">
        <div className="page-title">
          <ClipboardCheck size={24} />
          <h1>Việc cần làm</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleCreate}>
            <Plus size={16} />
            <span>Thêm việc</span>
          </button>
        </div>
      </div>
      )}
      {embedded && (
      <div className="page-header" style={{ marginBottom: "0.6rem" }}>
        <div className="page-title" style={{ fontSize: "1rem" }}>
          <ClipboardCheck size={18} />
          <h1 style={{ fontSize: "1rem" }}>Việc cần làm</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={handleCreate}>
            <Plus size={14} />
            <span>Thêm việc</span>
          </button>
        </div>
      </div>
      )}

      {showForm && (
        <div className="form-panel">
          <div className="form-panel-header">
            <h2>{editingId ? "Chỉnh sửa việc" : "Thêm việc mới"}</h2>
            <button className="btn btn-icon" onClick={handleCancel}>
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="form-panel-body">
            <div className="form-group">
              <label htmlFor="task-title">Tiêu đề *</label>
              <input
                id="task-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Nhập tiêu đề công việc"
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-description">Mô tả</label>
              <textarea
                id="task-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
                placeholder="Mô tả chi tiết công việc"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="task-priority">Ưu tiên</label>
                <select
                  id="task-priority"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value })
                  }
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="task-dueDate">Hạn hoàn thành</label>
                <input
                  id="task-dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="task-category">Danh mục</label>
              <input
                id="task-category"
                type="text"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="Ví dụ: Soạn giáo án, Nghiên cứu, Học tập"
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                {editingId ? "Cập nhật" : "Lưu việc"}
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
            placeholder="Tìm kiếm việc cần làm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="toolbar-filters">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Đang làm</option>
            <option value="completed">Hoàn thành</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="filter-select"
          >
            <option value="all">Tất cả ưu tiên</option>
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
        </div>
      </div>

      <div className="data-table-wrap">
        {tableData.length > 0 ? (
          <DataTable columns={columns} data={tableData} />
        ) : (
          <div className="dash-empty">
            {searchTerm || filterStatus !== "all" || filterPriority !== "all"
              ? "Không tìm thấy việc nào phù hợp."
              : "Chưa có việc nào. Hãy thêm việc đầu tiên để theo dõi công việc."}
          </div>
        )}
      </div>
    </div>
  );
}