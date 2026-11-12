import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/00-tokens.css";
import "./styles/01-typography-a11y.css";
import "./styles/02-header.css";
import "./styles/03-buttons.css";
import "./styles/04-dashboard-workspace.css";
import "./styles/05-reader.css";
import "./styles/06-views-core.css";
import "./styles/07-upload.css";
import "./styles/08-dashboard.css";
import "./styles/09-reader-pdf-ai.css";
import "./styles/10-overlays.css";
import "./styles/11-utility-bubble.css";
import "./khbd/khbd.css";
import "./styles/13-override-sidebar.css";
import "./styles/14-datatable.css";
import "./styles/15-responsive-fixpack.css";
import "./styles/16-foundation.css";
import "./styles/18-forms.css";
import "./styles/19-responsive-master.css";
import "./styles/20-polish-textbookmodal.css";
import "./styles/21-polish-refinements.css";
import "./styles/22-library-redesign.css";
import "./styles/22-webtoolbox.css";
import "./styles/23-help.css";
import "./styles/25-whiteboard.css";
import "./styles/26-ux-polish.css";
import "./styles/27-word-editor.css";
import "./styles/30-datatools.css";
import "./styles/28-theme-fix.css";
import "./styles/dashboard-compact.css";
import "./missions.css";
import "./styles/31-mobile-tablet.css";
import "./styles/32-mobile-app.css";
import "./styles/33-bookreader-mobile.css";
import "./styles/34-flat-pro.css";
import "./styles/35-advanced-tools.css";
import "./styles/36-settings-redesign.css";
import "./styles/37-filedropzone.css";
import "./styles/38-vocab.css";
import "./styles/39-responsive-fix.css";
import "./styles/40-phone-nits.css";
import "./styles/41-assistant-pro.css";
import "./styles/42-bookmarks.css";
import "./styles/43-dashboard-premium.css";
import "./styles/44-brand-navigation.css";
import "./styles/45-reader-pan-cleanup.css";
import "./styles/46-dashboard-liquid-glass.css";
import "./styles/47-settings-liquid-glass.css";
import "./styles/48-liquid-glass-global.css";
import "./styles/49-help-liquid-glass.css";
import "./styles/50-liquid-glass-light-contrast.css";
import "./styles/51-library-toolbar-glass.css";
import "./styles/52-reader-toc-redesign.css";
import "./styles/53-lesson-plan-vault.css";
import "./styles/54-lesson-plan-library.css";
import "./styles/55-lesson-plan-vault-match.css";
import "./styles/57-notes-liquid-glass.css";
import "./styles/58-accent-liquid-buttons.css";
import "./styles/59-search-index-redesign.css";
import "./styles/60-data-tools-workflow.css";
import "./styles/61-reader-tools-unified.css";
import "./styles/62-reader-page-flip.css";
import "./styles/63-linked-books.css";
import "./styles/64-delete-buttons.css";
import "./styles/65-batch-upload.css";
import App from "./App.jsx";
import { APP_COPYRIGHT, APP_DEVELOPER } from "./ai/appPersona.js";
import { loadSettings, applySettings } from "./services/settingsStore.js";
import { initGlobalClickSound } from "./audio/soundManager.js";

try {
  window.__APP_OWNER__ = APP_DEVELOPER;
  window.__APP_COPYRIGHT__ = APP_COPYRIGHT;
  console.log(`%c${APP_COPYRIGHT}`, "font-weight:bold;color:#2563EB;");
} catch {}
try {
  const settings = loadSettings();
  applySettings(settings);
  const theme = settings.appearance?.theme || "system";
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
} catch {}
try { initGlobalClickSound(); } catch {}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
