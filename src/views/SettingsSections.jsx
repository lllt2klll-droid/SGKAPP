import { useState, useEffect } from "react";
import { Card } from "./SettingsPrimitives.jsx";
import { appEvents, AppEvents } from "../core/appEvents.js";
import { Settings, Search, Palette, BookOpen, Target, Cpu, Bell, Keyboard, Accessibility, Shield, Zap, RotateCcw, Eye, EyeOff, RefreshCw, X, Sun, Moon, Monitor, FileText, Volume2, Download, Check, Sparkles, SlidersHorizontal, Library as LibraryIcon, Timer, LayoutDashboard, Blocks, Trash2, ChevronDown, ExternalLink, ArrowRight, GraduationCap, ShieldCheck } from "lucide-react";
import { loadSettings, updateSettings, DEFAULT_SETTINGS, getStorageBreakdown, testNotification, refreshNotificationTimer, clearAiChatHistory, clearRecentSearchHistory, clearScanHistory, OPTIONAL_VIEW_IDS } from "../services/settingsStore.js";
import { soundManager } from "../audio/soundManager.js";
import { DEFAULT_SHORTCUTS, SHORTCUT_META, SHORTCUT_CATEGORIES, getShortcuts, comboToString, findConflict } from "../services/keyboardShortcuts.js";
import { VIEWS as NAV_VIEWS } from "../core/navigationRegistry.js";
import { dl } from "../services/exportDoc.js";
import { safeRemove } from "../safeStorage.js";
import { getApiBase, apiUrl, MODEL_OPTIONS, normalizeModel } from "../services/apiConfig.js";
import aiService, { getFriendlyErrorMessage } from "../ai/aiService.js";
import { pdfjsLib } from "../reader/pdfjs-config.js";
import { ACCENT_PALETTES, generateAccentScale } from "../designTokens.js";
import { runA11yAudit } from "./accessibilityAudit.js";

/* ── Điều hướng nhóm ─────────────────────────────── */

