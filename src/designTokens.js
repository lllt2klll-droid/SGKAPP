/**
 * DESIGN TOKENS — SGK Professional Teacher Workspace
 * Semantic Color System + 9-Step Accent Scale + 60/30/10 Architecture
 *
 * Canonical tokens are named by PURPOSE, not by color value.
 * This file is the single source of truth for color generation.
 */

// ─── COLOR ROLES (canonical semantic names) ───────────────────────
export const COLOR_ROLES = {
  // Foundation 60%
  background: "--color-background",
  backgroundSubtle: "--color-background-subtle",
  // Supporting 30%
  surface: "--color-surface",
  surfaceElevated: "--color-surface-elevated",
  surfaceSoft: "--color-surface-soft",
  surfaceMuted: "--color-surface-muted",
  surfaceOverlay: "--color-surface-overlay",
  // Text
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  textMuted: "--color-text-muted",
  textDisabled: "--color-text-disabled",
  textOnAccent: "--color-text-on-accent",
  // Border
  borderSubtle: "--color-border-subtle",
  border: "--color-border",
  borderStrong: "--color-border-strong",
  // Action / Accent
  action: "--color-action",
  actionHover: "--color-action-hover",
  actionActive: "--color-action-active",
  actionSoft: "--color-action-soft",
  actionStrong: "--color-action-strong",
  focusRing: "--color-focus-ring",
  selection: "--color-selection",
  // Status
  success: "--color-success",
  successSoft: "--color-success-soft",
  successText: "--color-success-text",
  warning: "--color-warning",
  warningSoft: "--color-warning-soft",
  warningText: "--color-warning-text",
  danger: "--color-danger",
  dangerSoft: "--color-danger-soft",
  dangerText: "--color-danger-text",
  info: "--color-info",
  infoSoft: "--color-info-soft",
  infoText: "--color-info-text",
};

// ─── PRESET LABELS (Vietnamese display) ───────────────────────────
export const ACCENT_LABELS = {
  blue: "Xanh dương",
  purple: "Tím",
  green: "Xanh lá",
  orange: "Cam",
  red: "Đỏ",
  teal: "Xanh ngọc",
};

