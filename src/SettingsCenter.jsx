import React, { useState, useEffect, useMemo, useRef } from "react";
import { appEvents, AppEvents } from "./core/appEvents.js";
import {
  Settings, Search, Palette, BookOpen, Target, Cpu, Bell, Keyboard,
  Accessibility, Shield, Zap, Info, RotateCcw, Eye, EyeOff, RefreshCw,
  X, Sun, Moon, Monitor, FileText, Volume2, Database, Download, Upload,
  Check, Sparkles, SlidersHorizontal, Library as LibraryIcon, Timer,
} from "lucide-react";
import {
  loadSettings, saveSettings, updateSettings, resetSection, resetAllSettings,
  DEFAULT_SETTINGS, searchSettings, applySettings, dispatchSettingsUpdated,
  downloadSettingsBackup, parseSettingsBackup, getStorageUsage,
  testNotification, refreshNotificationTimer,
} from "./settingsStore";
import { soundManager } from "./audio/soundManager.js";
import {
  DEFAULT_SHORTCUTS, SHORTCUT_META, SHORTCUT_CATEGORIES, getShortcuts,
  comboToString, findConflict,
} from "./keyboardShortcuts.js";
import { getGeminiApiKey, setGeminiApiKey } from "./storage";
import { safeRemove, listKeys } from "./safeStorage.js";
import FileDropzone from "./components/FileDropzone.jsx";
import { useFileDrag } from "./components/fileDropzoneUtils.js";
import { getApiBase, apiUrl } from "./apiConfig";
import aiService, { getFriendlyErrorMessage } from "./aiService";
import { APP_COPYRIGHT, APP_DEVELOPER } from "./appPersona";
import { pdfjsLib } from "./pdfjs-config";
import { ACCENT_PALETTES, generateAccentScale } from "./designTokens.js";

/* ── Điều hướng nhóm ─────────────────────────────── */
const NAV_GROUPS = [
  { title: "Chung", items: ["general", "appearance"] },
  { title: "Học tập & Đọc", items: ["reading", "editor", "library", "whiteboard", "missions"] },
  { title: "AI & Dữ liệu", items: ["ai", "search", "export", "backup"] },
  { title: "Hệ thống", items: ["behavior", "notifications", "keyboard", "accessibility", "privacy", "advanced", "about"] },
];
const SECTIONS = [
  { id: "general", label: "Tổng quan", icon: <Settings size={16} />, hint: "Tên hiển thị, trang mở, tuần" },
  { id: "appearance", label: "Giao diện", icon: <Palette size={16} />, hint: "Sáng/tối, màu, chữ", subs: [{ id: "st-theme", label: "Sáng / Tối" }, { id: "st-accent", label: "Màu sắc" }, { id: "st-type", label: "Chữ & Mật độ" }] },
  { id: "reading", label: "Trình đọc sách", icon: <BookOpen size={16} />, hint: "Zoom, layout, TOC" },
  { id: "editor", label: "Soạn thảo Word", icon: <FileText size={16} />, hint: "Font, thước, nháp" },
  { id: "library", label: "Thư viện", icon: <LibraryIcon size={16} />, hint: "Lưới, sắp xếp, xem trước" },
  { id: "whiteboard", label: "Bảng trắng", icon: <SlidersHorizontal size={16} />, hint: "Lưới, bút, snap" },
  { id: "missions", label: "Nhiệm vụ", icon: <Target size={16} />, hint: "Gamification, XP, streak" },
  { id: "ai", label: "AI Gemini", icon: <Cpu size={16} />, hint: "Key, model, phong cách" },
  { id: "search", label: "Tìm kiếm", icon: <Search size={16} />, hint: "Mặc định, fuzzy, giới hạn" },
  { id: "export", label: "Xuất dữ liệu", icon: <Download size={16} />, hint: "Định dạng, metadata" },
  { id: "backup", label: "Sao lưu", icon: <Database size={16} />, hint: "Xuất/nhập, reset" },
  { id: "behavior", label: "Hành vi & Âm thanh", icon: <Zap size={16} />, hint: "Xác nhận, tự lưu, loa" },
  { id: "notifications", label: "Thông báo", icon: <Bell size={16} />, hint: "Nhắc hằng ngày, thử" },
  { id: "keyboard", label: "Phím tắt", icon: <Keyboard size={16} />, hint: "Tự thiết lập" },
  { id: "accessibility", label: "Trợ năng", icon: <Accessibility size={16} />, hint: "Tương phản, chữ lớn" },
  { id: "privacy", label: "Riêng tư", icon: <Shield size={16} />, hint: "Local-only, lịch sử" },
  { id: "advanced", label: "Nâng cao", icon: <Timer size={16} />, hint: "Hiệu năng, cache, debug" },
  { id: "about", label: "Giới thiệu", icon: <Info size={16} />, hint: "Phiên bản" },
];

function nowTime() { try { return new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } }

export default function SettingsCenter({ onClose }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [active, setActive] = useState("general");
  const [query, setQuery] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyResult, setKeyResult] = useState(null);
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [savedAt, setSavedAt] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [importErr, setImportErr] = useState("");
  const fileRef = useRef(null);
  const mainRef = useRef(null);

  useEffect(() => { applySettings(settings); }, []);
  useEffect(() => { try { refreshNotificationTimer(settings); } catch {} }, []);

  const persist = (next) => {
    const ok = saveSettings(next);
    if (!ok) { setSaveErr("Bộ nhớ đầy — đã thử dọn cache, hãy xuất sao lưu rồi thử lại."); }
    else { setSaveErr(""); setSavedAt(nowTime()); }
    applySettings(next);
    dispatchSettingsUpdated(next);
    if (geminiKey.trim()) setGeminiApiKey(geminiKey);
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
  const doExport = () => { if (downloadSettingsBackup()) { const n = loadSettings(); setSettings(n); setSavedAt(nowTime()); } };
  const doImportFile = async (file) => {
    if (!file) return;
    setImportErr("");
    try {
      const text = await file.text();
      const merged = parseSettingsBackup(text);
      const ok = saveSettings(merged);
      if (!ok) { setImportErr("Không lưu được file nhập (bộ nhớ đầy)."); return; }
      applySettings(merged); dispatchSettingsUpdated(merged);
      setSettings(merged); setSavedAt(nowTime());
    } catch (e) { setImportErr("File không đúng định dạng sao lưu."); }
  };

  const activeMeta = SECTIONS.find((s) => s.id === active);
  // Kéo-thả toàn modal: thả file .json bất kỳ đâu trong Cài đặt đều nhập sao lưu
  const { dragActive: stDrag, bind: stBind } = useFileDrag({
    accept: "application/json,.json",
    multiple: false,
    onFiles: (f) => doImportFile(Array.isArray(f) ? f[0] : f),
    onError: (m) => setImportErr(m),
  });

  return (
    <div className="st-overlay" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cài đặt" {...stBind} style={{ position: "relative" }}>
        {stDrag && (
          <div className="global-drag-overlay" aria-hidden="true"><span>Thả file JSON để nhập cài đặt</span></div>
        )}
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
            <div className="st-crumb">{activeMeta?.label} <span>· {activeMeta?.hint}</span></div>
            {active === "general" && <GeneralSection settings={settings} onChange={handleChange} />}
            {active === "appearance" && <AppearanceSection settings={settings} onChange={handleChange} onPatch={handleAppearancePatch} />}
            {active === "reading" && <ReadingSection settings={settings} onChange={handleChange} />}
            {active === "editor" && <EditorSection settings={settings} onChange={handleChange} />}
            {active === "library" && <LibrarySection settings={settings} onChange={handleChange} />}
            {active === "whiteboard" && <WhiteboardSection settings={settings} onChange={handleChange} />}
            {active === "missions" && <MissionsSection settings={settings} onChange={handleChange} />}
            {active === "ai" && <AISection settings={settings} onChange={handleChange} geminiKey={geminiKey} setGeminiKey={setGeminiKey} showKey={showKey} setShowKey={setShowKey} testingKey={testingKey} setTestingKey={setTestingKey} keyResult={keyResult} setKeyResult={setKeyResult} />}
            {active === "search" && <SearchSection settings={settings} onChange={handleChange} />}
            {active === "export" && <ExportSection settings={settings} onChange={handleChange} />}
            {active === "backup" && <BackupSection settings={settings} onChange={handleChange} onImportFile={doImportFile} importErr={importErr} onExport={doExport} />}
            {active === "behavior" && <BehaviorSection settings={settings} onChange={handleChange} />}
            {active === "notifications" && <NotificationsSection settings={settings} onChange={handleChange} />}
            {active === "keyboard" && <KeyboardSection />}
            {active === "accessibility" && <AccessibilitySection settings={settings} onChange={handleChange} />}
            {active === "privacy" && <PrivacySection settings={settings} onChange={handleChange} />}
            {active === "advanced" && <AdvancedSection settings={settings} onChange={handleChange} />}
            {active === "about" && <AboutSection />}
          </div>
        </div>
        <footer className="st-foot">
          <span className="st-foot-status">{savedAt ? <><Check size={13} /> Tự động lưu · {savedAt}</> : <><Sparkles size={13} /> Tự động lưu đang bật</>}</span>
          <span className="st-foot-btns">
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImportFile(f); e.target.value = ""; }} />
            <button className="st-btn st-btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={13} /> Nhập</button>
            <button className="st-btn st-btn-ghost" onClick={doExport}><Download size={13} /> Xuất sao lưu</button>
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

