// ── Settings Store ── canonical sgk_settings
// Color system: theme -> accent selection -> 9-scale generation -> semantic mapping -> CSS variables
// + Central behavior hub: mọi cài đặt đều điều khiển app thật qua applySettings + helpers.
import { ACCENT_PALETTES, generateAccentScale, accentSemanticsFromScale } from "./designTokens.js";
import { safeGetJSON, safeGetString, safeSetJSON, safeSetString, safeRemove, listKeys } from "./safeStorage.js";
import { STORAGE_KEYS, isCacheKey as isCacheKeyCore } from "./core/storageKeys.js";
import { normalizeModel } from "./apiConfig.js";

export const SETTINGS_KEY = STORAGE_KEYS.SETTINGS;

export const DEFAULT_SETTINGS = {
  version: 1,
  general: {
    displayName: "",
    weekStart: 1,
    startPage: "dashboard",
    timezone: "auto",
    lastView: "dashboard",
  },
  appearance: {
    theme: "system", // light|dark|system
    accent: "blue", // blue|purple|green|orange|red|teal
    accentMode: "preset", // preset|custom
    accentColor: "#2563EB",
    density: "comfortable",
    radius: "medium",
    shadow: "subtle",
    fontSize: "default",
    fontFamily: "quicksand",
    animation: "on",
    sidebar: "auto",
  },
  reading: {
    defaultZoom: 1.2,
    layout: "twoPage",
    showTOC: true,
    rememberLastPage: true,
    autoSaveProgress: true,
  },
  editor: {
    defaultFontFamily: "inherit",
    defaultFontSize: "15px",
    defaultLineHeight: "1.7",
    showRuler: true,
    defaultZoom: 100,
    autoSaveWordDraft: true,
    spellCheck: true,
  },
  missions: {
    enabled: true,
    dailyCount: 3,
    difficulty: "normal",
    focus: "balanced",
    bonusEnabled: true,
    weeklyGoalsEnabled: true,
    monthlyChallengeEnabled: true,
    streakEnabled: true,
    minMissionsForStreak: 1,
    xpEnabled: true,
    achievementsEnabled: true,
    showCardOnDashboard: true,
    autoGenerate: true,
  },
  ai: {
    model: "gemini-2.5-flash",
    temperature: 0.7,
    effort: "balanced",
    responseLength: "balanced",
  },
  notifications: {
    dailyReminder: false,
    dailyTime: "08:00",
  },
  accessibility: {
    highContrast: false,
    largerText: false,
    reduceMotion: false,
    focusIndicators: true,
  },
  export: {
    includeTimestamp: true,
  },
  backup: {
    autoBackup: true,
    autoBackupFrequency: "weekly",
    keepBackups: 4,
    lastBackupTime: null,
  },
  behavior: {
    confirmDelete: true,
    autoSave: true,
    autoSaveDelay: 1000,
    showNotifications: true,
    soundEnabled: false,
    soundVolume: 0.35,
    soundProfile: "minimal",
    vibrateEnabled: false,
  },
  search: {
    defaultType: "all",
    caseSensitive: false,
    wholeWord: false,
    fuzzyMatch: true,
    maxResults: 100,
  },
  library: {
    viewMode: "grid",
    sortBy: "modified",
    showPreviews: true,
    groupBySubject: true,
    // Mặc định TẮT: auto-index tự tải toàn bộ PDF trong thư viện (~1,4 GB)
    // mỗi lần mở app trên trình duyệt mới. Bật lại trong Cài đặt → Thư viện.
    autoIndexNewBooks: false,
  },
  whiteboard: {
    grid: true,
    snap: false,
    smartAlign: true,
    smartSpacing: true,
    branchDrag: true,
    autoSave: true,
    autoSaveDelay: 900,
    defaultPenColor: "#1d4ed8",
    defaultPenWidth: 3,
    soundEffects: true,
  },
  data: { cachedBooks: 0, indexedBooks: 0, indexedSize: 0 },
  advanced: {
    // Chỉ giữ debugMode — đã nối thật với log chi tiết của aiService + data-debug.
    // Các khóa cũ (lazyLoading/prefetch/pdfQuality/cachePDFs/cacheTimeout/
    // enableOfflineMode/enableAnalytics) không nơi nào đọc → bỏ, migrate dọn.
    debugMode: false,
  },
  keyboard: { shortcuts: {} },
  privacy: {
    // Chỉ giữ rememberHistory (đã có UI). localOnly/sendCrashReports không nơi
    // nào đọc, không có toggle → bỏ, migrate dọn khỏi storage.
    rememberHistory: true,
  },
};

