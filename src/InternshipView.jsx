import React, { useState, useEffect, useMemo } from "react";
import {
  School,
  Plus,
  Pencil,
  Trash2,
  Search,
  Calendar,
  CalendarDays,
  CalendarRange,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
  Sparkles,
  BookOpen,
  Copy,
  Download,
  RotateCcw,
} from "lucide-react";
import { safeGetJSON, safeSetJSON } from "./safeStorage";
import { appEvents, AppEvents, DataDomains } from "./core/appEvents.js";
import { exportWord, exportTxt, escapeHtml, nl2br } from "./exportDoc";

const STORAGE_KEY = "sgk_internship";
const RANGE_KEY = "sgk_internship_range";

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromKey = (key) => new Date(`${key}T12:00:00`);

const formatLongDate = (key) =>
  dateFromKey(key).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const shortDate = (key) => {
  try {
    return new Date(`${key}T12:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  } catch { return key || "-"; }
};

// Khoảng "YYYY-MM-DD" so sánh được trực tiếp bằng chuỗi (lexicographic).
const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};
const monthRangeOf = (today) => {
  const y = today.getFullYear();
  const m = today.getMonth();
  return { from: dateKey(new Date(y, m, 1)), to: dateKey(new Date(y, m + 1, 0)) };
};
// Học kỳ (xấp xỉ năm học VN): HK1 = 05/09 → 15/01 năm sau, HK2 = 16/01 → 31/05.
const semesterRangeOf = (today) => {
  const y = today.getFullYear();
  if (today.getMonth() >= 7) return { from: `${y}-09-05`, to: `${y + 1}-01-15` };
  return { from: `${y}-01-16`, to: `${y}-05-31` };
};
const hasReflection = (entry) => {
  const r = entry?.reflection;
  return !!r && Object.values(r).some((v) => String(v || "").trim());
};
const formatRangeLabel = (from, to) => {
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  if (from) return `từ ${shortDate(from)}`;
  if (to) return `đến ${shortDate(to)}`;
  return "";
};

export default function InternshipView() {
  const [entries, setEntries] = useState([]);
  // Phase 8: removed fake storage loop
  const [showForm, setShowForm] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [reflectionId, setReflectionId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [showAllDates, setShowAllDates] = useState(false);
  // Khoảng thời gian "từ … tới …" trên lịch (lưu lại giữa các lần mở view)
  const [rangeFrom, setRangeFrom] = useState(() => {
    try { const r = safeGetJSON(RANGE_KEY, null); return r && typeof r.from === "string" ? r.from : ""; } catch { return ""; }
  });
  const [rangeTo, setRangeTo] = useState(() => {
    try { const r = safeGetJSON(RANGE_KEY, null); return r && typeof r.to === "string" ? r.to : ""; } catch { return ""; }
  });
  const [fReflect, setFReflect] = useState(""); // "" | "done" | "todo"

  // Form state
  const [formData, setFormData] = useState({
    date: "",
    school: "",
    class: "",
    subject: "",
    topic: "",
    activities: "",
    hours: "",
  });

  // Reflection form state
  const [reflectionData, setReflectionData] = useState({
    whatWentWell: "",
    whatToImprove: "",
    studentEngagement: "",
    teacherFeedback: "",
    notes: "",
  });

  // Load entries from localStorage
  useEffect(() => {
    try {
      const parsed = safeGetJSON(STORAGE_KEY, [], Array.isArray);
      setEntries(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.warn("[InternshipView] Failed to load internship entries:", e);
      setEntries([]);
    }
  }, []);

  // Lưu khoảng thời gian đang xem
  useEffect(() => {
    try { safeSetJSON(RANGE_KEY, { from: rangeFrom, to: rangeTo }); } catch (e) {
      console.warn("[InternshipView] failed to persist range", e);
    }
  }, [rangeFrom, rangeTo]);

  // Save entries to localStorage
  // P0 • bắn event riêng (alias tự sinh DATA_UPDATED + qua cross-tab).
  // Trước đây lưu/xóa nhật ký hoàn toàn im lặng với bus và tab khác.
  const saveEntries = (updatedEntries) => {
    try {
      const res = safeSetJSON(STORAGE_KEY, updatedEntries);
      if (!res.ok) {
        if (res.quota) console.warn("[safeStorage] Quota exceeded on sgk_internship", res);
        else console.warn("[InternshipView] safeSetJSON failed for sgk_internship", res);
      }
      setEntries(updatedEntries);
      try { appEvents.emit(AppEvents.INTERNSHIP_UPDATED, { source: "InternshipView", domain: DataDomains.INTERNSHIP, op: "saveEntries", count: updatedEntries.length }); }
      catch (e) { console.warn("[InternshipView] emit failed", e); }
    } catch (e) {
      console.warn("[InternshipView] Failed to save internship entries:", e);
      setEntries(updatedEntries);
    }
  };

  const handleCreate = () => {
    setEditingId(null);
    // Mặc định lấy ngày đang chọn (nếu đang xem theo ngày), tiện ghi nhanh
    const defaultDate = (!rangeFrom && !rangeTo && !showAllDates && selectedDate)
      ? selectedDate
      : new Date().toISOString().split("T")[0];
    setFormData({
      date: defaultDate,
      school: "",
      class: "",
      subject: "",
      topic: "",
      activities: "",
      hours: "",
    });
    setShowForm(true);
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setFormData({
      date: entry.date || "",
      school: entry.school || "",
      class: entry.class || "",
      subject: entry.subject || "",
      topic: entry.topic || "",
      activities: entry.activities || "",
      hours: entry.hours || "",
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("Thầy/cô có chắc muốn xóa nhật ký này?")) {
      const updated = entries.filter((e) => e.id !== id);
      saveEntries(updated);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const entryData = {
      ...formData,
      updatedAt: now,
    };

    if (editingId) {
      const updated = entries.map((e) =>
        e.id === editingId ? { ...e, ...entryData } : e,
      );
      saveEntries(updated);
    } else {
      const newEntry = {
        id: `internship_${Date.now()}`,
        createdAt: now,
        reflection: null,
        ...entryData,
      };
      saveEntries([...entries, newEntry]);
    }

    setShowForm(false);
    setEditingId(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleOpenReflection = (entry) => {
    setReflectionId(entry.id);
    setReflectionData({
      whatWentWell: entry.reflection?.whatWentWell || "",
      whatToImprove: entry.reflection?.whatToImprove || "",
      studentEngagement: entry.reflection?.studentEngagement || "",
      teacherFeedback: entry.reflection?.teacherFeedback || "",
      notes: entry.reflection?.notes || "",
    });
    setShowReflection(true);
  };

  const handleSaveReflection = (e) => {
    e.preventDefault();
    const updated = entries.map((e) =>
      e.id === reflectionId
        ? {
            ...e,
            reflection: reflectionData,
            updatedAt: new Date().toISOString(),
          }
        : e,
    );
    saveEntries(updated);
    setShowReflection(false);
    setReflectionId(null);
  };

  // Filter entries — tìm cả hoạt động & phản ánh (không chỉ trường/lớp/môn/chủ đề)
  const filteredEntries = entries.filter((entry) => {
    const s = searchTerm.trim().toLowerCase();
    if (s === "") return true;
    const r = entry.reflection || {};
    const haystack = [
      entry.school, entry.class, entry.subject, entry.topic, entry.activities,
      r.whatWentWell, r.whatToImprove, r.studentEngagement, r.teacherFeedback, r.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(s);
  });

  const sortedEntries = useMemo(
    () =>
      [...filteredEntries].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [filteredEntries],
  );

  const subjects = useMemo(
    () => [...new Set(entries.map((e) => e.subject).filter(Boolean))],
    [entries],
  );

  // ── Khoảng thời gian ──
  const rangeActive = !!(rangeFrom || rangeTo);
  const inRange = (key) => {
    if (!key) return false;
    if (rangeFrom && key < rangeFrom) return false;
    if (rangeTo && key > rangeTo) return false;
    return true;
  };
  const rangeStats = useMemo(() => {
    if (!rangeActive) return null;
    const list = entries.filter((e) => {
      if (!e.date) return false;
      if (rangeFrom && e.date < rangeFrom) return false;
      if (rangeTo && e.date > rangeTo) return false;
      return true;
    });
    const hours = list.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    const days = new Set(list.map((e) => e.date).filter(Boolean)).size;
    return { count: list.length, hours, days };
  }, [entries, rangeActive, rangeFrom, rangeTo]);

  const isFiltering = !!(searchTerm.trim() || fSubject || fReflect || rangeActive);

  const visibleEntries = useMemo(() => {
    let list = sortedEntries;
    if (rangeActive) list = list.filter((e) => inRange(e.date));
    else if (!showAllDates) list = list.filter((entry) => entry.date === selectedDate);
    if (fSubject) list = list.filter((e) => e.subject === fSubject);
    if (fReflect === "done") list = list.filter(hasReflection);
    else if (fReflect === "todo") list = list.filter((e) => !hasReflection(e));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedEntries, showAllDates, selectedDate, fSubject, fReflect, rangeActive, rangeFrom, rangeTo]);

  const selectedEntries = visibleEntries;

  const stats = useMemo(() => {
    const hours = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    const days = new Set(entries.map((e) => e.date).filter(Boolean)).size;
    const reflected = entries.filter((e) => e.reflection && Object.values(e.reflection).some((v) => String(v || "").trim())).length;
    return { total: entries.length, hours, days, reflected };
  }, [entries]);

  const entryDates = useMemo(
    () => new Set(entries.map((entry) => entry.date).filter(Boolean)),
    [entries],
  );
  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate();
    return Array.from({ length: startOffset + daysInMonth }, (_, index) => {
      if (index < startOffset) return null;
      return new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth(),
        index - startOffset + 1,
      );
    });
  }, [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });
  const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const changeMonth = (offset) => {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };
  const selectDate = (date) => {
    setSelectedDate(dateKey(date));
    setShowAllDates(false);
    // Chọn 1 ngày = xem ngày đó → bỏ lọc khoảng để tránh xung đột hiển thị
    if (rangeFrom || rangeTo) { setRangeFrom(""); setRangeTo(""); }
  };

  const reflectionItems = (r) => [
    ["Điểm tốt", r?.whatWentWell, "#15803d"],
    ["Cần cải thiện", r?.whatToImprove, "#b45309"],
    ["HS tham gia", r?.studentEngagement, "#1d4ed8"],
    ["GV hướng dẫn", r?.teacherFeedback, "#6d28d9"],
    ["Ghi chú", r?.notes, "#475569"],
  ].filter(([, v]) => String(v || "").trim());

  // ── Nhân bản nhật ký (ghi nhanh buổi lặp lại) ──
  const handleDuplicate = (entry) => {
    const now = new Date().toISOString();
    const copy = {
      ...entry,
      id: `internship_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
      reflection: null,
    };
    saveEntries([...entries, copy]);
  };

  // ── Khoảng thời gian ──
  const setRange = (from, to) => {
    setRangeFrom(from || "");
    setRangeTo(to || "");
    if (from) {
      try {
        const d = dateFromKey(from);
        setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      } catch { /* ignore */ }
    }
  };
  const clearRange = () => { setRangeFrom(""); setRangeTo(""); };
  const applyPreset = (kind) => {
    const today = new Date();
    if (kind === "7d") setRange(dateKey(addDays(today, -6)), dateKey(today));
    else if (kind === "30d") setRange(dateKey(addDays(today, -29)), dateKey(today));
    else if (kind === "month") { const r = monthRangeOf(today); setRange(r.from, r.to); }
    else if (kind === "semester") { const r = semesterRangeOf(today); setRange(r.from, r.to); }
  };

  // ── Xuất báo cáo thực tập (Word / TXT) theo đúng phần đang xem ──
  const exportEntries = (kind) => {
    const list = [...visibleEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!list.length) return;
    const scope = rangeActive
      ? `Khoảng ${formatRangeLabel(rangeFrom, rangeTo)}`
      : showAllDates ? "Tất cả nhật ký" : formatLongDate(selectedDate);
    const title = "Nhật ký thực tập";
    const totalHours = list.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    const meta = [
      `${list.length} nhật ký`,
      `${totalHours % 1 ? totalHours.toFixed(1) : totalHours} giờ`,
      scope,
      `Xuất ${new Date().toLocaleString("vi-VN")}`,
    ];
    if (kind === "txt") {
      const lines = [title.toUpperCase(), ...meta, ""];
      for (const e of list) {
        lines.push(`■ ${formatLongDate(e.date)}`);
        lines.push(`  Trường: ${e.school || "—"} • Lớp: ${e.class || "—"} • Môn: ${e.subject || "—"}`);
        lines.push(`  Chủ đề: ${e.topic || "—"}${e.hours ? ` • ${e.hours} giờ` : ""}`);
        if (e.activities) lines.push(`  Hoạt động: ${String(e.activities).replace(/\n/g, "\n    ")}`);
        const items = reflectionItems(e.reflection);
        if (items.length) {
          lines.push("  Phản ánh:");
          for (const [label, val] of items) lines.push(`    - ${label}: ${val}`);
        }
        lines.push("");
      }
      exportTxt(title, lines.join("\n"));
      return;
    }
    const body = list.map((e) => {
      const items = reflectionItems(e.reflection);
      return `<h2>${escapeHtml(formatLongDate(e.date))}</h2>` +
        `<p><b>Trường:</b> ${escapeHtml(e.school || "—")} • <b>Lớp:</b> ${escapeHtml(e.class || "—")} • <b>Môn:</b> ${escapeHtml(e.subject || "—")}</p>` +
        `<p><b>Chủ đề:</b> ${escapeHtml(e.topic || "—")}${e.hours ? ` • <b>${escapeHtml(String(e.hours))}</b> giờ` : ""}</p>` +
        (e.activities ? `<p><b>Hoạt động:</b><br>${nl2br(e.activities)}</p>` : "") +
        (items.length ? `<p><b>Phản ánh sau giờ dạy:</b></p><ul>${items.map(([l, v]) => `<li><b>${escapeHtml(l)}:</b> ${nl2br(v)}</li>`).join("")}</ul>` : "");
    }).join("<hr>");
    exportWord(title, `<h1>${escapeHtml(title)}</h1><div class="meta">${meta.map(escapeHtml).join(" • ")}</div>${body}`);
  };

  return (
    <div className="itn-root">
      <style>{`
        .itn-root { display:flex; flex-direction:column; gap:14px; }
        .itn-head { background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(139,92,246,0.07)); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:11px; }
        .itn-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .itn-title { margin:0; font-size:1.05rem; font-weight:800; color:var(--text-dark); display:flex; align-items:center; gap:9px; }
        .itn-title-ic { width:32px; height:32px; border-radius:10px; background:var(--color-action, var(--primary, #f59e0b)); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 12px color-mix(in srgb, var(--color-action, #f59e0b) 38%, transparent); }
        .itn-stats { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
        .itn-stat { font-size:11.5px; font-weight:700; color:#334155; background:rgba(255,255,255,0.85); border:1px solid #e2e8f0; padding:4px 10px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
        .itn-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .itn-export { display:flex; gap:6px; }
        .itn-search { flex:1 1 200px; min-width:170px; position:relative; }
        .itn-search input { width:100%; padding:8px 12px 8px 32px; border-radius:10px; border:1px solid #e2e8f0; font-size:13px; background:#fff; }
        .itn-search > svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .itn-toolbar select { padding:8px 10px; border-radius:10px; border:1px solid #e2e8f0; font-size:12.5px; background:#fff; color:#334155; }
        .itn-form { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:14px 16px; }
        .itn-form h2 { margin:0; font-size:0.98rem; display:flex; align-items:center; gap:8px; }
        .itn-work { display:grid; grid-template-columns:300px minmax(0,1fr); gap:12px; align-items:start; }
        @media (max-width: 900px) { .itn-work { grid-template-columns:1fr; } }
        .itn-cal { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:13px 14px; position:sticky; top:0; }
        @media (max-width: 900px) { .itn-cal { position:static; } }
        .itn-cal-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .itn-cal-title { font-weight:800; font-size:0.92rem; color:var(--text-dark); display:flex; align-items:center; gap:7px; }
        .itn-cal-nav { display:flex; gap:4px; }
        .itn-navbtn { width:29px; height:29px; border-radius:8px; border:1px solid #e2e8f0; background:#fff; color:#475569; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
        .itn-navbtn:hover { border-color:#f59e0b; color:#b45309; }
        .itn-today { width:100%; margin-top:9px; font-size:12px; font-weight:800; padding:7px; border-radius:9px; border:1px dashed #fcd34d; background:#fffbeb; color:#b45309; cursor:pointer; }
        .itn-today:hover { background:#fef3c7; }
        .itn-range { border:1px dashed var(--border-color); border-radius:12px; padding:9px 10px; margin-bottom:10px; background:var(--surface-soft, #f8fafc); display:flex; flex-direction:column; gap:7px; }
        .itn-range-title { font-size:11px; font-weight:800; color:var(--text-muted); display:flex; align-items:center; gap:6px; text-transform:uppercase; letter-spacing:0.04em; }
        .itn-range-inputs { display:flex; align-items:flex-end; gap:6px; flex-wrap:wrap; }
        .itn-range-inputs label { flex:1 1 108px; display:flex; flex-direction:column; gap:3px; font-size:10.5px; font-weight:700; color:var(--text-muted); }
        .itn-range-inputs input { width:100%; padding:6px 8px; border-radius:8px; border:1px solid var(--border-color, #e2e8f0); font-size:12.5px; background:var(--surface, #fff); color:var(--text-dark); }
        .itn-range-inputs input:focus { outline:none; border-color:var(--color-action, #f59e0b); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-action, #f59e0b) 18%, transparent); }
        .itn-range-arrow { color:var(--text-muted); font-weight:800; padding-bottom:7px; }
        .itn-range-presets { display:flex; flex-wrap:wrap; gap:5px; }
        .itn-range-chip { font-size:11px; font-weight:700; padding:4px 9px; border-radius:999px; border:1px solid var(--border-color, #e2e8f0); background:var(--surface, #fff); color:var(--text-mid, #475569); cursor:pointer; }
        .itn-range-chip:hover { border-color:var(--color-action, #f59e0b); color:var(--color-action-strong, #b45309); }
        .itn-range-chip.clear { color:#b45309; border-color:#fcd34d; background:#fffbeb; display:inline-flex; align-items:center; gap:4px; }
        .itn-range-stat { font-size:11.5px; font-weight:700; color:var(--text-mid); display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .itn-range-stat b { color:var(--color-action-strong, #b45309); }
        .itn-day.in-range { background:var(--color-action-soft, #fffbeb); border-color:#fde68a; }
        .itn-day.in-range.has::after { background:#b45309; }
        .itn-day.sel.in-range { background:var(--color-action, #f59e0b); color:#fff; }
        .itn-week { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; margin:10px 0 5px; font-size:10px; font-weight:800; color:#94a3b8; text-align:center; }
        .itn-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; }
        .itn-day { aspect-ratio:1; border-radius:8px; border:1px solid transparent; background:transparent; font-size:12px; font-weight:600; color:#334155; cursor:pointer; position:relative; display:flex; align-items:center; justify-content:center; }
        .itn-day:hover { background:#f8fafc; border-color:#e2e8f0; }
        .itn-day.has { font-weight:800; color:#b45309; }
        .itn-day.has::after { content:""; position:absolute; bottom:4px; width:5px; height:5px; border-radius:99px; background:#f59e0b; }
        .itn-day.sel { background:var(--color-action, #f59e0b); color:#fff; font-weight:800; box-shadow:0 3px 10px color-mix(in srgb, var(--color-action, #f59e0b) 38%, transparent); }
        .itn-day.sel::after { background:#fff; }
        .itn-day.today { border-color:#f59e0b; }
        .itn-day-empty { aspect-ratio:1; }
        .itn-legend { margin-top:9px; font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px; }
        .itn-legend i { width:8px; height:8px; border-radius:99px; background:#f59e0b; display:inline-block; }
        .itn-panel-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
        .itn-panel-head h2 { margin:0; font-size:0.98rem; color:var(--text-dark); }
        .itn-panel-head p { margin:2px 0 0; font-size:11.5px; color:var(--text-muted); }
        .itn-list { display:flex; flex-direction:column; gap:10px; }
        .itn-card { background:var(--surface); border:1px solid var(--border-color); border-radius:14px; padding:13px 14px; display:flex; gap:12px; }
        .itn-date { flex-shrink:0; width:56px; text-align:center; background:linear-gradient(180deg,#fffbeb,#fef3c7); border:1px solid #fde68a; border-radius:11px; padding:7px 4px; align-self:flex-start; }
        .itn-date b { display:block; font-size:1.25rem; line-height:1; color:#92400e; }
        .itn-date span { font-size:10.5px; font-weight:800; color:#b45309; }
        .itn-card-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:7px; }
        .itn-card-title { margin:0; font-size:0.93rem; font-weight:800; color:var(--text-dark); line-height:1.4; }
        .itn-card-meta { font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .itn-badges { display:flex; gap:5px; flex-wrap:wrap; }
        .itn-badge { font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px; background:#f8fafc; color:#475569; border:1px solid #e2e8f0; }
        .itn-badge.subj { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #dbeafe); }
        .itn-badge.time { background:#fffbeb; color:#b45309; border-color:#fde68a; }
        .itn-badge.ok { background:#f0fdf4; color:#15803d; border-color:#bbf7d0; }
        .itn-snippet { margin:0; font-size:12.5px; color:#475569; line-height:1.6; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .itn-refl { border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; }
        .itn-refl summary { cursor:pointer; font-size:12px; font-weight:800; color:#0f766e; padding:8px 10px; display:flex; align-items:center; gap:6px; }
        .itn-refl-body { padding:0 10px 10px; display:flex; flex-direction:column; gap:6px; }
        .itn-refl-item { font-size:12px; line-height:1.55; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:6px 9px; }
        .itn-card-foot { display:flex; gap:6px; align-items:center; padding-top:9px; border-top:1px dashed var(--border-color); }
        .itn-view-btn { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12.5px; font-weight:800; padding:8px 10px; border-radius:10px; border:none; background:var(--color-action, var(--primary, #0f766e)); color:#fff; cursor:pointer; box-shadow:0 3px 10px color-mix(in srgb, var(--color-action, #0f766e) 30%, transparent); }
        .itn-view-btn:hover { filter:brightness(1.08); }
        .itn-view-btn.done { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; box-shadow:none; }
        .itn-icobtn { width:33px; height:33px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; border:1px solid #e2e8f0; background:#fff; color:#64748b; cursor:pointer; }
        .itn-icobtn:hover { border-color:var(--color-action, #0f766e); color:var(--color-action-strong, #0f766e); background:var(--color-action-soft, #f0fdfa); }
        .itn-badge.subj { background:var(--color-action-soft, #eff6ff); color:var(--color-action-strong, #1d4ed8); border-color:var(--color-action-soft, #dbeafe); }
        .itn-icobtn.danger:hover { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
        .itn-empty { text-align:center; padding:34px 16px; border:1px dashed var(--border-color); border-radius:14px; color:var(--text-muted); background:var(--surface); display:flex; flex-direction:column; align-items:center; gap:6px; }
      `}</style>

      {/* ── Header ── */}
      <div className="itn-head">
        <div className="itn-title-row">
          <h1 className="itn-title"><span className="itn-title-ic"><School size={17} /></span> Nhật ký thực tập</h1>
          <div className="itn-stats">
            <span className="itn-stat"><FileText size={12} /> {stats.total} nhật ký</span>
            <span className="itn-stat"><CalendarDays size={12} /> {stats.days} ngày</span>
            <span className="itn-stat"><Clock size={12} /> {stats.hours % 1 ? stats.hours.toFixed(1) : stats.hours} giờ</span>
            <span className="itn-stat"><Sparkles size={12} /> {stats.reflected} phản ánh</span>
          </div>
        </div>
        <div className="itn-toolbar">
          <div className="itn-search">
            <Search size={15} />
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Tìm trường, lớp, môn, chủ đề, hoạt động, phản ánh…" aria-label="Tìm nhật ký" />
          </div>
          {subjects.length > 0 && (
            <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label="Lọc môn">
              <option value="">Mọi môn</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={fReflect} onChange={(e) => setFReflect(e.target.value)} aria-label="Lọc theo phản ánh">
            <option value="">Mọi phản ánh</option>
            <option value="done">Đã phản ánh</option>
            <option value="todo">Chưa phản ánh</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAllDates((v) => !v)} disabled={rangeActive}>
            {showAllDates ? "Theo ngày" : "Xem tất cả"}
          </button>
          <div className="itn-export">
            <button className="btn btn-secondary btn-sm" onClick={() => exportEntries("word")} disabled={!visibleEntries.length} title="Xuất phần đang xem ra Word">
              <Download size={14} /> Word
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportEntries("txt")} disabled={!visibleEntries.length} title="Xuất phần đang xem ra TXT">
              <Download size={14} /> TXT
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleCreate}><Plus size={14} /> Thêm nhật ký</button>
        </div>
      </div>

      {showForm && (
        <div className="itn-form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2>{editingId ? "✏️ Chỉnh sửa nhật ký" : "➕ Thêm nhật ký mới"}</h2>
            <button className="btn btn-ghost btn-xs" onClick={handleCancel} aria-label="Đóng"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="tag-grid-2">
              <div>
                <label className="form-label" htmlFor="internship-date">Ngày *</label>
                <input id="internship-date" className="form-control" type="date" value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
              </div>
              <div>
                <label className="form-label" htmlFor="internship-hours">Số giờ</label>
                <input id="internship-hours" className="form-control" type="text" value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })} placeholder="Ví dụ: 2" />
              </div>
            </div>
            <div>
              <label className="form-label" htmlFor="internship-school">Trường *</label>
              <input id="internship-school" className="form-control" type="text" value={formData.school}
                onChange={(e) => setFormData({ ...formData, school: e.target.value })} required placeholder="Tên trường thực tập" />
            </div>
            <div className="tag-grid-2">
              <div>
                <label className="form-label" htmlFor="internship-class">Lớp *</label>
                <input id="internship-class" className="form-control" type="text" value={formData.class}
                  onChange={(e) => setFormData({ ...formData, class: e.target.value })} required placeholder="Ví dụ: 1A, 2B" />
              </div>
              <div>
                <label className="form-label" htmlFor="internship-subject">Môn học *</label>
                <input id="internship-subject" className="form-control" type="text" value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })} required placeholder="Ví dụ: Toán, Tiếng Việt" />
              </div>
            </div>
            <div>
              <label className="form-label" htmlFor="internship-topic">Chủ đề bài dạy *</label>
              <input id="internship-topic" className="form-control" type="text" value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })} required placeholder="Chủ đề bài dạy hoặc hoạt động" />
            </div>
            <div>
              <label className="form-label" htmlFor="internship-activities">Hoạt động chi tiết</label>
              <textarea id="internship-activities" className="form-control" value={formData.activities}
                onChange={(e) => setFormData({ ...formData, activities: e.target.value })} rows={4} placeholder="Mô tả chi tiết các hoạt động đã thực hiện" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>Hủy</button>
              <button type="submit" className="btn btn-primary"><Check size={14} /> {editingId ? "Cập nhật" : "Lưu nhật ký"}</button>
            </div>
          </form>
        </div>
      )}

      {showReflection && (
        <div className="itn-form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2>💭 Phản ánh sau giờ dạy</h2>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowReflection(false)} aria-label="Đóng"><X size={16} /></button>
          </div>
          <form onSubmit={handleSaveReflection} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label className="form-label" htmlFor="reflection-went-well">Điều gì diễn ra tốt?</label>
              <textarea id="reflection-went-well" className="form-control" value={reflectionData.whatWentWell}
                onChange={(e) => setReflectionData({ ...reflectionData, whatWentWell: e.target.value })} rows={3} placeholder="Những gì thành công, học sinh hứng thú..." />
            </div>
            <div>
              <label className="form-label" htmlFor="reflection-improve">Cần cải thiện gì?</label>
              <textarea id="reflection-improve" className="form-control" value={reflectionData.whatToImprove}
                onChange={(e) => setReflectionData({ ...reflectionData, whatToImprove: e.target.value })} rows={3} placeholder="Những gì có thể làm tốt hơn lần sau" />
            </div>
            <div className="tag-grid-2">
              <div>
                <label className="form-label" htmlFor="reflection-engagement">Mức độ tham gia của học sinh</label>
                <textarea id="reflection-engagement" className="form-control" value={reflectionData.studentEngagement}
                  onChange={(e) => setReflectionData({ ...reflectionData, studentEngagement: e.target.value })} rows={2} placeholder="Đánh giá mức độ tham gia của học sinh" />
              </div>
              <div>
                <label className="form-label" htmlFor="reflection-feedback">Phản hồi từ giáo viên hướng dẫn</label>
                <textarea id="reflection-feedback" className="form-control" value={reflectionData.teacherFeedback}
                  onChange={(e) => setReflectionData({ ...reflectionData, teacherFeedback: e.target.value })} rows={2} placeholder="Nhận xét từ giáo viên hướng dẫn" />
              </div>
            </div>
            <div>
              <label className="form-label" htmlFor="reflection-notes">Ghi chú khác</label>
              <textarea id="reflection-notes" className="form-control" value={reflectionData.notes}
                onChange={(e) => setReflectionData({ ...reflectionData, notes: e.target.value })} rows={2} placeholder="Bất kỳ ghi chú bổ sung nào" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowReflection(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary"><Check size={14} /> Lưu phản ánh</button>
            </div>
          </form>
        </div>
      )}

      <div className="itn-work">
        {/* ── Lịch ── */}
        <aside className="itn-cal" aria-label="Lịch thực tập">
          {/* Khoảng thời gian từ … tới … (lọc cả lịch lẫn danh sách) */}
          <div className="itn-range">
            <div className="itn-range-title"><CalendarRange size={13} /> Khoảng thời gian</div>
            <div className="itn-range-inputs">
              <label htmlFor="itn-range-from">Từ ngày
                <input id="itn-range-from" type="date" value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={(e) => setRangeFrom(e.target.value)} />
              </label>
              <span className="itn-range-arrow" aria-hidden="true">→</span>
              <label htmlFor="itn-range-to">Tới ngày
                <input id="itn-range-to" type="date" value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => setRangeTo(e.target.value)} />
              </label>
            </div>
            <div className="itn-range-presets">
              <button type="button" className="itn-range-chip" onClick={() => applyPreset("7d")}>7 ngày</button>
              <button type="button" className="itn-range-chip" onClick={() => applyPreset("30d")}>30 ngày</button>
              <button type="button" className="itn-range-chip" onClick={() => applyPreset("month")}>Tháng này</button>
              <button type="button" className="itn-range-chip" onClick={() => applyPreset("semester")}>Học kỳ</button>
              {rangeActive && (
                <button type="button" className="itn-range-chip clear" onClick={clearRange}><RotateCcw size={11} /> Xóa khoảng</button>
              )}
            </div>
            {rangeActive && rangeStats && (
              <div className="itn-range-stat">
                <CalendarDays size={12} /> <b>{rangeStats.count}</b> nhật ký • <b>{rangeStats.days}</b> ngày • <b>{rangeStats.hours % 1 ? rangeStats.hours.toFixed(1) : rangeStats.hours}</b> giờ
              </div>
            )}
          </div>

          <div className="itn-cal-top">
            <span className="itn-cal-title"><Calendar size={15} /> {monthLabelCap}</span>
            <div className="itn-cal-nav">
              <button className="itn-navbtn" onClick={() => changeMonth(-1)} title="Tháng trước" aria-label="Tháng trước"><ChevronLeft size={15} /></button>
              <button className="itn-navbtn" onClick={() => changeMonth(1)} title="Tháng sau" aria-label="Tháng sau"><ChevronRight size={15} /></button>
            </div>
          </div>
          <button className="itn-today" onClick={() => { clearRange(); const today = new Date(); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); selectDate(today); }}>
            Về hôm nay
          </button>
          <div className="itn-week">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="itn-grid">
            {calendarDays.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} className="itn-day-empty" />;
              const key = dateKey(date);
              const isToday = key === dateKey(new Date());
              const isSelected = !showAllDates && !rangeActive && key === selectedDate;
              const isInRange = rangeActive && inRange(key);
              return (
                <button key={key}
                  className={`itn-day${isSelected ? " sel" : ""}${isToday ? " today" : ""}${entryDates.has(key) ? " has" : ""}${isInRange ? " in-range" : ""}`}
                  onClick={() => selectDate(date)}
                  aria-label={`${date.getDate()} tháng ${date.getMonth() + 1}${entryDates.has(key) ? ", có nhật ký" : ""}${isInRange ? ", trong khoảng đang lọc" : ""}`}>
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="itn-legend"><i /> Ngày có nhật ký</div>
        </aside>

        {/* ── Danh sách ── */}
        <section aria-label="Danh sách nhật ký">
          <div className="itn-panel-head">
            <div>
              <h2>{rangeActive ? `Khoảng ${formatRangeLabel(rangeFrom, rangeTo)}` : showAllDates ? "Tất cả nhật ký" : formatLongDate(selectedDate)}</h2>
              <p>{selectedEntries.length} nhật ký{isFiltering ? " • đang lọc" : ""}</p>
            </div>
          </div>
          {selectedEntries.length > 0 ? (
            <div className="itn-list">
              {selectedEntries.map((entry) => {
                const hasRefl = reflectionItems(entry.reflection).length > 0;
                let day = "—", mon = "";
                try {
                  const d = dateFromKey(entry.date);
                  day = String(d.getDate()).padStart(2, "0");
                  mon = `T${d.getMonth() + 1}`;
                } catch {}
                return (
                  <article className="itn-card" key={entry.id}>
                    <div className="itn-date"><b>{day}</b><span>{mon}</span></div>
                    <div className="itn-card-body">
                      <h3 className="itn-card-title">{entry.topic || "Nhật ký thực tập"}</h3>
                      <div className="itn-card-meta">
                        <School size={13} /> {entry.school || "Chưa nhập trường"} · Lớp {entry.class || "-"}
                      </div>
                      <div className="itn-badges">
                        {entry.subject && <span className="itn-badge subj"><BookOpen size={11} /> {entry.subject}</span>}
                        {entry.hours && <span className="itn-badge time"><Clock size={11} /> {entry.hours} giờ</span>}
                        <span className="itn-badge">{shortDate(entry.date)}</span>
                        {hasRefl && <span className="itn-badge ok"><Check size={11} /> Đã phản ánh</span>}
                      </div>
                      {entry.activities && <p className="itn-snippet">{entry.activities}</p>}
                      {hasRefl && (
                        <details className="itn-refl">
                          <summary><FileText size={13} /> Xem phản ánh sau giờ dạy</summary>
                          <div className="itn-refl-body">
                            {reflectionItems(entry.reflection).map(([label, val, color]) => (
                              <div key={label} className="itn-refl-item">
                                <strong style={{ color }}>{label}:</strong> {val}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <div className="itn-card-foot">
                        <button className={`itn-view-btn${hasRefl ? " done" : ""}`} onClick={() => handleOpenReflection(entry)}
                          title={hasRefl ? "Xem / sửa phản ánh" : "Viết phản ánh sau giờ dạy"}>
                          <FileText size={13} /> {hasRefl ? "Xem phản ánh" : "Viết phản ánh"}
                        </button>
                        <button className="itn-icobtn" onClick={() => handleDuplicate(entry)} title="Nhân bản nhật ký" aria-label="Nhân bản nhật ký"><Copy size={14} /></button>
                        <button className="itn-icobtn" onClick={() => handleEdit(entry)} title="Sửa nhật ký" aria-label="Sửa nhật ký"><Pencil size={14} /></button>
                        <button className="itn-icobtn danger" onClick={() => handleDelete(entry.id)} title="Xóa nhật ký" aria-label="Xóa nhật ký"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="itn-empty">
              <Calendar size={30} />
              <strong>{isFiltering ? "Không tìm thấy nhật ký phù hợp" : "Chưa có nhật ký cho ngày này"}</strong>
              <span style={{ fontSize: 12 }}>{isFiltering ? "Thử đổi khoảng thời gian, từ khóa hoặc bộ lọc khác." : "Chọn ngày có chấm cam hoặc thêm nhật ký mới để bắt đầu."}</span>
              {!isFiltering && (
                <button className="btn btn-primary btn-sm" onClick={handleCreate}><Plus size={14} /> Thêm nhật ký</button>
              )}
              {rangeActive && (
                <button className="btn btn-secondary btn-sm" onClick={clearRange}><RotateCcw size={14} /> Xóa khoảng thời gian</button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}