// ─── 9-STEP SCALE GENERATOR ────────────────────────────────────────
// Uses HSL mixing for broad browser compat. Lightness/saturation are
// tuned per level to create perceptually distinct steps (not mere opacity).

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x) => {
    const v = Math.round(x * 255).toString(16);
    return v.length === 1 ? `0${v}` : v;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Generate a 9-step accent scale from a single base hex color.
 * Levels:
 * 1 = Tint extra light (96-98% L)
 * 2 = Soft background
 * 3 = Soft interactive
 * 4 = Border / subtle
 * 5 = Base-light
 * 6 = Base (original hue)
 * 7 = Strong
 * 8 = Deep
 * 9 = Deepest
 */
export function generateAccentScale(baseHex) {
  if (!baseHex || !/^#([0-9A-Fa-f]{6})$/.test(baseHex)) {
    baseHex = "#2563EB";
  }
  const { h, s, l } = hexToHsl(baseHex);
  // Preserve hue, adjust lightness/saturation per level for perceptual scale
  const scale = {};
  // Tuned lightness targets — works well for mid-lightness bases (30-60% L)
  // For very light/dark bases we clamp.
  const baseL = clamp(l, 32, 62);
  const baseS = clamp(s, 45, 92);

  const defs = [
    { id: 1, L: 97, S: clamp(baseS * 0.55, 18, 90) }, // tint
    { id: 2, L: 92, S: clamp(baseS * 0.62, 25, 92) },
    { id: 3, L: 84, S: clamp(baseS * 0.72, 30, 95) },
    { id: 4, L: 73, S: clamp(baseS * 0.82, 35, 96) },
    { id: 5, L: 60, S: clamp(baseS * 0.93, 40, 96) }, // base-light
    { id: 6, L: baseL, S: baseS }, // base
    { id: 7, L: clamp(baseL - 9, 30, 55), S: clamp(baseS * 0.98, 45, 96) },
    { id: 8, L: clamp(baseL - 18, 22, 45), S: clamp(baseS * 0.92, 50, 96) },
    { id: 9, L: clamp(baseL - 27, 16, 35), S: clamp(baseS * 0.88, 50, 90) },
  ];

  for (const d of defs) {
    // slight hue preservation — no shift needed
    scale[d.id] = hslToHex(h, d.S, d.L);
  }
  // Ensure level 6 is exactly the user's chosen color for fidelity
  scale[6] = baseHex.toUpperCase();
  // Re-derive 5 so contrast step is smooth (avoid jump if base is off-center)
  // Keep 5 as slightly lighter than 6
  if (baseL < 55) {
    // already close — keep computed 5
  }
  return scale;
}

// ─── PRESET PALETTES (9-step, Vietnamese) ──────────────────────────
// Each preset is a real 9-step scale, not just single hex.
// Generated with generateAccentScale for consistency, then hand-tuned
// where needed for visual harmony.

function presetScale(hex) {
  return generateAccentScale(hex);
}

export const ACCENT_PALETTES = {
  blue: presetScale("#2563EB"),
  purple: presetScale("#7C3AED"),
  green: presetScale("#16A34A"),
  orange: presetScale("#D97706"),
  red: presetScale("#DC2626"),
  teal: presetScale("#0891B2"),
};

// Human-readable names for each scale level (purpose-based)
export const SCALE_LEVEL_LABELS = {
  1: "Tint — nền nhạt nhất",
  2: "Pale Surface — nền phụ",
  3: "Soft — tương tác nhẹ",
  4: "Border — viền nhạt",
  5: "Base Light — nền sáng",
  6: "Base — màu chính",
  7: "Strong — nhấn mạnh",
  8: "Deep — đậm",
  9: "Deepest — đậm nhất",
};

// Short labels for compact UI
export const SCALE_SHORT_LABELS = {
  1: "Tint",
  2: "Pale",
  3: "Soft",
  4: "Border",
  5: "Base Light",
  6: "Base",
  7: "Strong",
  8: "Deep",
  9: "Deepest",
};

// ─── Helper: resolve accent semantics from a scale ─────────────────
export function accentSemanticsFromScale(scale, isDark = false) {
  // scale is {1..9: hex}
  if (!scale) return {};
  if (isDark) {
    return {
      action: scale[4] || scale[6],
      actionHover: scale[3] || scale[5],
      actionActive: scale[2] || scale[4],
      actionSoft: hexToRgba(scale[6], 0.14),
      actionStrong: scale[7] || scale[6],
      focusRing: hexToRgba(scale[6], 0.4),
      selection: hexToRgba(scale[6], 0.28),
    };
  }
  return {
    action: scale[6],
    actionHover: scale[7],
    actionActive: scale[8],
    actionSoft: scale[1],
    actionStrong: scale[8],
    focusRing: hexToRgba(scale[6], 0.32),
    selection: scale[2],
  };
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Legacy DESIGN_TOKENS (kept for spacing/typography etc) ────────
export const DESIGN_TOKENS = {
  colors: {
    primary: {
      50: "#EFF6FF",
      100: "#DBEAFE",
      200: "#BFDBFE",
      300: "#93C5FD",
      400: "#60A5FA",
      500: "#2563EB",
      600: "#1D4ED8",
      700: "#1E40AF",
      800: "#1E3A8A",
      900: "#172554",
    },
    secondary: {
      50: "#F5F3FF",
      100: "#EDE9FE",
      200: "#DDD6FE",
      300: "#C4B5FD",
      400: "#A78BFA",
      500: "#7C3AED",
      600: "#6D28D9",
      700: "#5B21B6",
      800: "#4C1D95",
      900: "#3B0764",
    },
    success: {
      50: "#DCFCE7",
      100: "#BBF7D0",
      200: "#86EFAC",
      300: "#4ADE80",
      400: "#22C55E",
      500: "#16A34A",
      600: "#15803D",
      700: "#166534",
      800: "#14532D",
      900: "#052E16",
    },
    warning: {
      50: "#FEF3C7",
      100: "#FDE68A",
      200: "#FCD34D",
      300: "#FBBF24",
      400: "#F59E0B",
      500: "#D97706",
      600: "#B45309",
      700: "#92400E",
      800: "#78350F",
      900: "#451A03",
    },
    danger: {
      50: "#FEE2E2",
      100: "#FECACA",
      200: "#FCA5A5",
      300: "#F87171",
      400: "#EF4444",
      500: "#DC2626",
      600: "#B91C1C",
      700: "#991B1B",
      800: "#7F1D1D",
      900: "#450A0A",
    },
    neutral: {
      50: "#F8FAFC",
      100: "#F1F5F9",
      200: "#E2E8F0",
      300: "#CBD5E1",
      400: "#94A3B8",
      500: "#64748B",
      600: "#475569",
      700: "#334155",
      800: "#1E293B",
      900: "#0F172A",
    },
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceVariant: "#F1F5F9",
    surfaceInverted: "#0B1220",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    text: {
      primary: "#0F172A",
      secondary: "#334155",
      muted: "#64748B",
      light: "#94A3B8",
      inverse: "#F8FAFC",
    },
    info: "#0891B2",
    error: "#DC2626",
    success_alt: "#22C55E",
    warning_alt: "#F59E0B",
  },
  spacing: {
    0: "0",
    2: "0.125rem",
    4: "0.25rem",
    8: "0.5rem",
    12: "0.75rem",
    16: "1rem",
    20: "1.25rem",
    24: "1.5rem",
    28: "1.75rem",
    32: "2rem",
    36: "2.25rem",
    40: "2.5rem",
    44: "2.75rem",
    48: "3rem",
    56: "3.5rem",
    64: "4rem",
    72: "4.5rem",
    80: "5rem",
    96: "6rem",
  },
  radius: {
    none: "0",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },
  shadow: {
    none: "none",
    xs: "0 1px 2px rgba(15, 23, 32, 0.05)",
    sm: "0 2px 4px rgba(15, 23, 32, 0.06)",
    md: "0 4px 6px rgba(15, 23, 32, 0.07)",
    lg: "0 10px 15px rgba(15, 23, 32, 0.08)",
    xl: "0 20px 25px rgba(15, 23, 32, 0.1)",
    "xs-dark": "0 1px 2px rgba(0, 0, 0, 0.3)",
    "sm-dark": "0 2px 4px rgba(0, 0, 0, 0.3)",
    "md-dark": "0 4px 6px rgba(0, 0, 0, 0.3)",
    "lg-dark": "0 10px 15px rgba(0, 0, 0, 0.3)",
    "xl-dark": "0 20px 25px rgba(0, 0, 0, 0.4)",
  },
  typography: {
    family: {
      heading: '"Andika", "Quicksand", "Mulish", "Segoe UI", Tahoma, Arial, sans-serif',
      body: '"Quicksand", "Mulish", "Be Vietnam Pro", "Segoe UI", Tahoma, Arial, sans-serif',
      mono: '"Consolas", "Courier New", monospace',
    },
    size: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
    },
    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
      loose: 2,
    },
  },
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modal: 400,
    popover: 500,
    tooltip: 600,
    notification: 900,
    bubble: 9999,
  },
  transition: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    base: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
    sidebar:
      "width 0.32s cubic-bezier(0.25, 0.8, 0.25, 1), padding 0.32s cubic-bezier(0.25, 0.8, 0.25, 1)",
  },
  layout: {
    sidebar: { width: "280px", widthCollapsed: "68px", itemHeight: "2.5rem" },
    header: { height: "64px", heightMobile: "56px" },
    mobileBreakpoint: "768px",
    tabletBreakpoint: "1024px",
    desktopBreakpoint: "1366px",
    wideBreakpoint: "1600px",
    maxWidth: "1920px",
  },
  components: {
    button: { height: "2.4rem", heightSmall: "2rem", heightLarge: "2.8rem", paddingX: "1rem", paddingXSmall: "0.75rem" },
    input: { height: "2.4rem", paddingX: "0.875rem", radius: "8px" },
    card: { padding: "1.25rem", radius: "12px", gap: "16px" },
    badge: { height: "1.5rem", paddingX: "0.5rem", radius: "4px" },
  },
  breakpoints: {
    mobile: "360px",
    mobileLarge: "430px",
    tablet: "768px",
    laptop: "1024px",
    desktop: "1366px",
    wide: "1600px",
    ultrawide: "1920px",
  },
};

