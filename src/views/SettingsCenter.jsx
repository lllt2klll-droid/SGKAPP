import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card } from "./SettingsPrimitives.jsx";
import { AboutSection } from "./SettingsAboutFeedback.jsx";
import { SettingsOverview, GeneralSection, DashboardSection, AppearanceSection, ReadingSection, EditorSection, LibrarySection, WhiteboardSection, MissionsSection, AISection, SearchSection, ExportSection, BehaviorSection, NotificationsSection, KeyboardSection, FeaturesSection, AccessibilitySection, PrivacySection, AdvancedSection } from "./SettingsSections.jsx";
import { appEvents, AppEvents } from "../core/appEvents.js";
import {
  Settings, Search, Palette, BookOpen, Target, Cpu, Bell, Keyboard,
  Accessibility, Shield, Zap, Info, RotateCcw, Eye, EyeOff, RefreshCw,
  X, Sun, Moon, Monitor, FileText, Volume2, Download,
  Check, Sparkles, SlidersHorizontal, Library as LibraryIcon, Timer,
  LayoutDashboard, Blocks, Trash2, ChevronDown, ExternalLink,
  ArrowRight, Home, GraduationCap, ShieldCheck,
} from "lucide-react";
import {
  loadSettings, saveSettings, updateSettings, resetSection,
  DEFAULT_SETTINGS, searchSettings, applySettings, dispatchSettingsUpdated,
  getStorageBreakdown,
  testNotification, refreshNotificationTimer,
  clearAiChatHistory, clearRecentSearchHistory, clearScanHistory,
  OPTIONAL_VIEW_IDS,
} from "../services/settingsStore.js";
import { soundManager } from "../audio/soundManager.js";
import {
  DEFAULT_SHORTCUTS, SHORTCUT_META, SHORTCUT_CATEGORIES, getShortcuts,
  comboToString, findConflict,
} from "../services/keyboardShortcuts.js";
import { VIEWS as NAV_VIEWS } from "../core/navigationRegistry.js";
import { useFocusTrap } from "../ui/useFocusTrap.js";
import { dl } from "../services/exportDoc.js";
import { getGeminiApiKey, setGeminiApiKey } from "../data/storage.js";
import { safeRemove } from "../safeStorage.js";
import { getApiBase, apiUrl, MODEL_OPTIONS, normalizeModel } from "../services/apiConfig.js";
import aiService, { getFriendlyErrorMessage } from "../ai/aiService.js";
import { pdfjsLib } from "../reader/pdfjs-config.js";
import { ACCENT_PALETTES, generateAccentScale } from "../designTokens.js";

