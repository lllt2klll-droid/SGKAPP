import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";

/**
 * AppShell
 *
 * Main layout container for the SGK Teacher Workspace.
 * Provides:
 * - Sidebar navigation (collapsible)
 * - Header with breadcrumb/title
 * - Main content area
 * - Responsive mobile drawer
 *
 * Structure:
 * ┌─────────────────────────────────────────┐
 * │ HEADER (breadcrumb, title, actions)     │
 * ├──────────┬──────────────────────────────┤
 * │ SIDEBAR  │ MAIN CONTENT                 │
 * │ (fixed)  │ (scrollable)                 │
 * │          │                              │
 * └──────────┴──────────────────────────────┘
 */

export default function AppShell({
  sidebar, // React node: sidebar content
  header, // React node: header content
  children, // React node: main content
  onSidebarToggle, // callback when sidebar toggled
  sidebarCollapsed = false,
}) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleSidebarToggle = () => {
    if (onSidebarToggle) {
      onSidebarToggle(!sidebarCollapsed);
    }
  };

  const handleMobileDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  return (
    <div className="app-shell">
      {/* ─── HEADER ─────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-left">
          <button
            className="btn btn-icon btn-sidebar-toggle"
            onClick={handleSidebarToggle}
            title="Bật/tắt thanh bên"
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <ChevronLeft size={20} />
            )}
          </button>
          {header && <div className="app-header-content">{header}</div>}
        </div>

        <button
          className="btn btn-icon btn-mobile-drawer-toggle"
          onClick={handleMobileDrawerToggle}
          title="Menu"
          aria-label="Toggle mobile menu"
        >
          {mobileDrawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* ─── MAIN LAYOUT ────────────────────────────────────── */}
      <div className="app-layout">
        {/* Sidebar */}
        <aside
          className={`app-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
          role="navigation"
          aria-label="Main navigation"
        >
          {sidebar}
        </aside>

        {/* Mobile Drawer Overlay */}
        {mobileDrawerOpen && (
          <div
            className="app-mobile-drawer-overlay"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        {/* Mobile Drawer (Sidebar in drawer mode) */}
        {mobileDrawerOpen && (
          <aside
            className="app-mobile-drawer open"
            role="navigation"
            aria-label="Mobile navigation"
          >
            {sidebar}
            <button
              className="btn btn-icon app-mobile-drawer-close"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close mobile menu"
            >
              <X size={20} />
            </button>
          </aside>
        )}

        {/* Main Content */}
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

// Sidebar Component (can be reused independently)
export function SidebarSection({ title, children, collapsed = false }) {
  return (
    <section className={`sidebar-section ${collapsed ? "collapsed" : ""}`}>
      {title && <h3 className="sidebar-section-title">{title}</h3>}
      {children}
    </section>
  );
}

// Sidebar Navigation Item
export function SidebarNavItem({
  id,
  icon: Icon,
  label,
  active = false,
  badge,
  onClick,
  title,
}) {
  return (
    <button
      className={`sidebar-nav-item ${active ? "active" : ""}`}
      onClick={() => onClick && onClick(id)}
      title={title || label}
      aria-current={active ? "page" : undefined}
    >
      {Icon && <span className="sidebar-nav-icon">{Icon}</span>}
      <span className="sidebar-nav-label">{label}</span>
      {badge && <span className="sidebar-nav-badge">{badge}</span>}
    </button>
  );
}

// Page Header Component (commonly used in main content)
export function PageHeader({ title, subtitle, breadcrumb, actions, children }) {
  return (
    <header className="page-header">
      {breadcrumb && <nav className="page-breadcrumb">{breadcrumb}</nav>}

      <div className="page-header-content">
        <div className="page-header-title-area">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>

        {(actions || children) && (
          <div className="page-header-actions">
            {actions}
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

// Content Container (with optional padding/grid)
export function PageContent({ children, variant = "default" }) {
  return (
    <div className={`page-content page-content-${variant}`}>{children}</div>
  );
}

// Section with title and optional toolbar
export function PageSection({ title, description, children, toolbar }) {
  return (
    <section className="page-section">
      {title && (
        <div className="page-section-header">
          <div>
            <h2 className="page-section-title">{title}</h2>
            {description && (
              <p className="page-section-description">{description}</p>
            )}
          </div>
          {toolbar && <div className="page-section-toolbar">{toolbar}</div>}
        </div>
      )}
      <div className="page-section-content">{children}</div>
    </section>
  );
}