export const CSS_VARIABLE_MAP = {
  "--color-primary": "colors.primary.500",
  "--color-primary-light": "colors.primary.100",
  "--color-primary-dark": "colors.primary.600",
  "--color-secondary": "colors.secondary.500",
  "--color-success": "colors.success.500",
  "--color-warning": "colors.warning.500",
  "--color-danger": "colors.danger.500",
  "--color-background": "colors.background",
  "--color-surface": "colors.surface",
  "--color-border": "colors.border",
  "--color-text": "colors.text.primary",
  "--color-text-secondary": "colors.text.secondary",
  "--color-text-muted": "colors.text.muted",
  "--space-1": "spacing.4",
  "--space-2": "spacing.8",
  "--space-3": "spacing.12",
  "--space-4": "spacing.16",
  "--space-5": "spacing.20",
  "--space-6": "spacing.24",
  "--space-8": "spacing.32",
  "--font-family-heading": "typography.family.heading",
  "--font-family-body": "typography.family.body",
  "--font-size-base": "typography.size.base",
  "--font-weight-normal": "typography.weight.normal",
  "--sidebar-width": "layout.sidebar.width",
  "--header-height": "layout.header.height",
  "--radius-sm": "radius.sm",
  "--radius-md": "radius.md",
  "--radius-lg": "radius.lg",
};

export default DESIGN_TOKENS;