/* ── Điều hướng nhóm ─────────────────────────────── */
const NAV_GROUPS = [
  { title: "Cá nhân hóa", items: ["general", "appearance", "dashboard"] },
  { title: "Dạy & đọc", items: ["reading", "editor", "library", "whiteboard", "missions"] },
  { title: "Công cụ", items: ["ai", "search", "keyboard", "features"] },
  { title: "Dữ liệu & bảo vệ", items: ["export", "privacy", "behavior", "notifications"] },
  { title: "Trợ năng & ứng dụng", items: ["accessibility", "advanced", "about"] },
];
const SECTIONS = [
  { id: "overview", label: "Tổng quan cài đặt", icon: <Home size={16} />, hint: "Lối tắt và các nhóm cài đặt" },
  { id: "general", label: "Tổng quan", icon: <Settings size={16} />, hint: "Tên hiển thị, trang mở, tuần" },
  { id: "dashboard", label: "Bảng điều khiển", icon: <LayoutDashboard size={16} />, hint: "Khối hiển thị trang Tổng quan" },
  { id: "appearance", label: "Giao diện", icon: <Palette size={16} />, hint: "Sáng/tối, màu, chữ", subs: [{ id: "st-theme", label: "Sáng / Tối" }, { id: "st-accent", label: "Màu sắc" }, { id: "st-type", label: "Chữ & Mật độ" }] },
  { id: "reading", label: "Trình đọc sách", icon: <BookOpen size={16} />, hint: "Zoom, layout, TOC" },
  { id: "editor", label: "Soạn thảo Word", icon: <FileText size={16} />, hint: "Font, thước, nháp" },
  { id: "library", label: "Thư viện", icon: <LibraryIcon size={16} />, hint: "Lưới, sắp xếp, xem trước" },
  { id: "whiteboard", label: "Bảng trắng", icon: <SlidersHorizontal size={16} />, hint: "Lưới, bút, snap" },
  { id: "missions", label: "Nhiệm vụ", icon: <Target size={16} />, hint: "Gamification, XP, streak" },
  { id: "ai", label: "AI Gemini", icon: <Cpu size={16} />, hint: "Key, model, phong cách" },
  { id: "search", label: "Tìm kiếm", icon: <Search size={16} />, hint: "Mặc định, fuzzy, giới hạn" },
  { id: "export", label: "Xuất dữ liệu", icon: <Download size={16} />, hint: "Mốc thời gian trong tên file" },
  { id: "behavior", label: "Hành vi & Âm thanh", icon: <Zap size={16} />, hint: "Xác nhận, tự lưu, loa" },
  { id: "notifications", label: "Thông báo", icon: <Bell size={16} />, hint: "Nhắc hằng ngày, thử" },
  { id: "keyboard", label: "Phím tắt", icon: <Keyboard size={16} />, hint: "Tự thiết lập" },
  { id: "features", label: "Tính năng", icon: <Blocks size={16} />, hint: "Bật/tắt module toàn app" },
  { id: "accessibility", label: "Trợ năng", icon: <Accessibility size={16} />, hint: "Tương phản, chữ, đọc dễ" },
  { id: "privacy", label: "Riêng tư", icon: <Shield size={16} />, hint: "Lịch sử, dữ liệu" },
  { id: "advanced", label: "Nâng cao", icon: <Timer size={16} />, hint: "Gỡ lỗi, chẩn đoán" },
  { id: "about", label: "Giới thiệu", icon: <Info size={16} />, hint: "Phiên bản, góp ý" },
];

function nowTime() { try { return new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } }

/* ── Danh mục module được phép tắt (Cài đặt → Tính năng) ─────────── */