// Legacy single-hex map kept for migration only
const LEGACY_ACCENT_MAP = {
  blue: "#2563EB",
  purple: "#7C3AED",
  green: "#16A34A",
  orange: "#D97706",
  red: "#DC2626",
  teal: "#0891B2",
};

function deepMerge(target, src) {
  const out = { ...target };
  for (const k of Object.keys(src || {})) {
    if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) && target[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], src[k]);
    } else out[k] = src[k];
  }
  return out;
}

// deepMerge trả object lồng sâu vẫn CHỈ CHO THAM CHIẾU tới DEFAULT_SETTINGS cho các
// section thiếu trong storage — migrate*() ghi tại chỗ sẽ làm bẩn default cả phiên.
// Clone trước khi merge để không bao giờ dùng chung ref.
const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

function migrateAppearance(appearance) {
  if (!appearance) return;
  if (appearance.accent && !appearance.accentMode) appearance.accentMode = "preset";
  if (!appearance.accentColor) {
    const hex = LEGACY_ACCENT_MAP[appearance.accent] || "#2563EB";
    appearance.accentColor = hex;
  }
  if (!appearance.theme) appearance.theme = "system";
  if (appearance.accentMode !== "preset" && appearance.accentMode !== "custom") appearance.accentMode = "preset";
  if (!appearance.sidebar) appearance.sidebar = "auto";
  if (!appearance.density) appearance.density = "comfortable";
}

function migrateBehavior(behavior) {
  if (!behavior || typeof behavior !== "object") return;
  if (!Number.isFinite(behavior.soundVolume)) behavior.soundVolume = 0.35;
  behavior.soundVolume = Math.max(0, Math.min(1, Number(behavior.soundVolume)));
  if (behavior.soundProfile !== "minimal" && behavior.soundProfile !== "standard") behavior.soundProfile = "minimal";
  if (typeof behavior.soundEnabled !== "boolean") behavior.soundEnabled = false;
  if (typeof behavior.confirmDelete !== "boolean") behavior.confirmDelete = true;
  if (typeof behavior.autoSave !== "boolean") behavior.autoSave = true;
  if (!Number.isFinite(behavior.autoSaveDelay)) behavior.autoSaveDelay = 1000;
  if (typeof behavior.showNotifications !== "boolean") behavior.showNotifications = true;
  if (typeof behavior.vibrateEnabled !== "boolean") behavior.vibrateEnabled = false;
  // Mục cũ: không luồng xuất nào gọi shouldConfirmExport() → toggle vô hiệu, gỡ khỏi UI
  delete behavior.confirmExport;
}

function migrateNotifications(notifications) {
  if (!notifications || typeof notifications !== "object") return;
  // Cả 2 khóa chỉ nằm trong getNotificationConfig() — timer nhắc hằng ngày
  // (refreshNotificationTimer) không đọc → toggle không có tác dụng, gỡ khỏi UI.
  delete notifications.streakReminder;
  delete notifications.achievementUnlocked;
}

function migrateReading(reading) {
  if (!reading || typeof reading !== "object") return;
  const v = Number(reading.defaultZoom);
  if (!Number.isFinite(v)) reading.defaultZoom = DEFAULT_SETTINGS.reading.defaultZoom;
  else reading.defaultZoom = Math.min(3.2, Math.max(0.25, v));
}

function migrateGeneral(general) {
  if (!general || typeof general !== "object") return;
  if (general.weekStart !== 0 && general.weekStart !== 1) general.weekStart = 1;
  const validPages = ["dashboard", "library", "search", "lessonplans", "tasks", "last"];
  if (!validPages.includes(general.startPage)) general.startPage = "dashboard";
  if (typeof general.displayName !== "string") general.displayName = "";
  if (!general.timezone) general.timezone = "auto";
  if (typeof general.lastView !== "string" || !general.lastView) general.lastView = "dashboard";
  // Mục cũ: app 1 ngôn ngữ (Tiếng Việt), không có i18n → không nơi nào đọc
  delete general.language;
}

