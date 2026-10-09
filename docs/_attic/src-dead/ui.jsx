/**
 * UNIFIED UI COMPONENTS — Phase 4 Step 1
 * Single source for common primitives. Wraps existing CSS classes (.btn, .card, etc.)
 * so future redesign touches ONE file, not scattered inline styles.
 * All components use design tokens from styles.css :root (via var(--...)).
 * No business logic inside — pure presentation.
 */
import React from "react";

// ── Button ──────────────────────────────────────────────────────────
// Variants map to existing CSS: .btn, .btn-primary, .btn-secondary, .btn-ghost, .btn-danger, .btn-tool, .btn-icon
export function Button({ variant = "primary", size, iconOnly, className = "", children, ...props }) {
  const v = variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : variant === "ghost" ? "btn-ghost" : variant === "danger" ? "btn-danger" : variant === "tool" ? "btn-tool" : variant === "icon" ? "btn-icon" : "";
  const s = size === "sm" ? "btn-sm" : size === "xs" ? "btn-xs" : "";
  const cls = ["btn", v, s, iconOnly ? "btn-icon" : "", className].filter(Boolean).join(" ");
  return <button className={cls} {...props}>{children}</button>;
}

export function IconButton({ label, children, ...props }) {
  return <button className="btn btn-icon" aria-label={label} title={label} {...props}>{children}</button>;
}

// ── Card ────────────────────────────────────────────────────────────
export function Card({ className = "", children, hover = false, ...props }) {
  const cls = ["card", hover ? "card-hover" : "", className].filter(Boolean).join(" ");
  // .card is defined in CSS; also support legacy .book-card etc. via className
  return <div className={cls} {...props}>{children}</div>;
}

// ── Badge ───────────────────────────────────────────────────────────
export function Badge({ variant = "info", className = "", children, ...props }) {
  const cls = ["tag-chip", variant !== "info" ? `badge-${variant}` : "", className].filter(Boolean).join(" ");
  return <span className={cls} {...props}>{children}</span>;
}

// ── Input / Textarea / Select ──────────────────────────────────────
export function Input({ className = "", ...props }) {
  return <input className={`form-control ${className}`} {...props} />;
}
export function Textarea({ className = "", ...props }) {
  return <textarea className={`form-control ${className}`} {...props} />;
}
export function Select({ className = "", children, ...props }) {
  return <select className={`sort-select ${className}`} {...props}>{children}</select>;
}

// ── Search ─────────────────────────────────────────────────────────
export function SearchInput({ className = "", ...props }) {
  return <input className={`search-input ${className}`} {...props} />;
}

// ── Tabs (segmented) ───────────────────────────────────────────────
export function Tabs({ children, className = "", ...props }) {
  return <div className={`seg-tabs ${className}`} role="tablist" {...props}>{children}</div>;
}
export function Tab({ active, className = "", children, ...props }) {
  return <button className={`seg-tab ${active ? "active" : ""} ${className}`} role="tab" aria-selected={active} {...props}>{children}</button>;
}

// ── Dropdown / Modal / Drawer — thin wrappers around existing .modal-overlay etc.
export function Modal({ open, onClose, children, title }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || "Hộp thoại"}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {title
          ? <div className="modal-header"><h2>{title}</h2><button className="btn btn-icon" onClick={onClose} aria-label="Đóng" title="Đóng">×</button></div>
          : <button className="btn btn-icon modal-close-fallback" onClick={onClose} aria-label="Đóng" title="Đóng">×</button>}
        {children}
      </div>
    </div>
  );
}
export function Drawer({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="app-mobile-drawer open" role="dialog" aria-modal="true">{children}</aside>
    </>
  );
}

// ── Tooltip — pure CSS title fallback + aria
export function Tooltip({ label, children }) {
  return <span title={label} aria-label={label}>{children}</span>;
}

// ── Empty / Loading / Error ────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="dash-empty">
      {icon && <div className="empty-icon">{icon}</div>}
      {title && <h3 className="text-h3">{title}</h3>}
      {description && <p className="text-body-sm muted">{description}</p>}
      {action}
    </div>
  );
}
export function LoadingState({ label = "Đang tải..." }) {
  return <div className="dash-empty view-fallback"><div className="spinner spinner-sm" /><p className="body-muted">{label}</p></div>;
}
export function ErrorState({ message, retry }) {
  return <div className="dash-empty backend-error-card"><p className="backend-error-text">{message}</p>{retry && <button className="btn btn-primary mt-md" onClick={retry}>Thử lại</button>}</div>;
}

// ── ConfirmDialog ──────────────────────────────────────────────────
export function ConfirmDialog({ open, title, description, confirmLabel = "Xác nhận", cancelLabel = "Hủy", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel} role="alertdialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(440px, calc(100vw - 20px))" }}>
        {title && <h3 className="text-h3">{title}</h3>}
        {description && <p className="text-body-sm" style={{ marginTop: "0.5rem" }}>{description}</p>}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Breadcrumb ─────────────────────────────────────────────────────
export function Breadcrumb({ items = [] }) {
  // items: [{label, onClick, active}]
  return (
    <nav className="breadcrumb" aria-label="Đường dẫn điều hướng">
      {items.map((it, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="breadcrumb-separator">/</span>}
          {it.active ? <span className="breadcrumb-current">{it.label}</span> : it.onClick ? <button className="btn-link-reset breadcrumb-link" onClick={it.onClick}>{it.label}</button> : <span className="breadcrumb-section">{it.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ── SectionHeader / PageHeader ─────────────────────────────────────
export function SectionHeader({ title, description, actions }) {
  return (
    <div className="page-section-header">
      <div>
        <h2 className="page-section-title text-h2">{title}</h2>
        {description && <p className="page-section-description text-body-sm muted">{description}</p>}
      </div>
      {actions && <div className="page-section-toolbar">{actions}</div>}
    </div>
  );
}
export function PageHeader({ title, subtitle, breadcrumb, actions }) {
  return (
    <header className="page-header">
      {breadcrumb}
      <div className="page-header-content">
        <div className="page-header-title-area">
          <h1 className="page-title text-h1">{title}</h1>
          {subtitle && <p className="page-subtitle text-body-sm muted">{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