export default function SettingsCenter({ onClose, initialSection = "general" }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [active, setActive] = useState(() => (SECTIONS.some((s) => s.id === initialSection) ? initialSection : "overview"));
  const [query, setQuery] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyResult, setKeyResult] = useState(null);
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [whiteboardSyncStatus, setWhiteboardSyncStatus] = useState(null);
  const whiteboardSyncQueueRef = useRef(Promise.resolve());
  const whiteboardSyncSequenceRef = useRef(0);
  const lastWhiteboardCanvasSettingsRef = useRef(settings.whiteboard);
  const [savedAt, setSavedAt] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const mainRef = useRef(null);
  // Bẫy focus: Tab xoay vòng trong modal, Escape đóng (stopPropagation chặn
  // handler window của App), trả focus về nút mở Cài đặt khi đóng.
  const boxRef = useFocusTrap(true, onClose);

  useEffect(() => { applySettings(settings); }, []);
  useEffect(() => { try { refreshNotificationTimer(settings); } catch {} }, []);
  useEffect(() => {
    const current = settings.whiteboard || {};
    const previous = lastWhiteboardCanvasSettingsRef.current || {};
    const changed = ["grid", "snap", "smartAlign", "smartSpacing"].some((key) => current[key] !== previous[key]);
    lastWhiteboardCanvasSettingsRef.current = current;
    if (!changed) return;

    const sequence = ++whiteboardSyncSequenceRef.current;
    setWhiteboardSyncStatus({ type: "pending", text: "Đang đồng bộ tùy chọn canvas với các bảng hiện có…" });
    const task = whiteboardSyncQueueRef.current
      .catch(() => {})
      .then(() => import("../whiteboard/whiteboardStore.js"))
      .then(({ applyCanvasSettingsToAllBoards }) => applyCanvasSettingsToAllBoards(current));
    whiteboardSyncQueueRef.current = task;
    task.then(({ total, updated }) => {
      if (sequence === whiteboardSyncSequenceRef.current) {
        setWhiteboardSyncStatus({ type: "ok", text: `Đã đồng bộ ${updated} bảng (tổng cộng ${total}).` });
      }
    }).catch((error) => {
      console.error("[SettingsCenter] whiteboard canvas sync failed", error);
      if (sequence === whiteboardSyncSequenceRef.current) {
        setWhiteboardSyncStatus({ type: "err", text: `Đồng bộ bảng trắng thất bại: ${error.message}` });
      }
    });
  }, [settings.whiteboard]);

  // Ghi API key rồi phát sự kiện — App chỉ đọc lại key khi nghe "sgk:settings-updated",
  // nên ghi key không dispatch sẽ làm header/Trợ lý vẫn báo "Chưa có API Key".
  const saveKey = (value) => {
    try { setGeminiApiKey(value); } catch {}
    try { dispatchSettingsUpdated(loadSettings()); } catch {}
  };
  const persist = (next) => {
    const ok = saveSettings(next);
    if (!ok) { setSaveErr("Bộ nhớ đầy — đã thử dọn cache, hãy xuất sao lưu rồi thử lại."); }
    else { setSaveErr(""); setSavedAt(nowTime()); }
    applySettings(next);
    // Ghi cả khi rỗng để người dùng xóa được key — ghi TRƯỚC khi phát sự kiện
    setGeminiApiKey(geminiKey);
    dispatchSettingsUpdated(next);
    return next;
  };
  const handleChange = (path, value) => {
    setSettings((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      return persist(next);
    });
  };
  const handleAppearancePatch = (patch) => {
    setSettings((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.appearance = { ...next.appearance, ...patch };
      return persist(next);
    });
  };
  // Patch nhiều khóa trong 1 section (một lần ghi + một lần phát sự kiện)
  const handleSectionPatch = (sectionKey, patch) => {
    setSettings((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[sectionKey] = { ...(next[sectionKey] || {}), ...patch };
      return persist(next);
    });
  };
  const results = useMemo(() => searchSettings(query), [query]);
  const scrollTo = (anchor) => {
    const root = mainRef.current; if (!root) return;
    const el = root.querySelector("#" + CSS.escape(anchor));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const doResetSection = () => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, active)) return;
    if (!confirm("Khôi phục mặc định cho mục này?")) return;
    const n = resetSection(active);
    setSettings(n); setSavedAt(nowTime());
  };
  const activeMeta = SECTIONS.find((s) => s.id === active);

  return (
    <div className="st-overlay" onClick={onClose}>
      <div ref={boxRef} className="st-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Cài đặt">
        <header className="st-head">
          <div className="st-title">
            <span className="st-logo"><Settings size={18} /></span>
            <div>
              <h2>Cài đặt</h2>
              <p>Mọi thay đổi lưu tự động và áp dụng ngay cho cả app{savedAt ? ` · Đã lưu ✓ ${savedAt}` : ""}</p>
            </div>
          </div>
          <div className="st-head-actions">
            <div className="st-search">
              <Search size={14} />
              <input placeholder="Tìm: màu, nhiệm vụ, phím tắt…" value={query}
                onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <div className="st-search-pop">
                  {results.length ? results.map((r) => (
                    <button key={r.anchor} onClick={() => { setActive(r.section); setQuery(""); setTimeout(() => scrollTo(r.anchor), 50); }}>
                      <b>{(SECTIONS.find((s) => s.id === r.section) || {}).label || r.section}</b><span>#{r.anchor}</span>
                    </button>
                  )) : <span className="st-muted">Không tìm thấy</span>}
                </div>
              )}
            </div>
            <button className="st-icon-btn" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
          </div>
        </header>
        {saveErr && <div className="st-alert st-alert-warn">{saveErr}</div>}
        <div className="st-body">
          <nav className="st-side">
            <button className={`st-nav st-nav-home ${active === "overview" ? "active" : ""}`} onClick={() => setActive("overview")}>
              <span className="st-nav-ic"><Home size={16} /></span>
              <span className="st-nav-tx"><b>Tổng quan</b><small>Bắt đầu từ đây</small></span>
            </button>
            {NAV_GROUPS.map((g) => (
              <div key={g.title} className="st-group">
                <div className="st-group-title">{g.title}</div>
                {g.items.map((id) => {
                  const s = SECTIONS.find((x) => x.id === id); if (!s) return null;
                  return (
                    <button key={id} className={`st-nav ${active === id ? "active" : ""}`} onClick={() => setActive(id)} title={s.hint}>
                      <span className="st-nav-ic">{s.icon}</span>
                      <span className="st-nav-tx"><b>{s.label}</b><small>{s.hint}</small></span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="st-main" ref={mainRef}>
            {active !== "overview" && <div className="st-crumb">{activeMeta?.label} <span>· {activeMeta?.hint}</span></div>}
            {active === "overview" && <SettingsOverview onNavigate={setActive} />}
            {active === "general" && <GeneralSection settings={settings} onChange={handleChange} />}
            {active === "dashboard" && <DashboardSection settings={settings} onPatch={handleSectionPatch} />}
            {active === "appearance" && <AppearanceSection settings={settings} onChange={handleChange} onPatch={handleAppearancePatch} />}
            {active === "reading" && <ReadingSection settings={settings} onChange={handleChange} />}
            {active === "editor" && <EditorSection settings={settings} onChange={handleChange} />}
            {active === "library" && <LibrarySection settings={settings} onChange={handleChange} />}
            {active === "whiteboard" && <WhiteboardSection settings={settings} onChange={handleChange} syncStatus={whiteboardSyncStatus} />}
            {active === "missions" && <MissionsSection settings={settings} onChange={handleChange} />}
            {active === "ai" && <AISection settings={settings} onChange={handleChange} geminiKey={geminiKey} setGeminiKey={setGeminiKey} saveKey={saveKey} showKey={showKey} setShowKey={setShowKey} testingKey={testingKey} setTestingKey={setTestingKey} keyResult={keyResult} setKeyResult={setKeyResult} />}
            {active === "search" && <SearchSection settings={settings} onChange={handleChange} />}
            {active === "export" && <ExportSection settings={settings} onPatch={handleSectionPatch} />}
            {active === "behavior" && <BehaviorSection settings={settings} onChange={handleChange} />}
            {active === "notifications" && <NotificationsSection settings={settings} onChange={handleChange} />}
            {active === "keyboard" && <KeyboardSection />}
            {active === "features" && <FeaturesSection settings={settings} onPatch={handleSectionPatch} />}
            {active === "accessibility" && <AccessibilitySection settings={settings} onChange={handleChange} onClose={onClose} />}
            {active === "privacy" && <PrivacySection settings={settings} onChange={handleChange} />}
            {active === "advanced" && <AdvancedSection settings={settings} onChange={handleChange} />}
            {active === "about" && <AboutSection settings={settings} />}
          </div>
        </div>
        <footer className="st-foot">
          <span className="st-foot-status">{savedAt ? <><Check size={13} /> Tự động lưu · {savedAt}</> : <><Sparkles size={13} /> Tự động lưu đang bật</>}</span>
          <span className="st-foot-btns">
            {Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, active) && (
              <button className="st-btn st-btn-danger-ghost" onClick={doResetSection}><RotateCcw size={13} /> Mặc định mục này</button>
            )}
            <button className="st-btn st-btn-primary" onClick={onClose}><Check size={13} /> Xong</button>
          </span>
        </footer>
      </div>
    </div>
  );
}