function migratePrivacy(privacy) {
  if (!privacy || typeof privacy !== "object") return;
  if (typeof privacy.rememberHistory !== "boolean") privacy.rememberHistory = true;
  // Mục cũ: app không có analytics/không gửi crash report, không nơi nào đọc → dọn khỏi storage
  delete privacy.allowAnalytics;
  delete privacy.localOnly;
  delete privacy.sendCrashReports;
}

function migrateSearch(search) {
  if (!search || typeof search !== "object") return;
  if (!Number.isFinite(search.maxResults)) search.maxResults = 100;
  search.maxResults = Math.max(10, Math.min(1000, Number(search.maxResults)));
  // Legacy defaultType (books/lessonplans/...) → nhóm kết quả SearchView hiện tại
  const valid = ["all", "content", "toc", "notes"];
  if (!valid.includes(search.defaultType)) {
    search.defaultType = search.defaultType === "books" ? "content" : "all";
  }
}

// Storage hỏng/cũ có thể để section = null (deepMerge ghi đè thẳng) → khôi phục default
function ensureSections(merged) {
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const def = DEFAULT_SETTINGS[k];
    if (!def || typeof def !== "object" || Array.isArray(def)) continue;
    if (!merged[k] || typeof merged[k] !== "object" || Array.isArray(merged[k])) {
      merged[k] = JSON.parse(JSON.stringify(def));
    }
  }
}

// AI: model retired (1.5/2.0) trả 404 → ép về model đang hỗ trợ
function migrateAI(ai) {
  if (!ai || typeof ai !== "object") return;
  ai.model = normalizeModel(ai.model);
  if (!Number.isFinite(ai.temperature)) ai.temperature = 0.7;
  else ai.temperature = Math.min(1, Math.max(0, Number(ai.temperature)));
  if (typeof ai.responseLength !== "string") ai.responseLength = "balanced";
  if (typeof ai.effort !== "string") ai.effort = "balanced";
  // Mục cũ: không nơi nào đọc, không có trong UI → dọn khỏi storage
  delete ai.language;
  delete ai.behavior;
}

// Nâng cao: chỉ debugMode còn được đọc (aiService + data-debug) → dọn khóa cũ
function migrateAdvanced(advanced) {
  if (!advanced || typeof advanced !== "object") return;
  if (typeof advanced.debugMode !== "boolean") advanced.debugMode = false;
  for (const k of ["lazyLoading", "prefetch", "pdfQuality", "cachePDFs", "cacheTimeout", "enableOfflineMode", "enableAnalytics"]) {
    delete advanced[k];
  }
}

// Xuất: chỉ includeTimestamp còn được đọc (exportDoc) → dọn khóa cũ
function migrateExport(exp) {
  if (!exp || typeof exp !== "object") return;
  if (typeof exp.includeTimestamp !== "boolean") exp.includeTimestamp = true;
  for (const k of ["format", "includeMeta", "autoZip"]) delete exp[k];
}

export function loadSettings() {
  try {
    const parsed = safeGetJSON(SETTINGS_KEY, null);
    const base = cloneDefaults();
    if (!parsed) {
      const legacy = {};
      const theme = safeGetString(STORAGE_KEYS.THEME, null);
      if (theme) legacy.appearance = { theme };
      const merged = deepMerge(base, legacy);
      ensureSections(merged);
      migrateAppearance(merged.appearance);
      migrateBehavior(merged.behavior);
      migrateNotifications(merged.notifications);
      migrateReading(merged.reading);
      migrateGeneral(merged.general);
      migratePrivacy(merged.privacy);
      migrateSearch(merged.search);
      migrateAI(merged.ai);
      migrateAdvanced(merged.advanced);
      migrateExport(merged.export);
      return merged;
    }
    if (!parsed || typeof parsed !== "object") return base;
    const merged = deepMerge(base, parsed);
    ensureSections(merged);
    migrateAppearance(merged.appearance);
    migrateBehavior(merged.behavior);
    migrateNotifications(merged.notifications);
    migrateReading(merged.reading);
    migrateGeneral(merged.general);
    migratePrivacy(merged.privacy);
    migrateSearch(merged.search);
    migrateAI(merged.ai);
    migrateAdvanced(merged.advanced);
    migrateExport(merged.export);
    merged.version = DEFAULT_SETTINGS.version;
    return merged;
  } catch {
    return cloneDefaults();
  }
}

function isCacheKeyForSettings(key) {
  try { return isCacheKeyCore(key); } catch { return false; }
}

