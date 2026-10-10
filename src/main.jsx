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
import App from "./App.jsx";
import { loadSettings, applySettings } from "./settingsStore.js";
import { initGlobalClickSound } from "./audio/soundManager.js";
// Apply custom color + theme before first paint so settings color hits app instantly
try {
  const s = loadSettings();
  applySettings(s);
  const t = s.appearance?.theme || "system";
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
} catch {}
try { initGlobalClickSound(); } catch {}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
