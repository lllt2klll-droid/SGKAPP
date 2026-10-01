import { FileSearch, FileText, LayoutDashboard, Library, Menu } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "library", label: "Thư viện", icon: Library },
  { id: "search", label: "Tìm kiếm", icon: FileSearch },
  { id: "lessonplans", label: "Giáo án", icon: FileText },
];

export default function MobileBottomNav({ view, onNavigate, onOpenMenu }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = view === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className={`mbn-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={t.label}
            onClick={() => onNavigate?.(t.id)}
          >
            <span className="mbn-icon">
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              {active && <span className="mbn-dot" aria-hidden="true" />}
            </span>
            <span className="mbn-label">{t.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="mbn-item"
        aria-label="Mở menu đầy đủ"
        onClick={() => onOpenMenu?.()}
      >
        <span className="mbn-icon">
          <Menu size={21} />
        </span>
        <span className="mbn-label">Menu</span>
      </button>
    </nav>
  );
}