export function saveSettings(settings) {
  const r = safeSetJSON(SETTINGS_KEY, settings);
  if (r.ok) {
    try {
      const r2 = safeSetString(STORAGE_KEYS.THEME, settings.appearance.theme);
      if (!r2.ok && r2.quota) console.warn("[safeStorage] QuotaExceededError on sgk_theme", r2.message);
      else if (!r2.ok) console.warn("[settingsStore] safeSetString failed sgk_theme", r2.message);
    } catch (e2) { console.warn("[settingsStore] safeSetString exception sgk_theme", e2); }
    return true;
  }
  console.error("saveSettings fail", r.error, r.message);
  if (r.quota) {
    try {
      const cacheKeys = listKeys().filter(k => k && isCacheKeyForSettings(k));
      if (cacheKeys.length) {
        cacheKeys.slice(0, Math.max(1, Math.floor(cacheKeys.length / 2))).forEach((k) => { const rr = safeRemove(k); if (!rr.ok) console.warn("[settingsStore] remove cache failed", k, rr.error); });
        const r2 = safeSetJSON(SETTINGS_KEY, settings);
        if (r2.ok) {
          try {
            const r3 = safeSetString(STORAGE_KEYS.THEME, settings.appearance.theme);
            if (!r3.ok && r3.quota) console.warn("[safeStorage] QuotaExceededError on sgk_theme retry", r3.message);
          } catch (e2) { console.warn("[settingsStore] safeSetString retry exception sgk_theme", e2); }
          console.warn(`saveSettings: recovered from quota by clearing ${cacheKeys.length} cache keys`);
          return true;
        }
        console.error("saveSettings retry after cache eviction failed:", r2.error);
      }
    } catch (retryErr) {
      console.error("saveSettings retry after cache eviction failed:", retryErr);
    }
  }
  return false;
}

import { appEvents as _busSettings, AppEvents as _EventsSettings } from "./core/appEvents.js";
export function updateSettings(patch) {
  const cur = loadSettings();
  const next = deepMerge(cur, patch);
  saveSettings(next);
  applySettings(next);
  try { _busSettings.emit(_EventsSettings.SETTINGS_UPDATED, next); } catch {}
  return next;
}

export function dispatchSettingsUpdated(settings) {
  try { _busSettings.emit(_EventsSettings.SETTINGS_UPDATED, settings); } catch {}
  try { refreshNotificationTimer(settings); } catch {}
}

/** Đăng ký lắng nghe settings ở mọi component — tự cleanup. */
export function subscribeSettings(listener) {
  // Chỉ cần bus: emit() đã dispatch window event cho legacy listener,
  // và window→direct bridge đảm bảo dispatch cũ cũng tới listener (tránh fire 2 lần).
  const wrapped = (detail) => {
    try { listener(detail && typeof detail === "object" && Object.keys(detail).length ? detail : loadSettings()); } catch {}
  };
  try { return _busSettings.on(_EventsSettings.SETTINGS_UPDATED, wrapped); } catch { return () => {}; }
}

export function resetSection(sectionKey) {
  const cur = loadSettings();
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, sectionKey)) return cur;
  cur[sectionKey] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[sectionKey]));
  saveSettings(cur);
  applySettings(cur);
  dispatchSettingsUpdated(cur);
  return cur;
}
export function resetAllSettings() {
  const next = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  saveSettings(next);
  applySettings(next);
  dispatchSettingsUpdated(next);
  return next;
}