function nowTime() { try { return new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } }
const FEATURE_GROUPS = [
  { title: "Thư viện SGK", ids: ["vocab", "whiteboard", "internship"] },
  { title: "Soạn dạy", ids: ["activities", "worksheets", "questionbank"] },
  { title: "Nghiên cứu & Công cụ nâng cao", ids: ["compare", "matrix", "inventory", "langstats"] },
  { title: "Sổ tay nghiên cứu", ids: ["references", "collections"] },
  { title: "Công việc", ids: ["ideas", "stats"] },
  { title: "Kho công cụ", ids: ["webtools"] },
];
const FEATURE_DESCS = {
  vocab: "Từ vựng cá nhân + tra từ",
  whiteboard: "Sơ đồ tư duy, mindmap",
  internship: "Nhật ký thực tập",
  activities: "Thư viện hoạt động học",
  worksheets: "Phiếu học tập",
  questionbank: "Ngân hàng câu hỏi",
  compare: "So sánh sách / đoạn văn",
  matrix: "Ma trận chương trình",
  inventory: "Kiểm kê SGK",
  langstats: "Thống kê ngôn ngữ corpus",
  references: "Tài liệu tham khảo",
  collections: "Trích đoạn & bộ dữ liệu",
  ideas: "Sổ ý tưởng",
  stats: "Thống kê cá nhân",
  webtools: "Kho công cụ web",
};
export function Field({ label, hint, children }) {
  return (
    <div className="st-field">
      <div className="st-field-label"><span>{label}</span>{hint && <small>{hint}</small>}</div>
      <div className="st-field-ctl">{children}</div>
    </div>
  );
}
export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label}
      className={`st-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="st-toggle-knob" />
    </button>
  );
}
export function Seg({ options, value, onPick }) {
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

/* ── Trang vào Cài đặt ─────────────────────────────── */
export function SettingsOverview({ onNavigate }) {
  const shortcuts = [
    { id: "appearance", title: "Đổi giao diện", hint: "Sáng, tối, màu sắc và cỡ chữ", icon: <Palette size={17} /> },
    { id: "reading", title: "Chỉnh cách đọc", hint: "Bố cục và zoom sách mặc định", icon: <BookOpen size={17} /> },
    { id: "dashboard", title: "Sắp xếp trang chủ", hint: "Chọn thông tin muốn nhìn thấy", icon: <LayoutDashboard size={17} /> },
  ];
  const groups = [
    {
      id: "general", title: "Cá nhân hóa", icon: <Palette size={17} />,
      description: "Đưa không gian làm việc về đúng cách bạn muốn.",
      items: ["Tên hiển thị", "Giao diện & chữ", "Trang Tổng quan"],
    },
    {
      id: "reading", title: "Dạy & đọc", icon: <GraduationCap size={18} />,
      description: "Thiết lập trải nghiệm đọc sách và chuẩn bị bài.",
      items: ["Trình đọc sách", "Soạn thảo Word", "Thư viện & bảng trắng"],
    },
    {
      id: "ai", title: "AI & công cụ", icon: <Cpu size={17} />,
      description: "Kết nối trợ lý, tìm kiếm và chọn tính năng cần dùng.",
      items: ["Gemini", "Tìm kiếm", "Phím tắt & tính năng"],
    },
    {
      id: "privacy", title: "Dữ liệu & bảo vệ", icon: <ShieldCheck size={17} />,
      description: "Kiểm soát riêng tư, lịch sử và thông báo.",
      items: ["Riêng tư", "Xuất dữ liệu", "Thông báo"],
    },
    {
      id: "accessibility", title: "Trợ năng & ứng dụng", icon: <Accessibility size={17} />,
      description: "Làm ứng dụng dễ tiếp cận hơn và xem thông tin hệ thống.",
      items: ["Trợ năng", "Hành vi ứng dụng", "Nâng cao & giới thiệu"],
    },
  ];

  return (
    <div className="st-overview">
      <section className="st-welcome">
        <div className="st-welcome-copy">
          <span className="st-eyebrow"><Sparkles size={13} /> KHÔNG GIAN CỦA BẠN</span>
          <h1>Cài đặt theo cách bạn làm việc</h1>
          <p>Chọn một việc bạn muốn điều chỉnh. Thay đổi được lưu tự động và áp dụng ngay.</p>
        </div>
        <button className="st-welcome-cta" onClick={() => onNavigate("appearance")}>
          Cá nhân hóa ngay <ArrowRight size={15} />
        </button>
        <div className="st-welcome-mark" aria-hidden="true"><Settings size={84} /></div>
      </section>

      <section className="st-overview-section" aria-labelledby="st-shortcuts-title">
        <div className="st-overview-heading">
          <div><h2 id="st-shortcuts-title">Bắt đầu nhanh</h2><p>Những thiết lập thường cần chỉnh nhất</p></div>
        </div>
        <div className="st-shortcuts">
          {shortcuts.map((item) => (
            <button key={item.id} className="st-shortcut" onClick={() => onNavigate(item.id)}>
              <span className="st-shortcut-icon">{item.icon}</span>
              <span className="st-shortcut-copy"><b>{item.title}</b><small>{item.hint}</small></span>
              <ArrowRight className="st-shortcut-arrow" size={15} />
            </button>
          ))}
        </div>
      </section>

      <section className="st-overview-section" aria-labelledby="st-groups-title">
        <div className="st-overview-heading">
          <div><h2 id="st-groups-title">Khám phá cài đặt</h2><p>Các lựa chọn được sắp theo nhu cầu sử dụng</p></div>
        </div>
        <div className="st-category-grid">
          {groups.map((group) => (
            <button key={group.id} className="st-category" onClick={() => onNavigate(group.id)}>
              <span className="st-category-icon">{group.icon}</span>
              <span className="st-category-main">
                <b>{group.title}</b>
                <small>{group.description}</small>
                <span className="st-category-items">{group.items.join(" · ")}</span>
              </span>
              <ArrowRight className="st-category-arrow" size={16} />
            </button>
          ))}
        </div>
      </section>
      <p className="st-overview-note"><Check size={14} /> Không cần bấm lưu — mọi thay đổi đều được lưu tự động.</p>
    </div>
  );
}

/* ── Tổng quan ─────────────────────────────── */
export function GeneralSection({ settings, onChange }) {
  const g = settings.general;
  return (
    <div>
      <Card id="sec-general" title="Tổng quan" desc="Tên hiển thị hiện ở Dashboard · Trang mở áp dụng ngay lần mở app sau · Ngày đầu tuần đổi cách tính tuần Nhiệm vụ." icon={<Settings size={15} />}>
        <Field label="Tên hiển thị" hint="Hiện lời chào ở Dashboard"><input className={inp} value={g.displayName} onChange={(e) => onChange(["general", "displayName"], e.target.value)} placeholder="Thầy/Cô …" /></Field>
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

/* ── Bảng điều khiển (Dashboard) ─────────────────────────────── */
export function DashboardSection({ settings, onPatch }) {
  const d = settings.dashboard || {};
  const rows = [
    ["showGreeting", "Lời chào & thông tin nhanh", "Khối đầu trang: “Chào thầy/cô”, ngày, số sách/việc"],
    ["showQuickActions", "Thao tác nhanh", "Dòng nút: Tiếp tục đọc, Soạn Word, Tất cả công cụ"],
    ["showKpis", "Dải số liệu tổng quan", "Thẻ Sách / Đang đọc / Đánh dấu / Từ vựng…"],
    ["showReading", "Khối Đang đọc", "Sách đọc dở kèm % tiến độ"],
    ["showRecentPlans", "Giáo án gần đây", "3 giáo án sửa gần nhất"],
    ["showTasks", "Việc cần làm", "Task chưa xong"],
    ["showMissions", "Nhiệm vụ & huy hiệu", "Widget Daily Missions / streak / XP"],
    ["showScans", "Scan gần đây", "Ảnh crop SGK đã phân tích"],
    ["showStats", "Biểu đồ & chỉ số", "Phân bổ hoạt động, phân bố môn, chỉ số thật"],
    ["showWhiteboards", "Bảng trắng gần đây", "3 bảng trắng mở gần nhất"],
  ];
  const presetAll = (val) => {
    const patch = {};
    for (const k of Object.keys(DEFAULT_SETTINGS.dashboard)) patch[k] = val;
    onPatch("dashboard", patch);
  };
  return (
    <div>
      <Card id="sec-dashboard" title="Bảng điều khiển" desc="Bật/tắt từng khối của trang Tổng quan — đổi là Dashboard đổi ngay, không cần tải lại." icon={<LayoutDashboard size={15} />}>
        <div className="st-btn-row">
          <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => presetAll(true)}>Bật tất cả</button>
          <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => presetAll(false)}>Tối giản (ẩn hết)</button>
        </div>
        {rows.map(([key, label, hint]) => (
          <Field key={key} label={label} hint={hint}>
            <Toggle label={label} checked={d[key] !== false} onChange={(v) => onPatch("dashboard", { [key]: v })} />
          </Field>
        ))}
      </Card>
      <Card id="sec-dashboard-modules" title="Ẩn hẳn một module?" desc="Mục trên chỉ ẩn khối ở trang Tổng quan — module vẫn mở từ thanh điều hướng." icon={<Blocks size={15} />}>
        <p className="st-muted">Muốn tắt một khu vực khỏi <b>toàn bộ app</b> (ẩn thanh bên + chặn mở trực tiếp): vào <b>Cài đặt → Hệ thống → Tính năng</b>.</p>
      </Card>
    </div>
  );
}

/* ── Giao diện ─────────────────────────────── */
export function AppearanceSection({ settings, onChange, onPatch }) {
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
export function ReadingSection({ settings, onChange }) {
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
export function EditorSection({ settings, onChange }) {
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
export function LibrarySection({ settings, onChange }) {
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
export function WhiteboardSection({ settings, onChange, syncStatus }) {
  const w = settings.whiteboard || {};
  return (
    <Card id="sec-whiteboard" title="Bảng trắng" desc="Lưới, bắt lưới và căn chỉnh được áp dụng cho mọi bảng hiện có lẫn bảng mới." icon={<SlidersHorizontal size={15} />}>
      <Field label="Hiện lưới" hint="Đồng bộ toàn bộ bảng"><Toggle label="Lưới" checked={!!w.grid} onChange={(v) => onChange(["whiteboard", "grid"], v)} /></Field>
      <Field label="Bắt lưới" hint="Đồng bộ toàn bộ bảng"><Toggle label="Bắt lưới" checked={!!w.snap} onChange={(v) => onChange(["whiteboard", "snap"], v)} /></Field>
      <Field label="Căn chỉnh thông minh" hint="Tự căn các khối khi di chuyển"><Toggle label="Căn chỉnh" checked={!!w.smartAlign} onChange={(v) => onChange(["whiteboard", "smartAlign"], v)} /></Field>
      <Field label="Giãn cách thông minh" hint="Tự giữ khoảng cách đều khi di chuyển"><Toggle label="Giãn cách" checked={!!w.smartSpacing} onChange={(v) => onChange(["whiteboard", "smartSpacing"], v)} /></Field>
      <Field label="Kéo cả nhánh"><Toggle label="Kéo cả nhánh" checked={!!w.branchDrag} onChange={(v) => onChange(["whiteboard", "branchDrag"], v)} /></Field>
      <Field label="Mũi tên tạo nhánh nhanh"><Toggle label="Mũi tên nhánh" checked={w.showBranchArrows !== false} onChange={(v) => onChange(["whiteboard", "showBranchArrows"], v)} /></Field>
      <Field label="Tự động lưu bảng"><Toggle label="Tự lưu bảng" checked={w.autoSave !== false} onChange={(v) => onChange(["whiteboard", "autoSave"], v)} /></Field>
      <Field label="Thời gian chờ tự lưu"><select className={sel} value={w.autoSaveDelay ?? 900} onChange={(e) => onChange(["whiteboard", "autoSaveDelay"], Number(e.target.value))}>
        {[300, 600, 900, 1500, 3000].map((ms) => <option key={ms} value={ms}>{ms < 1000 ? `${ms} ms` : `${ms / 1000} giây`}</option>)}
      </select></Field>
      <Field label="Âm thanh thao tác" hint="Cần bật âm thanh toàn ứng dụng"><Toggle label="Âm thanh bảng" checked={w.soundEffects !== false} onChange={(v) => onChange(["whiteboard", "soundEffects"], v)} /></Field>
      <Field label="Màu bút mặc định" hint="Áp dụng ngay cho bút đang chọn"><input type="color" className="st-color" value={w.defaultPenColor || "#1d4ed8"} onChange={(e) => onChange(["whiteboard", "defaultPenColor"], e.target.value)} /></Field>
      <Field label="Độ dày bút mặc định" hint="Áp dụng ngay cho bút đang chọn"><select className={sel} value={w.defaultPenWidth || 3} onChange={(e) => onChange(["whiteboard", "defaultPenWidth"], Number(e.target.value))}>
        {[2, 3, 5, 8].map((n) => <option key={n} value={n}>{n}px</option>)}
      </select></Field>
      {syncStatus && <p className={`st-note ${syncStatus.type}`} role="status" aria-live="polite">{syncStatus.text}</p>}
    </Card>
  );
}

/* ── Nhiệm vụ ─────────────────────────────── */
export function MissionsSection({ settings, onChange }) {
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
export function AISection({ settings, onChange, geminiKey, setGeminiKey, saveKey, showKey, setShowKey, testingKey, setTestingKey, keyResult, setKeyResult }) {
  const ai = settings.ai || {};
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
      const testModel = normalizeModel(ai.model);
      const text = await aiService.callAI({
        apiKey: geminiKey.trim(),
        contents: [{ role: "user", parts: [{ text: "Xin chào" }] }],
        systemInstruction: { parts: [{ text: "Chỉ trả lời OK" }] },
        // maxOutputTokens phải lớn hơn thinking budget tối thiểu (128) nếu bật thinking
        generationConfig: { temperature: 0, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
        model: testModel,
        timeout: 30000, maxRetries: 1, requestId: "test-key",
      });
      setKeyResult({ ok: true, msg: text ? `Kết nối thành công! (model: ${testModel})` : "Kết nối thành công!" });
      saveKey(geminiKey.trim());
    } catch (err) {
      const friendly = getFriendlyErrorMessage(err.status, err.message);
      setKeyResult({ ok: false, msg: `${friendly}${err.status ? ` [${err.status}]` : ""}` });
    } finally { setTestingKey(false); }
  };
  return (
    <div>
      <Card id="sec-ai" title="Gemini API" desc="Key lưu trên máy · Model áp dụng mọi công cụ AI · Độ dài & Sáng tạo áp dụng cho Trợ lý nổi và Hỏi AI." icon={<Cpu size={15} />}>
        <Field label="API Key" hint="Tạo khóa Gemini miễn phí tại Google AI Studio">
          <span style={{ display: "flex", gap: 6, flex: 1 }}>
            <input className={inp} style={{ flex: 1 }} type={showKey ? "text" : "password"} value={geminiKey}
              onChange={(e) => { setGeminiKey(e.target.value); setKeyResult(null); }} onBlur={() => saveKey(geminiKey)} placeholder="AIzaSy..." />
            <button type="button" className="st-btn st-btn-ghost st-btn-sm" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            <button className="st-btn st-btn-ghost st-btn-sm" onClick={handleTest} disabled={testingKey}>{testingKey ? <RefreshCw size={12} className="spin" /> : "Kiểm tra"}</button>
          </span>
        </Field>
        <div className="st-ai-key-guide">
          <div className="st-ai-key-guide-head">
            <b>Cách lấy API Key Gemini</b>
            <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">
              Mở Google AI Studio <ExternalLink size={12} />
            </a>
          </div>
          <ol>
            <li>Mở Google AI Studio bằng liên kết phía trên và đăng nhập tài khoản Google.</li>
            <li>Chọn <b>Get API key</b> (Lấy API key), sau đó chọn <b>Create API key</b> (Tạo API key).</li>
            <li>Nếu được hỏi, chọn một dự án Google Cloud hoặc tạo dự án mới; chờ khóa được tạo rồi bấm <b>Copy</b>.</li>
            <li>Quay lại đây, dán khóa vào ô <b>API Key</b> và bấm <b>Kiểm tra</b>. Khóa cũng được lưu khi bạn rời khỏi ô nhập.</li>
          </ol>
          <p>Giữ kín API Key, không gửi cho người khác. Hạn mức và điều kiện sử dụng phụ thuộc vào tài khoản, khu vực và chính sách hiện hành của Google.</p>
        </div>
        {keyResult && <p className={`st-note ${keyResult.ok ? "ok" : "err"}`}>{keyResult.msg}</p>}
        <Field label="Model" hint="Áp dụng mọi công cụ AI"><select className={sel} value={normalizeModel(ai.model)} onChange={(e) => onChange(["ai", "model"], e.target.value)}>
          {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select></Field>
        <Field label="Độ dài trả lời"><Seg value={ai.responseLength || "balanced"} onPick={(v) => onChange(["ai", "responseLength"], v)} options={[{ v: "concise", t: "Ngắn" }, { v: "balanced", t: "Cân bằng" }, { v: "detailed", t: "Chi tiết" }]} /></Field>
        <Field label={`Sáng tạo — ${ai.temperature ?? 0.7}`} hint="0 chính xác · 1 bay bổng">
          <input type="range" className="st-range" min={0} max={100} value={Math.round((ai.temperature ?? 0.7) * 100)}
            onChange={(e) => onChange(["ai", "temperature"], Math.min(1, Math.max(0, Number(e.target.value) / 100)))} />
        </Field>
      </Card>
      <Card id="sec-ai-note" title="Quyền riêng tư AI" desc="AI chỉ gửi nội dung bạn đang chọn · Dữ liệu local không tự đồng bộ cloud." icon={<Shield size={15} />}><p className="st-muted">Ứng dụng chạy local-first: sách, ghi chú và cài đặt nằm trên máy bạn; AI chỉ nhận phần bạn chủ động gửi (trang/đoạn đang chọn).</p></Card>
    </div>
  );
}

/* ── Tìm kiếm ─────────────────────────────── */
export function SearchSection({ settings, onChange }) {
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
export function ExportSection({ settings, onPatch }) {
  const exp = settings.export || {};
  const stamp = exp.filenameStamp || (exp.includeTimestamp === false ? "none" : "date");
  const exampleName = (name) =>
    stamp === "none" ? name
      : stamp === "datetime" ? `${name}_2026-10-17_1430`
        : `${name}_2026-10-17`;
  return (
      <Card id="sec-export" title="Xuất dữ liệu" desc="Chọn cách gắn mốc thời gian vào TÊN MỌI file tải về · Định dạng (PDF/Word/TXT/Excel) do từng khung xuất chọn lúc xuất." icon={<Download size={15} />}>
      <Field label="Mốc thời gian trong tên file" hint="Áp dụng cho file xuất như giáo án, phiếu học tập và Excel.">
        <Seg value={stamp} onPick={(v) => onPatch("export", { filenameStamp: v, includeTimestamp: v !== "none" })}
          options={[{ v: "none", t: "Không" }, { v: "date", t: "Ngày" }, { v: "datetime", t: "Ngày + giờ" }]} />
      </Field>
      <div className="st-kv"><span>Ví dụ tên file</span><b style={{ fontFamily: "monospace" }}>{exampleName("giao-an-toan-3")}</b></div>
    </Card>
  );
}

/* ── Hành vi & Âm thanh ─────────────────────────────── */
export function BehaviorSection({ settings, onChange }) {
  const beh = settings.behavior;
  const pct = Math.round((Number.isFinite(beh.soundVolume) ? beh.soundVolume : 0.35) * 100);
  return (
    <div>
      <Card id="sec-behavior" title="Hành vi" desc="Tắt 'Hỏi khi xóa' là bấm xóa đi luôn · Tắt 'Hiện thông báo' là app im lặng." icon={<Zap size={15} />}>
        <Field label="Hỏi trước khi xóa" hint="Tắt = xóa ngay không hỏi"><Toggle label="Hỏi xóa" checked={beh.confirmDelete} onChange={(v) => onChange(["behavior", "confirmDelete"], v)} /></Field>
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
export function NotificationsSection({ settings, onChange }) {
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
      <Field label="Nhắc đọc sách hằng ngày" hint="Gợi ý giữ thói quen đọc đều — báo riêng với nhắc nhiệm vụ">
        <Toggle label="Nhắc đọc" checked={!!n.readReminder} onChange={(v) => { onChange(["notifications", "readReminder"], v); setTimeout(() => { try { refreshNotificationTimer(loadSettings()); } catch {} }, 50); }} />
      </Field>
      {n.readReminder && <Field label="Giờ nhắc đọc"><input type="time" className={inp} value={n.readTime || "20:00"} onChange={(e) => { const v = e.target.value; if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)) { onChange(["notifications", "readTime"], v); setTimeout(() => { try { refreshNotificationTimer(loadSettings()); } catch {} }, 50); } }} /></Field>}
      <div className="st-btn-row">
        <button className="st-btn st-btn-ghost st-btn-sm" onClick={ask}>Xin quyền ({perm})</button>
        <button className="st-btn st-btn-primary st-btn-sm" disabled={testing} onClick={sendTest}>{testing ? "Đang gửi…" : "Gửi thử"}</button>
      </div>
    </Card>
  );
}

/* ── Phím tắt (giữ logic cũ, bọc Card mới) ─────────────────────────────── */
export function KeyboardSection() {
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

/* ── Tính năng: bật/tắt module toàn app ─────────────────────────────── */
export function FeaturesSection({ settings, onPatch }) {
  const disabled = Array.isArray(settings.features?.disabled) ? settings.features.disabled : [];
  const total = OPTIONAL_VIEW_IDS.length;
  const activeCount = total - disabled.filter((id) => OPTIONAL_VIEW_IDS.includes(id)).length;
  const setEnabled = (id, on) => {
    const next = on ? disabled.filter((x) => x !== id) : [...new Set([...disabled, id])];
    onPatch("features", { disabled: next });
  };
  const setAll = (on) => onPatch("features", { disabled: on ? [] : [...OPTIONAL_VIEW_IDS] });
  const labelOf = (id) => NAV_VIEWS[id]?.label || id;
  return (
    <Card id="sec-features" title="Tính năng — Bật/tắt module" desc="Tắt module là ẨN KHỎI TOÀN BỘ app: không hiện ở thanh điều hướng, không hiện ở Bảng điều khiển, đang mở thì tự về Tổng quan. Dữ liệu của module không bị xóa." icon={<Blocks size={15} />}>
      <div className="st-kv"><span>Đang bật</span><b>{activeCount}/{total} module</b></div>
      <div className="st-btn-row">
        <button className="st-btn st-btn-primary st-btn-sm" onClick={() => setAll(true)}>Bật tất cả</button>
        <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => setAll(false)}>Chỉ giữ cốt lõi</button>
      </div>
      {FEATURE_GROUPS.map((g) => (
        <div key={g.title} className="st-kbd-group" style={{ marginTop: 10 }}>
          <div className="st-kbd-head"><b>{g.title}</b><span>{g.ids.filter((id) => !disabled.includes(id)).length}/{g.ids.length}</span></div>
          {g.ids.map((id) => (
            <div key={id} className="st-kbd-row">
              <div className="st-kbd-info"><b>{labelOf(id)}</b><small>{FEATURE_DESCS[id] || ""}</small></div>
              <div className="st-kbd-keys"><i className={`st-chip ${disabled.includes(id) ? "danger" : "ok"}`}>{disabled.includes(id) ? "Tắt" : "Bật"}</i></div>
              <div className="st-kbd-btns">
                <Toggle label={labelOf(id)} checked={!disabled.includes(id)} onChange={(v) => setEnabled(id, v)} />
              </div>
            </div>
          ))}
        </div>
      ))}
      <p className="st-muted" style={{ marginTop: 10 }}>Cốt lõi luôn bật: Tổng quan · Thư viện · Tiếp tục đọc · Đánh dấu · Giáo án · Tìm kiếm · Nhiệm vụ (việc cần làm) · Trợ giúp.</p>
    </Card>
  );
}

/* ── Trợ năng ─────────────────────────────── */
export function AccessibilitySection({ settings, onChange, onClose }) {
  const a = settings.accessibility || {};
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState(null); // { at, results }
  const [auditMsg, setAuditMsg] = useState("");
  const [sysNote, setSysNote] = useState("");

  // Trạng thái hệ thống hiện tại — hiển thị sống để Thầy/cô biết "theo máy" đang nghĩa là gì
  useEffect(() => {
    if (a.followSystem === false) { setSysNote(""); return; }
    try {
      const c = window.matchMedia("(prefers-contrast: more)").matches;
      const m = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setSysNote(c || m
        ? `Máy đang yêu cầu: ${[c && "tương phản cao", m && "giảm chuyển động"].filter(Boolean).join(" · ")} — app đang tự làm theo.`
        : "Máy chưa yêu cầu gì đặc biệt — app sẽ tự theo ngay khi hệ thống đổi.");
    } catch { setSysNote(""); }
  }, [a.followSystem]);

  const doAudit = () => {
    try {
      const results = runA11yAudit();
      const bad = results.filter((r) => r.count > 0).length;
      setAudit({ at: nowTime(), results });
      setAuditMsg(bad ? `Phát hiện ${bad} nhóm vấn đề.` : "Tuyệt vời — không phát hiện vấn đề phổ biến.");
    } catch (e) { setAuditMsg("Không quét được trang: " + (e?.message || "")); }
  };
  const toggleAudit = () => {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next && !audit) doAudit();
  };
  const gotoIssue = (el) => {
    if (!el || !el.isConnected) { setAuditMsg("Phần tử lỗi đã biến mất — hãy Quét lại."); return; }
    onClose?.(); // đóng Cài đặt để lộ đúng vị trí lỗi phía sau
    setTimeout(() => {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("a11y-flash");
        setTimeout(() => { try { el.classList.remove("a11y-flash"); } catch {} }, 2400);
      } catch {}
    }, 380);
  };

  return (
    <>
      <Card id="sec-a11y" title="Khả năng tiếp cận" desc="Đổi là app đổi ngay: tương phản, chữ, đọc dễ, phản hồi — có cả công cụ kiểm tra." icon={<Accessibility size={15} />}>
        <Field label="Theo cài đặt hệ thống" hint="Máy yêu cầu gì app tự làm theo — vẫn cộng khi Thầy/cô bật tay">
          <Toggle label="Theo hệ thống" checked={a.followSystem !== false} onChange={(v) => onChange(["accessibility", "followSystem"], v)} />
        </Field>
        {sysNote && <p className="st-note ok" role="status">{sysNote}</p>}
        <Field label="Tương phản cao" hint="Chữ đậm, viền rõ, bỏ đổ bóng"><Toggle label="HC" checked={!!a.highContrast} onChange={(v) => onChange(["accessibility", "highContrast"], v)} /></Field>
        <Field label="Chữ lớn hơn" hint="+~12% toàn app"><Toggle label="LT" checked={!!a.largerText} onChange={(v) => onChange(["accessibility", "largerText"], v)} /></Field>
        <Field label="Giãn chữ & giãn dòng" hint="Khoảng cách rộng hơn — dễ theo dõi khi đọc lâu"><Toggle label="Giãn chữ" checked={!!a.wideSpacing} onChange={(v) => onChange(["accessibility", "wideSpacing"], v)} /></Field>
        <Field label="Giảm chuyển động" hint="Tắt animation bay nhảy"><Toggle label="RM" checked={!!a.reduceMotion} onChange={(v) => onChange(["accessibility", "reduceMotion"], v)} /></Field>
        <Field label="Tắt chớp nhấp nháy" hint="Dừng vòng lặp gọi sự chú ý (spinner tải vẫn giữ)"><Toggle label="Chống chớp" checked={!!a.preventFlashing} onChange={(v) => onChange(["accessibility", "preventFlashing"], v)} /></Field>
        <Field label="Viền focus rõ" hint="Đi phím Tab thấy ô đang chọn"><Toggle label="FI" checked={!!a.focusIndicators} onChange={(v) => onChange(["accessibility", "focusIndicators"], v)} /></Field>
        <Field label="Gạch chân liên kết" hint="Nhận ra link không chỉ bằng màu (WCAG 1.4.1)"><Toggle label="Gạch chân" checked={!!a.underlineLinks} onChange={(v) => onChange(["accessibility", "underlineLinks"], v)} /></Field>
        <Field label="Thanh đọc theo con trỏ" hint="Vệt sáng chạy theo chuột — dễ theo dõi dòng"><Toggle label="Thanh đọc" checked={!!a.readingRuler} onChange={(v) => onChange(["accessibility", "readingRuler"], v)} /></Field>
        <Field label="Hiệu ứng lật trang 3D" hint="Tắt để chuyển trang thông thường trong BookReader"><Toggle label="Lật trang 3D" checked={a.pageFlip3D !== false} onChange={(v) => onChange(["accessibility", "pageFlip3D"], v)} /></Field>
        <Field label="Chớp viền khi có thông báo" hint="Thấy toast dù không nghe được âm thanh"><Toggle label="Báo động" checked={!!a.visualAlerts} onChange={(v) => onChange(["accessibility", "visualAlerts"], v)} /></Field>
      </Card>

      <Card id="sec-a11y-tools" title="Kiểm tra nhanh trợ năng" desc="Quét trang đang mở: ảnh thiếu mô tả, nút không tên, ô nhập thiếu nhãn…" icon={<Eye size={15} />}>
        <button type="button" className={`fb-toggle ${auditOpen ? "open" : ""}`} aria-expanded={auditOpen} aria-controls="a11y-audit" onClick={toggleAudit}>
          <span className="fb-toggle-ic"><Accessibility size={16} /></span>
          <span className="fb-toggle-tx">
            <b>Quét 6 nhóm vấn đề phổ biến</b>
            <small>Ảnh · nút · ô nhập · tabindex · id trùng · lang — bấm để chạy ngay</small>
          </span>
          <ChevronDown size={16} className="fb-chevron" />
        </button>
        <div id="a11y-audit" className={`fb-panel ${auditOpen ? "open" : ""}`} hidden={!auditOpen}>
          {audit ? (
            <>
              <p className={`st-note ${auditMsg.startsWith("Tuyệt vời") ? "ok" : "err"}`} role="status">{auditMsg} <em>(quét lúc {audit.at})</em></p>
              <ul className="st-diag">
                {audit.results.map((r) => (
                  <li key={r.key}>
                    <span>
                      {r.label}
                      {r.count > 0 && r.fix && <small className="st-muted"> — {r.fix}</small>}
                      {r.count > 0 && r.sample && (
                        <button type="button" className="a11y-jump" onClick={() => gotoIssue(r.sample)}>Đến chỗ</button>
                      )}
                    </span>
                    <b>{r.count > 0 ? `⚠ ${r.count}` : "✓"}</b>
                  </li>
                ))}
              </ul>
              <div className="st-btn-row">
                <button className="st-btn st-btn-ghost st-btn-sm" onClick={doAudit}>Quét lại</button>
              </div>
              <p className="st-muted">Quét trang đang mở (kể cả bảng Cài đặt). Bấm "Đến chỗ" sẽ tạm đóng bảng để chỉ đúng vị trí lỗi. Quét nhanh không thay được công cụ kiểm thử chuyên sâu.</p>
            </>
          ) : (
            <p className="st-muted" role="status">Đang quét…</p>
          )}
        </div>
      </Card>
    </>
  );
}

/* ── Riêng tư (mới: điều khiển thật) ─────────────────────────────── */
export function PrivacySection({ settings, onChange }) {
  const p = settings.privacy || {};
  const [busy, setBusy] = useState("");
  const clearHistory = () => {
    if (!confirm("Xóa lịch sử mở sách & thống kê lượt mở? (Không xóa sách)")) return;
    try { safeRemove("sgk_history"); safeRemove("sgk_counts"); } catch {}
    try { appEvents.emit(AppEvents.DATA_UPDATED, { source: "privacy-clear-history" }); } catch {}
    alert("Đã xóa lịch sử.");
  };
  const clearAi = () => {
    if (!confirm("Xóa toàn bộ lịch sử trò chuyện với Trợ lý AI? (Không ảnh hưởng ghi chú/đánh dấu trong sách)")) return;
    const n = clearAiChatHistory();
    alert(`Đã xóa ${n} mục lịch sử AI.`);
  };
  const clearSearches = () => {
    clearRecentSearchHistory();
    alert("Đã xóa lịch sử tìm kiếm gần đây.");
  };
  const clearScans = async () => {
    if (!confirm("Xóa toàn bộ Scan SGK (thông tin + ảnh crop)? Không thể hoàn tác.")) return;
    setBusy("scan");
    try {
      const n = await clearScanHistory();
      alert(`Đã xóa ${n} scan.`);
    } finally { setBusy(""); }
  };
  return (
    <div>
      <Card id="sec-privacy" title="Quyền riêng tư" desc="App local-first: sách & cài đặt nằm trên máy · AI chỉ gửi trang đang chọn." icon={<Shield size={15} />}>
        <Field label="Ghi nhớ lịch sử mở sách" hint="Tắt = không lưu sách đã mở"><Toggle label="Hist" checked={p.rememberHistory !== false} onChange={(v) => { onChange(["privacy", "rememberHistory"], v); if (!v) { try { safeRemove("sgk_history"); safeRemove("sgk_counts"); } catch {} } }} /></Field>
        <div className="st-btn-row"><button className="st-btn st-btn-danger-ghost st-btn-sm" onClick={clearHistory}>Xóa lịch sử mở sách</button></div>
      </Card>
      <Card id="sec-privacy-data" title="Quản lý dữ liệu" desc="Xóa có chọn lọc từng loại dữ liệu nhạy cảm — mỗi mục xóa có xác nhận riêng, không đụng tới sách & cài đặt." icon={<Trash2 size={15} />}>
        <div className="st-btn-row">
          <button className="st-btn st-btn-danger-ghost st-btn-sm" onClick={clearAi}>Xóa lịch sử AI</button>
          <button className="st-btn st-btn-danger-ghost st-btn-sm" onClick={clearSearches}>Xóa tìm kiếm gần đây</button>
          <button className="st-btn st-btn-danger-ghost st-btn-sm" disabled={busy === "scan"} onClick={clearScans}>{busy === "scan" ? "Đang xóa…" : "Xóa toàn bộ Scan"}</button>
        </div>
        <p className="st-muted" style={{ marginTop: 8 }}>Lịch sử AI = hội thoại Trợ lý nổi + nhật ký phân tích ảnh. Cache tìm kiếm/OCR có thể tự dựng lại khi cần.</p>
      </Card>
    </div>
  );
}

/* ── Nâng cao ─────────────────────────────── */
export function AdvancedSection({ settings, onChange }) {
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
    return res;
  };
  const downloadReport = async () => {
    try {
      const checks = diag || (await runDiag());
      const report = {
        app: "sgk-app",
        generatedAt: new Date().toISOString(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
        checks,
        storage: getStorageBreakdown(),
        config: {
          theme: settings.appearance?.theme || "system",
          accent: settings.appearance?.accentColor || settings.appearance?.accent || "",
          density: settings.appearance?.density || "",
          modulesDisabled: Array.isArray(settings.features?.disabled) ? settings.features.disabled : [],
          dashboardBlocksOff: Object.entries(settings.dashboard || {}).filter(([, v]) => v === false).map(([k]) => k),
        },
      };
      dl(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "sgk-bao-cao-chan-doan");
    } catch (e) { alert("Không tạo được báo cáo: " + (e?.message || "")); }
  };
  return (
    <div>
      <Card id="sec-perf" title="Gỡ lỗi" desc="Bật log chi tiết luồng gọi AI (retry, timeout) trong Console." icon={<Timer size={15} />}>
        <Field label="Chế độ gỡ lỗi" hint="Khi bật, mở Console (F12) để xem log chi tiết mỗi lần gọi AI"><Toggle label="Debug" checked={!!adv.debugMode} onChange={(v) => onChange(["advanced", "debugMode"], v)} /></Field>
      </Card>
      <Card id="sec-diag" title="Chẩn đoán" desc="Kiểm tra nhanh backend, key, engine — có thể tải thành file .json để gửi kèm khi cần hỗ trợ." icon={<Zap size={15} />}>
        <p className="st-muted">Phiên bản 0.0.0 · Schema 2 · Local-first</p>
        <div className="st-btn-row">
          <button className="st-btn st-btn-ghost st-btn-sm" onClick={runDiag}>Chạy chẩn đoán</button>
          <button className="st-btn st-btn-ghost st-btn-sm" onClick={downloadReport}><Download size={13} /> Tải báo cáo (.json)</button>
        </div>
        {diag && <ul className="st-diag">{Object.entries(diag).map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>}
      </Card>
    </div>
  );
}

/* ── Góp ý cho nhà phát triển (Cài đặt → Giới thiệu) ─────────────── */
