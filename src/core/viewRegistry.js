// ── View Registry — central lazy registry for all modules ───────────
// App.jsx now only reads this registry to render views, instead of
// hard-coding 20+ lazy imports and switch(view===...) blocks.
// Registry entries contain metadata needed for search, keyboard shortcuts,
// breadcrumbs, mobile support, and integration.

import React, { lazy } from "react";

// Lazy factories (same as before but now centralized)
// Using lazyWithRetry pattern is kept in App.jsx; we import via dynamic import here.
// For registry we store import factory so App can wrap with Suspense.

function lazyWithRetry(factory) {
  return lazy(async () => {
    for (let i=0;i<=1;i++) {
      try { return await factory(); } catch(err) {
        const msg = String(err?.message||"");
        if ((msg.includes("Failed to fetch")||msg.includes("dynamically imported")||msg.includes("Loading chunk")) && i===0) {
          await new Promise(r=>setTimeout(r,300)); continue;
        }
        throw err;
      }
    }
    throw new Error("Chunk load failed");
  });
}

export const VIEW_REGISTRY = {
  dashboard:   { id:"dashboard",   label:"Tổng quan",          section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/DashboardView.jsx")),  breadcrumb:["WORKSPACE","Tổng quan"], mobile:true, keywords:["tong quan","dashboard"] },
  library:     { id:"library",     label:"Thư viện sách",      section:"WORKSPACE", sectionId:"workspace", component: null, breadcrumb:["WORKSPACE","Thư viện SGK","Thư viện sách"], mobile:true }, // inline LibraryView in App.jsx — requires local filters/books state, cannot be lazy
  continue:    { id:"continue",    label:"Tiếp tục đọc",       section:"WORKSPACE", sectionId:"workspace", component: null, breadcrumb:["WORKSPACE","Thư viện SGK"], mobile:true }, // inline ContinueView — depends on history/lastPageMap
  marks:       { id:"marks",       label:"Đánh dấu",           section:"WORKSPACE", sectionId:"workspace", component: null, breadcrumb:["WORKSPACE","Thư viện SGK"], mobile:true }, // inline BookmarksView — depends on bookmarksMap
  vocab:       { id:"vocab",       label:"Từ vựng",            section:"WORKSPACE", sectionId:"workspace", component: null, breadcrumb:["WORKSPACE","Thư viện SGK"], mobile:true }, // inline VocabView — depends on vocabList
  whiteboard:  { id:"whiteboard",  label:"Bảng trắng",         section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../whiteboard/WhiteboardView.jsx")), breadcrumb:["WORKSPACE","Thư viện SGK","Bảng trắng"], mobile:true },
  internship:  { id:"internship",  label:"Thực tập",           section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/InternshipView.jsx")), breadcrumb:["WORKSPACE","Thư viện SGK"], mobile:true },
  lessonplans: { id:"lessonplans", label:"Giáo án",            section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../khbd/LessonPlanView.jsx")), breadcrumb:["WORKSPACE","Soạn Dạy","Giáo án"], related:["activities","worksheets","questionbank"], mobile:true },
  activities:  { id:"activities",  label:"Hoạt động",          section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/ActivitiesView.jsx")), breadcrumb:["WORKSPACE","Soạn Dạy"], mobile:true },
  worksheets:  { id:"worksheets",  label:"Phiếu học tập",      section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/WorksheetsView.jsx")), breadcrumb:["WORKSPACE","Soạn Dạy"], mobile:true },
  questionbank:{ id:"questionbank",label:"Ngân hàng câu hỏi",  section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/QuestionBankView.jsx")), breadcrumb:["WORKSPACE","Ngân Hàng"], mobile:true },
  search:      { id:"search",      label:"Tìm kiếm",           section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/SearchView.jsx")), breadcrumb:["WORKSPACE","Nghiên Cứu"], mobile:true },
  compare:     { id:"compare",     label:"So sánh",            section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/CompareView.jsx")), breadcrumb:["WORKSPACE","Nghiên Cứu"], mobile:true },
  matrix:      { id:"matrix",      label:"Ma trận",            section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/MatrixView.jsx")), breadcrumb:["WORKSPACE","Công cụ nâng cao"], mobile:true },
  inventory:   { id:"inventory",   label:"Kiểm kê",            section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/InventoryView.jsx")), breadcrumb:["WORKSPACE","Công cụ nâng cao"], mobile:true },
  langstats:   { id:"langstats",   label:"Thống kê ngôn ngữ",  section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/LangStatsView.jsx")), breadcrumb:["WORKSPACE","Công cụ nâng cao"], mobile:true },
  // P2 • view "Khái niệm" đã gộp vào "Từ vựng" (tags = phân loại) — dữ liệu được migrate ở conceptsMigration.js
  references:  { id:"references",  label:"Tài liệu tham khảo", section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/ReferencesView.jsx")), breadcrumb:["WORKSPACE","Sổ tay nghiên cứu"], mobile:true },
  collections: { id:"collections", label:"Bộ công cụ dữ liệu", section:"WORKSPACE", sectionId:"workspace", component: lazyWithRetry(()=> import("../views/CollectionsView.jsx")), breadcrumb:["WORKSPACE","Sổ tay nghiên cứu"], mobile:true },
  tasks:       { id:"tasks",       label:"Nhiệm vụ",           section:"CÔNG VIỆC", sectionId:"cong-viec", component: lazyWithRetry(()=> import("../views/MissionsView.jsx")), breadcrumb:["CÔNG VIỆC"], mobile:true, keywords:["nhiem vu","tasks","missions","viec can lam"] },
  ideas:       { id:"ideas",       label:"Ý tưởng",            section:"CÔNG VIỆC", sectionId:"cong-viec", component: lazyWithRetry(()=> import("../views/IdeasView.jsx")), breadcrumb:["CÔNG VIỆC"], mobile:true },
  stats:       { id:"stats",       label:"Thống kê",           section:"CÔNG VIỆC", sectionId:"cong-viec", component: null, breadcrumb:["CÔNG VIỆC"], mobile:true }, // inline StatsView in App.jsx — depends on counts/quizHistory/favs
  webtools:    { id:"webtools",    label:"Kho Công cụ Web",    section:"KHO CÔNG CỤ", sectionId:"kho-cong-cu",component: lazyWithRetry(()=> import("../views/WebToolboxView.jsx")), breadcrumb:["KHO CÔNG CỤ"], mobile:true },
  datatools:   { id:"datatools",   label:"Dữ liệu & sao lưu",section:"TIỆN ÍCH", sectionId:"tien-ich", component: lazyWithRetry(()=> import("../views/DataToolsView.jsx")), breadcrumb:["TIỆN ÍCH"], mobile:true },
  help:        { id:"help",        label:"Trợ giúp",           section:"TIỆN ÍCH", sectionId:"tien-ich", component: lazyWithRetry(()=> import("../views/HelpView.jsx")), breadcrumb:["TIỆN ÍCH"], mobile:true },
};

export function getViewEntry(viewId) { return VIEW_REGISTRY[viewId] || null; }
export function hasView(viewId) { return !!VIEW_REGISTRY[viewId]; }
export function allViews() { return Object.values(VIEW_REGISTRY); }
export function viewsBySection(section) { return allViews().filter(v=> v.section===section); }
export default VIEW_REGISTRY;