// ── Behavior helpers: mọi tính năng settings điều khiển app thật qua các hàm này ──
export function getWeekStart(settings) {
  try { const s = settings || loadSettings(); return s.general?.weekStart === 0 ? 0 : 1; } catch { return 1; }
}
export function getStartPage(settings) {
  try {
    const s = settings || loadSettings();
    if (s.general?.startPage === "last") return s.general?.lastView || "dashboard";
    return s.general?.startPage || "dashboard";
  } catch { return "dashboard"; }
}
export function recordLastView(viewId) {
  try {
    if (!viewId || typeof viewId !== "string") return;
    const cur = loadSettings();
    if (cur.general.lastView === viewId) return;
    cur.general.lastView = viewId;
    saveSettings(cur);
  } catch {}
}
export function shouldConfirmDelete(settings) {
  try { const s = settings || loadSettings(); return s.behavior?.confirmDelete !== false; } catch { return true; }
}
export function isAutoSaveEnabled(settings) {
  try { const s = settings || loadSettings(); return s.behavior?.autoSave !== false; } catch { return true; }
}
export function getAutoSaveDelay(settings) {
  try {
    const s = settings || loadSettings();
    const v = Number(s.behavior?.autoSaveDelay);
    if (!Number.isFinite(v)) return 1000;
    return Math.max(300, Math.min(5000, v));
  } catch { return 1000; }
}
export function shouldShowNotifications(settings) {
  try { const s = settings || loadSettings(); return s.behavior?.showNotifications !== false; } catch { return true; }
}
/** Rung phản hồi — tôn trọng behavior.vibrateEnabled, an toàn mọi trình duyệt. */
export function vibrateFeedback(pattern = 12) {
  try {
    const s = loadSettings();
    if (s.behavior?.vibrateEnabled !== true) return false;
    if (!("vibrate" in navigator)) return false;
    return navigator.vibrate(pattern);
  } catch { return false; }
}
export function getSearchConfig(settings) {
  try {
    const s = settings || loadSettings();
    const c = s.search || {};
    return {
      defaultType: c.defaultType || "all",
      caseSensitive: c.caseSensitive === true,
      wholeWord: c.wholeWord === true,
      fuzzyMatch: c.fuzzyMatch !== false,
      maxResults: Math.max(10, Math.min(1000, Number(c.maxResults) || 100)),
    };
  } catch { return { defaultType: "all", caseSensitive: false, wholeWord: false, fuzzyMatch: true, maxResults: 100 }; }
}
/** Áp dụng search config vào query — dùng chung cho SearchView/GlobalSearch.
 *  cfg truyền sẵn để không loadSettings() cho từng item (tìm kiếm quét hàng trăm phần tử). */