/* ── Primitives ─────────────────────────────── */
function Card({ id, title, desc, children, icon }) {
  return (
    <section id={id} className="st-card">
      <div className="st-card-head">{icon}<div><h3>{title}</h3>{desc && <p>{desc}</p>}</div></div>
      <div className="st-card-body">{children}</div>
    </section>
  );
}
function Field({ label, hint, children }) {
  return (
    <div className="st-field">
      <div className="st-field-label"><span>{label}</span>{hint && <small>{hint}</small>}</div>
      <div className="st-field-ctl">{children}</div>
    </div>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label}
      className={`st-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="st-toggle-knob" />
    </button>
  );
}
function Seg({ options, value, onPick }) {
  return (
    <div className="st-seg" role="tablist">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v}
          className={`st-seg-btn ${value === o.v ? "active" : ""}`} onClick={() => onPick(o.v)} title={o.hint || o.t}>
          {o.icon}{o.t}
        </button>
      ))}
    </div>
  );
}
const sel = "st-select";
const inp = "st-input";

/* ── Tổng quan ─────────────────────────────── */
function GeneralSection({ settings, onChange }) {
  const g = settings.general;
  return (
    <div>
      <Card id="sec-general" title="Tổng quan" desc="Tên hiển thị hiện ở Dashboard · Trang mở áp dụng ngay lần mở app sau · Ngày đầu tuần đổi cách tính tuần Nhiệm vụ." icon={<Settings size={15} />}>
        <Field label="Tên hiển thị" hint="Hiện lời chào ở Dashboard"><input className={inp} value={g.displayName} onChange={(e) => onChange(["general", "displayName"], e.target.value)} placeholder="Thầy/Cô …" /></Field>
        <Field label="Ngôn ngữ"><select className={sel} value={g.language} onChange={(e) => onChange(["general", "language"], e.target.value)}><option value="vi">Tiếng Việt</option></select></Field>
        <Field label="Ngày bắt đầu tuần" hint="Đổi là bảng Tuần/Streak của Nhiệm vụ tính lại"><Seg value={g.weekStart} onPick={(v) => onChange(["general", "weekStart"], v)} options={[{ v: 1, t: "Thứ Hai" }, { v: 0, t: "Chủ Nhật" }]} /></Field>
        <Field label="Trang mở mặc định" hint="“Lần cuối” mở lại đúng trang trước khi thoát"><select className={sel} value={g.startPage} onChange={(e) => onChange(["general", "startPage"], e.target.value)}>
          <option value="dashboard">Tổng quan</option><option value="library">Thư viện</option><option value="search">Tìm kiếm</option><option value="lessonplans">Giáo án</option><option value="tasks">Nhiệm vụ</option><option value="last">Lần cuối đã mở</option>
        </select></Field>
        <Field label="Múi giờ" hint="Chuẩn ngày Nhiệm vụ & Streak"><select className={sel} value={g.timezone || "auto"} onChange={(e) => onChange(["general", "timezone"], e.target.value)}>
          <option value="auto">Tự động (máy)</option><option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option><option value="UTC">UTC</option>
        </select></Field>
      </Card>
    </div>
  );
}

/* ── Giao diện ─────────────────────────────── */
function AppearanceSection({ settings, onChange, onPatch }) {
  const a = settings.appearance;
  const isCustom = a.accentMode === "custom";
  const scale = (() => {
    try {
      if (isCustom && a.accentColor && /^#[0-9A-Fa-f]{6}$/.test(a.accentColor)) return generateAccentScale(a.accentColor);
      return ACCENT_PALETTES[a.accent] || ACCENT_PALETTES.blue;
    } catch { return ACCENT_PALETTES.blue; }
  })();
  const pickPreset = (c) => { if (onPatch) onPatch({ accentMode: "preset", accent: c, accentColor: accentHex(c) }); };
  const pickCustom = (hex) => { if (onPatch) onPatch({ accentMode: "custom", accentColor: String(hex).toUpperCase() }); };
  return (
    <div>
      <Card id="st-theme" title="Sáng / Tối" desc="Đổi là cả app đổi nền + chữ + màu nhấn ngay lập tức." icon={<Sun size={15} />}>
        <Seg value={a.theme} onPick={(v) => onChange(["appearance", "theme"], v)} options={[
          { v: "light", t: "Sáng", icon: <Sun size={13} /> }, { v: "dark", t: "Tối", icon: <Moon size={13} /> }, { v: "system", t: "Theo máy", icon: <Monitor size={13} /> },
        ]} />
      </Card>
      <Card id="st-accent" title="Màu nhấn" desc="Chọn 1 màu — hệ thống tự sinh 9 cấp và tô lại nút, link, badge." icon={<Palette size={15} />}>
        <div className="st-dots">
          {[["blue", "Dương"], ["purple", "Tím"], ["green", "Lá"], ["orange", "Cam"], ["red", "Đỏ"], ["teal", "Ngọc"]].map(([c, label]) => (
            <button key={c} className={`st-dot ${!isCustom && a.accent === c ? "picked" : ""}`} style={{ background: accentHex(c) }} onClick={() => pickPreset(c)} title={label} aria-label={label} />
          ))}
          <label className={`st-dot st-dot-custom ${isCustom ? "picked" : ""}`} title="Màu tùy chỉnh">
            <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(a.accentColor) ? a.accentColor : "#2563EB"} onChange={(e) => pickCustom(e.target.value)} />
            <span>+</span>
          </label>
          <input className={`${inp} st-hex`} value={a.accentColor || "#2563EB"} maxLength={7}
            onChange={(e) => { let v = e.target.value.trim(); if (!v.startsWith("#")) v = "#" + v; onChange(["appearance", "accentColor"], v.toUpperCase()); if (/^#[0-9A-Fa-f]{6}$/.test(v) && onPatch) onPatch({ accentMode: "custom", accentColor: v.toUpperCase() }); }}
            placeholder="#2563EB" />
        </div>
        <div className="st-scale">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <div key={n} className="st-scale-cell"><i style={{ background: scale[n] }} /><b>{n}</b><span>{scale[n]}</span></div>
          ))}
        </div>
        <div className="st-preview">
          <button className="st-btn st-btn-primary">Lưu thay đổi</button>
          <button className="st-btn st-btn-ghost">Hủy</button>
          <span className="st-chip ok">Thành công</span><span className="st-chip warn">Cảnh báo</span><span className="st-chip danger">Nguy hiểm</span>
        </div>
      </Card>
      <Card id="st-type" title="Chữ, mật độ & Khung" desc="Cỡ chữ đổi toàn app · Mật độ đổi khoảng cách thẻ · Thanh bên đổi kiểu sidebar." icon={<SlidersHorizontal size={15} />}>
        <Field label="Cỡ chữ"><Seg value={a.fontSize} onPick={(v) => onChange(["appearance", "fontSize"], v)} options={[{ v: "small", t: "Nhỏ" }, { v: "default", t: "Vừa" }, { v: "large", t: "Lớn" }, { v: "xl", t: "Rất lớn" }]} /></Field>
        <Field label="Phông chữ"><select className={sel} value={a.fontFamily} onChange={(e) => onChange(["appearance", "fontFamily"], e.target.value)}>
          <option value="system">Hệ thống</option><option value="mulish">Mulish</option><option value="quicksand">Quicksand</option><option value="andika">Andika</option>
        </select></Field>
        <Field label="Mật độ"><Seg value={a.density} onPick={(v) => onChange(["appearance", "density"], v)} options={[{ v: "compact", t: "Gọn" }, { v: "comfortable", t: "Thoải mái" }, { v: "spacious", t: "Rộng" }]} /></Field>
        <Field label="Bo góc"><select className={sel} value={a.radius} onChange={(e) => onChange(["appearance", "radius"], e.target.value)}>
          <option value="sharp">Góc nhọn</option><option value="medium">Vừa</option><option value="rounded">Bo tròn</option><option value="veryRounded">Bo nhiều</option>
        </select></Field>
        <Field label="Bóng đổ"><select className={sel} value={a.shadow} onChange={(e) => onChange(["appearance", "shadow"], e.target.value)}>
          <option value="none">Không</option><option value="subtle">Nhẹ</option><option value="medium">Vừa</option><option value="strong">Đậm</option>
        </select></Field>
        <Field label="Hiệu ứng chuyển động"><Seg value={a.animation} onPick={(v) => onChange(["appearance", "animation"], v)} options={[{ v: "on", t: "Bật" }, { v: "reduced", t: "Giảm" }, { v: "off", t: "Tắt" }]} /></Field>
        <Field label="Thanh điều hướng" hint="Thu gọn mở rộng không gian đọc"><Seg value={a.sidebar} onPick={(v) => onChange(["appearance", "sidebar"], v)} options={[{ v: "auto", t: "Tự động" }, { v: "expanded", t: "Mở rộng" }, { v: "collapsed", t: "Thu gọn" }]} /></Field>
      </Card>
    </div>
  );
}
function accentHex(c) { return { blue: "#2563EB", purple: "#7C3AED", green: "#16A34A", orange: "#D97706", red: "#DC2626", teal: "#0891B2" }[c]; }

/* ── Đọc sách ─────────────────────────────── */
function ReadingSection({ settings, onChange }) {
  const r = settings.reading;
  return (
    <Card id="sec-reading" title="Trình đọc sách" desc="Zoom & bố cục áp dụng ngay khi mở sách · Ghi nhớ trang cần bật 'Nhớ trang cuối'." icon={<BookOpen size={15} />}>
      <Field label="Bố cục"><Seg value={r.layout} onPick={(v) => onChange(["reading", "layout"], v)} options={[{ v: "twoPage", t: "2 trang" }, { v: "single", t: "1 trang" }]} /></Field>
      <Field label="Zoom mặc định"><select className={sel} value={r.defaultZoom} onChange={(e) => onChange(["reading", "defaultZoom"], Number(e.target.value))}>
        {[0.25, 0.5, 0.75, 0.8, 1, 1.2, 1.25, 1.5, 2, 2.5, 3.2].map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
      </select></Field>
      <Field label="Hiện mục lục" hint="Tắt để đọc toàn màn hình"><Toggle label="Hiện TOC" checked={r.showTOC} onChange={(v) => onChange(["reading", "showTOC"], v)} /></Field>
      <Field label="Nhớ trang cuối" hint="Mở lại sách đúng trang đang đọc dở"><Toggle label="Nhớ trang" checked={r.rememberLastPage} onChange={(v) => onChange(["reading", "rememberLastPage"], v)} /></Field>
      <Field label="Tự lưu tiến độ" hint="Tắt để đọc 'chay' không ghi %"><Toggle label="Tự lưu" checked={r.autoSaveProgress} onChange={(v) => onChange(["reading", "autoSaveProgress"], v)} /></Field>
    </Card>
  );
}

/* ── Soạn thảo ─────────────────────────────── */
function EditorSection({ settings, onChange }) {
  const e = settings.editor || {};
  return (
    <Card id="sec-editor" title="Soạn thảo Word" desc="Font/cỡ/giãn dòng/thước/zoom là mặc định mỗi khi mở khung soạn." icon={<FileText size={15} />}>
      <Field label="Font mặc định"><select className={sel} value={e.defaultFontFamily || "inherit"} onChange={(ev) => onChange(["editor", "defaultFontFamily"], ev.target.value)}>
        <option value="inherit">Theo hệ thống</option><option value="'Times New Roman', Times, serif">Times New Roman</option><option value="Arial, Helvetica, 'Segoe UI', sans-serif">Arial</option><option value="Calibri, 'Segoe UI', Arial, sans-serif">Calibri</option><option value="Georgia, 'Times New Roman', serif">Georgia</option><option value="'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif">Be Vietnam Pro</option>
      </select></Field>
      <Field label="Cỡ chữ"><select className={sel} value={e.defaultFontSize || "15px"} onChange={(ev) => onChange(["editor", "defaultFontSize"], ev.target.value)}>
        {["12px", "13px", "14px", "15px", "16px", "18px", "20px", "24px"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select></Field>
      <Field label="Giãn dòng"><select className={sel} value={e.defaultLineHeight || "1.7"} onChange={(ev) => onChange(["editor", "defaultLineHeight"], ev.target.value)}>
        {["1.0", "1.15", "1.35", "1.5", "1.7", "2.0"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select></Field>
      <Field label="Zoom mặc định"><select className={sel} value={String(e.defaultZoom || 100)} onChange={(ev) => onChange(["editor", "defaultZoom"], Number(ev.target.value))}>
        {[80, 90, 100, 110, 125, 150].map((s) => <option key={s} value={s}>{s}%</option>)}
      </select></Field>
      <Field label="Hiện thước kẻ"><Toggle label="Thước" checked={!!e.showRuler} onChange={(v) => onChange(["editor", "showRuler"], v)} /></Field>
      <Field label="Tự lưu nháp Word" hint="Tắt để không ghi nháp tự động"><Toggle label="Nháp" checked={e.autoSaveWordDraft !== false} onChange={(v) => onChange(["editor", "autoSaveWordDraft"], v)} /></Field>
      <Field label="Kiểm tra chính tả"><Toggle label="Spell" checked={!!e.spellCheck} onChange={(v) => onChange(["editor", "spellCheck"], v)} /></Field>
    </Card>
  );
}

/* ── Thư viện ─────────────────────────────── */
function LibrarySection({ settings, onChange }) {
  const lib = settings.library;
  return (
    <Card id="sec-library" title="Thư viện" desc="Đổi là lưới sách ngoài trang chính đổi theo ngay (kiểu xem, sắp xếp, bìa, nhóm)." icon={<LibraryIcon size={15} />}>
      <Field label="Kiểu xem"><Seg value={lib.viewMode} onPick={(v) => onChange(["library", "viewMode"], v)} options={[{ v: "grid", t: "Lưới" }, { v: "list", t: "Danh sách" }]} /></Field>
      <Field label="Sắp xếp"><select className={sel} value={lib.sortBy} onChange={(e) => onChange(["library", "sortBy"], e.target.value)}>
        <option value="name">Tên</option><option value="size">Kích thước</option><option value="modified">Mới sửa</option><option value="created">Mới tạo</option><option value="grade">Lớp + môn</option><option value="recent">Mở gần đây</option>
      </select></Field>
      <Field label="Hiện bìa xem trước" hint="Tắt để tải nhanh, nhẹ máy"><Toggle label="Bìa" checked={lib.showPreviews} onChange={(v) => onChange(["library", "showPreviews"], v)} /></Field>
      <Field label="Nhóm theo môn" hint="Tắt để xổ tất cả thành 1 danh sách"><Toggle label="Nhóm" checked={lib.groupBySubject} onChange={(v) => onChange(["library", "groupBySubject"], v)} /></Field>
      <Field label="Tự index sách mới" hint="Bật: app tự đọc toàn bộ thư viện để lập chỉ mục (lần đầu nặng máy). Tắt: bấm Dựng chỉ mục ở tab Tìm toàn văn khi cần"><Toggle label="Index" checked={lib.autoIndexNewBooks} onChange={(v) => onChange(["library", "autoIndexNewBooks"], v)} /></Field>
    </Card>
  );
}

/* ── Bảng trắng ─────────────────────────────── */
function WhiteboardSection({ settings, onChange }) {
  const w = settings.whiteboard || {};
  return (
    <Card id="sec-whiteboard" title="Bảng trắng" desc="Mặc định mỗi khi tạo bảng mới." icon={<SlidersHorizontal size={15} />}>
      <Field label="Hiện lưới"><Toggle label="Lưới" checked={!!w.grid} onChange={(v) => onChange(["whiteboard", "grid"], v)} /></Field>
      <Field label="Snap vào lưới"><Toggle label="Snap" checked={!!w.snap} onChange={(v) => onChange(["whiteboard", "snap"], v)} /></Field>
      <Field label="Smart Align / Spacing"><span style={{ display: "flex", gap: 8 }}><Toggle label="Align" checked={!!w.smartAlign} onChange={(v) => onChange(["whiteboard", "smartAlign"], v)} /><Toggle label="Spacing" checked={!!w.smartSpacing} onChange={(v) => onChange(["whiteboard", "smartSpacing"], v)} /></span></Field>
      <Field label="Kéo cả nhánh"><Toggle label="Nhánh" checked={!!w.branchDrag} onChange={(v) => onChange(["whiteboard", "branchDrag"], v)} /></Field>
      <Field label="Tự động lưu"><Toggle label="Auto" checked={!!w.autoSave} onChange={(v) => onChange(["whiteboard", "autoSave"], v)} /></Field>
      <Field label="Âm thanh bảng"><Toggle label="Âm" checked={!!w.soundEffects} onChange={(v) => onChange(["whiteboard", "soundEffects"], v)} /></Field>
      <Field label="Màu bút"><input type="color" className="st-color" value={w.defaultPenColor || "#1d4ed8"} onChange={(e) => onChange(["whiteboard", "defaultPenColor"], e.target.value)} /></Field>
      <Field label="Độ dày bút"><select className={sel} value={w.defaultPenWidth || 3} onChange={(e) => onChange(["whiteboard", "defaultPenWidth"], Number(e.target.value))}>
        {[2, 3, 5, 8].map((n) => <option key={n} value={n}>{n}px</option>)}
      </select></Field>
    </Card>
  );
}

/* ── Nhiệm vụ ─────────────────────────────── */
function MissionsSection({ settings, onChange }) {
  const m = settings.missions;
  const sw = (path, val, label) => (
    <Field label={label}><Toggle label={label} checked={!!val} onChange={(v) => onChange(["missions", path], v)} /></Field>
  );
  return (
    <div>
      <Card id="sec-missions" title="Nhiệm vụ — Gamification" desc="Số lượng/độ khó/trọng tâm đổi là nhiệm vụ hôm sau sinh theo đúng cấu hình." icon={<Target size={15} />}>
        {sw("enabled", m.enabled, "Bật Daily Missions")}
        <Field label="Số nhiệm vụ/ngày"><select className={sel} value={m.dailyCount} onChange={(e) => onChange(["missions", "dailyCount"], Number(e.target.value))}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        <Field label="Độ khó"><select className={sel} value={m.difficulty} onChange={(e) => onChange(["missions", "difficulty"], e.target.value)}>
          <option value="easy">Dễ</option><option value="normal">Thường</option><option value="hard">Khó</option><option value="expert">Chuyên sâu</option><option value="adaptive">Thích ứng</option>
        </select></Field>
        <Field label="Trọng tâm"><select className={sel} value={m.focus} onChange={(e) => onChange(["missions", "focus"], e.target.value)}>
          <option value="balanced">Cân bằng</option><option value="reading">Đọc SGK</option><option value="research">Nghiên cứu</option><option value="teaching">Soạn dạy</option><option value="materials">Tạo học liệu</option>
        </select></Field>
        {sw("bonusEnabled", m.bonusEnabled, "Bonus missions")}
        {sw("weeklyGoalsEnabled", m.weeklyGoalsEnabled, "Mục tiêu tuần")}
        {sw("monthlyChallengeEnabled", m.monthlyChallengeEnabled, "Thử thách tháng")}
        {sw("streakEnabled", m.streakEnabled, "Streak")}
        <Field label="Nhiệm vụ tối thiểu để tính streak"><select className={sel} value={m.minMissionsForStreak} onChange={(e) => onChange(["missions", "minMissionsForStreak"], Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        {sw("xpEnabled", m.xpEnabled, "XP")}
        {sw("achievementsEnabled", m.achievementsEnabled, "Achievements")}
        {sw("showCardOnDashboard", m.showCardOnDashboard, "Hiện card trên Dashboard")}
        {sw("autoGenerate", m.autoGenerate, "Tự tạo nhiệm vụ")}
      </Card>
    </div>
  );
}

/* ── AI ─────────────────────────────── */
function AISection({ settings, onChange, geminiKey, setGeminiKey, showKey, setShowKey, testingKey, setTestingKey, keyResult, setKeyResult }) {
  const handleTest = async () => {
    if (!geminiKey.trim()) { setKeyResult({ ok: false, msg: "Vui lòng nhập API Key" }); return; }
    setTestingKey(true); setKeyResult(null);
    try {
      const base = getApiBase();
      const healthUrl = base ? `${base}/api/health` : `/api/health`;
      const h = await fetch(healthUrl, { method: "GET" }).then((r) => r.json()).catch(() => null);
      if (!h || h.status !== "healthy") console.warn("Backend health check failed:", h);
    } catch {}
    try {
      const text = await aiService.callAI({
        apiKey: geminiKey.trim(),
        contents: [{ role: "user", parts: [{ text: "Xin chào" }] }],
        systemInstruction: { parts: [{ text: "Chỉ trả lời OK" }] },
        generationConfig: { temperature: 0, maxOutputTokens: 50 },
        model: settings.ai.model || "gemini-2.5-flash",
        timeout: 30000, maxRetries: 1, requestId: "test-key",
      });
      setKeyResult({ ok: true, msg: text ? `Kết nối thành công! (model: ${settings.ai.model})` : "Kết nối thành công!" });
      try { setGeminiApiKey(geminiKey.trim()); } catch {}
    } catch (err) {
      const friendly = getFriendlyErrorMessage(err.status, err.message);
      setKeyResult({ ok: false, msg: `${friendly}${err.status ? ` [${err.status}]` : ""}` });
    } finally { setTestingKey(false); }
  };
  return (
    <div>
      <Card id="sec-ai" title="Gemini API" desc="Key lưu trên máy · Model & độ dài/sáng tạo áp dụng cho mọi khung chat AI." icon={<Cpu size={15} />}>
        <Field label="API Key" hint="Lấy tại aistudio.google.com">
          <span style={{ display: "flex", gap: 6, flex: 1 }}>
            <input className={inp} style={{ flex: 1 }} type={showKey ? "text" : "password"} value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)} onBlur={() => { try { if (geminiKey.trim()) setGeminiApiKey(geminiKey.trim()); } catch {} }} placeholder="AIzaSy..." />
            <button type="button" className="st-btn st-btn-ghost st-btn-sm" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            <button className="st-btn st-btn-ghost st-btn-sm" onClick={handleTest} disabled={testingKey}>{testingKey ? <RefreshCw size={12} className="spin" /> : "Kiểm tra"}</button>
          </span>
        </Field>
        {keyResult && <p className={`st-note ${keyResult.ok ? "ok" : "err"}`}>{keyResult.msg}</p>}
        <Field label="Model"><select className={sel} value={settings.ai.model} onChange={(e) => onChange(["ai", "model"], e.target.value)}>
          <option value="gemini-2.5-flash">gemini-2.5-flash (Latest)</option><option value="gemini-2.0-flash">gemini-2.0-flash</option><option value="gemini-1.5-flash">gemini-1.5-flash</option>
        </select></Field>
        <Field label="Độ dài trả lời"><Seg value={settings.ai.responseLength} onPick={(v) => onChange(["ai", "responseLength"], v)} options={[{ v: "concise", t: "Ngắn" }, { v: "balanced", t: "Cân bằng" }, { v: "detailed", t: "Chi tiết" }]} /></Field>
        <Field label={`Sáng tạo — ${settings.ai.temperature}`} hint="0 chính xác · 1 bay bổng">
          <input type="range" className="st-range" min={0} max={100} value={Math.round(settings.ai.temperature * 100)}
            onChange={(e) => onChange(["ai", "temperature"], Math.min(1, Math.max(0, Number(e.target.value) / 100)))} />
        </Field>
        <Field label="Cấp dạy"><Seg value={settings.ai.teachingLevel} onPick={(v) => onChange(["ai", "teachingLevel"], v)} options={[{ v: "primary", t: "Tiểu học" }, { v: "secondary", t: "THCS" }]} /></Field>
        <Field label="Giọng dạy"><select className={sel} value={settings.ai.teachingStyle} onChange={(e) => onChange(["ai", "teachingStyle"], e.target.value)}>
          <option value="academic">Học thuật</option><option value="friendly">Thân thiện</option><option value="primary">Giáo viên Tiểu học</option><option value="student">Giáo viên tập sự</option>
        </select></Field>
      </Card>
      <Card id="sec-ai-note" title="Quyền riêng tư AI" desc="AI chỉ gửi nội dung trang đang chọn · Dữ liệu local không tự đồng bộ cloud." icon={<Shield size={15} />}><p className="st-muted">Bật “Local-only” ở mục Riêng tư để khóa hẳn mọi gửi dữ liệu phụ.</p></Card>
    </div>
  );
}

/* ── Tìm kiếm ─────────────────────────────── */
function SearchSection({ settings, onChange }) {
  const s = settings.search;
  return (
    <Card id="sec-search" title="Tìm kiếm" desc="Nhóm mặc định, độ nhạy và giới hạn kết quả áp dụng ngay cho trang Tìm kiếm." icon={<Search size={15} />}>
      <Field label="Nhóm mặc định" hint="Mở trang Tìm kiếm là thấy ngay nhóm này"><Seg value={s.defaultType} onPick={(v) => onChange(["search", "defaultType"], v)} options={[{ v: "all", t: "Tất cả" }, { v: "content", t: "Toàn văn" }, { v: "toc", t: "Mục lục" }, { v: "notes", t: "Ghi chú" }]} /></Field>
      <Field label="Phân biệt hoa/thường"><Toggle label="Hoa thường" checked={s.caseSensitive} onChange={(v) => onChange(["search", "caseSensitive"], v)} /></Field>
      <Field label="Khớp cả từ" hint="Bật để 'an' không khớp 'toán'"><Toggle label="Cả từ" checked={s.wholeWord} onChange={(v) => onChange(["search", "wholeWord"], v)} /></Field>
      <Field label="Bỏ dấu (fuzzy)" hint="Tìm 'toan' ra 'toán'"><Toggle label="Fuzzy" checked={s.fuzzyMatch} onChange={(v) => onChange(["search", "fuzzyMatch"], v)} /></Field>
      <Field label={`Tối đa ${s.maxResults} kết quả`}><input type="range" className="st-range" min={10} max={1000} step={10} value={s.maxResults} onChange={(e) => onChange(["search", "maxResults"], Number(e.target.value))} /></Field>
    </Card>
  );
}

/* ── Xuất ─────────────────────────────── */
function ExportSection({ settings, onChange }) {
  const exp = settings.export;
  return (
      <Card id="sec-export" title="Xuất dữ liệu" desc="“Kèm thời gian” chèn ngày vào mọi file tải về · Định dạng/metadata/ZIP là mặc định cho các khung xuất hỗ trợ." icon={<Download size={15} />}>
      <Field label="Định dạng"><Seg value={exp.format} onPick={(v) => onChange(["export", "format"], v)} options={[{ v: "docx", t: "Word" }, { v: "pdf", t: "PDF" }, { v: "xlsx", t: "Excel" }]} /></Field>
      <Field label="Kèm metadata"><Toggle label="Meta" checked={exp.includeMeta} onChange={(v) => onChange(["export", "includeMeta"], v)} /></Field>
      <Field label="Kèm thời gian xuất"><Toggle label="Time" checked={exp.includeTimestamp} onChange={(v) => onChange(["export", "includeTimestamp"], v)} /></Field>
      <Field label="Tự ZIP nhiều file"><Toggle label="ZIP" checked={exp.autoZip} onChange={(v) => onChange(["export", "autoZip"], v)} /></Field>
    </Card>
  );
}

/* ── Sao lưu ─────────────────────────────── */
function BackupSection({ settings, onChange, onImportFile, importErr, onExport }) {
  const usage = useMemo(() => getStorageUsage(), [settings]);
  const [wiping, setWiping] = useState(false);
  const wipeCache = async () => {
    if (!confirm("Xóa cache tìm kiếm/ảnh để giải phóng bộ nhớ? (Không mất sách & cài đặt)")) return;
    setWiping(true);
    try {
      const prefixes = ["sgk_idx_", "sgk_idxmeta_", "sgk_index_", "sgk_meta_", "ocr_", "txt_", "chat_"];
      let n = 0;
      for (const k of listKeys()) {
        if (k && prefixes.some((p) => k.startsWith(p))) { if (safeRemove(k).ok) n++; }
      }
      if ("caches" in window) { try { const ks = await caches.keys(); for (const k of ks) try { await caches.delete(k); } catch {} } catch {} }
      alert(`Đã dọn ${n} mục cache.`);
    } finally { setWiping(false); }
  };
  return (
    <div>
      <Card id="sec-backup" title="Sao lưu & Khôi phục" desc="File JSON chứa toàn bộ cài đặt · Nhập là áp dụng ngay." icon={<Database size={15} />}>
        <div className="st-kv"><span>Dung lượng local đang dùng</span><b>~{usage.kb} KB</b></div>
        <div className="st-kv"><span>Lần sao lưu trước</span><b>{settings.backup?.lastBackupTime ? new Date(settings.backup.lastBackupTime).toLocaleString("vi-VN") : "Chưa có"}</b></div>
        <Field label="Tự sao lưu định kỳ" hint="App tự chép 1 bản chụp dữ liệu nền khi mở app — không bật cửa sổ nào, không gửi đi đâu">
          <Toggle label="Auto" checked={!!settings.backup?.autoBackup} onChange={(v) => onChange(["backup", "autoBackup"], v)} />
        </Field>
        {settings.backup?.autoBackup && (
          <>
            <Field label="Chu kỳ">
              <Seg
                value={settings.backup?.autoBackupFrequency || "weekly"}
                onPick={(v) => onChange(["backup", "autoBackupFrequency"], v)}
                options={[{ v: "daily", t: "Hàng ngày" }, { v: "weekly", t: "Hàng tuần" }, { v: "monthly", t: "Hàng tháng" }]}
              />
            </Field>
            <Field label={`Giữ ${settings.backup?.keepBackups || 4} bản`} hint="Bản cũ hơn hạn mức sẽ tự xóa">
              <input
                type="range"
                className="st-range"
                min={1}
                max={10}
                step={1}
                value={settings.backup?.keepBackups || 4}
                onChange={(e) => onChange(["backup", "keepBackups"], Number(e.target.value))}
              />
            </Field>
          </>
        )}
        <div className="st-btn-row">
          <button className="st-btn st-btn-primary st-btn-sm" onClick={onExport}><Download size={13} /> Xuất file sao lưu</button>
          <button className="st-btn st-btn-ghost st-btn-sm" disabled={wiping} onClick={wipeCache}>{wiping ? "Đang dọn…" : "Dọn cache"}</button>
        </div>
        <div style={{ marginTop: "0.6rem" }}>
          <FileDropzone
            accept="application/json,.json"
            multiple={false}
            title="Kéo thả file sao lưu vào đây hoặc bấm để chọn"
            hint="JSON cài đặt — thả vào là nhập ngay"
            compact
            onFiles={(f) => onImportFile(Array.isArray(f) ? f[0] : f)}
          />
        </div>
        {importErr && <p className="st-note err">{importErr}</p>}
      </Card>
      <Card id="sec-reset" title="Đặt lại" desc="Cẩn thận: đặt lại toàn bộ đưa mọi mục về mặc định gốc." icon={<RotateCcw size={15} />}>
        <div className="st-btn-row">
          <button className="st-btn st-btn-danger-ghost st-btn-sm" onClick={() => { if (confirm("Đặt lại TOÀN BỘ cài đặt về mặc định?")) { const n = resetAllSettings(); window.location.reload(); } }}>Đặt lại toàn bộ</button>
        </div>
      </Card>
    </div>
  );
}

/* ── Hành vi & Âm thanh ─────────────────────────────── */
function BehaviorSection({ settings, onChange }) {
  const beh = settings.behavior;
  const pct = Math.round((Number.isFinite(beh.soundVolume) ? beh.soundVolume : 0.35) * 100);
  return (
    <div>
      <Card id="sec-behavior" title="Hành vi" desc="Tắt 'Hỏi khi xóa' là bấm xóa đi luôn · Tắt 'Hiện thông báo' là app im lặng." icon={<Zap size={15} />}>
        <Field label="Hỏi trước khi xóa" hint="Tắt = xóa ngay không hỏi"><Toggle label="Hỏi xóa" checked={beh.confirmDelete} onChange={(v) => onChange(["behavior", "confirmDelete"], v)} /></Field>
        <Field label="Hỏi trước khi xuất"><Toggle label="Hỏi xuất" checked={beh.confirmExport} onChange={(v) => onChange(["behavior", "confirmExport"], v)} /></Field>
        <Field label="Tự động lưu" hint="Các khung soạn/nháp tự ghi"><Toggle label="Auto" checked={beh.autoSave} onChange={(v) => onChange(["behavior", "autoSave"], v)} /></Field>
        {beh.autoSave && <Field label={`Chờ ${beh.autoSaveDelay}ms sau khi gõ`}><input type="range" className="st-range" min={300} max={5000} step={100} value={beh.autoSaveDelay} onChange={(e) => onChange(["behavior", "autoSaveDelay"], Number(e.target.value))} /></Field>}
        <Field label="Hiện bong bóng thông báo"><Toggle label="Noti" checked={beh.showNotifications} onChange={(v) => onChange(["behavior", "showNotifications"], v)} /></Field>
        <Field label="Rung phản hồi" hint="Chỉ máy hỗ trợ (di động)"><Toggle label="Rung" checked={beh.vibrateEnabled} onChange={(v) => onChange(["behavior", "vibrateEnabled"], v)} /></Field>
      </Card>
      <Card id="sec-sound" title="Âm thanh" desc="Mặc định TẮT để không làm phiền lớp học." icon={<Volume2 size={15} />}>
        <Field label={beh.soundEnabled ? "Đang bật" : "Đang tắt"}><Toggle label="Âm" checked={!!beh.soundEnabled} onChange={(v) => onChange(["behavior", "soundEnabled"], v)} /></Field>
        <Field label={`Âm lượng — ${pct}%`}><span style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>🔈<input type="range" className="st-range" min={0} max={100} value={pct} disabled={!beh.soundEnabled} onChange={(e) => onChange(["behavior", "soundVolume"], Number(e.target.value) / 100)} />🔊<b className="st-pct">{pct}%</b></span></Field>
        <Field label="Kiểu âm" hint="Tối giản: chỉ success/error/AI/mission"><Seg value={beh.soundProfile || "minimal"} onPick={(v) => onChange(["behavior", "soundProfile"], v)} options={[{ v: "minimal", t: "Tối giản" }, { v: "standard", t: "Tiêu chuẩn" }]} /></Field>
        <div className="st-btn-row"><button className="st-btn st-btn-primary st-btn-sm" type="button" onClick={() => { try { soundManager.preview("success"); } catch {} }}><Volume2 size={13} /> Thử âm thanh</button></div>
      </Card>
    </div>
  );
}

/* ── Thông báo ─────────────────────────────── */
function NotificationsSection({ settings, onChange }) {
  const n = settings.notifications;
  const [perm, setPerm] = useState(() => { try { return ("Notification" in window) ? Notification.permission : "unsupported"; } catch { return "unsupported"; } });
  const [testing, setTesting] = useState(false);
  const ask = async () => {
    try {
      if (!("Notification" in window)) { alert("Trình duyệt không hỗ trợ notification"); return; }
      const p = await Notification.requestPermission(); setPerm(p);
      try { refreshNotificationTimer(loadSettings()); } catch {}
    } catch (e) { alert("Không xin được quyền: " + (e.message || "")); }
  };
  const sendTest = async () => {
    setTesting(true);
    try { const r = await testNotification(); alert(r.msg); } finally { setTesting(false); }
  };
  return (
    <Card id="sec-notif" title="Thông báo" desc="Nhắc nhiệm vụ hằng ngày chạy local trên máy này · Cần cấp quyền trình duyệt." icon={<Bell size={15} />}>
      {perm === "unsupported" && <p className="st-note err">Trình duyệt không hỗ trợ Notification API</p>}
      <Field label="Nhắc nhiệm vụ hằng ngày" hint="Đúng giờ là hiện 1 thông báo, kể cả khi đang làm việc khác">
        <Toggle label="Nhắc" checked={n.dailyReminder} onChange={(v) => { onChange(["notifications", "dailyReminder"], v); setTimeout(() => { try { refreshNotificationTimer(loadSettings()); } catch {} }, 50); }} />
      </Field>
      {n.dailyReminder && <Field label="Giờ nhắc"><input type="time" className={inp} value={n.dailyTime} onChange={(e) => { const v = e.target.value; if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)) { onChange(["notifications", "dailyTime"], v); setTimeout(() => { try { refreshNotificationTimer(loadSettings()); } catch {} }, 50); } }} /></Field>}
      <Field label="Nhắc giữ streak"><Toggle label="Streak" checked={n.streakReminder} onChange={(v) => onChange(["notifications", "streakReminder"], v)} /></Field>
      <Field label="Báo mở khóa thành tựu"><Toggle label="Achieve" checked={n.achievementUnlocked} onChange={(v) => onChange(["notifications", "achievementUnlocked"], v)} /></Field>
      <div className="st-btn-row">
        <button className="st-btn st-btn-ghost st-btn-sm" onClick={ask}>Xin quyền ({perm})</button>
        <button className="st-btn st-btn-primary st-btn-sm" disabled={testing} onClick={sendTest}>{testing ? "Đang gửi…" : "Gửi thử"}</button>
      </div>
    </Card>
  );
}

/* ── Phím tắt (giữ logic cũ, bọc Card mới) ─────────────────────────────── */
function KeyboardSection() {
  const [shortcuts, setShortcuts] = useState(() => getShortcuts());
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("");
  const [conflictMsg, setConflictMsg] = useState("");
  useEffect(() => { setShortcuts(getShortcuts()); }, []);
  const save = (next) => { setShortcuts(next); updateSettings({ keyboard: { shortcuts: next } }); };
  useEffect(() => {
    if (!editing) return;
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setEditing(null); return; }
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const combo = comboToString(e); if (!combo) return;
      const conflict = findConflict(shortcuts, combo, editing);
      if (conflict) { setConflictMsg(`Trùng với "${SHORTCUT_META[conflict]?.label || conflict}"`); return; }
      save({ ...shortcuts, [editing]: combo }); setEditing(null); setConflictMsg("");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing, shortcuts]);
  const filteredCats = SHORTCUT_CATEGORIES.filter((cat) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return cat.toLowerCase().includes(q) || Object.entries(SHORTCUT_META).some(([id, m]) => m.cat === cat && (m.label.toLowerCase().includes(q) || id.toLowerCase().includes(q)));
  });
  return (
    <Card id="sec-keys" title="Phím tắt" desc="Bấm Đổi → nhấn tổ hợp mới · Esc hủy · Trùng sẽ cảnh báo · Lưu ngay." icon={<Keyboard size={15} />}>
      <div className="st-btn-row" style={{ marginBottom: 10 }}>
        <input className={inp} style={{ flex: "1 1 200px" }} placeholder="Lọc: ai, trang, toc…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => { if (confirm("Đặt lại tất cả phím tắt?")) save({ ...DEFAULT_SHORTCUTS }); }}><RotateCcw size={13} /> Tất cả</button>
      </div>
      {conflictMsg && <div className="st-alert st-alert-warn">⚠️ {conflictMsg}</div>}
      {filteredCats.map((cat) => {
        const items = Object.entries(SHORTCUT_META).filter(([, m]) => m.cat === cat).filter(([id, m]) => {
          if (!filter.trim()) return true; const q = filter.toLowerCase();
          return m.label.toLowerCase().includes(q) || (m.desc || "").toLowerCase().includes(q) || id.toLowerCase().includes(q) || (shortcuts[id] || "").toLowerCase().includes(q);
        });
        if (!items.length) return null;
        return (
          <div key={cat} className="st-kbd-group">
            <div className="st-kbd-head"><b>{cat}</b><span>{items.length}</span></div>
            {items.map(([id, meta]) => {
              const combo = shortcuts[id] || ""; const isEditing = editing === id;
              return (
                <div key={id} className={`st-kbd-row ${isEditing ? "editing" : ""}`}>
                  <div className="st-kbd-info"><b>{meta.label}</b><small>{meta.desc}</small></div>
                  <div className="st-kbd-keys">
                    {isEditing ? <span className="st-kbd-rec">Nhấn tổ hợp…</span>
                      : combo ? combo.split("+").map((k, i) => <kbd key={i}>{k}</kbd>)
                      : <i className="st-muted">trống</i>}
                  </div>
                  <div className="st-kbd-btns">
                    <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => (isEditing ? setEditing(null) : (setConflictMsg(""), setEditing(id)))}>{isEditing ? "Hủy" : "Đổi"}</button>
                    <button className="st-btn st-btn-ghost st-btn-sm" title="Về mặc định" onClick={() => save({ ...shortcuts, [id]: DEFAULT_SHORTCUTS[id] || "" })}><RotateCcw size={12} /></button>
                    <button className="st-btn st-btn-ghost st-btn-sm" title="Xóa" onClick={() => save({ ...shortcuts, [id]: "" })}><X size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </Card>
  );
}

/* ── Trợ năng ─────────────────────────────── */
function AccessibilitySection({ settings, onChange }) {
  const a = settings.accessibility;
  return (
    <Card id="sec-a11y" title="Khả năng tiếp cận" desc="Đổi là app đổi ngay: tương phản, chữ, chuyển động, viền focus." icon={<Accessibility size={15} />}>
      <Field label="Tương phản cao" hint="Chữ đậm, viền rõ"><Toggle label="HC" checked={a.highContrast} onChange={(v) => onChange(["accessibility", "highContrast"], v)} /></Field>
      <Field label="Chữ lớn hơn" hint="+~12% toàn app"><Toggle label="LT" checked={a.largerText} onChange={(v) => onChange(["accessibility", "largerText"], v)} /></Field>
      <Field label="Giảm chuyển động" hint="Tắt animation bay nhảy"><Toggle label="RM" checked={a.reduceMotion} onChange={(v) => onChange(["accessibility", "reduceMotion"], v)} /></Field>
      <Field label="Viền focus rõ" hint="Đi phím Tab thấy ô đang chọn"><Toggle label="FI" checked={a.focusIndicators} onChange={(v) => onChange(["accessibility", "focusIndicators"], v)} /></Field>
    </Card>
  );
}

/* ── Riêng tư (mới: điều khiển thật) ─────────────────────────────── */
function PrivacySection({ settings, onChange }) {
  const p = settings.privacy || {};
  const clearHistory = () => {
    if (!confirm("Xóa lịch sử mở sách & thống kê lượt mở? (Không xóa sách)")) return;
    try { safeRemove("sgk_history"); safeRemove("sgk_counts"); } catch {}
    try { appEvents.emit(AppEvents.DATA_UPDATED, { source: "privacy-clear-history" }); } catch {}
    alert("Đã xóa lịch sử.");
  };
  return (
    <Card id="sec-privacy" title="Quyền riêng tư" desc="App local-first: sách & cài đặt nằm trên máy · AI chỉ gửi trang đang chọn." icon={<Shield size={15} />}>
      <Field label="Chỉ dùng local" hint="Khóa mọi gửi dữ liệu phụ (khuyên bật)"><Toggle label="Local" checked={p.localOnly !== false} onChange={(v) => onChange(["privacy", "localOnly"], v)} /></Field>
      <Field label="Cho phép phân tích ẩn danh" hint="Hiện tại app không gửi analytics đi đâu"><Toggle label="Anal" checked={!!p.allowAnalytics} onChange={(v) => onChange(["privacy", "allowAnalytics"], v)} /></Field>
      <Field label="Gửi báo cáo lỗi" hint="Hiện tại chỉ ghi console máy"><Toggle label="Crash" checked={!!p.sendCrashReports} onChange={(v) => onChange(["privacy", "sendCrashReports"], v)} /></Field>
      <Field label="Ghi nhớ lịch sử mở sách" hint="Tắt = không lưu sách đã mở"><Toggle label="Hist" checked={p.rememberHistory !== false} onChange={(v) => { onChange(["privacy", "rememberHistory"], v); if (!v) { try { safeRemove("sgk_history"); safeRemove("sgk_counts"); } catch {} } }} /></Field>
      <div className="st-btn-row"><button className="st-btn st-btn-danger-ghost st-btn-sm" onClick={clearHistory}>Xóa lịch sử mở sách</button></div>
    </Card>
  );
}

/* ── Nâng cao ─────────────────────────────── */
function AdvancedSection({ settings, onChange }) {
  const adv = settings.advanced;
  const [diag, setDiag] = useState(null);
  const runDiag = async () => {
    const res = {};
    // CỐ Ý đọc localStorage trực tiếp (không qua safeStorage): chẩn đoán phải
    // kiểm tra tầng thô — key có tồn tại thật không, ghi/xoá có được không.
    try { localStorage.setItem("_diag_test", "1"); localStorage.removeItem("_diag_test"); res.localStorage = "✓"; } catch { res.localStorage = "✗"; }
    try { res.IndexedDB = "indexedDB" in window ? "✓" : "✗"; } catch { res.IndexedDB = "✗"; }
    try { const r = await fetch(apiUrl("/api/books"), { method: "HEAD" }); res.Backend = r.ok ? "✓" : `✗ ${r.status}`; } catch { res.Backend = "✗"; }
    try { res.Gemini = localStorage.getItem("GEMINI_API_KEY") ? "✓ (có key)" : "✗ (chưa key)"; } catch { res.Gemini = "?"; }
    res.PDF = pdfjsLib ? "✓" : "✗";
    try {
      const keys = ["sgk_missions", "sgk_mission_streak", "sgk_mission_xp", "sgk_achievements"];
      res["Mission Engine"] = keys.every((k) => localStorage.getItem(k) !== null) ? "✓" : "△ (chưa đủ key)";
    } catch { res["Mission Engine"] = "✗"; }
    try {
      const raw = localStorage.getItem("sgk_settings");
      res.Settings = raw && JSON.parse(raw).missions ? "✓" : "⚠ (thiếu)";
    } catch { res.Settings = "✗"; }
    setDiag(res);
  };
  return (
    <div>
      <Card id="sec-perf" title="Hiệu năng & Bộ nhớ" desc="Tắt lazy/prefetch khi máy yếu · Chất lượng PDF đổi độ nét bìa." icon={<Timer size={15} />}>
        <Field label="Lazy loading" hint="Chỉ vẽ bìa khi cuộn tới"><Toggle label="Lazy" checked={adv.lazyLoading} onChange={(v) => onChange(["advanced", "lazyLoading"], v)} /></Field>
        <Field label="Tải trước bìa kế tiếp"><Toggle label="Prefetch" checked={adv.prefetch} onChange={(v) => onChange(["advanced", "prefetch"], v)} /></Field>
        <Field label="Chất lượng PDF"><Seg value={adv.pdfQuality} onPick={(v) => onChange(["advanced", "pdfQuality"], v)} options={[{ v: "low", t: "Thấp" }, { v: "medium", t: "Vừa" }, { v: "high", t: "Cao" }]} /></Field>
        <Field label="Cache PDF" hint="Tắt để luôn tải mới từ server"><Toggle label="Cache" checked={adv.cachePDFs} onChange={(v) => onChange(["advanced", "cachePDFs"], v)} /></Field>
        <Field label="Giữ cache"><select className={sel} value={adv.cacheTimeout} onChange={(e) => onChange(["advanced", "cacheTimeout"], Number(e.target.value))}>
          <option value={3600000}>1 giờ</option><option value={86400000}>1 ngày</option><option value={604800000}>1 tuần</option>
        </select></Field>
        <Field label="Chế độ offline" hint="Hiện băng-rôn offline, ưu tiên cache"><Toggle label="Offline" checked={adv.enableOfflineMode} onChange={(v) => onChange(["advanced", "enableOfflineMode"], v)} /></Field>
        <Field label="Chế độ gỡ lỗi" hint="Hiện viền debug + log chi tiết"><Toggle label="Debug" checked={adv.debugMode} onChange={(v) => onChange(["advanced", "debugMode"], v)} /></Field>
        <Field label="Analytics nội bộ" hint="Bị khóa nếu Riêng tư tắt analytics"><Toggle label="Anal" checked={adv.enableAnalytics} onChange={(v) => onChange(["advanced", "enableAnalytics"], v)} /></Field>
      </Card>
      <Card id="sec-diag" title="Chẩn đoán" desc="Kiểm tra nhanh backend, key, engine." icon={<Zap size={15} />}>
        <p className="st-muted">Phiên bản 0.0.0 · Schema 2 · Local-first</p>
        <div className="st-btn-row"><button className="st-btn st-btn-ghost st-btn-sm" onClick={runDiag}>Chạy chẩn đoán</button></div>
        {diag && <ul className="st-diag">{Object.entries(diag).map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>}
      </Card>
    </div>
  );
}

function AboutSection() {
  return (
    <Card id="sec-about" title="Hành trang Tiểu học — SGK App 3.0" desc="Local-first · Không cloud · Dữ liệu nằm trên máy thầy/cô." icon={<Info size={15} />}>
      <div className="st-kv"><span>Phát triển</span><b>{APP_DEVELOPER}</b></div>
      <div className="st-kv"><span>Bản quyền</span><b>{APP_COPYRIGHT}</b></div>
      <div className="st-kv"><span>Kiến trúc</span><b>React + Express · IndexedDB + localStorage</b></div>
    </Card>
  );
}
