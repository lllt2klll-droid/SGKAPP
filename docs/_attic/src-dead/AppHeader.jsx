import React from "react";
import { Search, Sparkles, Settings, Menu } from "lucide-react";

/**
 * AppHeader — Minimal header component for SGK Teacher Workspace
 *
 * Displays:
 * - Current view title
 * - Search, AI, Settings buttons
 * - Mobile menu toggle
 *
 * Props:
 * - currentView (string): Current view ID (e.g. "dashboard", "library")
 * - onSettingsClick (function): Callback when settings button clicked
 * - onSearchClick (function): Callback when search button clicked
 * - onMobileMenuClick (function): Callback for mobile menu toggle
 */
export default function AppHeader({
  currentView = "dashboard",
  onSettingsClick,
  onSearchClick,
  onMobileMenuClick,
  onAIClick,
}) {
  // Map view IDs to friendly titles
  const getViewTitle = (viewId) => {
    const titles = {
      dashboard: "Tổng quan",
      library: "Thư viện Sách",
      lessonplans: "Giáo án",
      activities: "Hoạt động",
      questionbank: "Câu hỏi",
      search: "Tìm kiếm",
      compare: "So sánh",
      matrix: "Ma trận",
      glossary: "Danh sách từ",
      references: "Tài liệu tham khảo",
      collections: "Bộ sưu tập",
      concepts: "Khái niệm",
      langstats: "Thống kê",
      inventory: "Kho dữ liệu",
      worksheets: "Phiếu học tập",
      ideas: "Ý tưởng dạy",
      tasks: "Nhiệm vụ",
      missions: "Nhiệm vụ",
      internship: "Thực tập",
      datatools: "Công cụ dữ liệu",
      help: "Trợ giúp",
      settings: "Cài đặt",
    };
    return titles[viewId] || viewId || "SGK Workspace";
  };

  return (
    <header className="app-header">
      {/* Mobile menu toggle */}
      <div className="app-header-left">
        {onMobileMenuClick && (
          <button
            className="btn btn-icon btn-ghost"
            onClick={onMobileMenuClick}
            title="Mở menu"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
        )}

        {/* View title */}
        <h2 className="app-header-title">{getViewTitle(currentView)}</h2>
      </div>

      {/* Header actions */}
      <div className="app-header-actions">
        {/* AI assistant button — đã fix: mở AssistantBubble, không còn disabled vô hiệu */}
        {onAIClick && (
          <button
            className="btn btn-icon btn-ghost"
            onClick={onAIClick}
            title="Trợ lý AI"
            aria-label="Trợ lý AI"
          >
            <Sparkles size={20} />
          </button>
        )}

        {/* Settings button */}
        {onSettingsClick && (
          <button
            className="btn btn-icon btn-ghost"
            onClick={onSettingsClick}
            title="Cài đặt"
            aria-label="Cài đặt"
          >
            <Settings size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