export function applySearchConfig(query, text, cfg) {
  try {
    const c = cfg || getSearchConfig();
    let q = String(query || "");
    let hay = String(text || "");
    if (!q) return false;
    if (!c.caseSensitive) { q = q.toLowerCase(); hay = hay.toLowerCase(); }
    // Chuẩn hoá tiếng Việt khi fuzzy (mặc định bật): không dấu — "sach" khớp "Sách"
    if (c.fuzzyMatch) {
      const norm = (s) => s.replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      q = norm(q); hay = norm(hay);
    }
    if (!q) return false;
    if (c.wholeWord) {
      // Cả từ: ranh giới phi-word; caseSensitive=true thì không thêm cờ i
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\W)${esc}(\\W|$)`, c.caseSensitive ? "" : "i").test(hay);
    }
    return hay.includes(q);
  } catch {
    return false;
  }
}
export function getLibraryConfig(settings) {
  try {
    const s = settings || loadSettings();
    return {
      viewMode: s.library?.viewMode || "grid",
      sortBy: s.library?.sortBy || "modified",
      showPreviews: s.library?.showPreviews !== false,
      groupBySubject: s.library?.groupBySubject !== false,
      autoIndexNewBooks: s.library?.autoIndexNewBooks === true,
    };
  } catch { return { viewMode: "grid", sortBy: "modified", showPreviews: true, groupBySubject: true, autoIndexNewBooks: false }; }
}
// Đã xóa getExportConfig/getAdvancedConfig/isAnalyticsAllowed: 0 nơi gọi,
// phục vụ các toggle không có tác dụng thật (giờ đã gỡ khỏi UI).
export function getNotificationConfig(settings) {
  try {
    const s = settings || loadSettings();
    return {
      dailyReminder: s.notifications?.dailyReminder === true,
      dailyTime: /^\d{2}:\d{2}$/.test(s.notifications?.dailyTime || "") ? s.notifications.dailyTime : "08:00",
    };
  } catch { return { dailyReminder: false, dailyTime: "08:00" }; }
}

// ── Notifications: lập lịch nhắc hằng ngày local-only ──
let _notifTimer = null;
export function refreshNotificationTimer(settings) {
  try {
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
    const cfg = getNotificationConfig(settings);
    if (!cfg.dailyReminder) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const [hh, mm] = cfg.dailyTime.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hh || 8, mm || 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = Math.min(next.getTime() - now.getTime(), 24 * 3600 * 1000);
    _notifTimer = setTimeout(() => {
      try {
        const s = loadSettings();
        if (s.notifications?.dailyReminder && shouldShowNotifications(s)) {
          new Notification("Hành trang Tiểu học", { body: "Đến giờ nhiệm vụ ngày mới — mở app để giữ streak nhé!" });
        }
      } catch {}
      refreshNotificationTimer(loadSettings());
    }, delay);
  } catch {}
}
export async function testNotification() {
  try {
    if (!("Notification" in window)) return { ok: false, msg: "Trình duyệt không hỗ trợ Notification" };
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return { ok: false, msg: "Chưa được cấp quyền thông báo" };
    new Notification("Hành trang Tiểu học", { body: "Thông báo thử — cài đặt đang hoạt động tốt!" });
    return { ok: true, msg: "Đã gửi thông báo thử" };
  } catch (e) { return { ok: false, msg: e?.message || "Không gửi được thông báo" }; }
}

// ── Backup: xuất / nhập / dung lượng ──
export function serializeAllSettings() {
  return JSON.stringify({ app: "sgk-app", kind: "settings", version: 1, exportedAt: new Date().toISOString(), settings: loadSettings() }, null, 2);
}
export function downloadSettingsBackup() {
  try {
    const blob = new Blob([serializeAllSettings()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sgk-settings-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    const cur = loadSettings();
    cur.backup = { ...(cur.backup || {}), lastBackupTime: new Date().toISOString() };
    saveSettings(cur);
    return true;
  } catch { return false; }
}
export function parseSettingsBackup(text) {
  const data = JSON.parse(text);
  const s = data.settings || data;
  if (!s || typeof s !== "object") throw new Error("File không đúng định dạng");
  const merged = deepMerge(cloneDefaults(), s);
  // Import backup cũ (có khóa đã gỡ: export.format, advanced.*, privacy.allowAnalytics…)
  // phải đi qua migrate NGAY, không để key rác nằm chờ lần loadSettings sau.
  ensureSections(merged);
  migrateAppearance(merged.appearance);
  migrateBehavior(merged.behavior);
  migrateNotifications(merged.notifications);
  migrateReading(merged.reading);
  migrateGeneral(merged.general);
  migratePrivacy(merged.privacy);
  migrateSearch(merged.search);
  migrateAI(merged.ai);
  migrateAdvanced(merged.advanced);
  migrateExport(merged.export);
  merged.version = DEFAULT_SETTINGS.version;
  return merged;
}
export function getStorageUsage() {
  try {
    let total = 0;
    for (const k of listKeys()) {
      const v = safeGetString(k, "");
      total += (k?.length || 0) + (v?.length || 0);
    }
    return { chars: total, kb: Math.round(total / 102.4) / 10 };
  } catch { return { chars: 0, kb: 0 }; }
}

// Resolve current 9-scale: preset palettes OR custom generated
export function resolveAccentScale(appearance) {
  if (!appearance) return ACCENT_PALETTES.blue;
  if (appearance.accentMode === "custom" && appearance.accentColor) {
    return generateAccentScale(appearance.accentColor);
  }
  return ACCENT_PALETTES[appearance.accent] || ACCENT_PALETTES.blue;
}

// Detect effective dark — prefers actual data-theme attribute if already set (more reliable than media query alone)
function isDarkTheme(theme) {
  try {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
  } catch {}
  if (theme === "dark") return true;
  if (theme === "light") return false;
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

// Apply side effects — single source for color system + toàn app
export function applySettings(s) {
  if (!s) return;
  const a = s.appearance || {};
  const root = document.documentElement;

  // ── Accent: 1 color -> 9 scale -> semantic mapping ──
  const scale = resolveAccentScale(a);
  let effectiveDark;
  try {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") effectiveDark = true;
    else if (attr === "light") effectiveDark = false;
    else effectiveDark = isDarkTheme(a.theme);
  } catch {
    effectiveDark = isDarkTheme(a.theme);
  }
  const semantics = accentSemanticsFromScale(scale, effectiveDark);

  for (let i = 1; i <= 9; i++) {
    if (scale[i]) root.style.setProperty(`--color-accent-${i}`, scale[i]);
  }
  if (semantics.action) root.style.setProperty("--color-action", semantics.action);
  if (semantics.actionHover) root.style.setProperty("--color-action-hover", semantics.actionHover);
  if (semantics.actionActive) root.style.setProperty("--color-action-active", semantics.actionActive);
  if (semantics.actionSoft) root.style.setProperty("--color-action-soft", semantics.actionSoft);
  if (semantics.actionStrong) root.style.setProperty("--color-action-strong", semantics.actionStrong);
  if (semantics.focusRing) root.style.setProperty("--color-focus-ring", semantics.focusRing);
  if (semantics.selection) root.style.setProperty("--color-selection", semantics.selection);
  root.style.setProperty("--pen-blue", semantics.action || scale[6]);
  root.style.setProperty("--pen-blue-deep", semantics.actionActive || scale[8]);
  root.style.setProperty("--pen-blue-soft", semantics.actionSoft || scale[1]);
  root.style.setProperty("--primary", semantics.action || scale[6]);
  root.style.setProperty("--primary-dark", semantics.actionActive || scale[8]);
  root.style.setProperty("--primary-light", semantics.actionSoft || scale[1]);
  root.style.setProperty("--button-primary-background", semantics.action || scale[6]);

  // ── Density / radius / shadow / font ──
  const densityMap = {
    compact: { cardPad: "0.85rem", navH: "2.2rem", space: "0.75rem" },
    comfortable: { cardPad: "1.25rem", navH: "2.5rem", space: "1rem" },
    spacious: { cardPad: "1.6rem", navH: "2.8rem", space: "1.4rem" },
  };
  const dm = densityMap[a.density] || densityMap.comfortable;
  root.style.setProperty("--card-padding", dm.cardPad);
  root.style.setProperty("--nav-item-h", dm.navH);
  root.setAttribute("data-density", a.density || "comfortable");
  const radiusMap = { sharp: "2px", medium: "10px", rounded: "16px", veryRounded: "24px" };
  root.style.setProperty("--radius-md", radiusMap[a.radius] || "10px");
  root.style.setProperty("--card-radius", radiusMap[a.radius] || "16px");
  const shadowMap = {
    none: "none",
    subtle: "0 2px 4px rgba(15,23,32,0.06)",
    medium: "0 4px 12px rgba(15,23,32,0.08)",
    strong: "0 10px 25px rgba(15,23,32,0.12)",
  };
  root.style.setProperty("--card-shadow", shadowMap[a.shadow] || shadowMap.subtle);
  const fontScale = { small: "14px", default: "16px", large: "17px", xl: "18px" };
  root.style.setProperty("--base-font-size", fontScale[a.fontSize] || "16px");
  try { document.documentElement.style.fontSize = fontScale[a.fontSize] || "16px"; } catch {}
  if (a.fontSize === "small") root.style.setProperty("--text-base", "0.9rem");
  else if (a.fontSize === "large") root.style.setProperty("--text-base", "1.05rem");
  else if (a.fontSize === "xl") root.style.setProperty("--text-base", "1.12rem");
  else root.style.setProperty("--text-base", "1rem");
  const famMap = {
    system: 'system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif',
    mulish: '"Mulish", "Quicksand", "Be Vietnam Pro", "Segoe UI", Tahoma, Arial, sans-serif',
    quicksand: '"Quicksand", "Mulish", "Be Vietnam Pro", "Segoe UI", Tahoma, Arial, sans-serif',
    andika: '"Andika", "Quicksand", "Be Vietnam Pro", "Segoe UI", Tahoma, Arial, sans-serif',
  };
  const selectedFont = famMap[a.fontFamily] || famMap.system;
  root.style.setProperty("--font-body", selectedFont);
  root.style.setProperty("--font-heading", selectedFont);
  try { root.style.setProperty("font-family", selectedFont); } catch {}
  if (a.animation === "off") {
    root.style.setProperty("--transition-fast", "0ms");
    root.style.setProperty("--transition-base", "0ms");
    root.style.setProperty("--transition-slow", "0ms");
  } else if (a.animation === "reduced") {
    root.style.setProperty("--transition-fast", "80ms");
    root.style.setProperty("--transition-base", "120ms");
    root.style.setProperty("--transition-slow", "150ms");
  } else {
    root.style.setProperty("--transition-fast", "150ms cubic-bezier(0.4,0,0.2,1)");
    root.style.setProperty("--transition-base", "200ms cubic-bezier(0.4,0,0.2,1)");
    root.style.setProperty("--transition-slow", "300ms cubic-bezier(0.4,0,0.2,1)");
  }
  // Accessibility flags
  const acc = s.accessibility || {};
  if (acc.reduceMotion) root.setAttribute("data-reduce-motion", "true"); else root.removeAttribute("data-reduce-motion");
  if (acc.highContrast) root.setAttribute("data-high-contrast", "true"); else root.removeAttribute("data-high-contrast");
  if (acc.largerText) root.setAttribute("data-larger-text", "true"); else root.removeAttribute("data-larger-text");
  if (acc.focusIndicators) root.setAttribute("data-focus-indicators", "true"); else root.removeAttribute("data-focus-indicators");

  // Behavior / system flags — để CSS + JS đọc
  const adv = s.advanced || {};
  if (adv.debugMode) root.setAttribute("data-debug", "true"); else root.removeAttribute("data-debug");
  const lib = s.library || {};
  root.setAttribute("data-lib-previews", lib.showPreviews !== false ? "true" : "false");
  // Display name → title亲切
  try {
    const name = (s.general?.displayName || "").trim();
    if (name) document.title = `${name} — Hành trang Tiểu học`;
  } catch {}
}

export function getSettings() { return loadSettings(); }

// Re-export guard: file redesigned 2026-09-19 — backup in _backup/settings-redesign-*

export const SETTINGS_SEARCH_INDEX = [
  { q: ["tổng quan", "general", "tên", "tuần", "trang mở", "múi giờ"], section: "general", anchor: "sec-general" },
  { q: ["editor", "soạn thảo", "word", "font", "thước", "ruler", "zoom", "nháp"], section: "editor", anchor: "sec-editor" },
  { q: ["whiteboard", "bảng trắng", "bảng", "grid", "lưới", "snap", "mindmap"], section: "whiteboard", anchor: "sec-whiteboard" },
  { q: ["sound", "âm thanh", "volume", "âm lượng", "profile", "loa"], section: "behavior", anchor: "sec-sound" },
  { q: ["theme", "giao diện", "sáng", "tối", "dark", "light", "appearance"], section: "appearance", anchor: "st-theme" },
  { q: ["màu", "accent", "màu sắc", "color"], section: "appearance", anchor: "st-accent" },
  { q: ["density", "mật độ", "compact", "comfortable", "spacious"], section: "appearance", anchor: "st-type" },
  { q: ["radius", "bo góc", "rounded"], section: "appearance", anchor: "st-type" },
  { q: ["shadow", "bóng", "đổ bóng"], section: "appearance", anchor: "st-type" },
  { q: ["font", "cỡ chữ", "font size", "typography"], section: "appearance", anchor: "st-type" },
  { q: ["animation", "chuyển động", "hiệu ứng"], section: "appearance", anchor: "st-type" },
  { q: ["sidebar", "thanh bên"], section: "appearance", anchor: "st-type" },
  { q: ["reading", "đọc", "pdf", "zoom", "trang", "layout"], section: "reading", anchor: "sec-reading" },
  { q: ["mission", "nhiệm vụ", "gamification", "xp", "streak", "achievement"], section: "missions", anchor: "sec-missions" },
  { q: ["ai", "gemini", "api", "model", "temperature"], section: "ai", anchor: "sec-ai" },
  { q: ["notification", "thông báo", "reminder"], section: "notifications", anchor: "sec-notif" },
  { q: ["keyboard", "phím tắt", "shortcut"], section: "keyboard", anchor: "sec-keys" },
  { q: ["accessibility", "tiếp cận", "tương phản", "high contrast"], section: "accessibility", anchor: "sec-a11y" },
  { q: ["data", "dữ liệu", "storage", "backup", "restore", "import", "export", "sao lưu"], section: "backup", anchor: "sec-backup" },
  { q: ["privacy", "riêng tư", "lịch sử", "dữ liệu cá nhân"], section: "privacy", anchor: "sec-privacy" },
  { q: ["gỡ lỗi", "debug", "log", "console", "developer"], section: "advanced", anchor: "sec-perf" },
  { q: ["diagnostics", "chẩn đoán", "version", "kiểm tra"], section: "advanced", anchor: "sec-diag" },
  { q: ["thư viện", "library", "lưới", "sắp xếp", "xem trước"], section: "library", anchor: "sec-library" },
  { q: ["tìm kiếm", "search", "fuzzy", "hoa thường"], section: "search", anchor: "sec-search" },
  { q: ["xuất", "export", "thời gian", "timestamp"], section: "export", anchor: "sec-export" },
  { q: ["hành vi", "behavior", "xác nhận", "xóa", "rung"], section: "behavior", anchor: "sec-behavior" },
];

export function searchSettings(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return SETTINGS_SEARCH_INDEX.filter((entry) => entry.q.some((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))).slice(0, 8);
}
