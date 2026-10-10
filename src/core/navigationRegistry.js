// ── Navigation Registry — Single Source of Truth ──────────────────────
// Unifies App.jsx NAV_SECTIONS + components/Navigation.jsx +
// components/navigationConfig.js + navigationConfig.js FOOTER_NAV
// into ONE config. All renderers (sidebar, breadcrumb, mobile nav,
// page title, deep navigation) derive from this file.
//
// Adding a module now = one entry here. No need to edit 3-4 files.

import React from "react";
import {
  LayoutDashboard,
  Library,
  Clock,
  Bookmark,
  NotebookPen,
  Palette,
  School,
  FileText,
  Puzzle,
  ListChecks,
  Database,
  FileSearch,
  Columns2,
  Tags,
  ClipboardList,
  TrendingUp,
  Lightbulb,
  ClipboardCheck,
  BarChart3,
  HelpCircle,
  Settings,
  DatabaseBackup,
  AppWindow,
} from "lucide-react";

// ── View definitions: id → meta ──
export const VIEWS = {
  dashboard:   { id:"dashboard",   label:"Tổng quan",           icon:LayoutDashboard, section:"WORKSPACE", sectionId:"workspace", subsection:null,          order:0,  mobile:true, desktop:true, breadcrumb:["WORKSPACE","Tổng quan"] },
  library:     { id:"library",     label:"Thư viện sách",       icon:Library,        section:"WORKSPACE", sectionId:"workspace", subsection:"Thư viện SGK", order:1, mobile:true, desktop:true },
  continue:    { id:"continue",    label:"Tiếp tục đọc",        icon:Clock,          section:"WORKSPACE", sectionId:"workspace", subsection:"Thư viện SGK", order:2, mobile:true, desktop:true },
  marks:       { id:"marks",       label:"Đánh dấu",            icon:Bookmark,       section:"WORKSPACE", sectionId:"workspace", subsection:"Thư viện SGK", order:3, mobile:true, desktop:true },
  vocab:       { id:"vocab",       label:"Từ vựng",             icon:NotebookPen,    section:"WORKSPACE", sectionId:"workspace", subsection:"Thư viện SGK", order:4, mobile:true, desktop:true },
  whiteboard:  { id:"whiteboard",  label:"Bảng trắng",          icon:Palette,        section:"WORKSPACE", sectionId:"workspace", subsection:"Thư viện SGK", order:5, mobile:true, desktop:true },
  internship:  { id:"internship",  label:"Thực tập",            icon:School,         section:"WORKSPACE", sectionId:"workspace", subsection:"Thư viện SGK", order:6, mobile:true, desktop:true },
  lessonplans: { id:"lessonplans", label:"Giáo án",             icon:FileText,       section:"WORKSPACE", sectionId:"workspace", subsection:"Soạn Dạy",     order:10, mobile:true, desktop:true },
  activities:  { id:"activities",  label:"Hoạt động",           icon:Puzzle,         section:"WORKSPACE", sectionId:"workspace", subsection:"Soạn Dạy",     order:11, mobile:true, desktop:true },
  worksheets:  { id:"worksheets",  label:"Phiếu học tập",       icon:ListChecks,     section:"WORKSPACE", sectionId:"workspace", subsection:"Soạn Dạy",     order:12, mobile:true, desktop:true },
  questionbank:{ id:"questionbank",label:"Ngân hàng câu hỏi",   icon:Database,       section:"WORKSPACE", sectionId:"workspace", subsection:"Ngân Hàng",    order:20, mobile:true, desktop:true },
  search:      { id:"search",      label:"Tìm kiếm",            icon:FileSearch,     section:"WORKSPACE", sectionId:"workspace", subsection:"Nghiên Cứu",   order:30, mobile:true, desktop:true },
  compare:     { id:"compare",     label:"So sánh",             icon:Columns2,       section:"WORKSPACE", sectionId:"workspace", subsection:"Nghiên Cứu",   order:31, mobile:true, desktop:true },
  matrix:      { id:"matrix",      label:"Ma trận",             icon:Tags,           section:"WORKSPACE", sectionId:"workspace", subsection:"Công cụ nâng cao", order:40, mobile:true, desktop:true },
  inventory:   { id:"inventory",   label:"Kiểm kê",             icon:ClipboardList,  section:"WORKSPACE", sectionId:"workspace", subsection:"Công cụ nâng cao", order:41, mobile:true, desktop:true },
  langstats:   { id:"langstats",   label:"Thống kê ngôn ngữ",   icon:TrendingUp,     section:"WORKSPACE", sectionId:"workspace", subsection:"Công cụ nâng cao", order:42, mobile:true, desktop:true },
  concepts:    { id:"concepts",    label:"Khái niệm",           icon:NotebookPen,    section:"WORKSPACE", sectionId:"workspace", subsection:"Công cụ nâng cao", order:43, mobile:true, desktop:true },
  references:  { id:"references",  label:"Tài liệu tham khảo",  icon:Library,        section:"WORKSPACE", sectionId:"workspace", subsection:"Công cụ nâng cao", order:44, mobile:true, desktop:true },
  collections: { id:"collections", label:"Bộ công cụ dữ liệu",  icon:ClipboardList,  section:"WORKSPACE", sectionId:"workspace", subsection:"Công cụ nâng cao", order:45, mobile:true, desktop:true },
  tasks:       { id:"tasks",       label:"Nhiệm vụ",            icon:ClipboardCheck, section:"CÔNG VIỆC", sectionId:"cong-viec", subsection:null,            order:50, mobile:true, desktop:true },
  ideas:       { id:"ideas",       label:"Ý tưởng",             icon:Lightbulb,      section:"CÔNG VIỆC", sectionId:"cong-viec", subsection:null,            order:51, mobile:true, desktop:true },
  stats:       { id:"stats",       label:"Thống kê",            icon:BarChart3,      section:"CÔNG VIỆC", sectionId:"cong-viec", subsection:null,            order:52, mobile:true, desktop:true },
  webtools:    { id:"webtools",    label:"Kho Công cụ Web",     icon:AppWindow,      section:"KHO CÔNG CỤ", sectionId:"kho-cong-cu",subsection:null,           order:60, mobile:true, desktop:true, large:true, promo:true },
  datatools:   { id:"datatools",   label:"Sao lưu & Khôi phục", icon:DatabaseBackup, section:"TIỆN ÍCH", sectionId:"tien-ich",  subsection:null,            order:70, mobile:true, desktop:true },
  help:        { id:"help",        label:"Trợ giúp",            icon:HelpCircle,     section:"TIỆN ÍCH", sectionId:"tien-ich",  subsection:null,            order:71, mobile:true, desktop:true },
  glossary:    { id:"glossary",    label:"Từ điển",             icon:NotebookPen,    section:"TIỆN ÍCH", sectionId:"tien-ich",  subsection:null,            order:72, mobile:false, desktop:true },
};

// ── Navigation sections (for sidebar rendering) ──
export const NAVIGATION_CONFIG = [
  {
    id: "workspace",
    title: "WORKSPACE",
    type: "section",
    items: [], // top-level (dashboard)
    subsections: [
      { id:"library-group", title:"Thư viện SGK", viewIds: ["library","continue","marks","vocab","whiteboard","internship"] },
      { id:"teaching-group", title:"Soạn Dạy", viewIds: ["lessonplans","activities","worksheets"] },
      { id:"assessment-group", title:"Ngân Hàng", viewIds: ["questionbank"] },
      { id:"research-group", title:"Nghiên Cứu", viewIds: ["search","compare"] },
      { id:"advanced-group", title:"Công cụ nâng cao", viewIds: ["matrix","inventory","langstats","concepts","references","collections"] },
    ],
    topViewIds: ["dashboard"],
  },
  { id:"work", title:"CÔNG VIỆC", type:"section", viewIds:["tasks","ideas","stats"] },
  { id:"webtools-section", title:"KHO CÔNG CỤ", type:"section", large:true, viewIds:["webtools"] },
];

export const FOOTER_NAV = [
  { id:"settings", label:"Cài đặt", icon:Settings, hasAction:true },
  { id:"datatools", label:"Sao lưu & Khôi phục", icon:DatabaseBackup, view:"datatools" },
  { id:"help", label:"Trợ giúp", icon:HelpCircle, view:"help" },
];

// Alias map for legacy ids (bookmarks/marks, FOOTER_NAV sync, etc)
// NOTE: stats ≠ langstats — distinct modules by design:
//   stats     = CÔNG VIỆC → Thống kê cá nhân (counts, streak, quiz history)
//   langstats = Công cụ nâng cao → Thống kê ngôn ngữ (corpus/lexical)
// Legacy: components/Navigation.jsx briefly mapped id "stats" → view "langstats" (bug, now fixed).
// Alias kept for bookmark backwards-compat only.
export const VIEW_ALIASES = {
  bookmarks: "marks",
  bookmark: "marks",
  bookmarks_view: "marks",
  langstats_alias: "langstats",
  stats_view: "stats",
  sync: "datatools", // legacy FOOTER_NAV sync → datatools
};

export function normalizeViewId(id) {
  if (!id) return id;
  if (id === "bookmarks") return "marks";
  // stats và langstats là 2 view RIÊNG BIỆT — không map "stats" sang "langstats"
  // (trước đây có nhánh `id === "stats" && false` — dead code, đã xoá)
  return id;
}

export function getViewMeta(viewId) {
  const norm = normalizeViewId(viewId);
  return VIEWS[norm] || null;
}

export function getBreadcrumb(viewId) {
  const meta = getViewMeta(viewId);
  if (!meta) return { label: String(viewId), section: "", subsection: null };
  return { label: meta.label, section: meta.section, subsection: meta.subsection };
}

export function allViewIds() { return Object.keys(VIEWS); }

// Nhóm section: sectionId là key ổn định (không dấu) cho logic/lọc,
// section/label tiếng Việt chỉ dùng hiển thị. Đổi tên hiển thị không vỡ logic.
export const SECTION_META = {
  "workspace":    { id: "workspace",    label: "Không gian làm việc" },
  "cong-viec":    { id: "cong-viec",    label: "Công việc" },
  "kho-cong-cu":  { id: "kho-cong-cu",  label: "Kho công cụ" },
  "tien-ich":     { id: "tien-ich",     label: "Tiện ích" },
};
export function sectionLabel(sectionId) {
  return (SECTION_META[sectionId] && SECTION_META[sectionId].label) || sectionId || "";
}
export function viewsBySectionId(sectionId) {
  return Object.values(VIEWS).filter(v => v.sectionId === sectionId);
}

// Chuẩn hóa key expandedSections: label hiển thị cũ → id ổn định.
// Pure (nhận sections đầu vào) để unit-test được; App truyền buildNavSectionsCore({}).
// Giữ nguyên giá trị, không mất trạng thái; key lạ giữ nguyên.
export function normalizeExpandedKeys(obj, sections = []) {
  try {
    const out = { ...(obj || {}) };
    const labelToId = {};
    for (const s of sections || []) {
      if (s.id && s.label && s.id !== s.label) labelToId[s.label] = s.id;
      for (const sub of s.subsections || []) {
        if (sub.id && sub.label && sub.id !== sub.label) labelToId[sub.label] = sub.id;
      }
    }
    for (const k of Object.keys(labelToId)) {
      const id = labelToId[k];
      if (k in out && !(id in out)) out[id] = out[k];
      if (k in out && id in out && id !== k) delete out[k];
    }
    return out;
  } catch { return obj; }
}

// For App.jsx to render sidebar without hard-coding NAV_SECTIONS.
// Returns array suitable for previous NAV_SECTIONS rendering (with icon JSX).
export function buildNavSections({ badges = {} } = {}) {
  const iconEl = (Comp, size=17) => React.createElement(Comp, { size });
  const viewToItem = (vid) => {
    const m = VIEWS[vid];
    if (!m) return null;
    return { id: m.id, label: m.label, icon: iconEl(m.icon), badge: badges[m.id] ?? undefined, large: !!m.large, promo: !!m.promo };
  };
  return NAVIGATION_CONFIG.map(sec => {
    if (sec.subsections) {
      const topItems = (sec.topViewIds || []).map(viewToItem).filter(Boolean);
      return {
        id: sec.id,
        label: sec.title,
        items: topItems,
        subsections: sec.subsections.map(sub => ({
          id: sub.id,
          label: sub.title,
          items: sub.viewIds.map(viewToItem).filter(Boolean),
        })),
      };
    }
    return {
      id: sec.id,
      label: sec.title,
      large: !!sec.large,
      items: (sec.viewIds || []).map(viewToItem).filter(Boolean),
    };
  });
}

export function getFooterNav() { return FOOTER_NAV; }
